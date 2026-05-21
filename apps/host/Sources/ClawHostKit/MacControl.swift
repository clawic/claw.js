import AppKit
import ApplicationServices
import AVFoundation
import Contacts
import CoreAudio
import CoreWLAN
import EventKit
import Foundation
import IOKit
import IOKit.graphics
import IOKit.hid
import Speech

public enum MacControlOrigin: String, Codable, Sendable {
    case ownerCLI = "owner_cli"
    case userUI = "user_ui"
    case agent
    case mcpClient = "mcp_client"
    case automation
    case system

    public var isLocalHuman: Bool {
        switch self {
        case .ownerCLI, .userUI:
            return true
        case .agent, .mcpClient, .automation, .system:
            return false
        }
    }
}

public enum MacControlPermissionID: String, CaseIterable, Codable, Sendable {
    case microphone = "mac.permission.microphone"
    case speechRecognition = "mac.permission.speech_recognition"
    case camera = "mac.permission.camera"
    case accessibility = "mac.permission.accessibility"
    case inputMonitoring = "mac.permission.input_monitoring"
    case automationAppleEvents = "mac.permission.automation_apple_events"
    case contacts = "mac.permission.contacts"
    case calendar = "mac.permission.calendar"
    case reminders = "mac.permission.reminders"
}

public enum MacControlPermissionStatus: String, Codable, Sendable {
    case granted
    case denied
    case notDetermined = "not_determined"
}

public struct MacControlPermissionLifecycleRecord: Codable, Equatable, Sendable {
    public var permissionId: MacControlPermissionID
    public var requestedBefore: Bool
    public var canRequest: Bool
    public var requiresRestart: Bool
    public var source: String
    public var firstUsedAt: String?
    public var lastCheckedAt: String
    public var lastRequestedAt: String?
    public var lastRequestResult: MacControlPermissionStatus?
    public var lastKnownStatus: MacControlPermissionStatus
    public var revocationDetectedAt: String?
}

public enum MacControlPermissionLifecycleStore {
    public static let filename = "mac-permission-lifecycle.json"
    private static let source = "signed-host-mac-permission-broker"

    private struct StoreFile: Codable {
        var schemaVersion: Int
        var permissions: [String: MacControlPermissionLifecycleRecord]
    }

    public static func fileURL(stateDirectory: URL) -> URL {
        stateDirectory.appendingPathComponent(filename)
    }

    @discardableResult
    public static func observeStatus(
        permission: MacControlPermissionID,
        status: MacControlPermissionStatus,
        stateURL: URL,
        now: Date = Date()
    ) throws -> MacControlPermissionLifecycleRecord {
        var store = try load(from: stateURL)
        let timestamp = Self.timestamp(now)
        var record = store.permissions[permission.rawValue] ?? initialRecord(
            permission: permission,
            status: status,
            timestamp: timestamp
        )
        if record.lastKnownStatus == .granted && status != .granted && record.revocationDetectedAt == nil {
            record.revocationDetectedAt = timestamp
        }
        record.lastKnownStatus = status
        record.lastCheckedAt = timestamp
        record.canRequest = canRequest(status)
        record.requiresRestart = requiresRestart(permission)
        store.permissions[permission.rawValue] = record
        try save(store, to: stateURL)
        return record
    }

    @discardableResult
    public static func recordRequest(
        permission: MacControlPermissionID,
        result: MacControlPermissionStatus,
        stateURL: URL,
        now: Date = Date()
    ) throws -> MacControlPermissionLifecycleRecord {
        var store = try load(from: stateURL)
        let timestamp = Self.timestamp(now)
        var record = store.permissions[permission.rawValue] ?? initialRecord(
            permission: permission,
            status: result,
            timestamp: timestamp
        )
        record.requestedBefore = true
        record.canRequest = canRequest(result)
        record.requiresRestart = requiresRestart(permission)
        record.lastCheckedAt = timestamp
        record.lastRequestedAt = timestamp
        record.lastRequestResult = result
        record.lastKnownStatus = result
        store.permissions[permission.rawValue] = record
        try save(store, to: stateURL)
        return record
    }

    public static func record(permission: MacControlPermissionID, stateURL: URL) throws -> MacControlPermissionLifecycleRecord? {
        try load(from: stateURL).permissions[permission.rawValue]
    }

    private static func initialRecord(
        permission: MacControlPermissionID,
        status: MacControlPermissionStatus,
        timestamp: String
    ) -> MacControlPermissionLifecycleRecord {
        MacControlPermissionLifecycleRecord(
            permissionId: permission,
            requestedBefore: false,
            canRequest: canRequest(status),
            requiresRestart: requiresRestart(permission),
            source: source,
            firstUsedAt: timestamp,
            lastCheckedAt: timestamp,
            lastRequestedAt: nil,
            lastRequestResult: nil,
            lastKnownStatus: status,
            revocationDetectedAt: nil
        )
    }

    private static func load(from url: URL) throws -> StoreFile {
        guard FileManager.default.fileExists(atPath: url.path) else {
            return StoreFile(schemaVersion: 1, permissions: [:])
        }
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(StoreFile.self, from: data)
    }

    private static func save(_ store: StoreFile, to url: URL) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(store).write(to: url, options: .atomic)
    }

    private static func canRequest(_ status: MacControlPermissionStatus) -> Bool {
        status == .notDetermined
    }

    private static func requiresRestart(_ permission: MacControlPermissionID) -> Bool {
        switch permission {
        case .accessibility, .inputMonitoring, .automationAppleEvents:
            return true
        case .microphone, .speechRecognition, .camera, .contacts, .calendar, .reminders:
            return false
        }
    }

    private static func timestamp(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }
}

@MainActor
public enum MacControlPermissionBroker {
    public nonisolated static let accessibilityRequestedKey = "claw.host.mac.permission.accessibility.requested"

    public static func status(for permission: MacControlPermissionID) -> MacControlPermissionStatus {
        switch permission {
        case .microphone:
            return avStatus(AVCaptureDevice.authorizationStatus(for: .audio))
        case .speechRecognition:
            switch SFSpeechRecognizer.authorizationStatus() {
            case .authorized: return .granted
            case .denied, .restricted: return .denied
            case .notDetermined: return .notDetermined
            @unknown default: return .notDetermined
            }
        case .camera:
            return avStatus(AVCaptureDevice.authorizationStatus(for: .video))
        case .accessibility:
            if AXIsProcessTrusted() { return .granted }
            if UserDefaults.standard.bool(forKey: accessibilityRequestedKey) { return .denied }
            return .notDetermined
        case .inputMonitoring:
            switch IOHIDCheckAccess(kIOHIDRequestTypeListenEvent) {
            case kIOHIDAccessTypeGranted: return .granted
            case kIOHIDAccessTypeDenied: return .denied
            default: return .notDetermined
            }
        case .automationAppleEvents:
            return .notDetermined
        case .contacts:
            return contactsStatus(CNContactStore.authorizationStatus(for: .contacts))
        case .calendar:
            return eventKitStatus(EKEventStore.authorizationStatus(for: .event))
        case .reminders:
            return eventKitStatus(EKEventStore.authorizationStatus(for: .reminder))
        }
    }

    public static func request(_ permission: MacControlPermissionID, lifecycleURL: URL? = nil) async -> Bool {
        let granted: Bool
        switch permission {
        case .microphone:
            granted = await avRequest(for: .audio)
        case .speechRecognition:
            granted = await withCheckedContinuation { continuation in
                SFSpeechRecognizer.requestAuthorization { status in
                    continuation.resume(returning: status == .authorized)
                }
            }
        case .camera:
            granted = await avRequest(for: .video)
        case .accessibility:
            let key = "AXTrustedCheckOptionPrompt" as CFString
            let options: CFDictionary = [key: true] as CFDictionary
            let trusted = AXIsProcessTrustedWithOptions(options)
            UserDefaults.standard.set(true, forKey: accessibilityRequestedKey)
            granted = trusted
        case .inputMonitoring:
            granted = IOHIDRequestAccess(kIOHIDRequestTypeListenEvent)
        case .automationAppleEvents:
            granted = false
        case .contacts:
            granted = await requestContacts()
        case .calendar:
            granted = await requestEventKit(.event)
        case .reminders:
            granted = await requestEventKit(.reminder)
        }
        if let lifecycleURL {
            let result: MacControlPermissionStatus = granted ? .granted : status(for: permission)
            _ = try? MacControlPermissionLifecycleStore.recordRequest(
                permission: permission,
                result: result,
                stateURL: lifecycleURL
            )
        }
        return granted
    }

