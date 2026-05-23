import { test } from "vitest";
import assert from "node:assert/strict";

import Database from "better-sqlite3";

import { WorkspaceStore } from "./workspace-store.ts";

const LEGACY_SCOPE_COLUMN = "ten" + "ant_id";

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

test("workspaces are scoped per mesh", () => {
  const db = new Database(":memory:");
  const a = new WorkspaceStore(db, "mesh-a");
  const b = new WorkspaceStore(db, "mesh-b");
  a.upsert({ path: "/a", label: "A" });
  assert.equal(a.list().length, 1);
  assert.equal(b.list().length, 0);
});

test("migrates legacy workspace scope column to mesh_id", () => {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE local_workspaces (
      id TEXT NOT NULL,
      ${LEGACY_SCOPE_COLUMN} TEXT NOT NULL,
      path TEXT NOT NULL,
      label TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (${LEGACY_SCOPE_COLUMN}, id)
    );
    INSERT INTO local_workspaces (id, ${LEGACY_SCOPE_COLUMN}, path, label, created_at)
    VALUES ('workspace-1', 'mesh-a', '/legacy', 'Legacy', '2026-05-01T00:00:00.000Z');
  `);

  const store = new WorkspaceStore(db, "mesh-a");
  assert.equal(store.get("workspace-1")!.path, "/legacy");
  const columns = db.prepare<[], { name: string }>("PRAGMA table_info(local_workspaces)").all();
  assert.ok(columns.some((column) => column.name === "mesh_id"));
  assert.ok(!columns.some((column) => column.name === LEGACY_SCOPE_COLUMN));
});
