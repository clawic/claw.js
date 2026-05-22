import Foundation

public enum AdapterAvailability: String, Codable, Sendable {
    case available
    case degraded
    case unavailable
}

public enum AdapterAvailabilityReason: String, Codable, Sendable {
    case ok
    case permissionMissing = "permission_missing"
    case automationTimeout = "automation_timeout"
    case automationDenied = "automation_denied"
    case appMissing = "app_missing"
}

public struct AdapterHealthStatus: Equatable, Sendable {
    public let availability: AdapterAvailability
    public let reason: AdapterAvailabilityReason

    public init(availability: AdapterAvailability, reason: AdapterAvailabilityReason) {
        self.availability = availability
        self.reason = reason
    }
}

public enum AutomationSupport {
    public static func appExists(_ appName: String) -> Bool {
        let candidates = MacCareHostSystemRoutes.applicationBundleCandidates(named: appName)
        return candidates.contains(where: { FileManager.default.fileExists(atPath: $0) })
    }

    public static func runProcess(
        executable: String,
        arguments: [String],
        environment: [String: String]? = nil,
        timeout: TimeInterval? = nil
    ) throws -> String {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        if let environment {
            process.environment = environment
        }
        let stdout = Pipe()
        let stderr = Pipe()
        process.standardOutput = stdout
        process.standardError = stderr
        try process.run()
        if let timeout {
            let deadline = Date().addingTimeInterval(timeout)
            while process.isRunning && Date() < deadline {
                Thread.sleep(forTimeInterval: 0.1)
            }
            if process.isRunning {
                process.terminate()
                throw CommanderError.adapterUnavailable("Automation timed out for \(executable)")
            }
        } else {
            process.waitUntilExit()
        }

        let output = String(data: stdout.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        let error = String(data: stderr.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        guard process.terminationStatus == 0 else {
            let message = error.trimmingCharacters(in: .whitespacesAndNewlines)
            throw CommanderError.internalFailure(message.isEmpty ? "Process failed: \(executable)" : message)
        }
        return output
    }

    public static func runAppleScript(appName: String, script: String, timeout: TimeInterval? = nil) throws -> String {
        guard appExists(appName) else {
            throw CommanderError.notFound("\(appName) is not installed")
        }
        do {
            return try runProcess(executable: MacCareHostSystemRoutes.osascriptCLI, arguments: ["-e", script], timeout: timeout)
        } catch {
            throw mappedAutomationError(error, appName: appName)
        }
    }

    public static func preflightAppleScript(
        appName: String,
        script: String? = nil,
        timeout: TimeInterval = 1
    ) -> AdapterHealthStatus {
        guard appExists(appName) else {
            return AdapterHealthStatus(availability: .unavailable, reason: .appMissing)
        }
        let probeScript = script ?? "tell application \"\(escapeAppleScript(appName))\" to return \"ok\""
        do {
            _ = try runAppleScript(appName: appName, script: probeScript, timeout: timeout)
            return AdapterHealthStatus(availability: .available, reason: .ok)
        } catch {
            switch availabilityReason(from: error) {
            case .automationDenied:
                return AdapterHealthStatus(availability: .degraded, reason: .automationDenied)
            case .automationTimeout:
                return AdapterHealthStatus(availability: .degraded, reason: .automationTimeout)
            case .appMissing:
                return AdapterHealthStatus(availability: .unavailable, reason: .appMissing)
            case .ok, .permissionMissing:
                return AdapterHealthStatus(availability: .degraded, reason: .automationDenied)
            }
        }
    }

    public static func availabilityReason(from error: Error) -> AdapterAvailabilityReason {
        let message = normalizedErrorMessage(error)
        if message.contains("is not installed") {
            return .appMissing
        }
        if message.contains("timed out") {
            return .automationTimeout
        }
        if message.contains("not authorized")
            || message.contains("not permitted")
            || message.contains("(-1743)")
            || message.contains("erraeeventnotpermitted") {
            return .automationDenied
        }
        return .automationDenied
    }

    public static func escapeAppleScript(_ value: String) -> String {
        value
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
    }

    private static func mappedAutomationError(_ error: Error, appName: String) -> CommanderError {
        switch availabilityReason(from: error) {
        case .appMissing:
            return CommanderError.notFound("\(appName) is not installed")
        case .automationTimeout:
            return CommanderError.adapterUnavailable("\(appName) automation timed out")
        case .automationDenied:
            return CommanderError.permissionDenied("\(appName) automation denied")
        case .ok, .permissionMissing:
            return CommanderError.internalFailure(normalizedErrorMessage(error))
        }
    }

    private static func normalizedErrorMessage(_ error: Error) -> String {
        if let commanderError = error as? CommanderError {
            return commanderError.payload.message.lowercased()
        }
        return error.localizedDescription.lowercased()
    }
}
