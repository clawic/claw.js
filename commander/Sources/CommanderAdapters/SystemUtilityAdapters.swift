import AppKit
import Foundation
import CommanderCore
import UserNotifications

public struct ClipboardAdapter: CommanderAdapter {
    public let descriptor = AdapterDescriptor(
        name: "clipboard",
        domain: .clipboard,
        version: "0.2.0",
        supportedCommands: ["clipboard contents get", "clipboard contents set", "clipboard contents clear"],
        sources: [.framework],
        riskLevel: "medium",
        isImplemented: true,
        requiresOSPermission: false,
        coverageLevel: "crud",
        supportsSearch: false,
        supportsDelete: true
    )

    public init() {}

    public func supports(resource: String, action: String) -> Bool {
        resource == "contents" && ["get", "set", "clear"].contains(action)
    }

    public func execute(request: CommandRequest, environment: [String : String]) throws -> JSONValue {
        let pasteboard = NSPasteboard.general
        switch request.action {
        case "get":
            return .object(["text": .string(pasteboard.string(forType: .string) ?? ""), "source": .string("pasteboard")])
        case "set":
            let text = try AdapterSupport.require(request.arguments, "text")
            pasteboard.clearContents()
            pasteboard.setString(text, forType: .string)
            return .object(["text": .string(text), "updated": .bool(true), "source": .string("pasteboard")])
        case "clear":
            pasteboard.clearContents()
            return .object(["cleared": .bool(true), "source": .string("pasteboard")])
        default:
            throw CommanderError.invalidCommand("Unsupported clipboard action")
        }
    }
}

public struct NotificationsAdapter: CommanderAdapter {
    public let descriptor = AdapterDescriptor(
        name: "notifications",
        domain: .notifications,
        version: "0.2.0",
        supportedCommands: ["notifications entries post"],
        sources: [.framework],
        riskLevel: "low",
        isImplemented: true,
        requiresOSPermission: true,
        coverageLevel: "crud",
        supportsSearch: false,
        supportsDelete: false
    )

    public init() {}

    public func supports(resource: String, action: String) -> Bool {
        resource == "entries" && action == "post"
    }

    public func execute(request: CommandRequest, environment: [String : String]) throws -> JSONValue {
        if ExecutionEnvironment.isTestMode(environment) {
            return .object([
                "id": .string(AdapterSupport.newID(prefix: "notification")),
                "title": .string(request.arguments["title"] ?? ""),
                "body": .string(request.arguments["body"] ?? ""),
                "posted": .bool(true),
                "source": .string("test_fixture"),
            ])
        }

        let title = try AdapterSupport.require(request.arguments, "title")
        let body = request.arguments["body"] ?? ""
        guard PermissionService().status(for: .notifications) == .authorized else {
            throw CommanderError.permissionDenied("Notifications OS permission is not authorized")
        }
        let identifier = AdapterSupport.newID(prefix: "notification")
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        let request = UNNotificationRequest(identifier: identifier, content: content, trigger: nil)
        let semaphore = DispatchSemaphore(value: 0)
        final class NotificationResult: @unchecked Sendable { var error: Error? }
        let result = NotificationResult()
        UNUserNotificationCenter.current().add(request) { error in
            result.error = error
            semaphore.signal()
        }
        semaphore.wait()
        if let error = result.error {
            throw CommanderError.internalFailure(error.localizedDescription)
        }
        return .object([
            "id": .string(identifier),
            "title": .string(title),
            "body": .string(body),
            "posted": .bool(true),
            "source": .string("usernotifications"),
        ])
    }
}

public struct AppsAdapter: CommanderAdapter {
    public let descriptor = AdapterDescriptor(
        name: "apps",
        domain: .apps,
        version: "0.2.0",
        supportedCommands: ["apps entries list", "apps entries get", "apps entries open", "apps entries quit", "apps entries focus"],
        sources: [.framework, .applescript],
        riskLevel: "medium",
        isImplemented: true,
        requiresOSPermission: false,
        coverageLevel: "crud",
        supportsSearch: false,
        supportsDelete: false
    )

    public init() {}

    public func supports(resource: String, action: String) -> Bool {
        resource == "entries" && ["list", "get", "open", "quit", "focus"].contains(action)
    }

