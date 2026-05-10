import test from "node:test";
import assert from "node:assert/strict";

import Database from "better-sqlite3";

import { WorkspaceStore } from "./workspace-store.ts";

test("upsert creates a workspace with auto id", () => {
  const store = new WorkspaceStore(new Database(":memory:"));
  const ws = store.upsert({ path: "/Users/me/projects", label: "Projects" });
  assert.ok(ws.id.length > 0);
  assert.equal(ws.path, "/Users/me/projects");
  assert.equal(ws.label, "Projects");
  assert.ok(ws.createdAt instanceof Date);
});

test("list returns alphabetical by label", () => {
  const store = new WorkspaceStore(new Database(":memory:"));
  store.upsert({ path: "/a", label: "Bravo" });
  store.upsert({ path: "/b", label: "Alpha" });
  const labels = store.list().map((w) => w.label);
  assert.deepEqual(labels, ["Alpha", "Bravo"]);
});

test("upsert updates path/label of an existing id", () => {
  const store = new WorkspaceStore(new Database(":memory:"));
  const created = store.upsert({ path: "/x", label: "X" });
  const updated = store.upsert({ id: created.id, path: "/y", label: "Y" });
  assert.equal(updated.id, created.id);
  assert.equal(store.get(created.id)!.path, "/y");
  assert.equal(store.get(created.id)!.label, "Y");
});

test("remove deletes an entry", () => {
  const store = new WorkspaceStore(new Database(":memory:"));
  const ws = store.upsert({ path: "/x", label: "X" });
  assert.equal(store.remove(ws.id), true);
  assert.equal(store.get(ws.id), null);
  assert.equal(store.remove(ws.id), false);
});

test("workspaces are scoped per tenant", () => {
  const db = new Database(":memory:");
  const a = new WorkspaceStore(db, "tenant-a");
  const b = new WorkspaceStore(db, "tenant-b");
  a.upsert({ path: "/a", label: "A" });
  assert.equal(a.list().length, 1);
  assert.equal(b.list().length, 0);
});
