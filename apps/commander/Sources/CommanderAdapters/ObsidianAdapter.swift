import Foundation
import CommanderCore

public struct ObsidianAdapter: CommanderAdapter {
    public let descriptor = AdapterDescriptor(
        name: "obsidian",
        domain: .obsidian,
        version: "0.1.0",
        supportedCommands: [
            "obsidian notes list",
            "obsidian notes get",
            "obsidian notes search",
            "obsidian notes create",
            "obsidian notes update",
            "obsidian notes delete",
        ],
        sources: [.filesystem, .localCLI],
        riskLevel: "medium",
        isImplemented: true,
        requiresOSPermission: false,
        coverageLevel: "crud",
        supportsSearch: true,
        supportsDelete: true
    )

    public init() {}

    public func supports(resource: String, action: String) -> Bool {
        resource == "notes" && ["list", "get", "search", "create", "update", "delete"].contains(action)
    }

    public func execute(request: CommandRequest, environment: [String : String]) throws -> JSONValue {
        let vaultPath = request.arguments["vault"] ?? environment["COMMANDER_OBSIDIAN_VAULT"]
        guard let vaultPath, !vaultPath.isEmpty else {
            throw CommanderError.invalidArguments("Missing --vault or COMMANDER_OBSIDIAN_VAULT")
        }

        let vaultURL = URL(fileURLWithPath: vaultPath, isDirectory: true)
        try FileManager.default.createDirectory(at: vaultURL, withIntermediateDirectories: true)

        switch request.action {
        case "list":
            let folder = request.arguments["folder"] ?? ""
            return try listNotes(in: vaultURL.appendingPathComponent(folder))
        case "get":
            let url = try noteURL(in: vaultURL, path: request.arguments["path"])
            let content = try String(contentsOf: url, encoding: .utf8)
            return .object([
                "path": .string(url.path.replacingOccurrences(of: vaultURL.path + "/", with: "")),
                "content": .string(content),
            ])
        case "search":
            let folder = request.arguments["folder"] ?? ""
            let query = request.arguments["query"] ?? ""
            guard !query.isEmpty else { throw CommanderError.invalidArguments("Missing --query") }
            return try searchNotes(in: vaultURL.appendingPathComponent(folder), query: query)
        case "create":
            let url = try noteURL(in: vaultURL, path: request.arguments["path"])
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try (request.arguments["content"] ?? "").write(to: url, atomically: true, encoding: .utf8)
            return .object(["path": .string(request.arguments["path"] ?? ""), "created": .bool(true)])
        case "update":
            let url = try noteURL(in: vaultURL, path: request.arguments["path"])
            guard let content = request.arguments["content"] else {
                throw CommanderError.invalidArguments("Missing --content")
            }
            try content.write(to: url, atomically: true, encoding: .utf8)
            return .object(["path": .string(request.arguments["path"] ?? ""), "updated": .bool(true)])
        case "delete":
            let url = try noteURL(in: vaultURL, path: request.arguments["path"])
            try FileManager.default.removeItem(at: url)
            return .object(["path": .string(request.arguments["path"] ?? ""), "deleted": .bool(true)])
        default:
            throw CommanderError.invalidCommand("Unsupported obsidian action \(request.action)")
        }
    }

    private func listNotes(in folderURL: URL) throws -> JSONValue {
        guard FileManager.default.fileExists(atPath: folderURL.path) else {
            return .array([])
        }
        let urls = try FileManager.default.contentsOfDirectory(at: folderURL, includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsHiddenFiles])
        return .array(urls.compactMap { url in
            guard url.pathExtension.lowercased() == "md" else { return nil }
            return .object(["path": .string(url.lastPathComponent)])
        })
    }

    private func searchNotes(in folderURL: URL, query: String) throws -> JSONValue {
        guard let enumerator = FileManager.default.enumerator(at: folderURL, includingPropertiesForKeys: [.isDirectoryKey]) else {
            return .array([])
        }

        var matches: [JSONValue] = []
        while let url = enumerator.nextObject() as? URL {
            guard url.pathExtension.lowercased() == "md" else { continue }
            let content = try String(contentsOf: url, encoding: .utf8)
            if url.lastPathComponent.localizedCaseInsensitiveContains(query) || content.localizedCaseInsensitiveContains(query) {
                matches.append(.object(["path": .string(url.path)]))
            }
        }
        return .array(matches)
    }

    private func noteURL(in vaultURL: URL, path: String?) throws -> URL {
        guard var path, !path.isEmpty else {
            throw CommanderError.invalidArguments("Missing --path")
        }
        if !path.hasSuffix(".md") {
            path += ".md"
        }
        return vaultURL.appendingPathComponent(path)
    }
}
