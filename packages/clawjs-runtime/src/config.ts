import path from "node:path";
import os from "node:os";

export interface RuntimeServiceConfig {
  host: string;
  port: number;
  dbPath: string;
  dataDir: string;
  sharedSecret: string;
  skillsOutputDir: string;
  sessionsBaseUrl: string;
  sessionsToken: string;
  userModelBaseUrl: string;
  userModelToken: string;
}

export function loadRuntimeConfig(overrides: Partial<RuntimeServiceConfig> = {}): RuntimeServiceConfig {
  const dataDir = overrides.dataDir ?? process.env.RUNTIME_DATA_DIR ?? defaultClawjsDataRoot();
  return {
    host: overrides.host ?? process.env.RUNTIME_HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.RUNTIME_PORT ?? process.env.PORT ?? "4660"),
    dbPath: overrides.dbPath ?? process.env.RUNTIME_DB_PATH ?? path.join(dataDir, "runtime.sqlite"),
    dataDir,
    sharedSecret: overrides.sharedSecret ?? process.env.RUNTIME_SHARED_SECRET ?? "runtime-dev-secret-change-me",
    skillsOutputDir: overrides.skillsOutputDir ?? process.env.RUNTIME_SKILLS_DIR ?? path.join(dataDir, "skills-distilled"),
    sessionsBaseUrl: overrides.sessionsBaseUrl ?? process.env.RUNTIME_SESSIONS_URL ?? "http://127.0.0.1:4640",
    sessionsToken: overrides.sessionsToken ?? process.env.RUNTIME_SESSIONS_TOKEN ?? "",
    userModelBaseUrl: overrides.userModelBaseUrl ?? process.env.RUNTIME_USER_MODEL_URL ?? "http://127.0.0.1:4650",
    userModelToken: overrides.userModelToken ?? process.env.RUNTIME_USER_MODEL_TOKEN ?? "",
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
