// Tests for the clawjs-profile package.

import { test } from "vitest";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";

import { generateEd25519Keypair, issueCertificate } from "@clawjs/marketplace/identity";
import { rootFromMnemonic, generateMnemonic } from "@clawjs/marketplace/recovery";
import { buildHandle } from "@clawjs/marketplace/handles";

import {
  newBlock, signBlock, verifyBlock, encodeBlock, decodeBlock,
} from "../src/blocks.ts";
import { createGroup, addMember, removeMember, isMember, issueInviteLink } from "../src/groups.ts";
import { resolveAcl, projectBlock } from "../src/acl.ts";
import { issueCapability, verifyCapability, encodeCapability, decodeCapability } from "../src/capabilities.ts";
import { ProfileStore, encodeProfileManifest, decodeProfileManifest } from "../src/storage.ts";
import {
  validateSchema, validateContent, fieldsPerLevelFromSchema, matchFields,
  type CustomVerticalSchema,
} from "../src/custom-verticals.ts";

function makeNode(name: string) {
  const root = rootFromMnemonic(generateMnemonic(32));
  const device = generateEd25519Keypair();
  const role = generateEd25519Keypair();
  const deviceCert = issueCertificate({ parent: root, child: device, childKind: "device", scope: { deviceName: name } });
  const roleCert = issueCertificate({ parent: root, child: role, childKind: "role", scope: { vertical: "post" } });
  return { name, root, device, role, deviceCert, roleCert };
}

// ---- blocks ----

test("Block: newBlock + sign + verify round-trips", () => {
  const node = makeNode("alpha");
  const { block, payloadCbor } = newBlock({
    archetype: "standalone",
    vertical: "post",
    audience: { groups: ["public"] },
    fieldsPerLevel: { body: ["public"], geo_zone: ["friends"] },
    content: { body: "hello", geo_zone: "u4pr" },
    rolePubkey: node.role.publicKey,
    roleCertificate: node.roleCert,
  });
  signBlock({ block, payloadCbor, rolePrivate: node.role.privateKey, devicePrivate: node.device.privateKey });
  assert.equal(verifyBlock({ block, payloadCbor, rolePub: node.role.publicKey, devicePub: node.device.publicKey }), true);
});

test("Block: encode / decode preserves blockId", () => {
  const node = makeNode("alpha");
  const { block, payloadCbor } = newBlock({
    archetype: "tracked",
    vertical: "vehicle",
    audience: { groups: ["public"] },
    fieldsPerLevel: { make: ["public"], price_eur: ["public"], vin_full: ["inner-circle"] },
    trackingRef: { module: "vehicle", recordId: "veh-001" },
    overlay: { price_eur: 8500 },
    rolePubkey: node.role.publicKey,
    roleCertificate: node.roleCert,
  });
  signBlock({ block, payloadCbor, rolePrivate: node.role.privateKey, devicePrivate: node.device.privateKey });
  const encoded = encodeBlock(block);
  const { block: back } = decodeBlock(encoded);
  assert.deepEqual(Array.from(back.blockId), Array.from(block.blockId));
  assert.equal(back.vertical, block.vertical);
  assert.deepEqual(back.overlay, block.overlay);
});

// ---- groups ----

test("Group: add/remove members works", () => {
  const node = makeNode("alpha");
  const peer = makeNode("peer");
  let g = createGroup({ id: "friends" });
  assert.equal(isMember(g, peer.root.publicKey), false);
  g = addMember(g, peer.root.publicKey);
  assert.equal(isMember(g, peer.root.publicKey), true);
  g = removeMember(g, peer.root.publicKey);
  assert.equal(isMember(g, peer.root.publicKey), false);
  // Ignoring self.
  g = addMember(g, peer.root.publicKey);
  g = addMember(g, peer.root.publicKey); // idempotent
  assert.equal(g.members.length, 1);
});

test("Group: invite links rejected on private groups", () => {
  let family = createGroup({ id: "family" });
  assert.throws(() => issueInviteLink({ group: family }), /audience.*custom/);
  const audience = createGroup({ id: "audience" });
  const link = issueInviteLink({ group: audience, ttlSeconds: 60 });
  assert.match(link.token, /^[A-Za-z0-9_-]+$/);
  assert.equal(link.usedCount, 0);
});

test("Group: custom-<slug> is valid", () => {
  const g = createGroup({ id: "custom-basket", label: "Basketball folks" });
  assert.equal(g.id, "custom-basket");
});

// ---- ACL ----

