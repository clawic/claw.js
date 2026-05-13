import path from "node:path";
import os from "node:os";

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
  const dataDir = overrides.dataDir ?? process.env.FEED_DATA_DIR ?? defaultClawjsDataRoot();
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
