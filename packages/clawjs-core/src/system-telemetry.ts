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
  | "notification"
  | "calendar_time"
  | "weather_context"
  | "local_context";

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

export type SystemTelemetryProviderKind =
  | "weather"
  | "hardware_sensor"
  | "build_status"
  | "local_service"
  | "agent_run"
  | "reminder"
  | "calendar"
  | "custom_metric";

export type SystemTelemetryProviderMode = "mock" | "offline" | "live";
export type SystemTelemetryProviderStatus = "ready" | "disabled" | "external_pending";

export interface SystemTelemetryProviderDefinition {
  id: string;
  kind: SystemTelemetryProviderKind;
  label: string;
  mode: SystemTelemetryProviderMode;
  status: SystemTelemetryProviderStatus;
  metricKeys: string[];
  metrics?: string[];
  widgetIds: string[];
  capabilities: SystemTelemetrySampleSupport[];
  defaultEnabled: boolean;
  privacyTier: SystemTelemetryPrivacyTier;
  requiresGrant?: string;
  credentialRefRequired: boolean;
  freshnessMs: number;
  description: string;
}

export interface SystemTelemetryProviderPlanStep {
  id: string;
  status: "pending" | "skipped" | "blocked";
  owner: "provider_broker" | "monitor" | "audit";
}

export interface SystemTelemetryPlanAuditProjection {
  status: "planned";
  durable: false;
  event: string;
  outcome: "blocked";
  redaction: {
    credentialRefRedacted?: boolean;
    targetRedacted?: boolean;
    valueRedacted?: boolean;
    preciseLocationRedacted?: boolean;
    sensitiveDetailRedacted?: boolean;
  };
  receiptStatus: "not_issued";
  note: string;
}

export interface SystemTelemetryProviderPlan {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  status: "planned";
  willConnect: false;
  provider: SystemTelemetryProviderDefinition;
  request: {
    credentialRef: string | null;
    reason: string;
  };
  broker: {
    required: true;
    status: "external_pending";
    mode: "provider_grant_plan_first";
    failClosed: true;
  };
  policy: {
    requiredGrants: string[];
    credentialRefRequired: boolean;
    privacyTier: SystemTelemetryPrivacyTier;
    preciseLocationRedacted: true;
    networkAccess: "blocked_until_granted";
  };
  steps: SystemTelemetryProviderPlanStep[];
  receipt: {
    required: true;
    status: "not_issued";
    auditEvent: string;
  };
  auditPlan: SystemTelemetryPlanAuditProjection;
  externalPending: true;
}

export type SystemTelemetryControlActionFamily = "fan" | "power" | "process" | "network" | "display" | "audio";
export type SystemTelemetryControlRiskTier = "safe" | "disruptive" | "critical";

export interface SystemTelemetryControlActionDefinition {
  id: string;
  family: SystemTelemetryControlActionFamily;
  label: string;
  targetMetricKeys: string[];
  requiresSignedHostBroker: true;
  requiresConfirmation: boolean;
  requiredGrants: string[];
  riskTier: SystemTelemetryControlRiskTier;
  availability: SystemTelemetryAvailability;
  auditEvent: string;
  description: string;
}

export interface SystemTelemetryControlPlanStep {
  id: string;
  status: "pending" | "skipped" | "blocked";
  owner: "signed_host_broker";
}

