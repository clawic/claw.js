// Bluesky adapter. App-password flow over the public AT Protocol XRPC API.
// The framework holds only the vault ref; this adapter mints a fresh
// session JWT per publish call from the stored app password.

import type { AdapterContext, AdapterModule, AdapterVariant, ChannelAccountState } from "./contract.ts";
import { FAMILIES } from "./families.ts";

const family = FAMILIES.find((f) => f.id === "bluesky")!;
const DEFAULT_PDS = "https://bsky.social";

interface SessionResponse {
  accessJwt: string;
  refreshJwt: string;
  did: string;
  handle: string;
}

async function createSession(ctx: AdapterContext, identifier: string, password: string, pds: string): Promise<SessionResponse> {
  const res = await ctx.fetch(`${pds}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`bluesky createSession failed (${res.status}): ${body}`);
  }
  return (await res.json()) as SessionResponse;
}

interface StoredCredentials {
  identifier: string;
  password: string;
  pds?: string;
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

export const blueskyModule: AdapterModule = {
  family,
  adapter: {
    async connectStatic(ctx, params) {
      const identifier = String(params.identifier ?? "");
      const password = String(params.password ?? "");
      const pds = String(params.pds ?? DEFAULT_PDS);
      if (!identifier || !password) throw new Error("identifier and password are required");
      const session = await createSession(ctx, identifier, password, pds);
      const ref = await ctx.vault.put(undefined, JSON.stringify({ identifier, password, pds }));
      return {
        providerAccountId: session.did,
        displayName: session.handle,
        handle: session.handle,
        credentialsVaultRef: ref,
        metadata: { pds },
      };
    },
    async refreshToken(ctx, account) {
      const creds = await loadCredentials(ctx, account);
      if (!creds) throw new Error("missing bluesky credentials");
      // app-password creates a fresh session each time; nothing persistent to refresh.
      await createSession(ctx, creds.identifier, creds.password, creds.pds ?? DEFAULT_PDS);
      return { credentialsVaultRef: account.credentialsVaultRef ?? "" };
    },
    async probeHealth(ctx, account) {
      const creds = await loadCredentials(ctx, account);
      if (!creds) return { status: "unauthorized" };
      try {
        await createSession(ctx, creds.identifier, creds.password, creds.pds ?? DEFAULT_PDS);
        return { status: "ok" };
      } catch (err) {
        return { status: "unauthorized", details: { message: (err as Error).message } };
      }
    },
    async inspectCapabilities() {
      return family.capabilities;
    },
    async validate(_ctx, _account, variant: AdapterVariant) {
      const issues: Array<{ code: string; message: string; blocking: boolean; blockIndex?: number }> = [];
      variant.blocks.forEach((block, idx) => {
        if (block.body.length > 300) {
          issues.push({ code: "text_too_long", message: "Bluesky post limit is 300 chars", blocking: true, blockIndex: idx });
        }
      });
      return { ok: issues.every((i) => !i.blocking), issues };
    },
    async requiredConversions() {
      return [];
    },
    async publish(ctx, account, variant) {
      const creds = await loadCredentials(ctx, account);
      if (!creds) return { ok: false, errorCode: "unauthorized", unauthorized: true };
      let session: SessionResponse;
      try {
        session = await createSession(ctx, creds.identifier, creds.password, creds.pds ?? DEFAULT_PDS);
      } catch (err) {
        return { ok: false, errorCode: "unauthorized", unauthorized: true, errorMessage: (err as Error).message };
      }
      const pds = creds.pds ?? DEFAULT_PDS;
      const block = variant.blocks[0];
      const record: Record<string, unknown> = {
        $type: "app.bsky.feed.post",
        text: block.body,
        createdAt: new Date().toISOString(),
      };
      const res = await ctx.fetch(`${pds}/xrpc/com.atproto.repo.createRecord`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.accessJwt}`,
        },
        body: JSON.stringify({ repo: session.did, collection: "app.bsky.feed.post", record }),
      });
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after") ?? "30");
        return { ok: false, errorCode: "rate_limited", retryAfterSeconds: retryAfter };
      }
      if (!res.ok) {
        return { ok: false, errorCode: "publish_failed", errorMessage: await res.text() };
      }
      const out = (await res.json()) as { uri: string; cid: string };
      return {
        ok: true,
        providerPostId: out.uri,
        providerData: { cid: out.cid, did: session.did, handle: session.handle },
      };
    },
    async delete(ctx, account, providerPostId) {
      const creds = await loadCredentials(ctx, account);
      if (!creds) return;
      const session = await createSession(ctx, creds.identifier, creds.password, creds.pds ?? DEFAULT_PDS);
      const pds = creds.pds ?? DEFAULT_PDS;
      const rkey = providerPostId.split("/").pop();
      await ctx.fetch(`${pds}/xrpc/com.atproto.repo.deleteRecord`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${session.accessJwt}` },
        body: JSON.stringify({ repo: session.did, collection: "app.bsky.feed.post", rkey }),
      });
    },
  },
};
