import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

import { extractCodexJsonlText, extractOpenClawCliText, splitTextIntoChunks, streamOpenClawSession, streamOpenClawSessionEvents, type StreamSessionDependencies } from "./stream.ts";

const execFileAsync = promisify(execFile);

test("extractOpenClawCliText and splitTextIntoChunks normalize CLI output", () => {
  const text = extractOpenClawCliText(JSON.stringify({
    result: {
      payloads: [{ text: "hello " }, { text: "world" }],
    },
  }));

  assert.equal(text, "hello world");
  assert.deepEqual(splitTextIntoChunks(text, 4), ["hell", "o wo", "rld"]);
});

test("extractOpenClawCliText tolerates gateway preamble and root payloads", () => {
  const text = extractOpenClawCliText(`Gateway agent failed; falling back to embedded: Error: gateway closed
Gateway target: ws://127.0.0.1:18789
{
  "payloads": [
    { "text": "Hi. " },
    { "text": "What can I help you with?" }
  ],
  "meta": {
    "aborted": false
  }
}`);

  assert.equal(text, "Hi. What can I help you with?");
});

test("extractCodexJsonlText normalizes Codex exec JSONL events", () => {
  const text = extractCodexJsonlText([
    JSON.stringify({ type: "turn_started" }),
    JSON.stringify({ type: "agent_message", message: "hello " }),
    JSON.stringify({ method: "codex/event", params: { msg: { type: "agent_message", message: "world" } } }),
    JSON.stringify({ type: "turn_completed" }),
  ].join("\n"));

  assert.equal(text, "hello world");
});

test("extractCodexJsonlText returns the final completed Codex agent message", () => {
  const text = extractCodexJsonlText([
    JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "I am checking the workspace." } }),
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Done. The file is attached." } }),
    JSON.stringify({ type: "turn.completed" }),
  ].join("\n"));

  assert.equal(text, "Done. The file is attached.");
});

test("streamOpenClawSession streams Codex app-server and can fall back to Codex exec JSONL", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-codex-stream-"));
  const codexBin = path.join(tempRoot, "codex");
  fs.writeFileSync(codexBin, `#!/usr/bin/env node
const readline = require("readline");
const args = process.argv.slice(2);

if (args[0] === "app-server") {
  const rl = readline.createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    const message = JSON.parse(line);
    if (message.method === "initialize") {
      process.stdout.write(JSON.stringify({ id: message.id, result: {} }) + "\\n");
    }
    if (message.method === "thread/start") {
      process.stdout.write(JSON.stringify({ id: message.id, result: { thread: { id: "thread-1" } } }) + "\\n");
    }
    if (message.method === "turn/start") {
      process.stdout.write(JSON.stringify({ method: "codex/event", params: { msg: { type: "agent_message", message: "app server reply" } } }) + "\\n");
      process.stdout.write(JSON.stringify({ method: "turn/completed", params: {} }) + "\\n");
    }
  });
  return;
}

if (args[0] === "exec") {
  process.stdout.write(JSON.stringify({ type: "agent_message", message: "exec reply" }) + "\\n");
  process.exit(0);
}

process.exit(1);
`, { mode: 0o755 });

  const adapter: StreamSessionDependencies["sessionAdapter"] = {
    transport: {
      kind: "hybrid",
      streaming: true,
      gatewayKind: "codex-app-server",
    },
    gateway: {
      kind: "codex-app-server",
      url: "stdio://codex-app-server",
      command: codexBin,
      args: ["app-server"],
    },
    fallbackGateway: null,
    buildCliInvocation(input) {
      return {
        command: codexBin,
        args: ["exec", "--json", input.prompt],
        parser: "codex-jsonl",
      };
    },
    supportsGateway: true,
  };

  const appServerChunks: string[] = [];
  for await (const chunk of streamOpenClawSession({
    sessionId: "codex-app-server",
    messages: [{ role: "user", content: "hello" }],
    chunkSize: 32,
  }, {
    sessionAdapter: adapter,
  })) {
    if (!chunk.done) appServerChunks.push(chunk.delta);
  }
  assert.deepEqual(appServerChunks, ["app server reply"]);

  const execChunks: string[] = [];
  for await (const chunk of streamOpenClawSession({
    sessionId: "codex-exec",
    messages: [{ role: "user", content: "hello" }],
    transport: "cli",
    chunkSize: 32,
  }, {
    sessionAdapter: adapter,
    runner: {
      exec: async (command, args) => {
        const { stdout, stderr } = await execFileAsync(command, args, { encoding: "utf8" });
        return { stdout, stderr, exitCode: 0 };
      },
    },
  })) {
    if (!chunk.done) execChunks.push(chunk.delta);
  }
  assert.deepEqual(execChunks, ["exec reply"]);
});

