import Foundation
import Combine

final class ChatService: ObservableObject {
    @Published var agents: [Agent]
    @Published var projects: [Project]
    @Published var topics: [Topic]
    @Published var conversations: [Conversation]
    @Published var searchText: String = ""
    @Published var isConnected: Bool = false
    @Published var canCreateAgents: Bool = false

    private let api = APIService.shared

    var viewingConversationId: UUID?

    private var sessionMap: [UUID: String] = [:]
    private var agentMap: [UUID: String] = [:]
    private var projectMap: [UUID: String] = [:]
    private var reverseAgentMap: [String: UUID] = [:]
    private var reverseProjectMap: [String: UUID] = [:]
    private var projectAgents: [UUID: [UUID]] = [:]
    private var agentProjects: [UUID: [UUID]] = [:]
    private var activeStreamTask: Task<Void, Never>?
    private var reconnectTask: Task<Void, Never>?
    private var discoveryObserver: Any?
    private var reconnectAttempt = 0
    private let maxReconnectDelay: TimeInterval = 30

    var filteredProjects: [Project] {
        if searchText.isEmpty { return projects }
        return projects.filter { $0.name.localizedCaseInsensitiveContains(searchText) }
    }

    var sortedConversations: [Conversation] {
        let filtered: [Conversation]
        if searchText.isEmpty {
            filtered = conversations
        } else {
            filtered = conversations.filter { conv in
                let agentName = agent(for: conv.agentId)?.name ?? ""
                let projectName = conv.projectId.flatMap(project(for:))?.name ?? ""
                return agentName.localizedCaseInsensitiveContains(searchText)
                    || projectName.localizedCaseInsensitiveContains(searchText)
                    || conv.title.localizedCaseInsensitiveContains(searchText)
            }
        }
        return filtered.sorted { a, b in
            if a.status != b.status { return a.status < b.status }
            return a.lastActivityTime > b.lastActivityTime
        }
    }

    init() {
        self.agents = MockData.agents
        self.projects = MockData.projects
        self.topics = []
        self.conversations = []

        // Start Bonjour discovery for local relay instances
        RelayDiscovery.shared.startBrowsing()

        // Auto-reconnect when a relay is discovered on the network
        discoveryObserver = NotificationCenter.default.addObserver(
            forName: .relayDiscovered,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.reconnect()
        }

        loadRemoteBootstrap()
    }

