import Foundation

public struct InstallStatus: Codable, Equatable, Sendable {
    public var cliInstalled: Bool
    public var cliPath: String
    public var launchAgentInstalled: Bool
    public var launchAgentLoaded: Bool
    public var launchAgentPath: String
    public var launchAgentLabel: String
    public var runtimeTransport: String
    public var hostAppRunning: Bool
    public var hostBundlePath: String
    public var appRegisteredAtLogin: Bool
    public var socketFallbackEnabled: Bool

    public init(
        cliInstalled: Bool,
        cliPath: String,
        launchAgentInstalled: Bool,
        launchAgentLoaded: Bool,
        launchAgentPath: String,
        launchAgentLabel: String,
        runtimeTransport: String,
        hostAppRunning: Bool,
        hostBundlePath: String,
        appRegisteredAtLogin: Bool,
        socketFallbackEnabled: Bool
    ) {
        self.cliInstalled = cliInstalled
        self.cliPath = cliPath
        self.launchAgentInstalled = launchAgentInstalled
        self.launchAgentLoaded = launchAgentLoaded
        self.launchAgentPath = launchAgentPath
        self.launchAgentLabel = launchAgentLabel
        self.runtimeTransport = runtimeTransport
        self.hostAppRunning = hostAppRunning
        self.hostBundlePath = hostBundlePath
        self.appRegisteredAtLogin = appRegisteredAtLogin
        self.socketFallbackEnabled = socketFallbackEnabled
    }
}

public enum RuntimeInstaller {
    public static let appOwnedRuntimeTransport = "app_xpc"
    public static let socketRuntimeTransport = "unix_socket"

    public static func launchAgentLabel(environment: [String: String] = ProcessInfo.processInfo.environment) -> String {
        HostConfiguration.current(environment: environment).launchAgentLabel
    }

    public static func appRuntimeMachServiceName(environment: [String: String] = ProcessInfo.processInfo.environment) -> String {
        if let configured = HostConfiguration.current(environment: environment).machServiceName, !configured.isEmpty {
            return configured
        }
        let statePath = StatePaths.stateDirectory(environment: environment).path
        return "com.claw.host.runtime.\(stableIdentifier(for: statePath))"
    }

    public static func installCLI(
        sourceBinaryPath: String,
        destinationPath: String? = nil,
        environment: [String: String] = ProcessInfo.processInfo.environment
    ) throws -> String {
        let resolvedPath = try destinationPath ?? StatePaths.cliInstallPath(environment: environment).path
        let destination = URL(fileURLWithPath: resolvedPath)
        try FileManager.default.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
        if FileManager.default.fileExists(atPath: destination.path) {
            try FileManager.default.removeItem(at: destination)
        }
        try FileManager.default.createSymbolicLink(at: destination, withDestinationURL: URL(fileURLWithPath: sourceBinaryPath))
        return destination.path
    }

