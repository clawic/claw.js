import SwiftUI
import AVFoundation

struct ChatView: View {
    @EnvironmentObject private var chatService: ChatService
    let conversation: Conversation
    @Binding var navigationPath: NavigationPath
    @State private var messageText = ""
    @State private var activeConversationId: UUID?
    @StateObject private var audioService = AudioService()

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

    private var isThinking: Bool {
        currentConversation.status == .thinking
    }

    private var isStreaming: Bool {
        currentConversation.status == .streaming
    }

    private var isBusy: Bool {
        isThinking || isStreaming
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            messagesView
                .padding(.bottom, 60)
            inputArea
        }
        .safeAreaInset(edge: .top) {
            customNavBar
        }
        .background(Color(.systemBackground))
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .onAppear {
            chatService.startViewing(conversationId: conversationId)
            chatService.loadMessages(for: conversationId)
        }
        .onDisappear {
            chatService.stopViewing(conversationId: conversationId)
            if audioService.isRecording {
                audioService.cancelRecording()
            }
        }
    }

    // MARK: - Custom Nav Bar

    private var customNavBar: some View {
        HStack(spacing: 8) {
            Button {
                navigationPath.removeLast()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.primary)
                    .frame(width: 36, height: 36)
            }
            .glassEffect(.regular, in: .circle)

            HStack(spacing: 6) {
                if let project {
                    Text(project.name)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.primary)
                        .lineLimit(1)
                }
                Text(agent?.name ?? "Agent")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.primary)
                    .lineLimit(1)
            }
            .padding(.horizontal, 14)
            .frame(height: 36)
            .glassEffect(.regular, in: .capsule)

            Spacer()

            HStack(spacing: -4) {
                Button {
                    guard let agentId = agent?.id ?? chatService.agents.first?.id,
                          let projectId = currentConversation.projectId ?? chatService.defaultProject(for: agentId)?.id,
                          let newId = chatService.createConversation(agentId: agentId, projectId: projectId) else { return }
                    messageText = ""
                    activeConversationId = newId
                } label: {
                    Image("EditIcon")
                        .renderingMode(.template)
                        .resizable()
                        .scaledToFit()
                        .frame(width: 16, height: 16)
                        .foregroundColor(.primary)
                        .frame(width: 36, height: 36)
                }
                Button { } label: {
                    VStack(spacing: 5) {
                        RoundedRectangle(cornerRadius: 1.5)
                            .fill(Color.primary)
                            .frame(width: 16, height: 2.5)
                        RoundedRectangle(cornerRadius: 1.5)
                            .fill(Color.primary)
                            .frame(width: 12, height: 2.5)
                    }
                    .frame(width: 36, height: 36)
                }
            }
            .padding(.horizontal, 4)
            .glassEffect(.regular, in: .capsule)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 8)
    }

    // MARK: - Messages

    private var messagesView: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 20) {
                    ForEach(currentConversation.messages) { message in
                        let isStreamingMsg = isStreaming
                            && message.id == currentConversation.messages.last?.id
                            && message.role == .agent
                        MessageRow(
                            message: message,
                            isStreaming: isStreamingMsg,
                            onStreamingDone: {
                                chatService.finishStreaming(conversationId: conversationId)
                            }
                        )
                        .id(message.id)
                    }

                    if isThinking {
                        ThinkingIndicatorView()
                            .id("thinking")
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 16)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: currentConversation.messages.count) { _, _ in
                scrollToBottom(proxy)
            }
            .onChange(of: isThinking) { _, _ in
                scrollToBottom(proxy)
            }
            .onChange(of: isStreaming) { _, _ in
                scrollToBottom(proxy)
            }
            .onAppear {
                scrollToBottom(proxy)
            }
        }
    }

    private func scrollToBottom(_ proxy: ScrollViewProxy) {
        withAnimation(.easeOut(duration: 0.25)) {
            if isThinking {
                proxy.scrollTo("thinking", anchor: .bottom)
            } else if let lastId = currentConversation.messages.last?.id {
                proxy.scrollTo(lastId, anchor: .bottom)
            }
        }
    }

    // MARK: - Input Area

    private var inputArea: some View {
        Group {
            if audioService.isRecording {
                VoiceRecordingOverlay(
                    audioService: audioService,
                    onCancel: {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            audioService.cancelRecording()
                        }
                    },
                    onSend: {
                        sendVoiceMessage()
                    }
                )
            } else {
                ChatInputBar(
                    text: $messageText,
                    placeholder: isBusy ? L10n.Chat.waiting : L10n.Chat.messagePlaceholder,
                    isDisabled: isBusy,
                    isGenerating: isBusy,
                    autofocus: true,
                    onSend: sendMessage,
                    onStop: cancelGeneration,
                    onVoiceRecord: startRecording
                )
            }
        }
        .animation(.easeInOut(duration: 0.2), value: audioService.isRecording)
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

    private func startRecording() {
        AVAudioApplication.requestRecordPermission { granted in
            DispatchQueue.main.async {
                guard granted else {
                    print("[ChatView] Microphone permission denied")
                    return
                }
                withAnimation(.easeInOut(duration: 0.2)) {
                    audioService.startRecording()
                }
            }
        }
    }

    private func sendVoiceMessage() {
        guard let result = audioService.finishRecording() else { return }

        let fileURL = result.url
        let duration = result.duration
        let waveformSamples = result.waveformSamples

        // Read file data for storage and playback
        guard let audioData = try? Data(contentsOf: fileURL) else {
            print("[ChatView] Failed to read recorded audio file")
            return
        }

        let attachment = Attachment(
            name: "voice-\(formatDuration(duration)).m4a",
            mimeType: "audio/mp4",
            data: audioData,
            fileURL: fileURL,
            duration: duration,
            waveformSamples: waveformSamples
        )

        chatService.sendVoiceMessage(in: conversationId, attachment: attachment)
    }

    private func formatDuration(_ seconds: TimeInterval) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%02d-%02d", mins, secs)
    }
}

