// BIP-39 + SLIP-0010 Ed25519 recovery for mp/2.0.0.
//
// A `RootKey` is no longer synthetic entropy. It is derived deterministically
// from a 24-word BIP-39 mnemonic (256 bits of entropy + 8 bits of checksum).
// The same mnemonic on any device reproduces the same Root Ed25519 keypair;
// per-device `DeviceKey` and per-vertical `RoleKey` are then re-certified by
// that Root locally.
//
// Crypto:
//   - Wordlist: canonical Trezor/Bitcoin BIP-39 English (2048 words, sorted).
//   - Mnemonic ↔ entropy: standard BIP-39 (SHA-256 checksum, 11-bit indices).
//   - Mnemonic → seed: PBKDF2-HMAC-SHA512(mnemonic_nfkd, "mnemonic"+passphrase, 2048 iters, 64 bytes).
//   - Seed → master Ed25519: SLIP-0010 (HMAC-SHA512(key="ed25519 seed", data=seed)).
//   - Child derivation: SLIP-0010 hardened (only path supported by Ed25519).
//   - Default derivation path for Clawix Profile Root: `m/44'/0'/0'`.
//     (BIP-44 purpose=44 hardened; coin_type=0 hardened; account=0 hardened.)
//
// Restore flow:
//   1. User enters 24-word mnemonic on a new device.
//   2. `rootFromMnemonic(mnemonic, passphrase)` → seed → master → child path
//      `m/44'/0'/0'` → `RootKey { privateKey, publicKey }`.
//   3. App generates fresh `DeviceKey` + `RoleKey`, asks Root to certify them
//      locally (Root is now in memory because of step 2).
//   4. Multi-device sync (Capa 6) reseeds blocks/groups/mailbox state.

import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha2";
import { sha512 } from "@noble/hashes/sha512";
import { pbkdf2 } from "@noble/hashes/pbkdf2";
import { randomBytes } from "node:crypto";

import { ed25519 } from "@noble/curves/ed25519";
import { ENGLISH_WORDLIST } from "./wordlists/english.ts";
import type { Ed25519Keypair } from "./identity.ts";

// ---- entropy ↔ mnemonic ----

/** Allowed entropy byte lengths per BIP-39. We default to 32 (256 bits → 24 words). */
export const SUPPORTED_ENTROPY_BYTES = [16, 20, 24, 28, 32] as const;
export type EntropyBytes = (typeof SUPPORTED_ENTROPY_BYTES)[number];

export function generateMnemonic(strength: EntropyBytes = 32): string {
  if (!SUPPORTED_ENTROPY_BYTES.includes(strength)) {
    throw new Error(`bip39: invalid entropy length ${strength}`);
  }
  const entropy = randomBytes(strength);
  return entropyToMnemonicBip39(entropy);
}

export function entropyToMnemonicBip39(entropy: Uint8Array): string {
  if (!SUPPORTED_ENTROPY_BYTES.includes(entropy.length as EntropyBytes)) {
    throw new Error(`bip39: entropy must be 16/20/24/28/32 bytes (got ${entropy.length})`);
  }
  const checksumBits = entropy.length / 4;            // ENT/32
  const totalBits = entropy.length * 8 + checksumBits;
  const wordCount = totalBits / 11;                   // 12/15/18/21/24
  const csByte = sha256(entropy)[0];
  // Concatenate entropy + first checksumBits bits of sha256(entropy).
  const bits = new Uint8Array(entropy.length + 1);
  bits.set(entropy, 0);
  bits[entropy.length] = csByte;
  const words: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    const idx = readBitsBE(bits, i * 11, 11);
    words.push(ENGLISH_WORDLIST[idx]);
  }
  return words.join(" ");
}

export function mnemonicToEntropyBip39(mnemonic: string): Uint8Array {
  const words = normalizeMnemonic(mnemonic).split(" ");
  if (![12, 15, 18, 21, 24].includes(words.length)) {
    throw new Error(`bip39: mnemonic must be 12/15/18/21/24 words (got ${words.length})`);
  }
  const indices: number[] = [];
  for (const w of words) {
    const idx = ENGLISH_WORDLIST.indexOf(w);
    if (idx < 0) throw new Error(`bip39: unknown word "${w}"`);
    indices.push(idx);
  }
  const totalBits = words.length * 11;
  const entropyBits = (totalBits * 32) / 33;
  const checksumBits = totalBits - entropyBits;
  const entropyBytes = entropyBits / 8;
  const all = new Uint8Array(Math.ceil(totalBits / 8));
  for (let i = 0; i < indices.length; i++) {
    writeBitsBE(all, i * 11, 11, indices[i]);
  }
  const entropy = all.slice(0, entropyBytes);
  const checksumByte = sha256(entropy)[0];
  // Verify the leading checksumBits of sha256(entropy) match what the mnemonic claims.
  const claimedChecksum = readBitsBE(all, entropyBits, checksumBits);
  const expectedChecksum = checksumByte >> (8 - checksumBits);
  if (claimedChecksum !== expectedChecksum) {
    throw new Error("bip39: checksum mismatch (one of the words is wrong)");
  }
  return entropy;
}

export function validateMnemonic(mnemonic: string): boolean {
  try { mnemonicToEntropyBip39(mnemonic); return true; }
  catch { return false; }
}

