import path from "node:path";

export interface IotServiceConfig {
  host: string;
  port: number;
  dataDir: string;
  dbPath: string;
  corsOrigins: string[];
}

export function loadIotConfig(overrides: Partial<IotServiceConfig> = {}): IotServiceConfig {
  const cwd = process.cwd();
  return {
    host: overrides.host ?? process.env.IOT_HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.IOT_PORT ?? "4520"),
    dataDir: overrides.dataDir ?? process.env.IOT_DATA_DIR ?? path.join(cwd, ".data"),
    dbPath: overrides.dbPath ?? process.env.IOT_DB_PATH ?? path.join(cwd, ".data", "iot.sqlite"),
    corsOrigins: overrides.corsOrigins ?? (
      process.env.IOT_CORS_ORIGINS?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? []
    ),
  };
}
