import { test } from "vitest";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CodexRuntime, type CodexEvent } from "../src/codex-runtime.ts";
import { handleCodexJob } from "../src/codex-job-handler.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fakePath = join(here, "fake-codex.mjs");

function makeRuntime(env: NodeJS.ProcessEnv = {}): CodexRuntime {
  return new CodexRuntime({
    command: process.execPath,
    args: [fakePath],
    env: { ...process.env, ...env },
    startupTimeoutMs: 5_000,
    requestTimeoutMs: 5_000,
    shutdownTimeoutMs: 1_000,
    autoRestart: false,
    maxRestartAttempts: 0,
  });
}

test("startThread returns a fresh thread id", async () => {
  const rt = makeRuntime();
  await rt.start();
  const out = await handleCodexJob({ runtime: rt }, { method: "codex.startThread" }, "j-1");
  assert.equal(out.ok, true);
  if (!out.ok) throw new Error("expected ok");
  const result = out.result as { thread: { id: string } };
  assert.match(result.thread.id, /^thread-\d+$/);
  await rt.stop();
});

test("sendTurn awaits turn/completed and returns agent text", async () => {
  const rt = makeRuntime();
  await rt.start();
  const thread = (await rt.request<{ thread: { id: string } }>(
    "thread/start",
  )).thread;
  const emitted: CodexEvent[] = [];
  const out = await handleCodexJob(
    {
      runtime: rt,
      emit: (event) => emitted.push(event),
      awaitCompletionTimeoutMs: 5_000,
    },
    {
      method: "codex.sendTurn",
      threadId: thread.id,
      input: "hola",
    },
    "j-2",
  );
  assert.equal(out.ok, true);
  if (!out.ok) throw new Error("expected ok");
  const result = out.result as { turnId: string; agentText?: string };
  assert.match(result.turnId, /^turn-/);
  assert.equal(result.agentText, "echo: hola");
  const methods = emitted.map((e) => e.method);
  assert.ok(methods.includes("turn/started"));
  assert.ok(methods.includes("turn/completed"));
  await rt.stop();
});

test("sendTurn without awaitCompletion returns the turnId immediately", async () => {
  const rt = makeRuntime({ FAKE_CODEX_TURN_DELAY_MS: "300" });
  await rt.start();
  const out = await handleCodexJob(
    { runtime: rt },
    {
      method: "codex.sendTurn",
      threadId: "thread-1",
      input: "fast",
      awaitCompletion: false,
    },
    "j-3",
  );
  assert.equal(out.ok, true);
  if (!out.ok) throw new Error("expected ok");
  const result = out.result as { turnId: string };
  assert.match(result.turnId, /^turn-/);
  await rt.stop();
});

test("cancelTurn cancels and reports cancelled", async () => {
  const rt = makeRuntime({ FAKE_CODEX_TURN_DELAY_MS: "300" });
  await rt.start();
  const start = await rt.request<{ turnId: string }>("turn/start", {
    threadId: "thread-1",
    input: "slow",
  });
  const out = await handleCodexJob(
    { runtime: rt },
    { method: "codex.cancelTurn", turnId: start.turnId },
    "j-4",
  );
  assert.equal(out.ok, true);
  if (!out.ok) throw new Error("expected ok");
  const result = out.result as { cancelled: boolean };
  assert.equal(result.cancelled, true);
  await rt.stop();
});

test("invalid input returns an error outcome instead of throwing", async () => {
  const rt = makeRuntime();
  await rt.start();
  const out = await handleCodexJob(
    { runtime: rt },
    { method: "not.a.thing" },
    "j-5",
  );
  assert.equal(out.ok, false);
  if (out.ok) throw new Error("expected failure");
  assert.match(out.error, /invalid codex job/);
  await rt.stop();
});

test("runtime not ready returns a not-ready error", async () => {
  const rt = makeRuntime();
  // No start() called; runtime is idle.
  const out = await handleCodexJob(
    { runtime: rt },
    { method: "codex.startThread" },
    "j-6",
  );
  assert.equal(out.ok, false);
  if (out.ok) throw new Error("expected failure");
  assert.match(out.error, /not ready/i);
});

test("status returns the runtime state without RPC", async () => {
  const rt = makeRuntime();
  await rt.start();
  const out = await handleCodexJob(
    { runtime: rt },
    { method: "codex.status" },
    "j-7",
  );
  assert.equal(out.ok, true);
  if (!out.ok) throw new Error("expected ok");
  const result = out.result as { state: string; ready: boolean };
  assert.equal(result.state, "ready");
  assert.equal(result.ready, true);
  await rt.stop();
});
