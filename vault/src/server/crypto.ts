// Cripto Clawix-grade en TypeScript.
//
// Replica el modelo del Vault Swift de Clawix:
//   - Argon2id para derivar la masterKey desde la passphrase del usuario.
//   - ChaCha20-Poly1305 para AEAD (cifrado autenticado con AAD).
//   - Per-item key wrap: cada secret tiene su propia key de 32 bytes,
//     cifrada con la masterKey (rotar password no re-cifra datos).
//   - Recovery phrase BIP39 (12 palabras) cuya seed Argon2id deriva una
//     recovery key que envuelve la masterKey.
//   - Verifier HMAC-SHA256 para validar la passphrase sin almacenarla.
//   - auditMacKey separada de la masterKey, sobrevive cambios de passphrase
//     (la chain de auditoría sigue siendo verificable).
//
// AAD pattern (igual que Clawix Swift):
//   item-key wrap         → "{secretId}|item-key"
//   field encryption      → "{secretId}|field|{fieldName}"
//   notes encryption      → "{secretId}|notes"
//   attachment-key wrap   → "{attachmentId}|attachment-key"
//   attachment data       → "{attachmentId}|attachment"
//   event-key wrap        → "{eventId}|event-key"
//   event payload         → "{eventId}|event-payload"

import { randomBytes as nodeRandomBytes, createHash, randomUUID, timingSafeEqual } from "node:crypto";

import { chacha20poly1305 } from "@noble/ciphers/chacha";
import { argon2id } from "@noble/hashes/argon2";
import { hmac } from "@noble/hashes/hmac";
import { sha256, sha512 } from "@noble/hashes/sha2";
import * as bip39 from "bip39";

import { LockableSecret } from "./lockable-secret.ts";
import { ARGON2_DEFAULT_PARAMS, type Argon2Params } from "./calibration.ts";

const TEXT = new TextEncoder();
const TEXT_DEC = new TextDecoder();

export const CRYPTO_VERSION = 1;
export const FORMAT_VERSION = 1;
export const KEY_LENGTH = 32;
export const NONCE_LENGTH = 12;
export const SALT_LENGTH = 32;

// ---------- Random helpers ----------

export function randomBytes(length: number): Uint8Array {
  return new Uint8Array(nodeRandomBytes(length).buffer, 0, length);
}

export function generateKey(): Uint8Array {
  return randomBytes(KEY_LENGTH);
}

export function generateNonce(): Uint8Array {
  return randomBytes(NONCE_LENGTH);
}

export function generateSalt(): Uint8Array {
  return randomBytes(SALT_LENGTH);
}

// ---------- AEAD (ChaCha20-Poly1305) ----------
//
// Encoded blob layout: version(1) || nonce(12) || ciphertext+tag(N).
// AAD is NOT included in the blob (callers must pass the same AAD on open).

export function aeadSeal(key: Uint8Array, plaintext: Uint8Array, aad: Uint8Array | string = ""): Uint8Array {
  if (key.length !== KEY_LENGTH) throw new Error(`AEAD key must be ${KEY_LENGTH} bytes`);
  const aadBytes = typeof aad === "string" ? TEXT.encode(aad) : aad;
  const nonce = generateNonce();
  const cipher = chacha20poly1305(key, nonce, aadBytes);
  const ct = cipher.encrypt(plaintext);
  const out = new Uint8Array(1 + NONCE_LENGTH + ct.length);
  out[0] = CRYPTO_VERSION;
  out.set(nonce, 1);
  out.set(ct, 1 + NONCE_LENGTH);
  return out;
}

export function aeadOpen(key: Uint8Array, blob: Uint8Array, aad: Uint8Array | string = ""): Uint8Array {
  if (key.length !== KEY_LENGTH) throw new Error(`AEAD key must be ${KEY_LENGTH} bytes`);
  if (blob.length < 1 + NONCE_LENGTH + 16) throw new Error("AEAD blob too short");
  if (blob[0] !== CRYPTO_VERSION) throw new Error(`Unsupported AEAD version: ${blob[0]}`);
  const aadBytes = typeof aad === "string" ? TEXT.encode(aad) : aad;
  const nonce = blob.subarray(1, 1 + NONCE_LENGTH);
  const ct = blob.subarray(1 + NONCE_LENGTH);
  const cipher = chacha20poly1305(key, nonce, aadBytes);
  return cipher.decrypt(ct);
}

// ---------- KDF (Argon2id) ----------

