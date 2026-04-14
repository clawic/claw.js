import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { BrowserActor, BrowserFrameEvent, BrowserInputCommand, BrowserSessionSnapshot } from "../../../browser/shared/types.ts";
import type { AuthClaims } from "../shared/protocol.ts";
import {
  deriveAssignmentWorkspaceId,
  deriveRuntimeAgentId,
  type ProjectResourceRef,
  type ProjectSecretRef,
} from "../shared/project-model.ts";
import { RelayAuthService } from "./auth.ts";
import { loadRelayConfig, type RelayConfig } from "./config.ts";
import { ConnectorRegistry, OfflineError } from "./connector-registry.ts";
import { RelayDatabase } from "./db.ts";
import { RelayLogger } from "./logger.ts";
import { MemoryRateLimiter } from "./rate-limit.ts";

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

type WorkspaceParams = {
  tenantId: string;
  agentId: string;
  workspaceId: string;
  sessionId?: string;
};

type ProjectAgentParams = {
  tenantId: string;
  projectId: string;
  agentId: string;
  sessionId?: string;
};

function parseBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

function parseWebSocketAccessToken(request: FastifyRequest): string | null {
  const queryToken = new URL(request.url, "http://relay.local").searchParams.get("access_token");
  if (queryToken?.trim()) return queryToken.trim();
  return parseBearerToken(request);
}

function ensureScope(claims: AuthClaims, scope: string): boolean {
  return claims.role === "admin" || claims.scopes.includes("*") || claims.scopes.includes(scope);
}

function authorizeTenant(claims: AuthClaims, tenantId: string): void {
  if (claims.tenantId !== tenantId) {
    throw new Error("Forbidden: tenant mismatch");
  }
}

function authorizeWorkspace(claims: AuthClaims, params: WorkspaceParams): void {
  if (claims.tenantId !== params.tenantId) {
    throw new Error("Forbidden: tenant mismatch");
  }
  if (claims.agentId && claims.agentId !== params.agentId) {
    throw new Error("Forbidden: agent mismatch");
  }
  if (claims.workspaceId && claims.workspaceId !== params.workspaceId) {
    throw new Error("Forbidden: workspace mismatch");
  }
}

function ensureWorkspaceAccess(claims: AuthClaims, params: WorkspaceParams, db: RelayDatabase): void {
  authorizeWorkspace(claims, params);
  if (claims.deviceId && !db.deviceHasWorkspaceAccess(params.tenantId, claims.deviceId, params.agentId, params.workspaceId)) {
    throw new Error("Forbidden: workspace grant mismatch");
  }
}

function requestKey(request: FastifyRequest): string {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() ?? request.ip;
  }
  return request.ip;
}

function isLoopbackHost(host: string): boolean {
  if (host.includes("localhost") || host.includes("127.0.0.1")) return true;
  const bare = host.replace(/:\d+$/, "");
  return bare.startsWith("192.168.") || bare.startsWith("10.") || /^172\.(1[6-9]|2\d|3[01])\./.test(bare);
}

function isSecureRequest(request: FastifyRequest): boolean {
  const forwardedProto = request.headers["x-forwarded-proto"];
  if (typeof forwardedProto === "string") return forwardedProto.split(",")[0]?.trim() === "https";
  return (request.protocol ?? "").toLowerCase() === "https";
}

async function requireSecureTransport(
  request: FastifyRequest,
  reply: FastifyReply,
  config: RelayConfig,
): Promise<boolean> {
  const host = request.headers.host ?? new URL(config.publicBaseUrl).host;
  if (isLoopbackHost(host) || isSecureRequest(request)) return true;
  await reply.code(400).send({ error: "https_required", message: "HTTPS is required outside localhost." });
  return false;
}

async function requireRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  limiter: MemoryRateLimiter,
  bucket: string,
  windowMs: number,
  limit: number,
): Promise<boolean> {
  const allowed = limiter.consume(`${bucket}:${requestKey(request)}`, windowMs, limit);
  if (allowed) return true;
  await reply.code(429).send({ error: "rate_limited", message: "Too many requests." });
  return false;
}

function resolveConnectorId(db: RelayDatabase, tenantId: string, agentId: string): string {
  const connector = db.getConnectorByAgentId(tenantId, agentId);
  if (!connector) {
    throw new OfflineError(`No active connector for ${agentId}`);
  }
  return connector.connectorId;
}

async function requireClaims(
  request: FastifyRequest,
  reply: FastifyReply,
  auth: RelayAuthService,
  scope: string,
): Promise<AuthClaims | null> {
  const token = parseBearerToken(request);
  if (!token) {
    await reply.code(401).send({ error: "Unauthorized", message: "Missing bearer token." });
    return null;
  }

  try {
    const claims = await auth.verifyAccessToken(token);
    if (!ensureScope(claims, scope)) {
      await reply.code(403).send({ error: "Forbidden", message: `Scope ${scope} is required.` });
      return null;
    }
    return claims;
  } catch {
    await reply.code(401).send({ error: "Unauthorized", message: "Invalid bearer token." });
    return null;
  }
}

function tokensFromText(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

async function readRequestBody(request: FastifyRequest): Promise<Record<string, unknown>> {
  return (await request.body ?? {}) as Record<string, unknown>;
}

function normalizeUploadData(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:")) {
    const [, base64Data = ""] = trimmed.split(",", 2);
    return base64Data;
  }
  return trimmed;
}

function parseProjectResourceRefs(value: unknown): ProjectResourceRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const ref = entry as Record<string, unknown>;
    const id = typeof ref.id === "string" ? ref.id.trim() : "";
    if (!id) return [];
    return [{
      id,
      ...(typeof ref.label === "string" ? { label: ref.label } : {}),
      ...(typeof ref.uri === "string" ? { uri: ref.uri } : {}),
      ...(ref.mode === "allow" || ref.mode === "deny" ? { mode: ref.mode } : {}),
      ...(ref.metadata && typeof ref.metadata === "object" && !Array.isArray(ref.metadata)
        ? { metadata: ref.metadata as Record<string, unknown> }
        : {}),
    }];
  });
}

function parseProjectSecretRefs(value: unknown): ProjectSecretRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const ref = entry as Record<string, unknown>;
    const id = typeof ref.id === "string" ? ref.id.trim() : "";
    if (!id) return [];
    return [{
      id,
      ...(typeof ref.label === "string" ? { label: ref.label } : {}),
      ...(typeof ref.secretName === "string" ? { secretName: ref.secretName } : {}),
      ...(ref.mode === "allow" || ref.mode === "deny" ? { mode: ref.mode } : {}),
      ...(ref.metadata && typeof ref.metadata === "object" && !Array.isArray(ref.metadata)
        ? { metadata: ref.metadata as Record<string, unknown> }
        : {}),
    }];
  });
}

function assignmentWorkspaceParams(params: ProjectAgentParams, workspaceId: string): WorkspaceParams {
  return {
    tenantId: params.tenantId,
    agentId: params.agentId,
    workspaceId,
    ...(params.sessionId ? { sessionId: params.sessionId } : {}),
  };
}

function browserActorFromClaims(claims: AuthClaims): BrowserActor {
  return {
    deviceId: claims.deviceId ?? claims.sub,
    userId: claims.sub,
    email: claims.email,
  };
}

function browserSharePath(params: WorkspaceParams): string {
  return `/browser/${params.tenantId}/${params.agentId}/${params.workspaceId}`;
}

function browserShareUrl(config: RelayConfig, params: WorkspaceParams): string {
  return new URL(browserSharePath(params), config.publicBaseUrl).toString();
}

