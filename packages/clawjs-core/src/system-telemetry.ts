export type SystemTelemetryMetricFamily =
  | "cpu"
  | "gpu"
  | "memory"
  | "disk"
  | "network"
  | "sensor"
  | "power"
  | "process"
  | "display"
  | "audio"
  | "peripheral"
  | "focus"
  | "calendar_time"
  | "weather_context";

export type SystemTelemetryUnit =
  | "count"
  | "load"
  | "percent"
  | "bytes"
  | "bytes_per_second"
  | "milliseconds"
  | "minutes"
  | "seconds"
  | "celsius"
  | "rpm"
  | "volts"
  | "amps"
  | "watts"
  | "hertz"
  | "lux"
  | "boolean"
  | "state"
  | "string";

export type SystemTelemetrySourceConfidence = "official" | "derived" | "experimental" | "provider";
export type SystemTelemetryPrivacyTier = "safe_aggregate" | "sensitive_detail" | "precise_location" | "calendar_private" | "control";
export type SystemTelemetrySampleSupport = "snapshot" | "stream" | "history";
export type SystemTelemetryAvailability = "available" | "unavailable" | "external_pending" | "permission_required" | "host_required";

export interface SystemTelemetryMetricDefinition {
  key: string;
  family: SystemTelemetryMetricFamily;
  label: string;
  unit: SystemTelemetryUnit;
  privacyTier: SystemTelemetryPrivacyTier;
  sourceConfidence: SystemTelemetrySourceConfidence;
  samplingCost: "low" | "medium" | "high";
  support: SystemTelemetrySampleSupport[];
  availability: SystemTelemetryAvailability;
  requiresGrant?: string;
  description: string;
}

export interface SystemTelemetryMetricSample {
  key: string;
  value: number | string | boolean | null;
  unit: SystemTelemetryUnit;
  capturedAt: string;
  availability: SystemTelemetryAvailability;
  source: {
    adapter: "node" | "signed_host" | "provider" | "fixture";
    confidence: SystemTelemetrySourceConfidence;
    detail?: string;
  };
  quality?: "ok" | "degraded" | "unsupported";
  tags?: Record<string, string>;
}

export interface SystemTelemetrySnapshot {
  schemaVersion: 1;
  generatedAt: string;
  host: {
    platform: string;
    arch: string;
    id: "local";
  };
  policy: {
    defaultAgentAccess: "safe_read";
    sensitiveRequiresGrant: true;
    controlsRequireSignedHostBroker: true;
  };
  samples: SystemTelemetryMetricSample[];
  unavailableMetrics: string[];
}

export interface SystemTelemetryWidgetDefinition {
  id: string;
  metricKey: string;
  title: string;
  presentation: "text" | "icon" | "gauge" | "sparkline" | "threshold" | "dropdown";
  placement: "menubar" | "combined_panel" | "both";
  enabledByDefault: boolean;
}

export interface SystemTelemetryRuleDefinition {
  id: string;
  metricKey: string;
  operator: "gt" | "gte" | "lt" | "lte" | "eq" | "changed";
  threshold: number | string | boolean;
  severity: "info" | "warning" | "critical";
  enabled: boolean;
}

