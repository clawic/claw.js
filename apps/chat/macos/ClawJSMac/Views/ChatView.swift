import SwiftUI

struct ChatView: View {
    @EnvironmentObject private var chatService: ChatService
    let conversation: Conversation
    @State private var messageText = ""
    @State private var activeConversationId: UUID?

    private var conversationId: UUID {
        activeConversationId ?? conversation.id
    }

    private var currentConversation: Conversation {
        chatService.conversations.first(where: { $0.id == conversationId }) ?? conversation
    }

    private var agent: Agent? {
        chatService.agent(for: currentConversation.agentId)
    }

    private var project: Project? {
        currentConversation.projectId.flatMap(chatService.project(for:))
    }

    private var isThinking: Bool { currentConversation.status == .thinking }
    private var isStreaming: Bool { currentConversation.status == .streaming }
    private var isBusy: Bool { isThinking || isStreaming }

    var body: some View {
        VStack(spacing: 0) {
            headerBar
            Rectangle().fill(Theme.border).frame(height: 1)
            messagesArea
            ChatInputBar(
                text: $messageText,
                placeholder: isBusy ? L10n.Chat.waiting : "Pedir cambios de seguimiento",
                isDisabled: isBusy,
                isGenerating: isBusy,
                autofocus: true,
                agentName: agent?.name,
                projectName: project?.name,
                onSend: sendMessage,
                onStop: cancelGeneration
            )
        }
        .background(Theme.bg)
        .onAppear {
            chatService.markAsRead(conversationId: conversationId)
            chatService.loadMessages(for: conversationId)
        }
    }

    // MARK: - Header (clean, Discord-inspired)

    private var headerBar: some View {
        HStack(spacing: 10) {
            // Channel-style hash icon
            Image(systemName: "number")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.textMuted)

            Text(currentConversation.title)
                .font(Theme.header)
                .foregroundStyle(Theme.textPrimary)
                .lineLimit(1)

            if let project {
                Text(project.name.lowercased())
                    .font(Theme.caption)
                    .foregroundStyle(Theme.textMuted)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .fill(Theme.hoverBg)
                    )
            }

            Spacer()

            // Stop button (only when busy)
            if isBusy {
                Button(action: cancelGeneration) {
                    Image(systemName: "stop.fill")
                        .font(.system(size: 10))
                        .foregroundStyle(Theme.textSecondary)
                        .frame(width: 28, height: 28)
                        .background(Theme.hoverBg, in: RoundedRectangle(cornerRadius: 6))
                }
                .buttonStyle(.plain)
            }

            // Confirmar button
            Button(action: {}) {
                HStack(spacing: 4) {
                    Image(systemName: "checkmark")
                        .font(.system(size: 10, weight: .semibold))
                    Text("Confirmar")
                        .font(.system(size: 12, weight: .medium))
                }
                .foregroundStyle(Theme.confirmGreen)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(
                    RoundedRectangle(cornerRadius: 5, style: .continuous)
                        .fill(Theme.confirmGreen.opacity(0.1))
                )
            }
            .buttonStyle(.plain)

            // More options
            Button(action: {}) {
                Image(systemName: "ellipsis")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.textMuted)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    // MARK: - Messages area

    private var messagesArea: some View {
        ScrollViewReader { proxy in
            ScrollView(.vertical, showsIndicators: true) {
                LazyVStack(alignment: .leading, spacing: 16) {
                    ForEach(currentConversation.messages) { message in
                        let isStreamingMsg = isStreaming
                            && message.id == currentConversation.messages.last?.id
                            && message.role == .agent
                        MessageEntry(
                            message: message,
                            agent: agent,
                            isStreaming: isStreamingMsg,
                            onStreamingDone: {
                                chatService.finishStreaming(conversationId: conversationId)
                            }
                        )
                        .id(message.id)
                    }

                    if isThinking {
                        ThinkingEntry()
                            .id("thinking")
                    }
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 20)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .onChange(of: currentConversation.messages.count) { _, _ in scrollToBottom(proxy) }
            .onChange(of: isThinking) { _, _ in scrollToBottom(proxy) }
            .onChange(of: isStreaming) { _, _ in scrollToBottom(proxy) }
            .onAppear { scrollToBottom(proxy) }
        }
    }

    private func scrollToBottom(_ proxy: ScrollViewProxy) {
        withAnimation(.easeOut(duration: 0.2)) {
            if isThinking {
                proxy.scrollTo("thinking", anchor: .bottom)
            } else if let lastId = currentConversation.messages.last?.id {
                proxy.scrollTo(lastId, anchor: .bottom)
            }
        }
    }

    // MARK: - Actions

    private func cancelGeneration() {
        chatService.cancelGeneration(in: conversationId)
    }

    private func sendMessage() {
        let text = messageText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        messageText = ""
        chatService.sendMessage(in: conversationId, text: text)
    }
}

// MARK: - Message Entry (flat rows, Discord-style)

struct MessageEntry: View {
    let message: Message
    var agent: Agent?
    var isStreaming: Bool = false
    var onStreamingDone: (() -> Void)? = nil

