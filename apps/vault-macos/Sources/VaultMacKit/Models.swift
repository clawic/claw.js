import Foundation

public struct VaultSession: Codable, Equatable, Sendable {
    public var accessToken: String
    public var tenantId: String
    public var email: String
    public var role: String

    public init(accessToken: String, tenantId: String, email: String, role: String) {
        self.accessToken = accessToken
        self.tenantId = tenantId
        self.email = email
        self.role = role
    }
}

public struct VaultSecret: Codable, Equatable, Identifiable, Sendable {
    public var secretName: String
    public var label: String?
    public var kind: String?
    public var typeId: String?
    public var notes: String?
    public var structuredFields: [String: String]?
    public var allowedHosts: [String]
    public var allowedHeaderNames: [String]
    public var allowInURL: Bool
    public var allowInRequestBody: Bool
    public var allowLocalNetwork: Bool
    public var readOnly: Bool
    public var exportable: Bool
    public var leaseModes: [String]
    public var maskedFingerprint: String
    public var version: Int
    public var updatedAt: String

    public var id: String { secretName }
}

public struct VaultPolicy: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var subjectType: String
    public var subjectId: String
    public var secretName: String
    public var capability: String
    public var effect: String
}

public struct VaultPrincipal: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var type: String
    public var label: String
    public var createdAt: String
    public var token: String?
}

public struct VaultLease: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var secretName: String
    public var capability: String
    public var mode: String
    public var createdAt: String
    public var expiresAt: String
    public var consumedAt: String?
    public var revokedAt: String?
}

public struct VaultAuditEvent: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var action: String
    public var secretName: String?
    public var status: String
    public var detail: String
    public var createdAt: String
}

public struct VaultSecretTypeField: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var label: String
    public var kind: String
    public var required: Bool
    public var description: String?
}

public struct VaultSecretAction: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var label: String
    public var description: String
    public var capability: String
    public var method: String
    public var allowed: Bool?
}

public struct VaultSecretCapability: Codable, Equatable, Identifiable, Sendable {
    public var capability: String
    public var allowed: Bool

    public var id: String { capability }
}

public struct VaultSecretType: Codable, Equatable, Identifiable, Sendable {
    public var typeId: String
    public var label: String
    public var description: String
    public var kind: String
    public var defaultAllowedHosts: [String]
    public var defaultAllowedHeaderNames: [String]
    public var defaultAllowInURL: Bool
    public var defaultAllowInRequestBody: Bool
    public var defaultAllowLocalNetwork: Bool
    public var defaultReadOnly: Bool
    public var defaultLeaseModes: [String]
    public var fields: [VaultSecretTypeField]
    public var actions: [VaultSecretAction]

    public var id: String { typeId }
}

public struct VaultCreateSecretInput: Equatable, Sendable {
    public var typeId: String
    public var secretName: String
    public var secretValue: String
    public var label: String
    public var notes: String
    public var baseUrl: String
    public var allowedHosts: String
    public var allowedHeaderNames: String
    public var leaseModes: String
    public var allowInURL: Bool
    public var allowInRequestBody: Bool
    public var allowLocalNetwork: Bool
    public var readOnly: Bool

    public init(
        typeId: String = "telegram.bot_token",
        secretName: String = "telegram_support_bot_token",
        secretValue: String = "top-secret-token-v1",
        label: String = "Telegram bot",
        notes: String = "Support bot token",
        baseUrl: String = "",
        allowedHosts: String = "api.telegram.org",
        allowedHeaderNames: String = "",
        leaseModes: String = "process,browser",
        allowInURL: Bool = true,
        allowInRequestBody: Bool = false,
        allowLocalNetwork: Bool = false,
        readOnly: Bool = false
    ) {
        self.typeId = typeId
        self.secretName = secretName
        self.secretValue = secretValue
        self.label = label
        self.notes = notes
        self.baseUrl = baseUrl
        self.allowedHosts = allowedHosts
        self.allowedHeaderNames = allowedHeaderNames
        self.leaseModes = leaseModes
        self.allowInURL = allowInURL
        self.allowInRequestBody = allowInRequestBody
        self.allowLocalNetwork = allowLocalNetwork
        self.readOnly = readOnly
    }
}
