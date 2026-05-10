import test from "node:test";
import assert from "node:assert/strict";

import Database from "better-sqlite3";

import { AuditStore } from "./audit-store.ts";

test("record persists an audit event", () => {
  const store = new AuditStore(new Database(":memory:"));
  const event = store.record({
    action: "meshPair",
    actorId: "ios-1",
    targetId: "mac-1",
    outcome: "success",
    context: { shortCode: "ABC-DEF-GHJ" },
  });
  assert.ok(event.id.length > 0);
  assert.ok(event.ts instanceof Date);
  assert.equal(event.action, "meshPair");
  assert.equal(event.outcome, "success");
});

test("list filters by action and limits results", () => {
  const store = new AuditStore(new Database(":memory:"));
  store.record({ action: "meshPair", outcome: "success" });
  store.record({ action: "proxySsh", outcome: "allow", actorId: "agent" });
  store.record({ action: "proxySsh", outcome: "deny", actorId: "agent" });
  assert.equal(store.count(), 3);
  assert.equal(store.count("proxySsh"), 2);
  const ssh = store.list({ action: "proxySsh" });
  assert.equal(ssh.length, 2);
  assert.ok(ssh.every((e) => e.action === "proxySsh"));
  const limited = store.list({ limit: 1 });
  assert.equal(limited.length, 1);
});

test("list filters by date range", () => {
  const store = new AuditStore(new Database(":memory:"));
  const t0 = new Date("2026-01-01T00:00:00.000Z");
  const t1 = new Date("2026-01-15T00:00:00.000Z");
  const t2 = new Date("2026-02-01T00:00:00.000Z");
  store.record({ action: "meshLink", outcome: "success", ts: t0 });
  store.record({ action: "meshLink", outcome: "success", ts: t1 });
  store.record({ action: "meshLink", outcome: "success", ts: t2 });
  const inRange = store.list({
    since: new Date("2026-01-10T00:00:00.000Z"),
    until: new Date("2026-01-20T00:00:00.000Z"),
  });
  assert.equal(inRange.length, 1);
  assert.equal(inRange[0]!.ts.toISOString(), t1.toISOString());
});

test("audit events are scoped per tenant", () => {
  const db = new Database(":memory:");
  const a = new AuditStore(db, "tenant-a");
  const b = new AuditStore(db, "tenant-b");
  a.record({ action: "meshPair", outcome: "success" });
  assert.equal(a.count(), 1);
  assert.equal(b.count(), 0);
});
