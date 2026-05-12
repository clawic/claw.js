import Foundation

public struct HostConfiguration: Codable, Equatable, Sendable {
    public var id: String
    public var displayName: String
    public var bundleIdentifier: String?
    public var appSupportDirectoryName: String
    public var cliExecutableName: String
    public var daemonExecutableName: String
    public var launchAgentLabel: String

    public init(
        id: String,
        displayName: String,
        bundleIdentifier: String? = nil,
        appSupportDirectoryName: String,
        cliExecutableName: String,
        daemonExecutableName: String,
        launchAgentLabel: String
    ) {
        self.id = id
        self.displayName = displayName
        self.bundleIdentifier = bundleIdentifier
        self.appSupportDirectoryName = appSupportDirectoryName
        self.cliExecutableName = cliExecutableName
        self.daemonExecutableName = daemonExecutableName
        self.launchAgentLabel = launchAgentLabel
    }

    public static let claw = HostConfiguration(
        id: "claw",
        displayName: "Claw",
        appSupportDirectoryName: "Claw",
        cliExecutableName: "claw",
        daemonExecutableName: "claw-hostd",
        launchAgentLabel: "com.example.claw.host"
    )

    public static let commanderLegacy = HostConfiguration(
        id: "commander",
        displayName: "Commander",
        appSupportDirectoryName: "Commander",
        cliExecutableName: "commander",
        daemonExecutableName: "commanderd",
        launchAgentLabel: "com.clawjs.commander.daemon"
    )

    public static func current(environment: [String: String] = ProcessInfo.processInfo.environment) -> HostConfiguration {
        let base = environment["CLAW_HOST_LEGACY_COMMANDER"] == "1" ? HostConfiguration.commanderLegacy : HostConfiguration.claw
        return HostConfiguration(
            id: environment["CLAW_HOST_ID"]?.nilIfEmpty ?? base.id,
            displayName: environment["CLAW_HOST_DISPLAY_NAME"]?.nilIfEmpty ?? base.displayName,
            bundleIdentifier: environment["CLAW_HOST_BUNDLE_ID"]?.nilIfEmpty ?? base.bundleIdentifier,
            appSupportDirectoryName: environment["CLAW_HOST_APP_SUPPORT_NAME"]?.nilIfEmpty ?? base.appSupportDirectoryName,
            cliExecutableName: environment["CLAW_HOST_CLI_NAME"]?.nilIfEmpty ?? base.cliExecutableName,
            daemonExecutableName: environment["CLAW_HOST_DAEMON_NAME"]?.nilIfEmpty ?? base.daemonExecutableName,
            launchAgentLabel: environment["CLAW_HOST_LAUNCH_AGENT_LABEL"]?.nilIfEmpty ?? base.launchAgentLabel
        )
    }
}

private extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}
