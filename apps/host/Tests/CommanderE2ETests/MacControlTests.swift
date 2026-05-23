import Foundation
import XCTest

@testable import ClawHostKit
@testable import CommanderCore

@MainActor
final class MacControlTests: XCTestCase {
    func testMacCareHostRouteAtlasCentralizesMacControlSystemTools() {
        XCTAssertEqual(MacCareHostRouteAtlas.networksetupCLI, "/usr/sbin/networksetup")
        XCTAssertEqual(MacCareHostRouteAtlas.shortcutsCLI, "/usr/bin/shortcuts")
    }

    func testWifiConnectPlanRejectsPlaintextPasswordAndRedactsSSID() throws {
        let request = MacControlActionRequest(
            requestId: "macreq_test_wifi_connect",
            capabilityId: "mac.wifi.connect",
            actorId: "agent_test",
            origin: .agent,
            arguments: ["ssid": "Office", "password": "secret"]
        )

        let plan = try MacControlActionBroker.plan(for: request)

        XCTAssertEqual(plan.planId, "macplan_macreq_test_wifi_connect")
        XCTAssertEqual(plan.risk, .high)
        XCTAssertTrue(plan.requiresApproval)
        XCTAssertTrue(plan.continuityBreaker)
        XCTAssertEqual(plan.revertLevel, .bestEffort)
        XCTAssertEqual(plan.blockedReason, "Plaintext Wi-Fi passwords are not accepted by the Mac Action Broker. Use a secret reference.")
        XCTAssertEqual(plan.steps.first?.preview, "Connect Wi-Fi to <ssid:6 chars>")
        XCTAssertEqual(plan.steps.first?.arguments, ["-setairportnetwork", "en0", "Office"])
    }

    func testMacPermissionBrokerCoversPrivacyDomains() {
        XCTAssertTrue(MacControlPermissionID.allCases.contains(.calendar))
        XCTAssertTrue(MacControlPermissionID.allCases.contains(.contacts))
        XCTAssertTrue(MacControlPermissionID.allCases.contains(.reminders))
    }

    func testPermissionLifecycleStorePersistsRequestsAndDetectsRevocation() throws {
        let stateURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("mac-permission-lifecycle-\(UUID().uuidString)")
            .appendingPathComponent(MacControlPermissionLifecycleStore.filename)
        let firstCheck = try MacControlPermissionLifecycleStore.observeStatus(
            permission: .microphone,
            status: .notDetermined,
            stateURL: stateURL,
            now: Date(timeIntervalSince1970: 1)
        )
        XCTAssertEqual(firstCheck.permissionId, .microphone)
        XCTAssertFalse(firstCheck.requestedBefore)
        XCTAssertTrue(firstCheck.canRequest)
        XCTAssertEqual(firstCheck.lastKnownStatus, .notDetermined)

        let request = try MacControlPermissionLifecycleStore.recordRequest(
            permission: .microphone,
            result: .granted,
            stateURL: stateURL,
            now: Date(timeIntervalSince1970: 2)
        )
        XCTAssertTrue(request.requestedBefore)
        XCTAssertEqual(request.lastRequestResult, .granted)
        XCTAssertEqual(request.lastRequestedAt, "1970-01-01T00:00:02.000Z")
        XCTAssertEqual(request.lastKnownStatus, .granted)

        let revoked = try MacControlPermissionLifecycleStore.observeStatus(
            permission: .microphone,
            status: .denied,
            stateURL: stateURL,
            now: Date(timeIntervalSince1970: 3)
        )
        XCTAssertTrue(revoked.requestedBefore)
        XCTAssertEqual(revoked.lastKnownStatus, .denied)
        XCTAssertEqual(revoked.revocationDetectedAt, "1970-01-01T00:00:03.000Z")
        XCTAssertEqual(
            try MacControlPermissionLifecycleStore.record(permission: .microphone, stateURL: stateURL),
            revoked
        )
    }

    func testPolicyGrantStoreMatchesEveryActorScope() throws {
        let policyURL = temporaryPolicyURL()
        let plan = try MacControlActionBroker.plan(for: MacControlActionRequest(
            requestId: "macreq_policy_plan",
            capabilityId: "mac.window.close",
            actorId: "agent.codex",
            origin: .agent
        ))

        let cases: [(MacControlPolicySubjectKind, String, MacControlActionRequest)] = [
            (.role, "operator", MacControlActionRequest(capabilityId: "mac.window.close", actorId: "agent.codex", origin: .agent, actorKind: "agent", actorRole: "operator")),
            (.user, "owner.local", MacControlActionRequest(capabilityId: "mac.window.close", actorId: "owner.local", origin: .ownerCLI, actorKind: "owner_cli")),
            (.agent, "agent.codex", MacControlActionRequest(capabilityId: "mac.window.close", actorId: "agent.codex", origin: .agent, actorKind: "agent")),
            (.assignment, "assignment.mac", MacControlActionRequest(capabilityId: "mac.window.close", actorId: "agent.codex", origin: .agent, actorKind: "agent", assignmentId: "assignment.mac")),
            (.run, "run.1", MacControlActionRequest(capabilityId: "mac.window.close", actorId: "agent.codex", origin: .agent, actorKind: "agent", runId: "run.1")),
            (.mcpClient, "mcp.client", MacControlActionRequest(capabilityId: "mac.window.close", actorId: "mcp.client", origin: .mcpClient, actorKind: "mcp_client")),
            (.automation, "automation.nightly", MacControlActionRequest(capabilityId: "mac.window.close", actorId: "automation.nightly", origin: .automation, actorKind: "automation")),
        ]

        for (kind, id, request) in cases {
            let grant = policyGrant(
                id: "grant_\(kind.rawValue)",
                subject: MacControlPolicySubject(kind: kind, id: id),
                effect: .allow,
                capabilityIds: ["mac.window.close"],
                riskCeiling: .high
            )
            try MacControlPolicyGrantStore.upsert(grant, stateURL: policyURL)
            let matches = try MacControlPolicyGrantStore.activeMatching(
                request: request,
                plan: plan,
                stateURL: policyURL
            )
            XCTAssertTrue(matches.contains(where: { $0.id == grant.id }), "missing match for \(kind.rawValue)")
        }
    }

