import { test } from "vitest";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

import Database from "better-sqlite3";
import { WebSocket } from "ws";

import { AuditStore } from "./audit-store.ts";
import {
  BridgeServer,
  type BridgeFrame,
  type BridgeServerDeps,
  type ExternalDuplexStream,
} from "./bridge-server.ts";
import { IdentityStore } from "./identity-store.ts";

interface Harness {
  server: Server;
  bridge: BridgeServer;
  port: number;
  identityStore: IdentityStore;
  auditStore: AuditStore;
  framesReceived: BridgeFrame[];
  sessionsOpened: number;
  sessionsClosed: number;
  shutdown: () => Promise<void>;
}

type HarnessOptions = Partial<Omit<BridgeServerDeps, "identityStore" | "auditStore">>;

async function makeHarness(options: HarnessOptions = {}): Promise<Harness> {
  const db = new Database(":memory:");
  const identityStore = new IdentityStore(db);
  identityStore.getOrCreate("Studio Mac");
  const auditStore = new AuditStore(db);
  const framesReceived: BridgeFrame[] = [];
  let sessionsOpened = 0;
  let sessionsClosed = 0;
  const bridge = new BridgeServer({
    identityStore,
    auditStore,
    pingIntervalMs: options.pingIntervalMs ?? 0,
    maxSessions: options.maxSessions,
    maxQueuedFramesPerSession: options.maxQueuedFramesPerSession,
    maxBufferedBytesPerSession: options.maxBufferedBytesPerSession,
    onSession: (session) => {
      sessionsOpened += 1;
      options.onSession?.(session);
    },
    onFrame: (session, frame) => {
      framesReceived.push(frame);
      void options.onFrame?.(session, frame);
    },
    onSessionClose: (session) => {
      sessionsClosed += 1;
      options.onSessionClose?.(session);
    },
  });
  const server = createServer();
  bridge.attach(server, "/bridge");
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    server,
    bridge,
    port,
    identityStore,
    auditStore,
    framesReceived,
    get sessionsOpened() {
      return sessionsOpened;
    },
    get sessionsClosed() {
      return sessionsClosed;
    },
    shutdown: async () => {
      bridge.close();
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    },
  } as Harness;
}

test("bridge accepts authenticated client and reports session", async () => {
  const h = await makeHarness();
  const identity = h.identityStore.get()!;
  const ws = new WebSocket(
    `ws://127.0.0.1:${h.port}/bridge?token=${encodeURIComponent(identity.bearerToken)}`,
  );
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  assert.equal(h.bridge.activeSessionCount, 1);
  assert.equal(h.sessionsOpened, 1);
  ws.close();
  await delay(50);
  assert.equal(h.bridge.activeSessionCount, 0);
  assert.equal(h.sessionsClosed, 1);
  assert.equal(h.auditStore.count("bridgeAuth"), 1);
  await h.shutdown();
});

test("bridge rejects bad bearer with 401", async () => {
  const h = await makeHarness();
  const ws = new WebSocket(`ws://127.0.0.1:${h.port}/bridge?token=wrong`);
  const closeCode = await new Promise<number>((resolve) => {
    ws.once("close", (code) => resolve(code));
    ws.once("error", () => resolve(1006));
  });
  assert.ok(closeCode >= 1000);
  await delay(20);
  assert.equal(h.bridge.activeSessionCount, 0);
  assert.equal(h.auditStore.count("bridgeAuth"), 1);
  const events = h.auditStore.list({ action: "bridgeAuth" });
  assert.equal(events[0]!.outcome, "deny");
  await h.shutdown();
});

test("bridge replies to ping with pong without invoking onFrame", async () => {
  const h = await makeHarness();
  const identity = h.identityStore.get()!;
  const ws = new WebSocket(
    `ws://127.0.0.1:${h.port}/bridge?token=${encodeURIComponent(identity.bearerToken)}`,
  );
  await new Promise<void>((resolve) => ws.once("open", () => resolve()));
  const pong = new Promise<BridgeFrame>((resolve) =>
    ws.once("message", (data) => resolve(JSON.parse(data.toString("utf8")))),
  );
  ws.send(JSON.stringify({ kind: "ping", id: "p1" }));
  const reply = await pong;
  assert.equal(reply.kind, "pong");
  assert.equal(reply.id, "p1");
  assert.equal(h.framesReceived.length, 0);
  ws.close();
  await delay(20);
  await h.shutdown();
});