    public static func openSettings(for permission: MacControlPermissionID) {
        let url: String
        switch permission {
        case .microphone:
            url = "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
        case .speechRecognition:
            url = "x-apple.systempreferences:com.apple.preference.security?Privacy_SpeechRecognition"
        case .camera:
            url = "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera"
        case .accessibility:
            url = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
        case .inputMonitoring:
            url = "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent"
        case .automationAppleEvents:
            url = "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation"
        case .contacts:
            url = "x-apple.systempreferences:com.apple.preference.security?Privacy_Contacts"
        case .calendar:
            url = "x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars"
        case .reminders:
            url = "x-apple.systempreferences:com.apple.preference.security?Privacy_Reminders"
        }
        guard let parsed = URL(string: url) else { return }
        NSWorkspace.shared.open(parsed)
    }

    private static func avStatus(_ status: AVAuthorizationStatus) -> MacControlPermissionStatus {
        switch status {
        case .authorized: return .granted
        case .denied, .restricted: return .denied
        case .notDetermined: return .notDetermined
        @unknown default: return .notDetermined
        }
    }

    private static func avRequest(for mediaType: AVMediaType) async -> Bool {
        await withCheckedContinuation { continuation in
            AVCaptureDevice.requestAccess(for: mediaType) { granted in
                continuation.resume(returning: granted)
            }
        }
    }

    private static func contactsStatus(_ status: CNAuthorizationStatus) -> MacControlPermissionStatus {
        switch status {
        case .authorized: return .granted
        case .denied, .restricted: return .denied
        case .notDetermined: return .notDetermined
        @unknown default: return .notDetermined
        }
    }

    private static func requestContacts() async -> Bool {
        await withCheckedContinuation { continuation in
            CNContactStore().requestAccess(for: .contacts) { granted, _ in
                continuation.resume(returning: granted)
            }
        }
    }

    private static func eventKitStatus(_ status: EKAuthorizationStatus) -> MacControlPermissionStatus {
        switch status {
        case .authorized, .fullAccess, .writeOnly:
            return .granted
        case .denied, .restricted:
            return .denied
        case .notDetermined:
            return .notDetermined
        @unknown default:
            return .notDetermined
        }
    }

    private static func requestEventKit(_ entityType: EKEntityType) async -> Bool {
        let store = EKEventStore()
        return await withCheckedContinuation { continuation in
            if #available(macOS 14.0, *) {
                switch entityType {
                case .event:
                    store.requestFullAccessToEvents { granted, _ in
                        continuation.resume(returning: granted)
                    }
                case .reminder:
                    store.requestFullAccessToReminders { granted, _ in
                        continuation.resume(returning: granted)
                    }
                @unknown default:
                    continuation.resume(returning: false)
                }
            } else {
                store.requestAccess(to: entityType) { granted, _ in
                    continuation.resume(returning: granted)
                }
            }
        }
    }
}

public struct MacControlActionRequest: Codable, Equatable, Sendable {
    public var requestId: String
    public var capabilityId: String
    public var actorId: String
    public var origin: MacControlOrigin
    public var actorKind: String?
    public var actorRole: String?
    public var assignmentId: String?
    public var runId: String?
    public var arguments: [String: String]
    public var dryRun: Bool
    public var approved: Bool

    public init(
        requestId: String = "macreq_\(UUID().uuidString)",
        capabilityId: String,
        actorId: String,
        origin: MacControlOrigin,
        actorKind: String? = nil,
        actorRole: String? = nil,
        assignmentId: String? = nil,
        runId: String? = nil,
        arguments: [String: String] = [:],
        dryRun: Bool = false,
        approved: Bool = false
    ) {
        self.requestId = requestId
        self.capabilityId = capabilityId
        self.actorId = actorId
        self.origin = origin
        self.actorKind = actorKind
        self.actorRole = actorRole
        self.assignmentId = assignmentId
        self.runId = runId
        self.arguments = arguments
        self.dryRun = dryRun
        self.approved = approved
    }
}

public struct MacControlActionPlan: Codable, Equatable, Sendable {
    public enum Risk: String, Codable, Sendable {
        case read
        case low
        case medium
        case high
        case critical
    }

    public enum RevertLevel: String, Codable, Sendable {
        case guaranteed
        case bestEffort = "best_effort"
        case none
    }

    public struct Step: Codable, Equatable, Sendable {
        public enum Kind: String, Codable, Sendable {
            case process
            case appleScript = "apple_script"
            case native
        }

        public var kind: Kind
        public var executable: String?
        public var arguments: [String]
        public var script: String?
        public var preview: String
        public var redacted: Bool
    }

    public var planId: String
    public var requestId: String
    public var capabilityId: String
    public var risk: Risk
    public var requiredPermissionIds: [MacControlPermissionID]
    public var requiresApproval: Bool
    public var continuityBreaker: Bool
    public var revertLevel: RevertLevel
    public var steps: [Step]
    public var blockedReason: String?

    public var isBlocked: Bool { blockedReason != nil }
}

public struct MacControlActionReceipt: Codable, Equatable, Sendable {
    public enum Outcome: String, Codable, Sendable {
        case planned
        case approvalRequired = "approval_required"
        case blocked
        case executed
        case failed
    }

    public var receiptId: String
    public var requestId: String
    public var planId: String
    public var capabilityId: String
    public var outcome: Outcome
    public var outputs: [String]
    public var error: String?
    public var beforeRef: String?
    public var afterRef: String?
}

public enum MacControlContinuityRevertStepKind: String, Codable, Sendable {
    case process
}

public enum MacControlContinuityRevertStatus: String, Codable, Sendable {
    case pending
    case reverted
    case failed
}

public struct MacControlContinuityRevertStep: Codable, Equatable, Sendable {
    public var kind: MacControlContinuityRevertStepKind
    public var executable: String
    public var arguments: [String]
    public var preview: String
    public var redacted: Bool
}

public struct MacControlContinuitySnapshot: Codable, Equatable, Sendable {
    public var ref: String
    public var capabilityId: String
    public var device: String
    public var beforePowerRaw: String
    public var beforeNetworkRaw: String
    public var beforeNetworkName: String?
    public var capturedAt: String
}

public struct MacControlContinuityRecord: Codable, Equatable, Sendable {
    public var receiptId: String
    public var requestId: String
    public var planId: String
    public var capabilityId: String
    public var snapshot: MacControlContinuitySnapshot
    public var revertSteps: [MacControlContinuityRevertStep]
    public var status: MacControlContinuityRevertStatus
    public var createdAt: String
    public var revertedAt: String?
    public var error: String?
}

public enum MacControlContinuityStore {
    public static let filename = "mac-control-continuity.json"

    private struct StoreFile: Codable {
        var schemaVersion: Int
        var records: [String: MacControlContinuityRecord]
    }

    public static func fileURL(stateDirectory: URL) -> URL {
        stateDirectory.appendingPathComponent(filename)
    }

    public static func record(receiptId: String, stateURL: URL) throws -> MacControlContinuityRecord? {
        try load(from: stateURL).records[receiptId]
    }

    @discardableResult
    public static func upsert(_ record: MacControlContinuityRecord, stateURL: URL) throws -> MacControlContinuityRecord {
        var store = try load(from: stateURL)
        store.records[record.receiptId] = record
        try save(store, to: stateURL)
        return record
    }

    @discardableResult
    public static func markReverted(receiptId: String, stateURL: URL, now: Date = Date()) throws -> MacControlContinuityRecord? {
        var store = try load(from: stateURL)
        guard var record = store.records[receiptId] else { return nil }
        record.status = .reverted
        record.revertedAt = timestamp(now)
        record.error = nil
        store.records[receiptId] = record
        try save(store, to: stateURL)
        return record
    }

    @discardableResult
    public static func markFailed(receiptId: String, error: String, stateURL: URL, now: Date = Date()) throws -> MacControlContinuityRecord? {
        var store = try load(from: stateURL)
        guard var record = store.records[receiptId] else { return nil }
        record.status = .failed
        record.revertedAt = timestamp(now)
        record.error = error
        store.records[receiptId] = record
        try save(store, to: stateURL)
        return record
    }

