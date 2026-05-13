import path from "node:path";
import os from "node:os";

export interface TrackingServiceConfig {
  domain: string;
  host: string;
  port: number;
  dbPath: string;
  dataDir: string;
  sharedSecret: string;
  hasSessions: boolean;
}

export interface TrackingServiceConfigInput {
  domain: string;
  defaultPort: number;
  hasSessions?: boolean;
  envPrefix?: string;
  overrides?: Partial<TrackingServiceConfig>;
}

function envName(prefix: string, key: string): string {
  return `${prefix}_${key}`;
}

export function loadTrackingServiceConfig(
  input: TrackingServiceConfigInput,
): TrackingServiceConfig {
  const { domain, defaultPort, hasSessions = false } = input;
  const prefix = (input.envPrefix ?? domain.toUpperCase().replace(/-/g, "_"));
  const overrides = input.overrides ?? {};

  const dataDir =
    overrides.dataDir ?? process.env[envName(prefix, "DATA_DIR")] ?? defaultClawjsDataRoot();
  return {
    domain,
    host: overrides.host ?? process.env[envName(prefix, "HOST")] ?? "127.0.0.1",
    port:
      overrides.port ??
      Number(
        process.env[envName(prefix, "PORT")] ??
          process.env.PORT ??
          String(defaultPort),
      ),
    dbPath:
      overrides.dbPath ??
      process.env[envName(prefix, "DB_PATH")] ??
      process.env.CLAWJS_MAIN_DB_PATH ??
      path.join(dataDir, "clawjs.sqlite"),
    dataDir,
    sharedSecret:
      overrides.sharedSecret ??
      process.env[envName(prefix, "SHARED_SECRET")] ??
      `${domain}-dev-secret-change-me`,
    hasSessions: overrides.hasSessions ?? hasSessions,
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