test("streamOpenClawSession streams via OpenAI responses when available", async () => {
  const encoder = new TextEncoder();
  const dependencies: StreamSessionDependencies = {
    gatewayConfig: {
      url: "http://127.0.0.1:18789",
      port: 18789,
      source: "explicit",
    },
    fetchImpl: async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('event: response.output_text.delta\ndata: {"delta":"ho"}\n\n'));
        controller.enqueue(encoder.encode('event: response.output_text.delta\ndata: {"delta":"la"}\n\n'));
        controller.close();
      },
    }), { status: 200 }),
  };

  const chunks: string[] = [];
  for await (const chunk of streamOpenClawSession({
    sessionId: "session-1",
    messages: [{ role: "user", content: "hello" }],
  }, dependencies)) {
    if (!chunk.done) chunks.push(chunk.delta);
  }

  assert.deepEqual(chunks, ["ho", "la"]);
});

test("streamOpenClawSession falls back to CLI when gateway is unavailable", async () => {
  const chunks: string[] = [];
  for await (const chunk of streamOpenClawSession({
    sessionId: "session-1",
    agentId: "agent-1",
    messages: [{ role: "user", content: "hello" }],
    chunkSize: 3,
  }, {
    gatewayConfig: {
      url: "http://127.0.0.1:18789",
      port: 18789,
      source: "explicit",
    },
    fetchImpl: async () => new Response("boom", { status: 500 }),
    runner: {
      async exec() {
        return {
          stdout: JSON.stringify({
            result: {
              payloads: [{ text: "hello world" }],
            },
          }),
          stderr: "",
          exitCode: 0,
        };
      },
    },
  })) {
    if (!chunk.done) chunks.push(chunk.delta);
  }

  assert.deepEqual(chunks, ["hel", "lo ", "wor", "ld"]);
});

