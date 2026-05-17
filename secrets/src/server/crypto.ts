// Cripto Clawix-grade en TypeScript.
//
// Replica el modelo del Secrets Swift de Clawix:
//   - Argon2id para derivar la masterKey desde la passphrase del usuario.
//   - ChaCha20-Poly1305 para AEAD (cifrado autenticado con AAD).
//   - Per-item key wrap: cada secret tiene su propia key de 32 bytes,
//     cifrada con la masterKey (rotar password no re-cifra datos).
//   - Recovery phrase BIP39 (24 palabras) cuya seed Argon2id deriva una
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

const CRYPTO_VERSION = 1;
const FORMAT_VERSION = 1;
export const SECRETS_SCHEMA_VERSION = 3;
export const KEY_LENGTH = 32;
const NONCE_LENGTH = 12;
const SALT_LENGTH = 32;

// ---------- Random helpers ----------

function randomBytes(length: number): Uint8Array {
  return new Uint8Array(nodeRandomBytes(length).buffer, 0, length);
}

export function generateKey(): Uint8Array {
  return randomBytes(KEY_LENGTH);
}

function generateNonce(): Uint8Array {
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

// ---------- Secret Key ----------
//
// The user unlock factor is password + Secret Key. The Secret Key is a
// generated 256-bit value formatted for the Emergency Kit. Only a fingerprint
// is persisted; the raw Secret Key must stay with the user / host Keychain.

const SECRET_KEY_PREFIX = "CSK1";
const SECRET_KEY_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const SECRET_KEY_BODY_BYTES = KEY_LENGTH;
const SECRET_KEY_BODY_LENGTH = 52;
const SECRET_KEY_CHECKSUM_LENGTH = 8;
const SECRET_KEY_KDF_LABEL = TEXT.encode("clawjs-secrets.unlock.v1\0");

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += SECRET_KEY_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += SECRET_KEY_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(input: string): Uint8Array {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of input) {
    const idx = SECRET_KEY_ALPHABET.indexOf(char);
    if (idx < 0) throw new Error("Invalid Secret Key character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

function formatSecretKeyBody(body: string, checksum: string): string {
  return [SECRET_KEY_PREFIX, ...`${body}${checksum}`.match(/.{1,4}/g)!].join("-");
}

function secretKeyChecksum(body: string): string {
  return base32Encode(sha256(TEXT.encode(`${SECRET_KEY_PREFIX}:${body}`)).subarray(0, 5)).slice(0, SECRET_KEY_CHECKSUM_LENGTH);
}

function generateSecretKey(): string {
  const raw = generateKey();
  try {
    const body = base32Encode(raw);
    return formatSecretKeyBody(body, secretKeyChecksum(body));
  } finally {
    raw.fill(0);
  }
}

function decodeSecretKey(secretKey: string): Uint8Array {
  const compact = secretKey.trim().toUpperCase().replace(/[\s-]+/g, "");
  if (!compact.startsWith(SECRET_KEY_PREFIX)) throw new Error("Secret Key prefix invalid");
  const payload = compact.slice(SECRET_KEY_PREFIX.length);
  const body = payload.slice(0, SECRET_KEY_BODY_LENGTH);
  const checksum = payload.slice(SECRET_KEY_BODY_LENGTH);
  if (body.length !== SECRET_KEY_BODY_LENGTH || checksum.length !== SECRET_KEY_CHECKSUM_LENGTH) {
    throw new Error("Secret Key length invalid");
  }
  if (checksum !== secretKeyChecksum(body)) throw new Error("Secret Key checksum invalid");
  const raw = base32Decode(body);
  if (raw.length !== SECRET_KEY_BODY_BYTES) throw new Error("Secret Key payload invalid");
  return raw;
}

export function normalizeSecretKey(secretKey: string): string {
  const raw = decodeSecretKey(secretKey);
  try {
    const body = base32Encode(raw);
    return formatSecretKeyBody(body, secretKeyChecksum(body));
  } finally {
    raw.fill(0);
  }
}

function secretKeyFingerprint(secretKey: string): string {
  const raw = decodeSecretKey(secretKey);
  try {
    return `${SECRET_KEY_PREFIX}:${base32Encode(sha256(raw).subarray(0, 5)).slice(0, SECRET_KEY_CHECKSUM_LENGTH)}`;
  } finally {
    raw.fill(0);
  }
}

function deriveUnlockKey(password: string, secretKey: string, salt: Uint8Array, params: Argon2Params): Uint8Array {
  if (!password) throw new Error("Password required");
  if (!secretKey) throw new Error("Secret Key required");
  const passwordBytes = TEXT.encode(password);
  const secretKeyBytes = decodeSecretKey(secretKey);
  const input = new Uint8Array(SECRET_KEY_KDF_LABEL.length + passwordBytes.length + 1 + secretKeyBytes.length);
  input.set(SECRET_KEY_KDF_LABEL, 0);
  input.set(passwordBytes, SECRET_KEY_KDF_LABEL.length);
  input[SECRET_KEY_KDF_LABEL.length + passwordBytes.length] = 0;
  input.set(secretKeyBytes, SECRET_KEY_KDF_LABEL.length + passwordBytes.length + 1);
  try {
    return argon2id(input, salt, { t: params.t, m: params.m, p: params.p, dkLen: KEY_LENGTH });
  } finally {
    input.fill(0);
    secretKeyBytes.fill(0);
  }
}

// ---------- Verifier (proves we have the masterKey) ----------
//
// Stored alongside the meta. On unlock, we re-derive the masterKey from
// (password, salt, params) and recompute HMAC-SHA256(masterKey, "verifier")
// to check it matches in constant time. No password ever stored.

const VERIFIER_LABEL = TEXT.encode("clawjs-secrets.verifier.v1");

function computeVerifier(masterKey: Uint8Array): Uint8Array {
  return hmac(sha256, masterKey, VERIFIER_LABEL);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// ---------- Recovery phrase (BIP39) ----------
//
// We use BIP39 only for the human-readable mnemonic (entropy + checksum,
// 24 words = 256 bits). The actual recovery key is derived with Argon2id
// from the mnemonic + recoverySalt, NOT the standard BIP39 seed (which is
// PBKDF2-HMAC-SHA512 with 2048 iterations, much weaker than Argon2id).

function generateMnemonic(): string {
  return bip39.generateMnemonic(256); // 24 words
}

function validateMnemonic(phrase: string): boolean {
  return bip39.validateMnemonic(phrase.trim());
}

function deriveRecoveryKey(mnemonic: string, salt: Uint8Array, params: Argon2Params): Uint8Array {
  const normalized = mnemonic.trim().toLowerCase().split(/\s+/).join(" ");
  return deriveKey(normalized, salt, params);
}

// ---------- Secrets meta (lifecycle) ----------

export interface SecretsMetaSnapshot {
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
  secretKeyRequired: true;
  secretKeyVersion: 1;
  secretKeyFingerprint: string;
  // Recovery phrase derivation
  recoverySalt: Uint8Array;
  recoveryParams: Argon2Params;
  recoveryWrap: Uint8Array; // AEAD-sealed masterKey with recoveryKey
  // Audit chain key (separate from masterKey, invariant to password change)
  auditMacKeyWrap: Uint8Array; // AEAD-sealed auditMacKey with masterKey
  auditChainGenesis: Uint8Array; // 32 bytes random
  platformKeyWrap?: Uint8Array; // Optional AEAD-sealed masterKey with host-provided local KEK.
}

export interface SecretsSetupOptions {
  schemaVersion: number;
  appVersion: string;
  kdfParams: Argon2Params;
  recoveryParams?: Argon2Params;
  deviceId?: string;
  platformKey?: Uint8Array;
}

export interface SecretsSetupResult {
  meta: SecretsMetaSnapshot;
  masterKey: LockableSecret;
  auditMacKey: LockableSecret;
  recoveryPhrase: string;
  secretKey: string;
}

export interface SecretsUnlockResult {
  masterKey: LockableSecret;
  auditMacKey: LockableSecret;
}

function assertPlatformKey(platformKey: Uint8Array): void {
  if (platformKey.length !== KEY_LENGTH) throw new Error(`Platform KEK must be ${KEY_LENGTH} bytes`);
}

function wrapMasterKeyWithPlatformKey(masterKey: Uint8Array, platformKey: Uint8Array): Uint8Array {
  assertPlatformKey(platformKey);
  return aeadSeal(platformKey, masterKey, "secrets.master-key|platform-kek");
}

function verifyPlatformKeyWrap(meta: SecretsMetaSnapshot, masterKey: Uint8Array, platformKey?: Uint8Array): void {
  if (!meta.platformKeyWrap) return;
  if (!platformKey) throw new Error("Platform key required");
  assertPlatformKey(platformKey);
  const platformMasterKey = aeadOpen(platformKey, meta.platformKeyWrap, "secrets.master-key|platform-kek");
  try {
    if (!constantTimeEqual(platformMasterKey, masterKey)) {
      throw new Error("Platform key verifier mismatch");
    }
  } finally {
    platformMasterKey.fill(0);
  }
}

export function withPlatformKeyWrap(
  meta: SecretsMetaSnapshot,
  masterKey: LockableSecret,
  platformKey?: Uint8Array,
): SecretsMetaSnapshot {
  if (!platformKey) return meta;
  assertPlatformKey(platformKey);
  const platformKeyWrap = masterKey.withBytes((masterKeyBytes) => wrapMasterKeyWithPlatformKey(masterKeyBytes, platformKey));
  return { ...meta, platformKeyWrap };
}

export function secretsSetup(masterPassword: string, opts: SecretsSetupOptions): SecretsSetupResult {
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
  const secretKey = generateSecretKey();
  const deviceId = opts.deviceId ?? randomUUID();
  const auditChainGenesis = generateKey();

  // Derive password key, but we wrap masterKey via re-derivation, not via wrap
  // (mirrors Clawix: kdfDerivedKey is the masterKey itself, derived from
  //  password+salt+params; verifier proves we got the right one).
  // To allow rotating password without re-encrypting items, the masterKey
  // we expose is RANDOM, and the password derivation key wraps it.
  const passwordKey = deriveUnlockKey(masterPassword, secretKey, kdfSalt, kdfParams);
  const recoveryKey = deriveRecoveryKey(recoveryPhrase, recoverySalt, recoveryParams);

  const _passwordWrap = aeadSeal(passwordKey, masterKeyBytes, "secrets.master-key|password");
  // Verifier is HMAC of masterKey itself; recompute on unlock and compare.
  const verifier = computeVerifier(masterKeyBytes);
  const recoveryWrap = aeadSeal(recoveryKey, masterKeyBytes, "secrets.master-key|recovery");
  const auditMacKeyWrap = aeadSeal(masterKeyBytes, auditMacKeyBytes, "secrets.audit-mac-key");
  const platformKeyWrap = opts.platformKey ? wrapMasterKeyWithPlatformKey(masterKeyBytes, opts.platformKey) : undefined;

  // Zero out derived keys we no longer need.
  passwordKey.fill(0);
  recoveryKey.fill(0);

  const meta: SecretsMetaSnapshot = {
    formatVersion: FORMAT_VERSION,
    cryptoVersion: CRYPTO_VERSION,
    schemaVersion: opts.schemaVersion,
    appVersionAtSetup: opts.appVersion,
    deviceId,
    createdAt: new Date().toISOString(),
    kdfSalt,
    kdfParams,
    verifier,
    secretKeyRequired: true,
    secretKeyVersion: 1,
    secretKeyFingerprint: secretKeyFingerprint(secretKey),
    recoverySalt,
    recoveryParams,
    recoveryWrap: combineWrap(_passwordWrap, recoveryWrap),
    auditMacKeyWrap,
    auditChainGenesis,
    ...(platformKeyWrap ? { platformKeyWrap } : {}),
  };

  const masterKey = LockableSecret.fromBytes(masterKeyBytes);
  const auditMacKey = LockableSecret.fromBytes(auditMacKeyBytes);
  masterKeyBytes.fill(0);
  auditMacKeyBytes.fill(0);

  return { meta, masterKey, auditMacKey, recoveryPhrase, secretKey };
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

export function secretsUnlock(
  meta: SecretsMetaSnapshot,
  password: string,
  secretKey: string,
  platformKey?: Uint8Array,
): SecretsUnlockResult {
  if (meta.secretKeyRequired !== true || meta.secretKeyVersion !== 1) {
    throw new Error("Unsupported Secrets meta: Secret Key required");
  }
  if (secretKeyFingerprint(secretKey) !== meta.secretKeyFingerprint) {
    throw new Error("Secret Key mismatch");
  }
  const passwordKey = deriveUnlockKey(password, secretKey, meta.kdfSalt, meta.kdfParams);
  const { passwordWrap } = splitWrap(meta.recoveryWrap);
  let masterKeyBytes: Uint8Array;
  try {
    masterKeyBytes = aeadOpen(passwordKey, passwordWrap, "secrets.master-key|password");
  } finally {
    passwordKey.fill(0);
  }

  const verifier = computeVerifier(masterKeyBytes);
  if (!constantTimeEqual(verifier, meta.verifier)) {
    masterKeyBytes.fill(0);
    throw new Error("Secrets verifier mismatch");
  }
  verifyPlatformKeyWrap(meta, masterKeyBytes, platformKey);

  const auditMacKeyBytes = aeadOpen(masterKeyBytes, meta.auditMacKeyWrap, "secrets.audit-mac-key");
  const masterKey = LockableSecret.fromBytes(masterKeyBytes);
  const auditMacKey = LockableSecret.fromBytes(auditMacKeyBytes);
  masterKeyBytes.fill(0);
  auditMacKeyBytes.fill(0);

  return { masterKey, auditMacKey };
}

export function secretsUnlockWithPlatformKey(meta: SecretsMetaSnapshot, platformKey: Uint8Array): SecretsUnlockResult {
  if (!meta.platformKeyWrap) throw new Error("Local platform unlock is not enrolled");
  assertPlatformKey(platformKey);
  const masterKeyBytes = aeadOpen(platformKey, meta.platformKeyWrap, "secrets.master-key|platform-kek");
  const verifier = computeVerifier(masterKeyBytes);
  if (!constantTimeEqual(verifier, meta.verifier)) {
    masterKeyBytes.fill(0);
    throw new Error("Secrets verifier mismatch");
  }

  const auditMacKeyBytes = aeadOpen(masterKeyBytes, meta.auditMacKeyWrap, "secrets.audit-mac-key");
  const masterKey = LockableSecret.fromBytes(masterKeyBytes);
  const auditMacKey = LockableSecret.fromBytes(auditMacKeyBytes);
  masterKeyBytes.fill(0);
  auditMacKeyBytes.fill(0);

  return { masterKey, auditMacKey };
}

export function secretsRecover(meta: SecretsMetaSnapshot, recoveryPhrase: string): SecretsUnlockResult {
  if (!validateMnemonic(recoveryPhrase)) {
    throw new Error("Invalid BIP39 recovery phrase");
  }
  const recoveryKey = deriveRecoveryKey(recoveryPhrase, meta.recoverySalt, meta.recoveryParams);
  const { recoveryWrap } = splitWrap(meta.recoveryWrap);
  let masterKeyBytes: Uint8Array;
  try {
    masterKeyBytes = aeadOpen(recoveryKey, recoveryWrap, "secrets.master-key|recovery");
  } finally {
    recoveryKey.fill(0);
  }

  const verifier = computeVerifier(masterKeyBytes);
  if (!constantTimeEqual(verifier, meta.verifier)) {
    masterKeyBytes.fill(0);
    throw new Error("Recovery phrase did not yield the right master key");
  }

  const auditMacKeyBytes = aeadOpen(masterKeyBytes, meta.auditMacKeyWrap, "secrets.audit-mac-key");
  const masterKey = LockableSecret.fromBytes(masterKeyBytes);
  const auditMacKey = LockableSecret.fromBytes(auditMacKeyBytes);
  masterKeyBytes.fill(0);
  auditMacKeyBytes.fill(0);

  return { masterKey, auditMacKey };
}

export interface SecretsChangePasswordResult {
  newMeta: SecretsMetaSnapshot;
  newRecoveryPhrase: string;
  newSecretKey: string;
}

function rewrapUnlockedVault(
  meta: SecretsMetaSnapshot,
  masterKey: LockableSecret,
  auditMacKey: LockableSecret,
  newPassword: string,
  platformKey?: Uint8Array,
  newKdfParams?: Argon2Params,
  newRecoveryParams?: Argon2Params,
): SecretsChangePasswordResult {
  const kdfParams = newKdfParams ?? meta.kdfParams;
  const recoveryParams = newRecoveryParams ?? meta.recoveryParams;
  const newKdfSalt = generateSalt();
  const newRecoverySalt = generateSalt();
  const newRecoveryPhrase = generateMnemonic();
  const newSecretKey = generateSecretKey();

  const passwordKey = deriveUnlockKey(newPassword, newSecretKey, newKdfSalt, kdfParams);
  const recoveryKey = deriveRecoveryKey(newRecoveryPhrase, newRecoverySalt, recoveryParams);

  let masterKeyBytes!: Uint8Array;
  let auditMacKeyBytes!: Uint8Array;
  masterKey.withBytes((b) => {
    masterKeyBytes = new Uint8Array(b);
  });
  auditMacKey.withBytes((b) => {
    auditMacKeyBytes = new Uint8Array(b);
  });

  try {
    const passwordWrap = aeadSeal(passwordKey, masterKeyBytes, "secrets.master-key|password");
    const recoveryWrap = aeadSeal(recoveryKey, masterKeyBytes, "secrets.master-key|recovery");
    const auditMacKeyWrap = aeadSeal(masterKeyBytes, auditMacKeyBytes, "secrets.audit-mac-key");
    const platformKeyWrap = platformKey ? wrapMasterKeyWithPlatformKey(masterKeyBytes, platformKey) : meta.platformKeyWrap;

    const newMeta: SecretsMetaSnapshot = {
      ...meta,
      schemaVersion: Math.max(meta.schemaVersion, SECRETS_SCHEMA_VERSION),
      kdfSalt: newKdfSalt,
      kdfParams,
      verifier: meta.verifier,
      secretKeyRequired: true,
      secretKeyVersion: 1,
      secretKeyFingerprint: secretKeyFingerprint(newSecretKey),
      recoverySalt: newRecoverySalt,
      recoveryParams,
      recoveryWrap: combineWrap(passwordWrap, recoveryWrap),
      auditMacKeyWrap,
      ...(platformKeyWrap ? { platformKeyWrap } : {}),
    };

    return { newMeta, newRecoveryPhrase, newSecretKey };
  } finally {
    passwordKey.fill(0);
    recoveryKey.fill(0);
    masterKeyBytes.fill(0);
    auditMacKeyBytes.fill(0);
  }
}

export function secretsChangePassword(
  meta: SecretsMetaSnapshot,
  oldPassword: string,
  oldSecretKey: string,
  newPassword: string,
  platformKey?: Uint8Array,
  newKdfParams?: Argon2Params,
  newRecoveryParams?: Argon2Params,
): SecretsChangePasswordResult {
  const { masterKey, auditMacKey } = secretsUnlock(meta, oldPassword, oldSecretKey, platformKey);
  try {
    return rewrapUnlockedVault(meta, masterKey, auditMacKey, newPassword, platformKey, newKdfParams, newRecoveryParams);
  } finally {
    masterKey.zero();
    auditMacKey.zero();
  }
}

export function secretsRecoverAndRotate(
  meta: SecretsMetaSnapshot,
  recoveryPhrase: string,
  newPassword: string,
  platformKey?: Uint8Array,
  newKdfParams?: Argon2Params,
  newRecoveryParams?: Argon2Params,
): SecretsChangePasswordResult & SecretsUnlockResult {
  const { masterKey, auditMacKey } = secretsRecover(meta, recoveryPhrase);
  try {
    const rotated = rewrapUnlockedVault(meta, masterKey, auditMacKey, newPassword, platformKey, newKdfParams, newRecoveryParams);
    const unlocked = secretsUnlock(rotated.newMeta, newPassword, rotated.newSecretKey, platformKey);
    return { ...rotated, ...unlocked };
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

function maskFingerprint(secretValue: string): string {
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

function isAgentToken(token: string): boolean {
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
