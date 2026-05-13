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
}

export const SESSIONS_DEFAULT_PORT = 24101;

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
  };
}

function defaultClawjsDataRoot(): string {
  const explicit = process.env.CLAW_DATA_DIR ?? process.env.CLAWIX_CLAW_DATA_DIR;
  if (explicit) return expandHome(explicit);
  return path.join(expandHome(process.env.CLAW_HOME ?? path.join(os.homedir(), ".claw")), "data");
}

function expandHome(value: string): string {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}