export interface SystemTelemetryControlPlan {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  status: "planned";
  willExecute: false;
  action: SystemTelemetryControlActionDefinition;
  request: {
    target: string | null;
    value: string | null;
    reason: string;
  };
  broker: {
    required: true;
    status: "external_pending";
    mode: "signed_host_plan_first";
    failClosed: true;
  };
  policy: {
    requiresConfirmation: boolean;
    requiredGrants: string[];
    riskTier: SystemTelemetryControlRiskTier;
    sensitiveDetailRedacted: true;
  };
  steps: SystemTelemetryControlPlanStep[];
  receipt: {
    required: true;
    status: "not_issued";
    auditEvent: string;
  };
  auditPlan: SystemTelemetryPlanAuditProjection;
  externalPending: true;
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
    privacyTier: "safe_aggregate",
    sourceConfidence: "official",
    samplingCost: "medium",
    support: ["snapshot", "history"],
    availability: "host_required",
    description: "Aggregate Bluetooth peripheral count without exposing device identities by default.",
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
    key: "system.notifications.availability_state",
    family: "notification",
    label: "Notification availability",
    unit: "state",
    privacyTier: "safe_aggregate",
    sourceConfidence: "official",
    samplingCost: "low",
    support: ["snapshot", "history"],
    availability: "host_required",
    description: "Aggregate notification availability state without reading notification content.",
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
  {
    key: "context.build.status",
    family: "local_context",
    label: "Build status",
    unit: "state",
    privacyTier: "safe_aggregate",
    sourceConfidence: "provider",
    samplingCost: "low",
    support: ["snapshot", "history"],
    availability: "external_pending",
    description: "Current build or CI status supplied by a local or connector-backed context provider.",
  },
  {
    key: "context.service.health",
    family: "local_context",
    label: "Local service health",
    unit: "state",
    privacyTier: "safe_aggregate",
    sourceConfidence: "provider",
    samplingCost: "low",
    support: ["snapshot", "stream", "history"],
    availability: "external_pending",
    description: "Local development service health supplied by an offline provider.",
  },
  {
    key: "context.agent_runs.active",
    family: "local_context",
    label: "Active agent runs",
    unit: "count",
    privacyTier: "safe_aggregate",
    sourceConfidence: "provider",
    samplingCost: "low",
    support: ["snapshot", "stream", "history"],
    availability: "external_pending",
    description: "Active local agent run count supplied by the agent runtime context provider.",
  },
  {
    key: "context.reminders.due_count",
    family: "local_context",
    label: "Due reminders",
    unit: "count",
    privacyTier: "calendar_private",
    sourceConfidence: "provider",
    samplingCost: "low",
    support: ["snapshot", "history"],
    availability: "permission_required",
    requiresGrant: "reminders.read",
    description: "Due reminder count without exposing reminder titles.",
  },
  {
    key: "context.custom.metric",
    family: "local_context",
    label: "Custom context metric",
    unit: "string",
    privacyTier: "safe_aggregate",
    sourceConfidence: "provider",
    samplingCost: "low",
    support: ["snapshot", "history"],
    availability: "external_pending",
    description: "User-defined context metric supplied through the provider contract.",
  },
];

export const SYSTEM_TELEMETRY_DEFAULT_WIDGETS: SystemTelemetryWidgetDefinition[] = [
  { id: "cpu-load", metricKey: "system.cpu.load1", title: "CPU", presentation: "sparkline", placement: "both", enabledByDefault: true },
  { id: "memory-used", metricKey: "system.memory.used", title: "Memory", presentation: "gauge", placement: "both", enabledByDefault: true },
  { id: "disk-free", metricKey: "system.disk.free", title: "Disk", presentation: "threshold", placement: "both", enabledByDefault: true },
  { id: "network-in", metricKey: "system.network.bytes_in", title: "Network", presentation: "sparkline", placement: "menubar", enabledByDefault: false },
  { id: "power-uptime", metricKey: "system.power.uptime", title: "Uptime", presentation: "text", placement: "combined_panel", enabledByDefault: false },
  { id: "weather-temperature", metricKey: "context.weather.temperature", title: "Weather", presentation: "text", placement: "menubar", enabledByDefault: false },
  { id: "build-status", metricKey: "context.build.status", title: "Build", presentation: "icon", placement: "menubar", enabledByDefault: false },
  { id: "service-health", metricKey: "context.service.health", title: "Services", presentation: "threshold", placement: "combined_panel", enabledByDefault: false },
  { id: "agent-runs-active", metricKey: "context.agent_runs.active", title: "Agents", presentation: "text", placement: "menubar", enabledByDefault: false },
  { id: "reminders-due", metricKey: "context.reminders.due_count", title: "Reminders", presentation: "text", placement: "combined_panel", enabledByDefault: false },
  { id: "calendar-next-event", metricKey: "system.calendar.next_event_delta", title: "Calendar", presentation: "text", placement: "combined_panel", enabledByDefault: false },
  { id: "notifications-status", metricKey: "system.notifications.availability_state", title: "Notifications", presentation: "icon", placement: "combined_panel", enabledByDefault: false },
  { id: "custom-context", metricKey: "context.custom.metric", title: "Context", presentation: "text", placement: "combined_panel", enabledByDefault: false },
];

