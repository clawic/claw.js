import path from "node:path";
import os from "node:os";
import { clawStorageFiles, resolveClawGlobalDataStorageDir } from "@clawjs/core";

export interface DatabaseServiceConfig {
  host: string;
  port: number;
  dbPath: string;
  dataDir: string;
  filesDir: string;
  maxUploadFileBytes: number;
  realtimeMaxClients: number;
  realtimeMaxSubscriptionsPerClient: number;
  realtimeMaxQueuedMessagesPerClient: number;
  realtimeMaxBufferedBytesPerClient: number;
  jwtSecret: string;
  corsOrigins: string[];
}

export const DEFAULT_REALTIME_MAX_CLIENTS = 128;
export const DEFAULT_REALTIME_MAX_SUBSCRIPTIONS_PER_CLIENT = 64;
export const DEFAULT_REALTIME_MAX_QUEUED_MESSAGES_PER_CLIENT = 256;
export const DEFAULT_REALTIME_MAX_BUFFERED_BYTES_PER_CLIENT = 1024 * 1024;
export const DEFAULT_MAX_UPLOAD_FILE_BYTES = 100 * 1024 * 1024;

export function loadDatabaseConfig(overrides: Partial<DatabaseServiceConfig> = {}): DatabaseServiceConfig {
  const dataDir = overrides.dataDir ?? process.env.CLAW_DATABASE_DATA_DIR ?? defaultDataDir();
  return {
    host: overrides.host ?? process.env.CLAW_DATABASE_HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.CLAW_DATABASE_PORT ?? process.env.PORT ?? "24102"),
    dbPath: overrides.dbPath ?? process.env.CLAW_DATABASE_DB_PATH ?? process.env.CLAW_DB_PATH ?? path.join(dataDir, clawStorageFiles.mainDatabase),
    dataDir,
    filesDir: overrides.filesDir ?? process.env.CLAW_DATABASE_FILES_DIR ?? process.env.CLAW_FILES_DIR ?? process.env.CLAW_FILES_DIR ?? path.join(dataDir, "files"),
    maxUploadFileBytes: parsePositiveInteger(
      overrides.maxUploadFileBytes ?? process.env.CLAW_DATABASE_MAX_UPLOAD_BYTES,
      DEFAULT_MAX_UPLOAD_FILE_BYTES,
    ),
    realtimeMaxClients: parsePositiveInteger(
      overrides.realtimeMaxClients ?? process.env.CLAW_DATABASE_REALTIME_MAX_CLIENTS,
      DEFAULT_REALTIME_MAX_CLIENTS,
    ),
    realtimeMaxSubscriptionsPerClient: parsePositiveInteger(
      overrides.realtimeMaxSubscriptionsPerClient ?? process.env.CLAW_DATABASE_REALTIME_MAX_SUBSCRIPTIONS,
      DEFAULT_REALTIME_MAX_SUBSCRIPTIONS_PER_CLIENT,
    ),
    realtimeMaxQueuedMessagesPerClient: parsePositiveInteger(
      overrides.realtimeMaxQueuedMessagesPerClient ?? process.env.CLAW_DATABASE_REALTIME_QUEUE_LIMIT,
      DEFAULT_REALTIME_MAX_QUEUED_MESSAGES_PER_CLIENT,
    ),
    realtimeMaxBufferedBytesPerClient: parsePositiveInteger(
      overrides.realtimeMaxBufferedBytesPerClient ?? process.env.CLAW_DATABASE_REALTIME_MAX_BUFFERED_BYTES,
      DEFAULT_REALTIME_MAX_BUFFERED_BYTES_PER_CLIENT,
    ),
    jwtSecret: overrides.jwtSecret ?? process.env.CLAW_DATABASE_JWT_SECRET ?? "database-dev-secret-change-me",
    corsOrigins: overrides.corsOrigins ?? (process.env.CLAW_DATABASE_CORS_ORIGINS ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  };
}

function defaultDataDir(): string {
  const explicit = process.env.CLAW_DATA_DIR;
  return resolveClawGlobalDataStorageDir({
    homeDir: os.homedir(),
    ...(explicit ? { dataDir: explicit } : {}),
    ...(process.env.CLAW_HOME ? { clawHome: process.env.CLAW_HOME } : {}),
  });
}

function parsePositiveInteger(value: unknown, fallback: number): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(numberValue) || numberValue <= 0) return fallback;
  return numberValue;
}
