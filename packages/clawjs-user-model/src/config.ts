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
    dbPath: overrides.dbPath ?? process.env.USER_MODEL_DB_PATH ?? process.env.CLAW_DB_PATH ?? process.env.CLAW_DB_PATH ?? path.join(dataDir, "core.sqlite"),
    dataDir,
    sharedSecret: overrides.sharedSecret ?? process.env.USER_MODEL_SHARED_SECRET ?? "user-model-dev-secret-change-me",
  };
}

function defaultClawjsDataRoot(): string {
  const explicit = process.env.CLAW_DATA_DIR ?? process.env.CLAWIX_CLAW_DATA_DIR ?? process.env.CLAW_DATA_DIR ?? process.env.CLAWIX_CLAW_DATA_DIR;
  if (explicit) return expandHome(explicit);
  return path.join(expandHome(process.env.CLAW_HOME ?? path.join(os.homedir(), ".claw")), "data");
}

function expandHome(value: string): string {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}
