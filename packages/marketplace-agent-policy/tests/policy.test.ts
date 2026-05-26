import { test } from "vitest";
import assert from "node:assert/strict";

import { generateEd25519Keypair, issueCertificate } from "@clawjs/marketplace/identity";
import { rootFromMnemonic, generateMnemonic } from "@clawjs/marketplace/recovery";
import { newBlock, createGroup, addMember } from "@clawjs/profile";

import { evaluate, InMemoryAuditStorage, recordDecision } from "../src/index.ts";
import type { AgentPolicySpec } from "../src/index.ts";

function makeNode(name: string) {
  const root = rootFromMnemonic(generateMnemonic(32));
  const device = generateEd25519Keypair();
  const role = generateEd25519Keypair();
  const deviceCert = issueCertificate({ parent: root, child: device, childKind: "device", scope: { deviceName: name } });
  const roleCert = issueCertificate({ parent: root, child: role, childKind: "role", scope: { vertical: "item" } });
  return { name, root, device, role, deviceCert, roleCert };
}

test("auto_publish: requires conditions to pass", () => {
  const issuer = makeNode("issuer");
  const { block } = newBlock({
    archetype: "standalone",
    vertical: "item/v1",
    audience: { groups: ["public"] },
    fieldsPerLevel: { title: ["public"], price_hint_eur: ["public"] },
    content: { title: "Bike", price_hint_eur: 350 },
    rolePubkey: issuer.role.publicKey, roleCertificate: issuer.roleCert,
  });
  const res = evaluate(
    { scope: "block", autoPublish: { allowed: true, conditions: [{ field: "price_hint_eur", op: "gte", value: 100 }] } },
    "auto_publish",
    { block, groups: [], recentActions: [] },
  );
  assert.equal(res.allowed, true);

  const blocked = evaluate(
    { scope: "block", autoPublish: { allowed: true, conditions: [{ field: "price_hint_eur", op: "gte", value: 1000 }] } },
    "auto_publish",
    { block, groups: [], recentActions: [] },
  );
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reasons.join("|"), /condition failed/);
});

test("auto_respond: respects cooldown per peer", () => {
  const issuer = makeNode("issuer");
  const peer = makeNode("peer");
  const { block } = newBlock({
    archetype: "standalone",
    vertical: "item/v1",
    audience: { groups: ["public"] },
    fieldsPerLevel: { title: ["public"] },
    content: { title: "Bike" },
    rolePubkey: issuer.role.publicKey, roleCertificate: issuer.roleCert,
  });
  const now = 1_700_000_000;
  const recent = [{
    id: "x", action: "auto_respond" as const, blockId: block.blockId,
    peerRootPubkey: peer.root.publicKey, decidedAt: now - 60, result: "allowed" as const, reasons: [],
  }];
  const res = evaluate(
    { scope: "block", autoRespond: { allowed: true, cooldownMinutes: 5 } },
    "auto_respond",
    { block, groups: [], recentActions: recent, peerRootPubkey: peer.root.publicKey, now },
  );
  assert.equal(res.allowed, false);
  assert.match(res.reasons.join(""), /cooldown/);
});

test("auto_respond: cooldown is scoped to the same peer and block", () => {
  const issuer = makeNode("issuer");
  const peer = makeNode("peer");
  const first = newBlock({
    archetype: "standalone",
    vertical: "item/v1",
    audience: { groups: ["public"] },
    fieldsPerLevel: { title: ["public"] },
    content: { title: "Bike" },
    rolePubkey: issuer.role.publicKey,
    roleCertificate: issuer.roleCert,
  }).block;
  const second = newBlock({
    archetype: "standalone",
    vertical: "item/v1",
    audience: { groups: ["public"] },
    fieldsPerLevel: { title: ["public"] },
    content: { title: "Helmet" },
    rolePubkey: issuer.role.publicKey,
    roleCertificate: issuer.roleCert,
  }).block;
  const now = 1_700_000_000;
  const recent = [{
    id: "x", action: "auto_respond" as const, blockId: first.blockId,
    peerRootPubkey: peer.root.publicKey, decidedAt: now - 60, result: "allowed" as const, reasons: [],
  }];
  const res = evaluate(
    { scope: "block", autoRespond: { allowed: true, cooldownMinutes: 5 } },
    "auto_respond",
    { block: second, groups: [], recentActions: recent, peerRootPubkey: peer.root.publicKey, now },
  );
  assert.equal(res.allowed, true);
});

