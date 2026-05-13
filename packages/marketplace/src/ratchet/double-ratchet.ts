// Double Ratchet for marketplace/2.0.0 mailbox forward-secrecy.
//
// Combines a Diffie-Hellman ratchet (rotating X25519 keypairs every time a new
// inbound message switches the sender's DH key) with a symmetric KDF ratchet
// on each chain (sending / receiving). Each plaintext message gets its own
// derived message key, so a key compromise at time T does not let an attacker
// decrypt earlier messages.
//
// Layout per message:
//   header = { dh_pub, prev_chain_count, message_number }
//   ciphertext = XChaCha20-Poly1305(plaintext, message_key, header || nonce)
//
// Skipped messages (out-of-order delivery) are stored in `skippedKeys`, keyed
// by (dh_pub, message_number). Bounded by MAX_SKIPPED to keep memory in
// check.

import { x25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha2";
import { hkdf } from "@noble/hashes/hkdf";
import { hmac } from "@noble/hashes/hmac";
import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { randomBytes } from "node:crypto";

import { encodeCanonicalCbor, decodeCanonicalCbor, type CborValue } from "../cbor.ts";

const KDF_INFO_ROOT = new TextEncoder().encode("clawix-dr-root");
const KDF_INFO_CHAIN_MK = new TextEncoder().encode("clawix-dr-mk");
const KDF_INFO_CHAIN_CK = new TextEncoder().encode("clawix-dr-ck");
const MAX_SKIPPED = 256;

export interface DoubleRatchetHeader {
  dh: Uint8Array;             // X25519 public (32 bytes)
  prevChainCount: number;
  messageNumber: number;
}

export interface DoubleRatchetMessage {
  header: DoubleRatchetHeader;
  ciphertext: Uint8Array;
  nonce: Uint8Array;          // 24 bytes for XChaCha20
}

export interface DoubleRatchetState {
  rootKey: Uint8Array;                // 32 bytes
  sendingChain?: { ck: Uint8Array; n: number };
  receivingChain?: { ck: Uint8Array; n: number };
  ownDh: { publicKey: Uint8Array; privateKey: Uint8Array };
  remoteDh?: Uint8Array;              // 32 bytes
  prevSendingChainCount: number;
  skippedKeys: Map<string, Uint8Array>;
}

// ---- initialisation ----

export interface InitAsAliceInput {
  rootKeyFromX3dh: Uint8Array;        // 32-byte SK from X3DH
  remoteDh: Uint8Array;               // Bob's signed pre-key public (X25519)
}

export interface InitAsBobInput {
  rootKeyFromX3dh: Uint8Array;
  signedPreKeyPair: { publicKey: Uint8Array; privateKey: Uint8Array }; // Bob's SPK pair
}

/** Alice is the initiator. She seeds the sending chain immediately. */
export function initAsAlice(input: InitAsAliceInput): DoubleRatchetState {
  const ownDh = freshDh();
  const dhOut = x25519.getSharedSecret(ownDh.privateKey, input.remoteDh);
  const [rootKey, chainKey] = kdfRoot(input.rootKeyFromX3dh, dhOut);
  return {
    rootKey,
    sendingChain: { ck: chainKey, n: 0 },
    receivingChain: undefined,
    ownDh,
    remoteDh: input.remoteDh,
    prevSendingChainCount: 0,
    skippedKeys: new Map(),
  };
}

/** Bob is the responder. His sending chain is created on first send (after
 * he receives Alice's first message). */
export function initAsBob(input: InitAsBobInput): DoubleRatchetState {
  return {
    rootKey: input.rootKeyFromX3dh,
    ownDh: input.signedPreKeyPair,
    remoteDh: undefined,
    prevSendingChainCount: 0,
    skippedKeys: new Map(),
  };
}

// ---- encrypt ----

export function dratchetEncrypt(state: DoubleRatchetState, plaintext: Uint8Array, ad: Uint8Array = new Uint8Array()):
{ message: DoubleRatchetMessage; nextState: DoubleRatchetState } {
  if (!state.sendingChain) throw new Error("dr: cannot send before establishing sending chain");
  const { mk, ck: nextCk } = kdfChain(state.sendingChain.ck);
  const header: DoubleRatchetHeader = {
    dh: state.ownDh.publicKey,
    prevChainCount: state.prevSendingChainCount,
    messageNumber: state.sendingChain.n,
  };
  const nonce = randomBytes(24);
  const aad = concat([encodeHeader(header), ad]);
  const ciphertext = xchacha20poly1305(mk, nonce, aad).encrypt(plaintext);
  return {
    message: { header, ciphertext, nonce },
    nextState: {
      ...state,
      sendingChain: { ck: nextCk, n: state.sendingChain.n + 1 },
    },
  };
}

// ---- decrypt ----

export function dratchetDecrypt(state: DoubleRatchetState, message: DoubleRatchetMessage, ad: Uint8Array = new Uint8Array()):
{ plaintext: Uint8Array; nextState: DoubleRatchetState } {
  let s = { ...state, skippedKeys: new Map(state.skippedKeys) };
  const headerBytes = encodeHeader(message.header);
  const aad = concat([headerBytes, ad]);

  // 1. Check if we've previously skipped this key.
  const skipKey = skipMapKey(message.header.dh, message.header.messageNumber);
  const stored = s.skippedKeys.get(skipKey);
  if (stored) {
    const plaintext = xchacha20poly1305(stored, message.nonce, aad).decrypt(message.ciphertext);
    s.skippedKeys.delete(skipKey);
    return { plaintext, nextState: s };
  }

  // 2. If the remote rotated DH, perform a DH ratchet step.
  if (!s.remoteDh || !bytesEqual(s.remoteDh, message.header.dh)) {
    // Skip any messages still pending on the old chain.
    if (s.receivingChain && s.remoteDh) {
      skipMessageKeys(s, s.remoteDh, message.header.prevChainCount);
    }
    s = dhRatchetStep(s, message.header.dh);
  }

  // 3. Skip ahead on the receiving chain to message_number.
  if (!s.receivingChain) throw new Error("dr: no receiving chain after ratchet step (impossible)");
  skipMessageKeys(s, message.header.dh, message.header.messageNumber);

  // 4. Derive the message key and decrypt.
  const { mk, ck: nextCk } = kdfChain(s.receivingChain.ck);
  s.receivingChain = { ck: nextCk, n: s.receivingChain.n + 1 };
  const plaintext = xchacha20poly1305(mk, message.nonce, aad).decrypt(message.ciphertext);
  return { plaintext, nextState: s };
}

// ---- helpers ----

function dhRatchetStep(state: DoubleRatchetState, remoteDh: Uint8Array): DoubleRatchetState {
  // 1. Derive a fresh receiving chain from our current DH + the new remote DH.
  const dh1 = x25519.getSharedSecret(state.ownDh.privateKey, remoteDh);
  const [rootKey1, recvCk] = kdfRoot(state.rootKey, dh1);
  // 2. Rotate our DH and derive a fresh sending chain.
  const newOwnDh = freshDh();
  const dh2 = x25519.getSharedSecret(newOwnDh.privateKey, remoteDh);
  const [rootKey2, sendCk] = kdfRoot(rootKey1, dh2);
  return {
    ...state,
    rootKey: rootKey2,
    remoteDh,
    receivingChain: { ck: recvCk, n: 0 },
    sendingChain: { ck: sendCk, n: 0 },
    prevSendingChainCount: state.sendingChain?.n ?? 0,
    ownDh: newOwnDh,
  };
}

function skipMessageKeys(state: DoubleRatchetState, dhPub: Uint8Array, until: number): void {
  if (!state.receivingChain) return;
  while (state.receivingChain.n < until) {
    if (state.skippedKeys.size >= MAX_SKIPPED) {
      throw new Error("dr: too many skipped message keys");
    }
    const { mk, ck: nextCk } = kdfChain(state.receivingChain.ck);
    state.skippedKeys.set(skipMapKey(dhPub, state.receivingChain.n), mk);
    state.receivingChain = { ck: nextCk, n: state.receivingChain.n + 1 };
  }
}

function freshDh(): { publicKey: Uint8Array; privateKey: Uint8Array } {
  const privateKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

function kdfRoot(rootKey: Uint8Array, dhOut: Uint8Array): [Uint8Array, Uint8Array] {
  const out = hkdf(sha256, dhOut, rootKey, KDF_INFO_ROOT, 64);
  return [out.slice(0, 32), out.slice(32, 64)];
}

function kdfChain(ck: Uint8Array): { mk: Uint8Array; ck: Uint8Array } {
  const mk = hmac(sha256, ck, KDF_INFO_CHAIN_MK);
  const nextCk = hmac(sha256, ck, KDF_INFO_CHAIN_CK);
  return { mk, ck: nextCk };
}

function encodeHeader(h: DoubleRatchetHeader): Uint8Array {
  return encodeCanonicalCbor({ dh: h.dh, prev_chain_count: h.prevChainCount, message_number: h.messageNumber });
}

export function decodeHeader(buf: Uint8Array): DoubleRatchetHeader {
  const obj = decodeCanonicalCbor(buf) as Record<string, CborValue>;
  return {
    dh: obj.dh as Uint8Array,
    prevChainCount: obj.prev_chain_count as number,
    messageNumber: obj.message_number as number,
  };
}

function skipMapKey(dh: Uint8Array, n: number): string {
  return `${toHex(dh)}::${n}`;
}

function toHex(buf: Uint8Array): string {
  return Buffer.from(buf).toString("hex");
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function concat(parts: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

// ---- wire encoding ----

export function encodeMessage(m: DoubleRatchetMessage): Uint8Array {
  return encodeCanonicalCbor({
    header: { dh: m.header.dh, prev_chain_count: m.header.prevChainCount, message_number: m.header.messageNumber },
    nonce: m.nonce,
    ciphertext: m.ciphertext,
  });
}

export function decodeMessage(buf: Uint8Array): DoubleRatchetMessage {
  const obj = decodeCanonicalCbor(buf) as Record<string, CborValue>;
  const h = obj.header as Record<string, CborValue>;
  return {
    header: {
      dh: h.dh as Uint8Array,
      prevChainCount: h.prev_chain_count as number,
      messageNumber: h.message_number as number,
    },
    nonce: obj.nonce as Uint8Array,
    ciphertext: obj.ciphertext as Uint8Array,
  };
}
