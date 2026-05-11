import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { AuthClaims } from "../shared/protocol.ts";
import { MagicLinkService, loadMagicLinkConfig } from "./auth/magic-link.ts";
import { PreauthKeyService } from "./auth/preauth-keys.ts";
import type { RelayAuthService } from "./auth.ts";
import type { RelayConfig } from "./config.ts";
import type { RelayDatabase } from "./db.ts";
import type { IrohRelayHost } from "./iroh-relay-host.ts";
import type { RelayLogger } from "./logger.ts";

export interface CoordinatorPluginOptions {
  config: RelayConfig;
  db: RelayDatabase;
  auth: RelayAuthService;
  logger: RelayLogger;
  irohRelayHost: IrohRelayHost;
}

const DEVICE_SCOPES = [
  "tenant:read",
  "device:read",
  "device:write",
  "agent:read",
  "workspace:read",
  "workspace:data",
  "chat:read",
  "chat:write",
  "chat:stream",
];

function parseBearer(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

async function requireUserClaims(
  request: FastifyRequest,
  reply: FastifyReply,
  auth: RelayAuthService,
): Promise<AuthClaims | null> {
  const token = parseBearer(request);
  if (!token) {
    await reply.code(401).send({ error: "missing_bearer" });
    return null;
  }
  try {
    return await auth.verifyAccessToken(token);
  } catch {
    await reply.code(401).send({ error: "invalid_bearer" });
    return null;
  }
}

export async function registerCoordinatorPlugin(
  app: FastifyInstance,
  options: CoordinatorPluginOptions,
): Promise<void> {
  const { config, db, auth, logger, irohRelayHost } = options;
  const magicLink = new MagicLinkService(db, logger, loadMagicLinkConfig(config));
  const preauthKeys = new PreauthKeyService(db);

  app.get("/v1/coordinator/health", async () => ({
    ok: true,
    service: "clawjs-relay-coordinator",
    irohRelay: irohRelayHost.describe(),
  }));

  app.get("/v1/coordinator/metadata", async () => ({
    coordinatorUrl: config.publicBaseUrl,
    irohRelay: irohRelayHost.describe(),
    heartbeatIntervalMs: config.heartbeatIntervalMs,
    signalingPollIntervalSec: config.pairingPollIntervalSec,
  }));

  app.post<{ Body: {
    email: string;
    tenantId?: string;
    purpose?: "sign-in" | "device-register";
    deviceLabel?: string;
    platform?: string;
  } }>(
    "/v1/auth/magic-link/start",
    async (request, reply) => {
      const body = request.body ?? ({} as { email: string });
      if (!body || typeof body.email !== "string" || !body.email.includes("@")) {
        await reply.code(400).send({ error: "invalid_email" });
        return;
      }
      const result = await magicLink.issue({
        email: body.email.trim(),
        ...(body.tenantId ? { tenantId: body.tenantId } : {}),
        ...(body.purpose ? { purpose: body.purpose } : {}),
        ...(body.deviceLabel ? { deviceLabel: body.deviceLabel } : {}),
        ...(body.platform ? { platform: body.platform } : {}),
      });
      await reply.send({ delivered: result.delivered, reason: result.reason ?? null });
    },
  );

  app.post<{ Body: { token: string; deviceLabel?: string; platform?: string; platformVersion?: string; irohNodeId?: string } }>(
    "/v1/auth/magic-link/consume",
    async (request, reply) => {
      const body = request.body ?? ({} as { token: string });
      if (!body || typeof body.token !== "string" || body.token.length < 10) {
        await reply.code(400).send({ error: "invalid_token" });
        return;
      }
      const consumed = magicLink.consume(body.token);
      if (!consumed) {
        await reply.code(400).send({ error: "invalid_or_expired_token" });
        return;
      }
      db.ensureTenant(consumed.tenantId, consumed.tenantId);
      const user = db.createUserForEmail(consumed.email, "user");
      db.ensureTenantMembership(user.id, consumed.tenantId, DEVICE_SCOPES);
      const label = body.deviceLabel ?? consumed.deviceLabel ?? `${consumed.email}-${Date.now()}`;
      const platform = body.platform ?? consumed.platform ?? null;
      const device = db.registerDeviceWithIroh({
        userId: user.id,
        tenantId: consumed.tenantId,
        label,
        ...(platform ? { platform } : {}),
        ...(body.platformVersion ? { platformVersion: body.platformVersion } : {}),
        ...(body.irohNodeId ? { irohNodeId: body.irohNodeId } : {}),
      });
      const tokens = await auth.issueTokenPair({
        userId: user.id,
        email: consumed.email,
        role: "user",
        tenantId: consumed.tenantId,
        scopes: DEVICE_SCOPES,
        deviceId: device.deviceId,
      });
      await reply.send({
        deviceId: device.deviceId,
        tenantId: consumed.tenantId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresInSec: tokens.expiresInSec,
        coordinator: {
          publicBaseUrl: config.publicBaseUrl,
          irohRelay: irohRelayHost.describe(),
        },
      });
    },
  );

  app.get("/v1/auth/magic-link/callback", async (request, reply) => {
    const url = new URL(request.url, "http://relay.local");
    const token = url.searchParams.get("token");
    if (!token) {
      await reply.code(400).send({ error: "missing_token" });
      return;
    }
    await reply.header("content-type", "text/html").send(`<!doctype html>
<html><body style="font-family: -apple-system, sans-serif; padding: 24px;">
<h1>Sign-in token captured</h1>
<p>Return to the Clawix app to complete sign-in.</p>
<p><code>${token.slice(0, 8)}…</code></p>
</body></html>`);
  });

  app.post<{ Body: {
    label?: string;
    scopes?: string[];
    reusable?: boolean;
    maxUses?: number;
    ttlSec?: number;
  } }>(
    "/v1/auth/preauth-keys",
    async (request, reply) => {
      const claims = await requireUserClaims(request, reply, auth);
      if (!claims) return;
      if (claims.role !== "admin" && !claims.scopes.includes("*") && !claims.scopes.includes("device:write")) {
        await reply.code(403).send({ error: "insufficient_scope" });
        return;
      }
      const body = request.body ?? {};
      const issued = preauthKeys.create({
        tenantId: claims.tenantId,
        createdByUserId: claims.sub,
        ...(typeof body.label === "string" ? { label: body.label } : {}),
        ...(Array.isArray(body.scopes) ? { scopes: body.scopes } : {}),
        reusable: body.reusable === true,
        ...(typeof body.maxUses === "number" ? { maxUses: body.maxUses } : {}),
        ...(typeof body.ttlSec === "number" ? { ttlSec: body.ttlSec } : {}),
      });
      await reply.send(issued);
    },
  );

  app.get("/v1/auth/preauth-keys", async (request, reply) => {
    const claims = await requireUserClaims(request, reply, auth);
    if (!claims) return;
    await reply.send({ items: preauthKeys.list(claims.tenantId) });
  });

  app.delete<{ Params: { keyId: string } }>(
    "/v1/auth/preauth-keys/:keyId",
    async (request, reply) => {
      const claims = await requireUserClaims(request, reply, auth);
      if (!claims) return;
      const ok = preauthKeys.revoke(claims.tenantId, request.params.keyId);
      await reply.code(ok ? 200 : 404).send({ ok });
    },
  );

  app.post<{ Body: { token: string; label?: string; platform?: string; platformVersion?: string; irohNodeId?: string; email?: string } }>(
    "/v1/devices/register-preauth",
    async (request, reply) => {
      const body = request.body ?? ({} as { token: string });
      if (!body || typeof body.token !== "string") {
        await reply.code(400).send({ error: "invalid_token" });
        return;
      }
      const consumed = preauthKeys.consume(body.token);
      if (!consumed) {
        await reply.code(400).send({ error: "invalid_or_expired_key" });
        return;
      }
      db.ensureTenant(consumed.tenantId, consumed.tenantId);
      const email = (body.email ?? `device-${Date.now()}@preauth.local`).toLowerCase();
      const user = db.createUserForEmail(email, "user");
      db.ensureTenantMembership(user.id, consumed.tenantId, consumed.scopes);
      const label = body.label ?? `preauth-${Date.now()}`;
      const device = db.registerDeviceWithIroh({
        userId: user.id,
        tenantId: consumed.tenantId,
        label,
        ...(body.platform ? { platform: body.platform } : {}),
        ...(body.platformVersion ? { platformVersion: body.platformVersion } : {}),
        ...(body.irohNodeId ? { irohNodeId: body.irohNodeId } : {}),
        preauthKeyId: consumed.keyId,
      });
      const tokens = await auth.issueTokenPair({
        userId: user.id,
        email,
        role: "user",
        tenantId: consumed.tenantId,
        scopes: consumed.scopes,
        deviceId: device.deviceId,
      });
      await reply.send({
        deviceId: device.deviceId,
        tenantId: consumed.tenantId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresInSec: tokens.expiresInSec,
        coordinator: {
          publicBaseUrl: config.publicBaseUrl,
          irohRelay: irohRelayHost.describe(),
        },
      });
    },
  );

  app.get("/v1/devices", async (request, reply) => {
    const claims = await requireUserClaims(request, reply, auth);
    if (!claims) return;
    const devices = db.listTenantDevices(claims.tenantId);
    await reply.send({ items: devices });
  });

  app.delete<{ Params: { deviceId: string } }>(
    "/v1/devices/:deviceId",
    async (request, reply) => {
      const claims = await requireUserClaims(request, reply, auth);
      if (!claims) return;
      const device = db.getDevice(request.params.deviceId);
      if (!device || device.tenantId !== claims.tenantId) {
        await reply.code(404).send({ error: "device_not_found" });
        return;
      }
      db.revokeDevice(device.deviceId);
      await reply.send({ ok: true });
    },
  );

  app.post<{ Body: { irohNodeId?: string; relayUrl?: string; publicAddrs?: string[] } }>(
    "/v1/devices/heartbeat",
    async (request, reply) => {
      const claims = await requireUserClaims(request, reply, auth);
      if (!claims) return;
      if (!claims.deviceId) {
        await reply.code(400).send({ error: "missing_device_id" });
        return;
      }
      const body = request.body ?? {};
      db.upsertDeviceEndpoint({
        deviceId: claims.deviceId,
        ...(typeof body.irohNodeId === "string" ? { irohNodeId: body.irohNodeId } : {}),
        ...(typeof body.relayUrl === "string" ? { relayUrl: body.relayUrl } : {}),
        ...(Array.isArray(body.publicAddrs)
          ? { publicAddrs: body.publicAddrs.filter((entry) => typeof entry === "string") }
          : {}),
      });
      if (typeof body.irohNodeId === "string" && body.irohNodeId.length > 0) {
        db.setDeviceIrohNodeId(claims.deviceId, body.irohNodeId);
      }
      const pending = db.drainSignalingFor(claims.tenantId, claims.deviceId);
      await reply.send({
        ok: true,
        signaling: pending,
        nextHeartbeatMs: config.heartbeatIntervalMs,
      });
    },
  );

  app.get("/v1/peers", async (request, reply) => {
    const claims = await requireUserClaims(request, reply, auth);
    if (!claims) return;
    const peers = db.listPeerEndpointsForTenant(
      claims.tenantId,
      claims.deviceId,
    );
    await reply.send({
      items: peers,
      irohRelay: irohRelayHost.describe(),
    });
  });

  app.post<{ Body: { toDeviceId: string; payload: unknown; ttlSec?: number } }>(
    "/v1/signaling/send",
    async (request, reply) => {
      const claims = await requireUserClaims(request, reply, auth);
      if (!claims) return;
      if (!claims.deviceId) {
        await reply.code(400).send({ error: "missing_device_id" });
        return;
      }
      const body = request.body ?? ({} as { toDeviceId: string; payload: unknown });
      if (!body || typeof body.toDeviceId !== "string") {
        await reply.code(400).send({ error: "invalid_target" });
        return;
      }
      const target = db.getDevice(body.toDeviceId);
      if (!target || target.tenantId !== claims.tenantId || target.revokedAt) {
        await reply.code(404).send({ error: "target_not_found" });
        return;
      }
      const enqueued = db.enqueueSignaling({
        tenantId: claims.tenantId,
        fromDeviceId: claims.deviceId,
        toDeviceId: body.toDeviceId,
        payload: body.payload,
        ttlSec: typeof body.ttlSec === "number" ? Math.min(Math.max(body.ttlSec, 5), 60) : 30,
      });
      await reply.send({ ok: true, id: enqueued.id });
    },
  );

  app.get("/v1/signaling/pull", async (request, reply) => {
    const claims = await requireUserClaims(request, reply, auth);
    if (!claims) return;
    if (!claims.deviceId) {
      await reply.code(400).send({ error: "missing_device_id" });
      return;
    }
    const items = db.drainSignalingFor(claims.tenantId, claims.deviceId);
    await reply.send({ items });
  });

  app.get("/v1/tenants/:tenantId/members", async (request, reply) => {
    const claims = await requireUserClaims(request, reply, auth);
    if (!claims) return;
    const params = request.params as { tenantId: string };
    if (claims.tenantId !== params.tenantId) {
      await reply.code(403).send({ error: "tenant_mismatch" });
      return;
    }
    await reply.send({ items: db.listTenantMembers(params.tenantId) });
  });
}
