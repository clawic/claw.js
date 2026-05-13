import Foundation
import CommanderCore

enum AdapterSupport {
    static func require(_ arguments: [String: String], _ key: String) throws -> String {
        guard let value = arguments[key], !value.isEmpty else {
            throw CommanderError.invalidArguments("Missing --\(key)")
        }
        return value
    }

    static func isoString(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.string(from: date)
    }

    static func parseISODate(_ value: String?) throws -> Date? {
        guard let value, !value.isEmpty else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) {
            return date
        }
        formatter.formatOptions = [.withInternetDateTime]
        if let date = formatter.date(from: value) {
            return date
        }
        throw CommanderError.invalidArguments("Invalid ISO8601 date: \(value)")
    }

    static func newID(prefix: String) -> String {
        "\(prefix)_\(UUID().uuidString)"
    }

    static func matches(_ query: String, in object: [String: JSONValue], fields: [String]) -> Bool {
        let normalized = query.lowercased()
        return fields.contains { field in
            object[field]?.stringValue?.lowercased().contains(normalized) == true
        }
    }

    static func createdAt(_ object: [String: JSONValue]) -> JSONValue {
        object["created_at"] ?? .string(isoString(Date()))
    }

    static func runProcess(
        executable: String,
        arguments: [String],
        environment: [String: String]? = nil,
        timeout: TimeInterval? = nil
    ) throws -> String {
        try AutomationSupport.runProcess(
            executable: executable,
            arguments: arguments,
            environment: environment,
            timeout: timeout
        )
    }

    static func runAppleScript(_ script: String, timeout: TimeInterval? = nil) throws -> String {
        try runProcess(executable: "/usr/bin/osascript", arguments: ["-e", script], timeout: timeout)
    }

    static func runAppleScript(appName: String, script: String, timeout: TimeInterval? = nil) throws -> String {
        try AutomationSupport.runAppleScript(appName: appName, script: script, timeout: timeout)
    }

    static func appExists(_ appName: String) -> Bool {
        AutomationSupport.appExists(appName)
    }

    static func requireInstalledApp(_ appName: String) throws {
        guard appExists(appName) else {
            throw CommanderError.notFound("\(appName) is not installed")
        }
    }

    static func escapeAppleScript(_ value: String) -> String {
        AutomationSupport.escapeAppleScript(value)
    }

    static func parseRows(_ raw: String, expectedFieldCount: Int) -> [[String]] {
        raw
            .split(separator: "\n", omittingEmptySubsequences: true)
            .map { line in
                String(line)
                    .split(separator: "\u{1F}", omittingEmptySubsequences: false)
                    .map(String.init)
            }
            .filter { $0.count >= expectedFieldCount }
    }

    static func parseBool(_ value: String?) -> Bool {
        guard let value else { return false }
        return ["true", "yes", "1"].contains(value.lowercased())
    }
}
