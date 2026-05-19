import { buildCustomAppSDKInspectionPayload, clawApiPath } from "@clawjs/core";
import fs from "node:fs";

import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";

import { SessionsApiClient } from "@clawjs/sessions";
import { UserModelApiClient } from "@clawjs/user-model";

import { loadRuntimeConfig, type RuntimeServiceConfig } from "./config.ts";
import {
  heuristicDistillerSynthesizer,
  heuristicNudgeSynthesizer,
  heuristicUserModelSynthesizer,
} from "./services/heuristics.ts";
import { runDistillation } from "./services/distiller.ts";
import { runNudgeCycle } from "./services/nudge.ts";
import { runUserModelRefresh } from "./services/user-model-updater.ts";
import { RuntimeServiceStore } from "./store.ts";
import type {
  CreateKanbanTaskInput,
  DistillInput,
  KanbanPriority,
  KanbanStatus,
  ListKanbanFilter,
  NudgeInput,
  RuntimeJobKind,
  RuntimeServicesContext,
  UpdateKanbanTaskInput,
  UserModelRefreshInput,
} from "./types.ts";

export interface BuildRuntimeAppOptions {
  config?: Partial<RuntimeServiceConfig>;
  context?: Partial<RuntimeServicesContext>;
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

export function buildRuntimeApp(options: BuildRuntimeAppOptions = {}) {
  const config = loadRuntimeConfig(options.config);
  fs.mkdirSync(config.dataDir, { recursive: true });

  const app = Fastify({ logger: false, bodyLimit: 4 * 1024 * 1024 });
  const store = new RuntimeServiceStore(config.dbPath);

  const sessionsClient = options.context?.sessionsClient ?? new SessionsApiClient({
    baseUrl: config.sessionsBaseUrl,
    token: config.sessionsToken,
  });
  const userModelClient = options.context?.userModelClient ?? new UserModelApiClient({
    baseUrl: config.userModelBaseUrl,
    token: config.userModelToken,
  });

  const context: RuntimeServicesContext = {
    sessionsClient,
    userModelClient,
    skillsOutputDir: options.context?.skillsOutputDir ?? config.skillsOutputDir,
    distillerSynthesizer: options.context?.distillerSynthesizer ?? heuristicDistillerSynthesizer,
    nudgeSynthesizer: options.context?.nudgeSynthesizer ?? heuristicNudgeSynthesizer,
    userModelSynthesizer: options.context?.userModelSynthesizer ?? heuristicUserModelSynthesizer,
  };

  app.addHook("onClose", async () => {
    store.close();
  });

  app.get(clawApiPath("health"), async () => ({
    ok: true,
    service: "runtime",
    host: config.host,
    port: config.port,
  }));

  app.get(clawApiPath("runtime/status"), async () => ({
    skillsOutputDir: context.skillsOutputDir,
    recent: {
      jobs: store.listJobs(undefined, 10),
      distillations: store.listDistillations(undefined, 10),
      nudges: store.listNudges(undefined, 10),
      userModelRefreshes: store.listUserModelRefreshes(10),
    },
  }));

  app.get(clawApiPath("contracts/custom-app-sdk"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    return {
      serviceApiRole: "inspection_validation_contract_resource",
      richUiRuntime: "sdk_host_bridge_not_service_api_process",
      ...buildCustomAppSDKInspectionPayload(),
    };
  });

  app.post(clawApiPath("runtime/distill"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    try {
      const body = readBody(request);
      const input: DistillInput = {
        sessionId: String(body.sessionId ?? ""),
        taskId: (body.taskId as string | null | undefined) ?? null,
        minToolCalls: asNumber(body.minToolCalls),
        forceRedistill: body.forceRedistill === true,
        reason: asString(body.reason),
      };
      if (!input.sessionId) return await reply.code(400).send({ error: "sessionId is required" });
      const record = await runDistillation(store, context, input);
      return record;
    } catch (error) {
      return await reply.code(500).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post(clawApiPath("runtime/nudge"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    try {
      const body = readBody(request);
      const input: NudgeInput = {
        sessionId: String(body.sessionId ?? ""),
        sinceMessageId: (body.sinceMessageId as string | null | undefined) ?? null,
        lookbackMinutes: asNumber(body.lookbackMinutes),
        maxMessages: asNumber(body.maxMessages),
      };
      if (!input.sessionId) return await reply.code(400).send({ error: "sessionId is required" });
      const items = await runNudgeCycle(store, context, input);
      return { items };
    } catch (error) {
      return await reply.code(500).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post(clawApiPath("runtime/refresh-user-model"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    try {
      const body = readBody(request);
      const input: UserModelRefreshInput = {
        reason: asString(body.reason),
        agent: asString(body.agent),
        sinceCreatedAt: asNumber(body.sinceCreatedAt),
        maxSessions: asNumber(body.maxSessions),
      };
      const record = await runUserModelRefresh(store, context, input);
      return record;
    } catch (error) {
      return await reply.code(500).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get(clawApiPath("runtime/distillations"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const query = readQuery(request);
    return { items: store.listDistillations(asString(query.session), asNumber(query.limit) ?? 100) };
  });

  app.get(clawApiPath("runtime/nudges"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const query = readQuery(request);
    return { items: store.listNudges(asString(query.session), asNumber(query.limit) ?? 100) };
  });

  app.get(clawApiPath("runtime/user-model-refreshes"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const query = readQuery(request);
    return { items: store.listUserModelRefreshes(asNumber(query.limit) ?? 50) };
  });

  app.get(clawApiPath("runtime/jobs"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const query = readQuery(request);
    return { items: store.listJobs(asString(query.kind) as RuntimeJobKind | undefined, asNumber(query.limit) ?? 50) };
  });

  app.post(clawApiPath("kanban/tasks"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    try {
      const body = readBody(request);
      const input: CreateKanbanTaskInput = {
        id: asString(body.id),
        title: String(body.title ?? "").trim(),
        description: (body.description as string | null | undefined) ?? null,
        status: body.status as KanbanStatus | undefined,
        priority: (body.priority as KanbanPriority | undefined) ?? "medium",
        agentAssigned: (body.agentAssigned as string | null | undefined) ?? null,
        dependsOnIds: Array.isArray(body.dependsOnIds) ? (body.dependsOnIds as string[]) : [],
        projectPath: (body.projectPath as string | null | undefined) ?? null,
        sessionId: (body.sessionId as string | null | undefined) ?? null,
        metadata: (body.metadata as Record<string, unknown> | null) ?? null,
      };
      if (!input.title) return await reply.code(400).send({ error: "title is required" });
      return store.createKanbanTask(input);
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get(clawApiPath("kanban/tasks"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const query = readQuery(request);
    const filter: ListKanbanFilter = {
      status: asString(query.status) as KanbanStatus | undefined,
      agentAssigned: asString(query.agent),
      claimedBy: asString(query.claimedBy),
      projectPath: asString(query.projectPath),
      limit: asNumber(query.limit),
      offset: asNumber(query.offset),
    };
    return { items: store.listKanbanTasks(filter) };
  });

  app.get(clawApiPath("kanban/board"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    return store.getKanbanBoard();
  });

  app.get(clawApiPath("kanban/tasks/:id"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    const task = store.getKanbanTask(params.id);
    if (!task) return await reply.code(404).send({ error: "task_not_found" });
    return task;
  });

  app.patch(clawApiPath("kanban/tasks/:id"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    const body = readBody(request);
    const patch: UpdateKanbanTaskInput = {
      title: asString(body.title),
      description: body.description === undefined ? undefined : (body.description as string | null),
      priority: body.priority as KanbanPriority | undefined,
      agentAssigned: body.agentAssigned === undefined ? undefined : (body.agentAssigned as string | null),
      dependsOnIds: Array.isArray(body.dependsOnIds) ? (body.dependsOnIds as string[]) : undefined,
      projectPath: body.projectPath === undefined ? undefined : (body.projectPath as string | null),
      metadata: body.metadata === undefined ? undefined : (body.metadata as Record<string, unknown> | null),
      boardOrder: asNumber(body.boardOrder),
    };
    const updated = store.updateKanbanTask(params.id, patch);
    if (!updated) return await reply.code(404).send({ error: "task_not_found" });
    return updated;
  });

  app.delete(clawApiPath("kanban/tasks/:id"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    return { deleted: store.deleteKanbanTask(params.id) };
  });

  app.post(clawApiPath("kanban/tasks/:id/claim"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    const body = readBody(request);
    const agent = asString(body.agent);
    if (!agent) return await reply.code(400).send({ error: "agent is required" });
    return store.claimKanbanTask(params.id, agent, { ttlMs: asNumber(body.ttlMs) });
  });

  app.post(clawApiPath("kanban/tasks/:id/complete"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    const body = readBody(request);
    const result = store.completeKanbanTask(params.id, asString(body.actor) ?? null);
    if (!result) return await reply.code(404).send({ error: "task_not_found" });
    return result;
  });

  app.post(clawApiPath("kanban/tasks/:id/fail"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    const body = readBody(request);
    const reason = asString(body.reason) ?? "unspecified";
    const result = store.failKanbanTask(params.id, reason, asString(body.actor) ?? null);
    if (!result) return await reply.code(404).send({ error: "task_not_found" });
    return result;
  });

  app.post(clawApiPath("kanban/tasks/:id/block"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    const body = readBody(request);
    const reason = asString(body.reason) ?? "unspecified";
    const result = store.blockKanbanTask(params.id, reason, asString(body.actor) ?? null);
    if (!result) return await reply.code(404).send({ error: "task_not_found" });
    return result;
  });

  app.post(clawApiPath("kanban/tasks/:id/unblock"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    const body = readBody(request);
    const result = store.unblockKanbanTask(params.id, asString(body.actor) ?? null);
    if (!result) return await reply.code(404).send({ error: "task_not_found" });
    return result;
  });

  app.post(clawApiPath("kanban/tasks/:id/comments"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    const body = readBody(request);
    const author = asString(body.author);
    const text = asString(body.body);
    if (!author || !text) return await reply.code(400).send({ error: "author and body are required" });
    return store.addKanbanComment(params.id, author, text);
  });

  app.get(clawApiPath("kanban/tasks/:id/comments"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    return { items: store.listKanbanComments(params.id) };
  });

  app.get(clawApiPath("kanban/tasks/:id/events"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const params = request.params as { id: string };
    return { items: store.listKanbanEvents(params.id) };
  });

  app.post(clawApiPath("kanban/dispatcher/tick"), async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const body = readBody(request);
    return store.runKanbanDispatcher({
      claimTtlMs: asNumber(body.claimTtlMs),
      autoBlockThreshold: asNumber(body.autoBlockThreshold),
    });
  });

  return { app, config, store, context };
}
