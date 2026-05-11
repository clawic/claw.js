import path from "node:path";

export interface UserModelServiceConfig {
  host: string;
  port: number;
  dbPath: string;
  dataDir: string;
  sharedSecret: string;
}

export function loadUserModelConfig(overrides: Partial<UserModelServiceConfig> = {}): UserModelServiceConfig {
  const cwd = process.cwd();
  const dataDir = overrides.dataDir ?? process.env.USER_MODEL_DATA_DIR ?? path.join(cwd, ".data");
  return {
    host: overrides.host ?? process.env.USER_MODEL_HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.USER_MODEL_PORT ?? process.env.PORT ?? "4650"),
    dbPath: overrides.dbPath ?? process.env.USER_MODEL_DB_PATH ?? path.join(dataDir, "user-model.sqlite"),
    dataDir,
    sharedSecret: overrides.sharedSecret ?? process.env.USER_MODEL_SHARED_SECRET ?? "user-model-dev-secret-change-me",
  };
}
