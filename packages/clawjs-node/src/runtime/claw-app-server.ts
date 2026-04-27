import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

import type { RuntimeAdapterOptions, RuntimeSessionAdapter } from "./contracts.ts";
import { clawAdapter } from "./adapters/claw-adapter.ts";
import {
  executeClawRuntimeTool,
  getClawRuntimeDefaultModel,
  listClawRuntimeModels,
  resolveClawRuntimeConfig,
} from "./claw-runtime.ts";
import {
  streamRuntimeSessionEvents,
  type StreamSessionDependencies,
} from "../sessions/stream.ts";

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

interface ThreadRecord {
  id: string;
  cwd: string;
  model: string;
  createdAt: number;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
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
      sessionAdapter: options.sessionAdapter ?? clawAdapter.createSessionAdapter(this.runtime),
    };
  }

  async handle(request: ClawRuntimeJsonRpcRequest): Promise<ClawRuntimeJsonRpcMessage[]> {
    const params = asParams(request.params);
    try {
      switch (request.method) {
        case "initialize":
          return [ok(request.id, {
            serverInfo: { name: "claw-runtime", title: "Claw Runtime", version: "0.1.0" },
            clawHome: resolveClawRuntimeConfig(this.runtime).locations.homeDir,
          })];
        case "config/read":
          return [ok(request.id, resolveClawRuntimeConfig(this.runtime))];
        case "model/list":
          return [ok(request.id, {
            data: listClawRuntimeModels(this.runtime),
            defaultModel: getClawRuntimeDefaultModel(this.runtime),
          })];
        case "thread/start":
          return [ok(request.id, { thread: this.startThread(params) })];
        case "thread/resume":
          return [ok(request.id, { thread: this.resumeThread(params) })];
        case "thread/list":
          return [ok(request.id, {
            data: Array.from(this.threads.values()).map((thread) => this.serializeThread(thread)),
          })];
        case "turn/start":
          return await this.startTurn(request.id, params);
        case "turn/interrupt":
          return [ok(request.id, {})];
        case "command/exec":
          return [ok(request.id, { output: await this.commandExec(params) })];
        case "fs/readFile":
          return [ok(request.id, { dataBase64: fs.readFileSync(resolveSafePath(this.cwdFor(params), params.path)).toString("base64") })];
        case "fs/writeFile":
          this.writeFile(params);
          return [ok(request.id, {})];
        case "fs/readDirectory":
          return [ok(request.id, {
            entries: fs.readdirSync(resolveSafePath(this.cwdFor(params), params.path), { withFileTypes: true }).map((entry) => ({
              fileName: entry.name,
              isDirectory: entry.isDirectory(),
              isFile: entry.isFile(),
            })),
          })];
        default:
          return [fail(request.id, `Unsupported Claw Runtime app-server method: ${request.method}`)];
      }
    } catch (error) {
      return [fail(request.id, error)];
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
      messages: [],
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
    return {
      id: thread.id,
      model: thread.model,
      modelProvider: resolveClawRuntimeConfig(this.runtime).provider.id,
      createdAt: thread.createdAt,
      turns: thread.messages.map((message) => ({ role: message.role, content: message.content })),
    };
  }

  private cwdFor(params: Record<string, unknown>): string {
    const threadId = typeof params.threadId === "string" ? params.threadId : "";
    return this.threads.get(threadId)?.cwd ?? resolveClawRuntimeConfig(this.runtime).locations.workspacePath;
  }

  private async startTurn(id: ClawRuntimeJsonRpcRequest["id"], params: Record<string, unknown>): Promise<ClawRuntimeJsonRpcMessage[]> {
    const threadId = typeof params.threadId === "string" ? params.threadId : "";
    const thread = this.threads.get(threadId);
    if (!thread) throw new Error(`Unknown thread: ${threadId}`);
    const userText = textFromTurnInput(params.input);
    thread.messages.push({ role: "user", content: userText });

    const messages: ClawRuntimeJsonRpcMessage[] = [
      ok(id, { turn: { id: `turn_${randomUUID()}`, threadId: thread.id, status: "running" } }),
    ];
    let assistantText = "";
    for await (const event of streamRuntimeSessionEvents({
      sessionId: thread.id,
      model: thread.model,
      messages: thread.messages,
      chunkSize: 64,
    }, this.dependencies)) {
      if (event.type === "chunk") {
        assistantText += event.chunk.delta;
        messages.push({
          method: "item/agentMessage/delta",
          params: { threadId: thread.id, delta: event.chunk.delta },
        });
      }
      if (event.type === "done") {
        messages.push({ method: "turn/completed", params: { threadId: thread.id, status: "completed" } });
      }
      if (event.type === "error") {
        messages.push({ method: "turn/completed", params: { threadId: thread.id, status: "failed", error: event.error.message } });
      }
    }
    if (assistantText.trim()) {
      thread.messages.push({ role: "assistant", content: assistantText.trim() });
    }
    return messages;
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
