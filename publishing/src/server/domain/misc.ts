// Compact CRUD helpers for the remaining domain entities. Each exported class
// is a thin façade over its table. Keep this file as the registry for
// "obviously row-shaped" entities; reach for a dedicated file only when an
// entity has nontrivial business logic.

import type { DB } from "../db/index.ts";
import { jsonParse, jsonStringify, now } from "../db/index.ts";
import { prefixedId } from "../../shared/ids.ts";

function parseRow<T extends Record<string, unknown>>(row: Record<string, unknown>, jsonKeys: string[] = []): T {
  const out: Record<string, unknown> = { ...row };
  for (const key of jsonKeys) {
    if (typeof out[key] === "string") out[key] = jsonParse(out[key] as string, null);
  }
  return out as T;
}

export class LabelsService {
  constructor(private readonly db: DB) {}
  create(workspaceId: string, input: { name: string; color?: string; kind?: string }) {
    const id = prefixedId("lbl");
    this.db.prepare(`INSERT INTO post_label (id, workspace_id, name, color, kind) VALUES (?, ?, ?, ?, ?)`).run(id, workspaceId, input.name, input.color ?? null, input.kind ?? "tag");
    return { id, workspace_id: workspaceId, ...input };
  }
  list(workspaceId: string) { return this.db.prepare(`SELECT * FROM post_label WHERE workspace_id = ?`).all(workspaceId); }
  remove(id: string) { this.db.prepare(`DELETE FROM post_label WHERE id = ?`).run(id); }
}

