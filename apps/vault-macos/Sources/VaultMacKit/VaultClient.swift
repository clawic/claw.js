import Foundation

public struct VaultClient: Sendable {
    public var baseURL: URL
    public var session: URLSession

    public init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    public func login(tenantId: String, email: String, password: String) async throws -> VaultSession {
        try await request(
            path: PersistentSurfaceKeys.apiPath("auth/login"),
            method: "POST",
            jsonBody: [
                "tenantId": tenantId,
                "email": email,
                "password": password,
            ],
            token: nil
        )
    }

    public func listSecretTypes() async throws -> [VaultSecretType] {
        let payload: SecretTypesPayload = try await request(path: PersistentSurfaceKeys.apiPath("secret-types"), token: nil)
        return payload.types
    }

    public func listSecrets(session vaultSession: VaultSession) async throws -> [VaultSecret] {
        let payload: SecretsPayload = try await request(
            path: PersistentSurfaceKeys.apiPath("tenants/\(vaultSession.tenantId)/secrets"),
            token: vaultSession.accessToken
        )
        return payload.secrets
    }

    public func createSecret(session vaultSession: VaultSession, input: VaultCreateSecretInput) async throws -> VaultSecret {
        let payloadBody: [String: AnyEncodable] = [
            "typeId": AnyEncodable(input.typeId),
            "secretName": AnyEncodable(input.secretName),
            "secretValue": AnyEncodable(input.secretValue),
            "label": AnyEncodable(input.label),
            "notes": AnyEncodable(input.notes),
            "structuredFields": AnyEncodable(
                input.baseUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    ? [String: String]()
                    : ["baseUrl": input.baseUrl.trimmingCharacters(in: .whitespacesAndNewlines)]
            ),
            "allowedHosts": AnyEncodable(
                input.allowedHosts
                    .split(separator: ",")
                    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty }
            ),
            "allowedHeaderNames": AnyEncodable(
                input.allowedHeaderNames
                    .split(separator: ",")
                    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty }
            ),
            "leaseModes": AnyEncodable(
                input.leaseModes
                    .split(separator: ",")
                    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty }
            ),
            "allowInURL": AnyEncodable(input.allowInURL),
            "allowInRequestBody": AnyEncodable(input.allowInRequestBody),
            "allowLocalNetwork": AnyEncodable(input.allowLocalNetwork),
            "readOnly": AnyEncodable(input.readOnly),
        ]
        let payload: SecretPayload = try await request(
            path: PersistentSurfaceKeys.apiPath("tenants/\(vaultSession.tenantId)/secrets"),
            method: "POST",
            jsonBody: payloadBody,
            token: vaultSession.accessToken
        )
        return payload.secret
    }

    public func rotateSecret(session vaultSession: VaultSession, secretName: String, secretValue: String) async throws -> VaultSecret {
        let payload: SecretPayload = try await request(
            path: PersistentSurfaceKeys.apiPath("tenants/\(vaultSession.tenantId)/secrets/\(secretName.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? secretName)/versions"),
            method: "POST",
            jsonBody: [
                "secretValue": secretValue,
            ],
            token: vaultSession.accessToken
        )
        return payload.secret
    }

    public func listPolicies(session vaultSession: VaultSession) async throws -> [VaultPolicy] {
        let payload: PoliciesPayload = try await request(
            path: PersistentSurfaceKeys.apiPath("tenants/\(vaultSession.tenantId)/policies"),
            token: vaultSession.accessToken
        )
        return payload.policies
    }

    public func createPolicy(
        session vaultSession: VaultSession,
        subjectType: String,
        subjectId: String,
        secretName: String,
        capability: String,
        effect: String
    ) async throws -> VaultPolicy {
        let payload: PolicyPayload = try await request(
            path: PersistentSurfaceKeys.apiPath("tenants/\(vaultSession.tenantId)/policies"),
            method: "POST",
            jsonBody: [
                "subjectType": subjectType,
                "subjectId": subjectId,
                "secretName": secretName,
                "capability": capability,
                "effect": effect,
            ],
            token: vaultSession.accessToken
        )
        return payload.policy
    }

    public func listPrincipals(session vaultSession: VaultSession) async throws -> [VaultPrincipal] {
        let payload: PrincipalsPayload = try await request(
            path: PersistentSurfaceKeys.apiPath("tenants/\(vaultSession.tenantId)/principals"),
            token: vaultSession.accessToken
        )
        return payload.principals
    }

    public func createPrincipal(session vaultSession: VaultSession, type: String, label: String) async throws -> VaultPrincipal {
        let payload: PrincipalPayload = try await request(
            path: PersistentSurfaceKeys.apiPath("tenants/\(vaultSession.tenantId)/principals"),
            method: "POST",
            jsonBody: [
                "type": type,
                "label": label,
            ],
            token: vaultSession.accessToken
        )
        return payload.principal
    }

    public func listLeases(session vaultSession: VaultSession) async throws -> [VaultLease] {
        let payload: LeasesPayload = try await request(
            path: PersistentSurfaceKeys.apiPath("tenants/\(vaultSession.tenantId)/leases"),
            token: vaultSession.accessToken
        )
        return payload.leases
    }

    public func createLease(
        session vaultSession: VaultSession,
        secretName: String,
        capability: String,
        mode: String,
        ttlSec: Int
    ) async throws -> VaultLease {
        let payload: LeasePayload = try await request(
            path: PersistentSurfaceKeys.apiPath("tenants/\(vaultSession.tenantId)/leases"),
            method: "POST",
            jsonBody: [
                "secretName": AnyEncodable(secretName),
                "capability": AnyEncodable(capability),
                "mode": AnyEncodable(mode),
                "ttlSec": AnyEncodable(ttlSec),
            ],
            token: vaultSession.accessToken
        )
        return payload.lease
    }

    public func revokeLease(session vaultSession: VaultSession, leaseId: String) async throws {
        let _: EmptyPayload = try await request(
            path: PersistentSurfaceKeys.apiPath("tenants/\(vaultSession.tenantId)/leases/\(leaseId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? leaseId)/revoke"),
            method: "POST",
            jsonBody: Optional<[String: AnyEncodable]>.none,
            token: vaultSession.accessToken
        )
    }

    public func listAudit(session vaultSession: VaultSession) async throws -> [VaultAuditEvent] {
        let payload: AuditPayload = try await request(
            path: PersistentSurfaceKeys.apiPath("tenants/\(vaultSession.tenantId)/audit"),
            token: vaultSession.accessToken
        )
        return payload.events
    }

    public func secretCapabilities(session vaultSession: VaultSession, secretName: String) async throws -> [VaultSecretCapability] {
        let payload: SecretCapabilitiesPayload = try await request(
            path: PersistentSurfaceKeys.apiPath("tenants/\(vaultSession.tenantId)/secrets/\(secretName.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? secretName)/capabilities"),
            token: vaultSession.accessToken
        )
        return payload.capabilities
    }

    public func secretActions(session vaultSession: VaultSession, secretName: String) async throws -> [VaultSecretAction] {
        let payload: SecretActionsPayload = try await request(
            path: PersistentSurfaceKeys.apiPath("tenants/\(vaultSession.tenantId)/secrets/\(secretName.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? secretName)/actions"),
            token: vaultSession.accessToken
        )
        return payload.actions
    }

    private func request<Response: Decodable>(
        path: String,
        method: String = "GET",
        jsonBody: (any Encodable)? = nil,
        token: String?
    ) async throws -> Response {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let jsonBody {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(AnyEncodable(jsonBody))
        }
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw VaultClientError.invalidResponse
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            throw VaultClientError.http(status: httpResponse.statusCode, message: String(data: data, encoding: .utf8) ?? "")
        }
        if Response.self == EmptyPayload.self && data.isEmpty {
            return EmptyPayload() as! Response
        }
        return try JSONDecoder().decode(Response.self, from: data)
    }
}

