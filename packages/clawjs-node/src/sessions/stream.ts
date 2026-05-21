import { randomUUID } from "crypto";
import { spawn } from "child_process";

import type { DocumentRef, Message, PromptContextBlock, StreamChunk } from "@clawjs/core";

import type { CommandRunner, RuntimeSessionAdapter, SessionGatewayDescriptor } from "../runtime/contracts.ts";
import {
  buildOpenAIMessages,
  buildOpenAIResponseMessages,
  buildOpenClawCliPrompt,
  type ResolvedSessionAsset,
} from "./prompt.ts";
import { DEFAULT_SESSION_TITLE, suggestSessionTitle } from "./transcript.ts";
import { buildOpenClawCommand } from "../runtime/openclaw-command.ts";
import { streamClawRuntimeGatewayChunks } from "../runtime/claw-runtime.ts";

export interface StreamSessionInput {
  sessionId: string;
  agentId?: string;
  systemPrompt?: string;
  contextBlocks?: PromptContextBlock[];
  messages: Array<Pick<Message, "role" | "content" | "attachments" | "documents" | "contextChips">>;
  transport?: "auto" | "gateway" | "cli";
  model?: string;
  chunkSize?: number;
  coalesceMs?: number;
  gatewayRetries?: number;
  signal?: AbortSignal;
}

export interface StreamSessionDependencies {
  fetchImpl?: typeof fetch;
  runner?: CommandRunner;
  sessionAdapter?: RuntimeSessionAdapter;
  documentResolver?: (documents: DocumentRef[]) => Promise<ResolvedSessionAsset[]>;
  gatewayConfig?: {
    url: string;
    token?: string;
    port?: number;
    source?: string;
    configPath?: string;
  } | null;
}

export type SessionStreamEvent =
  | { type: "transport"; sessionId: string; transport: "gateway" | "cli"; fallback: boolean }
  | { type: "retry"; sessionId: string; transport: "gateway"; attempt: number; maxAttempts: number; error: Error }
  | { type: "chunk"; chunk: StreamChunk }
  | { type: "done"; sessionId: string; messageId?: string }
  | { type: "title"; sessionId: string; title: string; source: "session" }
  | { type: "error"; sessionId: string; error: Error; transport: "gateway" | "cli"; partialText?: string }
  | { type: "aborted"; sessionId: string; reason?: string; partialText?: string };

export interface CompactStreamTraceDelta {
  offset: number;
  length: number;
  text: string;
  at: number;
}

export interface CompactAssistantStreamTrace {
  kind: "assistant_stream_trace";
  schemaVersion: 1;
  coalesceMs: number;
  finalLength: number;
  deltas: CompactStreamTraceDelta[];
}

const SESSION_EVENT_TITLE_EXCERPT_MAX_CHARS = 2_048;
const SESSION_EVENT_PARTIAL_TAIL_MAX_CHARS = 8_192;

export function buildCompactAssistantStreamTrace(
  deltas: Array<{ delta: string; at?: number }>,
  coalesceMs = 16,
): CompactAssistantStreamTrace {
  let offset = 0;
  return {
    kind: "assistant_stream_trace",
    schemaVersion: 1,
    coalesceMs,
    finalLength: deltas.reduce((total, entry) => total + entry.delta.length, 0),
    deltas: deltas.map((entry) => {
      const delta = {
        offset,
        length: entry.delta.length,
        text: entry.delta,
        at: entry.at ?? Date.now(),
      };
      offset += entry.delta.length;
      return delta;
    }),
  };
}

class AsyncQueue<T> {
  private readonly values: T[] = [];
  private readonly waiters: Array<{
    resolve: (result: IteratorResult<T>) => void;
    reject: (error: Error) => void;
  }> = [];
  private closed = false;
  private error: Error | null = null;

  push(value: T): void {
    if (this.closed || this.error) return;
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve({ value, done: false });
      return;
    }
    this.values.push(value);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter.resolve({ value: undefined, done: true });
    }
  }

  fail(error: Error): void {
    if (this.error) return;
    this.error = error;
    for (const waiter of this.waiters.splice(0)) {
      waiter.reject(error);
    }
  }

  async next(): Promise<IteratorResult<T>> {
    const value = this.values.shift();
    if (value !== undefined) return { value, done: false };
    if (this.error) throw this.error;
    if (this.closed) return { value: undefined, done: true };
    return await new Promise<IteratorResult<T>>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  async *iterate(): AsyncGenerator<T> {
    while (true) {
      const result = await this.next();
      if (result.done) return;
      yield result.value;
    }
  }
}

function appendChunkText(existing: StreamChunk, next: StreamChunk): StreamChunk {
  return {
    ...existing,
    delta: `${existing.delta}${next.delta}`,
    ...(existing.reasoningDelta || next.reasoningDelta ? { reasoningDelta: `${existing.reasoningDelta ?? ""}${next.reasoningDelta ?? ""}` } : {}),
  };
}

