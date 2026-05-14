const STABLE_EVENT_TYPES = {
  browserState: "browser.state",
  browserFrame: "browser.frame",
  browserError: "browser.error",
} as const;
import { clawApiPath } from "@clawjs/core";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { BrowserFrameEvent, BrowserInputCommand, BrowserSessionSnapshot } from "../../../browser/shared/types.ts";
import {
  deriveAssignmentWorkspaceId,
  deriveRuntimeAgentId,
  type ProjectResourceRef,
  type ProjectSecretRef,
} from "../shared/project-model.ts";
import { RelayAuthService } from "./auth.ts";
import { loadRelayConfig, type RelayConfig } from "./config.ts";
import { ConnectorRegistry, OfflineError } from "./connector-registry.ts";
import { registerCoordinatorPlugin } from "./coordinator-plugin.ts";
import { RelayDatabase } from "./db.ts";
import { IrohRelayHost, loadIrohRelayHostOptions } from "./iroh-relay-host.ts";
import { RelayLogger } from "./logger.ts";
import { MonitorBus } from "./monitor-bus.ts";
import { registerMonitorRoutes } from "./monitor-routes.ts";
import { MemoryRateLimiter } from "./rate-limit.ts";
import { registerWorkspaceRoutes } from "./workspace-routes.ts";
import {
  assignmentWorkspaceParams,
  authorizeTenant,
  browserActorFromClaims,
  browserSharePath,
  browserShareUrl,
  ensureScope,
  ensureWorkspaceAccess,
  filteredResponseHeaders,
  filteredServiceHeaders,
  forwardIotEventStream,
  forwardIotJson,
  invokeProjectAssignment,
  invokeWorkspace,
  isLoopbackHost,
  isSecureRequest,
  normalizeUploadData,
  parseBearerToken,
  parseProjectResourceRefs,
  parseProjectSecretRefs,
  parseServiceRelayToken,
  parseWebSocketAccessToken,
  readRequestBody,
  requireClaims,
  requireProjectAssignmentAccess,
  requireRateLimit,
  requireSecureTransport,
  requireServiceClaims,
  resolveConnectorId,
  serviceBodyBase64,
  servicePathFromRequest,
  tokensFromText,
  type ProjectAgentParams,
  type WorkspaceParams,
} from "./app-helpers.ts";

interface RelayAppOptions {
  config?: Partial<RelayConfig>;
  logger?: RelayLogger;
}

function resolveBrandRoot(): string {
  const candidates = [
    fileURLToPath(new URL("../../../public", import.meta.url)),
    fileURLToPath(new URL("../../public", import.meta.url)),
    path.join(process.cwd(), "../public"),
    path.join(process.cwd(), "public"),
  ];
  return candidates.find((candidate) => (
    existsSync(path.join(candidate, "logo.png")) &&
    existsSync(path.join(candidate, "favicon.ico"))
  )) ?? candidates[0];
}