    private var isUser: Bool { message.role == .user }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // Avatar
            Circle()
                .fill(isUser ? Theme.inputBg : Theme.accent.opacity(0.2))
                .frame(width: 36, height: 36)
                .overlay(
                    Image(systemName: isUser ? "person.fill" : "cpu")
                        .font(.system(size: 14))
                        .foregroundStyle(isUser ? Theme.textMuted : Theme.accent)
                )

            VStack(alignment: .leading, spacing: 4) {
                // Name + timestamp
                HStack(spacing: 8) {
                    Text(isUser ? "Tu" : (agent?.name ?? "Agente"))
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(isUser ? Theme.textPrimary : Theme.accent)
                    Text(message.timestamp, style: .time)
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.textMuted)
                }

                // Message body
                if isStreaming {
                    StreamingText(text: message.text, onDone: onStreamingDone)
                } else {
                    Text(message.text)
                        .font(Theme.body)
                        .foregroundStyle(Theme.textPrimary)
                        .lineSpacing(4)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .textSelection(.enabled)
                }
            }
        }
    }
}

// MARK: - Thinking entry

struct ThinkingEntry: View {
    @State private var elapsed: Int = 0
    @State private var timer: Timer?

    var body: some View {
        HStack(spacing: 6) {
            ProgressView()
                .scaleEffect(0.5)
                .frame(width: 14, height: 14)
            Text("Ha trabajado durante \(formatElapsed(elapsed))")
                .font(Theme.caption)
                .foregroundStyle(Theme.textMuted)
            Image(systemName: "chevron.right")
                .font(.system(size: 8))
                .foregroundStyle(Theme.textMuted)
        }
        .padding(.vertical, 4)
        .onAppear { startTimer() }
        .onDisappear { timer?.invalidate(); timer = nil }
    }

    private func startTimer() {
        elapsed = 0
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            elapsed += 1
        }
    }

    private func formatElapsed(_ seconds: Int) -> String {
        let m = seconds / 60
        let s = seconds % 60
        if m > 0 {
            return "\(m)m \(s)s"
        }
        return "\(s)s"
    }
}

// MARK: - Streaming Text

struct StreamingText: View {
    let text: String
    var onDone: (() -> Void)?
    @State private var displayLen: Int = 0
    @State private var timer: Timer?

    var body: some View {
        Text(text.prefix(displayLen))
            .font(Theme.body)
            .foregroundStyle(Theme.textPrimary)
            .lineSpacing(5)
            .frame(maxWidth: .infinity, alignment: .leading)
            .onAppear { startStreaming() }
            .onDisappear { timer?.invalidate(); timer = nil }
    }

    private func startStreaming() {
        displayLen = 0
        timer = Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { t in
            displayLen = min(displayLen + 2, text.count)
            if displayLen >= text.count {
                t.invalidate()
                onDone?()
            }
        }
    }
}

// MARK: - Message Actions (kept for compatibility)

struct MessageActions: View {
    var body: some View {
        HStack(spacing: 2) {
            actionButton("doc.on.doc")
            actionButton("arrow.clockwise")
        }
    }

    private func actionButton(_ systemName: String) -> some View {
        Button(action: {}) {
            Image(systemName: systemName)
                .font(.system(size: 10))
                .foregroundStyle(Theme.textMuted)
                .frame(width: 22, height: 22)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
