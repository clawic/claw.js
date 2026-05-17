import AppKit
import ApplicationServices
import AVFoundation
import CoreWLAN
import Foundation
import IOKit.hid
import Speech

public enum MacControlOrigin: String, Codable, Sendable {
    case ownerCLI = "owner_cli"
    case userUI = "user_ui"
    case agent
    case mcpClient = "mcp_client"
    case automation
    case system

    public var isLocalHuman: Bool {
        switch self {
        case .ownerCLI, .userUI:
            return true
        case .agent, .mcpClient, .automation, .system:
            return false
        }
    }
}

public enum MacControlPermissionID: String, CaseIterable, Codable, Sendable {
    case microphone = "mac.permission.microphone"
    case speechRecognition = "mac.permission.speech_recognition"
    case camera = "mac.permission.camera"
    case accessibility = "mac.permission.accessibility"
    case inputMonitoring = "mac.permission.input_monitoring"
    case automationAppleEvents = "mac.permission.automation_apple_events"
}

public enum MacControlPermissionStatus: String, Codable, Sendable {
    case granted
    case denied
    case notDetermined = "not_determined"
}

@MainActor
public enum MacControlPermissionBroker {
    public nonisolated static let accessibilityRequestedKey = "claw.host.mac.permission.accessibility.requested"

    public static func status(for permission: MacControlPermissionID) -> MacControlPermissionStatus {
        switch permission {
        case .microphone:
            return avStatus(AVCaptureDevice.authorizationStatus(for: .audio))
        case .speechRecognition:
            switch SFSpeechRecognizer.authorizationStatus() {
            case .authorized: return .granted
            case .denied, .restricted: return .denied
            case .notDetermined: return .notDetermined
            @unknown default: return .notDetermined
            }
        case .camera:
            return avStatus(AVCaptureDevice.authorizationStatus(for: .video))
        case .accessibility:
            if AXIsProcessTrusted() { return .granted }
            if UserDefaults.standard.bool(forKey: accessibilityRequestedKey) { return .denied }
            return .notDetermined
        case .inputMonitoring:
            switch IOHIDCheckAccess(kIOHIDRequestTypeListenEvent) {
            case kIOHIDAccessTypeGranted: return .granted
            case kIOHIDAccessTypeDenied: return .denied
            default: return .notDetermined
            }
        case .automationAppleEvents:
            return .notDetermined
        }
    }

    public static func request(_ permission: MacControlPermissionID) async -> Bool {
        switch permission {
        case .microphone:
            return await avRequest(for: .audio)
        case .speechRecognition:
            return await withCheckedContinuation { continuation in
                SFSpeechRecognizer.requestAuthorization { status in
                    continuation.resume(returning: status == .authorized)
                }
            }
        case .camera:
            return await avRequest(for: .video)
        case .accessibility:
            let key = "AXTrustedCheckOptionPrompt" as CFString
            let options: CFDictionary = [key: true] as CFDictionary
            let trusted = AXIsProcessTrustedWithOptions(options)
            UserDefaults.standard.set(true, forKey: accessibilityRequestedKey)
            return trusted
        case .inputMonitoring:
            return IOHIDRequestAccess(kIOHIDRequestTypeListenEvent)
        case .automationAppleEvents:
            return false
        }
    }

    public static func openSettings(for permission: MacControlPermissionID) {
        let url: String
        switch permission {
        case .microphone:
            url = "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
        case .speechRecognition:
            url = "x-apple.systempreferences:com.apple.preference.security?Privacy_SpeechRecognition"
        case .camera:
            url = "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera"
        case .accessibility:
            url = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
        case .inputMonitoring:
            url = "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent"
        case .automationAppleEvents:
            url = "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation"
        }
        guard let parsed = URL(string: url) else { return }
        NSWorkspace.shared.open(parsed)
    }

    private static func avStatus(_ status: AVAuthorizationStatus) -> MacControlPermissionStatus {
        switch status {
        case .authorized: return .granted
        case .denied, .restricted: return .denied
        case .notDetermined: return .notDetermined
        @unknown default: return .notDetermined
        }
    }

    private static func avRequest(for mediaType: AVMediaType) async -> Bool {
        await withCheckedContinuation { continuation in
            AVCaptureDevice.requestAccess(for: mediaType) { granted in
                continuation.resume(returning: granted)
            }
        }
    }
}

public struct MacControlActionRequest: Codable, Equatable, Sendable {
    public var requestId: String
    public var capabilityId: String
    public var actorId: String
    public var origin: MacControlOrigin
    public var arguments: [String: String]
    public var dryRun: Bool
    public var approved: Bool

    public init(
        requestId: String = "macreq_\(UUID().uuidString)",
        capabilityId: String,
        actorId: String,
        origin: MacControlOrigin,
        arguments: [String: String] = [:],
        dryRun: Bool = false,
        approved: Bool = false
    ) {
        self.requestId = requestId
        self.capabilityId = capabilityId
        self.actorId = actorId
        self.origin = origin
        self.arguments = arguments
        self.dryRun = dryRun
        self.approved = approved
    }
}

