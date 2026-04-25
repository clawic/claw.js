import SwiftUI
import CommanderAdapters
import CommanderCore

struct LaunchPermissionRequest {
    let domains: [Domain]
    let shouldExitAfterRequest: Bool

    static func parse(arguments: [String]) -> LaunchPermissionRequest? {
        guard let flagIndex = arguments.firstIndex(of: "--request-os-permissions") else {
            return nil
        }

        let requestedDomains: [Domain]
        if arguments.indices.contains(flagIndex + 1), !arguments[flagIndex + 1].hasPrefix("--") {
            let rawValue = arguments[flagIndex + 1]
            if rawValue == "all" {
                requestedDomains = PermissionService.requestableDomains
            } else {
                requestedDomains = rawValue
                    .split(separator: ",")
                    .compactMap { Domain(rawValue: String($0)) }
                    .filter { PermissionService.requestableDomains.contains($0) }
            }
        } else {
            requestedDomains = PermissionService.requestableDomains
        }

        guard !requestedDomains.isEmpty else {
            return nil
        }

        return LaunchPermissionRequest(
            domains: requestedDomains,
            shouldExitAfterRequest: arguments.contains("--exit-after-permissions")
        )
    }
}

struct LaunchOptions {
    let permissionRequest: LaunchPermissionRequest?
    let runtimeHostOnly: Bool

    static func parse(arguments: [String]) -> LaunchOptions {
        LaunchOptions(
            permissionRequest: LaunchPermissionRequest.parse(arguments: arguments),
            runtimeHostOnly: arguments.contains("--runtime-host-only")
        )
    }
}

@MainActor
final class CommanderAppDelegate: NSObject, NSApplicationDelegate {

    private var runtimeHost: AppRuntimeHost?
    private let launchOptions = LaunchOptions.parse(arguments: CommandLine.arguments)

    func applicationDidFinishLaunching(_ notification: Notification) {
        startRuntimeHost()
        guard let launchPermissionRequest = launchOptions.permissionRequest else {
            return
        }

        Task { @MainActor in
            for domain in launchPermissionRequest.domains {
                _ = try? PermissionService().requestPermission(for: domain)
            }
            if launchPermissionRequest.shouldExitAfterRequest {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    NSApp.terminate(nil)
                }
            }
        }
    }

    func startRuntimeHost() {
        guard runtimeHost == nil else {
            return
        }
        do {
            let host = try AppRuntimeHost(registry: DefaultRegistry.make())
            try host.start {
                DispatchQueue.main.async {
                    NSApp.terminate(nil)
                }
            }
            runtimeHost = host
        } catch {
            fputs("Commander runtime host failed: \(error.localizedDescription)\n", stderr)
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        runtimeHost?.stop()
    }
}

@main
struct CommanderAppMain: App {
    @StateObject private var model = DashboardModel()
    @NSApplicationDelegateAdaptor(CommanderAppDelegate.self) private var appDelegate
    private let launchOptions = LaunchOptions.parse(arguments: CommandLine.arguments)

    var body: some Scene {
        WindowGroup("Commander") {
            if launchOptions.runtimeHostOnly {
                EmptyView()
                    .frame(width: 1, height: 1)
            } else {
                DashboardView(model: model)
                    .frame(minWidth: 980, minHeight: 700)
            }
        }
        MenuBarExtra("Commander", systemImage: model.health?.running == true ? "bolt.horizontal.circle.fill" : "bolt.horizontal.circle") {
            VStack(alignment: .leading, spacing: 12) {
                Text(model.health?.running == true ? "Daemon activo" : "Daemon parado")
                    .font(.headline)
                Text(model.health?.runtimeTransport ?? model.health?.socketPath ?? "Sin runtime")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Divider()
                Button("Abrir panel") {
                    NSApp.activate(ignoringOtherApps: true)
                }
                Button(model.health?.running == true ? "Parar daemon" : "Arrancar daemon") {
                    Task { await model.toggleDaemon() }
                }
                Button("Refrescar") {
                    Task { await model.refresh() }
                }
            }
            .padding()
            .frame(width: 320)
        }
        .menuBarExtraStyle(.window)
    }
}
