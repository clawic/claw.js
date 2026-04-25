import EventKit
import Foundation
import CommanderCore

public struct CalendarAdapter: CommanderAdapter {
    public let descriptor = AdapterDescriptor(
        name: "calendar",
        domain: .calendar,
        version: "0.2.0",
        supportedCommands: [
            "calendar events list",
            "calendar events get",
            "calendar events search",
            "calendar events create",
            "calendar events update",
            "calendar events delete",
        ],
        sources: [.framework, .applescript],
        riskLevel: "high",
        isImplemented: true,
        requiresOSPermission: true,
        coverageLevel: "crud",
        supportsSearch: true,
        supportsDelete: true
    )

    public init() {}

    public func supports(resource: String, action: String) -> Bool {
        resource == "events" && ["list", "get", "search", "create", "update", "delete"].contains(action)
    }

    public func execute(request: CommandRequest, environment: [String : String]) throws -> JSONValue {
        if ExecutionEnvironment.isTestMode(environment) {
            return try executeInTestMode(request: request, environment: environment)
        }

        let store = EKEventStore()
        let permissionState = PermissionService().status(for: .calendar)
        guard permissionState == .authorized else {
            throw CommanderError.permissionDenied("Calendar OS permission is \(permissionState.rawValue)")
        }

        switch request.action {
        case "list":
            let range = try resolvedRange(arguments: request.arguments)
            let events = try events(in: store, range: range, calendarName: request.arguments["calendar"])
            return .array(events.map(eventPayload))
        case "get":
            guard let id = request.arguments["id"], !id.isEmpty else {
                throw CommanderError.invalidArguments("Missing --id")
            }
            guard let event = store.event(withIdentifier: id) else {
                throw CommanderError.notFound("Unknown calendar event \(id)")
            }
            return eventPayload(for: event)
        case "search":
            guard let query = request.arguments["query"], !query.isEmpty else {
                throw CommanderError.invalidArguments("Missing --query")
            }
            let range = try resolvedRange(arguments: request.arguments)
            let matches = try events(in: store, range: range, calendarName: request.arguments["calendar"]).filter { event in
                event.title.localizedCaseInsensitiveContains(query) ||
                (event.notes?.localizedCaseInsensitiveContains(query) ?? false) ||
                (event.location?.localizedCaseInsensitiveContains(query) ?? false)
            }
            return .array(matches.map(eventPayload))
        case "create":
            let event = EKEvent(eventStore: store)
            try apply(arguments: request.arguments, to: event, store: store, requiresDateRange: true)
            event.calendar = try resolvedCalendar(named: request.arguments["calendar"], store: store) ?? store.defaultCalendarForNewEvents
            try store.save(event, span: .thisEvent)
            return eventPayload(for: event)
        case "update":
            guard let id = request.arguments["id"], let event = store.event(withIdentifier: id) else {
                throw CommanderError.notFound("Unknown calendar event")
            }
            try apply(arguments: request.arguments, to: event, store: store, requiresDateRange: false)
            if request.arguments["calendar"] != nil {
                event.calendar = try resolvedCalendar(named: request.arguments["calendar"], store: store) ?? event.calendar
            }
            try store.save(event, span: .thisEvent)
            return eventPayload(for: event)
        case "delete":
            guard let id = request.arguments["id"], let event = store.event(withIdentifier: id) else {
                throw CommanderError.notFound("Unknown calendar event")
            }
            try store.remove(event, span: .thisEvent)
            return .object([
                "id": .string(id),
                "deleted": .bool(true),
            ])
        default:
            throw CommanderError.invalidCommand("Unsupported calendar action \(request.action)")
        }
    }

    private func events(in store: EKEventStore, range: DateInterval, calendarName: String?) throws -> [EKEvent] {
        let calendars = try resolvedCalendars(filteringBy: calendarName, store: store)
        let predicate = store.predicateForEvents(withStart: range.start, end: range.end, calendars: calendars)
        return store.events(matching: predicate).sorted { $0.startDate < $1.startDate }
    }

    private func resolvedRange(arguments: [String: String]) throws -> DateInterval {
        let calendar = Foundation.Calendar.current
        if let startRaw = arguments["start"], let endRaw = arguments["end"] {
            return DateInterval(start: try CalendarDateFormatter.parse(startRaw), end: try CalendarDateFormatter.parse(endRaw))
        }

        if arguments["range"] == "today" || arguments["range"] == nil {
            let start = calendar.startOfDay(for: Date())
            return DateInterval(start: start, end: calendar.date(byAdding: .day, value: 1, to: start)!)
        }

        if let days = arguments["range"].flatMap({ Int($0.replacingOccurrences(of: "d", with: "")) }) {
            let start = Date()
            return DateInterval(start: start, end: calendar.date(byAdding: .day, value: days, to: start)!)
        }

        throw CommanderError.invalidArguments("Unsupported --range value")
    }

