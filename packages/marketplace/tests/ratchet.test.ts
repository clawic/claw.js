// X3DH + Double Ratchet tests.

import { test } from "node:test";
import assert from "node:assert/strict";

import { generateEd25519Keypair } from "../src/identity.ts";
import {
  x3dhInitiate, x3dhRespond, signPreKey, generatePreKeyPair,
} from "../src/ratchet/x3dh.ts";
import {
  initAsAlice, initAsBob, dratchetEncrypt, dratchetDecrypt,
  encodeMessage, decodeMessage,
} from "../src/ratchet/double-ratchet.ts";
import {
  encryptSync, decryptSync, deriveClusterKey, DevicePreKeyDirectory,
} from "../src/sync/index.ts";
import {
  sealAndSignV2, openAndVerifyV2,
} from "../src/mailbox.ts";

test("X3DH: initiator and responder derive the same shared secret (with one-time pre-key)", () => {
  const idA = generateEd25519Keypair();
  const idB = generateEd25519Keypair();
  const spkB = generatePreKeyPair();
  const opkB = generatePreKeyPair();
  const spkB_sig = signPreKey({ identityPrivate: idB.privateKey, preKeyPublic: spkB.publicKey });
  const ekA = generatePreKeyPair();

  const { sharedSecret: skA, ephemeralPublic } = x3dhInitiate({
    initiator: { identityPrivate: idA.privateKey, ephemeralPrivate: ekA.privateKey },
    responderBundle: {
      identityKey: idB.publicKey,
      signedPreKey: spkB.publicKey,
      signedPreKeyId: 1,
      signedPreKeySignature: spkB_sig,
      oneTimePreKey: opkB.publicKey,
      oneTimePreKeyId: 7,
    },
  });
  const { sharedSecret: skB } = x3dhRespond({
    responder: {
      identityPrivate: idB.privateKey,
      signedPreKeyPrivate: spkB.privateKey,
      oneTimePreKeyPrivate: opkB.privateKey,
    },
    initiatorIdentityKey: idA.publicKey,
    initiatorEphemeralPublic: ephemeralPublic,
  });
  assert.deepEqual(Array.from(skA), Array.from(skB));
});

test("X3DH: tampered signed pre-key signature is rejected", () => {
  const idA = generateEd25519Keypair();
  const idB = generateEd25519Keypair();
  const spkB = generatePreKeyPair();
  const badSig = new Uint8Array(64);
  const ekA = generatePreKeyPair();
  assert.throws(() => x3dhInitiate({
    initiator: { identityPrivate: idA.privateKey, ephemeralPrivate: ekA.privateKey },
    responderBundle: {
      identityKey: idB.publicKey,
      signedPreKey: spkB.publicKey,
      signedPreKeyId: 1,
      signedPreKeySignature: badSig,
    },
  }), /signed pre-key signature/);
});

test("Double Ratchet: Alice→Bob, then Bob→Alice (re-key), then Alice→Bob each get a fresh message key", () => {
  const idA = generateEd25519Keypair();
  const idB = generateEd25519Keypair();
  const spkB = generatePreKeyPair();
  const spkB_sig = signPreKey({ identityPrivate: idB.privateKey, preKeyPublic: spkB.publicKey });
  const ekA = generatePreKeyPair();

  const { sharedSecret: skA, ephemeralPublic } = x3dhInitiate({
    initiator: { identityPrivate: idA.privateKey, ephemeralPrivate: ekA.privateKey },
    responderBundle: {
      identityKey: idB.publicKey,
      signedPreKey: spkB.publicKey,
      signedPreKeyId: 1,
      signedPreKeySignature: spkB_sig,
    },
  });
  const { sharedSecret: skB } = x3dhRespond({
    responder: {
      identityPrivate: idB.privateKey,
      signedPreKeyPrivate: spkB.privateKey,
    },
    initiatorIdentityKey: idA.publicKey,
    initiatorEphemeralPublic: ephemeralPublic,
  });

  let alice = initAsAlice({ rootKeyFromX3dh: skA, remoteDh: spkB.publicKey });
  let bob = initAsBob({ rootKeyFromX3dh: skB, signedPreKeyPair: spkB });

  const ad = new TextEncoder().encode("clawix-test");

  // Alice → Bob
  const enc1 = dratchetEncrypt(alice, new TextEncoder().encode("hi bob"), ad);
  alice = enc1.nextState;
  const dec1 = dratchetDecrypt(bob, enc1.message, ad);
  bob = dec1.nextState;
  assert.equal(new TextDecoder().decode(dec1.plaintext), "hi bob");

  // Bob → Alice (triggers a DH ratchet step on Alice's side)
  const enc2 = dratchetEncrypt(bob, new TextEncoder().encode("hi alice"), ad);
  bob = enc2.nextState;
  const dec2 = dratchetDecrypt(alice, enc2.message, ad);
  alice = dec2.nextState;
  assert.equal(new TextDecoder().decode(dec2.plaintext), "hi alice");

  // Alice → Bob again (each message uses a fresh chain key)
  const enc3 = dratchetEncrypt(alice, new TextEncoder().encode("second msg"), ad);
  alice = enc3.nextState;
  const dec3 = dratchetDecrypt(bob, enc3.message, ad);
  bob = dec3.nextState;
  assert.equal(new TextDecoder().decode(dec3.plaintext), "second msg");

  // The two Alice→Bob ciphertexts must be distinct.
  assert.notEqual(toHex(enc1.message.ciphertext), toHex(enc3.message.ciphertext));
});

