import SwiftUI

@main
struct ClawJSApp: App {
    @StateObject private var chatService = ChatService()
    @AppStorage(PersistentSurfaceKeys.selectedAppearance) private var selectedAppearance: AppearanceMode = .system
    @AppStorage(PersistentSurfaceKeys.appLanguage) private var appLanguage = ""

    var body: some Scene {
        WindowGroup {
            ConversationListView()
                .environmentObject(chatService)
                .preferredColorScheme(selectedAppearance.colorScheme)
                .id(appLanguage)
        }
    }
}
