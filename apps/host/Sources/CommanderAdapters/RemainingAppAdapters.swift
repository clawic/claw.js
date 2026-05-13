import Foundation
import CommanderCore

public struct MailAdapter: CommanderAdapter {
    private let automationTimeout: TimeInterval = 8

    public let descriptor = AdapterDescriptor(
        name: "mail",
        domain: .mail,
        version: "0.2.0",
        supportedCommands: [
            "mail messages list",
            "mail messages get",
            "mail messages search",
            "mail messages create",
            "mail messages send",
            "mail messages delete",
        ],
        sources: [.applescript],
        riskLevel: "high",
        isImplemented: true,
        requiresOSPermission: false,
        coverageLevel: "crud",
        supportsSearch: true,
        supportsDelete: true
    )

    public init() {}

    public func supports(resource: String, action: String) -> Bool {
        resource == "messages" && ["list", "get", "search", "create", "send", "delete"].contains(action)
    }

    public func execute(request: CommandRequest, environment: [String : String]) throws -> JSONValue {
        if ExecutionEnvironment.isTestMode(environment) {
            return try executeInTestMode(request: request, environment: environment)
        }
        try AdapterSupport.requireInstalledApp("Mail")
        try preflightAutomation()

        switch request.action {
        case "list":
            return .array(try listMessages(mailbox: request.arguments["mailbox"], limit: Int(request.arguments["limit"] ?? "50") ?? 50).map(JSONValue.object))
        case "get":
            let id = try AdapterSupport.require(request.arguments, "id")
            guard let message = try listMessages(mailbox: request.arguments["mailbox"], limit: 500).first(where: { $0["id"]?.stringValue == id }) else {
                throw CommanderError.notFound("Unknown mail message \(id)")
            }
            return .object(message)
        case "search":
            let query = try AdapterSupport.require(request.arguments, "query")
            return .array(try listMessages(mailbox: request.arguments["mailbox"], limit: 500).filter {
                AdapterSupport.matches(query, in: $0, fields: ["subject", "from", "to", "cc", "body", "mailbox"])
            }.map(JSONValue.object))
        case "create":
            return .object(try createDraft(arguments: request.arguments, send: false, mailbox: request.arguments["mailbox"]))
        case "send":
            guard request.arguments["confirm-send"] == "true" || request.arguments["confirm_send"] == "true" else {
                throw CommanderError.invalidArguments("Mail send requires --confirm-send true on host mode")
            }
            return .object(try createDraft(arguments: request.arguments, send: true, mailbox: request.arguments["mailbox"]))
        case "delete":
            let id = try AdapterSupport.require(request.arguments, "id")
            let script = """
            tell application "Mail"
                repeat with accountRef in every account
                    repeat with mailboxRef in every mailbox of accountRef
                        repeat with messageRef in every message of mailboxRef
                            if (id of messageRef as text) is "\(AdapterSupport.escapeAppleScript(id))" then
                                delete messageRef
                                return "deleted"
                            end if
                        end repeat
                    end repeat
                end repeat
            end tell
            """
            _ = try AdapterSupport.runAppleScript(appName: "Mail", script: script, timeout: automationTimeout)
            return .object(["id": .string(id), "deleted": .bool(true), "source": .string("applescript")])
        default:
            throw CommanderError.invalidCommand("Unsupported mail action")
        }
    }

    private func preflightAutomation() throws {
        _ = try AdapterSupport.runAppleScript(
            appName: "Mail",
            script: """
            tell application "Mail"
                return count of accounts
            end tell
            """,
            timeout: 2
        )
    }

    private func listMessages(mailbox: String?, limit: Int) throws -> [[String: JSONValue]] {
        let mailboxPredicate = mailbox.map { """
                            if (name of mailboxRef) is "\(AdapterSupport.escapeAppleScript($0))" then
        """ } ?? ""
        let mailboxSuffix = mailbox == nil ? "" : """
                            end if
        """
        let script = """
        on sanitizeText(value)
            if value is missing value then return ""
            set value to value as text
            set value to my replaceText(return, "\\n", value)
            set value to my replaceText(linefeed, "\\n", value)
            set value to my replaceText((ASCII character 31), " ", value)
            return value
        end sanitizeText
        on replaceText(findValue, replaceValue, subject)
            set AppleScript's text item delimiters to findValue
            set subjectItems to text items of subject
            set AppleScript's text item delimiters to replaceValue
            set subject to subjectItems as text
            set AppleScript's text item delimiters to ""
            return subject
        end replaceText
        tell application "Mail"
            set fieldSep to ASCII character 31
            set outputLines to ""
            repeat with accountRef in every account
                repeat with mailboxRef in every mailbox of accountRef
        \(mailboxPredicate)
                    repeat with messageRef in every message of mailboxRef
                        set senderValue to ""
                        try
                            set senderValue to sender of messageRef
                        end try
                        set dateValue to ""
                        try
                            set dateValue to date sent of messageRef as text
                        end try
                        set toValue to ""
                        try
                            set toValue to (address of every to recipient of messageRef) as text
                        end try
                        set ccValue to ""
                        try
                            set ccValue to (address of every cc recipient of messageRef) as text
                        end try
                        set outputLines to outputLines & (id of messageRef as text) & fieldSep & my sanitizeText(subject of messageRef) & fieldSep & my sanitizeText(senderValue) & fieldSep & my sanitizeText(toValue) & fieldSep & my sanitizeText(ccValue) & fieldSep & my sanitizeText(content of messageRef) & fieldSep & my sanitizeText(name of mailboxRef) & fieldSep & ((name of mailboxRef is "Drafts") as text) & fieldSep & my sanitizeText(dateValue) & linefeed
                    end repeat
        \(mailboxSuffix)
                end repeat
            end repeat
            return outputLines
        end tell
        """
        return Array(AdapterSupport.parseRows(try AdapterSupport.runAppleScript(appName: "Mail", script: script, timeout: automationTimeout), expectedFieldCount: 9).map {
            [
                "id": .string($0[0]),
                "subject": .string($0[1]),
                "from": .string($0[2]),
                "to": .string($0[3]),
                "cc": .string($0[4]),
                "body": .string($0[5]),
                "mailbox": .string($0[6]),
                "is_draft": .bool(AdapterSupport.parseBool($0[7])),
                "date": .string($0[8]),
                "source": .string("applescript"),
            ]
        }.prefix(limit))
    }

