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

export const MONITOR_DEFAULT_PORT = 24114;

export function loadMonitorConfig(overrides: Partial<MonitorConfig> = {}): MonitorConfig {
  const cors = process.env.CLAW_MONITOR_CORS_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  const scanPorts = process.env.CLAW_MONITOR_LOCAL_SCAN_PORTS?.split(",").map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n) && n > 0) ?? [];

  const relayUrl = overrides.relayUrl ?? process.env.CLAW_MONITOR_RELAY_URL ?? "";
  const explicitMode = overrides.mode ?? (process.env.CLAW_MONITOR_MODE as MonitorMode | undefined);
  // Auto-detect: if relay URL is provided default to relay, otherwise local
  const mode: MonitorMode = explicitMode ?? (relayUrl ? "relay" : "local");

  return {
    host: overrides.host ?? process.env.CLAW_MONITOR_HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.CLAW_MONITOR_PORT ?? String(MONITOR_DEFAULT_PORT)),
    dbPath: overrides.dbPath ?? process.env.CLAW_MONITOR_DB_PATH ?? path.join(defaultClawjsDataRoot(), "monitor.sqlite"),
    mode,
    relayUrl: relayUrl || "http://127.0.0.1:4410",
    relayToken: overrides.relayToken ?? process.env.CLAW_MONITOR_RELAY_TOKEN ?? "",
    collectIntervalMs: overrides.collectIntervalMs ?? Number(process.env.CLAW_MONITOR_COLLECT_INTERVAL_MS ?? "30000"),
    localDiscoveryIntervalMs: overrides.localDiscoveryIntervalMs ?? Number(process.env.CLAW_MONITOR_LOCAL_DISCOVERY_INTERVAL_MS ?? "60000"),
    localScanPorts: overrides.localScanPorts ?? scanPorts,
    retentionDays: overrides.retentionDays ?? Number(process.env.CLAW_MONITOR_RETENTION_DAYS ?? "30"),
    corsOrigins: overrides.corsOrigins ?? cors,
  };
}

function defaultClawjsDataRoot(): string {
  const explicit = process.env.CLAW_DATA_DIR ?? process.env.CLAWIX_CLAW_DATA_DIR;
  if (explicit) return expandHome(explicit);
  return path.join(expandHome(process.env.CLAW_HOME ?? path.join(os.homedir(), ".claw")), "data");
}

function expandHome(value: string): string {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}
