/* -------------------------------------------------------
   Shared types for the ClawJS Monitor
   ------------------------------------------------------- */

export type MonitorStatus = "up" | "down" | "degraded" | "pending";
export type MonitorGroup = "infrastructure" | "agents" | "workspaces" | "usage" | "channels" | "instances";
export type MonitorType = "http" | "connector" | "workspace" | "usage" | "channel" | "instance" | "gateway";
export type MetricValueType = "number" | "string" | "boolean";
export type MetricQuality = "ok" | "degraded" | "unsupported";

export interface MonitorConfig {
  /** Relay base URL to check (for http type). */
  url?: string;
  /** HTTP method (defaults to GET). */
  method?: string;
  /** Tenant ID for scoped checks. */
  tenantId?: string;
  /** Agent ID for agent/workspace checks. */
  agentId?: string;
  /** Workspace ID for workspace checks. */
  workspaceId?: string;
  /** Connector ID for connector checks. */
  connectorId?: string;
  /** Channel name (telegram, slack, whatsapp). */
  channel?: string;
  /** Usage metric key. */
  metric?: string;
}

export interface Monitor {
  id: string;
  name: string;
  group: MonitorGroup;
  type: MonitorType;
  config: MonitorConfig;
  enabled: boolean;
  createdAt: number;
}

export interface Heartbeat {
  id: number;
  monitorId: string;
  status: MonitorStatus;
  responseTimeMs: number | null;
  detail: string | null;
  createdAt: number;
}

export interface MetricSource {
  id: string;
  kind: "system" | "provider" | "custom";
  adapter: string;
  hostId: string;
  metadata: Record<string, unknown>;
  createdAt: number;
  lastSeenAt: number;
}

export interface MetricSample {
  id: number;
  sourceId: string;
  metricKey: string;
  valueType: MetricValueType;
  value: number | string | boolean | null;
  unit: string;
  tags: Record<string, string>;
  quality: MetricQuality;
  capturedAt: number;
}

export interface MetricRollup {
  id: number;
  sourceId: string;
  metricKey: string;
  bucketMs: number;
  bucketStartAt: number;
  count: number;
  minValue: number | null;
  maxValue: number | null;
  avgValue: number | null;
  lastValue: number | string | boolean | null;
  unit: string;
  tags: Record<string, string>;
}

export interface Incident {
  id: number;
  monitorId: string;
  status: MonitorStatus;
  startedAt: number;
  resolvedAt: number | null;
  durationMs: number | null;
}

export interface MonitorWithLatest extends Monitor {
  latestStatus: MonitorStatus;
  latestResponseTimeMs: number | null;
  latestCheckedAt: number | null;
  uptimePercent24h: number;
  heartbeats: Heartbeat[];
}

export interface MonitorSummary {
  total: number;
  up: number;
  down: number;
  degraded: number;
  pending: number;
  overallUptimePercent: number;
  avgResponseTimeMs: number;
}

/* -------------------------------------------------------
   Local instance snapshot (discovered on this machine)
   ------------------------------------------------------- */

export interface LocalInstanceSnapshot {
  id: string;
  adapter: string;
  runtimeName: string;
  gatewayUrl: string;
  version: string | null;
  status: "running" | "stopped" | "unreachable";
  configPath: string | null;
  capabilities: Record<string, boolean>;
  discoveredAt: number;
  lastSeenAt: number;
}

export interface MonitorModeSnapshot {
  mode: "local" | "relay" | "hybrid";
  relayUrl: string | null;
  localInstanceCount: number;
}

/* -------------------------------------------------------
   Relay consolidated status (GET /v1/monitor/status)
   ------------------------------------------------------- */

export interface RelayStatusSnapshot {
  relay: {
    status: "up";
    uptimeSeconds: number;
    version: string;
  };
  connectors: Array<{
    id: string;
    agentId: string;
    displayName: string;
    status: "online" | "offline";
    lastSeenAt: number | null;
    version: string | null;
  }>;
  agents: Array<{
    id: string;
    tenantId: string;
    displayName: string;
    workspaces: Array<{
      id: string;
      displayName: string;
      status: string;
    }>;
  }>;
  usage: {
    sessionsLast24h: number;
    tokensInLast24h: number;
    tokensOutLast24h: number;
    errorsLast24h: number;
    estimatedCostLast24h: number;
  };
}
