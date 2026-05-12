import Foundation

public enum DaemonLauncher {
    public static func start(environment: [String: String] = ProcessInfo.processInfo.environment) throws {
        if waitUntilAvailable(environment: environment, timeout: 0.2) {
            return
        }
        if RuntimeInstaller.preferredRuntimeTransport(environment: environment) == RuntimeInstaller.appOwnedRuntimeTransport {
            try startAppRuntime(environment: environment)
            return
        }
        try startLegacySocketDaemon(environment: environment)
    }

    public static func waitUntilAvailable(environment: [String: String] = ProcessInfo.processInfo.environment, timeout: TimeInterval = 3.0) -> Bool {
        let started = Date()
        while Date().timeIntervalSince(started) < timeout {
            if let client = try? DaemonClient(environment: environment),
               let response = try? client.send(
                CommandRequest(
                    domain: .system,
                    resource: "daemon",
                    action: "health",
                    arguments: [:],
                    clientContext: .current()
                )
               ),
               response.ok == true {
                return true
            }
            Thread.sleep(forTimeInterval: 0.1)
        }
        return false
    }

    public static func stop(environment: [String: String] = ProcessInfo.processInfo.environment) throws {
        if RuntimeInstaller.preferredRuntimeTransport(environment: environment) == RuntimeInstaller.appOwnedRuntimeTransport {
            try stopAppRuntime(environment: environment)
            return
        }
        let client = try DaemonClient(environment: environment)
        _ = try client.send(
            CommandRequest(
                domain: .system,
                resource: "daemon",
                action: "stop",
                arguments: [:],
                clientContext: .current()
            )
        )
    }

    public static func restart(environment: [String: String] = ProcessInfo.processInfo.environment) throws {
        try? stop(environment: environment)
        Thread.sleep(forTimeInterval: 0.3)
        try start(environment: environment)
    }

    public static func daemonBinaryPath(executablePath: String = CommandLine.arguments.first ?? "") throws -> String {
        let currentURL = URL(fileURLWithPath: executablePath)
        let directory = currentURL.deletingLastPathComponent()
        let sibling = directory.appendingPathComponent("commanderd")
        if FileManager.default.isExecutableFile(atPath: sibling.path) {
            return sibling.path
        }
        let builtProduct = URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent(".build/debug/commanderd")
        if FileManager.default.isExecutableFile(atPath: builtProduct.path) {
            return builtProduct.path
        }
        throw CommanderError.notFound("Unable to locate commanderd binary")
    }

    private static func startLegacySocketDaemon(environment: [String: String]) throws {
        let daemonBinary = try daemonBinaryPath()
        let process = Process()
        process.executableURL = URL(fileURLWithPath: daemonBinary)
        process.arguments = ["serve"]
        process.environment = environment.merging(["COMMANDER_RUNTIME_TRANSPORT": RuntimeInstaller.legacySocketRuntimeTransport]) { _, new in new }
        process.standardInput = nil
        process.standardOutput = nil
        process.standardError = nil
        try process.run()
    }

    private static func startAppRuntime(environment: [String: String]) throws {
        let appExecutable = try RuntimeInstaller.appExecutablePath(environment: environment)
            .unwrap(or: CommanderError.notFound("Unable to locate Commander.app executable"))

        let daemonBinaryPath = FileManager.default.isExecutableFile(atPath: appExecutable)
            ? appExecutable
            : try daemonBinaryPath()

        guard RuntimeInstaller.appExecutablePath(environment: environment) != nil else {
            throw CommanderError.notFound("Unable to locate Commander.app executable")
        }

        let plistPath = try RuntimeInstaller.installLaunchAgent(
            daemonBinaryPath: daemonBinaryPath,
            environment: environment
        )
        let launchdTarget = launchdTarget(environment: environment)
        _ = runLaunchctl(arguments: ["bootout", launchdTarget + "/\(RuntimeInstaller.launchAgentLabel(environment: environment))"], environment: environment)

        let bootstrap = runLaunchctl(arguments: ["bootstrap", launchdTarget, plistPath], environment: environment)
        guard bootstrap.status == 0 else {
            throw CommanderError.transport("Unable to bootstrap app runtime: \(bootstrap.output)")
        }

        let kickstart = runLaunchctl(arguments: ["kickstart", "-k", launchdTarget + "/\(RuntimeInstaller.launchAgentLabel(environment: environment))"], environment: environment)
        guard kickstart.status == 0 else {
            throw CommanderError.transport("Unable to start app runtime: \(kickstart.output)")
        }
    }

    private static func stopAppRuntime(environment: [String: String]) throws {
        if let client = try? AppRuntimeClient(environment: environment) {
            _ = try? client.send(
                CommandRequest(
                    domain: .system,
                    resource: "daemon",
                    action: "stop",
                    arguments: [:],
                    clientContext: .current()
                ),
                timeout: 5
            )
        }

        let launchdTarget = launchdTarget(environment: environment)
        _ = runLaunchctl(arguments: ["bootout", launchdTarget + "/\(RuntimeInstaller.launchAgentLabel(environment: environment))"], environment: environment)

        if let status = try? DaemonStatusStore(environment: environment).read(),
           let pid = status.pid {
            kill(pid, SIGTERM)
        }
    }

    private static func launchdTarget(environment: [String: String]) -> String {
        let uidString = environment["UID"] ?? ProcessInfo.processInfo.environment["UID"] ?? String(getuid())
        return "gui/\(uidString)"
    }

    @discardableResult
    private static func runLaunchctl(arguments: [String], environment: [String: String]) -> (status: Int32, output: String) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/launchctl")
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
}

private extension Optional {
    func unwrap(or error: @autoclosure () -> Error) throws -> Wrapped {
        guard let value = self else {
            throw error()
        }
        return value
    }
}