    deinit {
        reconnectTask?.cancel()
        if let observer = discoveryObserver {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    private func localAgentId(for remoteId: String) -> UUID {
        if let existing = reverseAgentMap[remoteId] {
            return existing
        }
        let localId = UUID()
        reverseAgentMap[remoteId] = localId
        agentMap[localId] = remoteId
        return localId
    }

    private func localProjectId(for remoteId: String) -> UUID {
        if let existing = reverseProjectMap[remoteId] {
            return existing
        }
        let localId = UUID()
        reverseProjectMap[remoteId] = localId
        projectMap[localId] = remoteId
        return localId
    }

    // MARK: - Remote Loading

    private func loadRemoteBootstrap() {
        Task {
            do {
                let bootstrap = try await api.bootstrap()
                let remoteAgents = bootstrap.agents
                let remoteProjects = bootstrap.projects
                let remoteSessions = bootstrap.sessions

                var nextAgents: [Agent] = []
                var nextProjects: [Project] = []
                var nextProjectAgents: [UUID: [UUID]] = [:]
                var nextAgentProjects: [UUID: [UUID]] = [:]

                for remoteProject in remoteProjects {
                    let localProjectId = localProjectId(for: remoteProject.id)
                    nextProjects.append(Project(
                        id: localProjectId,
                        name: remoteProject.name,
                        createdAt: Date(timeIntervalSince1970: Double(remoteProject.createdAt) / 1000)
                    ))
                }

                for remoteAgent in remoteAgents {
                    let localId = localAgentId(for: remoteAgent.id)
                    let initials = String(remoteAgent.name.prefix(2)).uppercased()
                    let icon: String
                    switch remoteAgent.role.lowercased() {
                    case let role where role.contains("devops"): icon = "server.rack"
                    case let role where role.contains("design"): icon = "paintbrush.fill"
                    case let role where role.contains("code"), let role where role.contains("developer"): icon = "chevron.left.forwardslash.chevron.right"
                    default: icon = "brain.head.profile"
                    }
                    let projectIds = remoteAgent.projectIds.map(localProjectId(for:))
                    nextAgentProjects[localId] = projectIds
                    for projectId in projectIds {
                        nextProjectAgents[projectId, default: []].append(localId)
                    }
                    nextAgents.append(Agent(
                        id: localId,
                        name: remoteAgent.name,
                        initials: initials,
                        icon: icon,
                        role: remoteAgent.role,
                        description: remoteAgent.description
                    ))
                }

                var loadedConversations: [Conversation] = []
                var loadedSessionMap: [UUID: String] = [:]
                for remoteSession in remoteSessions {
                    guard let localProjectId = reverseProjectMap[remoteSession.projectId],
                          let localAgentId = reverseAgentMap[remoteSession.agentId] else {
                        continue
                    }
                    let localConversationId = UUID()
                    loadedSessionMap[localConversationId] = remoteSession.sessionId
                    loadedConversations.append(Conversation(
                        id: localConversationId,
                        agentId: localAgentId,
                        projectId: localProjectId,
                        topicId: nil,
                        title: remoteSession.title,
                        messages: [],
                        status: .read,
                        createdAt: Date(timeIntervalSince1970: Double(remoteSession.createdAt) / 1000)
                    ))
                }

                let sortedAgents = nextAgents.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
                let sortedProjects = nextProjects.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
                let resolvedProjectAgents = nextProjectAgents
                let resolvedAgentProjects = nextAgentProjects
                let resolvedSessionMap = loadedSessionMap
                let resolvedConversations = loadedConversations

                await MainActor.run {
                    self.agents = sortedAgents
                    self.projects = sortedProjects
                    self.projectAgents = resolvedProjectAgents
                    self.agentProjects = resolvedAgentProjects
                    self.topics = []
                    self.sessionMap.merge(resolvedSessionMap) { _, new in new }
                    self.conversations = resolvedConversations
                    self.isConnected = true
                    self.canCreateAgents = false
                    self.reconnectAttempt = 0
                    self.reconnectTask?.cancel()
                    self.reconnectTask = nil
                }
            } catch {
                print("[ChatService] API not available, using mock data: \(error.localizedDescription)")
                await MainActor.run {
                    self.projects = MockData.projects
                    self.topics = MockData.topics
                    self.conversations = MockData.generateConversations()
                    self.isConnected = false
                    self.canCreateAgents = false
                    self.scheduleReconnect()
                }
            }
        }
    }

    func loadMessages(for conversationId: UUID) {
        guard let sessionId = sessionMap[conversationId] else {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
                guard let self, self.sessionMap[conversationId] != nil else { return }
                self.loadMessages(for: conversationId)
            }
            return
        }
        guard let conversation = conversations.first(where: { $0.id == conversationId }) else {
            return
        }
        guard conversation.messages.isEmpty,
              let localProjectId = conversation.projectId,
              let remoteProjectId = projectMap[localProjectId],
              let remoteAgentId = agentMap[conversation.agentId] else {
            return
        }
        Task {
            do {
                let session = try await api.getSession(id: sessionId, agentId: remoteAgentId, projectId: remoteProjectId)
                let messages = session.messages.map { message in
                    Message(
                        id: UUID(),
                        role: message.role == "user" ? .user : .agent,
                        text: message.content,
                        timestamp: Date(timeIntervalSince1970: Double(message.createdAt) / 1000)
                    )
                }
                await MainActor.run {
                    if let index = self.conversations.firstIndex(where: { $0.id == conversationId }) {
                        self.conversations[index].messages = messages
                    }
                }
            } catch {
                print("[ChatService] Failed to load messages: \(error)")
            }
        }
    }

    // MARK: - Lookups

    func agent(for agentId: UUID) -> Agent? {
        agents.first { $0.id == agentId }
    }

    func project(for projectId: UUID) -> Project? {
        projects.first { $0.id == projectId }
    }

    func agentsForProject(_ projectId: UUID) -> [Agent] {
        let agentIds = projectAgents[projectId] ?? []
        return agents.filter { agentIds.contains($0.id) }
    }

    func defaultAgent(for projectId: UUID) -> Agent? {
        agentsForProject(projectId).first
    }

    func defaultProject(for agentId: UUID) -> Project? {
        let projectIds = agentProjects[agentId] ?? []
        return projects.first(where: { projectIds.contains($0.id) })
    }

    func defaultConversationContext() -> (project: Project, agent: Agent)? {
        for project in projects {
            if let agent = defaultAgent(for: project.id) {
                return (project, agent)
            }
        }
        return nil
    }

    func conversationsForAgent(_ agentId: UUID) -> [Conversation] {
        sortedConversations.filter { $0.agentId == agentId }
    }

    func thinkingCount(for agentId: UUID) -> Int {
        conversations.count { $0.agentId == agentId && $0.status == .thinking }
    }

    func unreadCount(for agentId: UUID) -> Int {
        conversations.count { $0.agentId == agentId && $0.status == .unread }
    }

    func conversationsForProject(_ projectId: UUID) -> [Conversation] {
        sortedConversations.filter { $0.projectId == projectId }
    }

    func topicsForProject(_ projectId: UUID) -> [Topic] {
        topics.filter { $0.projectId == projectId }
    }

    func topic(for topicId: UUID) -> Topic? {
        topics.first { $0.id == topicId }
    }

    func conversationsForTopic(_ topicId: UUID) -> [Conversation] {
        sortedConversations.filter { $0.topicId == topicId }
    }

    // MARK: - Actions

    @discardableResult
    func createConversation(agentId: UUID, projectId: UUID? = nil, topicId: UUID? = nil) -> UUID? {
        guard let resolvedProjectId = projectId ?? defaultProject(for: agentId)?.id ?? projects.first?.id,
              let remoteProjectId = projectMap[resolvedProjectId],
              let remoteAgentId = agentMap[agentId] else {
            return nil
        }

        let localId = UUID()
        let count = conversations.filter { $0.agentId == agentId && $0.projectId == resolvedProjectId }.count + 1
        let agentName = agent(for: agentId)?.name ?? "Agent"
        let conversation = Conversation(
            id: localId,
            agentId: agentId,
            projectId: resolvedProjectId,
            topicId: topicId,
            title: "\(agentName) Chat #\(count)",
            messages: [],
            status: .read,
            createdAt: Date()
        )
        conversations.append(conversation)

        Task {
            do {
                let session = try await api.createSession(title: conversation.title, agentId: remoteAgentId, projectId: remoteProjectId)
                await MainActor.run {
                    self.sessionMap[localId] = session.sessionId
                }
            } catch {
                print("[ChatService] Failed to create remote session: \(error)")
            }
        }

        return localId
    }

    func sendMessage(in conversationId: UUID, text: String, attachments: [Attachment] = []) {
        guard let index = conversations.firstIndex(where: { $0.id == conversationId }) else { return }
        let message = Message(id: UUID(), role: .user, text: text, timestamp: Date(), attachments: attachments)
        conversations[index].messages.append(message)
        conversations[index].status = .thinking

        let agentId = conversations[index].agentId
        let projectId = conversations[index].projectId
        let remoteAgentId = agentMap[agentId]
        let remoteProjectId = projectId.flatMap { projectMap[$0] }

        // Build relay payload: for voice messages, include attachment metadata
        var relayAttachments: [[String: String]] = []
        for att in attachments {
            var payload: [String: String] = ["name": att.name, "mimeType": att.mimeType]
            if let base64 = att.base64Data {
                payload["data"] = "data:\(att.mimeType);base64,\(base64)"
            }
            relayAttachments.append(payload)
        }

        if let sessionId = sessionMap[conversationId] {
            activeStreamTask = Task { await streamReply(conversationId: conversationId, sessionId: sessionId, agentId: remoteAgentId, projectId: remoteProjectId, text: text, attachments: relayAttachments) }
        } else {
            activeStreamTask = Task {
                do {
                    guard let remoteAgentId, let remoteProjectId else {
                        throw APIService.APIError.badResponse
                    }
                    let title = conversations.first(where: { $0.id == conversationId })?.title ?? "Chat"
                    let session = try await api.createSession(title: title, agentId: remoteAgentId, projectId: remoteProjectId)
                    await MainActor.run { self.sessionMap[conversationId] = session.sessionId }
                    await streamReply(conversationId: conversationId, sessionId: session.sessionId, agentId: remoteAgentId, projectId: remoteProjectId, text: text, attachments: relayAttachments)
                } catch {
                    print("[ChatService] Failed: \(error)")
                    await MainActor.run { self.fallbackReply(in: conversationId) }
                }
            }
        }
    }

    func sendVoiceMessage(in conversationId: UUID, attachment: Attachment) {
        guard let index = conversations.firstIndex(where: { $0.id == conversationId }) else { return }
        let message = Message(
            id: UUID(),
            role: .user,
            text: "[Voice message]",
            timestamp: Date(),
            attachments: [attachment]
        )
        conversations[index].messages.append(message)
        conversations[index].status = .thinking

        let agentId = conversations[index].agentId
        let projectId = conversations[index].projectId
        let remoteAgentId = agentMap[agentId]
        let remoteProjectId = projectId.flatMap { projectMap[$0] }

        // Build attachment payload with audio data
        var relayAttachments: [[String: String]] = []
        var payload: [String: String] = ["name": attachment.name, "mimeType": attachment.mimeType]
        if let base64 = attachment.base64Data {
            payload["data"] = "data:\(attachment.mimeType);base64,\(base64)"
        }
        relayAttachments.append(payload)

        let text = "[Voice message]"

        if let sessionId = sessionMap[conversationId] {
            activeStreamTask = Task { await streamReply(conversationId: conversationId, sessionId: sessionId, agentId: remoteAgentId, projectId: remoteProjectId, text: text, attachments: relayAttachments) }
        } else {
            activeStreamTask = Task {
                do {
                    guard let remoteAgentId, let remoteProjectId else {
                        throw APIService.APIError.badResponse
                    }
                    let title = conversations.first(where: { $0.id == conversationId })?.title ?? "Chat"
                    let session = try await api.createSession(title: title, agentId: remoteAgentId, projectId: remoteProjectId)
                    await MainActor.run { self.sessionMap[conversationId] = session.sessionId }
                    await streamReply(conversationId: conversationId, sessionId: session.sessionId, agentId: remoteAgentId, projectId: remoteProjectId, text: text, attachments: relayAttachments)
                } catch {
                    print("[ChatService] Failed: \(error)")
                    await MainActor.run { self.fallbackReply(in: conversationId) }
                }
            }
        }
    }

    private func streamReply(conversationId: UUID, sessionId: String, agentId: String?, projectId: String?, text: String, attachments: [[String: String]] = []) async {
        var accumulated = ""

        do {
            guard let agentId, let projectId else {
                throw APIService.APIError.badResponse
            }
            let stream = api.sendMessage(text: text, sessionId: sessionId, agentId: agentId, projectId: projectId, attachments: attachments)
            for try await chunk in stream {
                accumulated += chunk
            }
            let finalText = accumulated
            await MainActor.run {
                if let idx = self.conversations.firstIndex(where: { $0.id == conversationId }) {
                    self.conversations[idx].messages.append(Message(id: UUID(), role: .agent, text: finalText, timestamp: Date()))
                    self.conversations[idx].status = .streaming
                }
            }
        } catch {
            print("[ChatService] Stream error: \(error)")
            let url = configuredRelayURL
            let fallbackText = accumulated.isEmpty
                ? "Connection error. Check that the relay is running on \(url) and the assignment is online."
                : accumulated
            await MainActor.run {
                if let idx = self.conversations.firstIndex(where: { $0.id == conversationId }) {
                    self.conversations[idx].messages.append(Message(
                        id: UUID(),
                        role: .agent,
                        text: fallbackText,
                        timestamp: Date()
                    ))
                    self.conversations[idx].status = self.viewingConversationId == conversationId ? .read : .unread
                }
            }
        }
    }

    func cancelGeneration(in conversationId: UUID) {
        activeStreamTask?.cancel()
        activeStreamTask = nil
        if let idx = conversations.firstIndex(where: { $0.id == conversationId }) {
            conversations[idx].status = viewingConversationId == conversationId ? .read : .unread
        }
    }

    func finishStreaming(conversationId: UUID) {
        guard let idx = conversations.firstIndex(where: { $0.id == conversationId }),
              conversations[idx].status == .streaming else { return }
        conversations[idx].status = viewingConversationId == conversationId ? .read : .unread
    }

    func markAsRead(conversationId: UUID) {
        guard let index = conversations.firstIndex(where: { $0.id == conversationId }),
              conversations[index].status == .unread else { return }
        conversations[index].status = .read
    }

    func startViewing(conversationId: UUID) {
        viewingConversationId = conversationId
        markAsRead(conversationId: conversationId)
    }

    func stopViewing(conversationId: UUID) {
        if viewingConversationId == conversationId {
            viewingConversationId = nil
        }
    }

    func changeAgent(for conversationId: UUID, to agentId: UUID) {
        guard let index = conversations.firstIndex(where: { $0.id == conversationId }),
              conversations[index].messages.isEmpty,
              sessionMap[conversationId] == nil,
              let projectId = conversations[index].projectId,
              (projectAgents[projectId] ?? []).contains(agentId) else { return }
        conversations[index].agentId = agentId
    }

    func deleteConversation(_ conversationId: UUID) {
        sessionMap.removeValue(forKey: conversationId)
        conversations.removeAll { $0.id == conversationId }
    }

    func deleteAllConversations() {
        sessionMap.removeAll()
        conversations.removeAll()
    }

    func addAgent(name: String, role: String, description: String) {
        print("[ChatService] Creating relay-backed agents from the iOS client is not supported yet.")
    }

    func reconnect() {
        reconnectTask?.cancel()
        reconnectTask = nil
        reconnectAttempt = 0
        sessionMap.removeAll()
        agentMap.removeAll()
        projectMap.removeAll()
        reverseAgentMap.removeAll()
        reverseProjectMap.removeAll()
        projectAgents.removeAll()
        agentProjects.removeAll()
        conversations.removeAll()
        isConnected = false
        loadRemoteBootstrap()
    }

    private func scheduleReconnect() {
        reconnectTask?.cancel()
        reconnectAttempt += 1
        let delay = min(Double(1 << min(reconnectAttempt, 5)), maxReconnectDelay)
        print("[ChatService] Auto-reconnect in \(Int(delay))s (attempt \(reconnectAttempt))")
        reconnectTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard let self, !Task.isCancelled, !self.isConnected else { return }
            self.loadRemoteBootstrap()
        }
    }

    // MARK: - Fallback

    private var configuredRelayURL: String {
        UserDefaults.standard.string(forKey: PersistentSurfaceKeys.relayBaseURL) ?? "http://localhost:4410"
    }

    private func fallbackReply(in conversationId: UUID) {
        let url = configuredRelayURL
        let replies = [
            "Could not connect to the relay at \(url). Check that the relay is running and reachable from this device.",
            "Connection failed. Make sure the relay at \(url) has a live project-agent assignment.",
        ]
        guard let idx = conversations.firstIndex(where: { $0.id == conversationId }) else { return }
        conversations[idx].messages.append(Message(id: UUID(), role: .agent, text: replies.randomElement()!, timestamp: Date()))
        conversations[idx].status = .unread
    }
}
