import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { WebSocket } from "ws";

import { RecorderExecutor } from "../src/command-executor.ts";
import { ComputerUse } from "../src/computer-use.ts";
import type { BridgeConfig } from "../src/config.ts";
import { createBridgeRuntime } from "../src/server.ts";
import { TerminalManager } from "../src/terminal.ts";

let portCursor = 22_000;
function nextPortPair(): [number, number] {
  const a = portCursor;
  const b = portCursor + 1;
  portCursor += 2;
  return [a, b];
}

async function withRuntime(opts: {
  computerUse?: ComputerUse;
  terminal?: TerminalManager;
}): Promise<{
  runtime: ReturnType<typeof createBridgeRuntime>;
  config: BridgeConfig;
  cleanup: () => Promise<void>;
}> {
  const workdir = await mkdtemp(join(tmpdir(), "clawjs-tcc-"));
  const [bridgePort, httpPort] = nextPortPair();
  const config: BridgeConfig = {
    bridgePort,
    httpPort,
    bindAddress: "127.0.0.1",
    dbPath: join(workdir, "runtime.sqlite"),
    statusPath: join(workdir, "state", "bridge-status.json"),
    displayName: "TCC Mac",
    bonjourEnabled: false,
    version: "0.0.0-test",
    capabilities: ["bridge"],
  };
  const runtime = createBridgeRuntime({
    config,
    computerUse: opts.computerUse,
    terminal: opts.terminal,
  });
  await runtime.start();
  return {
    runtime,
    config,
    cleanup: async () => {
      await runtime.stop();
      await rm(workdir, { recursive: true, force: true });
    },
  };
}

async function makeMacComputerUse(opts: {
  hasCliclick?: boolean;
} = {}): Promise<ComputerUse> {
  const executor = new RecorderExecutor((input) => {
    if (input.command === "screencapture") {
      return { exitCode: 0, stdout: Buffer.from([0x89, 0x50, 0x4e, 0x47]) };
    }
    if (input.command === "osascript" || input.command === "cliclick") {
      return { exitCode: 0 };
    }
    return { exitCode: 1 };
  });
  executor.knownBinaries.add("screencapture");
  executor.knownBinaries.add("osascript");
  if (opts.hasCliclick !== false) executor.knownBinaries.add("cliclick");
  const cu = new ComputerUse({ executor, platform: "darwin" });
  await cu.refreshCapabilities();
  return cu;
}

interface InboundFrame {
  kind: string;
  id?: string;
  payload?: unknown;
}

async function openWs(port: number, token: string): Promise<WebSocket> {
  const ws = new WebSocket(
    `ws://127.0.0.1:${port}/bridge?token=${encodeURIComponent(token)}`,
  );
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  return ws;
}

function bindObserver(ws: WebSocket, requestId: string): {
  events: InboundFrame[];
  response: Promise<InboundFrame>;
  detach: () => void;
} {
  const events: InboundFrame[] = [];
  let resolveResponse!: (frame: InboundFrame) => void;
  const response = new Promise<InboundFrame>((resolve) => {
    resolveResponse = resolve;
  });
  const onMessage = (raw: Buffer) => {
    const f = JSON.parse(raw.toString("utf8")) as InboundFrame;
    if (f.id !== requestId) return;
    if (f.kind === "response") resolveResponse(f);
    else events.push(f);
  };
  ws.on("message", onMessage);
  return { events, response, detach: () => ws.off("message", onMessage) };
}

test("identity advertises tcc capabilities when surfaces are configured", async () => {
  const cu = await makeMacComputerUse({ hasCliclick: false });
  const tm = new TerminalManager({ parentEnv: { PATH: "/bin" } });
  const h = await withRuntime({ computerUse: cu, terminal: tm });
  try {
    const res = await fetch(
      `http://127.0.0.1:${h.config.httpPort}/v1/mesh/identity`,
      { headers: { authorization: `Bearer ${h.runtime.identity.bearerToken}` } },
    );
    const body = (await res.json()) as { capabilities: string[] };
    assert.ok(body.capabilities.includes("tcc.computer.screenshot"));
    assert.ok(body.capabilities.includes("tcc.computer.input.keystroke"));
    assert.ok(body.capabilities.includes("tcc.terminal.spawn"));
    assert.ok(!body.capabilities.includes("tcc.computer.input.click"));
  } finally {
    await h.cleanup();
  }
});