public enum VaultClientError: Error, LocalizedError {
    case invalidResponse
    case http(status: Int, message: String)

    public var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid Vault response."
        case let .http(status, message):
            return message.isEmpty ? "Vault request failed with status \(status)." : message
        }
    }
}

private struct SecretTypesPayload: Decodable { var types: [VaultSecretType] }
private struct SecretsPayload: Decodable { var secrets: [VaultSecret] }
private struct SecretPayload: Decodable { var secret: VaultSecret }
private struct PoliciesPayload: Decodable { var policies: [VaultPolicy] }
private struct PolicyPayload: Decodable { var policy: VaultPolicy }
private struct PrincipalsPayload: Decodable { var principals: [VaultPrincipal] }
private struct PrincipalPayload: Decodable { var principal: VaultPrincipal }
private struct LeasesPayload: Decodable { var leases: [VaultLease] }
private struct LeasePayload: Decodable { var lease: VaultLease }
private struct AuditPayload: Decodable { var events: [VaultAuditEvent] }
private struct SecretCapabilitiesPayload: Decodable { var capabilities: [VaultSecretCapability] }
private struct SecretActionsPayload: Decodable { var actions: [VaultSecretAction] }
private struct EmptyPayload: Decodable {}

private struct AnyEncodable: Encodable {
    private let encodeValue: (Encoder) throws -> Void

    init<T: Encodable>(_ value: T) {
        self.encodeValue = value.encode(to:)
    }

    init(_ value: any Encodable) {
        self.encodeValue = value.encode(to:)
    }

    func encode(to encoder: Encoder) throws {
        try encodeValue(encoder)
    }
}
