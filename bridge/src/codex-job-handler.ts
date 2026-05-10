import { z } from "zod";

import {
  CodexRuntime,
  CodexRuntimeError,
  type CodexEvent,
} from "./codex-runtime.ts";

export const CodexJobInputSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("codex.startThread"),
  }),
  z.object({
    method: z.literal("codex.sendTurn"),
    threadId: z.string().min(1),
    input: z.string(),
    model: z.string().min(1).optional(),
    awaitCompletion: z.boolean().default(true),
  }),
  z.object({
    method: z.literal("codex.cancelTurn"),
    turnId: z.string().min(1),
  }),
  z.object({
    method: z.literal("codex.status"),
  }),
]);

export type CodexJobInput = z.infer<typeof CodexJobInputSchema>;

export interface CodexJobContext {
  runtime: CodexRuntime;
  signal?: AbortSignal;
  emit?: (event: CodexEvent) => void;
  requestTimeoutMs?: number;
  awaitCompletionTimeoutMs?: number;
}

export type CodexJobOutcome =
  | { ok: true; method: string; jobId: string; result: unknown }
  | { ok: false; method: string; jobId: string; error: string };

export async function handleCodexJob(
  ctx: CodexJobContext,
  rawInput: unknown,
  jobId: string,
): Promise<CodexJobOutcome> {
  const parsed = CodexJobInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      method: "unknown",
      jobId,
      error: `invalid codex job: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    };
  }
  const input = parsed.data;
  try {
    const result = await dispatch(ctx, input);
    return { ok: true, method: input.method, jobId, result };
  } catch (err) {
    return {
      ok: false,
      method: input.method,
      jobId,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function dispatch(
  ctx: CodexJobContext,
  input: CodexJobInput,
): Promise<unknown> {
  const runtime = ctx.runtime;
  if (!runtime.isReady) {
    throw new CodexRuntimeError(
      "not-ready",
      `codex runtime not ready (state: ${runtime.currentState})`,
    );
  }
  switch (input.method) {
    case "codex.startThread":
      return runtime.request("thread/start", undefined, {
        signal: ctx.signal,
        timeoutMs: ctx.requestTimeoutMs,
      });
    case "codex.sendTurn":
      return await runSendTurn(ctx, input);
    case "codex.cancelTurn":
      return runtime.request(
        "turn/cancel",
        { turnId: input.turnId },
        { signal: ctx.signal, timeoutMs: ctx.requestTimeoutMs },
      );
    case "codex.status":
      return {
        state: runtime.currentState,
        ready: runtime.isReady,
      };
  }
}

interface SendTurnResult {
  turnId: string;
  events: CodexEvent[];
  agentText?: string;
}

async function runSendTurn(
  ctx: CodexJobContext,
  input: Extract<CodexJobInput, { method: "codex.sendTurn" }>,
): Promise<SendTurnResult> {
  const runtime = ctx.runtime;
  const params: Record<string, unknown> = {
    threadId: input.threadId,
    input: input.input,
  };
  if (input.model) params.model = input.model;
  const startResult = await runtime.request<{ turnId: string }>(
    "turn/start",
    params,
    { signal: ctx.signal, timeoutMs: ctx.requestTimeoutMs },
  );
  const turnId = startResult.turnId;
  const events: CodexEvent[] = [];
  if (!input.awaitCompletion) {
    return { turnId, events };
  }
  const completed = new Promise<CodexEvent>((resolve, reject) => {
    const timeoutMs = ctx.awaitCompletionTimeoutMs ?? 120_000;
    const timer = setTimeout(() => {
      runtime.off("event", onEvent);
      runtime.off("exit", onExit);
      reject(
        new CodexRuntimeError(
          "turn-timeout",
          `turn ${turnId} did not complete within ${timeoutMs}ms`,
        ),
      );
    }, timeoutMs);
    timer.unref?.();
    const onExit = () => {
      clearTimeout(timer);
      runtime.off("event", onEvent);
      runtime.off("exit", onExit);
      reject(
        new CodexRuntimeError("exited", "runtime exited during turn"),
      );
    };
    const onEvent = (event: CodexEvent) => {
      const params = event.params as Record<string, unknown> | undefined;
      if (params && typeof params === "object" && "turnId" in params) {
        if (params.turnId !== turnId) return;
      }
      events.push(event);
      ctx.emit?.(event);
      if (event.method === "turn/completed") {
        clearTimeout(timer);
        runtime.off("event", onEvent);
        runtime.off("exit", onExit);
        resolve(event);
      } else if (event.method === "turn/cancelled") {
        clearTimeout(timer);
        runtime.off("event", onEvent);
        runtime.off("exit", onExit);
        reject(
          new CodexRuntimeError("cancelled", `turn ${turnId} was cancelled`),
        );
      }
    };
    runtime.on("event", onEvent);
    runtime.on("exit", onExit);
  });
  await completed;
  return { turnId, events, agentText: extractAgentText(events) };
}

function extractAgentText(events: CodexEvent[]): string | undefined {
  const parts: string[] = [];
  for (const event of events) {
    if (event.method !== "item/completed") continue;
    const params = event.params as Record<string, unknown> | undefined;
    const item = params?.item as Record<string, unknown> | undefined;
    if (!item || item.type !== "agentMessage") continue;
    const content = item.content;
    if (!Array.isArray(content)) continue;
    for (const piece of content) {
      if (
        piece &&
        typeof piece === "object" &&
        (piece as Record<string, unknown>).type === "text" &&
        typeof (piece as Record<string, unknown>).text === "string"
      ) {
        parts.push((piece as Record<string, string>).text);
      }
    }
  }
  return parts.length > 0 ? parts.join("\n") : undefined;
}