public struct MacControlActionPlan: Codable, Equatable, Sendable {
    public enum Risk: String, Codable, Sendable {
        case read
        case low
        case medium
        case high
        case critical
    }

    public enum RevertLevel: String, Codable, Sendable {
        case guaranteed
        case bestEffort = "best_effort"
        case none
    }

    public struct Step: Codable, Equatable, Sendable {
        public enum Kind: String, Codable, Sendable {
            case process
            case appleScript = "apple_script"
            case native
        }

        public var kind: Kind
        public var executable: String?
        public var arguments: [String]
        public var script: String?
        public var preview: String
        public var redacted: Bool
    }

    public var planId: String
    public var requestId: String
    public var capabilityId: String
    public var risk: Risk
    public var requiredPermissionIds: [MacControlPermissionID]
    public var requiresApproval: Bool
    public var continuityBreaker: Bool
    public var revertLevel: RevertLevel
    public var steps: [Step]
    public var blockedReason: String?

    public var isBlocked: Bool { blockedReason != nil }
}

public struct MacControlActionReceipt: Codable, Equatable, Sendable {
    public enum Outcome: String, Codable, Sendable {
        case planned
        case approvalRequired = "approval_required"
        case blocked
        case executed
        case failed
    }

    public var receiptId: String
    public var requestId: String
    public var planId: String
    public var capabilityId: String
    public var outcome: Outcome
    public var outputs: [String]
    public var error: String?
}

public protocol MacControlCommandRunning {
    func runProcess(_ executable: String, arguments: [String]) throws -> String
    func runAppleScript(_ source: String) throws -> String
    func runNative(_ action: String, arguments: [String]) throws -> String
}

public struct MacControlProcessRunner: MacControlCommandRunning {
    public init() {}

