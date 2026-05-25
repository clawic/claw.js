import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { clawDefaultStreamingBackpressurePolicy, clawSessionEvents, estimateUtf8Bytes } from "@clawjs/core";

import { buildSessionsApp } from "./app.ts";
import { SessionsApiClient } from "./client.ts";
import { loadSessionsConfig } from "./config.ts";
import { SESSION_JSON_CONTRACT_VERSION } from "./json-contracts.ts";
import {
  SESSION_EVENTS_STREAMING_POLICY_ID,
  SessionEventBroadcaster,
  type SessionSseWritable,
} from "./sse-broadcaster.ts";
import type { SessionEvent } from "./types.ts";

class FakeSseRaw extends EventEmitter implements SessionSseWritable {
  chunks: string[] = [];
  ended = false;
  writesBeforeBackpressure = Number.POSITIVE_INFINITY;
  failWrites = false;
  private writes = 0;

  write(chunk: string): boolean {
    if (this.failWrites) throw new Error("socket closed");
    this.chunks.push(chunk);
    this.writes += 1;
    return this.writes <= this.writesBeforeBackpressure;
  }

  end(): void {
    this.ended = true;
  }
}

function event(input: Omit<SessionEvent, "at" | "payload"> & { payload?: unknown }): SessionEvent {
  return { schemaVersion: SESSION_JSON_CONTRACT_VERSION, at: Date.now(), payload: {}, ...input };
}

function decoded(raw: FakeSseRaw): SessionEvent[] {
  return raw.chunks.flatMap((chunk) => {
    return chunk.trim().split("\n\n").filter(Boolean).map((frame) => {
      const data = frame.split("\n").find((line) => line.startsWith("data: "));
      assert.ok(data);
      return JSON.parse(data.slice("data: ".length)) as SessionEvent;
    });
  });
}

async function nextWithTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), 5_000);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

test("SessionEventBroadcaster delivers ordered lifecycle events to multiple subscribers", () => {
  const broadcaster = new SessionEventBroadcaster();
  const first = new FakeSseRaw();
  const second = new FakeSseRaw();
  broadcaster.subscribe(first);
  broadcaster.subscribe(second);

  broadcaster.publish(event({ type: clawSessionEvents.updated, sessionId: "session-1" }));
  broadcaster.publish(event({ type: clawSessionEvents.messageAppended, sessionId: "session-1", messageId: "message-1" }));

  assert.deepEqual(decoded(first).map((item) => item.type), [
    clawSessionEvents.updated,
    clawSessionEvents.messageAppended,
  ]);
  assert.deepEqual(decoded(second).map((item) => item.type), [
    clawSessionEvents.updated,
    clawSessionEvents.messageAppended,
  ]);
});

test("SessionEventBroadcaster waits for drain on a slow subscriber without blocking a fast one", () => {
  const broadcaster = new SessionEventBroadcaster();
  const slow = new FakeSseRaw();
  slow.writesBeforeBackpressure = 0;
  const fast = new FakeSseRaw();
  broadcaster.subscribe(slow);
  broadcaster.subscribe(fast);

  broadcaster.publish(event({ type: clawSessionEvents.updated, sessionId: "session-1" }));
  broadcaster.publish(event({ type: clawSessionEvents.messageAppended, sessionId: "session-1", messageId: "message-1" }));

  assert.deepEqual(decoded(fast).map((item) => item.type), [
    clawSessionEvents.updated,
    clawSessionEvents.messageAppended,
  ]);
  assert.deepEqual(decoded(slow).map((item) => item.type), [clawSessionEvents.updated]);
  assert.equal(broadcaster.snapshotMetrics().queuedEvents, 1);

  slow.writesBeforeBackpressure = Number.POSITIVE_INFINITY;
  slow.emit("drain");

  assert.deepEqual(decoded(slow).map((item) => item.type), [
    clawSessionEvents.updated,
    clawSessionEvents.messageAppended,
  ]);
  assert.equal(broadcaster.snapshotMetrics().queuedEvents, 0);
});

