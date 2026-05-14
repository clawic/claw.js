import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import Database from "better-sqlite3";

// @clawjs-persistent-surface-ddl-source

import type {
  MCPServerRecord,
  MCPToolRecord,
  RegisterMCPServerInput,
  UpdateMCPServerInput,
} from "./types.ts";

const SCHEMA_DDL = `
  CREATE TABLE IF NOT EXISTS mcp_servers (
    id                     TEXT PRIMARY KEY,
    name                   TEXT NOT NULL UNIQUE,
    transport              TEXT NOT NULL CHECK (transport IN ('stdio','http','sse')),
    endpoint               TEXT NOT NULL,
    env_json               TEXT,
    enabled                INTEGER NOT NULL DEFAULT 1,
    last_health_check_at   INTEGER,
    last_health_ok         INTEGER,
    capabilities_json      TEXT,
    created_at             INTEGER NOT NULL,
    updated_at             INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_mcp_enabled ON mcp_servers(enabled);

  CREATE TABLE IF NOT EXISTS mcp_tools (
    server_id        TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
    tool_name        TEXT NOT NULL,
    prefixed_name    TEXT NOT NULL UNIQUE,
    description      TEXT,
    input_schema     TEXT,
    discovered_at    INTEGER NOT NULL,
    PRIMARY KEY (server_id, tool_name)
  );
  CREATE INDEX IF NOT EXISTS idx_mcp_tools_prefix ON mcp_tools(prefixed_name);
`;

interface ServerRow {
  id: string;
  name: string;
  transport: "stdio" | "http" | "sse";
  endpoint: string;
  env_json: string | null;
  enabled: number;
  last_health_check_at: number | null;
  last_health_ok: number | null;
  capabilities_json: string | null;
  created_at: number;
  updated_at: number;
}

interface ToolRow {
  server_id: string;
  tool_name: string;
  prefixed_name: string;
  description: string | null;
  input_schema: string | null;
  discovered_at: number;
}

