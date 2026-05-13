import path from "node:path";
import os from "node:os";

export interface ErpServiceConfig {
  host: string;
  port: number;
  dataDir: string;
  dbPath: string;
  jwtSecret: string;
  corsOrigins: string[];
  adminEmail: string;
  adminPassword: string;
}

export function loadErpConfig(overrides: Partial<ErpServiceConfig> = {}): ErpServiceConfig {
  const dataDir = overrides.dataDir
    ?? process.env.ERP_DATA_DIR
    ?? defaultClawjsDataRoot();
  return {
    host: overrides.host ?? process.env.ERP_HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.ERP_PORT ?? "4530"),
    dataDir,
    dbPath: overrides.dbPath ?? process.env.ERP_DB_PATH ?? process.env.CLAWJS_MAIN_DB_PATH ?? path.join(dataDir, "clawjs.sqlite"),
    jwtSecret: overrides.jwtSecret ?? process.env.ERP_JWT_SECRET ?? "erp-local-secret",
    corsOrigins: overrides.corsOrigins ?? (process.env.ERP_CORS_ORIGINS?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? []),
    adminEmail: overrides.adminEmail ?? process.env.ERP_ADMIN_EMAIL ?? "admin@erp.local",
    adminPassword: overrides.adminPassword ?? process.env.ERP_ADMIN_PASSWORD ?? "erp-admin",
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
