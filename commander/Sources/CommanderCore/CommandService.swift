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
                    "legacy_socket_fallback_enabled": .bool(status.legacySocketFallbackEnabled),
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
                    "legacy_socket_fallback_enabled": .bool(status.legacySocketFallbackEnabled),
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
        environment["COMMANDER_RUNTIME_TRANSPORT"] ?? RuntimeInstaller.legacySocketRuntimeTransport
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
        if environment["COMMANDER_HOST_SAFE"] == "1" || environment["COMMANDER_HOST_VALIDATION_MODE"] == ValidationMode.hostIsolated.rawValue {
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
                "value": .string(environment["COMMANDER_HOST_TEST_CALENDAR"] ?? "Commander Host Tests"),
            ]),
            "reminders": .object([
                "selector": .string("--list"),
                "value": .string(environment["COMMANDER_HOST_TEST_REMINDERS_LIST"] ?? "Commander Host Tests"),
            ]),
            "notes": .object([
                "selector": .string("--folder"),
                "value": .string(environment["COMMANDER_HOST_TEST_NOTES_FOLDER"] ?? "Commander Host Tests"),
            ]),
            "mail": .object([
                "selector": .string("--mailbox"),
                "value": .string(environment["COMMANDER_HOST_TEST_MAILBOX"] ?? "Drafts"),
            ]),
            "things": .object([
                "selector": .string("--project"),
                "value": .string(environment["COMMANDER_HOST_TEST_THINGS_PROJECT"] ?? "Commander Host Tests"),
            ]),
            "safari": .object([
                "selector": .string("--window"),
                "value": .string(environment["COMMANDER_HOST_TEST_SAFARI_WINDOW"] ?? "1"),
            ]),
        ]
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