test("bridge dispatches non-ping frames through onFrame", async () => {
  const h = await makeHarness();
  const identity = h.identityStore.get()!;
  const ws = new WebSocket(
    `ws://127.0.0.1:${h.port}/bridge?token=${encodeURIComponent(identity.bearerToken)}`,
  );
  await new Promise<void>((resolve) => ws.once("open", () => resolve()));
  ws.send(JSON.stringify({ kind: "request", id: "r1", payload: { x: 1 } }));
  await delay(40);
  assert.equal(h.framesReceived.length, 1);
  assert.equal(h.framesReceived[0]!.kind, "request");
  ws.close();
  await delay(20);
  await h.shutdown();
});

test("bridge closes connection on invalid frame", async () => {
  const h = await makeHarness();
  const identity = h.identityStore.get()!;
  const ws = new WebSocket(
    `ws://127.0.0.1:${h.port}/bridge?token=${encodeURIComponent(identity.bearerToken)}`,
  );
  await new Promise<void>((resolve) => ws.once("open", () => resolve()));
  const closed = new Promise<number>((resolve) =>
    ws.once("close", (code) => resolve(code)),
  );
  ws.send("not json");
  const code = await closed;
  assert.equal(code, 4400);
  await h.shutdown();
});

test("bridge rejects over-capacity authenticated websocket upgrades", async () => {
  const h = await makeHarness({ maxSessions: 1 });
  const identity = h.identityStore.get()!;
  const first = new WebSocket(
    `ws://127.0.0.1:${h.port}/bridge?token=${encodeURIComponent(identity.bearerToken)}`,
  );
  await new Promise<void>((resolve, reject) => {
    first.once("open", resolve);
    first.once("error", reject);
  });

  const second = new WebSocket(
    `ws://127.0.0.1:${h.port}/bridge?token=${encodeURIComponent(identity.bearerToken)}`,
  );
  const rejected = await new Promise<boolean>((resolve) => {
    second.once("unexpected-response", (_req, response) => resolve(response.statusCode === 429));
    second.once("error", () => resolve(false));
  });

  assert.equal(rejected, true);
  assert.equal(h.bridge.activeSessionCount, 1);
  const authEvents = h.auditStore.list({ action: "bridgeAuth" });
  const denial = authEvents.find((event) => event.context?.reason === "too-many-sessions");
  assert.equal(denial?.outcome, "deny");
  first.close();
  await delay(20);
  await h.shutdown();
});

test("bridge closes only the slow websocket session when its outbound queue overflows", async () => {
  const h = await makeHarness({
    maxQueuedFramesPerSession: 1,
    onSession: (session) => {
      session.send({ kind: "event", id: "one" });
      session.send({ kind: "event", id: "two" });
      session.send({ kind: "event", id: "three" });
    },
  });
  const identity = h.identityStore.get()!;
  const slow = new WebSocket(
    `ws://127.0.0.1:${h.port}/bridge?token=${encodeURIComponent(identity.bearerToken)}`,
  );
  const code = await new Promise<number>((resolve, reject) => {
    slow.once("close", (closedCode) => resolve(closedCode));
    slow.once("error", reject);
  });

  assert.equal(code, 4408);
  await delay(20);
  assert.equal(h.bridge.activeSessionCount, 0);
  assert.equal(h.sessionsClosed, 1);
  await h.shutdown();
});

class FakeExternalStream extends EventEmitter implements ExternalDuplexStream {
  failSends = false;
  closed = false;

  async send(_payload: Buffer): Promise<void> {
    if (this.failSends) throw new Error("send failed");
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.emit("close");
  }
}

test("bridge removes external stream sessions when outbound send fails", async () => {
  const h = await makeHarness();
  const stream = new FakeExternalStream();
  const session = h.bridge.attachExternalStream(stream);
  assert.equal(h.bridge.activeSessionCount, 1);

  stream.failSends = true;
  session.send({ kind: "event", id: "external" });
  await delay(20);

  assert.equal(stream.closed, true);
  assert.equal(h.bridge.activeSessionCount, 0);
  assert.equal(h.sessionsClosed, 1);
  await h.shutdown();
});
