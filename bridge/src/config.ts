import { resolveClawPersistentSurfacePath } from "@clawjs/core";
import { hostname } from "node:os";
import { join } from "node:path";

export interface BridgeConfig {
  bridgePort: number;
  httpPort: number;
  bindAddress: string;
  dbPath: string;
  statusPath: string;
  displayName: string;
  bonjourEnabled: boolean;
  version: string;
  capabilities: string[];
  coordinator?: {
    baseUrl: string;
    accessToken: string;
    deviceId: string;
    tenantId: string;
    heartbeatIntervalMs?: number;
  };
  iroh?: {
    enabled: boolean;
    relayUrl?: string;
  };
}

export interface BridgeConfigEnv {
  CLAW_REMOTE_PORT?: string;
  CLAW_REMOTE_HTTP_PORT?: string;
  CLAW_REMOTE_BIND?: string;
  CLAW_REMOTE_DB?: string;
  CLAW_REMOTE_STATUS?: string;
  CLAW_REMOTE_NAME?: string;
  CLAW_REMOTE_DISABLE_BONJOUR?: string;
  CLAW_REMOTE_VERSION?: string;
  CLAW_REMOTE_COORDINATOR_URL?: string;
  CLAW_REMOTE_COORDINATOR_TOKEN?: string;
  CLAW_REMOTE_COORDINATOR_DEVICE_ID?: string;
  CLAW_REMOTE_COORDINATOR_TENANT_ID?: string;
  CLAW_REMOTE_COORDINATOR_HEARTBEAT_MS?: string;
  CLAW_REMOTE_IROH_DISABLE?: string;
  CLAW_REMOTE_IROH_RELAY_URL?: string;
  CLAW_DATA_DIR?: string;
  CLAWIX_CLAW_DATA_DIR?: string;
  APPDATA?: string;
  XDG_DATA_HOME?: string;
  HOME?: string;
}

const DEFAULT_CAPABILITIES = ["remote", "pair", "jobs"];

export function loadConfig(
  env: BridgeConfigEnv = process.env,
): BridgeConfig {
  const home = env.HOME ?? process.env.HOME ?? ".";
  const coordinatorBaseUrl = env.CLAW_REMOTE_COORDINATOR_URL?.trim();
  const coordinatorToken = env.CLAW_REMOTE_COORDINATOR_TOKEN?.trim();
  const coordinatorDevice = env.CLAW_REMOTE_COORDINATOR_DEVICE_ID?.trim();
  const coordinatorTenant = env.CLAW_REMOTE_COORDINATOR_TENANT_ID?.trim();
  const coordinator = coordinatorBaseUrl && coordinatorToken && coordinatorDevice && coordinatorTenant
    ? {
        baseUrl: coordinatorBaseUrl,
        accessToken: coordinatorToken,
        deviceId: coordinatorDevice,
        tenantId: coordinatorTenant,
        ...(env.CLAW_REMOTE_COORDINATOR_HEARTBEAT_MS
          ? { heartbeatIntervalMs: Number(env.CLAW_REMOTE_COORDINATOR_HEARTBEAT_MS) }
          : {}),
      }
    : undefined;

  return {
    bridgePort: parsePort(env.CLAW_REMOTE_PORT, 24112),
    httpPort: parsePort(env.CLAW_REMOTE_HTTP_PORT, 24113),
    bindAddress: env.CLAW_REMOTE_BIND ?? "127.0.0.1",
    dbPath:
      env.CLAW_REMOTE_DB ?? join(resolveClawjsDataRoot(env, home), "core.sqlite"),
    statusPath:
      env.CLAW_REMOTE_STATUS ??
      expandHome(resolveClawPersistentSurfacePath("clawix.home.state", "", "bridge-status.json"), home),
    displayName: env.CLAW_REMOTE_NAME ?? hostname(),
    bonjourEnabled: env.CLAW_REMOTE_DISABLE_BONJOUR !== "1",
    version: env.CLAW_REMOTE_VERSION ?? "0.1.0",
    capabilities: DEFAULT_CAPABILITIES,
    ...(coordinator ? { coordinator } : {}),
    iroh: {
      enabled: env.CLAW_REMOTE_IROH_DISABLE !== "1",
      ...(env.CLAW_REMOTE_IROH_RELAY_URL
        ? { relayUrl: env.CLAW_REMOTE_IROH_RELAY_URL }
        : {}),
    },
  };
}

function resolveClawjsDataRoot(env: BridgeConfigEnv, home: string): string {
  if (env.CLAW_DATA_DIR) return expandHome(env.CLAW_DATA_DIR, home);
  if (env.CLAWIX_CLAW_DATA_DIR) return expandHome(env.CLAWIX_CLAW_DATA_DIR, home);
  return expandHome(resolveClawPersistentSurfacePath("claw.global.data"), home);
}

function expandHome(value: string, home: string): string {
  return value.startsWith("~/") ? join(home, value.slice(2)) : value;
}

function parsePort(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > 65535) {
    throw new Error(`invalid port: ${raw}`);
  }
  return n;
}
