import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

import { WebSocket } from "ws";

import { createBridgeRuntime } from "../src/server.ts";
import type { BridgeConfig } from "../src/config.ts";
import type { CodexRuntimeOptions } from "../src/codex-runtime.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fakePath = join(here, "fake-codex.mjs");

let portCursor = 19_000;
function nextPortPair(): [number, number] {
  const a = portCursor;
  const b = portCursor + 1;
  portCursor += 2;
  return [a, b];
}

async function withRuntime(
  codexEnv: NodeJS.ProcessEnv = {},
): Promise<{
  runtime: ReturnType<typeof createBridgeRuntime>;
  config: BridgeConfig;
  workdir: string;
  cleanup: () => Promise<void>;
}> {
  const workdir = await mkdtemp(join(tmpdir(), "clawjs-codex-"));
  const [bridgePort, httpPort] = nextPortPair();
  const config: BridgeConfig = {
    bridgePort,
    httpPort,
    bindAddress: "127.0.0.1",
    dbPath: join(workdir, "runtime.sqlite"),
    statusPath: join(workdir, "state", "bridge-status.json"),
    displayName: "Codex Mac",
    bonjourEnabled: false,
    version: "0.0.0-test",
    capabilities: ["bridge"],
  };
  const codex: CodexRuntimeOptions = {
    command: process.execPath,
    args: [fakePath],
    env: { ...process.env, ...codexEnv },
    startupTimeoutMs: 5_000,
    requestTimeoutMs: 5_000,
    shutdownTimeoutMs: 1_000,
    autoRestart: false,
    maxRestartAttempts: 0,
  };
  const runtime = createBridgeRuntime({ config, codex });
  await runtime.start();
  return {
    runtime,
    config,
    workdir,
    cleanup: async () => {
      await runtime.stop();
      await rm(workdir, { recursive: true, force: true });
    },
  };
}

test("identity advertises 'codex' capability when codex is enabled", async () => {
  const h = await withRuntime();
  const res = await fetch(
    `http://127.0.0.1:${h.config.httpPort}/v1/mesh/identity`,
    { headers: { authorization: `Bearer ${h.runtime.identity.bearerToken}` } },
  );
  const body = (await res.json()) as { capabilities: string[] };
  assert.ok(body.capabilities.includes("codex"));
  await h.cleanup();
});

test("WS request 'codex.startThread' returns a thread id", async () => {
  const h = await withRuntime();
  const ws = new WebSocket(
    `ws://127.0.0.1:${h.config.bridgePort}/bridge?token=${encodeURIComponent(
      h.runtime.identity.bearerToken,
    )}`,
  );
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  const response = await sendAndCollect(ws, {
    kind: "request",
    id: "r-thread",
    payload: { method: "codex.startThread" },
  });
  assert.equal(response.kind, "response");
  const payload = response.payload as {
    ok: boolean;
    result: { thread: { id: string } };
  };
  assert.equal(payload.ok, true);
  assert.match(payload.result.thread.id, /^thread-\d+$/);
  ws.close();
  await delay(50);
  await h.cleanup();
});

test("WS request 'codex.sendTurn' streams events and returns agent text", async () => {
  const h = await withRuntime();
  const ws = new WebSocket(
    `ws://127.0.0.1:${h.config.bridgePort}/bridge?token=${encodeURIComponent(
      h.runtime.identity.bearerToken,
    )}`,
  );
  await new Promise<void>((resolve) => ws.once("open", () => resolve()));

  const startResponse = await sendAndCollect(ws, {
    kind: "request",
    id: "r-thread",
    payload: { method: "codex.startThread" },
  });
  const threadId = (
    startResponse.payload as { result: { thread: { id: string } } }
  ).result.thread.id;

  const events: { method: string; params?: unknown }[] = [];
  const finalResponse = await sendAndCollect(
    ws,
    {
      kind: "request",
      id: "r-turn",
      payload: {
        method: "codex.sendTurn",
        threadId,
        input: "ping",
      },
    },
    (frame) => {
      if (frame.kind === "event" && frame.id === "r-turn") {
        events.push(frame.payload as { method: string; params?: unknown });
      }
    },
  );

  const final = finalResponse.payload as {
    ok: boolean;
    result: { agentText?: string; turnId: string };
  };
  assert.equal(final.ok, true);
  assert.equal(final.result.agentText, "echo: ping");
  const methods = events.map((e) => e.method);
  assert.ok(methods.includes("turn/started"));
  assert.ok(methods.includes("item/completed"));
  assert.ok(methods.includes("turn/completed"));

  ws.close();
  await delay(50);
  await h.cleanup();
});

test("WS request with bad codex method returns ok:false outcome", async () => {
  const h = await withRuntime();
  const ws = new WebSocket(
    `ws://127.0.0.1:${h.config.bridgePort}/bridge?token=${encodeURIComponent(
      h.runtime.identity.bearerToken,
    )}`,
  );
  await new Promise<void>((resolve) => ws.once("open", () => resolve()));
  const response = await sendAndCollect(ws, {
    kind: "request",
    id: "r-bad",
    payload: { method: "codex.notAThing" },
  });
  const payload = response.payload as { ok: boolean; error?: string };
  assert.equal(payload.ok, false);
  assert.match(payload.error ?? "", /invalid codex job/);
  ws.close();
  await delay(50);
  await h.cleanup();
});

interface InboundFrame {
  kind: string;
  id?: string;
  payload?: unknown;
}

async function sendAndCollect(
  ws: WebSocket,
  outgoing: InboundFrame,
  onIntermediate?: (frame: InboundFrame) => void,
): Promise<InboundFrame> {
  return new Promise<InboundFrame>((resolve, reject) => {
    const onMessage = (data: Buffer) => {
      let frame: InboundFrame;
      try {
        frame = JSON.parse(data.toString("utf8"));
      } catch (err) {
        reject(err);
        return;
      }
      if (frame.id !== outgoing.id) return;
      if (frame.kind === "response") {
        ws.off("message", onMessage);
        resolve(frame);
      } else {
        onIntermediate?.(frame);
      }
    };
    ws.on("message", onMessage);
    ws.send(JSON.stringify(outgoing));
  });
}
