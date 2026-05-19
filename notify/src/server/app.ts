import { clawApiPath } from "@clawjs/core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";

import { NotifyAuthService, type NotifyPrincipal } from "./auth.ts";
import { loadNotifyConfig, type NotifyServiceConfig } from "./config.ts";
import { NotifyServiceStore, resolveAudienceInstallations } from "./db.ts";
import type {
  NotificationAudience,
  NotificationContext,
  NotificationDeepLink,
  NotificationPriority,
  NotificationReceiptPolicy,
  QuietHoursPolicy,
  SubscriptionFilter,
} from "../shared/types.ts";

function parseBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token?.trim()) return null;
  return token.trim();
}

function readBody(request: FastifyRequest): Record<string, unknown> {
  return ((request.body ?? {}) as Record<string, unknown>);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean);
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) return parsed;
  }
  return undefined;
}

function parsePriority(value: unknown): NotificationPriority {
  switch (value) {
    case "passive":
    case "normal":
    case "time-sensitive":
    case "critical":
      return value;
    default:
      return "normal";
  }
}

function parseReceiptPolicy(value: unknown, priority: NotificationPriority): NotificationReceiptPolicy {
  const body = isRecord(value) ? value : {};
  const kind = body.kind === "critical" ? "critical" : "none";
  if (kind === "critical" && priority !== "critical") {
    throw new Error("critical receiptPolicy requires priority=critical");
  }
  return kind === "critical"
    ? {
      kind,
      retrySec: typeof body.retrySec === "number" && body.retrySec > 0 ? Math.floor(body.retrySec) : 60,
      expireSec: typeof body.expireSec === "number" && body.expireSec > 0 ? Math.floor(body.expireSec) : 900,
    }
    : { kind: "none" };
}

function parseAudience(value: unknown): NotificationAudience | undefined {
  if (!isRecord(value)) return undefined;
  const userIds = asStringArray(value.userIds);
  const installationIds = asStringArray(value.installationIds);
  return {
    ...(userIds?.length ? { userIds } : {}),
    ...(installationIds?.length ? { installationIds } : {}),
    ...(typeof value.useSubscriptions === "boolean" ? { useSubscriptions: value.useSubscriptions } : {}),
  };
}

function parseContext(value: unknown, tenantId: string): NotificationContext {
  const body = isRecord(value) ? value : {};
  const resolvedTenantId = asString(body.tenantId) ?? tenantId;
  return {
    tenantId: resolvedTenantId,
    ...(asString(body.projectId) ? { projectId: asString(body.projectId) } : {}),
    ...(asString(body.agentId) ? { agentId: asString(body.agentId) } : {}),
    ...(asString(body.workspaceId) ? { workspaceId: asString(body.workspaceId) } : {}),
    ...(asString(body.sessionId) ? { sessionId: asString(body.sessionId) } : {}),
    ...(asString(body.automationId) ? { automationId: asString(body.automationId) } : {}),
    ...(asString(body.eventType) ? { eventType: asString(body.eventType) } : {}),
    ...(asString(body.severity) ? { severity: asString(body.severity) } : {}),
  };
}

function parseDeepLink(value: unknown): NotificationDeepLink | undefined {
  if (!isRecord(value)) return undefined;
  const params = isRecord(value.params)
    ? Object.fromEntries(Object.entries(value.params).flatMap(([key, entry]) => typeof entry === "string" ? [[key, entry]] : []))
    : undefined;
  const targetClientAppId = asString(value.targetClientAppId);
  const route = asString(value.route);
  const fallbackUrl = asString(value.fallbackUrl);
  if (!targetClientAppId && !route && !fallbackUrl && !params) return undefined;
  return {
    ...(targetClientAppId ? { targetClientAppId } : {}),
    ...(route ? { route } : {}),
    ...(params ? { params } : {}),
    ...(fallbackUrl ? { fallbackUrl } : {}),
  };
}

function parseQuietHours(value: unknown): QuietHoursPolicy | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const enabled = asBoolean(value.enabled) ?? false;
  const timeZone = asString(value.timeZone) ?? "UTC";
  const startMinute = asInteger(value.startMinute) ?? 0;
  const endMinute = asInteger(value.endMinute) ?? 0;
  return {
    enabled,
    timeZone,
    startMinute: Math.max(0, Math.min(1_439, startMinute)),
    endMinute: Math.max(0, Math.min(1_439, endMinute)),
    ...(asBoolean(value.allowCritical) !== undefined ? { allowCritical: asBoolean(value.allowCritical) } : {}),
  };
}

