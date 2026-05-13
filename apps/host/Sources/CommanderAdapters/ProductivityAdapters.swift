import Contacts
import EventKit
import Foundation
import CommanderCore

public struct RemindersAdapter: CommanderAdapter {
    public let descriptor = AdapterDescriptor(
        name: "reminders",
        domain: .reminders,
        version: "0.2.0",
        supportedCommands: [
            "reminders lists list",
            "reminders items list",
            "reminders items get",
            "reminders items search",
            "reminders items create",
            "reminders items update",
            "reminders items delete",
            "reminders items complete",
        ],
        sources: [.framework],
        riskLevel: "high",
        isImplemented: true,
        requiresOSPermission: true,
        coverageLevel: "crud",
        supportsSearch: true,
        supportsDelete: true
    )

    public init() {}

    public func supports(resource: String, action: String) -> Bool {
        switch resource {
        case "lists":
            return action == "list"
        case "items":
            return ["list", "get", "search", "create", "update", "delete", "complete"].contains(action)
        default:
            return false
        }
    }

    public func execute(request: CommandRequest, environment: [String : String]) throws -> JSONValue {
        if ExecutionEnvironment.isTestMode(environment) {
            return try executeInTestMode(request: request, environment: environment)
        }

        guard PermissionService().status(for: .reminders) == .authorized else {
            throw CommanderError.permissionDenied("Reminders OS permission is not authorized")
        }

        let store = EKEventStore()
        switch (request.resource, request.action) {
        case ("lists", "list"):
            return .array(store.calendars(for: .reminder).map { calendar in
                .object([
                    "id": .string(calendar.calendarIdentifier),
                    "title": .string(calendar.title),
                    "source": .string("eventkit"),
                ])
            })
        case ("items", "list"):
            return try .array(fetchReminders(store: store, request: request).map(reminderPayload))
        case ("items", "get"):
            let id = try AdapterSupport.require(request.arguments, "id")
            guard let reminder = store.calendarItem(withIdentifier: id) as? EKReminder else {
                throw CommanderError.notFound("Unknown reminder \(id)")
            }
            return reminderPayload(for: reminder)
        case ("items", "search"):
            let query = try AdapterSupport.require(request.arguments, "query")
            return try .array(fetchReminders(store: store, request: request).filter { reminder in
                reminder.title.localizedCaseInsensitiveContains(query) ||
                (reminder.notes?.localizedCaseInsensitiveContains(query) ?? false)
            }.map(reminderPayload))
        case ("items", "create"):
            let reminder = EKReminder(eventStore: store)
            try applyReminder(arguments: request.arguments, to: reminder, store: store)
            reminder.calendar = try resolvedReminderCalendar(name: request.arguments["list"], store: store) ?? store.defaultCalendarForNewReminders()
            try store.save(reminder, commit: true)
            return reminderPayload(for: reminder)
        case ("items", "update"):
            let id = try AdapterSupport.require(request.arguments, "id")
            guard let reminder = store.calendarItem(withIdentifier: id) as? EKReminder else {
                throw CommanderError.notFound("Unknown reminder \(id)")
            }
            try applyReminder(arguments: request.arguments, to: reminder, store: store, isUpdate: true)
            try store.save(reminder, commit: true)
            return reminderPayload(for: reminder)
        case ("items", "delete"):
            let id = try AdapterSupport.require(request.arguments, "id")
            guard let reminder = store.calendarItem(withIdentifier: id) as? EKReminder else {
                throw CommanderError.notFound("Unknown reminder \(id)")
            }
            try store.remove(reminder, commit: true)
            return .object(["id": .string(id), "deleted": .bool(true), "source": .string("eventkit")])
        case ("items", "complete"):
            let id = try AdapterSupport.require(request.arguments, "id")
            guard let reminder = store.calendarItem(withIdentifier: id) as? EKReminder else {
                throw CommanderError.notFound("Unknown reminder \(id)")
            }
            reminder.isCompleted = true
            reminder.completionDate = Date()
            try store.save(reminder, commit: true)
            return reminderPayload(for: reminder)
        default:
            throw CommanderError.invalidCommand("Unsupported reminders command")
        }
    }

    private func fetchReminders(store: EKEventStore, request: CommandRequest) throws -> [EKReminder] {
        let semaphore = DispatchSemaphore(value: 0)
        var result: [EKReminder] = []
        let listName = request.arguments["list"]
        let calendars = try resolvedReminderCalendar(name: listName, store: store).map { [$0] }
        store.fetchReminders(matching: store.predicateForIncompleteReminders(withDueDateStarting: nil, ending: nil, calendars: calendars)) { reminders in
            result = reminders ?? []
            semaphore.signal()
        }
        semaphore.wait()
        return result.sorted { $0.title < $1.title }
    }