export class CampaignsService {
  constructor(private readonly db: DB) {}
  create(workspaceId: string, input: { name: string; description?: string; starts_at?: number | null; ends_at?: number | null; utm_template_id?: string | null; goals?: Record<string, unknown>; tags?: string[] }) {
    const id = prefixedId("camp");
    this.db.prepare(
      `INSERT INTO campaign (id, workspace_id, name, description, starts_at, ends_at, utm_template_id, goals, tags, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, workspaceId, input.name, input.description ?? null, input.starts_at ?? null, input.ends_at ?? null, input.utm_template_id ?? null, jsonStringify(input.goals ?? {}), jsonStringify(input.tags ?? []), now());
    return this.get(workspaceId, id)!;
  }
  list(workspaceId: string) {
    const rows = this.db.prepare(`SELECT * FROM campaign WHERE workspace_id = ?`).all(workspaceId) as Array<Record<string, unknown>>;
    return rows.map((r) => parseRow(r, ["goals", "tags"]));
  }
  get(workspaceId: string, id: string) {
    const row = this.db.prepare(`SELECT * FROM campaign WHERE workspace_id = ? AND id = ?`).get(workspaceId, id) as Record<string, unknown> | undefined;
    return row ? parseRow(row, ["goals", "tags"]) : null;
  }
  addPost(campaignId: string, postId: string) {
    this.db.prepare(`UPDATE post SET campaign_id = ? WHERE id = ?`).run(campaignId, postId);
  }
}

export class TemplatesService {
  constructor(private readonly db: DB) {}
  create(workspaceId: string, createdByUserId: string | null, input: { name: string; blocks: unknown[]; variables?: Record<string, unknown>; applicable_families?: string[] }) {
    const id = prefixedId("tmpl");
    this.db.prepare(
      `INSERT INTO template (id, workspace_id, name, blocks, variables, applicable_families, created_by_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, workspaceId, input.name, jsonStringify(input.blocks), jsonStringify(input.variables ?? {}), jsonStringify(input.applicable_families ?? []), createdByUserId, now());
    return this.get(workspaceId, id)!;
  }
  list(workspaceId: string) {
    const rows = this.db.prepare(`SELECT * FROM template WHERE workspace_id = ?`).all(workspaceId) as Array<Record<string, unknown>>;
    return rows.map((r) => parseRow(r, ["blocks", "variables", "applicable_families"]));
  }
  get(workspaceId: string, id: string) {
    const row = this.db.prepare(`SELECT * FROM template WHERE workspace_id = ? AND id = ?`).get(workspaceId, id) as Record<string, unknown> | undefined;
    return row ? parseRow(row, ["blocks", "variables", "applicable_families"]) : null;
  }
  apply(template: { blocks: unknown[]; variables: Record<string, unknown> }, vars: Record<string, string>): unknown[] {
    const json = JSON.stringify(template.blocks);
    const replaced = json.replace(/\{\{(\w+)\}\}/g, (_m, key) => {
      if (key in vars) return vars[key];
      const def = template.variables[key];
      if (def && typeof def === "object" && def !== null && "default" in def) return String((def as { default: unknown }).default ?? "");
      return "";
    });
    return JSON.parse(replaced);
  }
}

export class HashtagGroupsService {
  constructor(private readonly db: DB) {}
  create(workspaceId: string, input: { name: string; hashtags: string[]; applicable_families?: string[] | null }) {
    const id = prefixedId("htg");
    this.db.prepare(`INSERT INTO hashtag_group (id, workspace_id, name, hashtags, applicable_families) VALUES (?, ?, ?, ?, ?)`).run(id, workspaceId, input.name, jsonStringify(input.hashtags), input.applicable_families ? jsonStringify(input.applicable_families) : null);
    return { id };
  }
  list(workspaceId: string) { return this.db.prepare(`SELECT * FROM hashtag_group WHERE workspace_id = ?`).all(workspaceId); }
}

export class DynamicVariablesService {
  constructor(private readonly db: DB) {}
  upsert(workspaceId: string, input: { name: string; kind: string; value: unknown; cache_ttl_seconds?: number }) {
    const id = prefixedId("dvar");
    this.db.prepare(
      `INSERT INTO dynamic_variable (id, workspace_id, name, kind, value, cache_ttl_seconds) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(workspace_id, name) DO UPDATE SET kind=excluded.kind, value=excluded.value, cache_ttl_seconds=excluded.cache_ttl_seconds`,
    ).run(id, workspaceId, input.name, input.kind, jsonStringify(input.value ?? {}), input.cache_ttl_seconds ?? 60);
    return { id };
  }
  list(workspaceId: string) { return this.db.prepare(`SELECT * FROM dynamic_variable WHERE workspace_id = ?`).all(workspaceId); }
}

export class RecurrencesService {
  constructor(private readonly db: DB) {}
  create(workspaceId: string, input: { name: string; rule: string; template_id?: string | null; source_post_id?: string | null; until_at?: number | null }) {
    const id = prefixedId("rec");
    const nextRunAt = nextRunAtFromRrule(input.rule, now());
    this.db.prepare(
      `INSERT INTO recurrence (id, workspace_id, name, rule, template_id, source_post_id, until_at, next_run_at, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    ).run(id, workspaceId, input.name, input.rule, input.template_id ?? null, input.source_post_id ?? null, input.until_at ?? null, nextRunAt, now());
    return { id, nextRunAt };
  }
  list(workspaceId: string) { return this.db.prepare(`SELECT * FROM recurrence WHERE workspace_id = ?`).all(workspaceId); }
  cancel(id: string) { this.db.prepare(`UPDATE recurrence SET active = 0 WHERE id = ?`).run(id); }

  /** All active recurrences with next_run_at <= cutoff. */
  due(cutoff: number) {
    return this.db.prepare(`SELECT * FROM recurrence WHERE active = 1 AND next_run_at <= ?`).all(cutoff) as Array<Record<string, unknown>>;
  }
  advance(id: string, rule: string) {
    const next = nextRunAtFromRrule(rule, now() + 60_000);
    this.db.prepare(`UPDATE recurrence SET next_run_at = ? WHERE id = ?`).run(next, id);
  }
}

/**
 * Minimal RRULE evaluator. Handles FREQ=MINUTELY/HOURLY/DAILY/WEEKLY/MONTHLY
 * with optional INTERVAL=. Anything else is best-effort: returns now + 1 day.
 */
export function nextRunAtFromRrule(rule: string, from: number): number {
  const parts = Object.fromEntries(rule.split(";").map((kv) => kv.split("=").map((s) => s.trim()))) as Record<string, string>;
  const freq = parts.FREQ;
  const interval = Math.max(1, Number(parts.INTERVAL ?? "1"));
  const base = from;
  const day = 24 * 60 * 60 * 1000;
  switch (freq) {
    case "MINUTELY":
      return base + 60_000 * interval;
    case "HOURLY":
      return base + 60 * 60_000 * interval;
    case "DAILY":
      return base + day * interval;
    case "WEEKLY":
      return base + 7 * day * interval;
    case "MONTHLY": {
      const d = new Date(base);
      d.setUTCMonth(d.getUTCMonth() + interval);
      return d.getTime();
    }
    case "YEARLY": {
      const d = new Date(base);
      d.setUTCFullYear(d.getUTCFullYear() + interval);
      return d.getTime();
    }
    default:
      return base + day;
  }
}

export class EvergreenService {
  constructor(private readonly db: DB) {}
  createPool(workspaceId: string, input: { name: string; cooldown_days?: number; max_publish_count?: number; applicable_queue_ids?: string[] }) {
    const id = prefixedId("pool");
    this.db.prepare(
      `INSERT INTO evergreen_pool (id, workspace_id, name, cooldown_days, max_publish_count, applicable_queue_ids, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, workspaceId, input.name, input.cooldown_days ?? 30, input.max_publish_count ?? 0, jsonStringify(input.applicable_queue_ids ?? []), now());
    return { id };
  }
  addMember(poolId: string, postId: string) {
    this.db.prepare(`INSERT OR IGNORE INTO evergreen_pool_member (pool_id, post_id) VALUES (?, ?)`).run(poolId, postId);
  }
  listPools(workspaceId: string) { return this.db.prepare(`SELECT * FROM evergreen_pool WHERE workspace_id = ?`).all(workspaceId); }
  membersDueForRecycle(now: number) {
    return this.db.prepare(
      `SELECT epm.pool_id, epm.post_id, epm.published_count, epm.last_published_at, ep.cooldown_days, ep.max_publish_count, ep.applicable_queue_ids
       FROM evergreen_pool_member epm
       JOIN evergreen_pool ep ON ep.id = epm.pool_id
       WHERE epm.retired_at IS NULL AND ep.paused = 0
         AND (ep.max_publish_count = 0 OR epm.published_count < ep.max_publish_count)
         AND (epm.last_published_at IS NULL OR epm.last_published_at + ep.cooldown_days * 86400000 <= ?)`,
    ).all(now) as Array<Record<string, unknown>>;
  }
  markPublished(poolId: string, postId: string) {
    this.db
      .prepare(
        `UPDATE evergreen_pool_member SET published_count = published_count + 1, last_published_at = ? WHERE pool_id = ? AND post_id = ?`,
      )
      .run(now(), poolId, postId);
  }
}

export class AbTestsService {
  constructor(private readonly db: DB) {}
  create(workspaceId: string, input: { campaign_id?: string | null; winner_metric: string; evaluation_window_hours: number; auto_pause_loser?: boolean }) {
    const id = prefixedId("ab");
    this.db.prepare(
      `INSERT INTO ab_variant_set (id, workspace_id, campaign_id, winner_metric, evaluation_window_hours, auto_pause_loser, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, workspaceId, input.campaign_id ?? null, input.winner_metric, input.evaluation_window_hours, input.auto_pause_loser ? 1 : 0, now());
    return { id };
  }
  addArm(setId: string, postId: string, label: string, share: number) {
    this.db.prepare(`INSERT INTO ab_variant_member (set_id, post_id, arm_label, share) VALUES (?, ?, ?, ?)`).run(setId, postId, label, share);
  }
  list(workspaceId: string) { return this.db.prepare(`SELECT * FROM ab_variant_set WHERE workspace_id = ?`).all(workspaceId); }
  members(setId: string) { return this.db.prepare(`SELECT * FROM ab_variant_member WHERE set_id = ?`).all(setId); }
  /** Returns sets eligible for evaluation (window elapsed, not yet decided). */
  due(now: number) {
    return this.db.prepare(
      `SELECT * FROM ab_variant_set WHERE decided_at IS NULL AND created_at + evaluation_window_hours * 3600000 <= ?`,
    ).all(now) as Array<Record<string, unknown>>;
  }
  markDecided(setId: string) { this.db.prepare(`UPDATE ab_variant_set SET decided_at = ? WHERE id = ?`).run(now(), setId); }
}

export class UtmTemplatesService {
  constructor(private readonly db: DB) {}
  create(workspaceId: string, input: { name: string; source_template?: string; medium_template?: string; campaign_template?: string; term_template?: string; content_template?: string }) {
    const id = prefixedId("utm");
    this.db.prepare(
      `INSERT INTO utm_template (id, workspace_id, name, source_template, medium_template, campaign_template, term_template, content_template) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, workspaceId, input.name, input.source_template ?? null, input.medium_template ?? null, input.campaign_template ?? null, input.term_template ?? null, input.content_template ?? null);
    return { id };
  }
  list(workspaceId: string) { return this.db.prepare(`SELECT * FROM utm_template WHERE workspace_id = ?`).all(workspaceId); }
  resolve(template: Record<string, string | null>, context: Record<string, string>): URL {
    const url = new URL(context.url ?? "https://example.com");
    const replace = (s: string | null | undefined) => (s ?? "").replace(/\{(\w+)\}/g, (_m, k) => context[k] ?? "");
    if (template.source_template) url.searchParams.set("utm_source", replace(template.source_template));
    if (template.medium_template) url.searchParams.set("utm_medium", replace(template.medium_template));
    if (template.campaign_template) url.searchParams.set("utm_campaign", replace(template.campaign_template));
    if (template.term_template) url.searchParams.set("utm_term", replace(template.term_template));
    if (template.content_template) url.searchParams.set("utm_content", replace(template.content_template));
    return url;
  }
}

export class TrackedLinksService {
  constructor(private readonly db: DB) {}
  create(workspaceId: string, input: { post_id?: string | null; variant_id?: string | null; original_url: string; utm_resolved_url: string; short_code?: string | null; provider_short_url?: string | null }) {
    const id = prefixedId("tl");
    this.db.prepare(
      `INSERT INTO tracked_link (id, workspace_id, post_id, variant_id, original_url, utm_resolved_url, short_code, provider_short_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, workspaceId, input.post_id ?? null, input.variant_id ?? null, input.original_url, input.utm_resolved_url, input.short_code ?? null, input.provider_short_url ?? null);
    return { id };
  }
  list(workspaceId: string) { return this.db.prepare(`SELECT * FROM tracked_link WHERE workspace_id = ?`).all(workspaceId); }
}

export class ImportsService {
  constructor(private readonly db: DB) {}
  startBatch(workspaceId: string, source: string, sourceRef?: string) {
    const id = prefixedId("bim");
    this.db.prepare(`INSERT INTO bulk_import_batch (id, workspace_id, source, source_ref, created_at) VALUES (?, ?, ?, ?, ?)`).run(id, workspaceId, source, sourceRef ?? null, now());
    return { id };
  }
  countRow(batchId: string, success: boolean) {
    this.db.prepare(
      `UPDATE bulk_import_batch SET total_rows = total_rows + 1, succeeded_rows = succeeded_rows + ?, failed_rows = failed_rows + ? WHERE id = ?`,
    ).run(success ? 1 : 0, success ? 0 : 1, batchId);
  }
  get(workspaceId: string, id: string) {
    return this.db.prepare(`SELECT * FROM bulk_import_batch WHERE workspace_id = ? AND id = ?`).get(workspaceId, id);
  }
  list(workspaceId: string) { return this.db.prepare(`SELECT * FROM bulk_import_batch WHERE workspace_id = ? ORDER BY created_at DESC`).all(workspaceId); }
}

export class AnalyticsService {
  constructor(private readonly db: DB) {}
  recordAccountDaily(channelAccountId: string, date: string, metrics: Record<string, number>, audienceTotal: number) {
    this.db.prepare(
      `INSERT INTO account_metric_daily (channel_account_id, date, metrics, audience_total) VALUES (?, ?, ?, ?)
       ON CONFLICT(channel_account_id, date) DO UPDATE SET metrics=excluded.metrics, audience_total=excluded.audience_total`,
    ).run(channelAccountId, date, jsonStringify(metrics), audienceTotal);
  }
  accountDaily(channelAccountId: string, fromDate: string, toDate: string) {
    return this.db.prepare(
      `SELECT * FROM account_metric_daily WHERE channel_account_id = ? AND date BETWEEN ? AND ? ORDER BY date`,
    ).all(channelAccountId, fromDate, toDate);
  }
  recordPostMetric(postId: string, channelAccountId: string, metrics: Record<string, number>) {
    this.db.prepare(
      `INSERT INTO post_metric (post_id, channel_account_id, captured_at, metrics) VALUES (?, ?, ?, ?)`,
    ).run(postId, channelAccountId, now(), jsonStringify(metrics));
  }
  postMetrics(postId: string) {
    return this.db.prepare(`SELECT * FROM post_metric WHERE post_id = ? ORDER BY captured_at DESC`).all(postId);
  }
  /** Buckets engagement by weekday × hour using account_metric_daily. */
  suggestBestTimes(channelAccountId: string): Array<{ weekday: number; hour: number; score: number }> {
    const rows = this.db.prepare(
      `SELECT date, metrics FROM account_metric_daily WHERE channel_account_id = ? ORDER BY date DESC LIMIT 90`,
    ).all(channelAccountId) as Array<{ date: string; metrics: string }>;
    const buckets = new Map<string, number>();
    for (const row of rows) {
      const d = new Date(row.date + "T12:00:00Z");
      const key = `${d.getUTCDay()}-12`;
      const m = jsonParse<Record<string, number>>(row.metrics, {});
      const engagement = (m.engagements ?? 0) + (m.likes ?? 0) + (m.comments ?? 0);
      buckets.set(key, (buckets.get(key) ?? 0) + engagement);
    }
    return Array.from(buckets.entries())
      .map(([key, score]) => {
        const [weekday, hour] = key.split("-").map((s) => Number(s));
        return { weekday, hour, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }
}

export class ReportsService {
  constructor(private readonly db: DB) {}
  create(workspaceId: string, input: { name: string; kind: string; config: Record<string, unknown>; schedule_cron?: string | null; recipients?: string[] }) {
    const id = prefixedId("rep");
    this.db.prepare(
      `INSERT INTO report (id, workspace_id, name, kind, config, schedule_cron, recipients, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, workspaceId, input.name, input.kind, jsonStringify(input.config), input.schedule_cron ?? null, jsonStringify(input.recipients ?? []), now());
    return { id };
  }
  list(workspaceId: string) { return this.db.prepare(`SELECT * FROM report WHERE workspace_id = ?`).all(workspaceId); }
  recordExport(reportId: string, format: string, path: string, size: number) {
    const id = prefixedId("rex");
    this.db.prepare(`INSERT INTO report_export (id, report_id, format, path, size, generated_at) VALUES (?, ?, ?, ?, ?, ?)`).run(id, reportId, format, path, size, now());
    this.db.prepare(`UPDATE report SET last_generated_at = ? WHERE id = ?`).run(now(), reportId);
    return { id };
  }
  listExports(reportId: string) { return this.db.prepare(`SELECT * FROM report_export WHERE report_id = ? ORDER BY generated_at DESC`).all(reportId); }
}

export class InboxService {
  constructor(private readonly db: DB) {}
  upsertThread(workspaceId: string, channelAccountId: string, providerThreadId: string, kind: string, subjectPostId?: string | null) {
    const id = prefixedId("ithr");
    this.db.prepare(
      `INSERT INTO inbox_thread (id, workspace_id, channel_account_id, provider_thread_id, kind, subject_post_id, last_message_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'open')
       ON CONFLICT(channel_account_id, provider_thread_id) DO UPDATE SET last_message_at = excluded.last_message_at`,
    ).run(id, workspaceId, channelAccountId, providerThreadId, kind, subjectPostId ?? null, now());
    return this.db.prepare(
      `SELECT id FROM inbox_thread WHERE channel_account_id = ? AND provider_thread_id = ?`,
    ).get(channelAccountId, providerThreadId) as { id: string };
  }
  appendMessage(threadId: string, direction: "inbound" | "outbound", body: string, sender: Record<string, unknown>, providerMessageId?: string) {
    const id = prefixedId("imsg");
    this.db.prepare(
      `INSERT INTO inbox_message (id, thread_id, direction, sender, body, provider_message_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, threadId, direction, jsonStringify(sender), body, providerMessageId ?? null, now());
    if (direction === "inbound") {
      this.db.prepare(`UPDATE inbox_thread SET unread_count = unread_count + 1, last_message_at = ? WHERE id = ?`).run(now(), threadId);
    } else {
      this.db.prepare(`UPDATE inbox_thread SET last_message_at = ? WHERE id = ?`).run(now(), threadId);
    }
    return { id };
  }
  listThreads(workspaceId: string, filters: { status?: string; channelAccountId?: string; assignee?: string } = {}) {
    const conditions = ["workspace_id = ?"];
    const params: unknown[] = [workspaceId];
    if (filters.status) { conditions.push("status = ?"); params.push(filters.status); }
    if (filters.channelAccountId) { conditions.push("channel_account_id = ?"); params.push(filters.channelAccountId); }
    if (filters.assignee) { conditions.push("assigned_user_id = ?"); params.push(filters.assignee); }
    return this.db.prepare(`SELECT * FROM inbox_thread WHERE ${conditions.join(" AND ")} ORDER BY last_message_at DESC`).all(...params);
  }
  listMessages(threadId: string) { return this.db.prepare(`SELECT * FROM inbox_message WHERE thread_id = ? ORDER BY created_at`).all(threadId); }
  setAssigned(threadId: string, userId: string | null) { this.db.prepare(`UPDATE inbox_thread SET assigned_user_id = ? WHERE id = ?`).run(userId, threadId); }
  setStatus(threadId: string, status: string) { this.db.prepare(`UPDATE inbox_thread SET status = ? WHERE id = ?`).run(status, threadId); }
}

export class ApprovalsService {
  constructor(private readonly db: DB) {}
  createWorkflow(workspaceId: string, input: { name: string; stages: unknown[] }) {
    const id = prefixedId("wf");
    this.db.prepare(`INSERT INTO approval_workflow (id, workspace_id, name, stages, created_at) VALUES (?, ?, ?, ?, ?)`).run(id, workspaceId, input.name, jsonStringify(input.stages), now());
    return { id };
  }
  listWorkflows(workspaceId: string) { return this.db.prepare(`SELECT * FROM approval_workflow WHERE workspace_id = ?`).all(workspaceId); }
  startApproval(postId: string, workflowId: string) {
    const id = prefixedId("apv");
    this.db.prepare(`INSERT INTO post_approval (id, post_id, workflow_id, current_stage_index, state, created_at) VALUES (?, ?, ?, 0, 'pending', ?)`).run(id, postId, workflowId, now());
    return { id };
  }
  recordDecision(approvalId: string, stageIndex: number, reviewerUserId: string, decision: "approve" | "reject" | "request_changes", comment?: string) {
    const approval = this.db.prepare(`SELECT * FROM post_approval WHERE id = ?`).get(approvalId) as Record<string, unknown> | undefined;
    if (!approval) throw new Error("approval not found");
    if (approval.state !== "pending") throw new Error("approval is not pending");

    const currentStageIndex = Number(approval.current_stage_index);
    if (stageIndex !== currentStageIndex) throw new Error("approval decision stage is not active");

    const wf = this.db.prepare(`SELECT stages FROM approval_workflow WHERE id = ?`).get(approval.workflow_id) as { stages: string } | undefined;
    if (!wf) throw new Error("approval workflow not found");

    const stages = jsonParse<Array<{ all_required?: boolean; required_user_ids?: unknown }>>(wf.stages, []);
    const stage = stages[currentStageIndex] ?? {};
    const requiredUserIds = Array.isArray(stage.required_user_ids)
      ? stage.required_user_ids.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [];
    if (requiredUserIds.length > 0 && !requiredUserIds.includes(reviewerUserId)) {
      throw new Error("reviewer is not required for this approval stage");
    }

    const id = prefixedId("apd");
    this.db.prepare(`INSERT INTO post_approval_decision (id, approval_id, stage_index, reviewer_user_id, decision, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, approvalId, stageIndex, reviewerUserId, decision, comment ?? null, now());

    if (decision === "reject") {
      this.db.prepare(`UPDATE post_approval SET state = 'rejected', finalized_at = ? WHERE id = ?`).run(now(), approvalId);
      return { id, finalState: "rejected" };
    }
    if (decision === "request_changes") {
      return { id, finalState: "pending" };
    }

    if (stage.all_required && requiredUserIds.length > 0) {
      const approvedRows = this.db
        .prepare(
          `SELECT reviewer_user_id FROM post_approval_decision
           WHERE approval_id = ? AND stage_index = ? AND decision = 'approve'`,
        )
        .all(approvalId, stageIndex) as Array<{ reviewer_user_id: string }>;
      const approvedReviewerIds = new Set(approvedRows.map((row) => row.reviewer_user_id));
      if (!requiredUserIds.every((requiredUserId) => approvedReviewerIds.has(requiredUserId))) {
        return { id, finalState: "pending" };
      }
    }

    const nextStage = currentStageIndex + 1;
    if (nextStage >= stages.length) {
      this.db.prepare(`UPDATE post_approval SET state = 'approved', finalized_at = ? WHERE id = ?`).run(now(), approvalId);
      return { id, finalState: "approved" };
    }
    this.db.prepare(`UPDATE post_approval SET current_stage_index = ? WHERE id = ?`).run(nextStage, approvalId);
    return { id, finalState: "pending" };
  }
  get(id: string) { return this.db.prepare(`SELECT * FROM post_approval WHERE id = ?`).get(id); }
  decisions(approvalId: string) { return this.db.prepare(`SELECT * FROM post_approval_decision WHERE approval_id = ? ORDER BY created_at`).all(approvalId); }
  createExternalLink(approvalId: string, email?: string, ttlSeconds = 7 * 86400) {
    const id = prefixedId("erl");
    const token = prefixedId("erlt");
    const expiresAt = now() + ttlSeconds * 1000;
    this.db.prepare(`INSERT INTO external_reviewer_link (id, approval_id, token, email, expires_at) VALUES (?, ?, ?, ?, ?)`).run(id, approvalId, token, email ?? null, expiresAt);
    return { id, token, expiresAt };
  }
}

export class IntegrationsService {
  constructor(private readonly db: DB) {}
  create(workspaceId: string, input: { kind: string; provider: string; credentials_vault_ref: string; default_for_kind?: boolean; config?: Record<string, unknown> }) {
    const id = prefixedId("int");
    this.db.prepare(
      `INSERT INTO integration_service (id, workspace_id, kind, provider, credentials_vault_ref, default_for_kind, config, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, workspaceId, input.kind, input.provider, input.credentials_vault_ref, input.default_for_kind ? 1 : 0, jsonStringify(input.config ?? {}), now());
    return { id };
  }
  list(workspaceId: string) { return this.db.prepare(`SELECT * FROM integration_service WHERE workspace_id = ?`).all(workspaceId); }
}

export class BrandVoicesService {
  constructor(private readonly db: DB) {}
  create(workspaceId: string, input: { name: string; description?: string; style_directives: Record<string, unknown>; is_default?: boolean }) {
    const id = prefixedId("voice");
    this.db.prepare(
      `INSERT INTO ai_brand_voice (id, workspace_id, name, description, style_directives, is_default) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, workspaceId, input.name, input.description ?? null, jsonStringify(input.style_directives), input.is_default ? 1 : 0);
    return { id };
  }
  list(workspaceId: string) { return this.db.prepare(`SELECT * FROM ai_brand_voice WHERE workspace_id = ?`).all(workspaceId); }
}

export class SettingsService {
  constructor(private readonly db: DB) {}
  set(scope: "global" | "workspace", workspaceId: string | null, key: string, value: unknown) {
    this.db.prepare(
      `INSERT INTO setting (scope, workspace_id, key, value) VALUES (?, ?, ?, ?)
       ON CONFLICT(scope, workspace_id, key) DO UPDATE SET value=excluded.value`,
    ).run(scope, workspaceId, key, jsonStringify(value));
  }
  get(scope: "global" | "workspace", workspaceId: string | null, key: string): unknown {
    const row = this.db.prepare(`SELECT value FROM setting WHERE scope = ? AND workspace_id IS ? AND key = ?`).get(scope, workspaceId, key) as { value: string } | undefined;
    return row ? jsonParse(row.value, null) : null;
  }
  list(scope: "global" | "workspace", workspaceId: string | null) {
    const rows = this.db.prepare(`SELECT key, value FROM setting WHERE scope = ? AND workspace_id IS ?`).all(scope, workspaceId) as Array<{ key: string; value: string }>;
    return rows.map((r) => ({ key: r.key, value: jsonParse(r.value, null) }));
  }
}
