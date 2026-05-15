import path from "node:path";
import os from "node:os";
import { clawDataFiles, clawGlobalHomeLayout } from "@clawjs/core";

export interface DatabaseServiceConfig {
  host: string;
  port: number;
  dbPath: string;
  dataDir: string;
  filesDir: string;
  jwtSecret: string;
  corsOrigins: string[];
}

export function loadDatabaseConfig(overrides: Partial<DatabaseServiceConfig> = {}): DatabaseServiceConfig {
  const dataDir = overrides.dataDir ?? process.env.CLAW_DATABASE_DATA_DIR ?? defaultDataDir();
  return {
    host: overrides.host ?? process.env.CLAW_DATABASE_HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.CLAW_DATABASE_PORT ?? process.env.PORT ?? "24102"),
    dbPath: overrides.dbPath ?? process.env.CLAW_DATABASE_DB_PATH ?? process.env.CLAW_DB_PATH ?? path.join(dataDir, clawDataFiles.mainDatabase),
    dataDir,
    filesDir: overrides.filesDir ?? process.env.CLAW_DATABASE_FILES_DIR ?? process.env.CLAW_FILES_DIR ?? process.env.CLAW_FILES_DIR ?? path.join(dataDir, "files"),
    jwtSecret: overrides.jwtSecret ?? process.env.CLAW_DATABASE_JWT_SECRET ?? "database-dev-secret-change-me",
    corsOrigins: overrides.corsOrigins ?? (process.env.CLAW_DATABASE_CORS_ORIGINS ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  };
}

function defaultDataDir(): string {
  const explicit = process.env.CLAW_DATA_DIR;
  if (explicit) return expandHome(explicit);
  return path.join(expandHome(process.env.CLAW_HOME ?? clawGlobalHomeLayout.root), "data");
}

function expandHome(value: string): string {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}
