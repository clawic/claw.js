import { clawPersistentSurface } from "@clawjs/core";

const source = { file: "packages/clawjs-node/src/time/surface.ts", language: "typescript" } as const;

const schemaSurfaceNodes = [
  clawPersistentSurface.table({ id: `claw.database.core.table.temporal_items`, name: "temporal_items", parentId: "claw.database.core", databaseId: "claw.database.core", source }),
  clawPersistentSurface.table({ id: `claw.database.core.table.temporal_executions`, name: "temporal_executions", parentId: "claw.database.core", databaseId: "claw.database.core", source }),
  clawPersistentSurface.table({ id: `claw.database.core.table.temporal_run_log`, name: "temporal_run_log", parentId: "claw.database.core", databaseId: "claw.database.core", source }),
  clawPersistentSurface.table({ id: `claw.database.core.table.temporal_projections`, name: "temporal_projections", parentId: "claw.database.core", databaseId: "claw.database.core", source }),
  clawPersistentSurface.index({ id: `claw.database.core.index.temporal_items_kind_status_idx`, name: "temporal_items_kind_status_idx", parentId: "claw.database.core", databaseId: "claw.database.core", source }),
  clawPersistentSurface.index({ id: `claw.database.core.index.temporal_items_anchor_idx`, name: "temporal_items_anchor_idx", parentId: "claw.database.core", databaseId: "claw.database.core", source }),
  clawPersistentSurface.index({ id: `claw.database.core.index.temporal_items_next_run_idx`, name: "temporal_items_next_run_idx", parentId: "claw.database.core", databaseId: "claw.database.core", source }),
  clawPersistentSurface.index({ id: `claw.database.core.index.temporal_items_active_next_run_due_idx`, name: "temporal_items_active_next_run_due_idx", parentId: "claw.database.core", databaseId: "claw.database.core", source }),
  clawPersistentSurface.index({ id: `claw.database.core.index.temporal_executions_item_schedule`, name: "temporal_executions_item_schedule", parentId: "claw.database.core", databaseId: "claw.database.core", source }),
  clawPersistentSurface.index({ id: `claw.database.core.index.temporal_run_log_item_idx`, name: "temporal_run_log_item_idx", parentId: "claw.database.core", databaseId: "claw.database.core", source }),
  clawPersistentSurface.index({ id: `claw.database.core.index.temporal_run_log_completed_idx`, name: "temporal_run_log_completed_idx", parentId: "claw.database.core", databaseId: "claw.database.core", source }),
  clawPersistentSurface.index({ id: `claw.database.core.index.temporal_projections_item_updated_idx`, name: "temporal_projections_item_updated_idx", parentId: "claw.database.core", databaseId: "claw.database.core", source })
];

export const TIME_STORE_SCHEMA_SQL = String.raw`
      CREATE TABLE IF NOT EXISTS temporal_items (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        title TEXT NOT NULL,
        owner_id TEXT,
        workspace_id TEXT,
        project_id TEXT,
        agent_id TEXT,
        source_provider TEXT,
        anchor_type TEXT,
        anchor_id TEXT,
        starts_at TEXT,
        next_run_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS temporal_items_kind_status_idx
        ON temporal_items(kind, status);
      CREATE INDEX IF NOT EXISTS temporal_items_anchor_idx
        ON temporal_items(anchor_type, anchor_id);
      CREATE INDEX IF NOT EXISTS temporal_items_next_run_idx
        ON temporal_items(next_run_at);
      CREATE INDEX IF NOT EXISTS temporal_items_active_next_run_due_idx
        ON temporal_items(next_run_at)
        WHERE status = 'active' AND next_run_at IS NOT NULL;
      CREATE TABLE IF NOT EXISTS temporal_executions (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        status TEXT NOT NULL,
        scheduled_for TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        triggered_by TEXT NOT NULL,
        output TEXT,
        error TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS temporal_executions_item_schedule
        ON temporal_executions(item_id, scheduled_for);
      CREATE TABLE IF NOT EXISTS temporal_run_log (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        status TEXT NOT NULL,
        scheduled_for TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        triggered_by TEXT NOT NULL,
        summary TEXT,
        error TEXT,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS temporal_run_log_item_idx
        ON temporal_run_log(item_id, completed_at DESC);
      CREATE INDEX IF NOT EXISTS temporal_run_log_completed_idx
        ON temporal_run_log(completed_at DESC);
      CREATE TABLE IF NOT EXISTS temporal_projections (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        target TEXT NOT NULL,
        status TEXT NOT NULL,
        provider TEXT,
        external_id TEXT,
        detail TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS temporal_projections_item_updated_idx
        ON temporal_projections(item_id, updated_at DESC);
    `;