export const SYSTEM_TELEMETRY_METRICS: SystemTelemetryMetricDefinition[] = [
  {
    key: "system.cpu.load1",
    family: "cpu",
    label: "CPU load",
    unit: "count",
    privacyTier: "safe_aggregate",
    sourceConfidence: "official",
    samplingCost: "low",
    support: ["snapshot", "stream", "history"],
    availability: "available",
    description: "One-minute CPU load average where the host exposes it.",
  },
  {
    key: "system.cpu.load5",
    family: "cpu",
    label: "CPU load 5m",
    unit: "load",
    privacyTier: "safe_aggregate",
    sourceConfidence: "official",
    samplingCost: "low",
    support: ["snapshot", "stream", "history"],
    availability: "available",
    description: "Five-minute CPU load average where the host exposes it.",
  },
  {
    key: "system.cpu.load15",
    family: "cpu",
    label: "CPU load 15m",
    unit: "load",
    privacyTier: "safe_aggregate",
    sourceConfidence: "official",
    samplingCost: "low",
    support: ["snapshot", "stream", "history"],
    availability: "available",
    description: "Fifteen-minute CPU load average where the host exposes it.",
  },
  {
    key: "system.cpu.utilization",
    family: "cpu",
    label: "CPU utilization",
    unit: "percent",
    privacyTier: "safe_aggregate",
    sourceConfidence: "derived",
    samplingCost: "medium",
    support: ["snapshot", "stream", "history"],
    availability: "host_required",
    description: "Aggregate CPU utilization derived by the host adapter.",
  },
  {
    key: "system.cpu.frequency_hz",
    family: "cpu",
    label: "CPU frequency",
    unit: "hertz",
    privacyTier: "safe_aggregate",
    sourceConfidence: "experimental",
    samplingCost: "medium",
    support: ["snapshot", "history"],
    availability: "host_required",
    description: "CPU frequency when a signed host or platform provider can read it.",
  },
  {
    key: "system.gpu.utilization",
    family: "gpu",
    label: "GPU utilization",
    unit: "percent",
    privacyTier: "safe_aggregate",
    sourceConfidence: "experimental",
    samplingCost: "medium",
    support: ["snapshot", "stream", "history"],
    availability: "host_required",
    description: "GPU utilization when the native host can read it.",
  },
  {
    key: "system.gpu.memory_used_bytes",
    family: "gpu",
    label: "GPU memory used",
    unit: "bytes",
    privacyTier: "safe_aggregate",
    sourceConfidence: "experimental",
    samplingCost: "medium",
    support: ["snapshot", "history"],
    availability: "host_required",
    description: "GPU memory usage when the native host can read it.",
  },
  {
    key: "system.memory.used",
    family: "memory",
    label: "Memory used",
    unit: "bytes",
    privacyTier: "safe_aggregate",
    sourceConfidence: "official",
    samplingCost: "low",
    support: ["snapshot", "stream", "history"],
    availability: "available",
    description: "Aggregate used physical memory.",
  },
  {
    key: "system.memory.free",
    family: "memory",
    label: "Memory free",
    unit: "bytes",
    privacyTier: "safe_aggregate",
    sourceConfidence: "official",
    samplingCost: "low",
    support: ["snapshot", "stream", "history"],
    availability: "available",
    description: "Aggregate free physical memory.",
  },
  {
    key: "system.memory.pressure",
    family: "memory",
    label: "Memory pressure",
    unit: "state",
    privacyTier: "safe_aggregate",
    sourceConfidence: "derived",
    samplingCost: "low",
    support: ["snapshot", "stream", "history"],
    availability: "available",
    description: "Coarse memory pressure state derived from aggregate memory use.",
  },
  {
    key: "system.disk.capacity",
    family: "disk",
    label: "Disk capacity",
    unit: "bytes",
    privacyTier: "safe_aggregate",
    sourceConfidence: "official",
    samplingCost: "medium",
    support: ["snapshot", "history"],
    availability: "host_required",
    description: "Disk capacity and usage by mounted volume.",
  },
  {
    key: "system.disk.used",
    family: "disk",
    label: "Root disk used",
    unit: "bytes",
    privacyTier: "safe_aggregate",
    sourceConfidence: "official",
    samplingCost: "medium",
    support: ["snapshot", "history"],
    availability: "available",
    description: "Used bytes on the root filesystem.",
  },
  {
    key: "system.disk.free",
    family: "disk",
    label: "Root disk free",
    unit: "bytes",
    privacyTier: "safe_aggregate",
    sourceConfidence: "official",
    samplingCost: "medium",
    support: ["snapshot", "history"],
    availability: "available",
    description: "Free bytes on the root filesystem.",
  },
  {
    key: "system.disk.io_read",
    family: "disk",
    label: "Disk read throughput",
    unit: "bytes_per_second",
    privacyTier: "safe_aggregate",
    sourceConfidence: "experimental",
    samplingCost: "medium",
    support: ["snapshot", "stream", "history"],
    availability: "host_required",
    description: "Disk read throughput when a host I/O sampler is available.",
  },
  {
    key: "system.disk.io_write",
    family: "disk",
    label: "Disk write throughput",
    unit: "bytes_per_second",
    privacyTier: "safe_aggregate",
    sourceConfidence: "experimental",
    samplingCost: "medium",
    support: ["snapshot", "stream", "history"],
    availability: "host_required",
    description: "Disk write throughput when a host I/O sampler is available.",
  },
  {
    key: "system.network.throughput",
    family: "network",
    label: "Network throughput",
    unit: "bytes_per_second",
    privacyTier: "safe_aggregate",
    sourceConfidence: "derived",
    samplingCost: "medium",
    support: ["snapshot", "stream", "history"],
    availability: "host_required",
    description: "Aggregate network transmit and receive throughput without exposing identifiers by default.",
  },
  {
    key: "system.network.bytes_in",
    family: "network",
    label: "Network in",
    unit: "bytes_per_second",
    privacyTier: "safe_aggregate",
    sourceConfidence: "derived",
    samplingCost: "medium",
    support: ["snapshot", "stream", "history"],
    availability: "host_required",
    description: "Aggregate inbound network throughput without interface identifiers by default.",
  },
  {
    key: "system.network.bytes_out",
    family: "network",
    label: "Network out",
    unit: "bytes_per_second",
    privacyTier: "safe_aggregate",
    sourceConfidence: "derived",
    samplingCost: "medium",
    support: ["snapshot", "stream", "history"],
    availability: "host_required",
    description: "Aggregate outbound network throughput without interface identifiers by default.",
  },
  {
    key: "system.network.public_ip",
    family: "network",
    label: "Public IP",
    unit: "string",
    privacyTier: "sensitive_detail",
    sourceConfidence: "provider",
    samplingCost: "medium",
    support: ["snapshot"],
    availability: "permission_required",
    requiresGrant: "system.network.identifiers.read",
    description: "Public network identifier supplied only by an explicitly configured provider.",
  },
  {
    key: "system.sensor.temperature",
    family: "sensor",
    label: "Temperature sensors",
    unit: "celsius",
    privacyTier: "safe_aggregate",
    sourceConfidence: "experimental",
    samplingCost: "medium",
    support: ["snapshot", "stream", "history"],
    availability: "host_required",
    description: "Temperature readings from supported native sensor adapters.",
  },
  {
    key: "system.sensor.fan_speed",
    family: "sensor",
    label: "Fan speed",
    unit: "rpm",
    privacyTier: "safe_aggregate",
    sourceConfidence: "experimental",
    samplingCost: "medium",
    support: ["snapshot", "stream", "history"],
    availability: "host_required",
    description: "Fan speed readings from supported native sensor adapters.",
  },
  {
    key: "system.power.uptime",
    family: "power",
    label: "System uptime",
    unit: "seconds",
    privacyTier: "safe_aggregate",
    sourceConfidence: "official",
    samplingCost: "low",
    support: ["snapshot", "history"],
    availability: "available",
    description: "System uptime in seconds.",
  },
  {
    key: "system.power.battery",
    family: "power",
    label: "Battery",
    unit: "percent",
    privacyTier: "safe_aggregate",
    sourceConfidence: "official",
    samplingCost: "low",
    support: ["snapshot", "history"],
    availability: "host_required",
    description: "Battery percentage when available on the current host.",
  },
  {
    key: "system.process.count",
    family: "process",
    label: "Process count",
    unit: "count",
    privacyTier: "safe_aggregate",
    sourceConfidence: "official",
    samplingCost: "medium",
    support: ["snapshot", "stream", "history"],
    availability: "host_required",
    description: "Aggregate process count. Detailed process metadata requires a grant.",
  },
  {
    key: "system.display.count",
    family: "display",
    label: "Display count",
    unit: "count",
    privacyTier: "safe_aggregate",
    sourceConfidence: "official",
    samplingCost: "low",
    support: ["snapshot"],
    availability: "host_required",
    description: "Connected display count and aggregate display state.",
  },
  {
    key: "system.display.brightness",
    family: "display",
    label: "Display brightness",
    unit: "percent",
    privacyTier: "safe_aggregate",
    sourceConfidence: "official",
    samplingCost: "low",
    support: ["snapshot", "history"],
    availability: "permission_required",
    description: "Display brightness when a host display provider and permission policy allow it.",
  },
  {
    key: "system.audio.output_active",
    family: "audio",
    label: "Audio output active",
    unit: "boolean",
    privacyTier: "safe_aggregate",
    sourceConfidence: "official",
    samplingCost: "low",
    support: ["snapshot", "stream"],
    availability: "host_required",
    description: "Whether the host reports an active audio output route.",
  },
  {
    key: "system.audio.output_volume",
    family: "audio",
    label: "Output volume",
    unit: "percent",
    privacyTier: "safe_aggregate",
    sourceConfidence: "official",
    samplingCost: "low",
    support: ["snapshot", "history"],
    availability: "permission_required",
    description: "Output volume when a host audio provider and permission policy allow it.",
  },
  {
    key: "system.peripheral.bluetooth_count",
    family: "peripheral",
    label: "Bluetooth peripheral count",
    unit: "count",
    privacyTier: "sensitive_detail",
    sourceConfidence: "official",
    samplingCost: "medium",
    support: ["snapshot", "history"],
    availability: "permission_required",
    requiresGrant: "system.peripherals.read",
    description: "Bluetooth/peripheral count. Device identities require an explicit grant.",
  },
  {
    key: "system.peripheral.connected_count",
    family: "peripheral",
    label: "Connected peripherals",
    unit: "count",
    privacyTier: "safe_aggregate",
    sourceConfidence: "official",
    samplingCost: "medium",
    support: ["snapshot", "history"],
    availability: "host_required",
    description: "Aggregate connected peripheral count without exposing device identities.",
  },
  {
    key: "system.focus.mode",
    family: "focus",
    label: "Focus mode",
    unit: "string",
    privacyTier: "sensitive_detail",
    sourceConfidence: "official",
    samplingCost: "low",
    support: ["snapshot", "stream"],
    availability: "permission_required",
    requiresGrant: "system.focus.read",
    description: "Current focus/notification mode when granted.",
  },
  {
    key: "system.calendar.next_event_delta",
    family: "calendar_time",
    label: "Next event delta",
    unit: "seconds",
    privacyTier: "calendar_private",
    sourceConfidence: "official",
    samplingCost: "medium",
    support: ["snapshot", "history"],
    availability: "permission_required",
    requiresGrant: "calendar.read",
    description: "Time until the next calendar event without exposing event details by default.",
  },
  {
    key: "context.weather.temperature",
    family: "weather_context",
    label: "Weather temperature",
    unit: "celsius",
    privacyTier: "precise_location",
    sourceConfidence: "provider",
    samplingCost: "medium",
    support: ["snapshot", "history"],
    availability: "external_pending",
    requiresGrant: "weather.location.read",
    description: "Weather temperature supplied by a configured context provider.",
  },
];

