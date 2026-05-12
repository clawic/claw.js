// Identity primitives for mp/1.0.0.
//
// Implements the multi-key identity model: RootKey, DeviceKey, RoleKey,
// OneShotKey. Provides keypair generation, certificate issuance, X25519
// derivation for sealed-box encryption, and a passphrase-based encryption
// wrapper for storing secrets at rest.
//
// Crypto stack:
//   - Ed25519 for signing (RootKey, DeviceKey, RoleKey, OneShotKey).
//   - X25519 for sealed-box encryption between RoleKeys.
//   - blake3 for canonical hashing.
//   - XChaCha20-Poly1305 for encrypted at-rest storage of secrets.

import { ed25519, edwardsToMontgomeryPriv, edwardsToMontgomeryPub, x25519 } from "@noble/curves/ed25519";
import { blake3 } from "@noble/hashes/blake3";
import { sha256 } from "@noble/hashes/sha2";
import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { randomBytes } from "node:crypto";

import { encodeCanonicalCbor, decodeCanonicalCbor, type CborValue } from "./cbor.ts";

// ---- types ----

export type ChildKind = "device" | "role";

export interface Ed25519Keypair {
  publicKey: Uint8Array;   // 32 bytes
  privateKey: Uint8Array;  // 32-byte seed (noble convention)
}

export interface X25519Keypair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface KeyCertificate {
  parentPubkey: Uint8Array;
  childPubkey: Uint8Array;
  childKind: ChildKind;
  scope: { deviceName?: string; vertical?: string };
  issuedAt: number;
  expiresAt: number;
  parentSignature: Uint8Array;
}

export interface EncryptedBlob {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  salt: Uint8Array;
  alg: "xchacha20poly1305";
  kdf: "blake3" | "sha256";
}

// ---- keypair generation ----

