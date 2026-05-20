import Foundation

@objc public protocol AppRuntimeXPCProtocol {
    func sendCommand(_ requestBytes: Data, withReply reply: @escaping @Sendable (Data?, String?) -> Void)
}

public final class AppRuntimeHost: NSObject, @unchecked Sendable {
    private let environment: [String: String]
    private let service: CommandService
    private let statusStore: DaemonStatusStore
    private let bundlePath: String
    private var listener: NSXPCListener?
    private var delegate: AppRuntimeListenerDelegate?

    public init(environment: [String: String] = ProcessInfo.processInfo.environment, registry: AdapterRegistry) throws {
        var resolvedEnvironment = environment
        resolvedEnvironment["CLAW_HOST_RUNTIME_TRANSPORT"] = RuntimeInstaller.appOwnedRuntimeTransport
        if let bundlePath = RuntimeInstaller.appBundlePath(environment: resolvedEnvironment) {
            resolvedEnvironment["CLAW_HOST_BUNDLE_PATH"] = bundlePath
            self.bundlePath = bundlePath
        } else {
            self.bundlePath = ""
        }
        self.environment = resolvedEnvironment
        self.service = try CommandService(environment: resolvedEnvironment, registry: registry)
        self.statusStore = try DaemonStatusStore(environment: resolvedEnvironment)
        super.init()
    }

    public func start(stopHandler: @escaping @Sendable () -> Void) throws {
        if listener != nil {
            return
        }

        let xpcService = AppRuntimeXPCService(service: service, stopHost: stopHandler)
        let listener = NSXPCListener(machServiceName: RuntimeInstaller.appRuntimeMachServiceName(environment: environment))
        let delegate = AppRuntimeListenerDelegate(exportedObject: xpcService)
        listener.delegate = delegate
        listener.resume()

        try statusStore.write(
            DaemonHealth(
                running: true,
                pid: getpid(),
                socketPath: RuntimeInstaller.appRuntimeMachServiceName(environment: environment),
                startedAt: Timestamp.now(),
                runtimeTransport: RuntimeInstaller.appOwnedRuntimeTransport,
                hostBundlePath: bundlePath.isEmpty ? nil : bundlePath,
                hostAppRunning: true
            )
        )

        self.listener = listener
        self.delegate = delegate
    }

    public func stop() {
        listener?.invalidate()
        listener = nil
        delegate = nil
        try? statusStore.clear()
    }
}

public struct AppRuntimeClient: Sendable {
    private let machServiceName: String

    public init(environment: [String: String] = ProcessInfo.processInfo.environment) throws {
        self.machServiceName = RuntimeInstaller.appRuntimeMachServiceName(environment: environment)
    }

    public func send(_ request: CommandRequest, timeout: TimeInterval = 10) throws -> CommandResponse {
        let connection = NSXPCConnection(machServiceName: machServiceName, options: [])
        connection.remoteObjectInterface = NSXPCInterface(with: AppRuntimeXPCProtocol.self)
        connection.resume()
        defer { connection.invalidate() }

        let payload = try JSONEncoder().encode(request)
        let semaphore = DispatchSemaphore(value: 0)
        final class Box: @unchecked Sendable {
            var data: Data?
            var error: Error?
            var message: String?
        }
        let box = Box()

        guard let proxy = connection.remoteObjectProxyWithErrorHandler({ error in
            box.error = error
            semaphore.signal()
        }) as? AppRuntimeXPCProtocol else {
            throw CommanderError.transport("Unable to create app runtime proxy")
        }

        proxy.sendCommand(payload) { data, message in
            box.data = data
            box.message = message
            semaphore.signal()
        }

        if semaphore.wait(timeout: .now() + timeout) == .timedOut {
            throw CommanderError.transport("App runtime request timed out")
        }

        if let error = box.error {
            throw CommanderError.transport(error.localizedDescription)
        }
        if let message = box.message {
            throw CommanderError.transport(message)
        }
        guard let responseData = box.data else {
            throw CommanderError.transport("App runtime returned no data")
        }
        return try CLIJSON.decodeResponse(responseData)
    }
}

final class AppRuntimeXPCService: NSObject, AppRuntimeXPCProtocol {
    private let service: CommandService
    private let stopHost: @Sendable () -> Void

    init(service: CommandService, stopHost: @escaping @Sendable () -> Void) {
        self.service = service
        self.stopHost = stopHost
    }

    func sendCommand(_ requestBytes: Data, withReply reply: @escaping @Sendable (Data?, String?) -> Void) {
        let service = self.service
        let stopHost = self.stopHost
        Task.detached {
            do {
                let request = try JSONDecoder().decode(CommandRequest.self, from: requestBytes)
                let response = await service.execute(request)
                let responseData = try JSONEncoder().encode(response)
                reply(responseData, nil)
                if request.domain == .system, request.resource == "daemon", request.action == "stop" {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                        stopHost()
                    }
                }
            } catch {
                reply(nil, error.localizedDescription)
            }
        }
    }
}

final class AppRuntimeListenerDelegate: NSObject, NSXPCListenerDelegate {
    private let exportedObject: AppRuntimeXPCService

    init(exportedObject: AppRuntimeXPCService) {
        self.exportedObject = exportedObject
    }

    func listener(_ listener: NSXPCListener, shouldAcceptNewConnection newConnection: NSXPCConnection) -> Bool {
        newConnection.exportedInterface = NSXPCInterface(with: AppRuntimeXPCProtocol.self)
        newConnection.exportedObject = exportedObject
        newConnection.resume()
        return true
    }
}
