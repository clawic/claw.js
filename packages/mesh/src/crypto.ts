import { randomBytes as nodeRandomBytes, timingSafeEqual } from "node:crypto";

import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { ed25519, x25519 } from "@noble/curves/ed25519";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha2";

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export function generateSigningKeypair(): KeyPair {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return { publicKey, privateKey };
}

export function sign(privateKey: Uint8Array, message: Uint8Array): Uint8Array {
  return ed25519.sign(message, privateKey);
}

export function verify(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array,
): boolean {
  try {
    return ed25519.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}

export function generateAgreementKeypair(): KeyPair {
  const privateKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return { publicKey, privateKey };
}

export function agree(
  privateKey: Uint8Array,
  peerPublicKey: Uint8Array,
): Uint8Array {
  return x25519.getSharedSecret(privateKey, peerPublicKey);
}

export const SESSION_KEY_LENGTH = 32;

export function deriveSessionKey(
  sharedSecret: Uint8Array,
  info: string,
  salt: Uint8Array = new Uint8Array(0),
): Uint8Array {
  return hkdf(sha256, sharedSecret, salt, info, SESSION_KEY_LENGTH);
}

export const AEAD_NONCE_LENGTH = 24;

export interface AeadCiphertext {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
}

export function aeadEncrypt(
  key: Uint8Array,
  plaintext: Uint8Array,
  associatedData: Uint8Array = new Uint8Array(0),
): AeadCiphertext {
  if (key.length !== SESSION_KEY_LENGTH) {
    throw new Error(`aead key must be ${SESSION_KEY_LENGTH} bytes`);
  }
  const nonce = randomBytes(AEAD_NONCE_LENGTH);
  const cipher = xchacha20poly1305(key, nonce, associatedData);
  const ciphertext = cipher.encrypt(plaintext);
  return { ciphertext, nonce };
}

export function aeadDecrypt(
  key: Uint8Array,
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  associatedData: Uint8Array = new Uint8Array(0),
): Uint8Array {
  if (key.length !== SESSION_KEY_LENGTH) {
    throw new Error(`aead key must be ${SESSION_KEY_LENGTH} bytes`);
  }
  if (nonce.length !== AEAD_NONCE_LENGTH) {
    throw new Error(`aead nonce must be ${AEAD_NONCE_LENGTH} bytes`);
  }
  const cipher = xchacha20poly1305(key, nonce, associatedData);
  return cipher.decrypt(ciphertext);
}

export function randomBytes(n: number): Uint8Array {
  return new Uint8Array(nodeRandomBytes(n));
}

export function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export function fromBase64Url(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, "base64url"));
}

export function bytesEqualConstantTime(
  a: Uint8Array,
  b: Uint8Array,
): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}
