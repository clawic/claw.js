import AppKit
import ApplicationServices
import CoreGraphics
import Foundation

/// Accessibility-driven Computer Use engine for the signed host.
///
/// Unlike a coordinate/pointer-based controller, this engine targets an app by
/// name (or bundle id) and acts on individual Accessibility elements identified
/// by a deterministic `element_index`. The system pointer never moves and the
/// target app does not need to be frontmost: clicks go through
/// `AXUIElementPerformAction`, while typing/keys/scroll are posted to the
/// target process with `CGEvent.postToPid`. This matches the Computer Use
/// contract the agent surface exposes (`get_app_state`, `click`, `type_text`,
/// `press_key`, `scroll`, `set_value`, `perform_action`, `list_mac_apps`).
public enum MacAXEngine {
    /// Default ceiling on how deep the element walk descends. Keeps
    /// `get_app_state` payloads bounded for very large window trees.
    public static let defaultMaxDepth = 16
    /// Default ceiling on how many elements `get_app_state` returns before it
    /// reports the tree as truncated.
    public static let defaultMaxElements = 400
    /// Per-element value/title clamp so a single text field cannot blow up the
    /// serialized state.
    public static let valueClamp = 240

    // MARK: - Serializable shapes

    public struct Element: Codable, Equatable, Sendable {
        public var index: Int
        public var role: String
        public var subrole: String?
        public var title: String?
        public var value: String?
        public var label: String?
        public var roleDescription: String?
        public var help: String?
        public var enabled: Bool?
        public var focused: Bool?
        public var actions: [String]
        public var frame: [Double]?
        public var depth: Int
    }

    public struct AppState: Codable, Equatable, Sendable {
        public var app: String
        public var bundleId: String?
        public var pid: Int32
        public var frontmost: Bool
        public var windowTitles: [String]
        public var elementCount: Int
        public var truncated: Bool
        public var elements: [Element]
    }

    public struct RunningApp: Codable, Equatable, Sendable {
        public var name: String
        public var bundleId: String?
        public var pid: Int32
        public var active: Bool
        public var hidden: Bool
    }

    // MARK: - Public capability entry points

    /// Snapshot of every running, regular (non-background) application.
    public static func listApps() -> [RunningApp] {
        NSWorkspace.shared.runningApplications
            .filter { $0.activationPolicy == .regular }
            .compactMap { app in
                guard let name = app.localizedName, !name.isEmpty else { return nil }
                return RunningApp(
                    name: name,
                    bundleId: app.bundleIdentifier,
                    pid: app.processIdentifier,
                    active: app.isActive,
                    hidden: app.isHidden
                )
            }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    /// Read the Accessibility tree of `appIdentifier` into an indexed element
    /// list. The indices returned here are the ones every other action accepts.
    public static func appState(
        appIdentifier: String,
        maxDepth: Int = defaultMaxDepth,
        maxElements: Int = defaultMaxElements
    ) throws -> AppState {
        try requireTrusted()
        let app = try resolveApp(appIdentifier)
        let pid = app.processIdentifier
        let root = AXUIElementCreateApplication(pid)
        let depthCap = max(1, min(maxDepth, 40))
        let elementCap = max(1, min(maxElements, 2000))
        let collected = walk(root, maxDepth: depthCap, maxElements: elementCap)
        let elements = collected.enumerated().map { offset, node in
            serialize(node.element, index: offset, depth: node.depth)
        }
        return AppState(
            app: app.localizedName ?? appIdentifier,
            bundleId: app.bundleIdentifier,
            pid: pid,
            frontmost: app.isActive,
            windowTitles: windowTitles(of: root),
            elementCount: elements.count,
            truncated: collected.count >= elementCap,
            elements: elements
        )
    }

    /// Press the element at `elementIndex` via its Accessibility press action.
    public static func click(appIdentifier: String, elementIndex: Int) throws {
        try requireTrusted()
        let element = try resolveElement(appIdentifier: appIdentifier, index: elementIndex)
        let actions = actionNames(element)
        let preferred = [kAXPressAction as String, "AXOpen", kAXConfirmAction as String, kAXPickAction as String]
        let action = preferred.first(where: { actions.contains($0) }) ?? actions.first
        guard let action else {
            throw MacAXError.actionFailed("element \(elementIndex) exposes no actionable Accessibility action")
        }
        let err = AXUIElementPerformAction(element, action as CFString)
        guard err == .success else {
            throw MacAXError.actionFailed("AX action \(action) failed (\(err.rawValue)) on element \(elementIndex)")
        }
    }

    /// Perform an explicit Accessibility action (e.g. `AXShowMenu`) on an element.
    public static func performAction(appIdentifier: String, elementIndex: Int, action: String) throws {
        try requireTrusted()
        let trimmed = action.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw MacAXError.invalidArgument("action must not be empty") }
        let element = try resolveElement(appIdentifier: appIdentifier, index: elementIndex)
        let err = AXUIElementPerformAction(element, trimmed as CFString)
        guard err == .success else {
            throw MacAXError.actionFailed("AX action \(trimmed) failed (\(err.rawValue)) on element \(elementIndex)")
        }
    }

