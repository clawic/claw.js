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
  CLAWJS_BRIDGE_PORT?: string;
  CLAWJS_BRIDGE_HTTP_PORT?: string;
  CLAWJS_BRIDGE_BIND?: string;
  CLAWJS_BRIDGE_DB?: string;
  CLAWJS_BRIDGE_STATUS?: string;
  CLAWJS_BRIDGE_NAME?: string;
  CLAWJS_BRIDGED_DISABLE_BONJOUR?: string;
  CLAWJS_BRIDGE_VERSION?: string;
  CLAWJS_BRIDGE_COORDINATOR_URL?: string;
  CLAWJS_BRIDGE_COORDINATOR_TOKEN?: string;
  CLAWJS_BRIDGE_COORDINATOR_DEVICE_ID?: string;
  CLAWJS_BRIDGE_COORDINATOR_TENANT_ID?: string;
  CLAWJS_BRIDGE_COORDINATOR_HEARTBEAT_MS?: string;
  CLAWJS_BRIDGE_IROH_DISABLE?: string;
  CLAWJS_BRIDGE_IROH_RELAY_URL?: string;
  HOME?: string;
}

const DEFAULT_CAPABILITIES = ["bridge", "pair", "remote-jobs"];

export function loadConfig(
  env: BridgeConfigEnv = process.env,
): BridgeConfig {
  const home = env.HOME ?? process.env.HOME ?? ".";
  const coordinatorBaseUrl = env.CLAWJS_BRIDGE_COORDINATOR_URL?.trim();
  const coordinatorToken = env.CLAWJS_BRIDGE_COORDINATOR_TOKEN?.trim();
  const coordinatorDevice = env.CLAWJS_BRIDGE_COORDINATOR_DEVICE_ID?.trim();
  const coordinatorTenant = env.CLAWJS_BRIDGE_COORDINATOR_TENANT_ID?.trim();
  const coordinator = coordinatorBaseUrl && coordinatorToken && coordinatorDevice && coordinatorTenant
    ? {
        baseUrl: coordinatorBaseUrl,
        accessToken: coordinatorToken,
        deviceId: coordinatorDevice,
        tenantId: coordinatorTenant,
        ...(env.CLAWJS_BRIDGE_COORDINATOR_HEARTBEAT_MS
          ? { heartbeatIntervalMs: Number(env.CLAWJS_BRIDGE_COORDINATOR_HEARTBEAT_MS) }
          : {}),
      }
    : undefined;

  return {
    bridgePort: parsePort(env.CLAWJS_BRIDGE_PORT, 7778),
    httpPort: parsePort(env.CLAWJS_BRIDGE_HTTP_PORT, 7779),
    bindAddress: env.CLAWJS_BRIDGE_BIND ?? "127.0.0.1",
    dbPath:
      env.CLAWJS_BRIDGE_DB ?? join(home, ".clawix", "clawjs", "storage.sqlite"),
    statusPath:
      env.CLAWJS_BRIDGE_STATUS ??
      join(home, ".clawix", "state", "bridge-status.json"),
    displayName: env.CLAWJS_BRIDGE_NAME ?? hostname(),
    bonjourEnabled: env.CLAWJS_BRIDGED_DISABLE_BONJOUR !== "1",
    version: env.CLAWJS_BRIDGE_VERSION ?? "0.1.0",
    capabilities: DEFAULT_CAPABILITIES,
    ...(coordinator ? { coordinator } : {}),
    iroh: {
      enabled: env.CLAWJS_BRIDGE_IROH_DISABLE !== "1",
      ...(env.CLAWJS_BRIDGE_IROH_RELAY_URL
        ? { relayUrl: env.CLAWJS_BRIDGE_IROH_RELAY_URL }
        : {}),
    },
  };
}

function parsePort(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > 65535) {
    throw new Error(`invalid port: ${raw}`);
  }
  return n;
}