    public func runProcess(_ executable: String, arguments: [String]) throws -> String {
        let process = Process()
        let output = Pipe()
        let error = Pipe()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        process.standardOutput = output
        process.standardError = error
        try process.run()
        process.waitUntilExit()

        let out = String(data: output.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        let err = String(data: error.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        guard process.terminationStatus == 0 else {
            throw MacControlError.commandFailed(err.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        return out
    }

    public func runAppleScript(_ source: String) throws -> String {
        var error: NSDictionary?
        guard let script = NSAppleScript(source: source) else {
            throw MacControlError.commandFailed("Could not prepare AppleScript action")
        }
        let result = script.executeAndReturnError(&error)
        if let error {
            let message = error[NSAppleScript.errorMessage] as? String ?? "AppleScript action failed"
            throw MacControlError.commandFailed(message)
        }
        return result.stringValue ?? ""
    }

    public func runNative(_ action: String, arguments: [String]) throws -> String {
        switch action {
        case "corewlan.disconnect":
            let device = arguments.first?.isEmpty == false ? arguments[0] : "en0"
            guard let interface = CWInterface.interface(withName: device) else {
                throw MacControlError.commandFailed("Wi-Fi interface \(device) was not found.")
            }
            interface.disassociate()
            return "disconnected \(device)"
        default:
            throw MacControlError.commandFailed("Unsupported native Mac Control action \(action).")
        }
    }
}

public enum MacControlError: LocalizedError, Equatable {
    case unsupportedCapability(String)
    case commandFailed(String)

    public var errorDescription: String? {
        switch self {
        case .unsupportedCapability(let capability):
            return "Unsupported Mac action capability: \(capability)"
        case .commandFailed(let message):
            return message.isEmpty ? "Mac action command failed" : message
        }
    }
}

public enum MacControlPolicy {
    public enum Approval: String, Codable, CaseIterable, Sendable {
        case alwaysAsk = "always_ask"
        case alwaysAllow = "always_allow"
        case alwaysBlock = "always_block"
    }

    public struct Authorization: Equatable, Sendable {
        public let allowed: Bool
        public let outcome: String
        public let reason: String?
    }

    public struct AuditEvent: Codable, Equatable, Sendable {
        public let timestamp: String
        public let action: String
        public let origin: MacControlOrigin
        public let approval: Approval
        public let outcome: String
        public let reason: String?
    }

    public static let approvalKey = "claw.host.macControl.approval"
    public static let auditFilename = "mac-control-audit.jsonl"

    public static func approval(defaults: UserDefaults = .standard) -> Approval {
        guard let raw = defaults.string(forKey: approvalKey),
              let approval = Approval(rawValue: raw) else {
            return .alwaysAsk
        }
        return approval
    }

    @discardableResult
    public static func authorize(
        action: String,
        origin: MacControlOrigin,
        defaults: UserDefaults = .standard,
        auditURL: URL? = nil,
        now: Date = Date(),
        approvedOverride: Bool = false
    ) -> Authorization {
        let policy = approval(defaults: defaults)
        let authorization: Authorization
        switch policy {
        case .alwaysAllow:
            authorization = Authorization(allowed: true, outcome: "allowed", reason: nil)
        case .alwaysBlock:
            authorization = Authorization(allowed: false, outcome: "blocked", reason: "Mac Control policy blocks this action.")
        case .alwaysAsk:
            if approvedOverride || origin.isLocalHuman {
                authorization = Authorization(allowed: true, outcome: approvedOverride ? "approved" : "allowed", reason: nil)
            } else {
                authorization = Authorization(allowed: false, outcome: "requires_approval", reason: "Requires explicit Mac Control approval.")
            }
        }

        appendAudit(
            AuditEvent(
                timestamp: timestamp(now),
                action: action,
                origin: origin,
                approval: policy,
                outcome: authorization.outcome,
                reason: authorization.reason
            ),
            to: auditURL ?? defaultAuditURL()
        )
        return authorization
    }

    private static func defaultAuditURL() -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
        return base
            .appendingPathComponent("Claw", isDirectory: true)
            .appendingPathComponent(auditFilename)
    }

    private static func appendAudit(_ event: AuditEvent, to url: URL) {
        do {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.sortedKeys]
            var data = try encoder.encode(event)
            data.append(0x0A)
            if FileManager.default.fileExists(atPath: url.path),
               let handle = try? FileHandle(forWritingTo: url) {
                defer { try? handle.close() }
                try handle.seekToEnd()
                try handle.write(contentsOf: data)
            } else {
                try data.write(to: url, options: .atomic)
            }
        } catch {
            NSLog("Mac Control audit write failed: \(error.localizedDescription)")
        }
    }

    private static func timestamp(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }
}

@MainActor
public enum MacControlActionBroker {
    public static func plan(for request: MacControlActionRequest) throws -> MacControlActionPlan {
        let blockedReason = plaintextPasswordBlock(for: request)
        switch request.capabilityId {
        case "mac.wifi.status":
            return processPlan(
                request,
                risk: .read,
                permissions: [],
                steps: [
                    .process("/usr/sbin/networksetup", ["-getairportpower", wifiDevice(from: request)], "Read Wi-Fi power state"),
                    .process("/usr/sbin/networksetup", ["-getairportnetwork", wifiDevice(from: request)], "Read current Wi-Fi network"),
                ],
                blockedReason: blockedReason
            )
        case "mac.wifi.list":
            return processPlan(
                request,
                risk: .read,
                permissions: [],
                steps: [.process("/usr/sbin/networksetup", ["-listpreferredwirelessnetworks", wifiDevice(from: request)], "List preferred Wi-Fi networks")],
                blockedReason: blockedReason
            )
        case "mac.wifi.connect":
            guard let ssid = request.arguments["ssid"], !ssid.isEmpty else {
                return blockedPlan(request, reason: "Wi-Fi connect requires an explicit SSID.")
            }
            return processPlan(
                request,
                risk: .high,
                permissions: [],
                steps: [.process("/usr/sbin/networksetup", ["-setairportnetwork", wifiDevice(from: request), ssid], "Connect Wi-Fi to \(redactedName("ssid", ssid))", redacted: true)],
                requiresApproval: true,
                continuityBreaker: true,
                revertLevel: .bestEffort,
                blockedReason: blockedReason
            )
        case "mac.wifi.disconnect":
            return processPlan(
                request,
                risk: .critical,
                permissions: [],
                steps: [.native("corewlan.disconnect", [wifiDevice(from: request)], "Disconnect Wi-Fi from the current network")],
                requiresApproval: true,
                continuityBreaker: true,
                revertLevel: .bestEffort,
                blockedReason: blockedReason
            )
        case "mac.wifi.power.on":
            return wifiPowerPlan(request, power: "on", risk: .medium, blockedReason: blockedReason)
        case "mac.wifi.power.off":
            return wifiPowerPlan(request, power: "off", risk: .critical, blockedReason: blockedReason)
        case "mac.window.list":
            return appleScriptPlan(request, risk: .read, permissions: [.accessibility], script: windowListScript, preview: "List visible application windows", blockedReason: blockedReason)
        case "mac.window.focus":
            return appleScriptPlan(request, risk: .low, permissions: [.accessibility], script: focusWindowScript(for: request), preview: windowPreview("Focus", request), requiresApproval: true, revertLevel: .none, blockedReason: blockedReason)
        case "mac.window.move":
            guard let x = integerArgument("x", from: request), let y = integerArgument("y", from: request) else {
                return blockedPlan(request, reason: "Window move requires integer x and y arguments.")
            }
            return appleScriptPlan(request, risk: .low, permissions: [.accessibility], script: moveWindowScript(for: request, x: x, y: y), preview: "\(windowPreview("Move", request)) to x=\(x), y=\(y)", requiresApproval: true, revertLevel: .bestEffort, blockedReason: blockedReason)
        case "mac.window.resize":
            guard let width = positiveIntegerArgument("width", from: request), let height = positiveIntegerArgument("height", from: request) else {
                return blockedPlan(request, reason: "Window resize requires positive integer width and height arguments.")
            }
            return appleScriptPlan(request, risk: .low, permissions: [.accessibility], script: resizeWindowScript(for: request, width: width, height: height), preview: "\(windowPreview("Resize", request)) to width=\(width), height=\(height)", requiresApproval: true, revertLevel: .bestEffort, blockedReason: blockedReason)
        case "mac.window.close":
            return appleScriptPlan(request, risk: .high, permissions: [.accessibility], script: closeFocusedWindowScript, preview: "Close the focused window", requiresApproval: true, revertLevel: .none, blockedReason: blockedReason)
        case "mac.window.minimize":
            return appleScriptPlan(request, risk: .medium, permissions: [.accessibility], script: minimizeFocusedWindowScript, preview: "Minimize the focused window", requiresApproval: true, revertLevel: .bestEffort, blockedReason: blockedReason)
        case "mac.shortcut.list":
            return processPlan(request, risk: .read, permissions: [], steps: [.process("/usr/bin/shortcuts", ["list"], "List Shortcuts")], blockedReason: blockedReason)
        case "mac.shortcut.show":
            guard let name = request.arguments["name"], !name.isEmpty else {
                return blockedPlan(request, reason: "Shortcut show requires a shortcut name.")
            }
            return processPlan(request, risk: .low, permissions: [], steps: [.process("/usr/bin/shortcuts", ["view", name], "Show Shortcut \(redactedName("shortcut", name))", redacted: true)], blockedReason: blockedReason)
        case "mac.shortcut.run":
            guard let name = request.arguments["name"], !name.isEmpty else {
                return blockedPlan(request, reason: "Shortcut run requires a shortcut name.")
            }
            return processPlan(request, risk: .high, permissions: [.automationAppleEvents], steps: [.process("/usr/bin/shortcuts", ["run", name], "Run Shortcut \(redactedName("shortcut", name))", redacted: true)], requiresApproval: true, revertLevel: .none, blockedReason: blockedReason)
        default:
            throw MacControlError.unsupportedCapability(request.capabilityId)
        }
    }

    public static func evaluate(
        _ request: MacControlActionRequest,
        defaults: UserDefaults = .standard,
        auditURL: URL? = nil,
        runner: MacControlCommandRunning = MacControlProcessRunner()
    ) -> MacControlActionReceipt {
        let plan: MacControlActionPlan
        do {
            plan = try Self.plan(for: request)
        } catch {
            return receipt(for: request, planId: "macplan_invalid", outcome: .blocked, error: error.localizedDescription)
        }
        if let blockedReason = plan.blockedReason {
            return receipt(for: request, plan: plan, outcome: .blocked, error: blockedReason)
        }
        if request.dryRun {
            return receipt(for: request, plan: plan, outcome: .planned)
        }
        if plan.requiresApproval {
            let authorization = MacControlPolicy.authorize(
                action: request.capabilityId,
                origin: request.origin,
                defaults: defaults,
                auditURL: auditURL,
                approvedOverride: request.approved
            )
            guard authorization.allowed else {
                let outcome: MacControlActionReceipt.Outcome = authorization.outcome == "blocked" ? .blocked : .approvalRequired
                return receipt(for: request, plan: plan, outcome: outcome, error: authorization.reason)
            }
        }

        do {
            var outputs: [String] = []
            for step in plan.steps {
                switch step.kind {
                case .process:
                    guard let executable = step.executable else { continue }
                    outputs.append(try runner.runProcess(executable, arguments: step.arguments))
                case .appleScript:
                    guard let script = step.script else { continue }
                    outputs.append(try runner.runAppleScript(script))
                case .native:
                    guard let action = step.executable else { continue }
                    outputs.append(try runner.runNative(action, arguments: step.arguments))
                }
            }
            return receipt(for: request, plan: plan, outcome: .executed, outputs: outputs)
        } catch {
            return receipt(for: request, plan: plan, outcome: .failed, error: error.localizedDescription)
        }
    }

    private static func processPlan(
        _ request: MacControlActionRequest,
        risk: MacControlActionPlan.Risk,
        permissions: [MacControlPermissionID],
        steps: [MacControlActionPlan.Step],
        requiresApproval: Bool = false,
        continuityBreaker: Bool = false,
        revertLevel: MacControlActionPlan.RevertLevel = .none,
        blockedReason: String? = nil
    ) -> MacControlActionPlan {
        MacControlActionPlan(
            planId: "macplan_\(request.requestId)",
            requestId: request.requestId,
            capabilityId: request.capabilityId,
            risk: risk,
            requiredPermissionIds: permissions,
            requiresApproval: requiresApproval,
            continuityBreaker: continuityBreaker,
            revertLevel: revertLevel,
            steps: steps,
            blockedReason: blockedReason
        )
    }

    private static func appleScriptPlan(
        _ request: MacControlActionRequest,
        risk: MacControlActionPlan.Risk,
        permissions: [MacControlPermissionID],
        script: String,
        preview: String,
        requiresApproval: Bool = false,
        revertLevel: MacControlActionPlan.RevertLevel = .none,
        blockedReason: String? = nil
    ) -> MacControlActionPlan {
        processPlan(
            request,
            risk: risk,
            permissions: permissions,
            steps: [MacControlActionPlan.Step(kind: .appleScript, executable: nil, arguments: [], script: script, preview: preview, redacted: false)],
            requiresApproval: requiresApproval,
            revertLevel: revertLevel,
            blockedReason: blockedReason
        )
    }

    private static func blockedPlan(_ request: MacControlActionRequest, reason: String) -> MacControlActionPlan {
        processPlan(request, risk: .high, permissions: [], steps: [], blockedReason: reason)
    }

    private static func wifiPowerPlan(_ request: MacControlActionRequest, power: String, risk: MacControlActionPlan.Risk, blockedReason: String?) -> MacControlActionPlan {
        processPlan(
            request,
            risk: risk,
            permissions: [],
            steps: [.process("/usr/sbin/networksetup", ["-setairportpower", wifiDevice(from: request), power], "Turn Wi-Fi \(power)")],
            requiresApproval: true,
            continuityBreaker: power == "off",
            revertLevel: .bestEffort,
            blockedReason: blockedReason
        )
    }

    private static func receipt(for request: MacControlActionRequest, plan: MacControlActionPlan, outcome: MacControlActionReceipt.Outcome, outputs: [String] = [], error: String? = nil) -> MacControlActionReceipt {
        receipt(for: request, planId: plan.planId, outcome: outcome, outputs: outputs, error: error)
    }

    private static func receipt(for request: MacControlActionRequest, planId: String, outcome: MacControlActionReceipt.Outcome, outputs: [String] = [], error: String? = nil) -> MacControlActionReceipt {
        MacControlActionReceipt(receiptId: "macact_\(UUID().uuidString)", requestId: request.requestId, planId: planId, capabilityId: request.capabilityId, outcome: outcome, outputs: outputs, error: error)
    }

    private static func wifiDevice(from request: MacControlActionRequest) -> String {
        request.arguments["device"].flatMap { $0.isEmpty ? nil : $0 } ?? "en0"
    }

    private static func plaintextPasswordBlock(for request: MacControlActionRequest) -> String? {
        request.arguments["password"] == nil ? nil : "Plaintext Wi-Fi passwords are not accepted by the Mac Action Broker. Use a secret reference."
    }

    private static func integerArgument(_ name: String, from request: MacControlActionRequest) -> Int? {
        guard let value = request.arguments[name], !value.isEmpty else { return nil }
        return Int(value)
    }

    private static func positiveIntegerArgument(_ name: String, from request: MacControlActionRequest) -> Int? {
        guard let value = integerArgument(name, from: request), value > 0 else { return nil }
        return value
    }

    private static func redactedName(_ label: String, _ value: String) -> String {
        value.isEmpty ? "<\(label)>" : "<\(label):\(value.count) chars>"
    }

    private static func appleScriptString(_ value: String) -> String {
        "\"\(value.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\""))\""
    }

