import path from "node:path";
import os from "node:os";

export interface IotServiceConfig {
  host: string;
  port: number;
  dataDir: string;
  dbPath: string;
  corsOrigins: string[];
}

export function loadIotConfig(overrides: Partial<IotServiceConfig> = {}): IotServiceConfig {
  const dataDir = overrides.dataDir ?? process.env.IOT_DATA_DIR ?? defaultClawjsDataRoot();
  return {
    host: overrides.host ?? process.env.IOT_HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.IOT_PORT ?? "4520"),
    dataDir,
    dbPath: overrides.dbPath
      ?? process.env.IOT_DB_PATH
      ?? process.env.CLAWJS_MAIN_DB_PATH
      ?? path.join(dataDir, "clawjs.sqlite"),
    corsOrigins: overrides.corsOrigins ?? (
      process.env.IOT_CORS_ORIGINS?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? []
    ),
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
