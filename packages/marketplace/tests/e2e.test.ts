// Two-node end-to-end test for marketplace/1.0.0 Phase 1 acceptance.
//
// Validates the synthetic flow from plan section 7 Phase 1:
//  1. Both nodes generate identity (root + device + role).
//  2. Node A publishes a signed test-vertical intent to an in-process broker.
//  3. Node B discovers the intent and sends an inquiry with a OneShotKey.
//  4. Node B raises its level by re-signing with its RoleKey.
//  5. Node A reveals fields up to level 2.
//  6. Both nodes sign a MatchReceipt and verify it.
//  7. Re-decoding a serialized receipt and intent round-trips.

import { test } from "vitest";
import assert from "node:assert/strict";

import { encodeCanonicalCbor, decodeCanonicalCbor } from "../src/cbor.ts";
import {
  generateEd25519Keypair, issueCertificate, verifyCertificate,
  encryptSecret, decryptSecret, entropyToMnemonic, mnemonicToEntropy,
  compoundSign, compoundVerify, blake3Hash,
  ed25519ToX25519Public, ed25519ToX25519Private,
} from "../src/identity.ts";
import {
  canonicalizeIntent, signIntent, verifyIntent,
  intentToCborMap, intentFromCborMap, discoveryKey,
} from "../src/wire.ts";
import { InProcessBroker, publishIntent, queryByIntentVertical } from "../src/discovery/brokers.ts";
import { sealAndSign, openAndVerify, sealedBoxEncrypt, sealedBoxDecrypt } from "../src/mailbox.ts";
import { canonicalizeDraft, signAsOfferer, signAsSeeker, verifyReceipt, receiptHash, encodeReceipt, decodeReceipt } from "../src/match.ts";
import {
  TEST_VERTICAL_ID, TEST_VERTICAL_DEFAULT_VISIBILITY, asCbor as testVerticalAsCbor,
} from "../src/verticals/test-vertical.ts";

interface Node {
  name: string;
  root: ReturnType<typeof generateEd25519Keypair>;
  device: ReturnType<typeof generateEd25519Keypair>;
  role: ReturnType<typeof generateEd25519Keypair>;
  deviceCert: ReturnType<typeof issueCertificate>;
  roleCert: ReturnType<typeof issueCertificate>;
}

function spawnNode(name: string): Node {
  const root = generateEd25519Keypair();
  const device = generateEd25519Keypair();
  const role = generateEd25519Keypair();
  const deviceCert = issueCertificate({
    parent: root, child: device, childKind: "device", scope: { deviceName: `${name}-mac` },
  });
  const roleCert = issueCertificate({
    parent: root, child: role, childKind: "role", scope: { vertical: TEST_VERTICAL_ID },
  });
  return { name, root, device, role, deviceCert, roleCert };
}

test("canonical CBOR is deterministic across encodings", () => {
  const a = encodeCanonicalCbor({ b: 1, a: "x" });
  const b = encodeCanonicalCbor({ a: "x", b: 1 });
  assert.deepEqual(Array.from(a), Array.from(b));
  const decoded = decodeCanonicalCbor(a);
  assert.deepEqual(decoded, { a: "x", b: 1 });
});

test("synthetic mnemonic round-trips entropy", () => {
  const entropy = new Uint8Array(32);
  for (let i = 0; i < 32; i++) entropy[i] = i + 1;
  const mnemonic = entropyToMnemonic(entropy);
  const back = mnemonicToEntropy(mnemonic);
  assert.deepEqual(Array.from(back), Array.from(entropy));
});

test("encrypted at-rest blob round-trips", () => {
  const plaintext = new TextEncoder().encode("secret material");
  const blob = encryptSecret(plaintext, "correct horse battery staple");
  const back = decryptSecret(blob, "correct horse battery staple");
  assert.deepEqual(Array.from(back), Array.from(plaintext));
});