    private static func windowPreview(_ verb: String, _ request: MacControlActionRequest) -> String {
        if let app = request.arguments["app"], !app.isEmpty {
            return "\(verb) window in app \(redactedName("app", app))"
        }
        if let title = request.arguments["title"], !title.isEmpty {
            return "\(verb) window titled \(redactedName("title", title))"
        }
        return "\(verb) the focused window"
    }

    private static func selectedWindowScriptPrelude(for request: MacControlActionRequest) -> String {
        let appName = request.arguments["app"] ?? ""
        let title = request.arguments["title"] ?? ""
        let appLiteral = appleScriptString(appName)
        let titleLiteral = appleScriptString(title)
        return """
        set targetAppName to \(appLiteral)
        set targetTitle to \(titleLiteral)
        tell application "System Events"
            if targetAppName is not "" then
                set targetProcess to first application process whose name is targetAppName
            else
                set targetProcess to first application process whose frontmost is true
            end if
            if targetTitle is not "" then
                set targetWindow to first window of targetProcess whose name contains targetTitle
            else
                set targetWindow to window 1 of targetProcess
            end if
        """
    }

    private static func selectedWindowScriptSuffix() -> String {
        """
        end tell
        """
    }

    private static func focusWindowScript(for request: MacControlActionRequest) -> String {
        """
        \(selectedWindowScriptPrelude(for: request))
            set frontmost of targetProcess to true
            perform action "AXRaise" of targetWindow
        \(selectedWindowScriptSuffix())
        """
    }