export const SYSTEM_TELEMETRY_DEFAULT_WIDGETS: SystemTelemetryWidgetDefinition[] = [
  { id: "cpu-load", metricKey: "system.cpu.load1", title: "CPU", presentation: "sparkline", placement: "both", enabledByDefault: true },
  { id: "memory-used", metricKey: "system.memory.used", title: "Memory", presentation: "gauge", placement: "both", enabledByDefault: true },
  { id: "disk-free", metricKey: "system.disk.free", title: "Disk", presentation: "threshold", placement: "both", enabledByDefault: true },
  { id: "network-in", metricKey: "system.network.bytes_in", title: "Network", presentation: "sparkline", placement: "menubar", enabledByDefault: false },
  { id: "power-uptime", metricKey: "system.power.uptime", title: "Uptime", presentation: "text", placement: "combined_panel", enabledByDefault: false },
  { id: "weather-temperature", metricKey: "context.weather.temperature", title: "Weather", presentation: "text", placement: "menubar", enabledByDefault: false },
];

export function listSystemTelemetryMetrics(): SystemTelemetryMetricDefinition[] {
  return SYSTEM_TELEMETRY_METRICS.map((metric) => ({ ...metric, support: [...metric.support] }));
}

export function listSystemTelemetryWidgets(): SystemTelemetryWidgetDefinition[] {
  return SYSTEM_TELEMETRY_DEFAULT_WIDGETS.map((widget) => ({ ...widget }));
}
