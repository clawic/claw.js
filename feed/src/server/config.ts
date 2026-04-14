import path from "node:path";

export interface FeedServiceConfig {
  host: string;
  port: number;
  dbPath: string;
  dataDir: string;
  jwtSecret: string;
  corsOrigins: string[];
  pollEnabled: boolean;
  pollIntervalMs: number;
}

export function loadFeedConfig(overrides: Partial<FeedServiceConfig> = {}): FeedServiceConfig {
  const cwd = process.cwd();
  const dataDir = overrides.dataDir ?? process.env.FEED_DATA_DIR ?? path.join(cwd, ".data");
  return {
    host: overrides.host ?? process.env.FEED_HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.FEED_PORT ?? process.env.PORT ?? "4530"),
    dbPath: overrides.dbPath ?? process.env.FEED_DB_PATH ?? path.join(dataDir, "feed.sqlite"),
    dataDir,
    jwtSecret: overrides.jwtSecret ?? process.env.FEED_JWT_SECRET ?? "feed-dev-secret-change-me",
    corsOrigins: overrides.corsOrigins ?? (process.env.FEED_CORS_ORIGINS ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
    pollEnabled: overrides.pollEnabled ?? (process.env.FEED_POLL_ENABLED !== "false"),
    pollIntervalMs: overrides.pollIntervalMs ?? Number(process.env.FEED_POLL_INTERVAL ?? "60000"),
  };
}