    private func createDraft(arguments: [String: String], send: Bool, mailbox: String?) throws -> [String: JSONValue] {
        let subject = AdapterSupport.escapeAppleScript(arguments["subject"] ?? "")
        let body = AdapterSupport.escapeAppleScript(arguments["body"] ?? "")
        let to = AdapterSupport.escapeAppleScript(arguments["to"] ?? "")
        let cc = AdapterSupport.escapeAppleScript(arguments["cc"] ?? "")
        let script = """
        on sanitizeText(value)
            if value is missing value then return ""
            set value to value as text
            set AppleScript's text item delimiters to return
            set value to text items of value as text
            set AppleScript's text item delimiters to ""
            return value
        end sanitizeText
        tell application "Mail"
            set fieldSep to ASCII character 31
            set messageRef to make new outgoing message with properties {visible:false, subject:"\(subject)", content:"\(body)"}
            tell messageRef
                if "\(to)" is not "" then
                    make new to recipient at end of to recipients with properties {address:"\(to)"}
                end if
                if "\(cc)" is not "" then
                    make new cc recipient at end of cc recipients with properties {address:"\(cc)"}
                end if
                save
                if \(send ? "true" : "false") then
                    send
                end if
                return (id as text) & fieldSep & my sanitizeText(subject) & fieldSep & my sanitizeText(content)
            end tell
        end tell
        """
        let row = AdapterSupport.parseRows(try AdapterSupport.runAppleScript(appName: "Mail", script: script, timeout: automationTimeout), expectedFieldCount: 3).first ?? []
        return [
            "id": .string(row[safe: 0] ?? AdapterSupport.newID(prefix: "mail")),
            "subject": .string(row[safe: 1] ?? arguments["subject"] ?? ""),
            "body": .string(row[safe: 2] ?? arguments["body"] ?? ""),
            "to": .string(arguments["to"] ?? ""),
            "cc": .string(arguments["cc"] ?? ""),
            "mailbox": .string(mailbox ?? (send ? "Sent" : "Drafts")),
            "is_draft": .bool(!send),
            "source": .string("applescript"),
        ]
    }

    private func executeInTestMode(request: CommandRequest, environment: [String: String]) throws -> JSONValue {
        let store = try TestModeStore(environment: environment)
        let collection = "mail_messages"
        switch request.action {
        case "list":
            let mailbox = request.arguments["mailbox"]
            let messages = try store.list(collection: collection)
            return .array(messages.filter { message in
                mailbox.map { $0 == message["mailbox"]?.stringValue } ?? true
            }.map(JSONValue.object))
        case "get":
            let id = try AdapterSupport.require(request.arguments, "id")
            guard let object = try store.list(collection: collection).first(where: { $0["id"]?.stringValue == id }) else {
                throw CommanderError.notFound("Unknown mail message \(id)")
            }
            return .object(object)
        case "search":
            let query = try AdapterSupport.require(request.arguments, "query")
            return .array(try store.list(collection: collection).filter {
                AdapterSupport.matches(query, in: $0, fields: ["subject", "from", "to", "cc", "body", "mailbox"])
            }.map(JSONValue.object))
        case "create", "send":
            let object: [String: JSONValue] = [
                "id": .string(AdapterSupport.newID(prefix: "mail")),
                "subject": .string(request.arguments["subject"] ?? ""),
                "from": .string("agent@local.test"),
                "to": .string(request.arguments["to"] ?? ""),
                "cc": .string(request.arguments["cc"] ?? ""),
                "body": .string(request.arguments["body"] ?? ""),
                "mailbox": .string(request.action == "send" ? "Sent" : "Drafts"),
                "is_draft": .bool(request.action != "send"),
                "date": .string(AdapterSupport.isoString(Date())),
                "source": .string("test_fixture"),
                "created_at": .string(AdapterSupport.isoString(Date())),
            ]
            _ = try store.upsert(collection: collection, object: object)
            return .object(object)
        case "delete":
            let id = try AdapterSupport.require(request.arguments, "id")
            try store.delete(collection: collection, id: id)
            return .object(["id": .string(id), "deleted": .bool(true), "source": .string("test_fixture")])
        default:
            throw CommanderError.invalidCommand("Unsupported mail test action")
        }
    }
}

public struct ThingsAdapter: CommanderAdapter {
    public let descriptor = AdapterDescriptor(
        name: "things",
        domain: .things,
        version: "0.2.0",
        supportedCommands: [
            "things todos list",
            "things todos get",
            "things todos search",
            "things todos create",
            "things todos update",
            "things todos delete",
            "things todos complete",
        ],
        sources: [.applescript, .urlScheme],
        riskLevel: "high",
        isImplemented: true,
        requiresOSPermission: false,
        coverageLevel: "crud",
        supportsSearch: true,
        supportsDelete: true
    )

    public init() {}

    public func supports(resource: String, action: String) -> Bool {
        resource == "todos" && ["list", "get", "search", "create", "update", "delete", "complete"].contains(action)
    }

