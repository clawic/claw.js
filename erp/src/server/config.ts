import path from "node:path";

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
    ?? path.join(process.cwd(), ".data");
  return {
    host: overrides.host ?? process.env.ERP_HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.ERP_PORT ?? "4530"),
    dataDir,
    dbPath: overrides.dbPath ?? process.env.ERP_DB_PATH ?? path.join(dataDir, "erp.sqlite"),
    jwtSecret: overrides.jwtSecret ?? process.env.ERP_JWT_SECRET ?? "erp-local-secret",
    corsOrigins: overrides.corsOrigins ?? (process.env.ERP_CORS_ORIGINS?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? []),
    adminEmail: overrides.adminEmail ?? process.env.ERP_ADMIN_EMAIL ?? "admin@erp.local",
    adminPassword: overrides.adminPassword ?? process.env.ERP_ADMIN_PASSWORD ?? "erp-admin",
  };
}
