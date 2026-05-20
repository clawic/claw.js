import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import Database from "better-sqlite3";

// @clawjs-persistent-surface-ddl-source

import { randomUUID as randomUuidForKanban } from "node:crypto";

import type {
  ClaimResult,
  CreateKanbanTaskInput,
  DispatcherTickResult,
  DistillationRecord,
  KanbanBoard,
  KanbanCommentRecord,
  KanbanDispatcherOptions,
  KanbanEventRecord,
  KanbanPriority,
  KanbanStatus,
  KanbanTaskRecord,
  ListKanbanFilter,
  NudgeRecord,
  RuntimeJobEventKind,
  RuntimeJobEventLevel,
  RuntimeJobEventRecord,
  RuntimeJobKind,
  RuntimeJobRecord,
  RuntimeJobStatus,
  UpdateKanbanTaskInput,
  UserModelRefreshRecord,
} from "./types.ts";

const SCHEMA_DDL = `
  CREATE TABLE IF NOT EXISTS runtime_distillations (
    id                   TEXT PRIMARY KEY,
    session_id           TEXT NOT NULL,
    skill_slug           TEXT NOT NULL,
    skill_markdown_path  TEXT,
    confidence           REAL NOT NULL DEFAULT 0,
    tool_call_count      INTEGER NOT NULL DEFAULT 0,
    message_count        INTEGER NOT NULL DEFAULT 0,
    distilled_at         INTEGER NOT NULL,
    status               TEXT NOT NULL CHECK (status IN ('completed','skipped','failed')),
    reason               TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_dist_session  ON runtime_distillations(session_id, distilled_at DESC);
  CREATE INDEX IF NOT EXISTS idx_dist_slug     ON runtime_distillations(skill_slug);
  CREATE UNIQUE INDEX IF NOT EXISTS uniq_dist_session_slug ON runtime_distillations(session_id, skill_slug);

  CREATE TABLE IF NOT EXISTS runtime_nudges (
    id                     TEXT PRIMARY KEY,
    session_id             TEXT NOT NULL,
    trigger_message_id     TEXT,
    observation            TEXT NOT NULL,
    classification         TEXT NOT NULL,
    recorded_at            INTEGER NOT NULL,
    propagated_to_memory   INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_nudge_session ON runtime_nudges(session_id, recorded_at DESC);

  CREATE TABLE IF NOT EXISTS runtime_user_model_refreshes (
    id              TEXT PRIMARY KEY,
    reason          TEXT,
    items_added     INTEGER NOT NULL DEFAULT 0,
    items_updated   INTEGER NOT NULL DEFAULT 0,
    items_removed   INTEGER NOT NULL DEFAULT 0,
    duration_ms     INTEGER NOT NULL DEFAULT 0,
    refreshed_at    INTEGER NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('completed','failed')),
    error           TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_umr_at        ON runtime_user_model_refreshes(refreshed_at DESC);

  CREATE TABLE IF NOT EXISTS runtime_jobs (
    id            TEXT PRIMARY KEY,
    kind          TEXT NOT NULL CHECK (kind IN ('distill','nudge','user_model_refresh')),
    status        TEXT NOT NULL CHECK (status IN ('pending','running','completed','failed','cancelled')),
    started_at    INTEGER NOT NULL,
    completed_at  INTEGER,
    error         TEXT,
    payload_json  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_jobs_kind_started ON runtime_jobs(kind, started_at DESC);
  CREATE INDEX IF NOT EXISTS idx_jobs_status       ON runtime_jobs(status, started_at DESC);

  CREATE TABLE IF NOT EXISTS runtime_job_events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id        TEXT NOT NULL REFERENCES runtime_jobs(id) ON DELETE CASCADE,
    kind          TEXT NOT NULL CHECK (kind IN ('job.started','job.completed','job.failed','job.cancelled')),
    level         TEXT NOT NULL CHECK (level IN ('info','warning','error')),
    message       TEXT NOT NULL,
    recorded_at   INTEGER NOT NULL,
    payload_json  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON runtime_job_events(job_id, id ASC);
  CREATE INDEX IF NOT EXISTS idx_job_events_id     ON runtime_job_events(id ASC);

  CREATE TABLE IF NOT EXISTS kanban_tasks (
    id                  TEXT PRIMARY KEY,
    title               TEXT NOT NULL,
    description         TEXT,
    status              TEXT NOT NULL CHECK (status IN ('triage','todo','ready','in_progress','blocked','done','cancelled')),
    priority            TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
    agent_assigned      TEXT,
    claimed_by          TEXT,
    claimed_at          INTEGER,
    claim_expires_at    INTEGER,
    failure_count       INTEGER NOT NULL DEFAULT 0,
    last_failure_at     INTEGER,
    failure_reason      TEXT,
    block_reason        TEXT,
    depends_on_ids      TEXT NOT NULL DEFAULT '[]',
    board_order         INTEGER NOT NULL DEFAULT 0,
    project_path        TEXT,
    session_id          TEXT,
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    started_at          INTEGER,
    completed_at        INTEGER,
    metadata_json       TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_kt_status    ON kanban_tasks(status, board_order ASC, created_at ASC);
  CREATE INDEX IF NOT EXISTS idx_kt_agent     ON kanban_tasks(agent_assigned, status);
  CREATE INDEX IF NOT EXISTS idx_kt_claimed   ON kanban_tasks(claimed_by, claim_expires_at);
  CREATE INDEX IF NOT EXISTS idx_kt_project   ON kanban_tasks(project_path, status);

  CREATE TABLE IF NOT EXISTS kanban_comments (
    id          TEXT PRIMARY KEY,
    task_id     TEXT NOT NULL REFERENCES kanban_tasks(id) ON DELETE CASCADE,
    author      TEXT NOT NULL,
    body        TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_kc_task      ON kanban_comments(task_id, created_at ASC);

  CREATE TABLE IF NOT EXISTS kanban_events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id       TEXT NOT NULL REFERENCES kanban_tasks(id) ON DELETE CASCADE,
    kind          TEXT NOT NULL,
    from_status   TEXT,
    to_status     TEXT,
    actor         TEXT,
    payload_json  TEXT,
    recorded_at   INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ke_task      ON kanban_events(task_id, recorded_at ASC);
  CREATE INDEX IF NOT EXISTS idx_ke_kind      ON kanban_events(kind, recorded_at DESC);
`;

