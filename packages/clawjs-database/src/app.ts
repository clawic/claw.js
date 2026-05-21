import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { clawDatabaseApiRoutePatterns, clawDatabaseRecordEvents } from "@clawjs/core";

import { DatabaseAuthService, loadEphemeralAdminToken, type AuthPrincipal } from "./auth.ts";
import { AsyncDatabaseServiceStore } from "./async-store.ts";
import { loadDatabaseConfig, type DatabaseServiceConfig } from "./config.ts";
import { RealtimeHub } from "./realtime.ts";
import type { DatabaseOperation, RecordChangeEvent } from "./types.ts";

function resolvePublicRoot(): string {
  const candidates = [
    fileURLToPath(new URL("../public", import.meta.url)),
    path.join(process.cwd(), "public"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function resolveBrandRoot(): string {
  const candidates = [
    fileURLToPath(new URL("../public/brand", import.meta.url)),
    path.join(process.cwd(), "public", "brand"),
  ];
  return candidates.find((candidate) => (
    fs.existsSync(path.join(candidate, "logo.png")) &&
    fs.existsSync(path.join(candidate, "favicon.ico"))
  )) ?? candidates[0];
}

const publicRoot = resolvePublicRoot();
const brandRoot = resolveBrandRoot();

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
    if (queryToken?.trim()) {
      return queryToken;
    }
  }
  return null;
}

function readBody(request: FastifyRequest): Record<string, unknown> {
  return ((request.body ?? {}) as Record<string, unknown>);
}

function parseOptionalJson(value: string | undefined): Record<string, unknown> | undefined {
  if (!value?.trim()) return undefined;
  return JSON.parse(value) as Record<string, unknown>;
}

function ensureAllowed(principal: AuthPrincipal, input: {
  namespaceId?: string;
  collectionName?: string;
  operation?: DatabaseOperation;
}): void {
  if (principal.kind === "admin") return;
  if (input.namespaceId && principal.namespaceId !== input.namespaceId) {
    throw new Error("Forbidden: namespace mismatch");
  }
  if (input.collectionName && principal.collectionName && principal.collectionName !== input.collectionName) {
    throw new Error("Forbidden: collection mismatch");
  }
  if (input.operation && !principal.operations.includes(input.operation)) {
    throw new Error(`Forbidden: operation ${input.operation} is required`);
  }
}

async function resolvePrincipal(
  request: FastifyRequest,
  auth: DatabaseAuthService,
  store: AsyncDatabaseServiceStore,
): Promise<AuthPrincipal | null> {
  const token = parseBearerToken(request);
  if (!token) return null;
  const ephemeralAdmin = auth.verifyEphemeralAdminToken(token);
  if (ephemeralAdmin) return ephemeralAdmin;
  const admin = await auth.verifyAdminToken(token);
  if (admin) return admin;
  const scopedToken = await store.authenticateScopedToken(token);
  if (!scopedToken) return null;
  return {
    kind: "token",
    tokenId: scopedToken.id,
    namespaceId: scopedToken.namespaceId,
    collectionName: scopedToken.collectionName,
    operations: scopedToken.operations,
  };
}

async function requirePrincipal(
  request: FastifyRequest,
  reply: FastifyReply,
  auth: DatabaseAuthService,
  store: AsyncDatabaseServiceStore,
  requirement?: {
    namespaceId?: string;
    collectionName?: string;
    operation?: DatabaseOperation;
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

async function readUpload(request: FastifyRequest): Promise<{
  namespaceId: string;
  collectionName?: string;
  recordId?: string;
  filename: string;
  contentType: string;
  bytes: Buffer;
}> {
  const parts = request.parts();
  let namespaceId = "";
  let collectionName = "";
  let recordId = "";
  let bytes = Buffer.alloc(0);
  let filename = "upload.bin";
  let contentType = "application/octet-stream";

  for await (const part of parts) {
    if (part.type === "file") {
      const chunks: Buffer[] = [];
      for await (const chunk of part.file) {
        chunks.push(Buffer.from(chunk));
      }
      bytes = Buffer.concat(chunks);
      filename = part.filename || filename;
      contentType = part.mimetype || contentType;
      continue;
    }
    if (part.fieldname === "namespaceId") namespaceId = String(part.value ?? "");
    if (part.fieldname === "collectionName") collectionName = String(part.value ?? "");
    if (part.fieldname === "recordId") recordId = String(part.value ?? "");
  }

  if (!namespaceId) throw new Error("namespaceId is required");
  if (bytes.length === 0) throw new Error("file is required");
  return {
    namespaceId,
    ...(collectionName ? { collectionName } : {}),
    ...(recordId ? { recordId } : {}),
    filename,
    contentType,
    bytes,
  };
}

export interface BuildDatabaseAppOptions {
  config?: Partial<DatabaseServiceConfig>;
  adminToken?: string | null;
}

export function buildDatabaseApp(options: BuildDatabaseAppOptions = {}) {
  const config = loadDatabaseConfig(options.config);
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.filesDir, { recursive: true });

  const ephemeralAdminToken = loadEphemeralAdminToken({
    envVarName: "CLAW_DATABASE_ADMIN_TOKEN",
    token: options.adminToken,
  });

  const app = Fastify({ logger: false });
  const auth = new DatabaseAuthService(config.jwtSecret, ephemeralAdminToken);
  const store = new AsyncDatabaseServiceStore(config.dbPath, config.filesDir);
  const realtime = new RealtimeHub();

  const emitChange = (event: RecordChangeEvent) => {
    realtime.broadcast(event);
  };

  app.addHook("onClose", async () => {
    await store.close();
  });

  app.register(cors as any, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : true,
  });
  app.register(multipart as any);
  app.register(fastifyStatic as any, {
    root: publicRoot,
    prefix: "/static/",
  });
  app.register(fastifyStatic as any, {
    root: brandRoot,
    prefix: "/brand/",
    decorateReply: false,
  });
  app.register(async (wsApp) => {
    await wsApp.register(websocket, {
      errorHandler(error, socket) {
        console.error(error);
        socket.terminate();
      },
    });

    wsApp.get(clawDatabaseApiRoutePatterns.realtime, { websocket: true }, async (socket, request) => {
      const principal = await resolvePrincipal(request as FastifyRequest, auth, store);
      if (!principal) {
        socket.close();
        return;
      }
      realtime.attach(socket, principal);
    });
  });

  app.get("/", async (_request, reply) => {
    reply.type("text/html; charset=utf-8");
    return fs.readFileSync(path.join(publicRoot, "index.html"), "utf8");
  });

  app.get("/favicon.ico", async (_request, reply) => {
    await reply.code(204).send();
  });

  app.get(clawDatabaseApiRoutePatterns.health, async () => ({
    ok: true,
    service: "database",
    host: config.host,
    port: config.port,
  }));

  app.get(clawDatabaseApiRoutePatterns.storageMetrics, async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { adminOnly: true });
    if (!principal) return null;
    return {
      service: "database",
      storage: store.snapshotMetrics(),
    };
  });

  app.post(clawDatabaseApiRoutePatterns.adminLogin, async (request, reply) => {
    const body = readBody(request);
    const email = typeof body.email === "string" ? body.email : "";
    const password = typeof body.password === "string" ? body.password : "";
    const admin = await store.verifyAdmin(email, password);
    if (!admin) {
      return await reply.code(401).send({ error: "Invalid email or password." });
    }
    const accessToken = await auth.issueAdminToken({
      adminId: admin.id,
      email: admin.email,
    });
    return {
      accessToken,
      admin: {
        id: admin.id,
        email: admin.email,
      },
    };
  });

  // Idempotent bootstrap. Used by clients that own a single admin user
  // (e.g. Clawix Mac storing the credential in the macOS Keychain).
  //
  //   - If no admin matches the email yet, create one with the given password.
  //   - If the admin exists and the password matches, return a fresh JWT.
  //   - If the admin exists with a different password, return 401.
  //
  // Always returns the same {accessToken, admin} shape on success so the
  // caller can treat first-run and steady-state identically.
  app.post(clawDatabaseApiRoutePatterns.adminBootstrap, async (request, reply) => {
    const body = readBody(request);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) {
      return await reply.code(400).send({ error: "email and password are required" });
    }
    const existing = await store.findAdminByEmail(email);
    let admin: { id: string; email: string } | null;
    if (!existing) {
      admin = await store.createAdmin({ email, password });
    } else {
      admin = await store.verifyAdmin(email, password);
      if (!admin) {
        return await reply.code(401).send({ error: "Admin already exists with a different password." });
      }
    }
    const accessToken = await auth.issueAdminToken({
      adminId: admin.id,
      email: admin.email,
    });
    return {
      accessToken,
      admin: {
        id: admin.id,
        email: admin.email,
      },
      created: !existing,
    };
  });

  app.get(clawDatabaseApiRoutePatterns.me, async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store);
    if (!principal) return null;
    return {
      principal,
    };
  });

  app.get(clawDatabaseApiRoutePatterns.settings, async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { adminOnly: true });
    if (!principal) return null;
    return {
      service: "database",
      host: config.host,
      port: config.port,
      dataDir: config.dataDir,
      filesDir: config.filesDir,
    };
  });

  app.get(clawDatabaseApiRoutePatterns.namespaces, async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { adminOnly: true });
    if (!principal) return null;
    return {
      items: await store.listNamespaces(),
    };
  });

  app.post(clawDatabaseApiRoutePatterns.namespaces, async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { adminOnly: true });
    if (!principal) return null;
    try {
      const body = readBody(request);
      const displayName = typeof body.displayName === "string" ? body.displayName : "";
      const namespace = await store.createNamespace({
        id: typeof body.id === "string" ? body.id : undefined,
        displayName,
      });
      return await reply.code(201).send(namespace);
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Idempotent ensure-namespace. Returns the existing one if it already
  // exists, otherwise creates it. Always seeds the built-in collections.
  app.put(clawDatabaseApiRoutePatterns.namespace, async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { adminOnly: true });
    if (!principal) return null;
    try {
      const params = request.params as { namespaceId: string };
      const body = readBody(request);
      const displayName = typeof body.displayName === "string" && body.displayName.trim()
        ? body.displayName
        : params.namespaceId;
      const namespace = await store.ensureNamespace({
        id: params.namespaceId,
        displayName,
      });
      await store.ensureBuiltinCollections(namespace.id);
      return namespace;
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get(clawDatabaseApiRoutePatterns.namespaceCollections, async (request, reply) => {
    const params = request.params as { namespaceId: string };
    const principal = await requirePrincipal(request, reply, auth, store, {
      namespaceId: params.namespaceId,
      operation: "schema:read",
    });
    if (!principal) return null;
    return {
      items: await store.listCollections(params.namespaceId),
    };
  });

  app.post(clawDatabaseApiRoutePatterns.namespaceCollections, async (request, reply) => {
    const params = request.params as { namespaceId: string };
    const principal = await requirePrincipal(request, reply, auth, store, {
      namespaceId: params.namespaceId,
      operation: "schema:write",
    });
    if (!principal) return null;
    try {
      const body = readBody(request);
      const collection = await store.createCollection(params.namespaceId, {
        name: String(body.name ?? ""),
        displayName: typeof body.displayName === "string" ? body.displayName : undefined,
        fields: Array.isArray(body.fields) ? body.fields as never[] : [],
        indexes: Array.isArray(body.indexes) ? body.indexes as never[] : [],
      });
      return await reply.code(201).send(collection);
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get(clawDatabaseApiRoutePatterns.collection, async (request, reply) => {
    const params = request.params as { namespaceId: string; collectionName: string };
    const principal = await requirePrincipal(request, reply, auth, store, {
      namespaceId: params.namespaceId,
      collectionName: params.collectionName,
      operation: "schema:read",
    });
    if (!principal) return null;
    const collection = await store.getCollection(params.namespaceId, params.collectionName);
    if (!collection) {
      return await reply.code(404).send({ error: "collection_not_found" });
    }
    return collection;
  });

  app.patch(clawDatabaseApiRoutePatterns.collection, async (request, reply) => {
    const params = request.params as { namespaceId: string; collectionName: string };
    const principal = await requirePrincipal(request, reply, auth, store, {
      namespaceId: params.namespaceId,
      collectionName: params.collectionName,
      operation: "schema:write",
    });
    if (!principal) return null;
    try {
      const body = readBody(request);
      return await store.updateCollection(params.namespaceId, params.collectionName, {
        displayName: typeof body.displayName === "string" ? body.displayName : undefined,
        fields: Array.isArray(body.fields) ? body.fields as never[] : undefined,
        indexes: Array.isArray(body.indexes) ? body.indexes as never[] : undefined,
      });
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete(clawDatabaseApiRoutePatterns.collection, async (request, reply) => {
    const params = request.params as { namespaceId: string; collectionName: string };
    const principal = await requirePrincipal(request, reply, auth, store, {
      namespaceId: params.namespaceId,
      collectionName: params.collectionName,
      operation: "schema:write",
    });
    if (!principal) return null;
    try {
      const removed = await store.deleteCollection(params.namespaceId, params.collectionName);
      return { ok: removed };
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get(clawDatabaseApiRoutePatterns.records, async (request, reply) => {
    const params = request.params as { namespaceId: string; collectionName: string };
    const principal = await requirePrincipal(request, reply, auth, store, {
      namespaceId: params.namespaceId,
      collectionName: params.collectionName,
      operation: "records:list",
    });
    if (!principal) return null;
    try {
      return await store.listRecords(params.namespaceId, params.collectionName, {
        filter: parseOptionalJson(typeof request.query === "object" && request.query && "filter" in request.query ? String((request.query as { filter?: string }).filter) : undefined),
        sort: typeof request.query === "object" && request.query && "sort" in request.query ? String((request.query as { sort?: string }).sort) : undefined,
        limit: typeof request.query === "object" && request.query && "limit" in request.query ? Number((request.query as { limit?: string }).limit) : undefined,
        offset: typeof request.query === "object" && request.query && "offset" in request.query ? Number((request.query as { offset?: string }).offset) : undefined,
        maxLimit: 500,
      });
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post(clawDatabaseApiRoutePatterns.records, async (request, reply) => {
    const params = request.params as { namespaceId: string; collectionName: string };
    const principal = await requirePrincipal(request, reply, auth, store, {
      namespaceId: params.namespaceId,
      collectionName: params.collectionName,
      operation: "records:create",
    });
    if (!principal) return null;
    try {
      const record = await store.createRecord(params.namespaceId, params.collectionName, readBody(request));
      emitChange({
        type: clawDatabaseRecordEvents.created,
        namespaceId: params.namespaceId,
        collectionName: params.collectionName,
        recordId: record.id,
        record,
        at: new Date().toISOString(),
      });
      return await reply.code(201).send(record);
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get(clawDatabaseApiRoutePatterns.record, async (request, reply) => {
    const params = request.params as { namespaceId: string; collectionName: string; recordId: string };
    const principal = await requirePrincipal(request, reply, auth, store, {
      namespaceId: params.namespaceId,
      collectionName: params.collectionName,
      operation: "records:read",
    });
    if (!principal) return null;
    const record = await store.getRecord(params.namespaceId, params.collectionName, params.recordId);
    if (!record) {
      return await reply.code(404).send({ error: "record_not_found" });
    }
    return record;
  });

  app.patch(clawDatabaseApiRoutePatterns.record, async (request, reply) => {
    const params = request.params as { namespaceId: string; collectionName: string; recordId: string };
    const principal = await requirePrincipal(request, reply, auth, store, {
      namespaceId: params.namespaceId,
      collectionName: params.collectionName,
      operation: "records:update",
    });
    if (!principal) return null;
    try {
      const record = await store.updateRecord(params.namespaceId, params.collectionName, params.recordId, readBody(request));
      emitChange({
        type: clawDatabaseRecordEvents.updated,
        namespaceId: params.namespaceId,
        collectionName: params.collectionName,
        recordId: record.id,
        record,
        at: new Date().toISOString(),
      });
      return record;
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete(clawDatabaseApiRoutePatterns.record, async (request, reply) => {
    const params = request.params as { namespaceId: string; collectionName: string; recordId: string };
    const principal = await requirePrincipal(request, reply, auth, store, {
      namespaceId: params.namespaceId,
      collectionName: params.collectionName,
      operation: "records:delete",
    });
    if (!principal) return null;
    const ok = await store.deleteRecord(params.namespaceId, params.collectionName, params.recordId);
    if (ok) {
      emitChange({
        type: clawDatabaseRecordEvents.deleted,
        namespaceId: params.namespaceId,
        collectionName: params.collectionName,
        recordId: params.recordId,
        at: new Date().toISOString(),
      });
    }
    return { ok };
  });

  app.get(clawDatabaseApiRoutePatterns.namespaceFiles, async (request, reply) => {
    const params = request.params as { namespaceId: string };
    const principal = await requirePrincipal(request, reply, auth, store, {
      namespaceId: params.namespaceId,
      operation: "files:read",
    });
    if (!principal) return null;
    return {
      items: await store.listFiles(params.namespaceId),
    };
  });

  app.post(clawDatabaseApiRoutePatterns.files, async (request, reply) => {
    try {
      const upload = await readUpload(request);
      const principal = await requirePrincipal(request, reply, auth, store, {
        namespaceId: upload.namespaceId,
        collectionName: upload.collectionName,
        operation: "files:write",
      });
      if (!principal) return null;
      const asset = await store.saveFile(upload);
      return await reply.code(201).send(asset);
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get(clawDatabaseApiRoutePatterns.file, async (request, reply) => {
    const params = request.params as { fileId: string };
    const file = await store.getFile(params.fileId);
    if (!file) {
      return await reply.code(404).send({ error: "file_not_found" });
    }
    const principal = await requirePrincipal(request, reply, auth, store, {
      namespaceId: file.namespaceId,
      collectionName: file.collectionName ?? undefined,
      operation: "files:read",
    });
    if (!principal) return null;
    reply.header("content-type", file.contentType);
    reply.header("content-disposition", `inline; filename="${file.filename}"`);
    return reply.send(fs.createReadStream(file.storagePath));
  });

  app.delete(clawDatabaseApiRoutePatterns.file, async (request, reply) => {
    const params = request.params as { fileId: string };
    const file = await store.getFile(params.fileId);
    if (!file) {
      return await reply.code(404).send({ error: "file_not_found" });
    }
    const principal = await requirePrincipal(request, reply, auth, store, {
      namespaceId: file.namespaceId,
      collectionName: file.collectionName ?? undefined,
      operation: "files:write",
    });
    if (!principal) return null;
    return {
      ok: await store.deleteFile(params.fileId),
    };
  });

  app.get(clawDatabaseApiRoutePatterns.namespaceTokens, async (request, reply) => {
    const params = request.params as { namespaceId: string };
    const principal = await requirePrincipal(request, reply, auth, store, {
      namespaceId: params.namespaceId,
      operation: "tokens:issue",
    });
    if (!principal) return null;
    return {
      items: await store.listScopedTokens(params.namespaceId),
    };
  });

  app.post(clawDatabaseApiRoutePatterns.namespaceTokens, async (request, reply) => {
    const params = request.params as { namespaceId: string };
    const principal = await requirePrincipal(request, reply, auth, store, {
      namespaceId: params.namespaceId,
      operation: "tokens:issue",
    });
    if (!principal) return null;
    try {
      const body = readBody(request);
      const created = await store.createScopedToken({
        label: String(body.label ?? "token"),
        namespaceId: params.namespaceId,
        collectionName: typeof body.collectionName === "string" && body.collectionName ? body.collectionName : undefined,
        operations: Array.isArray(body.operations) ? body.operations as DatabaseOperation[] : [],
      });
      return await reply.code(201).send(created);
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post(clawDatabaseApiRoutePatterns.revokeToken, async (request, reply) => {
    const params = request.params as { namespaceId: string; tokenId: string };
    const principal = await requirePrincipal(request, reply, auth, store, {
      namespaceId: params.namespaceId,
      operation: "tokens:revoke",
    });
    if (!principal) return null;
    return {
      ok: await store.revokeScopedToken(params.namespaceId, params.tokenId),
    };
  });

  return { app, config, store };
}
