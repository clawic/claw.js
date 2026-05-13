import os from "node:os";
import path from "node:path";

export interface DelegationPlaneConfig {
  host: string;
  port: number;
  dataDir: string;
  databaseFile: string;
  schedulerIntervalMs: number;
  startScheduler: boolean;
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadDelegationPlaneConfig(overrides: Partial<DelegationPlaneConfig> = {}): DelegationPlaneConfig {
  const dataDir = overrides.dataDir
    ?? process.env.DELEGATION_PLANE_DATA_DIR
    ?? defaultClawjsDataRoot();
  return {
    host: overrides.host ?? process.env.DELEGATION_PLANE_HOST ?? "127.0.0.1",
    port: overrides.port ?? envNumber("DELEGATION_PLANE_PORT", 4520),
    dataDir,
    databaseFile: overrides.databaseFile ?? process.env.DELEGATION_PLANE_DATABASE_FILE ?? path.join(dataDir, "runtime.sqlite"),
    schedulerIntervalMs: overrides.schedulerIntervalMs ?? envNumber("DELEGATION_PLANE_SCHEDULER_INTERVAL_MS", 1000),
    startScheduler: overrides.startScheduler ?? process.env.DELEGATION_PLANE_SCHEDULER !== "0",
  };
}

function defaultClawjsDataRoot(): string {
  if (process.env.CLAWJS_MAIN_DATA_DIR) return expandHome(process.env.CLAWJS_MAIN_DATA_DIR);
  if (process.env.CLAWIX_CLAWJS_DATA_DIR) return expandHome(process.env.CLAWIX_CLAWJS_DATA_DIR);
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Clawix", "clawjs");
  }
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "Clawix", "clawjs");
  }
  return path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"), "Clawix", "clawjs");
}

function expandHome(value: string): string {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}
