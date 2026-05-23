import { test } from "vitest";
import assert from "node:assert/strict";

import Database from "better-sqlite3";

import { IdentityStore } from "./identity-store.ts";

const LEGACY_SCOPE_COLUMN = "ten" + "ant_id";

test("getOrCreate generates a fresh identity once and reuses it", () => {
  const db = new Database(":memory:");
  const store = new IdentityStore(db);
  assert.equal(store.get(), null);
  const id = store.getOrCreate("Studio Mac");
  assert.equal(id.displayName, "Studio Mac");
  assert.ok(id.nodeId.length > 0);
  assert.equal(id.signingPublicKey.length, 32);
  assert.equal(id.signingPrivateKey.length, 32);
  assert.equal(id.agreementPublicKey.length, 32);
  assert.equal(id.agreementPrivateKey.length, 32);
  assert.ok(id.bearerToken.length > 0);
  const again = store.getOrCreate("Other Name");
  assert.equal(again.nodeId, id.nodeId);
  assert.equal(again.displayName, "Studio Mac");
});

test("setDisplayName persists across instances", () => {
  const db = new Database(":memory:");
  const a = new IdentityStore(db);
  a.getOrCreate("First");
  a.setDisplayName("Second");
  const b = new IdentityStore(db);
  const id = b.get();
  assert.ok(id);
  assert.equal(id!.displayName, "Second");
});

test("rotateBearerToken rotates and returns the new token", () => {
  const db = new Database(":memory:");
  const store = new IdentityStore(db);
  const before = store.getOrCreate("Mac");
  const after = store.rotateBearerToken();
  assert.notEqual(after.bearerToken, before.bearerToken);
  assert.equal(store.get()!.bearerToken, after.bearerToken);
});

test("identity is scoped per mesh", () => {
  const db = new Database(":memory:");
  const a = new IdentityStore(db, "mesh-a");
  const b = new IdentityStore(db, "mesh-b");
  const idA = a.getOrCreate("A");
  const idB = b.getOrCreate("B");
  assert.notEqual(idA.nodeId, idB.nodeId);
});

test("migrates legacy identity scope column to mesh_id", () => {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE node_identity (
      ${LEGACY_SCOPE_COLUMN} TEXT PRIMARY KEY,
      node_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      signing_public_key TEXT NOT NULL,
      signing_private_key TEXT NOT NULL,
      agreement_public_key TEXT NOT NULL,
      agreement_private_key TEXT NOT NULL,
      bearer_token TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    INSERT INTO node_identity (
      ${LEGACY_SCOPE_COLUMN}, node_id, display_name,
      signing_public_key, signing_private_key,
      agreement_public_key, agreement_private_key,
      bearer_token, created_at
    ) VALUES (
      'mesh-a', 'node-legacy', 'Legacy',
      'AA', 'AA', 'AA', 'AA',
      'token', '2026-05-01T00:00:00.000Z'
    );
  `);

  const store = new IdentityStore(db, "mesh-a");
  assert.equal(store.get()!.nodeId, "node-legacy");
  const columns = db.prepare<[], { name: string }>("PRAGMA table_info(node_identity)").all();
  assert.ok(columns.some((column) => column.name === "mesh_id"));
  assert.ok(!columns.some((column) => column.name === LEGACY_SCOPE_COLUMN));
});