test("SessionEventBroadcaster coalesces queued message.updated events by message", () => {
  const broadcaster = new SessionEventBroadcaster();
  const slow = new FakeSseRaw();
  slow.writesBeforeBackpressure = 0;
  broadcaster.subscribe(slow);

  broadcaster.publish(event({ type: clawSessionEvents.updated, sessionId: "session-1" }));
  broadcaster.publish(event({
    type: clawSessionEvents.messageUpdated,
    sessionId: "session-1",
    messageId: "message-1",
    payload: { id: "message-1", sessionId: "session-1", messageId: "message-1", delta: { contentText: "first" }, full: false },
  }));
  broadcaster.publish(event({
    type: clawSessionEvents.messageUpdated,
    sessionId: "session-1",
    messageId: "message-1",
    payload: { id: "message-1", sessionId: "session-1", messageId: "message-1", delta: { contentText: "latest" }, full: false },
  }));

  assert.equal(broadcaster.snapshotMetrics().queuedEvents, 1);
  assert.equal(broadcaster.snapshotMetrics().coalescedEvents, 1);

  slow.writesBeforeBackpressure = Number.POSITIVE_INFINITY;
  slow.emit("drain");

  const update = decoded(slow).find((item) => item.type === clawSessionEvents.messageUpdated);
  assert.deepEqual(update?.payload, {
    id: "message-1",
    sessionId: "session-1",
    messageId: "message-1",
    delta: { contentText: "latest" },
    full: false,
  });
});

test("SessionEventBroadcaster closes only the slow client on hard queue overflow", () => {
  const broadcaster = new SessionEventBroadcaster({ hardQueueLimit: 2 });
  const slow = new FakeSseRaw();
  slow.writesBeforeBackpressure = 0;
  const fast = new FakeSseRaw();
  broadcaster.subscribe(slow);
  broadcaster.subscribe(fast);

  broadcaster.publish(event({ type: clawSessionEvents.updated, sessionId: "session-1" }));
  broadcaster.publish(event({ type: clawSessionEvents.messageAppended, sessionId: "session-1", messageId: "message-1" }));
  broadcaster.publish(event({ type: clawSessionEvents.turnFinished, sessionId: "session-1" }));
  broadcaster.publish(event({ type: clawSessionEvents.projectUpdated, projectId: "project-1" }));

  assert.equal(slow.ended, true);
  assert.equal(fast.ended, false);
  assert.equal(decoded(fast).length, 4);
  assert.equal(broadcaster.snapshotMetrics().closedSlowClients, 1);
  assert.equal(broadcaster.snapshotMetrics().droppedEvents, 3);
  assert.equal(broadcaster.snapshotMetrics().overflowCount, 1);
  const diagnostic = decoded(slow).at(-1);
  assert.equal(diagnostic?.type, "error");
  assert.deepEqual(diagnostic?.payload, {
    error: "session_event_stream_overflow",
    streamingPolicyId: SESSION_EVENTS_STREAMING_POLICY_ID,
    maxFrameBytes: clawDefaultStreamingBackpressurePolicy.maxFrameBytes,
    hardQueueLimit: 2,
    maxQueuedBytes: clawDefaultStreamingBackpressurePolicy.maxQueuedBytes,
    dropped: 3,
    droppedBytes: broadcaster.snapshotMetrics().droppedBytes,
    triggerType: clawSessionEvents.projectUpdated,
  });
});

test("SessionEventBroadcaster drops a failed subscriber without blocking healthy subscribers", () => {
  const broadcaster = new SessionEventBroadcaster();
  const failed = new FakeSseRaw();
  failed.failWrites = true;
  const fast = new FakeSseRaw();
  broadcaster.subscribe(failed);
  broadcaster.subscribe(fast);

  assert.doesNotThrow(() => {
    broadcaster.publish(event({ type: clawSessionEvents.updated, sessionId: "session-1" }));
  });

  assert.equal(failed.ended, true);
  assert.deepEqual(decoded(fast).map((item) => item.type), [clawSessionEvents.updated]);
  assert.equal(broadcaster.snapshotMetrics().subscribers, 1);
  assert.equal(broadcaster.snapshotMetrics().closedFailedClients, 1);
  assert.equal(broadcaster.snapshotMetrics().writeFailureCount, 1);

  broadcaster.publish(event({ type: clawSessionEvents.messageAppended, sessionId: "session-1", messageId: "message-1" }));

  assert.deepEqual(decoded(fast).map((item) => item.type), [
    clawSessionEvents.updated,
    clawSessionEvents.messageAppended,
  ]);
});

