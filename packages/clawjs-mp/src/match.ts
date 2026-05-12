// MatchReceipt creation, signing and verification for mp/1.0.0.

import { encodeCanonicalCbor, decodeCanonicalCbor, type CborValue } from "./cbor.ts";
import {
  blake3Hash, compoundSign, compoundVerify, type CompoundSignature,
} from "./identity.ts";
import { ed25519 } from "@noble/curves/ed25519";

export interface MatchReceiptDraft {
  offerIntentId: Uint8Array;
  wantIntentId: Uint8Array;
  offererRolePubkey: Uint8Array;
  seekerRolePubkey: Uint8Array;
  reachedLevel: number;
  fieldsRevealed: string[];
  contactHandover: CborValue;
  signedAt: number;
}

export interface MatchReceipt extends MatchReceiptDraft {
  offererSignature?: CompoundSignature;
  seekerSignature?: CompoundSignature;
}

function receiptPayload(input: MatchReceiptDraft, opts: { withSignatures?: { offerer?: CompoundSignature; seeker?: CompoundSignature } } = {}): CborValue {
  const obj: Record<string, CborValue> = {
    offer_intent_id: input.offerIntentId,
    want_intent_id: input.wantIntentId,
    offerer_role_pubkey: input.offererRolePubkey,
    seeker_role_pubkey: input.seekerRolePubkey,
    reached_level: input.reachedLevel,
    fields_revealed: input.fieldsRevealed.map((s) => s),
    contact_handover: input.contactHandover,
    signed_at: input.signedAt,
  };
  if (opts.withSignatures?.offerer) {
    obj.offerer_signature_role = opts.withSignatures.offerer.role;
    obj.offerer_signature_device = opts.withSignatures.offerer.device;
  }
  if (opts.withSignatures?.seeker) {
    obj.seeker_signature_role = opts.withSignatures.seeker.role;
    obj.seeker_signature_device = opts.withSignatures.seeker.device;
  }
  return obj;
}

export function canonicalizeDraft(input: MatchReceiptDraft): Uint8Array {
  return encodeCanonicalCbor(receiptPayload(input));
}

export function signAsOfferer(input: {
  draft: MatchReceiptDraft;
  rolePrivate: Uint8Array;
  devicePrivate: Uint8Array;
}): CompoundSignature {
  const payload = canonicalizeDraft(input.draft);
  return compoundSign({
    payload,
    rolePrivate: input.rolePrivate,
    devicePrivate: input.devicePrivate,
  });
}

export function signAsSeeker(input: {
  draft: MatchReceiptDraft;
  offererSignature: CompoundSignature;
  rolePrivate: Uint8Array;
  devicePrivate: Uint8Array;
}): CompoundSignature {
  // The seeker signs over the canonical payload that includes the offerer's
  // signature, so the seeker's signature commits to both parties' roles.
  const payload = encodeCanonicalCbor(receiptPayload(input.draft, { withSignatures: { offerer: input.offererSignature } }));
  return compoundSign({
    payload,
    rolePrivate: input.rolePrivate,
    devicePrivate: input.devicePrivate,
  });
}

export function verifyReceipt(input: {
  receipt: MatchReceipt;
  offererDevicePub: Uint8Array;
  seekerDevicePub: Uint8Array;
}): boolean {
  if (!input.receipt.offererSignature || !input.receipt.seekerSignature) return false;
  const offererPayload = canonicalizeDraft(input.receipt);
  if (!compoundVerify({
    payload: offererPayload,
    rolePub: input.receipt.offererRolePubkey,
    devicePub: input.offererDevicePub,
    signature: input.receipt.offererSignature,
  })) return false;
  const seekerPayload = encodeCanonicalCbor(receiptPayload(input.receipt, { withSignatures: { offerer: input.receipt.offererSignature } }));
  return compoundVerify({
    payload: seekerPayload,
    rolePub: input.receipt.seekerRolePubkey,
    devicePub: input.seekerDevicePub,
    signature: input.receipt.seekerSignature,
  });
}

export function receiptHash(receipt: MatchReceipt): Uint8Array {
  const payload = encodeCanonicalCbor(receiptPayload(receipt, {
    withSignatures: {
      offerer: receipt.offererSignature,
      seeker: receipt.seekerSignature,
    },
  }));
  return blake3Hash(payload, 32);
}

export function encodeReceipt(receipt: MatchReceipt): Uint8Array {
  return encodeCanonicalCbor(receiptPayload(receipt, {
    withSignatures: {
      offerer: receipt.offererSignature,
      seeker: receipt.seekerSignature,
    },
  }));
}

export function decodeReceipt(buf: Uint8Array): MatchReceipt {
  const obj = decodeCanonicalCbor(buf) as Record<string, CborValue>;
  const out: MatchReceipt = {
    offerIntentId: obj.offer_intent_id as Uint8Array,
    wantIntentId: obj.want_intent_id as Uint8Array,
    offererRolePubkey: obj.offerer_role_pubkey as Uint8Array,
    seekerRolePubkey: obj.seeker_role_pubkey as Uint8Array,
    reachedLevel: obj.reached_level as number,
    fieldsRevealed: (obj.fields_revealed as CborValue[]).map((v) => v as string),
    contactHandover: obj.contact_handover as CborValue,
    signedAt: obj.signed_at as number,
  };
  if (obj.offerer_signature_role && obj.offerer_signature_device) {
    out.offererSignature = {
      role: obj.offerer_signature_role as Uint8Array,
      device: obj.offerer_signature_device as Uint8Array,
    };
  }
  if (obj.seeker_signature_role && obj.seeker_signature_device) {
    out.seekerSignature = {
      role: obj.seeker_signature_role as Uint8Array,
      device: obj.seeker_signature_device as Uint8Array,
    };
  }
  return out;
}

export { ed25519 };
