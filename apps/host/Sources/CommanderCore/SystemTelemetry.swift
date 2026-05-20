import CoreAudio
import Darwin
import EventKit
import Foundation
import IOKit
import IOKit.graphics
import IOKit.ps

public enum SystemTelemetry {
    public static func metricsCatalog() -> JSONValue {
        .array(metricDefinitions.map(metricJSON))
    }

    public static func providersCatalog() -> JSONValue {
        .array(providerDefinitions.map(providerJSON))
    }

    public static func providerPlan(
        providerID: String?,
        credentialRef: String?,
        reason: String?
    ) -> JSONValue {
        guard let providerID,
              let definition = providerDefinition(id: providerID) else {
            return .object([
                "schema_version": .integer(1),
                "status": .string("error"),
                "error": .string("unknown_provider"),
                "provider_id": providerID.map(JSONValue.string) ?? .null,
                "will_connect": .bool(false),
                "external_pending": .bool(true),
            ])
        }

        let timestamp = ISO8601DateFormatter().string(from: Date())
        let planID = "system-provider-plan-\(definition.id.replacingOccurrences(of: ".", with: "-"))-\(Int(Date().timeIntervalSince1970 * 1000))"
        let requiredGrants = definition.requiresGrant.map { [$0] } ?? []
        let credentialStatus = definition.credentialRefRequired
            ? ((credentialRef?.isEmpty == false) ? "pending" : "blocked")
            : "skipped"
        let credentialRefProjection: JSONValue = (credentialRef?.isEmpty == false) ? .string("provided_redacted") : .null

        return .object([
            "schema_version": .integer(1),
            "id": .string(planID),
            "created_at": .string(timestamp),
            "status": .string("planned"),
            "will_connect": .bool(false),
            "provider": providerJSON(definition),
            "request": .object([
                "credential_ref": credentialRefProjection,
                "reason": reason.map(JSONValue.string) ?? .string("not_provided"),
            ]),
            "broker": .object([
                "required": .bool(true),
                "status": .string("external_pending"),
                "mode": .string("provider_grant_plan_first"),
                "fail_closed": .bool(true),
            ]),
            "policy": .object([
                "required_grants": .array(requiredGrants.map(JSONValue.string)),
                "credential_ref_required": .bool(definition.credentialRefRequired),
                "privacy_tier": .string(definition.privacyTier),
                "precise_location_redacted": .bool(true),
                "network_access": .string("blocked_until_granted"),
            ]),
            "steps": .array([
                .object([
                    "id": .string("validate_provider_config"),
                    "owner": .string("provider_broker"),
                    "status": .string("pending"),
                ]),
                .object([
                    "id": .string("validate_grants"),
                    "owner": .string("provider_broker"),
                    "status": .string(requiredGrants.isEmpty ? "skipped" : "pending"),
                ]),
                .object([
                    "id": .string("resolve_credential_ref"),
                    "owner": .string("provider_broker"),
                    "status": .string(credentialStatus),
                ]),
                .object([
                    "id": .string("connect_provider"),
                    "owner": .string("provider_broker"),
                    "status": .string("blocked"),
                ]),
                .object([
                    "id": .string("record_sample"),
                    "owner": .string("monitor"),
                    "status": .string("pending"),
                ]),
                .object([
                    "id": .string("append_audit_event"),
                    "owner": .string("audit"),
                    "status": .string("pending"),
                ]),
            ]),
            "receipt": .object([
                "required": .bool(true),
                "status": .string("not_issued"),
                "audit_event": .string("system.telemetry.provider.\(definition.kind).\(definition.mode)"),
            ]),
            "external_pending": .bool(true),
        ])
    }

    public static func defaultWidgets() -> JSONValue {
        .array([
            .object([
                "id": .string("menu.cpu-memory"),
                "title": .string("CPU + Memory"),
                "placement": .string("menu_bar"),
                "metric_keys": .array([
                    .string("system.cpu.load1"),
                    .string("system.memory.used"),
                ]),
                "render_mode": .string("compact"),
                "refresh_interval_ms": .integer(2000),
                "agent_visible": .bool(true),
            ]),
            .object([
                "id": .string("menu.disk-network"),
                "title": .string("Disk + Network"),
                "placement": .string("menu_bar"),
                "metric_keys": .array([
                    .string("system.disk.free"),
                    .string("system.network.bytes_in"),
                    .string("system.network.bytes_out"),
                ]),
                "render_mode": .string("compact"),
                "refresh_interval_ms": .integer(3000),
                "agent_visible": .bool(true),
            ]),
            .object([
                "id": .string("panel.hardware-overview"),
                "title": .string("Hardware Overview"),
                "placement": .string("panel"),
                "metric_keys": .array(metricDefinitions.map { .string($0.key) }),
                "render_mode": .string("chart"),
                "refresh_interval_ms": .integer(5000),
                "agent_visible": .bool(true),
            ]),
            .object([
                "id": .string("weather-temperature"),
                "title": .string("Weather"),
                "placement": .string("menubar"),
                "metricKey": .string("context.weather.temperature"),
                "presentation": .string("text"),
                "enabledByDefault": .bool(false),
                "refreshIntervalMS": .integer(900000),
            ]),
            .object([
                "id": .string("build-status"),
                "title": .string("Build"),
                "placement": .string("menubar"),
                "metricKey": .string("context.build.status"),
                "presentation": .string("icon"),
                "enabledByDefault": .bool(false),
                "refreshIntervalMS": .integer(30000),
            ]),
            .object([
                "id": .string("service-health"),
                "title": .string("Services"),
                "placement": .string("combined_panel"),
                "metricKey": .string("context.service.health"),
                "presentation": .string("threshold"),
                "enabledByDefault": .bool(false),
                "refreshIntervalMS": .integer(10000),
            ]),
            .object([
                "id": .string("agent-runs-active"),
                "title": .string("Agents"),
                "placement": .string("menubar"),
                "metricKey": .string("context.agent_runs.active"),
                "presentation": .string("text"),
                "enabledByDefault": .bool(false),
                "refreshIntervalMS": .integer(5000),
            ]),
            .object([
                "id": .string("reminders-due"),
                "title": .string("Reminders"),
                "placement": .string("combined_panel"),
                "metricKey": .string("context.reminders.due_count"),
                "presentation": .string("text"),
                "enabledByDefault": .bool(false),
                "refreshIntervalMS": .integer(60000),
            ]),
            .object([
                "id": .string("calendar-next-event"),
                "title": .string("Calendar"),
                "placement": .string("combined_panel"),
                "metricKey": .string("system.calendar.next_event_delta"),
                "presentation": .string("text"),
                "enabledByDefault": .bool(false),
                "refreshIntervalMS": .integer(60000),
            ]),
            .object([
                "id": .string("notifications-status"),
                "title": .string("Notifications"),
                "placement": .string("combined_panel"),
                "metricKey": .string("system.notifications.availability_state"),
                "presentation": .string("icon"),
                "enabledByDefault": .bool(false),
                "refreshIntervalMS": .integer(60000),
            ]),
            .object([
                "id": .string("custom-context"),
                "title": .string("Context"),
                "placement": .string("combined_panel"),
                "metricKey": .string("context.custom.metric"),
                "presentation": .string("text"),
                "enabledByDefault": .bool(false),
                "refreshIntervalMS": .integer(60000),
            ]),
        ])
    }

    public static func rulesCatalog() -> JSONValue {
        .array([
            .object([
                "id": .string("system.memory.pressure.high"),
                "title": .string("High memory pressure"),
                "metric_key": .string("system.memory.pressure"),
                "operator": .string(">="),
                "threshold": .integer(2),
                "severity": .string("warning"),
                "enabled": .bool(false),
            ]),
            .object([
                "id": .string("system.disk.root.free.low"),
                "title": .string("Low root disk space"),
                "metric_key": .string("system.disk.free"),
                "operator": .string("<"),
                "threshold": .integer(20 * 1024 * 1024 * 1024),
                "severity": .string("warning"),
                "enabled": .bool(false),
            ]),
        ])
    }

    public static func controlsCatalog() -> JSONValue {
        .array(controlDefinitions.map(controlJSON))
    }

