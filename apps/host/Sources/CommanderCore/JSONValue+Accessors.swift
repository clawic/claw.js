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
}