export async function* coalesceStreamChunks(
  source: AsyncIterable<StreamChunk>,
  input: Pick<StreamSessionInput, "coalesceMs"> = {},
): AsyncGenerator<StreamChunk> {
  const coalesceMs = input.coalesceMs ?? 16;
  if (coalesceMs <= 0) {
    yield* source;
    return;
  }

  const queue = new AsyncQueue<StreamChunk>();
  let pending: StreamChunk | null = null;
  let timer: NodeJS.Timeout | null = null;

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!pending) return;
    queue.push(pending);
    pending = null;
  };

  const schedule = () => {
    if (timer) return;
    timer = setTimeout(flush, coalesceMs);
  };

  void (async () => {
    try {
      for await (const chunk of source) {
        if (chunk.done) {
          flush();
          queue.push(chunk);
          queue.close();
          return;
        }
        if (!chunk.delta || chunk.toolCalls?.length) {
          flush();
          queue.push(chunk);
          continue;
        }
        pending = pending
          && pending.sessionId === chunk.sessionId
          && pending.messageId === chunk.messageId
          && !pending.toolCalls?.length
          ? appendChunkText(pending, chunk)
          : (flush(), chunk);
        schedule();
      }
      flush();
      queue.close();
    } catch (error) {
      flush();
      queue.fail(error instanceof Error ? error : new Error(String(error)));
    }
  })();

  yield* queue.iterate();
}

function createAbortError(signal?: AbortSignal): Error {
  return new Error(signal?.reason ? `Session stream aborted: ${String(signal.reason)}` : "Session stream aborted");
}

function normalizeGatewayDescriptor(
  gatewayConfig?: StreamSessionDependencies["gatewayConfig"],
): SessionGatewayDescriptor | null {
  if (!gatewayConfig?.url) return null;
  return {
    kind: "openai-responses",
    url: gatewayConfig.url,
    ...(gatewayConfig.token ? { token: gatewayConfig.token } : {}),
  };
}

function createFallbackOpenClawConversationAdapter(
  input: StreamSessionInput,
  dependencies: StreamSessionDependencies,
): RuntimeSessionAdapter {
  const gateway = normalizeGatewayDescriptor(dependencies.gatewayConfig);

  return {
    transport: {
      kind: gateway ? "hybrid" : "cli",
      streaming: true,
      ...(gateway ? { gatewayKind: "openai-responses" as const } : {}),
    },
    gateway,
    fallbackGateway: gateway ? {
      ...gateway,
      kind: "openai-chat-completions",
    } : null,
    buildCliInvocation(cliInput) {
      if (!cliInput.agentId && !input.agentId) {
        throw new Error("agentId is required for OpenClaw CLI sessions");
      }
      const agentId = cliInput.agentId ?? input.agentId!;
      return {
        ...buildOpenClawCommand([
          "agent",
          "--agent",
          agentId,
          "--session-id",
          cliInput.sessionId,
          "--message",
          cliInput.prompt,
          "--thinking",
          "minimal",
          "--json",
          "--timeout",
          "120",
        ]),
        timeoutMs: 130_000,
        parser: "json-payloads",
      };
    },
    supportsGateway: true,
  };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError(signal);
  }
}

export function extractJsonPayloadText(stdout: string): string {
  const trimmed = stdout.trim();
  const candidates = [trimmed];

  for (const match of trimmed.matchAll(/(?:^|\n)\s*\{/g)) {
    const index = typeof match.index === "number" ? match.index + match[0].lastIndexOf("{") : -1;
    if (index > 0 && index < trimmed.length) {
      candidates.push(trimmed.slice(index));
    }
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as {
        payloads?: Array<{ text?: string | null }>;
        result?: {
          payloads?: Array<{ text?: string | null }>;
        };
      };
      const payloads = parsed.payloads ?? parsed.result?.payloads ?? [];
      const text = payloads.map((payload) => payload.text || "").join("").trim();
      if (text) {
        return text;
      }
    } catch {
      continue;
    }
  }

  throw new Error("Runtime CLI returned an invalid JSON payload");
}