test("SessionEventBroadcaster splits oversized message updates below max frame bytes", () => {
  const maxFrameBytes = 512;
  const broadcaster = new SessionEventBroadcaster({ maxFrameBytes });
  const raw = new FakeSseRaw();
  broadcaster.subscribe(raw);

  const contentText = "x".repeat(clawDefaultStreamingBackpressurePolicy.maxFrameBytes);
  broadcaster.publish(event({
    type: clawSessionEvents.messageUpdated,
    sessionId: "session-1",
    messageId: "message-1",
    payload: { id: "message-1", sessionId: "session-1", messageId: "message-1", delta: { contentText }, full: false },
  }));

  assert.ok(raw.chunks.length > 1);
  for (const chunk of raw.chunks) {
    assert.ok(estimateUtf8Bytes(chunk) <= maxFrameBytes);
  }
  const joined = decoded(raw)
    .map((item) => (item.payload as { delta?: { contentText?: string } })?.delta?.contentText ?? "")
    .join("");
  assert.equal(joined, contentText);
});

test("SessionEventBroadcaster closes slow clients when queued bytes overflow", () => {
  const broadcaster = new SessionEventBroadcaster({ maxQueuedBytes: 300, hardQueueLimit: 10 });
  const slow = new FakeSseRaw();
  slow.writesBeforeBackpressure = 0;
  const fast = new FakeSseRaw();
  broadcaster.subscribe(slow);
  broadcaster.subscribe(fast);

  broadcaster.publish(event({ type: clawSessionEvents.updated, sessionId: "session-1", payload: { text: "x".repeat(120) } }));
  broadcaster.publish(event({ type: clawSessionEvents.messageAppended, sessionId: "session-1", messageId: "message-1", payload: { text: "y".repeat(120) } }));
  broadcaster.publish(event({ type: clawSessionEvents.turnFinished, sessionId: "session-1", payload: { text: "z".repeat(120) } }));

  assert.equal(slow.ended, true);
  assert.equal(fast.ended, false);
  assert.equal(broadcaster.snapshotMetrics().overflowCount, 1);
  assert.ok(broadcaster.snapshotMetrics().droppedBytes > 0);
});

test("SessionEventBroadcaster rejects subscribers past the configured limit", () => {
  const broadcaster = new SessionEventBroadcaster({ maxSubscribers: 1 });
  const first = new FakeSseRaw();
  const second = new FakeSseRaw();

  assert.ok(broadcaster.trySubscribe(first));
  assert.equal(broadcaster.trySubscribe(second), null);
  assert.equal(broadcaster.snapshotMetrics().subscribers, 1);
  assert.equal(broadcaster.snapshotMetrics().rejectedSubscribers, 1);
});

test("SessionEventBroadcaster metrics expose the streaming policy and effective limits", () => {
  const broadcaster = new SessionEventBroadcaster({
    hardQueueLimit: 9,
    maxQueuedBytes: 10_000,
    maxFrameBytes: 2_048,
  });

  assert.deepEqual({
    streamingPolicyId: broadcaster.snapshotMetrics().streamingPolicyId,
    hardQueueLimit: broadcaster.snapshotMetrics().hardQueueLimit,
    maxQueuedBytesLimit: broadcaster.snapshotMetrics().maxQueuedBytesLimit,
    maxFrameBytes: broadcaster.snapshotMetrics().maxFrameBytes,
  }, {
    streamingPolicyId: SESSION_EVENTS_STREAMING_POLICY_ID,
    hardQueueLimit: 9,
    maxQueuedBytesLimit: 10_000,
    maxFrameBytes: 2_048,
  });
});

test("loadSessionsConfig reads SSE backpressure limits from env", () => {
  const previousMaxSubscribers = process.env.CLAW_SESSIONS_EVENTS_MAX_SUBSCRIBERS;
  const previousQueueLimit = process.env.CLAW_SESSIONS_EVENTS_QUEUE_LIMIT;
  const previousQueuedBytes = process.env.CLAW_SESSIONS_EVENTS_MAX_QUEUED_BYTES;
  const previousFrameBytes = process.env.CLAW_SESSIONS_EVENTS_MAX_FRAME_BYTES;
  try {
    process.env.CLAW_SESSIONS_EVENTS_MAX_SUBSCRIBERS = "7";
    process.env.CLAW_SESSIONS_EVENTS_QUEUE_LIMIT = "11";
    process.env.CLAW_SESSIONS_EVENTS_MAX_QUEUED_BYTES = "12345";
    process.env.CLAW_SESSIONS_EVENTS_MAX_FRAME_BYTES = "6789";
    const config = loadSessionsConfig();
    assert.equal(config.eventsMaxSubscribers, 7);
    assert.equal(config.eventsHardQueueLimit, 11);
    assert.equal(config.eventsMaxQueuedBytes, 12345);
    assert.equal(config.eventsMaxFrameBytes, 6789);
  } finally {
    if (previousMaxSubscribers === undefined) delete process.env.CLAW_SESSIONS_EVENTS_MAX_SUBSCRIBERS;
    else process.env.CLAW_SESSIONS_EVENTS_MAX_SUBSCRIBERS = previousMaxSubscribers;
    if (previousQueueLimit === undefined) delete process.env.CLAW_SESSIONS_EVENTS_QUEUE_LIMIT;
    else process.env.CLAW_SESSIONS_EVENTS_QUEUE_LIMIT = previousQueueLimit;
    if (previousQueuedBytes === undefined) delete process.env.CLAW_SESSIONS_EVENTS_MAX_QUEUED_BYTES;
    else process.env.CLAW_SESSIONS_EVENTS_MAX_QUEUED_BYTES = previousQueuedBytes;
    if (previousFrameBytes === undefined) delete process.env.CLAW_SESSIONS_EVENTS_MAX_FRAME_BYTES;
    else process.env.CLAW_SESSIONS_EVENTS_MAX_FRAME_BYTES = previousFrameBytes;
  }
});

