import Foundation
import Contacts
import EventKit
import XCTest

@testable import CommanderAdapters
@testable import CommanderCore
@testable import ClawHostKit

final class CommanderE2ETests: XCTestCase {
    private final class RecordingMacControlRunner: MacControlCommandRunning {
        var nativeCalls: [(action: String, arguments: [String])] = []

        func runProcess(_ executable: String, arguments: [String]) throws -> String {
            "process \(executable)"
        }

        func runAppleScript(_ source: String) throws -> String {
            "applescript"
        }

        func runNative(_ action: String, arguments: [String]) throws -> String {
            nativeCalls.append((action, arguments))
            return "native \(action)"
        }
    }

    func testHostContractV1FixturesDecodeInSwift() throws {
        let decoder = JSONDecoder()
        let request = try decoder.decode(CommandRequest.self, from: Data("""
        {
          "schemaVersion": 1,
          "requestId": "req-calendar-list",
          "domain": "calendar",
          "resource": "events",
          "action": "list",
          "arguments": { "limit": "10" },
          "clientContext": { "bundleId": "com.example.clawix", "executablePath": "/Applications/Clawix.app/Contents/MacOS/Clawix", "tty": false },
          "validationMode": "host_real"
        }
        """.utf8))
        XCTAssertEqual(request.schemaVersion, 1)
        XCTAssertEqual(request.requestId, "req-calendar-list")
        XCTAssertEqual(request.domain, .calendar)
        XCTAssertEqual(request.validationMode, .hostReal)

        let response = try decoder.decode(CommandResponse.self, from: Data("""
        {
          "schemaVersion": 1,
          "requestId": "req-calendar-list",
          "ok": true,
          "data": { "events": [] },
          "meta": {
            "hostId": "clawix",
            "capabilityId": "calendar.events.list",
            "riskLevel": "read",
            "validationMode": "host_real",
            "durationMs": 4
          }
        }
        """.utf8))
        XCTAssertTrue(response.ok)
        XCTAssertEqual(response.requestId, "req-calendar-list")
        XCTAssertEqual(response.meta.hostId, "clawix")

        let host = try decoder.decode(HostDescriptor.self, from: Data("""
        {
          "schemaVersion": 1,
          "id": "clawix",
          "displayName": "Clawix",
          "kind": "embedded",
          "bundleId": "com.example.clawix",
          "appSupportDir": "/Users/demo/Library/Application Support/Clawix",
          "endpoint": { "transport": "unix_socket", "address": "/Users/demo/Library/Application Support/Clawix/daemon.sock" },
          "capabilities": [
            {
              "id": "models.remote.generate",
              "domain": "models",
              "actions": ["generate"],
              "riskLevel": "cost",
              "brokerRequired": true,
              "costSensitive": true,
              "requiresOSPermission": false,
              "osPermissionState": "not_applicable"
            }
          ],
          "registeredAt": "2026-05-13T10:00:00.000Z",
          "updatedAt": "2026-05-13T10:00:00.000Z"
        }
        """.utf8))
        XCTAssertEqual(host.id, "clawix")
        XCTAssertEqual(host.kind, .embedded)
        XCTAssertEqual(host.capabilities.first?.domain, .models)
        XCTAssertEqual(host.capabilities.first?.brokerRequired, true)
    }

    @MainActor
    func testSystemTelemetryControlExecuteUsesMacBrokerAuditAndReceipt() throws {
        let stateDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("system-telemetry-control-\(UUID().uuidString)", isDirectory: true)
        let runner = RecordingMacControlRunner()
        let response = try SystemTelemetryControlHostBridge.response(
            action: "execute",
            arguments: [
                "control-id": "system.audio.set_output_volume",
                "target": "default",
                "value": "35",
                "reason": "test",
                "actor-kind": "owner_cli",
                "actor-id": "test-owner",
                "actor-role": "owner",
            ],
            environment: [
                "CLAW_HOST_HOME": stateDirectory.path,
                "CLAW_HOST_ID": "test-host",
                "CLAW_HOST_BUNDLE_ID": "com.example.test-host",
            ],
            runner: runner
        )

        XCTAssertTrue(response.ok)
        XCTAssertEqual(response.meta.adapter, "system-telemetry-control")
        XCTAssertEqual(response.meta.capabilityId, "system.audio.set_output_volume")
        XCTAssertEqual(response.data?.objectValue?["status"]?.stringValue, "executed")
        XCTAssertEqual(response.data?.objectValue?["will_execute"]?.boolValue, true)
        XCTAssertEqual(response.data?.objectValue?["broker"]?.objectValue?["capability_id"]?.stringValue, "mac.audio.volume")
        XCTAssertEqual(response.data?.objectValue?["receipt"]?.objectValue?["status"]?.stringValue, "issued")
        XCTAssertEqual(response.data?.objectValue?["receipt"]?.objectValue?["result"]?.stringValue, "ok")
        XCTAssertEqual(runner.nativeCalls.count, 1)
        XCTAssertEqual(runner.nativeCalls.first?.action, "coreaudio.output_volume")
        XCTAssertEqual(runner.nativeCalls.first?.arguments, ["35"])

        let auditURL = stateDirectory.appendingPathComponent(MacControlPolicy.auditFilename)
        let audit = try String(contentsOf: auditURL)
        XCTAssertTrue(audit.contains("mac.audio.volume"))
        XCTAssertTrue(audit.contains("test-owner"))
    }

    @MainActor
    func testSystemTelemetryDangerousControlsFailClosedWithPolicyAndAuditPlan() throws {
        let stateDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("system-telemetry-dangerous-control-\(UUID().uuidString)", isDirectory: true)
        let runner = RecordingMacControlRunner()
        let response = try SystemTelemetryControlHostBridge.response(
            action: "execute",
            arguments: [
                "control-id": "system.fan.set_speed",
                "target": "fan0",
                "value": "45",
                "reason": "validation",
                "confirm": "true",
            ],
            environment: [
                "CLAW_HOST_HOME": stateDirectory.path,
                "CLAW_HOST_ID": "test-host",
                "CLAW_HOST_BUNDLE_ID": "com.example.test-host",
            ],
            runner: runner
        )

        XCTAssertFalse(response.ok)
        XCTAssertEqual(response.meta.adapter, "system-telemetry-control")
        XCTAssertEqual(response.meta.capabilityId, "system.fan.set_speed")
        XCTAssertEqual(response.data?.objectValue?["status"]?.stringValue, "blocked")
        XCTAssertEqual(response.data?.objectValue?["will_execute"]?.boolValue, false)
        XCTAssertEqual(response.data?.objectValue?["external_pending"]?.boolValue, true)
        XCTAssertEqual(response.data?.objectValue?["action"]?.objectValue?["id"]?.stringValue, "system.fan.set_speed")
        XCTAssertEqual(response.data?.objectValue?["action"]?.objectValue?["requires_confirmation"]?.boolValue, true)
        XCTAssertTrue(response.data?.objectValue?["policy"]?.objectValue?["required_grants"]?.arrayValue?.contains(.string("system.hardware.control")) == true)
        XCTAssertTrue(response.data?.objectValue?["policy"]?.objectValue?["required_grants"]?.arrayValue?.contains(.string("system.sensor.read")) == true)
        XCTAssertEqual(response.data?.objectValue?["broker"]?.objectValue?["status"]?.stringValue, "external_pending")
        XCTAssertEqual(response.data?.objectValue?["broker"]?.objectValue?["fail_closed"]?.boolValue, true)
        XCTAssertTrue(response.data?.objectValue?["steps"]?.arrayValue?.contains(where: {
            $0.objectValue?["id"]?.stringValue == "confirm_if_required"
                && $0.objectValue?["status"]?.stringValue == "pending"
        }) == true)
        XCTAssertTrue(response.data?.objectValue?["steps"]?.arrayValue?.contains(where: {
            $0.objectValue?["id"]?.stringValue == "execute_native_action"
                && $0.objectValue?["status"]?.stringValue == "blocked"
        }) == true)
        XCTAssertEqual(response.data?.objectValue?["receipt"]?.objectValue?["status"]?.stringValue, "not_issued")
        XCTAssertEqual(response.data?.objectValue?["receipt"]?.objectValue?["audit_event"]?.stringValue, "system.telemetry.control.fan.set_speed")
        XCTAssertEqual(response.data?.objectValue?["receipt"]?.objectValue?["audit_status"]?.stringValue, "recorded")
        XCTAssertEqual(response.data?.objectValue?["audit"]?.objectValue?["status"]?.stringValue, "recorded")
        XCTAssertEqual(response.data?.objectValue?["audit"]?.objectValue?["outcome"]?.stringValue, "blocked")
        XCTAssertEqual(response.data?.objectValue?["audit"]?.objectValue?["storage_ref"]?.stringValue, "claw.host.state/\(MacControlPolicy.auditFilename)")
        XCTAssertNil(response.data?.objectValue?["audit"]?.objectValue?["audit_path"]?.stringValue)
        XCTAssertTrue(runner.nativeCalls.isEmpty)

        let auditURL = stateDirectory.appendingPathComponent(MacControlPolicy.auditFilename)
        let audit = try String(contentsOf: auditURL)
        XCTAssertTrue(audit.contains("system.telemetry.control.fan.set_speed"))
        XCTAssertTrue(audit.contains("\"outcome\":\"blocked\""))
        XCTAssertTrue(audit.contains("\"value_redacted\":true"))
        XCTAssertTrue(audit.contains("system.hardware.control"))
        XCTAssertTrue(audit.contains("system.sensor.read"))
    }

    func testCapabilityRevokeAndMetadata() throws {
        let context = try TestContext()
        defer { context.cleanup() }

        try context.grant("files.read")
        let listBefore = try context.runCLI(["system", "capabilities", "list", "--json"])
        let filesReadBefore = try XCTUnwrap(listBefore.data?.arrayValue?.first(where: { $0.objectValue?["id"]?.stringValue == "files.read" })?.objectValue)
        XCTAssertEqual(filesReadBefore["risk_level"]?.stringValue, "read")
        XCTAssertEqual(filesReadBefore["requires_os_permission"]?.boolValue, false)
        XCTAssertEqual(filesReadBefore["granted"]?.boolValue, true)

        let revoked = try context.runCLI(["system", "capabilities", "revoke", "--scope", "files.read", "--json"])
        XCTAssertTrue(revoked.ok)

        let listAfter = try context.runCLI(["system", "capabilities", "list", "--json"])
        let filesReadAfter = try XCTUnwrap(listAfter.data?.arrayValue?.first(where: { $0.objectValue?["id"]?.stringValue == "files.read" })?.objectValue)
        XCTAssertEqual(filesReadAfter["granted"]?.boolValue, false)
    }

