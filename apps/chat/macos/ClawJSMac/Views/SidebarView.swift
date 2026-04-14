import SwiftUI

struct SidebarView: View {
    @EnvironmentObject private var chatService: ChatService
    @Binding var selectedConversation: UUID?
    var onNewChat: () -> Void

    @State private var showSettings = false
    @State private var hoveredThread: UUID?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            topActions
            threadList
            Spacer(minLength: 0)
            bottomBar
        }
        .background(Theme.sidebarBg)
    }

    // MARK: - Top action rows

    private var topActions: some View {
        VStack(alignment: .leading, spacing: 2) {
            // Window drag area
            Color.clear.frame(height: 8)

            actionRow(icon: "square.and.pencil", label: L10n.Home.newChat, action: onNewChat)
            actionRow(icon: "magnifyingglass", label: "Search", action: {})
            actionRow(icon: "square.grid.2x2", label: "Habilidades y aplicaciones", action: {})
            actionRow(icon: "clock.arrow.circlepath", label: "Automatizaciones", action: {})
        }
        .padding(.horizontal, 8)
        .padding(.bottom, 12)
    }

    private func actionRow(icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.textMuted)
                    .frame(width: 20, alignment: .center)
                Text(label)
                    .font(Theme.sidebar)
                    .foregroundStyle(Theme.textSecondary)
                    .lineLimit(1)
                Spacer()
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(
                RoundedRectangle(cornerRadius: 5, style: .continuous)
                    .fill(Color.clear)
            )
            .contentShape(RoundedRectangle(cornerRadius: 5))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Thread list

    private var threadList: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Section header — Discord uppercase style
            HStack {
                Text("HILOS")
                    .font(Theme.sectionHdr)
                    .foregroundStyle(Theme.textMuted)
                    .tracking(0.4)
                Spacer()
                Button(action: {}) {
                    Image(systemName: "plus")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(Theme.textMuted)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 18)
            .padding(.top, 14)
            .padding(.bottom, 6)

            // Thread rows
            ScrollView(.vertical, showsIndicators: false) {
                LazyVStack(spacing: 1) {
                    ForEach(chatService.sortedConversations) { conv in
                        threadRow(conv)
                    }
                }
                .padding(.horizontal, 8)
            }
        }
    }

    private func threadRow(_ conv: Conversation) -> some View {
        let isSelected = selectedConversation == conv.id
        let isHovered = hoveredThread == conv.id

        return Button {
            selectedConversation = conv.id
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "number")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(isSelected ? Theme.textPrimary : Theme.textMuted)
                    .frame(width: 18, alignment: .center)

                Text(conv.title)
                    .font(Theme.sidebar)
                    .foregroundStyle(isSelected ? Theme.textPrimary : (isHovered ? Theme.textSecondary : Theme.textMuted))
                    .lineLimit(1)

                Spacer(minLength: 4)

                if conv.status == .thinking || conv.status == .streaming {
                    ProgressView()
                        .scaleEffect(0.4)
                        .frame(width: 14, height: 14)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(
                RoundedRectangle(cornerRadius: 5, style: .continuous)
                    .fill(isSelected ? Theme.selectedBg : (isHovered ? Theme.hoverBg : Color.clear))
            )
            .contentShape(RoundedRectangle(cornerRadius: 5))
        }
        .buttonStyle(.plain)
        .onHover { hovering in hoveredThread = hovering ? conv.id : nil }
        .contextMenu {
            Button(role: .destructive) {
                chatService.deleteConversation(conv.id)
                if selectedConversation == conv.id {
                    selectedConversation = nil
                }
            } label: {
                Label(L10n.General.delete, systemImage: "trash")
            }
        }
    }

    // MARK: - Bottom bar (Discord-style user area)

    private var bottomBar: some View {
        HStack(spacing: 10) {
            // User avatar placeholder
            Circle()
                .fill(Theme.inputBg)
                .frame(width: 32, height: 32)
                .overlay(
                    Image(systemName: "person.fill")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.textMuted)
                )

            VStack(alignment: .leading, spacing: 1) {
                Text("ClawJS")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.textPrimary)
                    .lineLimit(1)
                Text("Local")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.textMuted)
            }

            Spacer()

            Button {
                showSettings = true
            } label: {
                Image(systemName: "gearshape.fill")
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.textMuted)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Color(nsColor: NSColor(red: 0.14, green: 0.15, blue: 0.16, alpha: 1)))  // slightly darker, like Discord
        .sheet(isPresented: $showSettings) {
            SettingsView()
                .environmentObject(chatService)
                .frame(width: 480, height: 520)
        }
    }
}