async function resolvePrincipal(
  request: FastifyRequest,
  auth: NotifyAuthService,
  store: NotifyServiceStore,
): Promise<NotifyPrincipal | null> {
  const token = parseBearerToken(request);
  if (!token) return null;
  const admin = await auth.verifyAdminToken(token);
  if (admin) return admin;
  const source = store.authenticateSourceAppToken(token);
  if (source) {
    return {
      kind: "source",
      sourceAppId: source.sourceAppId,
      tenantId: source.tenantId,
    };
  }
  const installation = store.authenticateInstallationToken(token);
  if (installation) {
    return {
      kind: "installation",
      installationId: installation.installationId,
      tenantId: installation.tenantId,
      userId: installation.userId,
      clientAppId: installation.clientAppId,
    };
  }
  return null;
}

async function requirePrincipal(
  request: FastifyRequest,
  reply: FastifyReply,
  auth: NotifyAuthService,
  store: NotifyServiceStore,
  expected: NotifyPrincipal["kind"] | Array<NotifyPrincipal["kind"]>,
): Promise<NotifyPrincipal | null> {
  const principal = await resolvePrincipal(request, auth, store);
  if (!principal) {
    await reply.code(401).send({ error: "Unauthorized" });
    return null;
  }
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(principal.kind)) {
    await reply.code(403).send({ error: "Forbidden" });
    return null;
  }
  return principal;
}

