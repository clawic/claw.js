import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import Database from "better-sqlite3";

import type {
  DistillationRecord,
  NudgeRecord,
  RuntimeJobKind,
  RuntimeJobRecord,
  RuntimeJobStatus,
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
    status        TEXT NOT NULL CHECK (status IN ('pending','running','completed','failed')),
    started_at    INTEGER NOT NULL,
    completed_at  INTEGER,
    error         TEXT,
    payload_json  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_jobs_kind_started ON runtime_jobs(kind, started_at DESC);
  CREATE INDEX IF NOT EXISTS idx_jobs_status       ON runtime_jobs(status, started_at DESC);
`;

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
    return rowToJob(this.db.prepare("SELECT * FROM runtime_jobs WHERE id = ?").get(id) as JobRow);
  }

  finishJob(id: string, success: boolean, error: string | null = null): RuntimeJobRecord | null {
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
    return row ? rowToJob(row) : null;
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
}
