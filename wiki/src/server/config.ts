import path from "node:path";

export interface WikiServiceConfig {
  host: string;
  port: number;
  dbPath: string;
  dataDir: string;
  jwtSecret: string;
  corsOrigins: string[];
}

export function loadWikiConfig(overrides: Partial<WikiServiceConfig> = {}): WikiServiceConfig {
  const cwd = process.cwd();
  const dataDir = overrides.dataDir ?? process.env.WIKI_DATA_DIR ?? path.join(cwd, ".data");
  return {
    host: overrides.host ?? process.env.WIKI_HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.WIKI_PORT ?? process.env.PORT ?? "4520"),
    dbPath: overrides.dbPath ?? process.env.WIKI_DB_PATH ?? path.join(dataDir, "wiki.sqlite"),
    dataDir,
    jwtSecret: overrides.jwtSecret ?? process.env.WIKI_JWT_SECRET ?? "wiki-dev-secret-change-me",
    corsOrigins: overrides.corsOrigins ?? (process.env.WIKI_CORS_ORIGINS ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  };
}
