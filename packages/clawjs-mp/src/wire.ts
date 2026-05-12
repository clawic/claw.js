// Wire envelope, Intent canonicalization, message kinds for mp/1.0.0.

import { encodeCanonicalCbor, decodeCanonicalCbor, type CborValue } from "./cbor.ts";
import {
  blake3Hash, compoundSign, compoundVerify, type CompoundSignature,
  type KeyCertificate, encodeCertificate, decodeCertificate, verifyCertificate,
  type Ed25519Keypair, ed25519PublicKey,
} from "./identity.ts";
import { ed25519 } from "@noble/curves/ed25519";

export const PROTOCOL_VERSION = "mp/1.0.0";

export type IntentSide = "offer" | "want";

export interface IntentInput {
  side: IntentSide;
  vertical: string;
  rolePubkey?: Uint8Array;
  oneshotPubkey?: Uint8Array;
  roleCertificate?: KeyCertificate;
  fields: Record<string, CborValue>;
  visibility: Record<string, number>;
  expiresAt: number;
  createdAt?: number;
}

export interface Intent extends Required<Omit<IntentInput, "createdAt" | "rolePubkey" | "oneshotPubkey" | "roleCertificate">> {
  actorType: "person";
  createdAt: number;
  intentId: Uint8Array;
  rolePubkey?: Uint8Array;
  oneshotPubkey?: Uint8Array;
  roleCertificate?: KeyCertificate;
  signature?: CompoundSignature;
}

// ---- canonicalization ----

function intentCanonicalPayload(input: {
  side: IntentSide;
  vertical: string;
  actorType: "person";
  rolePubkey?: Uint8Array;
  oneshotPubkey?: Uint8Array;
  roleCertificate?: KeyCertificate;
  fields: Record<string, CborValue>;
  visibility: Record<string, number>;
  expiresAt: number;
  createdAt: number;
}): CborValue {
  const payload: Record<string, CborValue> = {
    side: input.side,
    actor_type: input.actorType,
    vertical: input.vertical,
    fields: input.fields,
    visibility: visibilityAsMap(input.visibility),
    expires_at: input.expiresAt,
    created_at: input.createdAt,
  };
  if (input.rolePubkey) payload.role_pubkey = input.rolePubkey;
  if (input.oneshotPubkey) payload.oneshot_pubkey = input.oneshotPubkey;
  if (input.roleCertificate) payload.role_attestation = encodeCertificate(input.roleCertificate);
  return payload;
}

function visibilityAsMap(visibility: Record<string, number>): Record<string, CborValue> {
  const out: Record<string, CborValue> = {};
  for (const [k, v] of Object.entries(visibility)) out[k] = v;
  return out;
}

export function canonicalizeIntent(input: IntentInput & { actorType?: "person" }): {
  payloadCbor: Uint8Array;
  intentId: Uint8Array;
  intent: Intent;
} {
  const actorType: "person" = input.actorType ?? "person";
  const createdAt = input.createdAt ?? Math.floor(Date.now() / 1000);
  const canonical = intentCanonicalPayload({
    side: input.side,
    vertical: input.vertical,
    actorType,
    rolePubkey: input.rolePubkey,
    oneshotPubkey: input.oneshotPubkey,
    roleCertificate: input.roleCertificate,
    fields: input.fields,
    visibility: input.visibility,
    expiresAt: input.expiresAt,
    createdAt,
  });
  const payloadCbor = encodeCanonicalCbor(canonical);
  const intentId = blake3Hash(payloadCbor, 32);
  return {
    payloadCbor,
    intentId,
    intent: {
      side: input.side,
      vertical: input.vertical,
      actorType,
      rolePubkey: input.rolePubkey,
      oneshotPubkey: input.oneshotPubkey,
      roleCertificate: input.roleCertificate,
      fields: input.fields,
      visibility: input.visibility,
      expiresAt: input.expiresAt,
      createdAt,
      intentId,
    },
  };
}

export function signIntent(input: {
  intent: Intent;
  payloadCbor: Uint8Array;
  rolePrivate: Uint8Array;
  devicePrivate: Uint8Array;
}): CompoundSignature {
  const signature = compoundSign({
    payload: input.payloadCbor,
    rolePrivate: input.rolePrivate,
    devicePrivate: input.devicePrivate,
  });
  input.intent.signature = signature;
  return signature;
}

export function verifyIntent(input: {
  intent: Intent;
  payloadCbor: Uint8Array;
  devicePub: Uint8Array;
}): boolean {
  if (!input.intent.signature) return false;
  // role pubkey: either rolePubkey or oneshotPubkey
  const rolePub = input.intent.rolePubkey ?? input.intent.oneshotPubkey;
  if (!rolePub) return false;
  if (input.intent.roleCertificate && !verifyCertificate(input.intent.roleCertificate)) return false;
  return compoundVerify({
    payload: input.payloadCbor,
    rolePub,
    devicePub: input.devicePub,
    signature: input.intent.signature,
  });
}

// ---- discovery key ----

export function discoveryKey(input: {
  vertical: string;
  geoZone?: string;
  tag?: string;
  priceBand?: number;
}): Uint8Array {
  const parts: CborValue[] = [
    "mp/1",
    input.vertical,
    input.geoZone ?? new Uint8Array([0]),
    input.tag ?? new Uint8Array([0]),
    input.priceBand !== undefined ? input.priceBand : new Uint8Array([0]),
  ];
  return blake3Hash(encodeCanonicalCbor(parts), 32);
}

