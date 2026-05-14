import path from "node:path";
import os from "node:os";

import { clawWorkspaceLayout } from "@clawjs/core";

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
  const dataDir = overrides.dataDir ?? process.env.CLAW_DRIVE_DATA_DIR ?? defaultClawjsDataRoot();
  const host = overrides.host ?? process.env.CLAW_DRIVE_HOST ?? "127.0.0.1";
  const port = overrides.port ?? Number(process.env.CLAW_DRIVE_PORT ?? process.env.PORT ?? "24104");
  const publicBaseUrl = overrides.publicBaseUrl ?? process.env.CLAW_DRIVE_PUBLIC_BASE_URL ?? `http://${host}:${port}`;
  const converterMode = overrides.converterMode ?? (process.env.CLAW_DRIVE_CONVERTER_MODE === "mock" ? "mock" : "auto");

  return {
    host,
    port,
    dataDir,
    dbPath: overrides.dbPath ?? process.env.CLAW_DRIVE_DB_PATH ?? path.join(dataDir, "drive.sqlite"),
    jwtSecret: overrides.jwtSecret ?? process.env.CLAW_DRIVE_JWT_SECRET ?? "drive-dev-secret-change-me",
    corsOrigins: overrides.corsOrigins ?? (process.env.CLAW_DRIVE_CORS_ORIGINS ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
    publicBaseUrl,
    uiDistDir: overrides.uiDistDir ?? process.env.CLAW_DRIVE_UI_DIST_DIR,
    converterMode,
  };
}

function defaultClawjsDataRoot(): string {
  if (process.env.CLAW_DATA_DIR) return expandHome(process.env.CLAW_DATA_DIR);
  if (process.env.CLAWIX_CLAW_DATA_DIR) return expandHome(process.env.CLAWIX_CLAW_DATA_DIR);
  if (process.platform === "darwin") return path.join(os.homedir(), clawWorkspaceLayout.data.replace(/^~\//, ""));
  if (process.platform === "win32") return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "Clawix", "clawjs");
  return path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"), "Clawix", "clawjs");
}

function expandHome(value: string): string {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}