    public func execute(request: CommandRequest, environment: [String : String]) throws -> JSONValue {
        if ExecutionEnvironment.isTestMode(environment) {
            return try executeInTestMode(request: request, environment: environment)
        }
        try AdapterSupport.requireInstalledApp("Things3")

        switch request.action {
        case "list":
            return .array(try listTodos(project: request.arguments["project"], area: request.arguments["area"]).map(JSONValue.object))
        case "get":
            let id = try AdapterSupport.require(request.arguments, "id")
            guard let todo = try listTodos().first(where: { $0["id"]?.stringValue == id }) else {
                throw CommanderError.notFound("Unknown Things todo \(id)")
            }
            return .object(todo)
        case "search":
            let query = try AdapterSupport.require(request.arguments, "query")
            return .array(try listTodos(project: request.arguments["project"], area: request.arguments["area"]).filter { AdapterSupport.matches(query, in: $0, fields: ["title", "notes", "project", "area", "status"]) }.map(JSONValue.object))
        case "create":
            return .object(try mutateTodo(arguments: request.arguments, action: "create"))
        case "update":
            return .object(try mutateTodo(arguments: request.arguments, action: "update"))
        case "delete":
            return .object(try mutateTodo(arguments: request.arguments, action: "delete"))
        case "complete":
            return .object(try mutateTodo(arguments: request.arguments, action: "complete"))
        default:
            throw CommanderError.invalidCommand("Unsupported Things action")
        }
    }

    private func listTodos(project: String? = nil, area: String? = nil) throws -> [[String: JSONValue]] {
        let escapedProject = project.map(AdapterSupport.escapeAppleScript)
        let areaFilter = area.map {
            """
                if areaName is not "\(AdapterSupport.escapeAppleScript($0))" then
                    set shouldInclude to false
                end if
            """
        } ?? ""
        let todoRefsSetup = escapedProject.map {
            """
            set todoRefs to {}
            try
                set todoRefs to to dos of project id "\($0)"
            on error
                set todoRefs to to dos of project "\($0)"
            end try
            """
        } ?? "set todoRefs to to dos"
        let script = """
        on sanitizeText(value)
            if value is missing value then return ""
            set value to value as text
            set value to my replaceText(return, "\\n", value)
            set value to my replaceText(linefeed, "\\n", value)
            set value to my replaceText((ASCII character 31), " ", value)
            return value
        end sanitizeText
        on replaceText(findValue, replaceValue, subject)
            set AppleScript's text item delimiters to findValue
            set subjectItems to text items of subject
            set AppleScript's text item delimiters to replaceValue
            set subject to subjectItems as text
            set AppleScript's text item delimiters to ""
            return subject
        end replaceText
        tell application "Things3"
            set fieldSep to ASCII character 31
            set outputLines to ""
        \(todoRefsSetup)
            repeat with todoRef in todoRefs
                set projectName to ""
                set projectID to ""
                try
                    set projectName to name of project of todoRef
                    set projectID to id of project of todoRef as text
                end try
                set areaName to ""
                try
                    set areaName to name of area of todoRef
                end try
                set whenValue to ""
                try
                    set whenValue to activation date of todoRef as text
                end try
                set deadlineValue to ""
                try
                    set deadlineValue to due date of todoRef as text
                end try
                set shouldInclude to true
        \(areaFilter)
                if shouldInclude then
                    set outputLines to outputLines & (id of todoRef as text) & fieldSep & my sanitizeText(name of todoRef) & fieldSep & my sanitizeText(notes of todoRef) & fieldSep & my sanitizeText(projectName) & fieldSep & my sanitizeText(projectID) & fieldSep & my sanitizeText(areaName) & fieldSep & my sanitizeText(whenValue) & fieldSep & my sanitizeText(deadlineValue) & fieldSep & my sanitizeText(status of todoRef as text) & linefeed
                end if
            end repeat
            return outputLines
        end tell
        """
        return AdapterSupport.parseRows(try AdapterSupport.runAppleScript(appName: "Things3", script: script, timeout: 8), expectedFieldCount: 9).map {
            [
                "id": .string($0[0]),
                "title": .string($0[1]),
                "notes": .string($0[2]),
                "project": .string($0[3]),
                "project_id": .string($0[4]),
                "area": .string($0[5]),
                "when": .string($0[6]),
                "deadline": .string($0[7]),
                "status": .string($0[8]),
                "source": .string("applescript"),
            ]
        }
    }

    private func mutateTodo(arguments: [String: String], action: String) throws -> [String: JSONValue] {
        let id = arguments["id"].map(AdapterSupport.escapeAppleScript) ?? ""
        let title = AdapterSupport.escapeAppleScript(arguments["title"] ?? "")
        let notes = AdapterSupport.escapeAppleScript(arguments["notes"] ?? "")
        let project = AdapterSupport.escapeAppleScript(arguments["project"] ?? "")
        let script: String
        switch action {
        case "create":
            script = """
            tell application "Things3"
                if "\(project)" is not "" then
                    set targetProject to missing value
                    try
                        set targetProject to project id "\(project)"
                    on error
                        set targetProject to project "\(project)"
                    end try
                    tell targetProject
                        set todoRef to make new to do with properties {name:"\(title)", notes:"\(notes)"}
                    end tell
                else
                    set todoRef to make new to do with properties {name:"\(title)", notes:"\(notes)"}
                end if
                return (id of todoRef as text) & (ASCII character 31) & (name of todoRef as text)
            end tell
            """
        case "update":
            script = """
            tell application "Things3"
                set todoRef to to do id "\(id)"
                if "\(title)" is not "" then set name of todoRef to "\(title)"
                if "\(notes)" is not "" then set notes of todoRef to "\(notes)"
                return (id of todoRef as text) & (ASCII character 31) & (name of todoRef as text)
            end tell
            """
        case "delete":
            script = """
            tell application "Things3"
                delete to do id "\(id)"
                return "\(id)"
            end tell
            """
        case "complete":
            script = """
            tell application "Things3"
                set todoRef to to do id "\(id)"
                set status of todoRef to completed
                return (id of todoRef as text) & (ASCII character 31) & (status of todoRef as text)
            end tell
            """
        default:
            throw CommanderError.invalidCommand("Unsupported Things mutation")
        }
        let rows = AdapterSupport.parseRows(try AdapterSupport.runAppleScript(appName: "Things3", script: script, timeout: 8), expectedFieldCount: action == "delete" ? 1 : 2)
        if action == "delete" {
            return ["id": .string(arguments["id"] ?? ""), "deleted": .bool(true), "source": .string("applescript")]
        }
        return [
            "id": .string(rows.first?[safe: 0] ?? arguments["id"] ?? ""),
            action == "complete" ? "status" : "title": .string(rows.first?[safe: 1] ?? (action == "complete" ? "completed" : arguments["title"] ?? "")),
            "source": .string("applescript"),
        ]
    }