    func testPolicyGrantsAllowAgentsAndBlockOverridesApproval() throws {
        let runner = RecordingMacControlRunner()
        let defaults = try makeDefaults()
        let policyURL = temporaryPolicyURL()
        let auditURL = temporaryAuditURL()
        let allowGrant = policyGrant(
            id: "grant_agent_window_close",
            subject: MacControlPolicySubject(kind: .agent, id: "agent_test"),
            effect: .allow,
            capabilityIds: ["mac.window.close"],
            riskCeiling: .high
        )
        try MacControlPolicyGrantStore.upsert(allowGrant, stateURL: policyURL)

        let allowed = MacControlActionBroker.evaluate(
            MacControlActionRequest(
                requestId: "macreq_policy_allow",
                capabilityId: "mac.window.close",
                actorId: "agent_test",
                origin: .agent,
                actorKind: "agent"
            ),
            defaults: defaults,
            auditURL: auditURL,
            policyURL: policyURL,
            runner: runner
        )
        XCTAssertEqual(allowed.outcome, .executed)
        XCTAssertEqual(runner.appleScriptCalls.count, 1)
        var events = try readAuditEvents(auditURL)
        XCTAssertEqual(events.last?.outcome, "granted")
        XCTAssertEqual(events.last?.grantId, "grant_agent_window_close")

        let blockGrant = policyGrant(
            id: "grant_role_operator_block",
            subject: MacControlPolicySubject(kind: .role, id: "operator"),
            effect: .block,
            capabilityIds: ["mac.window.close"],
            riskCeiling: .high
        )
        try MacControlPolicyGrantStore.upsert(blockGrant, stateURL: policyURL)
        let blocked = MacControlActionBroker.evaluate(
            MacControlActionRequest(
                requestId: "macreq_policy_block",
                capabilityId: "mac.window.close",
                actorId: "agent_test",
                origin: .agent,
                actorKind: "agent",
                actorRole: "operator",
                approved: true
            ),
            defaults: defaults,
            auditURL: auditURL,
            policyURL: policyURL,
            runner: runner
        )
        XCTAssertEqual(blocked.outcome, .blocked)
        XCTAssertEqual(blocked.error, "Mac Control policy grant grant_role_operator_block blocks this action.")
        events = try readAuditEvents(auditURL)
        XCTAssertEqual(events.last?.outcome, "blocked")
        XCTAssertEqual(events.last?.grantId, "grant_role_operator_block")
    }

    func testWifiDisconnectUsesNativeCoreWlanStepWithContinuityBreaker() throws {
        let request = MacControlActionRequest(
            requestId: "macreq_test_wifi_disconnect",
            capabilityId: "mac.wifi.disconnect",
            actorId: "owner",
            origin: .ownerCLI,
            arguments: ["device": "en1"],
            approved: true
        )

        let plan = try MacControlActionBroker.plan(for: request)

        XCTAssertEqual(plan.risk, .critical)
        XCTAssertTrue(plan.requiresApproval)
        XCTAssertTrue(plan.continuityBreaker)
        XCTAssertEqual(plan.revertLevel, .bestEffort)
        XCTAssertEqual(plan.steps.first?.kind, .native)
        XCTAssertEqual(plan.steps.first?.executable, "corewlan.disconnect")
        XCTAssertEqual(plan.steps.first?.arguments, ["en1"])

        let runner = RecordingMacControlRunner()
        let receipt = MacControlActionBroker.evaluate(request, defaults: try makeDefaults(), runner: runner)
        XCTAssertEqual(receipt.outcome, .executed)
        XCTAssertEqual(runner.nativeCalls, [
            RecordingMacControlRunner.NativeCall(action: "corewlan.disconnect", arguments: ["en1"]),
        ])
    }


    func testAgentWindowCloseRequiresApprovalAndAuditsDecision() throws {
        let runner = RecordingMacControlRunner()
        let defaults = try makeDefaults()
        let auditURL = temporaryAuditURL()
        let request = MacControlActionRequest(
            requestId: "macreq_test_window_close",
            capabilityId: "mac.window.close",
            actorId: "agent_test",
            origin: .agent
        )

        let receipt = MacControlActionBroker.evaluate(request, defaults: defaults, auditURL: auditURL, runner: runner)

        XCTAssertEqual(receipt.outcome, .approvalRequired)
        XCTAssertEqual(receipt.error, "Requires explicit Mac Control approval.")
        XCTAssertTrue(runner.processCalls.isEmpty)
        XCTAssertTrue(runner.appleScriptCalls.isEmpty)
        let events = try readAuditEvents(auditURL)
        XCTAssertEqual(events[0].action, "mac.window.close")
        XCTAssertEqual(events[0].origin, .agent)
        XCTAssertEqual(events[0].outcome, "requires_approval")
    }

    func testWindowFocusMoveAndResizeAreBrokeredAppleScriptPlans() throws {
        let focus = try MacControlActionBroker.plan(for: MacControlActionRequest(
            requestId: "macreq_test_window_focus",
            capabilityId: "mac.window.focus",
            actorId: "owner",
            origin: .ownerCLI,
            arguments: ["app": "TextEdit"]
        ))
        XCTAssertEqual(focus.risk, .low)
        XCTAssertTrue(focus.requiresApproval)
        XCTAssertEqual(focus.requiredPermissionIds, [.accessibility])
        XCTAssertEqual(focus.steps.first?.kind, .appleScript)
        XCTAssertTrue(focus.steps.first?.script?.contains("perform action \"AXRaise\"") == true)
        XCTAssertTrue(focus.steps.first?.preview.contains("<app:8 chars>") == true)

        let move = try MacControlActionBroker.plan(for: MacControlActionRequest(
            requestId: "macreq_test_window_move",
            capabilityId: "mac.window.move",
            actorId: "owner",
            origin: .ownerCLI,
            arguments: ["x": "120", "y": "80", "title": "Notes"]
        ))
        XCTAssertEqual(move.revertLevel, .bestEffort)
        XCTAssertTrue(move.steps.first?.script?.contains("set position of targetWindow to {120, 80}") == true)

        let resize = try MacControlActionBroker.plan(for: MacControlActionRequest(
            requestId: "macreq_test_window_resize",
            capabilityId: "mac.window.resize",
            actorId: "owner",
            origin: .ownerCLI,
            arguments: ["width": "900", "height": "700"]
        ))
        XCTAssertEqual(resize.revertLevel, .bestEffort)
        XCTAssertTrue(resize.steps.first?.script?.contains("set size of targetWindow to {900, 700}") == true)

        let blockedMove = try MacControlActionBroker.plan(for: MacControlActionRequest(
            requestId: "macreq_test_window_move_blocked",
            capabilityId: "mac.window.move",
            actorId: "owner",
            origin: .ownerCLI,
            arguments: ["x": "120"]
        ))
        XCTAssertEqual(blockedMove.blockedReason, "Window move requires integer x and y arguments.")
    }

