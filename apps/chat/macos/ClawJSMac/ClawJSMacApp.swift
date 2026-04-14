import SwiftUI
import AppKit

@main
struct ClawJSMacApp: App {
    @StateObject private var chatService = ChatService()
    @AppStorage("selectedAppearance") private var selectedAppearance: AppearanceMode = .system
    @AppStorage("appLanguage") private var appLanguage = ""

    init() {
        // Clear any stale window state that might prevent window creation
        UserDefaults.standard.removeObject(forKey: "NSWindow Frame main")
        UserDefaults.standard.removeObject(forKey: "NSWindow Frame SwiftUI")
    }

    var body: some Scene {
        WindowGroup(L10n.General.appName) {
            RootSplitView()
                .environmentObject(chatService)
                .preferredColorScheme(.dark)
                .frame(minWidth: 860, minHeight: 560)
                .id(appLanguage)
                .onAppear {
                    // Ensure the window is visible and properly sized
                    DispatchQueue.main.async {
                        if let window = NSApp.windows.first(where: { $0.contentView != nil }) {
                            window.makeKeyAndOrderFront(nil)
                            if window.frame.width < 100 || window.frame.height < 100 {
                                window.setFrame(NSRect(x: 200, y: 200, width: 1120, height: 720), display: true)
                            }
                        }
                    }
                }
        }
        .defaultSize(width: 1120, height: 720)
        .defaultPosition(.center)
        .windowResizability(.contentMinSize)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button(L10n.Home.newChat) {
                    NotificationCenter.default.post(name: .clawNewChatRequested, object: nil)
                }
                .keyboardShortcut("n", modifiers: .command)
            }
        }

        Settings {
            SettingsView()
                .environmentObject(chatService)
                .preferredColorScheme(selectedAppearance.colorScheme)
                .frame(width: 520, height: 620)
                .id(appLanguage)
        }
    }
}

extension Notification.Name {
    static let clawNewChatRequested = Notification.Name("clawjs.mac.newChatRequested")
}
