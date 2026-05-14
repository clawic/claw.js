const STABLE_EVENT_TYPES = {
  automationFailed: "automation.failed",
  deployStarted: "deploy.started",
  deployFailed: "deploy.failed",
  opsSummary: "ops.summary",
  opsFailed: "ops.failed",
} as const;
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

import { startNotifyServer } from "./helpers.ts";

const servers: Array<Awaited<ReturnType<typeof startNotifyServer>>> = [];

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop();
    if (server) await server.close();
  }
});

test("landing page keeps the short product name", async () => {
  const server = await boot();
  const response = await fetch(server.baseUrl);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Notify<\/title>/);
  assert.match(html, /<span class="login-brand">Notify<\/span>/);
});

async function boot() {
  const server = await startNotifyServer("notify-backend");
  servers.push(server);
  const login = await fetch(`${server.baseUrl}/v1/auth/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@notify.local", password: "notify-admin" }),
  });
  assert.equal(login.status, 200);
  const auth = await login.json() as { accessToken: string };
  return {
    ...server,
    adminToken: auth.accessToken,
  };
}

function authHeaders(token: string) {
  return {
    authorization: `Bearer ${token}`,
  };
}

async function createSourceApp(server: Awaited<ReturnType<typeof boot>>, tenantId = "tenant-a", id = "ops-center") {
  const response = await fetch(`${server.baseUrl}/v1/source-apps`, {
    method: "POST",
    headers: {
      ...authHeaders(server.adminToken),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      tenantId,
      id,
      displayName: "Ops Center",
    }),
  });
  assert.equal(response.status, 201);
  return await response.json() as {
    record: { id: string; tenantId: string };
    token: string;
  };
}

async function createClientApp(server: Awaited<ReturnType<typeof boot>>, input: {
  tenantId?: string;
  id: string;
  displayName: string;
  platform: "ios" | "android";
  bundleId: string;
}) {
  const response = await fetch(`${server.baseUrl}/v1/client-apps`, {
    method: "POST",
    headers: {
      ...authHeaders(server.adminToken),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      tenantId: input.tenantId ?? "tenant-a",
      id: input.id,
      displayName: input.displayName,
      platform: input.platform,
      bundleId: input.bundleId,
    }),
  });
  assert.equal(response.status, 201);
  return await response.json() as { id: string; tenantId: string; platform: "ios" | "android" };
}

async function registerInstallation(server: Awaited<ReturnType<typeof boot>>, input: {
  tenantId?: string;
  userId: string;
  clientAppId: string;
  deviceName: string;
  pushToken?: string;
}) {
  const response = await fetch(`${server.baseUrl}/v1/client/installations/register`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      tenantId: input.tenantId ?? "tenant-a",
      userId: input.userId,
      clientAppId: input.clientAppId,
      deviceName: input.deviceName,
      ...(input.pushToken ? { pushToken: input.pushToken } : {}),
    }),
  });
  assert.equal(response.status, 201);
  return await response.json() as {
    record: { id: string; tenantId: string; userId: string; clientAppId: string; pushToken: string | null };
    token: string;
  };
}

test("send fanout, multi-device feed, read flow, and critical ack work together", async () => {
  const server = await boot();
  const source = await createSourceApp(server);
  await createClientApp(server, {
    id: "claw-mobile-ios",
    displayName: "Claw Mobile iOS",
    platform: "ios",
    bundleId: "com.claw.mobile.ios",
  });
  await createClientApp(server, {
    id: "claw-mobile-android",
    displayName: "Claw Mobile Android",
    platform: "android",
    bundleId: "com.claw.mobile.android",
  });
  const iosInstall = await registerInstallation(server, {
    userId: "user-1",
    clientAppId: "claw-mobile-ios",
    deviceName: "iPhone",
    pushToken: "apns-token-1",
  });
  const androidInstall = await registerInstallation(server, {
    userId: "user-1",
    clientAppId: "claw-mobile-android",
    deviceName: "Pixel",
    pushToken: "fcm-token-1",
  });

  const send = await fetch(`${server.baseUrl}/v1/notifications`, {
    method: "POST",
    headers: {
      ...authHeaders(source.token),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      idempotencyKey: "run-1",
      priority: "critical",
      receiptPolicy: { kind: "critical", retrySec: 30, expireSec: 300 },
      audience: {
        userIds: ["user-1"],
      },
      context: {
        tenantId: "tenant-a",
        projectId: "alpha",
        agentId: "ops-agent",
        workspaceId: "alpha-ops",
        eventType: STABLE_EVENT_TYPES.automationFailed,
        severity: "error",
      },
      delivery: {
        mode: "alert",
        title: "Build failed",
        body: "Alpha deploy did not complete.",
        targetClientAppId: undefined,
        deepLink: {
          route: "/projects/alpha/deployments/42",
          params: { deploymentId: "42" },
          fallbackUrl: "https://example.invalid/projects/alpha/deployments/42",
        },
      },
    }),
  });
  assert.equal(send.status, 201);
  const created = await send.json() as {
    created: boolean;
    notification: { id: string; targetClientAppId: string | null };
    deliveries: Array<{ provider: string; installationId: string }>;
    receipt: { id: string; status: string };
  };
  assert.equal(created.created, true);
  assert.equal(created.deliveries.length, 2);
  assert.deepEqual(created.deliveries.map((delivery) => delivery.provider).sort(), ["apns", "fcm"]);
  assert.equal(created.receipt.status, "pending");

  const iosFeedResponse = await fetch(`${server.baseUrl}/v1/client/feed`, {
    headers: authHeaders(iosInstall.token),
  });
  assert.equal(iosFeedResponse.status, 200);
  const iosFeed = await iosFeedResponse.json() as {
    items: Array<{
      delivery: { installationId: string; state: string };
      notification: { id: string; deepLink?: { route?: string; params?: Record<string, string> } };
      receipt: { id: string; status: string } | null;
    }>;
  };
  assert.equal(iosFeed.items.length, 1);
  assert.equal(iosFeed.items[0]?.delivery.installationId, iosInstall.record.id);
  assert.equal(iosFeed.items[0]?.delivery.state, "delivered");
  assert.equal(iosFeed.items[0]?.notification.deepLink?.route, "/projects/alpha/deployments/42");
  assert.equal(iosFeed.items[0]?.notification.deepLink?.params?.deploymentId, "42");

  const markRead = await fetch(`${server.baseUrl}/v1/client/notifications/${created.notification.id}/read`, {
    method: "POST",
    headers: authHeaders(iosInstall.token),
  });
  assert.equal(markRead.status, 200);
  const readPayload = await markRead.json() as { delivery: { state: string } };
  assert.equal(readPayload.delivery.state, "read");

  const ack = await fetch(`${server.baseUrl}/v1/client/receipts/${created.receipt.id}/ack`, {
    method: "POST",
    headers: authHeaders(androidInstall.token),
  });
  assert.equal(ack.status, 200);

  const receiptResponse = await fetch(`${server.baseUrl}/v1/receipts/${created.receipt.id}`, {
    headers: authHeaders(source.token),
  });
  assert.equal(receiptResponse.status, 200);
  const receiptPayload = await receiptResponse.json() as { receipt: { status: string; ackedByInstallationId: string | null } };
  assert.equal(receiptPayload.receipt.status, "acked");
  assert.equal(receiptPayload.receipt.ackedByInstallationId, androidInstall.record.id);
});

test("subscription resolution supports allow, mute, critical-only, unsubscribe, and targeted client apps", async () => {
  const server = await boot();
  const source = await createSourceApp(server);
  await createClientApp(server, {
    id: "claw-mobile-ios",
    displayName: "Claw Mobile iOS",
    platform: "ios",
    bundleId: "com.claw.mobile.ios",
  });
  await createClientApp(server, {
    id: "claw-mobile-android",
    displayName: "Claw Mobile Android",
    platform: "android",
    bundleId: "com.claw.mobile.android",
  });
  const iosInstall = await registerInstallation(server, {
    userId: "user-2",
    clientAppId: "claw-mobile-ios",
    deviceName: "iPhone",
  });
  const androidInstall = await registerInstallation(server, {
    userId: "user-2",
    clientAppId: "claw-mobile-android",
    deviceName: "Pixel",
  });

  const allowSubResponse = await fetch(`${server.baseUrl}/v1/subscriptions`, {
    method: "PUT",
    headers: {
      ...authHeaders(iosInstall.token),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sourceAppId: source.record.id,
      agentId: "deploy-agent",
      minPriority: "critical",
    }),
  });
  assert.equal(allowSubResponse.status, 200);
  const allowSub = await allowSubResponse.json() as { subscription: { id: string } };

  const muteSubResponse = await fetch(`${server.baseUrl}/v1/subscriptions`, {
    method: "PUT",
    headers: {
      ...authHeaders(androidInstall.token),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sourceAppId: source.record.id,
      agentId: "deploy-agent",
      action: "mute",
      installationScoped: true,
    }),
  });
  assert.equal(muteSubResponse.status, 200);

  const nonCriticalSend = await fetch(`${server.baseUrl}/v1/notifications`, {
    method: "POST",
    headers: {
      ...authHeaders(source.token),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      priority: "normal",
      context: {
        tenantId: "tenant-a",
        agentId: "deploy-agent",
        eventType: STABLE_EVENT_TYPES.deployStarted,
      },
      audience: {
        useSubscriptions: true,
      },
      delivery: {
        mode: "alert",
        title: "Started",
      },
    }),
  });
  assert.equal(nonCriticalSend.status, 201);
  const nonCriticalPayload = await nonCriticalSend.json() as { deliveries: Array<unknown> };
  assert.equal(nonCriticalPayload.deliveries.length, 0);

  const criticalSend = await fetch(`${server.baseUrl}/v1/notifications`, {
    method: "POST",
    headers: {
      ...authHeaders(source.token),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      priority: "critical",
      receiptPolicy: { kind: "critical", retrySec: 20, expireSec: 200 },
      context: {
        tenantId: "tenant-a",
        agentId: "deploy-agent",
        eventType: STABLE_EVENT_TYPES.deployFailed,
      },
      audience: {
        useSubscriptions: true,
      },
      delivery: {
        mode: "alert",
        title: "Failed",
      },
    }),
  });
  assert.equal(criticalSend.status, 201);
  const criticalPayload = await criticalSend.json() as { deliveries: Array<{ installationId: string }> };
  assert.deepEqual(criticalPayload.deliveries.map((delivery) => delivery.installationId), [iosInstall.record.id]);

  const deleteResponse = await fetch(`${server.baseUrl}/v1/subscriptions/${allowSub.subscription.id}`, {
    method: "DELETE",
    headers: authHeaders(iosInstall.token),
  });
  assert.equal(deleteResponse.status, 200);

  const afterDeleteSend = await fetch(`${server.baseUrl}/v1/notifications`, {
    method: "POST",
    headers: {
      ...authHeaders(source.token),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      priority: "critical",
      receiptPolicy: { kind: "critical", retrySec: 20, expireSec: 200 },
      context: {
        tenantId: "tenant-a",
        agentId: "deploy-agent",
      },
      audience: {
        useSubscriptions: true,
      },
      delivery: {
        mode: "alert",
        title: "No listeners",
      },
    }),
  });
  assert.equal(afterDeleteSend.status, 201);
  const afterDeletePayload = await afterDeleteSend.json() as { deliveries: Array<unknown> };
  assert.equal(afterDeletePayload.deliveries.length, 0);
});

test("idempotency, cancelation, push-token rotation, glances, and tenant isolation hold", async () => {
  const server = await boot();
  const sourceA = await createSourceApp(server, "tenant-a", "ops-a");
  const sourceB = await createSourceApp(server, "tenant-b", "ops-b");
  await createClientApp(server, {
    tenantId: "tenant-a",
    id: "tenant-a-ios",
    displayName: "Tenant A iOS",
    platform: "ios",
    bundleId: "com.claw.a.ios",
  });
  await createClientApp(server, {
    tenantId: "tenant-b",
    id: "tenant-b-ios",
    displayName: "Tenant B iOS",
    platform: "ios",
    bundleId: "com.claw.b.ios",
  });
  const installA = await registerInstallation(server, {
    tenantId: "tenant-a",
    userId: "user-a",
    clientAppId: "tenant-a-ios",
    deviceName: "Tenant A Phone",
    pushToken: "old-token",
  });
  const installB = await registerInstallation(server, {
    tenantId: "tenant-b",
    userId: "user-b",
    clientAppId: "tenant-b-ios",
    deviceName: "Tenant B Phone",
  });

  const rotatePush = await fetch(`${server.baseUrl}/v1/client/installations/${installA.record.id}/push-token`, {
    method: "POST",
    headers: {
      ...authHeaders(installA.token),
      "content-type": "application/json",
    },
    body: JSON.stringify({ pushToken: "new-token" }),
  });
  assert.equal(rotatePush.status, 200);
  const rotatePayload = await rotatePush.json() as { installation: { pushToken: string } };
  assert.equal(rotatePayload.installation.pushToken, "new-token");

  const firstSend = await fetch(`${server.baseUrl}/v1/notifications`, {
    method: "POST",
    headers: {
      ...authHeaders(sourceA.token),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      idempotencyKey: "job-42",
      priority: "normal",
      audience: { userIds: ["user-a"] },
      context: { tenantId: "tenant-a", projectId: "proj-a" },
      delivery: { mode: "alert", title: "One shot" },
    }),
  });
  assert.equal(firstSend.status, 201);
  const firstPayload = await firstSend.json() as { created: boolean; notification: { id: string }; deliveries: Array<unknown> };
  assert.equal(firstPayload.created, true);
  assert.equal(firstPayload.deliveries.length, 1);

  const secondSend = await fetch(`${server.baseUrl}/v1/notifications`, {
    method: "POST",
    headers: {
      ...authHeaders(sourceA.token),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      idempotencyKey: "job-42",
      priority: "normal",
      audience: { userIds: ["user-a"] },
      context: { tenantId: "tenant-a", projectId: "proj-a" },
      delivery: { mode: "alert", title: "Duplicate" },
    }),
  });
  assert.equal(secondSend.status, 200);
  const secondPayload = await secondSend.json() as { created: boolean; notification: { id: string }; deliveries: Array<unknown> };
  assert.equal(secondPayload.created, false);
  assert.equal(secondPayload.notification.id, firstPayload.notification.id);
  assert.equal(secondPayload.deliveries.length, 1);

  const cancel = await fetch(`${server.baseUrl}/v1/notifications/${firstPayload.notification.id}/cancel`, {
    method: "POST",
    headers: authHeaders(sourceA.token),
  });
  assert.equal(cancel.status, 200);
  const cancelPayload = await cancel.json() as { notification: { status: string }; deliveries: Array<{ state: string }> };
  assert.equal(cancelPayload.notification.status, "cancelled");
  assert.equal(cancelPayload.deliveries[0]?.state, "cancelled");

  const glance = await fetch(`${server.baseUrl}/v1/glances/dashboard`, {
    method: "PUT",
    headers: {
      ...authHeaders(sourceA.token),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      tenantId: "tenant-a",
      userId: "user-a",
      data: {
        failedAgents: 2,
        lastAgent: "ops-agent",
      },
    }),
  });
  assert.equal(glance.status, 200);

  const feedA = await fetch(`${server.baseUrl}/v1/client/feed`, {
    headers: authHeaders(installA.token),
  });
  assert.equal(feedA.status, 200);
  const feedAPayload = await feedA.json() as { glances: Array<{ scope: string; data: { failedAgents: number } }> };
  assert.equal(feedAPayload.glances[0]?.scope, "dashboard");
  assert.equal(feedAPayload.glances[0]?.data.failedAgents, 2);

  const crossTenantSend = await fetch(`${server.baseUrl}/v1/notifications`, {
    method: "POST",
    headers: {
      ...authHeaders(sourceB.token),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      priority: "normal",
      audience: { userIds: ["user-a"] },
      context: { tenantId: "tenant-a" },
      delivery: { mode: "alert", title: "Forbidden" },
    }),
  });
  assert.equal(crossTenantSend.status, 403);

  const feedB = await fetch(`${server.baseUrl}/v1/client/feed`, {
    headers: authHeaders(installB.token),
  });
  assert.equal(feedB.status, 200);
  const feedBPayload = await feedB.json() as { items: Array<unknown>; glances: Array<unknown> };
  assert.equal(feedBPayload.items.length, 0);
  assert.equal(feedBPayload.glances.length, 0);
});

test("admin dashboard routes expose prefs, devices, feed, and quiet-hours gating", async () => {
  const server = await boot();
  const source = await createSourceApp(server, "tenant-admin", "ops-admin");
  await createClientApp(server, {
    tenantId: "tenant-admin",
    id: "tenant-admin-ios",
    displayName: "Tenant Admin iOS",
    platform: "ios",
    bundleId: "com.claw.admin.ios",
  });
  const installation = await registerInstallation(server, {
    tenantId: "tenant-admin",
    userId: "ops-user",
    clientAppId: "tenant-admin-ios",
    deviceName: "Ops iPhone",
    pushToken: "ops-token",
  });

  const updatePreferences = await fetch(`${server.baseUrl}/v1/admin/users/ops-user/preferences`, {
    method: "PUT",
    headers: {
      ...authHeaders(server.adminToken),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      tenantId: "tenant-admin",
      criticalOnly: false,
      quietHours: {
        enabled: true,
        timeZone: "UTC",
        startMinute: 0,
        endMinute: 0,
        allowCritical: true,
      },
    }),
  });
  assert.equal(updatePreferences.status, 200);

  const upsertSubscription = await fetch(`${server.baseUrl}/v1/admin/users/ops-user/subscriptions`, {
    method: "PUT",
    headers: {
      ...authHeaders(server.adminToken),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      tenantId: "tenant-admin",
      sourceAppId: "ops-admin",
      agentId: "ops-agent",
      minPriority: "normal",
      action: "allow",
    }),
  });
  assert.equal(upsertSubscription.status, 200);

  const normalSend = await fetch(`${server.baseUrl}/v1/notifications`, {
    method: "POST",
    headers: {
      ...authHeaders(source.token),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      priority: "normal",
      audience: { userIds: ["ops-user"] },
      context: {
        tenantId: "tenant-admin",
        agentId: "ops-agent",
        eventType: STABLE_EVENT_TYPES.opsSummary,
      },
      delivery: {
        mode: "alert",
        title: "Suppressed",
      },
    }),
  });
  assert.equal(normalSend.status, 201);
  const normalPayload = await normalSend.json() as { deliveries: Array<unknown> };
  assert.equal(normalPayload.deliveries.length, 0);

  const criticalSend = await fetch(`${server.baseUrl}/v1/notifications`, {
    method: "POST",
    headers: {
      ...authHeaders(source.token),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      priority: "critical",
      receiptPolicy: { kind: "critical", retrySec: 30, expireSec: 300 },
      audience: { userIds: ["ops-user"] },
      context: {
        tenantId: "tenant-admin",
        agentId: "ops-agent",
        eventType: STABLE_EVENT_TYPES.opsFailed,
      },
      delivery: {
        mode: "alert",
        title: "Allowed critical",
      },
    }),
  });
  assert.equal(criticalSend.status, 201);
  const criticalPayload = await criticalSend.json() as {
    deliveries: Array<{ id: string; installationId: string; state: string }>;
    receipt: { id: string } | null;
  };
  assert.equal(criticalPayload.deliveries.length, 1);
  assert.equal(criticalPayload.deliveries[0]?.installationId, installation.record.id);

  const metricsResponse = await fetch(`${server.baseUrl}/v1/admin/metrics/summary?tenantId=tenant-admin`, {
    headers: authHeaders(server.adminToken),
  });
  assert.equal(metricsResponse.status, 200);
  const metricsPayload = await metricsResponse.json() as { metrics: { installations: number; notifications: number; pendingReceipts: number } };
  assert.equal(metricsPayload.metrics.installations, 1);
  assert.equal(metricsPayload.metrics.notifications, 2);
  assert.equal(metricsPayload.metrics.pendingReceipts, 1);

  const devicesResponse = await fetch(`${server.baseUrl}/v1/admin/users/ops-user/devices?tenantId=tenant-admin`, {
    headers: authHeaders(server.adminToken),
  });
  assert.equal(devicesResponse.status, 200);
  const devicesPayload = await devicesResponse.json() as { installations: Array<{ id: string }> };
  assert.equal(devicesPayload.installations[0]?.id, installation.record.id);

  const feedResponse = await fetch(`${server.baseUrl}/v1/admin/users/ops-user/feed?tenantId=tenant-admin&limit=10`, {
    headers: authHeaders(server.adminToken),
  });
  assert.equal(feedResponse.status, 200);
  const feedPayload = await feedResponse.json() as { items: Array<{ delivery: { id: string }; receipt: { id: string } | null }> };
  assert.equal(feedPayload.items.length, 1);
  assert.equal(feedPayload.items[0]?.delivery.id, criticalPayload.deliveries[0]?.id);

  const readResponse = await fetch(`${server.baseUrl}/v1/admin/deliveries/${criticalPayload.deliveries[0]?.id}/read`, {
    method: "POST",
    headers: {
      ...authHeaders(server.adminToken),
      "content-type": "application/json",
    },
    body: JSON.stringify({ tenantId: "tenant-admin" }),
  });
  assert.equal(readResponse.status, 200);
  const readPayload = await readResponse.json() as { delivery: { state: string } };
  assert.equal(readPayload.delivery.state, "read");

  const ackResponse = await fetch(`${server.baseUrl}/v1/admin/receipts/${criticalPayload.receipt?.id}/ack`, {
    method: "POST",
    headers: {
      ...authHeaders(server.adminToken),
      "content-type": "application/json",
    },
    body: JSON.stringify({ installationId: installation.record.id }),
  });
  assert.equal(ackResponse.status, 200);
  const ackPayload = await ackResponse.json() as { receipt: { status: string } };
  assert.equal(ackPayload.receipt.status, "acked");

  const unregisterResponse = await fetch(`${server.baseUrl}/v1/admin/installations/${installation.record.id}/unregister`, {
    method: "POST",
    headers: {
      ...authHeaders(server.adminToken),
      "content-type": "application/json",
    },
    body: JSON.stringify({ tenantId: "tenant-admin" }),
  });
  assert.equal(unregisterResponse.status, 200);

  const devicesAfterResponse = await fetch(`${server.baseUrl}/v1/admin/users/ops-user/devices?tenantId=tenant-admin`, {
    headers: authHeaders(server.adminToken),
  });
  const devicesAfterPayload = await devicesAfterResponse.json() as { installations: Array<unknown> };
  assert.equal(devicesAfterPayload.installations.length, 0);
});
