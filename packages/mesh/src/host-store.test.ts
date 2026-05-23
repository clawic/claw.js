import { test } from "vitest";
import assert from "node:assert/strict";

import Database from "better-sqlite3";

import {
  HostStore,
  DEFAULT_MESH_ID,
  MESH_SCHEMA_VERSION,
} from "./host-store.ts";
import type { Host, HostInput } from "./models.ts";

function freshStore(): HostStore {
  const db = new Database(":memory:");
  return new HostStore(db);
}

const macInput: HostInput = {
  id: "mac-1",
  kind: "mac",
  displayName: "Studio Mac",
  signingPublicKey: "sign-key",
  agreementPublicKey: "agree-key",
  permissionProfile: "fullTrust",
  capabilities: ["codex", "computerUse"],
  endpoints: [
    { kind: "lan", host: "192.168.1.10", port: 24080, protocol: "bridge" },
    { kind: "tailscale", host: "100.64.0.10", port: 24080, protocol: "bridge" },
  ],
  metadata: { tags: ["personal"], notes: "main desk" },
};

const serverInput: HostInput = {
  id: "vps-hetzner-1",
  kind: "linuxServer",
  displayName: "Hetzner VPS",
  permissionProfile: "scoped",
  capabilities: ["shell", "docker"],
  endpoints: [{ kind: "ssh", host: "vps.example.com", port: 22, protocol: "ssh" }],
  ssh: {
    user: "ubuntu",
    authMethod: "key",
    keySecretId: "secret-ssh-1",
  },
  metadata: { tags: ["work", "vps"], provider: "hetzner", region: "fsn1" },
};

const LEGACY_SCOPE_COLUMN = "ten" + "ant_id";

test("schema version is locked at constant", () => {
  assert.equal(MESH_SCHEMA_VERSION, 2);
});

test("upsert + get round-trips a Mac peer", () => {
  const store = freshStore();
  const saved = store.upsert(macInput);
  assert.equal(saved.id, "mac-1");
  assert.equal(saved.kind, "mac");
  assert.equal(saved.endpoints.length, 2);
  assert.equal(saved.metadata.tags.length, 1);
  assert.equal(saved.metadata.notes, "main desk");

  const fetched = store.get("mac-1");
  assert.ok(fetched);
  assert.deepEqual(fetched.capabilities, ["codex", "computerUse"]);
  assert.equal(fetched.endpoints[0].host, "192.168.1.10");
  assert.equal(fetched.endpoints[1].kind, "tailscale");
  assert.equal(fetched.signingPublicKey, "sign-key");
});

test("upsert generates id when omitted", () => {
  const store = freshStore();
  const saved = store.upsert({
    kind: "ios",
    displayName: "iPhone",
    permissionProfile: "scoped",
    metadata: { tags: [] },
  });
  assert.ok(saved.id.length > 0);
  const list = store.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, saved.id);
});

test("upsert merges metadata and capabilities on second write", () => {
  const store = freshStore();
  store.upsert(macInput);
  const updated = store.upsert({
    id: "mac-1",
    kind: "mac",
    displayName: "Studio Mac (renamed)",
    capabilities: ["codex", "shell"],
    metadata: { provider: "self" },
  } as HostInput);
  assert.equal(updated.displayName, "Studio Mac (renamed)");
  assert.deepEqual(updated.capabilities, ["codex", "shell"]);
  assert.equal(updated.metadata.notes, "main desk");
  assert.equal(updated.metadata.provider, "self");
  assert.deepEqual(updated.metadata.tags, ["personal"]);
});

test("list filters by kind and excludes revoked by default", () => {
  const store = freshStore();
  store.upsert(macInput);
  store.upsert(serverInput);
  store.upsert({
    id: "ios-1",
    kind: "ios",
    displayName: "iPhone",
    permissionProfile: "scoped",
    metadata: { tags: [] },
  });

  assert.equal(store.list().length, 3);
  assert.equal(store.list({ kind: "linuxServer" }).length, 1);
  assert.equal(store.list({ kind: "mac" })[0].id, "mac-1");

  store.revoke("ios-1");
  assert.equal(store.list().length, 2);
  assert.equal(store.list({ includeRevoked: true }).length, 3);
});

