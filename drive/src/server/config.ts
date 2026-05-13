import path from "node:path";
import os from "node:os";

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
  const dataDir = overrides.dataDir ?? process.env.DRIVE_DATA_DIR ?? defaultClawjsDataRoot();
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

function defaultClawjsDataRoot(): string {
  if (process.env.CLAW_DATA_DIR) return expandHome(process.env.CLAW_DATA_DIR);
  if (process.env.CLAWIX_CLAW_DATA_DIR) return expandHome(process.env.CLAWIX_CLAW_DATA_DIR);
  if (process.platform === "darwin") return path.join(os.homedir(), ".claw", "data");
  if (process.platform === "win32") return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "Clawix", "clawjs");
  return path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"), "Clawix", "clawjs");
}

function expandHome(value: string): string {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}
