import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";

import { DriveAuthService, type AuthPrincipal } from "./auth.ts";
import { loadDriveConfig, type DriveServiceConfig } from "./config.ts";
import { DriveConverterService } from "./converters.ts";
import { DriveConflictError, type DriveActor, DriveStore } from "./db.ts";
import { DriveEventBus, registerRealtime } from "./realtime.ts";
import { processItemImagePipeline } from "./image-pipeline.ts";
import { DriveSharingService } from "./sharing.ts";
import type {
  DriveAuditEventKind,
  DriveNativeContent,
  DriveOperation,
  DrivePreviewKind,
  DriveRealtimeEvent,
  DriveRealtimeEventKind,
  DriveView,
} from "../shared/types.ts";

function resolvePublicRoot(config: DriveServiceConfig): string {
  const candidates = [
    config.uiDistDir,
    fileURLToPath(new URL("../../ui/dist", import.meta.url)),
    fileURLToPath(new URL("../ui/dist", import.meta.url)),
    path.join(process.cwd(), "ui", "dist"),
  ].filter(Boolean) as string[];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0]!;
}

function resolveBrandRoot(): string {
  const candidates = [
    fileURLToPath(new URL("../../../public", import.meta.url)),
    fileURLToPath(new URL("../../public", import.meta.url)),
    path.join(process.cwd(), "..", "public"),
    path.join(process.cwd(), "public"),
  ];
  return candidates.find((candidate) => (
    fs.existsSync(path.join(candidate, "logo.png")) &&
    fs.existsSync(path.join(candidate, "favicon.ico"))
  )) ?? candidates[0];
}

function parseBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (header) {
    const [scheme, token] = header.split(" ");
    if (scheme?.toLowerCase() === "bearer" && token) return token;
  }
  const rawUrl = request.raw.url ?? request.url;
  if (rawUrl) {
    const parsed = new URL(rawUrl, "http://127.0.0.1");
    const queryToken = parsed.searchParams.get("token");
    if (queryToken?.trim()) return queryToken;
  }
  return null;
}

function readBody(request: FastifyRequest): Record<string, unknown> {
  return (request.body ?? {}) as Record<string, unknown>;
}

function queryString(request: FastifyRequest, key: string): string | undefined {
  const query = request.query as Record<string, unknown>;
  const value = query?.[key];
  return typeof value === "string" ? value : undefined;
}

async function resolvePrincipal(request: FastifyRequest, auth: DriveAuthService, store: DriveStore): Promise<AuthPrincipal | null> {
  const token = parseBearerToken(request);
  if (!token) return null;
  const admin = await auth.verifyAdminToken(token);
  if (admin) return admin;
  const scopedToken = store.authenticateScopedToken(token);
  if (scopedToken) {
    return {
      kind: "token",
      tokenId: scopedToken.id,
      operations: scopedToken.operations,
    };
  }
  const share = store.authenticateShareToken(token);
  if (share) {
    return {
      kind: "share",
      shareId: share.id,
      itemId: share.itemId,
    };
  }
  const agent = store.authenticateAgentShare(token);
  if (agent) {
    return {
      kind: "agent",
      agentShareId: agent.id,
      itemId: agent.itemId,
      agentName: agent.agentName,
      capabilityKind: agent.capability.kind,
    };
  }
  return null;
}

const AGENT_OPERATION_BY_KIND: Record<string, DriveOperation> = {
  "drive.item.read": "items:read",
  "drive.item.write": "items:write",
  "drive.item.delete": "items:delete",
  "drive.item.share": "items:share",
};

function ensureAllowed(principal: AuthPrincipal, requirement: {
  operation?: DriveOperation;
  itemId?: string;
  adminOnly?: boolean;
}): void {
  if (principal.kind === "admin") return;
  if (requirement.adminOnly) throw new Error("Admin access required.");
  if (principal.kind === "share") {
    if (requirement.operation && requirement.operation !== "items:read") {
      throw new Error("Shared links are read-only.");
    }
    if (requirement.itemId && principal.itemId !== requirement.itemId) {
      throw new Error("Shared link does not grant access to this item.");
    }
    return;
  }
  if (principal.kind === "agent") {
    if (requirement.itemId && principal.itemId !== requirement.itemId) {
      throw new Error("Agent token does not grant access to this item.");
    }
    const allowedOp = AGENT_OPERATION_BY_KIND[principal.capabilityKind];
    if (requirement.operation && requirement.operation !== allowedOp) {
      throw new Error(`Agent capability ${principal.capabilityKind} does not grant ${requirement.operation}.`);
    }
    return;
  }
  if (requirement.operation && !principal.operations.includes(requirement.operation)) {
    throw new Error(`Operation ${requirement.operation} is required.`);
  }
}