test("streamOpenClawSession falls back from responses to chat completions for text-only payloads", async () => {
  let calls = 0;
  const chunks: string[] = [];
  const adapter: StreamSessionDependencies["sessionAdapter"] = {
    transport: {
      kind: "hybrid",
      streaming: true,
      gatewayKind: "openai-responses",
    },
    gateway: {
      kind: "openai-responses",
      url: "http://127.0.0.1:18789",
    },
    fallbackGateway: {
      kind: "openai-chat-completions",
      url: "http://127.0.0.1:18789",
    },
    buildCliInvocation() {
      throw new Error("not used");
    },
    supportsGateway: true,
  };

  for await (const chunk of streamOpenClawSession({
    sessionId: "session-responses-fallback",
    messages: [{ role: "user", content: "hello" }],
  }, {
    sessionAdapter: adapter,
    fetchImpl: async (_url, init) => {
      calls += 1;
      const body = JSON.parse(String(init?.body ?? "{}")) as { stream?: boolean };
      if (calls === 1) {
        return new Response("responses failed", { status: 500 });
      }
      if (body.stream) {
        return new Response([
          'data: {"choices":[{"delta":{"content":"fallback"}}]}\n',
          "data: [DONE]\n",
        ].join(""), {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      return new Response("{}", { status: 200 });
    },
  })) {
    if (!chunk.done) chunks.push(chunk.delta);
  }

  assert.deepEqual(chunks, ["fallback"]);
});

test("streamOpenClawSession parses CLI fallback output with preamble logs", async () => {
  const chunks: string[] = [];
  for await (const chunk of streamOpenClawSession({
    sessionId: "session-cli-preamble",
    agentId: "agent-1",
    messages: [{ role: "user", content: "hello" }],
    chunkSize: 6,
    transport: "cli",
  }, {
    runner: {
      async exec() {
        return {
          stdout: "",
          stderr: `Gateway agent failed; falling back to embedded: Error: gateway closed
Gateway target: ws://127.0.0.1:18789
{
  "payloads": [
    { "text": "hello world" }
  ]
}`,
          exitCode: 0,
        };
      },
    },
  })) {
    if (!chunk.done) chunks.push(chunk.delta);
  }

  assert.deepEqual(chunks, ["hello ", "world"]);
});

test("streamOpenClawSessionEvents emits chunk and title events", async () => {
  const dependencies: StreamSessionDependencies = {
    gatewayConfig: {
      url: "http://127.0.0.1:18789",
      port: 18789,
      source: "explicit",
    },
    fetchImpl: async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: response.output_text.delta\ndata: {"delta":"Plan"}\n\n'));
        controller.enqueue(new TextEncoder().encode('event: response.output_text.delta\ndata: {"delta":" a launch checklist"}\n\n'));
        controller.close();
      },
    }), { status: 200 }),
  };

  const events: Array<{ type: string; value?: string }> = [];
  for await (const event of streamOpenClawSessionEvents({
    sessionId: "session-2",
    messages: [{ role: "user", content: "Plan a launch checklist" }],
  }, dependencies)) {
    if (event.type === "transport") {
      events.push({ type: event.type });
    } else if (event.type === "chunk") {
      events.push({ type: event.type, value: event.chunk.delta });
    } else if (event.type === "done") {
      events.push({ type: event.type });
    } else if (event.type === "title") {
      events.push({ type: event.type, value: event.title });
    }
  }

  assert.deepEqual(events, [
    { type: "transport" },
    { type: "chunk", value: "Plan" },
    { type: "chunk", value: " a launch checklist" },
    { type: "done" },
    { type: "title", value: "Plan a launch checklist" },
  ]);
});

