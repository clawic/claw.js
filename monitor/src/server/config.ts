import path from "node:path";
import os from "node:os";

export type MonitorMode = "local" | "relay" | "hybrid";

export interface MonitorConfig {
  host: string;
  port: number;
  dbPath: string;
  /** Operating mode: local (scan machine), relay (poll relay), or hybrid (both). */
  mode: MonitorMode;
  /** Relay settings (used in relay/hybrid modes). */
  relayUrl: string;
  relayToken: string;
  /** Heartbeat collection interval for relay monitors. */
  collectIntervalMs: number;
  /** Local discovery re-scan interval in ms (default 60000). */
  localDiscoveryIntervalMs: number;
  /** Extra gateway ports to probe during local discovery. */
  localScanPorts: number[];
  retentionDays: number;
  corsOrigins: string[];
}

export function loadMonitorConfig(overrides: Partial<MonitorConfig> = {}): MonitorConfig {
  const cors = process.env.MONITOR_CORS_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  const scanPorts = process.env.MONITOR_LOCAL_SCAN_PORTS?.split(",").map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n) && n > 0) ?? [];

  const relayUrl = overrides.relayUrl ?? process.env.MONITOR_RELAY_URL ?? "";
  const explicitMode = overrides.mode ?? (process.env.MONITOR_MODE as MonitorMode | undefined);
  // Auto-detect: if relay URL is provided default to relay, otherwise local
  const mode: MonitorMode = explicitMode ?? (relayUrl ? "relay" : "local");

  return {
    host: overrides.host ?? process.env.MONITOR_HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.MONITOR_PORT ?? "4420"),
    dbPath: overrides.dbPath ?? process.env.MONITOR_DB_PATH ?? path.join(defaultClawjsDataRoot(), "monitor.sqlite"),
    mode,
    relayUrl: relayUrl || "http://127.0.0.1:4410",
    relayToken: overrides.relayToken ?? process.env.MONITOR_RELAY_TOKEN ?? "",
    collectIntervalMs: overrides.collectIntervalMs ?? Number(process.env.MONITOR_COLLECT_INTERVAL_MS ?? "30000"),
    localDiscoveryIntervalMs: overrides.localDiscoveryIntervalMs ?? Number(process.env.MONITOR_LOCAL_DISCOVERY_INTERVAL_MS ?? "60000"),
    localScanPorts: overrides.localScanPorts ?? scanPorts,
    retentionDays: overrides.retentionDays ?? Number(process.env.MONITOR_RETENTION_DAYS ?? "30"),
    corsOrigins: overrides.corsOrigins ?? cors,
  };
}

function defaultClawjsDataRoot(): string {
  if (process.env.CLAW_DATA_DIR) return expandHome(process.env.CLAW_DATA_DIR);
  if (process.env.CLAWIX_CLAW_DATA_DIR) return expandHome(process.env.CLAWIX_CLAW_DATA_DIR);
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Clawix", "clawjs");
  if (process.platform === "win32") return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "Clawix", "clawjs");
  return path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"), "Clawix", "clawjs");
}

function expandHome(value: string): string {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}
