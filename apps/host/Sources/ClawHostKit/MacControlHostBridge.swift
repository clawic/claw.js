import Foundation
import CommanderCore

@MainActor
public enum MacControlHostBridge {
    public typealias PermissionRequester = (MacControlPermissionID) async -> Bool

    public static func responseAsync(
        resource: String,
        action: String,
        arguments: [String: String],
        environment: [String: String] = ProcessInfo.processInfo.environment,
        runner: MacControlCommandRunning = MacControlProcessRunner(),
        permissionRequester: @escaping PermissionRequester = { permission in
            await MacControlPermissionBroker.request(permission)
        }
    ) async throws -> CommandResponse {
        guard resource == "mac" else {
            throw CommanderError.invalidCommand("Mac Control host bridge only handles system mac actions.")
        }

        if action == "permissions" {
            return try await permissionsResponse(
                arguments: arguments,
                environment: environment,
                permissionRequester: permissionRequester
            )
        }

        return try response(
            resource: resource,
            action: action,
            arguments: arguments,
            environment: environment,
            runner: runner
        )
    }

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
            return try permissionsResponse(arguments: arguments, environment: environment)
        case "policy":
            return try policyResponse(arguments: arguments, environment: environment)
        case "audit":
            return try auditResponse(environment: environment)
        case "revert":
            return try revertResponse(arguments: arguments, environment: environment, runner: runner)
        default:
            throw CommanderError.invalidCommand("Unknown Mac Control host bridge action \(action).")
        }
    }

    private static func planResponse(arguments: [String: String], environment: [String: String]) throws -> CommandResponse {
        let requestBytes = try requestBytes(from: arguments, environment: environment, defaultDryRun: true)
        let data = try MacControlWire.planJSON(for: requestBytes)
        let json = try decodeJSONValue(data)
        let request = try MacControlWire.decodeRequest(requestBytes)
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
        let requestBytes = try requestBytes(from: arguments, environment: environment, defaultDryRun: false)
        let auditURL = try StatePaths.ensureStateDirectory(environment: environment)
            .appendingPathComponent(MacControlPolicy.auditFilename)
        let stateDirectory = auditURL.deletingLastPathComponent()
        let policyURL = MacControlPolicyGrantStore.fileURL(stateDirectory: stateDirectory)
        let continuityURL = MacControlContinuityStore.fileURL(stateDirectory: stateDirectory)
        let data = try MacControlWire.evaluateJSON(
            for: requestBytes,
            auditURL: auditURL,
            policyURL: policyURL,
            continuityURL: continuityURL,
            runner: runner
        )
        let json = try decodeJSONValue(data)
        let request = try MacControlWire.decodeRequest(requestBytes)
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

    private static func permissionsResponse(arguments: [String: String], environment: [String: String]) throws -> CommandResponse {
        let command = arguments["command"] ?? arguments["permission-command"] ?? arguments["permission_command"] ?? "list"
        guard command == "list" || command == "status" else {
            throw CommanderError.invalidArguments("Mac Control permission \(command) requires the async signed-host path.")
        }
        return try permissionListResponse(environment: environment)
    }

    private static func permissionsResponse(
        arguments: [String: String],
        environment: [String: String],
        permissionRequester: PermissionRequester
    ) async throws -> CommandResponse {
        let command = arguments["command"] ?? arguments["permission-command"] ?? arguments["permission_command"] ?? "list"
        switch command {
        case "list", "status":
            return try permissionListResponse(environment: environment)
        case "request":
            return try await permissionRequestResponse(
                arguments: arguments,
                environment: environment,
                permissionRequester: permissionRequester
            )
        default:
            throw CommanderError.invalidCommand("Unknown Mac Control permission command \(command).")
        }
    }

    private static func permissionListResponse(environment: [String: String]) throws -> CommandResponse {
        let stateDirectory = try StatePaths.ensureStateDirectory(environment: environment)
        let lifecycleURL = MacControlPermissionLifecycleStore.fileURL(stateDirectory: stateDirectory)
        let permissions = MacControlPermissionID.allCases.map { permission in
            let status = MacControlPermissionBroker.status(for: permission)
            let lifecycle = try? MacControlPermissionLifecycleStore.observeStatus(
                permission: permission,
                status: status,
                stateURL: lifecycleURL
            )
            let firstUsedAt: JSONValue = lifecycle.flatMap(\.firstUsedAt).map { .string($0) } ?? .null
            let lastCheckedAt: JSONValue = lifecycle.map { .string($0.lastCheckedAt) } ?? .null
            let lastRequestedAt: JSONValue = lifecycle.flatMap(\.lastRequestedAt).map { .string($0) } ?? .null
            let lastRequestResult: JSONValue = lifecycle.flatMap(\.lastRequestResult).map { .string($0.rawValue) } ?? .null
            let revocationDetectedAt: JSONValue = lifecycle.flatMap(\.revocationDetectedAt).map { .string($0) } ?? .null
            let payload: [String: JSONValue] = [
                "id": .string(permission.rawValue),
                "status": .string(status.rawValue),
                "requestedBefore": .bool(lifecycle?.requestedBefore ?? false),
                "canRequest": .bool((lifecycle?.canRequest) ?? (status == .notDetermined)),
                "requiresRestart": .bool(lifecycle?.requiresRestart ?? false),
                "source": .string(lifecycle?.source ?? "signed-host-mac-permission-broker"),
                "firstUsedAt": firstUsedAt,
                "lastCheckedAt": lastCheckedAt,
                "lastRequestedAt": lastRequestedAt,
                "lastRequestResult": lastRequestResult,
                "revocationDetectedAt": revocationDetectedAt,
            ]
            return JSONValue.object(payload)
        }
        return commandResponse(
            requestId: "macperm_\(UUID().uuidString)",
            ok: true,
            data: .object([
                "schemaVersion": .integer(MacControlWire.schemaVersion),
                "lifecyclePath": .string(lifecycleURL.path),
                "permissions": .array(permissions),
            ]),
            adapter: "mac-permission-broker",
            environment: environment,
            capabilityId: "mac.permissions.status",
            riskLevel: "read"
        )
    }

    private static func permissionRequestResponse(
        arguments: [String: String],
        environment: [String: String],
        permissionRequester: PermissionRequester
    ) async throws -> CommandResponse {
        guard let rawPermission = arguments["permission-id"] ?? arguments["permission_id"] ?? arguments["id"] ?? arguments["permission"],
              let permission = MacControlPermissionID(rawValue: rawPermission) else {
            throw CommanderError.invalidArguments("Mac Control permission request requires --permission-id.")
        }

        let stateDirectory = try StatePaths.ensureStateDirectory(environment: environment)
        let lifecycleURL = MacControlPermissionLifecycleStore.fileURL(stateDirectory: stateDirectory)
        let before = MacControlPermissionBroker.status(for: permission)
        let observed = try MacControlPermissionLifecycleStore.observeStatus(
            permission: permission,
            status: before,
            stateURL: lifecycleURL
        )
        let confirm = boolArgument(arguments["confirm"] ?? arguments["approved"]) ?? false

        guard confirm else {
            return commandResponse(
                requestId: "macpermreq_\(UUID().uuidString)",
                ok: true,
                data: .object([
                    "schemaVersion": .integer(MacControlWire.schemaVersion),
                    "permissionId": .string(permission.rawValue),
                    "lifecyclePath": .string(lifecycleURL.path),
                    "status": .string("confirmation_required"),
                    "nativePrompt": .string("just_in_time_only"),
                    "surprisePrompt": .bool(false),
                    "beforeStatus": .string(before.rawValue),
                    "requestedBefore": .bool(observed.requestedBefore),
                    "canRequest": .bool(observed.canRequest),
                    "requiresRestart": .bool(observed.requiresRestart),
                    "reason": .string("Permission prompts are broker-owned and require explicit signed-host confirmation."),
                ]),
                adapter: "mac-permission-broker",
                environment: environment,
                capabilityId: "mac.privacy.permission.request",
                riskLevel: "medium"
            )
        }

        let granted = await permissionRequester(permission)
        let result = granted ? MacControlPermissionStatus.granted : MacControlPermissionBroker.status(for: permission)
        let lifecycle = try MacControlPermissionLifecycleStore.recordRequest(
            permission: permission,
            result: result,
            stateURL: lifecycleURL
        )
        return commandResponse(
            requestId: "macpermreq_\(UUID().uuidString)",
            ok: true,
            data: .object([
                "schemaVersion": .integer(MacControlWire.schemaVersion),
                "permissionId": .string(permission.rawValue),
                "lifecyclePath": .string(lifecycleURL.path),
                "status": .string(result.rawValue),
                "requestedBefore": .bool(lifecycle.requestedBefore),
                "lastRequestedAt": lifecycle.lastRequestedAt.map(JSONValue.string) ?? .null,
                "lastRequestResult": lifecycle.lastRequestResult.map { .string($0.rawValue) } ?? .null,
                "requiresRestart": .bool(lifecycle.requiresRestart),
                "nativePrompt": .string("just_in_time_only"),
                "surprisePrompt": .bool(false),
            ]),
            adapter: "mac-permission-broker",
            environment: environment,
            capabilityId: "mac.privacy.permission.request",
            riskLevel: "medium"
        )
    }

    private static func policyResponse(arguments: [String: String], environment: [String: String]) throws -> CommandResponse {
        let stateDirectory = try StatePaths.ensureStateDirectory(environment: environment)
        let policyURL = MacControlPolicyGrantStore.fileURL(stateDirectory: stateDirectory)
        let command = arguments["command"] ?? arguments["policy-command"] ?? arguments["policy_command"] ?? "list"

        switch command {
        case "list":
            let grants = try MacControlPolicyGrantStore.list(stateURL: policyURL)
            return commandResponse(
                requestId: "macpolicy_\(UUID().uuidString)",
                ok: true,
                data: .object([
                    "schemaVersion": .integer(MacControlWire.schemaVersion),
                    "policyPath": .string(policyURL.path),
                    "grants": try decodeGrantList(grants),
                ]),
                adapter: "mac-control-policy",
                environment: environment,
                capabilityId: "mac.policy.list",
                riskLevel: "read"
            )
        case "upsert", "grant":
            let grant = try policyGrant(from: arguments)
            let saved = try MacControlPolicyGrantStore.upsert(grant, stateURL: policyURL)
            return commandResponse(
                requestId: "macpolicy_\(UUID().uuidString)",
                ok: true,
                data: .object([
                    "schemaVersion": .integer(MacControlWire.schemaVersion),
                    "policyPath": .string(policyURL.path),
                    "grant": try decodeGrant(saved),
                ]),
                adapter: "mac-control-policy",
                environment: environment,
                capabilityId: "mac.policy.upsert",
                riskLevel: "medium"
            )
        case "revoke":
            guard let id = arguments["id"] ?? arguments["grant-id"] ?? arguments["grant_id"], !id.isEmpty else {
                throw CommanderError.invalidArguments("Mac Control policy revoke requires --id.")
            }
            let revoked = try MacControlPolicyGrantStore.revoke(id: id, stateURL: policyURL)
            return commandResponse(
                requestId: "macpolicy_\(UUID().uuidString)",
                ok: revoked != nil,
                data: .object([
                    "schemaVersion": .integer(MacControlWire.schemaVersion),
                    "policyPath": .string(policyURL.path),
                    "grant": try revoked.map(decodeGrant) ?? .null,
                ]),
                adapter: "mac-control-policy",
                environment: environment,
                capabilityId: "mac.policy.revoke",
                riskLevel: "medium"
            )
        default:
            throw CommanderError.invalidCommand("Unknown Mac Control policy command \(command).")
        }
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
                "storageRef": .string("claw.host.state/\(MacControlPolicy.auditFilename)"),
                "events": .array(events),
            ]),
            adapter: "mac-control-audit",
            environment: environment,
            capabilityId: "mac.audit.read",
            riskLevel: "read"
        )
    }

    private static func revertResponse(
        arguments: [String: String],
        environment: [String: String],
        runner: MacControlCommandRunning
    ) throws -> CommandResponse {
        guard let receiptId = arguments["receipt-id"] ?? arguments["receipt_id"], !receiptId.isEmpty else {
            throw CommanderError.invalidArguments("Mac Control revert requires --receipt-id.")
        }
        let stateDirectory = try StatePaths.ensureStateDirectory(environment: environment)
        let continuityURL = MacControlContinuityStore.fileURL(stateDirectory: stateDirectory)
        guard let record = try MacControlContinuityStore.record(receiptId: receiptId, stateURL: continuityURL) else {
            return commandResponse(
                requestId: "macrev_\(UUID().uuidString)",
                ok: false,
                data: .object([
                    "schemaVersion": .integer(MacControlWire.schemaVersion),
                    "receiptId": .string(receiptId),
                    "continuityPath": .string(continuityURL.path),
                    "status": .string("missing_snapshot"),
                    "reason": .string("No continuity snapshot is available for this receipt."),
                ]),
                error: CommanderError.notFound("Mac Control continuity snapshot was not found for \(receiptId).").payload,
                adapter: "mac-control-revert",
                environment: environment,
                capabilityId: "mac.revert",
                riskLevel: "high"
            )
        }

        let confirm = boolArgument(arguments["confirm"] ?? arguments["approved"]) ?? false
        guard confirm else {
            return commandResponse(
                requestId: "macrev_\(UUID().uuidString)",
                ok: true,
                data: .object([
                    "schemaVersion": .integer(MacControlWire.schemaVersion),
                    "receiptId": .string(receiptId),
                    "continuityPath": .string(continuityURL.path),
                    "status": .string("confirmation_required"),
                    "snapshotRef": .string(record.snapshot.ref),
                    "capabilityId": .string(record.capabilityId),
                    "revertSteps": try decodeRevertSteps(record.revertSteps),
                    "reason": .string("Mac Control revert is broker-owned and requires explicit confirmation before execution."),
                ]),
                adapter: "mac-control-revert",
                environment: environment,
                capabilityId: "mac.revert",
                riskLevel: "high"
            )
        }

        do {
            var outputs: [JSONValue] = []
            for step in record.revertSteps {
                switch step.kind {
                case .process:
                    let output = try runner.runProcess(step.executable, arguments: step.arguments)
                    outputs.append(.string(output))
                }
            }
            let updated = try MacControlContinuityStore.markReverted(receiptId: receiptId, stateURL: continuityURL) ?? record
            return commandResponse(
                requestId: "macrev_\(UUID().uuidString)",
                ok: true,
                data: .object([
                    "schemaVersion": .integer(MacControlWire.schemaVersion),
                    "receiptId": .string(receiptId),
                    "continuityPath": .string(continuityURL.path),
                    "status": .string(updated.status.rawValue),
                    "snapshotRef": .string(record.snapshot.ref),
                    "outputs": .array(outputs),
                ]),
                adapter: "mac-control-revert",
                environment: environment,
                capabilityId: "mac.revert",
                riskLevel: "high"
            )
        } catch {
            _ = try? MacControlContinuityStore.markFailed(receiptId: receiptId, error: error.localizedDescription, stateURL: continuityURL)
            return commandResponse(
                requestId: "macrev_\(UUID().uuidString)",
                ok: false,
                data: .object([
                    "schemaVersion": .integer(MacControlWire.schemaVersion),
                    "receiptId": .string(receiptId),
                    "continuityPath": .string(continuityURL.path),
                    "status": .string("failed"),
                    "reason": .string(error.localizedDescription),
                ]),
                error: CommanderError.internalFailure("Mac Control revert failed: \(error.localizedDescription)").payload,
                adapter: "mac-control-revert",
                environment: environment,
                capabilityId: "mac.revert",
                riskLevel: "high"
            )
        }
    }

    private static func requestBytes(
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

    private static func policyGrant(from arguments: [String: String]) throws -> MacControlPolicyGrant {
        guard let subjectKindRaw = arguments["subject-kind"] ?? arguments["subject_kind"],
              let subjectKind = MacControlPolicySubjectKind(rawValue: subjectKindRaw) else {
            throw CommanderError.invalidArguments("Mac Control policy grant requires --subject-kind.")
        }
        guard let subjectId = arguments["subject-id"] ?? arguments["subject_id"], !subjectId.isEmpty else {
            throw CommanderError.invalidArguments("Mac Control policy grant requires --subject-id.")
        }

        let effect = (arguments["effect"].flatMap(MacControlPolicyGrantEffect.init(rawValue:))) ?? .allow
        let riskCeiling = (arguments["risk-ceiling"] ?? arguments["risk_ceiling"])
            .flatMap(MacControlActionPlan.Risk.init(rawValue:)) ?? .read
        let permissionIds = try csv(arguments["permission-ids"] ?? arguments["permission_ids"]).map { raw in
            guard let permission = MacControlPermissionID(rawValue: raw) else {
                throw CommanderError.invalidArguments("Unknown Mac permission id \(raw).")
            }
            return permission
        }
        let durationKind = (arguments["duration-kind"] ?? arguments["duration_kind"])
            .flatMap(MacControlPolicyGrantDurationKind.init(rawValue:)) ?? .task
        let status = arguments["status"].flatMap(MacControlPolicyGrantStatus.init(rawValue:)) ?? .active
        let createdByKind = arguments["created-by-kind"] ?? arguments["created_by_kind"] ?? MacControlOrigin.ownerCLI.rawValue
        let createdById = arguments["created-by-id"] ?? arguments["created_by_id"] ?? "claw-host"
        let createdByRole = arguments["created-by-role"] ?? arguments["created_by_role"] ?? "owner"

        return MacControlPolicyGrant(
            id: arguments["id"] ?? arguments["grant-id"] ?? arguments["grant_id"] ?? "macgrant_\(UUID().uuidString)",
            subject: MacControlPolicySubject(kind: subjectKind, id: subjectId),
            effect: effect,
            capabilityIds: csv(arguments["capability-ids"] ?? arguments["capability_ids"]),
            permissionIds: permissionIds,
            riskCeiling: riskCeiling,
            duration: MacControlPolicyGrantDuration(
                kind: durationKind,
                ttlSeconds: (arguments["ttl-seconds"] ?? arguments["ttl_seconds"]).flatMap(Int.init)
            ),
            createdBy: MacControlWireActor(kind: createdByKind, id: createdById, role: createdByRole),
            createdAt: arguments["created-at"] ?? arguments["created_at"] ?? ISO8601DateFormatter().string(from: Date()),
            expiresAt: arguments["expires-at"] ?? arguments["expires_at"],
            status: status
        )
    }

    private static func decodeGrantList(_ grants: [MacControlPolicyGrant]) throws -> JSONValue {
        try decodeJSONValue(JSONEncoder().encode(grants))
    }

    private static func decodeGrant(_ grant: MacControlPolicyGrant) throws -> JSONValue {
        try decodeJSONValue(JSONEncoder().encode(grant))
    }

    private static func decodeRevertSteps(_ steps: [MacControlContinuityRevertStep]) throws -> JSONValue {
        try decodeJSONValue(JSONEncoder().encode(steps))
    }

    private static func csv(_ raw: String?) -> [String] {
        raw?
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty } ?? []
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
