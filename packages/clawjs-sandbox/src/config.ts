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
  if (process.env.CLAWJS_MAIN_DATA_DIR) return expandHome(process.env.CLAWJS_MAIN_DATA_DIR);
  if (process.env.CLAWIX_CLAWJS_DATA_DIR) return expandHome(process.env.CLAWIX_CLAWJS_DATA_DIR);
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Clawix", "clawjs");
  }
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "Clawix", "clawjs");
  }
  return path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"), "Clawix", "clawjs");
}

function expandHome(value: string): string {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}
