import fs from "node:fs";

import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";

import { importCodexSessionsDir } from "./adapters/codex.ts";
import { loadSessionsConfig, type SessionsServiceConfig } from "./config.ts";
import { SessionsServiceStore } from "./store.ts";
import type {
  AppendMessageInput,
  CreateSessionInput,
  ListSessionsFilter,
  MessageRole,
  SearchSessionsInput,
  SessionStatus,
} from "./types.ts";

export interface BuildSessionsAppOptions {
  config?: Partial<SessionsServiceConfig>;
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

function asBool(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  const s = String(value).toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return undefined;
}

export function buildSessionsApp(options: BuildSessionsAppOptions = {}) {
  const config = loadSessionsConfig(options.config);
  fs.mkdirSync(config.dataDir, { recursive: true });

  const app = Fastify({ logger: false, bodyLimit: 16 * 1024 * 1024 });
  const store = new SessionsServiceStore(config.dbPath);

  app.addHook("onClose", async () => {
    store.close();
  });

  app.get("/v1/health", async () => ({
    ok: true,
    service: "sessions",
    host: config.host,
    port: config.port,
  }));

  app.post("/v1/sessions", async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    try {
      const body = readBody(request);
      const input: CreateSessionInput = {
        id: asString(body.id),
        agent: String(body.agent ?? ""),
        runtime: (body.runtime as string | null) ?? null,
        machine: (body.machine as string | null) ?? null,
        workspaceId: (body.workspaceId as string | null) ?? null,
        projectPath: (body.projectPath as string | null) ?? null,
        title: asString(body.title),
        createdAt: asNumber(body.createdAt),
        branch: (body.branch as string | null) ?? null,
        cwd: (body.cwd as string | null) ?? null,
        status: (body.status as SessionStatus | undefined) ?? "active",
        customMetadata: (body.customMetadata as Record<string, unknown> | null) ?? null,
      };
      if (!input.agent) return await reply.code(400).send({ error: "agent is required" });
      return store.createSession(input);
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/v1/sessions/:id", async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    const query = readQuery(request);
    const includeMessages = asBool(query.includeMessages) === true;
    if (includeMessages) {
      const result = store.getSessionWithMessages(params.id, asNumber(query.limit) ?? 500);
      if (!result) return await reply.code(404).send({ error: "session_not_found" });
      return result;
    }
    const session = store.getSession(params.id);
    if (!session) return await reply.code(404).send({ error: "session_not_found" });
    return session;
  });

  app.get("/v1/sessions", async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const query = readQuery(request);
    const filter: ListSessionsFilter = {
      agent: asString(query.agent),
      runtime: asString(query.runtime),
      machine: asString(query.machine),
      workspaceId: asString(query.workspaceId),
      projectPath: asString(query.projectPath),
      pinned: asBool(query.pinned),
      archived: asBool(query.archived),
      sidebarVisible: asBool(query.sidebarVisible),
      status: asString(query.status) as SessionStatus | undefined,
      fromCreatedAt: asNumber(query.fromCreatedAt),
      toCreatedAt: asNumber(query.toCreatedAt),
      limit: asNumber(query.limit),
      offset: asNumber(query.offset),
    };
    return store.listSessions(filter);
  });

  app.get("/v1/sessions/search", async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const query = readQuery(request);
    const q = asString(query.q);
    if (!q) return await reply.code(400).send({ error: "q query param is required" });
    const input: SearchSessionsInput = {
      query: q,
      agent: asString(query.agent),
      projectPath: asString(query.projectPath),
      limit: asNumber(query.limit),
    };
    return { items: store.searchMessages(input) };
  });

  app.patch("/v1/sessions/:id", async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    const body = readBody(request);
    let session = store.getSession(params.id);
    if (!session) return await reply.code(404).send({ error: "session_not_found" });
    if (typeof body.title === "string" && body.title.trim()) session = store.updateSessionTitle(params.id, body.title);
    if (typeof body.pinned === "boolean") session = store.setPinned(params.id, body.pinned);
    if (typeof body.archived === "boolean") session = store.setArchived(params.id, body.archived);
    if (typeof body.sidebarVisible === "boolean") session = store.setSidebarVisibility(params.id, body.sidebarVisible);
    if (body.projectPath === null || typeof body.projectPath === "string") session = store.assignProject(params.id, body.projectPath as string | null);
    if (typeof body.status === "string") session = store.setStatus(params.id, body.status as SessionStatus);
    return session;
  });

  app.delete("/v1/sessions/:id", async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    return { deleted: store.deleteSession(params.id) };
  });

  app.post("/v1/sessions/:id/messages", async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    try {
      const params = request.params as { id: string };
      const body = readBody(request);
      const input: AppendMessageInput = {
        id: asString(body.id),
        sessionId: params.id,
        role: body.role as MessageRole,
        contentText: String(body.contentText ?? ""),
        contentBlocks: (body.contentBlocks as unknown[] | null) ?? null,
        timestamp: asNumber(body.timestamp),
        toolCalls: (body.toolCalls as unknown[] | null) ?? null,
        workSummary: body.workSummary ?? null,
        audioRef: (body.audioRef as AppendMessageInput["audioRef"]) ?? null,
        attachments: (body.attachments as unknown[] | null) ?? null,
        sourceNativeId: asString(body.sourceNativeId),
      };
      if (!input.role || !input.contentText) {
        return await reply.code(400).send({ error: "role and contentText are required" });
      }
      return store.appendMessage(input);
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/v1/sessions/:id/messages", async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    const query = readQuery(request);
    return {
      items: store.listMessages(params.id, asNumber(query.limit) ?? 500, asNumber(query.offset) ?? 0),
    };
  });

  app.get("/v1/sessions/:id/origins", async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    return { items: store.listOrigins(params.id) };
  });

  app.get("/v1/sessions/export", async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const query = readQuery(request);
    const items = store.exportTrajectories({
      agent: asString(query.agent),
      sinceCreatedAt: asNumber(query.since),
      includeFailed: asBool(query.includeFailed) === true,
      tag: asString(query.tag),
    });
    if ((query.format ?? "json") === "jsonl") {
      const body = items.map((entry) => JSON.stringify(entry)).join("\n") + (items.length ? "\n" : "");
      void reply.header("content-type", "application/x-ndjson");
      return body;
    }
    return { items };
  });

  app.post("/v1/sessions/import/codex", async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    try {
      const body = readBody(request);
      const dir = asString(body.dir) ?? config.codexSessionsDir;
      const forceReimport = body.forceReimport === true;
      const machine = asString(body.machine);
      const result = importCodexSessionsDir(store, dir, { forceReimport, machine });
      return result;
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  return { app, config, store };
}