test("Double Ratchet: out-of-order delivery is tolerated via skippedKeys", () => {
  const idA = generateEd25519Keypair();
  const idB = generateEd25519Keypair();
  const spkB = generatePreKeyPair();
  const spkB_sig = signPreKey({ identityPrivate: idB.privateKey, preKeyPublic: spkB.publicKey });
  const ekA = generatePreKeyPair();
  const { sharedSecret: skA, ephemeralPublic } = x3dhInitiate({
    initiator: { identityPrivate: idA.privateKey, ephemeralPrivate: ekA.privateKey },
    responderBundle: {
      identityKey: idB.publicKey, signedPreKey: spkB.publicKey,
      signedPreKeyId: 1, signedPreKeySignature: spkB_sig,
    },
  });
  const { sharedSecret: skB } = x3dhRespond({
    responder: { identityPrivate: idB.privateKey, signedPreKeyPrivate: spkB.privateKey },
    initiatorIdentityKey: idA.publicKey,
    initiatorEphemeralPublic: ephemeralPublic,
  });
  let alice = initAsAlice({ rootKeyFromX3dh: skA, remoteDh: spkB.publicKey });
  let bob = initAsBob({ rootKeyFromX3dh: skB, signedPreKeyPair: spkB });

  const enc1 = dratchetEncrypt(alice, new TextEncoder().encode("m1"));
  alice = enc1.nextState;
  const enc2 = dratchetEncrypt(alice, new TextEncoder().encode("m2"));
  alice = enc2.nextState;
  const enc3 = dratchetEncrypt(alice, new TextEncoder().encode("m3"));
  alice = enc3.nextState;
  // Bob receives m3 first (skips m1, m2).
  const dec3 = dratchetDecrypt(bob, enc3.message);
  bob = dec3.nextState;
  // Then m1.
  const dec1 = dratchetDecrypt(bob, enc1.message);
  bob = dec1.nextState;
  // Then m2.
  const dec2 = dratchetDecrypt(bob, enc2.message);
  bob = dec2.nextState;
  assert.equal(new TextDecoder().decode(dec1.plaintext), "m1");
  assert.equal(new TextDecoder().decode(dec2.plaintext), "m2");
  assert.equal(new TextDecoder().decode(dec3.plaintext), "m3");
});

test("Double Ratchet: encode/decode wire format round-trips", () => {
  const idA = generateEd25519Keypair();
  const idB = generateEd25519Keypair();
  const spkB = generatePreKeyPair();
  const spkB_sig = signPreKey({ identityPrivate: idB.privateKey, preKeyPublic: spkB.publicKey });
  const ekA = generatePreKeyPair();
  const { sharedSecret: skA } = x3dhInitiate({
    initiator: { identityPrivate: idA.privateKey, ephemeralPrivate: ekA.privateKey },
    responderBundle: {
      identityKey: idB.publicKey, signedPreKey: spkB.publicKey,
      signedPreKeyId: 1, signedPreKeySignature: spkB_sig,
    },
  });
  const alice = initAsAlice({ rootKeyFromX3dh: skA, remoteDh: spkB.publicKey });
  const enc = dratchetEncrypt(alice, new TextEncoder().encode("hello"));
  const wire = encodeMessage(enc.message);
  const back = decodeMessage(wire);
  assert.deepEqual(Array.from(back.nonce), Array.from(enc.message.nonce));
  assert.equal(back.header.messageNumber, 0);
});