test("WS request tcc.computer.screenshot returns base64 bytes", async () => {
  const cu = await makeMacComputerUse();
  const h = await withRuntime({ computerUse: cu });
  const ws = await openWs(h.config.bridgePort, h.runtime.identity.bearerToken);
  try {
    const obs = bindObserver(ws, "r-shot");
    ws.send(
      JSON.stringify({
        kind: "request",
        id: "r-shot",
        payload: { method: "tcc.computer.screenshot" },
      }),
    );
    const res = await obs.response;
    obs.detach();
    const payload = res.payload as { ok: boolean; result: { format: string; base64: string } };
    assert.equal(payload.ok, true);
    assert.equal(payload.result.format, "png");
    const decoded = Buffer.from(payload.result.base64, "base64");
    assert.equal(decoded[0], 0x89);
  } finally {
    ws.close();
    await delay(20);
    await h.cleanup();
  }
});

test("WS request tcc.terminal.spawn streams stdout and exit events", async () => {
  const tm = new TerminalManager({ parentEnv: { PATH: "/bin" } });
  const h = await withRuntime({ terminal: tm });
  const ws = await openWs(h.config.bridgePort, h.runtime.identity.bearerToken);
  try {
    const obs = bindObserver(ws, "r-spawn");
    ws.send(
      JSON.stringify({
        kind: "request",
        id: "r-spawn",
        payload: {
          method: "tcc.terminal.spawn",
          command: "/bin/echo",
          args: ["hola", "tcc"],
        },
      }),
    );
    const res = await obs.response;
    const result = (res.payload as { ok: boolean; result: { id: string } });
    assert.equal(result.ok, true);
    // wait until exit event arrives
    const deadline = Date.now() + 1_000;
    while (
      !obs.events.some((e) => (e.payload as { method?: string })?.method === "tcc.terminal.exit") &&
      Date.now() < deadline
    ) {
      await delay(20);
    }
    obs.detach();
    const methods = obs.events.map(
      (e) => (e.payload as { method?: string })?.method,
    );
    assert.ok(methods.includes("tcc.terminal.stdout"), `missing stdout, saw: ${methods.join(",")}`);
    assert.ok(methods.includes("tcc.terminal.exit"), `missing exit, saw: ${methods.join(",")}`);
  } finally {
    ws.close();
    await delay(20);
    await h.cleanup();
  }
});

test("WS request tcc.computer.click returns ok:false when capability missing", async () => {
  const cu = await makeMacComputerUse({ hasCliclick: false });
  const h = await withRuntime({ computerUse: cu });
  const ws = await openWs(h.config.bridgePort, h.runtime.identity.bearerToken);
  try {
    const obs = bindObserver(ws, "r-click");
    ws.send(
      JSON.stringify({
        kind: "request",
        id: "r-click",
        payload: { method: "tcc.computer.click", x: 10, y: 10 },
      }),
    );
    const res = await obs.response;
    obs.detach();
    const payload = res.payload as { ok: boolean; error?: string };
    assert.equal(payload.ok, false);
    assert.match(payload.error ?? "", /cliclick/);
  } finally {
    ws.close();
    await delay(20);
    await h.cleanup();
  }
});

test("audit store records proxyExec for screenshot via WS", async () => {
  const cu = await makeMacComputerUse();
  const h = await withRuntime({ computerUse: cu });
  const ws = await openWs(h.config.bridgePort, h.runtime.identity.bearerToken);
  try {
    const obs = bindObserver(ws, "r-audit");
    ws.send(
      JSON.stringify({
        kind: "request",
        id: "r-audit",
        payload: { method: "tcc.computer.screenshot" },
      }),
    );
    await obs.response;
    obs.detach();
    await delay(20);
    const proxyExecs = h.runtime.auditStore.list({ action: "proxyExec" });
    assert.ok(
      proxyExecs.some(
        (e) =>
          e.context &&
          typeof e.context === "object" &&
          (e.context as Record<string, unknown>).method ===
            "tcc.computer.screenshot",
      ),
    );
  } finally {
    ws.close();
    await delay(20);
    await h.cleanup();
  }
});