    private static func load(from url: URL) throws -> StoreFile {
        guard FileManager.default.fileExists(atPath: url.path) else {
            return StoreFile(schemaVersion: 1, records: [:])
        }
        return try JSONDecoder().decode(StoreFile.self, from: Data(contentsOf: url))
    }

    private static func save(_ store: StoreFile, to url: URL) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(store).write(to: url, options: .atomic)
    }

    private static func timestamp(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }
}

public enum MacControlPolicySubjectKind: String, Codable, CaseIterable, Sendable {
    case role
    case user
    case agent
    case assignment
    case run
    case mcpClient = "mcp_client"
    case automation
}

public enum MacControlPolicyGrantEffect: String, Codable, CaseIterable, Sendable {
    case allow
    case block
}

public enum MacControlPolicyGrantStatus: String, Codable, CaseIterable, Sendable {
    case active
    case expired
    case revoked
}

public enum MacControlPolicyGrantDurationKind: String, Codable, CaseIterable, Sendable {
    case task
    case session
    case ttl
    case permanent
}

public struct MacControlPolicySubject: Codable, Equatable, Sendable {
    public var kind: MacControlPolicySubjectKind
    public var id: String
}

public struct MacControlPolicyGrantDuration: Codable, Equatable, Sendable {
    public var kind: MacControlPolicyGrantDurationKind
    public var ttlSeconds: Int?
}

public struct MacControlPolicyGrant: Codable, Equatable, Sendable {
    public var id: String
    public var subject: MacControlPolicySubject
    public var effect: MacControlPolicyGrantEffect
    public var capabilityIds: [String]
    public var permissionIds: [MacControlPermissionID]
    public var riskCeiling: MacControlActionPlan.Risk
    public var duration: MacControlPolicyGrantDuration
    public var createdBy: MacControlWireActor
    public var createdAt: String
    public var expiresAt: String?
    public var status: MacControlPolicyGrantStatus
}

public enum MacControlPolicyGrantStore {
    public static let filename = "mac-control-policy-grants.json"

    private struct StoreFile: Codable {
        var schemaVersion: Int
        var grants: [MacControlPolicyGrant]
    }

    public static func fileURL(stateDirectory: URL) -> URL {
        stateDirectory.appendingPathComponent(filename)
    }

    public static func list(stateURL: URL) throws -> [MacControlPolicyGrant] {
        try load(from: stateURL).grants
    }

    @discardableResult
    public static func upsert(_ grant: MacControlPolicyGrant, stateURL: URL) throws -> MacControlPolicyGrant {
        var store = try load(from: stateURL)
        store.grants.removeAll { $0.id == grant.id }
        store.grants.insert(grant, at: 0)
        try save(store, to: stateURL)
        return grant
    }

    @discardableResult
    public static func revoke(id: String, stateURL: URL) throws -> MacControlPolicyGrant? {
        var store = try load(from: stateURL)
        guard let index = store.grants.firstIndex(where: { $0.id == id }) else { return nil }
        store.grants[index].status = .revoked
        try save(store, to: stateURL)
        return store.grants[index]
    }

    public static func activeMatching(
        request: MacControlActionRequest,
        plan: MacControlActionPlan,
        stateURL: URL,
        now: Date = Date()
    ) throws -> [MacControlPolicyGrant] {
        try list(stateURL: stateURL).filter { grant in
            isActive(grant, now: now) &&
                subjectMatches(grant.subject, request: request) &&
                scopeMatches(grant, request: request, plan: plan) &&
                risk(plan.risk, isWithin: grant.riskCeiling)
        }
    }

    private static func load(from url: URL) throws -> StoreFile {
        guard FileManager.default.fileExists(atPath: url.path) else {
            return StoreFile(schemaVersion: 1, grants: [])
        }
        return try JSONDecoder().decode(StoreFile.self, from: Data(contentsOf: url))
    }

    private static func save(_ store: StoreFile, to url: URL) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(store).write(to: url, options: .atomic)
    }

    private static func isActive(_ grant: MacControlPolicyGrant, now: Date) -> Bool {
        guard grant.status == .active else { return false }
        guard let expiresAt = grant.expiresAt else { return true }
        return (ISO8601DateFormatter().date(from: expiresAt) ?? .distantPast) > now
    }

    private static func subjectMatches(_ subject: MacControlPolicySubject, request: MacControlActionRequest) -> Bool {
        switch subject.kind {
        case .role:
            return request.actorRole == subject.id
        case .user:
            return request.origin.isLocalHuman && request.actorId == subject.id
        case .agent:
            return (request.actorKind ?? request.origin.rawValue) == "agent" && request.actorId == subject.id
        case .assignment:
            return request.assignmentId == subject.id
        case .run:
            return request.runId == subject.id
        case .mcpClient:
            return (request.actorKind ?? request.origin.rawValue) == "mcp_client" && request.actorId == subject.id
        case .automation:
            return (request.actorKind ?? request.origin.rawValue) == "automation" && request.actorId == subject.id
        }
    }

    private static func scopeMatches(_ grant: MacControlPolicyGrant, request: MacControlActionRequest, plan: MacControlActionPlan) -> Bool {
        if grant.capabilityIds.isEmpty && grant.permissionIds.isEmpty { return true }
        if grant.capabilityIds.contains(request.capabilityId) { return true }
        return grant.permissionIds.contains { permissionId in
            plan.requiredPermissionIds.contains(permissionId)
        }
    }

    private static func risk(_ risk: MacControlActionPlan.Risk, isWithin ceiling: MacControlActionPlan.Risk) -> Bool {
        rank(risk) <= rank(ceiling)
    }

    private static func rank(_ risk: MacControlActionPlan.Risk) -> Int {
        switch risk {
        case .read: return 0
        case .low: return 1
        case .medium: return 2
        case .high: return 3
        case .critical: return 4
        }
    }
}

public protocol MacControlCommandRunning {
    func runProcess(_ executable: String, arguments: [String]) throws -> String
    func runAppleScript(_ source: String) throws -> String
    func runNative(_ action: String, arguments: [String]) throws -> String
}

public struct MacControlProcessRunner: MacControlCommandRunning {
    public init() {}

