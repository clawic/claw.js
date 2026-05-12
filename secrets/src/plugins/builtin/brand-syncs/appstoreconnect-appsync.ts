// App Store Connect app sync. Uses the JWT from the API key to call
// /v1/apps and stores the resulting list as synced resources.
//
// Building the JWT requires signing with the private key (ES256). We
// keep this dependency-light by computing the JWT inline using
// node:crypto since the server already imports it.

import { createSign, randomUUID } from "node:crypto";

import type { BrandSync, SyncedResource } from "../../types.ts";

function buildJwt(input: {
  keyId: string;
  issuerId: string;
  privateKeyPem: string;
}): string {
  const header = {
    alg: "ES256",
    kid: input.keyId,
    typ: "JWT",
  };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: input.issuerId,
    iat: now,
    exp: now + 60 * 20,
    aud: "appstoreconnect-v1",
  };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signingInput = `${headerB64}.${payloadB64}`;
  const sign = createSign("SHA256");
  sign.update(signingInput);
  sign.end();
  const sig = sign.sign({ key: input.privateKeyPem, dsaEncoding: "ieee-p1363" });
  const sigB64 = sig.toString("base64url");
  return `${signingInput}.${sigB64}`;
}

export const appStoreConnectAppSync: BrandSync = {
  id: "appstoreconnect.appsync",
  label: "App Store Connect app sync",
  autoSyncIntervalMinutes: 60 * 24,
  async sync(ctx): Promise<SyncedResource[]> {
    const fields = ctx.resolvedFields;
    const keyId = fields["key_id"];
    const issuerId = fields["issuer_id"];
    const privateKeyPem = fields["private_key_pem"];
    if (!keyId || !issuerId || !privateKeyPem) {
      throw new Error("key_id, issuer_id, private_key_pem fields required");
    }
    const jwt = buildJwt({ keyId, issuerId, privateKeyPem });
    const res = await fetch("https://api.appstoreconnect.apple.com/v1/apps?limit=200", {
      method: "GET",
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`appsync failed (${res.status}): ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      data?: { id: string; attributes?: { name?: string; bundleId?: string; sku?: string } }[];
    };
    const apps = data.data ?? [];
    return apps.map((a) => ({
      resourceType: "app",
      resourceId: a.id,
      metadata: {
        name: a.attributes?.name,
        bundleId: a.attributes?.bundleId,
        sku: a.attributes?.sku,
        syncId: randomUUID(),
      },
    }));
  },
};
