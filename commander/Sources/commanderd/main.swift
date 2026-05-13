import Foundation
import ClawHostAdapters
import ClawHostKit

@main
struct CommanderDaemon {
    static func main() {
        var environment = ProcessInfo.processInfo.environment
        environment["COMMANDER_RUNTIME_TRANSPORT"] = RuntimeInstaller.legacySocketRuntimeTransport

        do {
            let service = try CommandService(environment: environment, registry: DefaultRegistry.make())
            let statusStore = try DaemonStatusStore(environment: environment)
            try statusStore.write(
                DaemonHealth(
                    running: true,
                    pid: getpid(),
                    socketPath: try StatePaths.daemonSocketFile(environment: environment).path,
                    startedAt: Timestamp.now()
                )
            )
            let server = try DaemonSocketServer(service: service, environment: environment)

            signal(SIGINT) { _ in exit(0) }
            signal(SIGTERM) { _ in exit(0) }

            defer {
                try? statusStore.clear()
                server.stop()
            }

            try server.serve()
        } catch {
            fputs("commanderd failed: \(error.localizedDescription)\n", stderr)
            exit(1)
        }
    }
}