    public func runProcess(_ executable: String, arguments: [String]) throws -> String {
        let process = Process()
        let output = Pipe()
        let error = Pipe()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        process.standardOutput = output
        process.standardError = error
        try process.run()
        process.waitUntilExit()

        let out = String(data: output.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        let err = String(data: error.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        guard process.terminationStatus == 0 else {
            throw MacControlError.commandFailed(err.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        return out
    }

    public func runAppleScript(_ source: String) throws -> String {
        var error: NSDictionary?
        guard let script = NSAppleScript(source: source) else {
            throw MacControlError.commandFailed("Could not prepare AppleScript action")
        }
        let result = script.executeAndReturnError(&error)
        if let error {
            let message = error[NSAppleScript.errorMessage] as? String ?? "AppleScript action failed"
            throw MacControlError.commandFailed(message)
        }
        return result.stringValue ?? ""
    }

    public func runNative(_ action: String, arguments: [String]) throws -> String {
        switch action {
        case "corewlan.disconnect":
            let device = arguments.first?.isEmpty == false ? arguments[0] : "en0"
            guard let interface = CWWiFiClient.shared().interface(withName: device) else {
                throw MacControlError.commandFailed("Wi-Fi interface \(device) was not found.")
            }
            interface.disassociate()
            return "disconnected \(device)"
        case "coreaudio.output_volume":
            let value = try percentValue(from: arguments, label: "volume")
            try setDefaultOutputVolume(Float32(value) / 100)
            return "output volume set to \(value)%"
        case "display.brightness":
            let value = try percentValue(from: arguments, label: "brightness")
            try setMainDisplayBrightness(Float(value) / 100)
            return "display brightness set to \(value)%"
        default:
            throw MacControlError.commandFailed("Unsupported native Mac Control action \(action).")
        }
    }

    private func percentValue(from arguments: [String], label: String) throws -> Int {
        guard let raw = arguments.first, let value = Int(raw), value >= 0, value <= 100 else {
            throw MacControlError.commandFailed("\(label) must be a number from 0 to 100.")
        }
        return value
    }

    private func setDefaultOutputVolume(_ volume: Float32) throws {
        var deviceID = AudioDeviceID(0)
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultOutputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        let deviceStatus = AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &address,
            0,
            nil,
            &size,
            &deviceID
        )
        guard deviceStatus == noErr, deviceID != 0 else {
            throw MacControlError.commandFailed("Default output device was not available.")
        }

        var outputVolume = volume
        var volumeAddress = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyVolumeScalar,
            mScope: kAudioDevicePropertyScopeOutput,
            mElement: kAudioObjectPropertyElementMain
        )
        if AudioObjectHasProperty(deviceID, &volumeAddress) {
            let status = AudioObjectSetPropertyData(
                deviceID,
                &volumeAddress,
                0,
                nil,
                UInt32(MemoryLayout<Float32>.size),
                &outputVolume
            )
            if status == noErr { return }
        }

        var didSetChannel = false
        for channel in UInt32(1)...UInt32(2) {
            var channelVolume = volume
            var channelAddress = AudioObjectPropertyAddress(
                mSelector: kAudioDevicePropertyVolumeScalar,
                mScope: kAudioDevicePropertyScopeOutput,
                mElement: channel
            )
            guard AudioObjectHasProperty(deviceID, &channelAddress) else { continue }
            let status = AudioObjectSetPropertyData(
                deviceID,
                &channelAddress,
                0,
                nil,
                UInt32(MemoryLayout<Float32>.size),
                &channelVolume
            )
            didSetChannel = didSetChannel || status == noErr
        }
        guard didSetChannel else {
            throw MacControlError.commandFailed("Output volume is not writable on the current device.")
        }
    }

    private func setMainDisplayBrightness(_ brightness: Float) throws {
        var iterator: io_iterator_t = 0
        let result = IOServiceGetMatchingServices(kIOMainPortDefault, IOServiceMatching("IODisplayConnect"), &iterator)
        guard result == KERN_SUCCESS else {
            throw MacControlError.commandFailed("Display brightness service was not available.")
        }
        defer { IOObjectRelease(iterator) }

        var didSetDisplay = false
        while true {
            let service = IOIteratorNext(iterator)
            if service == 0 { break }
            defer { IOObjectRelease(service) }
            let status = IODisplaySetFloatParameter(service, 0, kIODisplayBrightnessKey as CFString, brightness)
            didSetDisplay = didSetDisplay || status == KERN_SUCCESS
        }
        guard didSetDisplay else {
            throw MacControlError.commandFailed("Display brightness is not writable on the current display.")
        }
    }
}

public enum MacControlError: LocalizedError, Equatable {
    case unsupportedCapability(String)
    case commandFailed(String)

    public var errorDescription: String? {
        switch self {
        case .unsupportedCapability(let capability):
            return "Unsupported Mac action capability: \(capability)"
        case .commandFailed(let message):
            return message.isEmpty ? "Mac action command failed" : message
        }
    }
}

public enum MacControlPolicy {
    public enum Approval: String, Codable, CaseIterable, Sendable {
        case alwaysAsk = "always_ask"
        case alwaysAllow = "always_allow"
        case alwaysBlock = "always_block"
    }

    public struct Authorization: Equatable, Sendable {
        public let allowed: Bool
        public let outcome: String
        public let reason: String?
        public let grantId: String?
    }

    public struct AuditEvent: Codable, Equatable, Sendable {
        public let timestamp: String
        public let action: String
        public let origin: MacControlOrigin
        public let approval: Approval
        public let outcome: String
        public let reason: String?
        public let grantId: String?
        public let actorId: String?
        public let actorKind: String?
    }

    public static let approvalKey = "claw.host.macControl.approval"
    public static let auditFilename = "mac-control-audit.jsonl"

    public static func approval(defaults: UserDefaults = .standard) -> Approval {
        guard let raw = defaults.string(forKey: approvalKey),
              let approval = Approval(rawValue: raw) else {
            return .alwaysAsk
        }
        return approval
    }

    @discardableResult
    public static func authorize(
        action: String,
        origin: MacControlOrigin,
        defaults: UserDefaults = .standard,
        auditURL: URL? = nil,
        now: Date = Date(),
        approvedOverride: Bool = false,
        request: MacControlActionRequest? = nil,
        plan: MacControlActionPlan? = nil,
        policyURL: URL? = nil
    ) -> Authorization {
        let policy = approval(defaults: defaults)
        let authorization: Authorization
        switch policy {
        case .alwaysBlock:
            authorization = Authorization(allowed: false, outcome: "blocked", reason: "Mac Control policy blocks this action.", grantId: nil)
        case .alwaysAllow, .alwaysAsk:
            authorization = grantAuthorization(request: request, plan: plan, policyURL: policyURL, now: now)
                ?? defaultAuthorization(policy: policy, origin: origin, approvedOverride: approvedOverride)
        }

        appendAudit(
            AuditEvent(
                timestamp: timestamp(now),
                action: action,
                origin: origin,
                approval: policy,
                outcome: authorization.outcome,
                reason: authorization.reason,
                grantId: authorization.grantId,
                actorId: request?.actorId,
                actorKind: request?.actorKind
            ),
            to: auditURL ?? defaultAuditURL()
        )
        return authorization
    }

    private static func defaultAuthorization(policy: Approval, origin: MacControlOrigin, approvedOverride: Bool) -> Authorization {
        switch policy {
        case .alwaysAllow:
            return Authorization(allowed: true, outcome: "allowed", reason: nil, grantId: nil)
        case .alwaysBlock:
            return Authorization(allowed: false, outcome: "blocked", reason: "Mac Control policy blocks this action.", grantId: nil)
        case .alwaysAsk:
            if approvedOverride || origin.isLocalHuman {
                return Authorization(allowed: true, outcome: approvedOverride ? "approved" : "allowed", reason: nil, grantId: nil)
            }
            return Authorization(allowed: false, outcome: "requires_approval", reason: "Requires explicit Mac Control approval.", grantId: nil)
        }
    }

    private static func grantAuthorization(
        request: MacControlActionRequest?,
        plan: MacControlActionPlan?,
        policyURL: URL?,
        now: Date
    ) -> Authorization? {
        guard let request, let plan, let policyURL else { return nil }
        guard let grants = try? MacControlPolicyGrantStore.activeMatching(
            request: request,
            plan: plan,
            stateURL: policyURL,
            now: now
        ) else { return nil }

        if let block = grants.first(where: { $0.effect == .block }) {
            return Authorization(
                allowed: false,
                outcome: "blocked",
                reason: "Mac Control policy grant \(block.id) blocks this action.",
                grantId: block.id
            )
        }

        if let allow = grants.first(where: { $0.effect == .allow }) {
            return Authorization(allowed: true, outcome: "granted", reason: nil, grantId: allow.id)
        }

        return nil
    }

    private static func defaultAuditURL() -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
        return base
            .appendingPathComponent("Claw", isDirectory: true)
            .appendingPathComponent(auditFilename)
    }

    private static func appendAudit(_ event: AuditEvent, to url: URL) {
        do {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.sortedKeys]
            var data = try encoder.encode(event)
            data.append(0x0A)
            if FileManager.default.fileExists(atPath: url.path),
               let handle = try? FileHandle(forWritingTo: url) {
                defer { try? handle.close() }
                try handle.seekToEnd()
                try handle.write(contentsOf: data)
            } else {
                try data.write(to: url, options: .atomic)
            }
        } catch {
            NSLog("Mac Control audit write failed: \(error.localizedDescription)")
        }
    }

    private static func timestamp(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }
}

