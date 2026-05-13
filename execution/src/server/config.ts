import path from "node:path";
import os from "node:os";

export interface ExecutionPlaneConfig {
  host: string;
  port: number;
  publicBaseUrl: string;
  databaseFile: string;
  dataDir: string;
  deploymentsDir: string;
  workerSharedSecret: string;
  jwtSecrets: string[];
  jwtIssuer: string;
  jwtAudience: string;
  accessTokenTtlSec: number;
  refreshTokenTtlSec: number;
}

export function loadExecutionPlaneConfig(overrides: Partial<ExecutionPlaneConfig> = {}): ExecutionPlaneConfig {
  const dataDir = overrides.dataDir ?? process.env.EXECUTION_PLANE_DATA_DIR ?? defaultClawjsDataRoot();
  const host = overrides.host ?? process.env.EXECUTION_PLANE_HOST ?? "127.0.0.1";
  const port = overrides.port ?? Number(process.env.EXECUTION_PLANE_PORT ?? "4710");
  const publicBaseUrl = overrides.publicBaseUrl ?? process.env.EXECUTION_PLANE_PUBLIC_BASE_URL ?? `http://${host}:${port}`;
  return {
    host,
    port,
    publicBaseUrl,
    dataDir,
    deploymentsDir: overrides.deploymentsDir ?? process.env.EXECUTION_PLANE_DEPLOYMENTS_DIR ?? path.join(dataDir, "deployments"),
    databaseFile: overrides.databaseFile ?? process.env.EXECUTION_PLANE_DB_FILE ?? path.join(dataDir, "infra.sqlite"),
    workerSharedSecret: overrides.workerSharedSecret ?? process.env.EXECUTION_PLANE_WORKER_SECRET ?? "execution-worker-secret",
    jwtSecrets: overrides.jwtSecrets ?? (process.env.EXECUTION_PLANE_JWT_SECRETS?.split(",").map((value) => value.trim()).filter(Boolean) ?? ["execution-jwt-secret"]),
    jwtIssuer: overrides.jwtIssuer ?? "execution",
    jwtAudience: overrides.jwtAudience ?? "execution-users",
    accessTokenTtlSec: overrides.accessTokenTtlSec ?? 900,
    refreshTokenTtlSec: overrides.refreshTokenTtlSec ?? 60 * 60 * 24 * 30,
  };
}

function defaultClawjsDataRoot(): string {
  if (process.env.CLAW_DATA_DIR) return expandHome(process.env.CLAW_DATA_DIR);
  if (process.env.CLAWIX_CLAW_DATA_DIR) return expandHome(process.env.CLAWIX_CLAW_DATA_DIR);
  if (process.platform === "darwin") return path.join(os.homedir(), ".claw", "data");
  if (process.platform === "win32") return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "Clawix", "clawjs");
  return path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"), "Clawix", "clawjs");
}

function expandHome(value: string): string {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}
