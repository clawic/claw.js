import Foundation
import Combine

@MainActor
public final class VaultStore: ObservableObject {
    @Published public var baseURLString: String
    @Published public var tenantId: String
    @Published public var email: String
    @Published public var password: String
    @Published public var session: VaultSession?
    @Published public var secrets: [VaultSecret] = []
    @Published public var secretTypes: [VaultSecretType] = []
    @Published public var policies: [VaultPolicy] = []
    @Published public var principals: [VaultPrincipal] = []
    @Published public var leases: [VaultLease] = []
    @Published public var auditEvents: [VaultAuditEvent] = []
    @Published public var capabilities: [VaultSecretCapability] = []
    @Published public var actions: [VaultSecretAction] = []
    @Published public var selectedSecretName: String?
    @Published public var typeSearch: String = ""
    @Published public var createSecretInput = VaultCreateSecretInput()
    @Published public var rotateSecretValue: String = "top-secret-token-v2"
    @Published public var policySubjectType: String = "service_principal"
    @Published public var policySubjectId: String = "*"
    @Published public var policyCapability: String = "broker.http"
    @Published public var policyEffect: String = "allow"
    @Published public var principalType: String = "sidecar_principal"
    @Published public var principalLabel: String = "local-sidecar"
    @Published public var leaseCapability: String = "lease.process"
    @Published public var leaseMode: String = "process"
    @Published public var errorMessage: String = ""
    @Published public var lastIssuedPrincipalToken: String = ""

    public var clientFactory: (URL) -> VaultClient

    public init(
        baseURLString: String = ProcessInfo.processInfo.environment["VAULT_APP_BASE_URL"] ?? "http://127.0.0.1:24112",
        tenantId: String = "demo-tenant",
        email: String = "admin@vault.local",
        password: String = "vault-admin",
        clientFactory: @escaping (URL) -> VaultClient = { VaultClient(baseURL: $0) }
    ) {
        self.baseURLString = baseURLString
        self.tenantId = tenantId
        self.email = email
        self.password = password
        self.clientFactory = clientFactory
    }

    public var filteredTypes: [VaultSecretType] {
        let query = typeSearch.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return secretTypes }
        return secretTypes.filter { type in
            type.typeId.lowercased().contains(query)
            || type.label.lowercased().contains(query)
            || type.description.lowercased().contains(query)
        }
    }

    public var selectedType: VaultSecretType? {
        secretTypes.first(where: { $0.typeId == createSecretInput.typeId })
    }

    public func login() async {
        do {
            errorMessage = ""
            let client = try makeClient()
            let nextSession = try await client.login(tenantId: tenantId, email: email, password: password)
            session = nextSession
            try await refreshAll()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    public func signOut() {
        session = nil
        secrets = []
        policies = []
        principals = []
        leases = []
        auditEvents = []
        capabilities = []
        actions = []
        selectedSecretName = nil
    }

    public func refreshAll() async throws {
        guard let session else { return }
        let client = try makeClient()
        async let types = client.listSecretTypes()
        async let secrets = client.listSecrets(session: session)
        async let policies = client.listPolicies(session: session)
        async let principals = client.listPrincipals(session: session)
        async let leases = client.listLeases(session: session)
        async let audit = client.listAudit(session: session)
        self.secretTypes = try await types
        self.secrets = try await secrets
        self.policies = try await policies
        self.principals = try await principals
        self.leases = try await leases
        self.auditEvents = try await audit
        if let selectedSecretName {
            try await loadSelectedSecret(name: selectedSecretName)
        }
    }

    public func applyType(_ type: VaultSecretType) {
        createSecretInput.typeId = type.typeId
        createSecretInput.allowedHosts = type.defaultAllowedHosts.joined(separator: ",")
        createSecretInput.allowedHeaderNames = type.defaultAllowedHeaderNames.joined(separator: ",")
        createSecretInput.leaseModes = type.defaultLeaseModes.joined(separator: ",")
        createSecretInput.allowInURL = type.defaultAllowInURL
        createSecretInput.allowInRequestBody = type.defaultAllowInRequestBody
        createSecretInput.allowLocalNetwork = type.defaultAllowLocalNetwork
        createSecretInput.readOnly = type.defaultReadOnly
    }

    public func createSecret() async {
        guard let session else { return }
        do {
            errorMessage = ""
            let client = try makeClient()
            _ = try await client.createSecret(session: session, input: createSecretInput)
            selectedSecretName = createSecretInput.secretName
            try await refreshAll()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    public func rotateSecret() async {
        guard let session, let selectedSecretName else { return }
        do {
            errorMessage = ""
            let client = try makeClient()
            _ = try await client.rotateSecret(session: session, secretName: selectedSecretName, secretValue: rotateSecretValue)
            try await refreshAll()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    public func createPolicy() async {
        guard let session else { return }
        let secretName = selectedSecretName ?? createSecretInput.secretName
        do {
            errorMessage = ""
            let client = try makeClient()
            _ = try await client.createPolicy(
                session: session,
                subjectType: policySubjectType,
                subjectId: policySubjectId,
                secretName: secretName,
                capability: policyCapability,
                effect: policyEffect
            )
            try await refreshAll()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    public func createPrincipal() async {
        guard let session else { return }
        do {
            errorMessage = ""
            let client = try makeClient()
            let principal = try await client.createPrincipal(session: session, type: principalType, label: principalLabel)
            lastIssuedPrincipalToken = principal.token ?? ""
            policySubjectId = principal.id
            try await refreshAll()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    public func createLease() async {
        guard let session else { return }
        do {
            errorMessage = ""
            let client = try makeClient()
            _ = try await client.createLease(
                session: session,
                secretName: selectedSecretName ?? createSecretInput.secretName,
                capability: leaseCapability,
                mode: leaseMode,
                ttlSec: 60
            )
            try await refreshAll()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    public func revokeLease(_ leaseId: String) async {
        guard let session else { return }
        do {
            errorMessage = ""
            let client = try makeClient()
            try await client.revokeLease(session: session, leaseId: leaseId)
            try await refreshAll()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    public func loadSelectedSecret(name: String) async throws {
        guard let session else { return }
        let client = try makeClient()
        async let nextCapabilities = client.secretCapabilities(session: session, secretName: name)
        async let nextActions = client.secretActions(session: session, secretName: name)
        self.capabilities = try await nextCapabilities
        self.actions = try await nextActions
    }

    private func makeClient() throws -> VaultClient {
        guard let url = URL(string: baseURLString) else {
            throw VaultClientError.invalidResponse
        }
        return clientFactory(url)
    }
}
