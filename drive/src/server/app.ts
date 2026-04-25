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
import type { DriveNativeContent, DriveOperation, DrivePreviewKind, DriveView } from "../shared/types.ts";

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
  return null;
}

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
  return { kind: "share", id: principal.shareId, name: "Shared link" };
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
}

export function buildDriveApp(options: BuildDriveAppOptions = {}) {
  const config = loadDriveConfig(options.config);
  fs.mkdirSync(config.dataDir, { recursive: true });

  const app = Fastify({ logger: false });
  const auth = new DriveAuthService(config.jwtSecret);
  const converters = new DriveConverterService(config.converterMode);
  const store = new DriveStore(config.dbPath, config.dataDir);

  app.addHook("onClose", async () => {
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
    return await reply.code(201).send(store.createItem({
      kind,
      name: typeof body.name === "string" ? body.name : `Untitled ${kind}`,
      parentId: typeof body.parentId === "string" ? body.parentId : null,
    }, actorFromPrincipal(principal)));
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
    return store.updateItem(itemId, {
      ...(typeof body.name === "string" ? { name: body.name } : {}),
      ...(typeof body.parentId === "string" || body.parentId === null ? { parentId: body.parentId as string | null } : {}),
      ...(typeof body.starred === "boolean" ? { starred: body.starred } : {}),
    });
  });

  app.post("/v1/items/:itemId/move", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:write" });
    if (!principal) return null;
    const body = readBody(request);
    return store.moveItem(itemId, typeof body.parentId === "string" ? body.parentId : null);
  });

  app.post("/v1/items/:itemId/copy", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:write" });
    if (!principal) return null;
    const body = readBody(request);
    return store.copyItem(itemId, typeof body.parentId === "string" ? body.parentId : null, actorFromPrincipal(principal));
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
    return store.trashItem(itemId);
  });

  app.post("/v1/items/:itemId/restore", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:delete" });
    if (!principal) return null;
    return store.restoreItem(itemId);
  });

  app.delete("/v1/items/:itemId", async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:delete" });
    if (!principal) return null;
    return {
      ok: store.deleteItemForever(itemId),
    };
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
    return await reply.code(201).send(store.addComment(itemId, String(body.body ?? ""), actorFromPrincipal(principal).name));
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
    const created = store.createShare(itemId, typeof body.label === "string" ? body.label : "Share link");
    return await reply.code(201).send({
      ...created,
      url: `${config.publicBaseUrl}/?share=${created.token}&item=${itemId}`,
    });
  });

  app.post("/v1/items/:itemId/shares/:shareId/revoke", async (request, reply) => {
    const { itemId, shareId } = request.params as { itemId: string; shareId: string };
    const principal = await requirePrincipal(request, reply, auth, store, { operation: "items:share" });
    if (!principal) return null;
    return { ok: store.revokeShare(itemId, shareId) };
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
    const uploadContent = converters.inspectUpload(filePath, upload.fileName, upload.mimeType);
    return await reply.code(201).send(store.createItem({
      kind: "upload",
      name: upload.fileName,
      parentId: upload.parentId,
      mimeType: upload.mimeType,
      sizeBytes: upload.buffer.byteLength,
      storagePath: relativeStoragePath,
      previewKind: uploadContent.previewKind as DrivePreviewKind,
      content: uploadContent,
    }, actorFromPrincipal(principal)));
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

  return { app, config, store, converters };
}
