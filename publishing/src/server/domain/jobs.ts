import type { DB } from "../db/index.ts";
import { jsonParse, jsonStringify, now } from "../db/index.ts";
import { prefixedId } from "../../shared/ids.ts";

export type JobKind =
  | "publish_post_account"
  | "import_metrics"
  | "refresh_token"
  | "webhook_deliver"
  | "media_convert"
  | "recurrence_tick"
  | "queue_tick"
  | "health_probe"
  | "ab_evaluate"
  | "evergreen_tick";

export interface JobRow {
  id: string;
  workspace_id: string;
  batch_id: string | null;
  kind: JobKind;
  payload: Record<string, unknown>;
  state: "queued" | "dispatched" | "running" | "succeeded" | "failed" | "cancelled";
  attempts: number;
  max_attempts: number;
  available_at: number;
  started_at: number | null;
  finished_at: number | null;
  last_error: string | null;
  created_at: number;
}

export interface JobBatchRow {
  id: string;
  workspace_id: string;
  purpose: string;
  target_id: string | null;
  total: number;
  succeeded: number;
  failed: number;
  state: "open" | "finalized";
  finalized_at: number | null;
  created_at: number;
}

export class JobsService {
  private readonly queueChangeListeners = new Set<() => void>();

  constructor(private readonly db: DB) {}

  onQueueChange(listener: () => void): () => void {
    this.queueChangeListeners.add(listener);
    return () => this.queueChangeListeners.delete(listener);
  }

  createBatch(workspaceId: string, purpose: string, targetId: string | null): JobBatchRow {
    const id = prefixedId("jb");
    this.db
      .prepare(
        `INSERT INTO job_batch (id, workspace_id, purpose, target_id, state, created_at) VALUES (?, ?, ?, ?, 'open', ?)`,
      )
      .run(id, workspaceId, purpose, targetId, now());
    return this.getBatch(id)!;
  }

  enqueue(input: {
    workspaceId: string;
    batchId?: string | null;
    kind: JobKind;
    payload: Record<string, unknown>;
    availableAt?: number;
    maxAttempts?: number;
  }): JobRow {
    const id = prefixedId("job");
    const created = now();
    this.db
      .prepare(
        `INSERT INTO job (id, workspace_id, batch_id, kind, payload, state, attempts, max_attempts, available_at, created_at)
         VALUES (?, ?, ?, ?, ?, 'queued', 0, ?, ?, ?)`,
      )
      .run(
        id,
        input.workspaceId,
        input.batchId ?? null,
        input.kind,
        jsonStringify(input.payload),
        input.maxAttempts ?? 5,
        input.availableAt ?? created,
        created,
      );
    if (input.batchId) {
      this.db.prepare(`UPDATE job_batch SET total = total + 1 WHERE id = ?`).run(input.batchId);
    }
    const job = this.get(id)!;
    this.emitQueueChange();
    return job;
  }

  /**
   * Atomically claim the next due job for a worker. Returns null if none
   * available. Uses an UPDATE...RETURNING that flips state to 'running'.
   */
  claimNext(): JobRow | null {
    const ts = now();
    const claim = this.db.prepare(
      `UPDATE job SET state = 'running', attempts = attempts + 1, started_at = ?
       WHERE id = (
         SELECT id FROM job WHERE state = 'queued' AND available_at <= ?
         ORDER BY available_at LIMIT 1
       )
       RETURNING *`,
    );
    const row = claim.get(ts, ts) as Record<string, unknown> | undefined;
    return row ? rowToJob(row) : null;
  }

  finish(id: string, ok: boolean, error?: string | null): void {
    const cur = this.get(id);
    if (!cur) return;
    if (ok) {
      this.db.prepare(`UPDATE job SET state = 'succeeded', finished_at = ?, last_error = NULL WHERE id = ?`).run(now(), id);
      if (cur.batch_id) this.db.prepare(`UPDATE job_batch SET succeeded = succeeded + 1 WHERE id = ?`).run(cur.batch_id);
    } else {
      this.db.prepare(`UPDATE job SET state = 'failed', finished_at = ?, last_error = ? WHERE id = ?`).run(now(), error ?? null, id);
      if (cur.batch_id) this.db.prepare(`UPDATE job_batch SET failed = failed + 1 WHERE id = ?`).run(cur.batch_id);
    }
  }

