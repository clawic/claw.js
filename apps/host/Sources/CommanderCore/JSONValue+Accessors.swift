import Foundation

public extension JSONValue {
    var stringValue: String? {
        if case .string(let value) = self { return value }
        return nil
    }

    var boolValue: Bool? {
        if case .bool(let value) = self { return value }
        return nil
    }

    var intValue: Int? {
        switch self {
        case .integer(let value):
            return value
        case .number(let value):
            return Int(value)
        default:
            return nil
        }
    }

    var int32Value: Int32? {
        intValue.map(Int32.init)
    }

    var objectValue: [String: JSONValue]? {
        if case .object(let object) = self { return object }
        return nil
    }

    var arrayValue: [JSONValue]? {
        if case .array(let array) = self { return array }
        return nil
    }

    var stringArrayValue: [String] {
        arrayValue?.compactMap(\.stringValue) ?? []
    }

    /// String projection that also coerces scalars (numbers/booleans) so JSON
    /// arguments delivered as `5` or `true` survive a `[String: String]`
    /// argument map instead of being silently dropped.
    var coercedStringValue: String? {
        switch self {
        case .string(let value):
            return value
        case .integer(let value):
            return String(value)
        case .number(let value):
            return value == value.rounded() ? String(Int(value)) : String(value)
        case .bool(let value):
            return value ? "true" : "false"
        case .object, .array, .null:
            return nil
        }
    }
}
