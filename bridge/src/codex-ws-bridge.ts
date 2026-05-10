import type {
  AuditStore,
  BridgeFrame,
  BridgeSession,
} from "@clawjs/mesh";

import {
  handleCodexJob,
  type CodexJobContext,
} from "./codex-job-handler.ts";
import type { CodexRuntime } from "./codex-runtime.ts";

export interface CodexWsHandlerDeps {
  runtime: CodexRuntime;
  auditStore: AuditStore;
  requestTimeoutMs?: number;
  awaitCompletionTimeoutMs?: number;
}

export function createCodexWsHandler(
  deps: CodexWsHandlerDeps,
): (session: BridgeSession, frame: BridgeFrame) => Promise<void> {
  return async function onFrame(session, frame) {
    if (frame.kind !== "request") return;
    const payload = frame.payload as Record<string, unknown> | undefined;
    const method = typeof payload?.method === "string" ? payload.method : null;
    if (!method || !method.startsWith("codex.")) return;
    const requestId = frame.id;
    const jobId = `${session.id}:${requestId ?? "anon"}`;
    const ctx: CodexJobContext = {
      runtime: deps.runtime,
      requestTimeoutMs: deps.requestTimeoutMs,
      awaitCompletionTimeoutMs: deps.awaitCompletionTimeoutMs,
      emit: (event) => {
        if (session.closed) return;
        session.send({
          kind: "event",
          id: requestId,
          payload: { method: event.method, params: event.params },
        });
      },
    };
    const outcome = await handleCodexJob(ctx, payload, jobId);
    if (!session.closed) {
      session.send({
        kind: "response",
        id: requestId,
        payload: outcome,
      });
    }
    deps.auditStore.record({
      action: "meshJob",
      outcome: outcome.ok ? "success" : "failure",
      actorId: session.id,
      context: { method, jobId, error: outcome.ok ? undefined : outcome.error },
    });
  };
}
