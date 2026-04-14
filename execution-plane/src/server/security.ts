import { createHash, randomUUID } from "node:crypto";

import argon2, { argon2id } from "argon2";

export interface PasswordVerificationResult {
  valid: boolean;
  upgradedHash?: string;
}

export function hashLegacySecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  return await argon2.hash(password, {
    type: argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 4,
  });
}

export async function verifyPasswordHash(passwordHash: string, password: string): Promise<PasswordVerificationResult> {
  if (passwordHash.startsWith("$argon2id$")) {
    return { valid: await argon2.verify(passwordHash, password) };
  }
  const valid = passwordHash === hashLegacySecret(password);
  if (!valid) return { valid: false };
  return {
    valid: true,
    upgradedHash: await hashPassword(password),
  };
}

export function generateJwtId(): string {
  return randomUUID();
}