async function requirePrincipal(
  request: FastifyRequest,
  reply: FastifyReply,
  auth: DriveAuthService,
  store: DriveStore,
  requirement: { operation?: DriveOperation; itemId?: string; adminOnly?: boolean } = {},
): Promise<AuthPrincipal | null> {
  const principal = await resolvePrincipal(request, auth, store);
  if (!principal) {
    await reply.code(401).send({ error: "Unauthorized" });
    return null;
  }
  try {
    ensureAllowed(principal, requirement);
    return principal;
  } catch (error) {
    await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

function actorFromPrincipal(principal: AuthPrincipal): DriveActor {
  if (principal.kind === "admin") {
    return { kind: "admin", id: principal.adminId, name: principal.email };
  }
  if (principal.kind === "token") {
    return { kind: "token", id: principal.tokenId, name: "Agent token" };
  }
  if (principal.kind === "share") {
    return { kind: "share", id: principal.shareId, name: "Shared link" };
  }
  return { kind: "token", id: principal.agentShareId, name: principal.agentName };
}

function principalKindForAudit(principal: AuthPrincipal): "admin" | "token" | "share" | "agent" {
  if (principal.kind === "agent") return "agent";
  if (principal.kind === "admin") return "admin";
  if (principal.kind === "token") return "token";
  return "share";
}

function principalIdForAudit(principal: AuthPrincipal): string {
  if (principal.kind === "admin") return principal.adminId;
  if (principal.kind === "token") return principal.tokenId;
  if (principal.kind === "share") return principal.shareId;
  return principal.agentShareId;
}

function principalNameForAudit(principal: AuthPrincipal): string {
  if (principal.kind === "admin") return principal.email;
  if (principal.kind === "agent") return principal.agentName;
  return principal.kind === "token" ? "Agent token" : "Shared link";
}

function emitItemEvent(
  bus: DriveEventBus,
  kind: DriveRealtimeEventKind,
  itemId: string | null,
  parentId: string | null,
  payload: Record<string, unknown> = {},
): void {
  const event: DriveRealtimeEvent = {
    kind,
    itemId,
    parentId,
    timestamp: new Date().toISOString(),
    payload,
  };
  bus.emit(event);
}

async function audit(
  store: DriveStore,
  bus: DriveEventBus,
  principal: AuthPrincipal,
  kind: DriveAuditEventKind,
  itemId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const event = store.appendAuditEvent({
    kind,
    itemId,
    principalKind: principalKindForAudit(principal),
    principalId: principalIdForAudit(principal),
    principalName: principalNameForAudit(principal),
    metadata,
  });
  emitItemEvent(bus, "audit.appended", itemId, null, { auditId: event.id, auditKind: kind });
}

async function readUpload(request: FastifyRequest): Promise<{
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  parentId: string | null;
}> {
  const parts = request.parts();
  let buffer = Buffer.alloc(0);
  let fileName = "upload.bin";
  let mimeType = "application/octet-stream";
  let parentId: string | null = null;

  for await (const part of parts) {
    if (part.type === "file") {
      const chunks: Buffer[] = [];
      for await (const chunk of part.file) chunks.push(Buffer.from(chunk));
      buffer = Buffer.concat(chunks);
      fileName = part.filename ?? fileName;
      mimeType = part.mimetype ?? mimeType;
      continue;
    }
    if (part.type === "field" && part.fieldname === "parentId" && typeof part.value === "string") {
      parentId = part.value || null;
    }
  }

  return { fileName, mimeType, buffer, parentId };
}

export interface BuildDriveAppOptions {
  config?: Partial<DriveServiceConfig>;
  /** Absolute path to the macOS Vision OCR sidecar binary. Skipped if missing. */
  ocrSidecarPath?: string;
  /** Absolute path to the CLIP embedding sidecar binary. Skipped if missing. */
  embedSidecarPath?: string;
  /** Absolute path to the bundled cloudflared binary used for public tunnels. */
  cloudflaredPath?: string;
}

export async function buildDriveApp(options: BuildDriveAppOptions = {}) {
  const config = loadDriveConfig(options.config);
  fs.mkdirSync(config.dataDir, { recursive: true });

  const app = Fastify({ logger: false });
  const auth = new DriveAuthService(config.jwtSecret);
  const converters = new DriveConverterService(config.converterMode);
  const store = new DriveStore(config.dbPath, config.dataDir);
  const bus = new DriveEventBus();
  const sharing = new DriveSharingService(store, bus, {
    cloudflaredPath: options.cloudflaredPath,
    localOrigin: `${config.host}:${config.port}`,
  });

  await registerRealtime({
    app,
    bus,
    auth,
    store,
    resolvePrincipal: async (token) => {
      const admin = await auth.verifyAdminToken(token);
      if (admin) return admin;
      const scoped = store.authenticateScopedToken(token);
      if (scoped) {
        return { kind: "token", tokenId: scoped.id, operations: scoped.operations };
      }
      const share = store.authenticateShareToken(token);
      if (share) {
        return { kind: "share", shareId: share.id, itemId: share.itemId };
      }
      const agent = store.authenticateAgentShare(token);
      if (agent) {
        return {
          kind: "agent",
          agentShareId: agent.id,
          itemId: agent.itemId,
          agentName: agent.agentName,
          capabilityKind: agent.capability.kind,
        };
      }
      return null;
    },
  });

  // Auto-purge job: every 24h sweep trashed items older than 30 days.
  const trashSweeper = setInterval(() => {
    try { store.sweepTrashedOlderThan(30); } catch { /* noop */ }
  }, 24 * 60 * 60 * 1000);
  // Don't keep the process alive only because of this timer.
  if (typeof trashSweeper.unref === "function") trashSweeper.unref();

  app.addHook("onClose", async () => {
    clearInterval(trashSweeper);
    sharing.shutdown();
    store.close();
  });

  app.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : true,
  });
  app.register(multipart);

  const publicRoot = resolvePublicRoot(config);
  const brandRoot = resolveBrandRoot();

  app.register(fastifyStatic, {
    root: brandRoot,
    prefix: "/brand/",
    decorateReply: false,
  });

  if (fs.existsSync(publicRoot)) {
    app.register(fastifyStatic, {
      root: publicRoot,
      prefix: "/",
      wildcard: false,
    });

    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith("/v1/")) {
        return reply.code(404).send({ error: "not_found" });
      }
      reply.type("text/html; charset=utf-8");
      return reply.send(fs.readFileSync(path.join(publicRoot, "index.html"), "utf8"));
    });
  }

  app.get("/v1/health", async () => ({
    ok: true,
    service: "drive",
    host: config.host,
    port: config.port,
    converterMode: config.converterMode,
  }));

  app.post("/v1/auth/admin/login", async (request, reply) => {
    const body = readBody(request);
    const email = typeof body.email === "string" ? body.email : "";
    const password = typeof body.password === "string" ? body.password : "";
    const admin = store.authenticateAdmin(email, password);
    if (!admin) {
      return await reply.code(401).send({ error: "invalid_credentials" });
    }
    return {
      accessToken: await auth.issueAdminToken({ adminId: admin.id, email: admin.email }),
      email: admin.email,
    };
  });

  app.get("/v1/bootstrap", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:read" });
    if (!principal) return null;
    return {
      counts: store.listViewCounts(),
    };
  });

  app.get("/v1/items", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:read" });
    if (!principal) return null;
    const view = (queryString(request, "view") as DriveView | undefined) ?? "my-drive";
    const parentId = queryString(request, "parentId") ?? null;
    const query = queryString(request, "q");
    const breadcrumbs = parentId ? store.getItem(parentId)?.breadcrumbs ?? [] : [];
    return {
      items: store.listItems({ view, parentId, query }),
      counts: store.listViewCounts(),
      breadcrumbs,
    };
  });

  app.get("/v1/search", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:read" });
    if (!principal) return null;
    return {
      items: store.listItems({ view: "shared", query: queryString(request, "q") ?? "" }).concat(
        store.listItems({ view: "my-drive", query: queryString(request, "q") ?? "", parentId: null }),
      ).filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index),
    };
  });

  app.post("/v1/items", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:write" });
    if (!principal) return null;
    const body = readBody(request);
    const kind = body.kind as "folder" | "doc" | "sheet" | "slide";
    if (!["folder", "doc", "sheet", "slide"].includes(kind)) {
      return await reply.code(400).send({ error: "invalid_kind" });
    }
    const detail = store.createItem({
      kind,
      name: typeof body.name === "string" ? body.name : `Untitled ${kind}`,
      parentId: typeof body.parentId === "string" ? body.parentId : null,
    }, actorFromPrincipal(principal));
    await audit(store, bus, principal, "item_uploaded", detail.id, { kind });
    emitItemEvent(bus, "item.created", detail.id, detail.parentId, { kind });
    return await reply.code(201).send(detail);
  });

  app.get("/v1/items/:itemId", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:read", itemId });
    if (!principal) return null;
    const detail = store.getItem(itemId);
    if (!detail) return await reply.code(404).send({ error: "item_not_found" });
    if (detail.kind === "upload" && detail.content && detail.content.kind === "upload") {
      detail.content.sourceUrl = `/v1/items/${itemId}/download`;
    }
    return detail;
  });

  app.post("/v1/items/:itemId/view", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:read", itemId });
    if (!principal) return null;
    store.markViewed(itemId);
    return { ok: true };
  });

  app.patch("/v1/items/:itemId", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:write" });
    if (!principal) return null;
    const body = readBody(request);
    const detail = store.updateItem(itemId, {
      ...(typeof body.name === "string" ? { name: body.name } : {}),
      ...(typeof body.parentId === "string" || body.parentId === null ? { parentId: body.parentId as string | null } : {}),
      ...(typeof body.starred === "boolean" ? { starred: body.starred } : {}),
    });
    await audit(store, bus, principal, typeof body.starred === "boolean" ? (body.starred ? "item_starred" : "item_unstarred") : "item_updated", itemId, body);
    emitItemEvent(bus, "item.updated", itemId, detail.parentId);
    return detail;
  });

  app.post("/v1/items/:itemId/move", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:write" });
    if (!principal) return null;
    const body = readBody(request);
    const detail = store.moveItem(itemId, typeof body.parentId === "string" ? body.parentId : null);
    store.recomputeEncryptedFlag(itemId);
    await audit(store, bus, principal, "item_moved", itemId, { parentId: detail.parentId });
    emitItemEvent(bus, "item.moved", itemId, detail.parentId);
    return detail;
  });

  app.post("/v1/items/:itemId/copy", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:write" });
    if (!principal) return null;
    const body = readBody(request);
    const detail = store.copyItem(itemId, typeof body.parentId === "string" ? body.parentId : null, actorFromPrincipal(principal));
    emitItemEvent(bus, "item.created", detail.id, detail.parentId);
    return detail;
  });

  app.post("/v1/items/:itemId/content", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:write" });
    if (!principal) return null;
    const body = readBody(request);
    try {
      return store.saveNativeContent(itemId, {
        baseRevisionId: typeof body.baseRevisionId === "string" ? body.baseRevisionId : null,
        content: body.content as DriveNativeContent,
        summary: typeof body.summary === "string" ? body.summary : null,
      }, actorFromPrincipal(principal));
    } catch (error) {
      if (error instanceof DriveConflictError) {
        return await reply.code(409).send({ error: "revision_conflict", currentRevisionId: error.currentRevisionId });
      }
      throw error;
    }
  });

  app.post("/v1/items/:itemId/trash", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:delete" });
    if (!principal) return null;
    const detail = store.trashItem(itemId);
    await audit(store, bus, principal, "item_trashed", itemId);
    emitItemEvent(bus, "item.trashed", itemId, detail.parentId);
    return detail;
  });

  app.post("/v1/items/:itemId/restore", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:delete" });
    if (!principal) return null;
    const detail = store.restoreItem(itemId);
    await audit(store, bus, principal, "item_restored", itemId);
    emitItemEvent(bus, "item.restored", itemId, detail.parentId);
    return detail;
  });

  app.delete("/v1/items/:itemId", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:delete" });
    if (!principal) return null;
    const ok = store.deleteItemForever(itemId);
    if (ok) {
      await audit(store, bus, principal, "item_deleted", itemId);
      emitItemEvent(bus, "item.deleted", itemId, null);
    }
    return { ok };
  });

  app.get("/v1/items/:itemId/comments", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:read", itemId });
    if (!principal) return null;
    return { items: store.listComments(itemId) };
  });

  app.post("/v1/items/:itemId/comments", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:write" });
    if (!principal) return null;
    const body = readBody(request);
    const comment = store.addComment(itemId, String(body.body ?? ""), actorFromPrincipal(principal).name);
    emitItemEvent(bus, "comment.created", itemId, null, { commentId: comment.id });
    return await reply.code(201).send(comment);
  });

  app.get("/v1/items/:itemId/revisions", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:read", itemId });
    if (!principal) return null;
    return { items: store.listRevisions(itemId) };
  });

  app.post("/v1/items/:itemId/revisions/:revisionId/restore", async (request, reply) => {
    const { itemId, revisionId } = request.params as { itemId: string; revisionId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:write" });
    if (!principal) return null;
    return store.restoreRevision(itemId, revisionId, actorFromPrincipal(principal));
  });

  app.get("/v1/items/:itemId/shares", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:share" });
    if (!principal) return null;
    return { items: store.listShares(itemId) };
  });

  app.post("/v1/items/:itemId/shares", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:share" });
    if (!principal) return null;
    const body = readBody(request);
    const mode = (typeof body.mode === "string" ? body.mode : "read") as "read" | "tailnet" | "public_tunnel" | "agent";
    const actor = {
      kind: principalKindForAudit(principal),
      id: principalIdForAudit(principal),
      name: principalNameForAudit(principal),
    } as const;
    if (mode === "read") {
      const created = store.createShare(itemId, typeof body.label === "string" ? body.label : "Share link");
      await audit(store, bus, principal, "share_created", itemId, { mode: "read", shareId: created.share.id });
      emitItemEvent(bus, "share.created", itemId, null, { mode: "read", shareId: created.share.id });
      return await reply.code(201).send({
        ...created,
        url: `${config.publicBaseUrl}/?share=${created.token}&item=${itemId}`,
      });
    }
    if (mode === "tailnet") {
      const record = await sharing.createTailnet(itemId, actor);
      return await reply.code(201).send({ mode: "tailnet", record });
    }
    if (mode === "public_tunnel") {
      try {
        const record = await sharing.createTunnel(itemId, actor);
        return await reply.code(201).send({ mode: "public_tunnel", record });
      } catch (error) {
        return await reply.code(503).send({ error: "tunnel_unavailable", message: error instanceof Error ? error.message : String(error) });
      }
    }
    if (mode === "agent") {
      const capabilityKind = typeof body.capabilityKind === "string" ? body.capabilityKind : "drive.item.read";
      const ttlMinutes = typeof body.ttlMinutes === "number" ? Math.max(1, Math.min(60, body.ttlMinutes)) : 10;
      const reason = typeof body.reason === "string" ? body.reason : null;
      const agentName = typeof body.agentName === "string" ? body.agentName : "agent";
      const created = sharing.createAgent({
        itemId,
        capability: { kind: capabilityKind as "drive.item.read", itemId, ttlMinutes },
        reason,
        agentName,
      }, actor);
      return await reply.code(201).send({ mode: "agent", record: created.record, token: created.token });
    }
    return await reply.code(400).send({ error: "invalid_share_mode" });
  });

  app.post("/v1/items/:itemId/shares/:shareId/revoke", async (request, reply) => {
    const { itemId, shareId } = request.params as { itemId: string; shareId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:share" });
    if (!principal) return null;
    const actor = {
      kind: principalKindForAudit(principal),
      id: principalIdForAudit(principal),
      name: principalNameForAudit(principal),
    } as const;
    let ok = store.revokeShare(itemId, shareId);
    if (!ok) ok = sharing.revokeTailnet(shareId, itemId, actor);
    if (!ok) ok = sharing.revokeTunnel(shareId, itemId, actor);
    if (!ok) ok = sharing.revokeAgent(shareId, itemId, actor);
    if (ok) await audit(store, bus, principal, "share_revoked", itemId, { shareId });
    return { ok };
  });

  // Aggregate listing across all share modes
  app.get("/v1/items/:itemId/shares/all", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:share" });
    if (!principal) return null;
    return {
      read: store.listShares(itemId),
      tailnet: store.listTailnetShares(itemId),
      tunnel: store.listTunnelShares(itemId),
      agent: store.listAgentShares(itemId),
    };
  });

  app.get("/v1/tokens", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "tokens:issue" });
    if (!principal) return null;
    return { items: store.listTokens() };
  });

  app.post("/v1/tokens", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "tokens:issue" });
    if (!principal) return null;
    const body = readBody(request);
    const created = store.createScopedToken({
      label: typeof body.label === "string" ? body.label : "Agent token",
      operations: Array.isArray(body.operations) ? body.operations as DriveOperation[] : ["items:read"],
    });
    return await reply.code(201).send(created);
  });

  app.post("/v1/tokens/:tokenId/revoke", async (request, reply) => {
    const { tokenId } = request.params as { tokenId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "tokens:issue" });
    if (!principal) return null;
    return { ok: store.revokeToken(tokenId) };
  });

  app.post("/v1/uploads", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:write" });
    if (!principal) return null;
    const upload = await readUpload(request);
    const digest = crypto.createHash("sha256").update(upload.buffer).digest("hex");
    const safeName = upload.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const relativeStoragePath = path.join("storage", digest.slice(0, 2), `${digest}-${safeName}`);
    const filePath = path.join(store.blobsDir, relativeStoragePath);
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, upload.buffer);
    }

    // Dedup detection: if duplicate-policy = "report", caller asked us to flag
    // existing items with the same SHA256 hash. UI shows a dialog.
    const dupePolicy = queryString(request, "duplicatePolicy");
    if (dupePolicy === "report") {
      const existing = store.findByStoragePath(relativeStoragePath);
      if (existing) {
        return await reply.code(409).send({ error: "duplicate_exists", existing });
      }
    }

    const uploadContent = converters.inspectUpload(filePath, upload.fileName, upload.mimeType);
    const detail = store.createItem({
      kind: "upload",
      name: upload.fileName,
      parentId: upload.parentId,
      mimeType: upload.mimeType,
      sizeBytes: upload.buffer.byteLength,
      storagePath: relativeStoragePath,
      previewKind: uploadContent.previewKind as DrivePreviewKind,
      content: uploadContent,
    }, actorFromPrincipal(principal));
    store.recomputeEncryptedFlag(detail.id);
    await audit(store, bus, principal, "item_uploaded", detail.id, { sizeBytes: upload.buffer.byteLength, mimeType: upload.mimeType });
    emitItemEvent(bus, "item.created", detail.id, detail.parentId, { kind: "upload" });

    // Image pipeline runs in the background.
    void processItemImagePipeline(detail, filePath, {
      store,
      bus,
      dataDir: config.dataDir,
      ocrSidecarPath: options.ocrSidecarPath,
      embedSidecarPath: options.embedSidecarPath,
    });

    return await reply.code(201).send(detail);
  });

  app.get("/v1/items/:itemId/download", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:read", itemId });
    if (!principal) return null;
    const file = store.getDownload(itemId);
    if (!file) {
      return await reply.code(404).send({ error: "download_not_available" });
    }
    if (file.mimeType) reply.header("content-type", file.mimeType);
    reply.header("content-disposition", `inline; filename="${file.name}"`);
    return reply.send(fs.createReadStream(file.filePath));
  });

  app.get("/v1/items/:itemId/export", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:read", itemId });
    if (!principal) return null;
    const item = store.getItem(itemId);
    if (!item) return await reply.code(404).send({ error: "item_not_found" });
    const format = queryString(request, "format") ?? (item.kind === "doc" ? "md" : item.kind === "sheet" ? "csv" : "json");
    const exported = converters.exportNative(item, format);
    reply.header("content-type", exported.mimeType);
    reply.header("content-disposition", `attachment; filename="${exported.fileName}"`);
    return reply.send(exported.buffer);
  });

  // -------------------------------------------------------------------------
  // Thumbnails
  // -------------------------------------------------------------------------

  app.get("/v1/items/:itemId/thumbnail", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:read", itemId });
    if (!principal) return null;
    const sizeQuery = queryString(request, "size");
    const size: 256 | 512 = sizeQuery === "512" ? 512 : 256;
    const thumb = store.getThumbnail(itemId, size);
    if (!thumb || !fs.existsSync(thumb.path)) {
      return await reply.code(404).send({ error: "thumbnail_not_ready" });
    }
    reply.header("content-type", thumb.mimeType);
    reply.header("cache-control", "private, max-age=3600");
    return reply.send(fs.createReadStream(thumb.path));
  });

  // -------------------------------------------------------------------------
  // EXIF
  // -------------------------------------------------------------------------

  app.get("/v1/items/:itemId/exif", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:read", itemId });
    if (!principal) return null;
    const exif = store.getExif(itemId);
    if (!exif) return await reply.code(404).send({ error: "no_exif" });
    return exif;
  });

  // -------------------------------------------------------------------------
  // Semantic search
  // -------------------------------------------------------------------------

  app.post("/v1/search/semantic", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:read" });
    if (!principal) return null;
    const body = readBody(request);
    const query = typeof body.query === "string" ? body.query : "";
    const limit = typeof body.limit === "number" ? Math.min(50, Math.max(1, body.limit)) : 20;
    const queryEmbedding = await (await import("./image-pipeline.ts")).computeQueryEmbedding(query, options.embedSidecarPath);
    if (!queryEmbedding) {
      return await reply.code(503).send({ error: "embeddings_unavailable" });
    }
    const { cosine } = await import("./image-pipeline.ts");
    const all = store.listAllEmbeddings(queryEmbedding.model);
    const scored = all
      .map((entry) => ({
        itemId: entry.itemId,
        score: cosine(queryEmbedding.vector, entry.vector),
        item: entry.item,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return { items: scored };
  });

  // -------------------------------------------------------------------------
  // Audit log
  // -------------------------------------------------------------------------

  app.get("/v1/audit", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { adminOnly: true });
    if (!principal) return null;
    const kindsRaw = queryString(request, "kinds");
    const items = store.queryAuditEvents({
      kinds: kindsRaw ? (kindsRaw.split(",") as DriveAuditEventKind[]) : undefined,
      itemId: queryString(request, "itemId"),
      principalId: queryString(request, "principalId"),
      since: queryString(request, "since"),
      until: queryString(request, "until"),
      limit: Number(queryString(request, "limit") ?? 200),
    });
    return { items };
  });

  // -------------------------------------------------------------------------
  // Encrypted folders
  // -------------------------------------------------------------------------

  app.get("/v1/encrypted-folders", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { adminOnly: true });
    if (!principal) return null;
    return { items: store.listEncryptedFolders() };
  });

  app.post("/v1/encrypted-folders", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { adminOnly: true });
    if (!principal) return null;
    const body = readBody(request);
    const folderId = typeof body.folderId === "string" ? body.folderId : null;
    if (!folderId) return await reply.code(400).send({ error: "folder_id_required" });
    const enabled = body.enabled !== false;
    store.setFolderEncrypted(folderId, enabled, principalNameForAudit(principal));
    await audit(store, bus, principal, enabled ? "folder_encrypted" : "folder_decrypted", folderId);
    return { ok: true };
  });

  // -------------------------------------------------------------------------
  // Project folder ensure (Clawix auto-routing entry point)
  // -------------------------------------------------------------------------

  app.post("/v1/projects/:slug/ensure-folder", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:write" });
    if (!principal) return null;
    const folderId = store.ensureProjectFolder(slug, actorFromPrincipal(principal));
    return { folderId };
  });

  return { app, config, store, converters, bus, sharing };
}