test("revoke and unrevoke toggle revoked_at", () => {
  const store = freshStore();
  store.upsert(macInput);

  assert.equal(store.revoke("mac-1"), true);
  const revoked = store.get("mac-1") as Host;
  assert.ok(revoked.revokedAt instanceof Date);

  assert.equal(store.revoke("mac-1"), false);
  assert.equal(store.unrevoke("mac-1"), true);
  const back = store.get("mac-1") as Host;
  assert.equal(back.revokedAt, undefined);
});

test("touch updates last_seen_at", () => {
  const store = freshStore();
  store.upsert(macInput);
  const before = store.get("mac-1") as Host;
  assert.equal(before.lastSeenAt, undefined);

  const at = new Date("2026-05-10T12:00:00.000Z");
  assert.equal(store.touch("mac-1", at), true);
  const after = store.get("mac-1") as Host;
  assert.ok(after.lastSeenAt);
  assert.equal(after.lastSeenAt!.toISOString(), at.toISOString());
});

test("remove cascades endpoints", () => {
  const store = freshStore();
  store.upsert(serverInput);
  assert.equal(store.remove("vps-hetzner-1"), true);
  assert.equal(store.get("vps-hetzner-1"), null);
  assert.equal(store.list({ includeRevoked: true }).length, 0);
});

test("ssh config persists round-trip", () => {
  const store = freshStore();
  store.upsert(serverInput);
  const fetched = store.get("vps-hetzner-1") as Host;
  assert.ok(fetched.ssh);
  assert.equal(fetched.ssh!.user, "ubuntu");
  assert.equal(fetched.ssh!.authMethod, "key");
  assert.equal(fetched.ssh!.keySecretId, "secret-ssh-1");
});

test("store is scoped to its meshId", () => {
  const db = new Database(":memory:");
  const meshA = new HostStore(db, "mesh-a");
  const meshB = new HostStore(db, "mesh-b");
  meshA.upsert(macInput);
  assert.equal(meshA.list().length, 1);
  assert.equal(meshB.list().length, 0);
  meshB.upsert({ ...macInput, displayName: "B Mac" });
  assert.equal(meshA.list().length, 1);
  assert.equal(meshB.list().length, 1);
});

test("default mesh id matches Clawix Mac convention", () => {
  assert.equal(DEFAULT_MESH_ID, "clawix-local");
});

test("migrates legacy host scope columns to mesh_id", () => {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE mesh_schema_version (version INTEGER PRIMARY KEY);
    INSERT INTO mesh_schema_version (version) VALUES (1);
    CREATE TABLE hosts (
      id TEXT NOT NULL,
      ${LEGACY_SCOPE_COLUMN} TEXT NOT NULL,
      kind TEXT NOT NULL,
      display_name TEXT NOT NULL,
      signing_public_key TEXT,
      agreement_public_key TEXT,
      permission_profile TEXT NOT NULL,
      capabilities_json TEXT NOT NULL DEFAULT '[]',
      ssh_json TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{"tags":[]}',
      last_seen_at TEXT,
      revoked_at TEXT,
      created_at TEXT NOT NULL,
      PRIMARY KEY (${LEGACY_SCOPE_COLUMN}, id)
    );
    CREATE TABLE host_endpoints (
      host_id TEXT NOT NULL,
      ${LEGACY_SCOPE_COLUMN} TEXT NOT NULL,
      ord INTEGER NOT NULL,
      kind TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      protocol TEXT,
      PRIMARY KEY (${LEGACY_SCOPE_COLUMN}, host_id, ord)
    );
    INSERT INTO hosts (
      id, ${LEGACY_SCOPE_COLUMN}, kind, display_name, permission_profile,
      capabilities_json, metadata_json, created_at
    ) VALUES (
      'mac-legacy', 'mesh-a', 'mac', 'Legacy Mac', 'scoped',
      '[]', '{"tags":[]}', '2026-05-01T00:00:00.000Z'
    );
  `);

  const store = new HostStore(db, "mesh-a");
  assert.equal(store.get("mac-legacy")!.displayName, "Legacy Mac");

  const columns = db.prepare<[], { name: string }>("PRAGMA table_info(hosts)").all();
  assert.ok(columns.some((column) => column.name === "mesh_id"));
  assert.ok(!columns.some((column) => column.name === LEGACY_SCOPE_COLUMN));
  const version = db
    .prepare<[], { version: number }>("SELECT version FROM mesh_schema_version")
    .get();
  assert.equal(version!.version, MESH_SCHEMA_VERSION);
});