// MARK: - Message Row

struct MessageRow: View {
    let message: Message
    var isStreaming: Bool = false
    var onStreamingDone: (() -> Void)? = nil

    private var isUser: Bool { message.role == .user }

    var body: some View {
        if isUser {
            HStack {
                Spacer()
                VStack(alignment: .trailing, spacing: 6) {
                    if let audio = message.audioAttachment {
                        VoiceNotePlayerView(attachment: audio)
                    }
                    if !message.text.isEmpty && message.text != "[Voice message]" {
                        Text(message.text)
                            .font(.system(size: 15))
                            .foregroundColor(.primary)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .background(Color(.systemGray5))
                            .clipShape(RoundedRectangle(cornerRadius: 18))
                    }
                }
            }
        } else {
            VStack(alignment: .leading, spacing: 12) {
                if isStreaming {
                    StreamingMarkdownText(text: message.text, onDone: onStreamingDone)
                } else {
                    MarkdownView(text: message.text)
                        .foregroundColor(.primary)
                }

                if !isStreaming && !message.text.isEmpty {
                    MessageActions()
                        .transition(.opacity)
                        .animation(.easeIn(duration: 0.3), value: isStreaming)
                }
            }
        }
    }
}

// MARK: - Streaming Markdown Text

struct StreamingMarkdownText: View {
    let text: String
    var onDone: (() -> Void)?
    @State private var displayLen: Int = 0
    @State private var timer: Timer?

    private var visibleText: String {
        String(text.prefix(displayLen))
    }

    var body: some View {
        MarkdownView(text: visibleText)
            .foregroundColor(.primary)
            .onAppear { startStreaming() }
            .onDisappear { timer?.invalidate(); timer = nil }
            .onChange(of: text) { _, newValue in
                if displayLen >= newValue.count {
                    return
                }
                if timer == nil {
                    startStreaming()
                }
            }
    }

    private func startStreaming() {
        timer?.invalidate()
        displayLen = 0
        timer = Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { t in
            displayLen = min(displayLen + 2, text.count)
            if displayLen >= text.count {
                t.invalidate()
                timer = nil
                onDone?()
            }
        }
    }
}

// MARK: - Message Actions

struct MessageActions: View {
    var body: some View {
        HStack(spacing: 12) {
            actionButton("doc.on.doc")
            actionButton("speaker.wave.2")
            actionButton("hand.thumbsup")
            actionButton("hand.thumbsdown")
            actionButton("square.and.arrow.up")
            actionButton("ellipsis")
        }
    }

    private func actionButton(_ systemName: String) -> some View {
        Button {
        } label: {
            Image(systemName: systemName)
                .font(.system(size: 12))
                .foregroundColor(Color(.systemGray))
        }
    }
}
