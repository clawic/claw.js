import path from "node:path";
import os from "node:os";
import { clawStorageFiles, clawGlobalHomeLayout } from "@clawjs/core";

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

export const SEARCH_DEFAULT_PORT = 24106;

export function loadIndexConfig(overrides: Partial<IndexServiceConfig> = {}): IndexServiceConfig {
  const dataDir =
    overrides.dataDir ??
    process.env.CLAW_SEARCH_DATA_DIR ??
    defaultClawjsDataRoot();
  return {
    host: overrides.host ?? process.env.CLAW_SEARCH_HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.CLAW_SEARCH_PORT ?? process.env.PORT ?? String(SEARCH_DEFAULT_PORT)),
    dbPath: overrides.dbPath ?? process.env.CLAW_SEARCH_DB_PATH ?? path.join(dataDir, clawStorageFiles.searchDatabase),
    dataDir,
    jwtSecret: overrides.jwtSecret ?? process.env.CLAW_SEARCH_JWT_SECRET ?? "search-dev-secret-change-me",
    corsOrigins: overrides.corsOrigins ?? (process.env.CLAW_SEARCH_CORS_ORIGINS ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
    codexBinary: overrides.codexBinary ?? process.env.CLAW_SEARCH_CODEX_BINARY ?? "codex",
    schedulerTickMs: overrides.schedulerTickMs ?? Number(process.env.CLAW_SEARCH_SCHEDULER_TICK_MS ?? "30000"),
    workerConcurrency: overrides.workerConcurrency ?? Number(process.env.CLAW_SEARCH_WORKER_CONCURRENCY ?? "2"),
    defaultRunTimeoutMs: overrides.defaultRunTimeoutMs ?? Number(process.env.CLAW_SEARCH_RUN_TIMEOUT_MS ?? "600000"),
  };
}

function defaultClawjsDataRoot(): string {
  const explicit = process.env.CLAW_DATA_DIR;
  if (explicit) return expandHome(explicit);
  return path.join(expandHome(process.env.CLAW_HOME ?? clawGlobalHomeLayout.root), "data");
}

function expandHome(value: string): string {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}