    private func executeInTestMode(request: CommandRequest, environment: [String: String]) throws -> JSONValue {
        let store = try TestModeStore(environment: environment)
        let collection = "things_todos"
        switch request.action {
        case "list":
            return .array(try store.list(collection: collection).map(JSONValue.object))
        case "get":
            let id = try AdapterSupport.require(request.arguments, "id")
            guard let object = try store.list(collection: collection).first(where: { $0["id"]?.stringValue == id }) else {
                throw CommanderError.notFound("Unknown Things todo \(id)")
            }
            return .object(object)
        case "search":
            let query = try AdapterSupport.require(request.arguments, "query")
            return .array(try store.list(collection: collection).filter {
                AdapterSupport.matches(query, in: $0, fields: ["title", "notes", "project", "area", "status"])
            }.map(JSONValue.object))
        case "create":
            let object: [String: JSONValue] = [
                "id": .string(AdapterSupport.newID(prefix: "thing")),
                "title": .string(try AdapterSupport.require(request.arguments, "title")),
                "notes": .string(request.arguments["notes"] ?? ""),
                "project": .string(request.arguments["project"] ?? ""),
                "project_id": .string(request.arguments["project"] ?? ""),
                "area": .string(request.arguments["area"] ?? ""),
                "when": .string(request.arguments["when"] ?? ""),
                "deadline": .string(request.arguments["deadline"] ?? ""),
                "status": .string("open"),
                "source": .string("test_fixture"),
                "created_at": .string(AdapterSupport.isoString(Date())),
            ]
            _ = try store.upsert(collection: collection, object: object)
            return .object(object)
        case "update", "complete":
            let id = try AdapterSupport.require(request.arguments, "id")
            guard var object = try store.list(collection: collection).first(where: { $0["id"]?.stringValue == id }) else {
                throw CommanderError.notFound("Unknown Things todo \(id)")
            }
            if let value = request.arguments["title"] { object["title"] = .string(value) }
            if let value = request.arguments["notes"] { object["notes"] = .string(value) }
            if let value = request.arguments["project"] { object["project"] = .string(value) }
            if let value = request.arguments["project"] { object["project_id"] = .string(value) }
            if let value = request.arguments["area"] { object["area"] = .string(value) }
            if let value = request.arguments["when"] { object["when"] = .string(value) }
            if let value = request.arguments["deadline"] { object["deadline"] = .string(value) }
            if request.action == "complete" { object["status"] = .string("completed") }
            object["updated_at"] = .string(AdapterSupport.isoString(Date()))
            _ = try store.upsert(collection: collection, object: object)
            return .object(object)
        case "delete":
            let id = try AdapterSupport.require(request.arguments, "id")
            try store.delete(collection: collection, id: id)
            return .object(["id": .string(id), "deleted": .bool(true), "source": .string("test_fixture")])
        default:
            throw CommanderError.invalidCommand("Unsupported Things test action")
        }
    }
}

public struct NotesAdapter: CommanderAdapter {
    public let descriptor = AdapterDescriptor(
        name: "notes",
        domain: .notes,
        version: "0.2.0",
        supportedCommands: [
            "notes notes list",
            "notes notes get",
            "notes notes search",
            "notes notes create",
            "notes notes update",
            "notes notes delete",
        ],
        sources: [.applescript],
        riskLevel: "high",
        isImplemented: true,
        requiresOSPermission: false,
        coverageLevel: "crud",
        supportsSearch: true,
        supportsDelete: true
    )

    public init() {}

    public func supports(resource: String, action: String) -> Bool {
        ["notes", "entries"].contains(resource) && ["list", "get", "search", "create", "update", "delete"].contains(action)
    }

    public func execute(request: CommandRequest, environment: [String : String]) throws -> JSONValue {
        if ExecutionEnvironment.isTestMode(environment) {
            return try executeInTestMode(request: request, environment: environment)
        }
        try AdapterSupport.requireInstalledApp("Notes")

        switch request.action {
        case "list":
            return .array(try filteredNotes(arguments: request.arguments).map(JSONValue.object))
        case "get":
            let id = try AdapterSupport.require(request.arguments, "id")
            guard let note = try listNotes().first(where: { $0["id"]?.stringValue == id }) else {
                throw CommanderError.notFound("Unknown note \(id)")
            }
            return .object(note)
        case "search":
            let query = try AdapterSupport.require(request.arguments, "query")
            return .array(try filteredNotes(arguments: request.arguments).filter { AdapterSupport.matches(query, in: $0, fields: ["title", "folder", "body"]) }.map(JSONValue.object))
        case "create":
            return .object(try mutateNote(arguments: request.arguments, action: "create"))
        case "update":
            return .object(try mutateNote(arguments: request.arguments, action: "update"))
        case "delete":
            return .object(try mutateNote(arguments: request.arguments, action: "delete"))
        default:
            throw CommanderError.invalidCommand("Unsupported Notes action")
        }
    }

