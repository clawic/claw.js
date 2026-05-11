import path from "node:path";

export interface MCPServiceConfig {
  host: string;
  port: number;
  dbPath: string;
  dataDir: string;
  sharedSecret: string;
  exposePort: number;
}

export function loadMCPConfig(overrides: Partial<MCPServiceConfig> = {}): MCPServiceConfig {
  const cwd = process.cwd();
  const dataDir = overrides.dataDir ?? process.env.MCP_DATA_DIR ?? path.join(cwd, ".data");
  return {
    host: overrides.host ?? process.env.MCP_HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.MCP_PORT ?? process.env.PORT ?? "4680"),
    dbPath: overrides.dbPath ?? process.env.MCP_DB_PATH ?? path.join(dataDir, "mcp.sqlite"),
    dataDir,
    sharedSecret: overrides.sharedSecret ?? process.env.MCP_SHARED_SECRET ?? "mcp-dev-secret-change-me",
    exposePort: overrides.exposePort ?? Number(process.env.MCP_EXPOSE_PORT ?? "9090"),
  };
}
