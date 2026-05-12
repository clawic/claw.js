// X3DH session setup for mp/2.0.0 Double Ratchet mailbox.
//
// Reference: Signal X3DH specification, simplified for our threat model:
//   - Identity key: long-lived Ed25519 RoleKey (converted to X25519 for DH).
//   - Signed pre-key: medium-lived X25519 keypair signed by the RoleKey.
//   - One-time pre-key: short-lived X25519 keypair, consumed per session.
//   - Ephemeral key: fresh X25519 keypair the initiator generates per session.
//
// DH operations:
//   DH1 = DH(IdK_A, SPK_B)
//   DH2 = DH(EK_A, IdK_B)
//   DH3 = DH(EK_A, SPK_B)
//   DH4 = DH(EK_A, OPK_B)   (only if a one-time pre-key was used)
//   SK  = HKDF(DH1 || DH2 || DH3 [|| DH4]).
//
// The shared secret SK is the *root key* the Double Ratchet then chains
// forward from.

import { ed25519, x25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha2";
import { hkdf } from "@noble/hashes/hkdf";

import { ed25519ToX25519Public, ed25519ToX25519Private } from "../identity.ts";

export interface X3dhPreKeyBundle {
  identityKey: Uint8Array;            // Ed25519 RoleKey public (32 bytes)
  signedPreKey: Uint8Array;           // X25519 public (32 bytes)
  signedPreKeyId: number;
  signedPreKeySignature: Uint8Array;  // Ed25519 signature over signedPreKey using identityKey
  oneTimePreKey?: Uint8Array;         // X25519 public (optional)
  oneTimePreKeyId?: number;
}

export interface X3dhInitiatorSecrets {
  identityPrivate: Uint8Array;        // RoleKey Ed25519 seed (32 bytes)
  ephemeralPrivate: Uint8Array;       // X25519 secret (32 bytes)
}

export interface X3dhResponderSecrets {
  identityPrivate: Uint8Array;        // RoleKey Ed25519 seed (32 bytes)
  signedPreKeyPrivate: Uint8Array;    // X25519 secret (32 bytes)
  oneTimePreKeyPrivate?: Uint8Array;  // X25519 secret (optional)
}

const HKDF_INFO = new TextEncoder().encode("clawix-x3dh-v1");
const HKDF_SALT = new Uint8Array(32);   // all zeros, per spec

/** Initiator side of X3DH. Produces the shared secret + the ephemeral public key. */
export function x3dhInitiate(input: {
  initiator: X3dhInitiatorSecrets;
  responderBundle: X3dhPreKeyBundle;
}): { sharedSecret: Uint8Array; ephemeralPublic: Uint8Array; usedOneTimePreKeyId?: number } {
  const bundle = input.responderBundle;
  if (!ed25519.verify(
    bundle.signedPreKeySignature,
    bundle.signedPreKey,
    bundle.identityKey,
  )) {
    throw new Error("x3dh: responder's signed pre-key signature is invalid");
  }

  const idK_A_x = ed25519ToX25519Private(input.initiator.identityPrivate);
  const idK_B_x = ed25519ToX25519Public(bundle.identityKey);
  const ek_A = input.initiator.ephemeralPrivate;
  const ek_A_pub = x25519.getPublicKey(ek_A);

  const dh1 = x25519.getSharedSecret(idK_A_x, bundle.signedPreKey);
  const dh2 = x25519.getSharedSecret(ek_A, idK_B_x);
  const dh3 = x25519.getSharedSecret(ek_A, bundle.signedPreKey);
  let combined = concat([dh1, dh2, dh3]);
  if (bundle.oneTimePreKey) {
    const dh4 = x25519.getSharedSecret(ek_A, bundle.oneTimePreKey);
    combined = concat([combined, dh4]);
  }
  const sharedSecret = hkdf(sha256, combined, HKDF_SALT, HKDF_INFO, 32);
  return {
    sharedSecret,
    ephemeralPublic: ek_A_pub,
    usedOneTimePreKeyId: bundle.oneTimePreKeyId,
  };
}

/** Responder side of X3DH. Reconstructs the same shared secret. */
export function x3dhRespond(input: {
  responder: X3dhResponderSecrets;
  initiatorIdentityKey: Uint8Array;      // Ed25519 (32 bytes)
  initiatorEphemeralPublic: Uint8Array;  // X25519 (32 bytes)
}): { sharedSecret: Uint8Array } {
  const idK_B_x_priv = ed25519ToX25519Private(input.responder.identityPrivate);
  const idK_A_x_pub = ed25519ToX25519Public(input.initiatorIdentityKey);
  const spk = input.responder.signedPreKeyPrivate;
  const ek_pub = input.initiatorEphemeralPublic;

  const dh1 = x25519.getSharedSecret(spk, idK_A_x_pub);
  const dh2 = x25519.getSharedSecret(idK_B_x_priv, ek_pub);
  const dh3 = x25519.getSharedSecret(spk, ek_pub);
  let combined = concat([dh1, dh2, dh3]);
  if (input.responder.oneTimePreKeyPrivate) {
    const dh4 = x25519.getSharedSecret(input.responder.oneTimePreKeyPrivate, ek_pub);
    combined = concat([combined, dh4]);
  }
  return { sharedSecret: hkdf(sha256, combined, HKDF_SALT, HKDF_INFO, 32) };
}

// ---- helpers ----

function concat(parts: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

export function signPreKey(input: {
  identityPrivate: Uint8Array;        // Ed25519 RoleKey seed
  preKeyPublic: Uint8Array;           // X25519 public to be signed
}): Uint8Array {
  return ed25519.sign(input.preKeyPublic, input.identityPrivate);
}

export function generatePreKeyPair(): { publicKey: Uint8Array; privateKey: Uint8Array } {
  // We need 32 random bytes for an X25519 secret. `@noble/curves` exposes
  // a `utils.randomPrivateKey()` via the curve type.
  const privateKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return { publicKey, privateKey };
}
