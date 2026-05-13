import Foundation
import CommanderCore

public struct FilesAdapter: CommanderAdapter {
    public let descriptor = AdapterDescriptor(
        name: "files",
        domain: .files,
        version: "0.1.0",
        supportedCommands: [
            "files entries list",
            "files entries get",
            "files entries search",
            "files entries create",
            "files entries update",
            "files entries move",
            "files entries delete",
        ],
        sources: [.filesystem],
        riskLevel: "medium",
        isImplemented: true,
        requiresOSPermission: false,
        coverageLevel: "crud",
        supportsSearch: true,
        supportsDelete: true
    )

    public init() {}

    public func supports(resource: String, action: String) -> Bool {
        resource == "entries" && ["list", "get", "search", "create", "update", "move", "delete"].contains(action)
    }

    public func execute(request: CommandRequest, environment: [String : String]) throws -> JSONValue {
        guard let path = request.arguments["path"], !path.isEmpty else {
            throw CommanderError.invalidArguments("Missing --path")
        }

        let url = URL(fileURLWithPath: path)
        switch request.action {
        case "list":
            return try listDirectory(at: url)
        case "get":
            return try readEntry(at: url)
        case "search":
            return try search(at: url, query: request.arguments["query"] ?? "", recursive: request.arguments["recursive"] == "true")
        case "create":
            return try create(at: url, type: request.arguments["type"] ?? "file", content: request.arguments["content"])
        case "update":
            return try update(at: url, content: request.arguments["content"])
        case "move":
            guard let destination = request.arguments["to"], !destination.isEmpty else {
                throw CommanderError.invalidArguments("Missing --to")
            }
            return try move(at: url, to: URL(fileURLWithPath: destination))
        case "delete":
            return try delete(at: url)
        default:
            throw CommanderError.invalidCommand("Unsupported files action \(request.action)")
        }
    }

    private func listDirectory(at url: URL) throws -> JSONValue {
        let fileManager = FileManager.default
        let entries = try fileManager.contentsOfDirectory(at: url, includingPropertiesForKeys: [.isDirectoryKey, .fileSizeKey], options: [.skipsHiddenFiles])
        let payload = try entries.map { entry -> JSONValue in
            let values = try entry.resourceValues(forKeys: [.isDirectoryKey, .fileSizeKey])
            return .object([
                "name": .string(entry.lastPathComponent),
                "path": .string(entry.path),
                "is_directory": .bool(values.isDirectory ?? false),
                "size": .integer(values.fileSize ?? 0),
            ])
        }
        return .array(payload)
    }

    private func readEntry(at url: URL) throws -> JSONValue {
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw CommanderError.notFound("No entry at \(url.path)")
        }
        let values = try url.resourceValues(forKeys: [.isDirectoryKey, .fileSizeKey])
        if values.isDirectory == true {
            return try listDirectory(at: url)
        }

        let content = try String(contentsOf: url, encoding: .utf8)
        return .object([
            "path": .string(url.path),
            "content": .string(content),
            "size": .integer(values.fileSize ?? content.utf8.count),
        ])
    }

    private func search(at url: URL, query: String, recursive: Bool) throws -> JSONValue {
        guard !query.isEmpty else {
            throw CommanderError.invalidArguments("Missing --query")
        }

        let fileManager = FileManager.default
        let enumerator: FileManager.DirectoryEnumerator?

        if recursive {
            enumerator = fileManager.enumerator(at: url, includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsHiddenFiles])
        } else {
            enumerator = fileManager.enumerator(at: url, includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsHiddenFiles, .skipsSubdirectoryDescendants])
        }

        var matches: [JSONValue] = []
        while let entry = enumerator?.nextObject() as? URL {
            if entry.lastPathComponent.localizedCaseInsensitiveContains(query) {
                matches.append(.object([
                    "name": .string(entry.lastPathComponent),
                    "path": .string(entry.path),
                ]))
            }
        }
        return .array(matches)
    }

    private func create(at url: URL, type: String, content: String?) throws -> JSONValue {
        let fileManager = FileManager.default
        switch type {
        case "directory":
            try fileManager.createDirectory(at: url, withIntermediateDirectories: true)
        default:
            try fileManager.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            let payload = Data((content ?? "").utf8)
            fileManager.createFile(atPath: url.path, contents: payload)
        }

        return .object([
            "path": .string(url.path),
            "created": .bool(true),
            "type": .string(type),
        ])
    }

    private func update(at url: URL, content: String?) throws -> JSONValue {
        guard let content else {
            throw CommanderError.invalidArguments("Missing --content")
        }
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw CommanderError.notFound("No entry at \(url.path)")
        }
        try content.write(to: url, atomically: true, encoding: .utf8)
        return .object([
            "path": .string(url.path),
            "updated": .bool(true),
        ])
    }

    private func move(at url: URL, to destination: URL) throws -> JSONValue {
        try FileManager.default.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
        try FileManager.default.moveItem(at: url, to: destination)
        return .object([
            "from": .string(url.path),
            "to": .string(destination.path),
            "moved": .bool(true),
        ])
    }

    private func delete(at url: URL) throws -> JSONValue {
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw CommanderError.notFound("No entry at \(url.path)")
        }
        try FileManager.default.removeItem(at: url)
        return .object([
            "path": .string(url.path),
            "deleted": .bool(true),
        ])
    }
}
