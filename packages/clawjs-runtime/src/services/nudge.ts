import type { RuntimeServiceStore } from "../store.ts";
import type {
  NudgeInput,
  NudgeOptions,
  NudgeRecord,
  RuntimeServicesContext,
} from "../types.ts";

export async function runNudgeCycle(
  store: RuntimeServiceStore,
  context: RuntimeServicesContext,
  input: NudgeInput,
  options: NudgeOptions = {},
): Promise<NudgeRecord[]> {
  const job = store.createJob("nudge", { sessionId: input.sessionId });
  try {
    const sessionWithMessages = await context.sessionsClient.getSessionWithMessages(input.sessionId);
    const { session, messages } = sessionWithMessages;

    const lookbackMs = (options.lookbackMinutes ?? input.lookbackMinutes ?? 60) * 60 * 1000;
    const cutoff = Date.now() - lookbackMs;
    let filtered = messages.filter((m) => m.timestamp >= cutoff);

    if (input.sinceMessageId) {
      const idx = filtered.findIndex((m) => m.id === input.sinceMessageId);
      if (idx >= 0) filtered = filtered.slice(idx + 1);
    }

    const maxMessages = options.maxMessages ?? input.maxMessages ?? 100;
    if (filtered.length > maxMessages) {
      filtered = filtered.slice(filtered.length - maxMessages);
    }

    const synthesized = await context.nudgeSynthesizer({ session, messages: filtered });
    const recorded: NudgeRecord[] = [];
    for (const item of synthesized) {
      recorded.push(
        store.recordNudge({
          sessionId: session.id,
          triggerMessageId: item.triggerMessageId,
          observation: item.observation,
          classification: item.classification,
          propagatedToMemory: false,
        }),
      );
    }
    store.finishJob(job.id, true);
    return recorded;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    store.finishJob(job.id, false, message);
    throw error;
  }
}
