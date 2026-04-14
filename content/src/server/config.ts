import path from "node:path";

export interface ContentServiceConfig {
  host: string;
  port: number;
  dataDir: string;
  dbPath: string;
  jwtSecret: string;
  corsOrigins: string[];
  adminEmail: string;
  adminPassword: string;
  timeBaseUrl?: string;
  timeToken?: string;
}

export function loadContentConfig(overrides: Partial<ContentServiceConfig> = {}): ContentServiceConfig {
  const dataDir = overrides.dataDir
    ?? process.env.CONTENT_DATA_DIR
    ?? path.join(process.cwd(), ".data");
  return {
    host: overrides.host ?? process.env.CONTENT_HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.CONTENT_PORT ?? "4650"),
    dataDir,
    dbPath: overrides.dbPath ?? process.env.CONTENT_DB_PATH ?? path.join(dataDir, "content.sqlite"),
    jwtSecret: overrides.jwtSecret ?? process.env.CONTENT_JWT_SECRET ?? "content-local-secret",
    corsOrigins: overrides.corsOrigins ?? (process.env.CONTENT_CORS_ORIGINS?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? []),
    adminEmail: overrides.adminEmail ?? process.env.CONTENT_ADMIN_EMAIL ?? "admin@content.local",
    adminPassword: overrides.adminPassword ?? process.env.CONTENT_ADMIN_PASSWORD ?? "content-admin",
    timeBaseUrl: overrides.timeBaseUrl ?? process.env.CLAWJS_TIME_URL ?? process.env.CONTENT_TIME_BASE_URL,
    timeToken: overrides.timeToken ?? process.env.CLAWJS_TIME_TOKEN ?? process.env.CONTENT_TIME_TOKEN,
  };
}