    public static func installLaunchAgent(
        daemonBinaryPath: String,
        environment: [String: String] = ProcessInfo.processInfo.environment
    ) throws -> String {
        let plistURL = try StatePaths.launchAgentPlistPath(environment: environment)
        try FileManager.default.createDirectory(at: plistURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        let plist = launchAgentTemplate(daemonBinaryPath: daemonBinaryPath, environment: environment)
        try plist.write(to: plistURL, atomically: true, encoding: .utf8)
        return plistURL.path
    }

    public static func installStatus(environment: [String: String] = ProcessInfo.processInfo.environment) throws -> InstallStatus {
        let cliURL = try StatePaths.cliInstallPath(environment: environment)
        let launchAgentURL = try StatePaths.launchAgentPlistPath(environment: environment)
        let hostBundlePath = appBundlePath(environment: environment) ?? ""
        let runtimeTransport = preferredRuntimeTransport(environment: environment)
        let hostAppRunning = hostProcessIsRunning(environment: environment)
        return InstallStatus(
            cliInstalled: FileManager.default.fileExists(atPath: cliURL.path),
            cliPath: cliURL.path,
            launchAgentInstalled: FileManager.default.fileExists(atPath: launchAgentURL.path),
            launchAgentLoaded: launchAgentIsLoaded(environment: environment),
            launchAgentPath: launchAgentURL.path,
            launchAgentLabel: launchAgentLabel(environment: environment),
            runtimeTransport: runtimeTransport,
            hostAppRunning: hostAppRunning,
            hostBundlePath: hostBundlePath,
            appRegisteredAtLogin: FileManager.default.fileExists(atPath: launchAgentURL.path),
            socketFallbackEnabled: socketFallbackEnabled(environment: environment)
        )
    }

    public static func preferredRuntimeTransport(environment: [String: String] = ProcessInfo.processInfo.environment) -> String {
        if environment["CLAW_HOST_RUNTIME_TRANSPORT"] == socketRuntimeTransport {
            return socketRuntimeTransport
        }
        if ExecutionEnvironment.isTestMode(environment) {
            return socketRuntimeTransport
        }
        if appBundlePath(environment: environment) != nil {
            return appOwnedRuntimeTransport
        }
        return socketRuntimeTransport
    }

    public static func socketFallbackEnabled(environment: [String: String] = ProcessInfo.processInfo.environment) -> Bool {
        environment["CLAW_HOST_DISABLE_SOCKET_FALLBACK"] != "1"
    }

    public static func appBundlePath(environment: [String: String] = ProcessInfo.processInfo.environment) -> String? {
        if let override = environment["CLAW_HOST_APP_BUNDLE"], FileManager.default.fileExists(atPath: override) {
            return override
        }

        let bundlePath = Bundle.main.bundleURL.path
        if Bundle.main.bundleURL.pathExtension == "app", FileManager.default.fileExists(atPath: bundlePath) {
            return bundlePath
        }

        let executableURL = URL(fileURLWithPath: CommandLine.arguments.first ?? "")
        let maybeBundle = executableURL
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        if maybeBundle.pathExtension == "app", FileManager.default.fileExists(atPath: maybeBundle.path) {
            return maybeBundle.path
        }

        let host = HostConfiguration.current(environment: environment)
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let candidates = [
            "\(home)/Applications/\(host.displayName).app",
            "/Applications/\(host.displayName).app",
            "\(home)/Applications/Commander.app",
            "/Applications/Commander.app",
        ]

        return candidates.first(where: { FileManager.default.fileExists(atPath: $0) })
    }

    public static func appExecutablePath(environment: [String: String] = ProcessInfo.processInfo.environment) -> String? {
        guard let bundlePath = appBundlePath(environment: environment) else {
            return nil
        }
        let executable = URL(fileURLWithPath: bundlePath)
            .appendingPathComponent("Contents", isDirectory: true)
            .appendingPathComponent("MacOS", isDirectory: true)
            .appendingPathComponent(HostConfiguration.current(environment: environment).displayName == "Claw" ? "ClawApp" : "CommanderApp")
        if FileManager.default.isExecutableFile(atPath: executable.path) {
            return executable.path
        }
        let legacyExecutable = URL(fileURLWithPath: bundlePath)
            .appendingPathComponent("Contents", isDirectory: true)
            .appendingPathComponent("MacOS", isDirectory: true)
            .appendingPathComponent("CommanderApp")
        return FileManager.default.isExecutableFile(atPath: legacyExecutable.path) ? legacyExecutable.path : nil
    }

    public static func hostProcessIsRunning(environment: [String: String] = ProcessInfo.processInfo.environment) -> Bool {
        guard let executablePath = appExecutablePath(environment: environment) else {
            return false
        }
        if Bundle.main.bundleURL.pathExtension == "app", CommandLine.arguments.first == executablePath {
            return true
        }
        guard let resolvedStatus = try? DaemonStatusStore(environment: environment).read() else {
            return false
        }
        if resolvedStatus.runtimeTransport == appOwnedRuntimeTransport, resolvedStatus.running == true {
            return true
        }
        return false
    }

    public static func launchAgentIsLoaded(environment: [String: String] = ProcessInfo.processInfo.environment) -> Bool {
        if environment["CLAW_HOST_LAUNCH_AGENTS_DIR"] != nil {
            return false
        }

        guard let uid = environment["UID"] ?? ProcessInfo.processInfo.environment["UID"] else {
            return false
        }
        let result = runProcess(
            "/bin/launchctl",
            arguments: ["print", "gui/\(uid)/\(launchAgentLabel(environment: environment))"],
            environment: environment
        )
        return result.status == 0
    }

    private static func launchAgentTemplate(
        daemonBinaryPath: String,
        environment: [String: String]
    ) -> String {
        let statePath = StatePaths.stateDirectory(environment: environment).path
        let launchArguments: [String]
        let machServices: String
        if let executable = appExecutablePath(environment: environment) {
            launchArguments = [
                executable,
                "--runtime-host-only",
            ]
            machServices = """
                <key>MachServices</key>
                <dict>
                    <key>\(appRuntimeMachServiceName(environment: environment))</key>
                    <true/>
                </dict>
            """
        } else {
            launchArguments = [
                daemonBinaryPath,
                "serve",
            ]
            machServices = ""
        }
        let programArguments = launchArguments.map { "                <string>\($0)</string>" }.joined(separator: "\n")
        return """
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
        <plist version="1.0">
        <dict>
            <key>Label</key>
            <string>\(launchAgentLabel(environment: environment))</string>
            <key>ProgramArguments</key>
            <array>
        \(programArguments)
            </array>
        \(machServices)
            <key>EnvironmentVariables</key>
            <dict>
                <key>CLAW_HOST_HOME</key>
                <string>\(statePath)</string>
                <key>CLAW_HOST_RUNTIME_TRANSPORT</key>
                <string>\(appExecutablePath(environment: environment) == nil ? socketRuntimeTransport : appOwnedRuntimeTransport)</string>
                <key>CLAW_HOST_APP_BUNDLE</key>
                <string>\(appBundlePath(environment: environment) ?? "")</string>
            </dict>
            <key>RunAtLoad</key>
            <true/>
            <key>KeepAlive</key>
            <true/>
        </dict>
        </plist>
        """
    }

    @discardableResult
    private static func runProcess(_ launchPath: String, arguments: [String], environment: [String: String]) -> (status: Int32, output: String) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: launchPath)
        process.arguments = arguments
        process.environment = environment
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        do {
            try process.run()
            process.waitUntilExit()
            let output = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            return (process.terminationStatus, output)
        } catch {
            return (1, error.localizedDescription)
        }
    }

    private static func stableIdentifier(for string: String) -> String {
        var hash: UInt64 = 5381
        for byte in string.utf8 {
            hash = ((hash << 5) &+ hash) &+ UInt64(byte)
        }
        return String(hash, radix: 16)
    }
}
