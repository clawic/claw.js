import { test } from "vitest";
import assert from "node:assert/strict";

import { ClawEventBus } from "./events.ts";

test("ClawEventBus emits typed events and supports unsubscribe", () => {
  const bus = new ClawEventBus();
  const seen: string[] = [];

  const off = bus.on("files.synced", (event) => {
    seen.push(`${event.type}:${String((event.payload as { id: string }).id)}`);
  });

  bus.emit("files.synced", { id: "one" });
  off();
  bus.emit("files.synced", { id: "two" });

  assert.deepEqual(seen, ["files.synced:one"]);
});

test("ClawEventBus supports async iterator consumption", async () => {
  const bus = new ClawEventBus();
  const iterator = bus.iterate("files.synced")[Symbol.asyncIterator]();

  bus.emit("files.synced", { id: "one" });
  const first = await iterator.next();
  await iterator.return?.();

  assert.equal(first.done, false);
  assert.equal(first.value?.type, "files.synced");
  assert.deepEqual(first.value?.payload, { id: "one" });
});

test("ClawEventBus coalesces queued events by type", async () => {
  const bus = new ClawEventBus({ iteratorQueueLimit: 4 });
  const iterator = bus.iterate("*")[Symbol.asyncIterator]();

  bus.emit("files.synced", { id: "one" });
  bus.emit("files.synced", { id: "two" });

  const metrics = bus.snapshotMetrics();
  assert.equal(metrics.iterators, 1);
  assert.equal(metrics.queuedEvents, 1);
  assert.equal(metrics.coalescedEvents, 1);

  const next = await iterator.next();
  await iterator.return?.();

  assert.equal(next.done, false);
  assert.equal(next.value?.type, "files.synced");
  assert.deepEqual(next.value?.payload, { id: "two" });
});

test("ClawEventBus drops oldest queued events on overflow", async () => {
  const bus = new ClawEventBus({ iteratorQueueLimit: 2 });
  const iterator = bus.iterate("*")[Symbol.asyncIterator]();

  bus.emit("files.one", { id: "one" });
  bus.emit("files.two", { id: "two" });
  bus.emit("files.three", { id: "three" });

  const metrics = bus.snapshotMetrics();
  assert.equal(metrics.queuedEvents, 2);
  assert.equal(metrics.maxQueueDepth, 2);
  assert.equal(metrics.droppedEvents, 1);
  assert.equal(metrics.overflowCount, 1);

  const first = await iterator.next();
  const second = await iterator.next();
  await iterator.return?.();

  assert.equal(first.value?.type, "files.two");
  assert.equal(second.value?.type, "files.three");
});

test("ClawEventBus supports per-iterator queue limits", async () => {
  const bus = new ClawEventBus({ iteratorQueueLimit: 8 });
  const iterator = bus.iterate("*", { queueLimit: 1 })[Symbol.asyncIterator]();

  bus.emit("files.one", { id: "one" });
  bus.emit("files.two", { id: "two" });

  const metrics = bus.snapshotMetrics();
  assert.equal(metrics.queuedEvents, 1);
  assert.equal(metrics.maxQueueDepth, 1);
  assert.equal(metrics.droppedEvents, 1);

  const next = await iterator.next();
  await iterator.return?.();

  assert.equal(next.value?.type, "files.two");
});

test("ClawEventBus closes immediately for an already aborted signal", async () => {
  const bus = new ClawEventBus();
  const controller = new AbortController();
  controller.abort();

  const iterator = bus.iterate("*", { signal: controller.signal })[Symbol.asyncIterator]();
  const next = await iterator.next();

  const metrics = bus.snapshotMetrics();
  assert.equal(next.done, true);
  assert.equal(metrics.iterators, 0);
  assert.equal(metrics.abortedIterators, 1);
});

test("ClawEventBus resolves a pending next when aborted", async () => {
  const bus = new ClawEventBus();
  const controller = new AbortController();
  const iterator = bus.iterate("*", { signal: controller.signal })[Symbol.asyncIterator]();

  const pending = iterator.next();
  controller.abort();
  const next = await pending;

  const metrics = bus.snapshotMetrics();
  assert.equal(next.done, true);
  assert.equal(metrics.iterators, 0);
  assert.equal(metrics.abortedIterators, 1);
});

test("ClawEventBus return clears pending state and unregisters the iterator", async () => {
  const bus = new ClawEventBus();
  const iterator = bus.iterate("*")[Symbol.asyncIterator]();

  const pending = iterator.next();
  await iterator.return?.();
  const next = await pending;

  const metrics = bus.snapshotMetrics();
  assert.equal(next.done, true);
  assert.equal(metrics.iterators, 0);
  assert.equal(metrics.queuedEvents, 0);
});

test("ClawEventBus times out only iterators with consumer timeout enabled", async () => {
  const bus = new ClawEventBus();
  const slow = bus.iterate("*", { consumerTimeoutMs: 10 })[Symbol.asyncIterator]();
  const fast = bus.iterate("*")[Symbol.asyncIterator]();

  bus.emit("files.synced", { id: "one" });
  await new Promise((resolve) => setTimeout(resolve, 30));

  const slowNext = await slow.next();
  const fastNext = await fast.next();
  await fast.return?.();

  const metrics = bus.snapshotMetrics();
  assert.equal(slowNext.done, true);
  assert.equal(fastNext.done, false);
  assert.equal(fastNext.value?.type, "files.synced");
  assert.equal(metrics.iterators, 0);
  assert.equal(metrics.timedOutIterators, 1);
});
