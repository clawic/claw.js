import type { DB } from "../db/index.ts";
import { jsonParse, jsonStringify, now } from "../db/index.ts";
import { prefixedId } from "../../shared/ids.ts";
import type {
  EditorialStatus,
  PostBlock,
  PostSpec,
  PostVariantSpec,
  PublishStatus,
} from "../../shared/types.ts";

export interface PostRow {
  id: string;
  workspace_id: string;
  author_user_id: string | null;
  editorial_status: EditorialStatus;
  publish_status: PublishStatus;
  scheduled_at: number | null;
  published_at: number | null;
  idempotency_key: string | null;
  campaign_id: string | null;
  template_id: string | null;
  bulk_import_batch_id: string | null;
  recurrence_id: string | null;
  parent_post_id: string | null;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface PostVariantRow {
  id: string;
  post_id: string;
  channel_account_id: string | null;
  is_original: boolean;
  locale: string | null;
  blocks: PostBlock[];
  options: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface PostAccountRow {
  post_id: string;
  channel_account_id: string;
  provider_post_id: string | null;
  provider_data: Record<string, unknown>;
  errors: Array<{ ts: number; code: string; message: string; retry_after?: number }>;
  attempt_count: number;
  last_attempt_at: number | null;
  publish_state: "pending" | "dispatched" | "publishing" | "published" | "failed" | "skipped";
  dispatched_at: number | null;
}

function parseScheduledAt(spec: PostSpec["schedule"]): { scheduledAt: number | null; publishStatus: PublishStatus; queueId: string | null } {
  if (!spec || spec.kind === "unscheduled") {
    return { scheduledAt: null, publishStatus: "unscheduled", queueId: null };
  }
  if (spec.kind === "datetime") {
    const ts = Date.parse(spec.at);
    if (Number.isNaN(ts)) throw new Error(`invalid schedule.at: ${spec.at}`);
    return { scheduledAt: ts, publishStatus: "scheduled", queueId: null };
  }
  if (spec.kind === "now") {
    return { scheduledAt: now(), publishStatus: "scheduled", queueId: null };
  }
  if (spec.kind === "queue") {
    return { scheduledAt: null, publishStatus: "queued", queueId: spec.queue_id };
  }
  return { scheduledAt: null, publishStatus: "unscheduled", queueId: null };
}

export class PostsService {
  constructor(private readonly db: DB) {}

  create(workspaceId: string, authorUserId: string | null, spec: PostSpec): PostRow {
    if (spec.idempotency_key) {
      const existing = this.db
        .prepare(`SELECT id FROM post WHERE workspace_id = ? AND idempotency_key = ?`)
        .get(workspaceId, spec.idempotency_key) as { id: string } | undefined;
      if (existing) return this.get(workspaceId, existing.id)!;
    }
    const id = prefixedId("post");
    const ts = now();
    const { scheduledAt, publishStatus, queueId } = parseScheduledAt(spec.schedule);
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO post (id, workspace_id, author_user_id, editorial_status, publish_status, scheduled_at,
             idempotency_key, campaign_id, template_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          workspaceId,
          authorUserId,
          spec.editorial_status ?? "drafting",
          publishStatus,
          scheduledAt,
          spec.idempotency_key ?? null,
          spec.campaign_id ?? null,
          spec.template_id ?? null,
          ts,
          ts,
        );

      for (const accountId of spec.accounts) {
        this.db
          .prepare(
            `INSERT INTO post_account (post_id, channel_account_id) VALUES (?, ?)`,
          )
          .run(id, accountId);
      }

      this.writeVariants(id, spec.variants);

      if (spec.labels) {
        for (const labelId of spec.labels) {
          this.db.prepare(`INSERT OR IGNORE INTO post_label_pivot (post_id, label_id) VALUES (?, ?)`).run(id, labelId);
        }
      }

      this.recordActivity(id, authorUserId, "created", { spec_keys: Object.keys(spec) });

      if (queueId) {
        this.db
          .prepare(
            `INSERT INTO queue_entry (id, queue_id, post_id, position, state) VALUES (?, ?, ?, 0, 'pending')`,
          )
          .run(prefixedId("qe"), queueId, id);
      }
    })();
    return this.get(workspaceId, id)!;
  }

