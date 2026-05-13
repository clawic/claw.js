import os from "node:os";
import path from "node:path";

export interface BadgerConfig {
  host: string;
  port: number;
  dataDir: string;
  dbPath: string;
  publicBaseUrl: string;
  corsOrigins: string[];
  tokenStorePath: string;
  vaultBaseUrl: string | null;
  driveBaseUrl: string | null;
  schedulerTickMs: number;
  workerTickMs: number;
  recurrenceTickMs: number;
  healthProbeMs: number;
  pipelineEnabled: boolean;
}

export function loadConfig(overrides: Partial<BadgerConfig> = {}): BadgerConfig {
  const dataDir = overrides.dataDir ?? process.env.BADGER_DATA_DIR ?? defaultClawjsDataRoot();
  const host = overrides.host ?? process.env.BADGER_HOST ?? "127.0.0.1";
  const port = overrides.port ?? Number(process.env.BADGER_PORT ?? process.env.PORT ?? "4640");
  const publicBaseUrl = overrides.publicBaseUrl ?? process.env.BADGER_PUBLIC_BASE_URL ?? `http://${host}:${port}`;
  const tokenStorePath =
    overrides.tokenStorePath ??
    process.env.BADGER_TOKEN_STORE ??
    path.join(os.homedir(), ".config", "clawjs-badger", "token");
  return {
    host,
    port,
    dataDir,
    dbPath: overrides.dbPath ?? process.env.BADGER_DB_PATH ?? process.env.CLAWJS_MAIN_DB_PATH ?? path.join(dataDir, "clawjs.sqlite"),
    publicBaseUrl,
    corsOrigins:
      overrides.corsOrigins ??
      (process.env.BADGER_CORS_ORIGINS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    tokenStorePath,
    vaultBaseUrl: overrides.vaultBaseUrl ?? process.env.BADGER_VAULT_URL ?? null,
    driveBaseUrl: overrides.driveBaseUrl ?? process.env.BADGER_DRIVE_URL ?? null,
    schedulerTickMs: overrides.schedulerTickMs ?? Number(process.env.BADGER_SCHEDULER_TICK_MS ?? "30000"),
    workerTickMs: overrides.workerTickMs ?? Number(process.env.BADGER_WORKER_TICK_MS ?? "500"),
    recurrenceTickMs:
      overrides.recurrenceTickMs ?? Number(process.env.BADGER_RECURRENCE_TICK_MS ?? "60000"),
    healthProbeMs: overrides.healthProbeMs ?? Number(process.env.BADGER_HEALTH_PROBE_MS ?? "3600000"),
    pipelineEnabled:
      overrides.pipelineEnabled ?? (process.env.BADGER_PIPELINE_ENABLED !== "0"),
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