export function extractOpenClawCliText(stdout: string): string {
  return extractJsonPayloadText(stdout);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeExtractedText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOutputText(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : "";
}

function outputString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function collectCodexText(value: unknown, output: string[]): void {
  const record = asRecord(value);
  if (!record) return;

  const type = normalizeExtractedText(record.type);
  const role = normalizeExtractedText(record.role);
  const method = normalizeExtractedText(record.method);
  const typeLower = type.toLowerCase();
  const roleLower = role.toLowerCase();
  const methodLower = method.toLowerCase();
  const isAssistantish = roleLower === "assistant"
    || typeLower.includes("assistant")
    || typeLower.includes("agent_message")
    || typeLower.includes("agentmessage")
    || typeLower.includes("output")
    || methodLower.includes("codex");

  if (isAssistantish) {
    for (const key of ["delta", "text", "message", "lastMessage", "last_message", "output_text"]) {
      const text = normalizeOutputText(record[key]);
      if (text) output.push(text);
    }
  }

  const content = record.content;
  if (isAssistantish && Array.isArray(content)) {
    for (const item of content) {
      const itemRecord = asRecord(item);
      if (!itemRecord) continue;
      const contentType = normalizeExtractedText(itemRecord.type);
      if (contentType.includes("text") || contentType.includes("output")) {
        const text = normalizeOutputText(itemRecord.text) || normalizeOutputText(itemRecord.delta);
        if (text) output.push(text);
      }
    }
  }

  for (const key of ["msg", "params", "result", "event", "item", "data"]) {
    collectCodexText(record[key], output);
  }
}

export function extractCodexJsonlText(stdout: string): string {
  const chunks: string[] = [];
  const completedMessages: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const record = JSON.parse(trimmed) as unknown;
      const item = asRecord(asRecord(record)?.item);
      if (normalizeExtractedText(asRecord(record)?.type) === "item.completed" && normalizeExtractedText(item?.type) === "agent_message") {
        const text = normalizeOutputText(item?.text) || normalizeOutputText(item?.message);
        if (text) completedMessages.push(text);
      }
      collectCodexText(record, chunks);
    } catch {
      continue;
    }
  }

  if (completedMessages.length > 0) return completedMessages.at(-1)!.trim();

  return chunks
    .filter(Boolean)
    .filter((entry, index, entries) => index === 0 || entry !== entries[index - 1])
    .join("")
    .trim();
}

export function splitTextIntoChunks(text: string, chunkSize = 24): string[] {
  const normalized = text.trim();
  if (!normalized) return [];
  const chunks: string[] = [];
  for (let index = 0; index < normalized.length; index += chunkSize) {
    chunks.push(normalized.slice(index, index + chunkSize));
  }
  return chunks;
}

function isTextOnlyConversation(messages: StreamSessionInput["messages"]): boolean {
  return messages.every((message) => {
    const hasAttachmentData = (message.attachments ?? []).some((attachment) => typeof attachment.data === "string" && attachment.data.trim());
    const hasDocuments = Array.isArray(message.documents) && message.documents.length > 0;
    return !hasAttachmentData && !hasDocuments;
  });
}

export function extractResponseOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as {
    output_text?: unknown;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string; delta?: string }>;
    }>;
  };
  if (typeof record.output_text === "string" && record.output_text.trim()) {
    return record.output_text.trim();
  }

  const text = (record.output ?? [])
    .flatMap((item) => item.content ?? [])
    .map((item) => item.text ?? item.delta ?? "")
    .join("")
    .trim();
  return text;
}

function isCodexAppServerComplete(message: unknown): boolean {
  const record = asRecord(message);
  if (!record) return false;
  const method = normalizeExtractedText(record.method).toLowerCase();
  const type = normalizeExtractedText(record.type).toLowerCase();
  const status = normalizeExtractedText(record.status).toLowerCase();
  if (/turn\/(completed|complete|finished)|codex\/turn_completed/.test(method)) return true;
  if (/turn_(completed|complete|finished)|completed|complete/.test(type)) return true;
  if (["completed", "complete", "finished", "done"].includes(status)) return true;

  for (const key of ["params", "result", "msg", "event"]) {
    if (isCodexAppServerComplete(record[key])) return true;
  }
  return false;
}

function extractContentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      const record = asRecord(item);
      if (!record) return "";
      return outputString(record.text) || outputString(record.delta);
    })
    .join("");
}

function isAgentMessageType(value: unknown): boolean {
  const normalized = normalizeExtractedText(value).toLowerCase().replace(/[_-]/g, "");
  return normalized === "agentmessage" || normalized === "assistantmessage";
}

function extractCodexLiveDeltas(message: unknown): string[] {
  const record = asRecord(message);
  if (!record) return [];

  const method = normalizeExtractedText(record.method);
  const type = normalizeExtractedText(record.type);
  const params = asRecord(record.params);
  if (method === "item/agentMessage/delta") {
    const delta = outputString(params?.delta) || outputString(record.delta);
    return delta.length > 0 ? [delta] : [];
  }
  if (method === "codex/event") {
    const msg = asRecord(params?.msg);
    const nested = extractCodexLiveDeltas(msg ?? params);
    if (nested.length) return nested;
  }
  if (isAgentMessageType(type) || type === "agent_message") {
    const delta = outputString(record.delta) || outputString(record.message);
    return delta.length > 0 ? [delta] : [];
  }
  return [];
}

function extractCodexCompletedMessageText(message: unknown): string {
  const record = asRecord(message);
  if (!record) return "";

  const method = normalizeExtractedText(record.method);
  const type = normalizeExtractedText(record.type);
  const params = asRecord(record.params);
  const item = asRecord(params?.item) ?? asRecord(record.item);
  const isCompleted = method === "item/completed" || type === "item.completed";
  if (!isCompleted || !isAgentMessageType(item?.type)) return "";

  return outputString(item?.text).trim()
    || outputString(item?.message).trim()
    || extractContentText(item?.content).trim();
}