    public static func controlPlan(
        controlID: String?,
        target: String?,
        value: String?,
        reason: String?
    ) -> JSONValue {
        guard let controlID,
              let definition = controlDefinition(id: controlID) else {
            return .object([
                "schema_version": .integer(1),
                "status": .string("error"),
                "error": .string("unknown_control"),
                "control_id": controlID.map(JSONValue.string) ?? .null,
                "will_execute": .bool(false),
                "external_pending": .bool(true),
            ])
        }

        let timestamp = ISO8601DateFormatter().string(from: Date())
        let planID = "system-control-plan-\(controlID.replacingOccurrences(of: ".", with: "-"))-\(Int(Date().timeIntervalSince1970 * 1000))"
        let confirmationStepStatus = definition.requiresConfirmation ? "pending" : "skipped"

        return .object([
            "schema_version": .integer(1),
            "id": .string(planID),
            "created_at": .string(timestamp),
            "status": .string("planned"),
            "will_execute": .bool(false),
            "action": controlJSON(definition),
            "request": .object([
                "target": target.map(JSONValue.string) ?? .null,
                "value": value.map(JSONValue.string) ?? .null,
                "reason": reason.map(JSONValue.string) ?? .string("not_provided"),
            ]),
            "broker": .object([
                "required": .bool(true),
                "status": .string("external_pending"),
                "mode": .string("signed_host_plan_first"),
                "fail_closed": .bool(true),
            ]),
            "policy": .object([
                "requires_confirmation": .bool(definition.requiresConfirmation),
                "required_grants": .array(definition.requiredGrants.map(JSONValue.string)),
                "risk_tier": .string(definition.riskTier),
                "sensitive_detail_redacted": .bool(true),
            ]),
            "steps": .array([
                .object([
                    "id": .string("validate_grants"),
                    "owner": .string("signed_host_broker"),
                    "status": .string("pending"),
                ]),
                .object([
                    "id": .string("confirm_if_required"),
                    "owner": .string("signed_host_broker"),
                    "status": .string(confirmationStepStatus),
                ]),
                .object([
                    "id": .string("execute_native_action"),
                    "owner": .string("signed_host_broker"),
                    "status": .string("blocked"),
                    "reason": .string("Native mutation is not available from this plan-only surface."),
                ]),
                .object([
                    "id": .string("write_receipt"),
                    "owner": .string("monitor"),
                    "status": .string("pending"),
                ]),
                .object([
                    "id": .string("append_audit_event"),
                    "owner": .string("audit"),
                    "status": .string("pending"),
                ]),
            ]),
            "receipt": .object([
                "required": .bool(true),
                "status": .string("not_issued"),
                "audit_event": .string(definition.auditEvent),
            ]),
            "external_pending": .bool(true),
        ])
    }

    public static func snapshot() -> JSONValue {
        let now = ISO8601DateFormatter().string(from: Date())
        let definitionsByKey = Dictionary(uniqueKeysWithValues: metricDefinitions.map { ($0.key, $0) })
        let samples = sampleValues(timestamp: now)
        let availableKeys = Set(samples.compactMap { $0.objectValue?["metric_key"]?.stringValue })
        let unavailable = metricDefinitions
            .filter { !availableKeys.contains($0.key) }
            .map(unavailableMetricJSON)

        return .object([
            "schema_version": .integer(1),
            "captured_at": .string(now),
            "host": .object([
                "platform": .string("macos"),
                "hostname": .string(ProcessInfo.processInfo.hostName),
                "processor_count": .integer(ProcessInfo.processInfo.processorCount),
                "active_processor_count": .integer(ProcessInfo.processInfo.activeProcessorCount),
                "physical_memory_bytes": .integer(clampedInt(ProcessInfo.processInfo.physicalMemory)),
                "operating_system_version": .string(ProcessInfo.processInfo.operatingSystemVersionString),
            ]),
            "samples": .array(samples),
            "metrics": .array(samples.compactMap { sample in
                guard let key = sample.objectValue?["metric_key"]?.stringValue,
                      let definition = definitionsByKey[key] else {
                    return nil
                }
                return metricJSON(definition)
            }),
            "unavailable_metrics": .array(unavailable),
            "policy": .object([
                "default_agent_access": .string("safe_read"),
                "controls_require_signed_host_broker": .bool(true),
                "retention_owner": .string("monitor"),
                "privacy_tier": .string("aggregate"),
            ]),
            "source": .string("framework"),
        ])
    }

    public static func history(metricKey: String?, range: String?) -> JSONValue {
        .object([
            "metric_key": metricKey.map(JSONValue.string) ?? .null,
            "range": range.map(JSONValue.string) ?? .string("latest"),
            "values": .array([]),
            "source": .string("monitor"),
            "status": .string("not_recorded"),
            "reason": .string("Metric retention is owned by the Monitor store; no host-side samples have been recorded for this request."),
        ])
    }

