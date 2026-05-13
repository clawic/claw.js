import path from "node:path";
import os from "node:os";

export interface IndexServiceConfig {
  host: string;
  port: number;
  dbPath: string;
  dataDir: string;
  jwtSecret: string;
  corsOrigins: string[];
  codexBinary: string;
  schedulerTickMs: number;
  workerConcurrency: number;
  defaultRunTimeoutMs: number;
}

export function loadIndexConfig(overrides: Partial<IndexServiceConfig> = {}): IndexServiceConfig {
  const dataDir =
    overrides.dataDir ??
    process.env.INDEX_DATA_DIR ??
    defaultClawjsDataRoot();
  return {
    host: overrides.host ?? process.env.INDEX_HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.INDEX_PORT ?? process.env.PORT ?? "7796"),
    dbPath: overrides.dbPath ?? process.env.INDEX_DB_PATH ?? path.join(dataDir, "search.sqlite"),
    dataDir,
    jwtSecret: overrides.jwtSecret ?? process.env.INDEX_JWT_SECRET ?? "index-dev-secret-change-me",
    corsOrigins: overrides.corsOrigins ?? (process.env.INDEX_CORS_ORIGINS ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
    codexBinary: overrides.codexBinary ?? process.env.INDEX_CODEX_BINARY ?? "codex",
    schedulerTickMs: overrides.schedulerTickMs ?? Number(process.env.INDEX_SCHEDULER_TICK_MS ?? "30000"),
    workerConcurrency: overrides.workerConcurrency ?? Number(process.env.INDEX_WORKER_CONCURRENCY ?? "2"),
    defaultRunTimeoutMs: overrides.defaultRunTimeoutMs ?? Number(process.env.INDEX_RUN_TIMEOUT_MS ?? "600000"),
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
