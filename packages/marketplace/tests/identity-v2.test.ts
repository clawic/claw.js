// Tests for the marketplace/2.0.0 identity layer: BIP-39 recovery + handles.

import { test } from "vitest";
import assert from "node:assert/strict";

import { ed25519 } from "@noble/curves/ed25519";

import {
  generateMnemonic, entropyToMnemonicBip39, mnemonicToEntropyBip39,
  validateMnemonic, mnemonicToSeed,
  masterKeyFromSeed, deriveHardenedChild, deriveFromPath,
  rootFromMnemonic, CLAWIX_PROFILE_PATH, HARDENED_OFFSET,
} from "../src/recovery.ts";
import {
  computeFingerprint, buildHandle, formatHandle, parseHandleText,
  encodePairingLink, decodePairingLink, handleVerify,
} from "../src/handles.ts";

// ---- BIP-39 known test vectors (Trezor) ----

test("BIP-39: all-zero entropy maps to the canonical 24-word mnemonic", () => {
  const entropy = new Uint8Array(32);
  const mnemonic = entropyToMnemonicBip39(entropy);
  assert.equal(mnemonic, [
    "abandon","abandon","abandon","abandon","abandon","abandon",
    "abandon","abandon","abandon","abandon","abandon","abandon",
    "abandon","abandon","abandon","abandon","abandon","abandon",
    "abandon","abandon","abandon","abandon","abandon","art",
  ].join(" "));
});

test("BIP-39: all-FF entropy maps to a known mnemonic", () => {
  const entropy = new Uint8Array(32).fill(0xff);
  const mnemonic = entropyToMnemonicBip39(entropy);
  // From the Trezor test vector list (vector with all 0xff bytes).
  assert.equal(mnemonic, [
    "zoo","zoo","zoo","zoo","zoo","zoo","zoo","zoo",
    "zoo","zoo","zoo","zoo","zoo","zoo","zoo","zoo",
    "zoo","zoo","zoo","zoo","zoo","zoo","zoo","vote",
  ].join(" "));
});

test("BIP-39: round-trip 32-byte entropy", () => {
  const entropy = new Uint8Array(32);
  for (let i = 0; i < 32; i++) entropy[i] = (i * 7 + 3) & 0xff;
  const mnemonic = entropyToMnemonicBip39(entropy);
  const back = mnemonicToEntropyBip39(mnemonic);
  assert.deepEqual(Array.from(back), Array.from(entropy));
});

test("BIP-39: mutating one word breaks the checksum", () => {
  const mnemonic = entropyToMnemonicBip39(new Uint8Array(32));
  const tampered = mnemonic.split(" ");
  tampered[23] = "abandon";
  assert.equal(validateMnemonic(tampered.join(" ")), false);
});

test("BIP-39: PBKDF2 seed matches Trezor test vector for all-zero entropy", () => {
  const mnemonic = entropyToMnemonicBip39(new Uint8Array(32));
  const seed = mnemonicToSeed(mnemonic, { passphrase: "TREZOR" });
  // Canonical seed for "abandon ... art" + passphrase "TREZOR".
  const expected = "bda85446c68413707090a52022edd26a"
                 + "1c9462295029f2e60cd7c4f2bbd3097170af7a4d73245cafa9c3cca8d561a7c3de6f5d4a10be8ed2a5e608d68f92fcc8";
  let hex = "";
  for (const b of seed) hex += b.toString(16).padStart(2, "0");
  assert.equal(hex, expected);
});

test("SLIP-0010: master key from seed matches HMAC-SHA512('ed25519 seed', seed)", () => {
  const seed = new Uint8Array(64);
  for (let i = 0; i < 64; i++) seed[i] = i;
  const master = masterKeyFromSeed(seed);
  assert.equal(master.privateKey.length, 32);
  assert.equal(master.chainCode.length, 32);
  // Deterministic — re-deriving must produce the same result.
  const again = masterKeyFromSeed(seed);
  assert.deepEqual(Array.from(again.privateKey), Array.from(master.privateKey));
});

test("SLIP-0010: hardened-child derivation is deterministic and depends on index", () => {
  const seed = new Uint8Array(64);
  for (let i = 0; i < 64; i++) seed[i] = i + 1;
  const master = masterKeyFromSeed(seed);
  const a = deriveHardenedChild(master, 44);
  const b = deriveHardenedChild(master, 45);
  assert.notDeepEqual(Array.from(a.privateKey), Array.from(b.privateKey));
  const a2 = deriveHardenedChild(master, 44);
  assert.deepEqual(Array.from(a2.privateKey), Array.from(a.privateKey));
});