    private static func sampleValues(timestamp: String) -> [JSONValue] {
        var samples: [JSONValue] = []

        let load = currentLoadAverage()
        samples.append(sample(
            key: "system.cpu.load1",
            value: load.oneMinute,
            unit: "load",
            timestamp: timestamp,
            confidence: "observed"
        ))
        samples.append(sample(
            key: "system.cpu.load5",
            value: load.fiveMinute,
            unit: "load",
            timestamp: timestamp,
            confidence: "observed"
        ))
        samples.append(sample(
            key: "system.cpu.load15",
            value: load.fifteenMinute,
            unit: "load",
            timestamp: timestamp,
            confidence: "observed"
        ))

        if let memory = currentMemoryStats() {
            samples.append(sample(
                key: "system.memory.used",
                value: Double(memory.usedBytes),
                unit: "bytes",
                timestamp: timestamp,
                confidence: "observed"
            ))
            samples.append(sample(
                key: "system.memory.free",
                value: Double(memory.freeBytes),
                unit: "bytes",
                timestamp: timestamp,
                confidence: "observed"
            ))
            samples.append(sample(
                key: "system.memory.pressure",
                value: Double(memory.pressure),
                unit: "state",
                timestamp: timestamp,
                confidence: "estimated"
            ))
        }

        if let disk = diskStats(path: "/") {
            samples.append(sample(
                key: "system.disk.used",
                value: Double(disk.usedBytes),
                unit: "bytes",
                timestamp: timestamp,
                confidence: "observed"
            ))
            samples.append(sample(
                key: "system.disk.free",
                value: Double(disk.freeBytes),
                unit: "bytes",
                timestamp: timestamp,
                confidence: "observed"
            ))
        }

        if let diskIO = diskIORateStats() {
            samples.append(sample(
                key: "system.disk.io_read",
                value: diskIO.bytesReadPerSecond,
                unit: "bytes_per_second",
                timestamp: timestamp,
                confidence: "estimated"
            ))
            samples.append(sample(
                key: "system.disk.io_write",
                value: diskIO.bytesWrittenPerSecond,
                unit: "bytes_per_second",
                timestamp: timestamp,
                confidence: "estimated"
            ))
        }

        if let gpu = gpuPerformanceStats() {
            if let utilization = gpu.utilizationPercent {
                samples.append(sample(
                    key: "system.gpu.utilization",
                    value: utilization,
                    unit: "percent",
                    timestamp: timestamp,
                    confidence: "experimental"
                ))
            }
            if let memoryUsed = gpu.memoryUsedBytes {
                samples.append(sample(
                    key: "system.gpu.memory_used_bytes",
                    value: Double(memoryUsed),
                    unit: "bytes",
                    timestamp: timestamp,
                    confidence: "experimental"
                ))
            }
        }

        if let sensors = hardwareSensorStats() {
            if let temperature = sensors.temperatureCelsius {
                samples.append(sample(
                    key: "system.sensor.temperature",
                    value: temperature,
                    unit: "celsius",
                    timestamp: timestamp,
                    confidence: "experimental"
                ))
            }
            if let fanSpeed = sensors.fanSpeedRPM {
                samples.append(sample(
                    key: "system.sensor.fan_speed",
                    value: fanSpeed,
                    unit: "rpm",
                    timestamp: timestamp,
                    confidence: "experimental"
                ))
            }
        }

        if let frequency = cpuFrequencyHz() {
            samples.append(sample(
                key: "system.cpu.frequency_hz",
                value: Double(frequency),
                unit: "hertz",
                timestamp: timestamp,
                confidence: "observed"
            ))
        }

        if let network = networkRateStats() {
            samples.append(sample(
                key: "system.network.bytes_in",
                value: network.bytesInPerSecond,
                unit: "bytes_per_second",
                timestamp: timestamp,
                confidence: "estimated"
            ))
            samples.append(sample(
                key: "system.network.bytes_out",
                value: network.bytesOutPerSecond,
                unit: "bytes_per_second",
                timestamp: timestamp,
                confidence: "estimated"
            ))
        }

        samples.append(sample(
            key: "system.power.uptime",
            value: ProcessInfo.processInfo.systemUptime,
            unit: "seconds",
            timestamp: timestamp,
            confidence: "observed"
        ))

        if let battery = batteryPercent() {
            samples.append(sample(
                key: "system.power.battery",
                value: battery,
                unit: "percent",
                timestamp: timestamp,
                confidence: "observed"
            ))
        }

        if let processCount = processCount() {
            samples.append(sample(
                key: "system.process.count",
                value: Double(processCount),
                unit: "count",
                timestamp: timestamp,
                confidence: "observed"
            ))
        }

        if let brightness = displayBrightnessPercent() {
            samples.append(sample(
                key: "system.display.brightness",
                value: brightness,
                unit: "percent",
                timestamp: timestamp,
                confidence: "observed"
            ))
        }

        if let volume = audioOutputVolumePercent() {
            samples.append(sample(
                key: "system.audio.output_volume",
                value: volume,
                unit: "percent",
                timestamp: timestamp,
                confidence: "observed"
            ))
        }

        if let peripherals = connectedPeripheralCount() {
            samples.append(sample(
                key: "system.peripheral.connected_count",
                value: Double(peripherals),
                unit: "count",
                timestamp: timestamp,
                confidence: "observed"
            ))
        }

        if let bluetoothPeripherals = bluetoothPeripheralCount() {
            samples.append(sample(
                key: "system.peripheral.bluetooth_count",
                value: Double(bluetoothPeripherals),
                unit: "count",
                timestamp: timestamp,
                confidence: "observed"
            ))
        }

        if let nextEventDelta = nextCalendarEventDeltaSeconds() {
            samples.append(sample(
                key: "system.calendar.next_event_delta",
                value: nextEventDelta,
                unit: "seconds",
                timestamp: timestamp,
                confidence: "observed"
            ))
        }

        if let dueReminders = dueReminderCount() {
            samples.append(sample(
                key: "context.reminders.due_count",
                value: Double(dueReminders),
                unit: "count",
                timestamp: timestamp,
                confidence: "observed"
            ))
        }

        if let buildStatus = stateContextValue(metricKey: "context.build.status", envKeys: ["CLAW_CONTEXT_BUILD_STATUS", "CLAW_SYSTEM_CONTEXT_BUILD_STATUS"], fileEnvKeys: ["CLAW_CONTEXT_BUILD_STATUS_FILE"]) {
            samples.append(sample(
                key: "context.build.status",
                value: buildStatus,
                unit: "state",
                timestamp: timestamp,
                confidence: "provider"
            ))
        }

        if let serviceHealth = stateContextValue(metricKey: "context.service.health", envKeys: ["CLAW_CONTEXT_SERVICE_HEALTH", "CLAW_SYSTEM_CONTEXT_SERVICE_HEALTH"], fileEnvKeys: ["CLAW_CONTEXT_SERVICE_HEALTH_FILE"]) {
            samples.append(sample(
                key: "context.service.health",
                value: serviceHealth,
                unit: "state",
                timestamp: timestamp,
                confidence: "provider"
            ))
        }

        if let activeRuns = numericContextValue(metricKey: "context.agent_runs.active", envKeys: ["CLAW_CONTEXT_AGENT_RUNS_ACTIVE", "CLAW_AGENT_RUNS_ACTIVE"], fileEnvKeys: ["CLAW_CONTEXT_AGENT_RUNS_FILE"]) {
            samples.append(sample(
                key: "context.agent_runs.active",
                value: max(0, activeRuns),
                unit: "count",
                timestamp: timestamp,
                confidence: "provider"
            ))
        }

        if let temperature = numericContextValue(metricKey: "context.weather.temperature", envKeys: ["CLAW_CONTEXT_WEATHER_TEMPERATURE", "CLAW_WEATHER_TEMPERATURE"], fileEnvKeys: ["CLAW_CONTEXT_WEATHER_FILE"]) {
            samples.append(sample(
                key: "context.weather.temperature",
                value: temperature,
                unit: "celsius",
                timestamp: timestamp,
                confidence: "provider"
            ))
        }

        if let focusMode = rawContextValue(metricKey: "system.focus.mode", envKeys: ["CLAW_CONTEXT_FOCUS_MODE", "CLAW_FOCUS_MODE"], fileEnvKeys: ["CLAW_CONTEXT_FOCUS_FILE"]) {
            samples.append(sample(
                key: "system.focus.mode",
                stringValue: focusMode,
                unit: "string",
                timestamp: timestamp,
                confidence: "provider"
            ))
        }

        samples.append(sample(
            key: "system.notifications.availability_state",
            value: notificationAuthorizationStateValue(),
            unit: "state",
            timestamp: timestamp,
            confidence: "observed"
        ))

        if let customMetric = rawContextValue(metricKey: "context.custom.metric", envKeys: ["CLAW_CONTEXT_CUSTOM_METRIC"], fileEnvKeys: ["CLAW_CONTEXT_CUSTOM_METRIC_FILE"]) {
            samples.append(sample(
                key: "context.custom.metric",
                stringValue: customMetric,
                unit: "string",
                timestamp: timestamp,
                confidence: "provider"
            ))
        }

        return samples
    }

    private static func sample(
        key: String,
        value: Double,
        unit: String,
        timestamp: String,
        confidence: String
    ) -> JSONValue {
        .object([
            "metric_key": .string(key),
            "value": .number(value),
            "unit": .string(unit),
            "captured_at": .string(timestamp),
            "source": .string("macos_host"),
            "confidence": .string(confidence),
        ])
    }

    private static func sample(
        key: String,
        stringValue: String,
        unit: String,
        timestamp: String,
        confidence: String
    ) -> JSONValue {
        .object([
            "metric_key": .string(key),
            "value": .string(stringValue),
            "unit": .string(unit),
            "captured_at": .string(timestamp),
            "source": .string("macos_host"),
            "confidence": .string(confidence),
        ])
    }

    private static func metricJSON(_ definition: MetricDefinition) -> JSONValue {
        .object([
            "key": .string(definition.key),
            "family": .string(definition.family),
            "label": .string(definition.label),
            "unit": .string(definition.unit),
            "sample_support": .string(definition.sampleSupport),
            "availability": .string(definition.availability),
            "privacy_tier": .string(definition.privacyTier),
            "agent_access": .string(definition.agentAccess),
            "retention": .string(definition.retention),
        ])
    }

    private static func unavailableMetricJSON(_ definition: MetricDefinition) -> JSONValue {
        .object([
            "metric_key": .string(definition.key),
            "availability": .string(definition.availability),
            "sample_support": .string(definition.sampleSupport),
            "reason": .string(definition.unavailableReason),
        ])
    }

    private static func providerJSON(_ definition: ProviderDefinition) -> JSONValue {
        .object([
            "id": .string(definition.id),
            "kind": .string(definition.kind),
            "label": .string(definition.label),
            "mode": .string(definition.mode),
            "status": .string(definition.status),
            "metricKeys": .array(definition.metricKeys.map(JSONValue.string)),
            "metrics": .array(definition.metricKeys.map(JSONValue.string)),
            "widgetIds": .array(definition.widgetIds.map(JSONValue.string)),
            "capabilities": .array(definition.capabilities.map(JSONValue.string)),
            "defaultEnabled": .bool(definition.defaultEnabled),
            "privacyTier": .string(definition.privacyTier),
            "requiresGrant": definition.requiresGrant.map(JSONValue.string) ?? .null,
            "credentialRefRequired": .bool(definition.credentialRefRequired),
            "freshnessMs": .integer(definition.freshnessMs),
            "description": .string(definition.description),
        ])
    }

