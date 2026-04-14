import path from "node:path";

export interface NotifyServiceConfig {
  host: string;
  port: number;
  dbPath: string;
  dataDir: string;
  jwtSecret: string;
  corsOrigins: string[];
}

export function loadNotifyConfig(overrides: Partial<NotifyServiceConfig> = {}): NotifyServiceConfig {
  const cwd = process.cwd();
  const dataDir = overrides.dataDir ?? process.env.NOTIFY_DATA_DIR ?? path.join(cwd, ".data");
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