function parseJson<T>(value: string | null): T | null {
  if (value == null) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function rowToServer(row: ServerRow): MCPServerRecord {
  return {
    id: row.id,
    name: row.name,
    transport: row.transport,
    endpoint: row.endpoint,
    envJson: parseJson<Record<string, string>>(row.env_json),
    enabled: row.enabled === 1,
    lastHealthCheckAt: row.last_health_check_at,
    lastHealthOk: row.last_health_ok === null ? null : row.last_health_ok === 1,
    capabilities: parseJson<Record<string, unknown>>(row.capabilities_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToTool(row: ToolRow): MCPToolRecord {
  return {
    serverId: row.server_id,
    toolName: row.tool_name,
    prefixedName: row.prefixed_name,
    description: row.description,
    inputSchema: parseJson<Record<string, unknown>>(row.input_schema),
    discoveredAt: row.discovered_at,
  };
}

export class MCPServiceStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(SCHEMA_DDL);
  }

  close(): void {
    this.db.close();
  }

  registerServer(input: RegisterMCPServerInput): MCPServerRecord {
    const id = input.id ?? randomUUID();
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO mcp_servers (id, name, transport, endpoint, env_json, enabled, created_at, updated_at)
      VALUES (@id, @name, @transport, @endpoint, @env, @enabled, @now, @now)
      ON CONFLICT(name) DO UPDATE SET
        transport  = excluded.transport,
        endpoint   = excluded.endpoint,
        env_json   = excluded.env_json,
        enabled    = excluded.enabled,
        updated_at = excluded.updated_at
    `).run({
      id,
      name: input.name,
      transport: input.transport,
      endpoint: input.endpoint,
      env: input.env ? JSON.stringify(input.env) : null,
      enabled: input.enabled === false ? 0 : 1,
      now,
    });
    const row = this.db.prepare("SELECT * FROM mcp_servers WHERE name = ?").get(input.name) as ServerRow;
    return rowToServer(row);
  }

  listServers(): MCPServerRecord[] {
    return (this.db.prepare("SELECT * FROM mcp_servers ORDER BY created_at ASC").all() as ServerRow[]).map(rowToServer);
  }

  getServer(id: string): MCPServerRecord | null {
    const row = this.db.prepare("SELECT * FROM mcp_servers WHERE id = ?").get(id) as ServerRow | undefined;
    return row ? rowToServer(row) : null;
  }

  getServerByName(name: string): MCPServerRecord | null {
    const row = this.db.prepare("SELECT * FROM mcp_servers WHERE name = ?").get(name) as ServerRow | undefined;
    return row ? rowToServer(row) : null;
  }

  updateServer(id: string, patch: UpdateMCPServerInput): MCPServerRecord | null {
    const existing = this.getServer(id);
    if (!existing) return null;
    const now = Date.now();
    this.db.prepare(`
      UPDATE mcp_servers
      SET name       = @name,
          endpoint   = @endpoint,
          env_json   = @env,
          enabled    = @enabled,
          updated_at = @now
      WHERE id = @id
    `).run({
      id,
      name: patch.name ?? existing.name,
      endpoint: patch.endpoint ?? existing.endpoint,
      env: patch.env === undefined ? (existing.envJson ? JSON.stringify(existing.envJson) : null) : (patch.env ? JSON.stringify(patch.env) : null),
      enabled: patch.enabled === undefined ? (existing.enabled ? 1 : 0) : (patch.enabled ? 1 : 0),
      now,
    });
    return this.getServer(id);
  }

  removeServer(id: string): boolean {
    const info = this.db.prepare("DELETE FROM mcp_servers WHERE id = ?").run(id);
    return info.changes > 0;
  }

  recordHealth(id: string, ok: boolean, capabilities?: Record<string, unknown> | null): void {
    this.db.prepare(`
      UPDATE mcp_servers
      SET last_health_check_at = @at,
          last_health_ok       = @ok,
          capabilities_json    = COALESCE(@caps, capabilities_json),
          updated_at           = @at
      WHERE id = @id
    `).run({
      id,
      at: Date.now(),
      ok: ok ? 1 : 0,
      caps: capabilities ? JSON.stringify(capabilities) : null,
    });
  }

  upsertTool(serverId: string, tool: { name: string; description?: string | null; inputSchema?: Record<string, unknown> | null; prefix?: string }): MCPToolRecord {
    const prefix = tool.prefix ?? this.getServer(serverId)?.name ?? "mcp";
    const prefixedName = `mcp_${prefix}_${tool.name}`;
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO mcp_tools (server_id, tool_name, prefixed_name, description, input_schema, discovered_at)
      VALUES (@server_id, @tool_name, @prefixed_name, @description, @input_schema, @now)
      ON CONFLICT(server_id, tool_name) DO UPDATE SET
        prefixed_name = excluded.prefixed_name,
        description   = excluded.description,
        input_schema  = excluded.input_schema,
        discovered_at = excluded.discovered_at
    `).run({
      server_id: serverId,
      tool_name: tool.name,
      prefixed_name: prefixedName,
      description: tool.description ?? null,
      input_schema: tool.inputSchema ? JSON.stringify(tool.inputSchema) : null,
      now,
    });
    return rowToTool(this.db.prepare("SELECT * FROM mcp_tools WHERE server_id = ? AND tool_name = ?").get(serverId, tool.name) as ToolRow);
  }

  listTools(serverId?: string): MCPToolRecord[] {
    const rows = serverId
      ? (this.db.prepare("SELECT * FROM mcp_tools WHERE server_id = ? ORDER BY tool_name").all(serverId) as ToolRow[])
      : (this.db.prepare("SELECT * FROM mcp_tools ORDER BY prefixed_name").all() as ToolRow[]);
    return rows.map(rowToTool);
  }

  findToolByPrefixedName(prefixedName: string): MCPToolRecord | null {
    const row = this.db.prepare("SELECT * FROM mcp_tools WHERE prefixed_name = ?").get(prefixedName) as ToolRow | undefined;
    return row ? rowToTool(row) : null;
  }

  clearToolsForServer(serverId: string): void {
    this.db.prepare("DELETE FROM mcp_tools WHERE server_id = ?").run(serverId);
  }
}
