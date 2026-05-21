import { clawNotifyEventTypes } from "@clawjs/core";
import { test } from "vitest";
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
      bundleId: "com.example.claw.sdk.ios",
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

    await assert.rejects(
      () => sourceClient.send({
        approvalId: "",
        priority: "normal",
        audience: { useSubscriptions: true },
        context: {
          tenantId: "tenant-sdk",
          agentId: "sdk-agent",
          eventType: clawNotifyEventTypes.sdkAlert,
        },
      }),
      /requires explicit approvalId before external notification delivery/,
    );

    const blocked = await fetch(`${server.baseUrl}/v1/notifications`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${source.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        priority: "normal",
        audience: { useSubscriptions: true },
        context: {
          tenantId: "tenant-sdk",
          agentId: "sdk-agent",
          eventType: clawNotifyEventTypes.sdkAlert,
        },
      }),
    });
    assert.equal(blocked.status, 409);
    assert.equal(((await blocked.json()) as { error: string }).error, "approval_required");

    const sent = await sourceClient.send({
      approvalId: "approval_notify_send",
      legalLabel: "Notification delivery - human reviewed",
      priority: "normal",
      audience: { useSubscriptions: true },
      context: {
        tenantId: "tenant-sdk",
        agentId: "sdk-agent",
        eventType: clawNotifyEventTypes.sdkAlert,
      },
      delivery: {
        mode: "alert",
        title: "SDK alert",
      },
    });
    assert.equal(sent.created, true);
    assert.equal(sent.notification.approvalId, "approval_notify_send");
    assert.equal(sent.policy?.decision, "allow");
    assert.ok(sent.policy?.reasonCodes.includes("external_review_required"));
    assert.ok(sent.policy?.requirements.includes("human_review"));
    assert.equal(sent.deliveries.length, 1);

    const feed = await installationClient.feed();
    assert.equal(feed.items.length, 1);
    assert.equal(feed.items[0]?.notification.id, sent.notification.id);
  } finally {
    await server.close();
  }
});
