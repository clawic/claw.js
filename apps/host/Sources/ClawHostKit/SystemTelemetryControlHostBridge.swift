import CommanderCore
import Foundation

@MainActor
public enum SystemTelemetryControlHostBridge {
    public static func response(
        action: String,
        arguments: [String: String],
        environment: [String: String] = ProcessInfo.processInfo.environment,
        runner: MacControlCommandRunning = MacControlProcessRunner()
    ) throws -> CommandResponse {
        guard action == "execute" else {
            throw CommanderError.invalidCommand("Unknown system control host action \(action).")
        }

        guard let controlID = arguments["control-id"] ?? arguments["control_id"] ?? arguments["id"] else {
            throw CommanderError.invalidArguments("Missing --control-id for system controls execute.")
        }
        guard let mapping = macMapping(for: controlID) else {
            return try failClosedResponse(
                controlID: controlID,
                target: arguments["target"],
                value: arguments["value"],
                reasonArgument: arguments["reason"],
                reason: "System control is not executable by the signed host broker yet.",
                environment: environment
            )
        }
        guard let value = arguments["value"], !value.isEmpty else {
            return try failClosedResponse(
                controlID: controlID,
                target: arguments["target"],
                value: arguments["value"],
                reasonArgument: arguments["reason"],
                reason: "System control \(controlID) requires --value.",
                environment: environment
            )
        }

        let request = MacControlWireRequest(
            requestId: arguments["request-id"] ?? arguments["request_id"] ?? "systemctl_\(UUID().uuidString)",
            capabilityId: mapping.capabilityID,
            actor: MacControlWireActor(
                kind: arguments["actor-kind"] ?? arguments["actor_kind"] ?? MacControlOrigin.ownerCLI.rawValue,
                id: arguments["actor-id"] ?? arguments["actor_id"] ?? "system-telemetry",
                role: arguments["actor-role"] ?? arguments["actor_role"] ?? "owner"
            ),
            host: hostIdentity(environment: environment),
            target: MacControlWireTarget(
                kind: mapping.targetKind,
                name: arguments["target"],
                selector: arguments["target"].map { ["target": .string($0)] } ?? [:]
            ),
            arguments: ["value": .string(value)],
            dryRun: bool(arguments["dry-run"] ?? arguments["dry_run"]) ?? false,
            reason: arguments["reason"],
            approved: bool(arguments["confirm"] ?? arguments["approved"])
        )

        let requestBytes = try JSONEncoder().encode(request)
        let stateDirectory = try StatePaths.ensureStateDirectory(environment: environment)
        let evaluationData = try MacControlWire.evaluateJSON(
            for: requestBytes,
            auditURL: stateDirectory.appendingPathComponent(MacControlPolicy.auditFilename),
            policyURL: MacControlPolicyGrantStore.fileURL(stateDirectory: stateDirectory),
            continuityURL: MacControlContinuityStore.fileURL(stateDirectory: stateDirectory),
            runner: runner
        )
        let evaluation = try decodeJSONValue(evaluationData)
        let payload = executionPayload(
            controlID: controlID,
            mapping: mapping,
            value: value,
            target: arguments["target"],
            reason: arguments["reason"],
            evaluation: evaluation
        )
        return CommandResponse(
            ok: true,
            data: payload,
            error: nil,
            meta: .init(
                adapter: "system-telemetry-control",
                source: .localCLI,
                hostId: HostConfiguration.current(environment: environment).id,
                capabilityId: controlID,
                riskLevel: mapping.riskLevel,
                validationMode: .hostReal,
                durationMS: 0
            ),
            requestId: request.requestId
        )
    }

    private struct ControlMapping {
        var capabilityID: String
        var family: String
        var targetKind: String
        var riskLevel: String
        var auditEvent: String
    }

