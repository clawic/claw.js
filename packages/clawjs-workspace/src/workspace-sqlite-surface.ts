import path from "path";
import { homedir } from "os";

import { expandClawHomePath, resolveClawGlobalDataStorageDir } from "@clawjs/core";

const WORKSPACE_SQLITE_SURFACE_IDS = {
  database: "claw.database.core",
  recordsTable: "claw.database.core.table.workspace_records",
  recordsUpdatedIndex: "claw.database.core.table.workspace_records.index.workspace_records_collection_updated_idx",
  metaTable: "claw.database.core.table.workspace_meta",
} as const;

export function resolveWorkspaceSqliteDatabasePath(): string {
  if (process.env.CLAW_DB_PATH) return expandClawHomePath(process.env.CLAW_DB_PATH, homedir());
  const dataRoot = process.env.CLAW_HOME
    ? resolveClawGlobalDataStorageDir({ homeDir: homedir(), clawHome: process.env.CLAW_HOME })
    : resolveClawGlobalDataStorageDir({
        homeDir: homedir(),
        ...(process.env.CLAW_DATA_DIR ? { dataDir: process.env.CLAW_DATA_DIR } : {}),
      });
  return path.join(dataRoot, "core.sqlite");
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