function emitCompletionFallback(
  queue: AsyncQueue<StreamChunk>,
  input: StreamSessionInput,
  messageId: string,
  streamedText: string,
  completedText: string,
): string {
  if (!completedText.trim()) return streamedText;
  if (!streamedText) {
    queue.push({
      sessionId: input.sessionId,
      messageId,
      delta: completedText,
      done: false,
    });
    return completedText;
  }
  if (completedText.startsWith(streamedText) && completedText.length > streamedText.length) {
    const suffix = completedText.slice(streamedText.length);
    queue.push({
      sessionId: input.sessionId,
      messageId,
      delta: suffix,
      done: false,
    });
    return completedText;
  }
  return streamedText;
}

async function* streamCodexAppServerChunks(
  input: StreamSessionInput,
  gatewayConfig: SessionGatewayDescriptor,
): AsyncGenerator<StreamChunk> {
  const command = gatewayConfig.command ?? "codex";
  const args = gatewayConfig.args ?? ["app-server"];
  const prompt = buildOpenClawCliPrompt({
    systemPrompt: input.systemPrompt,
    contextBlocks: input.contextBlocks,
    messages: input.messages,
  });
  const messageId = randomUUID();
  const queue = new AsyncQueue<StreamChunk>();

  const child = spawn(command, args, {
    cwd: gatewayConfig.cwd,
    env: gatewayConfig.env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let buffer = "";
  let stderr = "";
  let settled = false;
  let threadId: string | null = null;
  let nextId = 0;
  let streamedText = "";
  let completedText = "";

  const cleanup = () => {
    if (timeoutId) clearTimeout(timeoutId);
    input.signal?.removeEventListener("abort", onAbort);
  };

  const finish = (error?: Error) => {
    if (settled) return;
    settled = true;
    cleanup();
    if (!child.killed) child.kill();
    if (error) {
      queue.fail(error);
      return;
    }
    streamedText = emitCompletionFallback(queue, input, messageId, streamedText, completedText.trim());
    if (!streamedText.trim()) {
      queue.fail(new Error(stderr.trim() || "Codex app-server returned no text"));
      return;
    }
    queue.push({ sessionId: input.sessionId, messageId, delta: "", done: true });
    queue.close();
  };

  const send = (message: unknown) => {
    if (child.stdin.writable) child.stdin.write(`${JSON.stringify(message)}\n`);
  };

  const startTurn = () => {
    if (!threadId) return;
    send({
      method: "turn/start",
      id: nextId++,
      params: {
        threadId,
        input: [{ type: "text", text: prompt }],
      },
    });
  };

  const handleMessage = (message: unknown) => {
    const record = asRecord(message);
    const result = asRecord(record?.result);
    const thread = asRecord(result?.thread);
    const candidateThreadId = normalizeExtractedText(thread?.id) || normalizeExtractedText(result?.threadId);
    if (!threadId && candidateThreadId) {
      threadId = candidateThreadId;
      startTurn();
    }

    const completed = extractCodexCompletedMessageText(message);
    if (completed) completedText = completed;

    for (const delta of extractCodexLiveDeltas(message)) {
      streamedText += delta;
      queue.push({
        sessionId: input.sessionId,
        messageId,
        delta,
        done: false,
      });
    }

    if (isCodexAppServerComplete(message)) {
      finish();
    }
  };

  const drainBuffer = () => {
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        handleMessage(JSON.parse(trimmed) as unknown);
      } catch {
        continue;
      }
    }
  };

  const onAbort = () => finish(createAbortError(input.signal));
  const timeoutId = setTimeout(() => {
    finish(new Error("Codex app-server timed out"));
  }, 130_000);

  child.on("error", (error) => finish(error instanceof Error ? error : new Error(String(error))));
  child.stderr?.on("data", (chunk: Buffer | string) => {
    stderr += chunk.toString();
  });
  child.stdout?.on("data", (chunk: Buffer | string) => {
    buffer += chunk.toString();
    drainBuffer();
  });
  child.on("close", () => {
    if (buffer.trim()) {
      buffer += "\n";
      drainBuffer();
    }
    finish();
  });
  input.signal?.addEventListener("abort", onAbort, { once: true });

  send({
    method: "initialize",
    id: nextId++,
    params: {
      clientInfo: {
        name: "clawjs",
        title: "ClawJS",
        version: "0.1.0",
      },
    },
  });
  send({ method: "initialized", params: {} });
  send({
    method: "thread/start",
    id: nextId++,
    params: {
      model: input.model || gatewayConfig.model || "gpt-5.4",
    },
  });

  yield* queue.iterate();
}

function buildGatewayHeaders(
  input: StreamSessionInput,
  gatewayConfig: SessionGatewayDescriptor,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (gatewayConfig.token) {
    headers.Authorization = `Bearer ${gatewayConfig.token}`;
  }
  if (input.agentId) {
    headers["x-openclaw-agent-id"] = input.agentId;
    headers["x-openclaw-session-key"] = input.sessionId;
  }
  if (input.model) {
    headers["x-openclaw-model"] = input.model;
  }
  return headers;
}