    private func listNotes() throws -> [[String: JSONValue]] {
        let script = """
        on sanitizeText(value)
            if value is missing value then return ""
            set value to value as text
            set value to my replaceText(return, "\\n", value)
            set value to my replaceText(linefeed, "\\n", value)
            set value to my replaceText((ASCII character 31), " ", value)
            return value
        end sanitizeText
        on replaceText(findValue, replaceValue, subject)
            set AppleScript's text item delimiters to findValue
            set subjectItems to text items of subject
            set AppleScript's text item delimiters to replaceValue
            set subject to subjectItems as text
            set AppleScript's text item delimiters to ""
            return subject
        end replaceText
        tell application "Notes"
            set fieldSep to ASCII character 31
            set outputLines to ""
            repeat with folderRef in folders
                repeat with noteRef in notes of folderRef
                    set modifiedValue to ""
                    try
                        set modifiedValue to modification date of noteRef as text
                    end try
                    set outputLines to outputLines & (id of noteRef as text) & fieldSep & my sanitizeText(name of noteRef) & fieldSep & my sanitizeText(name of folderRef) & fieldSep & my sanitizeText(body of noteRef) & fieldSep & my sanitizeText(modifiedValue) & linefeed
                end repeat
            end repeat
            return outputLines
        end tell
        """
        return AdapterSupport.parseRows(try AdapterSupport.runAppleScript(appName: "Notes", script: script, timeout: 8), expectedFieldCount: 5).map {
            [
                "id": .string($0[0]),
                "title": .string($0[1]),
                "folder": .string($0[2]),
                "body": .string($0[3]),
                "modified_at": .string($0[4]),
                "source": .string("applescript"),
            ]
        }
    }

    private func filteredNotes(arguments: [String: String]) throws -> [[String: JSONValue]] {
        try listNotes().filter { note in
            arguments["folder"].map { note["folder"]?.stringValue == $0 } ?? true
        }
    }

    private func mutateNote(arguments: [String: String], action: String) throws -> [String: JSONValue] {
        let id = AdapterSupport.escapeAppleScript(arguments["id"] ?? "")
        let title = AdapterSupport.escapeAppleScript(arguments["title"] ?? "")
        let body = AdapterSupport.escapeAppleScript(arguments["body"] ?? "")
        let folder = AdapterSupport.escapeAppleScript(arguments["folder"] ?? "Notes")
        let script: String
        switch action {
        case "create":
            script = """
            tell application "Notes"
                set targetFolder to missing value
                try
                    set targetFolder to folder "\(folder)"
                on error
                    set targetFolder to make new folder with properties {name:"\(folder)"}
                end try
                set noteRef to make new note at targetFolder with properties {name:"\(title)", body:"\(body)"}
                return (id of noteRef as text) & (ASCII character 31) & (name of noteRef as text)
            end tell
            """
        case "update":
            script = """
            tell application "Notes"
                set noteRef to note id "\(id)"
                if "\(title)" is not "" then set name of noteRef to "\(title)"
                if "\(body)" is not "" then set body of noteRef to "\(body)"
                return (id of noteRef as text) & (ASCII character 31) & (name of noteRef as text)
            end tell
            """
        case "delete":
            script = """
            tell application "Notes"
                delete note id "\(id)"
                return "\(id)"
            end tell
            """
        default:
            throw CommanderError.invalidCommand("Unsupported note mutation")
        }
        let rows = AdapterSupport.parseRows(try AdapterSupport.runAppleScript(appName: "Notes", script: script, timeout: 8), expectedFieldCount: action == "delete" ? 1 : 2)
        if action == "delete" {
            return ["id": .string(arguments["id"] ?? ""), "deleted": .bool(true), "source": .string("applescript")]
        }
        return [
            "id": .string(rows.first?[safe: 0] ?? arguments["id"] ?? ""),
            "title": .string(rows.first?[safe: 1] ?? arguments["title"] ?? ""),
            "source": .string("applescript"),
        ]
    }

    private func executeInTestMode(request: CommandRequest, environment: [String: String]) throws -> JSONValue {
        let store = try TestModeStore(environment: environment)
        let collection = "notes_notes"
        switch request.action {
        case "list":
            return .array(try store.list(collection: collection).map(JSONValue.object))
        case "get":
            let id = try AdapterSupport.require(request.arguments, "id")
            guard let object = try store.list(collection: collection).first(where: { $0["id"]?.stringValue == id }) else {
                throw CommanderError.notFound("Unknown note \(id)")
            }
            return .object(object)
        case "search":
            let query = try AdapterSupport.require(request.arguments, "query")
            return .array(try store.list(collection: collection).filter {
                AdapterSupport.matches(query, in: $0, fields: ["title", "folder", "body"])
            }.map(JSONValue.object))
        case "create":
            let object: [String: JSONValue] = [
                "id": .string(AdapterSupport.newID(prefix: "note")),
                "title": .string(try AdapterSupport.require(request.arguments, "title")),
                "folder": .string(request.arguments["folder"] ?? "Notes"),
                "body": .string(request.arguments["body"] ?? ""),
                "modified_at": .string(AdapterSupport.isoString(Date())),
                "source": .string("test_fixture"),
                "created_at": .string(AdapterSupport.isoString(Date())),
            ]
            _ = try store.upsert(collection: collection, object: object)
            return .object(object)
        case "update":
            let id = try AdapterSupport.require(request.arguments, "id")
            guard var object = try store.list(collection: collection).first(where: { $0["id"]?.stringValue == id }) else {
                throw CommanderError.notFound("Unknown note \(id)")
            }
            if let value = request.arguments["title"] { object["title"] = .string(value) }
            if let value = request.arguments["folder"] { object["folder"] = .string(value) }
            if let value = request.arguments["body"] { object["body"] = .string(value) }
            object["modified_at"] = .string(AdapterSupport.isoString(Date()))
            object["updated_at"] = .string(AdapterSupport.isoString(Date()))
            _ = try store.upsert(collection: collection, object: object)
            return .object(object)
        case "delete":
            let id = try AdapterSupport.require(request.arguments, "id")
            try store.delete(collection: collection, id: id)
            return .object(["id": .string(id), "deleted": .bool(true), "source": .string("test_fixture")])
        default:
            throw CommanderError.invalidCommand("Unsupported notes test action")
        }
    }
}

public struct MessagesAdapter: CommanderAdapter {
    public let descriptor = AdapterDescriptor(
        name: "messages",
        domain: .messages,
        version: "0.2.0",
        supportedCommands: [
            "messages conversations list",
            "messages conversations get",
            "messages messages send",
        ],
        sources: [.applescript],
        riskLevel: "high",
        isImplemented: true,
        requiresOSPermission: false,
        coverageLevel: "crud",
        supportsSearch: false,
        supportsDelete: false
    )