interface KanbanTaskRow {
  id: string;
  title: string;
  description: string | null;
  status: KanbanStatus;
  priority: KanbanPriority;
  agent_assigned: string | null;
  claimed_by: string | null;
  claimed_at: number | null;
  claim_expires_at: number | null;
  failure_count: number;
  last_failure_at: number | null;
  failure_reason: string | null;
  block_reason: string | null;
  depends_on_ids: string;
  board_order: number;
  project_path: string | null;
  session_id: string | null;
  created_at: number;
  updated_at: number;
  started_at: number | null;
  completed_at: number | null;
  metadata_json: string | null;
}

interface KanbanCommentRow {
  id: string;
  task_id: string;
  author: string;
  body: string;
  created_at: number;
}

interface KanbanEventRow {
  id: number;
  task_id: string;
  kind: string;
  from_status: KanbanStatus | null;
  to_status: KanbanStatus | null;
  actor: string | null;
  payload_json: string | null;
  recorded_at: number;
}

function parseJsonField<T>(value: string | null): T | null {
  if (value == null) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function rowToKanbanTask(row: KanbanTaskRow): KanbanTaskRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    agentAssigned: row.agent_assigned,
    claimedBy: row.claimed_by,
    claimedAt: row.claimed_at,
    claimExpiresAt: row.claim_expires_at,
    failureCount: row.failure_count,
    lastFailureAt: row.last_failure_at,
    failureReason: row.failure_reason,
    blockReason: row.block_reason,
    dependsOnIds: parseJsonField<string[]>(row.depends_on_ids) ?? [],
    boardOrder: row.board_order,
    projectPath: row.project_path,
    sessionId: row.session_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    metadata: parseJsonField<Record<string, unknown>>(row.metadata_json),
  };
}

function rowToKanbanComment(row: KanbanCommentRow): KanbanCommentRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    author: row.author,
    body: row.body,
    createdAt: row.created_at,
  };
}

function rowToKanbanEvent(row: KanbanEventRow): KanbanEventRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    kind: row.kind,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    actor: row.actor,
    payload: parseJsonField<Record<string, unknown>>(row.payload_json),
    recordedAt: row.recorded_at,
  };
}

const DEFAULT_CLAIM_TTL_MS = 5 * 60 * 1000;
const DEFAULT_AUTO_BLOCK_THRESHOLD = 3;

interface DistRow {
  id: string;
  session_id: string;
  skill_slug: string;
  skill_markdown_path: string | null;
  confidence: number;
  tool_call_count: number;
  message_count: number;
  distilled_at: number;
  status: "completed" | "skipped" | "failed";
  reason: string | null;
}

