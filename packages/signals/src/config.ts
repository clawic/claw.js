import path from "node:path";
import os from "node:os";

import { resolveClawGlobalDataStorageDir } from "@clawjs/core";

export interface SignalsServiceConfig {
  domain: string;
  host: string;
  port: number;
  dbPath: string;
  dataDir: string;
  sharedSecret: string;
  hasSessions: boolean;
}

export interface SignalsServiceConfigInput {
  domain: string;
  defaultPort: number;
  hasSessions?: boolean;
  envPrefix?: string;
  overrides?: Partial<SignalsServiceConfig>;
}

function envName(prefix: string, key: string): string {
  return `${prefix}_${key}`;
}

export function loadSignalsServiceConfig(
  input: SignalsServiceConfigInput,
): SignalsServiceConfig {
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
      process.env.CLAW_DB_PATH ??
      path.join(dataDir, "core.sqlite"),
    dataDir,
    sharedSecret:
      overrides.sharedSecret ??
      process.env[envName(prefix, "SHARED_SECRET")] ??
      `${domain}-dev-secret-change-me`,
    hasSessions: overrides.hasSessions ?? hasSessions,
  };
}

function defaultClawjsDataRoot(): string {
  const explicit = process.env.CLAW_DATA_DIR;
  return resolveClawGlobalDataStorageDir({
    homeDir: os.homedir(),
    ...(explicit ? { dataDir: explicit } : {}),
    ...(process.env.CLAW_HOME ? { clawHome: process.env.CLAW_HOME } : {}),
  });
}