    public init() {}

    public func supports(resource: String, action: String) -> Bool {
        (resource == "conversations" && ["list", "get"].contains(action)) ||
        (["messages", "entries"].contains(resource) && action == "send")
    }

    public func execute(request: CommandRequest, environment: [String : String]) throws -> JSONValue {
        if ExecutionEnvironment.isTestMode(environment) {
            return try executeInTestMode(request: request, environment: environment)
        }
        try AdapterSupport.requireInstalledApp("Messages")

        switch (request.resource, request.action) {
        case ("conversations", "list"):
            return .array(try listConversations().map(JSONValue.object))
        case ("conversations", "get"):
            let id = try AdapterSupport.require(request.arguments, "id")
            guard let conversation = try listConversations().first(where: { $0["id"]?.stringValue == id }) else {
                throw CommanderError.notFound("Unknown conversation \(id)")
            }
            return .object(conversation)
        case ("messages", "send"), ("entries", "send"):
            let recipient = try AdapterSupport.require(request.arguments, "recipient")
            let text = try AdapterSupport.require(request.arguments, "text")
            let service = request.arguments["service"] ?? "iMessage"
            guard request.arguments["confirm-send"] == "true" || request.arguments["confirm_send"] == "true" else {
                throw CommanderError.invalidArguments("Messages send requires --confirm-send true on host mode")
            }
            return .object(try sendMessage(recipient: recipient, text: text, service: service))
        default:
            throw CommanderError.invalidCommand("Unsupported Messages action")
        }
    }

    private func listConversations() throws -> [[String: JSONValue]] {
        let script = """
        on sanitizeText(value)
            if value is missing value then return ""
            set value to value as text
            set value to my replaceText(return, "\\n", value)
            set value to my replaceText(linefeed, "\\n", value)
            set value to my replaceText((ASCII character 31), " ", value)
            return value
        end sanitizeText
        on replaceText(findValue, replaceValue, subject)
            set AppleScript's text item delimiters to findValue
            set subjectItems to text items of subject
            set AppleScript's text item delimiters to replaceValue
            set subject to subjectItems as text
            set AppleScript's text item delimiters to ""
            return subject
        end replaceText
        tell application "Messages"
            set fieldSep to ASCII character 31
            set outputLines to ""
            repeat with chatRef in text chats
                set participantValue to ""
                try
                    repeat with participantRef in participants of chatRef
                        set participantValue to participantValue & my sanitizeText(handle of participantRef) & ","
                    end repeat
                end try
                set chatName to ""
                try
                    set chatName to name of chatRef
                end try
                set chatId to chatName
                try
                    set chatId to id of chatRef as text
                end try
                set outputLines to outputLines & my sanitizeText(chatId) & fieldSep & my sanitizeText(chatName) & fieldSep & my sanitizeText(participantValue) & fieldSep & "" & linefeed
            end repeat
            return outputLines
        end tell
        """
        return AdapterSupport.parseRows(try AdapterSupport.runAppleScript(appName: "Messages", script: script, timeout: 8), expectedFieldCount: 4).map {
            [
                "id": .string($0[0]),
                "conversation": .string($0[1]),
                "participants": .string($0[2].trimmingCharacters(in: CharacterSet(charactersIn: ","))),
                "text": .string($0[3]),
                "date": .string(""),
                "source": .string("applescript"),
            ]
        }
    }

    private func sendMessage(recipient: String, text: String, service: String) throws -> [String: JSONValue] {
        let escapedRecipient = AdapterSupport.escapeAppleScript(recipient)
        let escapedText = AdapterSupport.escapeAppleScript(text)
        let serviceType = service.lowercased() == "sms" ? "SMS" : "iMessage"
        let script = """
        tell application "Messages"
            set targetService to 1st service whose service type = \(serviceType)
            set targetBuddy to buddy "\(escapedRecipient)" of targetService
            send "\(escapedText)" to targetBuddy
            return "\(escapedRecipient)" & (ASCII character 31) & "\(escapedText)"
        end tell
        """
        let row = AdapterSupport.parseRows(try AdapterSupport.runAppleScript(appName: "Messages", script: script, timeout: 8), expectedFieldCount: 2).first ?? []
        return [
            "conversation": .string(row[safe: 0] ?? recipient),
            "participants": .string(recipient),
            "text": .string(row[safe: 1] ?? text),
            "date": .string(AdapterSupport.isoString(Date())),
            "source": .string("applescript"),
        ]
    }

    private func executeInTestMode(request: CommandRequest, environment: [String: String]) throws -> JSONValue {
        let store = try TestModeStore(environment: environment)
        let collection = "messages_conversations"
        switch (request.resource, request.action) {
        case ("conversations", "list"):
            return .array(try store.list(collection: collection).map(JSONValue.object))
        case ("conversations", "get"):
            let id = try AdapterSupport.require(request.arguments, "id")
            guard let object = try store.list(collection: collection).first(where: { $0["id"]?.stringValue == id }) else {
                throw CommanderError.notFound("Unknown conversation \(id)")
            }
            return .object(object)
        case ("messages", "send"), ("entries", "send"):
            let object: [String: JSONValue] = [
                "id": .string(AdapterSupport.newID(prefix: "conversation")),
                "conversation": .string(request.arguments["recipient"] ?? ""),
                "participants": .string(request.arguments["recipient"] ?? ""),
                "text": .string(request.arguments["text"] ?? ""),
                "date": .string(AdapterSupport.isoString(Date())),
                "source": .string("test_fixture"),
                "created_at": .string(AdapterSupport.isoString(Date())),
            ]
            _ = try store.upsert(collection: collection, object: object)
            return .object(object)
        default:
            throw CommanderError.invalidCommand("Unsupported messages test action")
        }
    }
}

