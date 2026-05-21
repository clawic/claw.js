// @clawjs-persistent-surface-ddl-source
import { randomUUID } from "node:crypto";

import type Database from "better-sqlite3";
import {
  clawAppStateTransactionRequestSchema,
  type ClawAppStateOperation,
  type ClawAppStateProjection,
  type ClawAppStateSyncReceipt,
  type ClawAppStateTransactionRequest,
} from "@clawjs/core";

type JsonRecord = Record<string, unknown>;

export const APP_STATE_SCOPE_ID = "local";

export function ensureAppStateSchema(sqlite: Database.Database): void {
  migrateAppStateScopeColumns(sqlite);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      state_scope_id TEXT NOT NULL DEFAULT 'local',
      key TEXT NOT NULL,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (state_scope_id, key)
    );
    CREATE TABLE IF NOT EXISTS app_projects (
      id TEXT PRIMARY KEY,
      resource_id TEXT,
      name TEXT NOT NULL,
      path TEXT NOT NULL DEFAULT '',
      sort_order INTEGER,
      hidden INTEGER NOT NULL DEFAULT 0,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS app_projects_path_idx ON app_projects(path);
    CREATE INDEX IF NOT EXISTS app_projects_resource_id_idx ON app_projects(resource_id) WHERE resource_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS app_pinned_threads (
      thread_id TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL,
      pinned_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_session_titles (
      thread_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_archives (
      thread_id TEXT PRIMARY KEY,
      archived_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_sidebar_snapshots (
      thread_id TEXT PRIMARY KEY,
      chat_uuid TEXT,
      title TEXT NOT NULL,
      cwd TEXT,
      project_id TEXT,
      project_path TEXT,
      updated_at TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0,
      captured_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS app_sidebar_snapshots_order_idx
      ON app_sidebar_snapshots(pinned DESC, updated_at DESC);
    CREATE INDEX IF NOT EXISTS app_sidebar_snapshots_project_id_idx
      ON app_sidebar_snapshots(project_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS app_terminal_tabs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      cwd TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_state_sync_receipts (
      receipt_id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      host_id TEXT NOT NULL DEFAULT 'local',
      status TEXT NOT NULL,
      operation_count INTEGER NOT NULL DEFAULT 0,
      applied_at TEXT NOT NULL,
      error_json TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS app_state_sync_receipts_request_idx
      ON app_state_sync_receipts(request_id);
    CREATE INDEX IF NOT EXISTS app_state_sync_receipts_status_idx
      ON app_state_sync_receipts(status, applied_at DESC);
    CREATE TABLE IF NOT EXISTS app_state_projection_meta (
      state_scope_id TEXT PRIMARY KEY NOT NULL DEFAULT 'local',
      last_receipt_id TEXT,
      projected_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );
  `);
}

function migrateAppStateScopeColumns(sqlite: Database.Database): void {
  migrateScopedTable(sqlite, {
    table: "app_state",
    legacyColumn: "profile_id",
    scopeColumn: "state_scope_id",
    createSql: `
      CREATE TABLE app_state (
        state_scope_id TEXT NOT NULL DEFAULT 'local',
        key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (state_scope_id, key)
      )
    `,
    insertSql: `
      INSERT OR REPLACE INTO app_state (state_scope_id, key, value_json, updated_at)
      SELECT profile_id, key, value_json, updated_at FROM app_state_legacy_scope
    `,
  });
  migrateScopedTable(sqlite, {
    table: "app_state_projection_meta",
    legacyColumn: "profile_id",
    scopeColumn: "state_scope_id",
    createSql: `
      CREATE TABLE app_state_projection_meta (
        state_scope_id TEXT PRIMARY KEY NOT NULL DEFAULT 'local',
        last_receipt_id TEXT,
        projected_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      )
    `,
    insertSql: `
      INSERT OR REPLACE INTO app_state_projection_meta (state_scope_id, last_receipt_id, projected_at, metadata_json)
      SELECT profile_id, last_receipt_id, projected_at, metadata_json FROM app_state_projection_meta_legacy_scope
    `,
  });
}

function migrateScopedTable(
  sqlite: Database.Database,
  input: { table: string; legacyColumn: string; scopeColumn: string; createSql: string; insertSql: string },
): void {
  const columns = tableColumns(sqlite, input.table);
  if (columns.length === 0 || !columns.includes(input.legacyColumn) || columns.includes(input.scopeColumn)) return;
  const legacyTable = `${input.table}_legacy_scope`;
  sqlite.exec("BEGIN");
  try {
    sqlite.prepare(`ALTER TABLE ${quoteIdent(input.table)} RENAME TO ${quoteIdent(legacyTable)}`).run();
    sqlite.prepare(input.createSql).run();
    sqlite.prepare(input.insertSql).run();
    sqlite.prepare(`DROP TABLE ${quoteIdent(legacyTable)}`).run();
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }
}

function tableColumns(sqlite: Database.Database, table: string): string[] {
  return (sqlite.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all() as Array<{ name: string }>).map((column) => column.name);
}

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

export function readAppStateProjection(
  sqlite: Database.Database,
  input: { receiptLimit?: number; sidebarLimit?: number } = {},
): ClawAppStateProjection {
  ensureAppStateSchema(sqlite);
  const receiptLimit = Math.max(0, Number(input.receiptLimit ?? 20));
  const sidebarLimit = Math.max(1, Number(input.sidebarLimit ?? 200));
  return {
    schemaVersion: 1,
    projectedAt: nowIso(),
    projects: sqlite.prepare("SELECT * FROM app_projects ORDER BY COALESCE(sort_order, 999999), name").all().map(normalizeRecord),
    pinnedThreads: sqlite.prepare("SELECT * FROM app_pinned_threads ORDER BY sort_order").all().map(normalizeRecord),
    titles: sqlite.prepare("SELECT * FROM app_session_titles ORDER BY updated_at DESC").all().map(normalizeRecord),
    archives: sqlite.prepare("SELECT * FROM app_archives ORDER BY archived_at DESC").all().map(normalizeRecord),
    sidebar: sqlite.prepare("SELECT * FROM app_sidebar_snapshots ORDER BY pinned DESC, updated_at DESC LIMIT ?").all(sidebarLimit).map(normalizeRecord),
    terminalTabs: sqlite.prepare("SELECT * FROM app_terminal_tabs ORDER BY sort_order, updated_at DESC").all().map(normalizeRecord),
    receipts: receiptLimit > 0
      ? sqlite.prepare("SELECT * FROM app_state_sync_receipts ORDER BY applied_at DESC LIMIT ?").all(receiptLimit).map(receiptFromRow)
      : [],
  };
}

export function applyAppStateTransaction(
  sqlite: Database.Database,
  rawRequest: unknown,
): { receipt: ClawAppStateSyncReceipt; projection: ClawAppStateProjection } {
  ensureAppStateSchema(sqlite);
  const request = clawAppStateTransactionRequestSchema.parse(rawRequest);
  try {
    const receipt = sqlite.transaction(() => {
      for (const operation of request.operations) applyOperation(sqlite, operation);
      const applied = appliedReceipt(request);
      recordReceipt(sqlite, applied);
      sqlite.prepare(`
        INSERT INTO app_state_projection_meta (state_scope_id, last_receipt_id, projected_at, metadata_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(state_scope_id) DO UPDATE SET last_receipt_id = excluded.last_receipt_id,
          projected_at = excluded.projected_at, metadata_json = excluded.metadata_json
      `).run(APP_STATE_SCOPE_ID, applied.receiptId, applied.appliedAt, JSON.stringify({ requestId: request.requestId, hostId: request.hostId }));
      return applied;
    })();
    return { receipt, projection: readAppStateProjection(sqlite) };
  } catch (error) {
    const failed = failedReceipt(request, error);
    recordReceipt(sqlite, failed);
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), { receipt: failed });
  }
}

export function appStateRequestFromOperations(
  operations: ClawAppStateOperation[],
  input: { requestId?: string; hostId?: string; clientContext?: Record<string, unknown> } = {},
): ClawAppStateTransactionRequest {
  return clawAppStateTransactionRequestSchema.parse({
    schemaVersion: 1,
    requestId: input.requestId ?? `appstate-${randomUUID()}`,
    hostId: input.hostId ?? "local",
    operations,
    clientContext: input.clientContext ?? {},
    requestedAt: nowIso(),
  });
}

function applyOperation(sqlite: Database.Database, operation: ClawAppStateOperation): void {
  const now = nowIso();
  switch (operation.kind) {
    case "state.set":
      sqlite.prepare(`
        INSERT INTO app_state (state_scope_id, key, value_json, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(state_scope_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
      `).run(APP_STATE_SCOPE_ID, operation.key, JSON.stringify(operation.value), now);
      return;
    case "project.upsert":
      sqlite.prepare(`
        INSERT INTO app_projects (id, resource_id, name, path, sort_order, hidden, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, path = excluded.path,
          resource_id = COALESCE(excluded.resource_id, app_projects.resource_id),
          sort_order = COALESCE(excluded.sort_order, app_projects.sort_order),
          hidden = excluded.hidden, metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
      `).run(operation.id, operation.resourceId ?? null, operation.name, operation.path, operation.sortOrder ?? null, operation.hidden ? 1 : 0, JSON.stringify(operation.metadata), now, now);
      return;
    case "project.delete":
      sqlite.prepare("DELETE FROM app_projects WHERE id = ?").run(operation.id);
      return;
    case "project.order":
      operation.ids.forEach((id, index) => {
        sqlite.prepare("UPDATE app_projects SET sort_order = ?, updated_at = ? WHERE id = ?").run((index + 1) * 1000, now, id);
      });
      return;
    case "pin.upsert":
      sqlite.prepare(`
        INSERT INTO app_pinned_threads (thread_id, sort_order, pinned_at)
        VALUES (?, ?, ?)
        ON CONFLICT(thread_id) DO UPDATE SET sort_order = excluded.sort_order, pinned_at = excluded.pinned_at
      `).run(operation.threadId, operation.sortOrder, operation.pinnedAt ?? now);
      return;
    case "pin.delete":
      sqlite.prepare("DELETE FROM app_pinned_threads WHERE thread_id = ?").run(operation.threadId);
      return;
    case "pin.order":
      sqlite.prepare("DELETE FROM app_pinned_threads").run();
      operation.threadIds.forEach((id, index) => {
        sqlite.prepare("INSERT INTO app_pinned_threads (thread_id, sort_order, pinned_at) VALUES (?, ?, ?)").run(id, (index + 1) * 1000, now);
      });
      return;
    case "title.upsert":
      sqlite.prepare(`
        INSERT INTO app_session_titles (thread_id, title, source, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(thread_id) DO UPDATE SET title = excluded.title, source = excluded.source, updated_at = excluded.updated_at
      `).run(operation.threadId, operation.title, operation.source, operation.updatedAt ?? now);
      return;
    case "title.delete":
      sqlite.prepare("DELETE FROM app_session_titles WHERE thread_id = ?").run(operation.threadId);
      return;
    case "archive.set":
      sqlite.prepare(`
        INSERT INTO app_archives (thread_id, archived_at)
        VALUES (?, ?)
        ON CONFLICT(thread_id) DO UPDATE SET archived_at = excluded.archived_at
      `).run(operation.threadId, operation.archivedAt ?? now);
      return;
    case "archive.delete":
      sqlite.prepare("DELETE FROM app_archives WHERE thread_id = ?").run(operation.threadId);
      return;
    case "sidebar.upsert":
      upsertSidebar(sqlite, operation, now);
      return;
    case "sidebar.delete":
      sqlite.prepare("DELETE FROM app_sidebar_snapshots WHERE thread_id = ?").run(operation.threadId);
      return;
    case "sidebar.replace":
      sqlite.prepare("DELETE FROM app_sidebar_snapshots").run();
      for (const item of operation.items) upsertSidebar(sqlite, { kind: "sidebar.upsert", ...item }, now);
      return;
    case "terminal.upsert":
      sqlite.prepare(`
        INSERT INTO app_terminal_tabs (id, title, cwd, sort_order, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET title = excluded.title, cwd = excluded.cwd,
          sort_order = excluded.sort_order, metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
      `).run(operation.id, operation.title, operation.cwd ?? null, operation.sortOrder, JSON.stringify(operation.metadata), now, now);
      return;
    case "terminal.delete":
      sqlite.prepare("DELETE FROM app_terminal_tabs WHERE id = ?").run(operation.id);
      return;
  }
}

function upsertSidebar(sqlite: Database.Database, operation: Extract<ClawAppStateOperation, { kind: "sidebar.upsert" }>, capturedAt: string): void {
  sqlite.prepare(`
    INSERT INTO app_sidebar_snapshots (thread_id, chat_uuid, title, cwd, project_id, project_path, updated_at, archived, pinned, captured_at, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(thread_id) DO UPDATE SET chat_uuid = excluded.chat_uuid, title = excluded.title,
      cwd = excluded.cwd, project_id = excluded.project_id, project_path = excluded.project_path, updated_at = excluded.updated_at,
      archived = excluded.archived, pinned = excluded.pinned, captured_at = excluded.captured_at,
      metadata_json = excluded.metadata_json
  `).run(
    operation.threadId,
    operation.chatUuid,
    operation.title,
    operation.cwd ?? null,
    operation.projectId ?? null,
    operation.projectPath ?? null,
    operation.updatedAt ?? capturedAt,
    operation.archived ? 1 : 0,
    operation.pinned ? 1 : 0,
    capturedAt,
    JSON.stringify(operation.metadata),
  );
}

function recordReceipt(sqlite: Database.Database, receipt: ClawAppStateSyncReceipt): void {
  sqlite.prepare(`
    INSERT INTO app_state_sync_receipts (receipt_id, request_id, host_id, status, operation_count, applied_at, error_json, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(receipt_id) DO UPDATE SET status = excluded.status, operation_count = excluded.operation_count,
      applied_at = excluded.applied_at, error_json = excluded.error_json, metadata_json = excluded.metadata_json
  `).run(
    receipt.receiptId,
    receipt.requestId,
    receipt.hostId,
    receipt.status,
    receipt.operationCount,
    receipt.appliedAt,
    JSON.stringify(receipt.error),
    "{}",
  );
}

function appliedReceipt(request: ClawAppStateTransactionRequest): ClawAppStateSyncReceipt {
  return {
    schemaVersion: 1,
    receiptId: `receipt-${request.requestId}`,
    requestId: request.requestId,
    hostId: request.hostId,
    status: "applied",
    operationCount: request.operations.length,
    appliedAt: nowIso(),
    error: null,
  };
}

function failedReceipt(request: ClawAppStateTransactionRequest, error: unknown): ClawAppStateSyncReceipt {
  return {
    schemaVersion: 1,
    receiptId: `receipt-${request.requestId}`,
    requestId: request.requestId,
    hostId: request.hostId,
    status: "failed",
    operationCount: request.operations.length,
    appliedAt: nowIso(),
    error: {
      code: error instanceof Error && error.name ? error.name : "app_state_apply_failed",
      message: error instanceof Error ? error.message : String(error),
    },
  };
}

function receiptFromRow(row: unknown): ClawAppStateSyncReceipt {
  const record = row as JsonRecord;
  return {
    schemaVersion: 1,
    receiptId: String(record.receipt_id),
    requestId: String(record.request_id),
    hostId: String(record.host_id),
    status: record.status === "failed" ? "failed" : "applied",
    operationCount: Number(record.operation_count ?? 0),
    appliedAt: String(record.applied_at),
    error: parseJson(record.error_json as string | undefined, null),
  };
}

function normalizeRecord(row: unknown): Record<string, unknown> {
  if (!isRecord(row)) return {};
  const out: JsonRecord = {};
  for (const [key, value] of Object.entries(row)) {
    if (key.endsWith("_json") && typeof value === "string") {
      out[toCamel(key.slice(0, -5))] = parseJson(value, {});
    } else {
      out[toCamel(key)] = value;
    }
  }
  return out;
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}
