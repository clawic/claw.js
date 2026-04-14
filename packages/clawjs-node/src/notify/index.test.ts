import test from "node:test";
import assert from "node:assert/strict";

import { NotifyClient } from "./index.ts";
import { startNotifyServer } from "../../../../notify/tests/e2e/helpers.ts";

test("NotifyClient can send notifications and sync the client feed", async () => {
  const server = await startNotifyServer("notify-client");
  try {
    const login = await fetch(`${server.baseUrl}/v1/auth/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@notify.local", password: "notify-admin" }),
    });
    assert.equal(login.status, 200);
    const auth = await login.json() as { accessToken: string };

    const adminClient = new NotifyClient({
      baseUrl: server.baseUrl,
      token: auth.accessToken,
    });
    const source = await adminClient.createSourceApp({
      tenantId: "tenant-sdk",
      id: "sdk-source",
      displayName: "SDK Source",
    });
    await adminClient.createClientApp({
      tenantId: "tenant-sdk",
      id: "sdk-ios",
      displayName: "SDK iOS",
      platform: "ios",
      bundleId: "com.claw.sdk.ios",
    });
    const installation = await adminClient.registerInstallation({
      tenantId: "tenant-sdk",
      userId: "user-sdk",
      clientAppId: "sdk-ios",
      deviceName: "SDK Phone",
    });

    const sourceClient = new NotifyClient({
      baseUrl: server.baseUrl,
      token: source.token,
    });
    const installationClient = new NotifyClient({
      baseUrl: server.baseUrl,
      token: installation.token,
    });

    await installationClient.upsertSubscription({
      sourceAppId: source.record.id,
      agentId: "sdk-agent",
      minPriority: "normal",
    });

    const sent = await sourceClient.send({
      priority: "normal",
      audience: { useSubscriptions: true },
      context: {
        tenantId: "tenant-sdk",
        agentId: "sdk-agent",
        eventType: "sdk.alert",
      },
      delivery: {
        mode: "alert",
        title: "SDK alert",
      },
    });
    assert.equal(sent.created, true);
    assert.equal(sent.deliveries.length, 1);

    const feed = await installationClient.feed();
    assert.equal(feed.items.length, 1);
    assert.equal(feed.items[0]?.notification.id, sent.notification.id);
  } finally {
    await server.close();
  }
});