test("ACL: viewer in audience group sees the public fields", () => {
  const owner = makeNode("owner");
  const viewer = makeNode("viewer");
  const friends = addMember(createGroup({ id: "friends" }), viewer.root.publicKey);
  const { block } = newBlock({
    archetype: "standalone",
    vertical: "post",
    audience: { groups: ["friends"] },
    fieldsPerLevel: {
      body: ["public", "friends"],
      geo_zone: ["friends"],
      exact_location: ["inner-circle"],
    },
    content: { body: "match in the park", geo_zone: "u4pr", exact_location: "Calle Mayor 1" },
    rolePubkey: owner.role.publicKey,
    roleCertificate: owner.roleCert,
  });
  const res = resolveAcl({ viewerRootPubkey: viewer.root.publicKey, block, ownerGroups: [friends] });
  assert.equal(res.canRead, true);
  assert.deepEqual(res.allowedFields.sort(), ["body", "geo_zone"]);
  assert.deepEqual(res.deniedFields.sort(), ["exact_location"]);
});

test("ACL: viewer outside audience sees nothing", () => {
  const owner = makeNode("owner");
  const viewer = makeNode("viewer");
  const family = createGroup({ id: "family" });               // viewer NOT in family
  const { block } = newBlock({
    archetype: "standalone",
    vertical: "post",
    audience: { groups: ["family"] },
    fieldsPerLevel: { body: ["family"] },
    content: { body: "family-only post" },
    rolePubkey: owner.role.publicKey,
    roleCertificate: owner.roleCert,
  });
  const res = resolveAcl({ viewerRootPubkey: viewer.root.publicKey, block, ownerGroups: [family] });
  assert.equal(res.canRead, false);
  assert.deepEqual(res.allowedFields, []);
});

test("ACL: capability unlocks a denied field", () => {
  const owner = makeNode("owner");
  const viewer = makeNode("viewer");
  const { block } = newBlock({
    archetype: "standalone",
    vertical: "item",
    audience: { groups: ["public"] },
    fieldsPerLevel: { title: ["public"], contact: ["interested-in-listing"] },
    content: { title: "Bike", contact: "+34 600 600 600" },
    rolePubkey: owner.role.publicKey,
    roleCertificate: owner.roleCert,
  });
  const cap = issueCapability({
    blockId: block.blockId,
    level: "interested-in-listing",
    issuedTo: viewer.root.publicKey,
    rolePrivate: owner.role.privateKey,
  });
  const res = resolveAcl({
    viewerRootPubkey: viewer.root.publicKey,
    block,
    ownerGroups: [],
    presentedCapabilities: [cap],
  });
  assert.equal(res.canRead, true);
  assert.ok(res.allowedFields.includes("contact"));
});

test("ACL: forged capability does not unlock a denied field", () => {
  const owner = makeNode("owner");
  const viewer = makeNode("viewer");
  const { block } = newBlock({
    archetype: "standalone",
    vertical: "item",
    audience: { groups: ["public"] },
    fieldsPerLevel: { title: ["public"], contact: ["interested-in-listing"] },
    content: { title: "Bike", contact: "+34 600 600 600" },
    rolePubkey: owner.role.publicKey,
    roleCertificate: owner.roleCert,
  });
  const forged = {
    capId: "forged0000",
    blockId: block.blockId,
    level: "interested-in-listing",
    issuedTo: viewer.root.publicKey,
    issuedAt: Math.floor(Date.now() / 1000),
    expiresAt: Math.floor(Date.now() / 1000) + 60,
  };
  const res = resolveAcl({
    viewerRootPubkey: viewer.root.publicKey,
    block,
    ownerGroups: [],
    presentedCapabilities: [forged],
  });

  assert.equal(res.canRead, true);
  assert.equal(res.allowedFields.includes("contact"), false);
  assert.deepEqual(res.capabilityLevels, []);
});

test("ACL: projectBlock removes denied fields from overlay/content", () => {
  const owner = makeNode("owner");
  const viewer = makeNode("viewer");
  const { block } = newBlock({
    archetype: "standalone",
    vertical: "post",
    audience: { groups: ["public"] },
    fieldsPerLevel: { body: ["public"], private_note: ["inner-circle"] },
    content: { body: "hello", private_note: "secret" },
    rolePubkey: owner.role.publicKey,
    roleCertificate: owner.roleCert,
  });
  const { block: projected } = projectBlock({ viewerRootPubkey: viewer.root.publicKey, block, ownerGroups: [] });
  assert.deepEqual(projected.content, { body: "hello" });
});

// ---- capabilities ----

test("Capability: verify with right pubkey, fail with wrong pubkey", () => {
  const owner = makeNode("owner");
  const wrong = makeNode("imposter");
  const cap = issueCapability({
    blockId: new Uint8Array(32).fill(1),
    level: "share-album",
    rolePrivate: owner.role.privateKey,
  });
  assert.equal(verifyCapability(cap, owner.role.publicKey), true);
  assert.equal(verifyCapability(cap, wrong.role.publicKey), false);
});

