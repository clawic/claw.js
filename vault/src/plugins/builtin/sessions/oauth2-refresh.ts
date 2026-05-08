// OAuth 2.0 refresh_token strategy.

import type { SessionStrategy, SessionToken } from "../../types.ts";

export const oauth2RefreshStrategy: SessionStrategy = {
  id: "oauth2.refresh",
  label: "OAuth 2.0 refresh_token",
  cacheKey(secret) {
    return `oauth2:${secret.id}`;
  },
  isExpired(token, nowMs = Date.now()) {
    const expiresMs = new Date(token.expiresAt).getTime();
    if (Number.isNaN(expiresMs)) return true;
    return expiresMs - nowMs < 60_000;
  },
  retryOn401: true,
  async refresh(ctx) {
    const fields = ctx.resolvedFields;
    const tokenUrl = fields["token_url"];
    const clientId = fields["client_id"];
    const clientSecret = fields["client_secret"];
    const refreshToken = fields["refresh_token"];
    if (!tokenUrl || !clientId || !clientSecret || !refreshToken) {
      throw new Error("token_url, client_id, client_secret, refresh_token fields required");
    }
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!res.ok) throw new Error(`refresh failed (${res.status})`);
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) throw new Error("response missing access_token");
    const expiresIn = data.expires_in ?? 3600;
    const token: SessionToken = {
      token: data.access_token,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
    return token;
  },
};