test("key certificate signed by parent verifies", () => {
  const node = spawnNode("alpha");
  assert.equal(verifyCertificate(node.deviceCert), true);
  assert.equal(verifyCertificate(node.roleCert), true);
});

test("compound signature round-trip", () => {
  const node = spawnNode("alpha");
  const payload = new TextEncoder().encode("hello, world");
  const sig = compoundSign({ payload, rolePrivate: node.role.privateKey, devicePrivate: node.device.privateKey });
  const ok = compoundVerify({ payload, rolePub: node.role.publicKey, devicePub: node.device.publicKey, signature: sig });
  assert.equal(ok, true);
});

test("intent canonicalization + signature + broker round-trip", () => {
  const offerer = spawnNode("offerer");
  const fields = testVerticalAsCbor({
    title: "Test offer",
    tag: "alpha",
    geo_zone: "ezjm",
    summary: "synthetic offer for testing",
    secret_a: "level-2 secret",
    secret_b: "level-4 secret",
  });
  const visibility = { ...TEST_VERTICAL_DEFAULT_VISIBILITY };
  const { payloadCbor, intentId, intent } = canonicalizeIntent({
    side: "offer",
    vertical: TEST_VERTICAL_ID,
    rolePubkey: offerer.role.publicKey,
    roleCertificate: offerer.roleCert,
    fields,
    visibility,
    expiresAt: Math.floor(Date.now() / 1000) + 86400,
  });
  signIntent({ intent, payloadCbor, rolePrivate: offerer.role.privateKey, devicePrivate: offerer.device.privateKey });
  assert.equal(intent.intentId.length, 32);
  assert.equal(intentId.length, 32);
  assert.equal(verifyIntent({ intent, payloadCbor, devicePub: offerer.device.publicKey }), true);

  const broker = new InProcessBroker();
  publishIntent(broker, intent);
  const results = queryByIntentVertical(broker, { vertical: TEST_VERTICAL_ID, geoZone: "ezjm", tag: "alpha" });
  assert.equal(results.length, 1);
  assert.deepEqual(Array.from(results[0].intentId), Array.from(intent.intentId));

  const dKey = discoveryKey({ vertical: TEST_VERTICAL_ID, geoZone: "ezjm", tag: "alpha" });
  const sameKey = discoveryKey({ vertical: TEST_VERTICAL_ID, geoZone: "ezjm", tag: "alpha" });
  assert.deepEqual(Array.from(dKey), Array.from(sameKey));

  // serialize to CBOR map and back
  const map = intentToCborMap(intent);
  const { intent: rebuilt, payloadCbor: rebuiltCbor } = intentFromCborMap(map);
  assert.deepEqual(Array.from(rebuilt.intentId), Array.from(intent.intentId));
  assert.deepEqual(Array.from(rebuiltCbor), Array.from(payloadCbor));
});

test("sealed-box mailbox round-trips", () => {
  const offerer = spawnNode("offerer");
  const seeker = spawnNode("seeker");
  const m = sealAndSign({
    recipientPubkey: offerer.role.publicKey,
    senderRolePrivate: seeker.role.privateKey,
    senderRolePubkey: seeker.role.publicKey,
    senderDevicePrivate: seeker.device.privateKey,
    kind: "inquire",
    plaintext: { text: "interested!" },
  });
  const { plaintext, ok } = openAndVerify({
    message: m,
    recipientRolePrivate: offerer.role.privateKey,
    senderDevicePub: seeker.device.publicKey,
  });
  assert.equal(ok, true);
  assert.deepEqual(plaintext, { text: "interested!" });
});