  writeVariants(postId: string, variants: PostVariantSpec[]) {
    this.db.prepare(`DELETE FROM post_variant WHERE post_id = ?`).run(postId);
    for (const v of variants) {
      const vid = prefixedId("var");
      this.db
        .prepare(
          `INSERT INTO post_variant (id, post_id, channel_account_id, is_original, locale, blocks, options, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          vid,
          postId,
          v.channel_account_id ?? null,
          v.is_original ? 1 : 0,
          v.locale ?? null,
          jsonStringify(v.blocks),
          jsonStringify(v.options ?? {}),
          jsonStringify(v.metadata ?? {}),
        );
    }
  }

  variantFor(postId: string, channelAccountId: string): PostVariantRow {
    const rows = this.listVariants(postId);
    return (
      rows.find((v) => v.channel_account_id === channelAccountId) ??
      rows.find((v) => v.is_original) ??
      rows[0]
    );
  }

  listVariants(postId: string): PostVariantRow[] {
    const rows = this.db
      .prepare(
        `SELECT id, post_id, channel_account_id, is_original, locale, blocks, options, metadata
         FROM post_variant WHERE post_id = ?`,
      )
      .all(postId) as Array<Record<string, unknown>>;
    return rows.map(rowToVariant);
  }

  setVariant(postId: string, channelAccountId: string | null, variant: PostVariantSpec): void {
    if (channelAccountId === null) {
      this.db.prepare(`DELETE FROM post_variant WHERE post_id = ? AND is_original = 1`).run(postId);
    } else {
      this.db
        .prepare(`DELETE FROM post_variant WHERE post_id = ? AND channel_account_id = ?`)
        .run(postId, channelAccountId);
    }
    const vid = prefixedId("var");
    this.db
      .prepare(
        `INSERT INTO post_variant (id, post_id, channel_account_id, is_original, locale, blocks, options, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        vid,
        postId,
        channelAccountId,
        channelAccountId ? 0 : 1,
        variant.locale ?? null,
        jsonStringify(variant.blocks),
        jsonStringify(variant.options ?? {}),
        jsonStringify(variant.metadata ?? {}),
      );
  }

  list(workspaceId: string, filters: { status?: PublishStatus; from?: number; to?: number; limit?: number } = {}): PostRow[] {
    const conditions: string[] = ["workspace_id = ?"];
    const params: unknown[] = [workspaceId];
    if (filters.status) {
      conditions.push("publish_status = ?");
      params.push(filters.status);
    }
    if (filters.from) {
      conditions.push("(scheduled_at IS NULL OR scheduled_at >= ?)");
      params.push(filters.from);
    }
    if (filters.to) {
      conditions.push("(scheduled_at IS NULL OR scheduled_at <= ?)");
      params.push(filters.to);
    }
    const limit = filters.limit ?? 200;
    const rows = this.db
      .prepare(
        `SELECT * FROM post WHERE ${conditions.join(" AND ")} AND deleted_at IS NULL
         ORDER BY COALESCE(scheduled_at, created_at) DESC LIMIT ?`,
      )
      .all(...params, limit) as Array<Record<string, unknown>>;
    return rows.map(rowToPost);
  }

  get(workspaceId: string, id: string): PostRow | null {
    const row = this.db
      .prepare(`SELECT * FROM post WHERE workspace_id = ? AND id = ?`)
      .get(workspaceId, id) as Record<string, unknown> | undefined;
    return row ? rowToPost(row) : null;
  }

  update(workspaceId: string, id: string, patch: Partial<PostRow & { variants?: PostVariantSpec[]; accounts?: string[] }>): PostRow {
    const cur = this.get(workspaceId, id);
    if (!cur) throw new Error("post not found");
    const next: PostRow = { ...cur, ...patch, updated_at: now() } as PostRow;
    this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE post SET editorial_status=?, publish_status=?, scheduled_at=?, campaign_id=?, template_id=?, updated_at=? WHERE id = ?`,
        )
        .run(
          next.editorial_status,
          next.publish_status,
          next.scheduled_at,
          next.campaign_id,
          next.template_id,
          next.updated_at,
          id,
        );
      if (patch.variants) this.writeVariants(id, patch.variants);
      if (patch.accounts) {
        this.db.prepare(`DELETE FROM post_account WHERE post_id = ?`).run(id);
        for (const accountId of patch.accounts) {
          this.db
            .prepare(`INSERT INTO post_account (post_id, channel_account_id) VALUES (?, ?)`)
            .run(id, accountId);
        }
      }
    })();
    return this.get(workspaceId, id)!;
  }

  setPublishStatus(id: string, status: PublishStatus, publishedAt?: number): void {
    if (publishedAt !== undefined) {
      this.db.prepare(`UPDATE post SET publish_status = ?, published_at = ?, updated_at = ? WHERE id = ?`).run(status, publishedAt, now(), id);
    } else {
      this.db.prepare(`UPDATE post SET publish_status = ?, updated_at = ? WHERE id = ?`).run(status, now(), id);
    }
  }

  setEditorialStatus(id: string, status: EditorialStatus): void {
    this.db.prepare(`UPDATE post SET editorial_status = ?, updated_at = ? WHERE id = ?`).run(status, now(), id);
  }

  schedule(workspaceId: string, id: string, at: number): PostRow {
    this.db
      .prepare(`UPDATE post SET scheduled_at = ?, publish_status = 'scheduled', updated_at = ? WHERE id = ?`)
      .run(at, now(), id);
    return this.get(workspaceId, id)!;
  }

  unschedule(workspaceId: string, id: string): PostRow {
    this.db
      .prepare(`UPDATE post SET scheduled_at = NULL, publish_status = 'unscheduled', updated_at = ? WHERE id = ?`)
      .run(now(), id);
    return this.get(workspaceId, id)!;
  }

  cancel(workspaceId: string, id: string): PostRow {
    this.db.prepare(`UPDATE post SET publish_status = 'cancelled', updated_at = ? WHERE id = ?`).run(now(), id);
    return this.get(workspaceId, id)!;
  }

  delete(workspaceId: string, id: string): void {
    this.db.prepare(`UPDATE post SET deleted_at = ?, publish_status = 'deleted', updated_at = ? WHERE id = ?`).run(now(), now(), id);
  }

  duplicate(workspaceId: string, id: string, authorUserId: string | null): PostRow {
    const original = this.get(workspaceId, id);
    if (!original) throw new Error("post not found");
    const newId = prefixedId("post");
    const ts = now();
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO post (id, workspace_id, author_user_id, editorial_status, publish_status, parent_post_id, created_at, updated_at)
           VALUES (?, ?, ?, 'drafting', 'unscheduled', ?, ?, ?)`,
        )
        .run(newId, workspaceId, authorUserId, id, ts, ts);
      const accounts = this.db.prepare(`SELECT channel_account_id FROM post_account WHERE post_id = ?`).all(id) as Array<{ channel_account_id: string }>;
      for (const a of accounts) {
        this.db.prepare(`INSERT INTO post_account (post_id, channel_account_id) VALUES (?, ?)`).run(newId, a.channel_account_id);
      }
      const variants = this.listVariants(id).map((v) => ({
        channel_account_id: v.channel_account_id ?? undefined,
        is_original: v.is_original,
        locale: v.locale ?? undefined,
        blocks: v.blocks,
        options: v.options,
        metadata: v.metadata,
      }));
      this.writeVariants(newId, variants as PostVariantSpec[]);
      this.recordActivity(newId, authorUserId, "duplicated", { from: id });
    })();
    return this.get(workspaceId, newId)!;
  }

  listAccountsForPost(postId: string): PostAccountRow[] {
    const rows = this.db
      .prepare(
        `SELECT post_id, channel_account_id, provider_post_id, provider_data, errors, attempt_count, last_attempt_at, publish_state, dispatched_at
         FROM post_account WHERE post_id = ?`,
      )
      .all(postId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      post_id: String(r.post_id),
      channel_account_id: String(r.channel_account_id),
      provider_post_id: (r.provider_post_id as string) ?? null,
      provider_data: jsonParse<Record<string, unknown>>(r.provider_data as string, {}),
      errors: jsonParse<Array<{ ts: number; code: string; message: string; retry_after?: number }>>(r.errors as string, []),
      attempt_count: Number(r.attempt_count),
      last_attempt_at: (r.last_attempt_at as number) ?? null,
      publish_state: (r.publish_state as PostAccountRow["publish_state"]) ?? "pending",
      dispatched_at: (r.dispatched_at as number) ?? null,
    }));
  }

  setAccountState(postId: string, channelAccountId: string, patch: Partial<PostAccountRow>): void {
    const cur = this.listAccountsForPost(postId).find((a) => a.channel_account_id === channelAccountId);
    if (!cur) throw new Error("post_account not found");
    const next: PostAccountRow = { ...cur, ...patch };
    this.db
      .prepare(
        `UPDATE post_account SET provider_post_id = ?, provider_data = ?, errors = ?, attempt_count = ?, last_attempt_at = ?, publish_state = ?, dispatched_at = ?
         WHERE post_id = ? AND channel_account_id = ?`,
      )
      .run(
        next.provider_post_id,
        jsonStringify(next.provider_data),
        jsonStringify(next.errors),
        next.attempt_count,
        next.last_attempt_at,
        next.publish_state,
        next.dispatched_at,
        postId,
        channelAccountId,
      );
  }

  recordActivity(postId: string, actorUserId: string | null, event: string, payload: Record<string, unknown>): void {
    this.db
      .prepare(
        `INSERT INTO post_activity (id, post_id, actor_user_id, event, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(prefixedId("act"), postId, actorUserId, event, jsonStringify(payload), now());
  }

  activity(postId: string) {
    return this.db
      .prepare(`SELECT * FROM post_activity WHERE post_id = ? ORDER BY created_at`)
      .all(postId);
  }

  /** Posts whose scheduled_at <= cutoff and ready to dispatch. */
  dueForDispatch(cutoffMs: number): PostRow[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM post
         WHERE publish_status IN ('scheduled', 'queued')
           AND editorial_status = 'ready'
           AND deleted_at IS NULL
           AND scheduled_at IS NOT NULL AND scheduled_at <= ?
         ORDER BY scheduled_at`,
      )
      .all(cutoffMs) as Array<Record<string, unknown>>;
    return rows.map(rowToPost);
  }
}