    func testSystemDoctorAndIntrospection() throws {
        let context = try TestContext()
        defer { context.cleanup() }

        let doctor = try context.runCLI(["system", "doctor", "run", "--json"])
        XCTAssertTrue(doctor.ok)
        XCTAssertEqual(doctor.data?.objectValue?["runtime_transport"]?.stringValue, "unix_socket")
        XCTAssertTrue(doctor.data?.objectValue?["implemented_domains"]?.arrayValue?.contains(where: {
            $0.stringValue == "reminders"
        }) == true)
        XCTAssertTrue(doctor.data?.objectValue?["implemented_domains"]?.arrayValue?.contains(where: {
            $0.stringValue == "finder"
        }) == true)
        XCTAssertEqual(doctor.data?.objectValue?["host_validation_targets"]?.objectValue?["calendar"]?.objectValue?["selector"]?.stringValue, "--calendar")
        XCTAssertNotNil(doctor.data?.objectValue?["installed_apps"]?.objectValue?["safari"]?.boolValue)
        XCTAssertNotNil(doctor.data?.objectValue?["installed_apps"]?.objectValue?["finder"]?.boolValue)
        XCTAssertNotNil(doctor.data?.objectValue?["adapter_health"]?.objectValue?["mail"]?.objectValue?["availability"]?.stringValue)
        XCTAssertNotNil(doctor.data?.objectValue?["adapter_health"]?.objectValue?["reminders"]?.objectValue?["reason"]?.stringValue)
        XCTAssertNotNil(doctor.data?.objectValue?["adapter_health"]?.objectValue?["finder"]?.objectValue?["availability"]?.stringValue)
        XCTAssertNotNil(doctor.data?.objectValue?["host_app_running"]?.boolValue)
        XCTAssertNotNil(doctor.data?.objectValue?["host_bundle_path"]?.stringValue)
        XCTAssertNotNil(doctor.data?.objectValue?["socket_fallback_enabled"]?.boolValue)

        let domains = try context.runCLI(["system", "domains", "list", "--json"])
        XCTAssertTrue(domains.ok)
        XCTAssertTrue(domains.data?.arrayValue?.contains(where: { $0.objectValue?["id"]?.stringValue == "contacts" }) == true)
        XCTAssertTrue(domains.data?.arrayValue?.contains(where: { $0.objectValue?["id"]?.stringValue == "processes" }) == true)

        let commands = try context.runCLI(["system", "commands", "list", "--domain", "reminders", "--json"])
        XCTAssertTrue(commands.ok)
        XCTAssertTrue(commands.data?.arrayValue?.contains(where: { $0.stringValue == "reminders items complete" }) == true)

        let finderCommands = try context.runCLI(["system", "commands", "list", "--domain", "finder", "--json"])
        XCTAssertTrue(finderCommands.ok)
        XCTAssertEqual(
            Set(finderCommands.data?.arrayValue?.compactMap(\.stringValue) ?? []),
            Set(["finder entries reveal", "finder entries open", "finder entries trash"])
        )

        let reminderCapabilities = try context.runCLI(["system", "capabilities", "list", "--domain", "reminders", "--json"])
        XCTAssertTrue(reminderCapabilities.ok)
        let capabilityIDs = Set(reminderCapabilities.data?.arrayValue?.compactMap { $0.objectValue?["id"]?.stringValue } ?? [])
        XCTAssertEqual(capabilityIDs, Set(["reminders.read", "reminders.write"]))

        let finderCapabilities = try context.runCLI(["system", "capabilities", "list", "--domain", "finder", "--json"])
        XCTAssertTrue(finderCapabilities.ok)
        let finderCapabilityIDs = Set(finderCapabilities.data?.arrayValue?.compactMap { $0.objectValue?["id"]?.stringValue } ?? [])
        XCTAssertEqual(finderCapabilityIDs, Set(["finder.read", "finder.write"]))
    }

    func testSystemMacHostBridgeRoutesLocallyWithoutDaemon() throws {
        let context = try TestContext()
        defer { context.cleanup() }

        let permissions = try context.runCLI(["system", "mac", "permissions", "--json"])
        XCTAssertTrue(permissions.ok)
        XCTAssertEqual(permissions.meta.adapter, "mac-permission-broker")
        XCTAssertEqual(permissions.meta.source, .localCLI)
        XCTAssertTrue((permissions.data?.objectValue?["permissions"]?.arrayValue?.count ?? 0) > 0)

        let plan = try context.runCLI([
            "system", "mac", "plan",
            "--capability-id", "mac.wifi.status",
            "--dry-run", "true",
            "--json",
        ])
        XCTAssertTrue(plan.ok)
        XCTAssertEqual(plan.meta.adapter, "mac-control")
        XCTAssertEqual(plan.meta.source, .localCLI)
        XCTAssertEqual(plan.data?.objectValue?["capabilityId"]?.stringValue, "mac.wifi.status")
        XCTAssertEqual(plan.data?.objectValue?["risk"]?.stringValue, "read")
        XCTAssertEqual(plan.data?.objectValue?["willMutate"]?.boolValue, false)
    }

