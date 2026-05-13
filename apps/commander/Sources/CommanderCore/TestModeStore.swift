import Foundation

public enum ExecutionEnvironment {
    public static func isTestMode(_ environment: [String: String]) -> Bool {
        environment["COMMANDER_TEST_MODE"] == "1"
    }

    public static func isHostSafeMode(_ environment: [String: String]) -> Bool {
        environment["COMMANDER_HOST_SAFE"] == "1" || environment["COMMANDER_HOST_VALIDATION_MODE"] == ValidationMode.hostIsolated.rawValue
    }
}

public struct TestModeStore {
    private let baseURL: URL
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    public init(environment: [String: String] = ProcessInfo.processInfo.environment) throws {
        let root = try StatePaths.ensureStateDirectory(environment: environment)
        baseURL = root.appendingPathComponent("test-fixtures", isDirectory: true)
        try FileManager.default.createDirectory(at: baseURL, withIntermediateDirectories: true)
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    }

    public func list(collection: String) throws -> [[String: JSONValue]] {
        let fileURL = baseURL.appendingPathComponent("\(collection).json")
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return [] }
        let data = try Data(contentsOf: fileURL)
        return try decoder.decode([[String: JSONValue]].self, from: data)
    }

    public func replace(collection: String, with objects: [[String: JSONValue]]) throws {
        let fileURL = baseURL.appendingPathComponent("\(collection).json")
        let data = try encoder.encode(objects)
        try data.write(to: fileURL, options: .atomic)
    }

    public func upsert(collection: String, object: [String: JSONValue], idKey: String = "id") throws -> [String: JSONValue] {
        var objects = try list(collection: collection)
        guard let id = object[idKey]?.stringValue else {
            throw CommanderError.invalidArguments("Missing id")
        }
        if let index = objects.firstIndex(where: { $0[idKey]?.stringValue == id }) {
            objects[index] = object
        } else {
            objects.append(object)
        }
        try replace(collection: collection, with: objects)
        return object
    }

    public func delete(collection: String, id: String, idKey: String = "id") throws {
        let objects = try list(collection: collection).filter { $0[idKey]?.stringValue != id }
        try replace(collection: collection, with: objects)
    }
}