    private func applyReminder(arguments: [String: String], to reminder: EKReminder, store: EKEventStore, isUpdate: Bool = false) throws {
        if let title = arguments["title"] {
            reminder.title = title
        } else if !isUpdate && reminder.title.isEmpty {
            throw CommanderError.invalidArguments("Missing --title")
        }
        if let notes = arguments["notes"] {
            reminder.notes = notes
        }
        if let dueRaw = arguments["due"], let due = try AdapterSupport.parseISODate(dueRaw) {
            reminder.dueDateComponents = Calendar.current.dateComponents(in: .current, from: due)
        }
        if let priority = arguments["priority"].flatMap(Int.init) {
            reminder.priority = priority
        }
        if let listName = arguments["list"] {
            reminder.calendar = try resolvedReminderCalendar(name: listName, store: store) ?? reminder.calendar
        }
    }

    private func resolvedReminderCalendar(name: String?, store: EKEventStore) throws -> EKCalendar? {
        guard let name, !name.isEmpty else { return nil }
        guard let calendar = store.calendars(for: .reminder).first(where: { $0.title == name }) else {
            throw CommanderError.notFound("Unknown reminders list \(name)")
        }
        return calendar
    }

    private func reminderPayload(for reminder: EKReminder) -> JSONValue {
        .object([
            "id": .string(reminder.calendarItemIdentifier),
            "title": .string(reminder.title),
            "notes": reminder.notes.map(JSONValue.string) ?? .null,
            "list": .string(reminder.calendar.title),
            "due": reminder.dueDateComponents?.date.map { .string(AdapterSupport.isoString($0)) } ?? .null,
            "priority": .integer(reminder.priority),
            "completed": .bool(reminder.isCompleted),
            "source": .string("eventkit"),
        ])
    }

    private func executeInTestMode(request: CommandRequest, environment: [String: String]) throws -> JSONValue {
        let store = try TestModeStore(environment: environment)
        let collection = "reminders_items"
        let listsCollection = "reminders_lists"
        switch (request.resource, request.action) {
        case ("lists", "list"):
            let lists = try store.list(collection: listsCollection)
            if lists.isEmpty {
                let seeded: [[String: JSONValue]] = [
                    ["id": .string("list_personal"), "title": .string("Personal"), "source": .string("test_fixture")],
                    ["id": .string("list_work"), "title": .string("Work"), "source": .string("test_fixture")],
                ]
                try store.replace(collection: listsCollection, with: seeded)
                return .array(seeded.map(JSONValue.object))
            }
            return .array(lists.map(JSONValue.object))
        case ("items", "list"):
            return .array(try store.list(collection: collection).map(JSONValue.object))
        case ("items", "get"):
            let id = try AdapterSupport.require(request.arguments, "id")
            guard let item = try store.list(collection: collection).first(where: { $0["id"]?.stringValue == id }) else {
                throw CommanderError.notFound("Unknown reminder \(id)")
            }
            return .object(item)
        case ("items", "search"):
            let query = try AdapterSupport.require(request.arguments, "query")
            return .array(try store.list(collection: collection).filter {
                AdapterSupport.matches(query, in: $0, fields: ["title", "notes", "list"])
            }.map(JSONValue.object))
        case ("items", "create"):
            let object: [String: JSONValue] = [
                "id": .string(AdapterSupport.newID(prefix: "reminder")),
                "title": .string(try AdapterSupport.require(request.arguments, "title")),
                "notes": request.arguments["notes"].map(JSONValue.string) ?? .null,
                "list": .string(request.arguments["list"] ?? "Personal"),
                "due": request.arguments["due"].map(JSONValue.string) ?? .null,
                "priority": .integer(Int(request.arguments["priority"] ?? "0") ?? 0),
                "completed": .bool(false),
                "source": .string("test_fixture"),
                "created_at": .string(AdapterSupport.isoString(Date())),
            ]
            _ = try store.upsert(collection: collection, object: object)
            return .object(object)
        case ("items", "update"), ("items", "complete"):
            let id = try AdapterSupport.require(request.arguments, "id")
            guard var item = try store.list(collection: collection).first(where: { $0["id"]?.stringValue == id }) else {
                throw CommanderError.notFound("Unknown reminder \(id)")
            }
            if let title = request.arguments["title"] { item["title"] = .string(title) }
            if let notes = request.arguments["notes"] { item["notes"] = .string(notes) }
            if let list = request.arguments["list"] { item["list"] = .string(list) }
            if let due = request.arguments["due"] { item["due"] = .string(due) }
            if let priority = request.arguments["priority"].flatMap(Int.init) { item["priority"] = .integer(priority) }
            if request.action == "complete" { item["completed"] = .bool(true) }
            item["source"] = .string("test_fixture")
            item["updated_at"] = .string(AdapterSupport.isoString(Date()))
            _ = try store.upsert(collection: collection, object: item)
            return .object(item)
        case ("items", "delete"):
            let id = try AdapterSupport.require(request.arguments, "id")
            try store.delete(collection: collection, id: id)
            return .object(["id": .string(id), "deleted": .bool(true), "source": .string("test_fixture")])
        default:
            throw CommanderError.invalidCommand("Unsupported reminders test command")
        }
    }
}