    private static func macMapping(for controlID: String) -> ControlMapping? {
        switch controlID {
        case "system.audio.set_output_volume":
            return ControlMapping(
                capabilityID: "mac.audio.volume",
                family: "audio",
                targetKind: "audio_output",
                riskLevel: "low",
                auditEvent: "system.telemetry.control.audio.set_output_volume"
            )
        case "system.display.set_brightness":
            return ControlMapping(
                capabilityID: "mac.display.brightness",
                family: "display",
                targetKind: "display",
                riskLevel: "medium",
                auditEvent: "system.telemetry.control.display.set_brightness"
            )
        default:
            return nil
        }
    }

    private static func executionPayload(
        controlID: String,
        mapping: ControlMapping,
        value: String,
        target: String?,
        reason: String?,
        evaluation: JSONValue
    ) -> JSONValue {
        let evaluationObject = evaluation.objectValue ?? [:]
        let decision = evaluationObject["decision"]?.stringValue ?? "blocked"
        let receipt = evaluationObject["receipt"]?.objectValue
        let result = receipt?["result"]?.stringValue ?? decision
        let status: String
        switch result {
        case "ok":
            status = "executed"
        case "planned":
            status = "planned"
        case "blocked":
            status = "blocked"
        case "error":
            status = "failed"
        default:
            status = decision == "approval_required" ? "approval_required" : result
        }

        return .object([
            "schema_version": .integer(1),
            "id": .string("system-control-execution-\(controlID.replacingOccurrences(of: ".", with: "-"))-\(Int(Date().timeIntervalSince1970 * 1000))"),
            "status": .string(status),
            "will_execute": .bool(status == "executed"),
            "external_pending": .bool(false),
            "action": .object([
                "id": .string(controlID),
                "family": .string(mapping.family),
                "requires_signed_host_broker": .bool(true),
                "audit_event": .string(mapping.auditEvent),
            ]),
            "request": .object([
                "target": target.map(JSONValue.string) ?? .null,
                "value": .string(value),
                "reason": reason.map(JSONValue.string) ?? .string("not_provided"),
            ]),
            "broker": .object([
                "required": .bool(true),
                "status": .string(status),
                "mode": .string("signed_host_plan_first"),
                "fail_closed": .bool(true),
                "capability_id": .string(mapping.capabilityID),
            ]),
            "receipt": .object([
                "required": .bool(true),
                "status": receipt == nil ? .string("not_issued") : .string("issued"),
                "audit_event": .string(mapping.auditEvent),
                "mac_receipt_id": receipt?["id"] ?? .null,
                "mac_audit_id": receipt?["auditId"] ?? receipt?["audit_id"] ?? .null,
                "result": .string(result),
            ]),
            "mac_control": evaluation,
        ])
    }

    private static func failClosedResponse(
        controlID: String,
        target: String?,
        value: String?,
        reasonArgument: String?,
        reason: String,
        environment: [String: String]
    ) throws -> CommandResponse {
        let plan = SystemTelemetry.controlPlan(
            controlID: controlID,
            target: target,
            value: value,
            reason: reasonArgument
        )
        var data = plan.objectValue ?? [
            "schema_version": .integer(1),
            "control_id": .string(controlID),
            "will_execute": .bool(false),
            "external_pending": .bool(true),
        ]
        data["status"] = .string("blocked")
        data["control_id"] = .string(controlID)
        data["will_execute"] = .bool(false)
        data["external_pending"] = .bool(true)
        data["reason"] = .string(reason)
        if var broker = data["broker"]?.objectValue {
            broker["status"] = .string("external_pending")
            broker["fail_closed"] = .bool(true)
            data["broker"] = .object(broker)
        } else {
            data["broker"] = .object([
                "required": .bool(true),
                "status": .string("external_pending"),
                "mode": .string("signed_host_plan_first"),
                "fail_closed": .bool(true),
            ])
        }

        let audit = appendFailClosedAudit(
            controlID: controlID,
            target: target,
            value: value,
            reasonArgument: reasonArgument,
            reason: reason,
            environment: environment,
            data: data
        )
        data["audit"] = audit
        if var receipt = data["receipt"]?.objectValue,
           let auditObject = audit.objectValue {
            receipt["audit_status"] = auditObject["status"]
            receipt["audit_id"] = auditObject["audit_id"] ?? .null
            data["receipt"] = .object(receipt)
        }

        return CommandResponse(
            ok: false,
            data: .object(data),
            error: CommanderError.invalidArguments(reason).payload,
            meta: .init(
                adapter: "system-telemetry-control",
                source: .localCLI,
                hostId: HostConfiguration.current(environment: environment).id,
                capabilityId: controlID,
                riskLevel: "high",
                validationMode: .hostReal,
                durationMS: 0
            )
        )
    }

