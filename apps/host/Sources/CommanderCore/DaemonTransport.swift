import Foundation

public struct DaemonClient: Sendable {
    private let transport: RuntimeTransport

    public init(environment: [String: String] = ProcessInfo.processInfo.environment) throws {
        let preferredTransport = RuntimeInstaller.preferredRuntimeTransport(environment: environment)
        switch preferredTransport {
        case RuntimeInstaller.appOwnedRuntimeTransport:
            self.transport = .app(try AppRuntimeClient(environment: environment))
        default:
            self.transport = .socket(try SocketDaemonClient(environment: environment))
        }
    }

    public func send(_ request: CommandRequest) throws -> CommandResponse {
        switch transport {
        case .app(let client):
            return try client.send(request)
        case .socket(let client):
            return try client.send(request)
        }
    }
}

private enum RuntimeTransport: Sendable {
    case app(AppRuntimeClient)
    case socket(SocketDaemonClient)
}

private struct SocketDaemonClient: Sendable {
    private let socketPath: String

    init(environment: [String: String] = ProcessInfo.processInfo.environment) throws {
        self.socketPath = try StatePaths.daemonSocketFile(environment: environment).path
    }

    func send(_ request: CommandRequest) throws -> CommandResponse {
        let socketFD = socket(AF_UNIX, SOCK_STREAM, 0)
        guard socketFD >= 0 else {
            throw CommanderError.transport("Unable to create client socket")
        }

        defer { close(socketFD) }

        var address = sockaddr_un()
        address.sun_family = sa_family_t(AF_UNIX)
        let maxPathLength = MemoryLayout.size(ofValue: address.sun_path)
        let pathBytes = Array(socketPath.utf8)
        guard pathBytes.count < maxPathLength else {
            throw CommanderError.transport("Socket path too long")
        }

        _ = withUnsafeMutablePointer(to: &address.sun_path.0) { pointer in
            pathBytes.enumerated().forEach { index, byte in
                pointer.advanced(by: index).pointee = Int8(bitPattern: byte)
            }
            pointer.advanced(by: pathBytes.count).pointee = 0
        }

        let socketLength = socklen_t(MemoryLayout<sa_family_t>.size + pathBytes.count + 1)
        let connectResult = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.connect(socketFD, $0, socketLength)
            }
        }

        guard connectResult == 0 else {
            throw CommanderError.transport("Unable to connect to daemon at \(socketPath)")
        }

        let encoder = JSONEncoder()
        let payload = try encoder.encode(request) + Data([0x0A])
        try SocketIO.writeAll(data: payload, to: socketFD)

        shutdown(socketFD, SHUT_WR)

        var responseData = Data()
        var localBuffer = [UInt8](repeating: 0, count: 4096)

        while true {
            let readCount = Darwin.read(socketFD, &localBuffer, localBuffer.count)
            if readCount == 0 { break }
            if readCount < 0 {
                throw CommanderError.transport("Unable to read daemon response")
            }
            responseData.append(localBuffer, count: readCount)
        }

        return try CLIJSON.decodeResponse(responseData)
    }
}

public final class DaemonSocketServer: @unchecked Sendable {
    private let socketPath: String
    private let service: CommandService
    private var serverFD: Int32 = -1
    private var running = true

    public init(service: CommandService, environment: [String: String] = ProcessInfo.processInfo.environment) throws {
        self.service = service
        self.socketPath = try StatePaths.daemonSocketFile(environment: environment).path
    }