export async function buildRelayApp(options: RelayAppOptions = {}) {
  const config = loadRelayConfig(options.config);
  const logger = options.logger ?? new RelayLogger();
  const db = new RelayDatabase(config.dbPath);
  const auth = new RelayAuthService(config, db);
  const monitor = new MonitorBus();
  const registry = new ConnectorRegistry(db, logger, config.requestTimeoutMs);
  const rateLimiter = new MemoryRateLimiter();
  const app = Fastify({ logger: false });

  app.addContentTypeParser("*", { parseAs: "buffer" }, (_request, body, done) => {
    done(null, body);
  });

  const materializeProjectAssignment = async (input: {
    tenantId: string;
    projectId: string;
    agentId: string;
    displayName?: string;
    instructions?: string;
    resourceRefs?: ProjectResourceRef[];
    secretRefs?: ProjectSecretRef[];
  }) => {
    const project = db.getProject(input.tenantId, input.projectId);
    if (!project) {
      throw new Error(`Unknown project: ${input.projectId}`);
    }
    const agent = db.getAgent(input.tenantId, input.agentId);
    if (!agent) {
      throw new Error(`Unknown agent: ${input.agentId}`);
    }

    const workspaceId = deriveAssignmentWorkspaceId(input.projectId, input.agentId);
    const runtimeAgentId = deriveRuntimeAgentId(input.projectId, input.agentId);
    const displayName = input.displayName ?? `${project.displayName} / ${agent.displayName}`;

    const result = await registry.invoke({
      tenantId: input.tenantId,
      connectorId: resolveConnectorId(db, input.tenantId, input.agentId),
      agentId: input.agentId,
      workspaceId,
      operation: "admin.workspace.create",
      payload: {
        workspaceId,
        displayName,
        projectId: project.projectId,
        projectDisplayName: project.displayName,
        projectDescription: project.description,
        projectInstructions: project.instructions,
        logicalAgentId: agent.agentId,
        logicalAgentDisplayName: agent.displayName,
        logicalAgentRole: agent.role,
        logicalAgentDescription: agent.description,
        agentInstructions: agent.instructions,
        runtimeAgentId,
        assignmentDisplayName: displayName,
        assignmentInstructions: input.instructions,
        projectResourceRefs: project.resourceRefs,
        projectSecretRefs: project.secretRefs,
        agentResourceRefs: agent.resourceRefs,
        agentSecretRefs: agent.secretRefs,
        assignmentResourceRefs: input.resourceRefs ?? [],
        assignmentSecretRefs: input.secretRefs ?? [],
        materializationVersion: 1,
      },
    });

    db.upsertWorkspaces(input.tenantId, input.agentId, [{
      workspaceId,
      displayName: typeof result.displayName === "string" ? result.displayName : displayName,
    }]);

    return db.upsertProjectAssignment({
      tenantId: input.tenantId,
      projectId: input.projectId,
      agentId: input.agentId,
      workspaceId,
      runtimeAgentId,
      displayName,
      instructions: input.instructions,
      resourceRefs: input.resourceRefs ?? [],
      secretRefs: input.secretRefs ?? [],
    });
  };

  if (config.corsOrigins.length > 0) {
    await app.register(cors, {
      origin: config.corsOrigins,
      credentials: true,
    });
  }

  await app.register(websocket);

  const irohRelayHost = new IrohRelayHost(config, logger, loadIrohRelayHostOptions());
  if (irohRelayHost.isEnabled()) {
    irohRelayHost.start();
  }
  await registerCoordinatorPlugin(app, { config, db, auth, logger, irohRelayHost });
  app.addHook("onClose", async () => {
    irohRelayHost.stop();
  });

  app.get(clawApiPath("health"), async () => ({
    ok: true,
    service: "clawjs-relay",
    uptimeSeconds: Math.round(process.uptime()),
  }));

  const serviceHttpHandler = async (
    request: FastifyRequest<{ Params: { tenantId: string; serviceId: string; "*": string } }>,
    reply: FastifyReply,
  ) => {
    const claims = await requireServiceClaims(request, reply, auth, "workspace:data");
    if (!claims) return null;
    try {
      authorizeTenant(claims, request.params.tenantId);
    } catch (error) {
      await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
      return null;
    }
    const service = registry.resolveService({
      tenantId: request.params.tenantId,
      serviceId: request.params.serviceId,
    });
    if (!service) {
      await reply.code(503).send({ error: "service_unavailable", message: `Service ${request.params.serviceId} is not connected.` });
      return null;
    }

    const abort = new AbortController();
    const abortUpstream = () => abort.abort();
    request.raw.once("close", abortUpstream);
    let streamed = false;
    try {
      const result = await registry.invoke({
        tenantId: request.params.tenantId,
        connectorId: service.connectorId,
        agentId: service.agentId,
        operation: "service.http",
        payload: {
          serviceId: request.params.serviceId,
          method: request.method,
          path: servicePathFromRequest(request),
          headers: filteredServiceHeaders(request),
          bodyBase64: serviceBodyBase64(request),
        },
        signal: abort.signal,
        timeoutMs: request.headers.accept?.includes("text/event-stream") ? 0 : undefined,
        onStream: (event) => {
          if (event.event === "service.response") {
            streamed = true;
            const headers = filteredResponseHeaders((event.payload.headers ?? {}) as Record<string, unknown>);
            reply.raw.writeHead(Number(event.payload.status ?? 200), {
              ...headers,
              "cache-control": headers["cache-control"] ?? "no-cache, no-transform",
            });
            return;
          }
          if (event.event === "service.chunk" && typeof event.payload.bodyBase64 === "string") {
            reply.raw.write(Buffer.from(event.payload.bodyBase64, "base64"));
          }
        },
      });
      if (streamed) {
        if (!reply.raw.destroyed && !reply.raw.writableEnded) reply.raw.end();
        return reply;
      }
      const status = Number(result.status ?? 200);
      for (const [key, value] of Object.entries(filteredResponseHeaders((result.headers ?? {}) as Record<string, unknown>))) {
        reply.header(key, value);
      }
      const body = typeof result.bodyBase64 === "string" ? Buffer.from(result.bodyBase64, "base64") : Buffer.alloc(0);
      return await reply.code(status).send(body);
    } catch (error) {
      if (abort.signal.aborted) return null;
      if (error instanceof OfflineError) {
        await reply.code(503).send({ error: "offline", message: error.message });
        return null;
      }
      await reply.code(502).send({ error: "service_gateway_error", message: error instanceof Error ? error.message : String(error) });
      return null;
    } finally {
      request.raw.off("close", abortUpstream);
    }
  };

  const serviceRouteMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;
  for (const method of serviceRouteMethods) {
    app.route({
      method,
      url: clawApiPath("tenants/:tenantId/services/:serviceId"),
      handler: serviceHttpHandler,
    });
    app.route({
      method,
      url: clawApiPath("tenants/:tenantId/services/:serviceId/*"),
      handler: serviceHttpHandler,
    });
  }

  app.get(clawApiPath("tenants/:tenantId/services/:serviceId/_ws/*"), { websocket: true }, async (socket, request) => {
    const typedRequest = request as FastifyRequest<{ Params: { tenantId: string; serviceId: string; "*": string } }>;
    const token = parseServiceRelayToken(typedRequest);
    if (!token) {
      socket.close(1008, "missing_relay_token");
      return;
    }
    let claims: AuthClaims;
    try {
      claims = await auth.verifyAccessToken(token);
      if (!ensureScope(claims, "workspace:data")) throw new Error("missing scope");
      authorizeTenant(claims, typedRequest.params.tenantId);
    } catch {
      socket.close(1008, "invalid_relay_token");
      return;
    }
    const service = registry.resolveService({
      tenantId: typedRequest.params.tenantId,
      serviceId: typedRequest.params.serviceId,
    });
    if (!service) {
      socket.close(1013, "service_unavailable");
      return;
    }

    const channelId = randomUUID();
    const abort = new AbortController();
    let opened = false;
    const queued: Array<{ data: Buffer; isBinary: boolean }> = [];
    const flushQueue = async () => {
      if (!opened) return;
      while (queued.length > 0) {
        const item = queued.shift()!;
        await registry.invoke({
          tenantId: typedRequest.params.tenantId,
          connectorId: service.connectorId,
          agentId: service.agentId,
          operation: "service.websocket.send",
          payload: {
            channelId,
            isBinary: item.isBinary,
            bodyBase64: item.data.toString("base64"),
          },
        }).catch(() => {});
      }
    };

    const openPromise = registry.invoke({
      tenantId: typedRequest.params.tenantId,
      connectorId: service.connectorId,
      agentId: service.agentId,
      operation: "service.websocket.open",
      payload: {
        channelId,
        serviceId: typedRequest.params.serviceId,
        path: (() => {
          const parsed = new URL(typedRequest.url, "http://relay.local");
          parsed.searchParams.delete("relay_access_token");
          const query = parsed.searchParams.toString();
          return `/${typedRequest.params["*"] ?? ""}${query ? `?${query}` : ""}`;
        })(),
        headers: filteredServiceHeaders(typedRequest),
      },
      signal: abort.signal,
      timeoutMs: 0,
      onStream: (event) => {
        if (event.event === "service.websocket.opened") {
          opened = true;
          void flushQueue();
          return;
        }
        if (event.event === "service.websocket.message" && typeof event.payload.bodyBase64 === "string") {
          const data = Buffer.from(event.payload.bodyBase64, "base64");
          socket.send(event.payload.isBinary === true ? data : data.toString("utf8"));
          return;
        }
        if (event.event === "service.websocket.closed") {
          socket.close(Number(event.payload.code ?? 1000), typeof event.payload.reason === "string" ? event.payload.reason : "service_closed");
        }
      },
    }).catch(() => {
      if (socket.readyState === 1) socket.close(1011, "service_gateway_error");
    });

    socket.on("message", (data, isBinary) => {
      const buffer = Buffer.isBuffer(data)
        ? data
        : Array.isArray(data)
          ? Buffer.concat(data)
          : Buffer.from(data);
      if (!opened) {
        queued.push({ data: buffer, isBinary });
        return;
      }
      void registry.invoke({
        tenantId: typedRequest.params.tenantId,
        connectorId: service.connectorId,
        agentId: service.agentId,
        operation: "service.websocket.send",
        payload: {
          channelId,
          isBinary,
          bodyBase64: buffer.toString("base64"),
        },
      }).catch(() => {});
    });
    socket.once("close", () => {
      abort.abort();
      if (opened) {
        void registry.invoke({
          tenantId: typedRequest.params.tenantId,
          connectorId: service.connectorId,
          agentId: service.agentId,
          operation: "service.websocket.close",
          payload: { channelId },
        }).catch(() => {});
      }
    });
    await openPromise;
  });

  registerMonitorRoutes({ app, auth, db, monitor });

  app.post(clawApiPath("auth/login"), async (request, reply) => {
    if (!await requireSecureTransport(request, reply, config)) return;
    if (!await requireRateLimit(request, reply, rateLimiter, "login", config.loginRateLimitWindowMs, config.loginRateLimitMax)) return;
    const body = await readRequestBody(request);
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const tenantId = typeof body.tenantId === "string" && body.tenantId.trim() ? body.tenantId.trim() : "demo-tenant";

    const user = db.getUserByEmail(email);
    if (!user || !await db.verifyPassword(user, password)) {
      return await reply.code(401).send({ error: "invalid_credentials" });
    }

    const membership = db.getMembership(user.id, tenantId);
    if (!membership) {
      return await reply.code(403).send({ error: "no_membership" });
    }

    const device = db.createDevice({
      userId: user.id,
      tenantId,
      label: typeof body.deviceLabel === "string" && body.deviceLabel.trim() ? body.deviceLabel.trim() : `${email} device`,
      ...(typeof body.devicePlatform === "string" && body.devicePlatform.trim() ? { platform: body.devicePlatform.trim() } : {}),
    });
    const tokens = await auth.issueTokenPair({
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId,
      scopes: membership.scopes,
      deviceId: device.deviceId,
    });
    return {
      tenantId,
      role: user.role,
      scopes: membership.scopes,
      deviceId: device.deviceId,
      ...tokens,
    };
  });

  app.post(clawApiPath("auth/refresh"), async (request, reply) => {
    if (!await requireSecureTransport(request, reply, config)) return;
    const body = await readRequestBody(request);
    const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken : "";
    const consumed = db.consumeRefreshToken(refreshToken);
    if (!consumed) {
      return await reply.code(401).send({ error: "invalid_refresh_token" });
    }
    const user = db.getUserById(consumed.userId);
    if (!user) {
      return await reply.code(401).send({ error: "invalid_refresh_token" });
    }
    if (consumed.deviceId) db.touchDevice(consumed.deviceId);
    const tokens = await auth.issueTokenPair({
      userId: consumed.userId,
      email: user.email,
      role: user.role,
      tenantId: consumed.tenantId,
      scopes: consumed.scopes,
      ...(consumed.deviceId ? { deviceId: consumed.deviceId } : {}),
      ...(consumed.agentId ? { agentId: consumed.agentId } : {}),
      ...(consumed.workspaceId ? { workspaceId: consumed.workspaceId } : {}),
    });
    return {
      tenantId: consumed.tenantId,
      role: user.role,
      scopes: consumed.scopes,
      ...(consumed.deviceId ? { deviceId: consumed.deviceId } : {}),
      ...tokens,
    };
  });

  app.post(clawApiPath("auth/logout"), async (request, reply) => {
    if (!await requireSecureTransport(request, reply, config)) return;
    const body = await readRequestBody(request);
    const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken : "";
    db.revokeRefreshToken(refreshToken);
    return await reply.send({ ok: true });
  });

  app.get(clawApiPath("me/devices"), async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "tenant:read");
    if (!claims) return;
    return {
      devices: db.listDevices(claims.sub, claims.tenantId),
    };
  });

  app.get(clawApiPath("me/workspaces"), async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "workspace:read");
    if (!claims) return;
    if (claims.deviceId) {
      return { workspaces: db.listGrantedWorkspacesForDevice(claims.tenantId, claims.deviceId) };
    }
    return {
      workspaces: db.listAgents(claims.tenantId).flatMap((agent) => db.listWorkspaces(claims.tenantId, agent.agentId).map((workspace) => ({
        agentId: agent.agentId,
        workspaceId: workspace.workspaceId,
        displayName: workspace.displayName,
      }))),
    };
  });

  app.post(clawApiPath("connectors/device/start"), async (request, reply) => {
    if (!await requireSecureTransport(request, reply, config)) return;
    if (!await requireRateLimit(request, reply, rateLimiter, "pairing-start", config.pairingStartRateLimitWindowMs, config.pairingStartRateLimitMax)) return;
    const body = await readRequestBody(request);
    const requestedConnectorId = typeof body.connectorId === "string" && body.connectorId.trim()
      ? body.connectorId.trim()
      : randomUUID();
    const requestedAgentId = typeof body.agentId === "string" && body.agentId.trim()
      ? body.agentId.trim()
      : requestedConnectorId;
    const started = db.createPairingSession({
      connectorId: requestedConnectorId,
      agentId: requestedAgentId,
      ...(typeof body.displayName === "string" && body.displayName.trim() ? { displayName: body.displayName.trim() } : {}),
      expiresSec: config.pairingExpiresSec,
    });
    const verificationUri = new URL("/settings", config.publicBaseUrl).toString();
    const verificationUriComplete = new URL(`/settings?pairingId=${started.pairingId}&user_code=${encodeURIComponent(started.userCode)}`, config.publicBaseUrl).toString();
    return {
      pairingId: started.pairingId,
      connectorId: requestedConnectorId,
      agentId: requestedAgentId,
      deviceCode: started.deviceCode,
      userCode: started.userCode,
      verificationUri,
      verificationUriComplete,
      qrPayload: JSON.stringify({
        relayUrl: config.publicBaseUrl,
        pairingId: started.pairingId,
        userCode: started.userCode,
        verificationUriComplete,
      }),
      intervalSec: config.pairingPollIntervalSec,
      expiresInSec: Math.max(1, Math.round((started.expiresAt - Date.now()) / 1000)),
    };
  });

  app.post(clawApiPath("connectors/device/poll"), async (request, reply) => {
    if (!await requireSecureTransport(request, reply, config)) return;
    if (!await requireRateLimit(request, reply, rateLimiter, "pairing-poll", config.pairingPollRateLimitWindowMs, config.pairingPollRateLimitMax)) return;
    const body = await readRequestBody(request);
    const deviceCode = typeof body.deviceCode === "string" ? body.deviceCode : "";
    const result = db.consumeApprovedPairing(deviceCode);
    if ("status" in result) {
      if (result.status === "pending") return await reply.code(200).send({ status: "authorization_pending" });
      if (result.status === "denied") return await reply.code(403).send({ status: "access_denied" });
      if (result.status === "expired") return await reply.code(410).send({ status: "expired_token" });
      if (result.status === "already_used") return await reply.code(409).send({ status: "already_used" });
      return await reply.code(400).send({ status: "invalid_device_code" });
    }
    return {
      status: "approved",
      pairingId: result.pairingId,
      tenantId: result.tenantId,
      connectorId: result.connectorId,
      agentId: result.agentId,
      connectorToken: result.connectorToken,
    };
  });

  app.post(clawApiPath("pairings/:pairingId/approve"), async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "tenant:read");
    if (!claims) return;
    const { pairingId } = request.params as { pairingId: string };
    const approved = db.approvePairing(pairingId, {
      tenantId: claims.tenantId,
      approvedByUserId: claims.sub,
    });
    if (!approved) {
      return await reply.code(404).send({ error: "pairing_not_pending" });
    }
    return { pairing: approved };
  });

  app.post(clawApiPath("pairings/:pairingId/deny"), async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "tenant:read");
    if (!claims) return;
    const { pairingId } = request.params as { pairingId: string };
    const denied = db.denyPairing(pairingId);
    if (!denied) {
      return await reply.code(404).send({ error: "pairing_not_pending" });
    }
    return { ok: true };
  });

  app.post(clawApiPath("connector/enroll"), async (request, reply) => {
    const body = await readRequestBody(request);
    const enrollmentToken = typeof body.enrollmentToken === "string" ? body.enrollmentToken : "";
    const result = db.consumeEnrollment(enrollmentToken);
    if (!result) {
      return await reply.code(401).send({ error: "invalid_enrollment_token" });
    }
    return result;
  });

  app.get(clawApiPath("connector/connect"), { websocket: true }, async (socket, request) => {
    const fastifyRequest = request as unknown as FastifyRequest;
    const host = fastifyRequest.headers.host ?? new URL(config.publicBaseUrl).host;
    if (!isLoopbackHost(host) && !isSecureRequest(fastifyRequest)) {
      socket.close();
      return;
    }
    const token = parseBearerToken(request as unknown as FastifyRequest);
    if (!token) {
      socket.close();
      return;
    }
    const authContext = db.verifyConnectorToken(token);
    if (!authContext) {
      socket.close();
      return;
    }
    registry.attach(socket as any, authContext);
  });

  app.post(clawApiPath("admin/connectors/enrollments"), async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "admin:*");
    if (!claims) return;
    const body = await readRequestBody(request);
    const tenantId = typeof body.tenantId === "string" && body.tenantId.trim() ? body.tenantId.trim() : claims.tenantId;
    const agentId = typeof body.agentId === "string" && body.agentId.trim() ? body.agentId.trim() : "";
    const description = typeof body.description === "string" ? body.description : undefined;
    if (!agentId) {
      return await reply.code(400).send({ error: "agentId is required" });
    }
    const enrollmentToken = db.createEnrollment(tenantId, agentId, description);
    return {
      tenantId,
      agentId,
      enrollmentToken,
    };
  });

  app.post(clawApiPath("admin/connectors/:connectorId/revoke"), async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "admin:*");
    if (!claims) return;
    const { connectorId } = request.params as { connectorId: string };
    const body = await readRequestBody(request);
    const tenantId = typeof body.tenantId === "string" && body.tenantId.trim() ? body.tenantId.trim() : claims.tenantId;
    try {
      authorizeTenant(claims, tenantId);
    } catch (error) {
      return await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
    }
    const revoked = db.revokeConnector(tenantId, connectorId);
    registry.revoke(tenantId, connectorId);
    if (!revoked) {
      return await reply.code(404).send({ error: "connector_not_found" });
    }
    return { ok: true, connectorId };
  });

  app.get(clawApiPath("tenants/:tenantId/agents"), async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "agent:read");
    if (!claims) return;
    const { tenantId } = request.params as { tenantId: string };
    try {
      authorizeTenant(claims, tenantId);
    } catch (error) {
      return await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
    }
    return { agents: db.listAgents(tenantId) };
  });

  app.get(clawApiPath("tenants/:tenantId/projects"), async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "agent:read");
    if (!claims) return;
    const { tenantId } = request.params as { tenantId: string };
    try {
      authorizeTenant(claims, tenantId);
    } catch (error) {
      return await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
    }
    return { projects: db.listProjects(tenantId) };
  });

  app.post(clawApiPath("tenants/:tenantId/projects"), async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "admin:*");
    if (!claims) return;
    const { tenantId } = request.params as { tenantId: string };
    try {
      authorizeTenant(claims, tenantId);
    } catch (error) {
      return await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
    }
    const body = await readRequestBody(request);
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    if (!projectId || !displayName) {
      return await reply.code(400).send({ error: "projectId and displayName are required" });
    }
    const project = db.upsertProject({
      tenantId,
      projectId,
      displayName,
      ...(typeof body.description === "string" ? { description: body.description } : {}),
      ...(typeof body.instructions === "string" ? { instructions: body.instructions } : {}),
      resourceRefs: parseProjectResourceRefs(body.resourceRefs),
      secretRefs: parseProjectSecretRefs(body.secretRefs),
    });
    return { project };
  });

  app.get(clawApiPath("tenants/:tenantId/projects/:projectId"), async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "agent:read");
    if (!claims) return;
    const params = request.params as { tenantId: string; projectId: string };
    try {
      authorizeTenant(claims, params.tenantId);
    } catch (error) {
      return await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
    }
    const project = db.getProject(params.tenantId, params.projectId);
    if (!project) {
      return await reply.code(404).send({ error: "project_not_found" });
    }
    return { project };
  });

  app.patch(clawApiPath("tenants/:tenantId/projects/:projectId"), async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "admin:*");
    if (!claims) return;
    const params = request.params as { tenantId: string; projectId: string };
    try {
      authorizeTenant(claims, params.tenantId);
    } catch (error) {
      return await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
    }
    const current = db.getProject(params.tenantId, params.projectId);
    if (!current) {
      return await reply.code(404).send({ error: "project_not_found" });
    }
    const body = await readRequestBody(request);
    const project = db.upsertProject({
      tenantId: params.tenantId,
      projectId: params.projectId,
      displayName: typeof body.displayName === "string" && body.displayName.trim() ? body.displayName.trim() : current.displayName,
      description: typeof body.description === "string" ? body.description : current.description,
      instructions: typeof body.instructions === "string" ? body.instructions : current.instructions,
      resourceRefs: Array.isArray(body.resourceRefs) ? parseProjectResourceRefs(body.resourceRefs) : current.resourceRefs,
      secretRefs: Array.isArray(body.secretRefs) ? parseProjectSecretRefs(body.secretRefs) : current.secretRefs,
    });

    for (const assignment of db.listProjectAgents(params.tenantId, params.projectId)) {
      await materializeProjectAssignment({
        tenantId: params.tenantId,
        projectId: params.projectId,
        agentId: assignment.agentId,
        displayName: assignment.displayName,
        instructions: assignment.instructions,
        resourceRefs: assignment.resourceRefs,
        secretRefs: assignment.secretRefs,
      });
    }

    return { project };
  });

  app.get(clawApiPath("tenants/:tenantId/projects/:projectId/agents"), async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "agent:read");
    if (!claims) return;
    const params = request.params as { tenantId: string; projectId: string };
    try {
      authorizeTenant(claims, params.tenantId);
    } catch (error) {
      return await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
    }
    const project = db.getProject(params.tenantId, params.projectId);
    if (!project) {
      return await reply.code(404).send({ error: "project_not_found" });
    }
    const assignments = db.listProjectAgents(params.tenantId, params.projectId).map((assignment) => {
      const agent = db.getAgent(params.tenantId, assignment.agentId);
      return {
        ...assignment,
        ...(agent ? { agent } : {}),
      };
    });
    return { project, agents: assignments };
  });

  app.get(clawApiPath("tenants/:tenantId/agents/:agentId/projects"), async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "agent:read");
    if (!claims) return;
    const params = request.params as { tenantId: string; agentId: string };
    if (claims.tenantId !== params.tenantId || (claims.agentId && claims.agentId !== params.agentId)) {
      return await reply.code(403).send({ error: "Forbidden", message: "scope mismatch" });
    }
    const agent = db.getAgent(params.tenantId, params.agentId);
    if (!agent) {
      return await reply.code(404).send({ error: "agent_not_found" });
    }
    return {
      agent,
      projects: db.listAgentProjects(params.tenantId, params.agentId),
    };
  });

  app.post(clawApiPath("tenants/:tenantId/projects/:projectId/agents/:agentId"), async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "admin:*");
    if (!claims) return;
    const params = request.params as { tenantId: string; projectId: string; agentId: string };
    try {
      authorizeTenant(claims, params.tenantId);
    } catch (error) {
      return await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
    }
    const project = db.getProject(params.tenantId, params.projectId);
    if (!project) {
      return await reply.code(404).send({ error: "project_not_found" });
    }
    const body = await readRequestBody(request);
    db.upsertAgent(
      params.tenantId,
      params.agentId,
      typeof body.agentDisplayName === "string" && body.agentDisplayName.trim() ? body.agentDisplayName.trim() : params.agentId,
      {
        ...(typeof body.agentRole === "string" ? { role: body.agentRole } : {}),
        ...(typeof body.agentDescription === "string" ? { description: body.agentDescription } : {}),
        ...(typeof body.agentInstructions === "string" ? { instructions: body.agentInstructions } : {}),
        ...(Array.isArray(body.agentResourceRefs) ? { resourceRefs: parseProjectResourceRefs(body.agentResourceRefs) } : {}),
        ...(Array.isArray(body.agentSecretRefs) ? { secretRefs: parseProjectSecretRefs(body.agentSecretRefs) } : {}),
      },
    );

    try {
      const assignment = await materializeProjectAssignment({
        tenantId: params.tenantId,
        projectId: params.projectId,
        agentId: params.agentId,
        displayName: typeof body.displayName === "string" ? body.displayName : `${project.displayName} / ${params.agentId}`,
        instructions: typeof body.instructions === "string" ? body.instructions : undefined,
        resourceRefs: parseProjectResourceRefs(body.resourceRefs),
        secretRefs: parseProjectSecretRefs(body.secretRefs),
      });
      return { assignment };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return await reply.code(error instanceof OfflineError ? 503 : 502).send({ error: "project_assignment_create_failed", message });
    }
  });

  app.delete(clawApiPath("tenants/:tenantId/projects/:projectId/agents/:agentId"), async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "admin:*");
    if (!claims) return;
    const params = request.params as { tenantId: string; projectId: string; agentId: string };
    try {
      authorizeTenant(claims, params.tenantId);
    } catch (error) {
      return await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
    }
    const assignment = db.getProjectAssignment(params.tenantId, params.projectId, params.agentId);
    if (!assignment) {
      return await reply.code(404).send({ error: "project_agent_assignment_not_found" });
    }
    try {
      await registry.invoke({
        tenantId: params.tenantId,
        connectorId: resolveConnectorId(db, params.tenantId, params.agentId),
        agentId: params.agentId,
        workspaceId: assignment.workspaceId,
        operation: "workspace.delete",
        payload: {},
      });
    } catch {
      // Best-effort delete. The DB cleanup still proceeds.
    }
    db.deleteWorkspace(params.tenantId, params.agentId, assignment.workspaceId);
    db.deleteProjectAssignment(params.tenantId, params.projectId, params.agentId);
    return { ok: true };
  });

  app.get(clawApiPath("tenants/:tenantId/agents/:agentId/workspaces"), async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "workspace:read");
    if (!claims) return;
    const params = request.params as { tenantId: string; agentId: string };
    if (claims.tenantId !== params.tenantId || (claims.agentId && claims.agentId !== params.agentId)) {
      return await reply.code(403).send({ error: "Forbidden", message: "scope mismatch" });
    }
    const workspaces = db.listWorkspaces(params.tenantId, params.agentId).filter((workspace) => (
      !claims.deviceId || db.deviceHasWorkspaceAccess(params.tenantId, claims.deviceId, params.agentId, workspace.workspaceId)
    ));
    return { workspaces };
  });

  app.get(clawApiPath("tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/status"), async (request, reply) => {
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:read",
      "workspace.status",
    );
    if (!result) return;
    return result;
  });

  app.get(clawApiPath("tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/browser/session"), async (request, reply) => {
    const params = request.params as WorkspaceParams;
    const claims = await requireClaims(request, reply, auth, "workspace:read");
    if (!claims) return;
    try {
      ensureWorkspaceAccess(claims, params, db);
    } catch (error) {
      return await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
    }

    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:read",
      "browser.session.status",
    );
    if (!result) return;
    if (result.session) {
      registry.cacheBrowserState({
        tenantId: params.tenantId,
        agentId: params.agentId,
        workspaceId: params.workspaceId,
        session: result.session as BrowserSessionSnapshot,
      });
    }
    return {
      ...result,
      sharePath: browserSharePath(params),
      shareUrl: browserShareUrl(config, params),
    };
  });

  app.post(clawApiPath("tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/browser/session"), async (request, reply) => {
    const params = request.params as WorkspaceParams;
    const claims = await requireClaims(request, reply, auth, "workspace:data");
    if (!claims) return;
    try {
      ensureWorkspaceAccess(claims, params, db);
    } catch (error) {
      return await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
    }

    const body = await readRequestBody(request);
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "browser.session.ensure",
      {
        ...(typeof body.initialUrl === "string" ? { initialUrl: body.initialUrl } : {}),
      },
    );
    if (!result) return;
    if (result.session) {
      registry.cacheBrowserState({
        tenantId: params.tenantId,
        agentId: params.agentId,
        workspaceId: params.workspaceId,
        session: result.session as BrowserSessionSnapshot,
      });
    }
    db.appendActivity({
      tenantId: params.tenantId,
      agentId: params.agentId,
      workspaceId: params.workspaceId,
      capability: "browser.session.ensure",
      status: "success",
      detail: claims.email,
    });
    return {
      ...result,
      sharePath: browserSharePath(params),
      shareUrl: browserShareUrl(config, params),
    };
  });

  app.post(clawApiPath("tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/browser/control/acquire"), async (request, reply) => {
    const params = request.params as WorkspaceParams;
    const claims = await requireClaims(request, reply, auth, "workspace:data");
    if (!claims) return;
    try {
      ensureWorkspaceAccess(claims, params, db);
    } catch (error) {
      return await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
    }
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "browser.control.acquire",
      { actor: browserActorFromClaims(claims) },
    );
    if (!result) return;
    if (result.session) {
      registry.cacheBrowserState({
        tenantId: params.tenantId,
        agentId: params.agentId,
        workspaceId: params.workspaceId,
        session: result.session as BrowserSessionSnapshot,
      });
    }
    db.appendActivity({
      tenantId: params.tenantId,
      agentId: params.agentId,
      workspaceId: params.workspaceId,
      capability: "browser.control.acquire",
      status: "success",
      detail: claims.email,
    });
    return result;
  });

  app.post(clawApiPath("tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/browser/control/release"), async (request, reply) => {
    const params = request.params as WorkspaceParams;
    const claims = await requireClaims(request, reply, auth, "workspace:data");
    if (!claims) return;
    try {
      ensureWorkspaceAccess(claims, params, db);
    } catch (error) {
      return await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
    }
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "browser.control.release",
      { actor: browserActorFromClaims(claims) },
    );
    if (!result) return;
    if (result.session) {
      registry.cacheBrowserState({
        tenantId: params.tenantId,
        agentId: params.agentId,
        workspaceId: params.workspaceId,
        session: result.session as BrowserSessionSnapshot,
      });
    }
    db.appendActivity({
      tenantId: params.tenantId,
      agentId: params.agentId,
      workspaceId: params.workspaceId,
      capability: "browser.control.release",
      status: "success",
      detail: claims.email,
    });
    return result;
  });

  app.post(clawApiPath("tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/browser/navigate"), async (request, reply) => {
    const params = request.params as WorkspaceParams;
    const claims = await requireClaims(request, reply, auth, "workspace:data");
    if (!claims) return;
    try {
      ensureWorkspaceAccess(claims, params, db);
    } catch (error) {
      return await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
    }
    const body = await readRequestBody(request);
    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!url) {
      return await reply.code(400).send({ error: "url is required" });
    }
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "browser.navigate",
      {
        actor: browserActorFromClaims(claims),
        url,
      },
    );
    if (!result) return;
    if (result.session) {
      registry.cacheBrowserState({
        tenantId: params.tenantId,
        agentId: params.agentId,
        workspaceId: params.workspaceId,
        session: result.session as BrowserSessionSnapshot,
      });
    }
    db.appendActivity({
      tenantId: params.tenantId,
      agentId: params.agentId,
      workspaceId: params.workspaceId,
      capability: "browser.navigate",
      status: "success",
      detail: claims.email,
    });
    return result;
  });

  app.get(clawApiPath("tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/browser/events"), { websocket: true }, async (socket, request) => {
    const fastifyRequest = request as unknown as FastifyRequest<{ Params: WorkspaceParams }>;
    const host = fastifyRequest.headers.host ?? new URL(config.publicBaseUrl).host;
    if (!isLoopbackHost(host) && !isSecureRequest(fastifyRequest)) {
      socket.close();
      return;
    }
    const token = parseWebSocketAccessToken(fastifyRequest);
    if (!token) {
      socket.close();
      return;
    }

    let claims: AuthClaims;
    try {
      claims = await auth.verifyAccessToken(token);
    } catch {
      socket.close();
      return;
    }
    if (!ensureScope(claims, "workspace:read")) {
      socket.close();
      return;
    }

    const params = fastifyRequest.params as WorkspaceParams;
    try {
      ensureWorkspaceAccess(claims, params, db);
    } catch {
      socket.close();
      return;
    }

    const unsubscribe = registry.subscribeBrowser({
      tenantId: params.tenantId,
      agentId: params.agentId,
      workspaceId: params.workspaceId,
      socket: socket as any,
    });
    const cached = registry.getBrowserState({
      tenantId: params.tenantId,
      agentId: params.agentId,
      workspaceId: params.workspaceId,
    });
    if (cached.session) {
      socket.send(JSON.stringify({
        type: STABLE_EVENT_TYPES.browserState,
        reason: "cached",
        session: cached.session,
      }));
    }
    if (cached.frame) {
      socket.send(JSON.stringify({
        type: STABLE_EVENT_TYPES.browserFrame,
        frame: cached.frame,
      }));
    }
    db.appendActivity({
      tenantId: params.tenantId,
      agentId: params.agentId,
      workspaceId: params.workspaceId,
      capability: "browser.viewer.join",
      status: "info",
      detail: claims.email,
    });

    socket.on("message", async (buffer) => {
      try {
        const message = JSON.parse(buffer.toString()) as {
          type?: string;
          url?: string;
          command?: BrowserInputCommand;
        };
        if (message.type === "browser.input" && message.command) {
          const result = await registry.invoke({
            tenantId: params.tenantId,
            connectorId: resolveConnectorId(db, params.tenantId, params.agentId),
            agentId: params.agentId,
            workspaceId: params.workspaceId,
            operation: "browser.input",
            payload: {
              actor: browserActorFromClaims(claims),
              command: message.command,
            },
          });
          if (result.session) {
            const session = result.session as BrowserSessionSnapshot;
            registry.cacheBrowserState({
              tenantId: params.tenantId,
              agentId: params.agentId,
              workspaceId: params.workspaceId,
              session,
            });
            socket.send(JSON.stringify({
              type: STABLE_EVENT_TYPES.browserState,
              reason: "input-applied",
              session,
            }));
          }
          return;
        }
        if (message.type === "browser.navigate" && typeof message.url === "string") {
          const result = await registry.invoke({
            tenantId: params.tenantId,
            connectorId: resolveConnectorId(db, params.tenantId, params.agentId),
            agentId: params.agentId,
            workspaceId: params.workspaceId,
            operation: "browser.navigate",
            payload: {
              actor: browserActorFromClaims(claims),
              url: message.url,
            },
          });
          if (result.session) {
            const session = result.session as BrowserSessionSnapshot;
            registry.cacheBrowserState({
              tenantId: params.tenantId,
              agentId: params.agentId,
              workspaceId: params.workspaceId,
              session,
            });
            socket.send(JSON.stringify({
              type: STABLE_EVENT_TYPES.browserState,
              reason: "navigate-applied",
              session,
            }));
          }
        }
      } catch (error) {
        socket.send(JSON.stringify({
          type: STABLE_EVENT_TYPES.browserError,
          message: error instanceof Error ? error.message : String(error),
        }));
      }
    });

    socket.on("close", unsubscribe);
    socket.on("error", unsubscribe);
  });

  app.get(clawApiPath("tenants/:tenantId/projects/:projectId/agents/:agentId/status"), async (request, reply) => {
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:read",
      "workspace.status",
    );
    if (!result) return;
    return result;
  });

  app.post(clawApiPath("admin/tenants/:tenantId/agents/:agentId/workspaces"), async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "admin:*");
    if (!claims) return;
    const params = request.params as { tenantId: string; agentId: string };
    const body = await readRequestBody(request);
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
    if (!workspaceId) {
      return await reply.code(400).send({ error: "workspaceId is required" });
    }
    try {
      const result = await registry.invoke({
        tenantId: params.tenantId,
        connectorId: resolveConnectorId(db, params.tenantId, params.agentId),
        agentId: params.agentId,
        workspaceId,
        operation: "admin.workspace.create",
        payload: {
          workspaceId,
          displayName: typeof body.displayName === "string" ? body.displayName : workspaceId,
        },
      });
      db.upsertWorkspaces(params.tenantId, params.agentId, [{
        workspaceId,
        displayName: typeof result.displayName === "string" ? result.displayName : workspaceId,
      }]);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return await reply.code(error instanceof OfflineError ? 503 : 502).send({ error: "admin_workspace_create_failed", message });
    }
  });

  app.post(clawApiPath("admin/tenants/:tenantId/agents/:agentId/runtime/:action"), async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "admin:*");
    if (!claims) return;
    const params = request.params as { tenantId: string; agentId: string; action: string };
    const action = params.action;
    if (!["setup", "install", "uninstall", "status"].includes(action)) {
      return await reply.code(404).send({ error: "unsupported_runtime_action" });
    }
    try {
      const result = await registry.invoke({
        tenantId: params.tenantId,
        connectorId: resolveConnectorId(db, params.tenantId, params.agentId),
        agentId: params.agentId,
        operation: `admin.runtime.${action}`,
        payload: action === "status" ? {} : await readRequestBody(request),
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return await reply.code(error instanceof OfflineError ? 503 : 502).send({ error: "admin_runtime_failed", message });
    }
  });

  app.post(clawApiPath("admin/tenants/:tenantId/workspace-grants"), async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "admin:*");
    if (!claims) return;
    const { tenantId } = request.params as { tenantId: string };
    try {
      authorizeTenant(claims, tenantId);
    } catch (error) {
      return await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
    }
    const body = await readRequestBody(request);
    const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
    const agentId = typeof body.agentId === "string" ? body.agentId.trim() : "";
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
    if (!deviceId || !agentId || !workspaceId) {
      return await reply.code(400).send({ error: "deviceId, agentId and workspaceId are required" });
    }
    db.createWorkspaceGrant({ tenantId, deviceId, agentId, workspaceId });
    return { ok: true };
  });

  // --- Admin data deletion endpoints ---
  app.delete(clawApiPath("admin/tenants/:tenantId/activity"), async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "admin:*");
    if (!claims) return;
    const { tenantId } = request.params as { tenantId: string };
    if (claims.tenantId !== tenantId) {
      return await reply.code(403).send({ error: "Forbidden" });
    }
    const query = request.query as { agentId?: string };
    const deleted = db.clearActivity(tenantId, query.agentId);
    return { ok: true, deleted };
  });

  app.delete(clawApiPath("admin/tenants/:tenantId/usage"), async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "admin:*");
    if (!claims) return;
    const { tenantId } = request.params as { tenantId: string };
    if (claims.tenantId !== tenantId) {
      return await reply.code(403).send({ error: "Forbidden" });
    }
    const query = request.query as { agentId?: string };
    const deleted = db.clearUsage(tenantId, query.agentId);
    return { ok: true, deleted };
  });

  app.delete(clawApiPath("admin/tenants/:tenantId/agents/:agentId"), async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "admin:*");
    if (!claims) return;
    const params = request.params as { tenantId: string; agentId: string };
    if (claims.tenantId !== params.tenantId) {
      return await reply.code(403).send({ error: "Forbidden" });
    }
    db.deleteAgent(params.tenantId, params.agentId);
    return { ok: true };
  });

  app.delete(clawApiPath("admin/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId"), async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "admin:*");
    if (!claims) return;
    const params = request.params as WorkspaceParams;
    if (claims.tenantId !== params.tenantId) {
      return await reply.code(403).send({ error: "Forbidden" });
    }
    // Try to delete the workspace files via the connector (best-effort)
    try {
      await registry.invoke({
        tenantId: params.tenantId,
        connectorId: resolveConnectorId(db, params.tenantId, params.agentId),
        agentId: params.agentId,
        workspaceId: params.workspaceId,
        operation: "workspace.delete",
        payload: {},
      });
    } catch {
      // Ignore connector errors, still clean the DB
    }
    db.deleteWorkspace(params.tenantId, params.agentId, params.workspaceId);
    return { ok: true };
  });

  app.post(clawApiPath("admin/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/sessions/clear"), async (request, reply) => {
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "admin:*",
      "sessions.delete-all",
    );
    if (!result) return;
    return result;
  });

  app.get(clawApiPath("admin/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/config"), async (request, reply) => {
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "admin:*",
      "admin.config.read",
    );
    if (!result) return;
    return result;
  });

  app.put(clawApiPath("admin/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/config"), async (request, reply) => {
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "admin:*",
      "admin.config.write",
      await readRequestBody(request),
    );
    if (!result) return;
    return result;
  });

  app.get(clawApiPath("admin/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/workspace-files/:fileName"), async (request, reply) => {
    const params = request.params as WorkspaceParams & { fileName: string };
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "admin:*",
      "admin.workspace-file.read",
      { fileName: params.fileName },
      params,
    );
    if (!result) return;
    return result;
  });

  app.put(clawApiPath("admin/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/workspace-files/:fileName"), async (request, reply) => {
    const params = request.params as WorkspaceParams & { fileName: string };
    const body = await readRequestBody(request);
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "admin:*",
      "admin.workspace-file.write",
      { fileName: params.fileName, content: body.content },
      params,
    );
    if (!result) return;
    return result;
  });

  app.get(clawApiPath("tenants/:tenantId/homes"), async (request, reply) => {
    const params = request.params as { tenantId: string };
    const result = await forwardIotJson(request, reply, auth, config, "tenant:read", {
      tenantId: params.tenantId,
      path: clawApiPath("homes"),
    });
    if (!result) return;
    return result;
  });

  app.get(clawApiPath("tenants/:tenantId/homes/:homeId/areas"), async (request, reply) => {
    const params = request.params as { tenantId: string; homeId: string };
    const result = await forwardIotJson(request, reply, auth, config, "workspace:read", {
      tenantId: params.tenantId,
      path: clawApiPath(`homes/${params.homeId}/areas`),
    });
    if (!result) return;
    return result;
  });

  app.get(clawApiPath("tenants/:tenantId/homes/:homeId/things"), async (request, reply) => {
    const params = request.params as { tenantId: string; homeId: string };
    const query = request.raw.url?.split("?")[1];
    const result = await forwardIotJson(request, reply, auth, config, "workspace:read", {
      tenantId: params.tenantId,
      path: clawApiPath(`homes/${params.homeId}/things${query ? `?${query}` : ""}`),
    });
    if (!result) return;
    return result;
  });

  app.get(clawApiPath("tenants/:tenantId/homes/:homeId/state"), async (request, reply) => {
    const params = request.params as { tenantId: string; homeId: string };
    const result = await forwardIotJson(request, reply, auth, config, "workspace:read", {
      tenantId: params.tenantId,
      path: clawApiPath(`homes/${params.homeId}/state`),
    });
    if (!result) return;
    return result;
  });

  app.post(clawApiPath("tenants/:tenantId/homes/:homeId/actions"), async (request, reply) => {
    const params = request.params as { tenantId: string; homeId: string };
    const result = await forwardIotJson(request, reply, auth, config, "workspace:data", {
      tenantId: params.tenantId,
      method: "POST",
      path: clawApiPath(`homes/${params.homeId}/actions`),
      body: await readRequestBody(request),
    });
    if (!result) return;
    return result;
  });

  app.get(clawApiPath("tenants/:tenantId/homes/:homeId/scenes"), async (request, reply) => {
    const params = request.params as { tenantId: string; homeId: string };
    const result = await forwardIotJson(request, reply, auth, config, "workspace:read", {
      tenantId: params.tenantId,
      path: clawApiPath(`homes/${params.homeId}/scenes`),
    });
    if (!result) return;
    return result;
  });

  app.post(clawApiPath("tenants/:tenantId/homes/:homeId/scenes/:sceneId/activate"), async (request, reply) => {
    const params = request.params as { tenantId: string; homeId: string; sceneId: string };
    const result = await forwardIotJson(request, reply, auth, config, "workspace:data", {
      tenantId: params.tenantId,
      method: "POST",
      path: clawApiPath(`homes/${params.homeId}/scenes/${params.sceneId}/activate`),
    });
    if (!result) return;
    return result;
  });

  app.get(clawApiPath("tenants/:tenantId/homes/:homeId/automations"), async (request, reply) => {
    const params = request.params as { tenantId: string; homeId: string };
    const result = await forwardIotJson(request, reply, auth, config, "workspace:read", {
      tenantId: params.tenantId,
      path: clawApiPath(`homes/${params.homeId}/automations`),
    });
    if (!result) return;
    return result;
  });

  app.post(clawApiPath("tenants/:tenantId/homes/:homeId/automations/:automationId/run"), async (request, reply) => {
    const params = request.params as { tenantId: string; homeId: string; automationId: string };
    const result = await forwardIotJson(request, reply, auth, config, "workspace:data", {
      tenantId: params.tenantId,
      method: "POST",
      path: clawApiPath(`homes/${params.homeId}/automations/${params.automationId}/run`),
    });
    if (!result) return;
    return result;
  });

  app.get(clawApiPath("tenants/:tenantId/homes/:homeId/approvals"), async (request, reply) => {
    const params = request.params as { tenantId: string; homeId: string };
    const result = await forwardIotJson(request, reply, auth, config, "workspace:read", {
      tenantId: params.tenantId,
      path: clawApiPath(`homes/${params.homeId}/approvals`),
    });
    if (!result) return;
    return result;
  });

  app.post(clawApiPath("tenants/:tenantId/homes/:homeId/approvals/:approvalId/approve"), async (request, reply) => {
    const params = request.params as { tenantId: string; homeId: string; approvalId: string };
    const result = await forwardIotJson(request, reply, auth, config, "workspace:data", {
      tenantId: params.tenantId,
      method: "POST",
      path: clawApiPath(`homes/${params.homeId}/approvals/${params.approvalId}/approve`),
    });
    if (!result) return;
    return result;
  });

  app.get(clawApiPath("tenants/:tenantId/homes/:homeId/events/stream"), async (request, reply) => {
    const params = request.params as { tenantId: string; homeId: string };
    return await forwardIotEventStream(request, reply, auth, config, {
      tenantId: params.tenantId,
      path: clawApiPath(`homes/${params.homeId}/events/stream`),
    });
  });

  registerWorkspaceRoutes({ app, auth, config, db, monitor, registry });

  // --- Static frontend serving ---
  // The relay UI is a Vite + React app at relay/ui/. Its production build
  // lands in relay/ui/dist/ and is served here as static assets, with the
  // catch-all below falling back to index.html for SPA routing.
  //
  // If the build is missing (fresh checkout, dev workflow where the UI is
  // served by `vite dev` on its own port) we skip static registration so
  // the API still comes up cleanly. A clear 404 is returned for non-API
  // routes in that case.
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const publicDir = [
    path.resolve(__dirname, "../ui/dist"),
    path.resolve(__dirname, "../../ui/dist"),
  ].find((candidate) => existsSync(path.join(candidate, "index.html"))) ?? path.resolve(__dirname, "../ui/dist");
  const brandRoot = resolveBrandRoot();
  const hasStaticBuild = existsSync(path.join(publicDir, "index.html"));

  await app.register(fastifyStatic, {
    root: brandRoot,
    prefix: "/brand/",
    decorateReply: false,
  });

  if (hasStaticBuild) {
    await app.register(fastifyStatic, {
      root: publicDir,
      prefix: "/",
      wildcard: false,
    });
  } else {
    logger.warn(
      `Relay UI build not found at ${publicDir}. API will still serve; run \`npm --prefix relay/ui run build\` (or \`npm --prefix relay/ui run dev\` for HMR on :5180) to serve the frontend.`,
    );
  }

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith("/v1/")) {
      return reply.code(404).send({ error: "Not found" });
    }
    if (hasStaticBuild) {
      return reply.sendFile("index.html");
    }
    return reply.code(404).send({
      error: "UI build not found. Run `npm --prefix relay/ui run build`.",
    });
  });

  return { app, db, auth, registry, logger, config };
}
