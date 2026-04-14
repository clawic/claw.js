import path from "node:path";

export type DriveConverterMode = "auto" | "mock";

export interface DriveServiceConfig {
  host: string;
  port: number;
  dbPath: string;
  dataDir: string;
  jwtSecret: string;
  corsOrigins: string[];
  publicBaseUrl: string;
  uiDistDir?: string;
  converterMode: DriveConverterMode;
}

export function loadDriveConfig(overrides: Partial<DriveServiceConfig> = {}): DriveServiceConfig {
  const cwd = process.cwd();
  const dataDir = overrides.dataDir ?? process.env.DRIVE_DATA_DIR ?? path.join(cwd, ".data");
  const host = overrides.host ?? process.env.DRIVE_HOST ?? "127.0.0.1";
  const port = overrides.port ?? Number(process.env.DRIVE_PORT ?? process.env.PORT ?? "4620");
  const publicBaseUrl = overrides.publicBaseUrl ?? process.env.DRIVE_PUBLIC_BASE_URL ?? `http://${host}:${port}`;
  const converterMode = overrides.converterMode ?? (process.env.DRIVE_CONVERTER_MODE === "mock" ? "mock" : "auto");

  return {
    host,
    port,
    dataDir,
    dbPath: overrides.dbPath ?? process.env.DRIVE_DB_PATH ?? path.join(dataDir, "drive.sqlite"),
    jwtSecret: overrides.jwtSecret ?? process.env.DRIVE_JWT_SECRET ?? "drive-dev-secret-change-me",
    corsOrigins: overrides.corsOrigins ?? (process.env.DRIVE_CORS_ORIGINS ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
    publicBaseUrl,
    uiDistDir: overrides.uiDistDir ?? process.env.DRIVE_UI_DIST_DIR,
    converterMode,
  };
}
