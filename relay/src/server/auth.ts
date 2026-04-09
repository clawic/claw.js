import { createSecretKey } from "node:crypto";

import { SignJWT, jwtVerify } from "jose";

import type { AuthClaims, TokenPair } from "../shared/protocol.ts";
import type { RelayConfig } from "./config.ts";
import type { RelayDatabase } from "./db.ts";
import { generateJwtId } from "./security.ts";

export class RelayAuthService {
  private readonly secrets: Uint8Array[];

  constructor(
    private readonly config: RelayConfig,
    private readonly db: RelayDatabase,
  ) {
    this.secrets = config.jwtSecrets.map((secret) => createSecretKey(Buffer.from(secret)).export() as Uint8Array);
  }

  async issueTokenPair(input: {
    userId: string;
    email: string;
    role: "admin" | "user";
    tenantId: string;
    scopes: string[];
    agentId?: string;
    workspaceId?: string;
    deviceId?: string;
  }): Promise<TokenPair> {
    const claims: AuthClaims = {
      sub: input.userId,
      email: input.email,
      role: input.role,
      tenantId: input.tenantId,
      scopes: input.scopes,
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.deviceId ? { deviceId: input.deviceId } : {}),
    };

    const accessToken = await new SignJWT(claims as unknown as Record<string, unknown>)
      .setProtectedHeader({ alg: "HS256", kid: "0" })
      .setIssuer(this.config.jwtIssuer)
      .setAudience(this.config.jwtAudience)
      .setJti(generateJwtId())
      .setIssuedAt()
      .setExpirationTime(`${this.config.accessTokenTtlSec}s`)
      .sign(this.secrets[0]!);

    const refreshToken = this.db.createRefreshToken({
      userId: input.userId,
      tenantId: input.tenantId,
      scopes: input.scopes,
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.deviceId ? { deviceId: input.deviceId } : {}),
      ttlSec: this.config.refreshTokenTtlSec,
    });

    return {
      accessToken,
      refreshToken,
      expiresInSec: this.config.accessTokenTtlSec,
    };
  }

  async verifyAccessToken(token: string): Promise<AuthClaims> {
    for (const secret of this.secrets) {
      try {
        const verified = await jwtVerify(token, secret, {
          issuer: this.config.jwtIssuer,
          audience: this.config.jwtAudience,
        });
        return verified.payload as unknown as AuthClaims;
      } catch {
        continue;
      }
    }
    throw new Error("Invalid bearer token.");
  }
}
