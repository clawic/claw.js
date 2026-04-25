import Foundation
import Darwin

public enum Domain: String, Codable, CaseIterable, Sendable {
    case calendar
    case mail
    case things
    case reminders
    case contacts
    case notes
    case messages
    case safari
    case clipboard
    case notifications
    case apps
    case finder
    case screenshots
    case processes
    case obsidian
    case files
    case system
}

public enum AdapterSource: String, Codable, CaseIterable, Sendable {
    case framework
    case privateDB = "private_db"
    case applescript
    case urlScheme = "url_scheme"
    case filesystem
    case uiAutomation = "ui_automation"
    case localCLI = "local_cli"
}

public enum ValidationMode: String, Codable, CaseIterable, Sendable {
    case fixture
    case hostIsolated = "host_isolated"
    case hostReal = "host_real"
}

public struct CommandRequest: Codable, Sendable {
    public var domain: Domain
    public var resource: String
    public var action: String
    public var arguments: [String: String]
    public var clientContext: ClientContext

    public init(
        domain: Domain,
        resource: String,
        action: String,
        arguments: [String: String],
        clientContext: ClientContext
    ) {
        self.domain = domain
        self.resource = resource
        self.action = action
        self.arguments = arguments
        self.clientContext = clientContext
    }
}

public struct ClientContext: Codable, Equatable, Sendable {
    public var pid: Int32
    public var bundleID: String?
    public var executablePath: String
    public var signingIdentity: String?
    public var tty: Bool

    public init(
        pid: Int32,
        bundleID: String?,
        executablePath: String,
        signingIdentity: String?,
        tty: Bool
    ) {
        self.pid = pid
        self.bundleID = bundleID
        self.executablePath = executablePath
        self.signingIdentity = signingIdentity
        self.tty = tty
    }

    public static func current(executablePath: String? = nil) -> ClientContext {
        let rawExecutablePath = executablePath ?? CommandLine.arguments.first ?? "commander"
        return ClientContext(
            pid: getpid(),
            bundleID: Bundle.main.bundleIdentifier,
            executablePath: executablePath == nil ? normalizedExecutablePath(rawExecutablePath) : rawExecutablePath,
            signingIdentity: nil,
            tty: isatty(STDIN_FILENO) != 0
        )
    }

    private static func normalizedExecutablePath(_ executablePath: String) -> String {
        guard !executablePath.hasPrefix("/") else {
            return URL(fileURLWithPath: executablePath).standardizedFileURL.path
        }

        let workingDirectory = URL(fileURLWithPath: FileManager.default.currentDirectoryPath, isDirectory: true)
        return URL(fileURLWithPath: executablePath, relativeTo: workingDirectory).standardizedFileURL.path
    }
}

public struct CommandErrorPayload: Codable, Equatable, Sendable {
    public var code: String
    public var message: String
    public var details: JSONValue?

    public init(code: String, message: String, details: JSONValue? = nil) {
        self.code = code
        self.message = message
        self.details = details
    }
}

public struct CommandMeta: Codable, Equatable, Sendable {
    public var adapter: String
    public var source: AdapterSource
    public var riskLevel: String
    public var validationMode: ValidationMode
    public var durationMS: Int

    public init(
        adapter: String,
        source: AdapterSource,
        riskLevel: String = "read",
        validationMode: ValidationMode = .hostReal,
        durationMS: Int
    ) {
        self.adapter = adapter
        self.source = source
        self.riskLevel = riskLevel
        self.validationMode = validationMode
        self.durationMS = durationMS
    }

    enum CodingKeys: String, CodingKey {
        case adapter
        case source
        case riskLevel = "riskLevel"
        case risk_level
        case validationMode = "validationMode"
        case validation_mode
        case durationMS = "durationMS"
        case duration_ms
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        adapter = try container.decode(String.self, forKey: .adapter)
        source = try container.decodeIfPresent(AdapterSource.self, forKey: .source) ?? .filesystem
        riskLevel = try container.decodeIfPresent(String.self, forKey: .risk_level)
            ?? container.decodeIfPresent(String.self, forKey: .riskLevel)
            ?? "read"
        validationMode = try container.decodeIfPresent(ValidationMode.self, forKey: .validation_mode)
            ?? container.decodeIfPresent(ValidationMode.self, forKey: .validationMode)
            ?? .hostReal
        durationMS = try container.decodeIfPresent(Int.self, forKey: .duration_ms)
            ?? container.decodeIfPresent(Int.self, forKey: .durationMS)
            ?? 0
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(adapter, forKey: .adapter)
        try container.encode(source, forKey: .source)
        try container.encode(riskLevel, forKey: .risk_level)
        try container.encode(validationMode, forKey: .validation_mode)
        try container.encode(durationMS, forKey: .duration_ms)
    }
}

