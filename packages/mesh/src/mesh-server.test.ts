import test from "node:test";
import assert from "node:assert/strict";

import Database from "better-sqlite3";
import Fastify, { type FastifyInstance } from "fastify";

import { AuditStore } from "./audit-store.ts";
import {
  fromBase64Url,
  generateAgreementKeypair,
  generateSigningKeypair,
  toBase64Url,
} from "./crypto.ts";
import { encryptEnvelope } from "./signed-envelope.ts";
import { HostStore } from "./host-store.ts";
import { IdentityStore, type NodeIdentity } from "./identity-store.ts";
import { meshServerPlugin, type MeshServerDeps } from "./mesh-server.ts";
import { SshSecretStore } from "./ssh-secret-store.ts";
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

test("POST /mesh/hosts upserts a host and stores SSH secret metadata", async () => {
  const db = new Database(":memory:");
  const sshSecretStore = new SshSecretStore(db);
  const { app, hostStore } = await makeHarness({ sshSecretStore });
  const remote = await app.inject({
    method: "POST",
    url: "/mesh/hosts",
    remoteAddress: "10.0.0.5",
    payload: {
      host: {
        kind: "linuxServer",
        displayName: "Server",
      },
    },
  });
  assert.equal(remote.statusCode, 403);

  const local = await app.inject({
    method: "POST",
    url: "/mesh/hosts",
    remoteAddress: "127.0.0.1",
    payload: {
      host: {
        id: "server-1",
        kind: "linuxServer",
        displayName: "Server",
        endpoints: [
          { kind: "ssh", host: "server.local", port: 22, protocol: "ssh" },
        ],
        ssh: {
          user: "deploy",
          authMethod: "password",
          passwordSecretId: "secret-1",
        },
      },
      sshSecret: {
        id: "secret-1",
        secret: { kind: "password", password: "topsecret" },
      },
    },
  });
  assert.equal(local.statusCode, 200);
  const body = local.json();
  assert.equal(body.host.id, "server-1");
  assert.equal(body.sshSecret.id, "secret-1");
  assert.equal(body.sshSecret.kind, "password");
  assert.equal(body.sshSecret.password, undefined);
  assert.equal(hostStore.get("server-1")?.ssh?.user, "deploy");
  const stored = sshSecretStore.get("secret-1");
  assert.ok(stored && stored.kind === "password");
  if (stored.kind === "password") {
    assert.equal(stored.password, "topsecret");
  }
  const listedSecrets = await app.inject({
    method: "GET",
    url: "/mesh/ssh/secrets",
    remoteAddress: "127.0.0.1",
  });
  assert.equal(listedSecrets.statusCode, 200);
  assert.equal(listedSecrets.json().secrets.length, 1);

  const revoke = await app.inject({
    method: "POST",
    url: "/mesh/hosts/server-1/revoke",
    remoteAddress: "127.0.0.1",
  });
  assert.equal(revoke.statusCode, 200);
  assert.equal(revoke.json().revoked, true);
  assert.ok(hostStore.get("server-1")?.revokedAt instanceof Date);

  const unrevoke = await app.inject({
    method: "POST",
    url: "/mesh/hosts/server-1/unrevoke",
    remoteAddress: "127.0.0.1",
  });
  assert.equal(unrevoke.statusCode, 200);
  assert.equal(unrevoke.json().unrevoked, true);
  assert.equal(hostStore.get("server-1")?.revokedAt, undefined);

  const deleteSecret = await app.inject({
    method: "DELETE",
    url: "/mesh/ssh/secrets/secret-1",
    remoteAddress: "127.0.0.1",
  });
  assert.equal(deleteSecret.statusCode, 200);
  assert.equal(sshSecretStore.get("secret-1"), null);

  const deleteHost = await app.inject({
    method: "DELETE",
    url: "/mesh/hosts/server-1",
    remoteAddress: "127.0.0.1",
  });
  assert.equal(deleteHost.statusCode, 200);
  assert.equal(hostStore.get("server-1"), null);
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

test("POST /mesh/jobs rejects unknown sender", async () => {
  const { app, identity } = await makeHarness();
  const ghost = generateSigningKeypair();
  const recipientPubAsArray = identity.agreementPublicKey;
  const env = encryptEnvelope({
    senderId: "ghost",
    recipientId: identity.nodeId,
    recipientAgreementPublicKey: recipientPubAsArray,
    signingPrivateKey: ghost.privateKey,
    payload: { hello: 1 },
  });
  const res = await app.inject({
    method: "POST",
    url: "/mesh/jobs",
    payload: env,
  });
  assert.equal(res.statusCode, 403);
  await app.close();
});

test("POST /mesh/jobs accepts envelope from a known peer and runs handler", async () => {
  let handlerCalls = 0;
  const peerSign = generateSigningKeypair();
  const peerAgree = generateAgreementKeypair();

  const harness = await makeHarness({
    jobHandler: async ({ payload }) => {
      handlerCalls += 1;
      return {
        jobId: `j-${handlerCalls}`,
        status: "accepted",
        detail: JSON.stringify(payload),
      };
    },
  });
  harness.hostStore.upsert({
    id: "peer-mac-1",
    kind: "mac",
    displayName: "Other Mac",
    signingPublicKey: toBase64Url(peerSign.publicKey),
    agreementPublicKey: toBase64Url(peerAgree.publicKey),
    permissionProfile: "fullTrust",
    metadata: { tags: [] },
  });

  const env = encryptEnvelope({
    senderId: "peer-mac-1",
    recipientId: harness.identity.nodeId,
    recipientAgreementPublicKey: harness.identity.agreementPublicKey,
    signingPrivateKey: peerSign.privateKey,
    payload: { kind: "ping" },
  });

  const res = await harness.app.inject({
    method: "POST",
    url: "/mesh/jobs",
    payload: env,
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.equal(body.status, "accepted");
  assert.equal(handlerCalls, 1);
  assert.equal(harness.auditStore.count("meshJob"), 1);
  const peerAfter = harness.hostStore.get("peer-mac-1");
  assert.ok(peerAfter?.lastSeenAt instanceof Date);
  await harness.app.close();
});

test("POST /mesh/link is loopback only and uses linkClient", async () => {
  const peerSign = generateSigningKeypair();
  const peerAgree = generateAgreementKeypair();
  const linkClient = async () => ({
    remoteNodeId: "remote-mac-1",
    remoteDisplayName: "Remote Mac",
    remoteSigningPublicKey: toBase64Url(peerSign.publicKey),
    remoteAgreementPublicKey: toBase64Url(peerAgree.publicKey),
  });
  const { app, hostStore, auditStore } = await makeHarness({ linkClient });

  const remote = await app.inject({
    method: "POST",
    url: "/mesh/link",
    remoteAddress: "10.0.0.5",
    payload: { remoteHost: "h", remotePort: 7779, remoteToken: "t" },
  });
  assert.equal(remote.statusCode, 403);

  const ok = await app.inject({
    method: "POST",
    url: "/mesh/link",
    remoteAddress: "127.0.0.1",
    payload: { remoteHost: "remote.local", remotePort: 7779, remoteToken: "t" },
  });
  assert.equal(ok.statusCode, 200);
  const peer = hostStore.get("remote-mac-1");
  assert.ok(peer);
  assert.equal(peer!.endpoints[0].host, "remote.local");
  assert.equal(auditStore.count("meshLink"), 1);
  await app.close();
});