public struct ContactsAdapter: CommanderAdapter {
    public let descriptor = AdapterDescriptor(
        name: "contacts",
        domain: .contacts,
        version: "0.2.0",
        supportedCommands: [
            "contacts people list",
            "contacts people get",
            "contacts people search",
            "contacts people create",
            "contacts people update",
            "contacts people delete",
        ],
        sources: [.framework],
        riskLevel: "high",
        isImplemented: true,
        requiresOSPermission: true,
        coverageLevel: "crud",
        supportsSearch: true,
        supportsDelete: true
    )

    public init() {}

    public func supports(resource: String, action: String) -> Bool {
        resource == "people" && ["list", "get", "search", "create", "update", "delete"].contains(action)
    }

    public func execute(request: CommandRequest, environment: [String : String]) throws -> JSONValue {
        if ExecutionEnvironment.isTestMode(environment) {
            return try executeInTestMode(request: request, environment: environment)
        }

        guard PermissionService().status(for: .contacts) == .authorized else {
            throw CommanderError.permissionDenied("Contacts OS permission is not authorized")
        }

        let store = CNContactStore()
        switch request.action {
        case "list":
            let requestKeys: [CNKeyDescriptor] = keys()
            let fetchRequest = CNContactFetchRequest(keysToFetch: requestKeys)
            var contacts: [CNContact] = []
            try store.enumerateContacts(with: fetchRequest) { contact, _ in contacts.append(contact) }
            return .array(contacts.map(contactPayload))
        case "get":
            let id = try AdapterSupport.require(request.arguments, "id")
            let contact = try store.unifiedContact(withIdentifier: id, keysToFetch: keys())
            return contactPayload(for: contact)
        case "search":
            let query = try AdapterSupport.require(request.arguments, "query")
            let predicate = CNContact.predicateForContacts(matchingName: query)
            let contacts = try store.unifiedContacts(matching: predicate, keysToFetch: keys())
            return .array(contacts.map(contactPayload))
        case "create":
            let mutable = CNMutableContact()
            try apply(arguments: request.arguments, to: mutable)
            let save = CNSaveRequest()
            save.add(mutable, toContainerWithIdentifier: nil)
            do {
                try store.execute(save)
            } catch {
                throw mappedContactsWriteError(error, includesNotes: request.arguments["notes"] != nil)
            }
            return contactPayload(for: mutable)
        case "update":
            let id = try AdapterSupport.require(request.arguments, "id")
            let contact = try store.unifiedContact(withIdentifier: id, keysToFetch: keys()).mutableCopy() as! CNMutableContact
            try apply(arguments: request.arguments, to: contact, isUpdate: true)
            let save = CNSaveRequest()
            save.update(contact)
            do {
                try store.execute(save)
            } catch {
                throw mappedContactsWriteError(error, includesNotes: request.arguments["notes"] != nil)
            }
            return contactPayload(for: contact)
        case "delete":
            let id = try AdapterSupport.require(request.arguments, "id")
            let contact = try store.unifiedContact(withIdentifier: id, keysToFetch: keys()).mutableCopy() as! CNMutableContact
            let save = CNSaveRequest()
            save.delete(contact)
            do {
                try store.execute(save)
            } catch {
                throw mappedContactsWriteError(error, includesNotes: false)
            }
            return .object(["id": .string(id), "deleted": .bool(true), "source": .string("contacts_framework")])
        default:
            throw CommanderError.invalidCommand("Unsupported contacts action")
        }
    }

    private func keys() -> [CNKeyDescriptor] {
        [
            CNContactIdentifierKey as CNKeyDescriptor,
            CNContactGivenNameKey as CNKeyDescriptor,
            CNContactFamilyNameKey as CNKeyDescriptor,
            CNContactOrganizationNameKey as CNKeyDescriptor,
            CNContactNoteKey as CNKeyDescriptor,
            CNContactEmailAddressesKey as CNKeyDescriptor,
            CNContactPhoneNumbersKey as CNKeyDescriptor,
        ]
    }

