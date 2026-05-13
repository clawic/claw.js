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
    ?? process.env.CLAWJS_TIME_DATA_DIR
    ?? defaultClawjsDataRoot();
  return {
    host: overrides.host ?? process.env.CLAWJS_TIME_HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.CLAWJS_TIME_PORT ?? 4730),
    dataDir,
    dbPath: overrides.dbPath
      ?? process.env.CLAWJS_TIME_DB_FILE
      ?? process.env.CLAWJS_MAIN_DB_PATH
      ?? path.join(dataDir, "clawjs.sqlite"),
    defaultTimeZone: overrides.defaultTimeZone ?? process.env.CLAWJS_TIME_DEFAULT_TIMEZONE ?? "UTC",
    schedulerIntervalMs: overrides.schedulerIntervalMs ?? Number(process.env.CLAWJS_TIME_SCHEDULER_INTERVAL_MS ?? 1000),
    notifyBaseUrl: overrides.notifyBaseUrl ?? process.env.CLAWJS_TIME_NOTIFY_URL,
    notifySourceToken: overrides.notifySourceToken ?? process.env.CLAWJS_TIME_NOTIFY_SOURCE_TOKEN,
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
