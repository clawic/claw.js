import Foundation
import XCTest

@testable import ClawHostKit
@testable import CommanderCore

@MainActor
final class MacControlTests: XCTestCase {
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

    func testMacPermissionBrokerCoversPrivacyDataDomains() {
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
        XCTAssertNotNil(audit.data?.objectValue?["auditPath"]?.stringValue)
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
