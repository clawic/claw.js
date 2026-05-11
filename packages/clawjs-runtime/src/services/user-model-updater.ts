import type { RuntimeServiceStore } from "../store.ts";
import type {
  RuntimeServicesContext,
  UserModelRefreshInput,
  UserModelRefreshOptions,
  UserModelRefreshRecord,
} from "../types.ts";

export async function runUserModelRefresh(
  store: RuntimeServiceStore,
  context: RuntimeServicesContext,
  input: UserModelRefreshInput,
  options: UserModelRefreshOptions = {},
): Promise<UserModelRefreshRecord> {
  const job = store.createJob("user_model_refresh", { reason: input.reason ?? null });
  const startedAt = Date.now();
  try {
    const maxSessions = options.maxSessions ?? input.maxSessions ?? 25;
    const list = await context.sessionsClient.list({
      agent: options.agent ?? input.agent,
      fromCreatedAt: options.sinceCreatedAt ?? input.sinceCreatedAt,
      limit: maxSessions,
    });

    const collected: Awaited<ReturnType<typeof context.sessionsClient.getSessionWithMessages>>[] = [];
    for (const session of list.items) {
      const detail = await context.sessionsClient.getSessionWithMessages(session.id);
      collected.push(detail);
    }

    const existingSnapshot = await context.userModelClient.snapshot();
    const actions = await context.userModelSynthesizer({
      sessions: collected.map((entry) => ({ session: entry.session, messages: entry.messages })),
      existingItems: existingSnapshot.items,
    });

    let added = 0;
    let updated = 0;
    let removed = 0;
    for (const action of actions) {
      if (action.kind === "upsert") {
        const existing = existingSnapshot.items.find(
          (item) =>
            item.section === action.section &&
            item.contentText.toLowerCase().trim() === action.contentText.toLowerCase().trim(),
        );
        if (existing) {
          await context.userModelClient.updateItem(existing.id, {
            contentText: action.contentText,
            topic: action.topic ?? existing.topic,
            confidence: action.confidence ?? existing.confidence,
          });
          updated += 1;
        } else {
          await context.userModelClient.upsertItem({
            section: action.section,
            contentText: action.contentText,
            topic: action.topic ?? null,
            confidence: action.confidence ?? null,
            source: action.sourceSessionId ? `session:${action.sourceSessionId}` : "runtime:user-model-updater",
          });
          added += 1;
        }
      } else if (action.kind === "forget") {
        const result = await context.userModelClient.forget({ ids: [action.id] });
        removed += result.forgottenCount;
      }
    }

    if (added > 0 || updated > 0 || removed > 0) {
      await context.userModelClient.commitSnapshot({ reason: input.reason ?? "runtime:user-model-refresh" });
    }

    const record = store.recordUserModelRefresh({
      reason: input.reason ?? null,
      itemsAdded: added,
      itemsUpdated: updated,
      itemsRemoved: removed,
      durationMs: Date.now() - startedAt,
      status: "completed",
      error: null,
    });
    store.finishJob(job.id, true);
    return record;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const record = store.recordUserModelRefresh({
      reason: input.reason ?? null,
      itemsAdded: 0,
      itemsUpdated: 0,
      itemsRemoved: 0,
      durationMs: Date.now() - startedAt,
      status: "failed",
      error: message,
    });
    store.finishJob(job.id, false, message);
    return record;
  }
}