    private func resolvedCalendars(filteringBy name: String?, store: EKEventStore) throws -> [EKCalendar]? {
        guard let name, !name.isEmpty else { return nil }
        let calendars = store.calendars(for: .event).filter { $0.title == name }
        guard !calendars.isEmpty else {
            throw CommanderError.notFound("Unknown calendar \(name)")
        }
        return calendars
    }

    private func resolvedCalendar(named name: String?, store: EKEventStore) throws -> EKCalendar? {
        try resolvedCalendars(filteringBy: name, store: store)?.first
    }

    private func apply(arguments: [String: String], to event: EKEvent, store: EKEventStore, requiresDateRange: Bool) throws {
        if let title = arguments["title"] {
            event.title = title
        } else if requiresDateRange && event.title.isEmpty {
            throw CommanderError.invalidArguments("Missing --title")
        }

        if let notes = arguments["notes"] {
            event.notes = notes
        }
        if let location = arguments["location"] {
            event.location = location
        }
        if let allDay = arguments["all_day"] {
            event.isAllDay = ["true", "1", "yes"].contains(allDay.lowercased())
        }

        let startRaw = arguments["start"]
        let endRaw = arguments["end"]

        if requiresDateRange && (startRaw == nil || endRaw == nil) {
            throw CommanderError.invalidArguments("Missing --start or --end")
        }

        if let startRaw {
            event.startDate = try CalendarDateFormatter.parse(startRaw)
        }
        if let endRaw {
            event.endDate = try CalendarDateFormatter.parse(endRaw)
        }

        if event.endDate == nil, let startDate = event.startDate {
            event.endDate = Foundation.Calendar.current.date(byAdding: .hour, value: 1, to: startDate)
        }

        guard let startDate = event.startDate, let endDate = event.endDate, startDate <= endDate else {
            throw CommanderError.invalidArguments("Invalid event date range")
        }
    }

    private func eventPayload(for event: EKEvent) -> JSONValue {
        .object([
            "id": .string(event.eventIdentifier),
            "title": .string(event.title),
            "start": .string(CalendarDateFormatter.string(from: event.startDate)),
            "end": .string(CalendarDateFormatter.string(from: event.endDate)),
            "calendar": .string(event.calendar.title),
            "notes": event.notes.map(JSONValue.string) ?? .null,
            "location": event.location.map(JSONValue.string) ?? .null,
            "all_day": .bool(event.isAllDay),
        ])
    }

