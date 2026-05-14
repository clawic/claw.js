import { createSecretKey, timingSafeEqual } from "node:crypto";

import { SignJWT, jwtVerify } from "jose";

export interface AdminClaims {
  kind: "admin";
  sub: string;
  email: string;
}

export type AuthPrincipal =
  | { kind: "admin"; adminId: string; email: string }
  | { kind: "agent"; agentSessionId: string };

export class IndexAuthService {
  private readonly secret: Uint8Array<ArrayBufferLike>;
  private readonly ephemeralAdminToken: Buffer | null;

  constructor(secretText: string, ephemeralAdminToken: string | null = null) {
    this.secret = createSecretKey(Buffer.from(secretText)).export();
    this.ephemeralAdminToken =
      ephemeralAdminToken && ephemeralAdminToken.length >= 32
        ? Buffer.from(ephemeralAdminToken, "utf8")
        : null;
  }

  verifyEphemeralAdminToken(token: string): AuthPrincipal | null {
    if (!this.ephemeralAdminToken) return null;
    const candidate = Buffer.from(token, "utf8");
    if (candidate.length !== this.ephemeralAdminToken.length) return null;
    if (!timingSafeEqual(candidate, this.ephemeralAdminToken)) return null;
    return { kind: "admin", adminId: "local", email: "clawix@local" };
  }

  async issueAdminToken(input: { adminId: string; email: string }): Promise<string> {
    return await new SignJWT({ kind: "admin", email: input.email })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(input.adminId)
      .setIssuedAt()
      .setExpirationTime("12h")
      .sign(this.secret);
  }

  async verifyAdminToken(token: string): Promise<AuthPrincipal | null> {
    try {
      const verified = await jwtVerify(token, this.secret);
      const payload = verified.payload as Partial<AdminClaims> & { sub?: string };
      if (payload.kind !== "admin" || typeof payload.sub !== "string" || typeof payload.email !== "string") {
        return null;
      }
      return { kind: "admin", adminId: payload.sub, email: payload.email };
    } catch {
      return null;
    }
  }
}

export function loadEphemeralAdminToken(opts: { envVarName: string; token?: string | null }): string | null {
  if (opts.token && opts.token.length >= 32) return opts.token;
  const fromEnv = process.env[opts.envVarName];
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  return null;
}