async function invokeWorkspace(
  request: FastifyRequest<{ Params: WorkspaceParams }>,
  reply: FastifyReply,
  auth: RelayAuthService,
  registry: ConnectorRegistry,
  db: RelayDatabase,
  scope: string,
  operation: string,
  payload?: Record<string, unknown>,
  paramsOverride?: WorkspaceParams,
): Promise<Record<string, unknown> | null> {
  const claims = await requireClaims(request, reply, auth, scope);
  if (!claims) return null;
  const params = paramsOverride ?? request.params;
  try {
    ensureWorkspaceAccess(claims, params, db);
  } catch (error) {
    await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
    return null;
  }

  try {
    const result = await registry.invoke({
      tenantId: params.tenantId,
      connectorId: resolveConnectorId(db, params.tenantId, params.agentId),
      agentId: params.agentId,
      workspaceId: params.workspaceId,
      operation,
      payload,
    });
    db.appendActivity({
      tenantId: params.tenantId,
      agentId: params.agentId,
      workspaceId: params.workspaceId,
      capability: operation,
      status: "success",
      detail: `${operation} completed`,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.appendActivity({
      tenantId: params.tenantId,
      agentId: params.agentId,
      workspaceId: params.workspaceId,
      capability: operation,
      status: "error",
      detail: message,
    });
    if (error instanceof OfflineError) {
      await reply.code(503).send({ error: "offline", message });
      return null;
    }
    await reply.code(502).send({ error: "relay_connector_error", message });
    return null;
  }
}

async function invokeProjectAssignment(
  request: FastifyRequest<{ Params: ProjectAgentParams }>,
  reply: FastifyReply,
  auth: RelayAuthService,
  registry: ConnectorRegistry,
  db: RelayDatabase,
  scope: string,
  operation: string,
  payload?: Record<string, unknown>,
  paramsOverride?: ProjectAgentParams,
): Promise<Record<string, unknown> | null> {
  const params = paramsOverride ?? request.params;
  const assignment = db.getProjectAssignment(params.tenantId, params.projectId, params.agentId);
  if (!assignment) {
    await reply.code(404).send({ error: "project_agent_assignment_not_found" });
    return null;
  }
  return await invokeWorkspace(
    request as unknown as FastifyRequest<{ Params: WorkspaceParams }>,
    reply,
    auth,
    registry,
    db,
    scope,
    operation,
    payload,
    assignmentWorkspaceParams(params, assignment.workspaceId),
  );
}

async function forwardIotJson(
  request: FastifyRequest,
  reply: FastifyReply,
  auth: RelayAuthService,
  config: RelayConfig,
  scope: string,
  input: {
    tenantId: string;
    method?: "GET" | "POST";
    path: string;
    body?: Record<string, unknown>;
  },
): Promise<Record<string, unknown> | null> {
  const claims = await requireClaims(request, reply, auth, scope);
  if (!claims) return null;
  try {
    authorizeTenant(claims, input.tenantId);
  } catch (error) {
    await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
    return null;
  }
  if (!config.iotBaseUrl?.trim()) {
    await reply.code(503).send({ error: "iot_unavailable", message: "Relay IoT base URL is not configured." });
    return null;
  }
  const response = await fetch(`${config.iotBaseUrl.replace(/\/$/, "")}${input.path}`, {
    method: input.method ?? "GET",
    headers: input.body ? { "content-type": "application/json" } : undefined,
    ...(input.body ? { body: JSON.stringify(input.body) } : {}),
  });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json() as Record<string, unknown>
    : { text: await response.text() };
  if (!response.ok) {
    await reply.code(response.status).send(payload);
    return null;
  }
  return payload;
}

async function forwardIotEventStream(
  request: FastifyRequest,
  reply: FastifyReply,
  auth: RelayAuthService,
  config: RelayConfig,
  input: {
    tenantId: string;
    path: string;
  },
): Promise<FastifyReply | null> {
  const claims = await requireClaims(request, reply, auth, "workspace:read");
  if (!claims) return null;
  try {
    authorizeTenant(claims, input.tenantId);
  } catch (error) {
    await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
    return null;
  }
  if (!config.iotBaseUrl?.trim()) {
    await reply.code(503).send({ error: "iot_unavailable", message: "Relay IoT base URL is not configured." });
    return null;
  }
  const response = await fetch(`${config.iotBaseUrl.replace(/\/$/, "")}${input.path}`);
  if (!response.ok || !response.body) {
    await reply.code(response.status || 502).send({ error: "iot_stream_unavailable" });
    return null;
  }
  reply.raw.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
  });
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      reply.raw.write(Buffer.from(value));
    }
  }
  reply.raw.end();
  return reply;
}

async function requireProjectAssignmentAccess(
  request: FastifyRequest<{ Params: ProjectAgentParams }>,
  reply: FastifyReply,
  auth: RelayAuthService,
  db: RelayDatabase,
  scope: string,
): Promise<{
  assignment: NonNullable<ReturnType<RelayDatabase["getProjectAssignment"]>>;
  params: ProjectAgentParams;
} | null> {
  const claims = await requireClaims(request, reply, auth, scope);
  if (!claims) return null;
  const params = request.params;
  const assignment = db.getProjectAssignment(params.tenantId, params.projectId, params.agentId);
  if (!assignment) {
    await reply.code(404).send({ error: "project_agent_assignment_not_found" });
    return null;
  }
  try {
    ensureWorkspaceAccess(claims, assignmentWorkspaceParams(params, assignment.workspaceId), db);
  } catch (error) {
    await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
    return null;
  }
  return { assignment, params };
}