public struct SafariAdapter: CommanderAdapter {
    public let descriptor = AdapterDescriptor(
        name: "safari",
        domain: .safari,
        version: "0.2.0",
        supportedCommands: [
            "safari tabs list",
            "safari tabs get",
            "safari tabs open",
            "safari tabs close",
            "safari bookmarks list",
            "safari bookmarks search",
            "safari bookmarks open",
        ],
        sources: [.applescript, .filesystem],
        riskLevel: "medium",
        isImplemented: true,
        requiresOSPermission: false,
        coverageLevel: "crud",
        supportsSearch: true,
        supportsDelete: true
    )

    public init() {}

    public func supports(resource: String, action: String) -> Bool {
        (resource == "tabs" && ["list", "get", "open", "close"].contains(action)) ||
        (resource == "bookmarks" && ["list", "search", "open"].contains(action))
    }

    public func execute(request: CommandRequest, environment: [String : String]) throws -> JSONValue {
        if ExecutionEnvironment.isTestMode(environment) {
            return try executeInTestMode(request: request, environment: environment)
        }
        try AdapterSupport.requireInstalledApp("Safari")

        switch (request.resource, request.action) {
        case ("tabs", "list"):
            return .array(try listTabs(window: request.arguments["window"].flatMap(Int.init)).map(JSONValue.object))
        case ("tabs", "get"):
            let id = try AdapterSupport.require(request.arguments, "id")
            guard let tab = try listTabs(window: request.arguments["window"].flatMap(Int.init)).first(where: { $0["id"]?.stringValue == id }) else {
                throw CommanderError.notFound("Unknown Safari tab \(id)")
            }
            return .object(tab)
        case ("tabs", "open"):
            let url = try AdapterSupport.require(request.arguments, "url")
            let escapedURL = AdapterSupport.escapeAppleScript(url)
            let script: String
            if let window = request.arguments["window"].flatMap(Int.init) {
                script = """
                tell application "Safari"
                    activate
                    tell window \(window)
                        set newTab to make new tab with properties {URL:"\(escapedURL)"}
                        set current tab to newTab
                    end tell
                end tell
                """
            } else {
                script = """
                tell application "Safari"
                    activate
                    open location "\(escapedURL)"
                end tell
                """
            }
            _ = try AdapterSupport.runAppleScript(appName: "Safari", script: script, timeout: 8)
            let window = request.arguments["window"].flatMap(Int.init)
            let openedTab = try findOpenedTab(url: url, window: window)
            return .object([
                "id": openedTab?["id"] ?? .null,
                "url": .string(url),
                "opened": .bool(true),
                "window": openedTab?["window"] ?? window.map(JSONValue.integer) ?? .null,
                "source": .string("applescript"),
            ])
        case ("tabs", "close"):
            let id = try AdapterSupport.require(request.arguments, "id")
            let parts = id.split(separator: ":").map(String.init)
            guard parts.count == 2, let windowIndex = Int(parts[0]), let tabIndex = Int(parts[1]) else {
                throw CommanderError.invalidArguments("Expected tab id as <window>:<tab>")
            }
            let script = """
            tell application "Safari"
                close (tab \(tabIndex) of window \(windowIndex))
            end tell
            """
            _ = try AdapterSupport.runAppleScript(appName: "Safari", script: script, timeout: 8)
            return .object(["id": .string(id), "closed": .bool(true), "source": .string("applescript")])
        case ("bookmarks", "list"):
            return .array(try listBookmarks().map(JSONValue.object))
        case ("bookmarks", "search"):
            let query = try AdapterSupport.require(request.arguments, "query")
            return .array(try listBookmarks().filter { AdapterSupport.matches(query, in: $0, fields: ["title", "url"]) }.map(JSONValue.object))
        case ("bookmarks", "open"):
            let url = try request.arguments["url"] ?? bookmarkURL(forID: request.arguments["id"])
            let script = """
            tell application "Safari"
                activate
                open location "\(AdapterSupport.escapeAppleScript(url))"
            end tell
            """
            _ = try AdapterSupport.runAppleScript(appName: "Safari", script: script, timeout: 8)
            return .object(["url": .string(url), "opened": .bool(true), "source": .string("applescript")])
        default:
            throw CommanderError.invalidCommand("Unsupported Safari action")
        }
    }

    private func listTabs(window: Int? = nil) throws -> [[String: JSONValue]] {
        let script = """
        on sanitizeText(value)
            if value is missing value then return ""
            set value to value as text
            set value to my replaceText(return, "\\n", value)
            set value to my replaceText(linefeed, "\\n", value)
            set value to my replaceText((ASCII character 31), " ", value)
            return value
        end sanitizeText
        on replaceText(findValue, replaceValue, subject)
            set AppleScript's text item delimiters to findValue
            set subjectItems to text items of subject
            set AppleScript's text item delimiters to replaceValue
            set subject to subjectItems as text
            set AppleScript's text item delimiters to ""
            return subject
        end replaceText
        tell application "Safari"
            set fieldSep to ASCII character 31
            set outputLines to ""
            repeat with windowIndex from 1 to count of windows
                set windowRef to window windowIndex
                set currentTabIndex to index of current tab of windowRef
                repeat with tabIndex from 1 to count of tabs of windowRef
                    set tabRef to tab tabIndex of windowRef
                    set outputLines to outputLines & (windowIndex as text) & ":" & (tabIndex as text) & fieldSep & my sanitizeText(name of tabRef) & fieldSep & my sanitizeText(URL of tabRef) & fieldSep & (windowIndex as text) & fieldSep & ((tabIndex is currentTabIndex) as text) & linefeed
                end repeat
            end repeat
            return outputLines
        end tell
        """
        return AdapterSupport.parseRows(try AdapterSupport.runAppleScript(appName: "Safari", script: script, timeout: 8), expectedFieldCount: 5).compactMap { row -> [String: JSONValue]? in
            let windowNumber = Int(row[3]) ?? 0
            guard window.map({ $0 == windowNumber }) ?? true else { return nil }
            return [
                "id": .string(row[0]),
                "title": .string(row[1]),
                "url": .string(row[2]),
                "window": .integer(windowNumber),
                "active": .bool(AdapterSupport.parseBool(row[4])),
                "source": .string("applescript"),
            ]
        }
    }

