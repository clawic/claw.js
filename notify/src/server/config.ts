import path from "node:path";
import os from "node:os";

export interface NotifyServiceConfig {
  host: string;
  port: number;
  dbPath: string;
  dataDir: string;
  jwtSecret: string;
  corsOrigins: string[];
}

export function loadNotifyConfig(overrides: Partial<NotifyServiceConfig> = {}): NotifyServiceConfig {
  const dataDir = overrides.dataDir ?? process.env.NOTIFY_DATA_DIR ?? defaultClawjsDataRoot();
  return {
    host: overrides.host ?? process.env.NOTIFY_HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.NOTIFY_PORT ?? process.env.PORT ?? "4610"),
    dbPath: overrides.dbPath ?? process.env.NOTIFY_DB_PATH ?? path.join(dataDir, "notify.sqlite"),
    dataDir,
    jwtSecret: overrides.jwtSecret ?? process.env.NOTIFY_JWT_SECRET ?? "notify-dev-secret-change-me",
    corsOrigins: overrides.corsOrigins ?? (process.env.NOTIFY_CORS_ORIGINS ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
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
