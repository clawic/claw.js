import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { once } from "events";
import type { Writable } from "stream";

import type { RuntimeAdapterOptions, RuntimeSessionAdapter } from "./contracts.ts";
import { clawAdapter } from "./adapters/claw-adapter.ts";
import {
  executeClawRuntimeTool,
  getClawRuntimeDefaultModel,
  listClawRuntimeModels,
  resolveClawRuntimeConfig,
} from "./claw-runtime.ts";
import {
  buildCompactAssistantStreamTrace,
  streamRuntimeSessionEvents,
  type StreamSessionDependencies,
} from "../sessions/stream.ts";
import { SessionStore } from "../sessions/store.ts";

export interface ClawRuntimeJsonRpcRequest {
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface ClawRuntimeJsonRpcMessage {
  id?: string | number | null;
  method?: string;
  result?: unknown;
  error?: { code: number; message: string };
  params?: unknown;
}

export interface ClawRuntimeAppServerOptions {
  runtime?: RuntimeAdapterOptions;
  sessionAdapter?: RuntimeSessionAdapter;
  dependencies?: StreamSessionDependencies;
}

export type ClawRuntimeMessageSink = (message: ClawRuntimeJsonRpcMessage) => void | Promise<void>;

export interface ClawRuntimeWebSocketLike {
  readyState: number;
  send(data: string, callback?: (error?: Error) => void): void;
}

export const CLAW_RUNTIME_WEBSOCKET_OPEN = 1;

interface ThreadRecord {
  id: string;
  cwd: string;
  model: string;
  createdAt: number;
}

function asParams(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textFromTurnInput(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map((item) => {
    if (typeof item === "string") return item;
    const record = asParams(item);
    if (typeof record.text === "string") return record.text;
    if (typeof record.content === "string") return record.content;
    return "";
  }).filter(Boolean).join("\n");
}

function resolveSafePath(cwd: string, candidate: unknown): string {
  const root = path.resolve(cwd);
  const resolved = path.resolve(root, typeof candidate === "string" ? candidate : ".");
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Path is outside the Claw Runtime workspace.");
  }
  return resolved;
}

function ok(id: ClawRuntimeJsonRpcRequest["id"], result: unknown): ClawRuntimeJsonRpcMessage {
  return { id, result };
}

function fail(id: ClawRuntimeJsonRpcRequest["id"], error: unknown): ClawRuntimeJsonRpcMessage {
  return {
    id,
    error: {
      code: -32000,
      message: error instanceof Error ? error.message : String(error),
    },
  };
}

export function createClawRuntimeJsonLineSink(writable: Writable): ClawRuntimeMessageSink {
  return async (message) => {
    const line = `${JSON.stringify(message)}\n`;
    if (writable.write(line)) return;
    await once(writable, "drain");
  };
}

export function createClawRuntimeWebSocketSink(
  socket: ClawRuntimeWebSocketLike,
  openState = CLAW_RUNTIME_WEBSOCKET_OPEN,
): ClawRuntimeMessageSink {
  return async (message) => {
    if (socket.readyState !== openState) {
      throw new Error("Claw Runtime WebSocket is not open.");
    }
    const payload = JSON.stringify(message);
    await new Promise<void>((resolve, reject) => {
      const callback = (error?: Error) => {
        if (error) reject(error);
        else resolve();
      };
      try {
        socket.send(payload, callback);
        if (socket.send.length < 2) resolve();
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  };
}

export class ClawRuntimeAppServer {
  private readonly runtime: RuntimeAdapterOptions;
  private readonly dependencies: StreamSessionDependencies;
  private readonly sessionAdapter: RuntimeSessionAdapter;
  private readonly threads = new Map<string, ThreadRecord>();

  constructor(options: ClawRuntimeAppServerOptions = {}) {
    this.runtime = { adapter: "claw", ...(options.runtime ?? {}) };
    this.sessionAdapter = options.sessionAdapter ?? clawAdapter.createSessionAdapter(this.runtime);
    this.dependencies = {
      ...options.dependencies,
      sessionAdapter: this.sessionAdapter,
    };
  }

  async handle(request: ClawRuntimeJsonRpcRequest): Promise<ClawRuntimeJsonRpcMessage[]> {
    const messages: ClawRuntimeJsonRpcMessage[] = [];
    await this.handleStream(request, (message) => {
      messages.push(message);
    });
    return messages;
  }

  async handleStream(request: ClawRuntimeJsonRpcRequest, sink: ClawRuntimeMessageSink): Promise<void> {
    const params = asParams(request.params);
    const emit = async (message: ClawRuntimeJsonRpcMessage) => {
      await sink(message);
    };
    try {
      switch (request.method) {
        case "initialize":
          await emit(ok(request.id, {
            serverInfo: { name: "claw-runtime", title: "Claw Runtime", version: "0.1.0" },
            clawHome: resolveClawRuntimeConfig(this.runtime).locations.homeDir,
          }));
          return;
        case "config/read":
          await emit(ok(request.id, resolveClawRuntimeConfig(this.runtime)));
          return;
        case "model/list":
          await emit(ok(request.id, {
            data: listClawRuntimeModels(this.runtime),
            defaultModel: getClawRuntimeDefaultModel(this.runtime),
          }));
          return;
        case "thread/start":
          await emit(ok(request.id, { thread: this.startThread(params) }));
          return;
        case "thread/resume":
          await emit(ok(request.id, { thread: this.resumeThread(params) }));
          return;
        case "thread/list":
          await emit(ok(request.id, {
            data: Array.from(this.threads.values()).map((thread) => this.serializeThread(thread)),
          }));
          return;
        case "turn/start":
          await this.startTurn(request.id, params, emit);
          return;
        case "turn/interrupt":
          await emit(ok(request.id, {}));
          return;
        case "command/exec":
          await emit(ok(request.id, { output: await this.commandExec(params) }));
          return;
        case "fs/readFile":
          await emit(ok(request.id, { dataBase64: fs.readFileSync(resolveSafePath(this.cwdFor(params), params.path)).toString("base64") }));
          return;
        case "fs/writeFile":
          this.writeFile(params);
          await emit(ok(request.id, {}));
          return;
        case "fs/readDirectory":
          await emit(ok(request.id, {
            entries: fs.readdirSync(resolveSafePath(this.cwdFor(params), params.path), { withFileTypes: true }).map((entry) => ({
              fileName: entry.name,
              isDirectory: entry.isDirectory(),
              isFile: entry.isFile(),
            })),
          }));
          return;
        default:
          await emit(fail(request.id, `Unsupported Claw Runtime app-server method: ${request.method}`));
          return;
      }
    } catch (error) {
      await emit(fail(request.id, error));
    }
  }

  private startThread(params: Record<string, unknown>) {
    const config = resolveClawRuntimeConfig({
      ...this.runtime,
      model: typeof params.model === "string" ? params.model : this.runtime.model,
    });
    const thread: ThreadRecord = {
      id: `thr_${randomUUID()}`,
      cwd: typeof params.cwd === "string" ? params.cwd : config.locations.workspacePath,
      model: typeof params.model === "string" ? params.model : config.model,
      createdAt: Math.floor(Date.now() / 1000),
    };
    fs.mkdirSync(thread.cwd, { recursive: true });
    this.threads.set(thread.id, thread);
    return this.serializeThread(thread);
  }

  private resumeThread(params: Record<string, unknown>) {
    const threadId = typeof params.threadId === "string" ? params.threadId : "";
    const thread = this.threads.get(threadId);
    if (!thread) throw new Error(`Unknown thread: ${threadId}`);
    return this.serializeThread(thread);
  }

  private serializeThread(thread: ThreadRecord) {
    const session = new SessionStore(thread.cwd).getSession(thread.id);
    return {
      id: thread.id,
      model: thread.model,
      modelProvider: resolveClawRuntimeConfig(this.runtime).provider.id,
      createdAt: thread.createdAt,
      turns: (session?.messages ?? []).map((message) => ({ role: message.role, content: message.content })),
    };
  }

  private cwdFor(params: Record<string, unknown>): string {
    const threadId = typeof params.threadId === "string" ? params.threadId : "";
    return this.threads.get(threadId)?.cwd ?? resolveClawRuntimeConfig(this.runtime).locations.workspacePath;
  }

  private async startTurn(
    id: ClawRuntimeJsonRpcRequest["id"],
    params: Record<string, unknown>,
    emit: ClawRuntimeMessageSink,
  ): Promise<void> {
    const threadId = typeof params.threadId === "string" ? params.threadId : "";
    const thread = this.threads.get(threadId);
    if (!thread) throw new Error(`Unknown thread: ${threadId}`);
    const userText = textFromTurnInput(params.input);
    const turnId = `turn_${randomUUID()}`;
    const sessionStore = new SessionStore(thread.cwd);
    const session = sessionStore.appendMessage(thread.id, { role: "user", content: userText });

    await emit(ok(id, { turn: { id: turnId, threadId: thread.id, status: "running" } }));

    let assistantText = "";
    const streamDeltas: Array<{ delta: string; at: number }> = [];
    const coalesceMs = 0;
    let completed = false;
    let failure: { status: "failed" | "aborted"; error?: string; partialText?: string } | null = null;

    try {
      for await (const event of streamRuntimeSessionEvents({
        sessionId: thread.id,
        model: thread.model,
        messages: session.messages,
        chunkSize: 64,
        coalesceMs,
      }, this.dependencies)) {
        if (event.type === "chunk") {
          assistantText += event.chunk.delta;
          streamDeltas.push({ delta: event.chunk.delta, at: Date.now() });
          await emit({
            method: "item/agentMessage/delta",
            params: { threadId: thread.id, delta: event.chunk.delta },
          });
        }
        if (event.type === "done") {
          completed = true;
        }
        if (event.type === "error") {
          failure = {
            status: "failed",
            error: event.error.message,
            ...(event.partialText ? { partialText: event.partialText } : {}),
          };
        }
        if (event.type === "aborted") {
          failure = {
            status: "aborted",
            ...(event.reason ? { error: event.reason } : {}),
            ...(event.partialText ? { partialText: event.partialText } : {}),
          };
        }
      }
    } catch (error) {
      failure = {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }

    if (completed && !failure) {
      if (assistantText.trim()) {
        sessionStore.appendMessage(thread.id, {
          role: "assistant",
          content: assistantText.trim(),
          metadata: {
            streamTrace: buildCompactAssistantStreamTrace(streamDeltas, coalesceMs),
            turnId,
          },
        });
      }
      await emit({ method: "turn/completed", params: { threadId: thread.id, status: "completed" } });
      return;
    }

    if (failure) {
      const partialText = (failure.partialText ?? assistantText).trim();
      if (partialText) {
        sessionStore.appendMessage(thread.id, {
          role: "assistant",
          content: partialText,
          metadata: {
            partial: true,
            turnId,
            status: failure.status,
            ...(failure.error ? { error: failure.error } : {}),
            streamTrace: buildCompactAssistantStreamTrace(streamDeltas, coalesceMs),
          },
        });
      }
      await emit({
        method: "turn/completed",
        params: {
          threadId: thread.id,
          status: "failed",
          ...(failure.error ? { error: failure.error } : {}),
        },
      });
      return;
    }

    await emit({ method: "turn/completed", params: { threadId: thread.id, status: "failed", error: "Runtime session ended before completion." } });
  }

  private async commandExec(params: Record<string, unknown>): Promise<string> {
    const config = resolveClawRuntimeConfig(this.runtime);
    return executeClawRuntimeTool({
      name: "shell",
      arguments: { command: typeof params.command === "string" ? params.command : "" },
      workspacePath: this.cwdFor(params),
      permissionMode: config.permissionMode,
    });
  }

  private writeFile(params: Record<string, unknown>): void {
    const config = resolveClawRuntimeConfig(this.runtime);
    if (config.permissionMode === "read-only") throw new Error("fs/writeFile requires workspace-write permission.");
    const target = resolveSafePath(this.cwdFor(params), params.path);
    const data = typeof params.dataBase64 === "string" ? Buffer.from(params.dataBase64, "base64") : Buffer.alloc(0);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
  }
}

export async function handleClawRuntimeJsonRpcMessage(
  request: ClawRuntimeJsonRpcRequest,
  options: ClawRuntimeAppServerOptions = {},
): Promise<ClawRuntimeJsonRpcMessage[]> {
  return new ClawRuntimeAppServer(options).handle(request);
}