test("Mailbox v2: sealAndSignV2 / openAndVerifyV2 round-trip", () => {
  const idA = generateEd25519Keypair();
  const devA = generateEd25519Keypair();
  const idB = generateEd25519Keypair();
  const spkB = generatePreKeyPair();
  const spkB_sig = signPreKey({ identityPrivate: idB.privateKey, preKeyPublic: spkB.publicKey });
  const ekA = generatePreKeyPair();
  const { sharedSecret: skA } = x3dhInitiate({
    initiator: { identityPrivate: idA.privateKey, ephemeralPrivate: ekA.privateKey },
    responderBundle: {
      identityKey: idB.publicKey, signedPreKey: spkB.publicKey,
      signedPreKeyId: 1, signedPreKeySignature: spkB_sig,
    },
  });
  const { sharedSecret: skB } = x3dhRespond({
    responder: { identityPrivate: idB.privateKey, signedPreKeyPrivate: spkB.privateKey },
    initiatorIdentityKey: idA.publicKey,
    initiatorEphemeralPublic: x3dhInitiateEpk(idA, ekA, idB, spkB, spkB_sig),
  });
  let aliceState = initAsAlice({ rootKeyFromX3dh: skA, remoteDh: spkB.publicKey });
  let bobState = initAsBob({ rootKeyFromX3dh: skB, signedPreKeyPair: spkB });
  const { message, nextState } = sealAndSignV2({
    recipientPubkey: idB.publicKey,
    senderRolePrivate: idA.privateKey,
    senderRolePubkey: idA.publicKey,
    senderDevicePrivate: devA.privateKey,
    kind: "text",
    plaintext: { body: "first message" },
    ratchetState: aliceState,
  });
  aliceState = nextState;
  const opened = openAndVerifyV2({
    message,
    ratchetState: bobState,
    senderDevicePub: devA.publicKey,
  });
  assert.equal(opened.ok, true);
  assert.deepEqual(opened.plaintext, { body: "first message" });
});

test("Multi-device sync: encryptSync / decryptSync via cluster key derived from RoleKey", () => {
  const role = generateEd25519Keypair();
  const clusterKey = deriveClusterKey(role.privateKey);
  // Same role on a second device derives the same cluster key.
  const clusterKey2 = deriveClusterKey(role.privateKey);
  assert.deepEqual(Array.from(clusterKey), Array.from(clusterKey2));
  const envelope = encryptSync({
    clusterKey,
    channel: "blocks",
    fromDevicePubkey: new Uint8Array(32).fill(1),
    recordId: new Uint8Array(32).fill(2),
    seq: 1,
    payload: { hello: "world" },
  });
  const decoded = decryptSync(envelope, clusterKey);
  assert.deepEqual(decoded, { hello: "world" });
  // Wrong cluster key fails.
  assert.throws(() => decryptSync(envelope, new Uint8Array(32)));
});

test("Multi-device sync: DevicePreKeyDirectory enumerates all devices of a Root", () => {
  const dir = new DevicePreKeyDirectory();
  const rootA = generateEd25519Keypair();
  const dev1 = generateEd25519Keypair();
  const dev2 = generateEd25519Keypair();
  dir.publish({
    rootPubkey: rootA.publicKey, devicePubkey: dev1.publicKey,
    identityKey: rootA.publicKey, signedPreKey: new Uint8Array(32),
    signedPreKeyId: 1, signedPreKeySignature: new Uint8Array(64),
    oneTimePreKeys: [{ id: 1, key: new Uint8Array(32) }],
  });
  dir.publish({
    rootPubkey: rootA.publicKey, devicePubkey: dev2.publicKey,
    identityKey: rootA.publicKey, signedPreKey: new Uint8Array(32),
    signedPreKeyId: 1, signedPreKeySignature: new Uint8Array(64),
  });
  assert.equal(dir.devicesOf(rootA.publicKey).length, 2);
  const popped = dir.consumeOneTimePreKey({ rootPubkey: rootA.publicKey, devicePubkey: dev1.publicKey });
  assert.ok(popped);
  assert.equal(popped!.id, 1);
});

function toHex(buf: Uint8Array): string {
  return Buffer.from(buf).toString("hex");
}

function x3dhInitiateEpk(
  idA: ReturnType<typeof generateEd25519Keypair>,
  ekA: { publicKey: Uint8Array; privateKey: Uint8Array },
  idB: ReturnType<typeof generateEd25519Keypair>,
  spkB: { publicKey: Uint8Array; privateKey: Uint8Array },
  spkB_sig: Uint8Array,
): Uint8Array {
  return x3dhInitiate({
    initiator: { identityPrivate: idA.privateKey, ephemeralPrivate: ekA.privateKey },
    responderBundle: {
      identityKey: idB.publicKey, signedPreKey: spkB.publicKey,
      signedPreKeyId: 1, signedPreKeySignature: spkB_sig,
    },
  }).ephemeralPublic;
}
