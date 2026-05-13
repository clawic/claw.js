import { test } from "vitest";
import assert from "node:assert/strict";

import Database from "better-sqlite3";

import {
  HostStore,
  DEFAULT_TENANT_ID,
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
    { kind: "lan", host: "192.168.1.10", port: 7778, protocol: "bridge" },
    { kind: "tailscale", host: "100.64.0.10", port: 7778, protocol: "bridge" },
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

test("schema version is locked at constant", () => {
  assert.equal(MESH_SCHEMA_VERSION, 1);
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

test("store is scoped to its tenantId", () => {
  const db = new Database(":memory:");
  const tenantA = new HostStore(db, "tenant-a");
  const tenantB = new HostStore(db, "tenant-b");
  tenantA.upsert(macInput);
  assert.equal(tenantA.list().length, 1);
  assert.equal(tenantB.list().length, 0);
  tenantB.upsert({ ...macInput, displayName: "B Mac" });
  assert.equal(tenantA.list().length, 1);
  assert.equal(tenantB.list().length, 1);
});

test("default tenant id matches Clawix Mac convention", () => {
  assert.equal(DEFAULT_TENANT_ID, "clawix-local");
});
