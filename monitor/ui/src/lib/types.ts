export type MonitorStatus = "up" | "down" | "degraded" | "pending";
export type MonitorGroup = "infrastructure" | "agents" | "workspaces" | "usage" | "channels" | "instances";
export type MonitorMode = "local" | "relay" | "hybrid";

export interface Heartbeat {
  id: number;
  monitorId: string;
  status: MonitorStatus;
  responseTimeMs: number | null;
  detail: string | null;
  createdAt: number;
}

export interface Incident {
  id: number;
  monitorId: string;
  status: MonitorStatus;
  startedAt: number;
  resolvedAt: number | null;
  durationMs: number | null;
}

export interface MonitorEntry {
  id: string;
  name: string;
  group: MonitorGroup;
  type: string;
  enabled: boolean;
  createdAt: number;
  latestStatus: MonitorStatus;
  latestResponseTimeMs: number | null;
  latestCheckedAt: number | null;
  uptimePercent24h: number;
  heartbeats: Heartbeat[];
}

export interface MonitorDetail extends MonitorEntry {
  incidents: Incident[];
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

export interface LocalInstance {
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

export interface LocalInstanceDetail extends LocalInstance {
  heartbeats: Heartbeat[];
  incidents: Incident[];
  uptimePercent24h: number;
}

export interface MonitorModeInfo {
  mode: MonitorMode;
  relayUrl: string | null;
  localInstanceCount: number;
}

export const GROUP_LABELS: Record<MonitorGroup, string> = {
  infrastructure: "Infrastructure",
  agents: "Agents & Connectors",
  workspaces: "Workspaces",
  usage: "Usage",
  channels: "Channels",
  instances: "Local Instances",
};

export const GROUP_ORDER: MonitorGroup[] = [
  "instances",
  "infrastructure",
  "agents",
  "workspaces",
  "usage",
  "channels",
];
