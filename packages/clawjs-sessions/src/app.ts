import { clawApiPath, clawSessionEvents } from "@clawjs/core";
import {
  AsyncDatabaseServiceStore,
  appStateRequestFromOperations,
  loadDatabaseConfig,
} from "@clawjs/database";
import fs from "node:fs";

import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";

import { AsyncSessionsServiceStore } from "./async-store.ts";
import { loadSessionsConfig, type SessionsServiceConfig } from "./config.ts";
import { createLazyResource, createLazyResourceProxy } from "./lazy-resource.ts";
import { SessionEventBroadcaster } from "./sse-broadcaster.ts";
import type {
  AppendMessageInput,
  CreateProjectInput,
  CreateSessionInput,
  HydrateSessionInput,
  ListSessionDynamicToolsOptions,
  ListSessionEventsFilter,
  ListProjectsFilter,
  ListSessionsFilter,
  MessageRole,
  RebuildSessionProjectionsInput,
  SearchSessionsInput,
  SearchSessionEventsInput,
  SessionEvent,
  SessionMessageUpdatedDelta,
  SessionMessageUpdatedPayload,
  SessionMessageRecord,
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

function asCodexImportMode(value: unknown): "incremental" | "full" | undefined {
  return value === "incremental" || value === "full" ? value : undefined;
}

function messageUpdatedPayload(
  message: SessionMessageRecord,
  delta: SessionMessageUpdatedDelta,
): SessionMessageUpdatedPayload {
  return {
    id: message.id,
    sessionId: message.sessionId,
    messageId: message.id,
    delta,
    full: false,
  };
}

function buildCompactAssistantStreamTrace(text: string, coalesceMs = 16): unknown {
  return {
    kind: "assistant_stream_trace",
    schemaVersion: 1,
    coalesceMs,
    finalLength: text.length,
    deltas: text
      ? [{ offset: 0, length: text.length, text, at: Date.now() }]
      : [],
  };
}

export function buildSessionsApp(options: BuildSessionsAppOptions = {}) {
  const config = loadSessionsConfig(options.config);
  fs.mkdirSync(config.dataDir, { recursive: true });

  const app = Fastify({ logger: false, bodyLimit: 16 * 1024 * 1024 });
  const lazyStore = createLazyResource(
    () => new AsyncSessionsServiceStore(config.dbPath),
    (openedStore) => {
      void openedStore.close();
    },
  );
  const store = createLazyResourceProxy<AsyncSessionsServiceStore>(lazyStore);
  const lazyAppStateStore = createLazyResource(
    () => {
      const databaseConfig = loadDatabaseConfig();
      return new AsyncDatabaseServiceStore(databaseConfig.dbPath, databaseConfig.filesDir);
    },
    (openedStore) => {
      void openedStore.close();
    },
  );
  const events = new SessionEventBroadcaster({
    hardQueueLimit: config.eventsHardQueueLimit,
    maxQueuedBytes: config.eventsMaxQueuedBytes,
    maxFrameBytes: config.eventsMaxFrameBytes,
    maxSubscribers: config.eventsMaxSubscribers,
  });
  const interruptedTurns = new Set<string>();

  function publish(event: Omit<SessionEvent, "at">): SessionEvent {
    const resolved: SessionEvent = { ...event, at: Date.now() };
    events.publish(resolved);
    return resolved;
  }

  app.addHook("onClose", async () => {
    events.close();
    lazyStore.closeIfOpened();
    lazyAppStateStore.closeIfOpened();
  });

  app.get(clawApiPath("health"), async () => ({
    ok: true,
    service: "sessions",
    host: config.host,
    port: config.port,
  }));

  app.get(clawApiPath("host/app-state/projection"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    try {
      const query = readQuery(request);
      return await lazyAppStateStore.get().readAppStateProjection({
        sidebarLimit: asNumber(query.limit) ?? 200,
        receiptLimit: asNumber(query.receiptLimit ?? query["receipt-limit"]) ?? 20,
      });
    } catch (error) {
      return reply.code(500).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post(clawApiPath("host/app-state/apply"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    try {
      const body = readBody(request);
      const requestBody = Array.isArray(body.operations) && body.schemaVersion === undefined
        ? appStateRequestFromOperations(body.operations, {
            requestId: asString(body.requestId),
            hostId: asString(body.hostId) ?? "sessions-api",
            clientContext: typeof body.clientContext === "object" && body.clientContext !== null
              ? body.clientContext as Record<string, unknown>
              : undefined,
          })
        : body;
      return await lazyAppStateStore.get().applyAppStateTransaction(requestBody);
    } catch (error) {
      const receipt = typeof error === "object" && error && "receipt" in error ? (error as { receipt: unknown }).receipt : undefined;
      return reply.code(500).send({
        error: error instanceof Error ? error.message : String(error),
        receipt,
      });
    }
  });

  app.get(clawApiPath("events"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const subscription = events.trySubscribe(reply.raw);
    if (!subscription) {
      return reply.code(503).send({ error: "Too many session event subscribers." });
    }
    void reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    });
    subscription.enqueue({ type: clawSessionEvents.updated, at: Date.now(), payload: { ready: true } });
    request.raw.on("close", () => {
      subscription.close();
    });
  });

  app.get(clawApiPath("storage/metrics"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    return {
      service: "sessions",
      storage: store.snapshotMetrics(),
      events: events.snapshotMetrics(),
      appStateStorage: lazyAppStateStore.opened ? lazyAppStateStore.get().snapshotMetrics() : null,
    };
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
      const project = await store.createProject(input);
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
    return await store.listProjects(filter);
  });

  app.get(clawApiPath("projects/:id"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    const project = await store.getProject(params.id);
    if (!project) return await reply.code(404).send({ error: "project_not_found" });
    return project;
  });

  app.get(clawApiPath("sidebar/bootstrap"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const query = readQuery(request);
    return await store.sidebarBootstrap({ recentLimit: asNumber(query.recentLimit) });
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
    const project = await store.updateProject(params.id, patch);
    if (!project) return await reply.code(404).send({ error: "project_not_found" });
    publish({ type: clawSessionEvents.projectUpdated, projectId: project.id, payload: project });
    return project;
  });

  app.delete(clawApiPath("projects/:id"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    const deleted = await store.deleteProject(params.id);
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
      const session = await store.createSession(input);
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
      const result = await store.getSessionWithMessages(params.id, asNumber(query.limit) ?? 200);
      if (!result) return await reply.code(404).send({ error: "session_not_found" });
      return result;
    }
    const session = await store.getSession(params.id);
    if (!session) return await reply.code(404).send({ error: "session_not_found" });
    return session;
  });

  app.get(clawApiPath("sessions/:id/hydrate"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    const query = readQuery(request);
    const input: HydrateSessionInput = {
      sessionId: params.id,
      messageLimit: asNumber(query.messageLimit ?? query.limit),
      messageOffset: asNumber(query.messageOffset ?? query.offset),
      recent: asBool(query.recent),
      summaryLimit: asNumber(query.summaryLimit),
      includeEvents: asBool(query.includeEvents),
      eventLimit: asNumber(query.eventLimit),
      eventOffset: asNumber(query.eventOffset),
      eventTurnId: asString(query.eventTurnId ?? query.turnId),
    };
    const hydrated = await store.hydrateSession(input);
    if (!hydrated) return await reply.code(404).send({ error: "session_not_found" });
    return hydrated;
  });

  app.get(clawApiPath("sessions/:id/dynamic-tools"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    const session = await store.getSession(params.id);
    if (!session) return await reply.code(404).send({ error: "session_not_found" });
    const query = readQuery(request);
    const options: ListSessionDynamicToolsOptions = {
      includeDeferredSchemas: asBool(query.includeDeferredSchemas ?? query.includeSchemas) === true,
    };
    return { items: await store.listSessionDynamicTools(params.id, options) };
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
    return await store.listSessions(filter);
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
    return { items: await store.searchMessages(input) };
  });

  app.get(clawApiPath("sessions/events/search"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const query = readQuery(request);
    const q = asString(query.q);
    if (!q) return await reply.code(400).send({ error: "q query param is required" });
    const input: SearchSessionEventsInput = {
      query: q,
      sessionId: asString(query.sessionId),
      eventKind: asString(query.eventKind) as SearchSessionEventsInput["eventKind"],
      eventType: asString(query.eventType),
      limit: asNumber(query.limit),
    };
    return { items: await store.searchSessionEvents(input) };
  });

  app.patch(clawApiPath("sessions/:id"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    const body = readBody(request);
    let session = await store.getSession(params.id);
    if (!session) return await reply.code(404).send({ error: "session_not_found" });
    if (typeof body.title === "string" && body.title.trim()) session = await store.updateSessionTitle(params.id, body.title);
    if (typeof body.pinned === "boolean") session = await store.setPinned(params.id, body.pinned);
    if (typeof body.archived === "boolean") session = await store.setArchived(params.id, body.archived);
    if (typeof body.sidebarVisible === "boolean") session = await store.setSidebarVisibility(params.id, body.sidebarVisible);
    if (body.projectId === null || typeof body.projectId === "string") session = await store.assignProjectById(params.id, body.projectId as string | null);
    if (body.projectPath === null || typeof body.projectPath === "string") session = await store.assignProject(params.id, body.projectPath as string | null);
    if (typeof body.status === "string") session = await store.setStatus(params.id, body.status as SessionStatus);
    if (session) publish({ type: clawSessionEvents.updated, sessionId: session.id, payload: session });
    return session;
  });

  app.delete(clawApiPath("sessions/:id"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    return { deleted: await store.deleteSession(params.id) };
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
      const message = await store.appendMessage(input);
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
      items: await store.listMessages(params.id, asNumber(query.limit) ?? 200, asNumber(query.offset) ?? 0),
    };
  });

  app.get(clawApiPath("sessions/:id/events"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    const query = readQuery(request);
    const filter: ListSessionEventsFilter = {
      sessionId: params.id,
      eventKind: asString(query.eventKind) as ListSessionEventsFilter["eventKind"],
      eventType: asString(query.eventType),
      turnId: asString(query.turnId),
      callId: asString(query.callId),
      limit: asNumber(query.limit),
      offset: asNumber(query.offset),
    };
    return { items: await store.listSessionEvents(filter) };
  });

  app.get(clawApiPath("sessions/:id/turn-summaries"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    const query = readQuery(request);
    const turnIds = asString(query.turnIds)?.split(",").map((value) => value.trim()).filter(Boolean);
    return { items: await store.listTurnSummaries(params.id, turnIds) };
  });

  app.get(clawApiPath("sessions/:id/projection"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    return { meta: await store.getProjectionMeta(params.id) };
  });

  app.post(clawApiPath("sessions/projection/rebuild"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    try {
      const body = readBody(request);
      const input: RebuildSessionProjectionsInput = {
        projectId: asString(body.projectId),
        projectPath: asString(body.projectPath),
        offset: asNumber(body.offset),
        maxSessions: asNumber(body.maxSessions),
        budgetMs: asNumber(body.budgetMs),
        batchSize: asNumber(body.batchSize),
      };
      return await store.rebuildSessionProjections(input);
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post(clawApiPath("sessions/:id/projection/rebuild"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    try {
      const params = request.params as { id: string };
      return await store.rebuildSessionProjection(params.id);
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.patch(clawApiPath("sessions/:sessionId/messages/:messageId"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { sessionId: string; messageId: string };
    const body = readBody(request);
    const patch = {
      contentText: typeof body.contentText === "string" ? body.contentText : undefined,
      contentBlocks: Array.isArray(body.contentBlocks) || body.contentBlocks === null ? (body.contentBlocks as unknown[] | null) : undefined,
      toolCalls: Array.isArray(body.toolCalls) || body.toolCalls === null ? (body.toolCalls as unknown[] | null) : undefined,
      timeline: Array.isArray(body.timeline) || body.timeline === null ? (body.timeline as unknown[] | null) : undefined,
      workSummary: body.workSummary,
      streamingState: (body.streamingState as AppendMessageInput["streamingState"]) ?? undefined,
      attachments: Array.isArray(body.attachments) || body.attachments === null ? (body.attachments as unknown[] | null) : undefined,
    };
    const message = await store.updateMessage(params.messageId, patch);
    if (!message || message.sessionId !== params.sessionId) {
      return await reply.code(404).send({ error: "message_not_found" });
    }
    const delta: SessionMessageUpdatedDelta = {};
    if (patch.contentText !== undefined) delta.contentText = message.contentText;
    if (patch.contentBlocks !== undefined) delta.contentBlocks = message.contentBlocks;
    if (patch.toolCalls !== undefined) delta.toolCalls = message.toolCalls;
    if (patch.timeline !== undefined) delta.timeline = message.timeline;
    if (patch.workSummary !== undefined) delta.workSummary = message.workSummary;
    if (patch.streamingState !== undefined) delta.streamingState = message.streamingState;
    if (patch.attachments !== undefined) delta.attachments = message.attachments;
    publish({
      type: clawSessionEvents.messageUpdated,
      sessionId: params.sessionId,
      messageId: message.id,
      payload: messageUpdatedPayload(message, delta),
    });
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
        fixtureReply: asString(body.fixtureReply),
      };
      if (!input.prompt.trim()) return await reply.code(400).send({ error: "prompt is required" });

      let session = await store.getSession(params.id);
      if (!session) {
        session = await store.createSession({
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
      const userMessage = await store.appendMessage({
        sessionId: session.id,
        role: "user",
        contentText: input.prompt,
        attachments: input.attachments,
        audioRef: input.audioRef ?? null,
        streamingState: "complete",
      });
      publish({ type: clawSessionEvents.messageAppended, sessionId: session.id, messageId: userMessage.id, payload: userMessage });

      const assistantMessage = await store.appendMessage({
        sessionId: session.id,
        role: "assistant",
        contentText: "",
        timeline: [{ kind: clawSessionEvents.turnStarted, title: "Working", at: Date.now() }],
        workSummary: { status: "working", text: "Working" },
        streamingState: "streaming",
      });
      publish({ type: clawSessionEvents.messageAppended, sessionId: session.id, messageId: assistantMessage.id, payload: assistantMessage });

      const fixtureReply = input.fixtureReply ?? process.env.SESSIONS_FIXTURE_CODEX_REPLY;
      const realTurnsEnabled = process.env.SESSIONS_ENABLE_REAL_CODEX_TURNS === "1";
      const finalText = fixtureReply ?? (
        realTurnsEnabled
          ? "Codex runtime adapter is ready, but real app-server execution is not invoked by automated fixtures."
          : "Local Codex turn fixture completed. Enable SESSIONS_ENABLE_REAL_CODEX_TURNS=1 only after confirming real prompt execution."
      );
      const streamingState = interruptedTurns.has(session.id) ? "interrupted" : "complete";
      const updated = await store.updateMessage(assistantMessage.id, {
        contentText: streamingState === "complete" ? finalText : "",
        timeline: [
          ...(assistantMessage.timeline ?? []),
          { kind: "tool", title: "Codex", status: realTurnsEnabled ? "ready" : "fixture", at: Date.now() },
          ...(streamingState === "complete" ? [buildCompactAssistantStreamTrace(finalText)] : []),
          { kind: clawSessionEvents.turnFinished, status: streamingState, at: Date.now() },
        ],
        workSummary: { status: streamingState, text: streamingState === "complete" ? "Completed" : "Interrupted" },
        streamingState,
      });
      if (updated) {
        publish({
          type: clawSessionEvents.messageUpdated,
          sessionId: session.id,
          messageId: updated.id,
          payload: messageUpdatedPayload(updated, {
            contentText: updated.contentText,
            timeline: updated.timeline,
            workSummary: updated.workSummary,
            streamingState: updated.streamingState,
          }),
        });
      }
      const finished = await store.setStatus(session.id, streamingState === "complete" ? "completed" : "interrupted");
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
    const session = await store.setStatus(params.id, "interrupted");
    if (!session) return await reply.code(404).send({ error: "session_not_found" });
    publish({ type: clawSessionEvents.turnFinished, sessionId: params.id, payload: { interrupted: true, session } });
    return { interrupted: true, session };
  });

  app.get(clawApiPath("sessions/:id/origins"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    return { items: await store.listOrigins(params.id) };
  });

  app.get(clawApiPath("sessions/export"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const query = readQuery(request);
    const items = await store.exportTrajectories({
      agent: asString(query.agent),
      sinceCreatedAt: asNumber(query.since),
      includeFailed: asBool(query.includeFailed) === true,
      tag: asString(query.tag),
      limit: asNumber(query.limit),
      offset: asNumber(query.offset),
      messageLimit: asNumber(query.messageLimit ?? query["message-limit"]),
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
      const result = await store.importCodexSessionsDir(dir, {
        forceReimport,
        machine,
        budgetMs: asNumber(body.budgetMs),
        maxFiles: asNumber(body.maxFiles),
        mode: asCodexImportMode(body.mode),
      });
      return result;
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  return { app, config, store, events };
}
