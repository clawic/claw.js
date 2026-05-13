import path from "node:path";
import os from "node:os";

export interface MCPServiceConfig {
  host: string;
  port: number;
  dbPath: string;
  dataDir: string;
  sharedSecret: string;
  exposePort: number;
}

export function loadMCPConfig(overrides: Partial<MCPServiceConfig> = {}): MCPServiceConfig {
  const dataDir = overrides.dataDir ?? process.env.MCP_DATA_DIR ?? defaultClawjsDataRoot();
  return {
    host: overrides.host ?? process.env.MCP_HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.MCP_PORT ?? process.env.PORT ?? "4680"),
    dbPath: overrides.dbPath ?? process.env.MCP_DB_PATH ?? process.env.CLAW_DB_PATH ?? process.env.CLAWJS_MAIN_DB_PATH ?? path.join(dataDir, "core.sqlite"),
    dataDir,
    sharedSecret: overrides.sharedSecret ?? process.env.MCP_SHARED_SECRET ?? "mcp-dev-secret-change-me",
    exposePort: overrides.exposePort ?? Number(process.env.MCP_EXPOSE_PORT ?? "9090"),
  };
}

function defaultClawjsDataRoot(): string {
  const explicit = process.env.CLAW_DATA_DIR ?? process.env.CLAWIX_CLAW_DATA_DIR ?? process.env.CLAWJS_MAIN_DATA_DIR ?? process.env.CLAWIX_CLAWJS_DATA_DIR;
  if (explicit) return expandHome(explicit);
  return path.join(expandHome(process.env.CLAW_HOME ?? path.join(os.homedir(), ".claw")), "data");
}

function expandHome(value: string): string {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}
