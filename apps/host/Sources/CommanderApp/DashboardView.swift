import SwiftUI
import ClawHostAdapters
import ClawHostKit

@MainActor
final class DashboardModel: ObservableObject {
    @Published var health: DaemonHealth?
    @Published var installStatus: InstallStatus?
    @Published var capabilities: [Capability] = []
    @Published var adapters: [AdapterDescriptor] = []
    @Published var adapterHealth: [String: AdapterHealthStatus] = [:]
    @Published var logs: [OperationLog] = []
    @Published var installPath = (try? StatePaths.cliInstallPath().path) ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".local/bin/claw").path
    @Published var message: String?

    private let environment = ProcessInfo.processInfo.environment
    private var refreshTask: Task<Void, Never>?
    private var lastDoctorRefresh = Date.distantPast

    init() {
        refreshTask = Task {
            await refresh()
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(2))
                await refresh()
            }
        }
    }

    deinit {
        refreshTask?.cancel()
    }

    func refresh() async {
        do {
            let client = try DaemonClient(environment: environment)
            health = try await fetchHealth(with: client)
            installStatus = try await fetchInstallStatus(with: client)
            capabilities = try await fetchCapabilities(with: client)
            adapters = try await fetchAdapters(with: client)
            if Date().timeIntervalSince(lastDoctorRefresh) > 8 || adapterHealth.isEmpty {
                adapterHealth = try await fetchAdapterHealth(with: client)
                lastDoctorRefresh = Date()
            }
            logs = try await fetchLogs(with: client)
        } catch {
            health = (try? DaemonStatusStore(environment: environment).read()) ?? DaemonHealth(
                running: false,
                pid: nil,
                socketPath: (try? StatePaths.daemonSocketFile(environment: environment).path) ?? "",
                startedAt: nil
            )
            installStatus = try? RuntimeInstaller.installStatus(environment: environment)
            capabilities = (try? await CapabilityStore(environment: environment).list(resolvingWith: PermissionService())) ?? []
            adapters = DefaultRegistry.make().descriptorList()
            adapterHealth = [:]
            logs = (try? await OperationLogStore(environment: environment).list(limit: 15)) ?? []
        }
    }

    func grant(_ scope: String) async {
        do {
            let response = try await sendSystem(resource: "capabilities", action: "grant", arguments: ["scope": scope])
            message = response.ok ? "Scope concedido: \(scope)" : response.error?.message
            await refresh()
        } catch {
            message = error.localizedDescription
        }
    }

    func revoke(_ scope: String) async {
        do {
            let response = try await sendSystem(resource: "capabilities", action: "revoke", arguments: ["scope": scope])
            message = response.ok ? "Scope revocado: \(scope)" : response.error?.message
            await refresh()
        } catch {
            message = error.localizedDescription
        }
    }

    func toggleDaemon() async {
        do {
            if health?.running == true {
                try DaemonLauncher.stop(environment: environment)
            } else {
                try DaemonLauncher.start(environment: environment)
                _ = DaemonLauncher.waitUntilAvailable(environment: environment)
            }
            await refresh()
        } catch {
            message = error.localizedDescription
        }
    }

    func installCLI() async {
        do {
            let executable = try locateSiblingBinary(named: "claw-host")
            let installedPath = try RuntimeInstaller.installCLI(sourceBinaryPath: executable, destinationPath: installPath, environment: environment)
            message = "CLI instalado en \(installedPath)"
            await refresh()
        } catch {
            message = error.localizedDescription
        }
    }

    func installLaunchAgent() async {
        do {
            let daemon = try locateSiblingBinary(named: "claw-hostd")
            let installedPath = try RuntimeInstaller.installLaunchAgent(daemonBinaryPath: daemon, environment: environment)
            message = "LaunchAgent escrito en \(installedPath)"
            await refresh()
        } catch {
            message = error.localizedDescription
        }
    }

    func requestPermission(for domain: Domain) async {
        do {
            let state = try await Task.detached(priority: .userInitiated) {
                try PermissionService().requestPermission(for: domain)
            }.value
            message = "Permiso \(domain.rawValue): \(state.rawValue)"
            await refresh()
        } catch {
            message = error.localizedDescription
        }
    }

    func requestPermissions(for domains: [Domain]) async {
        for domain in domains {
            await requestPermission(for: domain)
        }
    }

    private func sendSystem(resource: String, action: String, arguments: [String: String]) async throws -> CommandResponse {
        let client = try DaemonClient(environment: environment)
        return try client.send(
            CommandRequest(
                domain: .system,
                resource: resource,
                action: action,
                arguments: arguments,
                clientContext: .current(executablePath: clientExecutablePath)
            )
        )
    }

    private func fetchHealth(with client: DaemonClient) async throws -> DaemonHealth {
        let response = try client.send(
            CommandRequest(domain: .system, resource: "daemon", action: "health", arguments: [:], clientContext: .current(executablePath: clientExecutablePath))
        )
        guard case .object(let data)? = response.data else {
            throw CommanderError.transport("Invalid daemon health response")
        }
        return DaemonHealth(
            running: data["running"]?.boolValue ?? false,
            pid: data["pid"]?.int32Value,
            socketPath: data["socket_path"]?.stringValue ?? "",
            startedAt: data["started_at"]?.stringValue,
            runtimeTransport: data["runtime_transport"]?.stringValue,
            hostBundlePath: data["host_bundle_path"]?.stringValue,
            hostAppRunning: data["host_app_running"]?.boolValue
        )
    }

    private func fetchCapabilities(with client: DaemonClient) async throws -> [Capability] {
        let response = try client.send(
            CommandRequest(domain: .system, resource: "capabilities", action: "list", arguments: [:], clientContext: .current(executablePath: clientExecutablePath))
        )
        guard case .array(let values)? = response.data else { return [] }
        return values.compactMap { value in
            guard case .object(let object) = value else { return nil }
            return Capability(
                id: object["id"]?.stringValue ?? "",
                domain: Domain(rawValue: object["domain"]?.stringValue ?? "") ?? .files,
                actions: object["actions"]?.stringArrayValue ?? [],
                granted: object["granted"]?.boolValue ?? false,
                riskLevel: object["risk_level"]?.stringValue ?? "unknown",
                requiresOSPermission: object["requires_os_permission"]?.boolValue ?? false,
                osPermissionState: object["os_permission_state"]?.stringValue ?? "unknown"
            )
        }
    }

    private func fetchAdapters(with client: DaemonClient) async throws -> [AdapterDescriptor] {
        let response = try client.send(
            CommandRequest(domain: .system, resource: "adapters", action: "list", arguments: [:], clientContext: .current(executablePath: clientExecutablePath))
        )
        guard case .array(let values)? = response.data else { return [] }
        return values.compactMap { value in
            guard case .object(let object) = value else { return nil }
            let name = object["name"]?.stringValue ?? ""
            let domain = Domain(rawValue: object["domain"]?.stringValue ?? "") ?? .files
            let version = object["version"]?.stringValue ?? ""
            let supportedCommands = object["supported_commands"]?.stringArrayValue ?? []
            let sources = (object["sources"]?.stringArrayValue ?? []).compactMap(AdapterSource.init(rawValue:))
            let riskLevel = object["risk_level"]?.stringValue ?? "unknown"
            let isImplemented = object["is_implemented"]?.boolValue ?? false
            let requiresOSPermission = object["requires_os_permission"]?.boolValue ?? false
            let coverageLevel = object["coverage_level"]?.stringValue ?? "stub"
            let supportsSearch = object["supports_search"]?.boolValue ?? false
            let supportsDelete = object["supports_delete"]?.boolValue ?? false
            return AdapterDescriptor(
                name: name,
                domain: domain,
                version: version,
                supportedCommands: supportedCommands,
                sources: sources,
                riskLevel: riskLevel,
                isImplemented: isImplemented,
                requiresOSPermission: requiresOSPermission,
                coverageLevel: coverageLevel,
                supportsSearch: supportsSearch,
                supportsDelete: supportsDelete
            )
        }
    }

    private func fetchInstallStatus(with client: DaemonClient) async throws -> InstallStatus {
        let response = try client.send(
            CommandRequest(domain: .system, resource: "install", action: "status", arguments: [:], clientContext: .current(executablePath: clientExecutablePath))
        )
        guard let object = response.data?.objectValue else {
            throw CommanderError.transport("Invalid install status response")
        }
        return InstallStatus(
            cliInstalled: object["cli_installed"]?.boolValue ?? false,
            cliPath: object["cli_path"]?.stringValue ?? "",
            launchAgentInstalled: object["launch_agent_installed"]?.boolValue ?? false,
            launchAgentLoaded: object["launch_agent_loaded"]?.boolValue ?? false,
            launchAgentPath: object["launch_agent_path"]?.stringValue ?? "",
            launchAgentLabel: object["launch_agent_label"]?.stringValue ?? "",
            runtimeTransport: object["runtime_transport"]?.stringValue ?? RuntimeInstaller.socketRuntimeTransport,
            hostAppRunning: object["host_app_running"]?.boolValue ?? false,
            hostBundlePath: object["host_bundle_path"]?.stringValue ?? "",
            appRegisteredAtLogin: object["app_registered_at_login"]?.boolValue ?? false,
            socketFallbackEnabled: object["socket_fallback_enabled"]?.boolValue ?? true
        )
    }

    private func fetchAdapterHealth(with client: DaemonClient) async throws -> [String: AdapterHealthStatus] {
        let response = try client.send(
            CommandRequest(domain: .system, resource: "doctor", action: "run", arguments: [:], clientContext: .current(executablePath: clientExecutablePath))
        )
        guard let object = response.data?.objectValue?["adapter_health"]?.objectValue else { return [:] }
        return object.reduce(into: [String: AdapterHealthStatus]()) { partial, item in
            let value = item.value.objectValue ?? [:]
            guard let availability = value["availability"]?.stringValue.flatMap(AdapterAvailability.init(rawValue:)),
                  let reason = value["reason"]?.stringValue.flatMap(AdapterAvailabilityReason.init(rawValue:)) else {
                return
            }
            partial[item.key] = AdapterHealthStatus(availability: availability, reason: reason)
        }
    }

    private func fetchLogs(with client: DaemonClient) async throws -> [OperationLog] {
        let response = try client.send(
            CommandRequest(domain: .system, resource: "logs", action: "list", arguments: ["limit": "15"], clientContext: .current(executablePath: clientExecutablePath))
        )
        guard case .array(let values)? = response.data else { return [] }
        return values.compactMap { value in
            guard case .object(let object) = value else { return nil }
            let clientObject = object["client"]?.objectValue ?? [:]
            let argumentsObject = object["arguments"]?.objectValue ?? [:]
            let arguments = argumentsObject.reduce(into: [String: String]()) { partial, item in
                partial[item.key] = item.value.stringValue ?? ""
            }
            return OperationLog(
                id: UUID(uuidString: object["id"]?.stringValue ?? "") ?? UUID(),
                domain: Domain(rawValue: object["domain"]?.stringValue ?? "") ?? .system,
                client: ClientContext(
                    pid: clientObject["pid"]?.int32Value ?? 0,
                    bundleID: nil,
                    executablePath: clientObject["executable_path"]?.stringValue ?? "",
                    signingIdentity: nil,
                    tty: clientObject["tty"]?.boolValue ?? false
                ),
                command: object["command"]?.stringValue ?? "",
                arguments: arguments,
                adapter: object["adapter"]?.stringValue ?? "",
                source: AdapterSource(rawValue: object["source"]?.stringValue ?? "") ?? .filesystem,
                riskLevel: object["risk_level"]?.stringValue ?? "unknown",
                validationMode: ValidationMode(rawValue: object["validation_mode"]?.stringValue ?? "") ?? .hostReal,
                result: object["result"]?.stringValue ?? "",
                startedAt: object["started_at"]?.stringValue ?? "",
                finishedAt: object["finished_at"]?.stringValue ?? ""
            )
        }
    }

    private func locateSiblingBinary(named name: String) throws -> String {
        let current = URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent()
        let candidate = current.appendingPathComponent(name)
        if FileManager.default.isExecutableFile(atPath: candidate.path) {
            return candidate.path
        }

        let fallback = URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent(".build/debug/\(name)")
        if FileManager.default.isExecutableFile(atPath: fallback.path) {
            return fallback.path
        }

        throw CommanderError.notFound("No se pudo localizar el binario \(name)")
    }

    private var clientExecutablePath: String {
        CommandLine.arguments.first ?? "ClawApp"
    }
}

