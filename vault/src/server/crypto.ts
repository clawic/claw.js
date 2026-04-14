import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";

export interface CipherEnvelope {
  iv: string;
  ciphertext: string;
  tag: string;
}

export interface WrappedSecretVersion {
  id: string;
  version: number;
  wrappedDek: CipherEnvelope;
  encryptedValue: CipherEnvelope;
  maskedFingerprint: string;
  createdAt: string;
}

function encode(value: Buffer): string {
  return value.toString("base64");
}

function decode(value: string): Buffer {
  return Buffer.from(value, "base64");
}

function aesGcmEncrypt(key: Buffer, plaintext: Buffer): CipherEnvelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: encode(iv),
    ciphertext: encode(ciphertext),
    tag: encode(tag),
  };
}

function aesGcmDecrypt(key: Buffer, envelope: CipherEnvelope): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", key, decode(envelope.iv));
  decipher.setAuthTag(decode(envelope.tag));
  return Buffer.concat([decipher.update(decode(envelope.ciphertext)), decipher.final()]);
}

export function resolveKek(base64?: string): Buffer {
  if (base64?.trim()) {
    const key = decode(base64.trim());
    if (key.length !== 32) throw new Error("VAULT_KEK_BASE64 must decode to 32 bytes");
    return key;
  }
  return createHash("sha256").update("clawjs-vault-dev-kek").digest();
}

export function createWrappedSecretVersion(secretValue: string, version: number, kek: Buffer): WrappedSecretVersion {
  const dek = randomBytes(32);
  const createdAt = new Date().toISOString();
  return {
    id: randomUUID(),
    version,
    wrappedDek: aesGcmEncrypt(kek, dek),
    encryptedValue: aesGcmEncrypt(dek, Buffer.from(secretValue, "utf8")),
    maskedFingerprint: maskFingerprint(secretValue),
    createdAt,
  };
}

export function unwrapSecretValue(version: Pick<WrappedSecretVersion, "wrappedDek" | "encryptedValue">, kek: Buffer): string {
  const dek = aesGcmDecrypt(kek, version.wrappedDek);
  return aesGcmDecrypt(dek, version.encryptedValue).toString("utf8");
}

export function maskFingerprint(secretValue: string): string {
  const digest = createHash("sha256").update(secretValue).digest("hex");
  return `sha256:${digest.slice(0, 8)}…${digest.slice(-6)}`;
}