export const SYSTEM_TELEMETRY_PROVIDERS: SystemTelemetryProviderDefinition[] = [
  {
    id: "context.weather.mock",
    kind: "weather",
    label: "Mock weather context",
    mode: "mock",
    status: "ready",
    metricKeys: ["context.weather.temperature"],
    widgetIds: ["weather-temperature"],
    capabilities: ["snapshot", "history"],
    defaultEnabled: false,
    privacyTier: "precise_location",
    requiresGrant: "weather.location.read",
    credentialRefRequired: false,
    freshnessMs: 15 * 60_000,
    description: "Offline fixture provider for weather widgets and tests.",
  },
  {
    id: "context.weather.live",
    kind: "weather",
    label: "Live weather context",
    mode: "live",
    status: "external_pending",
    metricKeys: ["context.weather.temperature"],
    widgetIds: ["weather-temperature"],
    capabilities: ["snapshot", "history"],
    defaultEnabled: false,
    privacyTier: "precise_location",
    requiresGrant: "weather.location.read",
    credentialRefRequired: true,
    freshnessMs: 15 * 60_000,
    description: "Live provider slot for weather data; it remains disabled until a configured provider, grant, and credential reference exist.",
  },
  {
    id: "system.sensors.signed",
    kind: "hardware_sensor",
    label: "Signed hardware sensor provider",
    mode: "live",
    status: "external_pending",
    metricKeys: ["system.sensor.temperature", "system.sensor.fan_speed"],
    widgetIds: [],
    capabilities: ["snapshot", "history"],
    defaultEnabled: false,
    privacyTier: "safe_aggregate",
    requiresGrant: "system.sensor.read",
    credentialRefRequired: false,
    freshnessMs: 5_000,
    description: "Signed hardware sensor provider slot for temperature and fan speed readings when the host can validate compatible hardware access.",
  },
  {
    id: "context.build.offline",
    kind: "build_status",
    label: "Build status context",
    mode: "offline",
    status: "ready",
    metricKeys: ["context.build.status"],
    widgetIds: ["build-status"],
    capabilities: ["snapshot", "history"],
    defaultEnabled: false,
    privacyTier: "safe_aggregate",
    credentialRefRequired: false,
    freshnessMs: 30_000,
    description: "Offline provider contract for local build or CI status indicators.",
  },
  {
    id: "context.services.offline",
    kind: "local_service",
    label: "Local service health context",
    mode: "offline",
    status: "ready",
    metricKeys: ["context.service.health"],
    widgetIds: ["service-health"],
    capabilities: ["snapshot", "stream", "history"],
    defaultEnabled: false,
    privacyTier: "safe_aggregate",
    credentialRefRequired: false,
    freshnessMs: 10_000,
    description: "Offline provider contract for local service status indicators.",
  },
  {
    id: "context.agent-runs.offline",
    kind: "agent_run",
    label: "Agent run context",
    mode: "offline",
    status: "ready",
    metricKeys: ["context.agent_runs.active"],
    widgetIds: ["agent-runs-active"],
    capabilities: ["snapshot", "stream", "history"],
    defaultEnabled: false,
    privacyTier: "safe_aggregate",
    credentialRefRequired: false,
    freshnessMs: 5_000,
    description: "Offline provider contract for active local agent run indicators.",
  },
  {
    id: "context.reminders.offline",
    kind: "reminder",
    label: "Reminder context",
    mode: "offline",
    status: "ready",
    metricKeys: ["context.reminders.due_count"],
    widgetIds: ["reminders-due"],
    capabilities: ["snapshot", "history"],
    defaultEnabled: false,
    privacyTier: "calendar_private",
    requiresGrant: "reminders.read",
    credentialRefRequired: false,
    freshnessMs: 60_000,
    description: "Offline provider contract for reminder counts without exposing reminder content.",
  },
  {
    id: "context.calendar.offline",
    kind: "calendar",
    label: "Calendar context",
    mode: "offline",
    status: "ready",
    metricKeys: ["system.calendar.next_event_delta"],
    widgetIds: ["calendar-next-event"],
    capabilities: ["snapshot", "history"],
    defaultEnabled: false,
    privacyTier: "calendar_private",
    requiresGrant: "calendar.read",
    credentialRefRequired: false,
    freshnessMs: 60_000,
    description: "Offline provider contract for calendar timing indicators without event detail.",
  },
  {
    id: "context.custom.offline",
    kind: "custom_metric",
    label: "Custom context metric",
    mode: "offline",
    status: "ready",
    metricKeys: ["context.custom.metric"],
    widgetIds: ["custom-context"],
    capabilities: ["snapshot", "history"],
    defaultEnabled: false,
    privacyTier: "safe_aggregate",
    credentialRefRequired: false,
    freshnessMs: 60_000,
    description: "Offline provider contract for user-defined context metrics.",
  },
];

