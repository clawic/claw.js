import type { JobsService, JobRow } from "../domain/jobs.ts";
import type { PostsService } from "../domain/posts.ts";
import type { ChannelAccountsService } from "../domain/channels.ts";
import type { ChannelRegistry } from "../channels/index.ts";
import type { EventBus } from "../webhooks/emitter.ts";
import type { VaultClient } from "../vault/client.ts";
import type { RateLimiter } from "./rate_limiter.ts";
import type { AdapterContext, ChannelAccountState } from "../channels/contract.ts";
import type { AnalyticsService } from "../domain/misc.ts";
import type { RecurrencesService, AbTestsService, EvergreenService } from "../domain/misc.ts";
import { makeIdempotencyStore } from "./idempotency.ts";
import type { DB } from "../db/index.ts";

interface WorkerDeps {
  db: DB;
  jobs: JobsService;
  posts: PostsService;
  channels: ChannelAccountsService;
  registry: ChannelRegistry;
  events: EventBus;
  vault: VaultClient;
  rateLimiter: RateLimiter;
  analytics: AnalyticsService;
  recurrences: RecurrencesService;
  ab: AbTestsService;
  evergreen: EvergreenService;
}

const MAX_BACKOFF_MS = 60 * 60 * 1000;

export class Worker {
  constructor(private readonly deps: WorkerDeps) {}

  /**
   * Drain at most `budget` jobs in one tick. Returns the number processed.
   * Designed to be called by a setInterval; safe to call concurrently because
   * `claimNext()` is atomic.
   */
  async tick(budget = 25): Promise<number> {
    let processed = 0;
    for (let i = 0; i < budget; i += 1) {
      const job = this.deps.jobs.claimNext();
      if (!job) break;
      try {
        await this.run(job);
      } catch (err) {
        this.handleFailure(job, err as Error);
      }
      processed += 1;
    }
    return processed;
  }

  private async run(job: JobRow): Promise<void> {
    switch (job.kind) {
      case "publish_post_account":
        await this.runPublish(job);
        return;
      case "webhook_deliver":
        await this.runWebhookDeliver(job);
        return;
      case "health_probe":
        await this.runHealthProbe(job);
        return;
      case "import_metrics":
        await this.runImportMetrics(job);
        return;
      case "recurrence_tick":
        await this.runRecurrenceTick(job);
        return;
      case "queue_tick":
        this.deps.jobs.finish(job.id, true);
        return;
      case "media_convert":
        this.deps.jobs.finish(job.id, true);
        return;
      case "refresh_token":
        await this.runRefreshToken(job);
        return;
      case "ab_evaluate":
        await this.runAbEvaluate(job);
        return;
      case "evergreen_tick":
        await this.runEvergreenTick(job);
        return;
      default:
        this.deps.jobs.finish(job.id, false, `unknown job kind: ${job.kind}`);
    }
  }

  private handleFailure(job: JobRow, err: Error) {
    const backoff = Math.min(MAX_BACKOFF_MS, 2 ** job.attempts * 1000);
    if (job.attempts >= job.max_attempts) {
      this.deps.jobs.finish(job.id, false, err.message);
      if (job.kind === "publish_post_account") {
        this.maybeFinalizeBatch(job);
      }
      this.deps.events.emit({
        workspaceId: job.workspace_id,
        name: "job.failed_terminal",
        data: { job_id: job.id, kind: job.kind, error: err.message },
      });
      return;
    }
    this.deps.jobs.reschedule(job.id, Date.now() + backoff, err.message);
  }