@MainActor
public enum MacControlActionBroker {
    public static func plan(for request: MacControlActionRequest) throws -> MacControlActionPlan {
        let blockedReason = plaintextPasswordBlock(for: request)
        switch request.capabilityId {
        case "mac.wifi.status":
            return processPlan(
                request,
                risk: .read,
                permissions: [],
                steps: [
                    .process("/usr/sbin/networksetup", ["-getairportpower", wifiDevice(from: request)], "Read Wi-Fi power state"),
                    .process("/usr/sbin/networksetup", ["-getairportnetwork", wifiDevice(from: request)], "Read current Wi-Fi network"),
                ],
                blockedReason: blockedReason
            )
        case "mac.wifi.list":
            return processPlan(
                request,
                risk: .read,
                permissions: [],
                steps: [.process("/usr/sbin/networksetup", ["-listpreferredwirelessnetworks", wifiDevice(from: request)], "List preferred Wi-Fi networks")],
                blockedReason: blockedReason
            )
        case "mac.wifi.connect":
            guard let ssid = request.arguments["ssid"], !ssid.isEmpty else {
                return blockedPlan(request, reason: "Wi-Fi connect requires an explicit SSID.")
            }
            return processPlan(
                request,
                risk: .high,
                permissions: [],
                steps: [.process("/usr/sbin/networksetup", ["-setairportnetwork", wifiDevice(from: request), ssid], "Connect Wi-Fi to \(redactedName("ssid", ssid))", redacted: true)],
                requiresApproval: true,
                continuityBreaker: true,
                revertLevel: .bestEffort,
                blockedReason: blockedReason
            )
        case "mac.wifi.disconnect":
            return processPlan(
                request,
                risk: .critical,
                permissions: [],
                steps: [.native("corewlan.disconnect", [wifiDevice(from: request)], "Disconnect Wi-Fi from the current network")],
                requiresApproval: true,
                continuityBreaker: true,
                revertLevel: .bestEffort,
                blockedReason: blockedReason
            )
        case "mac.wifi.power.on":
            return wifiPowerPlan(request, power: "on", risk: .medium, blockedReason: blockedReason)
        case "mac.wifi.power.off":
            return wifiPowerPlan(request, power: "off", risk: .critical, blockedReason: blockedReason)
        case "mac.window.list":
            return appleScriptPlan(request, risk: .read, permissions: [.accessibility], script: windowListScript, preview: "List visible application windows", blockedReason: blockedReason)
        case "mac.window.focus":
            return appleScriptPlan(request, risk: .low, permissions: [.accessibility], script: focusWindowScript(for: request), preview: windowPreview("Focus", request), requiresApproval: true, revertLevel: .none, blockedReason: blockedReason)
        case "mac.window.move":
            guard let x = integerArgument("x", from: request), let y = integerArgument("y", from: request) else {
                return blockedPlan(request, reason: "Window move requires integer x and y arguments.")
            }
            return appleScriptPlan(request, risk: .low, permissions: [.accessibility], script: moveWindowScript(for: request, x: x, y: y), preview: "\(windowPreview("Move", request)) to x=\(x), y=\(y)", requiresApproval: true, revertLevel: .bestEffort, blockedReason: blockedReason)
        case "mac.window.resize":
            guard let width = positiveIntegerArgument("width", from: request), let height = positiveIntegerArgument("height", from: request) else {
                return blockedPlan(request, reason: "Window resize requires positive integer width and height arguments.")
            }
            return appleScriptPlan(request, risk: .low, permissions: [.accessibility], script: resizeWindowScript(for: request, width: width, height: height), preview: "\(windowPreview("Resize", request)) to width=\(width), height=\(height)", requiresApproval: true, revertLevel: .bestEffort, blockedReason: blockedReason)
        case "mac.window.close":
            return appleScriptPlan(request, risk: .high, permissions: [.accessibility], script: closeFocusedWindowScript, preview: "Close the focused window", requiresApproval: true, revertLevel: .none, blockedReason: blockedReason)
        case "mac.window.minimize":
            return appleScriptPlan(request, risk: .medium, permissions: [.accessibility], script: minimizeFocusedWindowScript, preview: "Minimize the focused window", requiresApproval: true, revertLevel: .bestEffort, blockedReason: blockedReason)
        case "mac.shortcut.list":
            return processPlan(request, risk: .read, permissions: [], steps: [.process("/usr/bin/shortcuts", ["list"], "List Shortcuts")], blockedReason: blockedReason)
        case "mac.shortcut.show":
            guard let name = request.arguments["name"], !name.isEmpty else {
                return blockedPlan(request, reason: "Shortcut show requires a shortcut name.")
            }
            return processPlan(request, risk: .low, permissions: [], steps: [.process("/usr/bin/shortcuts", ["view", name], "Show Shortcut \(redactedName("shortcut", name))", redacted: true)], blockedReason: blockedReason)
        case "mac.shortcut.run":
            guard let name = request.arguments["name"], !name.isEmpty else {
                return blockedPlan(request, reason: "Shortcut run requires a shortcut name.")
            }
            return processPlan(request, risk: .high, permissions: [.automationAppleEvents], steps: [.process("/usr/bin/shortcuts", ["run", name], "Run Shortcut \(redactedName("shortcut", name))", redacted: true)], requiresApproval: true, revertLevel: .none, blockedReason: blockedReason)
        case "mac.audio.volume":
            guard let value = percentArgument("value", from: request) else {
                return blockedPlan(request, reason: "Audio volume requires a numeric value from 0 to 100.")
            }
            return processPlan(
                request,
                risk: .low,
                permissions: [],
                steps: [.native("coreaudio.output_volume", [String(value)], "Set output volume to \(value)%")],
                requiresApproval: true,
                revertLevel: .none,
                blockedReason: blockedReason
            )
        case "mac.display.brightness":
            guard let value = percentArgument("value", from: request) else {
                return blockedPlan(request, reason: "Display brightness requires a numeric value from 0 to 100.")
            }
            return processPlan(
                request,
                risk: .medium,
                permissions: [],
                steps: [.native("display.brightness", [String(value)], "Set display brightness to \(value)%")],
                requiresApproval: true,
                revertLevel: .none,
                blockedReason: blockedReason
            )
        default:
            throw MacControlError.unsupportedCapability(request.capabilityId)
        }
    }

    public static func evaluate(
        _ request: MacControlActionRequest,
        defaults: UserDefaults = .standard,
        auditURL: URL? = nil,
        policyURL: URL? = nil,
        continuityURL: URL? = nil,
        runner: MacControlCommandRunning = MacControlProcessRunner()
    ) -> MacControlActionReceipt {
        let plan: MacControlActionPlan
        do {
            plan = try Self.plan(for: request)
        } catch {
            return receipt(for: request, planId: "macplan_invalid", outcome: .blocked, error: error.localizedDescription)
        }
        if let blockedReason = plan.blockedReason {
            return receipt(for: request, plan: plan, outcome: .blocked, error: blockedReason)
        }
        if request.dryRun {
            return receipt(for: request, plan: plan, outcome: .planned)
        }
        if plan.requiresApproval {
            let authorization = MacControlPolicy.authorize(
                action: request.capabilityId,
                origin: request.origin,
                defaults: defaults,
                auditURL: auditURL,
                approvedOverride: request.approved,
                request: request,
                plan: plan,
                policyURL: policyURL
            )
            guard authorization.allowed else {
                let outcome: MacControlActionReceipt.Outcome = authorization.outcome == "blocked" ? .blocked : .approvalRequired
                return receipt(for: request, plan: plan, outcome: outcome, error: authorization.reason)
            }
        }

        let snapshot: MacControlContinuitySnapshot?
        do {
            snapshot = try continuitySnapshot(for: request, plan: plan, runner: runner)
        } catch {
            return receipt(for: request, plan: plan, outcome: .failed, error: "Continuity snapshot failed: \(error.localizedDescription)")
        }

        do {
            var outputs: [String] = []
            for step in plan.steps {
                switch step.kind {
                case .process:
                    guard let executable = step.executable else { continue }
                    outputs.append(try runner.runProcess(executable, arguments: step.arguments))
                case .appleScript:
                    guard let script = step.script else { continue }
                    outputs.append(try runner.runAppleScript(script))
                case .native:
                    guard let action = step.executable else { continue }
                    outputs.append(try runner.runNative(action, arguments: step.arguments))
                }
            }
            let receipt = receipt(
                for: request,
                plan: plan,
                outcome: .executed,
                outputs: outputs,
                beforeRef: snapshot?.ref
            )
            if let snapshot, let continuityURL {
                _ = try? MacControlContinuityStore.upsert(
                    MacControlContinuityRecord(
                        receiptId: receipt.receiptId,
                        requestId: receipt.requestId,
                        planId: receipt.planId,
                        capabilityId: receipt.capabilityId,
                        snapshot: snapshot,
                        revertSteps: continuityRevertSteps(for: snapshot),
                        status: .pending,
                        createdAt: snapshot.capturedAt,
                        revertedAt: nil,
                        error: nil
                    ),
                    stateURL: continuityURL
                )
            }
            return receipt
        } catch {
            return receipt(for: request, plan: plan, outcome: .failed, error: error.localizedDescription, beforeRef: snapshot?.ref)
        }
    }

