import CommanderCore
import Foundation

/// One app the user lets Computer Use control without a per-app prompt. Matched
/// by bundle id when present, otherwise by display name.
public struct ComputerUseAllowedApp: Codable, Equatable, Sendable {
    public var bundleId: String?
    public var name: String

    public init(bundleId: String? = nil, name: String) {
        self.bundleId = bundleId
        self.name = name
    }
}

/// Host-readable Computer Use policy written by the host UI. `anyApp` is the
/// master enable for controlling any app; `allowedApps` is the always-allowed
/// list that skips the per-app approval. The signed-host broker consults this so
/// agent-origin `mac.app.*` actions are blocked when Computer Use is off,
/// auto-approved for always-allowed apps, and otherwise require approval.
public struct ComputerUsePolicy: Codable, Equatable, Sendable {
    public var anyApp: Bool
    public var lockedUse: Bool
    public var allowedApps: [ComputerUseAllowedApp]

    public init(anyApp: Bool = true, lockedUse: Bool = false, allowedApps: [ComputerUseAllowedApp] = []) {
        self.anyApp = anyApp
        self.lockedUse = lockedUse
        self.allowedApps = allowedApps
    }
}

public enum ComputerUsePolicyStore {
    public static let filename = "computer-use-policy.json"

    public enum Decision: String, Equatable, Sendable {
        /// Computer Use is turned off for any app.
        case blocked
        /// App is always-allowed; execute without prompting.
        case allowed
        /// App needs approval before a mutating action runs.
        case requiresApproval
    }

    public static func fileURL(stateDirectory: URL) -> URL {
        stateDirectory.appendingPathComponent(filename)
    }

    /// Canonical policy path in the active host state directory, shared by the
    /// host UI (writer) and the signed-host broker (reader).
    public static func defaultURL(environment: [String: String] = ProcessInfo.processInfo.environment) -> URL {
        fileURL(stateDirectory: StatePaths.stateDirectory(environment: environment))
    }

    /// Load the policy, defaulting to "any app enabled, nothing always-allowed"
    /// when the file is missing or unreadable (so a fresh host still works while
    /// gating sensitive apps behind the per-app prompt).
    public static func load(from url: URL) -> ComputerUsePolicy {
        guard FileManager.default.fileExists(atPath: url.path),
              let data = try? Data(contentsOf: url),
              let policy = try? JSONDecoder().decode(ComputerUsePolicy.self, from: data) else {
            return ComputerUsePolicy()
        }
        return policy
    }

    public static func save(_ policy: ComputerUsePolicy, to url: URL) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(policy).write(to: url, options: .atomic)
    }

    public static func isAllowed(app: String, policy: ComputerUsePolicy) -> Bool {
        let trimmed = app.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        return policy.allowedApps.contains { entry in
            if let bundleId = entry.bundleId, !bundleId.isEmpty,
               bundleId.caseInsensitiveCompare(trimmed) == .orderedSame {
                return true
            }
            return entry.name.caseInsensitiveCompare(trimmed) == .orderedSame
        }
    }

    public static func decision(for app: String, policy: ComputerUsePolicy) -> Decision {
        guard policy.anyApp else { return .blocked }
        return isAllowed(app: app, policy: policy) ? .allowed : .requiresApproval
    }
}
