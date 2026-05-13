import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";

import { FeedAuthService, type AuthPrincipal } from "./auth.ts";
import { loadFeedConfig, type FeedServiceConfig } from "./config.ts";
import { FeedStore } from "./db.ts";
import { FeedRealtimeHub } from "./realtime.ts";
import { FeedIngester } from "./ingest.ts";
import type {
  FeedOperation,
  FeedChangeEvent,
  SourceType,
  ItemType,
  ItemStatus,
  Importance,
  AnnotationType,
} from "../shared/types.ts";

function resolvePublicRoot(): string {
  const candidates = [
    fileURLToPath(new URL("../../ui/dist", import.meta.url)),
    fileURLToPath(new URL("../ui/dist", import.meta.url)),
    path.join(process.cwd(), "ui", "dist"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function parseBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (header) {
    const [scheme, token] = header.split(" ");
    if (scheme?.toLowerCase() === "bearer" && token) {
      return token;
    }
  }
  const rawUrl = request.raw.url ?? request.url;
  if (rawUrl) {
    const parsed = new URL(rawUrl, "http://localhost");
    const queryToken = parsed.searchParams.get("token");
    if (queryToken?.trim()) return queryToken;
  }
  return null;
}

function readBody(request: FastifyRequest): Record<string, unknown> {
  return ((request.body ?? {}) as Record<string, unknown>);
}

function queryString(request: FastifyRequest, key: string): string | undefined {
  const q = request.query as Record<string, unknown>;
  const val = q?.[key];
  return typeof val === "string" ? val : undefined;
}

function ensureAllowed(principal: AuthPrincipal, operation?: FeedOperation): void {
  if (principal.kind === "admin") return;
  if (operation && !principal.operations.includes(operation)) {
    throw new Error(`Forbidden: operation ${operation} is required`);
  }
}

async function resolvePrincipal(
  request: FastifyRequest,
  auth: FeedAuthService,
  store: FeedStore,
): Promise<AuthPrincipal | null> {
  const token = parseBearerToken(request);
  if (!token) return null;
  const admin = await auth.verifyAdminToken(token);
  if (admin) return admin;
  const scopedToken = store.authenticateScopedToken(token);
  if (!scopedToken) return null;
  return {
    kind: "token",
    tokenId: scopedToken.id,
    operations: scopedToken.operations,
  };
}

async function requirePrincipal(
  request: FastifyRequest,
  reply: FastifyReply,
  auth: FeedAuthService,
  store: FeedStore,
  requirement?: {
    operation?: FeedOperation;
    adminOnly?: boolean;
  },
): Promise<AuthPrincipal | null> {
  const principal = await resolvePrincipal(request, auth, store);
  if (!principal) {
    await reply.code(401).send({ error: "Unauthorized" });
    return null;
  }
  if (requirement?.adminOnly && principal.kind !== "admin") {
    await reply.code(403).send({ error: "Forbidden", message: "Admin access required." });
    return null;
  }
  try {
    ensureAllowed(principal, requirement?.operation);
    return principal;
  } catch (error) {
    await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export interface BuildFeedAppOptions {
  config?: Partial<FeedServiceConfig>;
}

export function buildFeedApp(options: BuildFeedAppOptions = {}) {
  const config = loadFeedConfig(options.config);
  fs.mkdirSync(config.dataDir, { recursive: true });

  const app = Fastify({ logger: false });
  const auth = new FeedAuthService(config.jwtSecret);
  const store = new FeedStore(config.dbPath);
  const realtime = new FeedRealtimeHub();

  const emitChange = (event: FeedChangeEvent) => {
    realtime.broadcast(event);
  };

  const ingester = new FeedIngester(store, emitChange);

  app.addHook("onClose", async () => {
    ingester.stop();
    store.close();
  });

  app.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : true,
  });

  const publicRoot = resolvePublicRoot();
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

  app.register(async (wsApp) => {
    await wsApp.register(websocket, {
      errorHandler(error, socket) {
        console.error(error);
        socket.terminate();
      },
    });

    wsApp.get("/v1/realtime", { websocket: true }, async (socket, request) => {
      const principal = await resolvePrincipal(request as FastifyRequest, auth, store);
      if (!principal) {
        socket.close();
        return;
      }
      realtime.attach(socket, principal);
    });
  });

  // ── Health ─────────────────────────────────────────────────────────────

  app.get("/v1/health", async () => ({
    ok: true,
    service: "feed",
    host: config.host,
    port: config.port,
  }));

  // ── Auth ───────────────────────────────────────────────────────────────

  app.post("/v1/auth/admin/login", async (request, reply) => {
    const body = readBody(request);
    const email = typeof body.email === "string" ? body.email : "";
    const password = typeof body.password === "string" ? body.password : "";
    const admin = store.verifyAdmin(email, password);
    if (!admin) {
      return await reply.code(401).send({ error: "Invalid email or password." });
    }
    const accessToken = await auth.issueAdminToken({ adminId: admin.id, email: admin.email });
    return { accessToken, admin: { id: admin.id, email: admin.email } };
  });

  app.get("/v1/auth/me", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store);
    if (!principal) return null;
    return { principal };
  });

  // ── Sources ────────────────────────────────────────────────────────────

  app.get("/v1/sources", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "sources:list" });
    if (!principal) return null;
    return {
      items: store.listSources({
        type: queryString(request, "type") as SourceType | undefined,
        enabled: queryString(request, "enabled") !== undefined ? queryString(request, "enabled") === "true" : undefined,
      }),
    };
  });

  app.post("/v1/sources", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "sources:create" });
    if (!principal) return null;
    try {
      const body = readBody(request);
      const source = store.createSource({
        name: String(body.name ?? ""),
        sourceType: String(body.sourceType ?? "rss") as SourceType,
        url: typeof body.url === "string" ? body.url : undefined,
        slug: typeof body.slug === "string" ? body.slug : undefined,
        config: typeof body.config === "object" && body.config ? body.config as Record<string, unknown> : undefined,
        enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
        pollIntervalMinutes: typeof body.pollIntervalMinutes === "number" ? body.pollIntervalMinutes : undefined,
        tags: Array.isArray(body.tags) ? body.tags as string[] : undefined,
        createdByAgentId: typeof body.createdByAgentId === "string" ? body.createdByAgentId : undefined,
      });
      emitChange({ type: "source.created", sourceId: source.id, payload: source, at: new Date().toISOString() });
      return await reply.code(201).send(source);
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/v1/sources/:sourceId", async (request, reply) => {
    const { sourceId } = request.params as { sourceId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "sources:read" });
    if (!principal) return null;
    const resolved = store.resolveSourceId(sourceId);
    if (!resolved) return await reply.code(404).send({ error: "source_not_found" });
    return store.getSource(resolved);
  });

  app.patch("/v1/sources/:sourceId", async (request, reply) => {
    const { sourceId } = request.params as { sourceId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "sources:update" });
    if (!principal) return null;
    const resolved = store.resolveSourceId(sourceId);
    if (!resolved) return await reply.code(404).send({ error: "source_not_found" });
    try {
      const body = readBody(request);
      const source = store.updateSource(resolved, {
        name: typeof body.name === "string" ? body.name : undefined,
        url: typeof body.url === "string" ? body.url : undefined,
        config: typeof body.config === "object" && body.config ? body.config as Record<string, unknown> : undefined,
        enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
        pollIntervalMinutes: typeof body.pollIntervalMinutes === "number" ? body.pollIntervalMinutes : undefined,
        tags: Array.isArray(body.tags) ? body.tags as string[] : undefined,
      });
      emitChange({ type: "source.updated", sourceId: resolved, payload: source, at: new Date().toISOString() });
      return source;
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/v1/sources/:sourceId", async (request, reply) => {
    const { sourceId } = request.params as { sourceId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "sources:delete" });
    if (!principal) return null;
    const resolved = store.resolveSourceId(sourceId);
    if (!resolved) return await reply.code(404).send({ error: "source_not_found" });
    const ok = store.deleteSource(resolved);
    if (ok) emitChange({ type: "source.deleted", sourceId: resolved, at: new Date().toISOString() });
    return { ok };
  });

  app.post("/v1/sources/:sourceId/poll", async (request, reply) => {
    const { sourceId } = request.params as { sourceId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "ingest:trigger" });
    if (!principal) return null;
    const resolved = store.resolveSourceId(sourceId);
    if (!resolved) return await reply.code(404).send({ error: "source_not_found" });
    const result = await ingester.pollSource(resolved);
    return result;
  });

  app.get("/v1/sources/:sourceId/items", async (request, reply) => {
    const { sourceId } = request.params as { sourceId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:list" });
    if (!principal) return null;
    const resolved = store.resolveSourceId(sourceId);
    if (!resolved) return await reply.code(404).send({ error: "source_not_found" });
    return store.listItems({
      sourceId: resolved,
      status: queryString(request, "status") as ItemStatus | undefined,
      limit: queryString(request, "limit") ? Number(queryString(request, "limit")) : undefined,
      offset: queryString(request, "offset") ? Number(queryString(request, "offset")) : undefined,
    });
  });

  // ── Items ──────────────────────────────────────────────────────────────

  app.get("/v1/items", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:list" });
    if (!principal) return null;
    return store.listItems({
      sourceId: queryString(request, "source"),
      status: queryString(request, "status") as ItemStatus | undefined,
      itemType: queryString(request, "type") as ItemType | undefined,
      importance: queryString(request, "importance") as Importance | undefined,
      tag: queryString(request, "tag"),
      starred: queryString(request, "starred") !== undefined ? queryString(request, "starred") === "true" : undefined,
      after: queryString(request, "after"),
      before: queryString(request, "before"),
      limit: queryString(request, "limit") ? Number(queryString(request, "limit")) : undefined,
      offset: queryString(request, "offset") ? Number(queryString(request, "offset")) : undefined,
      sort: queryString(request, "sort") as "newest" | "oldest" | "importance" | "published" | undefined,
    });
  });

  app.post("/v1/items", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:create" });
    if (!principal) return null;
    try {
      const body = readBody(request);
      const item = store.createItem({
        sourceId: typeof body.sourceId === "string" ? body.sourceId : undefined,
        itemType: String(body.itemType ?? "bookmark") as ItemType,
        externalId: typeof body.externalId === "string" ? body.externalId : undefined,
        url: typeof body.url === "string" ? body.url : undefined,
        title: typeof body.title === "string" ? body.title : undefined,
        body: typeof body.body === "string" ? body.body : undefined,
        authorName: typeof body.authorName === "string" ? body.authorName : undefined,
        authorUrl: typeof body.authorUrl === "string" ? body.authorUrl : undefined,
        thumbnailUrl: typeof body.thumbnailUrl === "string" ? body.thumbnailUrl : undefined,
        publishedAt: typeof body.publishedAt === "string" ? body.publishedAt : undefined,
        meta: typeof body.meta === "object" && body.meta ? body.meta as Record<string, unknown> : undefined,
        status: typeof body.status === "string" ? body.status as ItemStatus : undefined,
        importance: typeof body.importance === "string" ? body.importance as Importance : undefined,
        tags: Array.isArray(body.tags) ? body.tags as string[] : undefined,
        savedByAgentId: typeof body.savedByAgentId === "string" ? body.savedByAgentId : undefined,
        saveReason: typeof body.saveReason === "string" ? body.saveReason : undefined,
      });
      emitChange({ type: "item.created", itemId: item.id, payload: item, at: new Date().toISOString() });
      return await reply.code(201).send(item);
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/v1/items/:itemId", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:read" });
    if (!principal) return null;
    const item = store.getItem(itemId);
    if (!item) return await reply.code(404).send({ error: "item_not_found" });
    const annotations = store.listAnnotations(itemId);
    return { ...item, annotations };
  });

  app.patch("/v1/items/:itemId", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:update" });
    if (!principal) return null;
    try {
      const body = readBody(request);
      const item = store.updateItem(itemId, {
        title: typeof body.title === "string" ? body.title : undefined,
        body: typeof body.body === "string" ? body.body : undefined,
        status: typeof body.status === "string" ? body.status as ItemStatus : undefined,
        starred: typeof body.starred === "boolean" ? body.starred : undefined,
        importance: typeof body.importance === "string" ? body.importance as Importance : undefined,
        tags: Array.isArray(body.tags) ? body.tags as string[] : undefined,
      });
      emitChange({ type: "item.updated", itemId, payload: item, at: new Date().toISOString() });
      return item;
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/v1/items/:itemId", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:delete" });
    if (!principal) return null;
    const ok = store.deleteItem(itemId);
    if (ok) emitChange({ type: "item.deleted", itemId, at: new Date().toISOString() });
    return { ok };
  });

  app.post("/v1/items/:itemId/read", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:update" });
    if (!principal) return null;
    try {
      const item = store.markRead(itemId);
      emitChange({ type: "item.read", itemId, at: new Date().toISOString() });
      return item;
    } catch (error) {
      return await reply.code(404).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/v1/items/:itemId/star", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:update" });
    if (!principal) return null;
    try {
      const item = store.toggleStar(itemId);
      emitChange({ type: "item.starred", itemId, at: new Date().toISOString() });
      return item;
    } catch (error) {
      return await reply.code(404).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/v1/items/:itemId/archive", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:update" });
    if (!principal) return null;
    try {
      const item = store.archiveItem(itemId);
      emitChange({ type: "item.archived", itemId, at: new Date().toISOString() });
      return item;
    } catch (error) {
      return await reply.code(404).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/v1/items/bulk", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:update" });
    if (!principal) return null;
    const body = readBody(request);
    const action = String(body.action ?? "");
    const itemIds = Array.isArray(body.itemIds) ? body.itemIds as string[] : [];
    const tag = typeof body.tag === "string" ? body.tag : undefined;
    if (!["read", "archive", "delete", "star"].includes(action)) {
      return await reply.code(400).send({ error: "Invalid action. Use: read, archive, delete, star" });
    }
    const changed = store.bulkUpdateItems(itemIds, action as "read" | "archive" | "delete" | "star", tag);
    return { changed };
  });

  // ── Annotations ────────────────────────────────────────────────────────

  app.get("/v1/items/:itemId/annotations", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "annotations:list" });
    if (!principal) return null;
    return { items: store.listAnnotations(itemId) };
  });

  app.post("/v1/items/:itemId/annotations", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "annotations:create" });
    if (!principal) return null;
    const item = store.getItem(itemId);
    if (!item) return await reply.code(404).send({ error: "item_not_found" });
    try {
      const body = readBody(request);
      const annotation = store.createAnnotation(itemId, {
        annotationType: String(body.annotationType ?? body.type ?? "note") as AnnotationType,
        body: typeof body.body === "string" ? body.body : undefined,
        data: typeof body.data === "object" && body.data ? body.data as Record<string, unknown> : undefined,
        agentId: typeof body.agentId === "string" ? body.agentId : undefined,
      });
      emitChange({ type: "annotation.created", itemId, annotationId: annotation.id, payload: annotation, at: new Date().toISOString() });
      return await reply.code(201).send(annotation);
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.patch("/v1/annotations/:annotationId", async (request, reply) => {
    const { annotationId } = request.params as { annotationId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "annotations:update" });
    if (!principal) return null;
    try {
      const body = readBody(request);
      return store.updateAnnotation(annotationId, {
        body: typeof body.body === "string" ? body.body : undefined,
        data: typeof body.data === "object" && body.data ? body.data as Record<string, unknown> : undefined,
      });
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/v1/annotations/:annotationId", async (request, reply) => {
    const { annotationId } = request.params as { annotationId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "annotations:delete" });
    if (!principal) return null;
    const annotation = store.getAnnotation(annotationId);
    const ok = store.deleteAnnotation(annotationId);
    if (ok && annotation) {
      emitChange({ type: "annotation.deleted", itemId: annotation.itemId, annotationId, at: new Date().toISOString() });
    }
    return { ok };
  });

  // ── Collections ────────────────────────────────────────────────────────

  app.get("/v1/collections", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "collections:list" });
    if (!principal) return null;
    const collections = store.listCollections();
    return {
      items: collections.map((c) => ({
        ...c,
        itemCount: store.getCollectionItemCount(c.id),
      })),
    };
  });

  app.post("/v1/collections", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "collections:create" });
    if (!principal) return null;
    try {
      const body = readBody(request);
      const collection = store.createCollection({
        name: String(body.name ?? ""),
        slug: typeof body.slug === "string" ? body.slug : undefined,
        description: typeof body.description === "string" ? body.description : undefined,
        icon: typeof body.icon === "string" ? body.icon : undefined,
        isSmart: typeof body.isSmart === "boolean" ? body.isSmart : undefined,
        filter: typeof body.filter === "object" && body.filter ? body.filter as Record<string, unknown> : undefined,
        sortOrder: typeof body.sortOrder === "string" ? body.sortOrder : undefined,
        createdByAgentId: typeof body.createdByAgentId === "string" ? body.createdByAgentId : undefined,
      });
      emitChange({ type: "collection.created", collectionId: collection.id, payload: collection, at: new Date().toISOString() });
      return await reply.code(201).send(collection);
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/v1/collections/:collectionId", async (request, reply) => {
    const { collectionId } = request.params as { collectionId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "collections:read" });
    if (!principal) return null;
    const resolved = store.resolveCollectionId(collectionId);
    if (!resolved) return await reply.code(404).send({ error: "collection_not_found" });
    const collection = store.getCollection(resolved)!;
    return { ...collection, itemCount: store.getCollectionItemCount(resolved) };
  });

  app.patch("/v1/collections/:collectionId", async (request, reply) => {
    const { collectionId } = request.params as { collectionId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "collections:update" });
    if (!principal) return null;
    const resolved = store.resolveCollectionId(collectionId);
    if (!resolved) return await reply.code(404).send({ error: "collection_not_found" });
    try {
      const body = readBody(request);
      const collection = store.updateCollection(resolved, {
        name: typeof body.name === "string" ? body.name : undefined,
        description: typeof body.description === "string" ? body.description : undefined,
        icon: typeof body.icon === "string" ? body.icon : undefined,
        filter: typeof body.filter === "object" && body.filter ? body.filter as Record<string, unknown> : undefined,
        sortOrder: typeof body.sortOrder === "string" ? body.sortOrder : undefined,
      });
      emitChange({ type: "collection.updated", collectionId: resolved, payload: collection, at: new Date().toISOString() });
      return collection;
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/v1/collections/:collectionId", async (request, reply) => {
    const { collectionId } = request.params as { collectionId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "collections:delete" });
    if (!principal) return null;
    const resolved = store.resolveCollectionId(collectionId);
    if (!resolved) return await reply.code(404).send({ error: "collection_not_found" });
    const ok = store.deleteCollection(resolved);
    if (ok) emitChange({ type: "collection.deleted", collectionId: resolved, at: new Date().toISOString() });
    return { ok };
  });

  app.get("/v1/collections/:collectionId/items", async (request, reply) => {
    const { collectionId } = request.params as { collectionId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "collections:read" });
    if (!principal) return null;
    const resolved = store.resolveCollectionId(collectionId);
    if (!resolved) return await reply.code(404).send({ error: "collection_not_found" });
    return store.listCollectionItems(resolved, {
      limit: queryString(request, "limit") ? Number(queryString(request, "limit")) : undefined,
      offset: queryString(request, "offset") ? Number(queryString(request, "offset")) : undefined,
    });
  });

  app.post("/v1/collections/:collectionId/items", async (request, reply) => {
    const { collectionId } = request.params as { collectionId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "collections:update" });
    if (!principal) return null;
    const resolved = store.resolveCollectionId(collectionId);
    if (!resolved) return await reply.code(404).send({ error: "collection_not_found" });
    const body = readBody(request);
    const itemIds = Array.isArray(body.itemIds) ? body.itemIds as string[] : [];
    const added = store.addItemsToCollection(resolved, itemIds, typeof body.addedByAgentId === "string" ? body.addedByAgentId : undefined);
    return { added };
  });

  app.delete("/v1/collections/:collectionId/items/:itemId", async (request, reply) => {
    const { collectionId, itemId } = request.params as { collectionId: string; itemId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "collections:update" });
    if (!principal) return null;
    const resolved = store.resolveCollectionId(collectionId);
    if (!resolved) return await reply.code(404).send({ error: "collection_not_found" });
    return { ok: store.removeItemFromCollection(resolved, itemId) };
  });

  // ── Search ─────────────────────────────────────────────────────────────

  app.get("/v1/search", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "search:query" });
    if (!principal) return null;
    const q = queryString(request, "q");
    if (!q) return await reply.code(400).send({ error: "q is required" });
    return {
      items: store.searchItems(q, {
        itemType: queryString(request, "type") as ItemType | undefined,
        status: queryString(request, "status") as ItemStatus | undefined,
        sourceId: queryString(request, "source"),
        tag: queryString(request, "tag"),
        limit: queryString(request, "limit") ? Number(queryString(request, "limit")) : undefined,
      }),
    };
  });

  // ── Stats ──────────────────────────────────────────────────────────────

  app.get("/v1/stats", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store);
    if (!principal) return null;
    return store.getStats();
  });

  // ── Ingest ─────────────────────────────────────────────────────────────

  app.post("/v1/ingest/poll-all", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "ingest:trigger", adminOnly: true });
    if (!principal) return null;
    const results = await ingester.pollAll();
    return results;
  });

  // ── Tokens ─────────────────────────────────────────────────────────────

  app.get("/v1/tokens", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "tokens:issue" });
    if (!principal) return null;
    return { items: store.listScopedTokens() };
  });

  app.post("/v1/tokens", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "tokens:issue" });
    if (!principal) return null;
    try {
      const body = readBody(request);
      const created = store.createScopedToken({
        label: String(body.label ?? "token"),
        operations: Array.isArray(body.operations) ? body.operations as FeedOperation[] : [],
      });
      return await reply.code(201).send(created);
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/v1/tokens/:tokenId/revoke", async (request, reply) => {
    const { tokenId } = request.params as { tokenId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "tokens:revoke" });
    if (!principal) return null;
    return { ok: store.revokeScopedToken(tokenId) };
  });

  return { app, config, store, ingester };
}
