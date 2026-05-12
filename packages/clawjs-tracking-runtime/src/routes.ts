import fs from "node:fs";

import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";

import type {
  CatalogEntry,
  ObservationValue,
  Source,
  StatsResult,
  UpsertCatalogInput,
  UpsertObservationInput,
  UpsertSessionInput,
} from "@clawjs/tracking-core";
import { SOURCES, VALUE_TYPES } from "@clawjs/tracking-core";

import { loadTrackingServiceConfig, type TrackingServiceConfig } from "./config.ts";
import { TrackingStore } from "./store.ts";

export interface BuildTrackingAppOptions {
  domain: string;
  defaultPort: number;
  hasSessions?: boolean;
  envPrefix?: string;
  configOverrides?: Partial<TrackingServiceConfig>;
  seedCatalog?: readonly CatalogEntry[];
}

function parseBearer(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

function requireSecret(
  request: FastifyRequest,
  reply: FastifyReply,
  secret: string,
): boolean {
  const token = parseBearer(request);
  if (token !== secret) {
    void reply.code(401).send({ error: "Unauthorized" });
    return false;
  }
  return true;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function asSource(value: unknown): Source | undefined {
  return typeof value === "string" && (SOURCES as readonly string[]).includes(value)
    ? (value as Source)
    : undefined;
}

function readBody(request: FastifyRequest): Record<string, unknown> {
  return (request.body ?? {}) as Record<string, unknown>;
}

function readQuery(request: FastifyRequest): Record<string, string> {
  return (request.query ?? {}) as Record<string, string>;
}

function asPeriod(value: unknown): StatsResult["period"] {
  const allowed = ["raw", "hour", "day", "week", "month", "year"] as const;
  return allowed.includes(value as (typeof allowed)[number])
    ? (value as StatsResult["period"])
    : "day";
}

export interface BuiltTrackingApp {
  app: FastifyInstance;
  config: TrackingServiceConfig;
  store: TrackingStore;
}

export function buildTrackingApp(options: BuildTrackingAppOptions): BuiltTrackingApp {
  const config = loadTrackingServiceConfig({
    domain: options.domain,
    defaultPort: options.defaultPort,
    hasSessions: options.hasSessions ?? false,
    envPrefix: options.envPrefix,
    overrides: options.configOverrides,
  });
  fs.mkdirSync(config.dataDir, { recursive: true });

  const app = Fastify({ logger: false, bodyLimit: 8 * 1024 * 1024 });
  const store = new TrackingStore({
    domain: config.domain,
    dbPath: config.dbPath,
    seedCatalog: options.seedCatalog,
  });

  app.addHook("onClose", async () => {
    store.close();
  });

  const base = `/v1/${config.domain}`;

  app.get("/v1/health", async () => ({
    ok: true,
    service: config.domain,
    host: config.host,
    port: config.port,
    hasSessions: config.hasSessions,
  }));

  app.get(`${base}/catalog`, async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const items = store.listCatalog();
    return { items };
  });

  app.get(`${base}/variables/:variableId`, async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { variableId: string };
    const entry = store.getVariable(params.variableId);
    if (!entry) return await reply.code(404).send({ error: "variable_not_found" });
    return entry;
  });

  app.post(`${base}/variables`, async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const body = readBody(request);
    const id = asString(body.id);
    const label = asString(body.label);
    const unit = body.unit as { id?: string; label?: string; group?: string } | undefined;
    const valueType = body.valueType;
    if (!id || !label || !unit?.id || !unit?.label) {
      return await reply.code(400).send({ error: "id, label and unit{id,label} are required" });
    }
    if (typeof valueType !== "string" || !(VALUE_TYPES as readonly string[]).includes(valueType)) {
      return await reply.code(400).send({ error: "invalid valueType", allowed: VALUE_TYPES });
    }
    const input: UpsertCatalogInput = {
      id,
      label,
      unit: { id: unit.id, label: unit.label, group: unit.group },
      valueType: valueType as UpsertCatalogInput["valueType"],
      validRange: (body.validRange as UpsertCatalogInput["validRange"]) ?? null,
      enumValues: Array.isArray(body.enumValues)
        ? (body.enumValues as string[]).filter((v) => typeof v === "string")
        : null,
      category: asString(body.category) ?? null,
      healthkitTypeId: asString(body.healthkitTypeId) ?? null,
      description: asString(body.description) ?? null,
    };
    return store.createUserVariable(input);
  });

  app.delete(`${base}/variables/:variableId`, async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { variableId: string };
    return store.deleteVariable(params.variableId);
  });

  app.post(`${base}/variables/:variableId/unhide`, async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { variableId: string };
    return { unhid: store.unhideSystemVariable(params.variableId) };
  });

  app.get(`${base}/observations`, async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const query = readQuery(request);
    const items = store.listObservations({
      variableId: asString(query.variableId),
      from: asNumber(query.from),
      to: asNumber(query.to),
      source: asSource(query.source),
      sessionId: asString(query.sessionId),
      limit: asNumber(query.limit),
      offset: asNumber(query.offset),
    });
    return { items };
  });

  app.post(`${base}/observations`, async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const body = readBody(request);
    const variableId = asString(body.variableId);
    if (!variableId) {
      return await reply.code(400).send({ error: "variableId is required" });
    }
    if (body.value === undefined) {
      return await reply.code(400).send({ error: "value is required" });
    }
    const input: UpsertObservationInput = {
      id: asString(body.id),
      variableId,
      value: body.value as ObservationValue,
      unitId: asString(body.unitId),
      recordedAt: asNumber(body.recordedAt),
      source: asSource(body.source) ?? "manual",
      notes: (body.notes as string | null | undefined) ?? null,
      metadata: (body.metadata as Record<string, unknown> | null) ?? null,
      sessionId: (body.sessionId as string | null | undefined) ?? null,
      externalId: (body.externalId as string | null | undefined) ?? null,
    };
    return store.upsertObservation(input);
  });

  app.post(`${base}/observations/bulk`, async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const body = readBody(request);
    const items = Array.isArray(body.items) ? body.items : [];
    const inputs: UpsertObservationInput[] = [];
    for (const raw of items as Record<string, unknown>[]) {
      const variableId = asString(raw.variableId);
      if (!variableId || raw.value === undefined) continue;
      inputs.push({
        id: asString(raw.id),
        variableId,
        value: raw.value as ObservationValue,
        unitId: asString(raw.unitId),
        recordedAt: asNumber(raw.recordedAt),
        source: asSource(raw.source) ?? "manual",
        notes: (raw.notes as string | null | undefined) ?? null,
        metadata: (raw.metadata as Record<string, unknown> | null) ?? null,
        sessionId: (raw.sessionId as string | null | undefined) ?? null,
        externalId: (raw.externalId as string | null | undefined) ?? null,
      });
    }
    const created = store.bulkUpsertObservations(inputs);
    return { items: created, count: created.length };
  });

  app.get(`${base}/observations/:id`, async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    const obs = store.getObservation(params.id);
    if (!obs) return await reply.code(404).send({ error: "observation_not_found" });
    return obs;
  });

  app.patch(`${base}/observations/:id`, async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    const body = readBody(request);
    const updated = store.updateObservation(params.id, {
      variableId: asString(body.variableId),
      value: body.value as ObservationValue | undefined,
      unitId: asString(body.unitId),
      recordedAt: asNumber(body.recordedAt),
      source: asSource(body.source),
      notes: body.notes === undefined ? undefined : ((body.notes as string | null) ?? null),
      metadata:
        body.metadata === undefined ? undefined : ((body.metadata as Record<string, unknown> | null) ?? null),
      sessionId:
        body.sessionId === undefined ? undefined : ((body.sessionId as string | null) ?? null),
      externalId:
        body.externalId === undefined ? undefined : ((body.externalId as string | null) ?? null),
    });
    if (!updated) return await reply.code(404).send({ error: "observation_not_found" });
    return updated;
  });

  app.delete(`${base}/observations/:id`, async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    return { deleted: store.deleteObservation(params.id) };
  });

  app.get(`${base}/stats/:variableId`, async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { variableId: string };
    const query = readQuery(request);
    const now = Date.now();
    const from = asNumber(query.from) ?? now - 30 * 24 * 60 * 60 * 1000;
    const to = asNumber(query.to) ?? now;
    const period = asPeriod(query.period);
    return store.stats(params.variableId, from, to, period);
  });

  if (config.hasSessions) {
    app.get(`${base}/sessions`, async (request, reply) => {
      if (!requireSecret(request, reply, config.sharedSecret)) return;
      const query = readQuery(request);
      const items = store.listSessions({
        from: asNumber(query.from),
        to: asNumber(query.to),
        limit: asNumber(query.limit),
      });
      return { items };
    });

    app.post(`${base}/sessions`, async (request, reply) => {
      if (!requireSecret(request, reply, config.sharedSecret)) return;
      const body = readBody(request);
      const type = asString(body.type);
      if (!type) return await reply.code(400).send({ error: "type is required" });
      const input: UpsertSessionInput = {
        id: asString(body.id),
        type,
        startedAt: asNumber(body.startedAt),
        endedAt: asNumber(body.endedAt) ?? null,
        notes: (body.notes as string | null | undefined) ?? null,
        metadata: (body.metadata as Record<string, unknown> | null) ?? null,
      };
      return store.upsertSession(input);
    });

    app.get(`${base}/sessions/:id`, async (request, reply) => {
      if (!requireSecret(request, reply, config.sharedSecret)) return;
      const params = request.params as { id: string };
      const session = store.getSession(params.id);
      if (!session) return await reply.code(404).send({ error: "session_not_found" });
      return session;
    });

    app.patch(`${base}/sessions/:id`, async (request, reply) => {
      if (!requireSecret(request, reply, config.sharedSecret)) return;
      const params = request.params as { id: string };
      const existing = store.getSession(params.id);
      if (!existing) return await reply.code(404).send({ error: "session_not_found" });
      const body = readBody(request);
      return store.upsertSession({
        id: existing.id,
        type: asString(body.type) ?? existing.type,
        startedAt: asNumber(body.startedAt) ?? existing.startedAt,
        endedAt:
          body.endedAt === undefined
            ? existing.endedAt ?? null
            : (asNumber(body.endedAt) ?? null),
        notes: body.notes === undefined ? existing.notes : ((body.notes as string | null) ?? null),
        metadata:
          body.metadata === undefined
            ? existing.metadata
            : ((body.metadata as Record<string, unknown> | null) ?? null),
      });
    });

    app.delete(`${base}/sessions/:id`, async (request, reply) => {
      if (!requireSecret(request, reply, config.sharedSecret)) return;
      const params = request.params as { id: string };
      return { deleted: store.deleteSession(params.id) };
    });

    app.post(`${base}/sessions/:sessionId/observations`, async (request, reply) => {
      if (!requireSecret(request, reply, config.sharedSecret)) return;
      const params = request.params as { sessionId: string };
      const body = readBody(request);
      const variableId = asString(body.variableId);
      if (!variableId) {
        return await reply.code(400).send({ error: "variableId is required" });
      }
      if (body.value === undefined) {
        return await reply.code(400).send({ error: "value is required" });
      }
      return store.upsertObservation({
        id: asString(body.id),
        variableId,
        value: body.value as ObservationValue,
        unitId: asString(body.unitId),
        recordedAt: asNumber(body.recordedAt),
        source: asSource(body.source) ?? "manual",
        notes: (body.notes as string | null | undefined) ?? null,
        metadata: (body.metadata as Record<string, unknown> | null) ?? null,
        sessionId: params.sessionId,
        externalId: (body.externalId as string | null | undefined) ?? null,
      });
    });
  }

  app.get(`${base}/healthkit/anchor/:variableId`, async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { variableId: string };
    return store.getHealthKitAnchor(params.variableId);
  });

  app.put(`${base}/healthkit/anchor/:variableId`, async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { variableId: string };
    const body = readBody(request);
    const anchorBlob = asString(body.anchorBlob);
    if (!anchorBlob) {
      return await reply.code(400).send({ error: "anchorBlob is required" });
    }
    store.setHealthKitAnchor({
      variableId: params.variableId,
      anchorBlob,
      lastSyncedAt: asNumber(body.lastSyncedAt) ?? Date.now(),
    });
    return { ok: true };
  });

  return { app, config, store };
}