    func testApprovedShortcutRunUsesShortcutsCLI() throws {
        let runner = RecordingMacControlRunner()
        let defaults = try makeDefaults()
        let auditURL = temporaryAuditURL()
        let request = MacControlActionRequest(
            requestId: "macreq_test_shortcut",
            capabilityId: "mac.shortcut.run",
            actorId: "owner",
            origin: .ownerCLI,
            arguments: ["name": "Daily Plan"],
            approved: true
        )

        let receipt = MacControlActionBroker.evaluate(request, defaults: defaults, auditURL: auditURL, runner: runner)

        XCTAssertEqual(receipt.outcome, .executed)
        XCTAssertEqual(runner.processCalls, [
            RecordingMacControlRunner.ProcessCall(executable: "/usr/bin/shortcuts", arguments: ["run", "Daily Plan"]),
        ])
        let events = try readAuditEvents(auditURL)
        XCTAssertEqual(events.first?.action, "mac.shortcut.run")
        XCTAssertEqual(events.first?.outcome, "approved")
    }

    func testAudioMuteStatusAndSetUseCoreAudioNativeBrokerSteps() throws {
        let statusPlan = try MacControlActionBroker.plan(for: MacControlActionRequest(
            requestId: "macreq_test_audio_mute_status",
            capabilityId: "mac.audio.mute.status",
            actorId: "owner",
            origin: .ownerCLI
        ))
        XCTAssertEqual(statusPlan.risk, .read)
        XCTAssertFalse(statusPlan.requiresApproval)
        XCTAssertEqual(statusPlan.steps.first?.kind, .native)
        XCTAssertEqual(statusPlan.steps.first?.executable, "coreaudio.output_mute_status")

        let runner = RecordingMacControlRunner()
        let setRequest = MacControlActionRequest(
            requestId: "macreq_test_audio_mute_set",
            capabilityId: "mac.audio.mute.set",
            actorId: "owner",
            origin: .ownerCLI,
            arguments: ["muted": "true"],
            approved: true
        )
        let setPlan = try MacControlActionBroker.plan(for: setRequest)
        XCTAssertEqual(setPlan.risk, .medium)
        XCTAssertTrue(setPlan.requiresApproval)
        XCTAssertEqual(setPlan.steps.first?.executable, "coreaudio.output_mute")
        XCTAssertEqual(setPlan.steps.first?.arguments, ["true"])

        let receipt = MacControlActionBroker.evaluate(setRequest, defaults: try makeDefaults(), runner: runner)
        XCTAssertEqual(receipt.outcome, .executed)
        XCTAssertEqual(runner.nativeCalls, [
            RecordingMacControlRunner.NativeCall(action: "coreaudio.output_mute", arguments: ["true"]),
        ])

        let blocked = try MacControlActionBroker.plan(for: MacControlActionRequest(
            requestId: "macreq_test_audio_mute_blocked",
            capabilityId: "mac.audio.mute.set",
            actorId: "owner",
            origin: .ownerCLI,
            arguments: ["muted": "maybe"]
        ))
        XCTAssertEqual(blocked.blockedReason, "Audio mute set requires a boolean muted argument.")
    }

    func testMediaPlaybackControlsRequireApprovedTargetsAndAuditExecution() throws {
        let missingApp = try MacControlActionBroker.plan(for: MacControlActionRequest(
            requestId: "macreq_test_media_missing",
            capabilityId: "mac.media.playback.pause",
            actorId: "owner",
            origin: .ownerCLI
        ))
        XCTAssertEqual(missingApp.blockedReason, "Media playback control requires an explicit approved app target: Music, Podcasts, or TV.")

        let unsupportedApp = try MacControlActionBroker.plan(for: MacControlActionRequest(
            requestId: "macreq_test_media_unsupported",
            capabilityId: "mac.media.playback.pause",
            actorId: "owner",
            origin: .ownerCLI,
            arguments: ["app": "UnreviewedPlayer"]
        ))
        XCTAssertEqual(unsupportedApp.blockedReason, "Media playback control requires an explicit approved app target: Music, Podcasts, or TV.")

        let statusPlan = try MacControlActionBroker.plan(for: MacControlActionRequest(
            requestId: "macreq_test_media_status",
            capabilityId: "mac.media.playback.status",
            actorId: "owner",
            origin: .ownerCLI,
            arguments: ["app": "Music"]
        ))
        XCTAssertEqual(statusPlan.risk, .read)
        XCTAssertEqual(statusPlan.requiredPermissionIds, [.automationAppleEvents])
        XCTAssertEqual(statusPlan.steps.first?.kind, .appleScript)
        XCTAssertEqual(statusPlan.steps.first?.redacted, true)
        XCTAssertTrue(statusPlan.steps.first?.script?.contains("player state") == true)

        let runner = RecordingMacControlRunner()
        let request = MacControlActionRequest(
            requestId: "macreq_test_media_pause",
            capabilityId: "mac.media.playback.pause",
            actorId: "owner",
            origin: .ownerCLI,
            arguments: ["app": "Music"],
            approved: true
        )
        let pausePlan = try MacControlActionBroker.plan(for: request)
        XCTAssertEqual(pausePlan.risk, .medium)
        XCTAssertTrue(pausePlan.requiresApproval)
        XCTAssertEqual(pausePlan.requiredPermissionIds, [.automationAppleEvents])
        XCTAssertEqual(pausePlan.steps.first?.preview, "Pause media playback in <app:5 chars>")
        XCTAssertEqual(pausePlan.steps.first?.redacted, true)

        let receipt = MacControlActionBroker.evaluate(request, defaults: try makeDefaults(), runner: runner)
        XCTAssertEqual(receipt.outcome, .executed)
        XCTAssertEqual(runner.appleScriptCalls.count, 1)
        XCTAssertTrue(runner.appleScriptCalls.first?.contains("pause") == true)
    }

