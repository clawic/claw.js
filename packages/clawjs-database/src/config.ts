import path from "node:path";
import os from "node:os";

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
  const dataDir = overrides.dataDir ?? process.env.DATABASE_DATA_DIR ?? defaultDataDir();
  return {
    host: overrides.host ?? process.env.DATABASE_HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.DATABASE_PORT ?? process.env.PORT ?? "4510"),
    dbPath: overrides.dbPath ?? process.env.DATABASE_DB_PATH ?? process.env.CLAW_DB_PATH ?? path.join(dataDir, "core.sqlite"),
    dataDir,
    filesDir: overrides.filesDir ?? process.env.DATABASE_FILES_DIR ?? process.env.CLAW_FILES_DIR ?? process.env.CLAW_FILES_DIR ?? path.join(dataDir, "files"),
    jwtSecret: overrides.jwtSecret ?? process.env.DATABASE_JWT_SECRET ?? "database-dev-secret-change-me",
    corsOrigins: overrides.corsOrigins ?? (process.env.DATABASE_CORS_ORIGINS ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  };
}

function defaultDataDir(): string {
  const explicit = process.env.CLAW_DATA_DIR ?? process.env.CLAWIX_CLAW_DATA_DIR;
  if (explicit) return expandHome(explicit);
  return path.join(expandHome(process.env.CLAW_HOME ?? path.join(os.homedir(), ".claw")), "data");
}

function expandHome(value: string): string {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}