  private async runPublish(job: JobRow) {
    const payload = job.payload as { post_id: string; channel_account_id: string; skip?: boolean };
    const post = this.deps.posts.get(job.workspace_id, payload.post_id);
    if (!post) {
      this.deps.jobs.finish(job.id, false, "post not found");
      return;
    }
    if (payload.skip) {
      this.deps.posts.setAccountState(post.id, payload.channel_account_id, { publish_state: "skipped" });
      this.deps.jobs.finish(job.id, false, "account skipped");
      this.maybeFinalizeBatch(job);
      return;
    }
    if (post.editorial_status !== "ready") {
      this.deps.jobs.finish(job.id, false, "editorial gate not ready");
      this.deps.posts.setAccountState(post.id, payload.channel_account_id, { publish_state: "skipped" });
      this.maybeFinalizeBatch(job);
      return;
    }
    const account = this.deps.channels.get(job.workspace_id, payload.channel_account_id);
    if (!account) {
      this.deps.jobs.finish(job.id, false, "channel account not found");
      this.maybeFinalizeBatch(job);
      return;
    }
    const blockedUntil = this.deps.rateLimiter.until({ family: account.familyId, accountId: account.id });
    if (blockedUntil > 0) {
      this.deps.jobs.reschedule(job.id, Date.now() + blockedUntil, "rate limited");
      return;
    }
    const adapter = this.deps.registry.adapter(account.familyId);
    if (!adapter) {
      this.deps.jobs.finish(job.id, false, "no adapter for family");
      this.maybeFinalizeBatch(job);
      return;
    }
    const variant = this.deps.posts.variantFor(post.id, payload.channel_account_id);
    const ctx = this.adapterContext(job.workspace_id, account);
    const accountState: ChannelAccountState = {
      id: account.id,
      workspaceId: account.workspaceId,
      familyId: account.familyId,
      providerAccountId: account.providerAccountId,
      displayName: account.displayName,
      handle: account.handle,
      metadata: account.metadata,
      credentialsVaultRef: account.credentialsVaultRef,
      scopes: account.scopes,
      authorized: account.authorized,
    };
    this.deps.posts.setAccountState(post.id, account.id, { publish_state: "publishing", dispatched_at: Date.now(), attempt_count: job.attempts });

    const validation = await adapter.validate(ctx, accountState, {
      blocks: variant.blocks,
      options: variant.options,
      locale: variant.locale,
      isOriginal: variant.is_original,
    });
    if (!validation.ok) {
      const errors = validation.issues.map((i) => ({ ts: Date.now(), code: i.code, message: i.message }));
      this.deps.posts.setAccountState(post.id, account.id, { publish_state: "failed", errors: [...this.deps.posts.listAccountsForPost(post.id).find((a) => a.channel_account_id === account.id)!.errors, ...errors] });
      this.deps.jobs.finish(job.id, false, "validation failed");
      this.maybeFinalizeBatch(job);
      return;
    }
    const publishResult = await adapter.publish(ctx, accountState, {
      blocks: variant.blocks,
      options: variant.options,
      locale: variant.locale,
      isOriginal: variant.is_original,
    });
    const accountRow = this.deps.posts.listAccountsForPost(post.id).find((a) => a.channel_account_id === account.id)!;
    if (publishResult.ok && publishResult.providerPostId) {
      this.deps.posts.setAccountState(post.id, account.id, {
        publish_state: "published",
        provider_post_id: publishResult.providerPostId,
        provider_data: publishResult.providerData ?? {},
      });
      this.deps.jobs.finish(job.id, true);
      this.deps.events.emit({
        workspaceId: post.workspace_id,
        name: "post.account_published",
        data: { post_id: post.id, channel_account_id: account.id, provider_post_id: publishResult.providerPostId },
      });
    } else if (publishResult.unauthorized) {
      this.deps.channels.setAuthorized(account.id, false);
      this.deps.events.emit({
        workspaceId: post.workspace_id,
        name: "channel.unauthorized",
        data: { channel_account_id: account.id, family_id: account.familyId },
      });
      this.deps.posts.setAccountState(post.id, account.id, {
        publish_state: "failed",
        errors: [...accountRow.errors, { ts: Date.now(), code: publishResult.errorCode ?? "unauthorized", message: publishResult.errorMessage ?? "unauthorized" }],
      });
      this.deps.jobs.finish(job.id, false, publishResult.errorMessage ?? "unauthorized");
    } else if (publishResult.errorCode === "rate_limited") {
      const seconds = publishResult.retryAfterSeconds ?? 60;
      this.deps.rateLimiter.backoff({ family: account.familyId, accountId: account.id }, seconds);
      this.deps.jobs.reschedule(job.id, Date.now() + seconds * 1000, "rate_limited");
      this.deps.posts.setAccountState(post.id, account.id, {
        publish_state: "pending",
        errors: [...accountRow.errors, { ts: Date.now(), code: "rate_limited", message: publishResult.errorMessage ?? "rate limited", retry_after: seconds }],
      });
      return;
    } else {
      const errorMessage = publishResult.errorMessage ?? "publish failed";
      this.deps.posts.setAccountState(post.id, account.id, {
        publish_state: "failed",
        errors: [...accountRow.errors, { ts: Date.now(), code: publishResult.errorCode ?? "transient", message: errorMessage }],
      });
      this.deps.jobs.finish(job.id, false, errorMessage);
    }
    this.maybeFinalizeBatch(job);
  }