    func testDryRunDoesNotExecuteNativeSteps() throws {
        let runner = RecordingMacControlRunner()
        let defaults = try makeDefaults()
        let request = MacControlActionRequest(
            requestId: "macreq_test_wifi_status",
            capabilityId: "mac.wifi.status",
            actorId: "agent_test",
            origin: .agent,
            dryRun: true
        )

        let receipt = MacControlActionBroker.evaluate(request, defaults: defaults, runner: runner)

        XCTAssertEqual(receipt.outcome, .planned)
        XCTAssertTrue(runner.processCalls.isEmpty)
        XCTAssertTrue(runner.appleScriptCalls.isEmpty)
    }

    func testWirePlanMatchesMacActionPlanContractShape() throws {
        let request = try wireRequestJSON(
            requestId: "macreq_wire_wifi_off",
            capabilityId: "mac.wifi.power.off",
            actorKind: "agent",
            arguments: ["device": "en0"],
            dryRun: true
        )

        let data = try MacControlWire.planJSON(for: request)
        let plan = try JSONDecoder().decode(MacControlWirePlan.self, from: data)

        XCTAssertEqual(plan.schemaVersion, 1)
        XCTAssertEqual(plan.planId, "macplan_macreq_wire_wifi_off")
        XCTAssertEqual(plan.requestId, "macreq_wire_wifi_off")
        XCTAssertEqual(plan.capabilityId, "mac.wifi.power.off")
        XCTAssertEqual(plan.risk, "critical")
        XCTAssertEqual(plan.coverageState, "executable")
        XCTAssertEqual(plan.actor.kind, "agent")
        XCTAssertEqual(plan.host.bundleId, "com.example.claw-host")
        XCTAssertEqual(plan.requiredApprovals.first?.approverRoles, ["owner", "admin"])
        XCTAssertEqual(plan.rollback.level, "best_effort")
        XCTAssertEqual(plan.rollback.timerSeconds, 120)
        XCTAssertTrue(plan.executable)
    }

    func testWireEvaluationMapsNativeReceiptToResultValues() throws {
        let runner = RecordingMacControlRunner()
        let defaults = try makeDefaults()
        let request = try wireRequestJSON(
            requestId: "macreq_wire_shortcut",
            capabilityId: "mac.shortcut.run",
            actorKind: "owner_cli",
            arguments: ["name": "Daily Plan", "secretRef": "sec_shortcut_input"],
            approved: true
        )

        let data = try MacControlWire.evaluateJSON(for: request, defaults: defaults, runner: runner)
        let evaluation = try JSONDecoder().decode(MacControlWireEvaluation.self, from: data)

        XCTAssertEqual(evaluation.schemaVersion, 1)
        XCTAssertEqual(evaluation.decision, "allow")
        XCTAssertEqual(evaluation.capabilityId, "mac.shortcut.run")
        XCTAssertEqual(evaluation.receipt?.result, "ok")
        XCTAssertEqual(evaluation.receipt?.secretRefs, ["sec_shortcut_input"])
        XCTAssertEqual(evaluation.auditEvent?.receiptId, evaluation.receipt?.id)
        XCTAssertEqual(runner.processCalls, [
            RecordingMacControlRunner.ProcessCall(executable: "/usr/bin/shortcuts", arguments: ["run", "Daily Plan"]),
        ])
    }

    func testHostBridgePlansMacActionFromRequestJson() throws {
        let request = try wireRequestJSON(
            requestId: "macreq_host_plan",
            capabilityId: "mac.shortcut.run",
            actorKind: "owner_cli",
            arguments: ["name": "Daily Plan"],
            dryRun: true
        )

        let response = try MacControlHostBridge.response(
            resource: "mac",
            action: "plan",
            arguments: ["request-json": String(decoding: request, as: UTF8.self)],
            environment: temporaryStateEnvironment()
        )

        XCTAssertTrue(response.ok)
        XCTAssertEqual(response.requestId, "macreq_host_plan")
        XCTAssertEqual(response.meta.adapter, "mac-control")
        XCTAssertEqual(response.meta.source, .localCLI)
        XCTAssertEqual(response.meta.capabilityId, "mac.shortcut.run")
        XCTAssertEqual(response.data?.objectValue?["capabilityId"]?.stringValue, "mac.shortcut.run")
        XCTAssertEqual(response.data?.objectValue?["risk"]?.stringValue, "high")
    }

    func testHostBridgeExecutesThroughInjectedRunnerAndWritesAudit() throws {
        let runner = RecordingMacControlRunner()
        let environment = temporaryStateEnvironment()
        let request = try wireRequestJSON(
            requestId: "macreq_host_execute",
            capabilityId: "mac.shortcut.run",
            actorKind: "owner_cli",
            arguments: ["name": "Daily Plan"],
            approved: true
        )

        let response = try MacControlHostBridge.response(
            resource: "mac",
            action: "execute",
            arguments: ["request-json": String(decoding: request, as: UTF8.self)],
            environment: environment,
            runner: runner
        )

        XCTAssertTrue(response.ok)
        XCTAssertEqual(response.requestId, "macreq_host_execute")
        XCTAssertEqual(response.data?.objectValue?["decision"]?.stringValue, "allow")
        XCTAssertEqual(response.data?.objectValue?["receipt"]?.objectValue?["result"]?.stringValue, "ok")
        XCTAssertEqual(runner.processCalls, [
            RecordingMacControlRunner.ProcessCall(executable: "/usr/bin/shortcuts", arguments: ["run", "Daily Plan"]),
        ])

        let auditURL = try StatePaths.ensureStateDirectory(environment: environment)
            .appendingPathComponent(MacControlPolicy.auditFilename)
        let events = try readAuditEvents(auditURL)
        XCTAssertEqual(events.first?.action, "mac.shortcut.run")
        XCTAssertEqual(events.first?.outcome, "approved")
    }