    private static func moveWindowScript(for request: MacControlActionRequest, x: Int, y: Int) -> String {
        """
        \(selectedWindowScriptPrelude(for: request))
            set position of targetWindow to {\(x), \(y)}
        \(selectedWindowScriptSuffix())
        """
    }

    private static func resizeWindowScript(for request: MacControlActionRequest, width: Int, height: Int) -> String {
        """
        \(selectedWindowScriptPrelude(for: request))
            set size of targetWindow to {\(width), \(height)}
        \(selectedWindowScriptSuffix())
        """
    }

    private static let windowListScript = """
    tell application "System Events"
        set rows to {}
        repeat with appProcess in application processes
            try
                repeat with appWindow in windows of appProcess
                    try
                        set end of rows to (name of appProcess) & "\t" & (name of appWindow)
                    end try
                end repeat
            end try
        end repeat
        set AppleScript's text item delimiters to linefeed
        return rows as text
    end tell
    """

    private static let closeFocusedWindowScript = """
    tell application "System Events"
        set frontProcess to first application process whose frontmost is true
        try
            click button 1 of window 1 of frontProcess
        on error
            keystroke "w" using command down
        end try
    end tell
    """

    private static let minimizeFocusedWindowScript = """
    tell application "System Events"
        set frontProcess to first application process whose frontmost is true
        set value of attribute "AXMinimized" of window 1 of frontProcess to true
    end tell
    """
}