struct DashboardView: View {
    @ObservedObject var model: DashboardModel
    @State private var logDomainFilter = "all"
    @State private var logResultFilter = "all"

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    header
                    onboardingCard
                    daemonCard
                    capabilitiesCard
                    adaptersCard
                    logsCard
                }
                .padding(24)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .navigationTitle("Claw Control Plane")
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("CLI local-first para agentes con permisos, adapters y auditoría.")
                .font(.title2.weight(.semibold))
            Text("Runtime local con auditoría, validación host aislada y adapters Apple endurecidos para uso real en un Mac.")
                .foregroundStyle(.secondary)
            HStack {
                Button("Instalar CLI en ~/.local/bin") {
                    Task { await model.installCLI() }
                }
                Button("Instalar LaunchAgent") {
                    Task { await model.installLaunchAgent() }
                }
                Button("Refrescar") {
                    Task { await model.refresh() }
                }
            }
            if let message = model.message {
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var onboardingCard: some View {
        GroupBox("Onboarding") {
            VStack(alignment: .leading, spacing: 12) {
                statusRow("CLI", model.installStatus?.cliInstalled == true ? "Instalado" : "Pendiente")
                statusRow("CLI path", model.installStatus?.cliPath ?? "No disponible")
                statusRow("Runtime", model.installStatus?.runtimeTransport ?? RuntimeInstaller.socketRuntimeTransport)
                statusRow("Host app", model.installStatus?.hostAppRunning == true ? "Activo" : "Parado")
                statusRow("Host bundle", model.installStatus?.hostBundlePath.isEmpty == false ? (model.installStatus?.hostBundlePath ?? "") : "No disponible")
                statusRow("Login registration", model.installStatus?.appRegisteredAtLogin == true ? "Registrado" : "Pendiente")
                statusRow("LaunchAgent", model.installStatus?.launchAgentInstalled == true ? "Escrito" : "Pendiente")
                statusRow("LaunchAgent loaded", model.installStatus?.launchAgentLoaded == true ? "Cargado" : "No cargado")
                statusRow("Calendario OS", osPermissionState(for: .calendar))
                statusRow("Recordatorios OS", osPermissionState(for: .reminders))
                statusRow("Contactos OS", osPermissionState(for: .contacts))
                statusRow("Notificaciones OS", osPermissionState(for: .notifications))
                HStack {
                    Button("Instalar CLI") {
                        Task { await model.installCLI() }
                    }
                    Button("Instalar LaunchAgent") {
                        Task { await model.installLaunchAgent() }
                    }
                    Button("Solicitar permiso Calendario") {
                        Task { await model.requestPermission(for: .calendar) }
                    }
                    Button("Solicitar permiso Recordatorios") {
                        Task { await model.requestPermission(for: .reminders) }
                    }
                    Button("Solicitar permiso Contactos") {
                        Task { await model.requestPermission(for: .contacts) }
                    }
                    Button("Solicitar permiso Notificaciones") {
                        Task { await model.requestPermission(for: .notifications) }
                    }
                    Button("Solicitar todo") {
                        Task { await model.requestPermissions(for: PermissionService.requestableDomains) }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var daemonCard: some View {
        GroupBox("Daemon") {
            VStack(alignment: .leading, spacing: 12) {
                statusRow("Estado", model.health?.running == true ? "Activo" : "Parado")
                statusRow("Socket", model.health?.socketPath ?? "No disponible")
                statusRow("PID", model.health?.pid.map(String.init) ?? "No disponible")
                statusRow("Arrancado", model.health?.startedAt ?? "No disponible")
                HStack {
                    Button(model.health?.running == true ? "Parar daemon" : "Arrancar daemon") {
                        Task { await model.toggleDaemon() }
                    }
                    .buttonStyle(.borderedProminent)
                    Button("Conceder scopes base") {
                        Task {
                            await model.grant("files.read")
                            await model.grant("files.write")
                            await model.grant("files.delete")
                            await model.grant("obsidian.read")
                            await model.grant("obsidian.write")
                            await model.grant("calendar.read")
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var capabilitiesCard: some View {
        GroupBox("Capabilities") {
            LazyVGrid(columns: [
                GridItem(.adaptive(minimum: 220), spacing: 16),
            ], spacing: 16) {
                ForEach(model.capabilities.sorted { $0.id < $1.id }) { capability in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(capability.id)
                            .font(.headline)
                        Text(capability.actions.joined(separator: ", "))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text("Risk: \(capability.riskLevel)")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        Label(capability.granted ? "Granted" : "Not granted", systemImage: capability.granted ? "checkmark.shield.fill" : "shield")
                            .foregroundStyle(capability.granted ? .green : .orange)
                        Label(capability.osPermissionState.replacingOccurrences(of: "_", with: " "), systemImage: capability.requiresOSPermission ? "calendar.badge.clock" : "checkmark.circle")
                            .font(.caption)
                            .foregroundStyle(capability.osPermissionState == "authorized" ? .green : .secondary)
                        HStack {
                            Button(capability.granted ? "Concedido" : "Conceder") {
                                Task { await model.grant(capability.id) }
                            }
                            .disabled(capability.granted)
                            if capability.granted {
                                Button("Revocar") {
                                    Task { await model.revoke(capability.id) }
                                }
                            }
                        }
                        if capability.requiresOSPermission && capability.osPermissionState != "authorized" {
                            Button("Pedir permiso OS") {
                                Task { await model.requestPermission(for: capability.domain) }
                            }
                        }
                    }
                    .padding()
                    .background(.quaternary.opacity(0.25), in: RoundedRectangle(cornerRadius: 16))
                }
            }
        }
    }

    private var adaptersCard: some View {
        GroupBox("Adapters") {
            VStack(spacing: 12) {
                ForEach(model.adapters.sorted { $0.name < $1.name }) { adapter in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(adapter.name.capitalized)
                                .font(.headline)
                            Spacer()
                            Text(adapter.isImplemented ? "Implemented" : "Scaffolded")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(adapter.isImplemented ? .green : .orange)
                            Text(adapter.riskLevel)
                                .font(.caption.weight(.semibold))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(.thinMaterial, in: Capsule())
                        }
                        Text("Sources: \(adapter.sources.map(\.rawValue).joined(separator: ", "))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        if adapter.requiresOSPermission {
                            Text("Requires OS permission")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                        Text("Coverage: \(adapter.coverageLevel) · Search: \(adapter.supportsSearch ? "yes" : "no") · Delete: \(adapter.supportsDelete ? "yes" : "no")")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        if let health = model.adapterHealth[adapter.domain.rawValue] {
                            Text("Health: \(health.availability.rawValue) · \(health.reason.rawValue)")
                                .font(.caption2)
                                .foregroundStyle(health.availability == .available ? .green : .orange)
                        }
                        Text(adapter.supportedCommands.joined(separator: " · "))
                            .font(.footnote)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
                    .background(.quaternary.opacity(0.25), in: RoundedRectangle(cornerRadius: 16))
                }
            }
        }
    }

    private var logsCard: some View {
        GroupBox("Recent Logs") {
            VStack(spacing: 12) {
                HStack {
                    Picker("Domain", selection: $logDomainFilter) {
                        Text("All").tag("all")
                        ForEach(Array(Set(model.logs.map { $0.domain.rawValue })).sorted(), id: \.self) { domain in
                            Text(domain).tag(domain)
                        }
                    }
                    Picker("Result", selection: $logResultFilter) {
                        Text("All").tag("all")
                        Text("ok").tag("ok")
                        Text("permission_denied").tag("permission_denied")
                        Text("adapter_unavailable").tag("adapter_unavailable")
                    }
                }
                .pickerStyle(.menu)
                ForEach(filteredLogs.prefix(12)) { log in
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(log.command)
                                .font(.callout.monospaced())
                            Text("\(log.domain.rawValue) · \(log.adapter) · \(log.source.rawValue) · \(log.result) · \(log.riskLevel) · \(log.validationMode.rawValue)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(log.finishedAt)
                            .font(.caption2.monospaced())
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 4)
                }
            }
        }
    }

    private var filteredLogs: [OperationLog] {
        model.logs.filter { log in
            (logDomainFilter == "all" || log.domain.rawValue == logDomainFilter) &&
            (logResultFilter == "all" || log.result == logResultFilter)
        }
    }

    private func statusRow(_ title: String, _ value: String) -> some View {
        HStack {
            Text(title)
                .fontWeight(.medium)
            Spacer()
            Text(value)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.trailing)
        }
    }

    private func osPermissionState(for domain: Domain) -> String {
        model.capabilities
            .first(where: { $0.domain == domain && $0.requiresOSPermission })?
            .osPermissionState
            .replacingOccurrences(of: "_", with: " ")
            .capitalized ?? PermissionService().status(for: domain).rawValue.replacingOccurrences(of: "_", with: " ").capitalized
    }
}
