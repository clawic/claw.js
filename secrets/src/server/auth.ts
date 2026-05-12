import { createHash, randomUUID } from "node:crypto";

import { SignJWT, jwtVerify } from "jose";

import type { SecretsPrincipalType, SecretsUserRole } from "../shared/types.ts";

const encoder = new TextEncoder();

export interface SecretsClaims {
  kind: "user";
  sub: string;
  tenantId: string;
  role: SecretsUserRole;
  email: string;
}

export interface SecretsActor {
  actorType: SecretsUserRole | SecretsPrincipalType;
  actorId: string;
  tenantId: string;
  email?: string;
}

export function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function generateOpaqueToken(prefix: string): { id: string; token: string } {
  const id = randomUUID();
  const raw = randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
  return {
    id,
    token: `${prefix}_${id}.${raw}`,
  };
}

export class SecretsAuthService {
  constructor(private readonly jwtSecret: string) {}

  async issueUserToken(input: { userId: string; tenantId: string; role: SecretsUserRole; email: string }): Promise<string> {
    return await new SignJWT({
      kind: "user",
      role: input.role,
      email: input.email,
      tenantId: input.tenantId,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(input.userId)
      .setExpirationTime("2h")
      .sign(encoder.encode(this.jwtSecret));
  }

  async verifyUserToken(token: string): Promise<SecretsClaims | null> {
    try {
      const verified = await jwtVerify(token, encoder.encode(this.jwtSecret));
      const payload = verified.payload;
      if (payload.kind !== "user" || typeof payload.sub !== "string" || typeof payload.tenantId !== "string" || typeof payload.role !== "string") {
        return null;
      }
      if (payload.role !== "tenant_admin" && payload.role !== "tenant_operator") return null;
      return {
        kind: "user",
        sub: payload.sub,
        tenantId: payload.tenantId,
        role: payload.role,
        email: typeof payload.email === "string" ? payload.email : "",
      };
    } catch {
      return null;
    }
  }
}