private extension MacControlActionPlan.Step {
    static func process(_ executable: String, _ arguments: [String], _ preview: String, redacted: Bool = false) -> MacControlActionPlan.Step {
        MacControlActionPlan.Step(kind: .process, executable: executable, arguments: arguments, script: nil, preview: preview, redacted: redacted)
    }

    static func native(_ action: String, _ arguments: [String], _ preview: String, redacted: Bool = false) -> MacControlActionPlan.Step {
        MacControlActionPlan.Step(kind: .native, executable: action, arguments: arguments, script: nil, preview: preview, redacted: redacted)
    }
}

public struct MacControlWireActor: Codable, Equatable, Sendable {
    public var kind: String
    public var id: String
    public var role: String?
    public var assignmentId: String?
    public var runId: String?

    public init(kind: String, id: String, role: String? = nil, assignmentId: String? = nil, runId: String? = nil) {
        self.kind = kind
        self.id = id
        self.role = role
        self.assignmentId = assignmentId
        self.runId = runId
    }
}

public struct MacControlWireHost: Codable, Equatable, Sendable {
    public var hostId: String
    public var bundleId: String
    public var signingIdentity: String?
    public var teamId: String?
    public var appVariant: String?
    public var appVersion: String?

    public init(
        hostId: String,
        bundleId: String,
        signingIdentity: String? = nil,
        teamId: String? = nil,
        appVariant: String? = nil,
        appVersion: String? = nil
    ) {
        self.hostId = hostId
        self.bundleId = bundleId
        self.signingIdentity = signingIdentity
        self.teamId = teamId
        self.appVariant = appVariant
        self.appVersion = appVersion
    }
}

public struct MacControlWireTarget: Codable, Equatable, Sendable {
    public var kind: String
    public var id: String?
    public var name: String?
    public var selector: [String: JSONValue]

    public init(kind: String, id: String? = nil, name: String? = nil, selector: [String: JSONValue] = [:]) {
        self.kind = kind
        self.id = id
        self.name = name
        self.selector = selector
    }

    enum CodingKeys: String, CodingKey {
        case kind
        case id
        case name
        case selector
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        kind = try container.decode(String.self, forKey: .kind)
        id = try container.decodeIfPresent(String.self, forKey: .id)
        name = try container.decodeIfPresent(String.self, forKey: .name)
        selector = try container.decodeIfPresent([String: JSONValue].self, forKey: .selector) ?? [:]
    }
}

public struct MacControlWireRequest: Codable, Equatable, Sendable {
    public var schemaVersion: Int
    public var requestId: String
    public var capabilityId: String
    public var actor: MacControlWireActor
    public var host: MacControlWireHost
    public var target: MacControlWireTarget?
    public var arguments: [String: JSONValue]
    public var dryRun: Bool
    public var reason: String?
    public var approved: Bool?

    public init(
        schemaVersion: Int = 1,
        requestId: String,
        capabilityId: String,
        actor: MacControlWireActor,
        host: MacControlWireHost,
        target: MacControlWireTarget? = nil,
        arguments: [String: JSONValue] = [:],
        dryRun: Bool = false,
        reason: String? = nil,
        approved: Bool? = nil
    ) {
        self.schemaVersion = schemaVersion
        self.requestId = requestId
        self.capabilityId = capabilityId
        self.actor = actor
        self.host = host
        self.target = target
        self.arguments = arguments
        self.dryRun = dryRun
        self.reason = reason
        self.approved = approved
    }

    enum CodingKeys: String, CodingKey {
        case schemaVersion
        case requestId
        case capabilityId
        case actor
        case host
        case target
        case arguments
        case dryRun
        case reason
        case approved
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try container.decode(Int.self, forKey: .schemaVersion)
        requestId = try container.decode(String.self, forKey: .requestId)
        capabilityId = try container.decode(String.self, forKey: .capabilityId)
        actor = try container.decode(MacControlWireActor.self, forKey: .actor)
        host = try container.decode(MacControlWireHost.self, forKey: .host)
        target = try container.decodeIfPresent(MacControlWireTarget.self, forKey: .target)
        arguments = try container.decodeIfPresent([String: JSONValue].self, forKey: .arguments) ?? [:]
        dryRun = try container.decodeIfPresent(Bool.self, forKey: .dryRun) ?? false
        reason = try container.decodeIfPresent(String.self, forKey: .reason)
        approved = try container.decodeIfPresent(Bool.self, forKey: .approved)
    }
}

