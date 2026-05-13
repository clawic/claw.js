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

  app.register(cors as any, { origin: config.corsOrigins.length > 0 ? config.corsOrigins : true });
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

  // ===========================================================================
  // marketplace/1.0.0 · marketplace protocol endpoints
  // ===========================================================================
  //
  // These endpoints expose the local marketplace protocol state. Cryptographic
  // operations (key generation, signing, sealed-box) are performed by the
  // caller — typically the @clawjs/marketplace client running inside the Clawix
  // process — and only the resulting blobs are persisted here.

  function b64ToBytes(value: unknown): Uint8Array | null {
    if (typeof value !== "string") return null;
    return new Uint8Array(Buffer.from(value, "base64"));
  }
  function bytesToB64(value: Uint8Array | null | undefined): string | null {
    if (!value) return null;
    return Buffer.from(value).toString("base64");
  }

  // --- root keys ---
  app.get("/v1/marketplace/identity/roots", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    return { roots: store.mp.listRootKeys().map((r) => ({ ...r, pubkey: bytesToB64(r.pubkey) })) };
  });
  app.post("/v1/marketplace/identity/roots", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const body = readBody(req);
    const pubkey = b64ToBytes(body.pubkey);
    const encryptedSeed = b64ToBytes(body.encryptedSeed);
    if (!pubkey || !encryptedSeed) return reply.code(400).send({ error: "pubkey and encryptedSeed required (base64)" });
    const row = store.mp.insertRootKey({
      pubkey, encryptedSeed,
      encryptionMeta: (body.encryptionMeta as Record<string, unknown> | undefined) ?? {},
      label: body.label as string | undefined,
    });
    return { root: { ...row, pubkey: bytesToB64(row.pubkey) } };
  });
  app.get("/v1/marketplace/identity/roots/:id/secret", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const out = store.mp.getEncryptedRoot((req.params as { id: string }).id);
    if (!out) return reply.code(404).send({ error: "not found" });
    return { encryptedSeed: bytesToB64(out.encryptedSeed), encryptionMeta: out.encryptionMeta };
  });

  // --- device keys ---
  app.get("/v1/marketplace/identity/devices", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const rootKeyId = (req.query as { rootKeyId?: string }).rootKeyId;
    return { devices: store.mp.listDeviceKeys(rootKeyId).map((d) => ({ ...d, pubkey: bytesToB64(d.pubkey), certificateCbor: bytesToB64(d.certificateCbor) })) };
  });
  app.post("/v1/marketplace/identity/devices", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const body = readBody(req);
    const pubkey = b64ToBytes(body.pubkey);
    const encryptedPriv = b64ToBytes(body.encryptedPriv);
    const certificateCbor = b64ToBytes(body.certificateCbor);
    if (typeof body.rootKeyId !== "string" || !pubkey || !encryptedPriv || !certificateCbor || typeof body.deviceName !== "string") {
      return reply.code(400).send({ error: "rootKeyId, pubkey, encryptedPriv, deviceName, certificateCbor required" });
    }
    const row = store.mp.insertDeviceKey({
      rootKeyId: body.rootKeyId, pubkey, encryptedPriv,
      encryptionMeta: (body.encryptionMeta as Record<string, unknown> | undefined) ?? {},
      deviceName: body.deviceName, certificateCbor,
    });
    return { device: { ...row, pubkey: bytesToB64(row.pubkey), certificateCbor: bytesToB64(row.certificateCbor) } };
  });

  // --- role keys ---
  app.get("/v1/marketplace/identity/roles", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const q = req.query as { rootKeyId?: string; vertical?: string };
    return { roles: store.mp.listRoleKeys(q).map((r) => ({ ...r, pubkey: bytesToB64(r.pubkey), certificateCbor: bytesToB64(r.certificateCbor) })) };
  });
  app.post("/v1/marketplace/identity/roles", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const body = readBody(req);
    const pubkey = b64ToBytes(body.pubkey);
    const encryptedPriv = b64ToBytes(body.encryptedPriv);
    const certificateCbor = b64ToBytes(body.certificateCbor);
    if (typeof body.rootKeyId !== "string" || !pubkey || !encryptedPriv || !certificateCbor || typeof body.roleName !== "string" || typeof body.vertical !== "string") {
      return reply.code(400).send({ error: "rootKeyId, pubkey, encryptedPriv, roleName, vertical, certificateCbor required" });
    }
    const row = store.mp.insertRoleKey({
      rootKeyId: body.rootKeyId, pubkey, encryptedPriv,
      encryptionMeta: (body.encryptionMeta as Record<string, unknown> | undefined) ?? {},
      roleName: body.roleName, vertical: body.vertical, certificateCbor,
    });
    return { role: { ...row, pubkey: bytesToB64(row.pubkey), certificateCbor: bytesToB64(row.certificateCbor) } };
  });
  app.post("/v1/marketplace/identity/roles/:id/revoke", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    store.mp.revokeRoleKey((req.params as { id: string }).id);
    return { ok: true };
  });

  // --- intents ---
  app.get("/v1/marketplace/intents", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const q = req.query as { side?: "offer" | "want"; vertical?: string; status?: string; provenance?: "native" | "observed"; roleKeyId?: string };
    return { intents: store.mp.listIntents(q).map((i) => ({
      ...i,
      intentIdHash: bytesToB64(i.intentIdHash),
      ephemeralPubkey: bytesToB64(i.ephemeralPubkey),
      payloadCbor: bytesToB64(i.payloadCbor),
      signatureRole: bytesToB64(i.signatureRole),
      signatureDevice: bytesToB64(i.signatureDevice),
    })) };
  });
  app.post("/v1/marketplace/intents", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const body = readBody(req);
    const intentIdHash = b64ToBytes(body.intentIdHash);
    const payloadCbor = b64ToBytes(body.payloadCbor);
    if (!intentIdHash || !payloadCbor || typeof body.side !== "string" || typeof body.vertical !== "string" || typeof body.status !== "string" || typeof body.provenance !== "string") {
      return reply.code(400).send({ error: "intentIdHash, side, vertical, payloadCbor, status, provenance required" });
    }
    const row = store.mp.upsertObservedIntent({
      intentIdHash,
      side: body.side as "offer" | "want",
      roleKeyId: (body.roleKeyId as string | undefined) ?? null,
      ephemeralPubkey: b64ToBytes(body.ephemeralPubkey),
      vertical: body.vertical,
      payload: (body.payload as Record<string, unknown>) ?? {},
      payloadCbor,
      visibilityLevels: (body.visibilityLevels as Record<string, number>) ?? {},
      revealKeys: (body.revealKeys as Record<string, string> | undefined) ?? null,
      signatureRole: b64ToBytes(body.signatureRole),
      signatureDevice: b64ToBytes(body.signatureDevice),
      provenance: body.provenance as "native" | "observed",
      observedSource: (body.observedSource as string | undefined) ?? null,
      observedExternalUrl: (body.observedExternalUrl as string | undefined) ?? null,
      status: body.status as any,
      expiresAt: (body.expiresAt as string | undefined) ?? null,
      publishedAt: (body.publishedAt as string | undefined) ?? null,
      withdrawnAt: (body.withdrawnAt as string | undefined) ?? null,
    });
    return { intent: { ...row, intentIdHash: bytesToB64(row.intentIdHash), payloadCbor: bytesToB64(row.payloadCbor) } };
  });
  app.patch("/v1/marketplace/intents/:id/status", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const body = readBody(req);
    if (typeof body.status !== "string") return reply.code(400).send({ error: "status required" });
    store.mp.updateIntentStatus((req.params as { id: string }).id, body.status as any);
    return { ok: true };
  });
  app.get("/v1/marketplace/intents/:id", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const intent = store.mp.getIntent((req.params as { id: string }).id);
    if (!intent) return reply.code(404).send({ error: "not found" });
    return { intent: { ...intent,
      intentIdHash: bytesToB64(intent.intentIdHash),
      ephemeralPubkey: bytesToB64(intent.ephemeralPubkey),
      payloadCbor: bytesToB64(intent.payloadCbor),
      signatureRole: bytesToB64(intent.signatureRole),
      signatureDevice: bytesToB64(intent.signatureDevice),
    } };
  });

  // --- peer levels ---
  app.get("/v1/marketplace/peer-levels", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const q = req.query as { myRoleKeyId?: string; intentId?: string };
    return { peers: store.mp.listPeerLevels(q).map((p) => ({ ...p, peerPubkey: bytesToB64(p.peerPubkey) })) };
  });
  app.post("/v1/marketplace/peer-levels", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const body = readBody(req);
    const peerPubkey = b64ToBytes(body.peerPubkey);
    if (typeof body.myRoleKeyId !== "string" || !peerPubkey || typeof body.currentLevel !== "number") {
      return reply.code(400).send({ error: "myRoleKeyId, peerPubkey, currentLevel required" });
    }
    const row = store.mp.upsertPeerLevel({
      myRoleKeyId: body.myRoleKeyId, peerPubkey,
      intentId: (body.intentId as string | undefined) ?? null,
      currentLevel: body.currentLevel as number,
      proofs: body.proofs as Record<string, unknown> | undefined,
    });
    return { peer: { ...row, peerPubkey: bytesToB64(row.peerPubkey) } };
  });

  // --- mailbox ---
  app.get("/v1/marketplace/mailbox/inbound", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const q = req.query as { recipientRoleKeyId?: string; intentIdRef?: string; limit?: number };
    return { messages: store.mp.listInbound(q).map((m) => ({
      ...m,
      senderPubkey: bytesToB64(m.senderPubkey),
      threadId: bytesToB64(m.threadId),
      inReplyTo: bytesToB64(m.inReplyTo),
      signature: bytesToB64(m.signature),
    })) };
  });
  app.post("/v1/marketplace/mailbox/inbound", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const body = readBody(req);
    const senderPubkey = b64ToBytes(body.senderPubkey);
    if (typeof body.recipientRoleKeyId !== "string" || !senderPubkey || typeof body.kind !== "string") {
      return reply.code(400).send({ error: "recipientRoleKeyId, senderPubkey, kind required" });
    }
    const row = store.mp.recordInbound({
      recipientRoleKeyId: body.recipientRoleKeyId, senderPubkey,
      threadId: b64ToBytes(body.threadId), inReplyTo: b64ToBytes(body.inReplyTo),
      intentIdRef: (body.intentIdRef as string | undefined) ?? null,
      kind: body.kind, plaintext: (body.plaintext as Record<string, unknown>) ?? {},
      signature: b64ToBytes(body.signature),
      ttlExpiresAt: (body.ttlExpiresAt as string | undefined) ?? null,
    });
    return { message: { ...row,
      senderPubkey: bytesToB64(row.senderPubkey),
      threadId: bytesToB64(row.threadId),
      inReplyTo: bytesToB64(row.inReplyTo),
      signature: bytesToB64(row.signature),
    } };
  });
  app.post("/v1/marketplace/mailbox/inbound/:id/read", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    store.mp.markInboundRead((req.params as { id: string }).id);
    return { ok: true };
  });
  app.get("/v1/marketplace/mailbox/outbound", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const q = req.query as { senderRoleKeyId?: string; limit?: number };
    return { messages: store.mp.listOutbound(q).map((m) => ({
      ...m,
      recipientPubkey: bytesToB64(m.recipientPubkey),
      threadId: bytesToB64(m.threadId),
      inReplyTo: bytesToB64(m.inReplyTo),
      ciphertext: bytesToB64(m.ciphertext),
      signature: bytesToB64(m.signature),
    })) };
  });
  app.post("/v1/marketplace/mailbox/outbound", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const body = readBody(req);
    const recipientPubkey = b64ToBytes(body.recipientPubkey);
    if (typeof body.senderRoleKeyId !== "string" || !recipientPubkey || typeof body.kind !== "string") {
      return reply.code(400).send({ error: "senderRoleKeyId, recipientPubkey, kind required" });
    }
    const row = store.mp.recordOutbound({
      senderRoleKeyId: body.senderRoleKeyId, recipientPubkey,
      threadId: b64ToBytes(body.threadId), inReplyTo: b64ToBytes(body.inReplyTo),
      intentIdRef: (body.intentIdRef as string | undefined) ?? null,
      kind: body.kind, plaintext: (body.plaintext as Record<string, unknown>) ?? {},
      ciphertext: b64ToBytes(body.ciphertext),
      signature: b64ToBytes(body.signature),
      deliveryStatus: (body.deliveryStatus as any) ?? "queued",
    });
    return { message: { ...row,
      recipientPubkey: bytesToB64(row.recipientPubkey),
      threadId: bytesToB64(row.threadId),
      inReplyTo: bytesToB64(row.inReplyTo),
      ciphertext: bytesToB64(row.ciphertext),
      signature: bytesToB64(row.signature),
    } };
  });

  // --- match receipts ---
  app.get("/v1/marketplace/match-receipts", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const q = req.query as { myRoleKeyId?: string; status?: any };
    return { receipts: store.mp.listMatchReceipts(q).map((r) => ({
      ...r,
      receiptHash: bytesToB64(r.receiptHash),
      peerRolePubkey: bytesToB64(r.peerRolePubkey),
      mySignature: bytesToB64(r.mySignature),
      peerSignature: bytesToB64(r.peerSignature),
      payloadCbor: bytesToB64(r.payloadCbor),
    })) };
  });
  app.post("/v1/marketplace/match-receipts", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const body = readBody(req);
    const receiptHash = b64ToBytes(body.receiptHash);
    const peerRolePubkey = b64ToBytes(body.peerRolePubkey);
    const payloadCbor = b64ToBytes(body.payloadCbor);
    if (!receiptHash || !peerRolePubkey || !payloadCbor || typeof body.myRoleKeyId !== "string" || typeof body.status !== "string" || typeof body.reachedLevel !== "number") {
      return reply.code(400).send({ error: "receiptHash, myRoleKeyId, peerRolePubkey, reachedLevel, status, payloadCbor required" });
    }
    const row = store.mp.insertMatchReceipt({
      receiptHash, myRoleKeyId: body.myRoleKeyId, peerRolePubkey,
      offerIntentId: (body.offerIntentId as string | undefined) ?? null,
      wantIntentId: (body.wantIntentId as string | undefined) ?? null,
      reachedLevel: body.reachedLevel,
      fieldsRevealed: (body.fieldsRevealed as string[] | undefined) ?? [],
      contactHandover: (body.contactHandover as Record<string, unknown> | undefined) ?? null,
      mySignature: b64ToBytes(body.mySignature),
      peerSignature: b64ToBytes(body.peerSignature),
      status: body.status as any,
      signedAt: (body.signedAt as string | undefined) ?? null,
      rejectedAt: (body.rejectedAt as string | undefined) ?? null,
      payloadCbor,
    });
    return { receipt: { ...row,
      receiptHash: bytesToB64(row.receiptHash),
      peerRolePubkey: bytesToB64(row.peerRolePubkey),
      mySignature: bytesToB64(row.mySignature),
      peerSignature: bytesToB64(row.peerSignature),
      payloadCbor: bytesToB64(row.payloadCbor),
    } };
  });
  app.patch("/v1/marketplace/match-receipts/:id", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const body = readBody(req);
    const updated = store.mp.updateMatchReceipt((req.params as { id: string }).id, {
      status: body.status as any,
      mySignature: b64ToBytes(body.mySignature) ?? undefined,
      peerSignature: b64ToBytes(body.peerSignature) ?? undefined,
      signedAt: body.signedAt as string | undefined,
      rejectedAt: body.rejectedAt as string | undefined,
      contactHandover: body.contactHandover as Record<string, unknown> | undefined,
      fieldsRevealed: body.fieldsRevealed as string[] | undefined,
      payloadCbor: b64ToBytes(body.payloadCbor) ?? undefined,
      receiptHash: b64ToBytes(body.receiptHash) ?? undefined,
    });
    if (!updated) return reply.code(404).send({ error: "not found" });
    return { receipt: { ...updated,
      receiptHash: bytesToB64(updated.receiptHash),
      peerRolePubkey: bytesToB64(updated.peerRolePubkey),
      mySignature: bytesToB64(updated.mySignature),
      peerSignature: bytesToB64(updated.peerSignature),
      payloadCbor: bytesToB64(updated.payloadCbor),
    } };
  });

  // --- brokers ---
  app.get("/v1/marketplace/brokers", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const q = req.query as { vertical?: string };
    return { brokers: store.mp.listBrokers(q).map((b) => ({ ...b, brokerPubkey: bytesToB64(b.brokerPubkey) })) };
  });
  app.post("/v1/marketplace/brokers", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const body = readBody(req);
    const brokerPubkey = b64ToBytes(body.brokerPubkey);
    if (!brokerPubkey) return reply.code(400).send({ error: "brokerPubkey required" });
    const row = store.mp.upsertBroker({
      brokerPubkey,
      endpoints: (body.endpoints as string[] | undefined) ?? [],
      verticalsSupported: (body.verticalsSupported as string[] | undefined) ?? [],
      policies: (body.policies as Record<string, unknown> | undefined) ?? null,
      trustLocal: body.trustLocal === true,
    });
    return { broker: { ...row, brokerPubkey: bytesToB64(row.brokerPubkey) } };
  });

  // --- revocations ---
  app.post("/v1/marketplace/revocations", async (req, reply) => {
    if (!(await requirePrincipal(req, reply, auth))) return;
    const body = readBody(req);
    const revokedPubkey = b64ToBytes(body.revokedPubkey);
    const rootPubkey = b64ToBytes(body.rootPubkey);
    const rootSignature = b64ToBytes(body.rootSignature);
    if (!revokedPubkey || !rootPubkey || !rootSignature || (body.revokedKind !== "device" && body.revokedKind !== "role") || typeof body.signedAt !== "string") {
      return reply.code(400).send({ error: "revokedPubkey, revokedKind, signedAt, rootPubkey, rootSignature required" });
    }
    const row = store.mp.insertRevocation({
      revokedPubkey, revokedKind: body.revokedKind, reason: (body.reason as string | undefined) ?? null,
      signedAt: body.signedAt, rootPubkey, rootSignature,
    });
    return { revocation: { ...row, revokedPubkey: bytesToB64(row.revokedPubkey), rootPubkey: bytesToB64(row.rootPubkey), rootSignature: bytesToB64(row.rootSignature) } };
  });

  if (options.startScheduler !== false) scheduler.start();
  return { app, store, auth, scheduler, config, ephemeralAdminToken };
}
