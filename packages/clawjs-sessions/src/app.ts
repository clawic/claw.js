import { clawApiPath, clawSessionEvents } from "@clawjs/core";
import fs from "node:fs";

import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";

import { importCodexSessionsDir } from "./adapters/codex.ts";
import { loadSessionsConfig, type SessionsServiceConfig } from "./config.ts";
import { SessionsServiceStore } from "./store.ts";
import type {
  AppendMessageInput,
  CreateProjectInput,
  CreateSessionInput,
  ListProjectsFilter,
  ListSessionsFilter,
  MessageRole,
  SearchSessionsInput,
  SessionEvent,
  SessionStatus,
  StartTurnInput,
  UpdateProjectInput,
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

function writeSse(reply: FastifyReply, event: SessionEvent): void {
  reply.raw.write(`event: ${event.type}\n`);
  reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function buildSessionsApp(options: BuildSessionsAppOptions = {}) {
  const config = loadSessionsConfig(options.config);
  fs.mkdirSync(config.dataDir, { recursive: true });

  const app = Fastify({ logger: false, bodyLimit: 16 * 1024 * 1024 });
  const store = new SessionsServiceStore(config.dbPath);
  const subscribers = new Set<FastifyReply>();
  const interruptedTurns = new Set<string>();

  function publish(event: Omit<SessionEvent, "at">): SessionEvent {
    const resolved: SessionEvent = { ...event, at: Date.now() };
    for (const reply of subscribers) {
      writeSse(reply, resolved);
    }
    return resolved;
  }

  app.addHook("onClose", async () => {
    store.close();
  });

  app.get(clawApiPath("health"), async () => ({
    ok: true,
    service: "sessions",
    host: config.host,
    port: config.port,
  }));

  app.get(clawApiPath("events"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    void reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    });
    subscribers.add(reply);
    writeSse(reply, { type: clawSessionEvents.updated, at: Date.now(), payload: { ready: true } });
    request.raw.on("close", () => {
      subscribers.delete(reply);
    });
  });

  app.post(clawApiPath("projects"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    try {
      const body = readBody(request);
      const input: CreateProjectInput = {
        id: asString(body.id),
        resourceId: asString(body.resourceId),
        displayName: asString(body.displayName),
        path: String(body.path ?? ""),
        hidden: asBool(body.hidden),
        archived: asBool(body.archived),
        sortRank: asNumber(body.sortRank),
        createdAt: asNumber(body.createdAt),
      };
      if (!input.path) return await reply.code(400).send({ error: "path is required" });
      const project = store.createProject(input);
      publish({ type: clawSessionEvents.projectUpdated, projectId: project.id, payload: project });
      return project;
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get(clawApiPath("projects"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const query = readQuery(request);
    const filter: ListProjectsFilter = {
      hidden: asBool(query.hidden),
      archived: asBool(query.archived),
      limit: asNumber(query.limit),
      offset: asNumber(query.offset),
    };
    return store.listProjects(filter);
  });

  app.get(clawApiPath("projects/:id"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    const project = store.getProject(params.id);
    if (!project) return await reply.code(404).send({ error: "project_not_found" });
    return project;
  });

  app.patch(clawApiPath("projects/:id"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    const body = readBody(request);
    const patch: UpdateProjectInput = {
      resourceId: typeof body.resourceId === "string" || body.resourceId === null ? body.resourceId : undefined,
      displayName: typeof body.displayName === "string" ? body.displayName : undefined,
      path: typeof body.path === "string" ? body.path : undefined,
      hidden: asBool(body.hidden),
      archived: asBool(body.archived),
      sortRank: asNumber(body.sortRank),
    };
    const project = store.updateProject(params.id, patch);
    if (!project) return await reply.code(404).send({ error: "project_not_found" });
    publish({ type: clawSessionEvents.projectUpdated, projectId: project.id, payload: project });
    return project;
  });

  app.delete(clawApiPath("projects/:id"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    const deleted = store.deleteProject(params.id);
    publish({ type: clawSessionEvents.projectUpdated, projectId: params.id, payload: { deleted } });
    return { deleted };
  });

  app.post(clawApiPath("sessions"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    try {
      const body = readBody(request);
      const input: CreateSessionInput = {
        id: asString(body.id),
        agent: String(body.agent ?? ""),
        runtime: (body.runtime as string | null) ?? null,
        runtimeAdapter: (body.runtimeAdapter as string | null) ?? null,
        runtimeSessionId: (body.runtimeSessionId as string | null) ?? null,
        machine: (body.machine as string | null) ?? null,
        workspaceId: (body.workspaceId as string | null) ?? null,
        projectId: (body.projectId as string | null) ?? null,
        projectPath: (body.projectPath as string | null) ?? null,
        title: asString(body.title),
        createdAt: asNumber(body.createdAt),
        branch: (body.branch as string | null) ?? null,
        cwd: (body.cwd as string | null) ?? null,
        status: (body.status as SessionStatus | undefined) ?? "active",
        customMetadata: (body.customMetadata as Record<string, unknown> | null) ?? null,
      };
      if (!input.agent) return await reply.code(400).send({ error: "agent is required" });
      const session = store.createSession(input);
      publish({ type: clawSessionEvents.updated, sessionId: session.id, payload: session });
      return session;
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get(clawApiPath("sessions/:id"), async (request, reply) => {
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

  app.get(clawApiPath("sessions"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const query = readQuery(request);
    const filter: ListSessionsFilter = {
      agent: asString(query.agent),
      runtime: asString(query.runtime),
      machine: asString(query.machine),
      workspaceId: asString(query.workspaceId),
      projectId: asString(query.projectId),
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

  app.get(clawApiPath("sessions/search"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const query = readQuery(request);
    const q = asString(query.q);
    if (!q) return await reply.code(400).send({ error: "q query param is required" });
    const input: SearchSessionsInput = {
      query: q,
      agent: asString(query.agent),
      projectId: asString(query.projectId),
      projectPath: asString(query.projectPath),
      limit: asNumber(query.limit),
    };
    return { items: store.searchMessages(input) };
  });

  app.patch(clawApiPath("sessions/:id"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    const body = readBody(request);
    let session = store.getSession(params.id);
    if (!session) return await reply.code(404).send({ error: "session_not_found" });
    if (typeof body.title === "string" && body.title.trim()) session = store.updateSessionTitle(params.id, body.title);
    if (typeof body.pinned === "boolean") session = store.setPinned(params.id, body.pinned);
    if (typeof body.archived === "boolean") session = store.setArchived(params.id, body.archived);
    if (typeof body.sidebarVisible === "boolean") session = store.setSidebarVisibility(params.id, body.sidebarVisible);
    if (body.projectId === null || typeof body.projectId === "string") session = store.assignProjectById(params.id, body.projectId as string | null);
    if (body.projectPath === null || typeof body.projectPath === "string") session = store.assignProject(params.id, body.projectPath as string | null);
    if (typeof body.status === "string") session = store.setStatus(params.id, body.status as SessionStatus);
    if (session) publish({ type: clawSessionEvents.updated, sessionId: session.id, payload: session });
    return session;
  });

  app.delete(clawApiPath("sessions/:id"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    return { deleted: store.deleteSession(params.id) };
  });

  app.post(clawApiPath("sessions/:id/messages"), async (request, reply) => {
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
        timeline: (body.timeline as unknown[] | null) ?? null,
        workSummary: body.workSummary ?? null,
        streamingState: (body.streamingState as AppendMessageInput["streamingState"]) ?? null,
        audioRef: (body.audioRef as AppendMessageInput["audioRef"]) ?? null,
        attachments: (body.attachments as unknown[] | null) ?? null,
        sourceNativeId: asString(body.sourceNativeId),
      };
      if (!input.role || !input.contentText) {
        return await reply.code(400).send({ error: "role and contentText are required" });
      }
      const message = store.appendMessage(input);
      publish({ type: clawSessionEvents.messageAppended, sessionId: params.id, messageId: message.id, payload: message });
      return message;
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get(clawApiPath("sessions/:id/messages"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    const query = readQuery(request);
    return {
      items: store.listMessages(params.id, asNumber(query.limit) ?? 500, asNumber(query.offset) ?? 0),
    };
  });

  app.patch(clawApiPath("sessions/:sessionId/messages/:messageId"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { sessionId: string; messageId: string };
    const body = readBody(request);
    const message = store.updateMessage(params.messageId, {
      contentText: typeof body.contentText === "string" ? body.contentText : undefined,
      contentBlocks: Array.isArray(body.contentBlocks) || body.contentBlocks === null ? (body.contentBlocks as unknown[] | null) : undefined,
      toolCalls: Array.isArray(body.toolCalls) || body.toolCalls === null ? (body.toolCalls as unknown[] | null) : undefined,
      timeline: Array.isArray(body.timeline) || body.timeline === null ? (body.timeline as unknown[] | null) : undefined,
      workSummary: body.workSummary,
      streamingState: (body.streamingState as AppendMessageInput["streamingState"]) ?? undefined,
      attachments: Array.isArray(body.attachments) || body.attachments === null ? (body.attachments as unknown[] | null) : undefined,
    });
    if (!message || message.sessionId !== params.sessionId) {
      return await reply.code(404).send({ error: "message_not_found" });
    }
    publish({ type: clawSessionEvents.messageUpdated, sessionId: params.sessionId, messageId: message.id, payload: message });
    return message;
  });

  app.post(clawApiPath("sessions/:id/turns"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    try {
      const params = request.params as { id: string };
      const body = readBody(request);
      const input: StartTurnInput = {
        prompt: String(body.prompt ?? ""),
        sessionId: params.id,
        projectId: (body.projectId as string | null) ?? null,
        projectPath: (body.projectPath as string | null) ?? null,
        cwd: (body.cwd as string | null) ?? null,
        title: asString(body.title),
        attachments: (body.attachments as unknown[] | null) ?? null,
        audioRef: (body.audioRef as StartTurnInput["audioRef"]) ?? null,
        fakeReply: asString(body.fakeReply),
      };
      if (!input.prompt.trim()) return await reply.code(400).send({ error: "prompt is required" });

      let session = store.getSession(params.id);
      if (!session) {
        session = store.createSession({
          id: params.id,
          agent: "codex",
          runtime: "codex",
          runtimeAdapter: "codex",
          projectId: input.projectId,
          projectPath: input.projectPath,
          cwd: input.cwd ?? input.projectPath ?? null,
          title: input.title,
          status: "active",
        });
        publish({ type: clawSessionEvents.updated, sessionId: session.id, payload: session });
      }

      interruptedTurns.delete(session.id);
      const userMessage = store.appendMessage({
        sessionId: session.id,
        role: "user",
        contentText: input.prompt,
        attachments: input.attachments,
        audioRef: input.audioRef ?? null,
        streamingState: "complete",
      });
      publish({ type: clawSessionEvents.messageAppended, sessionId: session.id, messageId: userMessage.id, payload: userMessage });

      const assistantMessage = store.appendMessage({
        sessionId: session.id,
        role: "assistant",
        contentText: "",
        timeline: [{ kind: clawSessionEvents.turnStarted, title: "Working", at: Date.now() }],
        workSummary: { status: "working", text: "Working" },
        streamingState: "streaming",
      });
      publish({ type: clawSessionEvents.messageAppended, sessionId: session.id, messageId: assistantMessage.id, payload: assistantMessage });

      const fakeReply = input.fakeReply ?? process.env.SESSIONS_FAKE_CODEX_REPLY;
      const realTurnsEnabled = process.env.SESSIONS_ENABLE_REAL_CODEX_TURNS === "1";
      const finalText = fakeReply ?? (
        realTurnsEnabled
          ? "Codex runtime adapter is ready, but real app-server execution is not invoked by automated fixtures."
          : "Local Codex turn fixture completed. Enable SESSIONS_ENABLE_REAL_CODEX_TURNS=1 only after confirming real prompt execution."
      );
      const streamingState = interruptedTurns.has(session.id) ? "interrupted" : "complete";
      const updated = store.updateMessage(assistantMessage.id, {
        contentText: streamingState === "complete" ? finalText : "",
        timeline: [
          ...(assistantMessage.timeline ?? []),
          { kind: "tool", title: "Codex", status: realTurnsEnabled ? "ready" : "fixture", at: Date.now() },
          { kind: clawSessionEvents.turnFinished, status: streamingState, at: Date.now() },
        ],
        workSummary: { status: streamingState, text: streamingState === "complete" ? "Completed" : "Interrupted" },
        streamingState,
      });
      if (updated) {
        publish({ type: clawSessionEvents.messageUpdated, sessionId: session.id, messageId: updated.id, payload: updated });
      }
      const finished = store.setStatus(session.id, streamingState === "complete" ? "completed" : "interrupted");
      if (finished) publish({ type: clawSessionEvents.turnFinished, sessionId: session.id, payload: { session: finished, message: updated } });
      return { session: finished, userMessage, assistantMessage: updated };
    } catch (error) {
      publish({ type: "error", payload: { error: error instanceof Error ? error.message : String(error) } });
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post(clawApiPath("sessions/:id/interrupt"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    interruptedTurns.add(params.id);
    const session = store.setStatus(params.id, "interrupted");
    if (!session) return await reply.code(404).send({ error: "session_not_found" });
    publish({ type: clawSessionEvents.turnFinished, sessionId: params.id, payload: { interrupted: true, session } });
    return { interrupted: true, session };
  });

  app.get(clawApiPath("sessions/:id/origins"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    return { items: store.listOrigins(params.id) };
  });

  app.get(clawApiPath("sessions/export"), async (request, reply) => {
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

  app.post(clawApiPath("sessions/import/codex"), async (request, reply) => {
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
