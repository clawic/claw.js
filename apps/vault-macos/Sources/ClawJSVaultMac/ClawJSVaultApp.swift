import SwiftUI
import VaultMacKit

@main
struct ClawJSVaultApp: App {
    @StateObject private var store = VaultStore()

    var body: some Scene {
        WindowGroup("ClawJS Vault") {
            RootView()
                .environmentObject(store)
                .frame(minWidth: 1180, minHeight: 760)
        }
        .defaultSize(width: 1240, height: 820)
    }
}

private struct RootView: View {
    @EnvironmentObject private var store: VaultStore

    var body: some View {
        Group {
            if store.session == nil {
                LoginView()
            } else {
                ConsoleView()
            }
        }
        .background(Color(red: 0.95, green: 0.93, blue: 0.89))
    }
}

private struct LoginView: View {
    @EnvironmentObject private var store: VaultStore

    var body: some View {
        VStack(spacing: 18) {
            VStack(alignment: .leading, spacing: 8) {
                Text("ClawJS Vault")
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                Text("Brokered secrets with typed metadata and zero-read defaults.")
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            GroupBox {
                VStack(spacing: 12) {
                    LabeledField("Base URL", text: $store.baseURLString)
                    LabeledField("Tenant", text: $store.tenantId)
                    LabeledField("Email", text: $store.email)
                    SecureLabeledField("Password", text: $store.password)
                }
            }

            if !store.errorMessage.isEmpty {
                Text(store.errorMessage)
                    .foregroundStyle(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            Button("Sign In") {
                Task { await store.login() }
            }
            .buttonStyle(.borderedProminent)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(32)
        .frame(maxWidth: 520)
    }
}

private struct ConsoleView: View {
    @EnvironmentObject private var store: VaultStore

    var body: some View {
        NavigationSplitView {
            List(selection: Binding(
                get: { store.selectedSecretName },
                set: { nextValue in
                    store.selectedSecretName = nextValue
                    if let nextValue {
                        Task { try? await store.loadSelectedSecret(name: nextValue) }
                    }
                }
            )) {
                Section("Secrets") {
                    ForEach(store.secrets) { secret in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(secret.secretName)
                                .font(.headline)
                            Text(secret.typeId ?? secret.kind ?? "generic")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .tag(secret.secretName)
                    }
                }
            }
            .navigationTitle("Vault")
            .toolbar {
                ToolbarItem {
                    Button("Refresh") {
                        Task { try? await store.refreshAll() }
                    }
                }
                ToolbarItem {
                    Button("Sign Out") {
                        store.signOut()
                    }
                }
            }
        } detail: {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    HeaderView()
                    if !store.errorMessage.isEmpty {
                        Text(store.errorMessage)
                            .foregroundStyle(.red)
                    }
                    SecretComposerCard()
                    SelectedSecretCard()
                    HStack(alignment: .top, spacing: 18) {
                        PoliciesCard()
                        PrincipalsCard()
                    }
                    HStack(alignment: .top, spacing: 18) {
                        LeasesCard()
                        AuditCard()
                    }
                }
                .padding(24)
            }
            .navigationTitle("Console")
        }
    }
}

private struct HeaderView: View {
    @EnvironmentObject private var store: VaultStore

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Native Vault Console")
                .font(.system(size: 28, weight: .bold, design: .rounded))
            if let session = store.session {
                Text("\(session.email) · \(session.role) · \(session.tenantId)")
                    .foregroundStyle(.secondary)
            }
        }
    }
}

private struct SecretComposerCard: View {
    @EnvironmentObject private var store: VaultStore

    var body: some View {
        Card(title: "Create Secret") {
            VStack(alignment: .leading, spacing: 12) {
                LabeledField("Type Search", text: $store.typeSearch)
                Picker("Secret Type", selection: Binding(
                    get: { store.createSecretInput.typeId },
                    set: { next in
                        store.createSecretInput.typeId = next
                        if let type = store.secretTypes.first(where: { $0.typeId == next }) {
                            store.applyType(type)
                        }
                    }
                )) {
                    ForEach(store.filteredTypes) { type in
                        Text(type.label).tag(type.typeId)
                    }
                }
                .pickerStyle(.menu)

                if let selectedType = store.selectedType {
                    Text(selectedType.description)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                LabeledField("Secret Name", text: $store.createSecretInput.secretName)
                LabeledField("Secret Value", text: $store.createSecretInput.secretValue)

                if store.selectedType?.fields.contains(where: { $0.id == "baseUrl" }) == true {
                    LabeledField("Base URL Override", text: $store.createSecretInput.baseUrl)
                }

                LabeledField("Allowed Hosts", text: $store.createSecretInput.allowedHosts)
                LabeledField("Allowed Headers", text: $store.createSecretInput.allowedHeaderNames)
                LabeledField("Lease Modes", text: $store.createSecretInput.leaseModes)

                Toggle("Read only", isOn: $store.createSecretInput.readOnly)
                Toggle("URL injection", isOn: $store.createSecretInput.allowInURL)
                Toggle("Body injection", isOn: $store.createSecretInput.allowInRequestBody)
                Toggle("Local network", isOn: $store.createSecretInput.allowLocalNetwork)

                Button("Store Secret") {
                    Task { await store.createSecret() }
                }
                .buttonStyle(.borderedProminent)
            }
        }
    }
}

private struct SelectedSecretCard: View {
    @EnvironmentObject private var store: VaultStore

