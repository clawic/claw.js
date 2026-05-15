// Human-friendly handles for Clawix Profiles.
//
// A `Handle` ties three things together:
//   - `alias`     – a non-unique nickname chosen by the user locally
//                  ("@pepe" on my device does not collide with "@pepe" on yours).
//   - `fingerprint` – a base32 truncated `blake3(rootPubkey)` digest that *is*
//                    cryptographically unique. Always paired with the alias when
//                    handed to other peers (`@pepe.a3f1b2c4`).
//   - `rootPubkey` – the actual Ed25519 RootKey public bytes the handle resolves
//                    to. Authoritative — alias and fingerprint can be reissued,
//                    rotated or re-paired, but the rootPubkey is the identity.
//
// Resolution: out-of-band profile pairing payload, local cache of
// previously-met peers, and gossip between peers that already trust each other.
//
// The fingerprint format is intentionally human-typable (base32, lowercase,
// without easily confused characters) and short enough to read aloud.

import type { CborValue } from "./cbor.ts";
import { encodeCanonicalCbor, decodeCanonicalCbor } from "./cbor.ts";
import { blake3Hash } from "./identity.ts";

// ---- types ----

export interface Handle {
  alias: string;          // e.g. "pepe" (no leading @, ASCII, 1..32 chars).
  fingerprint: string;    // 12-char base32 truncation of blake3(rootPubkey).
  rootPubkey: Uint8Array; // 32 bytes Ed25519.
}

/** Local cache entry mapping a known peer's handle to its rootPubkey. */
export interface PeerDirectoryEntry {
  handle: Handle;
  firstSeenAt: number;
  lastSeenAt: number;
  introducedBy?: Uint8Array; // pubkey of the peer that gossiped this handle to us
  trustedLocally: boolean;   // user has explicitly approved this binding
}

// ---- validation ----

const ALIAS_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export function isValidAlias(alias: string): boolean {
  return ALIAS_RE.test(alias);
}

export function normalizeAlias(input: string): string {
  return input.trim().toLowerCase().replace(/^@/, "");
}

// ---- fingerprint encoding ----

// Crockford-style base32 alphabet without `i`, `l`, `o`, `u` to avoid visual
// ambiguity (and `u` to drop accidental profanity in the truncated suffix).
// 32 symbols, all lowercase, decimal digits first then consonants/vowels.
const BASE32 = "0123456789abcdefghjkmnpqrstvwxyz" as const;

if (BASE32.length !== 32) {
  throw new Error("handles: BASE32 alphabet must be exactly 32 chars");
}

/** 12 base32 chars → 60 bits of entropy, plenty for collision-resistance. */
export const FINGERPRINT_LEN = 12;

export function computeFingerprint(rootPubkey: Uint8Array): string {
  if (rootPubkey.length !== 32) throw new Error("handles: rootPubkey must be 32 bytes");
  const digest = blake3Hash(rootPubkey, 32);
  // Pack the first 60 bits as 12 base32 chars (5 bits each).
  let bitBuf = 0;
  let bitCount = 0;
  let out = "";
  for (let i = 0; out.length < FINGERPRINT_LEN; i++) {
    bitBuf = (bitBuf << 8) | digest[i];
    bitCount += 8;
    while (bitCount >= 5 && out.length < FINGERPRINT_LEN) {
      const v = (bitBuf >> (bitCount - 5)) & 0x1f;
      out += BASE32[v];
      bitCount -= 5;
    }
  }
  return out;
}

export function isValidFingerprint(value: string): boolean {
  if (value.length !== FINGERPRINT_LEN) return false;
  for (const c of value) if (!BASE32.includes(c)) return false;
  return true;
}

// ---- handle construction ----

export function buildHandle(input: { alias: string; rootPubkey: Uint8Array }): Handle {
  const alias = normalizeAlias(input.alias);
  if (!isValidAlias(alias)) {
    throw new Error(`handles: invalid alias "${input.alias}" (allowed: [a-z0-9_-], 1..32 chars, must start with [a-z0-9])`);
  }
  return {
    alias,
    fingerprint: computeFingerprint(input.rootPubkey),
    rootPubkey: input.rootPubkey,
  };
}

export function handleVerify(h: Handle): boolean {
  if (!isValidAlias(h.alias)) return false;
  if (!isValidFingerprint(h.fingerprint)) return false;
  if (h.rootPubkey.length !== 32) return false;
  return computeFingerprint(h.rootPubkey) === h.fingerprint;
}

// ---- string rendering ----

/** Human form: "@alias.fingerprint" (no scheme). Useful in chat messages. */
export function formatHandle(h: Handle): string {
  return `@${h.alias}.${h.fingerprint}`;
}

