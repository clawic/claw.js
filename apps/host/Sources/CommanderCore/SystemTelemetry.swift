import Darwin
import Foundation

public enum SystemTelemetry {
    public static func metricsCatalog() -> JSONValue {
        .array(metricDefinitions.map(metricJSON))
    }

    public static func defaultWidgets() -> JSONValue {
        .array([
            .object([
                "id": .string("menu.cpu-memory"),
                "title": .string("CPU + Memory"),
                "placement": .string("menu_bar"),
                "metric_keys": .array([
                    .string("system.cpu.load_1m"),
                    .string("system.memory.used_bytes"),
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
                    .string("system.disk.root.free_bytes"),
                    .string("system.network.primary.bytes_in_per_sec"),
                    .string("system.network.primary.bytes_out_per_sec"),
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
                "metric_key": .string("system.disk.root.free_bytes"),
                "operator": .string("<"),
                "threshold": .integer(20 * 1024 * 1024 * 1024),
                "severity": .string("warning"),
                "enabled": .bool(false),
            ]),
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
            key: "system.cpu.load_1m",
            value: load.oneMinute,
            unit: "load",
            timestamp: timestamp,
            confidence: "observed"
        ))
        samples.append(sample(
            key: "system.cpu.load_5m",
            value: load.fiveMinute,
            unit: "load",
            timestamp: timestamp,
            confidence: "observed"
        ))
        samples.append(sample(
            key: "system.cpu.load_15m",
            value: load.fifteenMinute,
            unit: "load",
            timestamp: timestamp,
            confidence: "observed"
        ))

        if let memory = currentMemoryStats() {
            samples.append(sample(
                key: "system.memory.used_bytes",
                value: Double(memory.usedBytes),
                unit: "bytes",
                timestamp: timestamp,
                confidence: "observed"
            ))
            samples.append(sample(
                key: "system.memory.free_bytes",
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
                key: "system.disk.root.used_bytes",
                value: Double(disk.usedBytes),
                unit: "bytes",
                timestamp: timestamp,
                confidence: "observed"
            ))
            samples.append(sample(
                key: "system.disk.root.free_bytes",
                value: Double(disk.freeBytes),
                unit: "bytes",
                timestamp: timestamp,
                confidence: "observed"
            ))
        }

        samples.append(sample(
            key: "system.power.uptime_seconds",
            value: ProcessInfo.processInfo.systemUptime,
            unit: "seconds",
            timestamp: timestamp,
            confidence: "observed"
        ))

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

    private static func clampedInt(_ value: UInt64) -> Int {
        value > UInt64(Int.max) ? Int.max : Int(value)
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

private let metricDefinitions: [MetricDefinition] = [
    .init(key: "system.cpu.load_1m", family: "cpu", label: "CPU load 1m", unit: "load", sampleSupport: "snapshot_history", availability: "available", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: ""),
    .init(key: "system.cpu.load_5m", family: "cpu", label: "CPU load 5m", unit: "load", sampleSupport: "snapshot_history", availability: "available", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: ""),
    .init(key: "system.cpu.load_15m", family: "cpu", label: "CPU load 15m", unit: "load", sampleSupport: "snapshot_history", availability: "available", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: ""),
    .init(key: "system.cpu.frequency_hz", family: "cpu", label: "CPU frequency", unit: "hertz", sampleSupport: "snapshot_history", availability: "host_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: "Requires signed host broker or platform-specific provider."),
    .init(key: "system.gpu.utilization", family: "gpu", label: "GPU utilization", unit: "percent", sampleSupport: "snapshot_history", availability: "host_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: "Requires graphics provider integration."),
    .init(key: "system.gpu.memory_used_bytes", family: "gpu", label: "GPU memory used", unit: "bytes", sampleSupport: "snapshot_history", availability: "host_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: "Requires graphics provider integration."),
    .init(key: "system.memory.used_bytes", family: "memory", label: "Memory used", unit: "bytes", sampleSupport: "snapshot_history", availability: "available", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: ""),
    .init(key: "system.memory.free_bytes", family: "memory", label: "Memory free", unit: "bytes", sampleSupport: "snapshot_history", availability: "available", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: ""),
    .init(key: "system.memory.pressure", family: "memory", label: "Memory pressure", unit: "state", sampleSupport: "snapshot_history", availability: "available", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: ""),
    .init(key: "system.disk.root.used_bytes", family: "disk", label: "Root disk used", unit: "bytes", sampleSupport: "snapshot_history", availability: "available", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: ""),
    .init(key: "system.disk.root.free_bytes", family: "disk", label: "Root disk free", unit: "bytes", sampleSupport: "snapshot_history", availability: "available", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: ""),
    .init(key: "system.disk.io.read_bytes_per_sec", family: "disk", label: "Disk read throughput", unit: "bytes_per_second", sampleSupport: "snapshot_history", availability: "host_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: "Requires disk I/O provider integration."),
    .init(key: "system.disk.io.write_bytes_per_sec", family: "disk", label: "Disk write throughput", unit: "bytes_per_second", sampleSupport: "snapshot_history", availability: "host_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: "Requires disk I/O provider integration."),
    .init(key: "system.network.primary.bytes_in_per_sec", family: "network", label: "Network in", unit: "bytes_per_second", sampleSupport: "snapshot_history", availability: "host_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: "Requires network interface sampler."),
    .init(key: "system.network.primary.bytes_out_per_sec", family: "network", label: "Network out", unit: "bytes_per_second", sampleSupport: "snapshot_history", availability: "host_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: "Requires network interface sampler."),
    .init(key: "system.network.public_ip", family: "network", label: "Public IP", unit: "string", sampleSupport: "snapshot", availability: "provider_required", privacyTier: "sensitive", agentAccess: "restricted", retention: "latest_only", unavailableReason: "Requires explicit external network lookup."),
    .init(key: "system.sensor.temperature", family: "sensor", label: "Temperature", unit: "celsius", sampleSupport: "snapshot_history", availability: "host_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: "Requires signed hardware sensor provider."),
    .init(key: "system.sensor.fan_speed_rpm", family: "sensor", label: "Fan speed", unit: "rpm", sampleSupport: "snapshot_history", availability: "host_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: "Requires signed hardware sensor provider."),
    .init(key: "system.power.uptime_seconds", family: "power", label: "Uptime", unit: "seconds", sampleSupport: "snapshot_history", availability: "available", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: ""),
    .init(key: "system.power.battery_percent", family: "power", label: "Battery", unit: "percent", sampleSupport: "snapshot_history", availability: "host_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: "Requires power source provider."),
    .init(key: "system.process.count", family: "process", label: "Process count", unit: "count", sampleSupport: "snapshot_history", availability: "host_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: "Requires process provider."),
    .init(key: "system.display.brightness_percent", family: "display", label: "Display brightness", unit: "percent", sampleSupport: "snapshot_history", availability: "permission_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "latest_only", unavailableReason: "Requires display provider and local permission policy."),
    .init(key: "system.audio.output_volume_percent", family: "audio", label: "Output volume", unit: "percent", sampleSupport: "snapshot_history", availability: "permission_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "latest_only", unavailableReason: "Requires audio provider and local permission policy."),
    .init(key: "system.peripheral.connected_count", family: "peripheral", label: "Connected peripherals", unit: "count", sampleSupport: "snapshot_history", availability: "host_required", privacyTier: "aggregate", agentAccess: "safe_read", retention: "timeseries", unavailableReason: "Requires I/O registry provider."),
    .init(key: "system.focus.active_mode", family: "focus", label: "Focus mode", unit: "string", sampleSupport: "snapshot", availability: "provider_required", privacyTier: "personal", agentAccess: "restricted", retention: "latest_only", unavailableReason: "Requires user-context provider."),
    .init(key: "system.calendar.next_event_minutes", family: "calendar_time", label: "Next event", unit: "minutes", sampleSupport: "snapshot_history", availability: "permission_required", privacyTier: "personal", agentAccess: "restricted", retention: "latest_only", unavailableReason: "Requires calendar permission and user-context provider."),
    .init(key: "system.weather.temperature", family: "weather_context", label: "Weather temperature", unit: "celsius", sampleSupport: "snapshot_history", availability: "provider_required", privacyTier: "contextual", agentAccess: "safe_read", retention: "timeseries", unavailableReason: "Requires configured weather provider."),
]
