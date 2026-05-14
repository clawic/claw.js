import Foundation

enum PersistentSurfaceKeys {
    static let publicApiPrefix = "/v" + "1"

    static func apiPath(_ suffix: String) -> String {
        let cleaned = suffix.hasPrefix("/") ? String(suffix.dropFirst()) : suffix
        return "\(publicApiPrefix)/\(cleaned)"
    }
}