function normalizeMnemonic(mnemonic: string): string {
  return mnemonic
    .normalize("NFKD")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function readBitsBE(buf: Uint8Array, bitOffset: number, count: number): number {
  let v = 0;
  for (let i = 0; i < count; i++) {
    const b = bitOffset + i;
    const bit = (buf[b >> 3] >> (7 - (b & 7))) & 1;
    v = (v << 1) | bit;
  }
  return v;
}

function writeBitsBE(buf: Uint8Array, bitOffset: number, count: number, value: number): void {
  for (let i = 0; i < count; i++) {
    const b = bitOffset + i;
    const bit = (value >> (count - 1 - i)) & 1;
    if (bit) buf[b >> 3] |= 1 << (7 - (b & 7));
    else buf[b >> 3] &= ~(1 << (7 - (b & 7))) & 0xff;
  }
}

// ---- mnemonic → seed (PBKDF2) ----

export interface SeedOptions {
  passphrase?: string;
}

export function mnemonicToSeed(mnemonic: string, opts: SeedOptions = {}): Uint8Array {
  // BIP-39: PBKDF2(password = mnemonic in NFKD, salt = "mnemonic"+passphrase in NFKD, c=2048, dkLen=64, prf=SHA-512).
  const normalizedMnemonic = normalizeMnemonic(mnemonic);
  const passphrase = (opts.passphrase ?? "").normalize("NFKD");
  const password = new TextEncoder().encode(normalizedMnemonic);
  const salt = new TextEncoder().encode("mnemonic" + passphrase);
  return pbkdf2(sha512, password, salt, { c: 2048, dkLen: 64 });
}

// ---- SLIP-0010 Ed25519 derivation ----

/** Hardened offset: 0x80000000. Ed25519 SLIP-0010 only supports hardened indices. */
export const HARDENED_OFFSET = 0x80000000;

export interface DerivedKey {
  privateKey: Uint8Array;     // 32-byte raw key (Ed25519 secret seed)
  chainCode: Uint8Array;      // 32-byte chain code
}

/** Master derivation: HMAC-SHA512("ed25519 seed", seed). */
export function masterKeyFromSeed(seed: Uint8Array): DerivedKey {
  const I = hmac(sha512, new TextEncoder().encode("ed25519 seed"), seed);
  return { privateKey: I.slice(0, 32), chainCode: I.slice(32, 64) };
}

/** Derive hardened child: I = HMAC-SHA512(parent_chain_code, 0x00 || k || ser32(i + HARDENED_OFFSET)). */
export function deriveHardenedChild(parent: DerivedKey, index: number): DerivedKey {
  if (index < 0) throw new Error("slip10: negative index");
  if (index >= HARDENED_OFFSET) throw new Error("slip10: index already hardened — pass the unhardened number");
  const hardened = (index + HARDENED_OFFSET) >>> 0;
  const data = new Uint8Array(1 + 32 + 4);
  data[0] = 0x00;
  data.set(parent.privateKey, 1);
  data[33] = (hardened >>> 24) & 0xff;
  data[34] = (hardened >>> 16) & 0xff;
  data[35] = (hardened >>> 8) & 0xff;
  data[36] = hardened & 0xff;
  const I = hmac(sha512, parent.chainCode, data);
  return { privateKey: I.slice(0, 32), chainCode: I.slice(32, 64) };
}

/**
 * Parse a BIP-32-style path like `m/44'/0'/0'`. Only hardened segments (with `'`)
 * are accepted because Ed25519 SLIP-0010 cannot do non-hardened derivation.
 */
export function parsePath(path: string): number[] {
  const trimmed = path.trim();
  if (!/^m(\/\d+')+$/.test(trimmed)) {
    throw new Error(`slip10: invalid Ed25519 path "${path}" (must be all-hardened, e.g. m/44'/0'/0')`);
  }
  return trimmed.split("/").slice(1).map((seg) => Number(seg.replace("'", "")));
}

export function deriveFromPath(seed: Uint8Array, path: string): DerivedKey {
  let key = masterKeyFromSeed(seed);
  for (const idx of parsePath(path)) {
    key = deriveHardenedChild(key, idx);
  }
  return key;
}

// ---- mnemonic → RootKey (Ed25519 keypair) ----

/** Canonical derivation path for the Clawix Profile RootKey. */
export const CLAWIX_PROFILE_PATH = "m/44'/0'/0'";

/**
 * Derive an Ed25519 keypair from a BIP-39 mnemonic.
 *
 * The returned `privateKey` is the 32-byte seed expected by `@noble/curves`
 * Ed25519 helpers — i.e. the same convention used by `identity.ts`.
 */
export function rootFromMnemonic(mnemonic: string, opts: SeedOptions & { path?: string } = {}): Ed25519Keypair {
  if (!validateMnemonic(mnemonic)) {
    throw new Error("bip39: invalid mnemonic (bad word or checksum)");
  }
  const seed = mnemonicToSeed(mnemonic, opts);
  const derived = deriveFromPath(seed, opts.path ?? CLAWIX_PROFILE_PATH);
  const privateKey = derived.privateKey;
  const publicKey = ed25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

// ---- helpers ----

/**
 * Convert mnemonic to a short fingerprint suitable for showing the user
 * during onboarding (e.g. "verify your phrase: a3f1b2"). NOT a substitute for
 * checksum verification; this is purely a visual aid so the user can confirm
 * they wrote down the same phrase the app generated.
 */
export function mnemonicFingerprint(mnemonic: string): string {
  const seed = mnemonicToSeed(mnemonic);
  // First 3 bytes of the seed, hex.
  let s = "";
  for (let i = 0; i < 3; i++) s += seed[i].toString(16).padStart(2, "0");
  return s;
}