// ---- envelopes ----

export type MessageKind =
  | "publish_intent" | "withdraw_intent" | "query_intent" | "inquire"
  | "reveal_level_up" | "reveal_field"
  | "match_propose" | "match_sign" | "match_reject"
  | "mailbox_send" | "mailbox_fetch"
  | "stream_invite"
  | "revoke_key" | "attestation_publish"
  | "rate" | "vouch"
  | "ack" | "kind_unsupported" | "feature_unsupported"
  | "bad_request" | "unauthorized" | "rate_limited";

export interface Envelope {
  protocol: string;
  features: string[];
  kind: MessageKind;
  payload: CborValue;
}

export function buildEnvelope(input: {
  kind: MessageKind;
  payload: CborValue;
  features?: string[];
  protocol?: string;
}): Envelope {
  return {
    protocol: input.protocol ?? PROTOCOL_VERSION,
    features: input.features ?? [],
    kind: input.kind,
    payload: input.payload,
  };
}

export function encodeEnvelope(env: Envelope): Uint8Array {
  return encodeCanonicalCbor({
    protocol: env.protocol,
    features: env.features,
    kind: env.kind,
    payload: env.payload,
  });
}

export function decodeEnvelope(buf: Uint8Array): Envelope {
  const decoded = decodeCanonicalCbor(buf) as Record<string, CborValue>;
  const protocol = decoded.protocol as string;
  if (!protocol.startsWith("mp/")) {
    throw new Error(`wire: invalid protocol prefix "${protocol}"`);
  }
  return {
    protocol,
    features: ((decoded.features as CborValue[]) ?? []).map((v) => v as string),
    kind: decoded.kind as MessageKind,
    payload: decoded.payload as CborValue,
  };
}

// ---- intent-to-envelope helpers ----

export function intentToCborMap(intent: Intent): CborValue {
  const out: Record<string, CborValue> = {
    intent_id: intent.intentId,
    side: intent.side,
    actor_type: intent.actorType,
    vertical: intent.vertical,
    fields: intent.fields,
    visibility: visibilityAsMap(intent.visibility),
    expires_at: intent.expiresAt,
    created_at: intent.createdAt,
  };
  if (intent.rolePubkey) out.role_pubkey = intent.rolePubkey;
  if (intent.oneshotPubkey) out.oneshot_pubkey = intent.oneshotPubkey;
  if (intent.roleCertificate) out.role_attestation = encodeCertificate(intent.roleCertificate);
  if (intent.signature) {
    out.signature = intent.signature.role;
    out.device_signature = intent.signature.device;
  }
  return out;
}

export function intentFromCborMap(map: CborValue): { intent: Intent; payloadCbor: Uint8Array } {
  const obj = map as Record<string, CborValue>;
  const certBuf = obj.role_attestation as Uint8Array | undefined;
  const roleCertificate = certBuf ? decodeCertificate(certBuf) : undefined;
  const visibility: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj.visibility as Record<string, CborValue>)) {
    visibility[k] = v as number;
  }
  const intent: Intent = {
    side: obj.side as IntentSide,
    actorType: "person",
    vertical: obj.vertical as string,
    rolePubkey: obj.role_pubkey as Uint8Array | undefined,
    oneshotPubkey: obj.oneshot_pubkey as Uint8Array | undefined,
    roleCertificate,
    fields: obj.fields as Record<string, CborValue>,
    visibility,
    expiresAt: obj.expires_at as number,
    createdAt: obj.created_at as number,
    intentId: obj.intent_id as Uint8Array,
  };
  if (obj.signature && obj.device_signature) {
    intent.signature = { role: obj.signature as Uint8Array, device: obj.device_signature as Uint8Array };
  }
  // Re-canonicalize to validate intent_id
  const canonical = intentCanonicalPayload({
    side: intent.side,
    vertical: intent.vertical,
    actorType: intent.actorType,
    rolePubkey: intent.rolePubkey,
    oneshotPubkey: intent.oneshotPubkey,
    roleCertificate: intent.roleCertificate,
    fields: intent.fields,
    visibility: intent.visibility,
    expiresAt: intent.expiresAt,
    createdAt: intent.createdAt,
  });
  const payloadCbor = encodeCanonicalCbor(canonical);
  const recomputed = blake3Hash(payloadCbor, 32);
  // Allow recomputed mismatch only when intent_id was absent (e.g. local
  // pre-canonical form); when present, the two must match.
  if (intent.intentId) {
    const a = intent.intentId; const b = recomputed;
    if (a.length !== b.length || !a.every((v, i) => v === b[i])) {
      throw new Error("wire: intent_id mismatch on decode (canonicalization drift)");
    }
  } else {
    intent.intentId = recomputed;
  }
  return { intent, payloadCbor };
}

// ---- helpers ----

export function makeOneShotKeypair(): Ed25519Keypair {
  const { generateEd25519Keypair } = require("./identity.ts");
  return generateEd25519Keypair();
}

export function pubkeyFromPrivate(privateKey: Uint8Array): Uint8Array {
  return ed25519PublicKey(privateKey);
}

export { ed25519 };
