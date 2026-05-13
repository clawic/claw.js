import path from "node:path";
import os from "node:os";

export interface TimeServiceConfig {
  host: string;
  port: number;
  dataDir: string;
  dbPath: string;
  defaultTimeZone: string;
  schedulerIntervalMs: number;
  notifyBaseUrl?: string;
  notifySourceToken?: string;
}

export function loadTimeConfig(overrides: Partial<TimeServiceConfig> = {}): TimeServiceConfig {
  const dataDir = overrides.dataDir
    ?? process.env.CLAW_TIME_DATA_DIR
    ?? defaultClawjsDataRoot();
  return {
    host: overrides.host ?? process.env.CLAW_TIME_HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.CLAW_TIME_PORT ?? 4730),
    dataDir,
    dbPath: overrides.dbPath
      ?? process.env.CLAW_TIME_DB_FILE
      ?? process.env.CLAW_DB_PATH
      ?? process.env.CLAW_DB_PATH
      ?? path.join(dataDir, "core.sqlite"),
    defaultTimeZone: overrides.defaultTimeZone ?? process.env.CLAW_TIME_DEFAULT_TIMEZONE ?? "UTC",
    schedulerIntervalMs: overrides.schedulerIntervalMs ?? Number(process.env.CLAW_TIME_SCHEDULER_INTERVAL_MS ?? 1000),
    notifyBaseUrl: overrides.notifyBaseUrl ?? process.env.CLAW_TIME_NOTIFY_URL,
    notifySourceToken: overrides.notifySourceToken ?? process.env.CLAW_TIME_NOTIFY_SOURCE_TOKEN,
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
