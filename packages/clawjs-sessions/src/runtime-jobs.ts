import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import Database from "better-sqlite3";

import { importCodexSessionsDir } from "./adapters/codex.ts";
import { SessionsServiceStore } from "./store.ts";
import type {
  ClaimSessionsRuntimeJobsInput,
  EnqueueSessionsRuntimeJobInput,
  ApplySessionsRuntimeRetentionInput,
  ApplySessionsRuntimeRetentionResult,
  RunSessionsRuntimeJobsInput,
  RunSessionsRuntimeJobsResult,
  SessionsRuntimeDiagnosticBundleRecord,
  SessionsRuntimeEventRecord,
  SessionsRuntimeJobRecord,
  SessionsRuntimeLogRecord,
  SessionsRuntimeSessionChangedEvent,
  SessionsRuntimeJobStatus,
} from "./types.ts";

// @clawjs-persistent-surface-ddl-source
const RUNTIME_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS runtime_jobs (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    claim_owner TEXT,
    run_at TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS runtime_jobs_status_idx ON runtime_jobs(status, run_at, updated_at DESC);
  CREATE TABLE IF NOT EXISTS runtime_events (
    id TEXT PRIMARY KEY,
    job_id TEXT,
    session_id TEXT,
    kind TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'info',
    target TEXT,
    subsystem TEXT,
    message TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    pinned INTEGER NOT NULL DEFAULT 0,
    diagnostic_bundle_id TEXT,
    redacted INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS runtime_events_job_idx ON runtime_events(job_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS runtime_events_session_idx ON runtime_events(session_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS runtime_events_target_idx ON runtime_events(target, subsystem, created_at DESC);
  CREATE INDEX IF NOT EXISTS runtime_events_retention_idx ON runtime_events(pinned, created_at);

  CREATE TABLE IF NOT EXISTS runtime_logs (
    id TEXT PRIMARY KEY,
    job_id TEXT,
    session_id TEXT,
    level TEXT NOT NULL DEFAULT 'info',
    target TEXT,
    subsystem TEXT,
    message TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    pinned INTEGER NOT NULL DEFAULT 0,
    diagnostic_bundle_id TEXT,
    redacted INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS runtime_logs_session_idx ON runtime_logs(session_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS runtime_logs_target_idx ON runtime_logs(target, subsystem, created_at DESC);
  CREATE INDEX IF NOT EXISTS runtime_logs_retention_idx ON runtime_logs(pinned, created_at);

  CREATE TABLE IF NOT EXISTS diagnostic_bundles (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    session_id TEXT,
    target TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS diagnostic_bundles_session_idx ON diagnostic_bundles(session_id, updated_at DESC);
`;

interface RuntimeJobRow {
  id: string;
  kind: string;
  title: string;
  resource_id: string | null;
  status: SessionsRuntimeJobStatus;
  priority: number | null;
  claim_owner: string | null;
  run_at: string | null;
  scheduled_at: string | null;
  leased_until: string | null;
  attempts: number;
  max_attempts: number | null;
  payload_json: string;
  error: string | null;
  created_at: string;
  updated_at: string;
}

interface RuntimeEventRow {
  id: string;
  job_id: string | null;
  session_id: string | null;
  kind: string;
  level: string;
  target: string | null;
  subsystem: string | null;
  message: string;
  created_at: string;
  metadata_json: string;
  pinned: number;
  diagnostic_bundle_id: string | null;
  redacted: number;
}

interface RuntimeLogRow {
  id: string;
  job_id: string | null;
  session_id: string | null;
  level: string;
  target: string | null;
  subsystem: string | null;
  message: string;
  created_at: string;
  metadata_json: string;
  pinned: number;
  diagnostic_bundle_id: string | null;
  redacted: number;
}

interface DiagnosticBundleRow {
  id: string;
  title: string;
  status: "open" | "sealed";
  session_id: string | null;
  target: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

export class SessionsRuntimeJobStore {
  private readonly db: Database.Database;

  constructor(runtimeDbPath: string) {
    fs.mkdirSync(path.dirname(runtimeDbPath), { recursive: true });
    this.db = new Database(runtimeDbPath);
    this.db.pragma("journal_mode = WAL");
    this.ensureSchema();
  }

  close(): void {
    this.db.close();
  }

  enqueueJob(input: EnqueueSessionsRuntimeJobInput): SessionsRuntimeJobRecord {
    const now = new Date().toISOString();
    const id = input.id ?? `${input.kind}:${input.resourceId ?? randomUUID()}`;
    const title = input.title ?? titleForJob(input.kind, input.resourceId);
    const scheduledAt = input.scheduledAt ?? input.runAt ?? now;
    this.db.prepare(`
      INSERT INTO runtime_jobs (
        id, kind, title, resource_id, status, claim_owner, run_at, scheduled_at,
        leased_until, attempts, max_attempts, priority, payload_json, error, created_at, updated_at
      ) VALUES (
        @id, @kind, @title, @resource_id, 'queued', NULL, @run_at, @scheduled_at,
        NULL, 0, @max_attempts, @priority, @payload_json, NULL, @created_at, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        kind=excluded.kind,
        title=excluded.title,
        resource_id=excluded.resource_id,
        status='queued',
        claim_owner=NULL,
        run_at=excluded.run_at,
        scheduled_at=excluded.scheduled_at,
        leased_until=NULL,
        max_attempts=excluded.max_attempts,
        priority=excluded.priority,
        payload_json=excluded.payload_json,
        error=NULL,
        updated_at=excluded.updated_at
    `).run({
      id,
      kind: input.kind,
      title,
      resource_id: input.resourceId ?? null,
      run_at: scheduledAt,
      scheduled_at: scheduledAt,
      max_attempts: boundedInt(input.maxAttempts, 1, 50, 3),
      priority: boundedInt(input.priority, 0, 100, 0),
      payload_json: JSON.stringify(redactValue(input.payload ?? {}).value),
      created_at: now,
      updated_at: now,
    });
    this.recordEvent({ jobId: id, kind: "job.enqueued", level: "info", message: title, metadata: { jobKind: input.kind } });
    return this.getJob(id) as SessionsRuntimeJobRecord;
  }

  claimJobs(input: ClaimSessionsRuntimeJobsInput = {}): SessionsRuntimeJobRecord[] {
    const limit = boundedInt(input.limit, 1, 100, 10);
    const now = input.now ?? new Date().toISOString();
    const leaseMs = boundedInt(input.leaseMs, 1000, 60 * 60 * 1000, 30_000);
    const leasedUntil = new Date(Date.parse(now) + leaseMs).toISOString();
    const owner = input.owner ?? "sessions-runtime-worker";
    const clauses = [
      "status IN ('queued', 'leased')",
      "COALESCE(scheduled_at, run_at, created_at) <= @now",
      "(leased_until IS NULL OR leased_until <= @now)",
      "attempts < COALESCE(max_attempts, 3)",
    ];
    const params: Record<string, unknown> = { now, limit };
    if (input.kinds?.length) {
      clauses.push(`kind IN (${input.kinds.map((_, index) => `@kind_${index}`).join(", ")})`);
      input.kinds.forEach((kind, index) => { params[`kind_${index}`] = kind; });
    }
    const tx = this.db.transaction(() => {
      const rows = this.db.prepare(`
        SELECT id FROM runtime_jobs
        WHERE ${clauses.join(" AND ")}
        ORDER BY priority DESC, COALESCE(scheduled_at, run_at, created_at) ASC, created_at ASC, id ASC
        LIMIT @limit
      `).all(params) as Array<{ id: string }>;
      const lease = this.db.prepare(`
        UPDATE runtime_jobs
        SET status='leased', claim_owner=?, leased_until=?, attempts=attempts + 1, updated_at=?
        WHERE id=?
      `);
      for (const row of rows) {
        lease.run(owner, leasedUntil, now, row.id);
        this.recordEvent({ jobId: row.id, kind: "job.leased", level: "info", message: owner, createdAt: now, metadata: { leasedUntil } });
      }
      return rows.map((row) => this.getJob(row.id)).filter((job): job is SessionsRuntimeJobRecord => Boolean(job));
    });
    return tx();
  }

  completeJob(id: string, result: unknown = {}, updatedAt = new Date().toISOString()): SessionsRuntimeJobRecord | null {
    this.db.prepare(`
      UPDATE runtime_jobs
      SET status='done', leased_until=NULL, error=NULL, updated_at=?
      WHERE id=?
    `).run(updatedAt, id);
    this.recordEvent({ jobId: id, kind: "job.done", level: "info", message: "done", createdAt: updatedAt, metadata: { result } });
    return this.getJob(id);
  }

  failJob(id: string, input: { error: string; retry?: boolean; scheduledAt?: string; updatedAt?: string }): SessionsRuntimeJobRecord | null {
    const updatedAt = input.updatedAt ?? new Date().toISOString();
    const row = this.db.prepare("SELECT attempts, max_attempts FROM runtime_jobs WHERE id = ?").get(id) as { attempts: number; max_attempts: number | null } | undefined;
    const maxAttempts = row?.max_attempts ?? 3;
    const retry = input.retry === true && (row?.attempts ?? maxAttempts) < maxAttempts;
    const error = redactString(input.error).value;
    this.db.prepare(`
      UPDATE runtime_jobs
      SET status=?, leased_until=NULL, error=?, scheduled_at=COALESCE(?, scheduled_at), run_at=COALESCE(?, run_at), updated_at=?
      WHERE id=?
    `).run(retry ? "queued" : "failed", error, input.scheduledAt ?? null, input.scheduledAt ?? null, updatedAt, id);
    this.recordEvent({ jobId: id, kind: retry ? "job.retry" : "job.failed", level: retry ? "warn" : "error", message: error, createdAt: updatedAt });
    return this.getJob(id);
  }

  cancelJob(id: string, updatedAt = new Date().toISOString()): SessionsRuntimeJobRecord | null {
    this.db.prepare("UPDATE runtime_jobs SET status='cancelled', leased_until=NULL, updated_at=? WHERE id=?").run(updatedAt, id);
    this.recordEvent({ jobId: id, kind: "job.cancelled", level: "warn", message: "cancelled", createdAt: updatedAt });
    return this.getJob(id);
  }

  getJob(id: string): SessionsRuntimeJobRecord | null {
    const row = this.db.prepare("SELECT * FROM runtime_jobs WHERE id = ?").get(id) as RuntimeJobRow | undefined;
    return row ? rowToJob(row) : null;
  }

  listJobs(input: { status?: SessionsRuntimeJobStatus; kind?: string; limit?: number } = {}): SessionsRuntimeJobRecord[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (input.status) { clauses.push("status = ?"); params.push(input.status); }
    if (input.kind) { clauses.push("kind = ?"); params.push(input.kind); }
    const limit = boundedInt(input.limit, 1, 500, 100);
    const rows = this.db.prepare(`
      SELECT * FROM runtime_jobs
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY priority DESC, COALESCE(scheduled_at, run_at, created_at) ASC, created_at ASC
      LIMIT ?
    `).all(...params, limit) as RuntimeJobRow[];
    return rows.map(rowToJob);
  }

  listEvents(input: { jobId?: string; sessionId?: string; target?: string; subsystem?: string; pinned?: boolean; limit?: number } = {}): SessionsRuntimeEventRecord[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (input.jobId) { clauses.push("job_id = ?"); params.push(input.jobId); }
    if (input.sessionId) { clauses.push("session_id = ?"); params.push(input.sessionId); }
    if (input.target) { clauses.push("target = ?"); params.push(input.target); }
    if (input.subsystem) { clauses.push("subsystem = ?"); params.push(input.subsystem); }
    if (input.pinned !== undefined) { clauses.push("pinned = ?"); params.push(input.pinned ? 1 : 0); }
    const limit = boundedInt(input.limit, 1, 1000, 100);
    const rows = this.db.prepare(`
      SELECT * FROM runtime_events
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(...params, limit) as RuntimeEventRow[];
    return rows.map(rowToEvent);
  }

  listLogs(input: { jobId?: string; sessionId?: string; target?: string; subsystem?: string; pinned?: boolean; limit?: number } = {}): SessionsRuntimeLogRecord[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (input.jobId) { clauses.push("job_id = ?"); params.push(input.jobId); }
    if (input.sessionId) { clauses.push("session_id = ?"); params.push(input.sessionId); }
    if (input.target) { clauses.push("target = ?"); params.push(input.target); }
    if (input.subsystem) { clauses.push("subsystem = ?"); params.push(input.subsystem); }
    if (input.pinned !== undefined) { clauses.push("pinned = ?"); params.push(input.pinned ? 1 : 0); }
    const limit = boundedInt(input.limit, 1, 1000, 100);
    const rows = this.db.prepare(`
      SELECT * FROM runtime_logs
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(...params, limit) as RuntimeLogRow[];
    return rows.map(rowToLog);
  }

  recordEvent(input: { jobId?: string | null; sessionId?: string | null; kind: string; level?: string; target?: string | null; subsystem?: string | null; message?: string; metadata?: Record<string, unknown>; createdAt?: string; pinned?: boolean; diagnosticBundleId?: string | null }): void {
    const createdAt = input.createdAt ?? new Date().toISOString();
    const message = redactString(input.message ?? "");
    const metadata = redactValue(input.metadata ?? {});
    this.db.prepare(`
      INSERT INTO runtime_events (
        id, job_id, session_id, kind, level, target, subsystem, message, created_at,
        metadata_json, pinned, diagnostic_bundle_id, redacted
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `event-${randomUUID()}`,
      input.jobId ?? null,
      input.sessionId ?? null,
      input.kind,
      input.level ?? "info",
      input.target ?? null,
      input.subsystem ?? null,
      message.value,
      createdAt,
      JSON.stringify(metadata.value),
      input.pinned ? 1 : 0,
      input.diagnosticBundleId ?? null,
      message.redacted || metadata.redacted ? 1 : 0,
    );
  }

  recordLog(input: { jobId?: string | null; sessionId?: string | null; level?: string; target?: string | null; subsystem?: string | null; message?: string; metadata?: Record<string, unknown>; createdAt?: string; pinned?: boolean; diagnosticBundleId?: string | null }): SessionsRuntimeLogRecord {
    const createdAt = input.createdAt ?? new Date().toISOString();
    const id = `log-${randomUUID()}`;
    const message = redactString(input.message ?? "");
    const metadata = redactValue(input.metadata ?? {});
    this.db.prepare(`
      INSERT INTO runtime_logs (
        id, job_id, session_id, level, target, subsystem, message, created_at,
        metadata_json, pinned, diagnostic_bundle_id, redacted
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.jobId ?? null,
      input.sessionId ?? null,
      input.level ?? "info",
      input.target ?? null,
      input.subsystem ?? null,
      message.value,
      createdAt,
      JSON.stringify(metadata.value),
      input.pinned ? 1 : 0,
      input.diagnosticBundleId ?? null,
      message.redacted || metadata.redacted ? 1 : 0,
    );
    return this.listLogs({ limit: 1 })[0] as SessionsRuntimeLogRecord;
  }

  createDiagnosticBundle(input: { id?: string; title: string; sessionId?: string | null; target?: string | null; metadata?: Record<string, unknown>; createdAt?: string }): SessionsRuntimeDiagnosticBundleRecord {
    const now = input.createdAt ?? new Date().toISOString();
    const id = input.id ?? `diagnostic-${randomUUID()}`;
    const metadata = redactValue(input.metadata ?? {});
    this.db.prepare(`
      INSERT INTO diagnostic_bundles (id, title, status, session_id, target, metadata_json, created_at, updated_at)
      VALUES (?, ?, 'open', ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title=excluded.title,
        session_id=excluded.session_id,
        target=excluded.target,
        metadata_json=excluded.metadata_json,
        updated_at=excluded.updated_at
    `).run(id, redactString(input.title).value, input.sessionId ?? null, input.target ?? null, JSON.stringify(metadata.value), now, now);
    const row = this.db.prepare("SELECT * FROM diagnostic_bundles WHERE id = ?").get(id) as DiagnosticBundleRow;
    return rowToDiagnosticBundle(row);
  }

  applyRetention(input: ApplySessionsRuntimeRetentionInput = {}): ApplySessionsRuntimeRetentionResult {
    const now = Date.parse(input.now ?? new Date().toISOString());
    const maxAgeDays = boundedInt(input.maxAgeDays, 1, 3650, 30);
    const cutoff = new Date(now - maxAgeDays * 24 * 60 * 60 * 1000).toISOString();
    const maxEvents = boundedInt(input.maxEvents, 1, 1_000_000, 10_000);
    const maxLogs = boundedInt(input.maxLogs, 1, 1_000_000, 10_000);
    const maxEventBytes = boundedInt(input.maxEventBytes, 1024, 1024 * 1024 * 1024, 50 * 1024 * 1024);
    const maxLogBytes = boundedInt(input.maxLogBytes, 1024, 1024 * 1024 * 1024, 50 * 1024 * 1024);
    const eventIds = retentionIds(this.db, "runtime_events", cutoff, maxEvents, maxEventBytes);
    const logIds = retentionIds(this.db, "runtime_logs", cutoff, maxLogs, maxLogBytes);
    const jobIds = (this.db.prepare("SELECT id FROM runtime_jobs WHERE updated_at < ? AND status IN ('done','failed','cancelled')").all(cutoff) as Array<{ id: string }>).map((row) => row.id);
    if (input.dryRun !== true) {
      deleteByIds(this.db, "runtime_events", eventIds);
      deleteByIds(this.db, "runtime_logs", logIds);
      deleteByIds(this.db, "runtime_jobs", jobIds);
    }
    return {
      cutoff,
      dryRun: input.dryRun === true,
      deleted: { events: eventIds.length, logs: logIds.length, jobs: jobIds.length },
      retained: {
        events: countRows(this.db, "runtime_events") - (input.dryRun === true ? 0 : 0),
        logs: countRows(this.db, "runtime_logs") - (input.dryRun === true ? 0 : 0),
        jobs: countRows(this.db, "runtime_jobs") - (input.dryRun === true ? 0 : 0),
      },
    };
  }

  private ensureSchema(): void {
    this.db.exec(RUNTIME_SCHEMA_SQL);
    this.ensureColumn("runtime_jobs", "resource_id", "TEXT");
    this.ensureColumn("runtime_jobs", "priority", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("runtime_jobs", "scheduled_at", "TEXT");
    this.ensureColumn("runtime_jobs", "leased_until", "TEXT");
    this.ensureColumn("runtime_jobs", "max_attempts", "INTEGER NOT NULL DEFAULT 3");
    this.ensureColumn("runtime_jobs", "error", "TEXT");
    this.ensureColumn("runtime_events", "session_id", "TEXT");
    this.ensureColumn("runtime_events", "target", "TEXT");
    this.ensureColumn("runtime_events", "subsystem", "TEXT");
    this.ensureColumn("runtime_events", "pinned", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("runtime_events", "diagnostic_bundle_id", "TEXT");
    this.ensureColumn("runtime_events", "redacted", "INTEGER NOT NULL DEFAULT 0");
    this.db.prepare("CREATE INDEX IF NOT EXISTS runtime_jobs_lease_idx ON runtime_jobs(status, scheduled_at, leased_until, priority DESC)").run();
    this.db.prepare("CREATE INDEX IF NOT EXISTS runtime_events_session_idx ON runtime_events(session_id, created_at DESC)").run();
    this.db.prepare("CREATE INDEX IF NOT EXISTS runtime_events_target_idx ON runtime_events(target, subsystem, created_at DESC)").run();
    this.db.prepare("CREATE INDEX IF NOT EXISTS runtime_events_retention_idx ON runtime_events(pinned, created_at)").run();
    this.db.prepare("UPDATE runtime_jobs SET scheduled_at = COALESCE(scheduled_at, run_at, created_at), max_attempts = COALESCE(max_attempts, 3), priority = COALESCE(priority, 0)").run();
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const rows = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (rows.some((row) => row.name === column)) return;
    this.db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
}

export async function runSessionsRuntimeJobs(input: RunSessionsRuntimeJobsInput): Promise<RunSessionsRuntimeJobsResult> {
  const runtimeStore = new SessionsRuntimeJobStore(input.runtimeDbPath);
  const sessionsStore = new SessionsServiceStore(input.sessionsDbPath);
  const started = performance.now();
  const maxJobs = boundedInt(input.maxJobs, 1, 100, 10);
  const maxRuntimeMs = boundedInt(input.maxRuntimeMs, 1, 10 * 60 * 1000, 30_000);
  const maxFailures = boundedInt(input.maxFailures, 1, 100, 10);
  const items: RunSessionsRuntimeJobsResult["items"] = [];
  let completed = 0;
  let failed = 0;
  let claimed = 0;
  let stopReason: RunSessionsRuntimeJobsResult["stopReason"] = "drained";
  try {
    while (claimed < maxJobs) {
      if (performance.now() - started >= maxRuntimeMs) {
        stopReason = "max_runtime_ms";
        break;
      }
      if (failed >= maxFailures) {
        stopReason = "max_failures";
        break;
      }
      const [job] = runtimeStore.claimJobs({
        limit: 1,
        now: input.now,
        leaseMs: input.leaseMs,
        owner: input.owner,
        kinds: ["sessions.import_codex", "sessions.rebuild_projection", "sessions.rebuild_projections", "sessions.extract_memory_base"],
      });
      if (!job) break;
      claimed += 1;
      try {
        const result = await runOneSessionsJob(job, sessionsStore, input.codexSessionsDir);
        if (input.onSessionChanged) {
          for (const event of sessionChangedEventsForJob(job, result)) {
            await input.onSessionChanged(event);
          }
        }
        runtimeStore.completeJob(job.id, result);
        completed += 1;
        items.push({ id: job.id, kind: job.kind, status: "done", result });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const retryAt = new Date(Date.now() + Math.min(60_000, Math.max(1, job.attempts) * 1000)).toISOString();
        const failedJob = runtimeStore.failJob(job.id, { error: message, retry: true, scheduledAt: retryAt });
        failed += 1;
        items.push({ id: job.id, kind: job.kind, status: failedJob?.status ?? "failed", error: message });
      }
    }
    if (claimed >= maxJobs) stopReason = "max_jobs";
    return { claimed, completed, failed, stopReason, items };
  } finally {
    sessionsStore.close();
    runtimeStore.close();
  }
}

function sessionChangedEventsForJob(job: SessionsRuntimeJobRecord, result: unknown): SessionsRuntimeSessionChangedEvent[] {
  if (job.kind === "sessions.rebuild_projection") {
    const payload = payloadRecord(job.payloadJson);
    const sessionId = job.resourceId ?? (typeof payload.sessionId === "string" ? payload.sessionId : null);
    return sessionId ? [{ sessionId, jobId: job.id, jobKind: job.kind, reason: "rebuild_projection" }] : [];
  }
  if (job.kind === "sessions.rebuild_projections") {
    return payloadStringArray(result, "sessionIds").map((sessionId) => ({
      sessionId,
      jobId: job.id,
      jobKind: job.kind,
      reason: "rebuild_projection",
    }));
  }
  if (job.kind === "sessions.extract_memory_base") {
    return payloadStringArray(result, "sessionIds").map((sessionId) => ({
      sessionId,
      jobId: job.id,
      jobKind: job.kind,
      reason: "memory_extract",
    }));
  }
  if (job.kind !== "sessions.import_codex") return [];
  const imported = payloadRecordArray(result, "imported");
  const sessionIds = new Set<string>();
  for (const item of imported) {
    if (item.skipped === true) continue;
    if (typeof item.sessionId === "string" && item.sessionId) sessionIds.add(item.sessionId);
  }
  return [...sessionIds].map((sessionId) => ({
    sessionId,
    jobId: job.id,
    jobKind: job.kind,
    reason: "import_codex",
  }));
}

function payloadRecordArray(value: unknown, key: string): Record<string, unknown>[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
  const maybeArray = (value as Record<string, unknown>)[key];
  return Array.isArray(maybeArray)
    ? maybeArray.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
    : [];
}

function payloadStringArray(value: unknown, key: string): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
  const maybeArray = (value as Record<string, unknown>)[key];
  return Array.isArray(maybeArray) ? maybeArray.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

async function runOneSessionsJob(job: SessionsRuntimeJobRecord, store: SessionsServiceStore, defaultCodexSessionsDir?: string): Promise<unknown> {
  const payload = payloadRecord(job.payloadJson);
  switch (job.kind) {
    case "sessions.import_codex": {
      const dir = typeof payload.dir === "string" && payload.dir ? payload.dir : defaultCodexSessionsDir;
      if (!dir) throw new Error("sessions.import_codex requires payload.dir or codexSessionsDir");
      return importCodexSessionsDir(store, dir, {
        forceReimport: payload.forceReimport === true,
        machine: typeof payload.machine === "string" ? payload.machine : undefined,
        budgetMs: typeof payload.budgetMs === "number" ? payload.budgetMs : undefined,
        maxFiles: typeof payload.maxFiles === "number" ? payload.maxFiles : undefined,
        mode: payload.mode === "full" ? "full" : payload.mode === "incremental" ? "incremental" : undefined,
        batchSize: typeof payload.batchSize === "number" ? payload.batchSize : undefined,
      });
    }
    case "sessions.rebuild_projection": {
      const sessionId = job.resourceId ?? (typeof payload.sessionId === "string" ? payload.sessionId : null);
      if (!sessionId) throw new Error("sessions.rebuild_projection requires resourceId or payload.sessionId");
      return store.rebuildSessionProjection(sessionId);
    }
    case "sessions.rebuild_projections":
      return store.rebuildSessionProjections({
        projectId: typeof payload.projectId === "string" ? payload.projectId : undefined,
        projectPath: typeof payload.projectPath === "string" ? payload.projectPath : undefined,
        offset: typeof payload.offset === "number" ? payload.offset : undefined,
        maxSessions: typeof payload.maxSessions === "number" ? payload.maxSessions : undefined,
        budgetMs: typeof payload.budgetMs === "number" ? payload.budgetMs : undefined,
        batchSize: typeof payload.batchSize === "number" ? payload.batchSize : undefined,
      });
    case "sessions.extract_memory_base":
      return store.rebuildSessionMemoryExtracts({
        projectId: typeof payload.projectId === "string" ? payload.projectId : undefined,
        projectPath: typeof payload.projectPath === "string" ? payload.projectPath : undefined,
        offset: typeof payload.offset === "number" ? payload.offset : undefined,
        maxSessions: typeof payload.maxSessions === "number" ? payload.maxSessions : undefined,
        budgetMs: typeof payload.budgetMs === "number" ? payload.budgetMs : undefined,
      });
    default:
      throw new Error(`unsupported sessions runtime job kind: ${job.kind}`);
  }
}

function rowToJob(row: RuntimeJobRow): SessionsRuntimeJobRecord {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    resourceId: row.resource_id,
    status: row.status,
    priority: row.priority ?? 0,
    runAt: row.run_at,
    scheduledAt: row.scheduled_at ?? row.run_at ?? row.created_at,
    claimOwner: row.claim_owner,
    leasedUntil: row.leased_until,
    attempts: row.attempts,
    maxAttempts: row.max_attempts ?? 3,
    payloadJson: payloadRecord(row.payload_json),
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToEvent(row: RuntimeEventRow): SessionsRuntimeEventRecord {
  return {
    id: row.id,
    jobId: row.job_id,
    sessionId: row.session_id,
    kind: row.kind,
    level: row.level,
    target: row.target,
    subsystem: row.subsystem,
    message: row.message,
    createdAt: row.created_at,
    metadataJson: payloadRecord(row.metadata_json),
    pinned: row.pinned === 1,
    diagnosticBundleId: row.diagnostic_bundle_id,
    redacted: row.redacted === 1,
  };
}

function rowToLog(row: RuntimeLogRow): SessionsRuntimeLogRecord {
  return {
    id: row.id,
    jobId: row.job_id,
    sessionId: row.session_id,
    level: row.level,
    target: row.target,
    subsystem: row.subsystem,
    message: row.message,
    createdAt: row.created_at,
    metadataJson: payloadRecord(row.metadata_json),
    pinned: row.pinned === 1,
    diagnosticBundleId: row.diagnostic_bundle_id,
    redacted: row.redacted === 1,
  };
}

function rowToDiagnosticBundle(row: DiagnosticBundleRow): SessionsRuntimeDiagnosticBundleRecord {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    sessionId: row.session_id,
    target: row.target,
    metadataJson: payloadRecord(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function payloadRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function retentionIds(db: Database.Database, table: "runtime_events" | "runtime_logs", cutoff: string, maxRows: number, maxBytes: number): string[] {
  const rows = db.prepare(`
    SELECT id, created_at, length(message) + length(metadata_json) AS byte_size
    FROM ${table}
    WHERE pinned = 0 AND diagnostic_bundle_id IS NULL
    ORDER BY created_at ASC, id ASC
  `).all() as Array<{ id: string; created_at: string; byte_size: number | null }>;
  const deleteIds = new Set<string>();
  let retainedRows = rows.length;
  let retainedBytes = rows.reduce((sum, row) => sum + (row.byte_size ?? 0), 0);
  for (const row of rows) {
    if (row.created_at >= cutoff) continue;
    deleteIds.add(row.id);
    retainedRows -= 1;
    retainedBytes -= row.byte_size ?? 0;
  }
  for (const row of rows) {
    if (retainedRows <= maxRows && retainedBytes <= maxBytes) break;
    if (deleteIds.has(row.id)) continue;
    deleteIds.add(row.id);
    retainedRows -= 1;
    retainedBytes -= row.byte_size ?? 0;
  }
  return [...deleteIds];
}

function deleteByIds(db: Database.Database, table: "runtime_events" | "runtime_logs" | "runtime_jobs", ids: string[]): void {
  if (ids.length === 0) return;
  const statement = db.prepare(`DELETE FROM ${table} WHERE id = ?`);
  const tx = db.transaction((values: string[]) => {
    for (const id of values) statement.run(id);
  });
  tx(ids);
}

function countRows(db: Database.Database, table: "runtime_events" | "runtime_logs" | "runtime_jobs"): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

const SENSITIVE_KEY_RE = /(?:^|[_-])(api[_-]?key|authorization|bearer|credential|password|secret|token)(?:$|[_-])/i;
const SECRET_VALUE_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /(api[_-]?key|authorization|password|secret|token)=([^&\s]+)/gi,
  /(sk-[A-Za-z0-9_-]{8,})/g,
];
const REDACTED = "[REDACTED]";

function redactValue(value: unknown): { value: unknown; redacted: boolean } {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) {
    let redacted = false;
    const next = value.map((item) => {
      const result = redactValue(item);
      redacted ||= result.redacted;
      return result.value;
    });
    return { value: next, redacted };
  }
  if (typeof value === "object" && value !== null) {
    let redacted = false;
    const next: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_RE.test(key)) {
        next[key] = REDACTED;
        redacted = true;
        continue;
      }
      const result = redactValue(child);
      next[key] = result.value;
      redacted ||= result.redacted;
    }
    return { value: next, redacted };
  }
  return { value, redacted: false };
}

function redactString(value: string): { value: string; redacted: boolean } {
  let redacted = false;
  let next = value;
  for (const pattern of SECRET_VALUE_PATTERNS) {
    next = next.replace(pattern, (match, key) => {
      redacted = true;
      return typeof key === "string" && key !== match ? `${key}=${REDACTED}` : REDACTED;
    });
  }
  return { value: next, redacted };
}

function titleForJob(kind: string, resourceId: string | null | undefined): string {
  if (resourceId) return `${kind} ${resourceId}`;
  return kind;
}

function boundedInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}
