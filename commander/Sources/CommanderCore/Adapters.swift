import Foundation

public protocol CommanderAdapter: Sendable {
    var descriptor: AdapterDescriptor { get }
    func supports(resource: String, action: String) -> Bool
    func execute(request: CommandRequest, environment: [String: String]) throws -> JSONValue
}

public struct AdapterRegistry: Sendable {
    public var adapters: [Domain: any CommanderAdapter]

    public init(adapters: [Domain: any CommanderAdapter]) {
        self.adapters = adapters
    }

    public func descriptorList() -> [AdapterDescriptor] {
        adapters.values.map(\.descriptor).sorted { $0.name < $1.name }
    }

    public func adapter(for domain: Domain) -> (any CommanderAdapter)? {
        adapters[domain]
    }
}