export function deriveKey(password: string, salt: Uint8Array, params: Argon2Params): Uint8Array {
  const pw = TEXT.encode(password);
  return argon2id(pw, salt, { t: params.t, m: params.m, p: params.p, dkLen: KEY_LENGTH });
}

// ---------- Verifier (proves we have the masterKey) ----------
//
// Stored alongside the meta. On unlock, we re-derive the masterKey from
// (password, salt, params) and recompute HMAC-SHA256(masterKey, "verifier")
// to check it matches in constant time. No password ever stored.

const VERIFIER_LABEL = TEXT.encode("clawjs-vault.verifier.v1");

export function computeVerifier(masterKey: Uint8Array): Uint8Array {
  return hmac(sha256, masterKey, VERIFIER_LABEL);
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// ---------- Recovery phrase (BIP39) ----------
//
// We use BIP39 only for the human-readable mnemonic (entropy + checksum,
// 12 words = 128 bits). The actual recovery key is derived with Argon2id
// from the mnemonic + recoverySalt, NOT the standard BIP39 seed (which is
// PBKDF2-HMAC-SHA512 with 2048 iterations, much weaker than Argon2id).

export function generateMnemonic(): string {
  return bip39.generateMnemonic(128); // 12 words
}

export function validateMnemonic(phrase: string): boolean {
  return bip39.validateMnemonic(phrase.trim());
}

export function deriveRecoveryKey(mnemonic: string, salt: Uint8Array, params: Argon2Params): Uint8Array {
  const normalized = mnemonic.trim().toLowerCase().split(/\s+/).join(" ");
  return deriveKey(normalized, salt, params);
}

// ---------- Vault meta (lifecycle) ----------

export interface VaultMetaSnapshot {
  formatVersion: number;
  cryptoVersion: number;
  schemaVersion: number;
  appVersionAtSetup: string;
  deviceId: string;
  createdAt: string;
  // KDF for password
  kdfSalt: Uint8Array;
  kdfParams: Argon2Params;
  verifier: Uint8Array;
  // Recovery phrase derivation
  recoverySalt: Uint8Array;
  recoveryParams: Argon2Params;
  recoveryWrap: Uint8Array; // AEAD-sealed masterKey with recoveryKey
  // Audit chain key (separate from masterKey, invariant to password change)
  auditMacKeyWrap: Uint8Array; // AEAD-sealed auditMacKey with masterKey
  auditChainGenesis: Uint8Array; // 32 bytes random
}

export interface VaultSetupOptions {
  schemaVersion: number;
  appVersion: string;
  kdfParams: Argon2Params;
  recoveryParams?: Argon2Params;
  deviceId?: string;
}

export interface VaultSetupResult {
  meta: VaultMetaSnapshot;
  masterKey: LockableSecret;
  auditMacKey: LockableSecret;
  recoveryPhrase: string;
}

export interface VaultUnlockResult {
  masterKey: LockableSecret;
  auditMacKey: LockableSecret;
}

export function vaultSetup(masterPassword: string, opts: VaultSetupOptions): VaultSetupResult {
  if (!masterPassword || masterPassword.length < 1) {
    throw new Error("Master password must not be empty");
  }
  const kdfParams = opts.kdfParams;
  const recoveryParams = opts.recoveryParams ?? opts.kdfParams;

  const kdfSalt = generateSalt();
  const recoverySalt = generateSalt();
  const masterKeyBytes = generateKey();
  const auditMacKeyBytes = generateKey();
  const recoveryPhrase = generateMnemonic();
  const deviceId = opts.deviceId ?? randomUUID();
  const auditChainGenesis = generateKey();

  // Derive password key, but we wrap masterKey via re-derivation, not via wrap
  // (mirrors Clawix: kdfDerivedKey is the masterKey itself, derived from
  //  password+salt+params; verifier proves we got the right one).
  // To allow rotating password without re-encrypting items, the masterKey
  // we expose is RANDOM, and the password derivation key wraps it.
  const passwordKey = deriveKey(masterPassword, kdfSalt, kdfParams);
  const recoveryKey = deriveRecoveryKey(recoveryPhrase, recoverySalt, recoveryParams);

  const _passwordWrap = aeadSeal(passwordKey, masterKeyBytes, "vault.master-key|password");
  // Verifier is HMAC of masterKey itself; recompute on unlock and compare.
  const verifier = computeVerifier(masterKeyBytes);
  const recoveryWrap = aeadSeal(recoveryKey, masterKeyBytes, "vault.master-key|recovery");
  const auditMacKeyWrap = aeadSeal(masterKeyBytes, auditMacKeyBytes, "vault.audit-mac-key");

  // Zero out derived keys we no longer need.
  passwordKey.fill(0);
  recoveryKey.fill(0);

  const meta: VaultMetaSnapshot = {
    formatVersion: FORMAT_VERSION,
    cryptoVersion: CRYPTO_VERSION,
    schemaVersion: opts.schemaVersion,
    appVersionAtSetup: opts.appVersion,
    deviceId,
    createdAt: new Date().toISOString(),
    kdfSalt,
    kdfParams,
    verifier,
    recoverySalt,
    recoveryParams,
    recoveryWrap: combineWrap(_passwordWrap, recoveryWrap),
    auditMacKeyWrap,
    auditChainGenesis,
  };

  const masterKey = LockableSecret.fromBytes(masterKeyBytes);
  const auditMacKey = LockableSecret.fromBytes(auditMacKeyBytes);
  masterKeyBytes.fill(0);
  auditMacKeyBytes.fill(0);

  return { meta, masterKey, auditMacKey, recoveryPhrase };
}

// We store BOTH the password-wrapped masterKey AND the recovery-wrapped one
// in `recoveryWrap` (concatenated with a length prefix). On password change
// only the password-wrapped half is replaced.

function combineWrap(passwordWrap: Uint8Array, recoveryWrap: Uint8Array): Uint8Array {
  const view = new DataView(new ArrayBuffer(4 + passwordWrap.length + 4 + recoveryWrap.length));
  view.setUint32(0, passwordWrap.length, false);
  const out = new Uint8Array(view.buffer);
  out.set(passwordWrap, 4);
  view.setUint32(4 + passwordWrap.length, recoveryWrap.length, false);
  out.set(recoveryWrap, 4 + passwordWrap.length + 4);
  return out;
}

function splitWrap(combined: Uint8Array): { passwordWrap: Uint8Array; recoveryWrap: Uint8Array } {
  const view = new DataView(combined.buffer, combined.byteOffset, combined.byteLength);
  const pwLen = view.getUint32(0, false);
  const passwordWrap = combined.subarray(4, 4 + pwLen);
  const recLen = view.getUint32(4 + pwLen, false);
  const recoveryWrap = combined.subarray(4 + pwLen + 4, 4 + pwLen + 4 + recLen);
  return { passwordWrap, recoveryWrap };
}

export function vaultUnlock(meta: VaultMetaSnapshot, password: string): VaultUnlockResult {
  const passwordKey = deriveKey(password, meta.kdfSalt, meta.kdfParams);
  const { passwordWrap } = splitWrap(meta.recoveryWrap);
  let masterKeyBytes: Uint8Array;
  try {
    masterKeyBytes = aeadOpen(passwordKey, passwordWrap, "vault.master-key|password");
  } finally {
    passwordKey.fill(0);
  }

  const verifier = computeVerifier(masterKeyBytes);
  if (!constantTimeEqual(verifier, meta.verifier)) {
    masterKeyBytes.fill(0);
    throw new Error("Vault verifier mismatch");
  }

  const auditMacKeyBytes = aeadOpen(masterKeyBytes, meta.auditMacKeyWrap, "vault.audit-mac-key");
  const masterKey = LockableSecret.fromBytes(masterKeyBytes);
  const auditMacKey = LockableSecret.fromBytes(auditMacKeyBytes);
  masterKeyBytes.fill(0);
  auditMacKeyBytes.fill(0);

  return { masterKey, auditMacKey };
}

export function vaultRecover(meta: VaultMetaSnapshot, recoveryPhrase: string): VaultUnlockResult {
  if (!validateMnemonic(recoveryPhrase)) {
    throw new Error("Invalid BIP39 recovery phrase");
  }
  const recoveryKey = deriveRecoveryKey(recoveryPhrase, meta.recoverySalt, meta.recoveryParams);
  const { recoveryWrap } = splitWrap(meta.recoveryWrap);
  let masterKeyBytes: Uint8Array;
  try {
    masterKeyBytes = aeadOpen(recoveryKey, recoveryWrap, "vault.master-key|recovery");
  } finally {
    recoveryKey.fill(0);
  }

  const verifier = computeVerifier(masterKeyBytes);
  if (!constantTimeEqual(verifier, meta.verifier)) {
    masterKeyBytes.fill(0);
    throw new Error("Recovery phrase did not yield the right master key");
  }

  const auditMacKeyBytes = aeadOpen(masterKeyBytes, meta.auditMacKeyWrap, "vault.audit-mac-key");
  const masterKey = LockableSecret.fromBytes(masterKeyBytes);
  const auditMacKey = LockableSecret.fromBytes(auditMacKeyBytes);
  masterKeyBytes.fill(0);
  auditMacKeyBytes.fill(0);

  return { masterKey, auditMacKey };
}

export interface VaultChangePasswordResult {
  newMeta: VaultMetaSnapshot;
  newRecoveryPhrase: string;
}

export function vaultChangePassword(
  meta: VaultMetaSnapshot,
  oldPassword: string,
  newPassword: string,
  newKdfParams?: Argon2Params,
  newRecoveryParams?: Argon2Params,
): VaultChangePasswordResult {
  const { masterKey, auditMacKey } = vaultUnlock(meta, oldPassword);
  try {
    const kdfParams = newKdfParams ?? meta.kdfParams;
    const recoveryParams = newRecoveryParams ?? meta.recoveryParams;
    const newKdfSalt = generateSalt();
    const newRecoverySalt = generateSalt();
    const newRecoveryPhrase = generateMnemonic();

    const passwordKey = deriveKey(newPassword, newKdfSalt, kdfParams);
    const recoveryKey = deriveRecoveryKey(newRecoveryPhrase, newRecoverySalt, recoveryParams);

    let masterKeyBytes!: Uint8Array;
    let auditMacKeyBytes!: Uint8Array;
    masterKey.withBytes((b) => {
      masterKeyBytes = new Uint8Array(b);
    });
    auditMacKey.withBytes((b) => {
      auditMacKeyBytes = new Uint8Array(b);
    });

    const passwordWrap = aeadSeal(passwordKey, masterKeyBytes, "vault.master-key|password");
    const recoveryWrap = aeadSeal(recoveryKey, masterKeyBytes, "vault.master-key|recovery");
    const auditMacKeyWrap = aeadSeal(masterKeyBytes, auditMacKeyBytes, "vault.audit-mac-key");

    passwordKey.fill(0);
    recoveryKey.fill(0);
    masterKeyBytes.fill(0);
    auditMacKeyBytes.fill(0);

    const newMeta: VaultMetaSnapshot = {
      ...meta,
      kdfSalt: newKdfSalt,
      kdfParams,
      verifier: meta.verifier, // verifier is HMAC of masterKey, doesn't change
      recoverySalt: newRecoverySalt,
      recoveryParams,
      recoveryWrap: combineWrap(passwordWrap, recoveryWrap),
      auditMacKeyWrap,
    };

    return { newMeta, newRecoveryPhrase };
  } finally {
    masterKey.zero();
    auditMacKey.zero();
  }
}

// ---------- Per-item key wrap ----------

export function generateItemKey(): Uint8Array {
  return generateKey();
}

export function wrapItemKey(itemKey: Uint8Array, secretId: string, masterKey: LockableSecret): Uint8Array {
  return masterKey.withBytes((mk) => aeadSeal(mk, itemKey, `${secretId}|item-key`));
}

export function unwrapItemKey(wrapped: Uint8Array, secretId: string, masterKey: LockableSecret): LockableSecret {
  const bytes = masterKey.withBytes((mk) => aeadOpen(mk, wrapped, `${secretId}|item-key`));
  const ls = LockableSecret.fromBytes(bytes);
  bytes.fill(0);
  return ls;
}

// ---------- Field encryption ----------

export function sealField(plaintext: string, itemKey: LockableSecret, secretId: string, fieldName: string): Uint8Array {
  return itemKey.withBytes((k) => aeadSeal(k, TEXT.encode(plaintext), `${secretId}|field|${fieldName}`));
}

export function openField(ciphertext: Uint8Array, itemKey: LockableSecret, secretId: string, fieldName: string): string {
  const bytes = itemKey.withBytes((k) => aeadOpen(k, ciphertext, `${secretId}|field|${fieldName}`));
  return TEXT_DEC.decode(bytes);
}

// ---------- Notes encryption ----------

export function sealNotes(plaintext: string, itemKey: LockableSecret, secretId: string): Uint8Array {
  return itemKey.withBytes((k) => aeadSeal(k, TEXT.encode(plaintext), `${secretId}|notes`));
}

export function openNotes(ciphertext: Uint8Array, itemKey: LockableSecret, secretId: string): string {
  const bytes = itemKey.withBytes((k) => aeadOpen(k, ciphertext, `${secretId}|notes`));
  return TEXT_DEC.decode(bytes);
}

// ---------- Attachments ----------

export function generateAttachmentKey(): Uint8Array {
  return generateKey();
}

export function wrapAttachmentKey(attachmentKey: Uint8Array, attachmentId: string, masterKey: LockableSecret): Uint8Array {
  return masterKey.withBytes((mk) => aeadSeal(mk, attachmentKey, `${attachmentId}|attachment-key`));
}

export function unwrapAttachmentKey(wrapped: Uint8Array, attachmentId: string, masterKey: LockableSecret): LockableSecret {
  const bytes = masterKey.withBytes((mk) => aeadOpen(mk, wrapped, `${attachmentId}|attachment-key`));
  const ls = LockableSecret.fromBytes(bytes);
  bytes.fill(0);
  return ls;
}

export function sealAttachment(data: Uint8Array, attachmentKey: LockableSecret, attachmentId: string): Uint8Array {
  return attachmentKey.withBytes((k) => aeadSeal(k, data, `${attachmentId}|attachment`));
}

export function openAttachment(ciphertext: Uint8Array, attachmentKey: LockableSecret, attachmentId: string): Uint8Array {
  return attachmentKey.withBytes((k) => aeadOpen(k, ciphertext, `${attachmentId}|attachment`));
}

// ---------- Audit events (per-event key wrapped with auditMacKey, NOT masterKey) ----------

export function generateEventKey(): Uint8Array {
  return generateKey();
}

export function wrapEventKey(eventKey: Uint8Array, eventId: string, auditMacKey: LockableSecret): Uint8Array {
  return auditMacKey.withBytes((k) => aeadSeal(k, eventKey, `${eventId}|event-key`));
}

export function unwrapEventKey(wrapped: Uint8Array, eventId: string, auditMacKey: LockableSecret): LockableSecret {
  const bytes = auditMacKey.withBytes((k) => aeadOpen(k, wrapped, `${eventId}|event-key`));
  const ls = LockableSecret.fromBytes(bytes);
  bytes.fill(0);
  return ls;
}

export function sealEventPayload(payload: string, eventKey: LockableSecret, eventId: string): Uint8Array {
  return eventKey.withBytes((k) => aeadSeal(k, TEXT.encode(payload), `${eventId}|event-payload`));
}

export function openEventPayload(ciphertext: Uint8Array, eventKey: LockableSecret, eventId: string): string {
  const bytes = eventKey.withBytes((k) => aeadOpen(k, ciphertext, `${eventId}|event-payload`));
  return TEXT_DEC.decode(bytes);
}

// ---------- Audit chain hash ----------
//
// chainHash = HMAC-SHA256(auditMacKey, prevHash || canonicalEventBytes)

export function computeChainHash(prevHash: Uint8Array, canonicalEvent: Uint8Array, auditMacKey: LockableSecret): Uint8Array {
  return auditMacKey.withBytes((k) => {
    const buf = new Uint8Array(prevHash.length + canonicalEvent.length);
    buf.set(prevHash, 0);
    buf.set(canonicalEvent, prevHash.length);
    return hmac(sha256, k, buf);
  });
}

// ---------- Fingerprint (display-only, masked) ----------

export function maskFingerprint(secretValue: string): string {
  const digest = createHash("sha256").update(secretValue).digest("hex");
  return `sha256:${digest.slice(0, 8)}…${digest.slice(-6)}`;
}

// ---------- Base64 helpers (used by serialization layer) ----------

export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export function fromBase64(s: string): Uint8Array {
  const buf = Buffer.from(s, "base64");
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

// ---------- Token helpers ----------

const SVAGT_PREFIX = "svagt_";

export function generateAgentToken(): { token: string; hash: string } {
  const entropy = randomBytes(32);
  const token = SVAGT_PREFIX + Buffer.from(entropy).toString("base64url");
  const h = createHash("sha256").update(token).digest("hex");
  return { token, hash: h };
}

export function hashAgentToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isAgentToken(token: string): boolean {
  return token.startsWith(SVAGT_PREFIX);
}

// Lease tokens use a different prefix to keep them separate from grant tokens.
const SVLSE_PREFIX = "svlse_";

export function generateLeaseToken(): { token: string; hash: string } {
  const entropy = randomBytes(32);
  const token = SVLSE_PREFIX + Buffer.from(entropy).toString("base64url");
  const h = createHash("sha256").update(token).digest("hex");
  return { token, hash: h };
}

export function hashLeaseToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
