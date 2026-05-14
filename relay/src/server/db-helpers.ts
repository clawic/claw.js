import { createHash } from "node:crypto";

export interface MembershipRow {
  user_id: string;
  tenant_id: string;
  scopes_json: string;
}

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: "admin" | "user";
}

export interface TableColumnRow {
  name: string;
}

export const SEEDED_PASSWORD_HASHES = {
  admin: "$argon2id$v=19$m=65536,t=3,p=4$YTbT6cgvfjxPmilhTzj9Ug$zTKomDhj/v0KBLMQy42glrgABL2ptwhTCV8PCrNOB8U",
  user: "$argon2id$v=19$m=65536,t=3,p=4$iGARd9UUspBceQ3IohaTig$DqtKkxl29XpQxPqvz8g9ZY4MeQ6vadyBGpfcO1Uu/pY",
} as const;

export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function now(): number {
  return Date.now();
}

export function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

export function parseJsonObject<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
