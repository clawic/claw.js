import { clawPersistentSurface } from "@clawjs/core";

const v1MainDatabaseId = "claw.database.core";
const v1AgentDataSchemaSource = {
  file: "packages/clawjs/src/v1-data-agent-surfaces.ts",
  language: "typescript",
} as const;

export const v1AgentDataSurfaceNodes = ["provider_routing", "provider_settings", "snippets"].map((name) =>
  clawPersistentSurface.table({
    id: `claw.database.core.table.${name}`,
    name,
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1AgentDataSchemaSource,
  }),
);

export const V1_AGENT_DATA_SCHEMA_SQL = String.raw`
    CREATE TABLE IF NOT EXISTS provider_routing (
      id TEXT PRIMARY KEY,
      feature TEXT NOT NULL,
      capability TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT,
      account_ref TEXT,
      policy_json TEXT NOT NULL DEFAULT '{}',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(feature, capability)
    );
    CREATE TABLE IF NOT EXISTS provider_settings (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL UNIQUE,
      enabled INTEGER NOT NULL DEFAULT 1,
      policy_json TEXT NOT NULL DEFAULT '{}',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS snippets (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      shortcut TEXT,
      scope_json TEXT NOT NULL DEFAULT '{}',
      skill_refs_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
`;