    func testHostBridgeExposesPermissionsAndDurableAudit() throws {
        let environment = temporaryStateEnvironment()
        let permissions = try MacControlHostBridge.response(
            resource: "mac",
            action: "permissions",
            arguments: [:],
            environment: environment
        )

        XCTAssertTrue(permissions.ok)
        XCTAssertEqual(permissions.meta.adapter, "mac-permission-broker")
        XCTAssertEqual(
            permissions.data?.objectValue?["permissions"]?.arrayValue?.count,
            MacControlPermissionID.allCases.count
        )
        let lifecyclePath = try XCTUnwrap(permissions.data?.objectValue?["lifecyclePath"]?.stringValue)
        XCTAssertTrue(FileManager.default.fileExists(atPath: lifecyclePath))
        let firstPermission = try XCTUnwrap(permissions.data?.objectValue?["permissions"]?.arrayValue?.first?.objectValue)
        XCTAssertNotNil(firstPermission["requestedBefore"]?.boolValue)
        XCTAssertNotNil(firstPermission["canRequest"]?.boolValue)
        XCTAssertNotNil(firstPermission["requiresRestart"]?.boolValue)
        XCTAssertEqual(firstPermission["source"]?.stringValue, "signed-host-mac-permission-broker")
        XCTAssertNotNil(firstPermission["lastCheckedAt"]?.stringValue)

        let audit = try MacControlHostBridge.response(
            resource: "mac",
            action: "audit",
            arguments: [:],
            environment: environment
        )
        XCTAssertTrue(audit.ok)
        XCTAssertEqual(audit.meta.adapter, "mac-control-audit")
        XCTAssertEqual(audit.data?.objectValue?["events"]?.arrayValue, [])
        XCTAssertEqual(audit.data?.objectValue?["storageRef"]?.stringValue, "claw.host.state/\(MacControlPolicy.auditFilename)")
        XCTAssertNil(audit.data?.objectValue?["auditPath"]?.stringValue)
    }

    func testHostBridgePlansAndRecordsConfirmedPermissionRequest() async throws {
        let environment = temporaryStateEnvironment()
        let plan = try await MacControlHostBridge.responseAsync(
            resource: "mac",
            action: "permissions",
            arguments: [
                "command": "request",
                "permission-id": MacControlPermissionID.microphone.rawValue,
            ],
            environment: environment,
            permissionRequester: { _ in
                XCTFail("Permission requester should not run without confirmation.")
                return false
            }
        )

        XCTAssertTrue(plan.ok)
        XCTAssertEqual(plan.meta.adapter, "mac-permission-broker")
        XCTAssertEqual(plan.data?.objectValue?["permissionId"]?.stringValue, MacControlPermissionID.microphone.rawValue)
        XCTAssertEqual(plan.data?.objectValue?["status"]?.stringValue, "confirmation_required")
        XCTAssertEqual(plan.data?.objectValue?["nativePrompt"]?.stringValue, "just_in_time_only")
        XCTAssertEqual(plan.data?.objectValue?["surprisePrompt"]?.boolValue, false)

        let requested = try await MacControlHostBridge.responseAsync(
            resource: "mac",
            action: "permissions",
            arguments: [
                "command": "request",
                "permission-id": MacControlPermissionID.microphone.rawValue,
                "confirm": "true",
            ],
            environment: environment,
            permissionRequester: { permission in
                XCTAssertEqual(permission, .microphone)
                return true
            }
        )

        XCTAssertTrue(requested.ok)
        XCTAssertEqual(requested.data?.objectValue?["status"]?.stringValue, "granted")
        XCTAssertEqual(requested.data?.objectValue?["requestedBefore"]?.boolValue, true)
        XCTAssertEqual(requested.data?.objectValue?["lastRequestResult"]?.stringValue, "granted")
        let lifecyclePath = try XCTUnwrap(requested.data?.objectValue?["lifecyclePath"]?.stringValue)
        let lifecycle = try XCTUnwrap(MacControlPermissionLifecycleStore.record(
            permission: .microphone,
            stateURL: URL(fileURLWithPath: lifecyclePath)
        ))
        XCTAssertTrue(lifecycle.requestedBefore)
        XCTAssertEqual(lifecycle.lastRequestResult, .granted)
        XCTAssertNotNil(lifecycle.lastRequestedAt)
    }

    func testHostBridgePersistsPolicyGrantEditsAndUsesThemForExecution() throws {
        let runner = RecordingMacControlRunner()
        let environment = temporaryStateEnvironment()
        let upsert = try MacControlHostBridge.response(
            resource: "mac",
            action: "policy",
            arguments: [
                "command": "upsert",
                "id": "grant_agent_shortcut",
                "subject-kind": "agent",
                "subject-id": "agent_test",
                "effect": "allow",
                "capability-ids": "mac.shortcut.run",
                "risk-ceiling": "high",
            ],
            environment: environment
        )
        XCTAssertTrue(upsert.ok)
        let policyPath = try XCTUnwrap(upsert.data?.objectValue?["policyPath"]?.stringValue)
        XCTAssertTrue(FileManager.default.fileExists(atPath: policyPath))

        let list = try MacControlHostBridge.response(
            resource: "mac",
            action: "policy",
            arguments: ["command": "list"],
            environment: environment
        )
        XCTAssertEqual(list.data?.objectValue?["grants"]?.arrayValue?.count, 1)

        let execute = try MacControlHostBridge.response(
            resource: "mac",
            action: "execute",
            arguments: [
                "capability-id": "mac.shortcut.run",
                "actor-kind": "agent",
                "actor-id": "agent_test",
                "name": "Daily Plan",
            ],
            environment: environment,
            runner: runner
        )
        XCTAssertTrue(execute.ok)
        XCTAssertEqual(execute.data?.objectValue?["decision"]?.stringValue, "allow")
        XCTAssertEqual(runner.processCalls, [
            RecordingMacControlRunner.ProcessCall(executable: "/usr/bin/shortcuts", arguments: ["run", "Daily Plan"]),
        ])

        let revoke = try MacControlHostBridge.response(
            resource: "mac",
            action: "policy",
            arguments: ["command": "revoke", "id": "grant_agent_shortcut"],
            environment: environment
        )
        XCTAssertTrue(revoke.ok)

        let runnerAfterRevoke = RecordingMacControlRunner()
        let blocked = try MacControlHostBridge.response(
            resource: "mac",
            action: "execute",
            arguments: [
                "capability-id": "mac.shortcut.run",
                "actor-kind": "agent",
                "actor-id": "agent_test",
                "name": "Daily Plan",
            ],
            environment: environment,
            runner: runnerAfterRevoke
        )
        XCTAssertEqual(blocked.data?.objectValue?["decision"]?.stringValue, "approval_required")
        XCTAssertTrue(runnerAfterRevoke.processCalls.isEmpty)
    }

