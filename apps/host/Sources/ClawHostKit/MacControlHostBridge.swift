import Foundation
import CommanderCore

@MainActor
public enum MacControlHostBridge {
    public static func response(
        resource: String,
        action: String,
        arguments: [String: String],
        environment: [String: String] = ProcessInfo.processInfo.environment,
        runner: MacControlCommandRunning = MacControlProcessRunner()
    ) throws -> CommandResponse {
        guard resource == "mac" else {
            throw CommanderError.invalidCommand("Mac Control host bridge only handles system mac actions.")
        }

        switch action {
        case "plan":
            return try planResponse(arguments: arguments, environment: environment)
        case "execute":
            return try executeResponse(arguments: arguments, environment: environment, runner: runner)
        case "permissions":
            return permissionsResponse(environment: environment)
        case "audit":
            return try auditResponse(environment: environment)
        case "revert":
            return try revertResponse(arguments: arguments, environment: environment)
        default:
            throw CommanderError.invalidCommand("Unknown Mac Control host bridge action \(action).")
        }
    }

    private static func planResponse(arguments: [String: String], environment: [String: String]) throws -> CommandResponse {
        let requestData = try requestData(from: arguments, environment: environment, defaultDryRun: true)
        let data = try MacControlWire.planJSON(for: requestData)
        let json = try decodeJSONValue(data)
        let request = try MacControlWire.decodeRequest(requestData)
        let risk = json.objectValue?["risk"]?.stringValue ?? "read"
        return commandResponse(
            requestId: request.requestId,
            ok: true,
            data: json,
            adapter: "mac-control",
            environment: environment,
            capabilityId: request.capabilityId,
            riskLevel: risk
        )
    }

    private static func executeResponse(
        arguments: [String: String],
        environment: [String: String],
        runner: MacControlCommandRunning
    ) throws -> CommandResponse {
        let requestData = try requestData(from: arguments, environment: environment, defaultDryRun: false)
        let auditURL = try StatePaths.ensureStateDirectory(environment: environment)
            .appendingPathComponent(MacControlPolicy.auditFilename)
        let data = try MacControlWire.evaluateJSON(for: requestData, auditURL: auditURL, runner: runner)
        let json = try decodeJSONValue(data)
        let request = try MacControlWire.decodeRequest(requestData)
        let risk = json.objectValue?["receipt"]?.objectValue?["risk"]?.stringValue ?? "high"
        return commandResponse(
            requestId: request.requestId,
            ok: true,
            data: json,
            adapter: "mac-control",
            environment: environment,
            capabilityId: request.capabilityId,
            riskLevel: risk
        )
    }

    private static func permissionsResponse(environment: [String: String]) -> CommandResponse {
        let permissions = MacControlPermissionID.allCases.map { permission in
            JSONValue.object([
                "id": .string(permission.rawValue),
                "status": .string(MacControlPermissionBroker.status(for: permission).rawValue),
            ])
        }
        return commandResponse(
            requestId: "macperm_\(UUID().uuidString)",
            ok: true,
            data: .object([
                "schemaVersion": .integer(MacControlWire.schemaVersion),
                "permissions": .array(permissions),
            ]),
            adapter: "mac-permission-broker",
            environment: environment,
            capabilityId: "mac.permissions.status",
            riskLevel: "read"
        )
    }

    private static func auditResponse(environment: [String: String]) throws -> CommandResponse {
        let auditURL = try StatePaths.ensureStateDirectory(environment: environment)
            .appendingPathComponent(MacControlPolicy.auditFilename)
        let events: [JSONValue]
        if FileManager.default.fileExists(atPath: auditURL.path) {
            let lines = try String(contentsOf: auditURL, encoding: .utf8)
                .split(separator: "\n", omittingEmptySubsequences: true)
            events = try lines.map { line in
                try decodeJSONValue(Data(line.utf8))
            }
        } else {
            events = []
        }

        return commandResponse(
            requestId: "macaudit_\(UUID().uuidString)",
            ok: true,
            data: .object([
                "schemaVersion": .integer(MacControlWire.schemaVersion),
                "auditPath": .string(auditURL.path),
                "events": .array(events),
            ]),
            adapter: "mac-control-audit",
            environment: environment,
            capabilityId: "mac.audit.read",
            riskLevel: "read"
        )
    }

    private static func revertResponse(arguments: [String: String], environment: [String: String]) throws -> CommandResponse {
        guard let receiptId = arguments["receipt-id"] ?? arguments["receipt_id"], !receiptId.isEmpty else {
            throw CommanderError.invalidArguments("Mac Control revert requires --receipt-id.")
        }

        return commandResponse(
            requestId: "macrev_\(UUID().uuidString)",
            ok: false,
            data: .object([
                "schemaVersion": .integer(MacControlWire.schemaVersion),
                "receiptId": .string(receiptId),
                "status": .string("plan_required"),
                "reason": .string("Mac Control revert is broker-owned; submit a revert plan before execution."),
            ]),
            error: CommanderError.permissionDenied("Mac Control revert requires an explicit broker revert plan.").payload,
            adapter: "mac-control",
            environment: environment,
            capabilityId: "mac.revert",
            riskLevel: "high"
        )
    }