  private maybeFinalizeBatch(job: JobRow) {
    if (!job.batch_id) return;
    if (!this.deps.jobs.isBatchFinished(job.batch_id)) return;
    const batch = this.deps.jobs.getBatch(job.batch_id);
    if (!batch || !batch.target_id) return;
    const post = this.deps.posts.get(batch.workspace_id, batch.target_id);
    if (!post) return;
    const accountRows = this.deps.posts.listAccountsForPost(post.id);
    const published = accountRows.filter((a) => a.publish_state === "published").length;
    const total = accountRows.length;
    let publishStatus: "published" | "partially_published" | "failed";
    if (published === total) publishStatus = "published";
    else if (published === 0) publishStatus = "failed";
    else publishStatus = "partially_published";
    this.deps.posts.setPublishStatus(post.id, publishStatus, published > 0 ? Date.now() : undefined);
    this.deps.jobs.finalizeBatch(batch.id);
    this.deps.events.emit({
      workspaceId: post.workspace_id,
      name: publishStatus === "published" ? "post.published" : publishStatus === "failed" ? "post.failed" : "post.partially_published",
      data: { post_id: post.id, published, total },
    });
    if (published > 0) {
      this.deps.posts.recordActivity(post.id, null, "published", { published, total });
    } else {
      this.deps.posts.recordActivity(post.id, null, "failed", { total });
    }
  }

  private async runWebhookDeliver(job: JobRow) {
    const payload = job.payload as { webhook_id: string; event: import("../../shared/types.ts").CanonicalEvent };
    const result = await this.deps.events.deliver(
      { webhook_id: payload.webhook_id, event: payload.event, workspaceId: job.workspace_id },
      job.attempts,
    );
    if (result.ok) {
      this.deps.jobs.finish(job.id, true);
      return;
    }
    const backoff = Math.min(MAX_BACKOFF_MS, 2 ** job.attempts * 1000);
    if (job.attempts >= job.max_attempts) {
      this.deps.jobs.finish(job.id, false, `delivery failed status ${result.status ?? "?"}`);
      this.deps.events.emit({
        workspaceId: job.workspace_id,
        name: "webhook.delivery_failed",
        data: { webhook_id: payload.webhook_id, event_id: payload.event.id, status: result.status ?? null },
      });
      return;
    }
    this.deps.jobs.reschedule(job.id, Date.now() + backoff, `delivery failed status ${result.status ?? "?"}`);
  }

  private async runHealthProbe(job: JobRow) {
    const payload = job.payload as { channel_account_id: string };
    const account = this.deps.channels.get(job.workspace_id, payload.channel_account_id);
    if (!account) {
      this.deps.jobs.finish(job.id, false, "account missing");
      return;
    }
    const adapter = this.deps.registry.adapter(account.familyId);
    if (!adapter) {
      this.deps.jobs.finish(job.id, false, "no adapter");
      return;
    }
    const ctx = this.adapterContext(job.workspace_id, account);
    const accountState: ChannelAccountState = {
      id: account.id,
      workspaceId: account.workspaceId,
      familyId: account.familyId,
      providerAccountId: account.providerAccountId,
      displayName: account.displayName,
      handle: account.handle,
      metadata: account.metadata,
      credentialsVaultRef: account.credentialsVaultRef,
      scopes: account.scopes,
      authorized: account.authorized,
    };
    const probe = await adapter.probeHealth(ctx, accountState);
    this.deps.channels.saveHealth(account.id, probe.status, probe.details ?? {});
    if (probe.status === "unauthorized") {
      this.deps.channels.setAuthorized(account.id, false);
      this.deps.events.emit({
        workspaceId: job.workspace_id,
        name: "channel.unauthorized",
        data: { channel_account_id: account.id },
      });
    }
    this.deps.events.emit({
      workspaceId: job.workspace_id,
      name: "channel.health_changed",
      data: { channel_account_id: account.id, status: probe.status },
    });
    this.deps.jobs.finish(job.id, true);
  }

  private async runImportMetrics(job: JobRow) {
    const payload = job.payload as { channel_account_id: string; date: string };
    const account = this.deps.channels.get(job.workspace_id, payload.channel_account_id);
    if (!account) {
      this.deps.jobs.finish(job.id, false, "account missing");
      return;
    }
    const adapter = this.deps.registry.adapter(account.familyId);
    if (!adapter || !adapter.fetchInsightsDaily) {
      this.deps.jobs.finish(job.id, true);
      return;
    }
    const ctx = this.adapterContext(job.workspace_id, account);
    const accountState: ChannelAccountState = {
      id: account.id,
      workspaceId: account.workspaceId,
      familyId: account.familyId,
      providerAccountId: account.providerAccountId,
      displayName: account.displayName,
      handle: account.handle,
      metadata: account.metadata,
      credentialsVaultRef: account.credentialsVaultRef,
      scopes: account.scopes,
      authorized: account.authorized,
    };
    const snapshot = await adapter.fetchInsightsDaily(ctx, accountState, payload.date);
    const audience = adapter.fetchAudienceDaily
      ? await adapter.fetchAudienceDaily(ctx, accountState, payload.date)
      : null;
    if (snapshot) {
      this.deps.analytics.recordAccountDaily(account.id, payload.date, snapshot.metrics, audience?.total ?? 0);
      this.deps.events.emit({
        workspaceId: job.workspace_id,
        name: "metric.snapshot_captured",
        data: { channel_account_id: account.id, date: payload.date },
      });
    }
    this.deps.jobs.finish(job.id, true);
  }