interface NudgeRow {
  id: string;
  session_id: string;
  trigger_message_id: string | null;
  observation: string;
  classification: string;
  recorded_at: number;
  propagated_to_memory: number;
}

interface UmrRow {
  id: string;
  reason: string | null;
  items_added: number;
  items_updated: number;
  items_removed: number;
  duration_ms: number;
  refreshed_at: number;
  status: "completed" | "failed";
  error: string | null;
}

interface JobRow {
  id: string;
  kind: RuntimeJobKind;
  status: RuntimeJobStatus;
  started_at: number;
  completed_at: number | null;
  error: string | null;
  payload_json: string | null;
}

interface JobEventRow {
  id: number;
  job_id: string;
  kind: RuntimeJobEventKind;
  level: RuntimeJobEventLevel;
  message: string;
  recorded_at: number;
  payload_json: string | null;
}

function rowToDist(row: DistRow): DistillationRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    skillSlug: row.skill_slug,
    skillMarkdownPath: row.skill_markdown_path,
    provenance: "distilled",
    confidence: row.confidence,
    toolCallCount: row.tool_call_count,
    messageCount: row.message_count,
    distilledAt: row.distilled_at,
    status: row.status,
    reason: row.reason,
  };
}

function rowToNudge(row: NudgeRow): NudgeRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    triggerMessageId: row.trigger_message_id,
    observation: row.observation,
    classification: row.classification,
    recordedAt: row.recorded_at,
    propagatedToMemory: row.propagated_to_memory === 1,
  };
}

function rowToUmr(row: UmrRow): UserModelRefreshRecord {
  return {
    id: row.id,
    reason: row.reason,
    itemsAdded: row.items_added,
    itemsUpdated: row.items_updated,
    itemsRemoved: row.items_removed,
    durationMs: row.duration_ms,
    refreshedAt: row.refreshed_at,
    status: row.status,
    error: row.error,
  };
}

function rowToJob(row: JobRow): RuntimeJobRecord {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    error: row.error,
    payload: row.payload_json ? (JSON.parse(row.payload_json) as Record<string, unknown>) : null,
  };
}

function rowToJobEvent(row: JobEventRow): RuntimeJobEventRecord {
  return {
    id: row.id,
    jobId: row.job_id,
    kind: row.kind,
    level: row.level,
    message: row.message,
    recordedAt: row.recorded_at,
    payload: parseJsonField<Record<string, unknown>>(row.payload_json),
  };
}

export class RuntimeServiceStore {
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