    private static func processPlan(
        _ request: MacControlActionRequest,
        risk: MacControlActionPlan.Risk,
        permissions: [MacControlPermissionID],
        steps: [MacControlActionPlan.Step],
        requiresApproval: Bool = false,
        continuityBreaker: Bool = false,
        revertLevel: MacControlActionPlan.RevertLevel = .none,
        blockedReason: String? = nil
    ) -> MacControlActionPlan {
        MacControlActionPlan(
            planId: "macplan_\(request.requestId)",
            requestId: request.requestId,
            capabilityId: request.capabilityId,
            risk: risk,
            requiredPermissionIds: permissions,
            requiresApproval: requiresApproval,
            continuityBreaker: continuityBreaker,
            revertLevel: revertLevel,
            steps: steps,
            blockedReason: blockedReason
        )
    }

    private static func appleScriptPlan(
        _ request: MacControlActionRequest,
        risk: MacControlActionPlan.Risk,
        permissions: [MacControlPermissionID],
        script: String,
        preview: String,
        requiresApproval: Bool = false,
        revertLevel: MacControlActionPlan.RevertLevel = .none,
        blockedReason: String? = nil
    ) -> MacControlActionPlan {
        processPlan(
            request,
            risk: risk,
            permissions: permissions,
            steps: [MacControlActionPlan.Step(kind: .appleScript, executable: nil, arguments: [], script: script, preview: preview, redacted: false)],
            requiresApproval: requiresApproval,
            revertLevel: revertLevel,
            blockedReason: blockedReason
        )
    }

    private static func blockedPlan(_ request: MacControlActionRequest, reason: String) -> MacControlActionPlan {
        processPlan(request, risk: .high, permissions: [], steps: [], blockedReason: reason)
    }

    private static func wifiPowerPlan(_ request: MacControlActionRequest, power: String, risk: MacControlActionPlan.Risk, blockedReason: String?) -> MacControlActionPlan {
        processPlan(
            request,
            risk: risk,
            permissions: [],
            steps: [.process("/usr/sbin/networksetup", ["-setairportpower", wifiDevice(from: request), power], "Turn Wi-Fi \(power)")],
            requiresApproval: true,
            continuityBreaker: power == "off",
            revertLevel: .bestEffort,
            blockedReason: blockedReason
        )
    }

    private static func receipt(
        for request: MacControlActionRequest,
        plan: MacControlActionPlan,
        outcome: MacControlActionReceipt.Outcome,
        outputs: [String] = [],
        error: String? = nil,
        beforeRef: String? = nil,
        afterRef: String? = nil
    ) -> MacControlActionReceipt {
        receipt(for: request, planId: plan.planId, outcome: outcome, outputs: outputs, error: error, beforeRef: beforeRef, afterRef: afterRef)
    }

    private static func receipt(
        for request: MacControlActionRequest,
        planId: String,
        outcome: MacControlActionReceipt.Outcome,
        outputs: [String] = [],
        error: String? = nil,
        beforeRef: String? = nil,
        afterRef: String? = nil
    ) -> MacControlActionReceipt {
        MacControlActionReceipt(
            receiptId: "macact_\(UUID().uuidString)",
            requestId: request.requestId,
            planId: planId,
            capabilityId: request.capabilityId,
            outcome: outcome,
            outputs: outputs,
            error: error,
            beforeRef: beforeRef,
            afterRef: afterRef
        )
    }

    private static func continuitySnapshot(
        for request: MacControlActionRequest,
        plan: MacControlActionPlan,
        runner: MacControlCommandRunning
    ) throws -> MacControlContinuitySnapshot? {
        guard plan.continuityBreaker, request.capabilityId.hasPrefix("mac.wifi.") else { return nil }
        let device = wifiDevice(from: request)
        let power = try runner.runProcess("/usr/sbin/networksetup", arguments: ["-getairportpower", device])
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let network = try runner.runProcess("/usr/sbin/networksetup", arguments: ["-getairportnetwork", device])
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let timestamp = timestamp()
        return MacControlContinuitySnapshot(
            ref: "macsnap_\(request.requestId.replacingOccurrences(of: "-", with: "_"))",
            capabilityId: request.capabilityId,
            device: device,
            beforePowerRaw: power,
            beforeNetworkRaw: network,
            beforeNetworkName: wifiNetworkName(from: network),
            capturedAt: timestamp
        )
    }

    public static func continuityRevertSteps(for snapshot: MacControlContinuitySnapshot) -> [MacControlContinuityRevertStep] {
        if wifiPowerWasOff(snapshot.beforePowerRaw) {
            return [
                MacControlContinuityRevertStep(
                    kind: .process,
                    executable: "/usr/sbin/networksetup",
                    arguments: ["-setairportpower", snapshot.device, "off"],
                    preview: "Restore Wi-Fi power off on \(snapshot.device)",
                    redacted: false
                ),
            ]
        }

        var steps = [
            MacControlContinuityRevertStep(
                kind: .process,
                executable: "/usr/sbin/networksetup",
                arguments: ["-setairportpower", snapshot.device, "on"],
                preview: "Restore Wi-Fi power on for \(snapshot.device)",
                redacted: false
            ),
        ]
        if let network = snapshot.beforeNetworkName {
            steps.append(
                MacControlContinuityRevertStep(
                    kind: .process,
                    executable: "/usr/sbin/networksetup",
                    arguments: ["-setairportnetwork", snapshot.device, network],
                    preview: "Reconnect Wi-Fi to previous saved network \(redactedName("ssid", network))",
                    redacted: true
                )
            )
        }
        return steps
    }

    private static func wifiDevice(from request: MacControlActionRequest) -> String {
        request.arguments["device"].flatMap { $0.isEmpty ? nil : $0 } ?? "en0"
    }

    private static func plaintextPasswordBlock(for request: MacControlActionRequest) -> String? {
        request.arguments["password"] == nil ? nil : "Plaintext Wi-Fi passwords are not accepted by the Mac Action Broker. Use a secret reference."
    }

    private static func integerArgument(_ name: String, from request: MacControlActionRequest) -> Int? {
        guard let value = request.arguments[name], !value.isEmpty else { return nil }
        return Int(value)
    }

    private static func positiveIntegerArgument(_ name: String, from request: MacControlActionRequest) -> Int? {
        guard let value = integerArgument(name, from: request), value > 0 else { return nil }
        return value
    }

    private static func percentArgument(_ name: String, from request: MacControlActionRequest) -> Int? {
        guard let value = integerArgument(name, from: request), value >= 0, value <= 100 else { return nil }
        return value
    }

    private static func redactedName(_ label: String, _ value: String) -> String {
        value.isEmpty ? "<\(label)>" : "<\(label):\(value.count) chars>"
    }

    private static func wifiPowerWasOff(_ raw: String) -> Bool {
        raw.localizedCaseInsensitiveContains(": off") || raw.localizedCaseInsensitiveContains(" off")
    }

    private static func wifiNetworkName(from raw: String) -> String? {
        let marker = "Current Wi-Fi Network:"
        guard let range = raw.range(of: marker, options: [.caseInsensitive]) else { return nil }
        let name = raw[range.upperBound...].trimmingCharacters(in: .whitespacesAndNewlines)
        return name.isEmpty ? nil : name
    }