    private static func controlJSON(_ definition: ControlDefinition) -> JSONValue {
        .object([
            "id": .string(definition.id),
            "family": .string(definition.family),
            "label": .string(definition.label),
            "target_metric_keys": .array(definition.targetMetricKeys.map(JSONValue.string)),
            "requires_signed_host_broker": .bool(true),
            "requires_confirmation": .bool(definition.requiresConfirmation),
            "required_grants": .array(definition.requiredGrants.map(JSONValue.string)),
            "risk_tier": .string(definition.riskTier),
            "availability": .string(definition.availability),
            "audit_event": .string(definition.auditEvent),
            "description": .string(definition.description),
        ])
    }

    private static func controlDefinition(id: String) -> ControlDefinition? {
        controlDefinitions.first { $0.id == id }
    }

    private static func providerDefinition(id: String) -> ProviderDefinition? {
        providerDefinitions.first { $0.id == id }
    }

    private static func currentLoadAverage() -> (oneMinute: Double, fiveMinute: Double, fifteenMinute: Double) {
        var loads = [Double](repeating: 0, count: 3)
        let count = getloadavg(&loads, 3)
        guard count > 0 else {
            return (0, 0, 0)
        }
        return (
            loads[0],
            count > 1 ? loads[1] : 0,
            count > 2 ? loads[2] : 0
        )
    }

    private static func currentMemoryStats() -> (usedBytes: UInt64, freeBytes: UInt64, pressure: Int)? {
        var stats = vm_statistics64()
        var count = mach_msg_type_number_t(MemoryLayout<vm_statistics64_data_t>.stride / MemoryLayout<integer_t>.stride)
        let result = withUnsafeMutablePointer(to: &stats) { pointer in
            pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { rebound in
                host_statistics64(mach_host_self(), HOST_VM_INFO64, rebound, &count)
            }
        }
        guard result == KERN_SUCCESS else {
            return nil
        }

        var rawPageSize: vm_size_t = 0
        guard host_page_size(mach_host_self(), &rawPageSize) == KERN_SUCCESS else {
            return nil
        }
        let pageSize = UInt64(rawPageSize)
        let free = UInt64(stats.free_count + stats.inactive_count) * pageSize
        let used = UInt64(stats.active_count + stats.wire_count + stats.compressor_page_count) * pageSize
        let total = max(ProcessInfo.processInfo.physicalMemory, 1)
        let pressureRatio = Double(used) / Double(total)
        let pressure: Int
        if pressureRatio >= 0.9 {
            pressure = 2
        } else if pressureRatio >= 0.75 {
            pressure = 1
        } else {
            pressure = 0
        }

        return (used, free, pressure)
    }

    private static func diskStats(path: String) -> (usedBytes: UInt64, freeBytes: UInt64)? {
        guard let attributes = try? FileManager.default.attributesOfFileSystem(forPath: path),
              let size = attributes[.systemSize] as? NSNumber,
              let free = attributes[.systemFreeSize] as? NSNumber else {
            return nil
        }
        let totalBytes = size.uint64Value
        let freeBytes = free.uint64Value
        return (totalBytes > freeBytes ? totalBytes - freeBytes : 0, freeBytes)
    }

    private static func diskIORateStats() -> (bytesReadPerSecond: Double, bytesWrittenPerSecond: Double)? {
        guard let first = diskIOCounters() else {
            return nil
        }
        let start = Date()
        usleep(100_000)
        guard let second = diskIOCounters() else {
            return nil
        }
        let elapsed = max(Date().timeIntervalSince(start), 0.001)
        let read = second.bytesRead >= first.bytesRead ? second.bytesRead - first.bytesRead : 0
        let written = second.bytesWritten >= first.bytesWritten ? second.bytesWritten - first.bytesWritten : 0
        return (
            bytesReadPerSecond: Double(read) / elapsed,
            bytesWrittenPerSecond: Double(written) / elapsed
        )
    }

    private static func diskIOCounters() -> (bytesRead: UInt64, bytesWritten: UInt64)? {
        var iterator: io_iterator_t = 0
        guard IOServiceGetMatchingServices(kIOMainPortDefault, IOServiceMatching("IOBlockStorageDriver"), &iterator) == KERN_SUCCESS else {
            return nil
        }
        defer { IOObjectRelease(iterator) }

        var bytesRead: UInt64 = 0
        var bytesWritten: UInt64 = 0
        var service = IOIteratorNext(iterator)
        while service != 0 {
            if let statistics = IORegistryEntryCreateCFProperty(
                service,
                "Statistics" as CFString,
                kCFAllocatorDefault,
                0
            )?.takeRetainedValue() as? [String: Any] {
                bytesRead += uint64(from: statistics["Bytes (Read)"]) ?? 0
                bytesWritten += uint64(from: statistics["Bytes (Write)"]) ?? 0
            }
            IOObjectRelease(service)
            service = IOIteratorNext(iterator)
        }

        return bytesRead > 0 || bytesWritten > 0 ? (bytesRead, bytesWritten) : nil
    }

    private static func gpuPerformanceStats() -> (utilizationPercent: Double?, memoryUsedBytes: UInt64?)? {
        guard let statistics = ioRegistryDictionaryProperty(
            matchingClasses: ["IOAccelerator", "AGXAccelerator"],
            propertyName: "PerformanceStatistics"
        ) else {
            return nil
        }

        let utilization = clampedPercent(statisticValue(
            in: statistics,
            exactKeys: [
                "Device Utilization %",
                "Renderer Utilization %",
                "Tiler Utilization %",
            ],
            fallbackFragments: ["utilization"]
        ))
        let memoryUsed = uint64Statistic(
            in: statistics,
            exactKeys: [
                "In use system memory",
                "In use system memory (driver)",
                "Device Memory Used",
                "VRAM Used",
                "vramUsedBytes",
            ],
            fallbackFragments: ["in use", "memory used", "vram used"]
        )

        guard utilization != nil || memoryUsed != nil else {
            return nil
        }
        return (utilization, memoryUsed)
    }

    private static func ioRegistryDictionaryProperty(
        matchingClasses: [String],
        propertyName: String
    ) -> [String: Any]? {
        for matchingClass in matchingClasses {
            var iterator: io_iterator_t = 0
            guard IOServiceGetMatchingServices(kIOMainPortDefault, IOServiceMatching(matchingClass), &iterator) == KERN_SUCCESS else {
                continue
            }
            defer { IOObjectRelease(iterator) }

            var service = IOIteratorNext(iterator)
            while service != 0 {
                let value = IORegistryEntryCreateCFProperty(
                    service,
                    propertyName as CFString,
                    kCFAllocatorDefault,
                    0
                )?.takeRetainedValue()
                IOObjectRelease(service)

                if let dictionary = value as? [String: Any] {
                    return dictionary
                }
                service = IOIteratorNext(iterator)
            }
        }
        return nil
    }

    private static func statisticValue(
        in statistics: [String: Any],
        exactKeys: [String],
        fallbackFragments: [String]
    ) -> Double? {
        for key in exactKeys {
            if let value = double(from: statistics[key]) {
                return value
            }
        }

        let loweredFragments = fallbackFragments.map { $0.lowercased() }
        for (key, value) in statistics {
            let loweredKey = key.lowercased()
            if loweredFragments.contains(where: { loweredKey.contains($0) }),
               let numeric = double(from: value) {
                return numeric
            }
        }
        return nil
    }

    private static func uint64Statistic(
        in statistics: [String: Any],
        exactKeys: [String],
        fallbackFragments: [String]
    ) -> UInt64? {
        for key in exactKeys {
            if let value = uint64(from: statistics[key]) {
                return value
            }
        }

        let loweredFragments = fallbackFragments.map { $0.lowercased() }
        for (key, value) in statistics {
            let loweredKey = key.lowercased()
            if loweredFragments.contains(where: { loweredKey.contains($0) }),
               let numeric = uint64(from: value) {
                return numeric
            }
        }
        return nil
    }

    private static func cpuFrequencyHz() -> UInt64? {
        var frequency: UInt64 = 0
        var size = MemoryLayout<UInt64>.size
        guard sysctlbyname("hw.cpufrequency", &frequency, &size, nil, 0) == 0,
              frequency > 0 else {
            return nil
        }
        return frequency
    }

