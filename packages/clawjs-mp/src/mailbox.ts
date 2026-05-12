// Mailbox primitives for mp/1.0.0.
//
// A mailbox message is a sealed-box encrypted, compound-signed envelope that
// can travel through any transport (HTTP host, Iroh stream, plain file). The
// recipient decrypts with their X25519 secret (derived from their RoleKey)
// and verifies the compound signature.

import { ed25519, x25519 } from "@noble/curves/ed25519";
import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { blake3 } from "@noble/hashes/blake3";
import { randomBytes } from "node:crypto";

import { encodeCanonicalCbor, decodeCanonicalCbor, type CborValue } from "./cbor.ts";
import {
  ed25519ToX25519Private, ed25519ToX25519Public,
  compoundSign, compoundVerify, type CompoundSignature,
} from "./identity.ts";

export interface MailboxMessage {
  recipientPubkey: Uint8Array;     // Ed25519 RoleKey
  senderPubkey: Uint8Array;        // Ed25519 RoleKey or OneShotKey
  threadId?: Uint8Array;
  inReplyTo?: Uint8Array;
  kind: string;                    // see MESSAGES.md kinds
  plaintext: CborValue;            // structured payload
  ciphertext: Uint8Array;          // sealed-box ciphertext = nonce(24) || epkX(32) || ct
  signature?: CompoundSignature;
  ttlExpiresAt?: number;
}

// ---- sealed-box-like encryption ----
//
// We implement the NaCl sealed-box pattern manually:
//   1. Generate an ephemeral X25519 keypair.
//   2. Compute shared = X25519(ephSk, recipientX25519Pub).
//   3. Key = blake3(shared || ephPub || recipientPub).
//   4. Nonce = blake3(ephPub || recipientPub)[..24].
//   5. ct = XChaCha20-Poly1305(plaintext, key, nonce).
//   6. Envelope = ephPub(32) || ct.
//
// The recipient reconstructs shared from their X25519 private key and the
// ephemeral public key, then decrypts.

function deriveBoxKey(shared: Uint8Array, ephPub: Uint8Array, recipientPub: Uint8Array): {
  key: Uint8Array; nonce: Uint8Array;
} {
  const keyBuf = new Uint8Array(shared.length + ephPub.length + recipientPub.length);
  keyBuf.set(shared, 0);
  keyBuf.set(ephPub, shared.length);
  keyBuf.set(recipientPub, shared.length + ephPub.length);
  const key = blake3(keyBuf, { dkLen: 32 });
  const nonceBuf = new Uint8Array(ephPub.length + recipientPub.length);
  nonceBuf.set(ephPub, 0);
  nonceBuf.set(recipientPub, ephPub.length);
  const nonce = blake3(nonceBuf, { dkLen: 24 });
  return { key, nonce };
}

export function sealedBoxEncrypt(plaintext: Uint8Array, recipientEdPub: Uint8Array): Uint8Array {
  const ephPriv = randomBytes(32);
  const ephPubX = x25519.getPublicKey(ephPriv);
  const recipientX = ed25519ToX25519Public(recipientEdPub);
  const shared = x25519.getSharedSecret(ephPriv, recipientX);
  const { key, nonce } = deriveBoxKey(shared, ephPubX, recipientX);
  const ct = xchacha20poly1305(key, nonce).encrypt(plaintext);
  const out = new Uint8Array(ephPubX.length + ct.length);
  out.set(ephPubX, 0);
  out.set(ct, ephPubX.length);
  return out;
}

export function sealedBoxDecrypt(ciphertext: Uint8Array, recipientEdPriv: Uint8Array): Uint8Array {
  if (ciphertext.length < 32) throw new Error("sealed-box: ciphertext too short");
  const ephPubX = ciphertext.slice(0, 32);
  const ct = ciphertext.slice(32);
  const recipientXPriv = ed25519ToX25519Private(recipientEdPriv);
  const recipientXPub = x25519.getPublicKey(recipientXPriv);
  const shared = x25519.getSharedSecret(recipientXPriv, ephPubX);
  const { key, nonce } = deriveBoxKey(shared, ephPubX, recipientXPub);
  return xchacha20poly1305(key, nonce).decrypt(ct);
}

// ---- mailbox messages ----

export interface SealAndSignInput {
  recipientPubkey: Uint8Array;
  senderRolePrivate: Uint8Array;
  senderRolePubkey: Uint8Array;
  senderDevicePrivate: Uint8Array;
  threadId?: Uint8Array;
  inReplyTo?: Uint8Array;
  kind: string;
  plaintext: CborValue;
  ttlExpiresAt?: number;
}