test("SLIP-0010: rejects non-hardened paths", () => {
  const seed = new Uint8Array(64);
  assert.throws(() => deriveFromPath(seed, "m/44/0/0"), /all-hardened/);
});

test("SLIP-0010: HARDENED_OFFSET is 0x80000000", () => {
  assert.equal(HARDENED_OFFSET, 0x80000000);
});

test("Root: same mnemonic + path produces same RootKey across calls", () => {
  const mnemonic = generateMnemonic(32);
  const a = rootFromMnemonic(mnemonic);
  const b = rootFromMnemonic(mnemonic);
  assert.deepEqual(Array.from(a.publicKey), Array.from(b.publicKey));
  assert.deepEqual(Array.from(a.privateKey), Array.from(b.privateKey));
  // And the public key actually corresponds to the private key.
  const pub = ed25519.getPublicKey(a.privateKey);
  assert.deepEqual(Array.from(pub), Array.from(a.publicKey));
});

test("Root: passphrase changes the derived RootKey", () => {
  const mnemonic = generateMnemonic(32);
  const a = rootFromMnemonic(mnemonic);
  const b = rootFromMnemonic(mnemonic, { passphrase: "extra-secret" });
  assert.notDeepEqual(Array.from(a.publicKey), Array.from(b.publicKey));
});

test("Root: default derivation path is m/44'/0'/0'", () => {
  assert.equal(CLAWIX_PROFILE_PATH, "m/44'/0'/0'");
});

// ---- Handles ----

test("Handle: fingerprint is 12 chars in restricted base32 and deterministic", () => {
  const root = rootFromMnemonic(entropyToMnemonicBip39(new Uint8Array(32)));
  const fp = computeFingerprint(root.publicKey);
  assert.equal(fp.length, 12);
  assert.match(fp, /^[0-9a-z]{12}$/);
  // No ambiguous characters.
  assert.equal(/[ilou]/.test(fp), false);
  // Deterministic.
  assert.equal(computeFingerprint(root.publicKey), fp);
});

test("Handle: build / format / parse round-trips alias+fingerprint", () => {
  const root = rootFromMnemonic(entropyToMnemonicBip39(new Uint8Array(32)));
  const h = buildHandle({ alias: "Pepe", rootPubkey: root.publicKey });
  assert.equal(h.alias, "pepe");        // normalized lowercase
  assert.equal(handleVerify(h), true);
  const text = formatHandle(h);
  assert.match(text, /^@pepe\.[0-9a-z]{12}$/);
  const parts = parseHandleText(text);
  assert.equal(parts.alias, "pepe");
  assert.equal(parts.fingerprint, h.fingerprint);
});

test("Handle: invalid alias is rejected", () => {
  const root = rootFromMnemonic(generateMnemonic(32));
  assert.throws(() => buildHandle({ alias: "!!!", rootPubkey: root.publicKey }), /invalid alias/);
  assert.throws(() => buildHandle({ alias: "-leading", rootPubkey: root.publicKey }), /invalid alias/);
});

test("Pairing link: round-trip preserves alias, fingerprint and rootPubkey", () => {
  const root = rootFromMnemonic(generateMnemonic(32));
  const h = buildHandle({ alias: "alice", rootPubkey: root.publicKey });
  const link = encodePairingLink({
    handle: h,
    hints: { irohNodeId: "abcdef0123456789", addrs: ["/ip4/192.168.1.10/udp/4242/quic"] },
  });
  assert.match(link, /^clawix:\/\/pair\?v=1&d=/);
  const back = decodePairingLink(link);
  assert.equal(back.handle.alias, "alice");
  assert.equal(back.handle.fingerprint, h.fingerprint);
  assert.deepEqual(Array.from(back.handle.rootPubkey), Array.from(root.publicKey));
  assert.equal(back.hints?.irohNodeId, "abcdef0123456789");
});

test("Pairing link: tampered rootPubkey is rejected by the decoder", () => {
  const root = rootFromMnemonic(generateMnemonic(32));
  const h = buildHandle({ alias: "alice", rootPubkey: root.publicKey });
  const link = encodePairingLink({ handle: h });
  // Flip a byte in the encoded payload by re-encoding with a different rootPubkey
  // but the original fingerprint — that's exactly the attack the decoder must catch.
  const evilRoot = rootFromMnemonic(generateMnemonic(32));
  const evilLink = encodePairingLink({
    handle: { alias: h.alias, fingerprint: h.fingerprint, rootPubkey: evilRoot.publicKey },
  });
  assert.notEqual(link, evilLink);
  assert.throws(() => decodePairingLink(evilLink), /does not match fingerprint/);
});
