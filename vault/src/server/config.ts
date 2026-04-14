import fs from "node:fs";
import path from "node:path";

export interface VaultConfig {
  host: string;
  port: number;
  dataDir: string;
  dbPath: string;
  jwtSecret: string;
  publicBaseUrl: string;
  corsOrigins: string[];
  uiDistDir: string;
  kekBase64?: string;
}

export function loadVaultConfig(input: Partial<VaultConfig> = {}): VaultConfig {
  const host = input.host ?? process.env.VAULT_HOST ?? "127.0.0.1";
  const port = Number(input.port ?? process.env.VAULT_PORT ?? 4610);
  const dataDir = input.dataDir ?? process.env.VAULT_DATA_DIR ?? path.join(process.cwd(), "vault", ".data");
  const dbPath = input.dbPath ?? process.env.VAULT_DB_PATH ?? path.join(dataDir, "vault.sqlite");
  const jwtSecret = input.jwtSecret ?? process.env.VAULT_JWT_SECRET ?? "vault-dev-secret";
  const publicBaseUrl = input.publicBaseUrl ?? process.env.VAULT_PUBLIC_BASE_URL ?? `http://${host}:${port}`;
  const corsOrigins = input.corsOrigins
    ?? (process.env.VAULT_CORS_ORIGINS?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? []);
  const uiDistDir = input.uiDistDir
    ?? process.env.VAULT_UI_DIST_DIR
    ?? path.join(process.cwd(), "vault", "ui", "dist");
  const kekBase64 = input.kekBase64 ?? process.env.VAULT_KEK_BASE64;

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
    ...(kekBase64 ? { kekBase64 } : {}),
  };
}