    private func executeInTestMode(request: CommandRequest, environment: [String: String]) throws -> JSONValue {
        let store = try TestModeStore(environment: environment)
        let eventsCollection = "calendar_events"
        let calendarsCollection = "calendar_calendars"

        switch request.action {
        case "list":
            try seedCalendarsIfNeeded(store: store, collection: calendarsCollection)
            let range = try resolvedRange(arguments: request.arguments)
            let calendarFilter = request.arguments["calendar"]
            let events = try store.list(collection: eventsCollection).filter { event in
                guard let startRaw = event["start"]?.stringValue,
                      let start = try? CalendarDateFormatter.parse(startRaw) else {
                    return false
                }
                let matchesCalendar = calendarFilter.map { event["calendar"]?.stringValue == $0 } ?? true
                return matchesCalendar && range.contains(start)
            }
            return .array(events.map(JSONValue.object))
        case "get":
            let id = try AdapterSupport.require(request.arguments, "id")
            guard let event = try store.list(collection: eventsCollection).first(where: { $0["id"]?.stringValue == id }) else {
                throw CommanderError.notFound("Unknown calendar event \(id)")
            }
            return .object(event)
        case "search":
            let query = try AdapterSupport.require(request.arguments, "query")
            let range = try resolvedRange(arguments: request.arguments)
            let calendarFilter = request.arguments["calendar"]
            return .array(try store.list(collection: eventsCollection).filter { event in
                let matchesText = AdapterSupport.matches(query, in: event, fields: ["title", "notes", "location", "calendar"])
                let matchesCalendar = calendarFilter.map { event["calendar"]?.stringValue == $0 } ?? true
                guard let startRaw = event["start"]?.stringValue,
                      let start = try? CalendarDateFormatter.parse(startRaw) else {
                    return false
                }
                return matchesText && matchesCalendar && range.contains(start)
            }.map(JSONValue.object))
        case "create":
            try seedCalendarsIfNeeded(store: store, collection: calendarsCollection)
            let start = try CalendarDateFormatter.parse(try AdapterSupport.require(request.arguments, "start"))
            let end = try CalendarDateFormatter.parse(try AdapterSupport.require(request.arguments, "end"))
            guard start <= end else {
                throw CommanderError.invalidArguments("Invalid event date range")
            }
            let object: [String: JSONValue] = [
                "id": .string(AdapterSupport.newID(prefix: "event")),
                "title": .string(try AdapterSupport.require(request.arguments, "title")),
                "start": .string(CalendarDateFormatter.string(from: start)),
                "end": .string(CalendarDateFormatter.string(from: end)),
                "calendar": .string(request.arguments["calendar"] ?? "Personal"),
                "notes": request.arguments["notes"].map(JSONValue.string) ?? .null,
                "location": request.arguments["location"].map(JSONValue.string) ?? .null,
                "all_day": .bool((request.arguments["all_day"] ?? "").lowercased().matchesTrue),
                "source": .string("test_fixture"),
                "created_at": .string(AdapterSupport.isoString(Date())),
            ]
            _ = try store.upsert(collection: eventsCollection, object: object)
            return .object(object)
        case "update":
            let id = try AdapterSupport.require(request.arguments, "id")
            guard var event = try store.list(collection: eventsCollection).first(where: { $0["id"]?.stringValue == id }) else {
                throw CommanderError.notFound("Unknown calendar event \(id)")
            }
            if let title = request.arguments["title"] { event["title"] = .string(title) }
            if let start = request.arguments["start"] {
                event["start"] = .string(CalendarDateFormatter.string(from: try CalendarDateFormatter.parse(start)))
            }
            if let end = request.arguments["end"] {
                event["end"] = .string(CalendarDateFormatter.string(from: try CalendarDateFormatter.parse(end)))
            }
            if let startRaw = event["start"]?.stringValue,
               let endRaw = event["end"]?.stringValue,
               try CalendarDateFormatter.parse(startRaw) > CalendarDateFormatter.parse(endRaw) {
                throw CommanderError.invalidArguments("Invalid event date range")
            }
            if let calendar = request.arguments["calendar"] { event["calendar"] = .string(calendar) }
            if let notes = request.arguments["notes"] { event["notes"] = .string(notes) }
            if let location = request.arguments["location"] { event["location"] = .string(location) }
            if let allDay = request.arguments["all_day"] {
                event["all_day"] = .bool(allDay.lowercased().matchesTrue)
            }
            event["updated_at"] = .string(AdapterSupport.isoString(Date()))
            event["source"] = .string("test_fixture")
            _ = try store.upsert(collection: eventsCollection, object: event)
            return .object(event)
        case "delete":
            let id = try AdapterSupport.require(request.arguments, "id")
            try store.delete(collection: eventsCollection, id: id)
            return .object([
                "id": .string(id),
                "deleted": .bool(true),
                "source": .string("test_fixture"),
            ])
        default:
            throw CommanderError.invalidCommand("Unsupported calendar test action \(request.action)")
        }
    }

    private func seedCalendarsIfNeeded(store: TestModeStore, collection: String) throws {
        if try store.list(collection: collection).isEmpty {
            try store.replace(collection: collection, with: [
                ["id": .string("calendar_personal"), "title": .string("Personal"), "source": .string("test_fixture")],
                ["id": .string("calendar_work"), "title": .string("Work"), "source": .string("test_fixture")],
            ])
        }
    }
}

private extension String {
    var matchesTrue: Bool {
        ["true", "1", "yes"].contains(self)
    }
}

private struct CalendarDateFormatter {
    static func parse(_ string: String) throws -> Date {
        let primary = ISO8601DateFormatter()
        primary.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let fallback = ISO8601DateFormatter()
        fallback.formatOptions = [.withInternetDateTime]
        if let date = primary.date(from: string) ?? fallback.date(from: string) {
            return date
        }
        throw CommanderError.invalidArguments("Invalid ISO8601 date: \(string)")
    }

    static func string(from date: Date?) -> String {
        guard let date else { return "" }
        let fallback = ISO8601DateFormatter()
        fallback.formatOptions = [.withInternetDateTime]
        return fallback.string(from: date)
    }
}