test("auto_accept_interest: requireSharedGroup gates non-friends", () => {
  const issuer = makeNode("issuer");
  const stranger = makeNode("stranger");
  const friend = makeNode("friend");
  const friends = addMember(createGroup({ id: "friends" }), friend.root.publicKey);
  const { block } = newBlock({
    archetype: "standalone",
    vertical: "item/v1",
    audience: { groups: ["public"] },
    fieldsPerLevel: { title: ["public"] },
    content: { title: "Bike" },
    rolePubkey: issuer.role.publicKey, roleCertificate: issuer.roleCert,
  });
  const blocked = evaluate(
    { scope: "block", autoAcceptInterest: { allowed: true, requireSharedGroup: true } },
    "auto_accept_interest",
    { block, groups: [friends], peerRootPubkey: stranger.root.publicKey, recentActions: [] },
  );
  assert.equal(blocked.allowed, false);
  const allowed = evaluate(
    { scope: "block", autoAcceptInterest: { allowed: true, requireSharedGroup: true } },
    "auto_accept_interest",
    { block, groups: [friends], peerRootPubkey: friend.root.publicKey, recentActions: [] },
  );
  assert.equal(allowed.allowed, true);
});

test("auto_lower_price: respects frequency window", () => {
  const issuer = makeNode("issuer");
  const { block } = newBlock({
    archetype: "standalone",
    vertical: "item/v1",
    audience: { groups: ["public"] },
    fieldsPerLevel: { price_hint_eur: ["public"] },
    content: { price_hint_eur: 500 },
    rolePubkey: issuer.role.publicKey, roleCertificate: issuer.roleCert,
  });
  const now = 1_700_000_000;
  const recent = [{
    id: "x", action: "auto_lower_price" as const, blockId: block.blockId,
    decidedAt: now - 86400 * 3, result: "allowed" as const, reasons: [],
  }];
  const res = evaluate(
    { scope: "block", autoLowerPrice: { allowed: true, capPercent: 10, frequencyDays: 7 } },
    "auto_lower_price",
    { block, groups: [], recentActions: recent, now },
  );
  assert.equal(res.allowed, false);
});

test("auto_lower_price: rejects partial safety bounds", () => {
  const issuer = makeNode("issuer");
  const { block } = newBlock({
    archetype: "standalone",
    vertical: "item/v1",
    audience: { groups: ["public"] },
    fieldsPerLevel: { price_hint_eur: ["public"] },
    content: { price_hint_eur: 500 },
    rolePubkey: issuer.role.publicKey, roleCertificate: issuer.roleCert,
  });
  const partialPolicy = {
    scope: "block",
    autoLowerPrice: { allowed: true, capPercent: 10 },
  } as unknown as AgentPolicySpec;
  const uncappedPolicy = {
    scope: "block",
    autoLowerPrice: { allowed: true, frequencyDays: 7 },
  } as unknown as AgentPolicySpec;

  const res = evaluate(
    partialPolicy,
    "auto_lower_price",
    { block, groups: [], recentActions: [], now: 1_700_000_000 },
  );

  assert.equal(res.allowed, false);
  assert.match(res.reasons.join("|"), /invalid frequencyDays/);

  const uncapped = evaluate(
    uncappedPolicy,
    "auto_lower_price",
    { block, groups: [], recentActions: [], now: 1_700_000_000 },
  );

  assert.equal(uncapped.allowed, false);
  assert.match(uncapped.reasons.join("|"), /invalid capPercent/);
});

test("audit storage records decisions and exposes per-block history", () => {
  const issuer = makeNode("issuer");
  const { block } = newBlock({
    archetype: "standalone",
    vertical: "item/v1",
    audience: { groups: ["public"] },
    fieldsPerLevel: { title: ["public"] },
    content: { title: "Bike" },
    rolePubkey: issuer.role.publicKey, roleCertificate: issuer.roleCert,
  });
  const storage = new InMemoryAuditStorage();
  const res = evaluate(
    { scope: "block", autoPublish: { allowed: true } },
    "auto_publish",
    { block, groups: [], recentActions: [] },
  );
  const entry = recordDecision({ storage, action: "auto_publish", blockId: block.blockId, result: res });
  assert.equal(entry.result, "allowed");
  assert.equal(storage.forBlock(block.blockId).length, 1);
});
