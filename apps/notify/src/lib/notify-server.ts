import type { NotifyDashboardData, NotifyPreferences, NotifyQuietHours } from "./notify-types";

interface NotifyServerConfig {
  baseUrl: string;
  adminEmail: string;
  adminPassword: string;
  tenantId: string;
  userId: string;
}

function getConfig(): NotifyServerConfig {
  return {
    baseUrl: (process.env.NOTIFY_BASE_URL ?? "http://127.0.0.1:4610").replace(/\/$/, ""),
    adminEmail: process.env.NOTIFY_ADMIN_EMAIL ?? "admin@notify.local",
    adminPassword: process.env.NOTIFY_ADMIN_PASSWORD ?? "notify-admin",
    tenantId: process.env.NOTIFY_TENANT_ID ?? "demo-tenant",
    userId: process.env.NOTIFY_USER_ID ?? "local-user",
  };
}

async function readJson(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = typeof payload === "object" && payload && "error" in payload ? String(payload.error) : response.statusText;
    throw new Error(error);
  }
  return payload as Record<string, unknown>;
}

async function loginAdmin(config: NotifyServerConfig): Promise<string> {
  const response = await fetch(`${config.baseUrl}/v1/auth/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: config.adminEmail, password: config.adminPassword }),
    cache: "no-store",
  });
  const payload = await readJson(response);
  return String(payload.accessToken);
}

async function adminRequest<T>(config: NotifyServerConfig, token: string, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  return await readJson(response) as T;
}

async function sourceRequest<T>(config: NotifyServerConfig, token: string, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  return await readJson(response) as T;
}

async function ensureSourceApp(config: NotifyServerConfig, adminToken: string, input: {
  id: string;
  displayName: string;
  description?: string;
}) {
  const sourceApps = await adminRequest<{ items: Array<{ id: string }> }>(
    config,
    adminToken,
    `/v1/admin/source-apps?tenantId=${encodeURIComponent(config.tenantId)}`,
  );
  const exists = sourceApps.items.find((item) => item.id === input.id);
  if (!exists) {
    return await adminRequest<{ record: { id: string }; token: string }>(config, adminToken, "/v1/source-apps", {
      method: "POST",
      body: JSON.stringify({
        tenantId: config.tenantId,
        id: input.id,
        displayName: input.displayName,
        description: input.description,
      }),
    });
  }
  const rotated = await adminRequest<{ sourceAppId: string; token: string }>(
    config,
    adminToken,
    `/v1/source-apps/${encodeURIComponent(input.id)}/rotate-token`,
    { method: "POST" },
  );
  return {
    record: { id: rotated.sourceAppId },
    token: rotated.token,
  };
}

async function ensureClientApp(config: NotifyServerConfig, adminToken: string, input: {
  id: string;
  displayName: string;
  platform: "ios" | "android";
  bundleId: string;
}) {
  const clientApps = await adminRequest<{ items: Array<{ id: string }> }>(
    config,
    adminToken,
    `/v1/admin/client-apps?tenantId=${encodeURIComponent(config.tenantId)}`,
  );
  if (clientApps.items.some((item) => item.id === input.id)) return;
  await adminRequest(config, adminToken, "/v1/client-apps", {
    method: "POST",
    body: JSON.stringify({
      tenantId: config.tenantId,
      ...input,
    }),
  });
}

async function ensureInstallations(config: NotifyServerConfig, adminToken: string) {
  const devices = await adminRequest<{ installations: Array<{ id: string }> }>(
    config,
    adminToken,
    `/v1/admin/users/${encodeURIComponent(config.userId)}/devices?tenantId=${encodeURIComponent(config.tenantId)}`,
  );
  if (devices.installations.length > 0) return devices.installations;
  await fetch(`${config.baseUrl}/v1/client/installations/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tenantId: config.tenantId,
      userId: config.userId,
      clientAppId: "claw-mobile-ios",
      deviceName: "Ivory iPhone 15 Pro",
      pushToken: "apns-demo-token-1",
    }),
  }).then(readJson);
  await fetch(`${config.baseUrl}/v1/client/installations/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tenantId: config.tenantId,
      userId: config.userId,
      clientAppId: "claw-mobile-android",
      deviceName: "Graphite Pixel 9",
      pushToken: "fcm-demo-token-1",
    }),
  }).then(readJson);
  const refreshed = await adminRequest<{ installations: Array<{ id: string }> }>(
    config,
    adminToken,
    `/v1/admin/users/${encodeURIComponent(config.userId)}/devices?tenantId=${encodeURIComponent(config.tenantId)}`,
  );
  return refreshed.installations;
}

function minutes(hour: number, minute: number) {
  return hour * 60 + minute;
}

async function ensureDemoSubscriptions(config: NotifyServerConfig, adminToken: string) {
  const current = await adminRequest<{ subscriptions: Array<{ id: string }> }>(
    config,
    adminToken,
    `/v1/admin/users/${encodeURIComponent(config.userId)}/preferences?tenantId=${encodeURIComponent(config.tenantId)}`,
  );
  if (current.subscriptions.length > 0) return;
  await adminRequest(
    config,
    adminToken,
    `/v1/admin/users/${encodeURIComponent(config.userId)}/subscriptions`,
    {
      method: "PUT",
      body: JSON.stringify({
        tenantId: config.tenantId,
        sourceAppId: "ops-center",
        agentId: "deploy-agent",
        minPriority: "normal",
        action: "allow",
      }),
    },
  );
  await adminRequest(
    config,
    adminToken,
    `/v1/admin/users/${encodeURIComponent(config.userId)}/subscriptions`,
    {
      method: "PUT",
      body: JSON.stringify({
        tenantId: config.tenantId,
        sourceAppId: "ops-center",
        workspaceId: "research-lab",
        action: "mute",
      }),
    },
  );
}

async function ensureDemoPreferences(config: NotifyServerConfig, adminToken: string) {
  const current = await adminRequest<{ preferences: NotifyPreferences }>(
    config,
    adminToken,
    `/v1/admin/users/${encodeURIComponent(config.userId)}/preferences?tenantId=${encodeURIComponent(config.tenantId)}`,
  );
  const quietHours = current.preferences.quietHours;
  if (quietHours?.enabled) return;
  await adminRequest(
    config,
    adminToken,
    `/v1/admin/users/${encodeURIComponent(config.userId)}/preferences`,
    {
      method: "PUT",
      body: JSON.stringify({
        tenantId: config.tenantId,
        criticalOnly: false,
        quietHours: {
          enabled: true,
          timeZone: "Europe/Madrid",
          startMinute: minutes(22, 0),
          endMinute: minutes(7, 0),
          allowCritical: true,
        } satisfies NotifyQuietHours,
      }),
    },
  );
}

async function ensureDemoTraffic(config: NotifyServerConfig, adminToken: string, sourceToken: string, installationIds: string[]) {
  const notifications = await adminRequest<{ items: Array<{ id: string }> }>(
    config,
    adminToken,
    `/v1/admin/notifications?tenantId=${encodeURIComponent(config.tenantId)}&limit=10`,
  );
  if (notifications.items.length >= 3) return;

  const critical = await sourceRequest<{
    notification: { id: string };
    deliveries: Array<{ id: string; installationId: string }>;
    receipt: { id: string } | null;
  }>(config, sourceToken, "/v1/notifications", {
    method: "POST",
    body: JSON.stringify({
      idempotencyKey: "hub-demo-critical",
      priority: "critical",
      receiptPolicy: { kind: "critical", retrySec: 60, expireSec: 900 },
      audience: { userIds: [config.userId] },
      context: {
        tenantId: config.tenantId,
        projectId: "alpha",
        agentId: "deploy-agent",
        workspaceId: "alpha-ops",
        eventType: "deployment.failed",
        severity: "error",
      },
      delivery: {
        mode: "alert",
        title: "Alpha deployment failed",
        body: "The latest rollout hit a migration timeout on step 3.",
        deepLink: {
          route: "/projects/alpha/deployments/42",
          params: { deploymentId: "42" },
          fallbackUrl: "https://claw.local/projects/alpha/deployments/42",
        },
      },
    }),
  });

  await adminRequest(config, adminToken, `/v1/admin/deliveries/${encodeURIComponent(critical.deliveries[0]?.id ?? "")}/read`, {
    method: "POST",
    body: JSON.stringify({ tenantId: config.tenantId }),
  });
  if (critical.receipt && installationIds[1]) {
    await adminRequest(config, adminToken, `/v1/admin/receipts/${encodeURIComponent(critical.receipt.id)}/ack`, {
      method: "POST",
      body: JSON.stringify({ installationId: installationIds[1] }),
    });
  }

  await sourceRequest(config, sourceToken, "/v1/notifications", {
    method: "POST",
    body: JSON.stringify({
      idempotencyKey: "hub-demo-recovered",
      priority: "time-sensitive",
      audience: { userIds: [config.userId] },
      context: {
        tenantId: config.tenantId,
        projectId: "alpha",
        agentId: "deploy-agent",
        workspaceId: "alpha-ops",
        eventType: "deployment.recovered",
        severity: "info",
      },
      delivery: {
        mode: "alert",
        title: "Recovery finished",
        body: "Rollback completed and traffic is stable again.",
        deepLink: {
          route: "/projects/alpha/incidents/17",
          params: { incidentId: "17" },
        },
      },
    }),
  });

  await sourceRequest(config, sourceToken, "/v1/notifications", {
    method: "POST",
    body: JSON.stringify({
      idempotencyKey: "hub-demo-summary",
      priority: "normal",
      audience: { userIds: [config.userId] },
      context: {
        tenantId: config.tenantId,
        projectId: "research",
        agentId: "summarizer-agent",
        workspaceId: "analysis-deck",
        eventType: "summary.ready",
        severity: "info",
      },
      delivery: {
        mode: "alert",
        title: "Nightly summary ready",
        body: "Three agent runs completed with fresh research output.",
        deepLink: {
          route: "/projects/research/summaries/nightly",
        },
      },
    }),
  });

  await sourceRequest(config, sourceToken, "/v1/glances/fleet", {
    method: "PUT",
    body: JSON.stringify({
      tenantId: config.tenantId,
      userId: config.userId,
      data: {
        activeAgents: 6,
        failingAutomations: 1,
        unreadCritical: 0,
      },
    }),
  });
}

export async function bootstrapNotifyDemo() {
  const config = getConfig();
  const adminToken = await loginAdmin(config);
  const source = await ensureSourceApp(config, adminToken, {
    id: "ops-center",
    displayName: "Ops Center",
    description: "Primary ClawJS operational notifier.",
  });
  await ensureClientApp(config, adminToken, {
    id: "claw-mobile-ios",
    displayName: "Claw Mobile iOS",
    platform: "ios",
    bundleId: "com.claw.mobile.ios",
  });
  await ensureClientApp(config, adminToken, {
    id: "claw-mobile-android",
    displayName: "Claw Mobile Android",
    platform: "android",
    bundleId: "com.claw.mobile.android",
  });
  const installations = await ensureInstallations(config, adminToken);
  await ensureDemoPreferences(config, adminToken);
  await ensureDemoSubscriptions(config, adminToken);
  await ensureDemoTraffic(config, adminToken, source.token, installations.map((installation) => installation.id));
  return config;
}

export async function fetchNotifyDashboard(): Promise<NotifyDashboardData> {
  const config = await bootstrapNotifyDemo();
  const adminToken = await loginAdmin(config);
  const [metrics, sourceApps, clientApps, devices, userPrefs, feed, notifications, deliveries, glances] = await Promise.all([
    adminRequest<{ metrics: NotifyDashboardData["metrics"] }>(
      config,
      adminToken,
      `/v1/admin/metrics/summary?tenantId=${encodeURIComponent(config.tenantId)}`,
    ),
    adminRequest<{ items: NotifyDashboardData["sourceApps"] }>(
      config,
      adminToken,
      `/v1/admin/source-apps?tenantId=${encodeURIComponent(config.tenantId)}`,
    ),
    adminRequest<{ items: NotifyDashboardData["clientApps"] }>(
      config,
      adminToken,
      `/v1/admin/client-apps?tenantId=${encodeURIComponent(config.tenantId)}`,
    ),
    adminRequest<{ installations: NotifyDashboardData["installations"] }>(
      config,
      adminToken,
      `/v1/admin/users/${encodeURIComponent(config.userId)}/devices?tenantId=${encodeURIComponent(config.tenantId)}`,
    ),
    adminRequest<{ preferences: NotifyDashboardData["preferences"]; subscriptions: NotifyDashboardData["subscriptions"] }>(
      config,
      adminToken,
      `/v1/admin/users/${encodeURIComponent(config.userId)}/preferences?tenantId=${encodeURIComponent(config.tenantId)}`,
    ),
    adminRequest<{ items: NotifyDashboardData["feed"] }>(
      config,
      adminToken,
      `/v1/admin/users/${encodeURIComponent(config.userId)}/feed?tenantId=${encodeURIComponent(config.tenantId)}&limit=30`,
    ),
    adminRequest<{ items: NotifyDashboardData["notifications"] }>(
      config,
      adminToken,
      `/v1/admin/notifications?tenantId=${encodeURIComponent(config.tenantId)}&limit=30`,
    ),
    adminRequest<{ items: NotifyDashboardData["deliveries"] }>(
      config,
      adminToken,
      `/v1/admin/deliveries?tenantId=${encodeURIComponent(config.tenantId)}&limit=40`,
    ),
    adminRequest<{ glances: NotifyDashboardData["glances"] }>(
      config,
      adminToken,
      `/v1/admin/users/${encodeURIComponent(config.userId)}/glances?tenantId=${encodeURIComponent(config.tenantId)}`,
    ),
  ]);

  return {
    tenantId: config.tenantId,
    userId: config.userId,
    metrics: metrics.metrics,
    sourceApps: sourceApps.items,
    clientApps: clientApps.items,
    installations: devices.installations,
    preferences: userPrefs.preferences,
    subscriptions: userPrefs.subscriptions,
    feed: feed.items,
    notifications: notifications.items,
    deliveries: deliveries.items,
    glances: glances.glances,
  };
}

export async function mutateNotifyDashboard(input: Record<string, unknown>) {
  const config = await bootstrapNotifyDemo();
  const adminToken = await loginAdmin(config);
  const intent = String(input.intent ?? "");

  if (intent === "updatePreferences") {
    return await adminRequest(
      config,
      adminToken,
      `/v1/admin/users/${encodeURIComponent(config.userId)}/preferences`,
      {
        method: "PUT",
        body: JSON.stringify({
          tenantId: config.tenantId,
          criticalOnly: input.criticalOnly === true,
          quietHours: input.quietHours ?? null,
        }),
      },
    );
  }

  if (intent === "upsertSubscription") {
    return await adminRequest(
      config,
      adminToken,
      `/v1/admin/users/${encodeURIComponent(config.userId)}/subscriptions`,
      {
        method: "PUT",
        body: JSON.stringify({
          tenantId: config.tenantId,
          ...input,
        }),
      },
    );
  }

  if (intent === "deleteSubscription") {
    return await adminRequest(
      config,
      adminToken,
      `/v1/admin/users/${encodeURIComponent(config.userId)}/subscriptions/${encodeURIComponent(String(input.id ?? ""))}?tenantId=${encodeURIComponent(config.tenantId)}`,
      { method: "DELETE" },
    );
  }

  if (intent === "markRead") {
    return await adminRequest(
      config,
      adminToken,
      `/v1/admin/deliveries/${encodeURIComponent(String(input.deliveryId ?? ""))}/read`,
      {
        method: "POST",
        body: JSON.stringify({ tenantId: config.tenantId }),
      },
    );
  }

  if (intent === "ackReceipt") {
    return await adminRequest(
      config,
      adminToken,
      `/v1/admin/receipts/${encodeURIComponent(String(input.receiptId ?? ""))}/ack`,
      {
        method: "POST",
        body: JSON.stringify({ installationId: input.installationId }),
      },
    );
  }

  if (intent === "unregisterInstallation") {
    return await adminRequest(
      config,
      adminToken,
      `/v1/admin/installations/${encodeURIComponent(String(input.installationId ?? ""))}/unregister`,
      {
        method: "POST",
        body: JSON.stringify({ tenantId: config.tenantId }),
      },
    );
  }

  if (intent === "createSourceApp") {
    return await adminRequest(config, adminToken, "/v1/source-apps", {
      method: "POST",
      body: JSON.stringify({
        tenantId: config.tenantId,
        id: input.id,
        displayName: input.displayName,
        description: input.description,
      }),
    });
  }

  if (intent === "rotateSourceToken") {
    return await adminRequest(
      config,
      adminToken,
      `/v1/source-apps/${encodeURIComponent(String(input.sourceAppId ?? ""))}/rotate-token`,
      { method: "POST" },
    );
  }

  if (intent === "createClientApp") {
    return await adminRequest(config, adminToken, "/v1/client-apps", {
      method: "POST",
      body: JSON.stringify({
        tenantId: config.tenantId,
        id: input.id,
        displayName: input.displayName,
        platform: input.platform,
        bundleId: input.bundleId,
      }),
    });
  }

  if (intent === "sendDemoNotification") {
    const source = await ensureSourceApp(config, adminToken, {
      id: String(input.sourceAppId ?? "ops-center"),
      displayName: "Ops Center",
    });
    return await sourceRequest(config, source.token, "/v1/notifications", {
      method: "POST",
      body: JSON.stringify({
        idempotencyKey: `manual-${Date.now()}`,
        priority: input.priority ?? "normal",
        audience: { userIds: [config.userId] },
        context: {
          tenantId: config.tenantId,
          agentId: input.agentId ?? "manual-agent",
          projectId: input.projectId ?? "manual-project",
          eventType: input.eventType ?? "manual.triggered",
          severity: input.severity ?? "info",
        },
        receiptPolicy: input.priority === "critical" ? { kind: "critical", retrySec: 60, expireSec: 900 } : { kind: "none" },
        delivery: {
          mode: "alert",
          title: input.title ?? "Manual notification",
          body: input.body ?? "Triggered from the Hub admin panel.",
          deepLink: {
            route: "/manual/notification",
          },
        },
      }),
    });
  }

  throw new Error(`Unsupported notify action: ${intent}`);
}