export const SYSTEM_TELEMETRY_CONTROL_ACTIONS: SystemTelemetryControlActionDefinition[] = [
  {
    id: "system.fan.set_speed",
    family: "fan",
    label: "Set fan speed",
    targetMetricKeys: ["system.sensor.fan_speed", "system.sensor.temperature"],
    requiresSignedHostBroker: true,
    requiresConfirmation: true,
    requiredGrants: ["system.hardware.control", "system.sensor.read"],
    riskTier: "critical",
    availability: "host_required",
    auditEvent: "system.telemetry.control.fan.set_speed",
    description: "Plan a fan speed change through the signed host. The framework contract never applies this directly.",
  },
  {
    id: "system.power.set_mode",
    family: "power",
    label: "Set power mode",
    targetMetricKeys: ["system.power.battery"],
    requiresSignedHostBroker: true,
    requiresConfirmation: true,
    requiredGrants: ["system.power.control"],
    riskTier: "disruptive",
    availability: "host_required",
    auditEvent: "system.telemetry.control.power.set_mode",
    description: "Plan a power mode change through host policy, confirmation, receipt, and audit.",
  },
  {
    id: "system.power.sleep",
    family: "power",
    label: "Sleep computer",
    targetMetricKeys: ["system.power.uptime"],
    requiresSignedHostBroker: true,
    requiresConfirmation: true,
    requiredGrants: ["system.power.control"],
    riskTier: "critical",
    availability: "host_required",
    auditEvent: "system.telemetry.control.power.sleep",
    description: "Plan a sleep request. Execution is fail-closed unless the signed host accepts the plan.",
  },
  {
    id: "system.process.terminate",
    family: "process",
    label: "Terminate process",
    targetMetricKeys: ["system.process.count"],
    requiresSignedHostBroker: true,
    requiresConfirmation: true,
    requiredGrants: ["system.process.control"],
    riskTier: "critical",
    availability: "host_required",
    auditEvent: "system.telemetry.control.process.terminate",
    description: "Plan process termination with sensitive process detail gated behind grants and signed-host audit.",
  },
  {
    id: "system.network.toggle_interface",
    family: "network",
    label: "Toggle network interface",
    targetMetricKeys: ["system.network.bytes_in", "system.network.bytes_out"],
    requiresSignedHostBroker: true,
    requiresConfirmation: true,
    requiredGrants: ["system.network.control"],
    riskTier: "critical",
    availability: "host_required",
    auditEvent: "system.telemetry.control.network.toggle_interface",
    description: "Plan a network interface mutation with continuity policy and signed-host execution only.",
  },
  {
    id: "system.display.set_brightness",
    family: "display",
    label: "Set display brightness",
    targetMetricKeys: ["system.display.brightness"],
    requiresSignedHostBroker: true,
    requiresConfirmation: false,
    requiredGrants: ["system.display.control"],
    riskTier: "disruptive",
    availability: "host_required",
    auditEvent: "system.telemetry.control.display.set_brightness",
    description: "Plan a display brightness change through the native host broker.",
  },
  {
    id: "system.audio.set_output_volume",
    family: "audio",
    label: "Set output volume",
    targetMetricKeys: ["system.audio.output_volume"],
    requiresSignedHostBroker: true,
    requiresConfirmation: false,
    requiredGrants: ["system.audio.control"],
    riskTier: "safe",
    availability: "host_required",
    auditEvent: "system.telemetry.control.audio.set_output_volume",
    description: "Plan an output volume change through host-owned audio policy and audit.",
  },
];

