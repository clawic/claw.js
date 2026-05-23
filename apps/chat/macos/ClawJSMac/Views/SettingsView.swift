import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var chatService: ChatService
    @AppStorage(PersistentSurfaceKeys.notificationsEnabled) private var notificationsEnabled = true
    @AppStorage(PersistentSurfaceKeys.soundEnabled) private var soundEnabled = true
    @AppStorage(PersistentSurfaceKeys.appLanguage) private var appLanguage = ""
    @AppStorage(PersistentSurfaceKeys.relayBaseURL) private var relayBaseURL = "http://127.0.0.1:4410"
    // Relay compatibility default for the legacy remote isolation namespace.
    @AppStorage(PersistentSurfaceKeys.relayIsolationId) private var relayIsolationId = "demo-tenant"
    @AppStorage(PersistentSurfaceKeys.relayEmail) private var relayEmail = "user@relay.local"
    @AppStorage(PersistentSurfaceKeys.relayPassword) private var relayPassword = "relay-user"

    @State private var showDeleteAlert = false

    var body: some View {
        TabView {
            generalTab
                .tabItem { Label("General", systemImage: "gearshape") }

            relayTab
                .tabItem { Label("Relay", systemImage: "network") }

            dataTab
                .tabItem { Label(L10n.Settings.data, systemImage: "internaldrive") }

            aboutTab
                .tabItem { Label(L10n.Settings.about, systemImage: "info.circle") }
        }
        .frame(width: 480, height: 480)
        .preferredColorScheme(.dark)
        .alert(L10n.Settings.deleteAllConversations, isPresented: $showDeleteAlert) {
            Button(L10n.General.cancel, role: .cancel) {}
            Button(L10n.General.delete, role: .destructive) {
                chatService.deleteAllConversations()
            }
        } message: {
            Text(L10n.Settings.deleteAllAlert)
        }
    }

    // MARK: - General

    private var generalTab: some View {
        Form {
            Section(L10n.Settings.language) {
                Picker(L10n.Settings.language, selection: $appLanguage) {
                    ForEach(AppLanguage.allCases) { lang in
                        HStack {
                            if lang == .system {
                                Image(systemName: "globe")
                            } else {
                                Text(lang.icon)
                            }
                            Text(lang.displayName)
                        }
                        .tag(lang.rawValue)
                    }
                }
                .pickerStyle(.menu)
            }

            Section(L10n.Settings.notifications) {
                Toggle(L10n.Settings.notifications, isOn: $notificationsEnabled)
                Toggle(L10n.Settings.sound, isOn: $soundEnabled)
            }
        }
        .formStyle(.grouped)
        .padding()
    }

    // MARK: - Relay

    private var relayTab: some View {
        Form {
            Section("Relay endpoint") {
                TextField("Base URL", text: $relayBaseURL)
                TextField("Relay isolation ID", text: $relayIsolationId)
            }
            Section("Credentials") {
                TextField("Email", text: $relayEmail)
                SecureField("Password", text: $relayPassword)
            }
            Section {
                Text("Changes take effect the next time you launch the app.")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .formStyle(.grouped)
        .padding()
    }

    // MARK: - Data

    private var dataTab: some View {
        Form {
            Section(L10n.Settings.data) {
                LabeledContent(L10n.Settings.conversations, value: "\(chatService.conversations.count)")
                LabeledContent(L10n.Settings.agents, value: "\(chatService.agents.count)")
            }
            Section {
                Button(role: .destructive) {
                    showDeleteAlert = true
                } label: {
                    Label(L10n.Settings.deleteAllConversations, systemImage: "trash")
                }
            }
        }
        .formStyle(.grouped)
        .padding()
    }

    // MARK: - About

    private var aboutTab: some View {
        VStack(spacing: 14) {
            Spacer()
            Text("ClawJS")
                .font(.system(size: 20, weight: .semibold, design: .monospaced))
            Text(L10n.Settings.appSubtitle)
                .font(.system(size: 12, design: .monospaced))
                .foregroundColor(.secondary)
            Divider().padding(.horizontal, 80)
            VStack(spacing: 4) {
                LabeledContent(L10n.Settings.version, value: "1.0.0")
                LabeledContent(L10n.Settings.build, value: "1")
            }
            .font(.system(size: 12, design: .monospaced))
            .padding(.horizontal, 80)
            Spacer()
        }
        .padding()
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