export async function buildRelayApp(options: RelayAppOptions = {}) {
  const config = loadRelayConfig(options.config);
  const logger = options.logger ?? new RelayLogger();
  const db = new RelayDatabase(config.dbPath);
  const auth = new RelayAuthService(config, db);
  const registry = new ConnectorRegistry(db, logger, config.requestTimeoutMs);
  const rateLimiter = new MemoryRateLimiter();
  const app = Fastify({ logger: false });

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

  app.get("/v1/health", async () => ({
    ok: true,
    service: "clawjs-relay",
    uptimeSeconds: Math.round(process.uptime()),
  }));

  /* -------------------------------------------------------
     Monitor consolidated status endpoint.
     Designed to be polled by the standalone monitor service.
     No auth required (intended for same-network access).
     ------------------------------------------------------- */
  app.get("/v1/monitor/status", async () => {
    const tenants = db.sqlite.prepare("SELECT id FROM tenants").all() as Array<{ id: string }>;

    const allConnectors: Array<{
      id: string;
      agentId: string;
      displayName: string;
      status: "online" | "offline";
      lastSeenAt: number | null;
      version: string | null;
    }> = [];

    const allAgents: Array<{
      id: string;
      tenantId: string;
      displayName: string;
      workspaces: Array<{ id: string; displayName: string; status: string }>;
    }> = [];

    let sessionsLast24h = 0;
    let tokensInLast24h = 0;
    let tokensOutLast24h = 0;
    let errorsLast24h = 0;
    let estimatedCostLast24h = 0;
    const since24h = Date.now() - 86_400_000;

    for (const tenant of tenants) {
      // Connectors
      const connectors = db.sqlite.prepare(`
        SELECT id, agent_id, display_name, status, last_seen_at
        FROM connectors WHERE tenant_id = ?
      `).all(tenant.id) as Array<{
        id: string; agent_id: string; display_name: string;
        status: string; last_seen_at: number | null;
      }>;

      for (const c of connectors) {
        // Get version from latest connector session
        const session = db.sqlite.prepare(`
          SELECT version FROM connector_sessions
          WHERE tenant_id = ? AND agent_id = ?
          ORDER BY last_seen_at DESC LIMIT 1
        `).get(tenant.id, c.agent_id) as { version: string | null } | undefined;

        allConnectors.push({
          id: c.id,
          agentId: c.agent_id,
          displayName: c.display_name,
          status: c.status === "online" ? "online" : "offline",
          lastSeenAt: c.last_seen_at,
          version: session?.version ?? null,
        });
      }

      // Agents + workspaces
      const agents = db.listAgents(tenant.id);
      for (const agent of agents) {
        const workspaces = db.listWorkspaces(tenant.id, agent.agentId);
        allAgents.push({
          id: agent.agentId,
          tenantId: tenant.id,
          displayName: agent.displayName,
          workspaces: workspaces.map((ws) => ({
            id: ws.workspaceId,
            displayName: ws.displayName,
            status: agent.status === "online" ? "active" : "idle",
          })),
        });
      }

      // Usage aggregates
      const usageRows = db.sqlite.prepare(`
        SELECT COALESCE(SUM(tokens_in), 0) as tin,
               COALESCE(SUM(tokens_out), 0) as tout,
               COALESCE(SUM(estimated_cost_usd), 0) as cost,
               COUNT(*) as cnt
        FROM usage_records
        WHERE tenant_id = ? AND created_at >= ?
      `).get(tenant.id, since24h) as { tin: number; tout: number; cost: number; cnt: number };

      tokensInLast24h += usageRows.tin;
      tokensOutLast24h += usageRows.tout;
      estimatedCostLast24h += usageRows.cost;
      sessionsLast24h += usageRows.cnt;

      // Error count
      const errorRow = db.sqlite.prepare(`
        SELECT COUNT(*) as cnt FROM activity_events
        WHERE tenant_id = ? AND status = 'error' AND created_at >= ?
      `).get(tenant.id, since24h) as { cnt: number };
      errorsLast24h += errorRow.cnt;
    }

    return {
      relay: {
        status: "up" as const,
        uptimeSeconds: Math.round(process.uptime()),
        version: "0.1.0",
      },
      connectors: allConnectors,
      agents: allAgents,
      usage: {
        sessionsLast24h,
        tokensInLast24h,
        tokensOutLast24h,
        errorsLast24h,
        estimatedCostLast24h: Math.round(estimatedCostLast24h * 100) / 100,
      },
    };
  });

  app.post("/v1/auth/login", async (request, reply) => {
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

  app.post("/v1/auth/refresh", async (request, reply) => {
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

  app.post("/v1/auth/logout", async (request, reply) => {
    if (!await requireSecureTransport(request, reply, config)) return;
    const body = await readRequestBody(request);
    const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken : "";
    db.revokeRefreshToken(refreshToken);
    return await reply.send({ ok: true });
  });

  app.get("/v1/me/devices", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "tenant:read");
    if (!claims) return;
    return {
      devices: db.listDevices(claims.sub, claims.tenantId),
    };
  });

  app.get("/v1/me/workspaces", async (request, reply) => {
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

  app.post("/v1/connectors/device/start", async (request, reply) => {
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

  app.post("/v1/connectors/device/poll", async (request, reply) => {
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

  app.post("/v1/pairings/:pairingId/approve", async (request, reply) => {
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

  app.post("/v1/pairings/:pairingId/deny", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "tenant:read");
    if (!claims) return;
    const { pairingId } = request.params as { pairingId: string };
    const denied = db.denyPairing(pairingId);
    if (!denied) {
      return await reply.code(404).send({ error: "pairing_not_pending" });
    }
    return { ok: true };
  });

  app.post("/v1/connector/enroll", async (request, reply) => {
    const body = await readRequestBody(request);
    const enrollmentToken = typeof body.enrollmentToken === "string" ? body.enrollmentToken : "";
    const result = db.consumeEnrollment(enrollmentToken);
    if (!result) {
      return await reply.code(401).send({ error: "invalid_enrollment_token" });
    }
    return result;
  });

  app.get("/v1/connector/connect", { websocket: true }, async (socket, request) => {
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

  app.post("/v1/admin/connectors/enrollments", async (request, reply) => {
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

  app.post("/v1/admin/connectors/:connectorId/revoke", async (request, reply) => {
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

  app.get("/v1/tenants/:tenantId/agents", async (request, reply) => {
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

  app.get("/v1/tenants/:tenantId/projects", async (request, reply) => {
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

  app.post("/v1/tenants/:tenantId/projects", async (request, reply) => {
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

  app.get("/v1/tenants/:tenantId/projects/:projectId", async (request, reply) => {
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

  app.patch("/v1/tenants/:tenantId/projects/:projectId", async (request, reply) => {
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

  app.get("/v1/tenants/:tenantId/projects/:projectId/agents", async (request, reply) => {
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

  app.get("/v1/tenants/:tenantId/agents/:agentId/projects", async (request, reply) => {
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

  app.post("/v1/tenants/:tenantId/projects/:projectId/agents/:agentId", async (request, reply) => {
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

  app.delete("/v1/tenants/:tenantId/projects/:projectId/agents/:agentId", async (request, reply) => {
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

  app.get("/v1/tenants/:tenantId/agents/:agentId/workspaces", async (request, reply) => {
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

  app.get("/v1/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/status", async (request, reply) => {
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

  app.get("/v1/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/browser/session", async (request, reply) => {
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

  app.post("/v1/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/browser/session", async (request, reply) => {
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

  app.post("/v1/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/browser/control/acquire", async (request, reply) => {
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

  app.post("/v1/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/browser/control/release", async (request, reply) => {
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

  app.post("/v1/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/browser/navigate", async (request, reply) => {
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

  app.get("/v1/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/browser/ws", { websocket: true }, async (socket, request) => {
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
        type: "browser.state",
        reason: "cached",
        session: cached.session,
      }));
    }
    if (cached.frame) {
      socket.send(JSON.stringify({
        type: "browser.frame",
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
              type: "browser.state",
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
              type: "browser.state",
              reason: "navigate-applied",
              session,
            }));
          }
        }
      } catch (error) {
        socket.send(JSON.stringify({
          type: "browser.error",
          message: error instanceof Error ? error.message : String(error),
        }));
      }
    });

    socket.on("close", unsubscribe);
    socket.on("error", unsubscribe);
  });

  app.get("/v1/tenants/:tenantId/projects/:projectId/agents/:agentId/status", async (request, reply) => {
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

  app.post("/v1/admin/tenants/:tenantId/agents/:agentId/workspaces", async (request, reply) => {
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

  app.post("/v1/admin/tenants/:tenantId/agents/:agentId/runtime/:action", async (request, reply) => {
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

  app.post("/v1/admin/tenants/:tenantId/workspace-grants", async (request, reply) => {
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
  app.delete("/v1/admin/tenants/:tenantId/activity", async (request, reply) => {
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

  app.delete("/v1/admin/tenants/:tenantId/usage", async (request, reply) => {
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

  app.delete("/v1/admin/tenants/:tenantId/agents/:agentId", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "admin:*");
    if (!claims) return;
    const params = request.params as { tenantId: string; agentId: string };
    if (claims.tenantId !== params.tenantId) {
      return await reply.code(403).send({ error: "Forbidden" });
    }
    db.deleteAgent(params.tenantId, params.agentId);
    return { ok: true };
  });

  app.delete("/v1/admin/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId", async (request, reply) => {
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

  app.post("/v1/admin/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/sessions/clear", async (request, reply) => {
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

  app.get("/v1/admin/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/config", async (request, reply) => {
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

  app.put("/v1/admin/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/config", async (request, reply) => {
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

  app.get("/v1/admin/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/workspace-files/:fileName", async (request, reply) => {
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

  app.put("/v1/admin/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/workspace-files/:fileName", async (request, reply) => {
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

  app.get("/v1/tenants/:tenantId/homes", async (request, reply) => {
    const params = request.params as { tenantId: string };
    const result = await forwardIotJson(request, reply, auth, config, "tenant:read", {
      tenantId: params.tenantId,
      path: "/v1/homes",
    });
    if (!result) return;
    return result;
  });

  app.get("/v1/tenants/:tenantId/homes/:homeId/areas", async (request, reply) => {
    const params = request.params as { tenantId: string; homeId: string };
    const result = await forwardIotJson(request, reply, auth, config, "workspace:read", {
      tenantId: params.tenantId,
      path: `/v1/homes/${params.homeId}/areas`,
    });
    if (!result) return;
    return result;
  });

  app.get("/v1/tenants/:tenantId/homes/:homeId/things", async (request, reply) => {
    const params = request.params as { tenantId: string; homeId: string };
    const query = request.raw.url?.split("?")[1];
    const result = await forwardIotJson(request, reply, auth, config, "workspace:read", {
      tenantId: params.tenantId,
      path: `/v1/homes/${params.homeId}/things${query ? `?${query}` : ""}`,
    });
    if (!result) return;
    return result;
  });

  app.get("/v1/tenants/:tenantId/homes/:homeId/state", async (request, reply) => {
    const params = request.params as { tenantId: string; homeId: string };
    const result = await forwardIotJson(request, reply, auth, config, "workspace:read", {
      tenantId: params.tenantId,
      path: `/v1/homes/${params.homeId}/state`,
    });
    if (!result) return;
    return result;
  });

  app.post("/v1/tenants/:tenantId/homes/:homeId/actions", async (request, reply) => {
    const params = request.params as { tenantId: string; homeId: string };
    const result = await forwardIotJson(request, reply, auth, config, "workspace:data", {
      tenantId: params.tenantId,
      method: "POST",
      path: `/v1/homes/${params.homeId}/actions`,
      body: await readRequestBody(request),
    });
    if (!result) return;
    return result;
  });

  app.get("/v1/tenants/:tenantId/homes/:homeId/scenes", async (request, reply) => {
    const params = request.params as { tenantId: string; homeId: string };
    const result = await forwardIotJson(request, reply, auth, config, "workspace:read", {
      tenantId: params.tenantId,
      path: `/v1/homes/${params.homeId}/scenes`,
    });
    if (!result) return;
    return result;
  });

  app.post("/v1/tenants/:tenantId/homes/:homeId/scenes/:sceneId/activate", async (request, reply) => {
    const params = request.params as { tenantId: string; homeId: string; sceneId: string };
    const result = await forwardIotJson(request, reply, auth, config, "workspace:data", {
      tenantId: params.tenantId,
      method: "POST",
      path: `/v1/homes/${params.homeId}/scenes/${params.sceneId}/activate`,
    });
    if (!result) return;
    return result;
  });

  app.get("/v1/tenants/:tenantId/homes/:homeId/automations", async (request, reply) => {
    const params = request.params as { tenantId: string; homeId: string };
    const result = await forwardIotJson(request, reply, auth, config, "workspace:read", {
      tenantId: params.tenantId,
      path: `/v1/homes/${params.homeId}/automations`,
    });
    if (!result) return;
    return result;
  });

  app.post("/v1/tenants/:tenantId/homes/:homeId/automations/:automationId/run", async (request, reply) => {
    const params = request.params as { tenantId: string; homeId: string; automationId: string };
    const result = await forwardIotJson(request, reply, auth, config, "workspace:data", {
      tenantId: params.tenantId,
      method: "POST",
      path: `/v1/homes/${params.homeId}/automations/${params.automationId}/run`,
    });
    if (!result) return;
    return result;
  });

  app.get("/v1/tenants/:tenantId/homes/:homeId/approvals", async (request, reply) => {
    const params = request.params as { tenantId: string; homeId: string };
    const result = await forwardIotJson(request, reply, auth, config, "workspace:read", {
      tenantId: params.tenantId,
      path: `/v1/homes/${params.homeId}/approvals`,
    });
    if (!result) return;
    return result;
  });

  app.post("/v1/tenants/:tenantId/homes/:homeId/approvals/:approvalId/approve", async (request, reply) => {
    const params = request.params as { tenantId: string; homeId: string; approvalId: string };
    const result = await forwardIotJson(request, reply, auth, config, "workspace:data", {
      tenantId: params.tenantId,
      method: "POST",
      path: `/v1/homes/${params.homeId}/approvals/${params.approvalId}/approve`,
    });
    if (!result) return;
    return result;
  });

  app.get("/v1/tenants/:tenantId/homes/:homeId/events/stream", async (request, reply) => {
    const params = request.params as { tenantId: string; homeId: string };
    return await forwardIotEventStream(request, reply, auth, config, {
      tenantId: params.tenantId,
      path: `/v1/homes/${params.homeId}/events/stream`,
    });
  });

  const workspacePrefix = "/v1/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId";
  const projectWorkspacePrefix = "/v1/tenants/:tenantId/projects/:projectId/agents/:agentId";

  app.get(`${workspacePrefix}/activity`, async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "workspace:read");
    if (!claims) return;
    const params = request.params as WorkspaceParams;
    ensureWorkspaceAccess(claims, params, db);
    return {
      activity: db.listActivity(params.tenantId, params.agentId, params.workspaceId),
    };
  });

  app.get(`${projectWorkspacePrefix}/activity`, async (request, reply) => {
    const access = await requireProjectAssignmentAccess(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      db,
      "workspace:read",
    );
    if (!access) return;
    return {
      activity: db.listActivity(access.params.tenantId, access.params.agentId, access.assignment.workspaceId),
    };
  });

  app.get(`${workspacePrefix}/usage`, async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "workspace:read");
    if (!claims) return;
    const params = request.params as WorkspaceParams;
    ensureWorkspaceAccess(claims, params, db);
    return {
      usage: db.listUsage(params.tenantId, params.agentId, params.workspaceId),
    };
  });

  app.get(`${projectWorkspacePrefix}/usage`, async (request, reply) => {
    const access = await requireProjectAssignmentAccess(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      db,
      "workspace:read",
    );
    if (!access) return;
    return {
      usage: db.listUsage(access.params.tenantId, access.params.agentId, access.assignment.workspaceId),
    };
  });

  app.get(`${workspacePrefix}/iot/state`, async (request, reply) => {
    const params = request.params as WorkspaceParams;
    const result = await forwardIotJson(request, reply, auth, config, "workspace:read", {
      tenantId: params.tenantId,
      path: "/v1/state",
    });
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/iot/actions`, async (request, reply) => {
    const params = request.params as WorkspaceParams;
    const result = await forwardIotJson(request, reply, auth, config, "workspace:data", {
      tenantId: params.tenantId,
      method: "POST",
      path: "/v1/actions",
      body: await readRequestBody(request),
    });
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/iot/scenes`, async (request, reply) => {
    const params = request.params as WorkspaceParams;
    const result = await forwardIotJson(request, reply, auth, config, "workspace:read", {
      tenantId: params.tenantId,
      path: "/v1/scenes",
    });
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/iot/approvals`, async (request, reply) => {
    const params = request.params as WorkspaceParams;
    const result = await forwardIotJson(request, reply, auth, config, "workspace:read", {
      tenantId: params.tenantId,
      path: "/v1/approvals",
    });
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/integrations/status`, async (request, reply) => {
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:read",
      "integrations.status",
    );
    if (!result) return;
    return result;
  });

  app.get(`${projectWorkspacePrefix}/integrations/status`, async (request, reply) => {
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:read",
      "integrations.status",
    );
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/sessions`, async (request, reply) => {
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:read",
      "sessions.list",
    );
    if (!result) return;
    return result;
  });

  app.get(`${projectWorkspacePrefix}/sessions`, async (request, reply) => {
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:read",
      "sessions.list",
    );
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/sessions`, async (request, reply) => {
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "sessions.create",
      await readRequestBody(request),
    );
    if (!result) return;
    return result;
  });

  app.post(`${projectWorkspacePrefix}/sessions`, async (request, reply) => {
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "sessions.create",
      await readRequestBody(request),
    );
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/sessions:search`, async (request, reply) => {
    const query = request.query as { q?: string; limit?: string };
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:read",
      "sessions.search",
      {
        q: query.q ?? "",
        ...(query.limit ? { limit: Number(query.limit) } : {}),
      },
    );
    if (!result) return;
    return result;
  });

  app.get(`${projectWorkspacePrefix}/sessions:search`, async (request, reply) => {
    const query = request.query as { q?: string; limit?: string };
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:read",
      "sessions.search",
      {
        q: query.q ?? "",
        ...(query.limit ? { limit: Number(query.limit) } : {}),
      },
    );
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/sessions/:sessionId`, async (request, reply) => {
    const params = request.params as WorkspaceParams;
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:read",
      "sessions.get",
      { sessionId: params.sessionId },
    );
    if (!result) return;
    return result;
  });

  app.get(`${projectWorkspacePrefix}/sessions/:sessionId`, async (request, reply) => {
    const params = request.params as ProjectAgentParams;
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:read",
      "sessions.get",
      { sessionId: params.sessionId },
    );
    if (!result) return;
    return result;
  });

  app.patch(`${workspacePrefix}/sessions/:sessionId`, async (request, reply) => {
    const params = request.params as WorkspaceParams;
    const body = await readRequestBody(request);
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "sessions.update",
      { sessionId: params.sessionId, title: body.title },
    );
    if (!result) return;
    return result;
  });

  app.patch(`${projectWorkspacePrefix}/sessions/:sessionId`, async (request, reply) => {
    const params = request.params as ProjectAgentParams;
    const body = await readRequestBody(request);
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "sessions.update",
      { sessionId: params.sessionId, title: body.title },
    );
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/sessions/:sessionId/messages`, async (request, reply) => {
    const params = request.params as WorkspaceParams;
    const body = await readRequestBody(request);
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "sessions.append-message",
      { sessionId: params.sessionId, ...body },
    );
    if (!result) return;
    return result;
  });

  app.post(`${projectWorkspacePrefix}/sessions/:sessionId/messages`, async (request, reply) => {
    const params = request.params as ProjectAgentParams;
    const body = await readRequestBody(request);
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "sessions.append-message",
      { sessionId: params.sessionId, ...body },
    );
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/sessions/:sessionId/reply`, async (request, reply) => {
    const params = request.params as WorkspaceParams;
    const body = await readRequestBody(request);
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "sessions.reply",
      { sessionId: params.sessionId, ...body },
    );
    if (!result) return;
    const inputMessage = typeof body.message === "string" ? body.message : "";
    const replyText = typeof result.reply === "string" ? result.reply : "";
    db.recordUsage({
      tenantId: params.tenantId,
      agentId: params.agentId,
      workspaceId: params.workspaceId,
      tokensIn: tokensFromText(inputMessage),
      tokensOut: tokensFromText(replyText),
    });
    return result;
  });

  app.post(`${projectWorkspacePrefix}/sessions/:sessionId/reply`, async (request, reply) => {
    const params = request.params as ProjectAgentParams;
    const body = await readRequestBody(request);
    const assignment = db.getProjectAssignment(params.tenantId, params.projectId, params.agentId);
    if (!assignment) {
      return await reply.code(404).send({ error: "project_agent_assignment_not_found" });
    }
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "sessions.reply",
      { sessionId: params.sessionId, ...body },
    );
    if (!result) return;
    const inputMessage = typeof body.message === "string" ? body.message : "";
    const replyText = typeof result.reply === "string" ? result.reply : "";
    db.recordUsage({
      tenantId: params.tenantId,
      agentId: params.agentId,
      workspaceId: assignment.workspaceId,
      tokensIn: tokensFromText(inputMessage),
      tokensOut: tokensFromText(replyText),
    });
    return result;
  });

  app.get(`${workspacePrefix}/sessions/:sessionId/stream`, async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "chat:stream");
    if (!claims) return;
    const params = request.params as WorkspaceParams;
    try {
      ensureWorkspaceAccess(claims, params, db);
    } catch (error) {
      await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
      return;
    }
    const query = request.query as { message?: string; systemPrompt?: string; transport?: string };
    reply.hijack();
    reply.raw.statusCode = 200;
    reply.raw.setHeader("content-type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("cache-control", "no-cache, no-transform");
    reply.raw.setHeader("connection", "keep-alive");

    const abortController = new AbortController();
    request.raw.on("close", () => abortController.abort("client_disconnect"));

    let streamedText = "";
    const writeEvent = (event: string, payload: Record<string, unknown>) => {
      if (reply.raw.destroyed) return;
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      const result = await registry.invoke({
        tenantId: params.tenantId,
        connectorId: resolveConnectorId(db, params.tenantId, params.agentId),
        agentId: params.agentId,
        workspaceId: params.workspaceId,
        operation: "sessions.stream",
        payload: {
          sessionId: params.sessionId,
          ...(query.message ? { message: query.message } : {}),
          ...(query.systemPrompt ? { systemPrompt: query.systemPrompt } : {}),
          ...(query.transport ? { transport: query.transport } : {}),
        },
        onStream: (stream) => {
          const payload = stream.payload;
          if (typeof payload.delta === "string") streamedText += payload.delta;
          writeEvent(stream.event, payload);
        },
        signal: abortController.signal,
      });
      db.recordUsage({
        tenantId: params.tenantId,
        agentId: params.agentId,
        workspaceId: params.workspaceId,
        tokensIn: tokensFromText(query.message ?? ""),
        tokensOut: tokensFromText(streamedText),
      });
      if (result.cancelled) {
        writeEvent("cancelled", {});
      } else {
        writeEvent("complete", { ok: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeEvent("error", { error: message });
    } finally {
      if (!reply.raw.destroyed) reply.raw.end();
    }
  });

  app.get(`${projectWorkspacePrefix}/sessions/:sessionId/stream`, async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "chat:stream");
    if (!claims) return;
    const params = request.params as ProjectAgentParams;
    const assignment = db.getProjectAssignment(params.tenantId, params.projectId, params.agentId);
    if (!assignment) {
      return await reply.code(404).send({ error: "project_agent_assignment_not_found" });
    }
    try {
      ensureWorkspaceAccess(claims, assignmentWorkspaceParams(params, assignment.workspaceId), db);
    } catch (error) {
      await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
      return;
    }
    const query = request.query as { message?: string; systemPrompt?: string; transport?: string };
    reply.hijack();
    reply.raw.statusCode = 200;
    reply.raw.setHeader("content-type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("cache-control", "no-cache, no-transform");
    reply.raw.setHeader("connection", "keep-alive");

    const abortController = new AbortController();
    request.raw.on("close", () => abortController.abort("client_disconnect"));

    let streamedText = "";
    const writeEvent = (event: string, payload: Record<string, unknown>) => {
      if (reply.raw.destroyed) return;
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      const result = await registry.invoke({
        tenantId: params.tenantId,
        connectorId: resolveConnectorId(db, params.tenantId, params.agentId),
        agentId: params.agentId,
        workspaceId: assignment.workspaceId,
        operation: "sessions.stream",
        payload: {
          sessionId: params.sessionId,
          ...(query.message ? { message: query.message } : {}),
          ...(query.systemPrompt ? { systemPrompt: query.systemPrompt } : {}),
          ...(query.transport ? { transport: query.transport } : {}),
        },
        onStream: (stream) => {
          const streamPayload = stream.payload;
          if (typeof streamPayload.delta === "string") streamedText += streamPayload.delta;
          writeEvent(stream.event, streamPayload);
        },
        signal: abortController.signal,
      });
      db.recordUsage({
        tenantId: params.tenantId,
        agentId: params.agentId,
        workspaceId: assignment.workspaceId,
        tokensIn: tokensFromText(query.message ?? ""),
        tokensOut: tokensFromText(streamedText),
      });
      if (result.cancelled) {
        writeEvent("cancelled", {});
      } else {
        writeEvent("complete", { ok: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeEvent("error", { error: message });
    } finally {
      if (!reply.raw.destroyed) reply.raw.end();
    }
  });

  app.post(`${workspacePrefix}/sessions/:sessionId/stream`, async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "chat:stream");
    if (!claims) return;
    const params = request.params as WorkspaceParams;
    try {
      ensureWorkspaceAccess(claims, params, db);
    } catch (error) {
      await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
      return;
    }
    const body = await readRequestBody(request);
    reply.hijack();
    reply.raw.statusCode = 200;
    reply.raw.setHeader("content-type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("cache-control", "no-cache, no-transform");
    reply.raw.setHeader("connection", "keep-alive");

    const abortController = new AbortController();
    request.raw.on("close", () => abortController.abort("client_disconnect"));

    let streamedText = "";
    const writeEvent = (event: string, payload: Record<string, unknown>) => {
      if (reply.raw.destroyed) return;
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      const result = await registry.invoke({
        tenantId: params.tenantId,
        connectorId: resolveConnectorId(db, params.tenantId, params.agentId),
        agentId: params.agentId,
        workspaceId: params.workspaceId,
        operation: "sessions.stream",
        payload: {
          sessionId: params.sessionId,
          ...(typeof body.message === "string" ? { message: body.message } : {}),
          ...(typeof body.systemPrompt === "string" ? { systemPrompt: body.systemPrompt } : {}),
          ...(typeof body.transport === "string" ? { transport: body.transport } : {}),
          ...(Array.isArray(body.documentIds) ? { documentIds: body.documentIds } : {}),
        },
        onStream: (stream) => {
          const payload = stream.payload;
          if (typeof payload.delta === "string") streamedText += payload.delta;
          writeEvent(stream.event, payload);
        },
        signal: abortController.signal,
      });
      db.recordUsage({
        tenantId: params.tenantId,
        agentId: params.agentId,
        workspaceId: params.workspaceId,
        tokensIn: tokensFromText(typeof body.message === "string" ? body.message : ""),
        tokensOut: tokensFromText(streamedText),
      });
      if (result.cancelled) {
        writeEvent("cancelled", {});
      } else {
        writeEvent("complete", { ok: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeEvent("error", { error: message });
    } finally {
      if (!reply.raw.destroyed) reply.raw.end();
    }
  });

  app.post(`${projectWorkspacePrefix}/sessions/:sessionId/stream`, async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "chat:stream");
    if (!claims) return;
    const params = request.params as ProjectAgentParams;
    const assignment = db.getProjectAssignment(params.tenantId, params.projectId, params.agentId);
    if (!assignment) {
      return await reply.code(404).send({ error: "project_agent_assignment_not_found" });
    }
    try {
      ensureWorkspaceAccess(claims, assignmentWorkspaceParams(params, assignment.workspaceId), db);
    } catch (error) {
      await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
      return;
    }
    const body = await readRequestBody(request);
    reply.hijack();
    reply.raw.statusCode = 200;
    reply.raw.setHeader("content-type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("cache-control", "no-cache, no-transform");
    reply.raw.setHeader("connection", "keep-alive");

    const abortController = new AbortController();
    request.raw.on("close", () => abortController.abort("client_disconnect"));

    let streamedText = "";
    const writeEvent = (event: string, payload: Record<string, unknown>) => {
      if (reply.raw.destroyed) return;
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      const result = await registry.invoke({
        tenantId: params.tenantId,
        connectorId: resolveConnectorId(db, params.tenantId, params.agentId),
        agentId: params.agentId,
        workspaceId: assignment.workspaceId,
        operation: "sessions.stream",
        payload: {
          sessionId: params.sessionId,
          ...(typeof body.message === "string" ? { message: body.message } : {}),
          ...(typeof body.systemPrompt === "string" ? { systemPrompt: body.systemPrompt } : {}),
          ...(typeof body.transport === "string" ? { transport: body.transport } : {}),
          ...(Array.isArray(body.documentIds) ? { documentIds: body.documentIds } : {}),
        },
        onStream: (stream) => {
          const payload = stream.payload;
          if (typeof payload.delta === "string") streamedText += payload.delta;
          writeEvent(stream.event, payload);
        },
        signal: abortController.signal,
      });
      db.recordUsage({
        tenantId: params.tenantId,
        agentId: params.agentId,
        workspaceId: assignment.workspaceId,
        tokensIn: tokensFromText(typeof body.message === "string" ? body.message : ""),
        tokensOut: tokensFromText(streamedText),
      });
      if (result.cancelled) {
        writeEvent("cancelled", {});
      } else {
        writeEvent("complete", { ok: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeEvent("error", { error: message });
    } finally {
      if (!reply.raw.destroyed) reply.raw.end();
    }
  });

  app.post(`${workspacePrefix}/sessions/:sessionId/generate-title`, async (request, reply) => {
    const params = request.params as WorkspaceParams;
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "sessions.generate-title",
      { sessionId: params.sessionId },
    );
    if (!result) return;
    return result;
  });

  app.post(`${projectWorkspacePrefix}/sessions/:sessionId/generate-title`, async (request, reply) => {
    const params = request.params as ProjectAgentParams;
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "sessions.generate-title",
      { sessionId: params.sessionId },
    );
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/documents`, async (request, reply) => {
    const query = request.query as { sessionId?: string };
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.list",
      {
        ...(typeof query.sessionId === "string" ? { sessionId: query.sessionId } : {}),
      },
    );
    if (!result) return;
    return result;
  });

  app.get(`${projectWorkspacePrefix}/documents`, async (request, reply) => {
    const query = request.query as { sessionId?: string };
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.list",
      {
        ...(typeof query.sessionId === "string" ? { sessionId: query.sessionId } : {}),
      },
    );
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/documents:search`, async (request, reply) => {
    const query = request.query as { q?: string; limit?: string; sessionId?: string };
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.search",
      {
        q: query.q ?? "",
        ...(query.limit ? { limit: Number(query.limit) } : {}),
        ...(typeof query.sessionId === "string" ? { sessionId: query.sessionId } : {}),
      },
    );
    if (!result) return;
    return result;
  });

  app.get(`${projectWorkspacePrefix}/documents:search`, async (request, reply) => {
    const query = request.query as { q?: string; limit?: string; sessionId?: string };
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.search",
      {
        q: query.q ?? "",
        ...(query.limit ? { limit: Number(query.limit) } : {}),
        ...(typeof query.sessionId === "string" ? { sessionId: query.sessionId } : {}),
      },
    );
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/documents/:documentId`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { documentId: string };
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.get",
      { documentId: params.documentId },
    );
    if (!result) return;
    return result;
  });

  app.get(`${projectWorkspacePrefix}/documents/:documentId`, async (request, reply) => {
    const params = request.params as ProjectAgentParams & { documentId: string };
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.get",
      { documentId: params.documentId },
    );
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/documents/register`, async (request, reply) => {
    const body = await readRequestBody(request);
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.register",
      body,
    );
    if (!result) return;
    return result;
  });

  app.post(`${projectWorkspacePrefix}/documents/register`, async (request, reply) => {
    const body = await readRequestBody(request);
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.register",
      body,
    );
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/documents/upload`, async (request, reply) => {
    const body = await readRequestBody(request);
    const begin = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.upload.begin",
      {
        name: body.name,
        mimeType: body.mimeType,
        ...(typeof body.origin === "string" ? { origin: body.origin } : {}),
        ...(typeof body.sessionId === "string" ? { sessionId: body.sessionId } : {}),
      },
    );
    if (!begin) return;
    const uploadId = typeof begin.uploadId === "string" ? begin.uploadId : "";
    const chunk = normalizeUploadData(body.data);
    const chunkResult = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.upload.chunk",
      { uploadId, chunk },
    );
    if (!chunkResult) return;
    const commit = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.upload.commit",
      { uploadId },
    );
    if (!commit) return;
    return commit;
  });

  app.post(`${projectWorkspacePrefix}/documents/upload`, async (request, reply) => {
    const body = await readRequestBody(request);
    const begin = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.upload.begin",
      {
        name: body.name,
        mimeType: body.mimeType,
        ...(typeof body.origin === "string" ? { origin: body.origin } : {}),
        ...(typeof body.sessionId === "string" ? { sessionId: body.sessionId } : {}),
      },
    );
    if (!begin) return;
    const uploadId = typeof begin.uploadId === "string" ? begin.uploadId : "";
    const chunk = normalizeUploadData(body.data);
    const chunkResult = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.upload.chunk",
      { uploadId, chunk },
    );
    if (!chunkResult) return;
    const commit = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.upload.commit",
      { uploadId },
    );
    if (!commit) return;
    return commit;
  });

  app.get(`${workspacePrefix}/documents/:documentId/download`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { documentId: string };
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.download",
      { documentId: params.documentId },
    );
    if (!result) return;
    const document = (result.document ?? null) as { name?: string; mimeType?: string } | null;
    const contentBase64 = typeof result.contentBase64 === "string" ? result.contentBase64 : "";
    if (!document || !contentBase64) {
      return await reply.code(404).send({ error: "document_not_found" });
    }
    reply.header("content-type", document.mimeType ?? "application/octet-stream");
    reply.header("content-disposition", `attachment; filename="${document.name ?? params.documentId}"`);
    return Buffer.from(contentBase64, "base64");
  });

  app.get(`${projectWorkspacePrefix}/documents/:documentId/download`, async (request, reply) => {
    const params = request.params as ProjectAgentParams & { documentId: string };
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.download",
      { documentId: params.documentId },
    );
    if (!result) return;
    const document = (result.document ?? null) as { name?: string; mimeType?: string } | null;
    const contentBase64 = typeof result.contentBase64 === "string" ? result.contentBase64 : "";
    if (!document || !contentBase64) {
      return await reply.code(404).send({ error: "document_not_found" });
    }
    reply.header("content-type", document.mimeType ?? "application/octet-stream");
    reply.header("content-disposition", `attachment; filename="${document.name ?? params.documentId}"`);
    return Buffer.from(contentBase64, "base64");
  });

  app.post(`${workspacePrefix}/chat/feedback`, async (request, reply) => {
    const body = await readRequestBody(request);
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "chat.feedback",
      body,
    );
    if (!result) return;
    return result;
  });

  app.post(`${projectWorkspacePrefix}/chat/feedback`, async (request, reply) => {
    const body = await readRequestBody(request);
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "chat.feedback",
      body,
    );
    if (!result) return;
    return result;
  });

  const resourceMap = [
    { path: "tasks", scope: "workspace:data" },
    { path: "goals", scope: "workspace:data" },
    { path: "projects", scope: "workspace:data" },
    { path: "notes", scope: "workspace:data" },
    { path: "memory", scope: "workspace:data" },
    { path: "inbox", scope: "workspace:data" },
    { path: "people", scope: "workspace:data" },
    { path: "reminders", scope: "workspace:data" },
    { path: "deadlines", scope: "workspace:data" },
    { path: "events", scope: "workspace:data" },
    { path: "time", scope: "workspace:data" },
    { path: "personas", scope: "workspace:data" },
    { path: "plugins", scope: "workspace:data" },
    { path: "routines", scope: "workspace:data" },
    { path: "images", scope: "workspace:data" },
  ] as const;

  for (const resource of resourceMap) {
    app.get(`${workspacePrefix}/${resource.path}`, async (request, reply) => {
      const query = request.query as Record<string, unknown>;
      const result = await invokeWorkspace(
        request as FastifyRequest<{ Params: WorkspaceParams }>,
        reply,
        auth,
        registry,
        db,
        resource.scope,
        `${resource.path}.list`,
        query,
      );
      if (!result) return;
      return result;
    });

    app.get(`${projectWorkspacePrefix}/${resource.path}`, async (request, reply) => {
      const query = request.query as Record<string, unknown>;
      const result = await invokeProjectAssignment(
        request as FastifyRequest<{ Params: ProjectAgentParams }>,
        reply,
        auth,
        registry,
        db,
        resource.scope,
        `${resource.path}.list`,
        query,
      );
      if (!result) return;
      return result;
    });

    app.post(`${workspacePrefix}/${resource.path}`, async (request, reply) => {
      const result = await invokeWorkspace(
        request as FastifyRequest<{ Params: WorkspaceParams }>,
        reply,
        auth,
        registry,
        db,
        resource.scope,
        `${resource.path}.create`,
        await readRequestBody(request),
      );
      if (!result) return;
      return result;
    });

    app.post(`${projectWorkspacePrefix}/${resource.path}`, async (request, reply) => {
      const result = await invokeProjectAssignment(
        request as FastifyRequest<{ Params: ProjectAgentParams }>,
        reply,
        auth,
        registry,
        db,
        resource.scope,
        `${resource.path}.create`,
        await readRequestBody(request),
      );
      if (!result) return;
      return result;
    });

    app.put(`${workspacePrefix}/${resource.path}`, async (request, reply) => {
      const result = await invokeWorkspace(
        request as FastifyRequest<{ Params: WorkspaceParams }>,
        reply,
        auth,
        registry,
        db,
        resource.scope,
        `${resource.path}.update`,
        await readRequestBody(request),
      );
      if (!result) return;
      return result;
    });

    app.put(`${projectWorkspacePrefix}/${resource.path}`, async (request, reply) => {
      const result = await invokeProjectAssignment(
        request as FastifyRequest<{ Params: ProjectAgentParams }>,
        reply,
        auth,
        registry,
        db,
        resource.scope,
        `${resource.path}.update`,
        await readRequestBody(request),
      );
      if (!result) return;
      return result;
    });

    app.delete(`${workspacePrefix}/${resource.path}`, async (request, reply) => {
      const body = await readRequestBody(request);
      const query = request.query as Record<string, unknown>;
      const payload = Object.keys(body).length > 0 ? body : query;
      const result = await invokeWorkspace(
        request as FastifyRequest<{ Params: WorkspaceParams }>,
        reply,
        auth,
        registry,
        db,
        resource.scope,
        `${resource.path}.delete`,
        payload,
      );
      if (!result) return;
      return result;
    });

    app.delete(`${projectWorkspacePrefix}/${resource.path}`, async (request, reply) => {
      const body = await readRequestBody(request);
      const query = request.query as Record<string, unknown>;
      const payload = Object.keys(body).length > 0 ? body : query;
      const result = await invokeProjectAssignment(
        request as FastifyRequest<{ Params: ProjectAgentParams }>,
        reply,
        auth,
        registry,
        db,
        resource.scope,
        `${resource.path}.delete`,
        payload,
      );
      if (!result) return;
      return result;
    });
  }

  app.get(`${workspacePrefix}/content/brands`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.brands.list");
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/content/brands`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.brands.create", await readRequestBody(request));
    if (!result) return;
    return result;
  });

  app.put(`${workspacePrefix}/content/brands/:brandId`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { brandId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.brands.update", {
      id: params.brandId,
      ...(await readRequestBody(request)),
    });
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/destinations`, async (request, reply) => {
    const query = request.query as { brandId?: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.destinations.list", query);
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/content/destinations`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.destinations.create", await readRequestBody(request));
    if (!result) return;
    return result;
  });

  app.put(`${workspacePrefix}/content/destinations/:destinationId`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { destinationId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.destinations.update", {
      id: params.destinationId,
      ...(await readRequestBody(request)),
    });
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/content/destinations/:destinationId/test-connection`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { destinationId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.destinations.testConnection", { id: params.destinationId });
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/campaigns`, async (request, reply) => {
    const query = request.query as { brandId?: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.campaigns.list", query);
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/content/campaigns`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.campaigns.create", await readRequestBody(request));
    if (!result) return;
    return result;
  });

  app.put(`${workspacePrefix}/content/campaigns/:campaignId`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { campaignId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.campaigns.update", {
      id: params.campaignId,
      ...(await readRequestBody(request)),
    });
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/entries`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.entries.list", request.query as Record<string, unknown>);
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/content/entries`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.entries.create", await readRequestBody(request));
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/entries/:entryId`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { entryId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.entries.get", { id: params.entryId });
    if (!result) return;
    return result;
  });

  app.put(`${workspacePrefix}/content/entries/:entryId`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { entryId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.entries.update", {
      id: params.entryId,
      ...(await readRequestBody(request)),
    });
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/content/entries/:entryId/archive`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { entryId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.entries.archive", { id: params.entryId });
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/content/entries/:entryId/assets`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { entryId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.entries.attachAsset", {
      id: params.entryId,
      ...(await readRequestBody(request)),
    });
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/content/entries/:entryId/variants:generate`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { entryId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.entries.generateVariants", {
      id: params.entryId,
      ...(await readRequestBody(request)),
    });
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/variants`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.variants.list", request.query as Record<string, unknown>);
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/content/variants`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.variants.create", await readRequestBody(request));
    if (!result) return;
    return result;
  });

  app.put(`${workspacePrefix}/content/variants/:variantId`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { variantId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.variants.update", {
      id: params.variantId,
      ...(await readRequestBody(request)),
    });
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/approvals`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.approvals.list", request.query as Record<string, unknown>);
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/content/approvals/:approvalId/approve`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { approvalId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.approvals.approve", {
      id: params.approvalId,
      ...(await readRequestBody(request)),
    });
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/content/approvals/:approvalId/reject`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { approvalId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.approvals.reject", {
      id: params.approvalId,
      ...(await readRequestBody(request)),
    });
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/content/approvals/:approvalId/cancel`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { approvalId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.approvals.cancel", { id: params.approvalId });
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/calendar`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.calendar.view");
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/plans`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.publish.listPlans", request.query as Record<string, unknown>);
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/content/plans`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.publish.createPlan", await readRequestBody(request));
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/content/plans/:planId/cancel`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { planId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.publish.cancelPlan", { id: params.planId });
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/content/plans/:planId/run`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { planId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.publish.runNow", { id: params.planId });
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/publications`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.publish.listRuns");
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/publications/:runId`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { runId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.publish.getRun", { id: params.runId });
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/content/publications/:runId/retry`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { runId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.publish.retryRun", { id: params.runId });
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/app/frontend-contract`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.app.frontendContract");
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/app/screens`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.app.screens");
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/app/dashboard`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.app.dashboard");
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/app/calendar`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.app.calendar");
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/app/pipeline`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.app.pipeline");
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/app/composer/:entryId`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { entryId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.app.composer", { entryId: params.entryId });
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/app/destinations`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.app.destinations");
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/app/approvals`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.app.approvals");
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/app/publications`, async (request, reply) => {
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.app.publications");
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/content/app/forms/:formId`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { formId: string };
    const result = await invokeWorkspace(request as FastifyRequest<{ Params: WorkspaceParams }>, reply, auth, registry, db, "workspace:data", "content.app.form", { formId: params.formId });
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/images/:imageId`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { imageId: string };
    const result = await invokeWorkspace(
      { ...request, params } as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "images.get",
      { imageId: params.imageId },
    );
    if (!result) return;
    return result;
  });

  app.get(`${projectWorkspacePrefix}/images/:imageId`, async (request, reply) => {
    const params = request.params as ProjectAgentParams & { imageId: string };
    const result = await invokeProjectAssignment(
      { ...request, params } as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "images.get",
      { imageId: params.imageId },
      params,
    );
    if (!result) return;
    return result;
  });

  app.delete(`${workspacePrefix}/images/:imageId`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { imageId: string };
    const result = await invokeWorkspace(
      { ...request, params } as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "images.delete",
      { imageId: params.imageId },
    );
    if (!result) return;
    return result;
  });

  app.delete(`${projectWorkspacePrefix}/images/:imageId`, async (request, reply) => {
    const params = request.params as ProjectAgentParams & { imageId: string };
    const result = await invokeProjectAssignment(
      { ...request, params } as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "images.delete",
      { imageId: params.imageId },
      params,
    );
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/skills/list`, async (request, reply) => {
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:read",
      "skills.list",
    );
    if (!result) return;
    return result;
  });

  app.get(`${projectWorkspacePrefix}/skills/list`, async (request, reply) => {
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:read",
      "skills.list",
    );
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/skills/search`, async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:read",
      "skills.search",
      query,
    );
    if (!result) return;
    return result;
  });

  app.get(`${projectWorkspacePrefix}/skills/search`, async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:read",
      "skills.search",
      query,
    );
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/skills/sources`, async (request, reply) => {
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:read",
      "skills.sources",
    );
    if (!result) return;
    return result;
  });

  app.get(`${projectWorkspacePrefix}/skills/sources`, async (request, reply) => {
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:read",
      "skills.sources",
    );
    if (!result) return;
    return result;
  });

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
  const publicDir = path.resolve(__dirname, "../../ui/dist");
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
