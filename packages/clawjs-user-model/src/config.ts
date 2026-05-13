import path from "node:path";
import os from "node:os";

export interface UserModelServiceConfig {
  host: string;
  port: number;
  dbPath: string;
  dataDir: string;
  sharedSecret: string;
}

export function loadUserModelConfig(overrides: Partial<UserModelServiceConfig> = {}): UserModelServiceConfig {
  const dataDir = overrides.dataDir ?? process.env.USER_MODEL_DATA_DIR ?? defaultClawjsDataRoot();
  return {
    host: overrides.host ?? process.env.USER_MODEL_HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.USER_MODEL_PORT ?? process.env.PORT ?? "4650"),
    dbPath: overrides.dbPath ?? process.env.USER_MODEL_DB_PATH ?? process.env.CLAWJS_MAIN_DB_PATH ?? path.join(dataDir, "clawjs.sqlite"),
    dataDir,
    sharedSecret: overrides.sharedSecret ?? process.env.USER_MODEL_SHARED_SECRET ?? "user-model-dev-secret-change-me",
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