    private static func appendFailClosedAudit(
        controlID: String,
        target: String?,
        value: String?,
        reasonArgument: String?,
        reason: String,
        environment: [String: String],
        data: [String: JSONValue]
    ) -> JSONValue {
        let timestamp = ISO8601DateFormatter().string(from: Date())
        let auditID = "sysctl_audit_\(UUID().uuidString)"
        let auditEvent = data["receipt"]?.objectValue?["audit_event"]?.stringValue
            ?? "system.telemetry.control.\(controlID.replacingOccurrences(of: ".", with: "_"))"
        let requiredGrants = data["policy"]?.objectValue?["required_grants"]?.arrayValue?.compactMap(\.stringValue) ?? []
        let host = HostConfiguration.current(environment: environment)
        let event: [String: Any] = [
            "schema_version": 1,
            "id": auditID,
            "created_at": timestamp,
            "event": auditEvent,
            "outcome": "blocked",
            "control_id": controlID,
            "target": target ?? NSNull(),
            "value_redacted": value != nil,
            "reason": reason,
            "request_reason": reasonArgument ?? NSNull(),
            "broker_status": "external_pending",
            "will_execute": false,
            "external_pending": true,
            "required_grants": requiredGrants,
            "host_id": host.id,
        ]

        do {
            let stateDirectory = try StatePaths.ensureStateDirectory(environment: environment)
            let auditURL = stateDirectory.appendingPathComponent(MacControlPolicy.auditFilename)
            let data = try JSONSerialization.data(withJSONObject: event, options: [.sortedKeys])
            if !FileManager.default.fileExists(atPath: auditURL.path) {
                FileManager.default.createFile(atPath: auditURL.path, contents: nil)
            }
            let handle = try FileHandle(forWritingTo: auditURL)
            try handle.seekToEnd()
            try handle.write(contentsOf: data)
            try handle.write(contentsOf: Data([0x0A]))
            try handle.close()
            return .object([
                "status": .string("recorded"),
                "audit_id": .string(auditID),
                "storage_ref": .string("claw.host.state/\(MacControlPolicy.auditFilename)"),
                "event": .string(auditEvent),
                "outcome": .string("blocked"),
            ])
        } catch {
            return .object([
                "status": .string("unavailable"),
                "audit_id": .string(auditID),
                "event": .string(auditEvent),
                "outcome": .string("blocked"),
                "error": .string(error.localizedDescription),
            ])
        }
    }

    private static func hostIdentity(environment: [String: String]) -> MacControlWireHost {
        let host = HostConfiguration.current(environment: environment)
        return MacControlWireHost(
            hostId: host.id,
            bundleId: host.bundleIdentifier ?? host.id,
            signingIdentity: environment["CLAW_HOST_SIGNING_IDENTITY"],
            teamId: environment["CLAW_HOST_TEAM_ID"],
            appVariant: environment["CLAW_HOST_APP_VARIANT"],
            appVersion: environment["CLAW_HOST_APP_VERSION"]
        )
    }

    private static func bool(_ raw: String?) -> Bool? {
        guard let raw else { return nil }
        switch raw.lowercased() {
        case "1", "true", "yes", "y", "on":
            return true
        case "0", "false", "no", "n", "off":
            return false
        default:
            return nil
        }
    }

    private static func decodeJSONValue(_ data: Data) throws -> JSONValue {
        try JSONDecoder().decode(JSONValue.self, from: data)
    }
}