    func testHostBridgeCapturesContinuitySnapshotAndExecutesConfirmedWifiRevert() throws {
        let runner = RecordingMacControlRunner(processResponses: [
            "/usr/sbin/networksetup\u{0}-getairportpower\u{0}en0": "Wi-Fi Power (en0): On",
            "/usr/sbin/networksetup\u{0}-getairportnetwork\u{0}en0": "Current Wi-Fi Network: Office",
        ])
        let environment = temporaryStateEnvironment()
        let execute = try MacControlHostBridge.response(
            resource: "mac",
            action: "execute",
            arguments: [
                "capability-id": "mac.wifi.power.off",
                "actor-kind": "owner_cli",
                "actor-id": "owner.local",
                "approved": "true",
            ],
            environment: environment,
            runner: runner
        )
        XCTAssertTrue(execute.ok)
        XCTAssertEqual(execute.data?.objectValue?["decision"]?.stringValue, "allow")
        let receiptId = try XCTUnwrap(execute.data?.objectValue?["receipt"]?.objectValue?["id"]?.stringValue)
        XCTAssertNotNil(execute.data?.objectValue?["receipt"]?.objectValue?["beforeRef"]?.stringValue)

        let continuityURL = try StatePaths.ensureStateDirectory(environment: environment)
            .appendingPathComponent(MacControlContinuityStore.filename)
        XCTAssertEqual(MacControlContinuityStore.filename, "mac-control-continuity.json")
        let record = try XCTUnwrap(MacControlContinuityStore.record(receiptId: receiptId, stateURL: continuityURL))
        XCTAssertEqual(record.snapshot.beforeNetworkName, "Office")
        XCTAssertEqual(record.status, .pending)
        XCTAssertEqual(record.revertSteps.map(\.arguments), [
            ["-setairportpower", "en0", "on"],
            ["-setairportnetwork", "en0", "Office"],
        ])

        let plan = try MacControlHostBridge.response(
            resource: "mac",
            action: "revert",
            arguments: ["receipt-id": receiptId],
            environment: environment,
            runner: runner
        )
        XCTAssertTrue(plan.ok)
        XCTAssertEqual(plan.data?.objectValue?["status"]?.stringValue, "confirmation_required")
        XCTAssertEqual(plan.data?.objectValue?["revertSteps"]?.arrayValue?.count, 2)

        let reverted = try MacControlHostBridge.response(
            resource: "mac",
            action: "revert",
            arguments: ["receipt-id": receiptId, "confirm": "true"],
            environment: environment,
            runner: runner
        )
        XCTAssertTrue(reverted.ok)
        XCTAssertEqual(reverted.data?.objectValue?["status"]?.stringValue, "reverted")
        let updated = try XCTUnwrap(MacControlContinuityStore.record(receiptId: receiptId, stateURL: continuityURL))
        XCTAssertEqual(updated.status, .reverted)
        XCTAssertTrue(runner.processCalls.contains(RecordingMacControlRunner.ProcessCall(executable: "/usr/sbin/networksetup", arguments: ["-setairportpower", "en0", "off"])))
        XCTAssertTrue(runner.processCalls.contains(RecordingMacControlRunner.ProcessCall(executable: "/usr/sbin/networksetup", arguments: ["-setairportpower", "en0", "on"])))
        XCTAssertTrue(runner.processCalls.contains(RecordingMacControlRunner.ProcessCall(executable: "/usr/sbin/networksetup", arguments: ["-setairportnetwork", "en0", "Office"])))
    }

    private func makeDefaults() throws -> UserDefaults {
        let suite = "MacControlTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }

    private func temporaryAuditURL() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("mac-control-tests-\(UUID().uuidString)")
            .appendingPathComponent(MacControlPolicy.auditFilename)
    }