  reschedule(id: string, availableAt: number, lastError?: string | null): void {
    this.db
      .prepare(`UPDATE job SET state = 'queued', available_at = ?, last_error = ? WHERE id = ?`)
      .run(availableAt, lastError ?? null, id);
    this.emitQueueChange();
  }

  cancel(id: string): void {
    this.db.prepare(`UPDATE job SET state = 'cancelled', finished_at = ? WHERE id = ?`).run(now(), id);
  }

  get(id: string): JobRow | null {
    const row = this.db.prepare(`SELECT * FROM job WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    return row ? rowToJob(row) : null;
  }

  getBatch(id: string): JobBatchRow | null {
    const row = this.db.prepare(`SELECT * FROM job_batch WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    return row ? rowToBatch(row) : null;
  }

  list(workspaceId: string, filters: { state?: JobRow["state"]; limit?: number } = {}) {
    const conditions: string[] = ["workspace_id = ?"];
    const params: unknown[] = [workspaceId];
    if (filters.state) { conditions.push("state = ?"); params.push(filters.state); }
    return this.db.prepare(`SELECT * FROM job WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT ?`).all(...params, filters.limit ?? 100);
  }

  isBatchFinished(batchId: string): boolean {
    const row = this.getBatch(batchId);
    if (!row) return false;
    return row.total > 0 && row.succeeded + row.failed >= row.total;
  }

  finalizeBatch(batchId: string): void {
    this.db.prepare(`UPDATE job_batch SET state = 'finalized', finalized_at = ? WHERE id = ?`).run(now(), batchId);
  }

  metrics(): { queued: number; running: number; oldestQueuedAt: number | null; lastSchedulerTick: number | null } {
    const queued = (this.db.prepare(`SELECT COUNT(*) as c FROM job WHERE state = 'queued'`).get() as { c: number }).c;
    const running = (this.db.prepare(`SELECT COUNT(*) as c FROM job WHERE state = 'running'`).get() as { c: number }).c;
    const oldest = this.db.prepare(`SELECT MIN(available_at) as t FROM job WHERE state = 'queued'`).get() as { t: number | null };
    return { queued, running, oldestQueuedAt: oldest.t ?? null, lastSchedulerTick: null };
  }

  nextQueuedAt(): number | null {
    const row = this.db.prepare(`SELECT MIN(available_at) as t FROM job WHERE state = 'queued'`).get() as { t: number | null };
    return row.t ?? null;
  }

  private emitQueueChange(): void {
    for (const listener of this.queueChangeListeners) listener();
  }
}

function rowToJob(row: Record<string, unknown>): JobRow {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    batch_id: (row.batch_id as string) ?? null,
    kind: row.kind as JobKind,
    payload: jsonParse<Record<string, unknown>>(row.payload as string, {}),
    state: row.state as JobRow["state"],
    attempts: Number(row.attempts),
    max_attempts: Number(row.max_attempts),
    available_at: Number(row.available_at),
    started_at: (row.started_at as number) ?? null,
    finished_at: (row.finished_at as number) ?? null,
    last_error: (row.last_error as string) ?? null,
    created_at: Number(row.created_at),
  };
}

function rowToBatch(row: Record<string, unknown>): JobBatchRow {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    purpose: String(row.purpose),
    target_id: (row.target_id as string) ?? null,
    total: Number(row.total),
    succeeded: Number(row.succeeded),
    failed: Number(row.failed),
    state: row.state as JobBatchRow["state"],
    finalized_at: (row.finalized_at as number) ?? null,
    created_at: Number(row.created_at),
  };
}
