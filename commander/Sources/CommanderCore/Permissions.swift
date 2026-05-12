import Foundation
import EventKit
import Contacts
import UserNotifications

public enum OSPermissionState: String, Codable, Sendable {
    case notRequested = "not_requested"
    case denied
    case authorized
    case notApplicable = "not_applicable"
}

public struct PermissionService: Sendable {
    public init() {}

    public static let requestableDomains: [Domain] = [
        .calendar,
        .reminders,
        .contacts,
        .notifications,
    ]

    private var canQueryUserNotifications: Bool {
        Bundle.main.bundleURL.pathExtension == "app"
    }

    public func status(for domain: Domain) -> OSPermissionState {
        switch domain {
        case .calendar:
            switch EKEventStore.authorizationStatus(for: .event) {
            case .fullAccess, .writeOnly:
                return .authorized
            case .denied, .restricted:
                return .denied
            case .notDetermined:
                return .notRequested
            @unknown default:
                return .denied
            }
        case .reminders:
            switch EKEventStore.authorizationStatus(for: .reminder) {
            case .fullAccess, .writeOnly:
                return .authorized
            case .denied, .restricted:
                return .denied
            case .notDetermined:
                return .notRequested
            @unknown default:
                return .denied
            }
        case .contacts:
            switch CNContactStore.authorizationStatus(for: .contacts) {
            case .authorized:
                return .authorized
            case .denied, .restricted:
                return .denied
            case .notDetermined:
                return .notRequested
            @unknown default:
                return .denied
            }
        case .notifications:
            guard canQueryUserNotifications else {
                return .notRequested
            }
            let semaphore = DispatchSemaphore(value: 0)
            var resolved: OSPermissionState = .notRequested
            UNUserNotificationCenter.current().getNotificationSettings { settings in
                switch settings.authorizationStatus {
                case .authorized, .provisional, .ephemeral:
                    resolved = .authorized
                case .denied:
                    resolved = .denied
                case .notDetermined:
                    resolved = .notRequested
                @unknown default:
                    resolved = .denied
                }
                semaphore.signal()
            }
            semaphore.wait()
            return resolved
        case .files:
            return .authorized
        case .agents, .skills, .design, .sessions, .projects, .memory, .productivity, .mail, .things, .notes, .messages, .safari, .browser, .clipboard, .apps, .finder, .screenshots, .processes, .obsidian, .terminal, .voice, .models, .services, .database, .integrations, .secrets, .miniApps, .system:
            return .notApplicable
        }
    }

    public func requestPermission(for domain: Domain) throws -> OSPermissionState {
        if ProcessInfo.processInfo.environment["COMMANDER_PERMISSION_REQUEST_DRY_RUN"] == "1" {
            if let logPath = ProcessInfo.processInfo.environment["COMMANDER_PERMISSION_REQUEST_LOG"] {
                let entry = "\(domain.rawValue)\n"
                if FileManager.default.fileExists(atPath: logPath) {
                    if let handle = FileHandle(forWritingAtPath: logPath) {
                        handle.seekToEndOfFile()
                        handle.write(Data(entry.utf8))
                        try? handle.close()
                    }
                } else {
                    try? Data(entry.utf8).write(to: URL(fileURLWithPath: logPath))
                }
            }
            return .authorized
        }

        switch domain {
        case .calendar:
            let store = EKEventStore()
            let semaphore = DispatchSemaphore(value: 0)
            final class PermissionResult: @unchecked Sendable {
                var granted = false
                var error: Error?
            }
            let result = PermissionResult()

            if #available(macOS 14.0, *) {
                store.requestFullAccessToEvents { value, error in
                    result.granted = value
                    result.error = error
                    semaphore.signal()
                }
            } else {
                store.requestAccess(to: .event) { value, error in
                    result.granted = value
                    result.error = error
                    semaphore.signal()
                }
            }

            semaphore.wait()
            if let error = result.error {
                throw CommanderError.internalFailure(error.localizedDescription)
            }
            return result.granted ? .authorized : status(for: domain)
        case .reminders:
            let store = EKEventStore()
            let semaphore = DispatchSemaphore(value: 0)
            final class PermissionResult: @unchecked Sendable {
                var granted = false
                var error: Error?
            }
            let result = PermissionResult()

            if #available(macOS 14.0, *) {
                store.requestFullAccessToReminders { value, error in
                    result.granted = value
                    result.error = error
                    semaphore.signal()
                }
            } else {
                store.requestAccess(to: .reminder) { value, error in
                    result.granted = value
                    result.error = error
                    semaphore.signal()
                }
            }

            semaphore.wait()
            if let error = result.error {
                throw CommanderError.internalFailure(error.localizedDescription)
            }
            return result.granted ? .authorized : status(for: domain)
        case .contacts:
            let store = CNContactStore()
            let semaphore = DispatchSemaphore(value: 0)
            final class PermissionResult: @unchecked Sendable {
                var granted = false
                var error: Error?
            }
            let result = PermissionResult()
            store.requestAccess(for: .contacts) { value, error in
                result.granted = value
                result.error = error
                semaphore.signal()
            }
            semaphore.wait()
            if let error = result.error {
                throw CommanderError.internalFailure(error.localizedDescription)
            }
            return result.granted ? .authorized : status(for: domain)
        case .notifications:
            guard canQueryUserNotifications else {
                return .notRequested
            }
            let semaphore = DispatchSemaphore(value: 0)
            final class PermissionResult: @unchecked Sendable {
                var granted = false
                var error: Error?
            }
            let result = PermissionResult()
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { value, error in
                result.granted = value
                result.error = error
                semaphore.signal()
            }
            semaphore.wait()
            if let error = result.error {
                throw CommanderError.internalFailure(error.localizedDescription)
            }
            return result.granted ? .authorized : status(for: domain)
        case .files:
            return .authorized
        case .agents, .skills, .design, .sessions, .projects, .memory, .productivity, .mail, .things, .notes, .messages, .safari, .browser, .clipboard, .apps, .finder, .screenshots, .processes, .obsidian, .terminal, .voice, .models, .services, .database, .integrations, .secrets, .miniApps, .system:
            return .notApplicable
        }
    }
}
