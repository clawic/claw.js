import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface SecretsConfig {
  host: string;
  port: number;
  dataDir: string;
  dbPath: string;
  jwtSecret: string;
  publicBaseUrl: string;
  corsOrigins: string[];
  uiDistDir: string;
  adminToken?: string;
  kekBase64?: string;
}

export function loadSecretsConfig(input: Partial<SecretsConfig> = {}): SecretsConfig {
  const host = input.host ?? process.env.SECRETS_HOST ?? "127.0.0.1";
  const port = Number(input.port ?? process.env.SECRETS_PORT ?? 4610);
  const dataDir = input.dataDir ?? process.env.SECRETS_DATA_DIR ?? defaultClawjsDataRoot();
  const dbPath = input.dbPath ?? process.env.SECRETS_DB_PATH ?? path.join(dataDir, "vault.sqlite");
  const jwtSecret = input.jwtSecret ?? process.env.SECRETS_JWT_SECRET ?? "secrets-dev-secret";
  const publicBaseUrl = input.publicBaseUrl ?? process.env.SECRETS_PUBLIC_BASE_URL ?? `http://${host}:${port}`;
  const corsOrigins = input.corsOrigins
    ?? (process.env.SECRETS_CORS_ORIGINS?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? []);
  const uiDistDir = input.uiDistDir
    ?? process.env.SECRETS_UI_DIST_DIR
    ?? path.join(process.cwd(), "secrets", "ui", "dist");
  const adminToken = input.adminToken ?? process.env.SECRETS_ADMIN_TOKEN ?? process.env.SECRETS_TOKEN;
  const kekBase64 = input.kekBase64 ?? process.env.SECRETS_KEK_BASE64;

  fs.mkdirSync(dataDir, { recursive: true });
  return {
    host,
    port,
    dataDir,
    dbPath,
    jwtSecret,
    publicBaseUrl,
    corsOrigins,
    uiDistDir,
    ...(adminToken ? { adminToken } : {}),
    ...(kekBase64 ? { kekBase64 } : {}),
  };
}

function defaultClawjsDataRoot(): string {
  if (process.env.CLAW_DATA_DIR) return expandHome(process.env.CLAW_DATA_DIR);
  if (process.env.CLAWIX_CLAW_DATA_DIR) return expandHome(process.env.CLAWIX_CLAW_DATA_DIR);
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Clawix", "clawjs");
  if (process.platform === "win32") return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "Clawix", "clawjs");
  return path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"), "Clawix", "clawjs");
}

function expandHome(value: string): string {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}