test("streamOpenClawSession retries gateway failures and emits aborted/error events", async () => {
  let attempts = 0;
  const retryChunks: string[] = [];
  for await (const chunk of streamOpenClawSession({
    sessionId: "session-retry",
    messages: [{ role: "user", content: "hello" }],
    transport: "gateway",
    gatewayRetries: 1,
  }, {
    gatewayConfig: {
      url: "http://127.0.0.1:18789",
      port: 18789,
      source: "explicit",
    },
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) {
        return new Response("boom", { status: 500 });
      }
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('event: response.output_text.delta\ndata: {"delta":"ok"}\n\n'));
          controller.close();
        },
      }), { status: 200 });
    },
  })) {
    if (!chunk.done) retryChunks.push(chunk.delta);
  }
  assert.deepEqual(retryChunks, ["ok"]);

  attempts = 0;
  const retryEvents: string[] = [];
  for await (const event of streamOpenClawSessionEvents({
    sessionId: "session-retry-events",
    messages: [{ role: "user", content: "hello" }],
    transport: "gateway",
    gatewayRetries: 1,
  }, {
    gatewayConfig: {
      url: "http://127.0.0.1:18789",
      port: 18789,
      source: "explicit",
    },
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) {
        return new Response("boom", { status: 500 });
      }
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('event: response.output_text.delta\ndata: {"delta":"ok"}\n\n'));
          controller.close();
        },
      }), { status: 200 });
    },
  })) {
    retryEvents.push(event.type);
  }
  assert.deepEqual(retryEvents, ["transport", "retry", "chunk", "done", "title"]);

  const abortController = new AbortController();
  abortController.abort("user_cancelled");
  const abortedEvents: Array<{ type: string; reason?: string }> = [];
  for await (const event of streamOpenClawSessionEvents({
    sessionId: "session-abort",
    messages: [{ role: "user", content: "hello" }],
    signal: abortController.signal,
  }, {
    gatewayConfig: {
      url: "http://127.0.0.1:18789",
      port: 18789,
      source: "explicit",
    },
    fetchImpl: async () => new Response("should-not-run", { status: 200 }),
  })) {
    abortedEvents.push({
      type: event.type,
      ...("reason" in event ? { reason: event.reason } : {}),
    });
  }
  assert.deepEqual(abortedEvents, [{ type: "aborted", reason: "user_cancelled" }]);

  const errorEvents: Array<{ type: string; partialText?: string }> = [];
  for await (const event of streamOpenClawSessionEvents({
    sessionId: "session-error",
    messages: [{ role: "user", content: "hello" }],
    transport: "gateway",
  }, {
    gatewayConfig: {
      url: "http://127.0.0.1:18789",
      port: 18789,
      source: "explicit",
    },
    fetchImpl: async () => new Response("boom", { status: 500 }),
  })) {
    errorEvents.push({
      type: event.type,
      ...("partialText" in event ? { partialText: event.partialText } : {}),
    });
  }
  assert.deepEqual(errorEvents, [{ type: "transport" }, { type: "error" }]);
});

test("streamOpenClawSession resolves persisted documents for responses payloads", async () => {
  let requestBody: Record<string, unknown> | null = null;
  const dependencies: StreamSessionDependencies = {
    gatewayConfig: {
      url: "http://127.0.0.1:18789",
      port: 18789,
      source: "explicit",
    },
    documentResolver: async () => [{
      name: "budget.pdf",
      mimeType: "application/pdf",
      data: "YmFkZ2V0",
    }],
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('event: response.output_text.delta\ndata: {"delta":"ok"}\n\n'));
          controller.close();
        },
      }), { status: 200 });
    },
  };

  const chunks: string[] = [];
  for await (const chunk of streamOpenClawSession({
    sessionId: "session-docs",
    messages: [{
      role: "user",
      content: "Review the budget",
      documents: [{
        documentId: "doc-1",
        name: "budget.pdf",
        mimeType: "application/pdf",
        sizeBytes: 12,
      }],
    }],
  }, dependencies)) {
    if (!chunk.done) chunks.push(chunk.delta);
  }

  assert.deepEqual(chunks, ["ok"]);
  assert.match(JSON.stringify(requestBody), /input_file/);
  assert.match(JSON.stringify(requestBody), /budget\.pdf/);
});

test("streamOpenClawSessionEvents falls back from gateway to CLI with transport events", async () => {
  const events: string[] = [];
  for await (const event of streamOpenClawSessionEvents({
    sessionId: "session-fallback",
    agentId: "agent-1",
    messages: [{ role: "user", content: "hello" }],
    transport: "auto",
  }, {
    gatewayConfig: {
      url: "http://127.0.0.1:18789",
      port: 18789,
      source: "explicit",
    },
    fetchImpl: async () => new Response("boom", { status: 500 }),
    runner: {
      async exec() {
        return {
          stdout: JSON.stringify({
            result: {
              payloads: [{ text: "fallback reply" }],
            },
          }),
          stderr: "",
          exitCode: 0,
        };
      },
    },
  })) {
    events.push(event.type === "transport" ? `${event.type}:${event.transport}:${String(event.fallback)}` : event.type);
  }

  assert.deepEqual(events, ["transport:gateway:false", "transport:gateway:true", "transport:cli:true", "chunk", "done", "title"]);
});
