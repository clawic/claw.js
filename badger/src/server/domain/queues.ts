import type { DB } from "../db/index.ts";
import { jsonParse, jsonStringify, now } from "../db/index.ts";
import { prefixedId } from "../../shared/ids.ts";

export interface QueueRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  default_timezone: string;
  default_locale: string;
  priority: number;
  paused: boolean;
  created_at: number;
}

export interface QueueSlotRow {
  id: string;
  queue_id: string;
  day_of_week: number;
  time_of_day: string;
  enabled: boolean;
}

export interface BlackoutRow {
  id: string;
  workspace_id: string;
  channel_account_id: string | null;
  starts_at: number;
  ends_at: number;
  reason: string | null;
}

export class QueuesService {
  constructor(private readonly db: DB) {}

  create(workspaceId: string, input: {
    name: string;
    description?: string;
    default_timezone?: string;
    default_locale?: string;
    priority?: number;
  }): QueueRow {
    const id = prefixedId("q");
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO queue (id, workspace_id, name, description, default_timezone, default_locale, priority, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        workspaceId,
        input.name,
        input.description ?? null,
        input.default_timezone ?? "UTC",
        input.default_locale ?? "en",
        input.priority ?? 0,
        ts,
      );
    return this.get(workspaceId, id)!;
  }

  list(workspaceId: string): QueueRow[] {
    const rows = this.db
      .prepare(`SELECT * FROM queue WHERE workspace_id = ? ORDER BY priority DESC, created_at`)
      .all(workspaceId) as Array<Record<string, unknown>>;
    return rows.map(rowToQueue);
  }

  get(workspaceId: string, id: string): QueueRow | null {
    const row = this.db
      .prepare(`SELECT * FROM queue WHERE workspace_id = ? AND id = ?`)
      .get(workspaceId, id) as Record<string, unknown> | undefined;
    return row ? rowToQueue(row) : null;
  }

  pause(id: string): void {
    this.db.prepare(`UPDATE queue SET paused = 1 WHERE id = ?`).run(id);
  }

  resume(id: string): void {
    this.db.prepare(`UPDATE queue SET paused = 0 WHERE id = ?`).run(id);
  }

  addSlot(queueId: string, day_of_week: number, time_of_day: string): QueueSlotRow {
    const id = prefixedId("slot");
    this.db
      .prepare(`INSERT INTO queue_slot (id, queue_id, day_of_week, time_of_day, enabled) VALUES (?, ?, ?, ?, 1)`)
      .run(id, queueId, day_of_week, time_of_day);
    return { id, queue_id: queueId, day_of_week, time_of_day, enabled: true };
  }

  removeSlot(slotId: string): void {
    this.db.prepare(`DELETE FROM queue_slot WHERE id = ?`).run(slotId);
  }

  listSlots(queueId: string): QueueSlotRow[] {
    const rows = this.db
      .prepare(`SELECT * FROM queue_slot WHERE queue_id = ? ORDER BY day_of_week, time_of_day`)
      .all(queueId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      queue_id: String(r.queue_id),
      day_of_week: Number(r.day_of_week),
      time_of_day: String(r.time_of_day),
      enabled: !!r.enabled,
    }));
  }

  attachAccount(queueId: string, channelAccountId: string): void {
    this.db
      .prepare(`INSERT OR IGNORE INTO queue_account (queue_id, channel_account_id) VALUES (?, ?)`)
      .run(queueId, channelAccountId);
  }

  detachAccount(queueId: string, channelAccountId: string): void {
    this.db
      .prepare(`DELETE FROM queue_account WHERE queue_id = ? AND channel_account_id = ?`)
      .run(queueId, channelAccountId);
  }

  enqueue(queueId: string, postId: string): { id: string } {
    const id = prefixedId("qe");
    this.db
      .prepare(
        `INSERT INTO queue_entry (id, queue_id, post_id, position, state) VALUES (?, ?, ?, 0, 'pending')`,
      )
      .run(id, queueId, postId);
    return { id };
  }

  listEntries(queueId: string) {
    return this.db
      .prepare(`SELECT * FROM queue_entry WHERE queue_id = ? ORDER BY resolved_for_datetime, position`)
      .all(queueId);
  }

  /** Resolve pending entries: assign next free slot considering blackouts. */
  resolvePending(queueId: string, blackouts: BlackoutRow[]): void {
    const queue = this.db
      .prepare(`SELECT * FROM queue WHERE id = ?`)
      .get(queueId) as Record<string, unknown> | undefined;
    if (!queue || queue.paused) return;
    const slots = this.listSlots(queueId).filter((s) => s.enabled);
    if (!slots.length) return;
    const pending = this.db
      .prepare(`SELECT id, post_id FROM queue_entry WHERE queue_id = ? AND state = 'pending' ORDER BY rowid`)
      .all(queueId) as Array<{ id: string; post_id: string }>;
    if (!pending.length) return;
    const consumed = this.db
      .prepare(
        `SELECT resolved_for_datetime FROM queue_entry WHERE queue_id = ? AND state IN ('resolved','consumed') AND resolved_for_datetime IS NOT NULL`,
      )
      .all(queueId) as Array<{ resolved_for_datetime: number }>;
    const consumedSet = new Set(consumed.map((c) => c.resolved_for_datetime));
    const startFrom = now();
    for (const entry of pending) {
      const next = nextSlot(slots, consumedSet, blackouts, startFrom);
      if (!next) break;
      consumedSet.add(next);
      this.db
        .prepare(
          `UPDATE queue_entry SET resolved_for_datetime = ?, state = 'resolved' WHERE id = ?`,
        )
        .run(next, entry.id);
      this.db
        .prepare(`UPDATE post SET scheduled_at = ?, publish_status = 'scheduled' WHERE id = ?`)
        .run(next, entry.post_id);
    }
  }
}