export function listSystemTelemetryMetrics(): SystemTelemetryMetricDefinition[] {
  return SYSTEM_TELEMETRY_METRICS.map((metric) => ({ ...metric, support: [...metric.support] }));
}

export function listSystemTelemetryWidgets(): SystemTelemetryWidgetDefinition[] {
  return SYSTEM_TELEMETRY_DEFAULT_WIDGETS.map((widget) => ({ ...widget }));
}

export function listSystemTelemetryProviders(): SystemTelemetryProviderDefinition[] {
  return SYSTEM_TELEMETRY_PROVIDERS.map((provider) => ({
    ...provider,
    metricKeys: [...provider.metricKeys],
    metrics: [...provider.metricKeys],
    widgetIds: [...provider.widgetIds],
    capabilities: [...provider.capabilities],
  }));
}

export function findSystemTelemetryProvider(id: string): SystemTelemetryProviderDefinition | null {
  return listSystemTelemetryProviders().find((provider) => provider.id === id) ?? null;
}

export function createSystemTelemetryProviderPlan(input: {
  provider: SystemTelemetryProviderDefinition;
  credentialRef?: string | null;
  reason?: string | null;
  now?: string;
  idSuffix?: string;
}): SystemTelemetryProviderPlan {
  const createdAt = input.now ?? new Date().toISOString();
  const idSuffix = input.idSuffix ?? String(Date.now());
  const requiredGrants = input.provider.requiresGrant ? [input.provider.requiresGrant] : [];
  const credentialProvided = Boolean(input.credentialRef);
  const credentialRefProjection = credentialProvided ? "provided_redacted" : null;
  const auditEvent = `system.telemetry.provider.${input.provider.kind}.${input.provider.mode}`;
  return {
    schemaVersion: 1,
    id: `system-provider-plan-${input.provider.id.replaceAll(".", "-")}-${idSuffix}`,
    createdAt,
    status: "planned",
    willConnect: false,
    provider: {
      ...input.provider,
      metricKeys: [...input.provider.metricKeys],
      metrics: [...input.provider.metricKeys],
      widgetIds: [...input.provider.widgetIds],
      capabilities: [...input.provider.capabilities],
    },
    request: {
      credentialRef: credentialRefProjection,
      reason: input.reason || "not_provided",
    },
    broker: {
      required: true,
      status: "external_pending",
      mode: "provider_grant_plan_first",
      failClosed: true,
    },
    policy: {
      requiredGrants,
      credentialRefRequired: input.provider.credentialRefRequired,
      privacyTier: input.provider.privacyTier,
      preciseLocationRedacted: true,
      networkAccess: "blocked_until_granted",
    },
    steps: [
      { id: "validate_provider_config", status: "pending", owner: "provider_broker" },
      { id: "validate_grants", status: requiredGrants.length > 0 ? "pending" : "skipped", owner: "provider_broker" },
      { id: "resolve_credential_ref", status: input.provider.credentialRefRequired && !credentialProvided ? "blocked" : input.provider.credentialRefRequired ? "pending" : "skipped", owner: "provider_broker" },
      { id: "connect_provider", status: "blocked", owner: "provider_broker" },
      { id: "record_sample", status: "pending", owner: "monitor" },
      { id: "append_audit_event", status: "pending", owner: "audit" },
    ],
    receipt: {
      required: true,
      status: "not_issued",
      auditEvent,
    },
    auditPlan: {
      status: "planned",
      durable: false,
      event: auditEvent,
      outcome: "blocked",
      redaction: {
        credentialRefRedacted: true,
        preciseLocationRedacted: true,
      },
      receiptStatus: "not_issued",
      note: "Portable plan audit projection only; durable audit evidence is written by the local CLI or signed host and this is not a provider execution receipt.",
    },
    externalPending: true,
  };
}

