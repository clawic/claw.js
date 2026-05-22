import Foundation

public enum MacCareHostSystemRoutes {
    public static let applicationsDir = "/Applications"
    public static let userApplicationsDirName = "Applications"
    public static let systemApplicationsDir = "/System/Applications"
    public static let systemCoreServicesDir = "/System/Library/CoreServices"

    public static let launchctlCLI = "/bin/launchctl"
    public static let osascriptCLI = "/usr/bin/osascript"
    public static let psCLI = "/bin/ps"
    public static let screencaptureCLI = "/usr/sbin/screencapture"

    public static func userApplicationsDir(home: String = FileManager.default.homeDirectoryForCurrentUser.path) -> String {
        "\(home)/\(userApplicationsDirName)"
    }

    public static func applicationBundleCandidates(
        named appName: String,
        home: String = FileManager.default.homeDirectoryForCurrentUser.path
    ) -> [String] {
        [
            "\(systemApplicationsDir)/\(appName).app",
            "\(systemCoreServicesDir)/\(appName).app",
            "\(applicationsDir)/\(appName).app",
            "\(userApplicationsDir(home: home))/\(appName).app",
        ]
    }
}
