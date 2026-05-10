import test from "node:test";
import assert from "node:assert/strict";

import {
  aeadDecrypt,
  aeadEncrypt,
  agree,
  bytesEqualConstantTime,
  deriveSessionKey,
  fromBase64Url,
  generateAgreementKeypair,
  generateSigningKeypair,
  randomBytes,
  sign,
  toBase64Url,
  utf8,
  utf8Decode,
  verify,
} from "./crypto.ts";

test("ed25519 sign and verify round-trip", () => {
  const { publicKey, privateKey } = generateSigningKeypair();
  const msg = utf8("hello mesh");
  const sig = sign(privateKey, msg);
  assert.equal(verify(publicKey, msg, sig), true);
  const tampered = utf8("hello mesH");
  assert.equal(verify(publicKey, tampered, sig), false);
});

test("verify returns false on garbage signature", () => {
  const { publicKey } = generateSigningKeypair();
  const sig = randomBytes(64);
  assert.equal(verify(publicKey, utf8("any"), sig), false);
});

test("x25519 ECDH yields the same secret on both sides", () => {
  const a = generateAgreementKeypair();
  const b = generateAgreementKeypair();
  const ab = agree(a.privateKey, b.publicKey);
  const ba = agree(b.privateKey, a.publicKey);
  assert.deepEqual(ab, ba);
});

test("deriveSessionKey is deterministic and 32 bytes", () => {
  const secret = new Uint8Array(32).fill(7);
  const key1 = deriveSessionKey(secret, "mesh-test");
  const key2 = deriveSessionKey(secret, "mesh-test");
  const keyOther = deriveSessionKey(secret, "mesh-other");
  assert.equal(key1.length, 32);
  assert.deepEqual(key1, key2);
  assert.notDeepEqual(key1, keyOther);
});

test("aead round-trips with associated data", () => {
  const key = randomBytes(32);
  const plaintext = utf8("super secret payload");
  const ad = utf8("envelope-v1");
  const { ciphertext, nonce } = aeadEncrypt(key, plaintext, ad);
  const decrypted = aeadDecrypt(key, ciphertext, nonce, ad);
  assert.equal(utf8Decode(decrypted), "super secret payload");
});

test("aead fails when associated data is tampered", () => {
  const key = randomBytes(32);
  const { ciphertext, nonce } = aeadEncrypt(key, utf8("body"), utf8("ad"));
  assert.throws(() => aeadDecrypt(key, ciphertext, nonce, utf8("not-ad")));
});

test("aead fails on wrong key", () => {
  const key = randomBytes(32);
  const wrong = randomBytes(32);
  const { ciphertext, nonce } = aeadEncrypt(key, utf8("body"));
  assert.throws(() => aeadDecrypt(wrong, ciphertext, nonce));
});

test("base64url round-trips arbitrary bytes including padding edges", () => {
  for (const len of [0, 1, 2, 3, 16, 31, 32, 64]) {
    const bytes = randomBytes(len);
    const text = toBase64Url(bytes);
    assert.ok(!text.includes("="), `base64url must not include padding: ${text}`);
    assert.deepEqual(fromBase64Url(text), bytes);
  }
});

test("bytesEqualConstantTime matches expected behavior", () => {
  assert.equal(
    bytesEqualConstantTime(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])),
    true,
  );
  assert.equal(
    bytesEqualConstantTime(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4])),
    false,
  );
  assert.equal(
    bytesEqualConstantTime(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3])),
    false,
  );
});
