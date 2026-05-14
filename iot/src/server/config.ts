import { resolveClawPersistentSurfacePath } from "@clawjs/core";
import path from "node:path";
import os from "node:os";

export interface IotServiceConfig {
  host: string;
  port: number;
  dataDir: string;
  dbPath: string;
  corsOrigins: string[];
}

export function loadIotConfig(overrides: Partial<IotServiceConfig> = {}): IotServiceConfig {
  const dataDir = overrides.dataDir ?? process.env.IOT_DATA_DIR ?? defaultClawjsDataRoot();
  return {
    host: overrides.host ?? process.env.IOT_HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.IOT_PORT ?? "4520"),
    dataDir,
    dbPath: overrides.dbPath
      ?? process.env.IOT_DB_PATH
      ?? process.env.CLAW_DB_PATH
      ?? process.env.CLAW_DB_PATH
      ?? path.join(dataDir, "core.sqlite"),
    corsOrigins: overrides.corsOrigins ?? (
      process.env.IOT_CORS_ORIGINS?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? []
    ),
  };
}

function defaultClawjsDataRoot(): string {
  const explicit = process.env.CLAW_DATA_DIR ?? process.env.CLAWIX_CLAW_DATA_DIR;
  if (explicit) return expandHome(explicit);
  return expandHome(resolveClawPersistentSurfacePath("claw.global.data"));
}

function expandHome(value: string): string {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}