  private async runRecurrenceTick(job: JobRow) {
    const due = this.deps.recurrences.due(Date.now());
    for (const r of due) {
      this.deps.recurrences.advance(String(r.id), String(r.rule));
      this.deps.events.emit({
        workspaceId: String(r.workspace_id),
        name: "recurrence.fired",
        data: { recurrence_id: r.id },
      });
    }
    this.deps.jobs.finish(job.id, true);
  }

  private async runRefreshToken(job: JobRow) {
    const payload = job.payload as { channel_account_id: string };
    const account = this.deps.channels.get(job.workspace_id, payload.channel_account_id);
    if (!account) {
      this.deps.jobs.finish(job.id, false, "account missing");
      return;
    }
    const adapter = this.deps.registry.adapter(account.familyId);
    if (!adapter || !adapter.refreshToken) {
      this.deps.jobs.finish(job.id, true);
      return;
    }
    const ctx = this.adapterContext(job.workspace_id, account);
    const accountState: ChannelAccountState = {
      id: account.id,
      workspaceId: account.workspaceId,
      familyId: account.familyId,
      providerAccountId: account.providerAccountId,
      displayName: account.displayName,
      handle: account.handle,
      metadata: account.metadata,
      credentialsVaultRef: account.credentialsVaultRef,
      scopes: account.scopes,
      authorized: account.authorized,
    };
    try {
      const r = await adapter.refreshToken(ctx, accountState);
      this.deps.events.emit({
        workspaceId: job.workspace_id,
        name: "integration.token_refreshed",
        data: { channel_account_id: account.id, expires_at: r.tokenExpiresAt ?? null },
      });
      this.deps.jobs.finish(job.id, true);
    } catch (err) {
      this.deps.jobs.finish(job.id, false, (err as Error).message);
    }
  }

  private async runAbEvaluate(job: JobRow) {
    const due = this.deps.ab.due(Date.now());
    for (const set of due) {
      const members = this.deps.ab.members(String(set.id)) as Array<{ post_id: string; arm_label: string }>;
      let bestPost: string | null = null;
      let bestScore = -1;
      for (const member of members) {
        const metrics = this.deps.analytics.postMetrics(member.post_id) as Array<{ metrics: string }>;
        const latest = metrics[0];
        if (!latest) continue;
        const parsed = JSON.parse(latest.metrics) as Record<string, number>;
        const score = parsed[String(set.winner_metric)] ?? 0;
        if (score > bestScore) {
          bestScore = score;
          bestPost = member.post_id;
        }
      }
      this.deps.ab.markDecided(String(set.id));
      this.deps.events.emit({
        workspaceId: String(set.workspace_id),
        name: "ab.evaluation_completed",
        data: { set_id: set.id, winner_post_id: bestPost, winner_metric: set.winner_metric, score: bestScore },
      });
    }
    this.deps.jobs.finish(job.id, true);
  }

  private async runEvergreenTick(job: JobRow) {
    const members = this.deps.evergreen.membersDueForRecycle(Date.now());
    for (const m of members) {
      this.deps.evergreen.markPublished(String(m.pool_id), String(m.post_id));
      this.deps.events.emit({
        workspaceId: job.workspace_id,
        name: "evergreen.recycled",
        data: { pool_id: m.pool_id, post_id: m.post_id },
      });
    }
    this.deps.jobs.finish(job.id, true);
  }

  private adapterContext(workspaceId: string, account: { id: string; familyId: string }): AdapterContext {
    return {
      workspaceId,
      now: () => Date.now(),
      logger: {
        info: (msg, data) => console.log(`[adapter:${account.familyId}] ${msg}`, data ?? ""),
        warn: (msg, data) => console.warn(`[adapter:${account.familyId}] ${msg}`, data ?? ""),
        error: (msg, data) => console.error(`[adapter:${account.familyId}] ${msg}`, data ?? ""),
      },
      fetch,
      vault: {
        get: (ref) => this.deps.vault.get(ref),
        put: (ref, value) => this.deps.vault.put(ref, value),
        delete: (ref) => this.deps.vault.delete(ref),
      },
      rateLimiter: this.deps.rateLimiter,
      idempotency: makeIdempotencyStore(this.deps.db),
    };
  }
}