public struct CommandResponse: Codable, Equatable, Sendable {
    public var ok: Bool
    public var data: JSONValue?
    public var error: CommandErrorPayload?
    public var meta: CommandMeta

    public init(ok: Bool, data: JSONValue?, error: CommandErrorPayload?, meta: CommandMeta) {
        self.ok = ok
        self.data = data
        self.error = error
        self.meta = meta
    }
}

public struct Capability: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var domain: Domain
    public var actions: [String]
    public var granted: Bool
    public var riskLevel: String
    public var requiresOSPermission: Bool
    public var osPermissionState: String

    public init(
        id: String,
        domain: Domain,
        actions: [String],
        granted: Bool,
        riskLevel: String,
        requiresOSPermission: Bool,
        osPermissionState: String
    ) {
        self.id = id
        self.domain = domain
        self.actions = actions
        self.granted = granted
        self.riskLevel = riskLevel
        self.requiresOSPermission = requiresOSPermission
        self.osPermissionState = osPermissionState
    }

    enum CodingKeys: String, CodingKey {
        case id
        case domain
        case actions
        case granted
        case riskLevel = "riskLevel"
        case requiresOSPermission = "requiresOSPermission"
        case risk_level
        case requires_os_permission
        case osPermissionState = "osPermissionState"
        case os_permission_state
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        domain = try container.decode(Domain.self, forKey: .domain)
        actions = try container.decode([String].self, forKey: .actions)
        granted = try container.decode(Bool.self, forKey: .granted)
        riskLevel = try container.decodeIfPresent(String.self, forKey: .risk_level)
            ?? container.decodeIfPresent(String.self, forKey: .riskLevel)
            ?? "read"
        requiresOSPermission = try container.decodeIfPresent(Bool.self, forKey: .requires_os_permission)
            ?? container.decodeIfPresent(Bool.self, forKey: .requiresOSPermission)
            ?? false
        osPermissionState = try container.decodeIfPresent(String.self, forKey: .os_permission_state)
            ?? container.decodeIfPresent(String.self, forKey: .osPermissionState)
            ?? "not_requested"
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(domain, forKey: .domain)
        try container.encode(actions, forKey: .actions)
        try container.encode(granted, forKey: .granted)
        try container.encode(riskLevel, forKey: .risk_level)
        try container.encode(requiresOSPermission, forKey: .requires_os_permission)
        try container.encode(osPermissionState, forKey: .os_permission_state)
    }
}

public struct OperationLog: Codable, Identifiable, Sendable {
    public var id: UUID
    public var domain: Domain
    public var client: ClientContext
    public var command: String
    public var arguments: [String: String]
    public var adapter: String
    public var source: AdapterSource
    public var riskLevel: String
    public var validationMode: ValidationMode
    public var result: String
    public var startedAt: String
    public var finishedAt: String

    public init(
        id: UUID = UUID(),
        domain: Domain,
        client: ClientContext,
        command: String,
        arguments: [String: String],
        adapter: String,
        source: AdapterSource,
        riskLevel: String,
        validationMode: ValidationMode,
        result: String,
        startedAt: String,
        finishedAt: String
    ) {
        self.id = id
        self.domain = domain
        self.client = client
        self.command = command
        self.arguments = arguments
        self.adapter = adapter
        self.source = source
        self.riskLevel = riskLevel
        self.validationMode = validationMode
        self.result = result
        self.startedAt = startedAt
        self.finishedAt = finishedAt
    }

    enum CodingKeys: String, CodingKey {
        case id
        case domain
        case client
        case command
        case arguments
        case adapter
        case source
        case riskLevel = "riskLevel"
        case risk_level
        case validationMode = "validationMode"
        case validation_mode
        case result
        case startedAt = "startedAt"
        case started_at
        case finishedAt = "finishedAt"
        case finished_at
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        domain = try container.decodeIfPresent(Domain.self, forKey: .domain) ?? .system
        client = try container.decode(ClientContext.self, forKey: .client)
        command = try container.decode(String.self, forKey: .command)
        arguments = try container.decodeIfPresent([String: String].self, forKey: .arguments) ?? [:]
        adapter = try container.decode(String.self, forKey: .adapter)
        source = try container.decodeIfPresent(AdapterSource.self, forKey: .source) ?? .filesystem
        riskLevel = try container.decodeIfPresent(String.self, forKey: .risk_level)
            ?? container.decodeIfPresent(String.self, forKey: .riskLevel)
            ?? "read"
        validationMode = try container.decodeIfPresent(ValidationMode.self, forKey: .validation_mode)
            ?? container.decodeIfPresent(ValidationMode.self, forKey: .validationMode)
            ?? .hostReal
        result = try container.decode(String.self, forKey: .result)
        startedAt = try container.decodeIfPresent(String.self, forKey: .started_at)
            ?? container.decodeIfPresent(String.self, forKey: .startedAt)
            ?? Timestamp.now()
        finishedAt = try container.decodeIfPresent(String.self, forKey: .finished_at)
            ?? container.decodeIfPresent(String.self, forKey: .finishedAt)
            ?? Timestamp.now()
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(domain, forKey: .domain)
        try container.encode(client, forKey: .client)
        try container.encode(command, forKey: .command)
        try container.encode(arguments, forKey: .arguments)
        try container.encode(adapter, forKey: .adapter)
        try container.encode(source, forKey: .source)
        try container.encode(riskLevel, forKey: .risk_level)
        try container.encode(validationMode, forKey: .validation_mode)
        try container.encode(result, forKey: .result)
        try container.encode(startedAt, forKey: .started_at)
        try container.encode(finishedAt, forKey: .finished_at)
    }
}

