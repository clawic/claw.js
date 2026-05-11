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
  DistillInput,
  NudgeInput,
  RuntimeJobKind,
  RuntimeServicesContext,
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

  app.get("/v1/health", async () => ({
    ok: true,
    service: "runtime",
    host: config.host,
    port: config.port,
  }));

  app.get("/v1/runtime/status", async () => ({
    skillsOutputDir: context.skillsOutputDir,
    recent: {
      jobs: store.listJobs(undefined, 10),
      distillations: store.listDistillations(undefined, 10),
      nudges: store.listNudges(undefined, 10),
      userModelRefreshes: store.listUserModelRefreshes(10),
    },
  }));

  app.post("/v1/runtime/distill", async (request, reply) => {
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

  app.post("/v1/runtime/nudge", async (request, reply) => {
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

  app.post("/v1/runtime/refresh-user-model", async (request, reply) => {
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

  app.get("/v1/runtime/distillations", async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const query = readQuery(request);
    return { items: store.listDistillations(asString(query.session), asNumber(query.limit) ?? 100) };
  });

  app.get("/v1/runtime/nudges", async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const query = readQuery(request);
    return { items: store.listNudges(asString(query.session), asNumber(query.limit) ?? 100) };
  });

  app.get("/v1/runtime/user-model-refreshes", async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const query = readQuery(request);
    return { items: store.listUserModelRefreshes(asNumber(query.limit) ?? 50) };
  });

  app.get("/v1/runtime/jobs", async (request, reply) => {
    if (!requireSecret(request, reply, config.sharedSecret)) return;
    const query = readQuery(request);
    return { items: store.listJobs(asString(query.kind) as RuntimeJobKind | undefined, asNumber(query.limit) ?? 50) };
  });

  return { app, config, store, context };
}