    var body: some View {
        Card(title: "Selected Secret") {
            VStack(alignment: .leading, spacing: 12) {
                if let selectedSecretName = store.selectedSecretName {
                    Text(selectedSecretName)
                        .font(.headline)
                    if let secret = store.secrets.first(where: { $0.secretName == selectedSecretName }) {
                        Text(secret.typeId ?? secret.kind ?? "generic")
                            .foregroundStyle(.secondary)
                    }
                    LabeledField("Rotate Value", text: $store.rotateSecretValue)
                    Button("Rotate Secret") {
                        Task { await store.rotateSecret() }
                    }
                    .buttonStyle(.bordered)

                    Divider()

                    Text("Capabilities")
                        .font(.headline)
                    ForEach(store.capabilities) { capability in
                        HStack {
                            Text(capability.capability)
                            Spacer()
                            Text(capability.allowed ? "allow" : "deny")
                                .foregroundStyle(capability.allowed ? .green : .red)
                        }
                    }

                    Divider()

                    Text("Actions")
                        .font(.headline)
                    ForEach(store.actions) { action in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(action.label)
                            Text("\(action.id) · \(action.allowed == true ? "allow" : "deny")")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                } else {
                    Text("Select a secret from the sidebar.")
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}

private struct PoliciesCard: View {
    @EnvironmentObject private var store: VaultStore

    var body: some View {
        Card(title: "Policies") {
            VStack(alignment: .leading, spacing: 12) {
                LabeledField("Subject Type", text: $store.policySubjectType)
                LabeledField("Subject ID", text: $store.policySubjectId)
                LabeledField("Capability", text: $store.policyCapability)
                LabeledField("Effect", text: $store.policyEffect)
                Button("Create Policy") {
                    Task { await store.createPolicy() }
                }
                .buttonStyle(.borderedProminent)

                Divider()
                ForEach(store.policies) { policy in
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(policy.effect) \(policy.capability)")
                            .font(.headline)
                        Text("\(policy.subjectType):\(policy.subjectId)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
    }
}

private struct PrincipalsCard: View {
    @EnvironmentObject private var store: VaultStore

    var body: some View {
        Card(title: "Principals") {
            VStack(alignment: .leading, spacing: 12) {
                LabeledField("Type", text: $store.principalType)
                LabeledField("Label", text: $store.principalLabel)
                Button("Create Principal") {
                    Task { await store.createPrincipal() }
                }
                .buttonStyle(.borderedProminent)
                if !store.lastIssuedPrincipalToken.isEmpty {
                    Text(store.lastIssuedPrincipalToken)
                        .font(.system(.body, design: .monospaced))
                        .textSelection(.enabled)
                }

                Divider()
                ForEach(store.principals) { principal in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(principal.label)
                            .font(.headline)
                        Text("\(principal.type) · \(principal.id)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
    }
}

private struct LeasesCard: View {
    @EnvironmentObject private var store: VaultStore

    var body: some View {
        Card(title: "Leases") {
            VStack(alignment: .leading, spacing: 12) {
                LabeledField("Capability", text: $store.leaseCapability)
                LabeledField("Mode", text: $store.leaseMode)
                Button("Create Lease") {
                    Task { await store.createLease() }
                }
                .buttonStyle(.borderedProminent)

                Divider()
                ForEach(store.leases) { lease in
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(lease.secretName)
                                .font(.headline)
                            Text("\(lease.mode) · \(lease.capability)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if lease.revokedAt == nil {
                            Button("Revoke") {
                                Task { await store.revokeLease(lease.id) }
                            }
                            .buttonStyle(.bordered)
                        } else {
                            Text("revoked")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }
}

private struct AuditCard: View {
    @EnvironmentObject private var store: VaultStore

    var body: some View {
        Card(title: "Audit") {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(store.auditEvents) { event in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(event.action)
                            .font(.headline)
                        Text(event.detail)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
    }
}

private struct Card<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(title)
                .font(.system(size: 20, weight: .bold, design: .rounded))
            content
        }
        .padding(18)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

private struct LabeledField: View {
    let title: String
    @Binding var text: String

    init(_ title: String, text: Binding<String>) {
        self.title = title
        _text = text
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            TextField(title, text: $text)
                .textFieldStyle(.roundedBorder)
        }
    }
}

private struct SecureLabeledField: View {
    let title: String
    @Binding var text: String

    init(_ title: String, text: Binding<String>) {
        self.title = title
        _text = text
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            SecureField(title, text: $text)
                .textFieldStyle(.roundedBorder)
        }
    }
}