public struct AdapterDescriptor: Codable, Equatable, Identifiable, Sendable {
    public var id: String { name }
    public var name: String
    public var domain: Domain
    public var version: String
    public var supportedCommands: [String]
    public var sources: [AdapterSource]
    public var riskLevel: String
    public var isImplemented: Bool
    public var requiresOSPermission: Bool
    public var coverageLevel: String
    public var supportsSearch: Bool
    public var supportsDelete: Bool

    public init(
        name: String,
        domain: Domain,
        version: String,
        supportedCommands: [String],
        sources: [AdapterSource],
        riskLevel: String,
        isImplemented: Bool,
        requiresOSPermission: Bool,
        coverageLevel: String,
        supportsSearch: Bool,
        supportsDelete: Bool
    ) {
        self.name = name
        self.domain = domain
        self.version = version
        self.supportedCommands = supportedCommands
        self.sources = sources
        self.riskLevel = riskLevel
        self.isImplemented = isImplemented
        self.requiresOSPermission = requiresOSPermission
        self.coverageLevel = coverageLevel
        self.supportsSearch = supportsSearch
        self.supportsDelete = supportsDelete
    }
}

public struct DaemonHealth: Codable, Equatable, Sendable {
    public var running: Bool
    public var pid: Int32?
    public var socketPath: String
    public var startedAt: String?
    public var runtimeTransport: String?
    public var hostBundlePath: String?
    public var hostAppRunning: Bool?

    public init(
        running: Bool,
        pid: Int32?,
        socketPath: String,
        startedAt: String?,
        runtimeTransport: String? = nil,
        hostBundlePath: String? = nil,
        hostAppRunning: Bool? = nil
    ) {
        self.running = running
        self.pid = pid
        self.socketPath = socketPath
        self.startedAt = startedAt
        self.runtimeTransport = runtimeTransport
        self.hostBundlePath = hostBundlePath
        self.hostAppRunning = hostAppRunning
    }
}

public enum CommanderError: Error, Sendable {
    case invalidCommand(String)
    case permissionDenied(String)
    case adapterUnavailable(String)
    case invalidArguments(String)
    case notFound(String)
    case transport(String)
    case internalFailure(String)

    public var payload: CommandErrorPayload {
        switch self {
        case .invalidCommand(let message):
            return .init(code: "invalid_command", message: message)
        case .permissionDenied(let message):
            return .init(code: "permission_denied", message: message)
        case .adapterUnavailable(let message):
            return .init(code: "adapter_unavailable", message: message)
        case .invalidArguments(let message):
            return .init(code: "invalid_arguments", message: message)
        case .notFound(let message):
            return .init(code: "not_found", message: message)
        case .transport(let message):
            return .init(code: "transport_error", message: message)
        case .internalFailure(let message):
            return .init(code: "internal_error", message: message)
        }
    }
}