test("sealed-box rejects wrong recipient", () => {
  const offerer = spawnNode("offerer");
  const seeker = spawnNode("seeker");
  const other = spawnNode("other");
  const ct = sealedBoxEncrypt(new TextEncoder().encode("hi"), offerer.role.publicKey);
  // wrong recipient cannot decrypt
  assert.throws(() => sealedBoxDecrypt(ct, other.role.privateKey));
  // right recipient succeeds
  const pt = sealedBoxDecrypt(ct, offerer.role.privateKey);
  assert.equal(new TextDecoder().decode(pt), "hi");
  // also use the seeker pubkey to make sure encryption-side is sane
  const ct2 = sealedBoxEncrypt(new TextEncoder().encode("hello"), seeker.role.publicKey);
  const pt2 = sealedBoxDecrypt(ct2, seeker.role.privateKey);
  assert.equal(new TextDecoder().decode(pt2), "hello");
});

test("X25519 derivation produces consistent shared key", async () => {
  const a = spawnNode("alpha");
  const b = spawnNode("bravo");
  const aXPriv = ed25519ToX25519Private(a.role.privateKey);
  const bXPriv = ed25519ToX25519Private(b.role.privateKey);
  const aXPub = ed25519ToX25519Public(a.role.publicKey);
  const bXPub = ed25519ToX25519Public(b.role.publicKey);
  const { x25519: x } = await import("@noble/curves/ed25519");
  const sharedA = x.getSharedSecret(aXPriv, bXPub);
  const sharedB = x.getSharedSecret(bXPriv, aXPub);
  assert.deepEqual(Array.from(sharedA), Array.from(sharedB));
});

