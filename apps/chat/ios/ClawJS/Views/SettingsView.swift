import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var chatService: ChatService
    @AppStorage("notificationsEnabled") private var notificationsEnabled = true
    @AppStorage("soundEnabled") private var soundEnabled = true
    @AppStorage("hapticEnabled") private var hapticEnabled = true
    @AppStorage("selectedAppearance") private var selectedAppearance: AppearanceMode = .system
    @AppStorage("appLanguage") private var appLanguage = ""

    @AppStorage("relayBaseURL") private var relayBaseURL = "http://localhost:4410"
    @AppStorage("relayTenantId") private var relayTenantId = "demo-tenant"
    @AppStorage("relayEmail") private var relayEmail = "user@relay.local"
    @AppStorage("relayPassword") private var relayPassword = "relay-user"

    @State private var showDeleteAlert = false
    @State private var showLanguagePicker = false
    @State private var showQRScanner = false
    @State private var qrStatus: QRStatus = .idle

    enum QRStatus: Equatable {
        case idle
        case success
        case error
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                relaySection
                appearanceSection
                languageSection
                notificationsSection
                dataSection
                aboutSection
            }
            .padding(.horizontal)
            .padding(.bottom, 32)
        }
        .navigationTitle(L10n.Settings.title)
        .navigationBarTitleDisplayMode(.large)
        .alert(L10n.Settings.deleteAllConversations, isPresented: $showDeleteAlert) {
            Button(L10n.General.cancel, role: .cancel) {}
            Button(L10n.General.delete, role: .destructive) {
                chatService.deleteAllConversations()
            }
        } message: {
            Text(L10n.Settings.deleteAllAlert)
        }
        .sheet(isPresented: $showQRScanner) {
            NavigationStack {
                QRScannerView { code in
                    handleQRCode(code)
                    showQRScanner = false
                }
                .navigationTitle(L10n.Relay.scanQR)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button(L10n.General.close) { showQRScanner = false }
                    }
                }
            }
        }
    }

    // MARK: - Relay Connection

    private var relaySection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(L10n.Relay.title.uppercased())
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(.secondary)
                .padding(.leading, 4)

            VStack(spacing: 0) {
                // Status row
                HStack(spacing: 12) {
                    Image(systemName: chatService.isConnected ? "wifi" : "wifi.slash")
                        .font(.system(size: 14))
                        .foregroundColor(.white)
                        .frame(width: 30, height: 30)
                        .background(chatService.isConnected ? Color.green : Color.red)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    Text(chatService.isConnected ? L10n.Relay.connected : L10n.Relay.disconnected)
                        .foregroundColor(.primary)
                    Spacer()
                    Circle()
                        .fill(chatService.isConnected ? Color.green : Color.red)
                        .frame(width: 8, height: 8)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)

                Divider().padding(.leading, 52)

                // URL field
                relayField(
                    icon: "link",
                    color: .blue,
                    label: L10n.Relay.url,
                    text: $relayBaseURL,
                    placeholder: "http://192.168.1.100:4410"
                )
                Divider().padding(.leading, 52)

                // Tenant field
                relayField(
                    icon: "building.2.fill",
                    color: .indigo,
                    label: L10n.Relay.tenant,
                    text: $relayTenantId,
                    placeholder: "demo-tenant"
                )
                Divider().padding(.leading, 52)

                // Email field
                relayField(
                    icon: "envelope.fill",
                    color: .teal,
                    label: L10n.Relay.email,
                    text: $relayEmail,
                    placeholder: "user@relay.local"
                )
                Divider().padding(.leading, 52)

                // Password field
                relayField(
                    icon: "lock.fill",
                    color: .orange,
                    label: L10n.Relay.password,
                    text: $relayPassword,
                    placeholder: "password",
                    isSecure: true
                )
            }
            .glassEffect(.regular, in: .rect(cornerRadius: 16))

            // Action buttons
            HStack(spacing: 12) {
                Button {
                    showQRScanner = true
                    qrStatus = .idle
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "qrcode.viewfinder")
                            .font(.system(size: 14))
                        Text(L10n.Relay.scanQR)
                            .font(.system(size: 14, weight: .medium))
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(Color.blue)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }

                Button {
                    chatService.reconnect()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.triangle.2.circlepath")
                            .font(.system(size: 14))
                        Text(L10n.Relay.reconnect)
                            .font(.system(size: 14, weight: .medium))
                    }
                    .foregroundColor(.primary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .glassEffect(.regular, in: .rect(cornerRadius: 12))
                }
            }

            // QR status feedback
            if qrStatus == .success {
                Text(L10n.Relay.qrSuccess)
                    .font(.caption)
                    .foregroundColor(.green)
                    .padding(.leading, 4)
            } else if qrStatus == .error {
                Text(L10n.Relay.qrError)
                    .font(.caption)
                    .foregroundColor(.red)
                    .padding(.leading, 4)
            }

            if let discovered = RelayDiscovery.shared.discoveredURL {
                HStack(spacing: 4) {
                    Image(systemName: "antenna.radiowaves.left.and.right")
                        .font(.caption)
                        .foregroundColor(.green)
                    Text("Auto-discovered: \(discovered)")
                        .font(.caption)
                        .foregroundColor(.green)
                }
                .padding(.leading, 4)
            }

            Text(L10n.Relay.scanHint)
                .font(.caption)
                .foregroundColor(.secondary)
                .padding(.leading, 4)
        }
    }

    private func relayField(
        icon: String,
        color: Color,
        label: String,
        text: Binding<String>,
        placeholder: String,
        isSecure: Bool = false
    ) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundColor(.white)
                .frame(width: 30, height: 30)
                .background(color)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.caption)
                    .foregroundColor(.secondary)
                if isSecure {
                    SecureField(placeholder, text: text)
                        .font(.system(size: 14))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } else {
                    TextField(placeholder, text: text)
                        .font(.system(size: 14))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    private func handleQRCode(_ code: String) {
        guard let data = code.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let url = json["relayUrl"] as? String else {
            qrStatus = .error
            return
        }
        relayBaseURL = url
        if let tenant = json["tenantId"] as? String { relayTenantId = tenant }
        if let email = json["email"] as? String { relayEmail = email }
        if let password = json["password"] as? String { relayPassword = password }
        qrStatus = .success
        chatService.reconnect()
    }

    // MARK: - Appearance

    private var appearanceSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(L10n.Settings.appearance.uppercased())
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(.secondary)
                .padding(.leading, 4)

            HStack(spacing: 12) {
                ForEach(AppearanceMode.allCases, id: \.self) { mode in
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            selectedAppearance = mode
                        }
                    } label: {
                        VStack(spacing: 8) {
                            Image(systemName: mode.icon)
                                .font(.system(size: 22))
                                .foregroundColor(selectedAppearance == mode ? .primary : .secondary)
                            Text(mode.title)
                                .font(.caption)
                                .fontWeight(.medium)
                                .foregroundColor(selectedAppearance == mode ? .primary : .secondary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .glassEffect(.regular, in: .rect(cornerRadius: 16))
                        .overlay(
                            RoundedRectangle(cornerRadius: 16)
                                .strokeBorder(selectedAppearance == mode ? Color.primary.opacity(0.5) : Color.clear, lineWidth: 1.5)
                        )
                    }
                }
            }
        }
    }

    // MARK: - Language

    private var selectedLanguage: AppLanguage {
        AppLanguage(rawValue: appLanguage) ?? .system
    }

    private var languageSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(L10n.Settings.language.uppercased())
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(.secondary)
                .padding(.leading, 4)

            Button {
                showLanguagePicker = true
            } label: {
                HStack(spacing: 12) {
                    if selectedLanguage == .system {
                        Image(systemName: "globe")
                            .font(.system(size: 14))
                            .foregroundColor(.white)
                            .frame(width: 30, height: 30)
                            .background(Color.blue)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    } else {
                        Text(selectedLanguage.icon)
                            .font(.system(size: 18))
                            .frame(width: 30, height: 30)
                    }
                    Text(selectedLanguage.displayName)
                        .foregroundColor(.primary)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.secondary)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
            .glassEffect(.regular, in: .rect(cornerRadius: 16))
        }
        .sheet(isPresented: $showLanguagePicker) {
            LanguagePickerSheet(
                selectedLanguage: appLanguage,
                onSelect: { lang in
                    appLanguage = lang.rawValue
                    showLanguagePicker = false
                }
            )
            .presentationDetents([.medium, .large])
        }
    }

    // MARK: - Notifications

    private var notificationsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(L10n.Settings.notifications.uppercased())
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(.secondary)
                .padding(.leading, 4)

            VStack(spacing: 0) {
                settingsToggle(
                    icon: "bell.fill",
                    color: .blue,
                    title: L10n.Settings.notifications,
                    isOn: $notificationsEnabled
                )
                Divider().padding(.leading, 52)
                settingsToggle(
                    icon: "speaker.wave.2.fill",
                    color: .indigo,
                    title: L10n.Settings.sound,
                    isOn: $soundEnabled
                )
                Divider().padding(.leading, 52)
                settingsToggle(
                    icon: "hand.tap.fill",
                    color: .purple,
                    title: L10n.Settings.haptics,
                    isOn: $hapticEnabled
                )
            }
            .glassEffect(.regular, in: .rect(cornerRadius: 16))
        }
    }

    // MARK: - Data

    private var dataSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(L10n.Settings.data.uppercased())
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(.secondary)
                .padding(.leading, 4)

            VStack(spacing: 0) {
                settingsRow(
                    icon: "bubble.left.and.bubble.right.fill",
                    color: .blue,
                    title: L10n.Settings.conversations,
                    value: "\(chatService.conversations.count)"
                )
                Divider().padding(.leading, 52)
                settingsRow(
                    icon: "person.2.fill",
                    color: .green,
                    title: L10n.Settings.agents,
                    value: "\(chatService.agents.count)"
                )
                Divider().padding(.leading, 52)
                Button {
                    showDeleteAlert = true
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "trash.fill")
                            .font(.system(size: 14))
                            .foregroundColor(.white)
                            .frame(width: 30, height: 30)
                            .background(Color.red)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                        Text(L10n.Settings.deleteAllConversations)
                            .foregroundColor(.red)
                        Spacer()
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
            }
            .glassEffect(.regular, in: .rect(cornerRadius: 16))
        }
    }

    // MARK: - About

    private var aboutSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(L10n.Settings.about.uppercased())
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(.secondary)
                .padding(.leading, 4)

            VStack(spacing: 0) {
                settingsRow(
                    icon: "info.circle.fill",
                    color: .blue,
                    title: L10n.Settings.version,
                    value: "1.0.0"
                )
                Divider().padding(.leading, 52)
                settingsRow(
                    icon: "hammer.fill",
                    color: .orange,
                    title: L10n.Settings.build,
                    value: "1"
                )
            }
            .glassEffect(.regular, in: .rect(cornerRadius: 16))

            Text(L10n.Settings.appSubtitle)
                .font(.caption)
                .foregroundColor(.secondary)
                .frame(maxWidth: .infinity)
                .padding(.top, 8)
        }
    }

    // MARK: - Reusable Components

    private func settingsRow(icon: String, color: Color, title: String, value: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundColor(.white)
                .frame(width: 30, height: 30)
                .background(color)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            Text(title)
                .foregroundColor(.primary)
            Spacer()
            Text(value)
                .foregroundColor(.secondary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private func settingsToggle(icon: String, color: Color, title: String, isOn: Binding<Bool>) -> some View {
        Toggle(isOn: isOn) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 14))
                    .foregroundColor(.white)
                    .frame(width: 30, height: 30)
                    .background(color)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                Text(title)
            }
        }
        .tint(.blue)
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }
}