    func testSystemTelemetrySnapshotMetricsAndWidgets() throws {
        let context = try TestContext()
        defer { context.cleanup() }

        let snapshot = try context.runCLI(["system", "telemetry", "snapshot", "--json"])
        XCTAssertTrue(snapshot.ok)
        XCTAssertEqual(snapshot.meta.adapter, "system-telemetry")
        XCTAssertEqual(snapshot.meta.source, .framework)
        XCTAssertEqual(snapshot.data?.objectValue?["policy"]?.objectValue?["default_agent_access"]?.stringValue, "safe_read")
        XCTAssertEqual(snapshot.data?.objectValue?["policy"]?.objectValue?["retention_owner"]?.stringValue, "monitor")
        XCTAssertTrue(snapshot.data?.objectValue?["samples"]?.arrayValue?.contains(where: {
            $0.objectValue?["metric_key"]?.stringValue == "system.cpu.load1"
        }) == true)
        XCTAssertTrue(snapshot.data?.objectValue?["samples"]?.arrayValue?.contains(where: {
            $0.objectValue?["metric_key"]?.stringValue == "system.memory.used"
        }) == true)
        XCTAssertTrue(snapshot.data?.objectValue?["samples"]?.arrayValue?.contains(where: {
            $0.objectValue?["metric_key"]?.stringValue == "system.network.bytes_in"
                && $0.objectValue?["unit"]?.stringValue == "bytes_per_second"
        }) == true)
        XCTAssertTrue(snapshot.data?.objectValue?["samples"]?.arrayValue?.contains(where: {
            $0.objectValue?["metric_key"]?.stringValue == "system.network.bytes_out"
                && $0.objectValue?["unit"]?.stringValue == "bytes_per_second"
        }) == true)
        let snapshotSamples = snapshot.data?.objectValue?["samples"]?.arrayValue ?? []
        let unavailableMetricKeys = Set((snapshot.data?.objectValue?["unavailable_metrics"]?.arrayValue ?? []).compactMap {
            $0.objectValue?["metric_key"]?.stringValue
        })
        for optionalMetricKey in [
            "system.gpu.utilization",
            "system.gpu.memory_used_bytes",
            "system.disk.io_read",
            "system.disk.io_write",
            "system.sensor.temperature",
            "system.sensor.fan_speed",
            "system.audio.output_volume",
            "system.display.brightness",
            "system.peripheral.connected_count",
            "system.peripheral.bluetooth_count",
            "system.process.count",
        ] {
            let sample = snapshotSamples.first { $0.objectValue?["metric_key"]?.stringValue == optionalMetricKey }
            XCTAssertTrue(sample != nil || unavailableMetricKeys.contains(optionalMetricKey))
        }
        if let gpuUtilization = snapshotSamples.first(where: { $0.objectValue?["metric_key"]?.stringValue == "system.gpu.utilization" }) {
            let value = gpuUtilization.objectValue?["value"]?.intValue ?? -1
            XCTAssertEqual(gpuUtilization.objectValue?["unit"]?.stringValue, "percent")
            XCTAssertEqual(gpuUtilization.objectValue?["confidence"]?.stringValue, "experimental")
            XCTAssertGreaterThanOrEqual(value, 0)
            XCTAssertLessThanOrEqual(value, 100)
        }
        if let gpuMemory = snapshotSamples.first(where: { $0.objectValue?["metric_key"]?.stringValue == "system.gpu.memory_used_bytes" }) {
            XCTAssertEqual(gpuMemory.objectValue?["unit"]?.stringValue, "bytes")
            XCTAssertEqual(gpuMemory.objectValue?["confidence"]?.stringValue, "experimental")
            XCTAssertGreaterThanOrEqual(gpuMemory.objectValue?["value"]?.intValue ?? -1, 0)
        }
        if let temperature = snapshotSamples.first(where: { $0.objectValue?["metric_key"]?.stringValue == "system.sensor.temperature" }) {
            XCTAssertEqual(temperature.objectValue?["unit"]?.stringValue, "celsius")
            XCTAssertEqual(temperature.objectValue?["confidence"]?.stringValue, "experimental")
            XCTAssertGreaterThan(temperature.objectValue?["value"]?.intValue ?? -1, 0)
        }
        if let fanSpeed = snapshotSamples.first(where: { $0.objectValue?["metric_key"]?.stringValue == "system.sensor.fan_speed" }) {
            XCTAssertEqual(fanSpeed.objectValue?["unit"]?.stringValue, "rpm")
            XCTAssertEqual(fanSpeed.objectValue?["confidence"]?.stringValue, "experimental")
            XCTAssertGreaterThanOrEqual(fanSpeed.objectValue?["value"]?.intValue ?? -1, 0)
        }
        if let audio = snapshotSamples.first(where: { $0.objectValue?["metric_key"]?.stringValue == "system.audio.output_volume" }) {
            let value = audio.objectValue?["value"]?.intValue ?? -1
            XCTAssertEqual(audio.objectValue?["unit"]?.stringValue, "percent")
            XCTAssertGreaterThanOrEqual(value, 0)
            XCTAssertLessThanOrEqual(value, 100)
        }
        if let display = snapshotSamples.first(where: { $0.objectValue?["metric_key"]?.stringValue == "system.display.brightness" }) {
            let value = display.objectValue?["value"]?.intValue ?? -1
            XCTAssertEqual(display.objectValue?["unit"]?.stringValue, "percent")
            XCTAssertGreaterThanOrEqual(value, 0)
            XCTAssertLessThanOrEqual(value, 100)
        }
        for diskIOMetricKey in ["system.disk.io_read", "system.disk.io_write"] {
            if let diskIO = snapshotSamples.first(where: { $0.objectValue?["metric_key"]?.stringValue == diskIOMetricKey }) {
                XCTAssertEqual(diskIO.objectValue?["unit"]?.stringValue, "bytes_per_second")
                XCTAssertGreaterThanOrEqual(diskIO.objectValue?["value"]?.intValue ?? -1, 0)
            }
        }
        if let peripherals = snapshotSamples.first(where: { $0.objectValue?["metric_key"]?.stringValue == "system.peripheral.connected_count" }) {
            XCTAssertEqual(peripherals.objectValue?["unit"]?.stringValue, "count")
            XCTAssertGreaterThanOrEqual(peripherals.objectValue?["value"]?.intValue ?? -1, 0)
        }
        if let bluetoothPeripherals = snapshotSamples.first(where: { $0.objectValue?["metric_key"]?.stringValue == "system.peripheral.bluetooth_count" }) {
            XCTAssertEqual(bluetoothPeripherals.objectValue?["unit"]?.stringValue, "count")
            XCTAssertGreaterThanOrEqual(bluetoothPeripherals.objectValue?["value"]?.intValue ?? -1, 0)
        }
        if let notificationState = snapshotSamples.first(where: { $0.objectValue?["metric_key"]?.stringValue == "system.notifications.availability_state" }) {
            let value = notificationState.objectValue?["value"]?.intValue ?? -1
            XCTAssertEqual(notificationState.objectValue?["unit"]?.stringValue, "state")
            XCTAssertGreaterThanOrEqual(value, 0)
            XCTAssertLessThanOrEqual(value, 2)
        } else {
            XCTFail("Expected notification availability state sample")
        }
        let metrics = try context.runCLI(["system", "metrics", "list", "--json"])
        XCTAssertTrue(metrics.ok)
        XCTAssertTrue(metrics.data?.arrayValue?.contains(where: {
            $0.objectValue?["key"]?.stringValue == "system.network.public_ip"
                && $0.objectValue?["agent_access"]?.stringValue == "restricted"
        }) == true)

        let widgets = try context.runCLI(["system", "widgets", "list", "--json"])
        XCTAssertTrue(widgets.ok)
        XCTAssertTrue(widgets.data?.arrayValue?.contains(where: {
            $0.objectValue?["id"]?.stringValue == "menu.cpu-memory"
        }) == true)
        XCTAssertTrue(widgets.data?.arrayValue?.contains(where: {
            $0.objectValue?["id"]?.stringValue == "agent-runs-active"
                && $0.objectValue?["enabledByDefault"]?.boolValue == false
        }) == true)
        XCTAssertTrue(widgets.data?.arrayValue?.contains(where: {
            $0.objectValue?["id"]?.stringValue == "notifications-status"
                && $0.objectValue?["enabledByDefault"]?.boolValue == false
        }) == true)

        let providers = try context.runCLI(["system", "providers", "list", "--json"])
        XCTAssertTrue(providers.ok)
        XCTAssertTrue(providers.data?.arrayValue?.contains(where: {
            $0.objectValue?["kind"]?.stringValue == "weather"
                && $0.objectValue?["mode"]?.stringValue == "mock"
                && $0.objectValue?["status"]?.stringValue == "ready"
        }) == true)
        XCTAssertTrue(providers.data?.arrayValue?.contains(where: {
            $0.objectValue?["kind"]?.stringValue == "agent_run"
                && $0.objectValue?["metrics"]?.arrayValue?.contains(.string("context.agent_runs.active")) == true
        }) == true)
        XCTAssertTrue(providers.data?.arrayValue?.contains(where: {
            $0.objectValue?["id"]?.stringValue == "system.sensors.signed"
                && $0.objectValue?["kind"]?.stringValue == "hardware_sensor"
                && $0.objectValue?["status"]?.stringValue == "external_pending"
                && $0.objectValue?["requiresGrant"]?.stringValue == "system.sensor.read"
        }) == true)

        let providerPlan = try context.runCLI([
            "system", "providers", "plan",
            "--provider-id", "context.weather.live",
            "--reason", "test-plan",
            "--json",
        ])
        XCTAssertTrue(providerPlan.ok)
        XCTAssertEqual(providerPlan.data?.objectValue?["will_connect"]?.boolValue, false)
        XCTAssertEqual(providerPlan.data?.objectValue?["broker"]?.objectValue?["status"]?.stringValue, "external_pending")
        XCTAssertEqual(providerPlan.data?.objectValue?["broker"]?.objectValue?["fail_closed"]?.boolValue, true)
        XCTAssertEqual(providerPlan.data?.objectValue?["policy"]?.objectValue?["credential_ref_required"]?.boolValue, true)
        XCTAssertEqual(providerPlan.data?.objectValue?["policy"]?.objectValue?["network_access"]?.stringValue, "blocked_until_granted")
        XCTAssertTrue(providerPlan.data?.objectValue?["steps"]?.arrayValue?.contains(where: {
            $0.objectValue?["id"]?.stringValue == "resolve_credential_ref"
                && $0.objectValue?["status"]?.stringValue == "blocked"
        }) == true)
        XCTAssertTrue(providerPlan.data?.objectValue?["steps"]?.arrayValue?.contains(where: {
            $0.objectValue?["id"]?.stringValue == "connect_provider"
                && $0.objectValue?["status"]?.stringValue == "blocked"
        }) == true)
        XCTAssertEqual(providerPlan.data?.objectValue?["audit"]?.objectValue?["status"]?.stringValue, "recorded")
        XCTAssertEqual(providerPlan.data?.objectValue?["audit"]?.objectValue?["outcome"]?.stringValue, "blocked")
        XCTAssertEqual(providerPlan.data?.objectValue?["receipt"]?.objectValue?["audit_status"]?.stringValue, "recorded")
        XCTAssertEqual(providerPlan.data?.objectValue?["audit"]?.objectValue?["storage_ref"]?.stringValue, "claw.host.state/system-telemetry-provider-audit.jsonl")
        XCTAssertNil(providerPlan.data?.objectValue?["audit"]?.objectValue?["audit_path"]?.stringValue)
        let providerAuditURL = context.tmp
            .appendingPathComponent("state", isDirectory: true)
            .appendingPathComponent("system-telemetry-provider-audit.jsonl")
        let providerAudit = try String(contentsOf: providerAuditURL, encoding: .utf8)
        XCTAssertTrue(providerAudit.contains("\"provider_id\":\"context.weather.live\""))
        XCTAssertTrue(providerAudit.contains("\"credential_ref_redacted\":false"))
        XCTAssertTrue(providerAudit.contains("\"outcome\":\"blocked\""))

        let providerPlanWithCredential = try context.runCLI([
            "system", "providers", "plan",
            "--provider-id", "context.weather.live",
            "--credential-ref", "secret://weather/local",
            "--reason", "credential-test",
            "--json",
        ])
        XCTAssertTrue(providerPlanWithCredential.ok)
        XCTAssertEqual(providerPlanWithCredential.data?.objectValue?["request"]?.objectValue?["credential_ref"]?.stringValue, "provided_redacted")
        XCTAssertTrue(providerPlanWithCredential.data?.objectValue?["steps"]?.arrayValue?.contains(where: {
            $0.objectValue?["id"]?.stringValue == "resolve_credential_ref"
                && $0.objectValue?["status"]?.stringValue == "pending"
        }) == true)
        let providerPlanWithCredentialJSON = try JSONEncoder().encode(providerPlanWithCredential.data)
        XCTAssertFalse(String(data: providerPlanWithCredentialJSON, encoding: .utf8)?.contains("secret://weather/local") ?? true)
        XCTAssertEqual(providerPlanWithCredential.data?.objectValue?["audit"]?.objectValue?["storage_ref"]?.stringValue, "claw.host.state/system-telemetry-provider-audit.jsonl")
        XCTAssertNil(providerPlanWithCredential.data?.objectValue?["audit"]?.objectValue?["audit_path"]?.stringValue)
        let providerAuditWithCredential = try String(contentsOf: providerAuditURL, encoding: .utf8)
        XCTAssertTrue(providerAuditWithCredential.contains("\"credential_ref_redacted\":true"))
        XCTAssertFalse(providerAuditWithCredential.contains("secret://weather/local"))

        let sensorProviderPlan = try context.runCLI([
            "system", "providers", "plan",
            "--provider-id", "system.sensors.signed",
            "--reason", "sensor-validation",
            "--json",
        ])
        XCTAssertTrue(sensorProviderPlan.ok)
        XCTAssertEqual(sensorProviderPlan.data?.objectValue?["will_connect"]?.boolValue, false)
        XCTAssertEqual(sensorProviderPlan.data?.objectValue?["provider"]?.objectValue?["kind"]?.stringValue, "hardware_sensor")
        XCTAssertEqual(sensorProviderPlan.data?.objectValue?["policy"]?.objectValue?["credential_ref_required"]?.boolValue, false)
        XCTAssertTrue(sensorProviderPlan.data?.objectValue?["policy"]?.objectValue?["required_grants"]?.arrayValue?.contains(.string("system.sensor.read")) == true)
        XCTAssertTrue(sensorProviderPlan.data?.objectValue?["steps"]?.arrayValue?.contains(where: {
            $0.objectValue?["id"]?.stringValue == "resolve_credential_ref"
                && $0.objectValue?["status"]?.stringValue == "skipped"
        }) == true)
        XCTAssertTrue(sensorProviderPlan.data?.objectValue?["steps"]?.arrayValue?.contains(where: {
            $0.objectValue?["id"]?.stringValue == "connect_provider"
                && $0.objectValue?["status"]?.stringValue == "blocked"
        }) == true)
        XCTAssertEqual(sensorProviderPlan.data?.objectValue?["receipt"]?.objectValue?["audit_event"]?.stringValue, "system.telemetry.provider.hardware_sensor.live")
        XCTAssertEqual(sensorProviderPlan.data?.objectValue?["audit"]?.objectValue?["status"]?.stringValue, "recorded")
        XCTAssertEqual(sensorProviderPlan.data?.objectValue?["receipt"]?.objectValue?["audit_status"]?.stringValue, "recorded")
        XCTAssertEqual(sensorProviderPlan.data?.objectValue?["audit"]?.objectValue?["storage_ref"]?.stringValue, "claw.host.state/system-telemetry-provider-audit.jsonl")
        XCTAssertNil(sensorProviderPlan.data?.objectValue?["audit"]?.objectValue?["audit_path"]?.stringValue)
        let sensorProviderAudit = try String(contentsOf: providerAuditURL, encoding: .utf8)
        XCTAssertTrue(sensorProviderAudit.contains("\"provider_id\":\"system.sensors.signed\""))
        XCTAssertTrue(sensorProviderAudit.contains("system.sensor.read"))

        let controls = try context.runCLI(["system", "controls", "list", "--json"])
        XCTAssertTrue(controls.ok)
        XCTAssertTrue(controls.data?.arrayValue?.contains(where: {
            $0.objectValue?["id"]?.stringValue == "system.display.set_brightness"
                && $0.objectValue?["requires_signed_host_broker"]?.boolValue == true
                && $0.objectValue?["availability"]?.stringValue == "external_pending"
        }) == true)

        let controlPlan = try context.runCLI([
            "system", "controls", "plan",
            "--control-id", "system.audio.set_output_volume",
            "--target", "default",
            "--value", "35",
            "--json",
        ])
        XCTAssertTrue(controlPlan.ok)
        XCTAssertEqual(controlPlan.data?.objectValue?["will_execute"]?.boolValue, false)
        XCTAssertEqual(controlPlan.data?.objectValue?["broker"]?.objectValue?["status"]?.stringValue, "external_pending")
        XCTAssertEqual(controlPlan.data?.objectValue?["broker"]?.objectValue?["fail_closed"]?.boolValue, true)
        XCTAssertEqual(controlPlan.data?.objectValue?["receipt"]?.objectValue?["audit_event"]?.stringValue, "system.telemetry.control.audio.set_output_volume")

        let history = try context.runCLI([
            "system", "history", "list",
            "--metric-key", "system.cpu.load1",
            "--range", "1h",
            "--json",
        ])
        XCTAssertTrue(history.ok)
        XCTAssertEqual(history.data?.objectValue?["source"]?.stringValue, "monitor")
        XCTAssertEqual(history.data?.objectValue?["status"]?.stringValue, "not_recorded")
    }

