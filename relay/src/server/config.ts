import { homedir, networkInterfaces } from "node:os";
import path from "node:path";

export interface RelayConfig {
  host: string;
  port: number;
  dbPath: string;
  jwtSecrets: string[];
  jwtIssuer: string;
  jwtAudience: string;
  accessTokenTtlSec: number;
  refreshTokenTtlSec: number;
  corsOrigins: string[];
  requestTimeoutMs: number;
  heartbeatIntervalMs: number;
  loginRateLimitWindowMs: number;
  loginRateLimitMax: number;
  pairingStartRateLimitWindowMs: number;
  pairingStartRateLimitMax: number;
  pairingPollRateLimitWindowMs: number;
  pairingPollRateLimitMax: number;
  pairingExpiresSec: number;
  pairingPollIntervalSec: number;
  publicBaseUrl: string;
  iotBaseUrl?: string;
}

export function loadRelayConfig(overrides: Partial<RelayConfig> = {}): RelayConfig {
  const cors = process.env.RELAY_CORS_ORIGINS?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? [];
  const jwtSecrets = (process.env.RELAY_JWT_SECRETS ?? process.env.RELAY_JWT_SECRET ?? "relay-dev-secret-change-me")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const defaultPublicHost = process.env.RELAY_HOST ?? localIPv4() ?? "127.0.0.1";
  const publicBaseUrl = process.env.RELAY_PUBLIC_BASE_URL ?? `http://${defaultPublicHost}:${process.env.PORT ?? "4410"}`;

  return {
    host: overrides.host ?? process.env.RELAY_HOST ?? "0.0.0.0",
    port: overrides.port ?? Number(process.env.PORT ?? "4410"),
    dbPath: overrides.dbPath ?? process.env.RELAY_DB_PATH ?? path.join(defaultClawjsDataRoot(), "infra.sqlite"),
    jwtSecrets: overrides.jwtSecrets ?? jwtSecrets,
    jwtIssuer: overrides.jwtIssuer ?? process.env.RELAY_JWT_ISSUER ?? "clawjs-relay",
    jwtAudience: overrides.jwtAudience ?? process.env.RELAY_JWT_AUDIENCE ?? "clawjs-relay-clients",
    accessTokenTtlSec: overrides.accessTokenTtlSec ?? Number(process.env.RELAY_ACCESS_TTL_SEC ?? "900"),
    refreshTokenTtlSec: overrides.refreshTokenTtlSec ?? Number(process.env.RELAY_REFRESH_TTL_SEC ?? `${60 * 60 * 24 * 30}`),
    corsOrigins: overrides.corsOrigins ?? cors,
    requestTimeoutMs: overrides.requestTimeoutMs ?? Number(process.env.RELAY_REQUEST_TIMEOUT_MS ?? "30000"),
    heartbeatIntervalMs: overrides.heartbeatIntervalMs ?? Number(process.env.RELAY_HEARTBEAT_INTERVAL_MS ?? "10000"),
    loginRateLimitWindowMs: overrides.loginRateLimitWindowMs ?? Number(process.env.RELAY_LOGIN_RATE_LIMIT_WINDOW_MS ?? "60000"),
    loginRateLimitMax: overrides.loginRateLimitMax ?? Number(process.env.RELAY_LOGIN_RATE_LIMIT_MAX ?? "10"),
    pairingStartRateLimitWindowMs: overrides.pairingStartRateLimitWindowMs ?? Number(process.env.RELAY_PAIRING_START_RATE_LIMIT_WINDOW_MS ?? "60000"),
    pairingStartRateLimitMax: overrides.pairingStartRateLimitMax ?? Number(process.env.RELAY_PAIRING_START_RATE_LIMIT_MAX ?? "10"),
    pairingPollRateLimitWindowMs: overrides.pairingPollRateLimitWindowMs ?? Number(process.env.RELAY_PAIRING_POLL_RATE_LIMIT_WINDOW_MS ?? "10000"),
    pairingPollRateLimitMax: overrides.pairingPollRateLimitMax ?? Number(process.env.RELAY_PAIRING_POLL_RATE_LIMIT_MAX ?? "20"),
    pairingExpiresSec: overrides.pairingExpiresSec ?? Number(process.env.RELAY_PAIRING_EXPIRES_SEC ?? "900"),
    pairingPollIntervalSec: overrides.pairingPollIntervalSec ?? Number(process.env.RELAY_PAIRING_POLL_INTERVAL_SEC ?? "5"),
    publicBaseUrl: overrides.publicBaseUrl ?? publicBaseUrl,
    iotBaseUrl: overrides.iotBaseUrl ?? process.env.RELAY_IOT_BASE_URL ?? process.env.CLAWJS_IOT_BASE_URL,
  };
}

function defaultClawjsDataRoot(): string {
  if (process.env.CLAWJS_MAIN_DATA_DIR) return expandHome(process.env.CLAWJS_MAIN_DATA_DIR);
  if (process.env.CLAWIX_CLAWJS_DATA_DIR) return expandHome(process.env.CLAWIX_CLAWJS_DATA_DIR);
  if (process.platform === "darwin") return path.join(homedir(), "Library", "Application Support", "Clawix", "clawjs");
  if (process.platform === "win32") return path.join(process.env.APPDATA ?? path.join(homedir(), "AppData", "Roaming"), "Clawix", "clawjs");
  return path.join(process.env.XDG_DATA_HOME ?? path.join(homedir(), ".local", "share"), "Clawix", "clawjs");
}

function expandHome(value: string): string {
  return value.startsWith("~/") ? path.join(homedir(), value.slice(2)) : value;
}

function localIPv4(): string | null {
  const interfaces = networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (!entry.internal && entry.family === "IPv4") {
        return entry.address;
      }
    }
  }
  return null;
}
