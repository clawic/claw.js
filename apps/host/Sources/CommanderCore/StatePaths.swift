import Foundation

public enum StatePaths {
    public static func stateDirectory(environment: [String: String] = ProcessInfo.processInfo.environment) -> URL {
        if let override = environment["CLAW_HOST_HOME"], !override.isEmpty {
            return URL(fileURLWithPath: override, isDirectory: true)
        }
        let host = HostConfiguration.current(environment: environment)
        return FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library", isDirectory: true)
            .appendingPathComponent("Application Support", isDirectory: true)
            .appendingPathComponent(host.appSupportDirectoryName, isDirectory: true)
    }

    public static func ensureStateDirectory(environment: [String: String] = ProcessInfo.processInfo.environment) throws -> URL {
        let url = stateDirectory(environment: environment)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    public static func capabilitiesFile(environment: [String: String] = ProcessInfo.processInfo.environment) throws -> URL {
        try ensureStateDirectory(environment: environment).appendingPathComponent("capabilities.json")
    }

    public static func logsFile(environment: [String: String] = ProcessInfo.processInfo.environment) throws -> URL {
        try ensureStateDirectory(environment: environment).appendingPathComponent("logs.json")
    }

    public static func daemonSocketFile(environment: [String: String] = ProcessInfo.processInfo.environment) throws -> URL {
        try ensureStateDirectory(environment: environment).appendingPathComponent("daemon.sock")
    }

    public static func daemonStatusFile(environment: [String: String] = ProcessInfo.processInfo.environment) throws -> URL {
        try ensureStateDirectory(environment: environment).appendingPathComponent("daemon-status.json")
    }

    public static func appRuntimeEndpointFile(environment: [String: String] = ProcessInfo.processInfo.environment) throws -> URL {
        try ensureStateDirectory(environment: environment).appendingPathComponent("app-runtime.endpoint")
    }

    public static func cliInstallPath(environment: [String: String] = ProcessInfo.processInfo.environment) throws -> URL {
        if let override = environment["CLAW_HOST_BIN_DIR"], !override.isEmpty {
            return URL(fileURLWithPath: override, isDirectory: true).appendingPathComponent(HostConfiguration.current(environment: environment).cliExecutableName)
        }
        let host = HostConfiguration.current(environment: environment)
        return FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".local", isDirectory: true)
            .appendingPathComponent("bin", isDirectory: true)
            .appendingPathComponent(host.cliExecutableName)
    }

    public static func launchAgentPlistPath(environment: [String: String] = ProcessInfo.processInfo.environment) throws -> URL {
        if let override = environment["CLAW_HOST_LAUNCH_AGENTS_DIR"], !override.isEmpty {
            return URL(fileURLWithPath: override, isDirectory: true).appendingPathComponent("\(RuntimeInstaller.launchAgentLabel(environment: environment)).plist")
        }
        return FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library", isDirectory: true)
            .appendingPathComponent("LaunchAgents", isDirectory: true)
            .appendingPathComponent("\(RuntimeInstaller.launchAgentLabel(environment: environment)).plist")
    }
}