const HANDLE_TEXT_RE = /^@?([a-z0-9][a-z0-9_-]{0,31})\.([0-9a-z]{12})$/;

/**
 * Parse a textual handle of the form `@alias.fingerprint`. Returns the parts
 * but NOT the underlying rootPubkey — that has to be looked up via the peer
 * directory or via a profile pairing payload.
 */
export function parseHandleText(text: string): { alias: string; fingerprint: string } {
  const match = HANDLE_TEXT_RE.exec(text.trim().toLowerCase());
  if (!match) throw new Error(`handles: cannot parse handle text "${text}"`);
  const alias = match[1];
  const fingerprint = match[2];
  if (!isValidFingerprint(fingerprint)) throw new Error("handles: invalid fingerprint chars");
  return { alias, fingerprint };
}

// ---- profile pairing payload ----

const PAIRING_PAYLOAD_KIND = "claw.profile.pairing";

/**
 * Self-contained profile pairing payload. Encodes alias, fingerprint, and the
 * raw rootPubkey so a fresh peer can resolve the handle without prior trust.
 * Used in QR codes and copy/paste payloads, not Clawix deep links.
 */
export interface PairingPayload {
  handle: Handle;
  hints?: {
    irohNodeId?: string;        // optional reachability hint
    addrs?: string[];           // optional multiaddrs
    issuedAt?: number;
    expiresAt?: number;
  };
  signature?: Uint8Array;       // optional signature by RootKey over the canonical payload
}

export function encodePairingPayload(link: PairingPayload): string {
  const payload: Record<string, CborValue> = {
    alias: link.handle.alias,
    fingerprint: link.handle.fingerprint,
    root_pubkey: link.handle.rootPubkey,
  };
  if (link.hints) {
    const hints: Record<string, CborValue> = {};
    if (link.hints.irohNodeId) hints.iroh_node_id = link.hints.irohNodeId;
    if (link.hints.addrs) hints.addrs = link.hints.addrs;
    if (link.hints.issuedAt) hints.issued_at = link.hints.issuedAt;
    if (link.hints.expiresAt) hints.expires_at = link.hints.expiresAt;
    payload.hints = hints;
  }
  if (link.signature) payload.signature = link.signature;
  const cbor = encodeCanonicalCbor(payload);
  return JSON.stringify({ v: 1, kind: PAIRING_PAYLOAD_KIND, d: base64Url(cbor) });
}

export function decodePairingPayload(text: string): PairingPayload {
  let envelope: unknown;
  try {
    envelope = JSON.parse(text);
  } catch {
    throw new Error("handles: profile pairing payload must be JSON");
  }
  if (
    !envelope ||
    typeof envelope !== "object" ||
    (envelope as { v?: unknown }).v !== 1 ||
    (envelope as { kind?: unknown }).kind !== PAIRING_PAYLOAD_KIND ||
    typeof (envelope as { d?: unknown }).d !== "string"
  ) {
    throw new Error("handles: profile pairing payload must be { v: 1, kind: claw.profile.pairing, d }");
  }
  const buf = fromBase64Url((envelope as { d: string }).d);
  const obj = decodeCanonicalCbor(buf) as Record<string, CborValue>;
  const alias = obj.alias as string;
  const fingerprint = obj.fingerprint as string;
  const rootPubkey = obj.root_pubkey as Uint8Array;
  if (!isValidAlias(alias)) throw new Error("handles: bad alias in profile pairing payload");
  if (!isValidFingerprint(fingerprint)) throw new Error("handles: bad fingerprint in profile pairing payload");
  if (rootPubkey.length !== 32) throw new Error("handles: bad rootPubkey in profile pairing payload");
  if (computeFingerprint(rootPubkey) !== fingerprint) {
    throw new Error("handles: rootPubkey does not match fingerprint (payload tampered)");
  }
  const handle: Handle = { alias, fingerprint, rootPubkey };
  const link: PairingPayload = { handle };
  const hints = obj.hints as Record<string, CborValue> | undefined;
  if (hints) {
    link.hints = {
      irohNodeId: hints.iroh_node_id as string | undefined,
      addrs: (hints.addrs as CborValue[] | undefined)?.map((v) => v as string),
      issuedAt: hints.issued_at as number | undefined,
      expiresAt: hints.expires_at as number | undefined,
    };
  }
  if (obj.signature) link.signature = obj.signature as Uint8Array;
  return link;
}

// ---- base64url ----

function base64Url(buf: Uint8Array): string {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return new Uint8Array(Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64"));
}
