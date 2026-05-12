// Generic JWT bearer refresh strategy. Models the PocketBase pattern but
// works for any API where:
//   - You authenticate with identity/password (or apiKey) and get a JWT.
//   - The JWT has an expiry; you refresh by re-authenticating.
//   - 401 responses signal an expired/rotated session and require retry.
//
// Configurable via the secret's `auth_url`/`identity_field`/`password_field`/
// `token_path` resolved fields, falling back to PocketBase defaults.

import type { SessionStrategy, SessionToken } from "../../types.ts";

interface JwtPayload {
  exp?: number; // seconds since epoch
}

function decodeJwtExp(jwt: string): number | undefined {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return undefined;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as JwtPayload;
    return payload.exp;
  } catch {
    return undefined;
  }
}

export const jwtBearerRefreshStrategy: SessionStrategy = {
  id: "jwt.bearer.refresh",
  label: "JWT bearer with auto-refresh",
  cacheKey(secret) {
    return `jwt.bearer:${secret.id}`;
  },
  isExpired(token, nowMs = Date.now()) {
    const expiresMs = new Date(token.expiresAt).getTime();
    if (Number.isNaN(expiresMs)) return true;
    // Treat as expired if <60s remain.
    return expiresMs - nowMs < 60_000;
  },
  retryOn401: true,
  async refresh(ctx) {
    const fields = ctx.resolvedFields;
    const baseUrl = fields["base_url"];
    const authCollection = fields["auth_collection"] ?? "_superusers";
    const identity = fields["identity"];
    const password = fields["password"];
    if (!baseUrl) throw new Error("base_url field required");
    if (!identity || !password) throw new Error("identity/password fields required");

    const url = `${baseUrl.replace(/\/$/, "")}/api/collections/${encodeURIComponent(authCollection)}/auth-with-password`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity, password }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`auth failed (${res.status}): ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as { token?: string };
    if (!data.token) throw new Error("auth response missing token field");

    const exp = decodeJwtExp(data.token);
    const expiresAt = exp ? new Date(exp * 1000).toISOString() : new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const token: SessionToken = { token: data.token, expiresAt };
    return token;
  },
};
