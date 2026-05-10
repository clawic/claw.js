import test from "node:test";
import assert from "node:assert/strict";

import Database from "better-sqlite3";
import Fastify, { type FastifyInstance } from "fastify";

import { AuditStore } from "./audit-store.ts";
import { toBase64Url } from "./crypto.ts";
import { HostStore } from "./host-store.ts";
import { IdentityStore, type NodeIdentity } from "./identity-store.ts";
import { meshServerPlugin, type MeshServerDeps } from "./mesh-server.ts";
import { WorkspaceStore } from "./workspace-store.ts";

interface Harness {
  app: FastifyInstance;
  identity: NodeIdentity;
  deps: MeshServerDeps;
  hostStore: HostStore;
  workspaceStore: WorkspaceStore;
  auditStore: AuditStore;
}

async function makeHarness(
  override: Partial<MeshServerDeps> = {},
): Promise<Harness> {
  const db = new Database(":memory:");
  const hostStore = new HostStore(db);
  const workspaceStore = new WorkspaceStore(db);
  const auditStore = new AuditStore(db);
  const identityStore = new IdentityStore(db);
  const identity = identityStore.getOrCreate("Studio Mac");
  const deps: MeshServerDeps = {
    identityStore,
    hostStore,
    workspaceStore,
    auditStore,
    capabilities: ["bridge", "codex"],
    endpointResolver: () => [
      { kind: "lan", host: "192.168.1.10", port: 7778, protocol: "bridge" },
    ],
    ...override,
  };
  const app = Fastify();
  await app.register(meshServerPlugin(deps));
  return { app, identity, deps, hostStore, workspaceStore, auditStore };
}

test("GET /mesh/identity rejects without bearer", async () => {
  const { app } = await makeHarness();
  const res = await app.inject({ method: "GET", url: "/mesh/identity" });
  assert.equal(res.statusCode, 401);
  await app.close();
});

test("GET /mesh/identity returns identity with valid bearer", async () => {
  const { app, identity } = await makeHarness();
  const res = await app.inject({
    method: "GET",
    url: "/mesh/identity",
    headers: { authorization: `Bearer ${identity.bearerToken}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.nodeId, identity.nodeId);
  assert.equal(body.displayName, "Studio Mac");
  assert.equal(body.signingPublicKey, toBase64Url(identity.signingPublicKey));
  assert.equal(body.endpoints.length, 1);
  assert.deepEqual(body.capabilities, ["bridge", "codex"]);
  await app.close();
});

test("GET /mesh/peers is loopback only", async () => {
  const { app, hostStore } = await makeHarness();
  hostStore.upsert({
    id: "ios-1",
    kind: "ios",
    displayName: "iPhone",
    permissionProfile: "scoped",
    metadata: { tags: [] },
  });
  const remote = await app.inject({
    method: "GET",
    url: "/mesh/peers",
    remoteAddress: "10.0.0.5",
  });
  assert.equal(remote.statusCode, 403);

  const local = await app.inject({
    method: "GET",
    url: "/mesh/peers",
    remoteAddress: "127.0.0.1",
  });
  assert.equal(local.statusCode, 200);
  assert.equal(local.json().peers.length, 1);
  await app.close();
});

test("GET /mesh/workspaces is loopback only", async () => {
  const { app, workspaceStore } = await makeHarness();
  workspaceStore.upsert({ path: "/Users/me/projects", label: "Projects" });
  const local = await app.inject({
    method: "GET",
    url: "/mesh/workspaces",
    remoteAddress: "127.0.0.1",
  });
  assert.equal(local.statusCode, 200);
  assert.equal(local.json().workspaces.length, 1);
  await app.close();
});

test("POST /mesh/pair rejects bad token", async () => {
  const { app } = await makeHarness();
  const res = await app.inject({
    method: "POST",
    url: "/mesh/pair",
    payload: {
      v: 1,
      token: "wrong",
      clientNodeId: "ios-1",
      clientDisplayName: "iPhone",
      clientSigningPublicKey: "sk",
      clientAgreementPublicKey: "ak",
      clientKind: "ios",
    },
  });
  assert.equal(res.statusCode, 403);
  await app.close();
});

test("POST /mesh/pair persists peer and returns host identity on success", async () => {
  const { app, identity, hostStore, auditStore } = await makeHarness();
  const res = await app.inject({
    method: "POST",
    url: "/mesh/pair",
    payload: {
      v: 1,
      token: identity.bearerToken,
      clientNodeId: "ios-1",
      clientDisplayName: "iPhone",
      clientSigningPublicKey: "ios-sk",
      clientAgreementPublicKey: "ios-ak",
      clientKind: "ios",
    },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.hostNodeId, identity.nodeId);
  assert.equal(body.hostDisplayName, "Studio Mac");
  const peer = hostStore.get("ios-1");
  assert.ok(peer);
  assert.equal(peer!.kind, "ios");
  assert.equal(peer!.signingPublicKey, "ios-sk");
  assert.equal(auditStore.count("meshPair"), 1);
  await app.close();
});
