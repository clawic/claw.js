import fs from "fs";
import os from "os";
import path from "path";
import assert from "node:assert/strict";
import { test } from "vitest";

import {
  ClawRuntimeAppServer,
  type ClawRuntimeJsonRpcMessage,
} from "./claw-app-server.ts";
import type { RuntimeSessionAdapter } from "./contracts.ts";
import { SessionStore } from "../sessions/store.ts";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

function tempWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "claw-runtime-app-server-"));
}

function createSessionAdapter(): RuntimeSessionAdapter {
  return {
    transport: {
      kind: "hybrid",
      streaming: true,
      gatewayKind: "openai-chat-completions",
    },
    gateway: {
      kind: "openai-chat-completions",
      url: "http://runtime.invalid",
      model: "test-model",
    },
    fallbackGateway: null,
    buildCliInvocation() {
      throw new Error("CLI should not be used by app-server tests");
    },
    supportsGateway: true,
  };
}

function ssePayload(delta: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`;
}

function createFetchImpl(chunks: Array<{ delta: string; delayMs?: number }>): typeof fetch {
  const encoder = new TextEncoder();
  return async () => new Response(new ReadableStream({
    async start(controller) {
      for (const chunk of chunks) {
        if (chunk.delayMs) await delay(chunk.delayMs);
        controller.enqueue(encoder.encode(ssePayload(chunk.delta)));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  }));
}

function createFailingFetchImpl(): typeof fetch {
  const encoder = new TextEncoder();
  return async () => new Response(new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(ssePayload("partial reply")));
      await delay(5);
      controller.error(new Error("provider stream failed"));
    },
  }));
}

function createServer(workspaceDir: string, fetchImpl: typeof fetch): ClawRuntimeAppServer {
  const sessionAdapter = createSessionAdapter();
  return new ClawRuntimeAppServer({
    runtime: {
      adapter: "claw",
      workspacePath: workspaceDir,
      model: "test-model",
    },
    sessionAdapter,
    dependencies: {
      fetchImpl,
    },
  });
}

async function startThread(server: ClawRuntimeAppServer, workspaceDir: string): Promise<string> {
  const messages = await server.handle({
    id: 1,
    method: "thread/start",
    params: { cwd: workspaceDir, model: "test-model" },
  });
  const result = messages[0]?.result as { thread?: { id?: string } } | undefined;
  const threadId = result?.thread?.id;
  assert.equal(typeof threadId, "string");
  return threadId;
}

function deltaMessages(messages: ClawRuntimeJsonRpcMessage[]): string[] {
  return messages
    .filter((message) => message.method === "item/agentMessage/delta")
    .map((message) => (message.params as { delta?: string }).delta ?? "");
}

function completedMessages(messages: ClawRuntimeJsonRpcMessage[]): ClawRuntimeJsonRpcMessage[] {
  return messages.filter((message) => message.method === "turn/completed");
}

test("handleStream emits turn deltas before completion", async () => {
  const workspaceDir = tempWorkspace();
  const server = createServer(workspaceDir, createFetchImpl([
    { delta: "first ", delayMs: 5 },
    { delta: "second", delayMs: 30 },
  ]));
  const threadId = await startThread(server, workspaceDir);
  const messages: ClawRuntimeJsonRpcMessage[] = [];
  const firstDelta = deferred();

  const running = server.handleStream({
    id: 2,
    method: "turn/start",
    params: { threadId, input: [{ type: "text", text: "hello" }] },
  }, (message) => {
    messages.push(message);
    if (message.method === "item/agentMessage/delta" && deltaMessages([message])[0] === "first ") {
      firstDelta.resolve();
    }
  });

  await firstDelta.promise;
  assert.deepEqual(deltaMessages(messages), ["first "]);
  assert.equal(completedMessages(messages).length, 0);

  await running;
  assert.deepEqual(deltaMessages(messages), ["first ", "second"]);
  assert.equal((completedMessages(messages).at(-1)?.params as { status?: string }).status, "completed");
});

test("handleStream respects async sink backpressure", async () => {
  const workspaceDir = tempWorkspace();
  const server = createServer(workspaceDir, createFetchImpl([
    { delta: "one " },
    { delta: "two" },
  ]));
  const threadId = await startThread(server, workspaceDir);
  const firstDeltaSeen = deferred();
  const releaseFirstDelta = deferred();
  let secondDeltaSeen = false;

  const running = server.handleStream({
    id: 3,
    method: "turn/start",
    params: { threadId, input: [{ type: "text", text: "hello" }] },
  }, async (message) => {
    const delta = deltaMessages([message])[0];
    if (delta === "one ") {
      firstDeltaSeen.resolve();
      await releaseFirstDelta.promise;
    }
    if (delta === "two") {
      secondDeltaSeen = true;
    }
  });

  await firstDeltaSeen.promise;
  await delay(20);
  assert.equal(secondDeltaSeen, false);
  releaseFirstDelta.resolve();
  await running;
  assert.equal(secondDeltaSeen, true);
});

test("handle remains a compatibility collector for turn/start", async () => {
  const workspaceDir = tempWorkspace();
  const server = createServer(workspaceDir, createFetchImpl([
    { delta: "legacy " },
    { delta: "collector" },
  ]));
  const threadId = await startThread(server, workspaceDir);

  const messages = await server.handle({
    id: 4,
    method: "turn/start",
    params: { threadId, input: [{ type: "text", text: "hello" }] },
  });

  assert.deepEqual(deltaMessages(messages), ["legacy ", "collector"]);
  assert.equal((completedMessages(messages).at(-1)?.params as { status?: string }).status, "completed");
});

test("turn/start persists user and assistant messages with compact stream trace", async () => {
  const workspaceDir = tempWorkspace();
  const server = createServer(workspaceDir, createFetchImpl([
    { delta: "stored " },
    { delta: "reply" },
  ]));
  const threadId = await startThread(server, workspaceDir);

  await server.handle({
    id: 5,
    method: "turn/start",
    params: { threadId, input: [{ type: "text", text: "persist me" }] },
  });

  const session = new SessionStore(workspaceDir).getSession(threadId);
  assert.equal(session?.messages.length, 2);
  assert.equal(session?.messages[0]?.role, "user");
  assert.equal(session?.messages[0]?.content, "persist me");
  assert.equal(session?.messages[1]?.role, "assistant");
  assert.equal(session?.messages[1]?.content, "stored reply");
  assert.equal(session?.messages[1]?.metadata?.streamTrace?.kind, "assistant_stream_trace");
});

test("turn/start emits failure and persists a partial assistant once", async () => {
  const workspaceDir = tempWorkspace();
  const server = createServer(workspaceDir, createFailingFetchImpl());
  const threadId = await startThread(server, workspaceDir);

  const messages = await server.handle({
    id: 6,
    method: "turn/start",
    params: { threadId, input: [{ type: "text", text: "fail after partial" }] },
  });

  assert.deepEqual(deltaMessages(messages), ["partial reply"]);
  const completed = completedMessages(messages).at(-1);
  assert.equal((completed?.params as { status?: string }).status, "failed");

  const session = new SessionStore(workspaceDir).getSession(threadId);
  assert.equal(session?.messages.length, 2);
  assert.equal(session?.messages[1]?.role, "assistant");
  assert.equal(session?.messages[1]?.content, "partial reply");
  assert.equal(session?.messages[1]?.metadata?.partial, true);
});