test("Capability: encode/decode round-trip", () => {
  const owner = makeNode("owner");
  const cap = issueCapability({
    blockId: new Uint8Array(32).fill(7),
    level: "share-album",
    rolePrivate: owner.role.privateKey,
    issuedTo: owner.root.publicKey,
  });
  const back = decodeCapability(encodeCapability(cap));
  assert.equal(back.capId, cap.capId);
  assert.equal(back.level, cap.level);
  assert.deepEqual(Array.from(back.blockId), Array.from(cap.blockId));
});

// ---- storage ----

test("ProfileStore: round-trip profile + block + group + capability + peer", () => {
  const dir = mkdtempSync(join(tmpdir(), "clawix-profile-"));
  const store = new ProfileStore({ databasePath: join(dir, "profile.db") });
  try {
    const owner = makeNode("owner");
    const peer = makeNode("peer");
    const handle = buildHandle({ alias: "alice", rootPubkey: owner.root.publicKey });
    store.upsertProfile({ rootPubkey: owner.root.publicKey, handle, version: 1 });

    const { block, payloadCbor } = newBlock({
      archetype: "standalone",
      vertical: "post",
      audience: { groups: ["public"] },
      fieldsPerLevel: { body: ["public"] },
      content: { body: "hello" },
      rolePubkey: owner.role.publicKey,
      roleCertificate: owner.roleCert,
    });
    signBlock({ block, payloadCbor, rolePrivate: owner.role.privateKey, devicePrivate: owner.device.privateKey });
    store.putBlock(block, owner.root.publicKey);

    const back = store.getBlock(block.blockId);
    assert.ok(back);
    assert.deepEqual(back!.content, { body: "hello" });

    const group = addMember(createGroup({ id: "friends" }), peer.root.publicKey);
    store.putGroup(group);
    const g = store.getGroup("friends");
    assert.ok(g);
    assert.equal(g!.members.length, 1);

    const cap = issueCapability({
      blockId: block.blockId,
      level: "share-album",
      rolePrivate: owner.role.privateKey,
    });
    store.putCapability(cap, "issued");
    const caps = store.listCapabilities("issued");
    assert.equal(caps.length, 1);
    assert.equal(caps[0].capId, cap.capId);

    const peerHandle = buildHandle({ alias: "bob", rootPubkey: peer.root.publicKey });
    store.upsertPeer({ handle: peerHandle, trustedLocally: true });
    const found = store.resolvePeerByFingerprint(peerHandle.fingerprint);
    assert.ok(found);
    assert.equal(found!.handle.alias, "bob");

    const profile = store.loadProfile();
    assert.ok(profile);
    assert.equal(profile!.handle.alias, "alice");
    assert.equal(profile!.blocks.length, 1);
    assert.equal(profile!.groups.length, 1);
    assert.equal(profile!.capabilitiesIssued.length, 1);

    const manifest = encodeProfileManifest(profile!);
    const decoded = decodeProfileManifest(manifest);
    assert.deepEqual(Array.from(decoded.rootPubkey), Array.from(owner.root.publicKey));
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- custom verticals ----

test("CustomVertical: schema validation enforces id pattern", () => {
  const bad: CustomVerticalSchema = { id: "wrong", label: "x", archetype: "standalone", fields: [] };
  assert.throws(() => validateSchema(bad), /bad id/);
});

test("CustomVertical: content validation surfaces errors", () => {
  const schema: CustomVerticalSchema = {
    id: "book-club/v1",
    label: "Book club",
    archetype: "standalone",
    fields: [
      { id: "title", label: "Title", type: "string", required: true, maxLength: 50 },
      { id: "rating", label: "Rating", type: "integer", min: 1, max: 5 },
      { id: "spoilers", label: "Spoilers", type: "boolean" },
      { id: "category", label: "Cat", type: "enum", options: ["fiction", "non-fiction"] },
      { id: "tags", label: "Tags", type: "tags" },
    ],
  };
  validateSchema(schema);
  const errors = validateContent(schema, { rating: 7, category: "comic", tags: "not-array" } as unknown as Record<string, never>);
  const fields = errors.map((e) => e.field).sort();
  assert.deepEqual(fields, ["category", "rating", "tags", "title"]);
});

test("CustomVertical: helpers derive fieldsPerLevel and matchFields", () => {
  const schema: CustomVerticalSchema = {
    id: "tools-lending/v1",
    label: "Tools lending",
    archetype: "standalone",
    fields: [
      { id: "tool_name", label: "Tool", type: "string", required: true, visibility: ["public"], match: true },
      { id: "deposit_eur", label: "Deposit", type: "number", visibility: ["public"] },
      { id: "address", label: "Address", type: "string", visibility: ["friends"] },
    ],
  };
  validateSchema(schema);
  assert.deepEqual(fieldsPerLevelFromSchema(schema), {
    tool_name: ["public"], deposit_eur: ["public"], address: ["friends"],
  });
  assert.deepEqual(matchFields(schema), ["tool_name"]);
});
