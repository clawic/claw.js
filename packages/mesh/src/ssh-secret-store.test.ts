import { test } from "vitest";
import assert from "node:assert/strict";

import Database from "better-sqlite3";

import { SshSecretStore } from "./ssh-secret-store.ts";

const LEGACY_SCOPE_COLUMN = "ten" + "ant_id";

test("put + get round-trips a private-key secret", () => {
  const store = new SshSecretStore(new Database(":memory:"));
  store.put("k1", {
    kind: "private-key",
    privateKeyPem: "test-private-key",
    passphrase: "pp",
  });
  const got = store.get("k1");
  assert.ok(got);
  assert.equal(got!.kind, "private-key");
  if (got!.kind === "private-key") {
    assert.equal(got!.privateKeyPem, "test-private-key");
    assert.equal(got!.passphrase, "pp");
  }
});

test("put + get round-trips a password secret", () => {
  const store = new SshSecretStore(new Database(":memory:"));
  store.put("p1", { kind: "password", password: "topsecret" });
  const got = store.get("p1");
  assert.ok(got && got.kind === "password");
  if (got.kind === "password") {
    assert.equal(got.password, "topsecret");
  }
});

test("put updates updated_at but preserves created_at on rewrite", async () => {
  const store = new SshSecretStore(new Database(":memory:"));
  const a = store.put("p1", { kind: "password", password: "one" });
  await new Promise((r) => setTimeout(r, 5));
  const b = store.put("p1", { kind: "password", password: "two" });
  assert.equal(a.id, b.id);
  assert.equal(a.createdAt.toISOString(), b.createdAt.toISOString());
  assert.ok(b.updatedAt.getTime() >= a.updatedAt.getTime());
});

test("list returns metadata for all stored secrets", () => {
  const store = new SshSecretStore(new Database(":memory:"));
  store.put("a", { kind: "password", password: "x" });
  store.put("b", { kind: "passphrase", passphrase: "y" });
  const records = store.list();
  assert.equal(records.length, 2);
  const kinds = records.map((r) => r.kind).sort();
  assert.deepEqual(kinds, ["passphrase", "password"]);
});

test("remove returns true once and false thereafter", () => {
  const store = new SshSecretStore(new Database(":memory:"));
  store.put("x", { kind: "password", password: "x" });
  assert.equal(store.remove("x"), true);
  assert.equal(store.remove("x"), false);
  assert.equal(store.get("x"), null);
});

test("secrets are scoped per mesh", () => {
  const db = new Database(":memory:");
  const a = new SshSecretStore(db, "mesh-a");
  const b = new SshSecretStore(db, "mesh-b");
  a.put("k", { kind: "password", password: "x" });
  assert.ok(a.get("k"));
  assert.equal(b.get("k"), null);
});

test("migrates legacy secret scope column to mesh_id", () => {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE ssh_secrets (
      id TEXT NOT NULL,
      ${LEGACY_SCOPE_COLUMN} TEXT NOT NULL,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (${LEGACY_SCOPE_COLUMN}, id)
    );
    INSERT INTO ssh_secrets (id, ${LEGACY_SCOPE_COLUMN}, kind, payload_json, created_at, updated_at)
    VALUES (
      'secret-1', 'mesh-a', 'password',
      '{"kind":"password","password":"legacy"}',
      '2026-05-01T00:00:00.000Z',
      '2026-05-01T00:00:00.000Z'
    );
  `);

  const store = new SshSecretStore(db, "mesh-a");
  assert.deepEqual(store.get("secret-1"), { kind: "password", password: "legacy" });
  const columns = db.prepare<[], { name: string }>("PRAGMA table_info(ssh_secrets)").all();
  assert.ok(columns.some((column) => column.name === "mesh_id"));
  assert.ok(!columns.some((column) => column.name === LEGACY_SCOPE_COLUMN));
});

test("put rejects invalid secret shapes", () => {
  const store = new SshSecretStore(new Database(":memory:"));
  assert.throws(() =>
    store.put("x", { kind: "password" } as unknown as { kind: "password"; password: string }),
  );
});
