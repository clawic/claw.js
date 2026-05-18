import { clawPersistentSurface } from "@clawjs/core";

const source = { file: "monitor/src/server/surface.ts", language: "typescript" } as const;

const schemaSurfaceNodes = [
  clawPersistentSurface.table({ id: `claw.database.monitor.table.monitors`, name: "monitors", parentId: "claw.database.monitor", databaseId: "claw.database.monitor", source }),
  clawPersistentSurface.table({ id: `claw.database.monitor.table.heartbeats`, name: "heartbeats", parentId: "claw.database.monitor", databaseId: "claw.database.monitor", source }),
  clawPersistentSurface.table({ id: `claw.database.monitor.table.incidents`, name: "incidents", parentId: "claw.database.monitor", databaseId: "claw.database.monitor", source }),
  clawPersistentSurface.table({ id: `claw.database.monitor.table.instances`, name: "instances", parentId: "claw.database.monitor", databaseId: "claw.database.monitor", source }),
  clawPersistentSurface.table({ id: `claw.database.monitor.table.metric_sources`, name: "metric_sources", parentId: "claw.database.monitor", databaseId: "claw.database.monitor", source }),
  clawPersistentSurface.table({ id: `claw.database.monitor.table.metric_samples`, name: "metric_samples", parentId: "claw.database.monitor", databaseId: "claw.database.monitor", source }),
  clawPersistentSurface.table({ id: `claw.database.monitor.table.metric_rollups`, name: "metric_rollups", parentId: "claw.database.monitor", databaseId: "claw.database.monitor", source }),
  clawPersistentSurface.index({ id: `claw.database.monitor.index.idx_heartbeats_monitor`, name: "idx_heartbeats_monitor", parentId: "claw.database.monitor", databaseId: "claw.database.monitor", source }),
  clawPersistentSurface.index({ id: `claw.database.monitor.index.idx_incidents_monitor`, name: "idx_incidents_monitor", parentId: "claw.database.monitor", databaseId: "claw.database.monitor", source }),
  clawPersistentSurface.index({ id: `claw.database.monitor.index.idx_metric_samples_key_time`, name: "idx_metric_samples_key_time", parentId: "claw.database.monitor", databaseId: "claw.database.monitor", source }),
  clawPersistentSurface.index({ id: `claw.database.monitor.index.idx_metric_rollups_key_bucket`, name: "idx_metric_rollups_key_bucket", parentId: "claw.database.monitor", databaseId: "claw.database.monitor", source })
];

export const MONITOR_STORE_SCHEMA_SQL = String.raw`
      CREATE TABLE IF NOT EXISTS monitors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        group_name TEXT NOT NULL,
        type TEXT NOT NULL,
        config TEXT NOT NULL DEFAULT '{}',
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS heartbeats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        monitor_id TEXT NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        response_time_ms INTEGER,
        detail TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_heartbeats_monitor
        ON heartbeats(monitor_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS incidents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        monitor_id TEXT NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        resolved_at INTEGER,
        duration_ms INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_incidents_monitor
        ON incidents(monitor_id, started_at DESC);

      CREATE TABLE IF NOT EXISTS instances (
        id TEXT PRIMARY KEY,
        adapter TEXT NOT NULL,
        runtime_name TEXT NOT NULL,
        gateway_url TEXT NOT NULL,
        version TEXT,
        status TEXT NOT NULL DEFAULT 'stopped',
        config_path TEXT,
        capabilities TEXT NOT NULL DEFAULT '{}',
        discovered_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS metric_sources (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        adapter TEXT NOT NULL,
        host_id TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS metric_samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id TEXT NOT NULL REFERENCES metric_sources(id) ON DELETE CASCADE,
        metric_key TEXT NOT NULL,
        value_type TEXT NOT NULL,
        value_number REAL,
        value_text TEXT,
        value_bool INTEGER,
        unit TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '{}',
        quality TEXT NOT NULL DEFAULT 'ok',
        captured_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_metric_samples_key_time
        ON metric_samples(metric_key, captured_at DESC);

      CREATE TABLE IF NOT EXISTS metric_rollups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id TEXT NOT NULL REFERENCES metric_sources(id) ON DELETE CASCADE,
        metric_key TEXT NOT NULL,
        bucket_ms INTEGER NOT NULL,
        bucket_start_at INTEGER NOT NULL,
        count INTEGER NOT NULL,
        min_value REAL,
        max_value REAL,
        avg_value REAL,
        last_value_type TEXT NOT NULL,
        last_value_number REAL,
        last_value_text TEXT,
        last_value_bool INTEGER,
        unit TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '{}',
        UNIQUE(source_id, metric_key, bucket_ms, bucket_start_at, tags)
      );
      CREATE INDEX IF NOT EXISTS idx_metric_rollups_key_bucket
        ON metric_rollups(metric_key, bucket_ms, bucket_start_at DESC);
    `;
