import fs from "node:fs";

import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";

import { IndexAuthService, loadEphemeralAdminToken, type AuthPrincipal } from "./auth.ts";
import { loadIndexConfig, type IndexServiceConfig } from "./config.ts";
import { IndexStore } from "./store.ts";
import { IndexRealtimeHub } from "./realtime.ts";
import { IndexScheduler, type SchedulerHooks } from "./scheduler.ts";
import { describeCron, nextCronFire } from "./cron.ts";
import type { AlertRule, JsonSchema, UiHints } from "./types.ts";

function parseBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (header) {
    const [scheme, token] = header.split(" ");
    if (scheme?.toLowerCase() === "bearer" && token) return token;
  }
  const rawUrl = request.raw.url ?? request.url;
  if (rawUrl) {
    const parsed = new URL(rawUrl, "http://localhost");
    const q = parsed.searchParams.get("token");
    if (q?.trim()) return q;
  }
  return null;
}

function readBody(request: FastifyRequest): Record<string, unknown> {
  return (request.body ?? {}) as Record<string, unknown>;
}

async function resolvePrincipal(request: FastifyRequest, auth: IndexAuthService): Promise<AuthPrincipal | null> {
  const token = parseBearerToken(request);
  if (!token) return null;
  const ephemeral = auth.verifyEphemeralAdminToken(token);
  if (ephemeral) return ephemeral;
  return await auth.verifyAdminToken(token);
}

async function requirePrincipal(request: FastifyRequest, reply: FastifyReply, auth: IndexAuthService): Promise<AuthPrincipal | null> {
  const principal = await resolvePrincipal(request, auth);
  if (!principal) {
    await reply.code(401).send({ error: "Unauthorized" });
    return null;
  }
  return principal;
}

export interface BuildIndexAppOptions {
  config?: Partial<IndexServiceConfig>;
  schedulerHooks?: SchedulerHooks;
  startScheduler?: boolean;
}