    private static func requestData(
        from arguments: [String: String],
        environment: [String: String],
        defaultDryRun: Bool
    ) throws -> Data {
        if let raw = arguments["request-json"] ?? arguments["request_json"] {
            return Data(raw.utf8)
        }

        guard let capabilityId = arguments["capability-id"] ?? arguments["capability_id"], !capabilityId.isEmpty else {
            throw CommanderError.invalidArguments("Mac Control plan/execute requires --request-json or --capability-id.")
        }

        let host = HostConfiguration.current(environment: environment)
        let actorKind = arguments["actor-kind"] ?? arguments["actor_kind"] ?? MacControlOrigin.ownerCLI.rawValue
        let actorId = arguments["actor-id"] ?? arguments["actor_id"] ?? "claw-host"
        let role = arguments["role"] ?? "owner"
        let dryRun = boolArgument(arguments["dry-run"] ?? arguments["dry_run"]) ?? defaultDryRun
        let approved = boolArgument(arguments["approved"] ?? arguments["confirm"]) ?? false
        let request = MacControlWireRequest(
            requestId: arguments["request-id"] ?? arguments["request_id"] ?? "macreq_host_\(UUID().uuidString)",
            capabilityId: capabilityId,
            actor: MacControlWireActor(kind: actorKind, id: actorId, role: role, assignmentId: arguments["assignment-id"] ?? arguments["assignment_id"], runId: arguments["run-id"] ?? arguments["run_id"]),
            host: MacControlWireHost(
                hostId: arguments["host-id"] ?? arguments["host_id"] ?? host.id,
                bundleId: arguments["bundle-id"] ?? arguments["bundle_id"] ?? host.bundleIdentifier ?? Bundle.main.bundleIdentifier ?? host.id,
                signingIdentity: arguments["signing-identity"] ?? arguments["signing_identity"],
                teamId: arguments["team-id"] ?? arguments["team_id"],
                appVariant: arguments["app-variant"] ?? arguments["app_variant"],
                appVersion: arguments["app-version"] ?? arguments["app_version"]
            ),
            arguments: macArguments(from: arguments),
            dryRun: dryRun,
            reason: arguments["reason"],
            approved: approved
        )
        return try JSONEncoder().encode(request)
    }

    private static func macArguments(from arguments: [String: String]) -> [String: JSONValue] {
        var values: [String: JSONValue] = [:]
        let reserved = Set([
            "request-json", "request_json",
            "capability-id", "capability_id",
            "request-id", "request_id",
            "actor-kind", "actor_kind",
            "actor-id", "actor_id",
            "assignment-id", "assignment_id",
            "run-id", "run_id",
            "host-id", "host_id",
            "bundle-id", "bundle_id",
            "signing-identity", "signing_identity",
            "team-id", "team_id",
            "app-variant", "app_variant",
            "app-version", "app_version",
            "role", "reason", "dry-run", "dry_run", "approved", "confirm", "json",
        ])

        for (key, value) in arguments where !reserved.contains(key) {
            if key.hasPrefix("arg.") {
                values[String(key.dropFirst(4))] = .string(value)
            } else if key.hasPrefix("argument.") {
                values[String(key.dropFirst(9))] = .string(value)
            } else {
                values[key] = .string(value)
            }
        }
        return values
    }

    private static func boolArgument(_ raw: String?) -> Bool? {
        guard let raw else { return nil }
        switch raw.lowercased() {
        case "1", "true", "yes", "y":
            return true
        case "0", "false", "no", "n":
            return false
        default:
            return nil
        }
    }

    private static func decodeJSONValue(_ data: Data) throws -> JSONValue {
        try JSONDecoder().decode(JSONValue.self, from: data)
    }

    private static func commandResponse(
        requestId: String,
        ok: Bool,
        data: JSONValue?,
        error: CommandErrorPayload? = nil,
        adapter: String,
        environment: [String: String],
        capabilityId: String,
        riskLevel: String
    ) -> CommandResponse {
        let host = HostConfiguration.current(environment: environment)
        return CommandResponse(
            ok: ok,
            data: data,
            error: error,
            meta: .init(
                adapter: adapter,
                source: .localCLI,
                hostId: host.id,
                capabilityId: capabilityId,
                riskLevel: riskLevel,
                validationMode: .hostReal,
                durationMS: 0
            ),
            requestId: requestId
        )
    }
}