test("SessionsApiClient.events parses existing SSE frames split across chunks", async () => {
  const frame = "event: session.updated\n"
    + `data: ${JSON.stringify(event({ type: clawSessionEvents.updated, sessionId: "session-1", payload: { ready: true } }))}\n\n`;
  const chunks = [frame.slice(0, 17), frame.slice(17)];
  const client = new SessionsApiClient({
    baseUrl: "http://sessions.test",
    token: "test-secret",
    fetchImpl: async () => new Response(new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    })) as Response,
  });

  const items: SessionEvent[] = [];
  for await (const item of client.events()) items.push(item);

  assert.equal(items.length, 1);
  assert.equal(items[0]?.type, clawSessionEvents.updated);
  assert.deepEqual(items[0]?.payload, { ready: true });
});

test("sessions app emits message.updated as a delta envelope over SSE", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-sessions-sse-"));
  const built = buildSessionsApp({
    config: {
      sharedSecret: "test-secret",
      dataDir: path.join(rootDir, "sessions"),
      dbPath: path.join(rootDir, "sessions.sqlite"),
    },
  });
  const app = built.app;
  const abort = new AbortController();

  try {
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    assert.equal(typeof address, "object");
    assert.ok(address);
    const client = new SessionsApiClient({
      baseUrl: `http://127.0.0.1:${address.port}`,
      token: "test-secret",
    });
    const events = client.events(abort.signal);
    const ready = await nextWithTimeout(events.next(), "ready event");
    assert.equal(ready.value?.type, clawSessionEvents.updated);

    const session = await client.createSession({ agent: "codex", title: "SSE" });
    const message = await client.appendMessage(session.id, {
      role: "assistant",
      contentText: "first",
      streamingState: "streaming",
    });
    await client.updateMessage(session.id, message.id, {
      contentText: "latest",
      streamingState: "complete",
    });

    let updated: SessionEvent | undefined;
    for (let i = 0; i < 5 && !updated; i += 1) {
      const next = await nextWithTimeout(events.next(), "message.updated event");
      if (next.value?.type === clawSessionEvents.messageUpdated) updated = next.value;
    }

    assert.ok(updated);
    assert.deepEqual(updated.payload, {
      id: message.id,
      sessionId: session.id,
      messageId: message.id,
      delta: { contentText: "latest", streamingState: "complete" },
      full: false,
    });
    assert.equal(built.events.snapshotMetrics().subscribers, 1);
  } finally {
    abort.abort();
    await app.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("sessions app returns 503 when the SSE subscriber limit is reached", async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-sessions-sse-limit-"));
  const built = buildSessionsApp({
    config: {
      sharedSecret: "test-secret",
      dataDir: path.join(rootDir, "sessions"),
      dbPath: path.join(rootDir, "sessions.sqlite"),
      eventsMaxSubscribers: 1,
    },
  });
  const app = built.app;
  const abort = new AbortController();

  try {
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    assert.equal(typeof address, "object");
    assert.ok(address);
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const first = await fetch(`${baseUrl}/v1/events`, {
      headers: { authorization: "Bearer test-secret" },
      signal: abort.signal,
    });
    assert.equal(first.status, 200);

    const second = await fetch(`${baseUrl}/v1/events`, {
      headers: { authorization: "Bearer test-secret" },
    });
    assert.equal(second.status, 503);
    assert.equal(built.events.snapshotMetrics().rejectedSubscribers, 1);
  } finally {
    abort.abort();
    await app.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
