import type { PostsService } from "../domain/posts.ts";
import type { JobsService } from "../domain/jobs.ts";
import type { EventBus } from "../webhooks/emitter.ts";
import type { ChannelAccountsService } from "../domain/channels.ts";

/**
 * Every tick, find all posts whose scheduled_at <= now and editorial gate
 * passes, dispatch them by creating a job_batch and one publish job per
 * (post, channel_account). Idempotent: if a job_batch already exists for a
 * post we skip.
 */
export class Scheduler {
  constructor(
    private readonly posts: PostsService,
    private readonly jobs: JobsService,
    private readonly channels: ChannelAccountsService,
    private readonly events: EventBus,
  ) {}

  tick(): { dispatched: number } {
    const due = this.posts.dueForDispatch(Date.now());
    let dispatched = 0;
    for (const post of due) {
      const existing = this.jobs.list(post.workspace_id, { limit: 1000 });
      const already = existing.some((j) => {
        const r = j as Record<string, unknown>;
        if (r.kind !== "publish_post_account") return false;
        try {
          const payload = JSON.parse(String(r.payload)) as { post_id?: string };
          return payload.post_id === post.id;
        } catch {
          return false;
        }
      });
      if (already) continue;
      const batch = this.jobs.createBatch(post.workspace_id, "publish_post", post.id);
      const accounts = this.posts.listAccountsForPost(post.id);
      if (accounts.length === 0) continue;
      this.posts.setPublishStatus(post.id, "publishing");
      this.events.emit({
        workspaceId: post.workspace_id,
        name: "post.publish_started",
        data: { post_id: post.id, account_count: accounts.length },
      });
      for (const account of accounts) {
        // Skip if already published on this account (idempotency)
        if (account.provider_post_id) continue;
        // Skip if account is disabled or not authorized
        const channel = this.channels.get(post.workspace_id, account.channel_account_id);
        if (!channel || !channel.authorized) {
          this.posts.setAccountState(post.id, account.channel_account_id, {
            publish_state: "skipped",
            errors: [...account.errors, { ts: Date.now(), code: "account_unauthorized", message: "account not authorized" }],
          });
          if (batch.id) {
            // Count as failed so the batch finalizer fires.
            this.jobs.enqueue({
              workspaceId: post.workspace_id,
              batchId: batch.id,
              kind: "publish_post_account",
              payload: { post_id: post.id, channel_account_id: account.channel_account_id, skip: true },
              maxAttempts: 1,
              availableAt: Date.now(),
            });
          }
          continue;
        }
        this.jobs.enqueue({
          workspaceId: post.workspace_id,
          batchId: batch.id,
          kind: "publish_post_account",
          payload: { post_id: post.id, channel_account_id: account.channel_account_id },
          maxAttempts: 5,
          availableAt: Date.now(),
        });
      }
      dispatched += 1;
    }
    return { dispatched };
  }
}
