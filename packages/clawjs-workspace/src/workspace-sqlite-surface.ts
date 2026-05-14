import path from "path";
import { homedir } from "os";

import { resolveClawPersistentSurfacePath } from "@clawjs/core";

export const WORKSPACE_SQLITE_SURFACE_IDS = {
  database: "claw.database.core",
  recordsTable: "claw.database.core.table.workspace_records",
  recordsUpdatedIndex: "claw.database.core.table.workspace_records.index.workspace_records_collection_updated_idx",
  metaTable: "claw.database.core.table.workspace_meta",
} as const;

export function expandHome(value: string): string {
  return value.startsWith("~/") ? path.join(homedir(), value.slice(2)) : value;
}

export function resolveWorkspaceSqliteDatabasePath(): string {
  if (process.env.CLAW_DB_PATH) return expandHome(process.env.CLAW_DB_PATH);
  if (process.env.CLAW_HOME) return path.join(expandHome(process.env.CLAW_HOME), "data", "core.sqlite");
  const dataRoot = process.env.CLAW_DATA_DIR
    ?? process.env.CLAWIX_CLAW_DATA_DIR
    ?? resolveClawPersistentSurfacePath("claw.global.data");
  return path.join(expandHome(dataRoot), "core.sqlite");
}

// DDL owned by the persistent surface registry above. Keep table/index IDs
// synchronized with WORKSPACE_SQLITE_SURFACE_IDS and `clawPersistentSurface`.
export const workspaceSqliteSchemaSql = `
  CREATE TABLE IF NOT EXISTS workspace_records (
    collection_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    updated_at TEXT,
    archived_at TEXT,
    PRIMARY KEY (collection_name, record_id)
  );
  CREATE INDEX IF NOT EXISTS workspace_records_collection_updated_idx
    ON workspace_records(collection_name, updated_at DESC, record_id ASC);
  CREATE TABLE IF NOT EXISTS workspace_meta (
    meta_key TEXT PRIMARY KEY,
    meta_value TEXT NOT NULL
  );
`;
