import { clawPersistentSurface } from "@clawjs/core";

const source = { file: "packages/clawjs-node/src/apps/surface.ts", language: "typescript" } as const;

const APPS_STORE_SCHEMA_SQLSurfaceNodes = [
  clawPersistentSurface.table({ id: `claw.database.core.table.apps`, name: "apps", parentId: "claw.database.core", databaseId: "claw.database.core", source })
];

export const APPS_STORE_SCHEMA_SQL = String.raw`
    CREATE TABLE IF NOT EXISTS apps (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      root_path TEXT NOT NULL,
      manifest_json TEXT NOT NULL DEFAULT '{}',
      permissions_json TEXT NOT NULL DEFAULT '{}',
      pinned INTEGER NOT NULL DEFAULT 0,
      last_opened_at TEXT,
      created_by_chat_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `;