    public func serve() throws {
        unlink(socketPath)
        serverFD = socket(AF_UNIX, SOCK_STREAM, 0)
        guard serverFD >= 0 else {
            throw CommanderError.transport("Unable to create daemon socket")
        }

        var address = sockaddr_un()
        address.sun_family = sa_family_t(AF_UNIX)
        let pathBytes = Array(socketPath.utf8)
        let maxPathLength = MemoryLayout.size(ofValue: address.sun_path)
        guard pathBytes.count < maxPathLength else {
            throw CommanderError.transport("Socket path too long")
        }

        _ = withUnsafeMutablePointer(to: &address.sun_path.0) { pointer in
            pathBytes.enumerated().forEach { index, byte in
                pointer.advanced(by: index).pointee = Int8(bitPattern: byte)
            }
            pointer.advanced(by: pathBytes.count).pointee = 0
        }

        let addressLength = socklen_t(MemoryLayout<sa_family_t>.size + pathBytes.count + 1)
        let bindResult = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.bind(serverFD, $0, addressLength)
            }
        }

        guard bindResult == 0 else {
            throw CommanderError.transport("Unable to bind daemon socket at \(socketPath)")
        }

        guard listen(serverFD, 16) == 0 else {
            throw CommanderError.transport("Unable to listen on daemon socket")
        }

        while running {
            let clientFD = accept(serverFD, nil, nil)
            if clientFD < 0 {
                if !running { break }
                continue
            }

            Task.detached { [self] in
                await handleClient(clientFD: clientFD)
            }
        }

        close(serverFD)
        unlink(socketPath)
    }

    public func stop() {
        running = false
        if serverFD >= 0 {
            close(serverFD)
            unlink(socketPath)
        }
    }

    private func handleClient(clientFD: Int32) async {
        defer { close(clientFD) }
        var buffer = [UInt8](repeating: 0, count: 4096)
        var payload = Data()

        while true {
            let readCount = Darwin.read(clientFD, &buffer, buffer.count)
            if readCount == 0 { break }
            if readCount < 0 { return }
            payload.append(buffer, count: readCount)
        }

        guard let newlineIndex = payload.firstIndex(of: 0x0A) else { return }
        let requestBytes = payload.prefix(upTo: newlineIndex)
        let decoder = JSONDecoder()
        let encoder = JSONEncoder()

        do {
            let request = try decoder.decode(CommandRequest.self, from: requestBytes)
            let response = await service.execute(request)
            let data = try encoder.encode(response)
            try SocketIO.writeAll(data: data, to: clientFD)
            if request.domain == .system, request.resource == "daemon", request.action == "stop" {
                stop()
            }
        } catch {
            let response = CommandResponse(
                ok: false,
                data: nil,
                error: CommanderError.internalFailure(error.localizedDescription).payload,
                meta: CommandMeta(adapter: "daemon", source: .filesystem, riskLevel: "read", validationMode: .hostReal, durationMS: 0)
            )
            if let data = try? encoder.encode(response) {
                try? SocketIO.writeAll(data: data, to: clientFD)
            }
        }
    }
}

public enum CLIJSON {
    public static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }()

    public static func decodeResponse(_ data: Data) throws -> CommandResponse {
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw CommanderError.transport("Unable to decode response payload")
        }

        let ok = root["ok"] as? Bool ?? false
        let dataValue = JSONValue.from(any: root["data"])
        let errorPayload: CommandErrorPayload?
        if let errorObject = root["error"] as? [String: Any] {
            errorPayload = CommandErrorPayload(
                code: errorObject["code"] as? String ?? "unknown_error",
                message: errorObject["message"] as? String ?? "",
                details: errorObject.keys.contains("details") ? JSONValue.from(any: errorObject["details"]) : nil
            )
        } else {
            errorPayload = nil
        }

        guard let metaObject = root["meta"] as? [String: Any] else {
            throw CommanderError.transport("Response meta is missing")
        }
        let meta = CommandMeta(
            adapter: metaObject["adapter"] as? String ?? "unknown",
            source: (metaObject["source"] as? String).flatMap(AdapterSource.init(rawValue:)) ?? .filesystem,
            riskLevel: metaObject["risk_level"] as? String ?? metaObject["riskLevel"] as? String ?? "read",
            validationMode: (metaObject["validation_mode"] as? String ?? metaObject["validationMode"] as? String).flatMap(ValidationMode.init(rawValue:)) ?? .hostReal,
            durationMS: metaObject["duration_ms"] as? Int ?? metaObject["durationMS"] as? Int ?? 0
        )

        return CommandResponse(
            ok: ok,
            data: root.keys.contains("data") ? dataValue : nil,
            error: errorPayload,
            meta: meta
        )
    }
}

private enum SocketIO {
    static func writeAll(data: Data, to fd: Int32) throws {
        try data.withUnsafeBytes { rawBuffer in
            guard let baseAddress = rawBuffer.baseAddress else { return }
            var totalWritten = 0
            while totalWritten < rawBuffer.count {
                let bytesWritten = Darwin.write(fd, baseAddress.advanced(by: totalWritten), rawBuffer.count - totalWritten)
                if bytesWritten < 0 {
                    throw CommanderError.transport("Unable to write socket payload")
                }
                totalWritten += bytesWritten
            }
        }
    }
}