    private func apply(arguments: [String: String], to contact: CNMutableContact, isUpdate: Bool = false) throws {
        if let name = arguments["name"] {
            let parts = name.split(separator: " ", maxSplits: 1).map(String.init)
            contact.givenName = parts.first ?? ""
            contact.familyName = parts.count > 1 ? parts[1] : ""
        } else if !isUpdate && contact.givenName.isEmpty && contact.familyName.isEmpty {
            throw CommanderError.invalidArguments("Missing --name")
        }
        if let email = arguments["email"] {
            contact.emailAddresses = [CNLabeledValue(label: CNLabelHome, value: email as NSString)]
        }
        if let phone = arguments["phone"] {
            contact.phoneNumbers = [CNLabeledValue(label: CNLabelPhoneNumberMobile, value: CNPhoneNumber(stringValue: phone))]
        }
        if let organization = arguments["organization"] {
            contact.organizationName = organization
        }
        if let notes = arguments["notes"] {
            contact.note = notes
        }
    }

    private func contactPayload(for contact: CNContact) -> JSONValue {
        .object([
            "id": .string(contact.identifier),
            "name": .string("\(contact.givenName) \(contact.familyName)".trimmingCharacters(in: .whitespaces)),
            "emails": .array(contact.emailAddresses.map { .string(String($0.value)) }),
            "phones": .array(contact.phoneNumbers.map { .string($0.value.stringValue) }),
            "organization": .string(contact.organizationName),
            "notes": .string(contact.note),
            "source": .string("contacts_framework"),
        ])
    }

    private func mappedContactsWriteError(_ error: Error, includesNotes: Bool) -> CommanderError {
        let nsError = error as NSError
        if includesNotes && nsError.domain == NSCocoaErrorDomain && nsError.code == 134092 {
            return .invalidArguments("Contacts notes are not writable from this host runtime")
        }
        return .internalFailure(error.localizedDescription)
    }

    private func executeInTestMode(request: CommandRequest, environment: [String: String]) throws -> JSONValue {
        let store = try TestModeStore(environment: environment)
        let collection = "contacts_people"
        switch request.action {
        case "list":
            return .array(try store.list(collection: collection).map(JSONValue.object))
        case "get":
            let id = try AdapterSupport.require(request.arguments, "id")
            guard let object = try store.list(collection: collection).first(where: { $0["id"]?.stringValue == id }) else {
                throw CommanderError.notFound("Unknown contact \(id)")
            }
            return .object(object)
        case "search":
            let query = try AdapterSupport.require(request.arguments, "query")
            return .array(try store.list(collection: collection).filter {
                AdapterSupport.matches(query, in: $0, fields: ["name", "organization", "notes"])
            }.map(JSONValue.object))
        case "create":
            let object: [String: JSONValue] = [
                "id": .string(AdapterSupport.newID(prefix: "contact")),
                "name": .string(try AdapterSupport.require(request.arguments, "name")),
                "emails": .array(request.arguments["email"].map { [.string($0)] } ?? []),
                "phones": .array(request.arguments["phone"].map { [.string($0)] } ?? []),
                "organization": request.arguments["organization"].map(JSONValue.string) ?? .string(""),
                "notes": request.arguments["notes"].map(JSONValue.string) ?? .string(""),
                "source": .string("test_fixture"),
                "created_at": .string(AdapterSupport.isoString(Date())),
            ]
            _ = try store.upsert(collection: collection, object: object)
            return .object(object)
        case "update":
            let id = try AdapterSupport.require(request.arguments, "id")
            guard var object = try store.list(collection: collection).first(where: { $0["id"]?.stringValue == id }) else {
                throw CommanderError.notFound("Unknown contact \(id)")
            }
            if let value = request.arguments["name"] { object["name"] = .string(value) }
            if let value = request.arguments["email"] { object["emails"] = .array([.string(value)]) }
            if let value = request.arguments["phone"] { object["phones"] = .array([.string(value)]) }
            if let value = request.arguments["organization"] { object["organization"] = .string(value) }
            if let value = request.arguments["notes"] { object["notes"] = .string(value) }
            object["updated_at"] = .string(AdapterSupport.isoString(Date()))
            _ = try store.upsert(collection: collection, object: object)
            return .object(object)
        case "delete":
            let id = try AdapterSupport.require(request.arguments, "id")
            try store.delete(collection: collection, id: id)
            return .object(["id": .string(id), "deleted": .bool(true), "source": .string("test_fixture")])
        default:
            throw CommanderError.invalidCommand("Unsupported contacts test command")
        }
    }
}