function envelopePayload(input: {
  recipientPubkey: Uint8Array;
  senderPubkey: Uint8Array;
  threadId?: Uint8Array;
  inReplyTo?: Uint8Array;
  kind: string;
  ciphertext: Uint8Array;
  ttlExpiresAt?: number;
}): CborValue {
  const obj: Record<string, CborValue> = {
    to_pubkey: input.recipientPubkey,
    from_pubkey: input.senderPubkey,
    kind: input.kind,
    ciphertext: input.ciphertext,
    ttl_expires_at: input.ttlExpiresAt ?? 0,
  };
  if (input.threadId) obj.thread_id = input.threadId;
  if (input.inReplyTo) obj.in_reply_to = input.inReplyTo;
  return obj;
}

export function sealAndSign(input: SealAndSignInput): MailboxMessage {
  const plaintextBuf = encodeCanonicalCbor(input.plaintext);
  const ciphertext = sealedBoxEncrypt(plaintextBuf, input.recipientPubkey);
  const envelope = envelopePayload({
    recipientPubkey: input.recipientPubkey,
    senderPubkey: input.senderRolePubkey,
    threadId: input.threadId,
    inReplyTo: input.inReplyTo,
    kind: input.kind,
    ciphertext,
    ttlExpiresAt: input.ttlExpiresAt,
  });
  const envelopeBuf = encodeCanonicalCbor(envelope);
  const signature = compoundSign({
    payload: envelopeBuf,
    rolePrivate: input.senderRolePrivate,
    devicePrivate: input.senderDevicePrivate,
  });
  return {
    recipientPubkey: input.recipientPubkey,
    senderPubkey: input.senderRolePubkey,
    threadId: input.threadId,
    inReplyTo: input.inReplyTo,
    kind: input.kind,
    plaintext: input.plaintext,
    ciphertext,
    signature,
    ttlExpiresAt: input.ttlExpiresAt,
  };
}

export interface OpenAndVerifyInput {
  message: MailboxMessage | CborValue;
  recipientRolePrivate: Uint8Array;
  senderDevicePub: Uint8Array;
}

export function openAndVerify(input: OpenAndVerifyInput): { plaintext: CborValue; ok: boolean } {
  const m = (input.message as MailboxMessage).ciphertext
    ? (input.message as MailboxMessage)
    : decodeMailboxEnvelope(input.message as CborValue);
  const envelope = envelopePayload({
    recipientPubkey: m.recipientPubkey,
    senderPubkey: m.senderPubkey,
    threadId: m.threadId,
    inReplyTo: m.inReplyTo,
    kind: m.kind,
    ciphertext: m.ciphertext,
    ttlExpiresAt: m.ttlExpiresAt,
  });
  const envelopeBuf = encodeCanonicalCbor(envelope);
  const sig = m.signature;
  if (!sig) return { plaintext: null, ok: false };
  const ok = compoundVerify({
    payload: envelopeBuf,
    rolePub: m.senderPubkey,
    devicePub: input.senderDevicePub,
    signature: sig,
  });
  const plaintextBuf = sealedBoxDecrypt(m.ciphertext, input.recipientRolePrivate);
  const plaintext = decodeCanonicalCbor(plaintextBuf);
  return { plaintext, ok };
}

export function encodeMailboxEnvelope(m: MailboxMessage): Uint8Array {
  const obj: Record<string, CborValue> = {
    to_pubkey: m.recipientPubkey,
    from_pubkey: m.senderPubkey,
    kind: m.kind,
    ciphertext: m.ciphertext,
    ttl_expires_at: m.ttlExpiresAt ?? 0,
  };
  if (m.threadId) obj.thread_id = m.threadId;
  if (m.inReplyTo) obj.in_reply_to = m.inReplyTo;
  if (m.signature) {
    obj.signature = m.signature.role;
    obj.device_signature = m.signature.device;
  }
  return encodeCanonicalCbor(obj);
}

export function decodeMailboxEnvelope(value: CborValue): MailboxMessage {
  const obj = value as Record<string, CborValue>;
  const signature = obj.signature && obj.device_signature
    ? { role: obj.signature as Uint8Array, device: obj.device_signature as Uint8Array }
    : undefined;
  return {
    recipientPubkey: obj.to_pubkey as Uint8Array,
    senderPubkey: obj.from_pubkey as Uint8Array,
    kind: obj.kind as string,
    ciphertext: obj.ciphertext as Uint8Array,
    threadId: obj.thread_id as Uint8Array | undefined,
    inReplyTo: obj.in_reply_to as Uint8Array | undefined,
    plaintext: null,
    signature,
    ttlExpiresAt: obj.ttl_expires_at as number | undefined,
  };
}
