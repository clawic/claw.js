// Capability tokens.
//
// A Capability is a short-lived grant that lets a peer access fields they
// would otherwise not be allowed to see. Examples:
//   - `interested-in-listing`: a viewer expressed interest on a public listing;
//     the owner issues them a capability that reveals the contact level only
//     (e.g. phone number) until the listing closes.
//   - `share-album-24h`: a fresh peer was given a 24-hour window to look at a
//     family-only photo album.
//
// Capability bytes are canonical CBOR + RoleKey signature; `capId` is a base32
// truncation of `blake3(canonical_bytes)` for compact UI display.

import { ed25519 } from "@noble/curves/ed25519";

import { encodeCanonicalCbor, decodeCanonicalCbor, type CborValue } from "@clawjs/marketplace/cbor";
import { blake3Hash } from "@clawjs/marketplace/identity";

import type { CapabilityRef } from "./types.ts";

const BASE32 = "0123456789abcdefghjkmnpqrstvwxyz" as const;
const CAP_ID_LEN = 10;

export interface IssueCapabilityInput {
  blockId: Uint8Array;
  level: string;
  issuedTo?: Uint8Array;
  ttlSeconds?: number;
  rolePrivate: Uint8Array;
}

export function issueCapability(input: IssueCapabilityInput): CapabilityRef {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + (input.ttlSeconds ?? 60 * 60 * 24); // 24h default
  const draft: Omit<CapabilityRef, "capId" | "signature"> = {
    blockId: input.blockId,
    level: input.level,
    issuedTo: input.issuedTo,
    issuedAt,
    expiresAt,
  };
  const canonical = canonicalize(draft);
  const capId = computeCapId(canonical);
  const signature = ed25519.sign(canonical, input.rolePrivate);
  return { ...draft, capId, signature };
}

export function verifyCapability(cap: CapabilityRef, rolePubkey: Uint8Array, now = Math.floor(Date.now() / 1000)): boolean {
  if (!cap.signature) return false;
  if (now > cap.expiresAt) return false;
  const canonical = canonicalize(cap);
  if (computeCapId(canonical) !== cap.capId) return false;
  return ed25519.verify(cap.signature, canonical, rolePubkey);
}

export function encodeCapability(cap: CapabilityRef): Uint8Array {
  const out: Record<string, CborValue> = {
    cap_id: cap.capId,
    block_id: cap.blockId,
    level: cap.level,
    issued_at: cap.issuedAt,
    expires_at: cap.expiresAt,
  };
  if (cap.issuedTo) out.issued_to = cap.issuedTo;
  if (cap.signature) out.signature = cap.signature;
  return encodeCanonicalCbor(out);
}

export function decodeCapability(buf: Uint8Array): CapabilityRef {
  const obj = decodeCanonicalCbor(buf) as Record<string, CborValue>;
  return {
    capId: obj.cap_id as string,
    blockId: obj.block_id as Uint8Array,
    level: obj.level as string,
    issuedTo: obj.issued_to as Uint8Array | undefined,
    issuedAt: obj.issued_at as number,
    expiresAt: obj.expires_at as number,
    signature: obj.signature as Uint8Array | undefined,
  };
}

// ---- internal ----

function canonicalize(input: Omit<CapabilityRef, "capId" | "signature">): Uint8Array {
  const obj: Record<string, CborValue> = {
    block_id: input.blockId,
    level: input.level,
    issued_at: input.issuedAt,
    expires_at: input.expiresAt,
  };
  if (input.issuedTo) obj.issued_to = input.issuedTo;
  return encodeCanonicalCbor(obj);
}

function computeCapId(canonical: Uint8Array): string {
  const digest = blake3Hash(canonical, 32);
  let bitBuf = 0; let bitCount = 0; let out = "";
  for (let i = 0; out.length < CAP_ID_LEN; i++) {
    bitBuf = (bitBuf << 8) | digest[i];
    bitCount += 8;
    while (bitCount >= 5 && out.length < CAP_ID_LEN) {
      const v = (bitBuf >> (bitCount - 5)) & 0x1f;
      out += BASE32[v];
      bitCount -= 5;
    }
  }
  return out;
}
