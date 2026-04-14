import SwiftUI

// MARK: - Navigation Target

enum NavigationTarget: Hashable {
    case conversation(UUID)
    case agentDetail(UUID)
    case createAgent
    case project(UUID)
    case allProjects
    case topic(UUID)
    case settings
}

// MARK: - Sidebar item

enum SidebarItem: Hashable {
    case project(UUID)
    case agent(UUID)
    case conversation(UUID)
}

struct RootSplitView: View {
    @EnvironmentObject private var chatService: ChatService
    @State private var selectedConversation: UUID?

    var body: some View {
        HStack(spacing: 0) {
            SidebarView(
                selectedConversation: $selectedConversation,
                onNewChat: startNewChat
            )
            .frame(width: 240)

            detailPanel
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(Theme.bg)
        .onReceive(NotificationCenter.default.publisher(for: .clawNewChatRequested)) { _ in
            startNewChat()
        }
    }

    // MARK: - Detail

    @ViewBuilder
    private var detailPanel: some View {
        if let convId = selectedConversation,
           let conv = chatService.conversations.first(where: { $0.id == convId }) {
            ChatView(conversation: conv)
        } else {
            VStack(spacing: 8) {
                Image(systemName: "bubble.left.and.text.bubble.right")
                    .font(.system(size: 32))
                    .foregroundStyle(Theme.textMuted)
                Text("Cmd+N para crear un hilo nuevo")
                    .font(Theme.caption)
                    .foregroundStyle(Theme.textMuted)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.bg)
        }
    }

    // MARK: - Actions

    private func startNewChat() {
        let context = chatService.defaultConversationContext()
        let agent = context?.agent ?? chatService.agents.first
        let project = context?.project ?? chatService.projects.first
        guard let agent, let project,
              let convId = chatService.createConversation(
                agentId: agent.id,
                projectId: project.id
              )
        else { return }
        selectedConversation = convId
    }
}
