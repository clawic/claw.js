import fs from "node:fs";

import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";

import { loadUserModelConfig, type UserModelServiceConfig } from "./config.ts";
import { UserModelServiceStore } from "./store.ts";
import type {
  CommitSnapshotInput,
  ForgetInput,
  UpdateItemInput,
  UpsertItemInput,
  UserModelSection,
} from "./types.ts";
import { USER_MODEL_SECTIONS } from "./types.ts";

export interface BuildUserModelAppOptions {
  config?: Partial<UserModelServiceConfig>;
}

function parseBearer(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

function requireSecret(request: FastifyRequest, reply: FastifyReply, secret: string): boolean {
  const token = parseBearer(request);
  if (token !== secret) {
    void reply.code(401).send({ error: "Unauthorized" });
    return false;
  }
  return true;
}

function readBody(request: FastifyRequest): Record<string, unknown> {
  return ((request.body ?? {}) as Record<string, unknown>);
}

function readQuery(request: FastifyRequest): Record<string, string> {
  return ((request.query ?? {}) as Record<string, string>);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function isValidSection(value: unknown): value is UserModelSection {
  return typeof value === "string" && (USER_MODEL_SECTIONS as readonly string[]).includes(value);
}

export function buildUserModelApp(options: BuildUserModelAppOptions = {}) {
  const config = loadUserModelConfig(options.config);
  fs.mkdirSync(config.dataDir, { recursive: true });

  const app = Fastify({ logger: false, bodyLimit: 4 * 1024 * 1024 });
  const store = new UserModelServiceStore(config.dbPath);

  app.addHook("onClose", async () => {
    store.close();
  });

  app.get("/v1/health", async () => ({
    ok: true,
    service: "user-model",
    host: config.host,
    port: config.port,
  }));

  app.get("/v1/user-model", async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const query = readQuery(request);
    if (query.bySection === "true") {
      return store.bySection();
    }
    return store.snapshot();
  });

  app.get("/v1/user-model/counts", async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    return { counts: store.countBySection() };
  });

  app.post("/v1/user-model/items", async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    try {
      const body = readBody(request);
      const section = body.section;
      if (!isValidSection(section)) {
        return await reply.code(400).send({ error: "invalid section", allowed: USER_MODEL_SECTIONS });
      }
      const input: UpsertItemInput = {
        id: asString(body.id),
        section,
        contentText: String(body.contentText ?? "").trim(),
        confidence: body.confidence === null ? null : (asNumber(body.confidence) ?? undefined),
        source: asString(body.source) ?? "manual",
        topic: (body.topic as string | null | undefined) ?? null,
        metadata: (body.metadata as Record<string, unknown> | null) ?? null,
      };
      if (!input.contentText) {
        return await reply.code(400).send({ error: "contentText is required" });
      }
      return store.upsertItem(input);
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.patch("/v1/user-model/items/:id", async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    const body = readBody(request);
    const patch: UpdateItemInput = {};
    if (typeof body.contentText === "string") patch.contentText = body.contentText;
    if (body.confidence === null || typeof body.confidence === "number") patch.confidence = body.confidence;
    if (body.topic === null || typeof body.topic === "string") patch.topic = body.topic as string | null;
    if (body.metadata !== undefined) patch.metadata = body.metadata as Record<string, unknown> | null;
    const updated = store.updateItem(params.id, patch);
    if (!updated) return await reply.code(404).send({ error: "item_not_found" });
    return updated;
  });

  app.delete("/v1/user-model/items/:id", async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    return { deleted: store.deleteItem(params.id) };
  });

  app.post("/v1/user-model/forget", async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    try {
      const body = readBody(request);
      const input: ForgetInput = {
        about: asString(body.about),
        section: isValidSection(body.section) ? body.section : undefined,
        topic: asString(body.topic),
        ids: Array.isArray(body.ids) ? body.ids.filter((entry): entry is string => typeof entry === "string") : undefined,
      };
      return store.forget(input);
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/v1/user-model/refresh", async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const body = readBody(request);
    const reason = asString(body.reason) ?? "manual_refresh";
    store.setRefreshMetadata(reason);
    const snapshot = store.commitSnapshot({ reason });
    return {
      ok: true,
      message: "runtime/ pending: refresh recorded as snapshot, synthesis will run when runtime/ subsystem lands",
      snapshot,
    };
  });

  app.post("/v1/user-model/snapshot", async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const body = readBody(request);
    const input: CommitSnapshotInput = { reason: asString(body.reason) ?? null };
    return store.commitSnapshot(input);
  });

  app.get("/v1/user-model/history", async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const query = readQuery(request);
    return { items: store.listHistory(asNumber(query.limit) ?? 50) };
  });

  return { app, config, store };
}
