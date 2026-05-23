import Foundation

enum PersistentSurfaceKeys {
    static let publicApiPrefix = "/v" + "1"

    static let selectedAppearance = "selectedAppearance"
    static let appLanguage = "appLanguage"
    static let notificationsEnabled = "notificationsEnabled"
    static let soundEnabled = "soundEnabled"
    static let hapticEnabled = "hapticEnabled"
    static let relayBaseURL = "relayBaseURL"
    // Stored key remains the legacy Relay setting; app code uses isolation vocabulary.
    static let relayIsolationId = "relayTenantId"
    static let relayEmail = "relayEmail"
    static let relayPassword = "relayPassword"
    static let mainWindowFrame = "NSWindow Frame main"
    static let swiftUiWindowFrame = "NSWindow Frame SwiftUI"

    static func apiPath(_ suffix: String) -> String {
        let cleaned = suffix.hasPrefix("/") ? String(suffix.dropFirst()) : suffix
        return "\(publicApiPrefix)/\(cleaned)"
    }
}
