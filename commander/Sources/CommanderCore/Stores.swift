import Foundation

public actor CapabilityStore {
    private let fileURL: URL
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    public init(environment: [String: String] = ProcessInfo.processInfo.environment) throws {
        self.fileURL = try StatePaths.capabilitiesFile(environment: environment)
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try Self.seedIfNeeded(fileURL: fileURL, encoder: encoder)
    }

    public func list() throws -> [Capability] {
        try load()
    }

    public func grant(scope: String) throws -> Capability {
        var capabilities = try load()
        guard let index = capabilities.firstIndex(where: { $0.id == scope }) else {
            throw CommanderError.notFound("Unknown scope: \(scope)")
        }
        capabilities[index].granted = true
        try save(capabilities)
        return capabilities[index]
    }

    public func revoke(scope: String) throws -> Capability {
        var capabilities = try load()
        guard let index = capabilities.firstIndex(where: { $0.id == scope }) else {
            throw CommanderError.notFound("Unknown scope: \(scope)")
        }
        capabilities[index].granted = false
        try save(capabilities)
        return capabilities[index]
    }

    public func isAllowed(domain: Domain, action: String) throws -> Bool {
        let capabilities = try load()
        let normalizedAction = normalizedCapabilityAction(for: domain, action: action)
        return capabilities.contains { capability in
            capability.domain == domain &&
            capability.granted &&
            (capability.actions.contains(action) || capability.actions.contains(normalizedAction))
        }
    }

    public func list(resolvingWith permissionService: PermissionService) throws -> [Capability] {
        try load().map { capability in
            var copy = capability
            if capability.requiresOSPermission {
                copy.osPermissionState = permissionService.status(for: capability.domain).rawValue
            }
            return copy
        }
    }

    private func normalizedCapabilityAction(for domain: Domain, action: String) -> String {
        switch (domain, action) {
        case (.mail, "send"):
            return "send"
        case (.mail, "delete"):
            return "delete"
        case (.files, "delete"):
            return "delete"
        case (_, "list"), (_, "get"), (_, "search"), (_, "read"):
            return "read"
        case (_, "delete"):
            return "delete"
        default:
            return "create"
        }
    }

    private static func seedIfNeeded(fileURL: URL, encoder: JSONEncoder) throws {
        guard !FileManager.default.fileExists(atPath: fileURL.path) else { return }
        let data = try encoder.encode(CapabilityCatalog.all)
        try data.write(to: fileURL, options: .atomic)
    }

    private func load() throws -> [Capability] {
        let data = try Data(contentsOf: fileURL)
        return try decoder.decode([Capability].self, from: data)
    }

    private func save(_ capabilities: [Capability]) throws {
        let data = try encoder.encode(capabilities)
        try data.write(to: fileURL, options: .atomic)
    }
}

public actor OperationLogStore {
    private let fileURL: URL
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    public init(environment: [String: String] = ProcessInfo.processInfo.environment) throws {
        self.fileURL = try StatePaths.logsFile(environment: environment)
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        if !FileManager.default.fileExists(atPath: fileURL.path) {
            let data = try encoder.encode([OperationLog]())
            try data.write(to: fileURL, options: .atomic)
        }
    }

    public func list(limit: Int? = nil) throws -> [OperationLog] {
        let logs = try load()
        guard let limit else { return logs.reversed() }
        return Array(logs.reversed().prefix(limit))
    }

    public func append(_ log: OperationLog) throws {
        var logs = try load()
        logs.append(log)
        try save(logs)
    }

    private func load() throws -> [OperationLog] {
        let data = try Data(contentsOf: fileURL)
        return try decoder.decode([OperationLog].self, from: data)
    }

    private func save(_ logs: [OperationLog]) throws {
        let data = try encoder.encode(logs)
        try data.write(to: fileURL, options: .atomic)
    }
}

public struct DaemonStatusStore {
    private let fileURL: URL
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    public init(environment: [String: String] = ProcessInfo.processInfo.environment) throws {
        self.fileURL = try StatePaths.daemonStatusFile(environment: environment)
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    }

    public func write(_ status: DaemonHealth) throws {
        let data = try encoder.encode(status)
        try data.write(to: fileURL, options: .atomic)
    }

    public func read() throws -> DaemonHealth? {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return nil }
        let data = try Data(contentsOf: fileURL)
        return try decoder.decode(DaemonHealth.self, from: data)
    }

    public func clear() throws {
        if FileManager.default.fileExists(atPath: fileURL.path) {
            try FileManager.default.removeItem(at: fileURL)
        }
    }
}

public enum Timestamp {
    public static func now() -> String {
        ISO8601DateFormatter().string(from: Date())
    }
}