function rowToVariant(row: Record<string, unknown>): PostVariantRow {
  return {
    id: String(row.id),
    post_id: String(row.post_id),
    channel_account_id: (row.channel_account_id as string) ?? null,
    is_original: !!row.is_original,
    locale: (row.locale as string) ?? null,
    blocks: jsonParse<PostBlock[]>(row.blocks as string, []),
    options: jsonParse<Record<string, unknown>>(row.options as string, {}),
    metadata: jsonParse<Record<string, unknown>>(row.metadata as string, {}),
  };
}

function rowToPost(row: Record<string, unknown>): PostRow {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    author_user_id: (row.author_user_id as string) ?? null,
    editorial_status: row.editorial_status as EditorialStatus,
    publish_status: row.publish_status as PublishStatus,
    scheduled_at: (row.scheduled_at as number) ?? null,
    published_at: (row.published_at as number) ?? null,
    idempotency_key: (row.idempotency_key as string) ?? null,
    campaign_id: (row.campaign_id as string) ?? null,
    template_id: (row.template_id as string) ?? null,
    bulk_import_batch_id: (row.bulk_import_batch_id as string) ?? null,
    recurrence_id: (row.recurrence_id as string) ?? null,
    parent_post_id: (row.parent_post_id as string) ?? null,
    deleted_at: (row.deleted_at as number) ?? null,
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
  };
}
