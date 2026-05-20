import Foundation

public actor CommandService {
    private let environment: [String: String]
    private let registry: AdapterRegistry
    private let capabilityStore: CapabilityStore
    private let logStore: OperationLogStore
    private let daemonStatusStore: DaemonStatusStore
    private let permissionService: PermissionService

    public init(environment: [String: String], registry: AdapterRegistry) throws {
        self.environment = environment
        self.registry = registry
        self.capabilityStore = try CapabilityStore(environment: environment)
        self.logStore = try OperationLogStore(environment: environment)
        self.daemonStatusStore = try DaemonStatusStore(environment: environment)
        self.permissionService = PermissionService()
    }

    public func execute(_ request: CommandRequest) async -> CommandResponse {
        let started = Timestamp.now()
        let startedAt = Date()
        let sanitizedArguments = sanitize(arguments: request.arguments)
        let riskLevel = riskLevel(for: request)
        let validationMode = validationMode(for: request)

        do {
            let response = try await executeThrowing(request)
            try await logStore.append(
                OperationLog(
                    domain: request.domain,
                    client: request.clientContext,
                    command: "\(request.domain.rawValue) \(request.resource) \(request.action)",
                    arguments: sanitizedArguments,
                    adapter: response.meta.adapter,
                    source: response.meta.source,
                    riskLevel: riskLevel,
                    validationMode: validationMode,
                    result: response.ok ? "ok" : "error",
                    startedAt: started,
                    finishedAt: Timestamp.now()
                )
            )
            return response.with(durationSince: startedAt, validationMode: validationMode, riskLevel: riskLevel)
        } catch let error as CommanderError {
            let payload = error.payload
            let response = CommandResponse(
                ok: false,
                data: nil,
                error: payload,
                meta: CommandMeta(
                    adapter: request.domain.rawValue,
                    source: .filesystem,
                    riskLevel: riskLevel,
                    validationMode: validationMode,
                    durationMS: 0
                )
            ).with(durationSince: startedAt, validationMode: validationMode, riskLevel: riskLevel)
            try? await logStore.append(
                OperationLog(
                    domain: request.domain,
                    client: request.clientContext,
                    command: "\(request.domain.rawValue) \(request.resource) \(request.action)",
                    arguments: sanitizedArguments,
                    adapter: request.domain.rawValue,
                    source: .filesystem,
                    riskLevel: riskLevel,
                    validationMode: validationMode,
                    result: payload.code,
                    startedAt: started,
                    finishedAt: Timestamp.now()
                )
            )
            return response
        } catch {
            let payload = CommanderError.internalFailure(error.localizedDescription).payload
            let response = CommandResponse(
                ok: false,
                data: nil,
                error: payload,
                meta: CommandMeta(
                    adapter: request.domain.rawValue,
                    source: .filesystem,
                    riskLevel: riskLevel,
                    validationMode: validationMode,
                    durationMS: 0
                )
            ).with(durationSince: startedAt, validationMode: validationMode, riskLevel: riskLevel)
            try? await logStore.append(
                OperationLog(
                    domain: request.domain,
                    client: request.clientContext,
                    command: "\(request.domain.rawValue) \(request.resource) \(request.action)",
                    arguments: sanitizedArguments,
                    adapter: request.domain.rawValue,
                    source: .filesystem,
                    riskLevel: riskLevel,
                    validationMode: validationMode,
                    result: payload.code,
                    startedAt: started,
                    finishedAt: Timestamp.now()
                )
            )
            return response
        }
    }

    public func daemonHealth() throws -> DaemonHealth {
        (try daemonStatusStore.read()) ?? DaemonHealth(
            running: false,
            pid: nil,
            socketPath: (try? StatePaths.daemonSocketFile(environment: environment).path) ?? "",
            startedAt: nil
        )
    }

    public func markDaemon(running: Bool) throws {
        let socketPath = try StatePaths.daemonSocketFile(environment: environment).path
        if running {
            try daemonStatusStore.write(
                DaemonHealth(
                    running: true,
                    pid: getpid(),
                    socketPath: socketPath,
                    startedAt: Timestamp.now()
                )
            )
        } else {
            try daemonStatusStore.clear()
        }
    }

    private func executeThrowing(_ request: CommandRequest) async throws -> CommandResponse {
        if request.domain == .system {
            return try await handleSystemRequest(request)
        }

        guard try await capabilityStore.isAllowed(domain: request.domain, action: request.action) else {
            throw CommanderError.permissionDenied("Missing capability for \(request.domain.rawValue).\(request.action)")
        }

        guard let adapter = registry.adapter(for: request.domain) else {
            throw CommanderError.adapterUnavailable("No adapter registered for \(request.domain.rawValue)")
        }

        guard adapter.supports(resource: request.resource, action: request.action) else {
            throw CommanderError.invalidCommand("Unsupported command \(request.resource) \(request.action) for \(request.domain.rawValue)")
        }

        let data = try adapter.execute(request: request, environment: environment)
        let source = inferredSource(from: data, fallback: adapter.descriptor.sources.first ?? .filesystem)
        return CommandResponse(
            ok: true,
            data: data,
            error: nil,
            meta: CommandMeta(
                adapter: adapter.descriptor.name,
                source: source,
                riskLevel: riskLevel(for: request),
                validationMode: validationMode(for: request),
                durationMS: 0
            )
        )
    }

    private func handleSystemRequest(_ request: CommandRequest) async throws -> CommandResponse {
        switch (request.resource, request.action) {
        case ("capabilities", "list"):
            var capabilities = try await capabilityStore.list(resolvingWith: permissionService)
            if let rawDomain = request.arguments["domain"], let domain = Domain(rawValue: rawDomain) {
                capabilities = capabilities.filter { $0.domain == domain }
            }
            return success(
                data: .array(capabilities.map { capability in
                    .object([
                        "id": .string(capability.id),
                        "domain": .string(capability.domain.rawValue),
                        "actions": .array(capability.actions.map(JSONValue.string)),
                        "granted": .bool(capability.granted),
                        "risk_level": .string(capability.riskLevel),
                        "requires_os_permission": .bool(capability.requiresOSPermission),
                        "os_permission_state": .string(capability.osPermissionState),
                    ])
                }),
                adapter: "system",
                source: .filesystem
            )
        case ("capabilities", "grant"):
            guard let scope = request.arguments["scope"] else {
                throw CommanderError.invalidArguments("Missing --scope")
            }
            let capability = try await capabilityStore.grant(scope: scope)
            return success(
                data: .object([
                    "id": .string(capability.id),
                    "domain": .string(capability.domain.rawValue),
                    "granted": .bool(capability.granted),
                ]),
                adapter: "system",
                source: .filesystem
            )
        case ("capabilities", "revoke"):
            guard let scope = request.arguments["scope"] else {
                throw CommanderError.invalidArguments("Missing --scope")
            }
            let capability = try await capabilityStore.revoke(scope: scope)
            return success(
                data: .object([
                    "id": .string(capability.id),
                    "domain": .string(capability.domain.rawValue),
                    "granted": .bool(capability.granted),
                ]),
                adapter: "system",
                source: .filesystem
            )
        case ("adapters", "list"):
            let descriptors = registry.descriptorList()
            return success(
                data: .array(descriptors.map { descriptor in
                    .object([
                        "name": .string(descriptor.name),
                        "domain": .string(descriptor.domain.rawValue),
                        "version": .string(descriptor.version),
                        "supported_commands": .array(descriptor.supportedCommands.map(JSONValue.string)),
                        "sources": .array(descriptor.sources.map { .string($0.rawValue) }),
                        "risk_level": .string(descriptor.riskLevel),
                        "is_implemented": .bool(descriptor.isImplemented),
                        "requires_os_permission": .bool(descriptor.requiresOSPermission),
                        "coverage_level": .string(descriptor.coverageLevel),
                        "supports_search": .bool(descriptor.supportsSearch),
                        "supports_delete": .bool(descriptor.supportsDelete),
                    ])
                }),
                adapter: "system",
                source: .filesystem
            )
        case ("logs", "list"):
            let limit = request.arguments["limit"].flatMap(Int.init)
            var logs = try await logStore.list(limit: limit)
            if let rawDomain = request.arguments["domain"], let domain = Domain(rawValue: rawDomain) {
                logs = logs.filter { $0.domain == domain }
            }
            if let result = request.arguments["result"] {
                logs = logs.filter { $0.result == result }
            }
            return success(
                data: .array(logs.map { log in
                    .object([
                        "id": .string(log.id.uuidString),
                        "domain": .string(log.domain.rawValue),
                        "command": .string(log.command),
                        "arguments": .object(log.arguments.mapValues(JSONValue.string)),
                        "adapter": .string(log.adapter),
                        "source": .string(log.source.rawValue),
                        "risk_level": .string(log.riskLevel),
                        "validation_mode": .string(log.validationMode.rawValue),
                        "result": .string(log.result),
                        "started_at": .string(log.startedAt),
                        "finished_at": .string(log.finishedAt),
                        "client": .object([
                            "pid": .integer(Int(log.client.pid)),
                            "executable_path": .string(log.client.executablePath),
                            "tty": .bool(log.client.tty),
                        ]),
                    ])
                }),
                adapter: "system",
                source: .filesystem
            )
        case ("domains", "list"):
            return success(
                data: .array(
                    Domain.allCases
                        .filter { $0 != .system }
                        .map { domain in
                            .object([
                                "id": .string(domain.rawValue),
                                "name": .string(domain.rawValue),
                            ])
                        }
                ),
                adapter: "system",
                source: .filesystem
            )
        case ("commands", "list"):
            guard let rawDomain = request.arguments["domain"], let domain = Domain(rawValue: rawDomain) else {
                throw CommanderError.invalidArguments("Missing or invalid --domain")
            }
            guard let descriptor = registry.adapter(for: domain)?.descriptor else {
                throw CommanderError.notFound("No adapter for domain \(domain.rawValue)")
            }
            return success(
                data: .array(descriptor.supportedCommands.map { .string($0) }),
                adapter: "system",
                source: .filesystem
            )
        case ("telemetry", "snapshot"), ("snapshot", "get"):
            return success(
                data: SystemTelemetry.snapshot(),
                adapter: "system-telemetry",
                source: .framework
            )
        case ("metrics", "list"):
            return success(
                data: SystemTelemetry.metricsCatalog(),
                adapter: "system-telemetry",
                source: .framework
            )
        case ("widgets", "list"):
            return success(
                data: SystemTelemetry.defaultWidgets(),
                adapter: "system-telemetry",
                source: .framework
            )
        case ("providers", "list"):
            return success(
                data: SystemTelemetry.providersCatalog(),
                adapter: "system-telemetry",
                source: .framework
            )
        case ("providers", "plan"):
            let providerID = request.arguments["provider_id"] ?? request.arguments["provider-id"] ?? request.arguments["id"]
            let credentialRef = request.arguments["credential_ref"] ?? request.arguments["credential-ref"]
            let reason = request.arguments["reason"]
            let plan = SystemTelemetry.providerPlan(
                providerID: providerID,
                credentialRef: credentialRef,
                reason: reason
            )
            return success(
                data: appendSystemTelemetryProviderPlanAudit(
                    to: plan,
                    providerID: providerID,
                    credentialRef: credentialRef,
                    reason: reason
                ),
                adapter: "system-telemetry",
                source: .framework
            )
        case ("rules", "list"):
            return success(
                data: SystemTelemetry.rulesCatalog(),
                adapter: "system-telemetry",
                source: .framework
            )
        case ("controls", "list"):
            return success(
                data: SystemTelemetry.controlsCatalog(),
                adapter: "system-telemetry",
                source: .framework
            )
        case ("controls", "plan"):
            return success(
                data: SystemTelemetry.controlPlan(
                    controlID: request.arguments["control_id"] ?? request.arguments["control-id"] ?? request.arguments["id"],
                    target: request.arguments["target"],
                    value: request.arguments["value"],
                    reason: request.arguments["reason"]
                ),
                adapter: "system-telemetry",
                source: .framework
            )
        case ("history", "list"):
            return success(
                data: SystemTelemetry.history(
                    metricKey: request.arguments["metric_key"] ?? request.arguments["metric-key"],
                    range: request.arguments["range"]
                ),
                adapter: "system-telemetry",
                source: .framework
            )
        case ("daemon", "health"):
            let health = try daemonHealth()
            return success(
                data: .object([
                    "running": .bool(health.running),
                    "pid": health.pid.map { .integer(Int($0)) } ?? .null,
                    "socket_path": .string(health.socketPath),
                    "started_at": health.startedAt.map(JSONValue.string) ?? .null,
                    "runtime_transport": .string(health.runtimeTransport ?? runtimeTransport()),
                    "host_bundle_path": health.hostBundlePath.map(JSONValue.string) ?? .string(RuntimeInstaller.appBundlePath(environment: environment) ?? ""),
                    "host_app_running": .bool(health.hostAppRunning ?? RuntimeInstaller.hostProcessIsRunning(environment: environment)),
                ]),
                adapter: "daemon",
                source: .filesystem
            )
        case ("install", "status"):
            let status = try RuntimeInstaller.installStatus(environment: environment)
            return success(
                data: .object([
                    "cli_installed": .bool(status.cliInstalled),
                    "cli_path": .string(status.cliPath),
                    "launch_agent_installed": .bool(status.launchAgentInstalled),
                    "launch_agent_loaded": .bool(status.launchAgentLoaded),
                    "launch_agent_path": .string(status.launchAgentPath),
                    "launch_agent_label": .string(status.launchAgentLabel),
                    "runtime_transport": .string(status.runtimeTransport),
                    "host_app_running": .bool(status.hostAppRunning),
                    "host_bundle_path": .string(status.hostBundlePath),
                    "app_registered_at_login": .bool(status.appRegisteredAtLogin),
                    "socket_fallback_enabled": .bool(status.socketFallbackEnabled),
                ]),
                adapter: "system",
                source: .filesystem
            )
        case ("install", "cli"):
            let destinationPath = request.arguments["path"]
            let installedPath = try RuntimeInstaller.installCLI(
                sourceBinaryPath: request.clientContext.executablePath,
                destinationPath: destinationPath,
                environment: environment
            )
            return success(
                data: .object([
                    "installed": .bool(true),
                    "path": .string(installedPath),
                ]),
                adapter: "system",
                source: .filesystem
            )
        case ("doctor", "run"):
            let status = try RuntimeInstaller.installStatus(environment: environment)
            let health = try daemonHealth()
            let capabilities = try await capabilityStore.list(resolvingWith: permissionService)
            let descriptorList = registry.descriptorList()
            let adapterHealthStatus = try await adapterHealth()
            return success(
                data: .object([
                    "runtime_transport": .string(status.runtimeTransport),
                    "daemon_running": .bool(health.running),
                    "cli_installed": .bool(status.cliInstalled),
                    "launch_agent_installed": .bool(status.launchAgentInstalled),
                    "host_app_running": .bool(status.hostAppRunning),
                    "host_bundle_path": .string(status.hostBundlePath),
                    "app_registered_at_login": .bool(status.appRegisteredAtLogin),
                    "socket_fallback_enabled": .bool(status.socketFallbackEnabled),
                    "implemented_domains": .array(descriptorList.filter(\.isImplemented).map { .string($0.domain.rawValue) }),
                    "missing_os_permissions": .array(capabilities.filter { $0.requiresOSPermission && $0.osPermissionState != OSPermissionState.authorized.rawValue }.map { .string($0.id) }),
                    "capabilities": .object([
                        "granted": .integer(capabilities.filter(\.granted).count),
                        "total": .integer(capabilities.count),
                    ]),
                    "os_permissions": .object(Dictionary(uniqueKeysWithValues: Domain.allCases
                        .filter { $0 != .system }
                        .map { ($0.rawValue, .string(permissionService.status(for: $0).rawValue)) })),
                    "installed_apps": .object([
                        "mail": .bool(isInstalledApp("Mail")),
                        "things": .bool(isInstalledApp("Things3")),
                        "notes": .bool(isInstalledApp("Notes")),
                        "messages": .bool(isInstalledApp("Messages")),
                        "safari": .bool(isInstalledApp("Safari")),
                        "finder": .bool(isInstalledApp("Finder")),
                    ]),
                    "adapter_health": .object(adapterHealthStatus),
                    "host_validation_targets": .object(hostValidationTargets()),
                ]),
                adapter: "system",
                source: .filesystem
            )
        case ("permissions", "request"):
            guard let rawDomain = request.arguments["domain"], let domain = Domain(rawValue: rawDomain) else {
                throw CommanderError.invalidArguments("Missing or invalid --domain")
            }
            let state = try permissionService.requestPermission(for: domain)
            return success(
                data: .object([
                    "domain": .string(domain.rawValue),
                    "os_permission_state": .string(state.rawValue),
                ]),
                adapter: "system",
                source: .filesystem
            )
        case ("daemon", "stop"):
            return success(
                data: .object(["stopping": .bool(true)]),
                adapter: "daemon",
                source: .filesystem
            )
        default:
            throw CommanderError.invalidCommand("Unknown system command \(request.resource) \(request.action)")
        }
    }

    private func success(data: JSONValue, adapter: String, source: AdapterSource) -> CommandResponse {
        CommandResponse(
            ok: true,
            data: data,
            error: nil,
            meta: CommandMeta(
                adapter: adapter,
                source: source,
                riskLevel: "read",
                validationMode: ExecutionEnvironment.isTestMode(environment) ? .fixture : .hostReal,
                durationMS: 0
            )
        )
    }

    private func runtimeTransport() -> String {
        environment["CLAW_HOST_RUNTIME_TRANSPORT"] ?? RuntimeInstaller.socketRuntimeTransport
    }

    private func sanitize(arguments: [String: String]) -> [String: String] {
        arguments.reduce(into: [String: String]()) { partial, item in
            let key = item.key.lowercased()
            if key.hasPrefix("__") {
                return
            }
            let value = item.value
            if ["body", "text", "content", "notes"].contains(key) {
                partial[item.key] = "[redacted:\(value.count)]"
            } else if value.count > 300 {
                partial[item.key] = String(value.prefix(300)) + "..."
            } else {
                partial[item.key] = value
            }
        }
    }

    private func riskLevel(for request: CommandRequest) -> String {
        switch request.action {
        case "list", "get", "search", "read":
            return "read"
        case "delete", "quit", "close", "clear":
            return "destructive"
        case "send":
            return "send"
        case "post", "open", "focus", "create", "update", "set", "capture", "complete", "trash":
            return "write"
        default:
            return "read"
        }
    }

    private func validationMode(for request: CommandRequest) -> ValidationMode {
        if ExecutionEnvironment.isTestMode(environment) {
            return .fixture
        }
        if let rawValue = request.arguments["__validation_mode"], let mode = ValidationMode(rawValue: rawValue) {
            return mode
        }
        if environment["CLAW_HOST_SAFE"] == "1" || environment["CLAW_HOST_VALIDATION_MODE"] == ValidationMode.hostIsolated.rawValue {
            return .hostIsolated
        }
        if request.domain == .finder && request.arguments["path"] != nil {
            return .hostIsolated
        }
        if !Set(["calendar", "list", "folder", "mailbox", "project", "window"]).isDisjoint(with: request.arguments.keys) {
            return .hostIsolated
        }
        return .hostReal
    }

    private func inferredSource(from data: JSONValue, fallback: AdapterSource) -> AdapterSource {
        if let source = data.objectValue?["source"]?.stringValue.flatMap(AdapterSource.init(rawValue:)) {
            return source
        }
        if let source = data.arrayValue?.first?.objectValue?["source"]?.stringValue.flatMap(AdapterSource.init(rawValue:)) {
            return source
        }
        return fallback
    }

    private func isInstalledApp(_ appName: String) -> Bool {
        AutomationSupport.appExists(appName)
    }

    private func adapterHealth() async throws -> [String: JSONValue] {
        let recentLogs = try await logStore.list(limit: 50)
        let statuses: [(Domain, AdapterHealthStatus)] = [
            (.calendar, frameworkHealth(for: .calendar)),
            (.reminders, frameworkHealth(for: .reminders)),
            (.contacts, frameworkHealth(for: .contacts)),
            (.notifications, frameworkHealth(for: .notifications)),
            (.finder, applescriptHealth(appName: "Finder")),
            (.mail, applescriptHealth(
                appName: "Mail",
                script: """
                tell application "Mail"
                    return count of accounts
                end tell
                """
            )),
            (.things, applescriptHealth(appName: "Things3")),
            (.notes, applescriptHealth(appName: "Notes")),
            (.messages, applescriptHealth(appName: "Messages")),
            (.safari, applescriptHealth(appName: "Safari")),
        ]
        return statuses.reduce(into: [String: JSONValue]()) { partial, item in
            let resolved = overrideHealth(for: item.0, base: item.1, logs: recentLogs)
            partial[item.0.rawValue] = .object([
                "availability": .string(resolved.availability.rawValue),
                "reason": .string(resolved.reason.rawValue),
            ])
        }
    }

    private func frameworkHealth(for domain: Domain) -> AdapterHealthStatus {
        let state = permissionService.status(for: domain)
        guard state == .authorized else {
            return AdapterHealthStatus(availability: .unavailable, reason: .permissionMissing)
        }
        return AdapterHealthStatus(availability: .available, reason: .ok)
    }

    private func applescriptHealth(appName: String, script: String? = nil) -> AdapterHealthStatus {
        AutomationSupport.preflightAppleScript(appName: appName, script: script)
    }

    private func overrideHealth(for domain: Domain, base: AdapterHealthStatus, logs: [OperationLog]) -> AdapterHealthStatus {
        guard let recent = logs.first(where: { $0.domain == domain && ["adapter_unavailable", "permission_denied"].contains($0.result) }) else {
            return base
        }
        switch recent.result {
        case "adapter_unavailable":
            return AdapterHealthStatus(availability: .degraded, reason: .automationTimeout)
        case "permission_denied" where ![Domain.calendar, .reminders, .contacts].contains(domain):
            return AdapterHealthStatus(availability: .degraded, reason: .automationDenied)
        default:
            return base
        }
    }

    private func hostValidationTargets() -> [String: JSONValue] {
        [
            "calendar": .object([
                "selector": .string("--calendar"),
                "value": .string(environment["CLAW_HOST_TEST_CALENDAR"] ?? "Claw Host Tests"),
            ]),
            "reminders": .object([
                "selector": .string("--list"),
                "value": .string(environment["CLAW_HOST_TEST_REMINDERS_LIST"] ?? "Claw Host Tests"),
            ]),
            "notes": .object([
                "selector": .string("--folder"),
                "value": .string(environment["CLAW_HOST_TEST_NOTES_FOLDER"] ?? "Claw Host Tests"),
            ]),
            "mail": .object([
                "selector": .string("--mailbox"),
                "value": .string(environment["CLAW_HOST_TEST_MAILBOX"] ?? "Drafts"),
            ]),
            "things": .object([
                "selector": .string("--project"),
                "value": .string(environment["CLAW_HOST_TEST_THINGS_PROJECT"] ?? "Claw Host Tests"),
            ]),
            "safari": .object([
                "selector": .string("--window"),
                "value": .string(environment["CLAW_HOST_TEST_SAFARI_WINDOW"] ?? "1"),
            ]),
        ]
    }

    private func appendSystemTelemetryProviderPlanAudit(
        to plan: JSONValue,
        providerID: String?,
        credentialRef: String?,
        reason: String?
    ) -> JSONValue {
        guard var object = plan.objectValue,
              object["status"]?.stringValue == "planned",
              object["will_connect"]?.boolValue == false else {
            return plan
        }

        let audit = writeSystemTelemetryProviderPlanAudit(
            plan: object,
            providerID: providerID,
            credentialRef: credentialRef,
            reason: reason
        )
        object["audit"] = audit
        if var receipt = object["receipt"]?.objectValue {
            receipt["audit_status"] = audit.objectValue?["status"] ?? .string("unavailable")
            if let auditID = audit.objectValue?["audit_id"] {
                receipt["audit_id"] = auditID
            }
            object["receipt"] = .object(receipt)
        }
        return .object(object)
    }

    private func writeSystemTelemetryProviderPlanAudit(
        plan: [String: JSONValue],
        providerID: String?,
        credentialRef: String?,
        reason: String?
    ) -> JSONValue {
        let timestamp = ISO8601DateFormatter().string(from: Date())
        let auditID = "sysprovider_audit_\(UUID().uuidString)"
        let provider = plan["provider"]?.objectValue ?? [:]
        let policy = plan["policy"]?.objectValue ?? [:]
        let broker = plan["broker"]?.objectValue ?? [:]
        let receipt = plan["receipt"]?.objectValue ?? [:]
        let resolvedProviderID = providerID ?? provider["id"]?.stringValue ?? "unknown"
        let auditEvent = receipt["audit_event"]?.stringValue ?? "system.telemetry.provider.plan"
        let requiredGrants = policy["required_grants"]?.arrayValue?.compactMap(\.stringValue) ?? []
        let host = HostConfiguration.current(environment: environment)
        let event: [String: Any] = [
            "schema_version": 1,
            "id": auditID,
            "created_at": timestamp,
            "event": auditEvent,
            "outcome": "blocked",
            "provider_id": resolvedProviderID,
            "provider_kind": provider["kind"]?.stringValue ?? NSNull(),
            "provider_mode": provider["mode"]?.stringValue ?? NSNull(),
            "credential_ref_redacted": credentialRef?.isEmpty == false,
            "reason": reason ?? NSNull(),
            "broker_status": broker["status"]?.stringValue ?? "external_pending",
            "will_connect": false,
            "external_pending": true,
            "required_grants": requiredGrants,
            "network_access": policy["network_access"]?.stringValue ?? NSNull(),
            "privacy_tier": policy["privacy_tier"]?.stringValue ?? NSNull(),
            "precise_location_redacted": policy["precise_location_redacted"]?.boolValue ?? true,
            "host_id": host.id,
        ]

        do {
            let stateDirectory = try StatePaths.ensureStateDirectory(environment: environment)
            let auditURL = stateDirectory.appendingPathComponent("system-telemetry-provider-audit.jsonl")
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
                "storage_ref": .string("claw.host.state/system-telemetry-provider-audit.jsonl"),
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
}

private extension CommandResponse {
    func with(durationSince startedAt: Date, validationMode: ValidationMode, riskLevel: String) -> CommandResponse {
        var copy = self
        copy.meta.durationMS = Int(Date().timeIntervalSince(startedAt) * 1_000)
        copy.meta.validationMode = validationMode
        copy.meta.riskLevel = riskLevel
        return copy
    }
}