public struct MacControlWirePermissionRequirement: Codable, Equatable, Sendable {
    public var permissionId: String
    public var required: Bool
    public var currentOsState: String
    public var currentFrameworkGrant: String
    public var guidance: String?
}

public struct MacControlWireRequiredApproval: Codable, Equatable, Sendable {
    public var risk: String
    public var reason: String
    public var approverRoles: [String]
    public var requestId: String?
}

public struct MacControlWireRollbackPlan: Codable, Equatable, Sendable {
    public var level: String
    public var timerSeconds: Int?
    public var snapshotRequired: Bool
    public var snapshotRef: String?
    public var reason: String?
}

public struct MacControlWirePlan: Codable, Equatable, Sendable {
    public var schemaVersion: Int
    public var planId: String
    public var requestId: String
    public var capabilityId: String
    public var risk: String
    public var coverageState: String
    public var actor: MacControlWireActor
    public var host: MacControlWireHost
    public var resolvedTarget: MacControlWireTarget?
    public var permissionRequirements: [MacControlWirePermissionRequirement]
    public var requiredApprovals: [MacControlWireRequiredApproval]
    public var rollback: MacControlWireRollbackPlan
    public var willMutate: Bool
    public var executable: Bool
    public var blockedReasons: [String]
    public var relatedSurfaces: [String]
}

public struct MacControlWireRedaction: Codable, Equatable, Sendable {
    public var level: String
    public var fields: [String]
}

public struct MacControlWireReceipt: Codable, Equatable, Sendable {
    public var schemaVersion: Int
    public var id: String
    public var requestId: String
    public var planId: String?
    public var capabilityId: String
    public var actor: MacControlWireActor
    public var host: MacControlWireHost
    public var result: String
    public var risk: String
    public var permissionSnapshotRefs: [String]
    public var beforeRef: String?
    public var afterRef: String?
    public var auditId: String
    public var revert: MacControlWireRollbackPlan
    public var secretRefs: [String]
    public var redaction: MacControlWireRedaction
    public var createdAt: String
}

public struct MacControlWireAuditEvent: Codable, Equatable, Sendable {
    public var schemaVersion: Int
    public var id: String
    public var receiptId: String
    public var requestId: String
    public var planId: String?
    public var capabilityId: String
    public var actor: MacControlWireActor
    public var host: MacControlWireHost
    public var result: String
    public var risk: String
    public var summary: String
    public var redaction: MacControlWireRedaction
    public var metadata: [String: JSONValue]
    public var createdAt: String
}

public struct MacControlWireEvaluation: Codable, Equatable, Sendable {
    public var schemaVersion: Int
    public var decision: String
    public var requestId: String
    public var planId: String
    public var capabilityId: String
    public var actor: MacControlWireActor
    public var host: MacControlWireHost
    public var reasons: [String]
    public var approvalRequestIds: [String]
    public var receipt: MacControlWireReceipt?
    public var auditEvent: MacControlWireAuditEvent?
}

@MainActor
public enum MacControlWire {
    public static let schemaVersion = 1

    public static func decodeRequest(_ data: Data) throws -> MacControlWireRequest {
        let request = try JSONDecoder().decode(MacControlWireRequest.self, from: data)
        guard request.schemaVersion == schemaVersion else {
            throw MacControlError.commandFailed("Unsupported Mac action schemaVersion \(request.schemaVersion)")
        }
        return request
    }

    public static func planJSON(for data: Data, encoder: JSONEncoder? = nil) throws -> Data {
        let request = try decodeRequest(data)
        let plan = try MacControlActionBroker.plan(for: request.nativeRequest)
        return try (encoder ?? wireEncoder()).encode(wirePlan(from: plan, request: request))
    }

    public static func evaluateJSON(
        for data: Data,
        defaults: UserDefaults = .standard,
        auditURL: URL? = nil,
        runner: MacControlCommandRunning = MacControlProcessRunner(),
        encoder: JSONEncoder? = nil
    ) throws -> Data {
        let request = try decodeRequest(data)
        let nativePlan = try? MacControlActionBroker.plan(for: request.nativeRequest)
        let receipt = MacControlActionBroker.evaluate(request.nativeRequest, defaults: defaults, auditURL: auditURL, runner: runner)
        return try (encoder ?? wireEncoder()).encode(wireEvaluation(from: receipt, plan: nativePlan.map { wirePlan(from: $0, request: request) }, request: request))
    }

    public static func wirePlan(from plan: MacControlActionPlan, request: MacControlWireRequest) -> MacControlWirePlan {
        let blockedReasons = [plan.blockedReason].compactMap { $0 }
        return MacControlWirePlan(
            schemaVersion: schemaVersion,
            planId: plan.planId,
            requestId: plan.requestId,
            capabilityId: plan.capabilityId,
            risk: plan.risk.rawValue,
            coverageState: "executable",
            actor: request.actor,
            host: request.host,
            resolvedTarget: request.target,
            permissionRequirements: plan.requiredPermissionIds.map {
                MacControlWirePermissionRequirement(
                    permissionId: $0.rawValue,
                    required: true,
                    currentOsState: "unknown",
                    currentFrameworkGrant: "not_granted",
                    guidance: nil
                )
            },
            requiredApprovals: plan.requiresApproval ? [
                MacControlWireRequiredApproval(
                    risk: plan.risk.rawValue,
                    reason: request.reason ?? "\(plan.capabilityId) requires \(plan.risk.rawValue) approval",
                    approverRoles: ["owner", "admin"],
                    requestId: nil
                ),
            ] : [],
            rollback: rollbackPlan(from: plan),
            willMutate: plan.risk != .read,
            executable: blockedReasons.isEmpty && !plan.steps.isEmpty,
            blockedReasons: blockedReasons,
            relatedSurfaces: []
        )
    }

