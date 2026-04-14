import path from "node:path";

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
    ?? path.resolve(process.cwd(), ".data");
  return {
    host: overrides.host ?? process.env.CLAWJS_TIME_HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.CLAWJS_TIME_PORT ?? 4730),
    dataDir,
    dbPath: overrides.dbPath ?? process.env.CLAWJS_TIME_DB_FILE ?? path.join(dataDir, "time.sqlite"),
    defaultTimeZone: overrides.defaultTimeZone ?? process.env.CLAWJS_TIME_DEFAULT_TIMEZONE ?? "UTC",
    schedulerIntervalMs: overrides.schedulerIntervalMs ?? Number(process.env.CLAWJS_TIME_SCHEDULER_INTERVAL_MS ?? 1000),
    notifyBaseUrl: overrides.notifyBaseUrl ?? process.env.CLAWJS_TIME_NOTIFY_URL,
    notifySourceToken: overrides.notifySourceToken ?? process.env.CLAWJS_TIME_NOTIFY_SOURCE_TOKEN,
  };
}