export function generateEd25519Keypair(): Ed25519Keypair {
  const privateKey = randomBytes(32);
  const publicKey = ed25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

export function ed25519PublicKey(privateKey: Uint8Array): Uint8Array {
  return ed25519.getPublicKey(privateKey);
}

// ---- X25519 derivation from Ed25519 ----

export function ed25519ToX25519Public(edPub: Uint8Array): Uint8Array {
  return edwardsToMontgomeryPub(edPub);
}

export function ed25519ToX25519Private(edPriv: Uint8Array): Uint8Array {
  return edwardsToMontgomeryPriv(edPriv);
}

// ---- certificate issuance ----

function certificatePayload(input: {
  parentPubkey: Uint8Array;
  childPubkey: Uint8Array;
  childKind: ChildKind;
  scope: { deviceName?: string; vertical?: string };
  issuedAt: number;
  expiresAt: number;
}): CborValue {
  const scope: Record<string, CborValue> = {};
  if (input.scope.deviceName) scope.device_name = input.scope.deviceName;
  if (input.scope.vertical) scope.vertical = input.scope.vertical;
  return {
    parent_pubkey: input.parentPubkey,
    child_pubkey: input.childPubkey,
    child_kind: input.childKind,
    scope,
    issued_at: input.issuedAt,
    expires_at: input.expiresAt,
  };
}

export function issueCertificate(input: {
  parent: Ed25519Keypair;
  child: Ed25519Keypair;
  childKind: ChildKind;
  scope: { deviceName?: string; vertical?: string };
  issuedAt?: number;
  expiresAt?: number;
}): KeyCertificate {
  const issuedAt = input.issuedAt ?? Math.floor(Date.now() / 1000);
  const expiresAt = input.expiresAt ?? issuedAt + 60 * 60 * 24 * 365 * 5; // 5 years
  const payload = certificatePayload({
    parentPubkey: input.parent.publicKey,
    childPubkey: input.child.publicKey,
    childKind: input.childKind,
    scope: input.scope,
    issuedAt,
    expiresAt,
  });
  const message = encodeCanonicalCbor(payload);
  const signature = ed25519.sign(message, input.parent.privateKey);
  return {
    parentPubkey: input.parent.publicKey,
    childPubkey: input.child.publicKey,
    childKind: input.childKind,
    scope: input.scope,
    issuedAt,
    expiresAt,
    parentSignature: signature,
  };
}

export function verifyCertificate(cert: KeyCertificate): boolean {
  const payload = certificatePayload({
    parentPubkey: cert.parentPubkey,
    childPubkey: cert.childPubkey,
    childKind: cert.childKind,
    scope: cert.scope,
    issuedAt: cert.issuedAt,
    expiresAt: cert.expiresAt,
  });
  const message = encodeCanonicalCbor(payload);
  return ed25519.verify(cert.parentSignature, message, cert.parentPubkey);
}

export function encodeCertificate(cert: KeyCertificate): Uint8Array {
  return encodeCanonicalCbor({
    parent_pubkey: cert.parentPubkey,
    child_pubkey: cert.childPubkey,
    child_kind: cert.childKind,
    scope: { ...(cert.scope.deviceName ? { device_name: cert.scope.deviceName } : {}),
             ...(cert.scope.vertical ? { vertical: cert.scope.vertical } : {}) },
    issued_at: cert.issuedAt,
    expires_at: cert.expiresAt,
    parent_signature: cert.parentSignature,
  });
}

export function decodeCertificate(cbor: Uint8Array): KeyCertificate {
  const decoded = decodeCanonicalCbor(cbor) as Record<string, CborValue>;
  const scope = (decoded.scope ?? {}) as Record<string, CborValue>;
  return {
    parentPubkey: decoded.parent_pubkey as Uint8Array,
    childPubkey: decoded.child_pubkey as Uint8Array,
    childKind: decoded.child_kind as ChildKind,
    scope: {
      deviceName: scope.device_name as string | undefined,
      vertical: scope.vertical as string | undefined,
    },
    issuedAt: decoded.issued_at as number,
    expiresAt: decoded.expires_at as number,
    parentSignature: decoded.parent_signature as Uint8Array,
  };
}

// ---- compound signature ----

export interface CompoundSignature {
  role: Uint8Array;
  device: Uint8Array;
}

export function compoundSign(input: {
  payload: Uint8Array;
  rolePrivate: Uint8Array;
  devicePrivate: Uint8Array;
}): CompoundSignature {
  const role = ed25519.sign(input.payload, input.rolePrivate);
  const composite = new Uint8Array(input.payload.length + role.length);
  composite.set(input.payload, 0);
  composite.set(role, input.payload.length);
  const device = ed25519.sign(composite, input.devicePrivate);
  return { role, device };
}

export function compoundVerify(input: {
  payload: Uint8Array;
  rolePub: Uint8Array;
  devicePub: Uint8Array;
  signature: CompoundSignature;
}): boolean {
  if (!ed25519.verify(input.signature.role, input.payload, input.rolePub)) return false;
  const composite = new Uint8Array(input.payload.length + input.signature.role.length);
  composite.set(input.payload, 0);
  composite.set(input.signature.role, input.payload.length);
  return ed25519.verify(input.signature.device, composite, input.devicePub);
}

// ---- at-rest encryption ----

function passphraseKey(passphrase: string, salt: Uint8Array): Uint8Array {
  // Derive a 32-byte key from passphrase + salt. blake3 keyed mode is used as a
  // cheap PBKDF for the local at-rest wrapper. For production, swap for
  // argon2id (out of scope for the synthetic vertical test pass).
  const pwd = new TextEncoder().encode(passphrase);
  const concat = new Uint8Array(salt.length + pwd.length);
  concat.set(salt, 0);
  concat.set(pwd, salt.length);
  return blake3(concat, { dkLen: 32 });
}

export function encryptSecret(plaintext: Uint8Array, passphrase: string): EncryptedBlob {
  const salt = randomBytes(16);
  const nonce = randomBytes(24);
  const key = passphraseKey(passphrase, salt);
  const cipher = xchacha20poly1305(key, nonce);
  const ciphertext = cipher.encrypt(plaintext);
  return { ciphertext, nonce, salt, alg: "xchacha20poly1305", kdf: "blake3" };
}

export function decryptSecret(blob: EncryptedBlob, passphrase: string): Uint8Array {
  const key = passphraseKey(passphrase, blob.salt);
  const cipher = xchacha20poly1305(key, blob.nonce);
  return cipher.decrypt(blob.ciphertext);
}

// ---- mnemonic (recovery phrase) ----

// Minimal 24-word "recovery phrase" for Phase 1 synthetic tests. NOT BIP-39
// compatible. The phrase is derived from 32 bytes of entropy by chunking into
// 24 indices of an internal small wordlist. Real BIP-39 implementation lands
// in Phase 2.

const SYNTHETIC_WORDLIST = [
  "abandon","ability","able","about","above","absent","absorb","abstract",
  "absurd","abuse","access","accident","account","accuse","achieve","acid",
  "acoustic","acquire","across","act","action","actor","actress","actual",
  "adapt","add","addict","address","adjust","admit","adult","advance",
  "advice","aerobic","affair","afford","afraid","again","age","agent",
  "agree","ahead","aim","air","airport","aisle","alarm","album",
  "alcohol","alert","alien","all","alley","allow","almost","alone",
  "alpha","already","also","alter","always","amateur","amazing","among",
];

// 32 bytes = 256 bits. Append an 8-bit checksum (264 bits total). Pack into
// 44 words of 6 bits each = 264 bits exact. Synthetic, not BIP-39.
const MNEMONIC_WORDS = 44;
const MNEMONIC_BITS_PER_WORD = 6;

export function entropyToMnemonic(entropy: Uint8Array): string {
  if (entropy.length !== 32) throw new Error("entropy must be 32 bytes");
  const checksum = sha256(entropy)[0];
  const expanded = new Uint8Array(entropy.length + 1);
  expanded.set(entropy, 0);
  expanded[entropy.length] = checksum;
  const words: string[] = [];
  let bitBuf = 0; let bitCount = 0; let byteIdx = 0;
  for (let i = 0; i < MNEMONIC_WORDS; i++) {
    while (bitCount < MNEMONIC_BITS_PER_WORD && byteIdx < expanded.length) {
      bitBuf = (bitBuf << 8) | expanded[byteIdx++];
      bitCount += 8;
    }
    const shift = bitCount - MNEMONIC_BITS_PER_WORD;
    const idx = (bitBuf >> shift) & ((1 << MNEMONIC_BITS_PER_WORD) - 1);
    bitBuf &= (1 << shift) - 1;
    bitCount -= MNEMONIC_BITS_PER_WORD;
    words.push(SYNTHETIC_WORDLIST[idx]);
  }
  return words.join(" ");
}

export function mnemonicToEntropy(mnemonic: string): Uint8Array {
  const words = mnemonic.split(/\s+/).filter((w) => w);
  if (words.length !== MNEMONIC_WORDS) throw new Error(`mnemonic must be ${MNEMONIC_WORDS} words`);
  let bitBuf = 0; let bitCount = 0;
  const out: number[] = [];
  for (const word of words) {
    const idx = SYNTHETIC_WORDLIST.indexOf(word);
    if (idx < 0) throw new Error(`unknown mnemonic word: ${word}`);
    bitBuf = (bitBuf << MNEMONIC_BITS_PER_WORD) | idx;
    bitCount += MNEMONIC_BITS_PER_WORD;
    while (bitCount >= 8) {
      bitCount -= 8;
      out.push((bitBuf >> bitCount) & 0xff);
    }
  }
  const buf = new Uint8Array(out.slice(0, 32));
  return buf;
}

// ---- helpers ----

export function blake3Hash(value: Uint8Array, len = 32): Uint8Array {
  return blake3(value, { dkLen: len });
}

export function x25519SharedSecret(myPrivate: Uint8Array, theirPublic: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(myPrivate, theirPublic);
}