    private static func processCount() -> Int? {
        var mib = [CTL_KERN, KERN_PROC, KERN_PROC_ALL, 0]
        var size = 0
        guard sysctl(&mib, u_int(mib.count), nil, &size, nil, 0) == 0,
              size > 0 else {
            return nil
        }
        return size / MemoryLayout<kinfo_proc>.stride
    }

    private static func networkRateStats() -> (bytesInPerSecond: Double, bytesOutPerSecond: Double)? {
        guard let first = networkCounters() else {
            return nil
        }
        let start = Date()
        usleep(100_000)
        guard let second = networkCounters() else {
            return nil
        }
        let elapsed = max(Date().timeIntervalSince(start), 0.001)
        let bytesIn = second.bytesIn >= first.bytesIn ? second.bytesIn - first.bytesIn : 0
        let bytesOut = second.bytesOut >= first.bytesOut ? second.bytesOut - first.bytesOut : 0
        return (
            bytesInPerSecond: Double(bytesIn) / elapsed,
            bytesOutPerSecond: Double(bytesOut) / elapsed
        )
    }

    private static func networkCounters() -> (bytesIn: UInt64, bytesOut: UInt64)? {
        var interfaces: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&interfaces) == 0, let first = interfaces else {
            return nil
        }
        defer { freeifaddrs(interfaces) }

        var bytesIn: UInt64 = 0
        var bytesOut: UInt64 = 0
        var cursor: UnsafeMutablePointer<ifaddrs>? = first
        while let current = cursor {
            let interface = current.pointee
            let flags = Int32(interface.ifa_flags)
            let isUp = (flags & IFF_UP) != 0
            let isLoopback = (flags & IFF_LOOPBACK) != 0
            if isUp, !isLoopback, let rawData = interface.ifa_data {
                let data = rawData.assumingMemoryBound(to: if_data.self).pointee
                bytesIn += UInt64(data.ifi_ibytes)
                bytesOut += UInt64(data.ifi_obytes)
            }
            cursor = interface.ifa_next
        }

        return bytesIn > 0 || bytesOut > 0 ? (bytesIn, bytesOut) : nil
    }

    private static func batteryPercent() -> Double? {
        guard let info = IOPSCopyPowerSourcesInfo()?.takeRetainedValue(),
              let sources = IOPSCopyPowerSourcesList(info)?.takeRetainedValue() as? [CFTypeRef] else {
            return nil
        }

        for source in sources {
            guard let description = IOPSGetPowerSourceDescription(info, source)?.takeUnretainedValue() as? [String: Any],
                  let current = description[kIOPSCurrentCapacityKey as String] as? NSNumber,
                  let max = description[kIOPSMaxCapacityKey as String] as? NSNumber,
                  max.doubleValue > 0 else {
                continue
            }
            return (current.doubleValue / max.doubleValue) * 100
        }
        return nil
    }

    private static func displayBrightnessPercent() -> Double? {
        var iterator: io_iterator_t = 0
        guard IOServiceGetMatchingServices(kIOMainPortDefault, IOServiceMatching("IODisplayConnect"), &iterator) == KERN_SUCCESS else {
            return nil
        }
        defer { IOObjectRelease(iterator) }

        var service = IOIteratorNext(iterator)
        while service != 0 {
            var brightness: Float = 0
            let result = IODisplayGetFloatParameter(service, 0, kIODisplayBrightnessKey as CFString, &brightness)
            IOObjectRelease(service)
            if result == kIOReturnSuccess {
                return Double(min(max(brightness, 0), 1) * 100)
            }
            service = IOIteratorNext(iterator)
        }
        return nil
    }

    private static func audioOutputVolumePercent() -> Double? {
        var deviceID = AudioDeviceID(0)
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultOutputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )

        guard AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject),
            &address,
            0,
            nil,
            &size,
            &deviceID
        ) == noErr, deviceID != 0 else {
            return nil
        }

        if let master = audioVolumePercent(deviceID: deviceID, element: kAudioObjectPropertyElementMain) {
            return master
        }

        let channels = [AudioObjectPropertyElement(1), AudioObjectPropertyElement(2)]
            .compactMap { audioVolumePercent(deviceID: deviceID, element: $0) }
        guard !channels.isEmpty else {
            return nil
        }
        return channels.reduce(0, +) / Double(channels.count)
    }

    private static func audioVolumePercent(deviceID: AudioDeviceID, element: AudioObjectPropertyElement) -> Double? {
        var volume = Float32(0)
        var size = UInt32(MemoryLayout<Float32>.size)
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyVolumeScalar,
            mScope: kAudioDevicePropertyScopeOutput,
            mElement: element
        )
        guard AudioObjectHasProperty(deviceID, &address),
              AudioObjectGetPropertyData(deviceID, &address, 0, nil, &size, &volume) == noErr else {
            return nil
        }
        return Double(min(max(volume, 0), 1) * 100)
    }

    private static func connectedPeripheralCount() -> Int? {
        if let usbHostDevices = ioServiceCount(matchingClass: "IOUSBHostDevice") {
            return usbHostDevices
        }
        return ioServiceCount(matchingClass: "IOUSBDevice")
    }

    private static func bluetoothPeripheralCount() -> Int? {
        if let bluetoothDevices = ioServiceCount(matchingClass: "IOBluetoothDevice") {
            return bluetoothDevices
        }
        return ioServiceCount(matchingClass: "IOBluetoothHIDDriver")
    }

    private static func notificationAuthorizationStateValue() -> Double {
        switch PermissionService().status(for: .notifications) {
        case .authorized:
            return 0
        case .notRequested, .notApplicable:
            return 1
        case .denied:
            return 2
        }
    }

    private static func ioServiceCount(matchingClass: String) -> Int? {
        var iterator: io_iterator_t = 0
        guard IOServiceGetMatchingServices(kIOMainPortDefault, IOServiceMatching(matchingClass), &iterator) == KERN_SUCCESS else {
            return nil
        }
        defer { IOObjectRelease(iterator) }

        var count = 0
        var service = IOIteratorNext(iterator)
        while service != 0 {
            count += 1
            IOObjectRelease(service)
            service = IOIteratorNext(iterator)
        }
        return count
    }

    private static func hardwareSensorStats() -> (temperatureCelsius: Double?, fanSpeedRPM: Double?)? {
        guard let reader = SMCReadOnlySensorReader.open() else {
            return nil
        }
        defer { reader.close() }

        let temperatures = [
            "TC0P", "TC0E", "TC0F", "TC0D",
            "TG0P", "TG0D",
            "Tm0P", "Ts0P",
        ].compactMap { reader.readTemperatureCelsius(key: $0) }
        let fanCount = max(0, min(reader.readUInt8(key: "FNum") ?? 0, 8))
        let fanSpeeds = (0..<fanCount).compactMap { index in
            reader.readFanSpeedRPM(key: "F\(index)Ac")
        }

        let temperature = average(temperatures)
        let fanSpeed = average(fanSpeeds)
        guard temperature != nil || fanSpeed != nil else {
            return nil
        }
        return (temperature, fanSpeed)
    }

    private static func average(_ values: [Double]) -> Double? {
        guard !values.isEmpty else {
            return nil
        }
        return values.reduce(0, +) / Double(values.count)
    }

    private static func nextCalendarEventDeltaSeconds(now: Date = Date()) -> Double? {
        guard hasEventKitAccess(for: .event) else { return nil }
        let store = EKEventStore()
        let end = now.addingTimeInterval(24 * 60 * 60)
        let predicate = store.predicateForEvents(withStart: now, end: end, calendars: nil)
        let events = store.events(matching: predicate)
            .filter { !$0.isAllDay && $0.endDate > now }
            .sorted { $0.startDate < $1.startDate }
        guard let event = events.first else { return nil }
        return max(0, event.startDate.timeIntervalSince(now))
    }

    private static func dueReminderCount(now: Date = Date()) -> Int? {
        guard hasEventKitAccess(for: .reminder) else { return nil }
        let store = EKEventStore()
        let end = now.addingTimeInterval(24 * 60 * 60)
        let predicate = store.predicateForIncompleteReminders(withDueDateStarting: nil, ending: end, calendars: nil)
        let semaphore = DispatchSemaphore(value: 0)
        var result: [EKReminder]?
        store.fetchReminders(matching: predicate) { reminders in
            result = reminders
            semaphore.signal()
        }
        _ = semaphore.wait(timeout: .now() + 2)
        return result?.filter { reminder in
            guard let dueDate = reminder.dueDateComponents?.date else { return false }
            return dueDate <= end
        }.count
    }

    private static func hasEventKitAccess(for entity: EKEntityType) -> Bool {
        let status = EKEventStore.authorizationStatus(for: entity)
        return status == .fullAccess
    }

    private static func stateContextValue(metricKey: String, envKeys: [String], fileEnvKeys: [String]) -> Double? {
        guard let raw = rawContextValue(metricKey: metricKey, envKeys: envKeys, fileEnvKeys: fileEnvKeys) else {
            return nil
        }
        return stateValue(raw)
    }

    private static func numericContextValue(metricKey: String, envKeys: [String], fileEnvKeys: [String]) -> Double? {
        guard let raw = rawContextValue(metricKey: metricKey, envKeys: envKeys, fileEnvKeys: fileEnvKeys) else {
            return nil
        }
        return Double(raw.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    private static func rawContextValue(metricKey: String, envKeys: [String], fileEnvKeys: [String]) -> String? {
        let environment = ProcessInfo.processInfo.environment
        for key in envKeys {
            if let value = nonEmpty(environment[key]) {
                return value
            }
        }
        for key in fileEnvKeys {
            guard let path = nonEmpty(environment[key]) else { continue }
            if let value = contextValueFromFile(path: path, metricKey: metricKey) {
                return value
            }
        }
        return nil
    }

    private static func contextValueFromFile(path: String, metricKey: String) -> String? {
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)) else {
            return nil
        }
        if let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            let normalizedKey = metricKey.replacingOccurrences(of: ".", with: "_")
            for key in [metricKey, normalizedKey, "value"] {
                if let value = object[key] {
                    return stringContextValue(value)
                }
            }
        }
        return String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
    }

    private static func stringContextValue(_ value: Any) -> String? {
        switch value {
        case let value as String:
            return value.nilIfEmpty
        case let value as NSNumber:
            return value.stringValue
        case let value as Bool:
            return value ? "true" : "false"
        default:
            return nil
        }
    }

    private static func stateValue(_ raw: String) -> Double? {
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if let numeric = Double(value) {
            return numeric
        }
        switch value {
        case "ok", "pass", "passed", "success", "succeeded", "healthy", "green", "clean", "idle":
            return 0
        case "warn", "warning", "pending", "running", "busy", "degraded", "yellow":
            return 1
        case "fail", "failed", "failure", "error", "unhealthy", "red", "broken":
            return 2
        default:
            return nil
        }
    }

    private static func nonEmpty(_ value: String?) -> String? {
        value?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
    }

    private static func uint64(from value: Any?) -> UInt64? {
        switch value {
        case let value as UInt64:
            return value
        case let value as UInt:
            return UInt64(value)
        case let value as Int where value >= 0:
            return UInt64(value)
        case let value as NSNumber:
            return value.uint64Value
        default:
            return nil
        }
    }

    private static func double(from value: Any?) -> Double? {
        switch value {
        case let value as Double:
            return value
        case let value as Float:
            return Double(value)
        case let value as UInt64:
            return Double(value)
        case let value as UInt:
            return Double(value)
        case let value as Int:
            return Double(value)
        case let value as NSNumber:
            return value.doubleValue
        default:
            return nil
        }
    }

    private static func clampedPercent(_ value: Double?) -> Double? {
        guard let value else {
            return nil
        }
        return min(max(value, 0), 100)
    }

    private static func clampedInt(_ value: UInt64) -> Int {
        value > UInt64(Int.max) ? Int.max : Int(value)
    }
}

private extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}

private struct MetricDefinition: Sendable {
    var key: String
    var family: String
    var label: String
    var unit: String
    var sampleSupport: String
    var availability: String
    var privacyTier: String
    var agentAccess: String
    var retention: String
    var unavailableReason: String
}

private struct ProviderDefinition: Sendable {
    var id: String
    var kind: String
    var label: String
    var mode: String
    var status: String
    var metricKeys: [String]
    var widgetIds: [String]
    var capabilities: [String]
    var defaultEnabled: Bool
    var privacyTier: String
    var requiresGrant: String?
    var credentialRefRequired: Bool
    var freshnessMs: Int
    var description: String
}

private struct ControlDefinition: Sendable {
    var id: String
    var family: String
    var label: String
    var targetMetricKeys: [String]
    var requiresConfirmation: Bool
    var requiredGrants: [String]
    var riskTier: String
    var availability: String
    var auditEvent: String
    var description: String
}

private final class SMCReadOnlySensorReader {
    private let connection: io_connect_t

    private init(connection: io_connect_t) {
        self.connection = connection
    }

    static func open() -> SMCReadOnlySensorReader? {
        let service = IOServiceGetMatchingService(kIOMainPortDefault, IOServiceMatching("AppleSMC"))
        guard service != 0 else {
            return nil
        }
        defer { IOObjectRelease(service) }

        var connection: io_connect_t = 0
        guard IOServiceOpen(service, mach_task_self_, 0, &connection) == KERN_SUCCESS,
              connection != 0 else {
            return nil
        }
        return SMCReadOnlySensorReader(connection: connection)
    }

    func close() {
        IOServiceClose(connection)
    }

    func readTemperatureCelsius(key: String) -> Double? {
        guard let value = read(key: key) else {
            return nil
        }
        switch value.type {
        case "sp78":
            guard value.bytes.count >= 2 else { return nil }
            let raw = Int16(bitPattern: UInt16(value.bytes[0]) << 8 | UInt16(value.bytes[1]))
            return Double(raw) / 256.0
        case "flt ":
            return value.float32
        default:
            return nil
        }
    }

    func readFanSpeedRPM(key: String) -> Double? {
        guard let value = read(key: key) else {
            return nil
        }
        switch value.type {
        case "fpe2":
            guard value.bytes.count >= 2 else { return nil }
            let raw = UInt16(value.bytes[0]) << 8 | UInt16(value.bytes[1])
            return Double(raw) / 4.0
        case "flt ":
            return value.float32
        default:
            return nil
        }
    }

    func readUInt8(key: String) -> Int? {
        guard let value = read(key: key),
              let first = value.bytes.first else {
            return nil
        }
        return Int(first)
    }

    private func read(key: String) -> SMCReadValue? {
        guard let keyCode = SMCParamStruct.keyCode(key) else {
            return nil
        }

        var input = SMCParamStruct()
        var output = SMCParamStruct()
        input.key = keyCode
        input.data8 = SMCCommand.readKeyInfo
        guard call(input: &input, output: &output) == KERN_SUCCESS,
              output.result == 0,
              output.keyInfo.dataSize > 0 else {
            return nil
        }

        input = SMCParamStruct()
        input.key = keyCode
        input.keyInfo = output.keyInfo
        input.data8 = SMCCommand.readBytes
        output = SMCParamStruct()
        guard call(input: &input, output: &output) == KERN_SUCCESS,
              output.result == 0 else {
            return nil
        }

        let size = min(Int(input.keyInfo.dataSize), SMCParamStruct.byteCapacity)
        return SMCReadValue(
            type: SMCParamStruct.string(from: input.keyInfo.dataType),
            bytes: output.byteArray(prefix: size)
        )
    }

    private func call(input: inout SMCParamStruct, output: inout SMCParamStruct) -> kern_return_t {
        var outputSize = MemoryLayout<SMCParamStruct>.stride
        return withUnsafePointer(to: &input) { inputPointer in
            withUnsafeMutablePointer(to: &output) { outputPointer in
                IOConnectCallStructMethod(
                    connection,
                    SMCCommand.kernelIndex,
                    inputPointer,
                    MemoryLayout<SMCParamStruct>.stride,
                    outputPointer,
                    &outputSize
                )
            }
        }
    }
}

private enum SMCCommand {
    static let kernelIndex: UInt32 = 2
    static let readBytes: UInt8 = 5
    static let readKeyInfo: UInt8 = 9
}

private struct SMCReadValue {
    var type: String
    var bytes: [UInt8]