async function resolveMessageAssets(
  message: StreamSessionInput["messages"][number],
  documentResolver?: StreamSessionDependencies["documentResolver"],
): Promise<ResolvedSessionAsset[]> {
  const assets: ResolvedSessionAsset[] = [];

  for (const attachment of message.attachments ?? []) {
    if (typeof attachment.data !== "string" || !attachment.data.trim()) continue;
    assets.push({
      name: attachment.name,
      mimeType: attachment.mimeType,
      data: attachment.data,
    });
  }

  if (documentResolver && Array.isArray(message.documents) && message.documents.length > 0) {
    assets.push(...await documentResolver(message.documents));
  }

  return assets;
}

async function buildResponsesInput(
  input: StreamSessionInput,
  documentResolver?: StreamSessionDependencies["documentResolver"],
) {
  const messages = [];
  for (const message of input.messages) {
    messages.push({
      role: message.role,
      content: message.content,
      assets: await resolveMessageAssets(message, documentResolver),
    });
  }

  return buildOpenAIResponseMessages({
    systemPrompt: input.systemPrompt,
    contextBlocks: input.contextBlocks,
    messages,
  });
}

async function* streamChatCompletionsChunks(
  input: StreamSessionInput,
  fetchImpl: typeof fetch,
  gatewayConfig: SessionGatewayDescriptor,
): AsyncGenerator<StreamChunk> {
  const headers = buildGatewayHeaders(input, gatewayConfig);
  const response = await fetchImpl(`${gatewayConfig.url}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: input.model || "default",
      messages: buildOpenAIMessages({
        systemPrompt: input.systemPrompt,
        contextBlocks: input.contextBlocks,
        messages: input.messages,
      }),
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Gateway HTTP ${response.status}: ${await response.text()}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Gateway HTTP returned no body");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  const messageId = randomUUID();

  while (true) {
    throwIfAborted(input.signal);
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = done ? "" : (lines.pop() || "");

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ") || trimmed === "data: [DONE]") continue;
      try {
        const payload = JSON.parse(trimmed.slice(6)) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const text = payload.choices?.[0]?.delta?.content;
        if (text) {
          yield {
            sessionId: input.sessionId,
            messageId,
            delta: text,
            done: false,
          };
        }
      } catch {
        continue;
      }
    }

    if (done) {
      yield {
        sessionId: input.sessionId,
        messageId,
        delta: "",
        done: true,
      };
      return;
    }
  }
}

async function* streamResponsesChunks(
  input: StreamSessionInput,
  fetchImpl: typeof fetch,
  gatewayConfig: SessionGatewayDescriptor,
  documentResolver?: StreamSessionDependencies["documentResolver"],
): AsyncGenerator<StreamChunk> {
  const headers = buildGatewayHeaders(input, gatewayConfig);
  const response = await fetchImpl(`${gatewayConfig.url}/v1/responses`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "openclaw",
      user: input.sessionId,
      input: await buildResponsesInput(input, documentResolver),
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Gateway HTTP ${response.status}: ${await response.text()}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Gateway HTTP returned no body");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  const messageId = randomUUID();

  while (true) {
    throwIfAborted(input.signal);
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const blocks = buffer.split("\n\n");
    buffer = done ? "" : (blocks.pop() || "");

    for (const block of blocks) {
      const lines = block.split("\n");
      const eventLine = lines.find((line) => line.startsWith("event: "));
      const eventName = eventLine?.slice("event: ".length).trim();
      for (const dataLine of lines.filter((line) => line.startsWith("data: "))) {
        const rawData = dataLine.slice("data: ".length).trim();
        if (!rawData || rawData === "[DONE]") continue;

        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(rawData) as Record<string, unknown>;
        } catch {
          continue;
        }

        if (eventName === "response.failed") {
          throw new Error(typeof payload.error === "string" ? payload.error : "OpenClaw responses stream failed");
        }

        const delta = typeof payload.delta === "string"
          ? payload.delta
          : typeof payload.text === "string"
            ? payload.text
            : Array.isArray(payload.choices)
              ? (() => {
                  const firstChoice = payload.choices[0] as { delta?: { content?: string } } | undefined;
                  return typeof firstChoice?.delta?.content === "string" ? firstChoice.delta.content : "";
                })()
            : "";
        if (delta) {
          yield {
            sessionId: input.sessionId,
            messageId,
            delta,
            done: false,
          };
        }
      }
    }

    if (done) {
      yield {
        sessionId: input.sessionId,
        messageId,
        delta: "",
        done: true,
      };
      return;
    }
  }
}

async function* executeGatewayTransport(
  input: StreamSessionInput,
  fetchImpl: typeof fetch,
  gatewayConfig: SessionGatewayDescriptor,
  dependencies: StreamSessionDependencies,
  onRetry?: (error: Error, attempt: number, maxAttempts: number) => void,
): AsyncGenerator<StreamChunk> {
  const gatewayRetries = Math.max(0, input.gatewayRetries ?? 0);
  let lastGatewayError: Error | null = null;

  for (let attempt = 0; attempt <= gatewayRetries; attempt += 1) {
    try {
      yield* streamGatewayChunks(input, fetchImpl, gatewayConfig, dependencies);
      return;
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      lastGatewayError = normalized;
      if (input.signal?.aborted) throw createAbortError(input.signal);
      if (attempt < gatewayRetries) {
        onRetry?.(normalized, attempt + 1, gatewayRetries + 1);
      }
    }
  }

  if (lastGatewayError) {
    throw lastGatewayError;
  }
}

async function* streamGatewayChunks(
  input: StreamSessionInput,
  fetchImpl: typeof fetch,
  gatewayConfig: SessionGatewayDescriptor,
  dependencies: StreamSessionDependencies,
): AsyncGenerator<StreamChunk> {
  throwIfAborted(input.signal);
  switch (gatewayConfig.kind) {
    case "codex-app-server":
      yield* streamCodexAppServerChunks(input, gatewayConfig);
      return;
    case "claw-runtime":
      yield* streamClawRuntimeGatewayChunks(input, fetchImpl, gatewayConfig, dependencies);
      return;
    case "openai-chat-completions":
      yield* streamChatCompletionsChunks(input, fetchImpl, gatewayConfig);
      return;
    case "openai-responses":
      yield* streamResponsesChunks(input, fetchImpl, gatewayConfig, dependencies.documentResolver);
      return;
    default:
      throw new Error(`Unsupported gateway transport: ${gatewayConfig.kind}`);
  }
}

async function* streamCliChunks(
  input: StreamSessionInput,
  runner: CommandRunner,
  sessionAdapter: RuntimeSessionAdapter,
): AsyncGenerator<StreamChunk> {
  throwIfAborted(input.signal);
  const prompt = buildOpenClawCliPrompt({
    systemPrompt: input.systemPrompt,
    contextBlocks: input.contextBlocks,
    messages: input.messages,
  });
  const invocation = sessionAdapter.buildCliInvocation({
    sessionId: input.sessionId,
    agentId: input.agentId,
    prompt,
    ...(input.model ? { model: input.model } : {}),
  });
  if (invocation.parser === "codex-jsonl" && runner.stream) {
    yield* streamCodexJsonlCliChunks(input, runner, invocation);
    return;
  }

  const result = await runner.exec(invocation.command, invocation.args, {
    cwd: invocation.cwd,
    env: invocation.env,
    timeoutMs: invocation.timeoutMs ?? 130_000,
  });

  const combinedOutput = [result.stdout, result.stderr].filter((value) => value && value.trim()).join("\n");
  const text = invocation.parser === "json-payloads"
    ? extractJsonPayloadText(combinedOutput)
    : invocation.parser === "codex-jsonl"
      ? extractCodexJsonlText(combinedOutput)
      : result.stdout.trim();
  if (!text) {
    throw new Error("Runtime CLI returned no text");
  }

  const messageId = randomUUID();
  yield {
    sessionId: input.sessionId,
    messageId,
    delta: text,
    done: false,
  };

  yield {
    sessionId: input.sessionId,
    messageId,
    delta: "",
    done: true,
  };
}

async function* streamCodexJsonlCliChunks(
  input: StreamSessionInput,
  runner: CommandRunner,
  invocation: ReturnType<RuntimeSessionAdapter["buildCliInvocation"]>,
): AsyncGenerator<StreamChunk> {
  const messageId = randomUUID();
  const queue = new AsyncQueue<StreamChunk>();
  let stdout = "";
  let stderr = "";
  let stdoutBuffer = "";
  let streamedText = "";
  let completedText = "";

  const handleMessage = (message: unknown) => {
    const completed = extractCodexCompletedMessageText(message);
    if (completed) completedText = completed;
    for (const delta of extractCodexLiveDeltas(message)) {
      streamedText += delta;
      queue.push({
        sessionId: input.sessionId,
        messageId,
        delta,
        done: false,
      });
    }
  };

  const drainStdout = () => {
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        handleMessage(JSON.parse(trimmed) as unknown);
      } catch {
        continue;
      }
    }
  };

  void runner.stream!(invocation.command, invocation.args, {
    cwd: invocation.cwd,
    env: invocation.env,
    timeoutMs: invocation.timeoutMs ?? 130_000,
    onStdout(chunk) {
      stdout += chunk;
      stdoutBuffer += chunk;
      drainStdout();
    },
    onStderr(chunk) {
      stderr += chunk;
    },
  }).then((result) => {
    stdout = stdout || result.stdout;
    stderr = stderr || result.stderr;
    if (stdoutBuffer.trim()) {
      stdoutBuffer += "\n";
      drainStdout();
    }
    let finalText = completedText.trim();
    if (!finalText) {
      try {
        finalText = extractCodexJsonlText([stdout, stderr].filter((value) => value.trim()).join("\n"));
      } catch {
        finalText = streamedText;
      }
    }
    streamedText = emitCompletionFallback(queue, input, messageId, streamedText, finalText);
    if (!streamedText.trim()) {
      queue.fail(new Error("Runtime CLI returned no text"));
      return;
    }
    queue.push({ sessionId: input.sessionId, messageId, delta: "", done: true });
    queue.close();
  }).catch((error) => {
    queue.fail(error instanceof Error ? error : new Error(String(error)));
  });

  yield* queue.iterate();
}

export async function* streamRuntimeSession(
  input: StreamSessionInput,
  dependencies: StreamSessionDependencies = {},
): AsyncGenerator<StreamChunk> {
  const transport = input.transport ?? "auto";
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  const sessionAdapter = dependencies.sessionAdapter ?? createFallbackOpenClawConversationAdapter(input, dependencies);
  const gatewayConfig = sessionAdapter?.gateway ?? null;
  const fallbackGatewayConfig = sessionAdapter?.fallbackGateway ?? null;
  const canUseGatewayTextFallback = !!(fallbackGatewayConfig && isTextOnlyConversation(input.messages));

  if ((transport === "gateway" || transport === "auto") && gatewayConfig && fetchImpl) {
    try {
      yield* coalesceStreamChunks(executeGatewayTransport(input, fetchImpl, gatewayConfig, dependencies), input);
      return;
    } catch (error) {
      if (transport === "auto" && canUseGatewayTextFallback) {
        try {
          yield* coalesceStreamChunks(executeGatewayTransport(input, fetchImpl, fallbackGatewayConfig!, dependencies), input);
          return;
        } catch {
          // fall through to CLI
        }
      }
      if (transport === "gateway") throw error;
      if (input.signal?.aborted) throw createAbortError(input.signal);
    }
  }

  if (!dependencies.runner) {
    throw new Error("runner is required for CLI session fallback");
  }
  if (!sessionAdapter) {
    throw new Error("sessionAdapter is required for CLI session fallback");
  }

  yield* coalesceStreamChunks(streamCliChunks(input, dependencies.runner, sessionAdapter), input);
}

export async function* streamOpenClawSession(
  input: StreamSessionInput,
  dependencies: StreamSessionDependencies = {},
): AsyncGenerator<StreamChunk> {
  yield* streamRuntimeSession(input, dependencies);
}

export async function* streamRuntimeSessionEvents(
  input: StreamSessionInput,
  dependencies: StreamSessionDependencies = {},
): AsyncGenerator<SessionStreamEvent> {
  const assistantMessages: Array<Pick<Message, "role" | "content">> = input.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
  let titleExcerpt = "";
  let partialTail = "";
  const requestedTransport = input.transport ?? "auto";
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  const sessionAdapter = dependencies.sessionAdapter ?? createFallbackOpenClawConversationAdapter(input, dependencies);
  const gatewayConfig = sessionAdapter?.gateway ?? null;
  const fallbackGatewayConfig = sessionAdapter?.fallbackGateway ?? null;
  const canUseGateway = !!(gatewayConfig && fetchImpl);
  const canUseGatewayTextFallback = !!(fallbackGatewayConfig && isTextOnlyConversation(input.messages));
  const canUseCli = !!(dependencies.runner && sessionAdapter);
  const retryEvents: SessionStreamEvent[] = [];

  if (input.signal?.aborted) {
    yield {
      type: "aborted",
      sessionId: input.sessionId,
      ...(input.signal.reason ? { reason: String(input.signal.reason) } : {}),
    };
    return;
  }

  function flushRetries(): SessionStreamEvent[] {
    const events = [...retryEvents];
    retryEvents.length = 0;
    return events;
  }

  function appendAssistantDelta(delta: string): void {
    if (!delta) return;
    if (titleExcerpt.length < SESSION_EVENT_TITLE_EXCERPT_MAX_CHARS) {
      const titleDelta = titleExcerpt ? delta : delta.trimStart();
      titleExcerpt += titleDelta.slice(0, SESSION_EVENT_TITLE_EXCERPT_MAX_CHARS - titleExcerpt.length);
    }
    partialTail = `${partialTail}${delta}`;
    if (partialTail.length > SESSION_EVENT_PARTIAL_TAIL_MAX_CHARS) {
      partialTail = partialTail.slice(-SESSION_EVENT_PARTIAL_TAIL_MAX_CHARS);
    }
  }

  function partialText(): string | undefined {
    const trimmed = partialTail.trim();
    return trimmed ? trimmed : undefined;
  }

  function buildCompletionEvents(chunk: StreamChunk): SessionStreamEvent[] {
    const events: SessionStreamEvent[] = [
      { type: "done", sessionId: chunk.sessionId, ...(chunk.messageId ? { messageId: chunk.messageId } : {}) },
    ];
    const title = suggestSessionTitle([
      ...assistantMessages,
      ...(titleExcerpt.trim()
        ? [{
            role: "assistant" as const,
            content: titleExcerpt.trim(),
          }]
        : []),
    ]);
    if (title !== DEFAULT_SESSION_TITLE) {
      events.push({
        type: "title",
        sessionId: input.sessionId,
        title,
        source: "session",
      });
    }
    return events;
  }

  try {
    if (requestedTransport === "gateway") {
      if (!canUseGateway) {
        throw new Error("gatewayConfig is required for gateway session streaming");
      }
      yield { type: "transport", sessionId: input.sessionId, transport: "gateway", fallback: false };
      for await (const chunk of coalesceStreamChunks(executeGatewayTransport(input, fetchImpl!, gatewayConfig!, dependencies, (error, attempt, maxAttempts) => {
        retryEvents.push({
          type: "retry",
          sessionId: input.sessionId,
          transport: "gateway",
          attempt,
          maxAttempts,
          error,
        });
      }), input)) {
        for (const retryEvent of flushRetries()) {
          yield retryEvent;
        }
        if (!chunk.done) {
          appendAssistantDelta(chunk.delta);
          yield { type: "chunk", chunk };
          continue;
        }
        for (const event of buildCompletionEvents(chunk)) {
          yield event;
        }
      }
      for (const retryEvent of flushRetries()) {
        yield retryEvent;
      }
      return;
    }

    if (requestedTransport === "cli") {
      if (!canUseCli) {
        throw new Error("runner is required for CLI session fallback");
      }
      yield { type: "transport", sessionId: input.sessionId, transport: "cli", fallback: false };
      for await (const chunk of coalesceStreamChunks(streamCliChunks(input, dependencies.runner!, sessionAdapter!), input)) {
        if (!chunk.done) {
          appendAssistantDelta(chunk.delta);
          yield { type: "chunk", chunk };
          continue;
        }
        for (const event of buildCompletionEvents(chunk)) {
          yield event;
        }
      }
      return;
    }

    if (canUseGateway) {
      yield { type: "transport", sessionId: input.sessionId, transport: "gateway", fallback: false };
      try {
        for await (const chunk of coalesceStreamChunks(executeGatewayTransport(input, fetchImpl!, gatewayConfig!, dependencies, (error, attempt, maxAttempts) => {
          retryEvents.push({
            type: "retry",
            sessionId: input.sessionId,
            transport: "gateway",
            attempt,
            maxAttempts,
            error,
          });
        }), input)) {
          for (const retryEvent of flushRetries()) {
            yield retryEvent;
          }
          if (!chunk.done) {
            appendAssistantDelta(chunk.delta);
            yield { type: "chunk", chunk };
            continue;
          }
          for (const event of buildCompletionEvents(chunk)) {
            yield event;
          }
        }
        for (const retryEvent of flushRetries()) {
          yield retryEvent;
        }
        return;
      } catch (error) {
        for (const retryEvent of flushRetries()) {
          yield retryEvent;
        }
        if (input.signal?.aborted) {
          throw createAbortError(input.signal);
        }
        if (canUseGatewayTextFallback) {
          yield { type: "transport", sessionId: input.sessionId, transport: "gateway", fallback: true };
          try {
            for await (const chunk of coalesceStreamChunks(executeGatewayTransport(input, fetchImpl!, fallbackGatewayConfig!, dependencies, (fallbackError, attempt, maxAttempts) => {
              retryEvents.push({
                type: "retry",
                sessionId: input.sessionId,
                transport: "gateway",
                attempt,
                maxAttempts,
                error: fallbackError,
              });
            }), input)) {
              for (const retryEvent of flushRetries()) {
                yield retryEvent;
              }
              if (!chunk.done) {
                appendAssistantDelta(chunk.delta);
                yield { type: "chunk", chunk };
                continue;
              }
              for (const event of buildCompletionEvents(chunk)) {
                yield event;
              }
            }
            for (const retryEvent of flushRetries()) {
              yield retryEvent;
            }
            return;
          } catch (fallbackError) {
            for (const retryEvent of flushRetries()) {
              yield retryEvent;
            }
            if (!canUseCli) {
              throw fallbackError;
            }
          }
        }
        if (!canUseCli) {
          throw error;
        }
      }
    }

    if (!canUseCli) {
      throw new Error("runner is required for CLI session fallback");
    }

    yield { type: "transport", sessionId: input.sessionId, transport: "cli", fallback: canUseGateway };
    for await (const chunk of coalesceStreamChunks(streamCliChunks(input, dependencies.runner!, sessionAdapter!), input)) {
      if (!chunk.done) {
        appendAssistantDelta(chunk.delta);
        yield { type: "chunk", chunk };
        continue;
      }
      for (const event of buildCompletionEvents(chunk)) {
        yield event;
      }
    }
  } catch (error) {
    for (const retryEvent of flushRetries()) {
      yield retryEvent;
    }
    const boundedPartialText = partialText();
    if (input.signal?.aborted) {
      yield {
        type: "aborted",
        sessionId: input.sessionId,
        ...(input.signal.reason ? { reason: String(input.signal.reason) } : {}),
        ...(boundedPartialText ? { partialText: boundedPartialText } : {}),
      };
      return;
    }

    const normalized = error instanceof Error ? error : new Error(String(error));
    yield {
      type: "error",
      sessionId: input.sessionId,
      error: normalized,
      transport: requestedTransport === "cli" ? "cli" : canUseGateway ? "gateway" : "cli",
      ...(boundedPartialText ? { partialText: boundedPartialText } : {}),
    };
  }
}

export async function* streamOpenClawSessionEvents(
  input: StreamSessionInput,
  dependencies: StreamSessionDependencies = {},
): AsyncGenerator<SessionStreamEvent> {
  yield* streamRuntimeSessionEvents(input, dependencies);
}