    func testSystemTelemetryLocalContextProvidersFromEnvironmentAndFiles() throws {
        let context = try TestContext()
        defer { context.cleanup() }
        let serviceFile = context.tmp.appendingPathComponent("service-health.json")
        try Data(#"{"context.service.health":"degraded"}"#.utf8).write(to: serviceFile)

        let snapshot = try context.runCLI(
            ["system", "telemetry", "snapshot", "--json"],
            environmentOverride: [
                "CLAW_CONTEXT_BUILD_STATUS": "failed",
                "CLAW_CONTEXT_SERVICE_HEALTH_FILE": serviceFile.path,
                "CLAW_CONTEXT_AGENT_RUNS_ACTIVE": "3",
                "CLAW_CONTEXT_WEATHER_TEMPERATURE": "21.5",
                "CLAW_CONTEXT_FOCUS_MODE": "work",
                "CLAW_CONTEXT_CUSTOM_METRIC": "deploying",
            ]
        )

        XCTAssertTrue(snapshot.ok)
        let samples = snapshot.data?.objectValue?["samples"]?.arrayValue ?? []
        func sample(_ key: String) -> JSONValue? {
            samples.first { $0.objectValue?["metric_key"]?.stringValue == key }
        }

        XCTAssertEqual(sample("context.build.status")?.objectValue?["unit"]?.stringValue, "state")
        XCTAssertEqual(sample("context.build.status")?.objectValue?["value"]?.intValue, 2)
        XCTAssertEqual(sample("context.service.health")?.objectValue?["value"]?.intValue, 1)
        XCTAssertEqual(sample("context.agent_runs.active")?.objectValue?["value"]?.intValue, 3)
        if case .number(let weather)? = sample("context.weather.temperature")?.objectValue?["value"] {
            XCTAssertEqual(weather, 21.5, accuracy: 0.1)
        } else {
            XCTFail("Expected numeric weather context sample")
        }
        XCTAssertEqual(sample("system.focus.mode")?.objectValue?["value"]?.stringValue, "work")
        XCTAssertEqual(sample("context.custom.metric")?.objectValue?["value"]?.stringValue, "deploying")
    }

    func testDaemonAutoStartHealthAndReconnect() throws {
        let context = try TestContext()
        defer { context.cleanup() }

        let health = try context.runCLI(["system", "daemon", "health", "--json"])
        XCTAssertTrue(health.ok)
        XCTAssertEqual(health.data?.objectValue?["running"]?.boolValue, true)

        let stop = try context.runCLI(["system", "daemon", "stop", "--json"])
        XCTAssertTrue(stop.ok)
        Thread.sleep(forTimeInterval: 0.5)

        let healthAgain = try context.runCLI(["system", "daemon", "health", "--json"])
        XCTAssertTrue(healthAgain.ok)
        XCTAssertEqual(healthAgain.data?.objectValue?["running"]?.boolValue, true)
    }

    func testInstallStatusAndCLIInstall() throws {
        let context = try TestContext()
        defer { context.cleanup() }

        let statusBefore = try context.runCLI(["system", "install", "status", "--json"])
        XCTAssertTrue(statusBefore.ok)
        XCTAssertEqual(statusBefore.data?.objectValue?["cli_installed"]?.boolValue, false)
        XCTAssertEqual(statusBefore.data?.objectValue?["launch_agent_installed"]?.boolValue, false)

        let installed = try context.runCLI(["system", "install", "cli", "--json"])
        XCTAssertTrue(installed.ok)
        XCTAssertTrue(FileManager.default.fileExists(atPath: context.binDir.appendingPathComponent("claw-host").path))

        let daemonBinary = context.binary(named: "claw-hostd")
        _ = try RuntimeInstaller.installLaunchAgent(daemonBinaryPath: daemonBinary, environment: context.environment)

        let statusAfter = try context.runCLI(["system", "install", "status", "--json"])
        XCTAssertEqual(statusAfter.data?.objectValue?["cli_installed"]?.boolValue, true)
        XCTAssertEqual(statusAfter.data?.objectValue?["launch_agent_installed"]?.boolValue, true)
        XCTAssertEqual(statusAfter.data?.objectValue?["runtime_transport"]?.stringValue, "unix_socket")
        XCTAssertNotNil(statusAfter.data?.objectValue?["host_app_running"]?.boolValue)
        XCTAssertNotNil(statusAfter.data?.objectValue?["app_registered_at_login"]?.boolValue)
    }

    func testCLIInstallResolvesRelativeInvokerPath() throws {
        let context = try TestContext()
        defer { context.cleanup() }

        let packageRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let absoluteBinary = context.binary(named: "claw-host")
        let relativeBinary = absoluteBinary.replacingOccurrences(of: packageRoot.path + "/", with: "")

        let process = Process()
        process.currentDirectoryURL = packageRoot
        process.executableURL = URL(fileURLWithPath: "/bin/zsh")
        process.arguments = ["-lc", "./\(relativeBinary) system install cli --json"]
        process.environment = context.environment
        let stdout = Pipe()
        let stderr = Pipe()
        process.standardOutput = stdout
        process.standardError = stderr
        try process.run()
        process.waitUntilExit()
        XCTAssertEqual(process.terminationStatus, 0, String(data: stderr.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? "")

        let response = try CLIJSON.decodeResponse(stdout.fileHandleForReading.readDataToEndOfFile())
        XCTAssertTrue(response.ok)

        let installedPath = context.binDir.appendingPathComponent("claw-host").path
        let installedTarget = try FileManager.default.destinationOfSymbolicLink(atPath: installedPath)
        XCTAssertEqual(URL(fileURLWithPath: installedTarget).standardizedFileURL.path, absoluteBinary)
    }

    func testAppPackagingProducesBundleStructure() throws {
        let context = try TestContext()
        defer { context.cleanup() }

        let packageRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let output = context.tmp.appendingPathComponent("Claw.app")

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/zsh")
        process.arguments = [
            packageRoot.appendingPathComponent("scripts/package_app.sh").path,
            "--output", output.path,
            "--binary-path", context.binary(named: "ClawApp"),
            "--skip-build",
            "--skip-sign",
        ]
        let stdout = Pipe()
        let stderr = Pipe()
        process.standardOutput = stdout
        process.standardError = stderr
        try process.run()
        process.waitUntilExit()
        XCTAssertEqual(process.terminationStatus, 0, String(data: stderr.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? "")

        XCTAssertTrue(FileManager.default.fileExists(atPath: output.appendingPathComponent("Contents/MacOS/ClawApp").path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: output.appendingPathComponent("Contents/Info.plist").path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: output.appendingPathComponent("Contents/Resources/AppIcon.icns").path))

        let info = NSDictionary(contentsOf: output.appendingPathComponent("Contents/Info.plist")) as? [String: Any]
        XCTAssertEqual(info?["CFBundleIdentifier"] as? String, "com.example.claw")
        XCTAssertEqual(info?["CFBundleExecutable"] as? String, "ClawApp")
        XCTAssertEqual(info?["CFBundleIconFile"] as? String, "AppIcon")
        XCTAssertNotNil(info?["NSRemindersFullAccessUsageDescription"] as? String)
        XCTAssertNotNil(info?["NSAppleEventsUsageDescription"] as? String)
    }

    func testPackagedAppCanLaunchPermissionRequestsFromBundleProcess() throws {
        let context = try TestContext()
        defer { context.cleanup() }

        let packageRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let output = context.tmp.appendingPathComponent("Claw.app")
        let requestLog = context.tmp.appendingPathComponent("permission-requests.log")

        let packageProcess = Process()
        packageProcess.executableURL = URL(fileURLWithPath: "/bin/zsh")
        packageProcess.arguments = [
            packageRoot.appendingPathComponent("scripts/package_app.sh").path,
            "--output", output.path,
            "--binary-path", context.binary(named: "ClawApp"),
            "--skip-build",
            "--skip-sign",
        ]
        packageProcess.standardOutput = Pipe()
        packageProcess.standardError = Pipe()
        try packageProcess.run()
        packageProcess.waitUntilExit()
        XCTAssertEqual(packageProcess.terminationStatus, 0)

        let launchProcess = Process()
        launchProcess.executableURL = output.appendingPathComponent("Contents/MacOS/ClawApp")
        launchProcess.arguments = [
            "--request-os-permissions",
            "all",
            "--exit-after-permissions",
        ]
        launchProcess.environment = [
            "CLAW_HOST_PERMISSION_REQUEST_DRY_RUN": "1",
            "CLAW_HOST_PERMISSION_REQUEST_LOG": requestLog.path,
        ]
        launchProcess.standardOutput = Pipe()
        launchProcess.standardError = Pipe()
        try launchProcess.run()
        let deadline = Date().addingTimeInterval(10)
        while launchProcess.isRunning && Date() < deadline {
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        if launchProcess.isRunning {
            launchProcess.terminate()
            XCTFail("Packaged Claw app did not finish permission request flow in time")
        }
        XCTAssertEqual(launchProcess.terminationStatus, 0)

        let requestedDomains = try String(contentsOf: requestLog, encoding: .utf8)
            .split(separator: "\n")
            .map(String.init)
        XCTAssertEqual(requestedDomains, ["calendar", "reminders", "contacts", "notifications"])
    }

    func testPackagedAppServesCommandsOverAppOwnedRuntime() throws {
        let context = try TestContext(testMode: false)
        defer { context.cleanup() }

        let packageRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let output = context.tmp.appendingPathComponent("Claw.app")

        let packageProcess = Process()
        packageProcess.executableURL = URL(fileURLWithPath: "/bin/zsh")
        packageProcess.arguments = [
            packageRoot.appendingPathComponent("scripts/package_app.sh").path,
            "--output", output.path,
            "--binary-path", context.binary(named: "ClawApp"),
            "--skip-build",
            "--skip-sign",
        ]
        packageProcess.standardOutput = Pipe()
        packageProcess.standardError = Pipe()
        try packageProcess.run()
        packageProcess.waitUntilExit()
        XCTAssertEqual(packageProcess.terminationStatus, 0)

        let doctor = try context.runCLIUnchecked([
            "system", "doctor", "run", "--json",
        ], environmentOverride: [
            "CLAW_HOST_APP_BUNDLE": output.path,
            "CLAW_HOST_RUNTIME_TRANSPORT": RuntimeInstaller.appOwnedRuntimeTransport,
        ])
        if !doctor.ok, doctor.error?.code == "transport_error" {
            throw XCTSkip("Temporary app bundle runtime could not bootstrap on this host")
        }
        XCTAssertEqual(doctor.data?.objectValue?["runtime_transport"]?.stringValue, RuntimeInstaller.appOwnedRuntimeTransport)
        XCTAssertEqual(doctor.data?.objectValue?["host_app_running"]?.boolValue, true)
        XCTAssertEqual(doctor.data?.objectValue?["host_bundle_path"]?.stringValue, output.path)

        let stopped = try context.runCLIUnchecked([
            "system", "daemon", "stop", "--json",
        ], environmentOverride: [
            "CLAW_HOST_APP_BUNDLE": output.path,
            "CLAW_HOST_RUNTIME_TRANSPORT": RuntimeInstaller.appOwnedRuntimeTransport,
        ])
        XCTAssertTrue(stopped.ok)
    }

    func testInstalledCLISymlinkCanStartPackagedAppRuntime() throws {
        let context = try TestContext(testMode: false)
        defer { context.cleanup() }

        let packageRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let output = context.tmp.appendingPathComponent("Claw.app")

        let packageProcess = Process()
        packageProcess.executableURL = URL(fileURLWithPath: "/bin/zsh")
        packageProcess.arguments = [
            packageRoot.appendingPathComponent("scripts/package_app.sh").path,
            "--output", output.path,
            "--binary-path", context.binary(named: "ClawApp"),
            "--skip-build",
            "--skip-sign",
        ]
        packageProcess.standardOutput = Pipe()
        packageProcess.standardError = Pipe()
        try packageProcess.run()
        packageProcess.waitUntilExit()
        XCTAssertEqual(packageProcess.terminationStatus, 0)

        let installedCLI = context.binDir.appendingPathComponent("claw-host")
        try FileManager.default.createDirectory(at: context.binDir, withIntermediateDirectories: true)
        try FileManager.default.createSymbolicLink(at: installedCLI, withDestinationURL: URL(fileURLWithPath: context.binary(named: "claw-host")))

        let process = Process()
        process.currentDirectoryURL = packageRoot
        process.executableURL = URL(fileURLWithPath: "/bin/zsh")
        process.arguments = ["-lc", "\"\(installedCLI.path)\" system doctor run --json"]
        process.environment = context.environment.merging([
            "CLAW_HOST_APP_BUNDLE": output.path,
            "CLAW_HOST_RUNTIME_TRANSPORT": RuntimeInstaller.appOwnedRuntimeTransport,
        ]) { _, new in new }
        let stdout = Pipe()
        let stderr = Pipe()
        process.standardOutput = stdout
        process.standardError = stderr
        try process.run()
        process.waitUntilExit()

        let response = try CLIJSON.decodeResponse(stdout.fileHandleForReading.readDataToEndOfFile())
        if !response.ok, response.error?.code == "transport_error" {
            throw XCTSkip("Installed CLI symlink could not bootstrap the packaged app runtime on this host")
        }

        XCTAssertEqual(process.terminationStatus, 0, String(data: stderr.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? "")
        XCTAssertTrue(response.ok)
        XCTAssertEqual(response.data?.objectValue?["runtime_transport"]?.stringValue, RuntimeInstaller.appOwnedRuntimeTransport)
        XCTAssertEqual(response.data?.objectValue?["host_bundle_path"]?.stringValue, output.path)
    }

    func testDaemonStartAndRestartCommands() throws {
        let context = try TestContext()
        defer { context.cleanup() }

        XCTAssertTrue(try context.runCLI(["system", "daemon", "start", "--json"]).ok)
        let healthBefore = try context.runCLI(["system", "daemon", "health", "--json"])
        let pidBefore = healthBefore.data?.objectValue?["pid"]?.intValue
        XCTAssertNotNil(pidBefore)

        XCTAssertTrue(try context.runCLI(["system", "daemon", "restart", "--json"]).ok)
        let healthAfter = try context.runCLI(["system", "daemon", "health", "--json"])
        XCTAssertEqual(healthAfter.data?.objectValue?["running"]?.boolValue, true)
    }

    func testFilesCrudRequiresCapabilitiesAndWritesAuditLogs() throws {
        let context = try TestContext()
        defer { context.cleanup() }

        let filePath = context.tmp.appendingPathComponent("modules/sandbox/demo.txt").path

        let denied = try context.runCLI([
            "files", "entries", "create",
            "--path", filePath,
            "--type", "file",
            "--content", "hola",
            "--json",
        ], expectSuccess: false)

        XCTAssertFalse(denied.ok)
        XCTAssertEqual(denied.error?.code, "permission_denied")

        try context.grant("files.read")
        try context.grant("files.write")
        try context.grant("files.delete")

        XCTAssertTrue(try context.runCLI([
            "files", "entries", "create",
            "--path", filePath,
            "--type", "file",
            "--content", "hola",
            "--json",
        ]).ok)

        let listed = try context.runCLI([
            "files", "entries", "list",
            "--path", context.tmp.appendingPathComponent("sandbox").path,
            "--json",
        ])
        XCTAssertTrue(listed.ok)
        XCTAssertTrue(listed.data?.arrayValue?.contains(where: {
            $0.objectValue?["name"]?.stringValue == "demo.txt"
        }) == true)

        let read = try context.runCLI([
            "files", "entries", "get",
            "--path", filePath,
            "--json",
        ])
        XCTAssertEqual(read.data?.objectValue?["content"]?.stringValue, "hola")

        XCTAssertTrue(try context.runCLI([
            "files", "entries", "update",
            "--path", filePath,
            "--content", "adios",
            "--json",
        ]).ok)

        let movedPath = context.tmp.appendingPathComponent("modules/sandbox/archive/demo.txt").path
        XCTAssertTrue(try context.runCLI([
            "files", "entries", "move",
            "--path", filePath,
            "--to", movedPath,
            "--json",
        ]).ok)

        XCTAssertTrue(try context.runCLI([
            "files", "entries", "delete",
            "--path", movedPath,
            "--json",
        ]).ok)

        let logs = try context.runCLI([
            "system", "logs", "list",
            "--limit", "20",
            "--json",
        ])
        XCTAssertTrue(logs.ok)
        XCTAssertGreaterThanOrEqual(logs.data?.arrayValue?.count ?? 0, 6)
        let fileCreateLog = logs.data?.arrayValue?.first(where: { $0.objectValue?["command"]?.stringValue == "files entries create" })?.objectValue
        XCTAssertEqual(fileCreateLog?["validation_mode"]?.stringValue, "fixture")
        XCTAssertEqual(fileCreateLog?["arguments"]?.objectValue?["content"]?.stringValue, "[redacted:4]")
    }

    func testCalendarCrudWorksAgainstIsolatedFixtureStore() throws {
        let context = try TestContext()
        defer { context.cleanup() }

        try context.grant("calendar.read")
        try context.grant("calendar.write")
        let start = isoDate(hoursFromNow: 1)
        let end = isoDate(hoursFromNow: 2)

        let create = try context.runCLI([
            "calendar", "events", "create",
            "--title", "Focus block",
            "--start", start,
            "--end", end,
            "--calendar", "Work",
            "--notes", "Deep work",
            "--location", "Desk",
            "--json",
        ])
        XCTAssertTrue(create.ok)
        let id = try XCTUnwrap(create.data?.objectValue?["id"]?.stringValue)

        let listed = try context.runCLI([
            "calendar", "events", "list",
            "--range", "2d",
            "--calendar", "Work",
            "--json",
        ])
        XCTAssertTrue(listed.data?.arrayValue?.contains(where: { $0.objectValue?["id"]?.stringValue == id }) == true)

        let get = try context.runCLI(["calendar", "events", "get", "--id", id, "--json"])
        XCTAssertEqual(get.data?.objectValue?["title"]?.stringValue, "Focus block")

        let search = try context.runCLI([
            "calendar", "events", "search",
            "--query", "deep",
            "--range", "2d",
            "--json",
        ])
        XCTAssertTrue(search.data?.arrayValue?.contains(where: { $0.objectValue?["id"]?.stringValue == id }) == true)

        let update = try context.runCLI([
            "calendar", "events", "update",
            "--id", id,
            "--title", "Focus block updated",
            "--location", "Studio",
            "--json",
        ])
        XCTAssertEqual(update.data?.objectValue?["location"]?.stringValue, "Studio")

        let delete = try context.runCLI(["calendar", "events", "delete", "--id", id, "--json"])
        XCTAssertTrue(delete.ok)
    }

    func testObsidianCrudWorksAgainstIsolatedVault() throws {
        let context = try TestContext()
        defer { context.cleanup() }

        try context.grant("obsidian.read")
        try context.grant("obsidian.write")

        let vaultPath = context.tmp.appendingPathComponent("vault").path
        let notePath = "Inbox/Agent Note.md"

        XCTAssertTrue(try context.runCLI([
            "obsidian", "notes", "create",
            "--vault", vaultPath,
            "--path", notePath,
            "--content", "# title",
            "--json",
        ]).ok)

        let read = try context.runCLI([
            "obsidian", "notes", "get",
            "--vault", vaultPath,
            "--path", notePath,
            "--json",
        ])
        XCTAssertEqual(read.data?.objectValue?["content"]?.stringValue, "# title")

        let search = try context.runCLI([
            "obsidian", "notes", "search",
            "--vault", vaultPath,
            "--folder", "Inbox",
            "--query", "title",
            "--json",
        ])
        XCTAssertTrue(search.ok)
        XCTAssertFalse(search.data?.arrayValue?.isEmpty ?? true)
    }

    func testRemindersCrudInIsolatedTestMode() throws {
        let context = try TestContext()
        defer { context.cleanup() }

        try context.grant("reminders.read")
        try context.grant("reminders.write")

        let lists = try context.runCLI(["reminders", "lists", "list", "--json"])
        XCTAssertTrue(lists.data?.arrayValue?.contains(where: { $0.objectValue?["title"]?.stringValue == "Personal" }) == true)

        let created = try context.runCLI([
            "reminders", "items", "create",
            "--title", "Buy coffee",
            "--list", "Personal",
            "--notes", "beans",
            "--priority", "5",
            "--json",
        ])
        let id = try XCTUnwrap(created.data?.objectValue?["id"]?.stringValue)

        let searched = try context.runCLI([
            "reminders", "items", "search",
            "--query", "coffee",
            "--json",
        ])
        XCTAssertTrue(searched.data?.arrayValue?.contains(where: { $0.objectValue?["id"]?.stringValue == id }) == true)

        let completed = try context.runCLI(["reminders", "items", "complete", "--id", id, "--json"])
        XCTAssertEqual(completed.data?.objectValue?["completed"]?.boolValue, true)

        let deleted = try context.runCLI(["reminders", "items", "delete", "--id", id, "--json"])
        XCTAssertTrue(deleted.ok)
    }

    func testContactsCrudInIsolatedTestMode() throws {
        let context = try TestContext()
        defer { context.cleanup() }

        try context.grant("contacts.read")
        try context.grant("contacts.write")

        let created = try context.runCLI([
            "contacts", "people", "create",
            "--name", "Ada Lovelace",
            "--email", "ada@example.com",
            "--phone", "+34123456789",
            "--organization", "Analytical Engine",
            "--notes", "First programmer",
            "--json",
        ])
        let id = try XCTUnwrap(created.data?.objectValue?["id"]?.stringValue)

        let get = try context.runCLI(["contacts", "people", "get", "--id", id, "--json"])
        XCTAssertEqual(get.data?.objectValue?["name"]?.stringValue, "Ada Lovelace")

        let search = try context.runCLI(["contacts", "people", "search", "--query", "Analytical", "--json"])
        XCTAssertTrue(search.data?.arrayValue?.contains(where: { $0.objectValue?["id"]?.stringValue == id }) == true)

        let update = try context.runCLI([
            "contacts", "people", "update",
            "--id", id,
            "--organization", "Royal Society",
            "--json",
        ])
        XCTAssertEqual(update.data?.objectValue?["organization"]?.stringValue, "Royal Society")

        let delete = try context.runCLI(["contacts", "people", "delete", "--id", id, "--json"])
        XCTAssertTrue(delete.ok)
    }

    func testMailCrudInIsolatedTestMode() throws {
        let context = try TestContext()
        defer { context.cleanup() }

        try context.grant("mail.read")
        try context.grant("mail.send")
        try context.grant("mail.delete")

        let created = try context.runCLI([
            "mail", "messages", "create",
            "--subject", "Draft from agent",
            "--to", "dev@example.com",
            "--body", "hello world",
            "--json",
        ])
        let id = try XCTUnwrap(created.data?.objectValue?["id"]?.stringValue)
        XCTAssertEqual(created.data?.objectValue?["mailbox"]?.stringValue, "Drafts")

        let listed = try context.runCLI(["mail", "messages", "list", "--mailbox", "Drafts", "--json"])
        XCTAssertTrue(listed.data?.arrayValue?.contains(where: { $0.objectValue?["id"]?.stringValue == id }) == true)

        let searched = try context.runCLI(["mail", "messages", "search", "--query", "agent", "--json"])
        XCTAssertTrue(searched.data?.arrayValue?.contains(where: { $0.objectValue?["id"]?.stringValue == id }) == true)

        let get = try context.runCLI(["mail", "messages", "get", "--id", id, "--json"])
        XCTAssertEqual(get.data?.objectValue?["subject"]?.stringValue, "Draft from agent")

        let sent = try context.runCLI([
            "mail", "messages", "send",
            "--subject", "Outbound",
            "--to", "dev@example.com",
            "--body", "ship it",
            "--json",
        ])
        XCTAssertEqual(sent.data?.objectValue?["mailbox"]?.stringValue, "Sent")

        let delete = try context.runCLI(["mail", "messages", "delete", "--id", id, "--json"])
        XCTAssertTrue(delete.ok)
    }

    func testThingsCrudInIsolatedTestMode() throws {
        let context = try TestContext()
        defer { context.cleanup() }

        try context.grant("things.read")
        try context.grant("things.write")

        let created = try context.runCLI([
            "things", "todos", "create",
            "--title", "Ship Commander",
            "--project", "Launch",
            "--notes", "stage rollout",
            "--json",
        ])
        let id = try XCTUnwrap(created.data?.objectValue?["id"]?.stringValue)

        let search = try context.runCLI(["things", "todos", "search", "--query", "launch", "--json"])
        XCTAssertTrue(search.data?.arrayValue?.contains(where: { $0.objectValue?["id"]?.stringValue == id }) == true)

        let get = try context.runCLI(["things", "todos", "get", "--id", id, "--json"])
        XCTAssertEqual(get.data?.objectValue?["title"]?.stringValue, "Ship Commander")

        let update = try context.runCLI([
            "things", "todos", "update",
            "--id", id,
            "--area", "Work",
            "--deadline", "2026-04-20",
            "--json",
        ])
        XCTAssertEqual(update.data?.objectValue?["area"]?.stringValue, "Work")

        let complete = try context.runCLI(["things", "todos", "complete", "--id", id, "--json"])
        XCTAssertEqual(complete.data?.objectValue?["status"]?.stringValue, "completed")

        let delete = try context.runCLI(["things", "todos", "delete", "--id", id, "--json"])
        XCTAssertTrue(delete.ok)
    }

    func testNotesCrudInIsolatedTestMode() throws {
        let context = try TestContext()
        defer { context.cleanup() }

        try context.grant("notes.read")
        try context.grant("notes.write")

        let created = try context.runCLI([
            "notes", "notes", "create",
            "--title", "Weekly plan",
            "--folder", "Work",
            "--body", "1. Ship adapters",
            "--json",
        ])
        let id = try XCTUnwrap(created.data?.objectValue?["id"]?.stringValue)

        let listed = try context.runCLI(["notes", "notes", "list", "--json"])
        XCTAssertTrue(listed.data?.arrayValue?.contains(where: { $0.objectValue?["id"]?.stringValue == id }) == true)

        let get = try context.runCLI(["notes", "notes", "get", "--id", id, "--json"])
        XCTAssertEqual(get.data?.objectValue?["folder"]?.stringValue, "Work")

        let search = try context.runCLI(["notes", "notes", "search", "--query", "adapters", "--json"])
        XCTAssertTrue(search.data?.arrayValue?.contains(where: { $0.objectValue?["id"]?.stringValue == id }) == true)

        let update = try context.runCLI([
            "notes", "notes", "update",
            "--id", id,
            "--body", "1. Ship adapters\n2. Validate host",
            "--json",
        ])
        XCTAssertTrue(update.data?.objectValue?["body"]?.stringValue?.contains("Validate host") == true)

        let delete = try context.runCLI(["notes", "notes", "delete", "--id", id, "--json"])
        XCTAssertTrue(delete.ok)
    }

    func testMessagesSendAndReadInIsolatedTestMode() throws {
        let context = try TestContext()
        defer { context.cleanup() }

        try context.grant("messages.read")
        try context.grant("messages.send")

        let sent = try context.runCLI([
            "messages", "messages", "send",
            "--recipient", "+34123456789",
            "--text", "ping",
            "--json",
        ])
        let id = try XCTUnwrap(sent.data?.objectValue?["id"]?.stringValue)

        let listed = try context.runCLI(["messages", "conversations", "list", "--json"])
        XCTAssertTrue(listed.data?.arrayValue?.contains(where: { $0.objectValue?["id"]?.stringValue == id }) == true)

        let get = try context.runCLI(["messages", "conversations", "get", "--id", id, "--json"])
        XCTAssertEqual(get.data?.objectValue?["participants"]?.stringValue, "+34123456789")
    }

    func testSafariTabsAndBookmarksInIsolatedTestMode() throws {
        let context = try TestContext()
        defer { context.cleanup() }

        try context.grant("safari.read")
        try context.grant("safari.write")

        let tabs = try context.runCLI(["safari", "tabs", "list", "--json"])
        let firstTabID = try XCTUnwrap(tabs.data?.arrayValue?.first?.objectValue?["id"]?.stringValue)
        let tab = try context.runCLI(["safari", "tabs", "get", "--id", firstTabID, "--json"])
        XCTAssertEqual(tab.data?.objectValue?["id"]?.stringValue, firstTabID)

        let opened = try context.runCLI(["safari", "tabs", "open", "--url", "https://example.com/new", "--json"])
        let openedID = try XCTUnwrap(opened.data?.objectValue?["id"]?.stringValue)
        XCTAssertEqual(opened.data?.objectValue?["url"]?.stringValue, "https://example.com/new")

        let closed = try context.runCLI(["safari", "tabs", "close", "--id", openedID, "--json"])
        XCTAssertTrue(closed.ok)

        let bookmarks = try context.runCLI(["safari", "bookmarks", "list", "--json"])
        let bookmarkID = try XCTUnwrap(bookmarks.data?.arrayValue?.first?.objectValue?["id"]?.stringValue)

        let search = try context.runCLI(["safari", "bookmarks", "search", "--query", "docs", "--json"])
        XCTAssertFalse(search.data?.arrayValue?.isEmpty ?? true)

        let bookmarkOpen = try context.runCLI(["safari", "bookmarks", "open", "--id", bookmarkID, "--json"])
        XCTAssertEqual(bookmarkOpen.data?.objectValue?["opened"]?.boolValue, true)
    }

    func testUtilitiesClipboardNotificationsProcessesAndScreenshots() throws {
        let context = try TestContext()
        defer { context.cleanup() }

        try context.grant("clipboard.read")
        try context.grant("clipboard.write")
        try context.grant("notifications.post")
        try context.grant("apps.read")
        try context.grant("apps.write")
        try context.grant("processes.read")
        try context.grant("screenshots.capture")

        let clipboardSet = try context.runCLI(["clipboard", "contents", "set", "--text", "hello", "--json"])
        XCTAssertTrue(clipboardSet.ok)
        let clipboardGet = try context.runCLI(["clipboard", "contents", "get", "--json"])
        XCTAssertEqual(clipboardGet.data?.objectValue?["text"]?.stringValue, "hello")
        XCTAssertTrue(try context.runCLI(["clipboard", "contents", "clear", "--json"]).ok)

        let notification = try context.runCLI([
            "notifications", "entries", "post",
            "--title", "Commander Test",
            "--body", "fixture mode",
            "--json",
        ])
        XCTAssertEqual(notification.data?.objectValue?["posted"]?.boolValue, true)

        let appsList = try context.runCLI(["apps", "entries", "list", "--json"])
        XCTAssertTrue(appsList.ok)
        XCTAssertNotNil(appsList.data?.arrayValue)
        XCTAssertTrue(try context.runCLI(["apps", "entries", "open", "--name", "Notes", "--json"]).ok)
        XCTAssertTrue(try context.runCLI(["apps", "entries", "focus", "--name", "Notes", "--json"]).ok)
        XCTAssertTrue(try context.runCLI(["apps", "entries", "quit", "--name", "Notes", "--json"]).ok)

        let processes = try context.runCLI(["processes", "entries", "list", "--limit", "25", "--json"])
        let firstProcessID = try XCTUnwrap(processes.data?.arrayValue?.first?.objectValue?["id"]?.stringValue)
        let process = try context.runCLI(["processes", "entries", "get", "--id", firstProcessID, "--json"])
        XCTAssertEqual(process.data?.objectValue?["id"]?.stringValue, firstProcessID)

        let screenshotPath = context.tmp.appendingPathComponent("capture.png").path
        let screenshot = try context.runCLI(["screenshots", "entries", "capture", "--path", screenshotPath, "--json"])
        XCTAssertEqual(screenshot.data?.objectValue?["captured"]?.boolValue, true)
        XCTAssertTrue(FileManager.default.fileExists(atPath: screenshotPath))
    }

    func testFinderCommandsRequireCapabilitiesAndWorkInFixtureMode() throws {
        let context = try TestContext()
        defer { context.cleanup() }

        let path = context.tmp.appendingPathComponent("finder/fixture.txt")
        try FileManager.default.createDirectory(at: path.deletingLastPathComponent(), withIntermediateDirectories: true)
        try "fixture".write(to: path, atomically: true, encoding: .utf8)

        let denied = try context.runCLI([
            "finder", "entries", "reveal",
            "--path", path.path,
            "--json",
        ], expectSuccess: false)
        XCTAssertEqual(denied.error?.code, "permission_denied")

        try context.grant("finder.read")
        try context.grant("finder.write")

        let reveal = try context.runCLI([
            "finder", "entries", "reveal",
            "--path", path.path,
            "--json",
        ])
        XCTAssertEqual(reveal.data?.objectValue?["revealed"]?.boolValue, true)

        let open = try context.runCLI([
            "finder", "entries", "open",
            "--path", path.path,
            "--json",
        ])
        XCTAssertEqual(open.data?.objectValue?["opened"]?.boolValue, true)

        let trash = try context.runCLI([
            "finder", "entries", "trash",
            "--path", path.path,
            "--json",
        ])
        XCTAssertEqual(trash.data?.objectValue?["trashed"]?.boolValue, true)
    }

    func testCalendarReadPathIsWiredWithoutMutatingUserRecords() throws {
        let context = try TestContext(testMode: false)
        defer { context.cleanup() }

        try context.grant("calendar.read")
        let response = try context.runCLIUnchecked(["calendar", "events", "list", "--range", "today", "--json"])

        if response.ok {
            XCTAssertNotNil(response.data?.arrayValue)
        } else {
            XCTAssertEqual(response.error?.code, "permission_denied")
        }
    }

    func testHostSafeCalendarCrudAgainstDedicatedCalendar() throws {
        try requireHostSafe()
        guard PermissionService().status(for: .calendar) == .authorized else {
            throw XCTSkip("Calendar permission is not authorized on this host")
        }

        let calendarName = "Claw Host Tests \(UUID().uuidString.prefix(8))"
        let calendarStore = EKEventStore()
        let calendar = try HostFixtures.createCalendar(named: calendarName, store: calendarStore)
        defer { try? HostFixtures.deleteCalendar(calendar, store: calendarStore) }

        let context = try TestContext(testMode: false, hostSafe: true)
        defer { context.cleanup() }
        try context.grant("calendar.read")
        try context.grant("calendar.write")

        let created = try context.runCLI([
            "calendar", "events", "create",
            "--title", "Host validation",
            "--start", isoDate(hoursFromNow: 1),
            "--end", isoDate(hoursFromNow: 2),
            "--calendar", calendarName,
            "--notes", "isolated resource",
            "--json",
        ])
        let id = try XCTUnwrap(created.data?.objectValue?["id"]?.stringValue)
        XCTAssertEqual(created.meta.validationMode, .hostIsolated)

        let listed = try context.runCLI([
            "calendar", "events", "list",
            "--calendar", calendarName,
            "--range", "2d",
            "--json",
        ])
        XCTAssertTrue(listed.data?.arrayValue?.contains(where: { $0.objectValue?["id"]?.stringValue == id }) == true)

        let updated = try context.runCLI([
            "calendar", "events", "update",
            "--id", id,
            "--title", "Host validation updated",
            "--calendar", calendarName,
            "--json",
        ])
        XCTAssertEqual(updated.data?.objectValue?["title"]?.stringValue, "Host validation updated")

        let deleted = try context.runCLI(["calendar", "events", "delete", "--id", id, "--json"])
        XCTAssertTrue(deleted.ok)
    }

    func testHostSafeContactsCrudAgainstDedicatedMarker() throws {
        try requireHostSafe()
        guard PermissionService().status(for: .contacts) == .authorized else {
            throw XCTSkip("Contacts permission is not authorized on this host")
        }

        let context = try TestContext(testMode: false, hostSafe: true)
        defer { context.cleanup() }
        try context.grant("contacts.read")
        try context.grant("contacts.write")

        let marker = "claw-host-\(UUID().uuidString.prefix(8))"
        var createdID: String?
        defer {
            if let createdID {
                try? HostFixtures.deleteContact(id: createdID)
            }
        }

        let created = try context.runCLI([
            "contacts", "people", "create",
            "--name", "Commander Host \(marker)",
            "--email", "host@example.com",
            "--organization", marker,
            "--json",
        ])
        createdID = try XCTUnwrap(created.data?.objectValue?["id"]?.stringValue)
        XCTAssertEqual(created.meta.validationMode, .hostIsolated)

        let deleted = try context.runCLI(["contacts", "people", "delete", "--id", createdID!, "--json"])
        XCTAssertTrue(deleted.ok)
        createdID = nil
    }

    func testHostSafeDoctorReportsMailAndRemindersHealth() throws {
        try requireHostSafe()

        let context = try TestContext(testMode: false, hostSafe: true)
        defer { context.cleanup() }

        let doctor = try context.runCLI(["system", "doctor", "run", "--json"])
        let adapterHealth = try XCTUnwrap(doctor.data?.objectValue?["adapter_health"]?.objectValue)
        let reminders = try XCTUnwrap(adapterHealth["reminders"]?.objectValue)
        let mail = try XCTUnwrap(adapterHealth["mail"]?.objectValue)
        let notification = try XCTUnwrap(adapterHealth["notifications"]?.objectValue)

        let reminderReason = reminders["reason"]?.stringValue
        let currentReminderStatus = doctor.data?.objectValue?["os_permissions"]?.objectValue?["reminders"]?.stringValue
        if currentReminderStatus == "authorized" {
            XCTAssertEqual(reminders["availability"]?.stringValue, "available")
            XCTAssertEqual(reminderReason, "ok")
        } else {
            XCTAssertEqual(reminders["availability"]?.stringValue, "unavailable")
            XCTAssertEqual(reminderReason, "permission_missing")
        }
        XCTAssertTrue(["available", "unavailable"].contains(notification["availability"]?.stringValue))
        XCTAssertTrue(["ok", "permission_missing"].contains(notification["reason"]?.stringValue))

        if HostFixtures.appExists("Mail") {
            XCTAssertTrue(["available", "degraded"].contains(mail["availability"]?.stringValue))
            XCTAssertTrue(["ok", "automation_timeout", "automation_denied"].contains(mail["reason"]?.stringValue))
        } else {
            XCTAssertEqual(mail["availability"]?.stringValue, "unavailable")
            XCTAssertEqual(mail["reason"]?.stringValue, "app_missing")
        }
    }

    func testHostSafeRemindersCrudAgainstDedicatedList() throws {
        try requireHostSafe()
        let preflightContext = try TestContext(testMode: false, hostSafe: true)
        defer { preflightContext.cleanup() }
        let doctor = try preflightContext.runCLI(["system", "doctor", "run", "--json"])
        guard doctor.data?.objectValue?["os_permissions"]?.objectValue?["reminders"]?.stringValue == "authorized" else {
            throw XCTSkip("Reminders permission is not authorized on this host")
        }

        let listName = "Claw Host Tests \(UUID().uuidString.prefix(8))"
        let store = EKEventStore()
        let calendar = try HostFixtures.createReminderList(named: listName, store: store)
        defer { try? HostFixtures.deleteReminderList(calendar, store: store) }

        let context = try TestContext(testMode: false, hostSafe: true)
        defer { context.cleanup() }
        try context.grant("reminders.read")
        try context.grant("reminders.write")

        let created = try context.runCLI([
            "reminders", "items", "create",
            "--title", "Host reminder",
            "--list", listName,
            "--notes", "isolated resource",
            "--json",
        ])
        let id = try XCTUnwrap(created.data?.objectValue?["id"]?.stringValue)

        let listed = try context.runCLI(["reminders", "items", "list", "--list", listName, "--json"])
        XCTAssertTrue(listed.data?.arrayValue?.contains(where: { $0.objectValue?["id"]?.stringValue == id }) == true)

        let completed = try context.runCLI(["reminders", "items", "complete", "--id", id, "--json"])
        XCTAssertEqual(completed.data?.objectValue?["completed"]?.boolValue, true)

        let deleted = try context.runCLI(["reminders", "items", "delete", "--id", id, "--json"])
        XCTAssertTrue(deleted.ok)
    }

    func testHostSafeNotificationsPostWhenAuthorized() throws {
        try requireHostSafe()

        let context = try TestContext(testMode: false, hostSafe: true)
        defer { context.cleanup() }
        let doctor = try context.runCLI(["system", "doctor", "run", "--json"])
        guard doctor.data?.objectValue?["os_permissions"]?.objectValue?["notifications"]?.stringValue == "authorized" else {
            throw XCTSkip("Notifications permission is not authorized on this host")
        }
        try context.grant("notifications.post")

        let posted = try context.runCLI([
            "notifications", "entries", "post",
            "--title", "Commander host notification",
            "--body", "runtime host validation",
            "--json",
        ])
        XCTAssertTrue(posted.ok)
        XCTAssertEqual(posted.data?.objectValue?["posted"]?.boolValue, true)
        XCTAssertEqual(posted.meta.validationMode, .hostIsolated)
    }

    func testHostSafeSafariTabLifecycleAgainstDedicatedWindow() throws {
        try requireHostSafe()
        guard HostFixtures.appExists("Safari") else {
            throw XCTSkip("Safari is not installed on this host")
        }

        let windowIndex: Int
        do {
            windowIndex = try HostFixtures.createSafariWindow()
        } catch let error as CommanderError where error.payload.code == "adapter_unavailable" {
            throw XCTSkip("Safari automation timed out on this host")
        }
        defer { try? HostFixtures.closeSafariWindow(windowIndex: windowIndex) }

        let context = try TestContext(testMode: false, hostSafe: true)
        defer { context.cleanup() }
        try context.grant("safari.read")
        try context.grant("safari.write")

        let url = "https://example.com/claw-host-\(UUID().uuidString.prefix(8))"
        let opened = try context.runCLI([
            "safari", "tabs", "open",
            "--url", url,
            "--window", "\(windowIndex)",
            "--json",
        ])
        let id = try XCTUnwrap(opened.data?.objectValue?["id"]?.stringValue)
        XCTAssertEqual(opened.meta.validationMode, .hostIsolated)

        let listed = try context.runCLI(["safari", "tabs", "list", "--window", "\(windowIndex)", "--json"])
        XCTAssertTrue(listed.data?.arrayValue?.contains(where: { $0.objectValue?["id"]?.stringValue == id }) == true)

        let closed = try context.runCLI(["safari", "tabs", "close", "--id", id, "--json"])
        XCTAssertTrue(closed.ok)
    }

    func testHostSafeFinderLifecycleAgainstDedicatedTempPaths() throws {
        try requireHostSafe()
        guard HostFixtures.appExists("Finder") else {
            throw XCTSkip("Finder is not installed on this host")
        }

        let context = try TestContext(testMode: false, hostSafe: true)
        defer { context.cleanup() }
        try context.grant("finder.read")
        try context.grant("finder.write")

        func assertFinderDoctor(_ reason: String) throws {
            let doctor = try context.runCLI(["system", "doctor", "run", "--json"])
            let finderHealth = doctor.data?.objectValue?["adapter_health"]?.objectValue?["finder"]?.objectValue
            XCTAssertEqual(finderHealth?["availability"]?.stringValue, "degraded")
            XCTAssertEqual(finderHealth?["reason"]?.stringValue, reason)
        }

        let folder = context.tmp.appendingPathComponent("finder-host", isDirectory: true)
        let revealFile = folder.appendingPathComponent("reveal.txt")
        let trashFile = folder.appendingPathComponent("trash.txt")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try "reveal".write(to: revealFile, atomically: true, encoding: .utf8)
        try "trash".write(to: trashFile, atomically: true, encoding: .utf8)

        let reveal = try context.runCLIUnchecked([
            "finder", "entries", "reveal",
            "--path", revealFile.path,
            "--json",
        ])
        if reveal.error?.code == "adapter_unavailable", reveal.error?.message == "Finder automation timed out" {
            try assertFinderDoctor("automation_timeout")
            throw XCTSkip("Finder automation timed out on this host")
        }
        if reveal.error?.code == "permission_denied", reveal.error?.message == "Finder automation denied" {
            try assertFinderDoctor("automation_denied")
            throw XCTSkip("Finder automation is denied on this host")
        }
        XCTAssertTrue(reveal.ok)
        XCTAssertEqual(reveal.meta.validationMode, .hostIsolated)

        let open = try context.runCLIUnchecked([
            "finder", "entries", "open",
            "--path", folder.path,
            "--json",
        ])
        if open.error?.code == "adapter_unavailable", open.error?.message == "Finder automation timed out" {
            try assertFinderDoctor("automation_timeout")
            throw XCTSkip("Finder open timed out on this host")
        }
        if open.error?.code == "permission_denied", open.error?.message == "Finder automation denied" {
            try assertFinderDoctor("automation_denied")
            throw XCTSkip("Finder open is denied on this host")
        }
        XCTAssertTrue(open.ok)
        XCTAssertEqual(open.meta.validationMode, .hostIsolated)

        let trash = try context.runCLIUnchecked([
            "finder", "entries", "trash",
            "--path", trashFile.path,
            "--json",
        ])
        if trash.error?.code == "adapter_unavailable", trash.error?.message == "Finder automation timed out" {
            try assertFinderDoctor("automation_timeout")
            throw XCTSkip("Finder trash timed out on this host")
        }
        if trash.error?.code == "permission_denied", trash.error?.message == "Finder automation denied" {
            try assertFinderDoctor("automation_denied")
            throw XCTSkip("Finder trash is denied on this host")
        }
        XCTAssertTrue(trash.ok)
        XCTAssertEqual(trash.meta.validationMode, .hostIsolated)
        XCTAssertFalse(FileManager.default.fileExists(atPath: trashFile.path))
    }

    func testHostSafeMailDraftLifecycleRequiresInstalledApp() throws {
        try requireHostSafe()
        guard HostFixtures.appExists("Mail") else {
            throw XCTSkip("Mail is not installed on this host")
        }

        let context = try TestContext(testMode: false, hostSafe: true)
        defer { context.cleanup() }
        try context.grant("mail.read")
        try context.grant("mail.send")
        try context.grant("mail.delete")

        func assertMailDoctor(_ reason: String) throws {
            let doctor = try context.runCLI(["system", "doctor", "run", "--json"])
            let mailHealth = doctor.data?.objectValue?["adapter_health"]?.objectValue?["mail"]?.objectValue
            XCTAssertEqual(mailHealth?["availability"]?.stringValue, "degraded")
            XCTAssertEqual(mailHealth?["reason"]?.stringValue, reason)
        }

        let created = try context.runCLIUnchecked([
            "mail", "messages", "create",
            "--subject", "Commander host draft",
            "--to", "noreply@example.com",
            "--body", "isolated draft",
            "--mailbox", "Drafts",
            "--json",
        ])
        if created.error?.code == "adapter_unavailable", created.error?.message == "Mail automation timed out" {
            try assertMailDoctor("automation_timeout")
            throw XCTSkip("Mail automation timed out on this host")
        }
        if created.error?.code == "permission_denied", created.error?.message == "Mail automation denied" {
            try assertMailDoctor("automation_denied")
            throw XCTSkip("Mail automation is denied on this host")
        }
        XCTAssertTrue(created.ok)
        let id = try XCTUnwrap(created.data?.objectValue?["id"]?.stringValue)
        defer { _ = try? context.runCLIUnchecked(["mail", "messages", "delete", "--id", id, "--json"]) }

        var listed: CommandResponse?
        var foundDraft = false
        for attempt in 0..<5 {
            let response = try context.runCLIUnchecked(["mail", "messages", "list", "--mailbox", "Drafts", "--json"])
            if response.error?.code == "adapter_unavailable", response.error?.message == "Mail automation timed out" {
                try assertMailDoctor("automation_timeout")
                throw XCTSkip("Mail list timed out on this host")
            }
            if response.error?.code == "permission_denied", response.error?.message == "Mail automation denied" {
                try assertMailDoctor("automation_denied")
                throw XCTSkip("Mail list is denied on this host")
            }
            listed = response
            foundDraft = response.data?.arrayValue?.contains(where: { $0.objectValue?["id"]?.stringValue == id }) == true
            if foundDraft {
                break
            }
            if attempt < 4 {
                Thread.sleep(forTimeInterval: 0.5)
            }
        }
        guard foundDraft else {
            throw XCTSkip("Mail draft was not observable consistently on this host")
        }
        XCTAssertNotNil(listed)

        let deleted = try context.runCLIUnchecked(["mail", "messages", "delete", "--id", id, "--json"])
        if deleted.error?.code == "adapter_unavailable", deleted.error?.message == "Mail automation timed out" {
            try assertMailDoctor("automation_timeout")
            throw XCTSkip("Mail delete timed out on this host")
        }
        if deleted.error?.code == "permission_denied", deleted.error?.message == "Mail automation denied" {
            try assertMailDoctor("automation_denied")
            throw XCTSkip("Mail delete is denied on this host")
        }
        XCTAssertTrue(deleted.ok)
    }

    func testHostSafeThingsCrudAgainstDedicatedProject() throws {
        try requireHostSafe()
        guard HostFixtures.appExists("Things3") else {
            throw XCTSkip("Things3 is not installed on this host")
        }

        let projectName = "Claw Host Tests \(UUID().uuidString.prefix(8))"
        let projectID: String
        do {
            projectID = try HostFixtures.createThingsProject(named: projectName)
        } catch let error as CommanderError where error.payload.code == "adapter_unavailable" {
            throw XCTSkip("Things automation timed out on this host")
        }
        defer { try? HostFixtures.deleteThingsProject(named: projectName) }

        let context = try TestContext(testMode: false, hostSafe: true)
        defer { context.cleanup() }
        try context.grant("things.read")
        try context.grant("things.write")

        let created = try context.runCLI([
            "things", "todos", "create",
            "--title", "Host todo",
            "--notes", "isolated resource",
            "--project", projectID,
            "--json",
        ])
        let id = try XCTUnwrap(created.data?.objectValue?["id"]?.stringValue)

        let searched = try context.runCLI([
            "things", "todos", "search",
            "--query", "Host todo",
            "--project", projectID,
            "--json",
        ])
        XCTAssertTrue(searched.data?.arrayValue?.contains(where: { $0.objectValue?["id"]?.stringValue == id }) == true)

        let completed = try context.runCLI(["things", "todos", "complete", "--id", id, "--json"])
        XCTAssertEqual(completed.data?.objectValue?["status"]?.stringValue, "completed")

        let deleted = try context.runCLI(["things", "todos", "delete", "--id", id, "--json"])
        XCTAssertTrue(deleted.ok)
    }
}

private struct TestContext {
    let tmp: URL
    let binDir: URL
    let launchAgentsDir: URL
    let environment: [String: String]

    init(testMode: Bool = true, hostSafe: Bool = false) throws {
        tmp = URL(fileURLWithPath: "/tmp/claw-host-tests-\(UUID().uuidString.prefix(8))", isDirectory: true)
        try FileManager.default.createDirectory(at: tmp, withIntermediateDirectories: true)
        binDir = tmp.appendingPathComponent("bin", isDirectory: true)
        launchAgentsDir = tmp.appendingPathComponent("LaunchAgents", isDirectory: true)
        var baseEnvironment = [
            "CLAW_HOST_HOME": tmp.appendingPathComponent("state").path,
            "CLAW_HOST_BIN_DIR": binDir.path,
            "CLAW_HOST_LAUNCH_AGENTS_DIR": launchAgentsDir.path,
            "CLAW_HOST_RUNTIME_TRANSPORT": RuntimeInstaller.socketRuntimeTransport,
            "PATH": ProcessInfo.processInfo.environment["PATH"] ?? "",
        ]
        if testMode {
            baseEnvironment["CLAW_HOST_TEST_MODE"] = "1"
        }
        if hostSafe {
            baseEnvironment["CLAW_HOST_SAFE"] = "1"
        }
        environment = baseEnvironment
    }

    func grant(_ scope: String) throws {
        let response = try runCLI(["system", "capabilities", "grant", "--scope", scope, "--json"])
        XCTAssertTrue(response.ok)
    }

    func cleanup() {
        _ = try? runCLIUnchecked(["system", "daemon", "stop", "--json"])
        if let pid = daemonPID() {
            kill(pid, SIGTERM)
        }
        try? FileManager.default.removeItem(at: tmp)
    }

    func runCLI(_ arguments: [String], expectSuccess: Bool = true, environmentOverride: [String: String] = [:]) throws -> CommandResponse {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: binary(named: "claw-host"))
        process.arguments = arguments
        process.environment = environment.merging(environmentOverride) { _, new in new }

        let stdout = Pipe()
        let stderr = Pipe()
        process.standardOutput = stdout
        process.standardError = stderr
        try process.run()
        process.waitUntilExit()

        let output = stdout.fileHandleForReading.readDataToEndOfFile()
        let response = try CLIJSON.decodeResponse(output)

        if expectSuccess {
            XCTAssertEqual(process.terminationStatus, 0)
        } else {
            XCTAssertNotEqual(process.terminationStatus, 0)
        }

        return response
    }

    func runCLIUnchecked(_ arguments: [String], environmentOverride: [String: String] = [:]) throws -> CommandResponse {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: binary(named: "claw-host"))
        process.arguments = arguments
        process.environment = environment.merging(environmentOverride) { _, new in new }
        let stdout = Pipe()
        process.standardOutput = stdout
        process.standardError = Pipe()
        try process.run()
        process.waitUntilExit()
        return try CLIJSON.decodeResponse(stdout.fileHandleForReading.readDataToEndOfFile())
    }

    private func daemonPID() -> Int32? {
        let statusURL = tmp.appendingPathComponent("state/daemon-status.json")
        guard let data = try? Data(contentsOf: statusURL),
              let health = try? JSONDecoder().decode(DaemonHealth.self, from: data),
              let pid = health.pid else {
            return nil
        }
        return pid
    }

    func binary(named name: String) -> String {
        let packageRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()

        let debugBinary = packageRoot.appendingPathComponent(".build/debug/\(name)")
        if FileManager.default.isExecutableFile(atPath: debugBinary.path) {
            return debugBinary.path
        }

        let platformBinary = packageRoot.appendingPathComponent(".build/arm64-apple-macosx/debug/\(name)")
        if FileManager.default.isExecutableFile(atPath: platformBinary.path) {
            return platformBinary.path
        }

        XCTFail("Missing binary \(name)")
        return debugBinary.path
    }
}

private func isoDate(hoursFromNow hours: Int) -> String {
    let date = Date().addingTimeInterval(TimeInterval(hours * 3600))
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    return formatter.string(from: date)
}

private func requireHostSafe() throws {
    guard ProcessInfo.processInfo.environment["CLAW_HOST_SAFE"] == "1" else {
        throw XCTSkip("Set CLAW_HOST_SAFE=1 to run host-safe validation")
    }
}
