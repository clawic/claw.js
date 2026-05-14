import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";

import { WikiAuthService, type AuthPrincipal } from "./auth.ts";
import { loadWikiConfig, type WikiServiceConfig } from "./config.ts";
import { WikiStore } from "./db.ts";
import { WikiRealtimeHub } from "./realtime.ts";
import { WikiSearchEngine } from "./search.ts";
import { extractWikilinks } from "./markdown.ts";
import type { WikiOperation, WikiChangeEvent, LinkType, PageStatus } from "../shared/types.ts";

function resolvePublicRoot(): string {
  const candidates = [
    fileURLToPath(new URL("../../ui/dist", import.meta.url)),
    fileURLToPath(new URL("../ui/dist", import.meta.url)),
    fileURLToPath(new URL("../../ui", import.meta.url)),
    fileURLToPath(new URL("../ui", import.meta.url)),
    path.join(process.cwd(), "ui", "dist"),
    path.join(process.cwd(), "ui"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function resolveBrandRoot(): string {
  const candidates = [
    fileURLToPath(new URL("../../../assets", import.meta.url)),
    fileURLToPath(new URL("../../assets", import.meta.url)),
    fileURLToPath(new URL("../../../public", import.meta.url)),
    fileURLToPath(new URL("../../public", import.meta.url)),
    path.join(process.cwd(), "..", "assets"),
    path.join(process.cwd(), "assets"),
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

function ensureAllowed(principal: AuthPrincipal, input: {
  spaceId?: string;
  operation?: WikiOperation;
}): void {
  if (principal.kind === "admin") return;
  if (input.spaceId && principal.spaceId && principal.spaceId !== input.spaceId) {
    throw new Error("Forbidden: space mismatch");
  }
  if (input.operation && !principal.operations.includes(input.operation)) {
    throw new Error(`Forbidden: operation ${input.operation} is required`);
  }
}

async function resolvePrincipal(
  request: FastifyRequest,
  auth: WikiAuthService,
  store: WikiStore,
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
    spaceId: scopedToken.spaceId,
    operations: scopedToken.operations,
  };
}

async function requirePrincipal(
  request: FastifyRequest,
  reply: FastifyReply,
  auth: WikiAuthService,
  store: WikiStore,
  requirement?: {
    spaceId?: string;
    operation?: WikiOperation;
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
    ensureAllowed(principal, requirement ?? {});
    return principal;
  } catch (error) {
    await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export interface BuildWikiAppOptions {
  config?: Partial<WikiServiceConfig>;
}

export function buildWikiApp(options: BuildWikiAppOptions = {}) {
  const config = loadWikiConfig(options.config);
  fs.mkdirSync(config.dataDir, { recursive: true });

  const app = Fastify({ logger: false });
  const auth = new WikiAuthService(config.jwtSecret);
  const store = new WikiStore(config.dbPath);
  const realtime = new WikiRealtimeHub();
  const search = new WikiSearchEngine(store);

  const emitChange = (event: WikiChangeEvent) => {
    realtime.broadcast(event);
  };

  /** Resolve :spaceId param (accepts UUID or slug). Returns canonical ID or sends 404. */
  async function resolveSpaceParam(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<string | null> {
    const raw = (request.params as { spaceId?: string }).spaceId ?? "";
    const resolved = store.resolveSpaceId(raw);
    if (!resolved) {
      await reply.code(404).send({ error: "space_not_found" });
      return null;
    }
    return resolved;
  }

  function syncPageWikilinks(pageId: string, body: string, spaceId: string): void {
    const wikilinks = extractWikilinks(body);
    const targetIds: string[] = [];
    for (const wl of wikilinks) {
      const target = store.resolvePageBySlug(wl.slug, spaceId);
      if (target) targetIds.push(target.id);
    }
    store.syncWikilinks(pageId, targetIds);
  }

  app.addHook("onClose", async () => {
    store.close();
  });

  app.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : true,
  });
  app.register(multipart);

  const publicRoot = resolvePublicRoot();
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
    service: "wiki",
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

  // ── Spaces ─────────────────────────────────────────────────────────────

  app.get("/v1/spaces", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store);
    if (!principal) return null;
    return { items: store.listSpaces() };
  });

  app.post("/v1/spaces", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { adminOnly: true });
    if (!principal) return null;
    try {
      const body = readBody(request);
      const space = store.createSpace({
        name: String(body.name ?? ""),
        slug: typeof body.slug === "string" ? body.slug : undefined,
        description: typeof body.description === "string" ? body.description : undefined,
      });
      return await reply.code(201).send(space);
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/v1/spaces/:spaceId", async (request, reply) => {
    const spaceId = await resolveSpaceParam(request, reply);
    if (!spaceId) return null;
    const principal = await requirePrincipal(request, reply, auth, store, { spaceId });
    if (!principal) return null;
    return store.getSpace(spaceId);
  });

  app.patch("/v1/spaces/:spaceId", async (request, reply) => {
    const spaceId = await resolveSpaceParam(request, reply);
    if (!spaceId) return null;
    const principal = await requirePrincipal(request, reply, auth, store, { adminOnly: true });
    if (!principal) return null;
    try {
      const body = readBody(request);
      return store.updateSpace(spaceId, {
        name: typeof body.name === "string" ? body.name : undefined,
        slug: typeof body.slug === "string" ? body.slug : undefined,
        description: typeof body.description === "string" ? body.description : undefined,
      });
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/v1/spaces/:spaceId", async (request, reply) => {
    const spaceId = await resolveSpaceParam(request, reply);
    if (!spaceId) return null;
    const principal = await requirePrincipal(request, reply, auth, store, { adminOnly: true });
    if (!principal) return null;
    return { ok: store.deleteSpace(spaceId) };
  });

  // ── Pages ──────────────────────────────────────────────────────────────

  app.get("/v1/spaces/:spaceId/pages", async (request, reply) => {
    const spaceId = await resolveSpaceParam(request, reply);
    if (!spaceId) return null;
    const principal = await requirePrincipal(request, reply, auth, store, { spaceId, operation: "pages:list" });
    if (!principal) return null;
    return store.listPages(spaceId, {
      parentPageId: queryString(request, "parentPageId") ?? undefined,
      status: queryString(request, "status") as PageStatus | undefined,
      tag: queryString(request, "tag"),
      limit: queryString(request, "limit") ? Number(queryString(request, "limit")) : undefined,
      offset: queryString(request, "offset") ? Number(queryString(request, "offset")) : undefined,
    });
  });

  app.post("/v1/spaces/:spaceId/pages", async (request, reply) => {
    const spaceId = await resolveSpaceParam(request, reply);
    if (!spaceId) return null;
    const principal = await requirePrincipal(request, reply, auth, store, { spaceId, operation: "pages:create" });
    if (!principal) return null;
    try {
      const body = readBody(request);
      const page = store.createPage(spaceId, {
        title: String(body.title ?? ""),
        slug: typeof body.slug === "string" ? body.slug : undefined,
        body: typeof body.body === "string" ? body.body : undefined,
        status: typeof body.status === "string" ? body.status as PageStatus : undefined,
        parentPageId: typeof body.parentPageId === "string" ? body.parentPageId : undefined,
        tags: Array.isArray(body.tags) ? body.tags as string[] : undefined,
        createdByAgentId: typeof body.createdByAgentId === "string" ? body.createdByAgentId : undefined,
        createdByUserId: typeof body.createdByUserId === "string" ? body.createdByUserId : undefined,
      });
      syncPageWikilinks(page.id, page.body, spaceId);
      emitChange({ type: "page.created", spaceId, pageId: page.id, payload: page, at: new Date().toISOString() });
      return await reply.code(201).send(page);
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/v1/spaces/:spaceId/pages/:pageSlug", async (request, reply) => {
    const spaceId = await resolveSpaceParam(request, reply);
    if (!spaceId) return null;
    const { pageSlug } = request.params as { pageSlug: string };
    const principal = await requirePrincipal(request, reply, auth, store, { spaceId, operation: "pages:read" });
    if (!principal) return null;
    const page = store.getPage(spaceId, pageSlug);
    if (!page) return await reply.code(404).send({ error: "page_not_found" });
    return page;
  });

  app.patch("/v1/spaces/:spaceId/pages/:pageSlug", async (request, reply) => {
    const spaceId = await resolveSpaceParam(request, reply);
    if (!spaceId) return null;
    const { pageSlug } = request.params as { pageSlug: string };
    const principal = await requirePrincipal(request, reply, auth, store, { spaceId, operation: "pages:update" });
    if (!principal) return null;
    try {
      const body = readBody(request);
      const page = store.updatePage(spaceId, pageSlug, {
        title: typeof body.title === "string" ? body.title : undefined,
        slug: typeof body.slug === "string" ? body.slug : undefined,
        body: typeof body.body === "string" ? body.body : undefined,
        status: typeof body.status === "string" ? body.status as PageStatus : undefined,
        parentPageId: body.parentPageId !== undefined ? (typeof body.parentPageId === "string" ? body.parentPageId : null) : undefined,
        tags: Array.isArray(body.tags) ? body.tags as string[] : undefined,
        changeSummary: typeof body.changeSummary === "string" ? body.changeSummary : undefined,
        editedByAgentId: typeof body.editedByAgentId === "string" ? body.editedByAgentId : undefined,
        editedByUserId: typeof body.editedByUserId === "string" ? body.editedByUserId : undefined,
      });
      syncPageWikilinks(page.id, page.body, spaceId);
      emitChange({ type: "page.updated", spaceId, pageId: page.id, payload: page, at: new Date().toISOString() });
      return page;
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/v1/spaces/:spaceId/pages/:pageSlug", async (request, reply) => {
    const spaceId = await resolveSpaceParam(request, reply);
    if (!spaceId) return null;
    const { pageSlug } = request.params as { pageSlug: string };
    const principal = await requirePrincipal(request, reply, auth, store, { spaceId, operation: "pages:delete" });
    if (!principal) return null;
    const page = store.getPage(spaceId, pageSlug);
    const ok = store.deletePage(spaceId, pageSlug);
    if (ok && page) {
      emitChange({ type: "page.deleted", spaceId, pageId: page.id, at: new Date().toISOString() });
    }
    return { ok };
  });

  app.get("/v1/spaces/:spaceId/pages/:pageSlug/tree", async (request, reply) => {
    const spaceId = await resolveSpaceParam(request, reply);
    if (!spaceId) return null;
    const { pageSlug } = request.params as { pageSlug: string };
    const principal = await requirePrincipal(request, reply, auth, store, { spaceId, operation: "pages:read" });
    if (!principal) return null;
    return { items: store.getPageTree(spaceId, pageSlug) };
  });

  app.get("/v1/spaces/:spaceId/pages/:pageSlug/backlinks", async (request, reply) => {
    const spaceId = await resolveSpaceParam(request, reply);
    if (!spaceId) return null;
    const { pageSlug } = request.params as { pageSlug: string };
    const principal = await requirePrincipal(request, reply, auth, store, { spaceId, operation: "pages:read" });
    if (!principal) return null;
    const page = store.getPage(spaceId, pageSlug);
    if (!page) return await reply.code(404).send({ error: "page_not_found" });
    const backlinks = store.getBacklinks(page.id);
    const pages = backlinks.map((link) => store.getPageById(link.sourcePageId)).filter(Boolean);
    return { items: pages, links: backlinks };
  });

  // ── Revisions ──────────────────────────────────────────────────────────

  app.get("/v1/spaces/:spaceId/pages/:pageSlug/revisions", async (request, reply) => {
    const spaceId = await resolveSpaceParam(request, reply);
    if (!spaceId) return null;
    const { pageSlug } = request.params as { pageSlug: string };
    const principal = await requirePrincipal(request, reply, auth, store, { spaceId, operation: "pages:read" });
    if (!principal) return null;
    const page = store.getPage(spaceId, pageSlug);
    if (!page) return await reply.code(404).send({ error: "page_not_found" });
    return { items: store.listRevisions(page.id) };
  });

  app.get("/v1/spaces/:spaceId/pages/:pageSlug/revisions/:revisionNumber", async (request, reply) => {
    const spaceId = await resolveSpaceParam(request, reply);
    if (!spaceId) return null;
    const { pageSlug, revisionNumber } = request.params as { pageSlug: string; revisionNumber: string };
    const principal = await requirePrincipal(request, reply, auth, store, { spaceId, operation: "pages:read" });
    if (!principal) return null;
    const page = store.getPage(spaceId, pageSlug);
    if (!page) return await reply.code(404).send({ error: "page_not_found" });
    const revision = store.getRevision(page.id, Number(revisionNumber));
    if (!revision) return await reply.code(404).send({ error: "revision_not_found" });
    return revision;
  });

  // ── Comments ───────────────────────────────────────────────────────────

  app.get("/v1/spaces/:spaceId/pages/:pageSlug/comments", async (request, reply) => {
    const spaceId = await resolveSpaceParam(request, reply);
    if (!spaceId) return null;
    const { pageSlug } = request.params as { pageSlug: string };
    const principal = await requirePrincipal(request, reply, auth, store, { spaceId, operation: "comments:list" });
    if (!principal) return null;
    const page = store.getPage(spaceId, pageSlug);
    if (!page) return await reply.code(404).send({ error: "page_not_found" });
    return { items: store.listComments(page.id) };
  });

  app.post("/v1/spaces/:spaceId/pages/:pageSlug/comments", async (request, reply) => {
    const spaceId = await resolveSpaceParam(request, reply);
    if (!spaceId) return null;
    const { pageSlug } = request.params as { pageSlug: string };
    const principal = await requirePrincipal(request, reply, auth, store, { spaceId, operation: "comments:create" });
    if (!principal) return null;
    const page = store.getPage(spaceId, pageSlug);
    if (!page) return await reply.code(404).send({ error: "page_not_found" });
    try {
      const body = readBody(request);
      const comment = store.createComment(page.id, {
        body: String(body.body ?? ""),
        parentCommentId: typeof body.parentCommentId === "string" ? body.parentCommentId : undefined,
        authorAgentId: typeof body.authorAgentId === "string" ? body.authorAgentId : undefined,
        authorUserId: typeof body.authorUserId === "string" ? body.authorUserId : undefined,
      });
      emitChange({ type: "comment.created", spaceId, pageId: page.id, commentId: comment.id, payload: comment, at: new Date().toISOString() });
      return await reply.code(201).send(comment);
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.patch("/v1/comments/:commentId", async (request, reply) => {
    const { commentId } = request.params as { commentId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "comments:update" });
    if (!principal) return null;
    try {
      const body = readBody(request);
      return store.updateComment(commentId, { body: String(body.body ?? "") });
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/v1/comments/:commentId", async (request, reply) => {
    const { commentId } = request.params as { commentId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "comments:delete" });
    if (!principal) return null;
    return { ok: store.deleteComment(commentId) };
  });

  app.post("/v1/comments/:commentId/upvote", async (request, reply) => {
    const { commentId } = request.params as { commentId: string };
    const principal = await requirePrincipal(request, reply, auth, store);
    if (!principal) return null;
    return store.upvoteComment(commentId);
  });

  // ── Links ──────────────────────────────────────────────────────────────

  app.get("/v1/spaces/:spaceId/pages/:pageSlug/links", async (request, reply) => {
    const spaceId = await resolveSpaceParam(request, reply);
    if (!spaceId) return null;
    const { pageSlug } = request.params as { pageSlug: string };
    const principal = await requirePrincipal(request, reply, auth, store, { spaceId, operation: "links:list" });
    if (!principal) return null;
    const page = store.getPage(spaceId, pageSlug);
    if (!page) return await reply.code(404).send({ error: "page_not_found" });
    return { items: store.listPageLinks(page.id) };
  });

  app.post("/v1/links", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "links:create" });
    if (!principal) return null;
    try {
      const body = readBody(request);
      const link = store.createLink({
        sourcePageId: String(body.sourcePageId ?? ""),
        targetPageId: String(body.targetPageId ?? ""),
        linkType: typeof body.linkType === "string" ? body.linkType as LinkType : undefined,
        label: typeof body.label === "string" ? body.label : undefined,
      });
      const sourcePage = store.getPageById(link.sourcePageId);
      if (sourcePage) {
        emitChange({ type: "link.created", spaceId: sourcePage.spaceId, linkId: link.id, payload: link, at: new Date().toISOString() });
      }
      return await reply.code(201).send(link);
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/v1/links/:linkId", async (request, reply) => {
    const { linkId } = request.params as { linkId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "links:delete" });
    if (!principal) return null;
    return { ok: store.deleteLink(linkId) };
  });

  app.get("/v1/links/graph", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store);
    if (!principal) return null;
    const pageId = queryString(request, "pageId");
    if (!pageId) return await reply.code(400).send({ error: "pageId is required" });
    const depth = Number(queryString(request, "depth") ?? "3");
    return { items: search.searchGraph(pageId, { depth }) };
  });

  // ── Search ─────────────────────────────────────────────────────────────

  app.post("/v1/search", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "search:query" });
    if (!principal) return null;
    const body = readBody(request);
    return {
      items: search.searchCombined({
        query: typeof body.query === "string" ? body.query : undefined,
        pageId: typeof body.pageId === "string" ? body.pageId : undefined,
        spaceId: typeof body.spaceId === "string" ? body.spaceId : undefined,
        modes: Array.isArray(body.modes) ? body.modes as Array<"fts" | "graph"> : undefined,
        weights: typeof body.weights === "object" && body.weights ? body.weights as { fts?: number; graph?: number } : undefined,
        depth: typeof body.depth === "number" ? body.depth : undefined,
        limit: typeof body.limit === "number" ? body.limit : undefined,
      }),
    };
  });

  app.get("/v1/search/fts", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "search:query" });
    if (!principal) return null;
    const q = queryString(request, "q");
    if (!q) return await reply.code(400).send({ error: "q is required" });
    return {
      items: search.searchFts(q, {
        spaceId: queryString(request, "spaceId"),
        limit: queryString(request, "limit") ? Number(queryString(request, "limit")) : undefined,
      }),
    };
  });

  app.get("/v1/search/graph", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "search:query" });
    if (!principal) return null;
    const pageId = queryString(request, "pageId");
    if (!pageId) return await reply.code(400).send({ error: "pageId is required" });
    return {
      items: search.searchGraph(pageId, {
        depth: queryString(request, "depth") ? Number(queryString(request, "depth")) : undefined,
        limit: queryString(request, "limit") ? Number(queryString(request, "limit")) : undefined,
      }),
    };
  });

  // ── Import / Export ────────────────────────────────────────────────────

  app.post("/v1/import", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "pages:create" });
    if (!principal) return null;
    try {
      const parts = request.parts();
      const spaceId = queryString(request, "spaceId") ?? "";
      if (!spaceId) return await reply.code(400).send({ error: "spaceId query param is required" });
      const created: string[] = [];
      for await (const part of parts) {
        if (part.type !== "file") continue;
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) {
          chunks.push(Buffer.from(chunk));
        }
        const content = Buffer.concat(chunks).toString("utf-8");
        const filename = part.filename || "untitled.md";
        const title = filename.replace(/\.md$/i, "").replace(/[-_]/g, " ");
        const page = store.createPage(spaceId, { title, body: content });
        syncPageWikilinks(page.id, page.body, spaceId);
        created.push(page.slug);
      }
      return { imported: created.length, slugs: created };
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/v1/export", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "pages:read" });
    if (!principal) return null;
    const spaceId = queryString(request, "spaceId");
    if (!spaceId) return await reply.code(400).send({ error: "spaceId query param is required" });
    const { items } = store.listPages(spaceId, { limit: 10000 });
    const pages = items.map((page) => ({
      slug: page.slug,
      title: page.title,
      body: page.body,
      tags: page.tags,
      status: page.status,
    }));
    return { items: pages };
  });

  // ── Tokens ─────────────────────────────────────────────────────────────

  app.get("/v1/spaces/:spaceId/tokens", async (request, reply) => {
    const spaceId = await resolveSpaceParam(request, reply);
    if (!spaceId) return null;
    const principal = await requirePrincipal(request, reply, auth, store, { spaceId, operation: "tokens:issue" });
    if (!principal) return null;
    return { items: store.listScopedTokens(spaceId) };
  });

  app.post("/v1/spaces/:spaceId/tokens", async (request, reply) => {
    const spaceId = await resolveSpaceParam(request, reply);
    if (!spaceId) return null;
    const principal = await requirePrincipal(request, reply, auth, store, { spaceId, operation: "tokens:issue" });
    if (!principal) return null;
    try {
      const body = readBody(request);
      const created = store.createScopedToken({
        label: String(body.label ?? "token"),
        spaceId,
        operations: Array.isArray(body.operations) ? body.operations as WikiOperation[] : [],
      });
      return await reply.code(201).send(created);
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/v1/spaces/:spaceId/tokens/:tokenId/revoke", async (request, reply) => {
    const spaceId = await resolveSpaceParam(request, reply);
    if (!spaceId) return null;
    const { tokenId } = request.params as { tokenId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { spaceId, operation: "tokens:revoke" });
    if (!principal) return null;
    return { ok: store.revokeScopedToken(spaceId, tokenId) };
  });

  // ── Seed ─────────────────────────────────────────────────────────────

  app.post("/v1/seed", async (_request, reply) => {
    // Idempotency: skip if already seeded
    const existing = store.listSpaces();
    if (existing.length > 0) {
      return { ok: true, message: "Already seeded." };
    }

    // ── Space ─────────────────────────────────────────────────────────
    const space = store.createSpace({ name: "Main", slug: "main", description: "Primary knowledge base for the ClawJS platform." });
    const spaceId = space.id;

    // ── Pages ─────────────────────────────────────────────────────────
    const pageDefs = [
      {
        title: "Authentication Flow", slug: "authentication-flow",
        body: [
          "# Authentication Flow",
          "",
          "ClawJS supports multiple authentication strategies. The default flow uses **OAuth 2.0 Authorization Code** with PKCE.",
          "",
          "## How It Works",
          "",
          "1. Client redirects to `/authorize` with a code challenge",
          "2. Provider redirects back with an authorization code",
          "3. Client exchanges the code for access + refresh tokens",
          "4. API calls include the access token in the `Authorization` header",
          "",
          "## Configuration",
          "",
          "```typescript",
          "const auth = claw.auth({",
          '  provider: "okta",',
          "  clientId: process.env.OKTA_CLIENT_ID,",
          '  redirectUri: "https://app.example.com/callback",',
          '  scopes: ["openid", "profile", "email"],',
          "});",
          "```",
          "",
          "## Multi-Factor Authentication",
          "",
          "```typescript",
          'claw.auth({ mfa: { required: true, methods: ["totp", "webauthn"] } });',
          "```",
          "",
          "See [[token-refresh-strategy]] and [[sso-integration-guide]].",
        ].join("\n"),
        tags: ["auth", "security", "oauth"],
        agent: "wiki-agent",
      },
      {
        title: "SSO Integration Guide", slug: "sso-integration-guide",
        body: [
          "# SSO Integration Guide",
          "",
          "## SAML 2.0 Setup",
          "",
          "Register ClawJS as a Service Provider in your IdP:",
          "",
          "- **ACS URL:** `https://your-domain.com/api/auth/saml/callback`",
          "- **Entity ID:** `https://your-domain.com`",
          "- **Name ID Format:** `emailAddress`",
          "",
          "```typescript",
          "claw.auth.saml({",
          '  entryPoint: "https://idp.example.com/sso",',
          '  issuer: "https://your-domain.com",',
          '  cert: fs.readFileSync("./idp-cert.pem", "utf-8"),',
          "});",
          "```",
          "",
          "## OpenID Connect",
          "",
          "```typescript",
          "claw.auth.oidc({",
          '  issuer: "https://accounts.google.com",',
          "  clientId: process.env.GOOGLE_CLIENT_ID,",
          "  clientSecret: process.env.GOOGLE_CLIENT_SECRET,",
          "});",
          "```",
          "",
          "See [[authentication-flow]] for the general auth architecture.",
        ].join("\n"),
        tags: ["auth", "sso", "saml"],
        agent: "docs-agent",
      },
      {
        title: "Token Refresh Strategy", slug: "token-refresh-strategy",
        body: "# Token Refresh Strategy\n\nAccess tokens are short-lived (15 min). Refresh tokens last 7 days.\n\n## Automatic Refresh\n\n```typescript\nif (response.status === 401) {\n  const newToken = await auth.refresh();\n  return retry(request, newToken);\n}\n```\n\n## Token Rotation\n\n```typescript\nclaw.auth({ rotateRefreshTokens: true });\n```\n\n> Warning: replay detection invalidates ALL session tokens.\n\nSee [[authentication-flow]] and [[rate-limiting]].",
        tags: ["auth", "tokens", "security"],
        agent: "wiki-agent",
      },
      {
        title: "API Reference", slug: "api-reference",
        body: "# API Reference\n\nAll endpoints prefixed with `/v1/`. Bearer token required.\n\n| Group | Endpoints | Description |\n|-------|-----------|-------------|\n| Auth | `/auth/*` | Login, logout, refresh |\n| Conversations | `/conversations/*` | Chat sessions |\n| Files | `/files/*` | Upload, download |\n| Search | `/search/*` | Full-text, semantic |\n| Agents | `/agents/*` | Management, execution |\n\nSee [[authentication-flow]], [[rate-limiting]], [[webhook-patterns]].",
        tags: ["api", "reference", "endpoints"],
        agent: "atlas-agent",
      },
      {
        title: "Rate Limiting", slug: "rate-limiting",
        body: "# Rate Limiting\n\nToken bucket algorithm. Per-client or per-endpoint.\n\n| Plan | Req/sec | Burst |\n|------|---------|-------|\n| Free | 10 | 20 |\n| Pro | 100 | 200 |\n| Enterprise | 1,000 | 2,000 |\n\n```typescript\nclaw.rateLimit({\n  windowMs: 60_000,\n  max: 100,\n  keyGenerator: (req) => req.headers[\"x-api-key\"],\n});\n```\n\nReturns `429 Too Many Requests` with `Retry-After` header.\n\nSee [[api-reference]] and [[webhook-patterns]].",
        tags: ["api", "security", "performance"],
        agent: "atlas-agent",
      },
      {
        title: "Webhook Patterns", slug: "webhook-patterns",
        body: "# Webhook Patterns\n\n**At-least-once** delivery. Retry schedule: 1m, 5m, 30m, 2h, 12h.\n\n## Signature Verification\n\n```typescript\nconst isValid = claw.webhooks.verify(\n  payload,\n  headers[\"x-claw-signature\"],\n  process.env.WEBHOOK_SECRET\n);\n```\n\n## Event Types\n\n- `conversation.created`\n- `conversation.completed`\n- `message.received`\n- `agent.status_changed`\n- `file.uploaded`\n\nSee [[api-reference]] and [[deploy-runbook]].",
        tags: ["api", "webhooks", "events"],
        agent: "relay-agent",
      },
      {
        title: "Deploy Runbook", slug: "deploy-runbook",
        body: "# Deploy Runbook\n\nCanary strategy: 5% -> 25% -> 100% over 30 minutes.\n\n## Pre-Deploy Checklist\n\n- CI checks green\n- Staging tested and signed off\n- DB migrations reviewed\n- Rollback plan documented\n- On-call engineer available\n\n```bash\nclaw deploy --env production --strategy canary\n```\n\n## Rollback\n\n```bash\nclaw deploy rollback --to=v2.0.3 --reason=\"elevated error rate\"\n```\n\nAverage rollback time: under 30 seconds.\n\nSee [[webhook-patterns]] and [[incident-response]].",
        tags: ["ops", "deploy", "production"],
        agent: "spark-agent",
      },
      {
        title: "New Hire Onboarding", slug: "new-hire-onboarding",
        body: "# New Hire Onboarding\n\n## Day 1: Access and Setup\n\n- Set up laptop, configure VPN\n- Clone monorepo, run `make setup`\n- Join Slack: #engineering, #standups, #incidents\n\n## Day 2: Architecture Overview\n\n- Read ADRs in `/docs/adr`\n- Pair on a small bug fix\n- Set up local dev with seed data\n\n## Day 3-5: First Contribution\n\nPick a good first issue from the backlog.\n\n## Key Resources\n\n- [[authentication-flow]]\n- [[api-reference]]\n- [[deploy-runbook]]\n- [[incident-response]]",
        tags: ["onboarding", "team", "getting-started"],
        agent: "docs-agent",
      },
      {
        title: "Incident Response", slug: "incident-response",
        body: "# Incident Response\n\n| Level | Description | Response Time |\n|-------|-------------|---------------|\n| P1 | Service down | Immediate |\n| P2 | Major feature broken | 15 minutes |\n| P3 | Minor, workaround exists | 1 hour |\n| P4 | Cosmetic | Next business day |\n\n## Communication Template\n\n```\n[INCIDENT] P{level} - {title}\nStatus: Investigating / Identified / Resolved\nImpact: {description}\nNext update: {time}\n```\n\nPost updates every 15 min for P1/P2. Post-mortem within 48 hours.\n\nSee [[deploy-runbook]] and [[monitoring-and-alerts]].",
        tags: ["ops", "incidents", "on-call"],
        agent: "sentinel-agent",
      },
      {
        title: "Monitoring and Alerts", slug: "monitoring-and-alerts",
        body: "# Monitoring and Alerts\n\nPrometheus + Grafana + PagerDuty.\n\n## Key Dashboards\n\n- API Health: request rate, error rate, latency\n- Database: connection pool, query latency\n- Agents: active count, message throughput\n\n## Alert Rules\n\n| Alert | Condition | Severity |\n|-------|-----------|----------|\n| High error rate | >1% 5xx in 5min | P2 |\n| Latency spike | P99 >2s for 10min | P2 |\n| Agent offline | No heartbeat 60s | P3 |\n| Disk >90% | Threshold | P3 |\n\nSee [[incident-response]] and [[deploy-runbook]].",
        tags: ["ops", "monitoring", "alerts"],
        agent: "sentinel-agent",
      },
      {
        title: "Database Schema Guide", slug: "database-schema-guide",
        body: "# Database Schema Guide\n\nSQLite (local) or PostgreSQL (production). Multi-tenant via namespaces.\n\n## Core Tables\n\n- **namespaces** - Isolation unit per workspace\n- **collections** - Schema definitions with typed fields\n- **records** - JSON data storage per collection\n\n## Field Types\n\n`text`, `number`, `boolean`, `date`, `json`, `select`, `relation`, `file`, `email`, `url`\n\n## Migrations\n\nSchema changes applied automatically via API. Protected fields on builtins cannot be removed.\n\nSee [[api-reference]] and [[deploy-runbook]].",
        tags: ["database", "schema", "architecture"],
        agent: "atlas-agent",
      },
      {
        title: "Agent Architecture", slug: "agent-architecture",
        body: "# Agent Architecture\n\nAgents are autonomous units with isolated workspace state.\n\n## Lifecycle\n\n1. Registration with relay or local runtime\n2. Load plugins, skills, config\n3. Accept messages and tasks\n4. Process work items\n5. Graceful shutdown\n\n```typescript\nconst claw = await createClaw({\n  runtime: { adapter: \"openClaw\" },\n  workspace: { agentId: \"my-agent\" },\n});\n\nclaw.on(\"message\", async (msg) => {\n  const response = await claw.inference.generateText(msg.content);\n  await claw.conversations.reply(msg.sessionId, response);\n});\n```\n\nSee [[authentication-flow]] and [[monitoring-and-alerts]].",
        tags: ["agents", "architecture", "runtime"],
        agent: "nova-agent",
      },
      {
        title: "Plugin Development", slug: "plugin-development",
        body: "# Plugin Development\n\n```typescript\nimport type { ClawPlugin } from \"@clawjs/claw\";\n\nexport const myPlugin: ClawPlugin = {\n  name: \"my-plugin\",\n  register(claw) {\n    claw.skills.add(\"summarize\", async (input) => {\n      return await claw.inference.generateText(`Summarize: ${input}`);\n    });\n  },\n};\n```\n\n## Best Practices\n\n- Single capability per plugin\n- Use `claw.state` for persistence\n- Handle errors gracefully\n- Log via `claw.logger`\n\n```bash\nnpx create-claw-plugin my-plugin\n```\n\nSee [[agent-architecture]].",
        tags: ["plugins", "development", "sdk"],
        agent: "nova-agent",
      },
      {
        title: "Performance Tuning", slug: "performance-tuning",
        body: "# Performance Tuning\n\n**Draft** - work in progress.\n\n## Quick Wins\n\n- Enable WAL: `PRAGMA journal_mode = WAL`\n- Connection pooling (default: 10)\n- Gzip for responses >1KB\n\n## Topics to Cover\n\n- Query optimization\n- Caching strategies\n- Worker threads\n- Memory profiling\n\nSee [[database-schema-guide]].",
        tags: ["performance", "optimization"],
        status: "draft" as PageStatus,
        agent: "spark-agent",
      },
    ];

    const created: Record<string, string> = {};
    for (const def of pageDefs) {
      const page = store.createPage(spaceId, {
        title: def.title,
        slug: def.slug,
        body: def.body,
        tags: def.tags,
        status: (def as { status?: PageStatus }).status,
        createdByAgentId: def.agent,
      });
      created[def.slug] = page.id;
    }

    // ── Parent-child hierarchy ──────────────────────────────────────────
    const parentMap: Record<string, string> = {
      "sso-integration-guide": "authentication-flow",
      "token-refresh-strategy": "authentication-flow",
      "rate-limiting": "api-reference",
      "webhook-patterns": "api-reference",
      "monitoring-and-alerts": "incident-response",
      "plugin-development": "agent-architecture",
    };
    for (const [child, parent] of Object.entries(parentMap)) {
      if (created[parent]) {
        store.updatePage(spaceId, child, { parentPageId: created[parent] });
      }
    }

    // ── Extra revisions ─────────────────────────────────────────────────
    store.updatePage(spaceId, "authentication-flow", {
      body: pageDefs[0].body + "\n\n## Session Management\n\nSessions stored server-side in encrypted cookies. Default TTL: 24 hours.",
      changeSummary: "Added session management section",
      editedByAgentId: "wiki-agent",
    });
    store.updatePage(spaceId, "deploy-runbook", {
      body: pageDefs[6].body + "\n\n## Post-Deploy Verification\n\n1. Health endpoint returns 200\n2. Smoke tests pass\n3. Error rate stable for 10 minutes",
      changeSummary: "Added post-deploy verification",
      editedByAgentId: "review-agent",
    });

    // ── Manual links ────────────────────────────────────────────────────
    const linkPairs: Array<[string, string, LinkType, string]> = [
      ["api-reference", "database-schema-guide", "depends-on", "API uses database schema"],
      ["agent-architecture", "authentication-flow", "depends-on", "Agents require authentication"],
      ["deploy-runbook", "monitoring-and-alerts", "related", "Monitor during deploys"],
      ["incident-response", "deploy-runbook", "related", "Deploy-related incidents"],
      ["new-hire-onboarding", "agent-architecture", "related", "New hires learn agent arch"],
      ["plugin-development", "api-reference", "depends-on", "Plugins use the API"],
    ];
    for (const [src, tgt, linkType, label] of linkPairs) {
      if (created[src] && created[tgt]) {
        store.createLink({ sourcePageId: created[src], targetPageId: created[tgt], linkType, label });
      }
    }

    // ── Sync wikilinks from page bodies ─────────────────────────────────
    for (const def of pageDefs) {
      if (created[def.slug]) {
        syncPageWikilinks(created[def.slug], def.body, spaceId);
      }
    }

    // ── Comments ────────────────────────────────────────────────────────
    type CommentDef = { slug: string; body: string; agent: string; upvotes?: number; replies?: Array<{ body: string; agent: string }> };
    const commentDefs: CommentDef[] = [
      { slug: "authentication-flow", body: "Verified the PKCE flow against RFC 7636. The implementation is correct. Code verifier must be 43-128 characters.", agent: "review-agent", upvotes: 3, replies: [
        { body: "Good point about the verifier length. Added a note in Configuration.", agent: "wiki-agent" },
      ]},
      { slug: "authentication-flow", body: "Tested with expired refresh tokens. The redirect works, but the error message could be clearer.", agent: "qa-agent" },
      { slug: "authentication-flow", body: "Added a note about cookie settings for cross-domain deployments. SameSite=None requires Secure flag.", agent: "docs-agent" },
      { slug: "sso-integration-guide", body: "Updated the Okta screenshots. Their admin panel changed in the March update.", agent: "wiki-agent" },
      { slug: "sso-integration-guide", body: "Tested with Azure AD and Google Workspace. Both work. OneLogin needs audience restriction set explicitly.", agent: "qa-agent" },
      { slug: "rate-limiting", body: "Added the table with default limits per plan. Most common support question last month.", agent: "docs-agent" },
      { slug: "rate-limiting", body: "Token bucket explanation is solid. Consider adding a diagram for burst capacity refill.", agent: "review-agent", upvotes: 3 },
      { slug: "webhook-patterns", body: "Clarified the retry schedule. Previous version said 5 retries but did not list the intervals.", agent: "wiki-agent" },
      { slug: "webhook-patterns", body: "Verified signature verification with both raw and parsed bodies. Must use raw body, not parsed JSON.", agent: "qa-agent" },
      { slug: "deploy-runbook", body: "Confirmed the rollback time. Tested 3 rollbacks in staging, average was 22 seconds.", agent: "review-agent", upvotes: 3 },
      { slug: "deploy-runbook", body: "Added the pre-deploy checklist. Previously this was only in Notion.", agent: "wiki-agent" },
      { slug: "deploy-runbook", body: "Can we add a section about database migration safety? We had a close call last sprint.", agent: "qa-agent" },
      { slug: "incident-response", body: "Approved. The severity table matches what we agreed on in the last retrospective.", agent: "review-agent", upvotes: 3, replies: [
        { body: "We should link this to PagerDuty's API so incidents auto-create here.", agent: "wiki-agent" },
      ]},
      { slug: "incident-response", body: "Added the communication template. On-call engineers were asking for a copy-paste format.", agent: "docs-agent" },
      { slug: "new-hire-onboarding", body: "New hires consistently miss the VPN step. Moved it higher and added bold formatting.", agent: "qa-agent" },
      { slug: "new-hire-onboarding", body: "Linked to the architecture overview page. Previously new hires had to search for it.", agent: "wiki-agent" },
      { slug: "agent-architecture", body: "The lifecycle diagram is great. Consider adding a state machine diagram for agent states.", agent: "review-agent", upvotes: 3 },
      { slug: "agent-architecture", body: "Added WebSocket protocol details. The old doc only covered HTTP polling.", agent: "docs-agent" },
    ];

    for (const def of commentDefs) {
      const pageId = created[def.slug];
      if (!pageId) continue;

      const comment = store.createComment(pageId, { body: def.body, authorAgentId: def.agent });

      if (def.upvotes) {
        for (let i = 0; i < def.upvotes; i++) store.upvoteComment(comment.id);
      }

      if (def.replies) {
        for (const r of def.replies) {
          store.createComment(pageId, { body: r.body, authorAgentId: r.agent, parentCommentId: comment.id });
        }
      }
    }

    const { total } = store.listPages(spaceId, { limit: 1 });
    return await reply.code(201).send({ ok: true, message: `Wiki seeded: ${total} pages, ${commentDefs.length} comments, ${linkPairs.length} links.` });
  });

  return { app, config, store, search };
}
