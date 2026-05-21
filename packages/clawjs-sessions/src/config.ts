import { clawDefaultStreamingBackpressurePolicy, clawGlobalHomeLayout } from "@clawjs/core";
import path from "node:path";
import os from "node:os";

export interface SessionsServiceConfig {
  host: string;
  port: number;
  dbPath: string;
  dataDir: string;
  sharedSecret: string;
  codexSessionsDir: string;
  enableCodexAdapter: boolean;
  enableHermesAdapter: boolean;
  hermesStateDbPath: string | null;
  eventsMaxSubscribers: number;
  eventsHardQueueLimit: number;
  eventsMaxQueuedBytes: number;
  eventsMaxFrameBytes: number;
}

export const SESSIONS_DEFAULT_PORT = 24101;
export const SESSIONS_DEFAULT_EVENTS_MAX_SUBSCRIBERS = 128;
export const SESSIONS_DEFAULT_EVENTS_QUEUE_LIMIT = clawDefaultStreamingBackpressurePolicy.maxQueuedFrames;
export const SESSIONS_DEFAULT_EVENTS_MAX_QUEUED_BYTES = clawDefaultStreamingBackpressurePolicy.maxQueuedBytes;
export const SESSIONS_DEFAULT_EVENTS_MAX_FRAME_BYTES = clawDefaultStreamingBackpressurePolicy.maxFrameBytes;

export function loadSessionsConfig(overrides: Partial<SessionsServiceConfig> = {}): SessionsServiceConfig {
  const cwd = process.cwd();
  const dataDir = overrides.dataDir ?? process.env.CLAW_SESSIONS_DATA_DIR ?? defaultClawjsDataRoot();
  const home = process.env.HOME ?? process.env.USERPROFILE ?? cwd;
  return {
    host: overrides.host ?? process.env.CLAW_SESSIONS_HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.CLAW_SESSIONS_PORT ?? process.env.PORT ?? String(SESSIONS_DEFAULT_PORT)),
    dbPath: overrides.dbPath ?? process.env.CLAW_SESSIONS_DB_PATH ?? path.join(dataDir, "sessions.sqlite"),
    dataDir,
    sharedSecret: overrides.sharedSecret ?? process.env.CLAW_SESSIONS_SHARED_SECRET ?? "sessions-dev-secret-change-me",
    codexSessionsDir: overrides.codexSessionsDir ?? process.env.CLAW_SESSIONS_CODEX_DIR ?? path.join(home, ".codex", "sessions"),
    enableCodexAdapter: overrides.enableCodexAdapter ?? (process.env.CLAW_SESSIONS_DISABLE_CODEX !== "1"),
    enableHermesAdapter: overrides.enableHermesAdapter ?? (process.env.CLAW_SESSIONS_DISABLE_HERMES !== "1"),
    hermesStateDbPath: overrides.hermesStateDbPath ?? process.env.CLAW_SESSIONS_HERMES_DB ?? path.join(home, ".hermes", "state.db"),
    eventsMaxSubscribers: parsePositiveInteger(
      overrides.eventsMaxSubscribers ?? process.env.CLAW_SESSIONS_EVENTS_MAX_SUBSCRIBERS,
      SESSIONS_DEFAULT_EVENTS_MAX_SUBSCRIBERS,
    ),
    eventsHardQueueLimit: parsePositiveInteger(
      overrides.eventsHardQueueLimit ?? process.env.CLAW_SESSIONS_EVENTS_QUEUE_LIMIT,
      SESSIONS_DEFAULT_EVENTS_QUEUE_LIMIT,
    ),
    eventsMaxQueuedBytes: parsePositiveInteger(
      overrides.eventsMaxQueuedBytes ?? process.env.CLAW_SESSIONS_EVENTS_MAX_QUEUED_BYTES,
      SESSIONS_DEFAULT_EVENTS_MAX_QUEUED_BYTES,
    ),
    eventsMaxFrameBytes: parsePositiveInteger(
      overrides.eventsMaxFrameBytes ?? process.env.CLAW_SESSIONS_EVENTS_MAX_FRAME_BYTES,
      SESSIONS_DEFAULT_EVENTS_MAX_FRAME_BYTES,
    ),
  };
}

function defaultClawjsDataRoot(): string {
  const explicit = process.env.CLAW_DATA_DIR;
  if (explicit) return expandHome(explicit);
  return process.env.CLAW_HOME ? path.join(expandHome(process.env.CLAW_HOME), "data") : expandHome(clawGlobalHomeLayout.data);
}

function expandHome(value: string): string {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}

function parsePositiveInteger(value: unknown, fallback: number): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(numberValue) || numberValue <= 0) return fallback;
  return numberValue;
}
