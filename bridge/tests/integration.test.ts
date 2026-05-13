import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import Database from "better-sqlite3";
import { WebSocket } from "ws";

import {
  BridgeStatusSchema,
  BonjourAnnouncer,
  toBase64Url,
  generateAgreementKeypair,
  generateSigningKeypair,
} from "@clawjs/mesh";

import { createBridgeRuntime } from "../src/server.ts";
import type { BridgeConfig } from "../src/config.ts";

interface IntegrationHarness {
  config: BridgeConfig;
  workdir: string;
  runtime: ReturnType<typeof createBridgeRuntime>;
  cleanup: () => Promise<void>;
}

let portCursor = 17_000;

function nextPortPair(): [number, number] {
  const a = portCursor;
  const b = portCursor + 1;
  portCursor += 2;
  return [a, b];
}

async function makeHarness(): Promise<IntegrationHarness> {
  const workdir = await mkdtemp(join(tmpdir(), "clawjs-bridge-"));
  const [bridgePort, httpPort] = nextPortPair();
  const config: BridgeConfig = {
    bridgePort,
    httpPort,
    bindAddress: "127.0.0.1",
    dbPath: join(workdir, "runtime.sqlite"),
    statusPath: join(workdir, "state", "bridge-status.json"),
    displayName: "Test Mac",
    bonjourEnabled: false,
    version: "0.0.0-test",
    capabilities: ["bridge", "test"],
  };
  const runtime = createBridgeRuntime({ config });
  await runtime.start();
  return {
    config,
    workdir,
    runtime,
    cleanup: async () => {
      await runtime.stop();
      await rm(workdir, { recursive: true, force: true });
    },
  };
}

test("bridge runtime exposes /v1/mesh/identity over HTTP", async () => {
  const h = await makeHarness();
  const res = await fetch(
    `http://127.0.0.1:${h.config.httpPort}/v1/mesh/identity`,
    {
      headers: { authorization: `Bearer ${h.runtime.identity.bearerToken}` },
    },
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.nodeId, h.runtime.identity.nodeId);
  assert.equal(body.displayName, "Test Mac");
  assert.deepEqual(body.capabilities, ["bridge", "test"]);
  assert.ok(Array.isArray(body.endpoints));
  await h.cleanup();
});

test("bridge runtime accepts WS upgrade on /bridge with bearer", async () => {
  const h = await makeHarness();
  const url = `ws://127.0.0.1:${h.config.bridgePort}/bridge?token=${encodeURIComponent(
    h.runtime.identity.bearerToken,
  )}`;
  const ws = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  ws.close();
  await delay(50);
  await h.cleanup();
});

test("bridge runtime writes a heartbeat file at startup", async () => {
  const h = await makeHarness();
  const text = await readFile(h.config.statusPath, "utf8");
  const status = BridgeStatusSchema.parse(JSON.parse(text));
  assert.equal(status.nodeId, h.runtime.identity.nodeId);
  assert.equal(status.bridgePort, h.config.bridgePort);
  assert.equal(status.httpPort, h.config.httpPort);
  await h.cleanup();
});

test("bridge runtime persists its identity across restarts", async () => {
  const workdir = await mkdtemp(join(tmpdir(), "clawjs-bridge-persist-"));
  const [bridgePort, httpPort] = nextPortPair();
  const config: BridgeConfig = {
    bridgePort,
    httpPort,
    bindAddress: "127.0.0.1",
    dbPath: join(workdir, "runtime.sqlite"),
    statusPath: join(workdir, "state", "bridge-status.json"),
    displayName: "Persistent Mac",
    bonjourEnabled: false,
    version: "0.0.0-test",
    capabilities: ["bridge"],
  };
  const first = createBridgeRuntime({ config });
  await first.start();
  const firstNodeId = first.identity.nodeId;
  const firstToken = first.identity.bearerToken;
  await first.stop();

  const second = createBridgeRuntime({ config });
  await second.start();
  assert.equal(second.identity.nodeId, firstNodeId);
  assert.equal(second.identity.bearerToken, firstToken);
  await second.stop();
  await rm(workdir, { recursive: true, force: true });
});

test("link client end-to-end pairs two bridge runtimes", async () => {
  const a = await makeHarness();
  const b = await makeHarness();

  const linkRes = await fetch(
    `http://127.0.0.1:${a.config.httpPort}/v1/mesh/link`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        remoteHost: "127.0.0.1",
        remotePort: b.config.httpPort,
        remoteToken: b.runtime.identity.bearerToken,
        remoteKind: "mac",
      }),
    },
  );
  assert.equal(linkRes.status, 200);
  const peer = (await linkRes.json()) as { peer: { id: string } };
  assert.equal(peer.peer.id, b.runtime.identity.nodeId);

  const peers = a.runtime.hostStore.list({ includeRevoked: false });
  assert.equal(peers.length, 1);
  assert.equal(peers[0]!.id, b.runtime.identity.nodeId);

  const reverse = b.runtime.hostStore.list({ includeRevoked: false });
  assert.equal(reverse.length, 1);
  assert.equal(reverse[0]!.id, a.runtime.identity.nodeId);

  await a.cleanup();
  await b.cleanup();
});

test("createBridgeRuntime can run with bonjour disabled", () => {
  // Smoke: just verifies that BonjourAnnouncer is an export and not required
  // when config.bonjourEnabled is false. The integration tests above use that
  // path; this assertion makes the dependency explicit for future readers.
  assert.equal(typeof BonjourAnnouncer, "function");
});

test("crypto helpers re-export from @clawjs/mesh stay stable", () => {
  // sanity check that the bridge can still import the crypto surface it
  // depends on for envelope flows
  const sk = generateSigningKeypair();
  const ak = generateAgreementKeypair();
  assert.equal(toBase64Url(sk.publicKey).length > 0, true);
  assert.equal(toBase64Url(ak.publicKey).length > 0, true);
});
