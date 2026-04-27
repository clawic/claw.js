import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import type { TemporalExecution, TemporalItem, TemporalProjection, TemporalRunLogEntry } from "@clawjs/core";

export class TimeServiceStore {
  readonly sqlite: Database.Database;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.sqlite = new Database(dbPath);
    this.sqlite.pragma("journal_mode = WAL");
    this.initialize();
  }

  close() {
    this.sqlite.close();
  }

  private initialize() {
    this.sqlite.exec(`
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
    `);
  }

  private serializeItem(item: TemporalItem) {
    return {
      id: item.id,
      kind: item.kind,
      status: item.status,
      title: item.title,
      owner_id: item.ownerId ?? null,
      workspace_id: item.workspaceId ?? null,
      project_id: item.projectId ?? null,
      agent_id: item.agentId ?? null,
      source_provider: item.sourceProvider ?? null,
      anchor_type: item.anchorType ?? null,
      anchor_id: item.anchorId ?? null,
      starts_at: item.startsAt ?? null,
      next_run_at: item.nextRunAt ?? null,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
      payload: JSON.stringify({
        ...item,
        projections: undefined,
      }),
    };
  }

  private hydrateItem(row: Record<string, unknown>): TemporalItem {
    const payload = JSON.parse(String(row.payload)) as TemporalItem;
    return {
      ...payload,
      ...(row.anchor_type ? { anchorType: String(row.anchor_type) as TemporalItem["anchorType"] } : {}),
      ...(row.anchor_id ? { anchorId: String(row.anchor_id) } : {}),
      projections: this.listProjections(String(row.id)),
    };
  }

  listItems(filters: {
    kind?: string;
    status?: string;
    workspaceId?: string;
    projectId?: string;
    agentId?: string;
    ownerId?: string;
    sourceProvider?: string;
  } = {}): TemporalItem[] {
    const clauses: string[] = [];
    const values: unknown[] = [];
    if (filters.kind) {
      clauses.push("kind = ?");
      values.push(filters.kind);
    }
    if (filters.status) {
      clauses.push("status = ?");
      values.push(filters.status);
    }
    if (filters.workspaceId) {
      clauses.push("workspace_id = ?");
      values.push(filters.workspaceId);
    }
    if (filters.projectId) {
      clauses.push("project_id = ?");
      values.push(filters.projectId);
    }
    if (filters.agentId) {
      clauses.push("agent_id = ?");
      values.push(filters.agentId);
    }
    if (filters.ownerId) {
      clauses.push("owner_id = ?");
      values.push(filters.ownerId);
    }
    if (filters.sourceProvider) {
      clauses.push("source_provider = ?");
      values.push(filters.sourceProvider);
    }
    const query = `
      SELECT * FROM temporal_items
      ${clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY COALESCE(next_run_at, starts_at, updated_at) ASC, title ASC
    `;
    const rows = this.sqlite.prepare(query).all(...values) as Array<Record<string, unknown>>;
    return rows.map((row) => this.hydrateItem(row));
  }

  getItem(id: string): TemporalItem | null {
    const row = this.sqlite.prepare("SELECT * FROM temporal_items WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? this.hydrateItem(row) : null;
  }

  putItem(item: TemporalItem): TemporalItem {
    const serialized = this.serializeItem(item);
    this.sqlite.prepare(`
      INSERT INTO temporal_items (
        id, kind, status, title, owner_id, workspace_id, project_id, agent_id,
        source_provider, anchor_type, anchor_id, starts_at, next_run_at, created_at, updated_at, payload
      ) VALUES (
        @id, @kind, @status, @title, @owner_id, @workspace_id, @project_id, @agent_id,
        @source_provider, @anchor_type, @anchor_id, @starts_at, @next_run_at, @created_at, @updated_at, @payload
      )
      ON CONFLICT(id) DO UPDATE SET
        kind = excluded.kind,
        status = excluded.status,
        title = excluded.title,
        owner_id = excluded.owner_id,
        workspace_id = excluded.workspace_id,
        project_id = excluded.project_id,
        agent_id = excluded.agent_id,
        source_provider = excluded.source_provider,
        anchor_type = excluded.anchor_type,
        anchor_id = excluded.anchor_id,
        starts_at = excluded.starts_at,
        next_run_at = excluded.next_run_at,
        updated_at = excluded.updated_at,
        payload = excluded.payload
    `).run(serialized);
    this.replaceProjections(item.id, item.projections);
    return item;
  }

  deleteItem(id: string): boolean {
    const result = this.sqlite.prepare("DELETE FROM temporal_items WHERE id = ?").run(id);
    this.sqlite.prepare("DELETE FROM temporal_projections WHERE item_id = ?").run(id);
    return result.changes > 0;
  }

  replaceProjections(itemId: string, projections: TemporalProjection[]) {
    const insert = this.sqlite.prepare(`
      INSERT INTO temporal_projections (id, item_id, target, status, provider, external_id, detail, updated_at)
      VALUES (@id, @item_id, @target, @status, @provider, @external_id, @detail, @updated_at)
    `);
    const tx = this.sqlite.transaction((records: TemporalProjection[]) => {
      this.sqlite.prepare("DELETE FROM temporal_projections WHERE item_id = ?").run(itemId);
      for (const projection of records) {
        insert.run({
          id: projection.id,
          item_id: itemId,
          target: projection.target,
          status: projection.status,
          provider: projection.provider ?? null,
          external_id: projection.externalId ?? null,
          detail: projection.detail ? JSON.stringify(projection.detail) : null,
          updated_at: projection.updatedAt,
        });
      }
    });
    tx(projections);
  }

  listProjections(itemId: string): TemporalProjection[] {
    const rows = this.sqlite.prepare("SELECT * FROM temporal_projections WHERE item_id = ? ORDER BY updated_at DESC").all(itemId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      itemId: String(row.item_id),
      target: String(row.target) as TemporalProjection["target"],
      status: String(row.status) as TemporalProjection["status"],
      ...(row.provider ? { provider: String(row.provider) } : {}),
      ...(row.external_id ? { externalId: String(row.external_id) } : {}),
      ...(row.detail ? { detail: JSON.parse(String(row.detail)) as Record<string, unknown> } : {}),
      updatedAt: String(row.updated_at),
    }));
  }

  putExecution(execution: TemporalExecution): TemporalExecution {
    this.sqlite.prepare(`
      INSERT INTO temporal_executions (
        id, item_id, status, scheduled_for, started_at, completed_at, triggered_by, output, error
      ) VALUES (
        @id, @item_id, @status, @scheduled_for, @started_at, @completed_at, @triggered_by, @output, @error
      )
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        started_at = excluded.started_at,
        completed_at = excluded.completed_at,
        triggered_by = excluded.triggered_by,
        output = excluded.output,
        error = excluded.error
    `).run({
      id: execution.id,
      item_id: execution.itemId,
      status: execution.status,
      scheduled_for: execution.scheduledFor,
      started_at: execution.startedAt ?? null,
      completed_at: execution.completedAt ?? null,
      triggered_by: execution.triggeredBy,
      output: execution.output ?? null,
      error: execution.error ?? null,
    });
    return execution;
  }

  getExecutionForSchedule(itemId: string, scheduledFor: string): TemporalExecution | null {
    const row = this.sqlite.prepare("SELECT * FROM temporal_executions WHERE item_id = ? AND scheduled_for = ?").get(itemId, scheduledFor) as Record<string, unknown> | undefined;
    return row ? this.hydrateExecution(row) : null;
  }

  listExecutions(itemId?: string): TemporalExecution[] {
    const rows = itemId
      ? this.sqlite.prepare("SELECT * FROM temporal_executions WHERE item_id = ? ORDER BY scheduled_for DESC").all(itemId)
      : this.sqlite.prepare("SELECT * FROM temporal_executions ORDER BY scheduled_for DESC").all();
    return (rows as Array<Record<string, unknown>>).map((row) => this.hydrateExecution(row));
  }

  failStaleRunningExecutions(nowIso = new Date().toISOString()): TemporalExecution[] {
    const running = this.listExecutions().filter((execution) => execution.status === "running");
    for (const execution of running) {
      this.putExecution({
        ...execution,
        status: "failed",
        completedAt: nowIso,
        error: "Recovered stale running execution on scheduler startup.",
      });
    }
    for (const item of this.listItems()) {
      if (item.runtime?.runningAt || item.runtime?.runningExecutionId) {
        this.putItem({
          ...item,
          runtime: {
            ...(item.runtime ?? {}),
            runningAt: undefined,
            runningExecutionId: undefined,
          },
        });
      }
    }
    return running;
  }

  deleteExecution(id: string): boolean {
    const result = this.sqlite.prepare("DELETE FROM temporal_executions WHERE id = ?").run(id);
    return result.changes > 0;
  }

  appendRunLog(entry: TemporalRunLogEntry, options: { keep?: number } = {}): TemporalRunLogEntry {
    this.sqlite.prepare(`
      INSERT INTO temporal_run_log (
        id, item_id, status, scheduled_for, started_at, completed_at, duration_ms,
        triggered_by, summary, error, payload
      ) VALUES (
        @id, @item_id, @status, @scheduled_for, @started_at, @completed_at, @duration_ms,
        @triggered_by, @summary, @error, @payload
      )
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        completed_at = excluded.completed_at,
        duration_ms = excluded.duration_ms,
        summary = excluded.summary,
        error = excluded.error,
        payload = excluded.payload
    `).run({
      id: entry.id,
      item_id: entry.itemId,
      status: entry.status,
      scheduled_for: entry.scheduledFor,
      started_at: entry.startedAt,
      completed_at: entry.completedAt,
      duration_ms: entry.durationMs,
      triggered_by: entry.triggeredBy,
      summary: entry.summary ?? null,
      error: entry.error ?? null,
      payload: JSON.stringify(entry),
    });
    this.pruneRunLog(entry.itemId, options.keep ?? 500);
    return entry;
  }

  listRunLog(itemId?: string, limit = 100): TemporalRunLogEntry[] {
    const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
    const rows = itemId
      ? this.sqlite.prepare("SELECT payload FROM temporal_run_log WHERE item_id = ? ORDER BY completed_at DESC LIMIT ?").all(itemId, safeLimit)
      : this.sqlite.prepare("SELECT payload FROM temporal_run_log ORDER BY completed_at DESC LIMIT ?").all(safeLimit);
    return (rows as Array<Record<string, unknown>>).map((row) => JSON.parse(String(row.payload)) as TemporalRunLogEntry);
  }

  private pruneRunLog(itemId: string, keep: number): void {
    const safeKeep = Math.max(1, Math.min(5000, Math.floor(keep)));
    this.sqlite.prepare(`
      DELETE FROM temporal_run_log
      WHERE item_id = ?
        AND id NOT IN (
          SELECT id FROM temporal_run_log
          WHERE item_id = ?
          ORDER BY completed_at DESC
          LIMIT ?
        )
    `).run(itemId, itemId, safeKeep);
  }

  private hydrateExecution(row: Record<string, unknown>): TemporalExecution {
    return {
      id: String(row.id),
      itemId: String(row.item_id),
      status: String(row.status) as TemporalExecution["status"],
      scheduledFor: String(row.scheduled_for),
      ...(row.started_at ? { startedAt: String(row.started_at) } : {}),
      ...(row.completed_at ? { completedAt: String(row.completed_at) } : {}),
      triggeredBy: String(row.triggered_by) as TemporalExecution["triggeredBy"],
      ...(row.output ? { output: String(row.output) } : {}),
      ...(row.error ? { error: String(row.error) } : {}),
    };
  }
}