    var float32: Double? {
        guard bytes.count >= 4 else {
            return nil
        }
        let bits = UInt32(bytes[0]) << 24
            | UInt32(bytes[1]) << 16
            | UInt32(bytes[2]) << 8
            | UInt32(bytes[3])
        return Double(Float32(bitPattern: bits))
    }
}

private struct SMCVersion {
    var major: UInt8 = 0
    var minor: UInt8 = 0
    var build: UInt8 = 0
    var reserved: UInt8 = 0
    var release: UInt16 = 0
}

private struct SMCPLimitData {
    var version: UInt16 = 0
    var length: UInt16 = 0
    var cpuPLimit: UInt32 = 0
    var gpuPLimit: UInt32 = 0
    var memPLimit: UInt32 = 0
}

private struct SMCKeyInfoData {
    var dataSize: UInt32 = 0
    var dataType: UInt32 = 0
    var dataAttributes: UInt8 = 0
}

private struct SMCParamStruct {
    static let byteCapacity = 32

    var key: UInt32 = 0
    var vers = SMCVersion()
    var pLimitData = SMCPLimitData()
    var keyInfo = SMCKeyInfoData()
    var result: UInt8 = 0
    var status: UInt8 = 0
    var data8: UInt8 = 0
    var data32: UInt32 = 0
    var bytes: (
        UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8,
        UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8,
        UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8,
        UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8, UInt8
    ) = (
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0
    )

    func byteArray(prefix count: Int) -> [UInt8] {
        withUnsafeBytes(of: bytes) { rawBuffer in
            Array(rawBuffer.prefix(max(0, min(count, Self.byteCapacity))))
        }
    }

    static func keyCode(_ key: String) -> UInt32? {
        let bytes = Array(key.utf8)
        guard bytes.count == 4 else {
            return nil
        }
        return UInt32(bytes[0]) << 24
            | UInt32(bytes[1]) << 16
            | UInt32(bytes[2]) << 8
            | UInt32(bytes[3])
    }

    static func string(from code: UInt32) -> String {
        let bytes: [UInt8] = [
            UInt8((code >> 24) & 0xff),
            UInt8((code >> 16) & 0xff),
            UInt8((code >> 8) & 0xff),
            UInt8(code & 0xff),
        ]
        return String(bytes: bytes, encoding: .ascii) ?? ""
    }
}