  createJob(kind: RuntimeJobKind, payload: Record<string, unknown> | null = null): RuntimeJobRecord {
    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO runtime_jobs (id, kind, status, started_at, payload_json)
      VALUES (@id, @kind, 'running', @started_at, @payload)
    `).run({ id, kind, started_at: Date.now(), payload: payload ? JSON.stringify(payload) : null });
    this.recordJobEvent(id, "job.started", "info", `Started ${kind} job`, payload);
    return rowToJob(this.db.prepare("SELECT * FROM runtime_jobs WHERE id = ?").get(id) as JobRow);
  }

  finishJob(id: string, success: boolean, error: string | null = null): RuntimeJobRecord | null {
    const current = this.getJob(id);
    if (current?.status === "cancelled") {
      return current;
    }
    this.db.prepare(`
      UPDATE runtime_jobs
      SET status = @status, completed_at = @completed_at, error = @error
      WHERE id = @id
    `).run({
      id,
      status: success ? "completed" : "failed",
      completed_at: Date.now(),
      error,
    });
    const row = this.db.prepare("SELECT * FROM runtime_jobs WHERE id = ?").get(id) as JobRow | undefined;
    if (row) {
      this.recordJobEvent(
        id,
        success ? "job.completed" : "job.failed",
        success ? "info" : "error",
        success ? `Completed ${row.kind} job` : `Failed ${row.kind} job`,
        error ? { error } : null,
      );
    }
    return row ? rowToJob(row) : null;
  }

  getJob(id: string): RuntimeJobRecord | null {
    const row = this.db.prepare("SELECT * FROM runtime_jobs WHERE id = ?").get(id) as JobRow | undefined;
    return row ? rowToJob(row) : null;
  }

  cancelJob(id: string, reason: string | null = null): { job: RuntimeJobRecord; cancelled: boolean } | null {
    const current = this.getJob(id);
    if (!current) return null;
    if (current.status === "completed" || current.status === "failed" || current.status === "cancelled") {
      return { job: current, cancelled: false };
    }
    const message = reason ?? "cancelled by runtime jobs API";
    this.db.prepare(`
      UPDATE runtime_jobs
      SET status = 'cancelled', completed_at = @completed_at, error = @error
      WHERE id = @id
    `).run({ id, completed_at: Date.now(), error: message });
    this.recordJobEvent(id, "job.cancelled", "warning", "Cancelled job", { reason: message });
    const job = this.getJob(id);
    return job ? { job, cancelled: true } : null;
  }

  listJobs(kind?: RuntimeJobKind, limit = 50): RuntimeJobRecord[] {
    const rows = kind
      ? (this.db.prepare(
          "SELECT * FROM runtime_jobs WHERE kind = ? ORDER BY started_at DESC LIMIT ?",
        ).all(kind, Math.min(limit, 500)) as JobRow[])
      : (this.db.prepare(
          "SELECT * FROM runtime_jobs ORDER BY started_at DESC LIMIT ?",
        ).all(Math.min(limit, 500)) as JobRow[]);
    return rows.map(rowToJob);
  }

  recordJobEvent(
    jobId: string,
    kind: RuntimeJobEventKind,
    level: RuntimeJobEventLevel,
    message: string,
    payload: Record<string, unknown> | null = null,
  ): RuntimeJobEventRecord {
    const result = this.db.prepare(`
      INSERT INTO runtime_job_events (job_id, kind, level, message, recorded_at, payload_json)
      VALUES (@job_id, @kind, @level, @message, @recorded_at, @payload_json)
    `).run({
      job_id: jobId,
      kind,
      level,
      message,
      recorded_at: Date.now(),
      payload_json: payload ? JSON.stringify(payload) : null,
    });
    return rowToJobEvent(this.db.prepare("SELECT * FROM runtime_job_events WHERE id = ?").get(result.lastInsertRowid) as JobEventRow);
  }

  listJobEvents(input: { jobId?: string; afterId?: number; limit?: number } = {}): RuntimeJobEventRecord[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (input.jobId) {
      clauses.push("job_id = ?");
      params.push(input.jobId);
    }
    if (input.afterId !== undefined) {
      clauses.push("id > ?");
      params.push(input.afterId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
    const rows = this.db.prepare(`
      SELECT * FROM runtime_job_events
      ${where}
      ORDER BY id ASC
      LIMIT ?
    `).all(...params, limit) as JobEventRow[];
    return rows.map(rowToJobEvent);
  }

  recordDistillation(input: Omit<DistillationRecord, "id" | "distilledAt" | "provenance"> & {
    id?: string;
    distilledAt?: number;
  }): DistillationRecord {
    const id = input.id ?? randomUUID();
    const distilledAt = input.distilledAt ?? Date.now();
    this.db.prepare(`
      INSERT INTO runtime_distillations (
        id, session_id, skill_slug, skill_markdown_path, confidence,
        tool_call_count, message_count, distilled_at, status, reason
      ) VALUES (
        @id, @session_id, @skill_slug, @skill_markdown_path, @confidence,
        @tool_call_count, @message_count, @distilled_at, @status, @reason
      )
      ON CONFLICT(session_id, skill_slug) DO UPDATE SET
        skill_markdown_path = excluded.skill_markdown_path,
        confidence          = excluded.confidence,
        tool_call_count     = excluded.tool_call_count,
        message_count       = excluded.message_count,
        distilled_at        = excluded.distilled_at,
        status              = excluded.status,
        reason              = excluded.reason
    `).run({
      id,
      session_id: input.sessionId,
      skill_slug: input.skillSlug,
      skill_markdown_path: input.skillMarkdownPath,
      confidence: input.confidence,
      tool_call_count: input.toolCallCount,
      message_count: input.messageCount,
      distilled_at: distilledAt,
      status: input.status,
      reason: input.reason,
    });
    const row = this.db.prepare(
      "SELECT * FROM runtime_distillations WHERE session_id = ? AND skill_slug = ?",
    ).get(input.sessionId, input.skillSlug) as DistRow;
    return rowToDist(row);
  }

  findDistillation(sessionId: string, skillSlug: string): DistillationRecord | null {
    const row = this.db.prepare(
      "SELECT * FROM runtime_distillations WHERE session_id = ? AND skill_slug = ?",
    ).get(sessionId, skillSlug) as DistRow | undefined;
    return row ? rowToDist(row) : null;
  }

  listDistillations(sessionId?: string, limit = 100): DistillationRecord[] {
    const rows = sessionId
      ? (this.db.prepare(
          "SELECT * FROM runtime_distillations WHERE session_id = ? ORDER BY distilled_at DESC LIMIT ?",
        ).all(sessionId, Math.min(limit, 1000)) as DistRow[])
      : (this.db.prepare(
          "SELECT * FROM runtime_distillations ORDER BY distilled_at DESC LIMIT ?",
        ).all(Math.min(limit, 1000)) as DistRow[]);
    return rows.map(rowToDist);
  }

  recordNudge(input: Omit<NudgeRecord, "id" | "recordedAt" | "propagatedToMemory"> & {
    id?: string;
    recordedAt?: number;
    propagatedToMemory?: boolean;
  }): NudgeRecord {
    const id = input.id ?? randomUUID();
    const recordedAt = input.recordedAt ?? Date.now();
    this.db.prepare(`
      INSERT INTO runtime_nudges (
        id, session_id, trigger_message_id, observation, classification, recorded_at, propagated_to_memory
      ) VALUES (
        @id, @session_id, @trigger_message_id, @observation, @classification, @recorded_at, @propagated_to_memory
      )
    `).run({
      id,
      session_id: input.sessionId,
      trigger_message_id: input.triggerMessageId,
      observation: input.observation,
      classification: input.classification,
      recorded_at: recordedAt,
      propagated_to_memory: input.propagatedToMemory ? 1 : 0,
    });
    return rowToNudge(this.db.prepare("SELECT * FROM runtime_nudges WHERE id = ?").get(id) as NudgeRow);
  }

  listNudges(sessionId?: string, limit = 100): NudgeRecord[] {
    const rows = sessionId
      ? (this.db.prepare(
          "SELECT * FROM runtime_nudges WHERE session_id = ? ORDER BY recorded_at DESC LIMIT ?",
        ).all(sessionId, Math.min(limit, 1000)) as NudgeRow[])
      : (this.db.prepare(
          "SELECT * FROM runtime_nudges ORDER BY recorded_at DESC LIMIT ?",
        ).all(Math.min(limit, 1000)) as NudgeRow[]);
    return rows.map(rowToNudge);
  }

  recordUserModelRefresh(input: Omit<UserModelRefreshRecord, "id" | "refreshedAt"> & {
    id?: string;
    refreshedAt?: number;
  }): UserModelRefreshRecord {
    const id = input.id ?? randomUUID();
    const refreshedAt = input.refreshedAt ?? Date.now();
    this.db.prepare(`
      INSERT INTO runtime_user_model_refreshes (
        id, reason, items_added, items_updated, items_removed, duration_ms, refreshed_at, status, error
      ) VALUES (
        @id, @reason, @items_added, @items_updated, @items_removed, @duration_ms, @refreshed_at, @status, @error
      )
    `).run({
      id,
      reason: input.reason,
      items_added: input.itemsAdded,
      items_updated: input.itemsUpdated,
      items_removed: input.itemsRemoved,
      duration_ms: input.durationMs,
      refreshed_at: refreshedAt,
      status: input.status,
      error: input.error,
    });
    return rowToUmr(this.db.prepare("SELECT * FROM runtime_user_model_refreshes WHERE id = ?").get(id) as UmrRow);
  }

  listUserModelRefreshes(limit = 50): UserModelRefreshRecord[] {
    const rows = this.db.prepare(
      "SELECT * FROM runtime_user_model_refreshes ORDER BY refreshed_at DESC LIMIT ?",
    ).all(Math.min(limit, 500)) as UmrRow[];
    return rows.map(rowToUmr);
  }

  createKanbanTask(input: CreateKanbanTaskInput): KanbanTaskRecord {
    const id = input.id ?? randomUuidForKanban();
    const now = Date.now();
    const status: KanbanStatus = input.status ?? (input.dependsOnIds && input.dependsOnIds.length > 0 ? "triage" : "todo");
    this.db.prepare(`
      INSERT INTO kanban_tasks (
        id, title, description, status, priority, agent_assigned,
        failure_count, depends_on_ids, board_order,
        project_path, session_id, created_at, updated_at, metadata_json
      ) VALUES (
        @id, @title, @description, @status, @priority, @agent_assigned,
        0, @depends_on_ids, @board_order,
        @project_path, @session_id, @created_at, @updated_at, @metadata_json
      )
    `).run({
      id,
      title: input.title,
      description: input.description ?? null,
      status,
      priority: input.priority ?? "medium",
      agent_assigned: input.agentAssigned ?? null,
      depends_on_ids: JSON.stringify(input.dependsOnIds ?? []),
      board_order: now,
      project_path: input.projectPath ?? null,
      session_id: input.sessionId ?? null,
      created_at: now,
      updated_at: now,
      metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
    });
    this.recordKanbanEvent({ taskId: id, kind: "created", fromStatus: null, toStatus: status, actor: input.agentAssigned ?? null, payload: { title: input.title } });
    return this.getKanbanTask(id)!;
  }

  getKanbanTask(id: string): KanbanTaskRecord | null {
    const row = this.db.prepare("SELECT * FROM kanban_tasks WHERE id = ?").get(id) as KanbanTaskRow | undefined;
    return row ? rowToKanbanTask(row) : null;
  }

  listKanbanTasks(filter: ListKanbanFilter = {}): KanbanTaskRecord[] {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    if (filter.status) { conditions.push("status = @status"); params.status = filter.status; }
    if (filter.agentAssigned) { conditions.push("agent_assigned = @agent"); params.agent = filter.agentAssigned; }
    if (filter.claimedBy) { conditions.push("claimed_by = @claimed_by"); params.claimed_by = filter.claimedBy; }
    if (filter.projectPath) { conditions.push("project_path = @project_path"); params.project_path = filter.projectPath; }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.min(filter.limit ?? 200, 1000);
    const offset = filter.offset ?? 0;
    const rows = this.db.prepare(
      `SELECT * FROM kanban_tasks ${where} ORDER BY status, board_order ASC, created_at ASC LIMIT ${limit} OFFSET ${offset}`,
    ).all(params) as KanbanTaskRow[];
    return rows.map(rowToKanbanTask);
  }

  updateKanbanTask(id: string, patch: UpdateKanbanTaskInput): KanbanTaskRecord | null {
    const existing = this.getKanbanTask(id);
    if (!existing) return null;
    const now = Date.now();
    this.db.prepare(`
      UPDATE kanban_tasks
      SET title          = @title,
          description    = @description,
          priority       = @priority,
          agent_assigned = @agent_assigned,
          depends_on_ids = @depends_on_ids,
          board_order    = @board_order,
          project_path   = @project_path,
          metadata_json  = @metadata_json,
          updated_at     = @updated_at
      WHERE id = @id
    `).run({
      id,
      title: patch.title ?? existing.title,
      description: patch.description === undefined ? existing.description : patch.description,
      priority: patch.priority ?? existing.priority,
      agent_assigned: patch.agentAssigned === undefined ? existing.agentAssigned : patch.agentAssigned,
      depends_on_ids: JSON.stringify(patch.dependsOnIds ?? existing.dependsOnIds),
      board_order: patch.boardOrder ?? existing.boardOrder,
      project_path: patch.projectPath === undefined ? existing.projectPath : patch.projectPath,
      metadata_json: patch.metadata === undefined
        ? (existing.metadata ? JSON.stringify(existing.metadata) : null)
        : (patch.metadata ? JSON.stringify(patch.metadata) : null),
      updated_at: now,
    });
    return this.getKanbanTask(id);
  }

  deleteKanbanTask(id: string): boolean {
    const info = this.db.prepare("DELETE FROM kanban_tasks WHERE id = ?").run(id);
    return info.changes > 0;
  }

  private recordKanbanEvent(input: Omit<KanbanEventRecord, "id" | "recordedAt">): void {
    this.db.prepare(`
      INSERT INTO kanban_events (task_id, kind, from_status, to_status, actor, payload_json, recorded_at)
      VALUES (@task_id, @kind, @from_status, @to_status, @actor, @payload, @at)
    `).run({
      task_id: input.taskId,
      kind: input.kind,
      from_status: input.fromStatus,
      to_status: input.toStatus,
      actor: input.actor,
      payload: input.payload ? JSON.stringify(input.payload) : null,
      at: Date.now(),
    });
  }

  claimKanbanTask(taskId: string, agent: string, options: { ttlMs?: number } = {}): ClaimResult {
    const ttl = options.ttlMs ?? DEFAULT_CLAIM_TTL_MS;
    const now = Date.now();
    const expires = now + ttl;
    const tx = this.db.transaction(() => {
      const row = this.db.prepare("SELECT * FROM kanban_tasks WHERE id = ?").get(taskId) as KanbanTaskRow | undefined;
      if (!row) return { claimed: false, task: null, reason: "task_not_found" } as ClaimResult;
      if (row.status !== "ready") return { claimed: false, task: rowToKanbanTask(row), reason: `status_not_ready:${row.status}` } as ClaimResult;
      if (row.claimed_by && row.claim_expires_at && row.claim_expires_at > now && row.claimed_by !== agent) {
        return { claimed: false, task: rowToKanbanTask(row), reason: `claimed_by_other:${row.claimed_by}` } as ClaimResult;
      }
      this.db.prepare(`
        UPDATE kanban_tasks
        SET status           = 'in_progress',
            claimed_by       = @agent,
            claimed_at       = @now,
            claim_expires_at = @expires,
            started_at       = COALESCE(started_at, @now),
            updated_at       = @now
        WHERE id = @id
      `).run({ agent, now, expires, id: taskId });
      this.recordKanbanEvent({ taskId, kind: "claimed", fromStatus: "ready", toStatus: "in_progress", actor: agent, payload: { expiresAt: expires } });
      const updated = this.db.prepare("SELECT * FROM kanban_tasks WHERE id = ?").get(taskId) as KanbanTaskRow;
      return { claimed: true, task: rowToKanbanTask(updated) } as ClaimResult;
    });
    return tx();
  }

  completeKanbanTask(taskId: string, actor: string | null = null): KanbanTaskRecord | null {
    const existing = this.getKanbanTask(taskId);
    if (!existing) return null;
    const now = Date.now();
    this.db.prepare(`
      UPDATE kanban_tasks
      SET status           = 'done',
          claimed_by       = NULL,
          claim_expires_at = NULL,
          completed_at     = @now,
          updated_at       = @now
      WHERE id = @id
    `).run({ now, id: taskId });
    this.recordKanbanEvent({ taskId, kind: "completed", fromStatus: existing.status, toStatus: "done", actor, payload: null });
    return this.getKanbanTask(taskId);
  }

  failKanbanTask(taskId: string, reason: string, actor: string | null = null): KanbanTaskRecord | null {
    const existing = this.getKanbanTask(taskId);
    if (!existing) return null;
    const now = Date.now();
    this.db.prepare(`
      UPDATE kanban_tasks
      SET status           = 'ready',
          claimed_by       = NULL,
          claim_expires_at = NULL,
          failure_count    = failure_count + 1,
          last_failure_at  = @now,
          failure_reason   = @reason,
          updated_at       = @now
      WHERE id = @id
    `).run({ now, id: taskId, reason });
    this.recordKanbanEvent({ taskId, kind: "failed", fromStatus: existing.status, toStatus: "ready", actor, payload: { reason } });
    return this.getKanbanTask(taskId);
  }

  blockKanbanTask(taskId: string, reason: string, actor: string | null = null): KanbanTaskRecord | null {
    const existing = this.getKanbanTask(taskId);
    if (!existing) return null;
    const now = Date.now();
    this.db.prepare(`
      UPDATE kanban_tasks
      SET status           = 'blocked',
          block_reason     = @reason,
          updated_at       = @now
      WHERE id = @id
    `).run({ now, id: taskId, reason });
    this.recordKanbanEvent({ taskId, kind: "blocked", fromStatus: existing.status, toStatus: "blocked", actor, payload: { reason } });
    return this.getKanbanTask(taskId);
  }

  unblockKanbanTask(taskId: string, actor: string | null = null): KanbanTaskRecord | null {
    const existing = this.getKanbanTask(taskId);
    if (!existing) return null;
    const now = Date.now();
    this.db.prepare(`
      UPDATE kanban_tasks
      SET status        = CASE WHEN @has_deps = 1 THEN 'todo' ELSE 'ready' END,
          block_reason  = NULL,
          updated_at    = @now
      WHERE id = @id
    `).run({ now, id: taskId, has_deps: existing.dependsOnIds.length > 0 ? 1 : 0 });
    const after = this.getKanbanTask(taskId);
    this.recordKanbanEvent({ taskId, kind: "unblocked", fromStatus: "blocked", toStatus: after?.status ?? null, actor, payload: null });
    return after;
  }

  addKanbanComment(taskId: string, author: string, body: string): KanbanCommentRecord {
    const id = randomUuidForKanban();
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO kanban_comments (id, task_id, author, body, created_at)
      VALUES (@id, @task_id, @author, @body, @created_at)
    `).run({ id, task_id: taskId, author, body, created_at: now });
    this.recordKanbanEvent({ taskId, kind: "comment_added", fromStatus: null, toStatus: null, actor: author, payload: { commentId: id } });
    return rowToKanbanComment(this.db.prepare("SELECT * FROM kanban_comments WHERE id = ?").get(id) as KanbanCommentRow);
  }

  listKanbanComments(taskId: string): KanbanCommentRecord[] {
    const rows = this.db.prepare(
      "SELECT * FROM kanban_comments WHERE task_id = ? ORDER BY created_at ASC",
    ).all(taskId) as KanbanCommentRow[];
    return rows.map(rowToKanbanComment);
  }

  listKanbanEvents(taskId: string, limit = 200): KanbanEventRecord[] {
    const rows = this.db.prepare(
      "SELECT * FROM kanban_events WHERE task_id = ? ORDER BY recorded_at ASC LIMIT ?",
    ).all(taskId, Math.min(limit, 1000)) as KanbanEventRow[];
    return rows.map(rowToKanbanEvent);
  }

  getKanbanBoard(): KanbanBoard {
    const board: KanbanBoard = {
      triage: [],
      todo: [],
      ready: [],
      in_progress: [],
      blocked: [],
      done: [],
      cancelled: [],
    };
    for (const task of this.listKanbanTasks({ limit: 1000 })) {
      board[task.status].push(task);
    }
    return board;
  }

  runKanbanDispatcher(options: KanbanDispatcherOptions = {}): DispatcherTickResult {
    const claimTtlMs = options.claimTtlMs ?? DEFAULT_CLAIM_TTL_MS;
    const threshold = options.autoBlockThreshold ?? DEFAULT_AUTO_BLOCK_THRESHOLD;
    const now = Date.now();
    const reclaimed: string[] = [];
    const promoted: string[] = [];
    const autoBlocked: string[] = [];

    const reclaimRows = this.db.prepare(
      "SELECT id FROM kanban_tasks WHERE status = 'in_progress' AND claim_expires_at IS NOT NULL AND claim_expires_at <= ?",
    ).all(now) as { id: string }[];
    for (const row of reclaimRows) {
      this.failKanbanTask(row.id, `claim_expired_after_${claimTtlMs}ms`, "dispatcher");
      reclaimed.push(row.id);
    }

    const triageRows = this.db.prepare(
      "SELECT id, depends_on_ids FROM kanban_tasks WHERE status = 'triage'",
    ).all() as Array<{ id: string; depends_on_ids: string }>;
    for (const row of triageRows) {
      const deps = parseJsonField<string[]>(row.depends_on_ids) ?? [];
      if (deps.length === 0) {
        this.transitionStatus(row.id, "triage", "todo", "dispatcher", "no_deps");
        promoted.push(row.id);
        continue;
      }
      const placeholders = deps.map(() => "?").join(",");
      const countRow = this.db.prepare(
        `SELECT COUNT(*) AS n FROM kanban_tasks WHERE id IN (${placeholders}) AND status = 'done'`,
      ).get(...deps) as { n: number };
      if (countRow.n === deps.length) {
        this.transitionStatus(row.id, "triage", "todo", "dispatcher", "deps_resolved");
        promoted.push(row.id);
      }
    }

    const todoRows = this.db.prepare(
      "SELECT id, depends_on_ids FROM kanban_tasks WHERE status = 'todo'",
    ).all() as Array<{ id: string; depends_on_ids: string }>;
    for (const row of todoRows) {
      const deps = parseJsonField<string[]>(row.depends_on_ids) ?? [];
      if (deps.length === 0) {
        this.transitionStatus(row.id, "todo", "ready", "dispatcher", "no_deps");
        promoted.push(row.id);
        continue;
      }
      const placeholders = deps.map(() => "?").join(",");
      const countRow = this.db.prepare(
        `SELECT COUNT(*) AS n FROM kanban_tasks WHERE id IN (${placeholders}) AND status = 'done'`,
      ).get(...deps) as { n: number };
      if (countRow.n === deps.length) {
        this.transitionStatus(row.id, "todo", "ready", "dispatcher", "deps_resolved");
        promoted.push(row.id);
      }
    }

    const failedRows = this.db.prepare(
      "SELECT id FROM kanban_tasks WHERE failure_count >= ? AND status NOT IN ('blocked','done','cancelled')",
    ).all(threshold) as { id: string }[];
    for (const row of failedRows) {
      this.blockKanbanTask(row.id, `auto_blocked_after_${threshold}_failures`, "dispatcher");
      autoBlocked.push(row.id);
    }

    return { reclaimedIds: reclaimed, promotedIds: promoted, autoBlockedIds: autoBlocked, ranAt: now };
  }

  private transitionStatus(taskId: string, from: KanbanStatus, to: KanbanStatus, actor: string, reason: string): void {
    const now = Date.now();
    this.db.prepare("UPDATE kanban_tasks SET status = ?, updated_at = ? WHERE id = ?").run(to, now, taskId);
    this.recordKanbanEvent({ taskId, kind: "transition", fromStatus: from, toStatus: to, actor, payload: { reason } });
  }
}