    /// Set the value attribute of the element at `elementIndex`.
    public static func setValue(appIdentifier: String, elementIndex: Int, value: String) throws {
        try requireTrusted()
        let element = try resolveElement(appIdentifier: appIdentifier, index: elementIndex)
        let err = AXUIElementSetAttributeValue(element, kAXValueAttribute as CFString, value as CFTypeRef)
        guard err == .success else {
            throw MacAXError.actionFailed("could not set value on element \(elementIndex) (\(err.rawValue))")
        }
    }

    /// Type text into the target app at its current focus, posting keyboard
    /// events directly to the process so the global pointer/focus is untouched.
    public static func typeText(appIdentifier: String, text: String) throws {
        try requireTrusted()
        guard !text.isEmpty else { throw MacAXError.invalidArgument("text must not be empty") }
        let app = try resolveApp(appIdentifier)
        guard let source = CGEventSource(stateID: .hidSystemState) else {
            throw MacAXError.actionFailed("could not create a keyboard event source")
        }
        let pid = app.processIdentifier
        for character in text {
            var units = Array(String(character).utf16)
            guard
                let down = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: true),
                let up = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: false)
            else {
                throw MacAXError.actionFailed("could not create keyboard event")
            }
            down.keyboardSetUnicodeString(stringLength: units.count, unicodeString: &units)
            up.keyboardSetUnicodeString(stringLength: units.count, unicodeString: &units)
            down.postToPid(pid)
            up.postToPid(pid)
        }
    }

    /// Send a key chord (e.g. `"cmd+n"`, `"shift+tab"`, `"super+space"`) to the
    /// target process.
    public static func pressKey(appIdentifier: String, chord: String) throws {
        try requireTrusted()
        let app = try resolveApp(appIdentifier)
        let parsed = try parseChord(chord)
        guard let source = CGEventSource(stateID: .hidSystemState) else {
            throw MacAXError.actionFailed("could not create a keyboard event source")
        }
        let pid = app.processIdentifier
        guard
            let down = CGEvent(keyboardEventSource: source, virtualKey: parsed.keyCode, keyDown: true),
            let up = CGEvent(keyboardEventSource: source, virtualKey: parsed.keyCode, keyDown: false)
        else {
            throw MacAXError.actionFailed("could not create keyboard event for \(chord)")
        }
        down.flags = parsed.flags
        up.flags = parsed.flags
        down.postToPid(pid)
        up.postToPid(pid)
    }

    /// Scroll the target process by a pixel delta. Positive `deltaY` scrolls
    /// content up (wheel-forward), matching macOS scroll-wheel convention.
    public static func scroll(appIdentifier: String, deltaX: Int, deltaY: Int) throws {
        try requireTrusted()
        let app = try resolveApp(appIdentifier)
        guard let source = CGEventSource(stateID: .hidSystemState) else {
            throw MacAXError.actionFailed("could not create a scroll event source")
        }
        guard let event = CGEvent(
            scrollWheelEvent2Source: source,
            units: .pixel,
            wheelCount: 2,
            wheel1: Int32(clamping: deltaY),
            wheel2: Int32(clamping: deltaX),
            wheel3: 0
        ) else {
            throw MacAXError.actionFailed("could not create scroll event")
        }
        event.postToPid(app.processIdentifier)
    }

    // MARK: - Resolution

    static func resolveApp(_ identifier: String) throws -> NSRunningApplication {
        let trimmed = identifier.trimmingCharacters(in: .whitespacesAndNewlines)
        let apps = NSWorkspace.shared.runningApplications
        if trimmed.isEmpty || trimmed.caseInsensitiveCompare("frontmost") == .orderedSame {
            if let front = NSWorkspace.shared.frontmostApplication { return front }
            throw MacAXError.appNotFound(identifier)
        }
        if let byBundle = apps.first(where: { $0.bundleIdentifier?.caseInsensitiveCompare(trimmed) == .orderedSame }) {
            return byBundle
        }
        if let byName = apps.first(where: { $0.localizedName?.caseInsensitiveCompare(trimmed) == .orderedSame }) {
            return byName
        }
        if let byContains = apps.first(where: { ($0.localizedName ?? "").localizedCaseInsensitiveContains(trimmed) }) {
            return byContains
        }
        throw MacAXError.appNotFound(identifier)
    }

    /// Re-walk the tree with the default caps and return the element at `index`.
    /// The walk is deterministic, so an index from `get_app_state` resolves to
    /// the same element as long as the tree has not changed.
    static func resolveElement(appIdentifier: String, index: Int) throws -> AXUIElement {
        guard index >= 0 else { throw MacAXError.invalidArgument("element_index must be >= 0") }
        let app = try resolveApp(appIdentifier)
        let root = AXUIElementCreateApplication(app.processIdentifier)
        let collected = walk(root, maxDepth: defaultMaxDepth, maxElements: defaultMaxElements)
        guard index < collected.count else {
            throw MacAXError.elementIndexOutOfRange(index, collected.count)
        }
        return collected[index].element
    }

    // MARK: - Tree walk

    private struct Node {
        let element: AXUIElement
        let depth: Int
    }

    private static func walk(_ root: AXUIElement, maxDepth: Int, maxElements: Int) -> [Node] {
        var result: [Node] = []
        func visit(_ element: AXUIElement, depth: Int) {
            if result.count >= maxElements { return }
            result.append(Node(element: element, depth: depth))
            if depth >= maxDepth { return }
            for child in children(of: element) {
                if result.count >= maxElements { return }
                visit(child, depth: depth + 1)
            }
        }
        visit(root, depth: 0)
        return result
    }

    private static func children(of element: AXUIElement) -> [AXUIElement] {
        var value: CFTypeRef?
        let err = AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &value)
        guard err == .success, let array = value as? [AXUIElement] else { return [] }
        return array
    }

    private static func windowTitles(of root: AXUIElement) -> [String] {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(root, kAXWindowsAttribute as CFString, &value) == .success,
              let windows = value as? [AXUIElement] else { return [] }
        return windows.compactMap { stringAttribute($0, kAXTitleAttribute) }.filter { !$0.isEmpty }
    }

    // MARK: - Serialization

    private static func serialize(_ element: AXUIElement, index: Int, depth: Int) -> Element {
        Element(
            index: index,
            role: stringAttribute(element, kAXRoleAttribute) ?? "AXUnknown",
            subrole: stringAttribute(element, kAXSubroleAttribute),
            title: clamp(stringAttribute(element, kAXTitleAttribute)),
            value: clamp(stringAttribute(element, kAXValueAttribute)),
            label: clamp(stringAttribute(element, kAXDescriptionAttribute)),
            roleDescription: stringAttribute(element, kAXRoleDescriptionAttribute),
            help: clamp(stringAttribute(element, kAXHelpAttribute)),
            enabled: boolAttribute(element, kAXEnabledAttribute),
            focused: boolAttribute(element, kAXFocusedAttribute),
            actions: actionNames(element),
            frame: frame(of: element),
            depth: depth
        )
    }

    private static func stringAttribute(_ element: AXUIElement, _ attribute: String) -> String? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success else { return nil }
        if let string = value as? String { return string }
        if let number = value as? NSNumber { return number.stringValue }
        if let boolean = value as? Bool { return boolean ? "true" : "false" }
        return nil
    }

    private static func boolAttribute(_ element: AXUIElement, _ attribute: String) -> Bool? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, attribute as CFString, &value) == .success else { return nil }
        if let number = value as? NSNumber { return number.boolValue }
        return nil
    }

    private static func actionNames(_ element: AXUIElement) -> [String] {
        var names: CFArray?
        guard AXUIElementCopyActionNames(element, &names) == .success,
              let array = names as? [String] else { return [] }
        return array
    }

    private static func frame(of element: AXUIElement) -> [Double]? {
        guard let point = axValue(element, kAXPositionAttribute, type: .cgPoint, as: CGPoint.self),
              let size = axValue(element, kAXSizeAttribute, type: .cgSize, as: CGSize.self) else {
            return nil
        }
        return [Double(point.x), Double(point.y), Double(size.width), Double(size.height)]
    }

    private static func axValue<T>(
        _ element: AXUIElement,
        _ attribute: String,
        type: AXValueType,
        as: T.Type
    ) -> T? {
        var raw: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, attribute as CFString, &raw) == .success,
              let cf = raw, CFGetTypeID(cf) == AXValueGetTypeID() else { return nil }
        // swiftlint:disable:next force_cast
        let axv = cf as! AXValue
        let out = UnsafeMutablePointer<T>.allocate(capacity: 1)
        defer { out.deallocate() }
        guard AXValueGetValue(axv, type, out) else { return nil }
        return out.pointee
    }

    private static func clamp(_ string: String?) -> String? {
        guard let string, !string.isEmpty else { return string }
        if string.count <= valueClamp { return string }
        return String(string.prefix(valueClamp)) + "…"
    }

    // MARK: - Permission gate

    private static func requireTrusted() throws {
        guard AXIsProcessTrusted() else { throw MacAXError.accessibilityNotTrusted }
    }

    // MARK: - Chord parsing

    struct ParsedChord: Equatable {
        let keyCode: CGKeyCode
        let flags: CGEventFlags
    }

    static func parseChord(_ chord: String) throws -> ParsedChord {
        let tokens = chord
            .lowercased()
            .split(whereSeparator: { $0 == "+" || $0 == "-" || $0 == " " })
            .map(String.init)
            .filter { !$0.isEmpty }
        guard !tokens.isEmpty else { throw MacAXError.invalidArgument("key chord must not be empty") }

        var flags: CGEventFlags = []
        var keyToken: String?
        for token in tokens {
            switch token {
            case "cmd", "command", "super", "meta", "win", "⌘":
                flags.insert(.maskCommand)
            case "ctrl", "control", "⌃":
                flags.insert(.maskControl)
            case "shift", "⇧":
                flags.insert(.maskShift)
            case "opt", "option", "alt", "⌥":
                flags.insert(.maskAlternate)
            case "fn", "function":
                flags.insert(.maskSecondaryFn)
            default:
                if keyToken != nil {
                    throw MacAXError.invalidArgument("key chord has more than one base key: \(chord)")
                }
                keyToken = token
            }
        }
        guard let keyToken else {
            throw MacAXError.invalidArgument("key chord \(chord) has no base key")
        }
        guard let keyCode = keyCodeMap[keyToken] else {
            throw MacAXError.invalidArgument("unsupported key: \(keyToken)")
        }
        return ParsedChord(keyCode: keyCode, flags: flags)
    }

    /// US-ANSI virtual keycodes for the keys the chord parser accepts.
    static let keyCodeMap: [String: CGKeyCode] = [
        "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9,
        "b": 11, "q": 12, "w": 13, "e": 14, "r": 15, "y": 16, "t": 17,
        "1": 18, "2": 19, "3": 20, "4": 21, "6": 22, "5": 23, "=": 24, "9": 25, "7": 26,
        "-": 27, "8": 28, "0": 29, "]": 30, "o": 31, "u": 32, "[": 33, "i": 34, "p": 35,
        "l": 37, "j": 38, "'": 39, "k": 40, ";": 41, "\\": 42, ",": 43, "/": 44, "n": 45,
        "m": 46, ".": 47, "`": 50,
        "return": 36, "enter": 36, "tab": 48, "space": 49, "spacebar": 49,
        "delete": 51, "backspace": 51, "escape": 53, "esc": 53,
        "forwarddelete": 117, "del": 117,
        "left": 123, "leftarrow": 123, "right": 124, "rightarrow": 124,
        "down": 125, "downarrow": 125, "up": 126, "uparrow": 126,
        "home": 115, "end": 119, "pageup": 116, "pagedown": 121,
        "f1": 122, "f2": 120, "f3": 99, "f4": 118, "f5": 96, "f6": 97,
        "f7": 98, "f8": 100, "f9": 101, "f10": 109, "f11": 103, "f12": 111,
    ]
}

public enum MacAXError: LocalizedError, Equatable {
    case accessibilityNotTrusted
    case appNotFound(String)
    case elementIndexOutOfRange(Int, Int)
    case actionFailed(String)
    case invalidArgument(String)

    public var errorDescription: String? {
        switch self {
        case .accessibilityNotTrusted:
            return "Computer Use requires Accessibility permission for the host app."
        case .appNotFound(let identifier):
            return "No running application matched \"\(identifier)\"."
        case .elementIndexOutOfRange(let index, let count):
            return "element_index \(index) is out of range (app exposed \(count) elements). Re-read get_app_state."
        case .actionFailed(let message):
            return message
        case .invalidArgument(let message):
            return message
        }
    }
}
