import { clawApiPath } from "@clawjs/core";
import fs from "node:fs";

import cors from "@fastify/cors";
import Fastify, { type FastifyReply } from "fastify";

import { DelegationPlaneDatabase } from "./db.ts";
import { loadDelegationPlaneConfig, type DelegationPlaneConfig } from "./config.ts";
import { DelegationScheduler } from "./scheduler.ts";
import type { DelegationPolicy, DependencyKind, RunLog } from "../shared/types.ts";
import { semanticPlanSchema } from "../../../packages/clawjs-core/src/semantic.ts";

export interface BuildDelegationPlaneAppOptions {
  config?: Partial<DelegationPlaneConfig>;
}

function bodyRecord(body: unknown): Record<string, unknown> {
  return (body ?? {}) as Record<string, unknown>;
}

function parseSemanticPlan(value: unknown) {
  return value === undefined ? null : semanticPlanSchema.parse(value);
}

async function sendError(reply: FastifyReply, error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : String(error);
  return await reply.code(status).send({ error: message });
}

export async function buildDelegationPlaneApp(options: BuildDelegationPlaneAppOptions = {}) {
  const config = loadDelegationPlaneConfig(options.config);
  fs.mkdirSync(config.dataDir, { recursive: true });
  const db = new DelegationPlaneDatabase(config.databaseFile);
  const scheduler = new DelegationScheduler(db);
  const app = Fastify({ logger: false });
  let interval: NodeJS.Timeout | null = null;

  await app.register(cors, { origin: true });

  app.addHook("onClose", async () => {
    if (interval) clearInterval(interval);
    db.close();
  });

  app.get(clawApiPath("health"), async () => ({
    ok: true,
    service: "delegation",
    host: config.host,
    port: config.port,
  }));

  app.post(clawApiPath("graphs"), async (request, reply) => {
    const body = bodyRecord(request.body);
    try {
      const objective = String(body.objective ?? "").trim();
      if (!objective) return await reply.code(400).send({ error: "objective is required" });
      const graph = db.createGraph({
        objective,
        creator: String(body.creator ?? "operator"),
        policy: body.policy as Partial<DelegationPolicy> | undefined,
        root: body.root && typeof body.root === "object" ? {
          ...(body.root as Record<string, unknown>),
          semanticPlan: parseSemanticPlan((body.root as Record<string, unknown>).semanticPlan),
        } : undefined,
        semanticPlan: parseSemanticPlan(body.semanticPlan),
      });
      return await reply.code(201).send({ graph, root: graph.rootNodeId ? db.getNode(graph.rootNodeId) : null });
    } catch (error) {
      return await sendError(reply, error);
    }
  });

  app.get(clawApiPath("graphs"), async () => ({ graphs: db.listGraphs() }));

  app.get(clawApiPath("graphs/:graphId"), async (request, reply) => {
    const graphId = String((request.params as Record<string, unknown>).graphId ?? "");
    try {
      return db.getTree(graphId);
    } catch (error) {
      return await sendError(reply, error, 404);
    }
  });

  app.post(clawApiPath("graphs/:graphId/cancel"), async (request, reply) => {
    const graphId = String((request.params as Record<string, unknown>).graphId ?? "");
    const graph = db.getGraph(graphId);
    if (!graph) return await reply.code(404).send({ error: "Graph not found" });
    for (const node of db.listNodes(graphId).filter((candidate) => !["succeeded", "failed", "cancelled"].includes(candidate.status))) {
      scheduler.cancelNode(node.id);
    }
    return { graph: db.updateGraphStatus(graphId, "cancelled") };
  });

  app.get(clawApiPath("nodes"), async (request) => {
    const query = request.query as Record<string, string | undefined>;
    return { nodes: db.listNodes(query.graphId) };
  });

  app.get(clawApiPath("nodes/:nodeId"), async (request, reply) => {
    const nodeId = String((request.params as Record<string, unknown>).nodeId ?? "");
    const node = db.getNode(nodeId);
    if (!node) return await reply.code(404).send({ error: "Node not found" });
    return { node };
  });

  app.post(clawApiPath("nodes/:nodeId/retry"), async (request, reply) => {
    const nodeId = String((request.params as Record<string, unknown>).nodeId ?? "");
    try {
      return { node: scheduler.retryNode(nodeId) };
    } catch (error) {
      return await sendError(reply, error, 404);
    }
  });

  app.post(clawApiPath("nodes/:nodeId/cancel"), async (request, reply) => {
    const nodeId = String((request.params as Record<string, unknown>).nodeId ?? "");
    try {
      return { node: scheduler.cancelNode(nodeId) };
    } catch (error) {
      return await sendError(reply, error, 404);
    }
  });

  app.post(clawApiPath("workers/register"), async (request, reply) => {
    const body = bodyRecord(request.body);
    const worker = db.registerWorker({
      workerId: typeof body.workerId === "string" ? body.workerId : undefined,
      adapter: typeof body.adapter === "string" ? body.adapter : "deterministic",
      label: typeof body.label === "string" ? body.label : undefined,
      capabilities: Array.isArray(body.capabilities) ? body.capabilities.map(String) : [],
      maxConcurrency: typeof body.maxConcurrency === "number" ? body.maxConcurrency : undefined,
    });
    return await reply.code(201).send({ worker });
  });

  app.get(clawApiPath("workers"), async () => ({ workers: db.listWorkers() }));

  app.post(clawApiPath("workers/:workerId/heartbeat"), async (request, reply) => {
    const workerId = String((request.params as Record<string, unknown>).workerId ?? "");
    const worker = db.getWorker(workerId);
    if (!worker) return await reply.code(404).send({ error: "Worker not found" });
    return { worker: db.markWorkerSeen(workerId) };
  });

  app.post(clawApiPath("workers/:workerId/claim"), async (request, reply) => {
    const workerId = String((request.params as Record<string, unknown>).workerId ?? "");
    try {
      return { claimed: scheduler.claim(workerId) };
    } catch (error) {
      return await sendError(reply, error);
    }
  });

  app.get(clawApiPath("runs"), async (request) => {
    const query = request.query as Record<string, string | undefined>;
    return { runs: db.listRuns(query.graphId) };
  });

  app.get(clawApiPath("runs/:runId/logs"), async (request, reply) => {
    const runId = String((request.params as Record<string, unknown>).runId ?? "");
    if (!db.getRun(runId)) return await reply.code(404).send({ error: "Run not found" });
    return { logs: db.listLogs(runId) };
  });

  app.post(clawApiPath("runs/:runId/heartbeat"), async (request, reply) => {
    const runId = String((request.params as Record<string, unknown>).runId ?? "");
    try {
      return { run: scheduler.heartbeatRun(runId) };
    } catch (error) {
      return await sendError(reply, error, 404);
    }
  });

  app.post(clawApiPath("runs/:runId/logs"), async (request, reply) => {
    const runId = String((request.params as Record<string, unknown>).runId ?? "");
    const body = bodyRecord(request.body);
    try {
      return {
        log: scheduler.appendLog(
          runId,
          (body.stream === "stdout" || body.stream === "stderr" || body.stream === "system" ? body.stream : "system") as RunLog["stream"],
          String(body.line ?? ""),
        ),
      };
    } catch (error) {
      return await sendError(reply, error, 404);
    }
  });

  app.post(clawApiPath("runs/:runId/children"), async (request, reply) => {
    const runId = String((request.params as Record<string, unknown>).runId ?? "");
    const body = bodyRecord(request.body);
    try {
      const title = String(body.title ?? "").trim();
      const objective = String(body.objective ?? "").trim();
      if (!title || !objective) return await reply.code(400).send({ error: "title and objective are required" });
      return {
        node: scheduler.createChild({
          runId,
          title,
          objective,
          agentType: typeof body.agentType === "string" ? body.agentType : undefined,
          adapter: typeof body.adapter === "string" ? body.adapter : undefined,
          dependencyKind: (body.dependencyKind === "informational" || body.dependencyKind === "fan_in" || body.dependencyKind === "blocks_parent" ? body.dependencyKind : "blocks_parent") as DependencyKind,
          optional: body.optional === true,
          priority: typeof body.priority === "number" ? body.priority : undefined,
          payload: body.payload && typeof body.payload === "object" ? body.payload as Record<string, unknown> : {},
          semanticPlan: parseSemanticPlan(body.semanticPlan),
        }),
      };
    } catch (error) {
      return await sendError(reply, error, 404);
    }
  });

  app.post(clawApiPath("runs/:runId/complete"), async (request, reply) => {
    const runId = String((request.params as Record<string, unknown>).runId ?? "");
    const body = bodyRecord(request.body);
    try {
      return { run: scheduler.completeRun(runId, body.output && typeof body.output === "object" ? body.output as Record<string, unknown> : {}) };
    } catch (error) {
      return await sendError(reply, error, 404);
    }
  });

  app.post(clawApiPath("runs/:runId/fail"), async (request, reply) => {
    const runId = String((request.params as Record<string, unknown>).runId ?? "");
    const body = bodyRecord(request.body);
    try {
      return {
        run: scheduler.failRun(runId, {
          errorMessage: String(body.errorMessage ?? "Run failed."),
          retryable: body.retryable !== false,
        }),
      };
    } catch (error) {
      return await sendError(reply, error, 404);
    }
  });

  app.post(clawApiPath("runs/:runId/block"), async (request, reply) => {
    const runId = String((request.params as Record<string, unknown>).runId ?? "");
    const body = bodyRecord(request.body);
    try {
      return { run: scheduler.blockRun(runId, String(body.reason ?? "Blocked.")) };
    } catch (error) {
      return await sendError(reply, error, 404);
    }
  });

  app.post(clawApiPath("scheduler/tick"), async () => scheduler.tick());

  return {
    app,
    db,
    scheduler,
    config,
    startScheduler() {
      if (interval) return;
      interval = setInterval(() => scheduler.tick(), config.schedulerIntervalMs);
      interval.unref();
    },
  };
}