    public func execute(request: CommandRequest, environment: [String : String]) throws -> JSONValue {
        let workspace = NSWorkspace.shared
        switch request.action {
        case "list":
            let apps = workspace.runningApplications.compactMap { app -> JSONValue? in
                guard let name = app.localizedName else { return nil }
                return .object([
                    "id": .string("\(app.processIdentifier)"),
                    "name": .string(name),
                    "bundle_id": app.bundleIdentifier.map(JSONValue.string) ?? .null,
                    "active": .bool(app.isActive),
                    "terminated": .bool(app.isTerminated),
                    "source": .string("nsworkspace"),
                ])
            }
            return .array(apps.sorted { ($0.objectValue?["name"]?.stringValue ?? "") < ($1.objectValue?["name"]?.stringValue ?? "") })
        case "get":
            let name = try AdapterSupport.require(request.arguments, "name")
            guard let app = workspace.runningApplications.first(where: { $0.localizedName == name || $0.bundleIdentifier == name }) else {
                throw CommanderError.notFound("App not running: \(name)")
            }
            return .object([
                "id": .string("\(app.processIdentifier)"),
                "name": .string(app.localizedName ?? name),
                "bundle_id": app.bundleIdentifier.map(JSONValue.string) ?? .null,
                "active": .bool(app.isActive),
                "terminated": .bool(app.isTerminated),
                "source": .string("nsworkspace"),
            ])
        case "open":
            let name = try AdapterSupport.require(request.arguments, "name")
            if ExecutionEnvironment.isTestMode(environment) {
                return .object(["name": .string(name), "opened": .bool(true), "source": .string("test_fixture")])
            }
            let configuration = NSWorkspace.OpenConfiguration()
            let semaphore = DispatchSemaphore(value: 0)
            final class OpenResult: @unchecked Sendable { var error: Error? }
            let result = OpenResult()
            workspace.openApplication(at: URL(fileURLWithPath: "/Applications/\(name).app"), configuration: configuration) { _, thrown in
                result.error = thrown
                semaphore.signal()
            }
            semaphore.wait()
            if let error = result.error {
                throw CommanderError.internalFailure(error.localizedDescription)
            }
            return .object(["name": .string(name), "opened": .bool(true), "source": .string("nsworkspace")])
        case "quit", "focus":
            let name = try AdapterSupport.require(request.arguments, "name")
            if ExecutionEnvironment.isTestMode(environment) {
                return .object(["name": .string(name), request.action == "quit" ? "quit" : "focused": .bool(true), "source": .string("test_fixture")])
            }
            let verb = request.action == "quit" ? "quit" : "activate"
            let script = "tell application \"\(name.replacingOccurrences(of: "\"", with: "\\\""))\" to \(verb)"
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
            process.arguments = ["-e", script]
            try process.run()
            process.waitUntilExit()
            guard process.terminationStatus == 0 else {
                throw CommanderError.internalFailure("Failed to \(request.action) app")
            }
            return .object(["name": .string(name), request.action == "quit" ? "quit" : "focused": .bool(true), "source": .string("applescript")])
        default:
            throw CommanderError.invalidCommand("Unsupported apps action")
        }
    }
}

public struct ProcessesAdapter: CommanderAdapter {
    public let descriptor = AdapterDescriptor(
        name: "processes",
        domain: .processes,
        version: "0.2.0",
        supportedCommands: ["processes entries list", "processes entries get"],
        sources: [.filesystem],
        riskLevel: "low",
        isImplemented: true,
        requiresOSPermission: false,
        coverageLevel: "read_only",
        supportsSearch: false,
        supportsDelete: false
    )

    public init() {}

    public func supports(resource: String, action: String) -> Bool {
        resource == "entries" && ["list", "get"].contains(action)
    }

    public func execute(request: CommandRequest, environment: [String : String]) throws -> JSONValue {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/ps")
        process.arguments = ["-axo", "pid=,ppid=,comm="]
        let pipe = Pipe()
        process.standardOutput = pipe
        try process.run()
        let output = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        process.waitUntilExit()
        let items: [[String: JSONValue]] = output.split(separator: "\n").compactMap { line in
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            let parts = trimmed.split(separator: " ", maxSplits: 2, omittingEmptySubsequences: true)
            guard parts.count == 3 else { return nil }
            return [
                "id": .string(String(parts[0])),
                "pid": .integer(Int(parts[0]) ?? 0),
                "ppid": .integer(Int(parts[1]) ?? 0),
                "command": .string(String(parts[2])),
                "source": .string("ps"),
            ]
        }
        let limitedItems = Array(items.prefix(Int(request.arguments["limit"] ?? "200") ?? 200))

        switch request.action {
        case "list":
            return .array(limitedItems.map(JSONValue.object))
        case "get":
            let id = try AdapterSupport.require(request.arguments, "id")
            guard let match = items.first(where: { $0["id"]?.stringValue == id }) else {
                throw CommanderError.notFound("Unknown process \(id)")
            }
            return .object(match)
        default:
            throw CommanderError.invalidCommand("Unsupported processes action")
        }
    }
}

public struct ScreenshotsAdapter: CommanderAdapter {
    public let descriptor = AdapterDescriptor(
        name: "screenshots",
        domain: .screenshots,
        version: "0.2.0",
        supportedCommands: ["screenshots entries capture"],
        sources: [.filesystem],
        riskLevel: "low",
        isImplemented: true,
        requiresOSPermission: false,
        coverageLevel: "crud",
        supportsSearch: false,
        supportsDelete: false
    )

    public init() {}

    public func supports(resource: String, action: String) -> Bool {
        resource == "entries" && action == "capture"
    }

    public func execute(request: CommandRequest, environment: [String : String]) throws -> JSONValue {
        let path = try request.arguments["path"] ?? StatePaths.ensureStateDirectory(environment: environment).appendingPathComponent("capture-\(UUID().uuidString).png").path
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
        process.arguments = ["-x", path]
        try process.run()
        process.waitUntilExit()
        guard process.terminationStatus == 0 else {
            throw CommanderError.internalFailure("Failed to capture screenshot")
        }
        return .object(["path": .string(path), "captured": .bool(true), "source": .string("screencapture")])
    }
}
