import path from "node:path";
import os from "node:os";

export interface SandboxServiceConfig {
  host: string;
  port: number;
  dbPath: string;
  dataDir: string;
  sharedSecret: string;
  defaultTimeoutMs: number;
  enableDocker: boolean;
  enableSsh: boolean;
  dockerBin: string;
  sshBin: string;
}

export function loadSandboxConfig(overrides: Partial<SandboxServiceConfig> = {}): SandboxServiceConfig {
  const dataDir = overrides.dataDir ?? process.env.SANDBOX_DATA_DIR ?? defaultClawjsDataRoot();
  return {
    host: overrides.host ?? process.env.SANDBOX_HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.SANDBOX_PORT ?? process.env.PORT ?? "4670"),
    dbPath: overrides.dbPath ?? process.env.SANDBOX_DB_PATH ?? path.join(dataDir, "runtime.sqlite"),
    dataDir,
    sharedSecret: overrides.sharedSecret ?? process.env.SANDBOX_SHARED_SECRET ?? "sandbox-dev-secret-change-me",
    defaultTimeoutMs: overrides.defaultTimeoutMs ?? Number(process.env.SANDBOX_DEFAULT_TIMEOUT_MS ?? "120000"),
    enableDocker: overrides.enableDocker ?? (process.env.SANDBOX_DISABLE_DOCKER !== "1"),
    enableSsh: overrides.enableSsh ?? (process.env.SANDBOX_DISABLE_SSH !== "1"),
    dockerBin: overrides.dockerBin ?? process.env.SANDBOX_DOCKER_BIN ?? "docker",
    sshBin: overrides.sshBin ?? process.env.SANDBOX_SSH_BIN ?? "ssh",
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
