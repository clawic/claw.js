// Multi-device sync envelope for mp/2.0.0.
//
// Each device of the same Root owns a different DeviceKey but participates in
// X3DH as a separate destination. When Alice sends a message to Bob, her
// client fans out N copies (one per Bob device that has published a pre-key
// bundle to the directory).
//
// Beyond messaging, Profile state (blocks, groups, capabilities) is replicated
// across Alice's own devices via a private, Root-derived sync channel. The
// channel is opaque to everyone except devices that hold Alice's RoleKey.

import { x25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha2";
import { hkdf } from "@noble/hashes/hkdf";
import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { blake3 } from "@noble/hashes/blake3";
import { randomBytes } from "node:crypto";

import { encodeCanonicalCbor, decodeCanonicalCbor, type CborValue } from "../cbor.ts";
import { ed25519ToX25519Private } from "../identity.ts";

const SYNC_INFO = new TextEncoder().encode("clawix-sync-v1");

/** Derive the device-cluster sync key from the RoleKey. All devices that hold
 * the RoleKey end up with the same 32-byte key. */
export function deriveClusterKey(rolePrivate: Uint8Array): Uint8Array {
  // Stretch via HKDF over the Montgomery form of the RoleKey.
  const x = ed25519ToX25519Private(rolePrivate);
  return hkdf(sha256, x, blake3(x, { dkLen: 32 }), SYNC_INFO, 32);
}

export interface SyncEnvelope {
  /** Logical channel: "blocks", "groups", "capabilities", "ratchet-state", ... */
  channel: string;
  /** Sender device pubkey for de-dup / loop detection. */
  fromDevicePubkey: Uint8Array;
  /** Per-record id, e.g. a blockId. */
  recordId: Uint8Array;
  /** Monotonic counter per (channel, fromDevicePubkey). */
  seq: number;
  /** Encrypted payload bytes. */
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  /** Wall-clock at send time, epoch seconds. */
  sentAt: number;
}

export interface EncryptSyncInput {
  clusterKey: Uint8Array;
  channel: string;
  fromDevicePubkey: Uint8Array;
  recordId: Uint8Array;
  seq: number;
  payload: CborValue;
}

export function encryptSync(input: EncryptSyncInput): SyncEnvelope {
  const nonce = randomBytes(24);
  const aad = encodeCanonicalCbor({
    channel: input.channel,
    from: input.fromDevicePubkey,
    record: input.recordId,
    seq: input.seq,
  });
  const plaintext = encodeCanonicalCbor(input.payload);
  const ct = xchacha20poly1305(input.clusterKey, nonce, aad).encrypt(plaintext);
  return {
    channel: input.channel,
    fromDevicePubkey: input.fromDevicePubkey,
    recordId: input.recordId,
    seq: input.seq,
    ciphertext: ct,
    nonce,
    sentAt: Math.floor(Date.now() / 1000),
  };
}

export function decryptSync(envelope: SyncEnvelope, clusterKey: Uint8Array): CborValue {
  const aad = encodeCanonicalCbor({
    channel: envelope.channel,
    from: envelope.fromDevicePubkey,
    record: envelope.recordId,
    seq: envelope.seq,
  });
  const plaintextBuf = xchacha20poly1305(clusterKey, envelope.nonce, aad).decrypt(envelope.ciphertext);
  return decodeCanonicalCbor(plaintextBuf);
}

// ---- per-device pre-key bundles registry ----

export interface DevicePreKeyBundle {
  rootPubkey: Uint8Array;          // 32-byte Ed25519
  devicePubkey: Uint8Array;        // 32-byte Ed25519
  identityKey: Uint8Array;         // 32-byte Ed25519 RoleKey
  signedPreKey: Uint8Array;        // X25519 32 bytes
  signedPreKeyId: number;
  signedPreKeySignature: Uint8Array;
  oneTimePreKeys?: { id: number; key: Uint8Array }[];
}

export class DevicePreKeyDirectory {
  private bundles = new Map<string, DevicePreKeyBundle[]>();

  publish(bundle: DevicePreKeyBundle): void {
    const key = toHex(bundle.rootPubkey);
    const list = this.bundles.get(key) ?? [];
    const filtered = list.filter((b) => !bytesEqual(b.devicePubkey, bundle.devicePubkey));
    filtered.push(bundle);
    this.bundles.set(key, filtered);
  }

  devicesOf(rootPubkey: Uint8Array): DevicePreKeyBundle[] {
    return [...(this.bundles.get(toHex(rootPubkey)) ?? [])];
  }

  consumeOneTimePreKey(input: { rootPubkey: Uint8Array; devicePubkey: Uint8Array }):
    { id: number; key: Uint8Array } | null {
    const list = this.bundles.get(toHex(input.rootPubkey));
    if (!list) return null;
    const bundle = list.find((b) => bytesEqual(b.devicePubkey, input.devicePubkey));
    if (!bundle || !bundle.oneTimePreKeys || bundle.oneTimePreKeys.length === 0) return null;
    return bundle.oneTimePreKeys.shift() ?? null;
  }
}

// ---- helpers ----

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function toHex(buf: Uint8Array): string {
  return Buffer.from(buf).toString("hex");
}

// Re-export X25519 helper for sync handshakes that need a fresh key.
export function freshX25519(): { publicKey: Uint8Array; privateKey: Uint8Array } {
  const privateKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return { publicKey, privateKey };
}
