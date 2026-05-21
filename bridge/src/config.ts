import { resolveClawPersistentSurfacePath } from "@clawjs/core";
import { hostname } from "node:os";
import { join } from "node:path";

export interface BridgeConfig {
  bridgePort: number;
  httpPort: number;
  bindAddress: string;
  exposure?: BridgeExposureMode;
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
  CLAW_REMOTE_EXPOSURE?: string;
  CLAW_REMOTE_DB?: string;
  CLAW_REMOTE_STATUS?: string;
  CLAW_REMOTE_NAME?: string;
  CLAW_REMOTE_ENABLE_BONJOUR?: string;
  CLAW_REMOTE_DISABLE_BONJOUR?: string;
  CLAW_REMOTE_VERSION?: string;
  CLAW_REMOTE_ENABLE_COORDINATOR?: string;
  CLAW_REMOTE_COORDINATOR_URL?: string;
  CLAW_REMOTE_COORDINATOR_TOKEN?: string;
  CLAW_REMOTE_COORDINATOR_DEVICE_ID?: string;
  CLAW_REMOTE_COORDINATOR_TENANT_ID?: string;
  CLAW_REMOTE_COORDINATOR_HEARTBEAT_MS?: string;
  CLAW_REMOTE_ENABLE_IROH?: string;
  CLAW_REMOTE_IROH_DISABLE?: string;
  CLAW_REMOTE_IROH_RELAY_URL?: string;
  CLAW_DATA_DIR?: string;
  APPDATA?: string;
  XDG_DATA_HOME?: string;
  HOME?: string;
}

export type BridgeExposureMode = "loopback" | "pairing" | "remote";

const DEFAULT_CAPABILITIES = ["remote", "pair", "jobs"];

export function loadConfig(
  env: BridgeConfigEnv = process.env,
): BridgeConfig {
  const home = env.HOME ?? process.env.HOME ?? ".";
  const exposure = parseExposureMode(env.CLAW_REMOTE_EXPOSURE);
  const bonjourEnabled = shouldEnableBonjour(env, exposure);
  const irohEnabled =
    env.CLAW_REMOTE_ENABLE_IROH === "1" &&
    exposure === "remote" &&
    env.CLAW_REMOTE_IROH_DISABLE !== "1";
  const coordinatorEnabled =
    env.CLAW_REMOTE_ENABLE_COORDINATOR === "1" && exposure === "remote";
  const coordinatorBaseUrl = env.CLAW_REMOTE_COORDINATOR_URL?.trim();
  const coordinatorToken = env.CLAW_REMOTE_COORDINATOR_TOKEN?.trim();
  const coordinatorDevice = env.CLAW_REMOTE_COORDINATOR_DEVICE_ID?.trim();
  const coordinatorTenant = env.CLAW_REMOTE_COORDINATOR_TENANT_ID?.trim();
  const coordinator =
    coordinatorEnabled &&
    coordinatorBaseUrl &&
    coordinatorToken &&
    coordinatorDevice &&
    coordinatorTenant
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
    exposure,
    dbPath:
      env.CLAW_REMOTE_DB ?? join(resolveClawjsDataRoot(env, home), "core.sqlite"),
    statusPath:
      env.CLAW_REMOTE_STATUS ??
      expandHome(resolveClawPersistentSurfacePath("clawix.home.state", "", "bridge-status.json"), home),
    displayName: env.CLAW_REMOTE_NAME ?? hostname(),
    bonjourEnabled,
    version: env.CLAW_REMOTE_VERSION ?? "0.1.0",
    capabilities: DEFAULT_CAPABILITIES,
    ...(coordinator ? { coordinator } : {}),
    iroh: {
      enabled: irohEnabled,
      ...(env.CLAW_REMOTE_IROH_RELAY_URL
        ? { relayUrl: env.CLAW_REMOTE_IROH_RELAY_URL }
        : {}),
    },
  };
}

function parseExposureMode(raw: string | undefined): BridgeExposureMode {
  if (!raw) return "loopback";
  const value = raw.trim();
  if (value === "loopback" || value === "pairing" || value === "remote") {
    return value;
  }
  throw new Error(`invalid exposure mode: ${raw}`);
}

function shouldEnableBonjour(env: BridgeConfigEnv, exposure: BridgeExposureMode): boolean {
  if (env.CLAW_REMOTE_DISABLE_BONJOUR === "1") return false;
  if (env.CLAW_REMOTE_ENABLE_BONJOUR === "1") return exposure !== "loopback";
  return exposure === "pairing";
}

function resolveClawjsDataRoot(env: BridgeConfigEnv, home: string): string {
  if (env.CLAW_DATA_DIR) return expandHome(env.CLAW_DATA_DIR, home);
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
