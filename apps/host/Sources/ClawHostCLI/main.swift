import Foundation
import ClawHostAdapters
import ClawHostKit

struct ParsedCommand {
    var domain: Domain
    var resource: String
    var action: String
    var arguments: [String: String]
}

@main
struct CommanderCLI {
    static func main() async {
        do {
            let parsed = try parse(arguments: Array(CommandLine.arguments.dropFirst()))
            let environment = ProcessInfo.processInfo.environment

            if parsed.domain == .system && parsed.resource == "daemon" && parsed.action == "start" {
                try DaemonLauncher.start(environment: environment)
                let available = DaemonLauncher.waitUntilAvailable(environment: environment)
                try printJSON(CommandResponse(
                    ok: available,
                    data: .object(["started": .bool(available)]),
                    error: available ? nil : CommanderError.transport("Daemon did not start in time").payload,
                    meta: .init(adapter: "daemon", source: .filesystem, riskLevel: "write", validationMode: .hostReal, durationMS: 0)
                ))
                return
            }

            if parsed.domain == .system && parsed.resource == "daemon" && parsed.action == "restart" {
                try DaemonLauncher.restart(environment: environment)
                let available = DaemonLauncher.waitUntilAvailable(environment: environment)
                try printJSON(CommandResponse(
                    ok: available,
                    data: .object(["restarted": .bool(available)]),
                    error: available ? nil : CommanderError.transport("Daemon did not restart in time").payload,
                    meta: .init(adapter: "daemon", source: .filesystem, riskLevel: "write", validationMode: .hostReal, durationMS: 0)
                ))
                return
            }

            if parsed.domain == .system && parsed.resource == "daemon" && parsed.action == "stop" {
                try DaemonLauncher.stop(environment: environment)
                try printJSON(CommandResponse(
                    ok: true,
                    data: .object(["stopped": .bool(true)]),
                    error: nil,
                    meta: .init(adapter: "daemon", source: .filesystem, riskLevel: "destructive", validationMode: .hostReal, durationMS: 0)
                ))
                return
            }

            if parsed.domain == .system && parsed.resource == "mac" {
                let response = try await MacControlHostBridge.responseAsync(
                    resource: parsed.resource,
                    action: parsed.action,
                    arguments: parsed.arguments,
                    environment: environment
                )
                try printJSON(response)
                exit(response.ok ? 0 : 1)
            }

            if parsed.domain == .system && ["telemetry", "metrics", "widgets", "rules", "history"].contains(parsed.resource) {
                var arguments = parsed.arguments
                if environment["CLAW_HOST_SAFE"] == "1" {
                    arguments["__validation_mode"] = ValidationMode.hostIsolated.rawValue
                } else if let validationMode = environment["CLAW_HOST_VALIDATION_MODE"], !validationMode.isEmpty {
                    arguments["__validation_mode"] = validationMode
                }
                let service = try CommandService(environment: environment, registry: DefaultRegistry.make())
                let response = await service.execute(CommandRequest(
                    domain: parsed.domain,
                    resource: parsed.resource,
                    action: parsed.action,
                    arguments: arguments,
                    clientContext: .current()
                ))
                try printJSON(response)
                exit(response.ok ? 0 : 1)
            }

            let response = try await route(parsed: parsed, environment: environment)
            try printJSON(response)
            exit(response.ok ? 0 : 1)
        } catch let error as CommanderError {
            try? printJSON(CommandResponse(
                ok: false,
                data: nil,
                error: error.payload,
                meta: .init(adapter: "claw-host", source: .filesystem, riskLevel: "read", validationMode: .hostReal, durationMS: 0)
            ))
            exit(1)
        } catch {
            try? printJSON(CommandResponse(
                ok: false,
                data: nil,
                error: CommanderError.internalFailure(error.localizedDescription).payload,
                meta: .init(adapter: "claw-host", source: .filesystem, riskLevel: "read", validationMode: .hostReal, durationMS: 0)
            ))
            exit(1)
        }
    }

    static func route(parsed: ParsedCommand, environment: [String: String]) async throws -> CommandResponse {
        var arguments = parsed.arguments
        if environment["CLAW_HOST_SAFE"] == "1" {
            arguments["__validation_mode"] = ValidationMode.hostIsolated.rawValue
        } else if let validationMode = environment["CLAW_HOST_VALIDATION_MODE"], !validationMode.isEmpty {
            arguments["__validation_mode"] = validationMode
        }
        let request = CommandRequest(
            domain: parsed.domain,
            resource: parsed.resource,
            action: parsed.action,
            arguments: arguments,
            clientContext: .current()
        )

        do {
            let client = try DaemonClient(environment: environment)
            return try client.send(request)
        } catch {
            try DaemonLauncher.start(environment: environment)
            guard DaemonLauncher.waitUntilAvailable(environment: environment) else {
                throw CommanderError.transport("Unable to reach daemon")
            }
            let client = try DaemonClient(environment: environment)
            return try client.send(request)
        }
    }

    static func parse(arguments: [String]) throws -> ParsedCommand {
        guard arguments.count >= 3 else {
            throw CommanderError.invalidCommand("Usage: claw-host <domain> <resource> <action> [--key value]")
        }

        guard let domain = Domain(rawValue: arguments[0]) else {
            throw CommanderError.invalidCommand("Unknown domain \(arguments[0])")
        }

        let resource = arguments[1]
        let action = arguments[2]
        var options: [String: String] = [:]
        var index = 3

        while index < arguments.count {
            let token = arguments[index]
            guard token.hasPrefix("--") else {
                throw CommanderError.invalidArguments("Unexpected argument \(token)")
            }
            let key = String(token.dropFirst(2))
            if key == "json" {
                options[key] = "true"
                index += 1
                continue
            }

            let nextIndex = index + 1
            guard nextIndex < arguments.count else {
                throw CommanderError.invalidArguments("Missing value for \(token)")
            }
            options[key] = arguments[nextIndex]
            index += 2
        }

        return ParsedCommand(domain: domain, resource: resource, action: action, arguments: options)
    }

    static func printJSON(_ response: CommandResponse) throws {
        let data = try CLIJSON.encoder.encode(response)
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data([0x0A]))
    }
}