    private static func wireEvaluation(from receipt: MacControlActionReceipt, plan: MacControlWirePlan?, request: MacControlWireRequest) -> MacControlWireEvaluation {
        let decision = decisionValue(from: receipt)
        let result = resultValue(from: receipt)
        let createdAt = ISO8601DateFormatter().string(from: Date())
        let fallbackRollback = MacControlWireRollbackPlan(level: "none", timerSeconds: nil, snapshotRequired: false, snapshotRef: nil, reason: nil)
        let rollback = plan?.rollback ?? fallbackRollback
        let risk = plan?.risk ?? "high"
        let redaction = MacControlWireRedaction(level: risk == "high" || risk == "critical" ? "high" : "low", fields: ["arguments"])
        let auditId = "macaudit_\(receipt.requestId)_\(result)".replacingOccurrences(of: "-", with: "_")
        let wireReceipt = MacControlWireReceipt(
            schemaVersion: schemaVersion,
            id: receipt.receiptId,
            requestId: receipt.requestId,
            planId: receipt.planId,
            capabilityId: receipt.capabilityId,
            actor: request.actor,
            host: request.host,
            result: result,
            risk: risk,
            permissionSnapshotRefs: [],
            beforeRef: nil,
            afterRef: nil,
            auditId: auditId,
            revert: rollback,
            secretRefs: secretRefs(from: request.arguments),
            redaction: redaction,
            createdAt: createdAt
        )
        let auditEvent = MacControlWireAuditEvent(
            schemaVersion: schemaVersion,
            id: auditId,
            receiptId: wireReceipt.id,
            requestId: receipt.requestId,
            planId: receipt.planId,
            capabilityId: receipt.capabilityId,
            actor: request.actor,
            host: request.host,
            result: result,
            risk: risk,
            summary: "Mac action \(receipt.capabilityId) \(result)",
            redaction: redaction,
            metadata: receipt.error.map { ["error": .string($0)] } ?? [:],
            createdAt: createdAt
        )
        return MacControlWireEvaluation(
            schemaVersion: schemaVersion,
            decision: decision,
            requestId: receipt.requestId,
            planId: receipt.planId,
            capabilityId: receipt.capabilityId,
            actor: request.actor,
            host: request.host,
            reasons: receipt.error.map { [$0] } ?? (decision == "dry_run" ? ["dry_run"] : []),
            approvalRequestIds: [],
            receipt: wireReceipt,
            auditEvent: auditEvent
        )
    }

    private static func rollbackPlan(from plan: MacControlActionPlan) -> MacControlWireRollbackPlan {
        MacControlWireRollbackPlan(
            level: plan.revertLevel.rawValue,
            timerSeconds: plan.risk == .critical && plan.revertLevel != .none ? 120 : nil,
            snapshotRequired: (plan.risk == .high || plan.risk == .critical) && plan.revertLevel != .none,
            snapshotRef: nil,
            reason: plan.revertLevel == .none ? "No reliable automated revert is declared for this capability." : nil
        )
    }

    private static func decisionValue(from receipt: MacControlActionReceipt) -> String {
        switch receipt.outcome {
        case .planned: return "dry_run"
        case .approvalRequired: return "approval_required"
        case .blocked: return "blocked"
        case .executed, .failed: return "allow"
        }
    }

    private static func resultValue(from receipt: MacControlActionReceipt) -> String {
        switch receipt.outcome {
        case .planned, .approvalRequired: return "planned"
        case .blocked: return "blocked"
        case .executed: return "ok"
        case .failed: return "error"
        }
    }

    private static func secretRefs(from arguments: [String: JSONValue]) -> [String] {
        var refs: [String] = []
        if let secretRef = arguments["secretRef"]?.stringValue {
            refs.append(secretRef)
        }
        if case .array(let values)? = arguments["secretRefs"] {
            refs.append(contentsOf: values.compactMap(\.stringValue))
        }
        return Array(Set(refs)).sorted()
    }

    private static func wireEncoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }
}

private extension MacControlWireRequest {
    var nativeRequest: MacControlActionRequest {
        MacControlActionRequest(
            requestId: requestId,
            capabilityId: capabilityId,
            actorId: actor.id,
            origin: MacControlOrigin(rawValue: actor.kind) ?? .system,
            arguments: arguments.compactMapValues(\.stringValue),
            dryRun: dryRun,
            approved: approved ?? false
        )
    }
}
