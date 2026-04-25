import Foundation
import CommanderCore

public struct FinderAdapter: CommanderAdapter {
    public let descriptor = AdapterDescriptor(
        name: "finder",
        domain: .finder,
        version: "0.1.0",
        supportedCommands: [
            "finder entries reveal",
            "finder entries open",
            "finder entries trash",
        ],
        sources: [.applescript],
        riskLevel: "medium",
        isImplemented: true,
        requiresOSPermission: false,
        coverageLevel: "crud",
        supportsSearch: false,
        supportsDelete: true
    )

    public init() {}

    public func supports(resource: String, action: String) -> Bool {
        resource == "entries" && ["reveal", "open", "trash"].contains(action)
    }

    public func execute(request: CommandRequest, environment: [String : String]) throws -> JSONValue {
        let path = try AdapterSupport.require(request.arguments, "path")
        guard FileManager.default.fileExists(atPath: path) else {
            throw CommanderError.notFound("No entry at \(path)")
        }

        if ExecutionEnvironment.isTestMode(environment) {
            return executeInTestMode(request: request, path: path)
        }

        try AdapterSupport.requireInstalledApp("Finder")
        let escapedPath = AdapterSupport.escapeAppleScript(URL(fileURLWithPath: path).path)

        switch request.action {
        case "reveal":
            _ = try AdapterSupport.runAppleScript(
                appName: "Finder",
                script: """
                tell application "Finder"
                    activate
                    reveal POSIX file "\(escapedPath)"
                end tell
                """,
                timeout: 8
            )
            return .object([
                "path": .string(path),
                "revealed": .bool(true),
                "source": .string("applescript"),
            ])
        case "open":
            _ = try AdapterSupport.runAppleScript(
                appName: "Finder",
                script: """
                tell application "Finder"
                    activate
                    open POSIX file "\(escapedPath)"
                end tell
                """,
                timeout: 8
            )
            return .object([
                "path": .string(path),
                "opened": .bool(true),
                "source": .string("applescript"),
            ])
        case "trash":
            _ = try AdapterSupport.runAppleScript(
                appName: "Finder",
                script: """
                tell application "Finder"
                    move POSIX file "\(escapedPath)" to trash
                end tell
                """,
                timeout: 8
            )
            return .object([
                "path": .string(path),
                "trashed": .bool(true),
                "source": .string("applescript"),
            ])
        default:
            throw CommanderError.invalidCommand("Unsupported Finder action")
        }
    }

    private func executeInTestMode(request: CommandRequest, path: String) -> JSONValue {
        switch request.action {
        case "reveal":
            return .object([
                "path": .string(path),
                "revealed": .bool(true),
                "source": .string("test_fixture"),
            ])
        case "open":
            return .object([
                "path": .string(path),
                "opened": .bool(true),
                "source": .string("test_fixture"),
            ])
        case "trash":
            return .object([
                "path": .string(path),
                "trashed": .bool(true),
                "source": .string("test_fixture"),
            ])
        default:
            return .object([
                "path": .string(path),
                "source": .string("test_fixture"),
            ])
        }
    }
}