export function buildIndexApp(options: BuildIndexAppOptions = {}) {
  const config = loadIndexConfig(options.config);
  fs.mkdirSync(config.dataDir, { recursive: true });
  const ephemeralAdminToken = loadEphemeralAdminToken({ dataDir: config.dataDir, envVarName: "CLAWJS_INDEX_ADMIN_TOKEN" });
  const app = Fastify({ logger: false });
  const auth = new IndexAuthService(config.jwtSecret, ephemeralAdminToken);
  const store = new IndexStore(config.dbPath);
  const realtime = new IndexRealtimeHub();
  const scheduler = new IndexScheduler(store, config, options.schedulerHooks ?? {});

  store.subscribe((event) => realtime.broadcast(event));
  app.addHook("onClose", async () => { scheduler.stop(); store.close(); });

  app.register(cors, { origin: config.corsOrigins.length > 0 ? config.corsOrigins : true });
  app.register(async (wsApp) => {
    await wsApp.register(websocket, { errorHandler(_e, socket) { socket.terminate(); } });
    wsApp.get("/v1/realtime", { websocket: true }, async (socket, request) => {
      const principal = await resolvePrincipal(request as FastifyRequest, auth);
      realtime.attach(socket, principal != null);
    });
  });

  app.get("/v1/health", async () => ({ ok: true, service: "index", host: config.host, port: config.port }));

  app.get("/v1/types", async (req, reply) => { if (!(await requirePrincipal(req, reply, auth))) return; return { types: store.listTypes() }; });
  app.post("/v1/types", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const body = readBody(req);
    if (typeof body.name !== "string" || !body.schema || !body.identityFields) return reply.code(400).send({ error: "name, schema and identityFields required" });
    const type = store.declareType({
      name: body.name,
      schema: body.schema as JsonSchema,
      identityFields: body.identityFields as string[],
      timeseriesFields: (body.timeseriesFields as string[]) ?? [],
      uiHints: body.uiHints as UiHints | undefined,
    });
    return { type };
  });

  app.post("/v1/entities/upsert", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const body = readBody(req);
    if (typeof body.type !== "string" || typeof body.data !== "object" || body.data === null) {
      return reply.code(400).send({ error: "type and data required" });
    }
    try {
      return store.upsertEntity({
        typeName: body.type,
        data: body.data as Record<string, unknown>,
        sourceUrl: body.sourceUrl as string | undefined,
        observedAt: body.observedAt as string | undefined,
        runId: (body.runId as string | undefined) ?? null,
        agentSessionId: (body.agentSessionId as string | undefined) ?? null,
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });
  app.get("/v1/entities/:id", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const id = (req.params as { id: string }).id;
    const entity = store.getEntity(id);
    if (!entity) return reply.code(404).send({ error: "not found" });
    return {
      entity,
      observations: store.listObservations(id, 100),
      relationsFrom: store.listRelationsFrom(id),
      relationsTo: store.listRelationsTo(id),
      tags: store.listEntityTags(id),
    };
  });
  app.get("/v1/entities/:id/history", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const id = (req.params as { id: string }).id;
    const field = (req.query as { field?: string }).field;
    if (!field) return reply.code(400).send({ error: "field required" });
    return { history: store.getFieldHistory(id, field, 500) };
  });
  app.post("/v1/entities/query", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const body = readBody(req);
    return {
      entities: store.queryEntities({
        typeName: body.type as string | undefined,
        where: body.where as Record<string, unknown> | undefined,
        orderBy: body.orderBy as { field: string; direction: "asc" | "desc" } | undefined,
        limit: body.limit as number | undefined,
        offset: body.offset as number | undefined,
        tagIds: body.tagIds as string[] | undefined,
        collectionId: body.collectionId as string | undefined,
      }),
    };
  });
  app.get("/v1/entities/counts", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    return { counts: store.countByType() };
  });
  app.post("/v1/entities/search", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const body = readBody(req);
    if (typeof body.fullText !== "string") return reply.code(400).send({ error: "fullText required" });
    return { entities: store.searchEntitiesFullText(body.fullText, body.type as string | undefined, (body.limit as number | undefined) ?? 50) };
  });

  app.get("/v1/searches", async (req, reply) => { if (!(await requirePrincipal(req, reply, auth))) return; return { searches: store.listSearches() }; });
  app.post("/v1/searches", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const body = readBody(req);
    return { search: store.createSearch({
      name: body.name as string,
      typeName: body.type as string | undefined,
      criteria: (body.criteria as Record<string, unknown>) ?? {},
      promptTemplate: (body.promptTemplate as string | null) ?? null,
    }) };
  });
  app.patch("/v1/searches/:id", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const id = (req.params as { id: string }).id;
    const body = readBody(req);
    const fresh = store.updateSearch(id, {
      name: body.name as string | undefined,
      criteria: body.criteria as Record<string, unknown> | undefined,
      promptTemplate: body.promptTemplate as string | undefined,
    });
    if (!fresh) return reply.code(404).send({ error: "not found" });
    return { search: fresh };
  });
  app.delete("/v1/searches/:id", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    store.deleteSearch((req.params as { id: string }).id);
    return { ok: true };
  });
  app.post("/v1/searches/:id/run", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const id = (req.params as { id: string }).id;
    const body = readBody(req);
    try { return { run: await scheduler.runManualSearch(id, body.prompt as string | undefined) }; }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : String(error) }); }
  });

  app.get("/v1/monitors", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    return { monitors: store.listMonitors().map((m) => ({ ...m, cronHuman: describeCron(m.cronExpr) })) };
  });
  app.post("/v1/monitors", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const body = readBody(req);
    if (typeof body.searchId !== "string" || typeof body.cronExpr !== "string") return reply.code(400).send({ error: "searchId and cronExpr required" });
    const nextFire = nextCronFire(body.cronExpr as string);
    return { monitor: store.createMonitor({
      searchId: body.searchId as string,
      cronExpr: body.cronExpr as string,
      name: (body.name as string | null) ?? null,
      alertRules: (body.alertRules as AlertRule[]) ?? [],
      enabled: body.enabled === false ? false : true,
      nextFireAt: nextFire.toISOString(),
    }) };
  });
  app.patch("/v1/monitors/:id", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const id = (req.params as { id: string }).id;
    const body = readBody(req);
    const update: Parameters<IndexStore["updateMonitor"]>[1] = {
      name: body.name as string | undefined,
      cronExpr: body.cronExpr as string | undefined,
      enabled: body.enabled as boolean | undefined,
      alertRules: body.alertRules as AlertRule[] | undefined,
      muteUntil: body.muteUntil as string | undefined,
    };
    if (typeof body.cronExpr === "string") update.nextFireAt = nextCronFire(body.cronExpr).toISOString();
    const fresh = store.updateMonitor(id, update);
    if (!fresh) return reply.code(404).send({ error: "not found" });
    return { monitor: fresh };
  });
  app.delete("/v1/monitors/:id", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    store.deleteMonitor((req.params as { id: string }).id);
    return { ok: true };
  });
  app.post("/v1/monitors/:id/fire", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const id = (req.params as { id: string }).id;
    const monitor = store.getMonitor(id);
    if (!monitor) return reply.code(404).send({ error: "not found" });
    return { run: await scheduler.fireNow(monitor) };
  });

  app.get("/v1/runs", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const monitorId = (req.query as { monitorId?: string }).monitorId;
    return { runs: monitorId ? store.listRunsForMonitor(monitorId) : store.listRuns() };
  });
  app.get("/v1/runs/:id", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const id = (req.params as { id: string }).id;
    const run = store.getRun(id);
    if (!run) return reply.code(404).send({ error: "not found" });
    return { run, entities: store.listEntitiesForRun(id) };
  });
  app.post("/v1/runs/:id/attach", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const id = (req.params as { id: string }).id;
    const body = readBody(req);
    if (typeof body.entityId !== "string") return reply.code(400).send({ error: "entityId required" });
    store.attachRunEntity(id, body.entityId);
    return { ok: true };
  });

  app.get("/v1/alerts", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    return { alerts: store.listAlerts(), unread: store.countUnackedAlerts() };
  });
  app.post("/v1/alerts/:id/ack", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    store.ackAlert((req.params as { id: string }).id);
    return { ok: true };
  });

  app.get("/v1/tags", async (req, reply) => { if (!(await requirePrincipal(req, reply, auth))) return; return { tags: store.listTags() }; });
  app.post("/v1/tags/apply", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const body = readBody(req);
    if (typeof body.entityId !== "string" || typeof body.name !== "string") return reply.code(400).send({ error: "entityId and name required" });
    return { tag: store.applyTag(body.entityId as string, body.name as string, body.color as string | undefined) };
  });
  app.post("/v1/tags/remove", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const body = readBody(req);
    store.removeTag(body.entityId as string, body.tagId as string);
    return { ok: true };
  });

  app.get("/v1/collections", async (req, reply) => { if (!(await requirePrincipal(req, reply, auth))) return; return { collections: store.listCollections() }; });
  app.post("/v1/collections", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const body = readBody(req);
    return { collection: store.createCollection({
      name: body.name as string,
      description: body.description as string | undefined,
      kind: (body.kind as "manual" | "smart") ?? "manual",
      criteria: body.criteria as Record<string, unknown> | undefined,
    }) };
  });
  app.post("/v1/collections/:id/add", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const id = (req.params as { id: string }).id;
    const body = readBody(req);
    store.addToCollection(id, body.entityId as string);
    return { ok: true };
  });
  app.post("/v1/collections/:id/remove", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const id = (req.params as { id: string }).id;
    const body = readBody(req);
    store.removeFromCollection(id, body.entityId as string);
    return { ok: true };
  });

  app.post("/v1/relations", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const body = readBody(req);
    if (typeof body.fromEntityId !== "string" || typeof body.toEntityId !== "string" || typeof body.relationType !== "string") return reply.code(400).send({ error: "fromEntityId, toEntityId and relationType required" });
    return { relation: store.linkEntities({
      fromEntityId: body.fromEntityId as string,
      toEntityId: body.toEntityId as string,
      relationType: body.relationType as string,
      attrs: body.attrs as Record<string, unknown> | undefined,
    }) };
  });

  app.post("/v1/devices", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const body = readBody(req);
    if ((body.platform !== "macos" && body.platform !== "ios") || typeof body.token !== "string") return reply.code(400).send({ error: "platform and token required" });
    return { device: store.registerDeviceToken({ platform: body.platform as "macos" | "ios", token: body.token as string, label: body.label as string | undefined }) };
  });
  app.get("/v1/devices", async (req, reply) => { if (!(await requirePrincipal(req, reply, auth))) return; return { devices: store.listDeviceTokens() }; });

  if (options.startScheduler !== false) scheduler.start();
  return { app, store, auth, scheduler, config, ephemeralAdminToken };
}
