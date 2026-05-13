import { test } from "vitest";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

import {
  CodexRuntime,
  CodexRuntimeError,
  type CodexEvent,
} from "../src/codex-runtime.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fakePath = join(here, "fake-codex.mjs");

interface FakeOptions {
  env?: NodeJS.ProcessEnv;
  startupTimeoutMs?: number;
  requestTimeoutMs?: number;
  autoRestart?: boolean;
  maxRestartAttempts?: number;
}

function makeRuntime(opts: FakeOptions = {}): CodexRuntime {
  return new CodexRuntime({
    command: process.execPath,
    args: [fakePath],
    env: { ...process.env, ...opts.env },
    startupTimeoutMs: opts.startupTimeoutMs ?? 5_000,
    requestTimeoutMs: opts.requestTimeoutMs ?? 5_000,
    shutdownTimeoutMs: 1_000,
    autoRestart: opts.autoRestart ?? false,
    maxRestartAttempts: opts.maxRestartAttempts ?? 0,
  });
}

test("starts, becomes ready, and stops cleanly", async () => {
  const rt = makeRuntime();
  await rt.start();
  assert.equal(rt.isReady, true);
  assert.equal(rt.currentState, "ready");
  await rt.stop();
  assert.equal(rt.currentState, "stopped");
});

test("request returns the result for a known method", async () => {
  const rt = makeRuntime();
  await rt.start();
  const result = await rt.request<{ thread: { id: string } }>("thread/start");
  assert.match(result.thread.id, /^thread-\d+$/);
  await rt.stop();
});

test("request rejects with rpc error for unknown method", async () => {
  const rt = makeRuntime();
  await rt.start();
  await assert.rejects(rt.request("does/not/exist"), CodexRuntimeError);
  await rt.stop();
});

test("turn/start streams events that listeners observe", async () => {
  const rt = makeRuntime();
  await rt.start();
  const thread = (await rt.request<{ thread: { id: string } }>(
    "thread/start",
  )).thread;
  const events: CodexEvent[] = [];
  rt.on("event", (event: CodexEvent) => events.push(event));
  await rt.request("turn/start", { threadId: thread.id, input: "hola" });
  await delay(60);
  const methods = events.map((e) => e.method);
  assert.ok(methods.includes("turn/started"));
  assert.ok(methods.includes("item/completed"));
  assert.ok(methods.includes("turn/completed"));
  await rt.stop();
});

test("turn/cancel cancels an in-flight turn and emits turn/cancelled", async () => {
  const rt = makeRuntime({ env: { FAKE_CODEX_TURN_DELAY_MS: "200" } });
  await rt.start();
  const events: CodexEvent[] = [];
  rt.on("event", (event: CodexEvent) => events.push(event));
  const start = await rt.request<{ turnId: string }>(
    "turn/start",
    { input: "slow" },
  );
  await rt.request("turn/cancel", { turnId: start.turnId });
  await delay(250);
  const methods = events.map((e) => e.method);
  assert.ok(methods.includes("turn/cancelled"));
  assert.ok(!methods.includes("turn/completed"));
  await rt.stop();
});

test("request honours AbortSignal", async () => {
  const rt = makeRuntime({
    env: { FAKE_CODEX_RESPONSE_DELAY_MS: "500" },
  });
  await rt.start();
  const ac = new AbortController();
  const promise = rt.request("turn/start", { input: "block" }, { signal: ac.signal });
  await delay(20);
  ac.abort();
  await assert.rejects(promise, (err: unknown) => {
    return err instanceof CodexRuntimeError && err.code === "aborted";
  });
  await rt.stop();
});

test("start fails if initialize errors out", async () => {
  const rt = makeRuntime({ env: { FAKE_CODEX_FAIL_INIT: "1" } });
  await assert.rejects(rt.start(), CodexRuntimeError);
  assert.equal(rt.currentState, "stopped");
});

test("auto-restart spawns a new process after unexpected exit", async () => {
  const rt = new CodexRuntime({
    command: process.execPath,
    args: [fakePath],
    env: { ...process.env, FAKE_CODEX_CRASH_AFTER_INIT: "1" },
    startupTimeoutMs: 5_000,
    requestTimeoutMs: 5_000,
    shutdownTimeoutMs: 500,
    autoRestart: true,
    maxRestartAttempts: 2,
    restartBaseDelayMs: 30,
  });
  let exits = 0;
  let readys = 0;
  rt.on("exit", () => {
    exits += 1;
    if (exits === 1) {
      // Disable further crashes so the auto-restart actually stays up.
      delete process.env.FAKE_CODEX_CRASH_AFTER_INIT;
    }
  });
  rt.on("ready", () => {
    readys += 1;
  });
  await rt.start();
  assert.equal(readys, 1);
  await delay(300);
  assert.equal(exits >= 1, true);
  assert.equal(readys >= 2, true);
  await rt.stop();
});

test("restart() stops and re-initializes a healthy runtime", async () => {
  const rt = makeRuntime();
  await rt.start();
  assert.equal(rt.isReady, true);
  await rt.restart();
  assert.equal(rt.isReady, true);
  await rt.stop();
});

test("rejects requests when the runtime is not started", async () => {
  const rt = makeRuntime();
  await assert.rejects(rt.request("anything"), (err: unknown) => {
    return err instanceof CodexRuntimeError && err.code === "not-started";
  });
});
