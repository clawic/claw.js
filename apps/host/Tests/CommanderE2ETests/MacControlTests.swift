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

    func runProcess(_ executable: String, arguments: [String]) throws -> String {
        processCalls.append(ProcessCall(executable: executable, arguments: arguments))
        return "ok"
    }

    func runAppleScript(_ source: String) throws -> String {
        appleScriptCalls.append(source)
        return "ok"
    }

    func runNative(_ action: String, arguments: [String]) throws -> String {
        nativeCalls.append(NativeCall(action: action, arguments: arguments))
        return "ok"
    }
}