export function listSystemTelemetryControlActions(): SystemTelemetryControlActionDefinition[] {
  return SYSTEM_TELEMETRY_CONTROL_ACTIONS.map((action) => ({
    ...action,
    targetMetricKeys: [...action.targetMetricKeys],
    requiredGrants: [...action.requiredGrants],
  }));
}

export function findSystemTelemetryControlAction(id: string): SystemTelemetryControlActionDefinition | null {
  return listSystemTelemetryControlActions().find((action) => action.id === id) ?? null;
}

export function createSystemTelemetryControlPlan(input: {
  action: SystemTelemetryControlActionDefinition;
  target?: string | null;
  value?: string | null;
  reason?: string | null;
  now?: string;
  idSuffix?: string;
}): SystemTelemetryControlPlan {
  const createdAt = input.now ?? new Date().toISOString();
  const idSuffix = input.idSuffix ?? String(Date.now());
  const auditEvent = input.action.auditEvent;
  return {
    schemaVersion: 1,
    id: `system-control-plan-${input.action.id.replaceAll(".", "-")}-${idSuffix}`,
    createdAt,
    status: "planned",
    willExecute: false,
    action: {
      ...input.action,
      targetMetricKeys: [...input.action.targetMetricKeys],
      requiredGrants: [...input.action.requiredGrants],
    },
    request: {
      target: input.target ?? null,
      value: input.value ?? null,
      reason: input.reason || "not_provided",
    },
    broker: {
      required: true,
      status: "external_pending",
      mode: "signed_host_plan_first",
      failClosed: true,
    },
    policy: {
      requiresConfirmation: input.action.requiresConfirmation,
      requiredGrants: [...input.action.requiredGrants],
      riskTier: input.action.riskTier,
      sensitiveDetailRedacted: true,
    },
    steps: [
      { id: "validate_grants", status: "pending", owner: "signed_host_broker" },
      { id: "confirm_if_required", status: input.action.requiresConfirmation ? "pending" : "skipped", owner: "signed_host_broker" },
      { id: "execute_native_action", status: "blocked", owner: "signed_host_broker" },
      { id: "write_receipt", status: "pending", owner: "signed_host_broker" },
      { id: "append_audit_event", status: "pending", owner: "signed_host_broker" },
    ],
    receipt: {
      required: true,
      status: "not_issued",
      auditEvent,
    },
    auditPlan: {
      status: "planned",
      durable: false,
      event: auditEvent,
      outcome: "blocked",
      redaction: {
        targetRedacted: true,
        valueRedacted: true,
        sensitiveDetailRedacted: true,
      },
      receiptStatus: "not_issued",
      note: "Portable plan audit projection only; durable audit evidence is written by the local CLI or signed host and this is not an execution receipt.",
    },
    externalPending: true,
  };
}