    private func findOpenedTab(url: String, window: Int?) throws -> [String: JSONValue]? {
        for _ in 0..<10 {
            if let tab = try listTabs(window: window).last(where: { $0["url"]?.stringValue == url }) {
                return tab
            }
            Thread.sleep(forTimeInterval: 0.2)
        }
        return nil
    }

    private func listBookmarks() throws -> [[String: JSONValue]] {
        let bookmarksURL = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Safari/Bookmarks.plist")
        guard FileManager.default.fileExists(atPath: bookmarksURL.path) else { return [] }
        let data = try Data(contentsOf: bookmarksURL)
        let plist = try PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any] ?? [:]
        return flattenBookmarks(node: plist)
    }

    private func flattenBookmarks(node: [String: Any], path: [String] = []) -> [[String: JSONValue]] {
        var results: [[String: JSONValue]] = []
        let title = (node["Title"] as? String) ?? ((node["URIDictionary"] as? [String: Any])?["title"] as? String)
        if let url = node["URLString"] as? String {
            let resolvedTitle = title ?? url
            let identifier = "\(path.joined(separator: "/"))|\(resolvedTitle)".trimmingCharacters(in: CharacterSet(charactersIn: "|"))
            results.append([
                "id": .string(identifier),
                "title": .string(resolvedTitle),
                "url": .string(url),
                "source": .string("filesystem"),
            ])
        }
        let nextPath = title.map { path + [$0] } ?? path
        for child in node["Children"] as? [[String: Any]] ?? [] {
            results.append(contentsOf: flattenBookmarks(node: child, path: nextPath))
        }
        return results
    }

    private func bookmarkURL(forID id: String?) throws -> String {
        let id = try AdapterSupport.require(["id": id ?? ""], "id")
        guard let match = try listBookmarks().first(where: { $0["id"]?.stringValue == id }),
              let url = match["url"]?.stringValue else {
            throw CommanderError.notFound("Unknown bookmark \(id)")
        }
        return url
    }

    private func executeInTestMode(request: CommandRequest, environment: [String: String]) throws -> JSONValue {
        let store = try TestModeStore(environment: environment)
        let tabsCollection = "safari_tabs"
        let bookmarksCollection = "safari_bookmarks"
        switch (request.resource, request.action) {
        case ("tabs", "list"):
            return .array(try seededTabs(store: store, collection: tabsCollection).map(JSONValue.object))
        case ("tabs", "get"):
            let id = try AdapterSupport.require(request.arguments, "id")
            guard let object = try seededTabs(store: store, collection: tabsCollection).first(where: { $0["id"]?.stringValue == id }) else {
                throw CommanderError.notFound("Unknown tab \(id)")
            }
            return .object(object)
        case ("tabs", "open"):
            var tabs = try seededTabs(store: store, collection: tabsCollection)
            let object: [String: JSONValue] = [
                "id": .string("1:\(tabs.count + 1)"),
                "title": .string(request.arguments["url"] ?? ""),
                "url": .string(try AdapterSupport.require(request.arguments, "url")),
                "window": .integer(1),
                "active": .bool(true),
                "source": .string("test_fixture"),
            ]
            tabs.append(object)
            try store.replace(collection: tabsCollection, with: tabs)
            return .object(object)
        case ("tabs", "close"):
            let id = try AdapterSupport.require(request.arguments, "id")
            try store.replace(collection: tabsCollection, with: try seededTabs(store: store, collection: tabsCollection).filter { $0["id"]?.stringValue != id })
            return .object(["id": .string(id), "closed": .bool(true), "source": .string("test_fixture")])
        case ("bookmarks", "list"):
            return .array(try seededBookmarks(store: store, collection: bookmarksCollection).map(JSONValue.object))
        case ("bookmarks", "search"):
            let query = try AdapterSupport.require(request.arguments, "query")
            return .array(try seededBookmarks(store: store, collection: bookmarksCollection).filter {
                AdapterSupport.matches(query, in: $0, fields: ["title", "url"])
            }.map(JSONValue.object))
        case ("bookmarks", "open"):
            let url = try request.arguments["url"] ?? {
                let id = try AdapterSupport.require(request.arguments, "id")
                guard let match = try seededBookmarks(store: store, collection: bookmarksCollection).first(where: { $0["id"]?.stringValue == id }) else {
                    throw CommanderError.notFound("Unknown bookmark \(id)")
                }
                return match["url"]?.stringValue ?? ""
            }()
            return .object(["url": .string(url), "opened": .bool(true), "source": .string("test_fixture")])
        default:
            throw CommanderError.invalidCommand("Unsupported Safari test action")
        }
    }

    private func seededTabs(store: TestModeStore, collection: String) throws -> [[String: JSONValue]] {
        let existing = try store.list(collection: collection)
        if !existing.isEmpty { return existing }
        let seeded: [[String: JSONValue]] = [
            ["id": .string("1:1"), "title": .string("Commander"), "url": .string("https://example.com/claw-host"), "window": .integer(1), "active": .bool(true), "source": .string("test_fixture")],
            ["id": .string("1:2"), "title": .string("Docs"), "url": .string("https://example.com/docs"), "window": .integer(1), "active": .bool(false), "source": .string("test_fixture")],
        ]
        try store.replace(collection: collection, with: seeded)
        return seeded
    }

    private func seededBookmarks(store: TestModeStore, collection: String) throws -> [[String: JSONValue]] {
        let existing = try store.list(collection: collection)
        if !existing.isEmpty { return existing }
        let seeded: [[String: JSONValue]] = [
            ["id": .string("favorites|Commander"), "title": .string("Commander"), "url": .string("https://example.com/claw-host"), "source": .string("test_fixture")],
            ["id": .string("favorites|Docs"), "title": .string("Docs"), "url": .string("https://example.com/docs"), "source": .string("test_fixture")],
        ]
        try store.replace(collection: collection, with: seeded)
        return seeded
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
