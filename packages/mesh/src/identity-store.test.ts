import { test } from "vitest";
import assert from "node:assert/strict";

import Database from "better-sqlite3";

import { IdentityStore } from "./identity-store.ts";

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

test("identity is scoped per tenant", () => {
  const db = new Database(":memory:");
  const a = new IdentityStore(db, "tenant-a");
  const b = new IdentityStore(db, "tenant-b");
  const idA = a.getOrCreate("A");
  const idB = b.getOrCreate("B");
  assert.notEqual(idA.nodeId, idB.nodeId);
});
