import Foundation

// MARK: - Project

struct Project: Identifiable, Hashable {
    let id: UUID
    let name: String
    let createdAt: Date
}

// MARK: - Topic

struct Topic: Identifiable, Hashable {
    let id: UUID
    let projectId: UUID
    let name: String
    let createdAt: Date
}

// MARK: - Agent

struct Agent: Identifiable, Hashable {
    let id: UUID
    let name: String
    let initials: String
    let icon: String
    let role: String
    let description: String
}

// MARK: - Conversation Status

enum ConversationStatus: Int, Comparable, Equatable {
    case thinking = 0
    case streaming = 1
    case unread = 2
    case read = 3

    static func < (lhs: ConversationStatus, rhs: ConversationStatus) -> Bool {
        lhs.rawValue < rhs.rawValue
    }
}

// MARK: - Attachment

struct Attachment: Identifiable, Equatable {
    let id: UUID
    let name: String
    let mimeType: String
    let data: Data?
    let fileURL: URL?
    let duration: TimeInterval
    let waveformSamples: [Float]

    init(
        id: UUID = UUID(),
        name: String,
        mimeType: String,
        data: Data? = nil,
        fileURL: URL? = nil,
        duration: TimeInterval = 0,
        waveformSamples: [Float] = []
    ) {
        self.id = id
        self.name = name
        self.mimeType = mimeType
        self.data = data
        self.fileURL = fileURL
        self.duration = duration
        self.waveformSamples = waveformSamples
    }

    var isAudio: Bool {
        mimeType.hasPrefix("audio/")
    }

    var base64Data: String? {
        guard let data else { return nil }
        return data.base64EncodedString()
    }
}

// MARK: - Message

enum MessageRole: Equatable {
    case user
    case agent
}

struct Message: Identifiable, Equatable {
    let id: UUID
    let role: MessageRole
    let text: String
    let timestamp: Date
    let attachments: [Attachment]

    init(
        id: UUID = UUID(),
        role: MessageRole,
        text: String,
        timestamp: Date = Date(),
        attachments: [Attachment] = []
    ) {
        self.id = id
        self.role = role
        self.text = text
        self.timestamp = timestamp
        self.attachments = attachments
    }

    var hasAudioAttachment: Bool {
        attachments.contains { $0.isAudio }
    }

    var audioAttachment: Attachment? {
        attachments.first { $0.isAudio }
    }
}

// MARK: - Conversation

struct Conversation: Identifiable {
    let id: UUID
    var agentId: UUID
    var projectId: UUID?
    var topicId: UUID?
    var title: String
    var messages: [Message]
    var status: ConversationStatus
    let createdAt: Date

    var lastMessage: Message? {
        messages.last
    }

    var lastMessagePreview: String {
        if let last = lastMessage {
            if last.hasAudioAttachment { return "Voice message" }
            return last.text
        }
        return "New conversation"
    }

    var lastActivityTime: Date {
        lastMessage?.timestamp ?? createdAt
    }
}
