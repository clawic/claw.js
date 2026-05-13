import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import { RelayAuthService } from "./auth.ts";
import { RelayDatabase } from "./db.ts";
import { loadRelayConfig } from "./config.ts";

function createDb(): RelayDatabase {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-relay-auth-"));
  return new RelayDatabase(path.join(dir, "infra.sqlite"));
}

test("access tokens preserve device claims and support key rotation on verify", async () => {
  const db = createDb();
  try {
    const oldConfig = loadRelayConfig({
      jwtSecrets: ["old-secret"],
      jwtIssuer: "relay-test",
      jwtAudience: "relay-test-clients",
    });
    const rotatedConfig = loadRelayConfig({
      jwtSecrets: ["new-secret", "old-secret"],
      jwtIssuer: "relay-test",
      jwtAudience: "relay-test-clients",
    });
    const issuer = new RelayAuthService(oldConfig, db);
    const verifier = new RelayAuthService(rotatedConfig, db);

    const pair = await issuer.issueTokenPair({
      userId: "user-1",
      email: "user@example.com",
      role: "user",
      tenantId: "demo-tenant",
      scopes: ["workspace:read"],
      deviceId: "device-1",
    });
    const claims = await verifier.verifyAccessToken(pair.accessToken);

    assert.equal(claims.sub, "user-1");
    assert.equal(claims.deviceId, "device-1");
    assert.equal(claims.tenantId, "demo-tenant");
  } finally {
    db.close();
  }
});

test("access tokens expire according to config", async () => {
  const db = createDb();
  try {
    const config = loadRelayConfig({
      jwtSecrets: ["expire-secret"],
      jwtIssuer: "relay-test",
      jwtAudience: "relay-test-clients",
      accessTokenTtlSec: 1,
    });
    const auth = new RelayAuthService(config, db);
    const pair = await auth.issueTokenPair({
      userId: "user-1",
      email: "user@example.com",
      role: "user",
      tenantId: "demo-tenant",
      scopes: ["workspace:read"],
    });

    await new Promise((resolve) => setTimeout(resolve, 1_100));
    await assert.rejects(() => auth.verifyAccessToken(pair.accessToken));
  } finally {
    db.close();
  }
});