public enum CapabilityCatalog {
    public static let all: [Capability] = [
        .init(id: "calendar.read", domain: .calendar, actions: ["read", "list", "get", "search"], granted: false, riskLevel: "read", requiresOSPermission: true, osPermissionState: "not_requested"),
        .init(id: "calendar.write", domain: .calendar, actions: ["create", "update", "delete", "move"], granted: false, riskLevel: "write", requiresOSPermission: true, osPermissionState: "not_requested"),
        .init(id: "mail.read", domain: .mail, actions: ["read", "list", "get", "search"], granted: false, riskLevel: "read", requiresOSPermission: false, osPermissionState: "not_applicable"),
        .init(id: "mail.send", domain: .mail, actions: ["send", "create"], granted: false, riskLevel: "write", requiresOSPermission: false, osPermissionState: "not_applicable"),
        .init(id: "mail.delete", domain: .mail, actions: ["delete"], granted: false, riskLevel: "destructive", requiresOSPermission: false, osPermissionState: "not_applicable"),
        .init(id: "things.read", domain: .things, actions: ["read", "list", "get", "search"], granted: false, riskLevel: "read", requiresOSPermission: false, osPermissionState: "not_applicable"),
        .init(id: "things.write", domain: .things, actions: ["create", "update", "delete", "move", "complete"], granted: false, riskLevel: "write", requiresOSPermission: false, osPermissionState: "not_applicable"),
        .init(id: "reminders.read", domain: .reminders, actions: ["read", "list", "get", "search"], granted: false, riskLevel: "read", requiresOSPermission: true, osPermissionState: "not_requested"),
        .init(id: "reminders.write", domain: .reminders, actions: ["create", "update", "delete", "complete"], granted: false, riskLevel: "write", requiresOSPermission: true, osPermissionState: "not_requested"),
        .init(id: "contacts.read", domain: .contacts, actions: ["read", "list", "get", "search"], granted: false, riskLevel: "read", requiresOSPermission: true, osPermissionState: "not_requested"),
        .init(id: "contacts.write", domain: .contacts, actions: ["create", "update", "delete"], granted: false, riskLevel: "write", requiresOSPermission: true, osPermissionState: "not_requested"),
        .init(id: "notes.read", domain: .notes, actions: ["read", "list", "get", "search"], granted: false, riskLevel: "read", requiresOSPermission: false, osPermissionState: "not_applicable"),
        .init(id: "notes.write", domain: .notes, actions: ["create", "update", "delete"], granted: false, riskLevel: "write", requiresOSPermission: false, osPermissionState: "not_applicable"),
        .init(id: "messages.read", domain: .messages, actions: ["read", "list", "get"], granted: false, riskLevel: "read", requiresOSPermission: false, osPermissionState: "not_applicable"),
        .init(id: "messages.send", domain: .messages, actions: ["send", "create"], granted: false, riskLevel: "write", requiresOSPermission: false, osPermissionState: "not_applicable"),
        .init(id: "safari.read", domain: .safari, actions: ["read", "list", "get", "search"], granted: false, riskLevel: "read", requiresOSPermission: false, osPermissionState: "not_applicable"),
        .init(id: "safari.write", domain: .safari, actions: ["open", "close", "delete"], granted: false, riskLevel: "write", requiresOSPermission: false, osPermissionState: "not_applicable"),
        .init(id: "clipboard.read", domain: .clipboard, actions: ["read", "get"], granted: false, riskLevel: "read", requiresOSPermission: false, osPermissionState: "authorized"),
        .init(id: "clipboard.write", domain: .clipboard, actions: ["set", "clear", "create", "update", "delete"], granted: false, riskLevel: "write", requiresOSPermission: false, osPermissionState: "authorized"),
        .init(id: "notifications.post", domain: .notifications, actions: ["post", "create"], granted: false, riskLevel: "write", requiresOSPermission: true, osPermissionState: "not_requested"),
        .init(id: "apps.read", domain: .apps, actions: ["read", "list", "get"], granted: false, riskLevel: "read", requiresOSPermission: false, osPermissionState: "authorized"),
        .init(id: "apps.write", domain: .apps, actions: ["open", "quit", "focus", "create", "update"], granted: false, riskLevel: "write", requiresOSPermission: false, osPermissionState: "authorized"),
        .init(id: "finder.read", domain: .finder, actions: ["reveal"], granted: false, riskLevel: "read", requiresOSPermission: false, osPermissionState: "not_applicable"),
        .init(id: "finder.write", domain: .finder, actions: ["open", "trash"], granted: false, riskLevel: "write", requiresOSPermission: false, osPermissionState: "not_applicable"),
        .init(id: "screenshots.capture", domain: .screenshots, actions: ["capture", "create"], granted: false, riskLevel: "read", requiresOSPermission: false, osPermissionState: "authorized"),
        .init(id: "processes.read", domain: .processes, actions: ["read", "list", "get", "search"], granted: false, riskLevel: "read", requiresOSPermission: false, osPermissionState: "authorized"),
        .init(id: "obsidian.read", domain: .obsidian, actions: ["read", "list", "get", "search"], granted: false, riskLevel: "read", requiresOSPermission: false, osPermissionState: "not_applicable"),
        .init(id: "obsidian.write", domain: .obsidian, actions: ["create", "update", "delete", "move"], granted: false, riskLevel: "write", requiresOSPermission: false, osPermissionState: "not_applicable"),
        .init(id: "files.read", domain: .files, actions: ["read", "list", "get", "search"], granted: false, riskLevel: "read", requiresOSPermission: false, osPermissionState: "authorized"),
        .init(id: "files.write", domain: .files, actions: ["create", "update", "move"], granted: false, riskLevel: "write", requiresOSPermission: false, osPermissionState: "authorized"),
        .init(id: "files.delete", domain: .files, actions: ["delete"], granted: false, riskLevel: "destructive", requiresOSPermission: false, osPermissionState: "authorized"),
    ]
}
