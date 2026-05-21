import Contacts
import EventKit
import XCTest

@testable import CommanderAdapters

enum HostFixtures {
    static func appExists(_ appName: String) -> Bool {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return [
            "/System/Applications/\(appName).app",
            "/System/Library/CoreServices/\(appName).app",
            "/Applications/\(appName).app",
            "\(home)/Applications/\(appName).app",
        ].contains(where: { FileManager.default.fileExists(atPath: $0) })
    }

    static func createCalendar(named name: String, store: EKEventStore) throws -> EKCalendar {
        let calendar = EKCalendar(for: .event, eventStore: store)
        calendar.title = name
        let source: EKSource
        if let defaultSource = store.defaultCalendarForNewEvents?.source {
            source = defaultSource
        } else {
            source = try XCTUnwrap(store.sources.first)
        }
        calendar.source = source
        try store.saveCalendar(calendar, commit: true)
        return calendar
    }

    static func deleteCalendar(_ calendar: EKCalendar, store: EKEventStore) throws {
        try store.removeCalendar(calendar, commit: true)
    }

    static func createReminderList(named name: String, store: EKEventStore) throws -> EKCalendar {
        var candidateSources: [EKSource] = []
        if let defaultSource = store.defaultCalendarForNewReminders()?.source {
            candidateSources.append(defaultSource)
        }
        candidateSources.append(contentsOf: store.calendars(for: .reminder).map(\.source))
        candidateSources.append(contentsOf: store.sources)

        var attemptedSourceIDs = Set<String>()
        for source in candidateSources where attemptedSourceIDs.insert(source.sourceIdentifier).inserted {
            let calendar = EKCalendar(for: .reminder, eventStore: store)
            calendar.title = name
            calendar.source = source
            do {
                try store.saveCalendar(calendar, commit: true)
                return calendar
            } catch {
                continue
            }
        }

        throw XCTSkip("No writable reminders source is available on this host")
    }

    static func deleteReminderList(_ calendar: EKCalendar, store: EKEventStore) throws {
        try store.removeCalendar(calendar, commit: true)
    }

    static func deleteContact(id: String) throws {
        let store = CNContactStore()
        let contact = try store.unifiedContact(
            withIdentifier: id,
            keysToFetch: [CNContactIdentifierKey as CNKeyDescriptor]
        ).mutableCopy() as! CNMutableContact
        let save = CNSaveRequest()
        save.delete(contact)
        try store.execute(save)
    }

    static func createSafariWindow() throws -> Int {
        let script = """
        tell application "Safari"
            activate
            make new document
            return count of windows
        end tell
        """
        return Int(try AdapterSupport.runAppleScript(script, timeout: 5).trimmingCharacters(in: .whitespacesAndNewlines)) ?? 1
    }

    static func closeSafariWindow(windowIndex: Int) throws {
        let script = """
        tell application "Safari"
            if (count of windows) >= \(windowIndex) then
                close window \(windowIndex)
            end if
        end tell
        """
        _ = try AdapterSupport.runAppleScript(script, timeout: 5)
    }

    static func createThingsProject(named name: String) throws -> String {
        let escapedName = escapeAppleScript(name)
        let script = """
        tell application "Things3"
            set projectRef to make new project with properties {name:"\(escapedName)"}
            return id of projectRef as text
        end tell
        """
        return try AdapterSupport.runAppleScript(script, timeout: 5).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func deleteThingsProject(named name: String) throws {
        let escapedName = escapeAppleScript(name)
        let script = """
        tell application "Things3"
            delete project "\(escapedName)"
        end tell
        """
        _ = try AdapterSupport.runAppleScript(script, timeout: 5)
    }

    private static func escapeAppleScript(_ value: String) -> String {
        value
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
    }
}
