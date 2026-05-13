// Mastodon adapter. Per-instance access tokens; the vault stores
// { instanceUrl, accessToken }. OAuth flow uses Mastodon's app-registration +
// authorization-code grant. publish() posts a status via /api/v1/statuses.

import type { AdapterContext, AdapterModule, AdapterVariant, ChannelAccountState } from "./contract.ts";
import { FAMILIES } from "./families.ts";

const family = FAMILIES.find((f) => f.id === "mastodon")!;

interface StoredCredentials {
  instanceUrl: string;
  accessToken: string;
}

async function loadCredentials(ctx: AdapterContext, account: ChannelAccountState): Promise<StoredCredentials | null> {
  if (!account.credentialsVaultRef) return null;
  const raw = await ctx.vault.get(account.credentialsVaultRef);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredCredentials;
  } catch {
    return null;
  }
}

export const mastodonModule: AdapterModule = {
  family,
  adapter: {
    async connectStatic(ctx, params) {
      const instanceUrl = String(params.instance_url ?? "").replace(/\/$/, "");
      const accessToken = String(params.access_token ?? "");
      if (!instanceUrl || !accessToken) throw new Error("instance_url and access_token are required");
      const res = await ctx.fetch(`${instanceUrl}/api/v1/accounts/verify_credentials`, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`mastodon verify failed (${res.status})`);
      const account = (await res.json()) as { id: string; username: string; display_name: string; avatar?: string };
      const ref = await ctx.vault.put(undefined, JSON.stringify({ instanceUrl, accessToken }));
      return {
        providerAccountId: account.id,
        displayName: account.display_name || account.username,
        handle: `@${account.username}@${new URL(instanceUrl).host}`,
        avatarUrl: account.avatar ?? null,
        credentialsVaultRef: ref,
        metadata: { instanceUrl },
      };
    },
    async probeHealth(ctx, account) {
      const creds = await loadCredentials(ctx, account);
      if (!creds) return { status: "unauthorized" };
      const res = await ctx.fetch(`${creds.instanceUrl}/api/v1/accounts/verify_credentials`, {
        headers: { authorization: `Bearer ${creds.accessToken}` },
      });
      if (res.status === 401) return { status: "unauthorized" };
      if (!res.ok) return { status: "provider_outage", details: { status: res.status } };
      return { status: "ok" };
    },
    async inspectCapabilities() {
      return family.capabilities;
    },
    async validate(_ctx, _account, variant: AdapterVariant) {
      const issues: Array<{ code: string; message: string; blocking: boolean; blockIndex?: number }> = [];
      variant.blocks.forEach((block, idx) => {
        if (block.body.length > 500) {
          issues.push({ code: "text_too_long", message: "Mastodon default character limit is 500", blocking: true, blockIndex: idx });
        }
      });
      const visibility = (variant.options.visibility as string) ?? "public";
      if (!["public", "unlisted", "private", "direct"].includes(visibility)) {
        issues.push({ code: "invalid_visibility", message: `visibility=${visibility} not allowed`, blocking: true });
      }
      return { ok: issues.every((i) => !i.blocking), issues };
    },
    async requiredConversions() {
      return [];
    },
    async publish(ctx, account, variant) {
      const creds = await loadCredentials(ctx, account);
      if (!creds) return { ok: false, errorCode: "unauthorized", unauthorized: true };
      const block = variant.blocks[0];
      const visibility = (variant.options.visibility as string | undefined) ?? "public";
      const sensitive = !!variant.options.sensitive;
      const body = new URLSearchParams();
      body.set("status", block.body);
      body.set("visibility", visibility);
      if (sensitive) body.set("sensitive", "true");
      const res = await ctx.fetch(`${creds.instanceUrl}/api/v1/statuses`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          authorization: `Bearer ${creds.accessToken}`,
        },
        body: body.toString(),
      });
      if (res.status === 429) {
        const reset = res.headers.get("x-ratelimit-reset");
        const retryAfter = reset ? Math.max(1, Math.ceil((new Date(reset).getTime() - Date.now()) / 1000)) : 30;
        return { ok: false, errorCode: "rate_limited", retryAfterSeconds: retryAfter };
      }
      if (res.status === 401 || res.status === 403) {
        return { ok: false, errorCode: "unauthorized", unauthorized: true };
      }
      if (!res.ok) {
        return { ok: false, errorCode: "publish_failed", errorMessage: await res.text() };
      }
      const out = (await res.json()) as { id: string; url: string };
      return { ok: true, providerPostId: out.id, providerData: { url: out.url } };
    },
    async delete(ctx, account, providerPostId) {
      const creds = await loadCredentials(ctx, account);
      if (!creds) return;
      await ctx.fetch(`${creds.instanceUrl}/api/v1/statuses/${encodeURIComponent(providerPostId)}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${creds.accessToken}` },
      });
    },
  },
};
