import { resolveClawPersistentSurfacePath } from "@clawjs/core";
import path from "node:path";
import os from "node:os";

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

function normalizePositiveInteger(value: unknown, name: string, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "number") {
    if (Number.isSafeInteger(value) && value > 0) return value;
    throw new Error(`${name} must be a positive safe integer.`);
  }
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value.trim())) {
    throw new Error(`${name} must be a positive decimal integer.`);
  }
  const parsed = Number(value.trim());
  if (!Number.isSafeInteger(parsed)) throw new Error(`${name} must be a positive safe integer.`);
  return parsed;
}

function normalizePort(value: unknown, name: string, fallback: number): number {
  const port = normalizePositiveInteger(value, name, fallback);
  if (port > 65_535) throw new Error(`${name} must be a valid TCP port.`);
  return port;
}

export function loadTimeConfig(overrides: Partial<TimeServiceConfig> = {}): TimeServiceConfig {
  const dataDir = overrides.dataDir
    ?? process.env.CLAW_TIME_DATA_DIR
    ?? defaultClawjsDataRoot();
  return {
    host: overrides.host ?? process.env.CLAW_TIME_HOST ?? "127.0.0.1",
    port: normalizePort(overrides.port ?? process.env.CLAW_TIME_PORT, "CLAW_TIME_PORT", 4730),
    dataDir,
    dbPath: overrides.dbPath
      ?? process.env.CLAW_TIME_DB_FILE
      ?? process.env.CLAW_DB_PATH
      ?? process.env.CLAW_DB_PATH
      ?? path.join(dataDir, "core.sqlite"),
    defaultTimeZone: overrides.defaultTimeZone ?? process.env.CLAW_TIME_DEFAULT_TIMEZONE ?? "UTC",
    schedulerIntervalMs: normalizePositiveInteger(overrides.schedulerIntervalMs ?? process.env.CLAW_TIME_SCHEDULER_INTERVAL_MS, "CLAW_TIME_SCHEDULER_INTERVAL_MS", 1000),
    notifyBaseUrl: overrides.notifyBaseUrl ?? process.env.CLAW_TIME_NOTIFY_URL,
    notifySourceToken: overrides.notifySourceToken ?? process.env.CLAW_TIME_NOTIFY_SOURCE_TOKEN,
  };
}

function defaultClawjsDataRoot(): string {
  const explicit = process.env.CLAW_DATA_DIR;
  if (explicit) return expandHome(explicit);
  return expandHome(resolveClawPersistentSurfacePath("claw.global.data"));
}

function expandHome(value: string): string {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}
