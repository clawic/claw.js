import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";

import { loadTimeConfig, type TimeServiceConfig } from "./config.ts";
import type { CreateTemporalItemInput, TemporalExecution, TemporalItem, UpdateTemporalItemInput } from "./logic.ts";
import {
  EmbeddedTimeEngine,
  type TemporalHeartbeatAgentRunner,
  type TemporalHeartbeatCheckProvider,
} from "../../../packages/clawjs-node/src/time/embedded.ts";

export interface BuildTimeAppOptions {
  config?: Partial<TimeServiceConfig>;
  maxCatchUpPerCycle?: number;
  missedJobStaggerMs?: number;
  runLogLimit?: number;
  heartbeatChecks?: Record<string, TemporalHeartbeatCheckProvider>;
  heartbeatAgent?: TemporalHeartbeatAgentRunner;
}

function resolvePublicRoot(): string {
  const candidates = [
    fileURLToPath(new URL("../../public", import.meta.url)),
    path.join(process.cwd(), "public"),
  ];
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, "index.html"))) ?? candidates[0];
}

function jsonBody(body: unknown): Record<string, unknown> {
  return (body ?? {}) as Record<string, unknown>;
}

export function buildTimeApp(options: BuildTimeAppOptions = {}) {
  const config = loadTimeConfig(options.config);
  fs.mkdirSync(config.dataDir, { recursive: true });
  const engine = new EmbeddedTimeEngine({
    dbPath: config.dbPath,
    defaultTimeZone: config.defaultTimeZone,
    schedulerIntervalMs: config.schedulerIntervalMs,
    maxCatchUpPerCycle: options.maxCatchUpPerCycle,
    missedJobStaggerMs: options.missedJobStaggerMs,
    runLogLimit: options.runLogLimit,
    notifyBaseUrl: config.notifyBaseUrl,
    notifySourceToken: config.notifySourceToken,
    heartbeatChecks: options.heartbeatChecks,
    heartbeatAgent: options.heartbeatAgent,
  });
  const store = engine.store;
  const app = Fastify({ logger: false });
  const publicRoot = resolvePublicRoot();

  app.addHook("onClose", async () => {
    engine.close();
  });

  app.register(cors, { origin: true });
  app.register(fastifyStatic, {
    root: publicRoot,
    prefix: "/static/",
  });

  app.get("/", async (_request, reply) => {
    reply.type("text/html; charset=utf-8");
    return fs.readFileSync(path.join(publicRoot, "index.html"), "utf8");
  });

  app.get("/favicon.ico", async (_request, reply) => {
    await reply.code(204).send();
  });

  app.get("/v1/health", async () => ({
    ok: true,
    service: "time",
    host: config.host,
    port: config.port,
  }));

  app.get("/v1/items", async (request) => {
    const query = request.query as Record<string, string | undefined>;
    return await engine.list({
      kind: query.kind as TemporalItem["kind"] | undefined,
      status: query.status as TemporalItem["status"] | undefined,
      workspaceId: query.workspaceId,
      projectId: query.projectId,
      agentId: query.agentId,
      ownerId: query.ownerId,
      sourceProvider: query.sourceProvider,
    });
  });

  app.post("/v1/items", async (request, reply) => {
    const body = jsonBody(request.body) as unknown as CreateTemporalItemInput;
    const created = await engine.create(body);
    return await reply.code(201).send(created);
  });

  app.get("/v1/items/:id", async (request, reply) => {
    const id = String((request.params as Record<string, unknown>).id ?? "");
    try {
      return await engine.get(id);
    } catch {
      return await reply.code(404).send({ error: "Not found" });
    }
  });

  app.put("/v1/items/:id", async (request, reply) => {
    const id = String((request.params as Record<string, unknown>).id ?? "");
    try {
      return await engine.update(id, jsonBody(request.body) as unknown as UpdateTemporalItemInput);
    } catch {
      return await reply.code(404).send({ error: "Not found" });
    }
  });

  app.delete("/v1/items/:id", async (request, reply) => {
    const id = String((request.params as Record<string, unknown>).id ?? "");
    try {
      return await engine.delete(id);
    } catch {
      return await reply.code(404).send({ error: "Not found" });
    }
  });

  app.post("/v1/items/:id/pause", async (request, reply) => {
    const id = String((request.params as Record<string, unknown>).id ?? "");
    try {
      return await engine.pause(id);
    } catch {
      return await reply.code(404).send({ error: "Not found" });
    }
  });

  app.post("/v1/items/:id/resume", async (request, reply) => {
    const id = String((request.params as Record<string, unknown>).id ?? "");
    try {
      return await engine.resume(id);
    } catch {
      return await reply.code(404).send({ error: "Not found" });
    }
  });

  app.post("/v1/items/:id/run", async (request, reply) => {
    const id = String((request.params as Record<string, unknown>).id ?? "");
    try {
      return await engine.runNow(id);
    } catch {
      return await reply.code(404).send({ error: "Not found" });
    }
  });

  app.get("/v1/executions", async (request) => {
    const query = request.query as Record<string, string | undefined>;
    return await engine.listExecutions(query.itemId);
  });

  app.get("/v1/run-log", async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const limit = query.limit ? Number(query.limit) : undefined;
    return await engine.listRunLog(query.itemId, limit);
  });

  app.get("/v1/views/calendar", async (request) => engine.calendarView(request.query as { start?: string; end?: string }));

  app.get("/v1/views/timeline", async (request) => engine.timelineView(request.query as { start?: string; end?: string }));

  app.post("/v1/signals", async (request) => engine.signalAnchor(jsonBody(request.body) as { anchorId: string; signal: "reply_received" | "task_completed" | "event_started" | "execution_succeeded" }));

  app.post("/v1/scheduler/run", async () => ({ executions: await engine.runSchedulerCycle() }));

  app.get("/v1/legacy/events", async () => engine.legacyEvents());

  app.get("/v1/legacy/routines", async () => engine.legacyRoutines());

  return {
    app,
    store,
    engine,
    config,
    startScheduler() {
      engine.startScheduler();
    },
  };
}