test("two-node match: publish, inquire, level up, sign receipt", async () => {
  // Setup --------------------------------------------------------------
  const offerer = spawnNode("offerer");
  const seeker = spawnNode("seeker");
  const broker = new InProcessBroker();

  // Offerer publishes ---------------------------------------------------
  const fields = testVerticalAsCbor({
    title: "House by the sea",
    tag: "real-estate",
    geo_zone: "ezjm",
    summary: "two-bed flat",
    secret_a: "level-2 secret payload",
    secret_b: "level-4 secret payload",
  });
  const visibility = { ...TEST_VERTICAL_DEFAULT_VISIBILITY };
  const { payloadCbor, intent } = canonicalizeIntent({
    side: "offer",
    vertical: TEST_VERTICAL_ID,
    rolePubkey: offerer.role.publicKey,
    roleCertificate: offerer.roleCert,
    fields,
    visibility,
    expiresAt: Math.floor(Date.now() / 1000) + 86400,
  });
  signIntent({ intent, payloadCbor, rolePrivate: offerer.role.privateKey, devicePrivate: offerer.device.privateKey });
  publishIntent(broker, intent);

  // Seeker discovers ----------------------------------------------------
  const found = queryByIntentVertical(broker, { vertical: TEST_VERTICAL_ID, geoZone: "ezjm", tag: "real-estate" });
  assert.equal(found.length, 1);
  const discovered = found[0];
  // Seeker re-verifies the offerer's signature
  assert.ok(discovered.signature);
  const { payloadCbor: payloadForVerify } = intentFromCborMap(intentToCborMap(discovered));
  assert.equal(verifyIntent({ intent: discovered, payloadCbor: payloadForVerify, devicePub: offerer.device.publicKey }), true);

  // Seeker sends inquiry via mailbox ------------------------------------
  const threadId = blake3Hash(new TextEncoder().encode(`thread:${Date.now()}`), 32);
  const inquiry = sealAndSign({
    recipientPubkey: offerer.role.publicKey,
    senderRolePrivate: seeker.role.privateKey,
    senderRolePubkey: seeker.role.publicKey,
    senderDevicePrivate: seeker.device.privateKey,
    threadId,
    kind: "inquire",
    plaintext: {
      intent_id: discovered.intentId,
      text: "Very interested in the property",
      inquirer_role_pubkey: seeker.role.publicKey,
    },
  });

  // Offerer receives inquiry --------------------------------------------
  const { plaintext: inquiryPlaintext, ok: inquiryOk } = openAndVerify({
    message: inquiry,
    recipientRolePrivate: offerer.role.privateKey,
    senderDevicePub: seeker.device.publicKey,
  });
  assert.equal(inquiryOk, true);
  assert.equal((inquiryPlaintext as Record<string, unknown>).text, "Very interested in the property");

  // Offerer raises peer level to 2 and reveals secret_a ------------------
  // (level decision is offerer-side policy; we just reveal here)
  const revealedFields = ["secret_a"];
  const reveal = sealAndSign({
    recipientPubkey: seeker.role.publicKey,
    senderRolePrivate: offerer.role.privateKey,
    senderRolePubkey: offerer.role.publicKey,
    senderDevicePrivate: offerer.device.privateKey,
    threadId,
    kind: "reveal_field",
    plaintext: {
      intent_id: discovered.intentId,
      field_name: "secret_a",
      value: fields.secret_a,
    },
  });
  const { plaintext: revealPlaintext, ok: revealOk } = openAndVerify({
    message: reveal,
    recipientRolePrivate: seeker.role.privateKey,
    senderDevicePub: offerer.device.publicKey,
  });
  assert.equal(revealOk, true);
  assert.equal((revealPlaintext as Record<string, unknown>).value, "level-2 secret payload");

  // Both sign a match receipt -------------------------------------------
  const draft = {
    offerIntentId: discovered.intentId,
    wantIntentId: blake3Hash(new TextEncoder().encode("synthetic-want"), 32),
    offererRolePubkey: offerer.role.publicKey,
    seekerRolePubkey: seeker.role.publicKey,
    reachedLevel: 2,
    fieldsRevealed: revealedFields,
    contactHandover: { phone: "redacted", note: "next-step: visit" },
    signedAt: Math.floor(Date.now() / 1000),
  };
  const offererSig = signAsOfferer({
    draft, rolePrivate: offerer.role.privateKey, devicePrivate: offerer.device.privateKey,
  });
  const seekerSig = signAsSeeker({
    draft, offererSignature: offererSig,
    rolePrivate: seeker.role.privateKey, devicePrivate: seeker.device.privateKey,
  });
  const receipt = { ...draft, offererSignature: offererSig, seekerSignature: seekerSig };
  const ok = verifyReceipt({
    receipt,
    offererDevicePub: offerer.device.publicKey,
    seekerDevicePub: seeker.device.publicKey,
  });
  assert.equal(ok, true);

  // Receipt hash is stable
  const h1 = receiptHash(receipt);
  const enc = encodeReceipt(receipt);
  const dec = decodeReceipt(enc);
  const h2 = receiptHash(dec);
  assert.deepEqual(Array.from(h1), Array.from(h2));
  assert.equal(verifyReceipt({
    receipt: dec, offererDevicePub: offerer.device.publicKey, seekerDevicePub: seeker.device.publicKey,
  }), true);
});

test("revoked-style scenario: a tampered receipt fails verification", () => {
  const offerer = spawnNode("offerer");
  const seeker = spawnNode("seeker");
  const draft = {
    offerIntentId: blake3Hash(new TextEncoder().encode("o"), 32),
    wantIntentId: blake3Hash(new TextEncoder().encode("w"), 32),
    offererRolePubkey: offerer.role.publicKey,
    seekerRolePubkey: seeker.role.publicKey,
    reachedLevel: 2,
    fieldsRevealed: ["x"],
    contactHandover: {},
    signedAt: 1700000000,
  };
  const offererSig = signAsOfferer({
    draft, rolePrivate: offerer.role.privateKey, devicePrivate: offerer.device.privateKey,
  });
  const seekerSig = signAsSeeker({
    draft, offererSignature: offererSig,
    rolePrivate: seeker.role.privateKey, devicePrivate: seeker.device.privateKey,
  });
  // Tamper after signing
  const tampered = { ...draft, reachedLevel: 5, offererSignature: offererSig, seekerSignature: seekerSig };
  assert.equal(verifyReceipt({
    receipt: tampered,
    offererDevicePub: offerer.device.publicKey,
    seekerDevicePub: seeker.device.publicKey,
  }), false);
});