private let metricDefinitions: [MetricDefinition] = [
    .init(key: "system.cpu.load1", family: "cpu", label: "CPU load 1m", unit: "load", sampleSupport: "snapshot_history", availability: "available", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: ""),
    .init(key: "system.cpu.load5", family: "cpu", label: "CPU load 5m", unit: "load", sampleSupport: "snapshot_history", availability: "available", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: ""),
    .init(key: "system.cpu.load15", family: "cpu", label: "CPU load 15m", unit: "load", sampleSupport: "snapshot_history", availability: "available", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: ""),
    .init(key: "system.cpu.frequency_hz", family: "cpu", label: "CPU frequency", unit: "hertz", sampleSupport: "snapshot_history", availability: "host_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: "Requires signed host broker or platform-specific provider."),
    .init(key: "system.gpu.utilization", family: "gpu", label: "GPU utilization", unit: "percent", sampleSupport: "snapshot_history", availability: "host_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: "Requires graphics provider integration."),
    .init(key: "system.gpu.memory_used_bytes", family: "gpu", label: "GPU memory used", unit: "bytes", sampleSupport: "snapshot_history", availability: "host_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: "Requires graphics provider integration."),
    .init(key: "system.memory.used", family: "memory", label: "Memory used", unit: "bytes", sampleSupport: "snapshot_history", availability: "available", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: ""),
    .init(key: "system.memory.free", family: "memory", label: "Memory free", unit: "bytes", sampleSupport: "snapshot_history", availability: "available", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: ""),
    .init(key: "system.memory.pressure", family: "memory", label: "Memory pressure", unit: "state", sampleSupport: "snapshot_history", availability: "available", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: ""),
    .init(key: "system.disk.used", family: "disk", label: "Root disk used", unit: "bytes", sampleSupport: "snapshot_history", availability: "available", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: ""),
    .init(key: "system.disk.free", family: "disk", label: "Root disk free", unit: "bytes", sampleSupport: "snapshot_history", availability: "available", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: ""),
    .init(key: "system.disk.io_read", family: "disk", label: "Disk read throughput", unit: "bytes_per_second", sampleSupport: "snapshot_history", availability: "host_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: "Requires disk I/O provider integration."),
    .init(key: "system.disk.io_write", family: "disk", label: "Disk write throughput", unit: "bytes_per_second", sampleSupport: "snapshot_history", availability: "host_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: "Requires disk I/O provider integration."),
    .init(key: "system.network.bytes_in", family: "network", label: "Network in", unit: "bytes_per_second", sampleSupport: "snapshot_history", availability: "host_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: "Requires network interface sampler."),
    .init(key: "system.network.bytes_out", family: "network", label: "Network out", unit: "bytes_per_second", sampleSupport: "snapshot_history", availability: "host_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: "Requires network interface sampler."),
    .init(key: "system.network.public_ip", family: "network", label: "Public IP", unit: "string", sampleSupport: "snapshot", availability: "provider_required", privacyTier: "sensitive", agentAccess: "restricted", retention: "latest_only", unavailableReason: "Requires explicit external network lookup."),
    .init(key: "system.sensor.temperature", family: "sensor", label: "Temperature", unit: "celsius", sampleSupport: "snapshot_history", availability: "host_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: "Requires compatible read-only AppleSMC sensor service or another signed hardware sensor provider."),
    .init(key: "system.sensor.fan_speed", family: "sensor", label: "Fan speed", unit: "rpm", sampleSupport: "snapshot_history", availability: "host_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: "Requires compatible read-only AppleSMC fan service or another signed hardware sensor provider."),
    .init(key: "system.power.uptime", family: "power", label: "Uptime", unit: "seconds", sampleSupport: "snapshot_history", availability: "available", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: ""),
    .init(key: "system.power.battery", family: "power", label: "Battery", unit: "percent", sampleSupport: "snapshot_history", availability: "host_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: "Requires power source provider."),
    .init(key: "system.process.count", family: "process", label: "Process count", unit: "count", sampleSupport: "snapshot_history", availability: "host_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: "Requires process provider."),
    .init(key: "system.display.brightness", family: "display", label: "Display brightness", unit: "percent", sampleSupport: "snapshot_history", availability: "permission_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "latest_only", unavailableReason: "Requires display provider and local permission policy."),
    .init(key: "system.audio.output_volume", family: "audio", label: "Output volume", unit: "percent", sampleSupport: "snapshot_history", availability: "permission_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "latest_only", unavailableReason: "Requires audio provider and local permission policy."),
    .init(key: "system.peripheral.connected_count", family: "peripheral", label: "Connected peripherals", unit: "count", sampleSupport: "snapshot_history", availability: "host_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: "Requires I/O registry provider."),
    .init(key: "system.peripheral.bluetooth_count", family: "peripheral", label: "Bluetooth peripherals", unit: "count", sampleSupport: "snapshot_history", availability: "host_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: "Requires Bluetooth provider."),
    .init(key: "system.focus.mode", family: "focus", label: "Focus mode", unit: "string", sampleSupport: "snapshot", availability: "provider_required", privacyTier: "personal", agentAccess: "restricted", retention: "latest_only", unavailableReason: "Requires user-context provider."),
    .init(key: "system.notifications.availability_state", family: "notification", label: "Notification availability", unit: "state", sampleSupport: "snapshot_history", availability: "host_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "latest_only", unavailableReason: "Requires notification permission provider."),
    .init(key: "system.calendar.next_event_delta", family: "calendar_time", label: "Next event", unit: "seconds", sampleSupport: "snapshot_history", availability: "permission_required", privacyTier: "personal", agentAccess: "restricted", retention: "latest_only", unavailableReason: "Requires calendar permission and user-context provider."),
    .init(key: "context.weather.temperature", family: "weather_context", label: "Weather temperature", unit: "celsius", sampleSupport: "snapshot_history", availability: "provider_required", privacyTier: "contextual", agentAccess: "safe_read", retention: "timeseries", unavailableReason: "Requires configured weather provider."),
    .init(key: "context.build.status", family: "local_context", label: "Build status", unit: "state", sampleSupport: "snapshot_history", availability: "provider_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "latest_only", unavailableReason: "Requires build status provider."),
    .init(key: "context.service.health", family: "local_context", label: "Local service health", unit: "state", sampleSupport: "snapshot_stream_history", availability: "provider_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: "Requires local service provider."),
    .init(key: "context.agent_runs.active", family: "local_context", label: "Active agent runs", unit: "count", sampleSupport: "snapshot_stream_history", availability: "provider_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: "Requires agent runtime provider."),
    .init(key: "context.reminders.due_count", family: "local_context", label: "Due reminders", unit: "count", sampleSupport: "snapshot_history", availability: "permission_required", privacyTier: "personal", agentAccess: "restricted", retention: "latest_only", unavailableReason: "Requires reminders permission."),
    .init(key: "context.custom.metric", family: "local_context", label: "Custom context metric", unit: "string", sampleSupport: "snapshot_history", availability: "provider_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: "Requires custom context provider."),
]

private let providerDefinitions: [ProviderDefinition] = [
    .init(id: "context.weather.mock", kind: "weather", label: "Mock weather context", mode: "mock", status: "ready", metricKeys: ["context.weather.temperature"], widgetIds: ["weather-temperature"], capabilities: ["snapshot", "history"], defaultEnabled: false, privacyTier: "precise_location", requiresGrant: "weather.location.read", credentialRefRequired: false, freshnessMs: 900000, description: "Offline fixture provider for weather widgets and tests."),
    .init(id: "context.weather.live", kind: "weather", label: "Live weather context", mode: "live", status: "external_pending", metricKeys: ["context.weather.temperature"], widgetIds: ["weather-temperature"], capabilities: ["snapshot", "history"], defaultEnabled: false, privacyTier: "precise_location", requiresGrant: "weather.location.read", credentialRefRequired: true, freshnessMs: 900000, description: "Live provider slot for weather data; it remains disabled until configured with a grant and credential reference."),
    .init(id: "system.sensors.signed", kind: "hardware_sensor", label: "Signed hardware sensor provider", mode: "live", status: "external_pending", metricKeys: ["system.sensor.temperature", "system.sensor.fan_speed"], widgetIds: [], capabilities: ["snapshot", "history"], defaultEnabled: false, privacyTier: "safe_aggregate", requiresGrant: "system.sensor.read", credentialRefRequired: false, freshnessMs: 5000, description: "Signed hardware sensor provider slot for temperature and fan speed readings when the host can validate compatible hardware access."),
    .init(id: "context.build.offline", kind: "build_status", label: "Build status context", mode: "offline", status: "ready", metricKeys: ["context.build.status"], widgetIds: ["build-status"], capabilities: ["snapshot", "history"], defaultEnabled: false, privacyTier: "safe_aggregate", requiresGrant: nil, credentialRefRequired: false, freshnessMs: 30000, description: "Offline provider contract for local build or CI status indicators."),
    .init(id: "context.services.offline", kind: "local_service", label: "Local service health context", mode: "offline", status: "ready", metricKeys: ["context.service.health"], widgetIds: ["service-health"], capabilities: ["snapshot", "stream", "history"], defaultEnabled: false, privacyTier: "safe_aggregate", requiresGrant: nil, credentialRefRequired: false, freshnessMs: 10000, description: "Offline provider contract for local service status indicators."),
    .init(id: "context.agent-runs.offline", kind: "agent_run", label: "Agent run context", mode: "offline", status: "ready", metricKeys: ["context.agent_runs.active"], widgetIds: ["agent-runs-active"], capabilities: ["snapshot", "stream", "history"], defaultEnabled: false, privacyTier: "safe_aggregate", requiresGrant: nil, credentialRefRequired: false, freshnessMs: 5000, description: "Offline provider contract for active local agent run indicators."),
    .init(id: "context.reminders.offline", kind: "reminder", label: "Reminder context", mode: "offline", status: "ready", metricKeys: ["context.reminders.due_count"], widgetIds: ["reminders-due"], capabilities: ["snapshot", "history"], defaultEnabled: false, privacyTier: "calendar_private", requiresGrant: "reminders.read", credentialRefRequired: false, freshnessMs: 60000, description: "Offline provider contract for reminder counts without exposing reminder content."),
    .init(id: "context.calendar.offline", kind: "calendar", label: "Calendar context", mode: "offline", status: "ready", metricKeys: ["system.calendar.next_event_delta"], widgetIds: ["calendar-next-event"], capabilities: ["snapshot", "history"], defaultEnabled: false, privacyTier: "calendar_private", requiresGrant: "calendar.read", credentialRefRequired: false, freshnessMs: 60000, description: "Offline provider contract for calendar timing indicators without event detail."),
    .init(id: "context.custom.offline", kind: "custom_metric", label: "Custom context metric", mode: "offline", status: "ready", metricKeys: ["context.custom.metric"], widgetIds: ["custom-context"], capabilities: ["snapshot", "history"], defaultEnabled: false, privacyTier: "safe_aggregate", requiresGrant: nil, credentialRefRequired: false, freshnessMs: 60000, description: "Offline provider contract for user-defined context metrics."),
]

private let controlDefinitions: [ControlDefinition] = [
    .init(
        id: "system.fan.set_speed",
        family: "fan",
        label: "Set fan speed",
        targetMetricKeys: ["system.sensor.fan_speed", "system.sensor.temperature"],
        requiresConfirmation: true,
        requiredGrants: ["system.hardware.control", "system.sensor.read"],
        riskTier: "high",
        availability: "external_pending",
        auditEvent: "system.telemetry.control.fan.set_speed",
        description: "Plan-only contract for fan speed changes through a signed host broker."
    ),
    .init(
        id: "system.power.set_mode",
        family: "power",
        label: "Set power mode",
        targetMetricKeys: ["system.power.battery", "system.power.uptime"],
        requiresConfirmation: true,
        requiredGrants: ["system.power.control"],
        riskTier: "medium",
        availability: "external_pending",
        auditEvent: "system.telemetry.control.power.set_mode",
        description: "Plan-only contract for switching local power policy through a signed host broker."
    ),
    .init(
        id: "system.power.sleep",
        family: "power",
        label: "Sleep computer",
        targetMetricKeys: ["system.power.uptime"],
        requiresConfirmation: true,
        requiredGrants: ["system.power.control"],
        riskTier: "high",
        availability: "external_pending",
        auditEvent: "system.telemetry.control.power.sleep",
        description: "Plan-only contract for putting the computer to sleep after explicit confirmation."
    ),
    .init(
        id: "system.process.terminate",
        family: "process",
        label: "Terminate process",
        targetMetricKeys: ["system.process.count"],
        requiresConfirmation: true,
        requiredGrants: ["system.process.control"],
        riskTier: "high",
        availability: "external_pending",
        auditEvent: "system.telemetry.control.process.terminate",
        description: "Plan-only contract for terminating a local process with broker validation and receipt."
    ),
    .init(
        id: "system.network.toggle_interface",
        family: "network",
        label: "Toggle network interface",
        targetMetricKeys: ["system.network.bytes_in", "system.network.bytes_out"],
        requiresConfirmation: true,
        requiredGrants: ["system.network.control"],
        riskTier: "high",
        availability: "external_pending",
        auditEvent: "system.telemetry.control.network.toggle_interface",
        description: "Plan-only contract for enabling or disabling a local network interface."
    ),
    .init(
        id: "system.display.set_brightness",
        family: "display",
        label: "Set display brightness",
        targetMetricKeys: ["system.display.brightness"],
        requiresConfirmation: false,
        requiredGrants: ["system.display.control"],
        riskTier: "medium",
        availability: "external_pending",
        auditEvent: "system.telemetry.control.display.set_brightness",
        description: "Plan-only contract for display brightness changes through local policy."
    ),
    .init(
        id: "system.audio.set_output_volume",
        family: "audio",
        label: "Set output volume",
        targetMetricKeys: ["system.audio.output_volume"],
        requiresConfirmation: false,
        requiredGrants: ["system.audio.control"],
        riskTier: "low",
        availability: "external_pending",
        auditEvent: "system.telemetry.control.audio.set_output_volume",
        description: "Plan-only contract for local output volume changes through local policy."
    ),
]