    private static func timestamp(_ date: Date = Date()) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    private static func appleScriptString(_ value: String) -> String {
        "\"\(value.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\""))\""
    }

    private static func windowPreview(_ verb: String, _ request: MacControlActionRequest) -> String {
        if let app = request.arguments["app"], !app.isEmpty {
            return "\(verb) window in app \(redactedName("app", app))"
        }
        if let title = request.arguments["title"], !title.isEmpty {
            return "\(verb) window titled \(redactedName("title", title))"
        }
        return "\(verb) the focused window"
    }

    private static func selectedWindowScriptPrelude(for request: MacControlActionRequest) -> String {
        let appName = request.arguments["app"] ?? ""
        let title = request.arguments["title"] ?? ""
        let appLiteral = appleScriptString(appName)
        let titleLiteral = appleScriptString(title)
        return """
        set targetAppName to \(appLiteral)
        set targetTitle to \(titleLiteral)
        tell application "System Events"
            if targetAppName is not "" then
                set targetProcess to first application process whose name is targetAppName
            else
                set targetProcess to first application process whose frontmost is true
            end if
            if targetTitle is not "" then
                set targetWindow to first window of targetProcess whose name contains targetTitle
            else
                set targetWindow to window 1 of targetProcess
            end if
        """
    }

    private static func selectedWindowScriptSuffix() -> String {
        """
        end tell
        """
    }

    private static func focusWindowScript(for request: MacControlActionRequest) -> String {
        """
        \(selectedWindowScriptPrelude(for: request))
            set frontmost of targetProcess to true
            perform action "AXRaise" of targetWindow
        \(selectedWindowScriptSuffix())
        """
    }

    private static func moveWindowScript(for request: MacControlActionRequest, x: Int, y: Int) -> String {
        """
        \(selectedWindowScriptPrelude(for: request))
            set position of targetWindow to {\(x), \(y)}
        \(selectedWindowScriptSuffix())
        """
    }

    private static func resizeWindowScript(for request: MacControlActionRequest, width: Int, height: Int) -> String {
        """
        \(selectedWindowScriptPrelude(for: request))
            set size of targetWindow to {\(width), \(height)}
        \(selectedWindowScriptSuffix())
        """
    }

    private static let windowListScript = """
    tell application "System Events"
        set rows to {}
        repeat with appProcess in application processes
            try
                repeat with appWindow in windows of appProcess
                    try
                        set end of rows to (name of appProcess) & "\t" & (name of appWindow)
                    end try
                end repeat
            end try
        end repeat
        set AppleScript's text item delimiters to linefeed
        return rows as text
    end tell
    """

    private static let closeFocusedWindowScript = """
    tell application "System Events"
        set frontProcess to first application process whose frontmost is true
        try
            click button 1 of window 1 of frontProcess
        on error
            keystroke "w" using command down
        end try
    end tell
    """

    private static let minimizeFocusedWindowScript = """
    tell application "System Events"
        set frontProcess to first application process whose frontmost is true
        set value of attribute "AXMinimized" of window 1 of frontProcess to true
    end tell
    """
}

private extension MacControlActionPlan.Step {
    static func process(_ executable: String, _ arguments: [String], _ preview: String, redacted: Bool = false) -> MacControlActionPlan.Step {
        MacControlActionPlan.Step(kind: .process, executable: executable, arguments: arguments, script: nil, preview: preview, redacted: redacted)
    }

    static func native(_ action: String, _ arguments: [String], _ preview: String, redacted: Bool = false) -> MacControlActionPlan.Step {
        MacControlActionPlan.Step(kind: .native, executable: action, arguments: arguments, script: nil, preview: preview, redacted: redacted)
    }
}

public struct MacControlWireActor: Codable, Equatable, Sendable {
    public var kind: String
    public var id: String
    public var role: String?
    public var assignmentId: String?
    public var runId: String?

    public init(kind: String, id: String, role: String? = nil, assignmentId: String? = nil, runId: String? = nil) {
        self.kind = kind
        self.id = id
        self.role = role
        self.assignmentId = assignmentId
        self.runId = runId
    }
}

public struct MacControlWireHost: Codable, Equatable, Sendable {
    public var hostId: String
    public var bundleId: String
    public var signingIdentity: String?
    public var teamId: String?
    public var appVariant: String?
    public var appVersion: String?

    public init(
        hostId: String,
        bundleId: String,
        signingIdentity: String? = nil,
        teamId: String? = nil,
        appVariant: String? = nil,
        appVersion: String? = nil
    ) {
        self.hostId = hostId
        self.bundleId = bundleId
        self.signingIdentity = signingIdentity
        self.teamId = teamId
        self.appVariant = appVariant
        self.appVersion = appVersion
    }
}

public struct MacControlWireTarget: Codable, Equatable, Sendable {
    public var kind: String
    public var id: String?
    public var name: String?
    public var selector: [String: JSONValue]

    public init(kind: String, id: String? = nil, name: String? = nil, selector: [String: JSONValue] = [:]) {
        self.kind = kind
        self.id = id
        self.name = name
        self.selector = selector
    }

    enum CodingKeys: String, CodingKey {
        case kind
        case id
        case name
        case selector
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        kind = try container.decode(String.self, forKey: .kind)
        id = try container.decodeIfPresent(String.self, forKey: .id)
        name = try container.decodeIfPresent(String.self, forKey: .name)
        selector = try container.decodeIfPresent([String: JSONValue].self, forKey: .selector) ?? [:]
    }
}

public struct MacControlWireRequest: Codable, Equatable, Sendable {
    public var schemaVersion: Int
    public var requestId: String
    public var capabilityId: String
    public var actor: MacControlWireActor
    public var host: MacControlWireHost
    public var target: MacControlWireTarget?
    public var arguments: [String: JSONValue]
    public var dryRun: Bool
    public var reason: String?
    public var approved: Bool?

    public init(
        schemaVersion: Int = 1,
        requestId: String,
        capabilityId: String,
        actor: MacControlWireActor,
        host: MacControlWireHost,
        target: MacControlWireTarget? = nil,
        arguments: [String: JSONValue] = [:],
        dryRun: Bool = false,
        reason: String? = nil,
        approved: Bool? = nil
    ) {
        self.schemaVersion = schemaVersion
        self.requestId = requestId
        self.capabilityId = capabilityId
        self.actor = actor
        self.host = host
        self.target = target
        self.arguments = arguments
        self.dryRun = dryRun
        self.reason = reason
        self.approved = approved
    }

    enum CodingKeys: String, CodingKey {
        case schemaVersion
        case requestId
        case capabilityId
        case actor
        case host
        case target
        case arguments
        case dryRun
        case reason
        case approved
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try container.decode(Int.self, forKey: .schemaVersion)
        requestId = try container.decode(String.self, forKey: .requestId)
        capabilityId = try container.decode(String.self, forKey: .capabilityId)
        actor = try container.decode(MacControlWireActor.self, forKey: .actor)
        host = try container.decode(MacControlWireHost.self, forKey: .host)
        target = try container.decodeIfPresent(MacControlWireTarget.self, forKey: .target)
        arguments = try container.decodeIfPresent([String: JSONValue].self, forKey: .arguments) ?? [:]
        dryRun = try container.decodeIfPresent(Bool.self, forKey: .dryRun) ?? false
        reason = try container.decodeIfPresent(String.self, forKey: .reason)
        approved = try container.decodeIfPresent(Bool.self, forKey: .approved)
    }
}

public struct MacControlWirePermissionRequirement: Codable, Equatable, Sendable {
    public var permissionId: String
    public var required: Bool
    public var currentOsState: String
    public var currentFrameworkGrant: String
    public var guidance: String?
}

public struct MacControlWireRequiredApproval: Codable, Equatable, Sendable {
    public var risk: String
    public var reason: String
    public var approverRoles: [String]
    public var requestId: String?
}

public struct MacControlWireRollbackPlan: Codable, Equatable, Sendable {
    public var level: String
    public var timerSeconds: Int?
    public var snapshotRequired: Bool
    public var snapshotRef: String?
    public var reason: String?
}

public struct MacControlWirePlan: Codable, Equatable, Sendable {
    public var schemaVersion: Int
    public var planId: String
    public var requestId: String
    public var capabilityId: String
    public var risk: String
    public var coverageState: String
    public var actor: MacControlWireActor
    public var host: MacControlWireHost
    public var resolvedTarget: MacControlWireTarget?
    public var permissionRequirements: [MacControlWirePermissionRequirement]
    public var requiredApprovals: [MacControlWireRequiredApproval]
    public var rollback: MacControlWireRollbackPlan
    public var willMutate: Bool
    public var executable: Bool
    public var blockedReasons: [String]
    public var relatedSurfaces: [String]
}

public struct MacControlWireRedaction: Codable, Equatable, Sendable {
    public var level: String
    public var fields: [String]
}