function nextSlot(slots: QueueSlotRow[], consumed: Set<number>, blackouts: BlackoutRow[], startFrom: number): number | null {
  for (let dayOffset = 0; dayOffset < 60; dayOffset += 1) {
    const candidate = new Date(startFrom);
    candidate.setUTCDate(candidate.getUTCDate() + dayOffset);
    const dow = candidate.getUTCDay();
    const daySlots = slots.filter((s) => s.day_of_week === dow);
    for (const slot of daySlots) {
      const [hh, mm] = slot.time_of_day.split(":").map((s) => Number(s));
      const at = Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth(), candidate.getUTCDate(), hh, mm, 0);
      if (at <= startFrom) continue;
      if (consumed.has(at)) continue;
      if (blackouts.some((b) => at >= b.starts_at && at <= b.ends_at)) continue;
      return at;
    }
  }
  return null;
}

function rowToQueue(row: Record<string, unknown>): QueueRow {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    name: String(row.name),
    description: (row.description as string) ?? null,
    default_timezone: String(row.default_timezone),
    default_locale: String(row.default_locale),
    priority: Number(row.priority),
    paused: !!row.paused,
    created_at: Number(row.created_at),
  };
}

export class BlackoutsService {
  constructor(private readonly db: DB) {}

  create(workspaceId: string, input: { channel_account_id?: string | null; starts_at: number; ends_at: number; reason?: string }): BlackoutRow {
    const id = prefixedId("blk");
    this.db
      .prepare(
        `INSERT INTO blackout_window (id, workspace_id, channel_account_id, starts_at, ends_at, reason) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, workspaceId, input.channel_account_id ?? null, input.starts_at, input.ends_at, input.reason ?? null);
    return {
      id,
      workspace_id: workspaceId,
      channel_account_id: input.channel_account_id ?? null,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      reason: input.reason ?? null,
    };
  }

  list(workspaceId: string, channelAccountId?: string | null): BlackoutRow[] {
    if (channelAccountId === undefined) {
      const rows = this.db
        .prepare(`SELECT * FROM blackout_window WHERE workspace_id = ?`)
        .all(workspaceId) as Array<Record<string, unknown>>;
      return rows.map(rowToBlackout);
    }
    const rows = this.db
      .prepare(
        `SELECT * FROM blackout_window WHERE workspace_id = ? AND (channel_account_id IS ? OR channel_account_id = ?)`,
      )
      .all(workspaceId, channelAccountId ?? null, channelAccountId ?? null) as Array<Record<string, unknown>>;
    return rows.map(rowToBlackout);
  }

  remove(id: string): void {
    this.db.prepare(`DELETE FROM blackout_window WHERE id = ?`).run(id);
  }
}

function rowToBlackout(row: Record<string, unknown>): BlackoutRow {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    channel_account_id: (row.channel_account_id as string) ?? null,
    starts_at: Number(row.starts_at),
    ends_at: Number(row.ends_at),
    reason: (row.reason as string) ?? null,
  };
}
