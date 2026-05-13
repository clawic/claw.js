import Foundation

public struct HostConfiguration: Codable, Equatable, Sendable {
    public var id: String
    public var displayName: String
    public var bundleIdentifier: String?
    public var appSupportDirectoryName: String
    public var cliExecutableName: String
    public var daemonExecutableName: String
    public var launchAgentLabel: String
    public var machServiceName: String?
    public var logSubsystem: String
    public var permissionPromptName: String

    public init(
        id: String,
        displayName: String,
        bundleIdentifier: String? = nil,
        appSupportDirectoryName: String,
        cliExecutableName: String,
        daemonExecutableName: String,
        launchAgentLabel: String,
        machServiceName: String? = nil,
        logSubsystem: String? = nil,
        permissionPromptName: String? = nil
    ) {
        self.id = id
        self.displayName = displayName
        self.bundleIdentifier = bundleIdentifier
        self.appSupportDirectoryName = appSupportDirectoryName
        self.cliExecutableName = cliExecutableName
        self.daemonExecutableName = daemonExecutableName
        self.launchAgentLabel = launchAgentLabel
        self.machServiceName = machServiceName
        self.logSubsystem = logSubsystem ?? id
        self.permissionPromptName = permissionPromptName ?? displayName
    }

    public static let claw = HostConfiguration(
        id: "claw",
        displayName: "Claw",
        appSupportDirectoryName: "Claw",
        cliExecutableName: "claw-host",
        daemonExecutableName: "claw-hostd",
        launchAgentLabel: "com.example.claw.host",
        machServiceName: "com.example.claw.runtime",
        logSubsystem: "com.example.claw",
        permissionPromptName: "Claw"
    )

    public static let clawix = HostConfiguration(
        id: "clawix",
        displayName: "Clawix",
        appSupportDirectoryName: "Clawix",
        cliExecutableName: "clawix-host",
        daemonExecutableName: "clawix-hostd",
        launchAgentLabel: "com.example.clawix.host",
        machServiceName: "com.example.clawix.runtime",
        logSubsystem: "com.example.clawix",
        permissionPromptName: "Clawix"
    )

    public static func current(environment: [String: String] = ProcessInfo.processInfo.environment) -> HostConfiguration {
        let base = HostConfiguration.claw
        return HostConfiguration(
            id: environment["CLAW_HOST_ID"]?.nilIfEmpty ?? base.id,
            displayName: environment["CLAW_HOST_DISPLAY_NAME"]?.nilIfEmpty ?? base.displayName,
            bundleIdentifier: environment["CLAW_HOST_BUNDLE_ID"]?.nilIfEmpty ?? base.bundleIdentifier,
            appSupportDirectoryName: environment["CLAW_HOST_APP_SUPPORT_NAME"]?.nilIfEmpty ?? base.appSupportDirectoryName,
            cliExecutableName: environment["CLAW_HOST_CLI_NAME"]?.nilIfEmpty ?? base.cliExecutableName,
            daemonExecutableName: environment["CLAW_HOST_DAEMON_NAME"]?.nilIfEmpty ?? base.daemonExecutableName,
            launchAgentLabel: environment["CLAW_HOST_LAUNCH_AGENT_LABEL"]?.nilIfEmpty ?? base.launchAgentLabel,
            machServiceName: environment["CLAW_HOST_MACH_SERVICE"]?.nilIfEmpty ?? base.machServiceName,
            logSubsystem: environment["CLAW_HOST_LOG_SUBSYSTEM"]?.nilIfEmpty ?? base.logSubsystem,
            permissionPromptName: environment["CLAW_HOST_PERMISSION_NAME"]?.nilIfEmpty ?? base.permissionPromptName
        )
    }
}

private extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}