    private func temporaryPolicyURL() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("mac-control-policy-tests-\(UUID().uuidString)")
            .appendingPathComponent(MacControlPolicyGrantStore.filename)
    }

    private func policyGrant(
        id: String,
        subject: MacControlPolicySubject,
        effect: MacControlPolicyGrantEffect,
        capabilityIds: [String],
        permissionIds: [MacControlPermissionID] = [],
        riskCeiling: MacControlActionPlan.Risk
    ) -> MacControlPolicyGrant {
        MacControlPolicyGrant(
            id: id,
            subject: subject,
            effect: effect,
            capabilityIds: capabilityIds,
            permissionIds: permissionIds,
            riskCeiling: riskCeiling,
            duration: MacControlPolicyGrantDuration(kind: .task, ttlSeconds: 1800),
            createdBy: MacControlWireActor(kind: "owner_cli", id: "owner.local", role: "owner"),
            createdAt: "2026-05-18T00:00:00.000Z",
            expiresAt: nil,
            status: .active
        )
    }

    private func readAuditEvents(_ url: URL) throws -> [MacControlPolicy.AuditEvent] {
        let data = try Data(contentsOf: url)
        let decoder = JSONDecoder()
        let lines = String(decoding: data, as: UTF8.self).split(separator: "\n")
        return try lines.map { try decoder.decode(MacControlPolicy.AuditEvent.self, from: Data($0.utf8)) }
    }

    private func temporaryStateEnvironment() -> [String: String] {
        var environment = ProcessInfo.processInfo.environment
        environment["CLAW_HOST_HOME"] = FileManager.default.temporaryDirectory
            .appendingPathComponent("mac-control-host-bridge-tests-\(UUID().uuidString)")
            .path
        return environment
    }

    private func wireRequestJSON(
        requestId: String,
        capabilityId: String,
        actorKind: String,
        arguments: [String: String],
        dryRun: Bool = false,
        approved: Bool = false
    ) throws -> Data {
        let request = MacControlWireRequest(
            requestId: requestId,
            capabilityId: capabilityId,
            actor: MacControlWireActor(kind: actorKind, id: "actor_test", role: "owner", assignmentId: nil, runId: nil),
            host: MacControlWireHost(
                hostId: "host_test",
                bundleId: "com.example.claw-host",
                signingIdentity: "PLACEHOLDER_SIGNING_IDENTITY",
                teamId: "TEAMID",
                appVariant: "debug",
                appVersion: "1.0"
            ),
            arguments: arguments.mapValues { .string($0) },
            dryRun: dryRun,
            approved: approved
        )
        return try JSONEncoder().encode(request)
    }

    // MARK: - Computer Use (mac.app.* accessibility capabilities)

    func testComputerUseListPlanIsReadOnly() throws {
        let request = MacControlActionRequest(
            requestId: "macreq_cu_list",
            capabilityId: "mac.app.list",
            actorId: "agent_test",
            origin: .agent
        )
        let plan = try MacControlActionBroker.plan(for: request)
        XCTAssertEqual(plan.risk, .read)
        XCTAssertFalse(plan.requiresApproval)
        XCTAssertEqual(plan.requiredPermissionIds, [])
        XCTAssertEqual(plan.steps.first?.kind, .native)
        XCTAssertEqual(plan.steps.first?.executable, "ax.list_apps")
        XCTAssertNil(plan.blockedReason)
    }

    func testComputerUseStatePlanRequiresAppAndAccessibility() throws {
        let missing = try MacControlActionBroker.plan(for: MacControlActionRequest(
            requestId: "macreq_cu_state_missing",
            capabilityId: "mac.app.state",
            actorId: "agent_test",
            origin: .agent
        ))
        XCTAssertEqual(missing.blockedReason, "Computer Use get_app_state requires an app name.")

        let plan = try MacControlActionBroker.plan(for: MacControlActionRequest(
            requestId: "macreq_cu_state",
            capabilityId: "mac.app.state",
            actorId: "agent_test",
            origin: .agent,
            arguments: ["app": "TextEdit", "max_depth": "8", "max_elements": "120"]
        ))
        XCTAssertEqual(plan.risk, .read)
        XCTAssertFalse(plan.requiresApproval)
        XCTAssertEqual(plan.requiredPermissionIds, [.accessibility])
        XCTAssertEqual(plan.steps.first?.executable, "ax.app_state")
        XCTAssertEqual(plan.steps.first?.arguments, ["TextEdit", "8", "120"])
        XCTAssertEqual(plan.steps.first?.preview, "Read the accessibility state of app <app:8 chars>")
    }

    func testComputerUseClickPlanValidatesArgsAndRequiresApproval() throws {
        let missingApp = try MacControlActionBroker.plan(for: MacControlActionRequest(
            requestId: "macreq_cu_click_noapp",
            capabilityId: "mac.app.click",
            actorId: "agent_test",
            origin: .agent,
            arguments: ["element_index": "2"]
        ))
        XCTAssertEqual(missingApp.blockedReason, "Computer Use click requires an app name.")

        let missingIndex = try MacControlActionBroker.plan(for: MacControlActionRequest(
            requestId: "macreq_cu_click_noindex",
            capabilityId: "mac.app.click",
            actorId: "agent_test",
            origin: .agent,
            arguments: ["app": "TextEdit"]
        ))
        XCTAssertEqual(missingIndex.blockedReason, "Computer Use click requires a non-negative element_index.")

        let plan = try MacControlActionBroker.plan(for: MacControlActionRequest(
            requestId: "macreq_cu_click",
            capabilityId: "mac.app.click",
            actorId: "agent_test",
            origin: .agent,
            arguments: ["app": "TextEdit", "element_index": "5"]
        ))
        XCTAssertEqual(plan.risk, .low)
        XCTAssertTrue(plan.requiresApproval)
        XCTAssertEqual(plan.requiredPermissionIds, [.accessibility])
        XCTAssertEqual(plan.steps.first?.executable, "ax.click")
        XCTAssertEqual(plan.steps.first?.arguments, ["TextEdit", "5"])
    }

    func testComputerUseTypePlanRedactsTextAndRequiresApproval() throws {
        let plan = try MacControlActionBroker.plan(for: MacControlActionRequest(
            requestId: "macreq_cu_type",
            capabilityId: "mac.app.type",
            actorId: "agent_test",
            origin: .agent,
            arguments: ["app": "TextEdit", "text": "hello world"]
        ))
        XCTAssertEqual(plan.risk, .medium)
        XCTAssertTrue(plan.requiresApproval)
        XCTAssertEqual(plan.steps.first?.executable, "ax.type")
        XCTAssertEqual(plan.steps.first?.arguments, ["TextEdit", "hello world"])
        XCTAssertEqual(plan.steps.first?.preview, "Type text in app <app:8 chars>")
        XCTAssertTrue(plan.steps.first?.redacted ?? false)
    }

    func testComputerUseKeyScrollSetValueActionPlans() throws {
        let key = try MacControlActionBroker.plan(for: MacControlActionRequest(
            requestId: "macreq_cu_key", capabilityId: "mac.app.key", actorId: "agent_test", origin: .agent,
            arguments: ["app": "TextEdit", "key": "cmd+n"]
        ))
        XCTAssertEqual(key.steps.first?.executable, "ax.key")
        XCTAssertEqual(key.steps.first?.arguments, ["TextEdit", "cmd+n"])
        XCTAssertEqual(key.risk, .medium)

        let scrollBlocked = try MacControlActionBroker.plan(for: MacControlActionRequest(
            requestId: "macreq_cu_scroll_zero", capabilityId: "mac.app.scroll", actorId: "agent_test", origin: .agent,
            arguments: ["app": "TextEdit", "delta_x": "0", "delta_y": "0"]
        ))
        XCTAssertEqual(scrollBlocked.blockedReason, "Computer Use scroll requires a non-zero delta_x or delta_y.")

        let scroll = try MacControlActionBroker.plan(for: MacControlActionRequest(
            requestId: "macreq_cu_scroll", capabilityId: "mac.app.scroll", actorId: "agent_test", origin: .agent,
            arguments: ["app": "TextEdit", "delta_y": "-120"]
        ))
        XCTAssertEqual(scroll.steps.first?.arguments, ["TextEdit", "0", "-120"])
        XCTAssertEqual(scroll.risk, .low)

        let setValue = try MacControlActionBroker.plan(for: MacControlActionRequest(
            requestId: "macreq_cu_setvalue", capabilityId: "mac.app.set_value", actorId: "agent_test", origin: .agent,
            arguments: ["app": "TextEdit", "element_index": "3", "value": "name"]
        ))
        XCTAssertEqual(setValue.steps.first?.executable, "ax.set_value")
        XCTAssertEqual(setValue.steps.first?.arguments, ["TextEdit", "3", "name"])

        let action = try MacControlActionBroker.plan(for: MacControlActionRequest(
            requestId: "macreq_cu_action", capabilityId: "mac.app.action", actorId: "agent_test", origin: .agent,
            arguments: ["app": "TextEdit", "element_index": "1", "ax_action": "AXShowMenu"]
        ))
        XCTAssertEqual(action.steps.first?.executable, "ax.action")
        XCTAssertEqual(action.steps.first?.arguments, ["TextEdit", "1", "AXShowMenu"])
    }

    func testComputerUseClickRequiresApprovalForAgentOrigin() throws {
        let auditURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("cu-audit-\(UUID().uuidString).jsonl")
        let receipt = MacControlActionBroker.evaluate(
            MacControlActionRequest(
                requestId: "macreq_cu_click_unapproved",
                capabilityId: "mac.app.click",
                actorId: "agent_test",
                origin: .agent,
                arguments: ["app": "TextEdit", "element_index": "2"]
            ),
            auditURL: auditURL,
            runner: RecordingMacControlRunner()
        )
        XCTAssertEqual(receipt.outcome, .approvalRequired)
    }

    func testComputerUseClickExecutesThroughBrokerWhenApproved() throws {
        let runner = RecordingMacControlRunner()
        let auditURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("cu-audit-\(UUID().uuidString).jsonl")
        let receipt = MacControlActionBroker.evaluate(
            MacControlActionRequest(
                requestId: "macreq_cu_click_ok",
                capabilityId: "mac.app.click",
                actorId: "agent_test",
                origin: .agent,
                arguments: ["app": "TextEdit", "element_index": "5"],
                approved: true
            ),
            auditURL: auditURL,
            runner: runner
        )
        XCTAssertEqual(receipt.outcome, .executed)
        XCTAssertEqual(runner.nativeCalls.map(\.action), ["ax.click"])
        XCTAssertEqual(runner.nativeCalls.first?.arguments, ["TextEdit", "5"])
        XCTAssertEqual(receipt.outputs, ["ok"])
    }

    func testComputerUseChordParserMapsModifiersAndKeys() throws {
        let cmdN = try MacAXEngine.parseChord("cmd+n")
        XCTAssertEqual(cmdN.keyCode, 45)
        XCTAssertTrue(cmdN.flags.contains(.maskCommand))

        let superSpace = try MacAXEngine.parseChord("super+space")
        XCTAssertEqual(superSpace.keyCode, 49)
        XCTAssertTrue(superSpace.flags.contains(.maskCommand))

        let shiftTab = try MacAXEngine.parseChord("shift+tab")
        XCTAssertEqual(shiftTab.keyCode, 48)
        XCTAssertTrue(shiftTab.flags.contains(.maskShift))
        XCTAssertFalse(shiftTab.flags.contains(.maskCommand))

        let combo = try MacAXEngine.parseChord("ctrl+opt+a")
        XCTAssertEqual(combo.keyCode, 0)
        XCTAssertTrue(combo.flags.contains(.maskControl))
        XCTAssertTrue(combo.flags.contains(.maskAlternate))

        XCTAssertThrowsError(try MacAXEngine.parseChord(""))
        XCTAssertThrowsError(try MacAXEngine.parseChord("cmd+unknownkey"))
        XCTAssertThrowsError(try MacAXEngine.parseChord("a+b"))
    }

    func testJSONValueCoercedStringValuePreservesScalars() {
        XCTAssertEqual(JSONValue.integer(5).coercedStringValue, "5")
        XCTAssertEqual(JSONValue.number(3.0).coercedStringValue, "3")
        XCTAssertEqual(JSONValue.number(2.5).coercedStringValue, "2.5")
        XCTAssertEqual(JSONValue.bool(true).coercedStringValue, "true")
        XCTAssertEqual(JSONValue.string("x").coercedStringValue, "x")
        XCTAssertNil(JSONValue.null.coercedStringValue)
    }
}

final class RecordingMacControlRunner: MacControlCommandRunning {
    struct ProcessCall: Equatable {
        var executable: String
        var arguments: [String]
    }

    struct NativeCall: Equatable {
        var action: String
        var arguments: [String]
    }

    private(set) var processCalls: [ProcessCall] = []
    private(set) var appleScriptCalls: [String] = []
    private(set) var nativeCalls: [NativeCall] = []
    private let processResponses: [String: String]

    init(processResponses: [String: String] = [:]) {
        self.processResponses = processResponses
    }

    func runProcess(_ executable: String, arguments: [String]) throws -> String {
        processCalls.append(ProcessCall(executable: executable, arguments: arguments))
        return processResponses[processKey(executable: executable, arguments: arguments)] ?? "ok"
    }

    func runAppleScript(_ source: String) throws -> String {
        appleScriptCalls.append(source)
        return "ok"
    }

    func runNative(_ action: String, arguments: [String]) throws -> String {
        nativeCalls.append(NativeCall(action: action, arguments: arguments))
        return "ok"
    }

    private func processKey(executable: String, arguments: [String]) -> String {
        ([executable] + arguments).joined(separator: "\u{0}")
    }
}
