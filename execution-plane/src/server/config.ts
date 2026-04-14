import path from "node:path";

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
  const cwd = process.cwd();
  const dataDir = overrides.dataDir ?? process.env.EXECUTION_PLANE_DATA_DIR ?? path.join(cwd, "execution-plane", ".data");
  const host = overrides.host ?? process.env.EXECUTION_PLANE_HOST ?? "127.0.0.1";
  const port = overrides.port ?? Number(process.env.EXECUTION_PLANE_PORT ?? "4710");
  const publicBaseUrl = overrides.publicBaseUrl ?? process.env.EXECUTION_PLANE_PUBLIC_BASE_URL ?? `http://${host}:${port}`;
  return {
    host,
    port,
    publicBaseUrl,
    dataDir,
    deploymentsDir: overrides.deploymentsDir ?? process.env.EXECUTION_PLANE_DEPLOYMENTS_DIR ?? path.join(dataDir, "deployments"),
    databaseFile: overrides.databaseFile ?? process.env.EXECUTION_PLANE_DB_FILE ?? path.join(dataDir, "execution-plane.sqlite"),
    workerSharedSecret: overrides.workerSharedSecret ?? process.env.EXECUTION_PLANE_WORKER_SECRET ?? "execution-plane-worker-secret",
    jwtSecrets: overrides.jwtSecrets ?? (process.env.EXECUTION_PLANE_JWT_SECRETS?.split(",").map((value) => value.trim()).filter(Boolean) ?? ["execution-plane-jwt-secret"]),
    jwtIssuer: overrides.jwtIssuer ?? "execution-plane",
    jwtAudience: overrides.jwtAudience ?? "execution-plane-users",
    accessTokenTtlSec: overrides.accessTokenTtlSec ?? 900,
    refreshTokenTtlSec: overrides.refreshTokenTtlSec ?? 60 * 60 * 24 * 30,
  };
}
