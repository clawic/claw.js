import { createHash, createSecretKey, randomBytes, timingSafeEqual } from "node:crypto";

import { SignJWT, jwtVerify } from "jose";

import type { DriveOperation } from "../shared/types.ts";

export interface AdminClaims {
  kind: "admin";
  sub: string;
  email: string;
}

export type AuthPrincipal =
  | { kind: "admin"; adminId: string; email: string }
  | { kind: "token"; tokenId: string; operations: DriveOperation[] }
  | { kind: "share"; shareId: string; itemId: string }
  | { kind: "agent"; agentShareId: string; itemId: string; agentName: string; capabilityKind: string };

export class DriveAuthService {
  private readonly secret: Uint8Array<ArrayBufferLike>;
  private readonly ephemeralAdminToken: Buffer | null;

  constructor(secretText: string, ephemeralAdminToken: string | null = null) {
    this.secret = createSecretKey(Buffer.from(secretText)).export();
    this.ephemeralAdminToken =
      ephemeralAdminToken && ephemeralAdminToken.length >= 32
        ? Buffer.from(ephemeralAdminToken, "utf8")
        : null;
  }

  /// Constant-time match against the per-session admin token loaded at boot.
  /// See `loadEphemeralAdminToken` for the resolution rules.
  verifyEphemeralAdminToken(token: string): AuthPrincipal | null {
    if (!this.ephemeralAdminToken) return null;
    const candidate = Buffer.from(token, "utf8");
    if (candidate.length !== this.ephemeralAdminToken.length) return null;
    if (!timingSafeEqual(candidate, this.ephemeralAdminToken)) return null;
    return { kind: "admin", adminId: "local", email: "clawix@local" };
  }

  async issueAdminToken(input: { adminId: string; email: string }): Promise<string> {
    return await new SignJWT({
      kind: "admin",
      email: input.email,
    } satisfies Omit<AdminClaims, "sub">)
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
      return {
        kind: "admin",
        adminId: payload.sub,
        email: payload.email,
      };
    } catch {
      return null;
    }
  }
}

export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function generateOpaqueToken(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
}

/// Loads the per-session admin token used by the bundling app to authenticate
/// against the loopback daemon. It may come from explicit host bootstrap or an
/// environment variable for standalone development, but never from disk.
export function loadEphemeralAdminToken(opts: {
  envVarName: string;
  token?: string | null;
}): string | null {
  if (opts.token && opts.token.length >= 32) return opts.token;
  const fromEnv = process.env[opts.envVarName];
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  return null;
}