function resolvePublicRoot(): string {
  const candidates = [
    fileURLToPath(new URL("../public", import.meta.url)),
    fileURLToPath(new URL("../../public", import.meta.url)),
    path.join(process.cwd(), "public"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function resolveBrandRoot(): string {
  const candidates = [
    fileURLToPath(new URL("../../../public", import.meta.url)),
    fileURLToPath(new URL("../../public", import.meta.url)),
    path.join(process.cwd(), "../public"),
    path.join(process.cwd(), "public"),
  ];
  return candidates.find((candidate) => (
    fs.existsSync(path.join(candidate, "logo.png")) &&
    fs.existsSync(path.join(candidate, "favicon.ico"))
  )) ?? candidates[0];
}

const publicRoot = resolvePublicRoot();
const brandRoot = resolveBrandRoot();

export interface BuildNotifyAppOptions {
  config?: Partial<NotifyServiceConfig>;
}

export function buildNotifyApp(options: BuildNotifyAppOptions = {}) {
  const config = loadNotifyConfig(options.config);
  fs.mkdirSync(config.dataDir, { recursive: true });

  const app = Fastify({ logger: false });
  const auth = new NotifyAuthService(config.jwtSecret);
  const store = new NotifyServiceStore(config.dbPath);

  app.addHook("onClose", async () => {
    store.close();
  });

  app.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : true,
  });
  app.register(fastifyStatic, {
    root: publicRoot,
    prefix: "/static/",
  });
  app.register(fastifyStatic, {
    root: brandRoot,
    prefix: "/brand/",
    decorateReply: false,
  });

  app.get("/", async (_request, reply) => {
    reply.type("text/html; charset=utf-8");
    return fs.readFileSync(path.join(publicRoot, "index.html"), "utf8");
  });

  app.get("/favicon.ico", async (_request, reply) => {
    await reply.code(204).send();
  });

  app.get(clawApiPath("health"), async () => ({
    ok: true,
    service: "notify",
    host: config.host,
    port: config.port,
  }));

  app.post(clawApiPath("auth/admin/login"), async (request, reply) => {
    const body = readBody(request);
    const email = asString(body.email) ?? "";
    const password = asString(body.password) ?? "";
    const admin = store.verifyAdmin(email, password);
    if (!admin) {
      return await reply.code(401).send({ error: "Invalid email or password." });
    }
    const accessToken = await auth.issueAdminToken({
      adminId: admin.id,
      email: admin.email,
    });
    return {
      accessToken,
      admin,
    };
  });

  app.get(clawApiPath("admin/source-apps"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "admin");
    if (!principal) return null;
    const tenantId = asString((request.query as Record<string, unknown>).tenantId);
    if (!tenantId) {
      return await reply.code(400).send({ error: "tenantId is required." });
    }
    return {
      items: store.listSourceApps(tenantId),
    };
  });

  app.get(clawApiPath("admin/client-apps"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "admin");
    if (!principal) return null;
    const tenantId = asString((request.query as Record<string, unknown>).tenantId);
    if (!tenantId) {
      return await reply.code(400).send({ error: "tenantId is required." });
    }
    return {
      items: store.listClientApps(tenantId),
    };
  });

  app.get(clawApiPath("admin/notifications"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "admin");
    if (!principal) return null;
    const query = request.query as Record<string, unknown>;
    const tenantId = asString(query.tenantId);
    if (!tenantId) {
      return await reply.code(400).send({ error: "tenantId is required." });
    }
    const limit = asInteger(query.limit) ?? 100;
    return {
      items: store.listNotificationsForTenant(tenantId, limit),
    };
  });

  app.get(clawApiPath("admin/deliveries"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "admin");
    if (!principal) return null;
    const query = request.query as Record<string, unknown>;
    const tenantId = asString(query.tenantId);
    if (!tenantId) {
      return await reply.code(400).send({ error: "tenantId is required." });
    }
    const state = query.state === "queued" || query.state === "delivered" || query.state === "read" || query.state === "acked" || query.state === "cancelled" || query.state === "expired" || query.state === "failed"
      ? query.state
      : undefined;
    return {
      items: store.listDeliveriesForTenant({
        tenantId,
        userId: asString(query.userId),
        state,
        limit: asInteger(query.limit) ?? 200,
      }),
    };
  });

  app.get(clawApiPath("admin/metrics/summary"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "admin");
    if (!principal) return null;
    const tenantId = asString((request.query as Record<string, unknown>).tenantId);
    if (!tenantId) {
      return await reply.code(400).send({ error: "tenantId is required." });
    }
    return {
      metrics: store.getMetricsSummary(tenantId),
    };
  });

  app.get(clawApiPath("admin/users/:userId/feed"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "admin");
    if (!principal) return null;
    const tenantId = asString((request.query as Record<string, unknown>).tenantId);
    const userId = asString((request.params as Record<string, unknown>).userId);
    if (!tenantId || !userId) {
      return await reply.code(400).send({ error: "tenantId and userId are required." });
    }
    return {
      items: store.listFeedForUser(tenantId, userId, asInteger((request.query as Record<string, unknown>).limit) ?? 100),
    };
  });

  app.get(clawApiPath("admin/users/:userId/preferences"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "admin");
    if (!principal) return null;
    const tenantId = asString((request.query as Record<string, unknown>).tenantId);
    const userId = asString((request.params as Record<string, unknown>).userId);
    if (!tenantId || !userId) {
      return await reply.code(400).send({ error: "tenantId and userId are required." });
    }
    return {
      preferences: store.getUserPreferences(tenantId, userId),
      subscriptions: store.listSubscriptionsForUser(tenantId, userId),
    };
  });

  app.put(clawApiPath("admin/users/:userId/preferences"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "admin");
    if (!principal) return null;
    const body = readBody(request);
    const tenantId = asString(body.tenantId);
    const userId = asString((request.params as Record<string, unknown>).userId);
    if (!tenantId || !userId) {
      return await reply.code(400).send({ error: "tenantId and userId are required." });
    }
    return {
      preferences: store.upsertUserPreferences({
        tenantId,
        userId,
        criticalOnly: asBoolean(body.criticalOnly),
        quietHours: parseQuietHours(body.quietHours),
      }),
    };
  });

  app.get(clawApiPath("admin/users/:userId/devices"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "admin");
    if (!principal) return null;
    const tenantId = asString((request.query as Record<string, unknown>).tenantId);
    const userId = asString((request.params as Record<string, unknown>).userId);
    if (!tenantId || !userId) {
      return await reply.code(400).send({ error: "tenantId and userId are required." });
    }
    return {
      installations: store.listInstallationsForUser(tenantId, userId),
    };
  });

  app.put(clawApiPath("admin/users/:userId/subscriptions"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "admin");
    if (!principal) return null;
    const body = readBody(request);
    const tenantId = asString(body.tenantId);
    const userId = asString((request.params as Record<string, unknown>).userId);
    if (!tenantId || !userId) {
      return await reply.code(400).send({ error: "tenantId and userId are required." });
    }
    const installationScoped = body.installationScoped === true;
    const subscription = store.upsertSubscription({
      id: asString(body.id),
      tenantId,
      userId,
      installationId: installationScoped ? asString(body.installationId) ?? null : null,
      filter: {
        ...(asString(body.sourceAppId) ? { sourceAppId: asString(body.sourceAppId) } : {}),
        ...(asString(body.clientAppId) ? { clientAppId: asString(body.clientAppId) } : {}),
        ...(asString(body.projectId) ? { projectId: asString(body.projectId) } : {}),
        ...(asString(body.agentId) ? { agentId: asString(body.agentId) } : {}),
        ...(asString(body.workspaceId) ? { workspaceId: asString(body.workspaceId) } : {}),
        ...(asString(body.eventType) ? { eventType: asString(body.eventType) } : {}),
        ...(asString(body.severity) ? { severity: asString(body.severity) } : {}),
        ...(body.minPriority === "passive" || body.minPriority === "normal" || body.minPriority === "time-sensitive" || body.minPriority === "critical"
          ? { minPriority: body.minPriority }
          : {}),
        ...(body.action === "mute" ? { action: "mute" } : { action: "allow" }),
      },
    });
    return {
      subscription,
    };
  });

  app.delete(clawApiPath("admin/users/:userId/subscriptions/:id"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "admin");
    if (!principal) return null;
    const tenantId = asString((request.query as Record<string, unknown>).tenantId);
    const userId = asString((request.params as Record<string, unknown>).userId);
    const id = asString((request.params as Record<string, unknown>).id);
    if (!tenantId || !userId || !id) {
      return await reply.code(400).send({ error: "tenantId, userId, and subscription id are required." });
    }
    const ok = store.deleteSubscription({ id, tenantId, userId });
    if (!ok) {
      return await reply.code(404).send({ error: "Subscription not found." });
    }
    return {
      ok: true,
    };
  });

  app.get(clawApiPath("admin/users/:userId/glances"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "admin");
    if (!principal) return null;
    const tenantId = asString((request.query as Record<string, unknown>).tenantId);
    const userId = asString((request.params as Record<string, unknown>).userId);
    if (!tenantId || !userId) {
      return await reply.code(400).send({ error: "tenantId and userId are required." });
    }
    return {
      glances: store.listGlancesForUser(tenantId, userId),
    };
  });

  app.post(clawApiPath("admin/installations/:id/unregister"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "admin");
    if (!principal) return null;
    const body = readBody(request);
    const tenantId = asString(body.tenantId);
    const installationId = asString((request.params as Record<string, unknown>).id);
    if (!tenantId || !installationId) {
      return await reply.code(400).send({ error: "tenantId and installation id are required." });
    }
    const ok = store.unregisterInstallation({ installationId, tenantId });
    if (!ok) {
      return await reply.code(404).send({ error: "Installation not found." });
    }
    return {
      ok: true,
    };
  });

  app.post(clawApiPath("admin/deliveries/:deliveryId/read"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "admin");
    if (!principal) return null;
    const body = readBody(request);
    const tenantId = asString(body.tenantId);
    const deliveryId = asString((request.params as Record<string, unknown>).deliveryId);
    if (!tenantId || !deliveryId) {
      return await reply.code(400).send({ error: "tenantId and deliveryId are required." });
    }
    const delivery = store.markDeliveryReadById(tenantId, deliveryId);
    if (!delivery) {
      return await reply.code(404).send({ error: "Delivery not found." });
    }
    return {
      delivery,
    };
  });

  app.post(clawApiPath("admin/receipts/:receiptId/ack"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "admin");
    if (!principal) return null;
    const body = readBody(request);
    const installationId = asString(body.installationId);
    const receiptId = asString((request.params as Record<string, unknown>).receiptId);
    if (!installationId || !receiptId) {
      return await reply.code(400).send({ error: "installationId and receiptId are required." });
    }
    const receipt = store.acknowledgeReceipt(receiptId, installationId);
    if (!receipt) {
      return await reply.code(404).send({ error: "Receipt not found." });
    }
    return {
      receipt,
    };
  });

  app.post(clawApiPath("source-apps"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "admin");
    if (!principal) return null;
    const body = readBody(request);
    const tenantId = asString(body.tenantId);
    const displayName = asString(body.displayName);
    if (!tenantId || !displayName) {
      return await reply.code(400).send({ error: "tenantId and displayName are required." });
    }
    const created = store.createSourceApp({
      tenantId,
      id: asString(body.id),
      displayName,
      description: asString(body.description),
      iconUrl: asString(body.iconUrl),
      defaults: isRecord(body.defaults) ? body.defaults : undefined,
      deepLinkTemplate: isRecord(body.deepLinkTemplate) ? body.deepLinkTemplate : undefined,
    });
    return await reply.code(201).send(created);
  });

  app.post(clawApiPath("source-apps/:id/rotate-token"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "admin");
    if (!principal) return null;
    const sourceAppId = asString((request.params as Record<string, unknown>).id);
    if (!sourceAppId || !store.getSourceApp(sourceAppId)) {
      return await reply.code(404).send({ error: "Source app not found." });
    }
    return {
      sourceAppId,
      token: store.rotateSourceAppToken(sourceAppId),
    };
  });

  app.post(clawApiPath("client-apps"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "admin");
    if (!principal) return null;
    const body = readBody(request);
    const tenantId = asString(body.tenantId);
    const displayName = asString(body.displayName);
    const platform = body.platform === "ios" || body.platform === "android" ? body.platform : null;
    const bundleId = asString(body.bundleId);
    if (!tenantId || !displayName || !platform || !bundleId) {
      return await reply.code(400).send({ error: "tenantId, displayName, platform, and bundleId are required." });
    }
    const record = store.createClientApp({
      tenantId,
      id: asString(body.id),
      displayName,
      platform,
      bundleId,
      credentials: isRecord(body.credentials) ? body.credentials : undefined,
    });
    return await reply.code(201).send(record);
  });

  app.post(clawApiPath("notifications"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "source");
    if (!principal || principal.kind !== "source") return null;
    const body = readBody(request);
    const priority = parsePriority(body.priority);
    const receiptPolicy = parseReceiptPolicy(body.receiptPolicy, priority);
    const delivery = isRecord(body.delivery) ? body.delivery : {};
    const deliveryMode = delivery.mode === "silent" || delivery.mode === "glance" ? delivery.mode : "alert";
    const context = parseContext(body.context, principal.tenantId);
    const approvalId = asString(body.approvalId);
    if (!approvalId) {
      return await reply.code(409).send({ error: "approval_required", message: "Notification delivery requires explicit approvalId." });
    }
    if (context.tenantId !== principal.tenantId) {
      return await reply.code(403).send({ error: "tenant mismatch for source token" });
    }
    const idempotencyKey = asString(body.idempotencyKey);
    if (idempotencyKey) {
      const existing = store.getNotificationBySourceAndIdempotency(principal.sourceAppId, idempotencyKey);
      if (existing) {
        return {
          created: false,
          notification: existing,
          deliveries: store.listDeliveriesForNotification(existing.id),
          receipt: store.getReceiptByNotification(existing.id),
        };
      }
    }
    const notification = store.createNotification({
      tenantId: principal.tenantId,
      sourceAppId: principal.sourceAppId,
      approvalId,
      idempotencyKey,
      priority,
      deliveryMode,
      title: asString(delivery.title),
      body: asString(delivery.body),
      data: isRecord(delivery.data) ? delivery.data : undefined,
      context,
      deepLink: parseDeepLink(delivery.deepLink),
      targetClientAppId: asString(delivery.targetClientAppId),
      receiptPolicy,
    });
    const installations = resolveAudienceInstallations({
      tenantId: principal.tenantId,
      sourceAppId: principal.sourceAppId,
      audience: parseAudience(body.audience),
      context,
      priority,
      targetClientAppId: notification.targetClientAppId,
      store,
    });
    const deliveries = installations.map((installation) => store.createDelivery({
      notificationId: notification.id,
      tenantId: notification.tenantId,
      userId: installation.userId,
      installationId: installation.id,
      clientAppId: installation.clientAppId,
      provider: installation.platform === "ios" ? "apns" : "fcm",
    }));
    const receipt = receiptPolicy.kind === "critical"
      ? store.createReceipt({
        notificationId: notification.id,
        tenantId: notification.tenantId,
        retrySec: receiptPolicy.retrySec ?? 60,
        expireAt: new Date(Date.now() + (receiptPolicy.expireSec ?? 900) * 1_000).toISOString(),
      })
      : null;
    return await reply.code(201).send({
      created: true,
      notification,
      deliveries,
      receipt,
    });
  });

  app.post(clawApiPath("notifications/:id/cancel"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "source");
    if (!principal || principal.kind !== "source") return null;
    const notificationId = asString((request.params as Record<string, unknown>).id);
    if (!notificationId) {
      return await reply.code(400).send({ error: "notification id is required." });
    }
    const cancelled = store.cancelNotification(principal.sourceAppId, notificationId);
    if (!cancelled) {
      return await reply.code(404).send({ error: "Notification not found." });
    }
    return {
      notification: cancelled,
      deliveries: store.listDeliveriesForNotification(notificationId),
      receipt: store.getReceiptByNotification(notificationId),
    };
  });

  app.get(clawApiPath("receipts/:receiptId"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, ["source", "installation", "admin"]);
    if (!principal) return null;
    store.expirePendingReceipts();
    const receiptId = asString((request.params as Record<string, unknown>).receiptId);
    const receipt = receiptId ? store.getReceipt(receiptId) : null;
    if (!receipt) {
      return await reply.code(404).send({ error: "Receipt not found." });
    }
    if ("tenantId" in principal && principal.tenantId !== receipt.tenantId) {
      return await reply.code(403).send({ error: "Forbidden" });
    }
    return {
      receipt,
      notification: store.getNotification(receipt.notificationId),
    };
  });

  app.post(clawApiPath("client/installations/register"), async (request, reply) => {
    const body = readBody(request);
    const tenantId = asString(body.tenantId);
    const userId = asString(body.userId);
    const clientAppId = asString(body.clientAppId);
    const deviceName = asString(body.deviceName);
    if (!tenantId || !userId || !clientAppId || !deviceName) {
      return await reply.code(400).send({ error: "tenantId, userId, clientAppId, and deviceName are required." });
    }
    try {
      const created = store.registerInstallation({
        tenantId,
        userId,
        clientAppId,
        deviceName,
        pushToken: asString(body.pushToken),
      });
      return await reply.code(201).send(created);
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post(clawApiPath("client/installations/:id/push-token"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "installation");
    if (!principal || principal.kind !== "installation") return null;
    const installationId = asString((request.params as Record<string, unknown>).id);
    if (!installationId || installationId !== principal.installationId) {
      return await reply.code(403).send({ error: "installation mismatch" });
    }
    const body = readBody(request);
    const pushToken = asString(body.pushToken);
    if (!pushToken) {
      return await reply.code(400).send({ error: "pushToken is required." });
    }
    const record = store.updateInstallationPushToken(installationId, pushToken);
    return {
      installation: record,
    };
  });

  app.post(clawApiPath("client/installations/:id/unregister"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "installation");
    if (!principal || principal.kind !== "installation") return null;
    const installationId = asString((request.params as Record<string, unknown>).id);
    if (!installationId) {
      return await reply.code(400).send({ error: "installation id is required." });
    }
    const ok = store.unregisterInstallation({
      installationId,
      tenantId: principal.tenantId,
      userId: principal.userId,
    });
    if (!ok) {
      return await reply.code(404).send({ error: "Installation not found." });
    }
    return {
      ok: true,
    };
  });

  app.get(clawApiPath("client/feed"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "installation");
    if (!principal || principal.kind !== "installation") return null;
    const limit = Number((request.query as Record<string, unknown>).limit ?? 50);
    return {
      installation: store.getInstallation(principal.installationId),
      items: store.listFeed(principal.tenantId, principal.installationId, Number.isFinite(limit) ? limit : 50),
      glances: store.listGlancesForInstallation(principal.tenantId, principal.userId, principal.clientAppId),
    };
  });

  app.get(clawApiPath("client/preferences"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "installation");
    if (!principal || principal.kind !== "installation") return null;
    return {
      preferences: store.getUserPreferences(principal.tenantId, principal.userId),
      subscriptions: store.listSubscriptionsForUser(principal.tenantId, principal.userId),
    };
  });

  app.put(clawApiPath("client/preferences"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "installation");
    if (!principal || principal.kind !== "installation") return null;
    const body = readBody(request);
    return {
      preferences: store.upsertUserPreferences({
        tenantId: principal.tenantId,
        userId: principal.userId,
        criticalOnly: asBoolean(body.criticalOnly),
        quietHours: parseQuietHours(body.quietHours),
      }),
    };
  });

  app.get(clawApiPath("client/devices"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "installation");
    if (!principal || principal.kind !== "installation") return null;
    return {
      installations: store.listInstallationsForUser(principal.tenantId, principal.userId),
    };
  });

  app.get(clawApiPath("client/glances"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "installation");
    if (!principal || principal.kind !== "installation") return null;
    return {
      glances: store.listGlancesForInstallation(principal.tenantId, principal.userId, principal.clientAppId),
    };
  });

  app.post(clawApiPath("client/notifications/:id/read"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "installation");
    if (!principal || principal.kind !== "installation") return null;
    const notificationId = asString((request.params as Record<string, unknown>).id);
    if (!notificationId) {
      return await reply.code(400).send({ error: "notification id is required." });
    }
    const delivery = store.markDeliveryRead(principal.installationId, notificationId);
    if (!delivery) {
      return await reply.code(404).send({ error: "Delivery not found." });
    }
    return {
      delivery,
    };
  });

  app.post(clawApiPath("client/receipts/:receiptId/ack"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "installation");
    if (!principal || principal.kind !== "installation") return null;
    const receiptId = asString((request.params as Record<string, unknown>).receiptId);
    if (!receiptId) {
      return await reply.code(400).send({ error: "receiptId is required." });
    }
    const receipt = store.acknowledgeReceipt(receiptId, principal.installationId);
    if (!receipt) {
      return await reply.code(404).send({ error: "Receipt not found." });
    }
    return {
      receipt,
    };
  });

  app.put(clawApiPath("subscriptions"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "installation");
    if (!principal || principal.kind !== "installation") return null;
    const body = readBody(request);
    const filter: SubscriptionFilter = {
      ...(asString(body.sourceAppId) ? { sourceAppId: asString(body.sourceAppId) } : {}),
      ...(asString(body.clientAppId) ? { clientAppId: asString(body.clientAppId) } : {}),
      ...(asString(body.projectId) ? { projectId: asString(body.projectId) } : {}),
      ...(asString(body.agentId) ? { agentId: asString(body.agentId) } : {}),
      ...(asString(body.workspaceId) ? { workspaceId: asString(body.workspaceId) } : {}),
      ...(asString(body.eventType) ? { eventType: asString(body.eventType) } : {}),
      ...(asString(body.severity) ? { severity: asString(body.severity) } : {}),
      ...(body.minPriority === "passive" || body.minPriority === "normal" || body.minPriority === "time-sensitive" || body.minPriority === "critical"
        ? { minPriority: body.minPriority }
        : {}),
      ...(body.action === "mute" ? { action: "mute" } : { action: "allow" }),
    };
    const installationScoped = body.installationScoped === true;
    const subscription = store.upsertSubscription({
      id: asString(body.id),
      tenantId: principal.tenantId,
      userId: principal.userId,
      installationId: installationScoped ? principal.installationId : null,
      filter,
    });
    return {
      subscription,
    };
  });

  app.delete(clawApiPath("subscriptions/:id"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "installation");
    if (!principal || principal.kind !== "installation") return null;
    const id = asString((request.params as Record<string, unknown>).id);
    if (!id) {
      return await reply.code(400).send({ error: "subscription id is required." });
    }
    const deleted = store.deleteSubscription({
      id,
      tenantId: principal.tenantId,
      userId: principal.userId,
    });
    if (!deleted) {
      return await reply.code(404).send({ error: "Subscription not found." });
    }
    return {
      ok: true,
    };
  });

  app.put(clawApiPath("glances/:scope"), async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, "source");
    if (!principal || principal.kind !== "source") return null;
    const scope = asString((request.params as Record<string, unknown>).scope);
    if (!scope) {
      return await reply.code(400).send({ error: "scope is required." });
    }
    const body = readBody(request);
    const tenantId = asString(body.tenantId) ?? principal.tenantId;
    if (tenantId !== principal.tenantId) {
      return await reply.code(403).send({ error: "tenant mismatch for source token" });
    }
    const glance = store.upsertGlance({
      tenantId,
      sourceAppId: principal.sourceAppId,
      scope,
      userId: asString(body.userId) ?? null,
      clientAppId: asString(body.clientAppId) ?? null,
      data: isRecord(body.data) ? body.data : {},
    });
    return {
      glance,
    };
  });

  return {
    app,
    auth,
    store,
    config,
  };
}
