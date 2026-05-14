import type { FastifyReply, FastifyRequest } from "fastify";

import type { BrowserActor } from "../../../browser/shared/types.ts";
import type { AuthClaims } from "../shared/protocol.ts";
import type { ProjectResourceRef, ProjectSecretRef } from "../shared/project-model.ts";
import { RelayAuthService } from "./auth.ts";
import type { RelayConfig } from "./config.ts";
import { ConnectorRegistry, OfflineError } from "./connector-registry.ts";
import { RelayDatabase } from "./db.ts";
import { MemoryRateLimiter } from "./rate-limit.ts";

export type WorkspaceParams = {
  tenantId: string;
  agentId: string;
  workspaceId: string;
  sessionId?: string;
};

export type ProjectAgentParams = {
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

export function parseServiceRelayToken(request: FastifyRequest): string | null {
  const relayHeader = request.headers["x-clawjs-relay-authorization"] ?? request.headers["x-relay-authorization"];
  const header = Array.isArray(relayHeader) ? relayHeader[0] : relayHeader;
  if (typeof header === "string" && header.trim()) {
    const [scheme, token] = header.trim().split(" ");
    if (scheme?.toLowerCase() === "bearer" && token) return token;
  }
  const queryToken = new URL(request.url, "http://relay.local").searchParams.get("relay_access_token");
  if (queryToken?.trim()) return queryToken.trim();
  return parseBearerToken(request);
}

export function parseWebSocketAccessToken(request: FastifyRequest): string | null {
  const queryToken = new URL(request.url, "http://relay.local").searchParams.get("access_token");
  if (queryToken?.trim()) return queryToken.trim();
  return parseBearerToken(request);
}

export function ensureScope(claims: AuthClaims, scope: string): boolean {
  return claims.role === "admin" || claims.scopes.includes("*") || claims.scopes.includes(scope);
}

export function authorizeTenant(claims: AuthClaims, tenantId: string): void {
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

export function ensureWorkspaceAccess(claims: AuthClaims, params: WorkspaceParams, db: RelayDatabase): void {
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
  return bare.startsWith("192.168.")
    || bare.startsWith("10.")
    || /^172\.(1[6-9]|2\d|3[01])\./.test(bare)
    || /^100\.(6[4-9]|[78]\d|9\d|1[01]\d|12[0-7])\./.test(bare);
}

function isSecureRequest(request: FastifyRequest): boolean {
  const forwardedProto = request.headers["x-forwarded-proto"];
  if (typeof forwardedProto === "string") return forwardedProto.split(",")[0]?.trim() === "https";
  return (request.protocol ?? "").toLowerCase() === "https";
}

export async function requireSecureTransport(
  request: FastifyRequest,
  reply: FastifyReply,
  config: RelayConfig,
): Promise<boolean> {
  const host = request.headers.host ?? new URL(config.publicBaseUrl).host;
  if (isLoopbackHost(host) || isSecureRequest(request)) return true;
  await reply.code(400).send({ error: "https_required", message: "HTTPS is required outside localhost." });
  return false;
}

export async function requireRateLimit(
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

export function resolveConnectorId(db: RelayDatabase, tenantId: string, agentId: string): string {
  const connector = db.getConnectorByAgentId(tenantId, agentId);
  if (!connector) {
    throw new OfflineError(`No active connector for ${agentId}`);
  }
  return connector.connectorId;
}

export async function requireClaims(
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

export async function requireServiceClaims(
  request: FastifyRequest,
  reply: FastifyReply,
  auth: RelayAuthService,
  scope: string,
): Promise<AuthClaims | null> {
  const token = parseServiceRelayToken(request);
  if (!token) {
    await reply.code(401).send({ error: "Unauthorized", message: "Missing relay bearer token." });
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
    await reply.code(401).send({ error: "Unauthorized", message: "Invalid relay bearer token." });
    return null;
  }
}

export function tokensFromText(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export async function readRequestBody(request: FastifyRequest): Promise<Record<string, unknown>> {
  return (await request.body ?? {}) as Record<string, unknown>;
}

export function normalizeUploadData(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:")) {
    const [, base64Data = ""] = trimmed.split(",", 2);
    return base64Data;
  }
  return trimmed;
}

export function filteredServiceHeaders(request: FastifyRequest): Record<string, string> {
  const excluded = new Set([
    "host",
    "connection",
    "content-length",
    "transfer-encoding",
    "upgrade",
    "sec-websocket-key",
    "sec-websocket-version",
    "sec-websocket-extensions",
    "sec-websocket-protocol",
    "x-clawjs-relay-authorization",
    "x-relay-authorization",
  ]);
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(request.headers)) {
    const lower = key.toLowerCase();
    if (excluded.has(lower)) continue;
    if (typeof value === "string") headers[lower] = value;
    else if (Array.isArray(value)) headers[lower] = value.join(", ");
  }
  return headers;
}

export function filteredResponseHeaders(headers: Record<string, unknown>): Record<string, string> {
  const excluded = new Set([
    "connection",
    "content-length",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
  ]);
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (excluded.has(lower)) continue;
    if (typeof value === "string") result[lower] = value;
  }
  return result;
}

export function servicePathFromRequest(request: FastifyRequest<{ Params: { serviceId: string; "*": string } }>): string {
  const wildcard = request.params["*"] ?? "";
  const pathName = wildcard ? `/${wildcard}` : "/";
  const queryIndex = request.url.indexOf("?");
  const query = queryIndex >= 0 ? request.url.slice(queryIndex) : "";
  if (!query) return pathName;
  const params = new URLSearchParams(query.slice(1));
  params.delete("relay_access_token");
  const nextQuery = params.toString();
  return nextQuery ? `${pathName}?${nextQuery}` : pathName;
}

export function serviceBodyBase64(request: FastifyRequest): string | undefined {
  const body = request.body as unknown;
  if (!body) return undefined;
  if (Buffer.isBuffer(body)) return body.toString("base64");
  if (typeof body === "string") return Buffer.from(body).toString("base64");
  if (body instanceof Uint8Array) return Buffer.from(body).toString("base64");
  return Buffer.from(JSON.stringify(body)).toString("base64");
}

export function parseProjectResourceRefs(value: unknown): ProjectResourceRef[] {
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

export function parseProjectSecretRefs(value: unknown): ProjectSecretRef[] {
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

export function assignmentWorkspaceParams(params: ProjectAgentParams, workspaceId: string): WorkspaceParams {
  return {
    tenantId: params.tenantId,
    agentId: params.agentId,
    workspaceId,
    ...(params.sessionId ? { sessionId: params.sessionId } : {}),
  };
}

export function browserActorFromClaims(claims: AuthClaims): BrowserActor {
  return {
    deviceId: claims.deviceId ?? claims.sub,
    userId: claims.sub,
    email: claims.email,
  };
}

export function browserSharePath(params: WorkspaceParams): string {
  return `/browser/${params.tenantId}/${params.agentId}/${params.workspaceId}`;
}

export function browserShareUrl(config: RelayConfig, params: WorkspaceParams): string {
  return new URL(browserSharePath(params), config.publicBaseUrl).toString();
}

export async function invokeWorkspace(
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

export async function invokeProjectAssignment(
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

export async function forwardIotJson(
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

export async function forwardIotEventStream(
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
  const controller = new AbortController();
  const abortUpstream = () => controller.abort();
  request.raw.once("close", abortUpstream);
  const response = await fetch(`${config.iotBaseUrl.replace(/\/$/, "")}${input.path}`, {
    signal: controller.signal,
  });
  if (!response.ok || !response.body) {
    request.raw.off("close", abortUpstream);
    await reply.code(response.status || 502).send({ error: "iot_stream_unavailable" });
    return null;
  }
  reply.raw.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
  });
  const reader = response.body.getReader();
  try {
    while (!controller.signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && !reply.raw.destroyed) {
        reply.raw.write(Buffer.from(value));
      }
    }
  } catch (error) {
    if (!controller.signal.aborted) throw error;
  } finally {
    request.raw.off("close", abortUpstream);
    await reader.cancel().catch(() => {});
    if (!reply.raw.destroyed && !reply.raw.writableEnded) {
      reply.raw.end();
    }
  }
  return reply;
}

export async function requireProjectAssignmentAccess(
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