// MARK: - Appearance Mode

enum AppearanceMode: String, CaseIterable {
    case system
    case light
    case dark

    var title: String {
        switch self {
        case .system: return L10n.Appearance.system
        case .light: return L10n.Appearance.light
        case .dark: return L10n.Appearance.dark
        }
    }

    var icon: String {
        switch self {
        case .system: return "circle.lefthalf.filled"
        case .light: return "sun.max.fill"
        case .dark: return "moon.fill"
        }
    }

    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}

// MARK: - Language Picker Sheet

struct LanguagePickerSheet: View {
    let selectedLanguage: String
    let onSelect: (AppLanguage) -> Void

    var body: some View {
        NavigationStack {
            List {
                ForEach(AppLanguage.allCases) { lang in
                    Button {
                        onSelect(lang)
                    } label: {
                        HStack(spacing: 12) {
                            if lang == .system {
                                Image(systemName: "globe")
                                    .font(.system(size: 18))
                                    .frame(width: 28)
                            } else {
                                Text(lang.icon)
                                    .font(.system(size: 20))
                                    .frame(width: 28)
                            }
                            Text(lang.displayName)
                                .foregroundColor(.primary)
                            Spacer()
                            if lang.rawValue == selectedLanguage {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundColor(.primary)
                            }
                        }
                    }
                }
            }
            .listStyle(.plain)
            .navigationTitle(L10n.Settings.language)
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