public struct MacControlWireReceipt: Codable, Equatable, Sendable {
    public var schemaVersion: Int
    public var id: String
    public var requestId: String
    public var planId: String?
    public var capabilityId: String
    public var actor: MacControlWireActor
    public var host: MacControlWireHost
    public var result: String
    public var risk: String
    public var permissionSnapshotRefs: [String]
    public var beforeRef: String?
    public var afterRef: String?
    public var auditId: String
    public var revert: MacControlWireRollbackPlan
    public var secretRefs: [String]
    public var redaction: MacControlWireRedaction
    public var createdAt: String
}

public struct MacControlWireAuditEvent: Codable, Equatable, Sendable {
    public var schemaVersion: Int
    public var id: String
    public var receiptId: String
    public var requestId: String
    public var planId: String?
    public var capabilityId: String
    public var actor: MacControlWireActor
    public var host: MacControlWireHost
    public var result: String
    public var risk: String
    public var summary: String
    public var redaction: MacControlWireRedaction
    public var metadata: [String: JSONValue]
    public var createdAt: String
}

public struct MacControlWireEvaluation: Codable, Equatable, Sendable {
    public var schemaVersion: Int
    public var decision: String
    public var requestId: String
    public var planId: String
    public var capabilityId: String
    public var actor: MacControlWireActor
    public var host: MacControlWireHost
    public var reasons: [String]
    public var approvalRequestIds: [String]
    public var receipt: MacControlWireReceipt?
    public var auditEvent: MacControlWireAuditEvent?
}

@MainActor
public enum MacControlWire {
    public static let schemaVersion = 1

    public static func decodeRequest(_ data: Data) throws -> MacControlWireRequest {
        let request = try JSONDecoder().decode(MacControlWireRequest.self, from: data)
        guard request.schemaVersion == schemaVersion else {
            throw MacControlError.commandFailed("Unsupported Mac action schemaVersion \(request.schemaVersion)")
        }
        return request
    }

    public static func planJSON(for data: Data, encoder: JSONEncoder? = nil) throws -> Data {
        let request = try decodeRequest(data)
        let plan = try MacControlActionBroker.plan(for: request.nativeRequest)
        return try (encoder ?? wireEncoder()).encode(wirePlan(from: plan, request: request))
    }

    public static func evaluateJSON(
        for data: Data,
        defaults: UserDefaults = .standard,
        auditURL: URL? = nil,
        policyURL: URL? = nil,
        continuityURL: URL? = nil,
        runner: MacControlCommandRunning = MacControlProcessRunner(),
        encoder: JSONEncoder? = nil
    ) throws -> Data {
        let request = try decodeRequest(data)
        let nativePlan = try? MacControlActionBroker.plan(for: request.nativeRequest)
        let receipt = MacControlActionBroker.evaluate(
            request.nativeRequest,
            defaults: defaults,
            auditURL: auditURL,
            policyURL: policyURL,
            continuityURL: continuityURL,
            runner: runner
        )
        return try (encoder ?? wireEncoder()).encode(wireEvaluation(from: receipt, plan: nativePlan.map { wirePlan(from: $0, request: request) }, request: request))
    }

    public static func wirePlan(from plan: MacControlActionPlan, request: MacControlWireRequest) -> MacControlWirePlan {
        let blockedReasons = [plan.blockedReason].compactMap { $0 }
        return MacControlWirePlan(
            schemaVersion: schemaVersion,
            planId: plan.planId,
            requestId: plan.requestId,
            capabilityId: plan.capabilityId,
            risk: plan.risk.rawValue,
            coverageState: "executable",
            actor: request.actor,
            host: request.host,
            resolvedTarget: request.target,
            permissionRequirements: plan.requiredPermissionIds.map {
                MacControlWirePermissionRequirement(
                    permissionId: $0.rawValue,
                    required: true,
                    currentOsState: "unknown",
                    currentFrameworkGrant: "not_granted",
                    guidance: nil
                )
            },
            requiredApprovals: plan.requiresApproval ? [
                MacControlWireRequiredApproval(
                    risk: plan.risk.rawValue,
                    reason: request.reason ?? "\(plan.capabilityId) requires \(plan.risk.rawValue) approval",
                    approverRoles: ["owner", "admin"],
                    requestId: nil
                ),
            ] : [],
            rollback: rollbackPlan(from: plan),
            willMutate: plan.risk != .read,
            executable: blockedReasons.isEmpty && !plan.steps.isEmpty,
            blockedReasons: blockedReasons,
            relatedSurfaces: []
        )
    }

    private static func wireEvaluation(from receipt: MacControlActionReceipt, plan: MacControlWirePlan?, request: MacControlWireRequest) -> MacControlWireEvaluation {
        let decision = decisionValue(from: receipt)
        let result = resultValue(from: receipt)
        let createdAt = ISO8601DateFormatter().string(from: Date())
        let fallbackRollback = MacControlWireRollbackPlan(level: "none", timerSeconds: nil, snapshotRequired: false, snapshotRef: nil, reason: nil)
        let rollback = plan?.rollback ?? fallbackRollback
        let risk = plan?.risk ?? "high"
        let redaction = MacControlWireRedaction(level: risk == "high" || risk == "critical" ? "high" : "low", fields: ["arguments"])
        let auditId = "macaudit_\(receipt.requestId)_\(result)".replacingOccurrences(of: "-", with: "_")
        let wireReceipt = MacControlWireReceipt(
            schemaVersion: schemaVersion,
            id: receipt.receiptId,
            requestId: receipt.requestId,
            planId: receipt.planId,
            capabilityId: receipt.capabilityId,
            actor: request.actor,
            host: request.host,
            result: result,
            risk: risk,
            permissionSnapshotRefs: [],
            beforeRef: receipt.beforeRef,
            afterRef: receipt.afterRef,
            auditId: auditId,
            revert: rollback,
            secretRefs: secretRefs(from: request.arguments),
            redaction: redaction,
            createdAt: createdAt
        )
        let auditEvent = MacControlWireAuditEvent(
            schemaVersion: schemaVersion,
            id: auditId,
            receiptId: wireReceipt.id,
            requestId: receipt.requestId,
            planId: receipt.planId,
            capabilityId: receipt.capabilityId,
            actor: request.actor,
            host: request.host,
            result: result,
            risk: risk,
            summary: "Mac action \(receipt.capabilityId) \(result)",
            redaction: redaction,
            metadata: receipt.error.map { ["error": .string($0)] } ?? [:],
            createdAt: createdAt
        )
        return MacControlWireEvaluation(
            schemaVersion: schemaVersion,
            decision: decision,
            requestId: receipt.requestId,
            planId: receipt.planId,
            capabilityId: receipt.capabilityId,
            actor: request.actor,
            host: request.host,
            reasons: receipt.error.map { [$0] } ?? (decision == "dry_run" ? ["dry_run"] : []),
            approvalRequestIds: [],
            receipt: wireReceipt,
            auditEvent: auditEvent
        )
    }

    private static func rollbackPlan(from plan: MacControlActionPlan) -> MacControlWireRollbackPlan {
        MacControlWireRollbackPlan(
            level: plan.revertLevel.rawValue,
            timerSeconds: plan.risk == .critical && plan.revertLevel != .none ? 120 : nil,
            snapshotRequired: (plan.risk == .high || plan.risk == .critical) && plan.revertLevel != .none,
            snapshotRef: nil,
            reason: plan.revertLevel == .none ? "No reliable automated revert is declared for this capability." : nil
        )
    }

    private static func decisionValue(from receipt: MacControlActionReceipt) -> String {
        switch receipt.outcome {
        case .planned: return "dry_run"
        case .approvalRequired: return "approval_required"
        case .blocked: return "blocked"
        case .executed, .failed: return "allow"
        }
    }

    private static func resultValue(from receipt: MacControlActionReceipt) -> String {
        switch receipt.outcome {
        case .planned, .approvalRequired: return "planned"
        case .blocked: return "blocked"
        case .executed: return "ok"
        case .failed: return "error"
        }
    }

    private static func secretRefs(from arguments: [String: JSONValue]) -> [String] {
        var refs: [String] = []
        if let secretRef = arguments["secretRef"]?.stringValue {
            refs.append(secretRef)
        }
        if case .array(let values)? = arguments["secretRefs"] {
            refs.append(contentsOf: values.compactMap(\.stringValue))
        }
        return Array(Set(refs)).sorted()
    }

    private static func wireEncoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }
}
