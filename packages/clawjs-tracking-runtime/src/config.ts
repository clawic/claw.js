import path from "node:path";

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

  const cwd = process.cwd();
  const dataDir =
    overrides.dataDir ?? process.env[envName(prefix, "DATA_DIR")] ?? path.join(cwd, ".data");
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
      path.join(dataDir, `${domain}.sqlite`),
    dataDir,
    sharedSecret:
      overrides.sharedSecret ??
      process.env[envName(prefix, "SHARED_SECRET")] ??
      `${domain}-dev-secret-change-me`,
    hasSessions: overrides.hasSessions ?? hasSessions,
  };
}
