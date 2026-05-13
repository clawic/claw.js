import Foundation
import CommanderCore

public struct UnsupportedDomainAdapter: CommanderAdapter {
    public let descriptor: AdapterDescriptor

    public init(descriptor: AdapterDescriptor) {
        self.descriptor = descriptor
    }

    public func supports(resource: String, action: String) -> Bool {
        !descriptor.supportedCommands.isEmpty
    }

    public func execute(request: CommandRequest, environment: [String : String]) throws -> JSONValue {
        throw CommanderError.adapterUnavailable("\(descriptor.name) is scaffolded but not wired to a live backend yet")
    }
}

public enum DefaultRegistry {
    public static func make() -> AdapterRegistry {
        AdapterRegistry(adapters: [
            .files: FilesAdapter(),
            .obsidian: ObsidianAdapter(),
            .calendar: CalendarAdapter(),
            .reminders: RemindersAdapter(),
            .contacts: ContactsAdapter(),
            .clipboard: ClipboardAdapter(),
            .notifications: NotificationsAdapter(),
            .apps: AppsAdapter(),
            .finder: FinderAdapter(),
            .screenshots: ScreenshotsAdapter(),
            .processes: ProcessesAdapter(),
            .mail: MailAdapter(),
            .things: ThingsAdapter(),
            .notes: NotesAdapter(),
            .messages: MessagesAdapter(),
            .safari: SafariAdapter(),
        ])
    }
}
