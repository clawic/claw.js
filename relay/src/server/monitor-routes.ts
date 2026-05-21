import {
  clawApiPath,
  clawDefaultStreamingBackpressurePolicy,
  estimateUtf8Bytes,
  splitStreamingTextDelta,
} from "@clawjs/core";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";

import { RelayAuthService } from "./auth.ts";
import { RelayDatabase } from "./db.ts";
import { MonitorBus } from "./monitor-bus.ts";
import { authorizeTenant, requireClaims } from "./app-helpers.ts";

const monitorStreamPolicy = clawDefaultStreamingBackpressurePolicy;

interface MonitorStreamMetrics {
  queuedFrames: number;
  queuedBytes: number;
  droppedFrames: number;
  droppedBytes: number;
  overflowCount: number;
  closedSlowConsumers: number;
}

interface MonitorStreamFrame {
  frame: string;
  frameBytes: number;
}

export function encodeMonitorEvent(event: string, payload: Record<string, unknown>): MonitorStreamFrame {
  const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  return { frame, frameBytes: estimateUtf8Bytes(frame) };
}

export function splitMonitorPayload(event: string, payload: Record<string, unknown>): MonitorStreamFrame[] {
  const encoded = encodeMonitorEvent(event, payload);
  if (encoded.frameBytes <= monitorStreamPolicy.maxFrameBytes) return [encoded];
  if (event !== "monitor.session.delta" || typeof payload.delta !== "string") {
    return [encodeMonitorEvent("monitor.overflow", {
      originalEvent: event,
      frameBytes: encoded.frameBytes,
      maxFrameBytes: monitorStreamPolicy.maxFrameBytes,
      reason: "frame_too_large",
      ts: Date.now(),
    })];
  }
  const withoutDelta = encodeMonitorEvent(event, { ...payload, delta: "" });
  const maxDeltaBytes = Math.max(1, monitorStreamPolicy.maxFrameBytes - withoutDelta.frameBytes - 8);
  return splitStreamingTextDelta(payload.delta, maxDeltaBytes).map((delta) => (
    encodeMonitorEvent(event, { ...payload, delta })
  ));
}

export function registerMonitorRoutes(input: {
  app: FastifyInstance;
  auth: RelayAuthService;
  db: RelayDatabase;
  monitor: MonitorBus;
}): void {
  const { app, auth, db, monitor } = input;

  /* -------------------------------------------------------
     Monitor consolidated status endpoint.
     Designed to be polled by the standalone monitor service.
     No auth required (intended for same-network access).
     ------------------------------------------------------- */
  app.get(clawApiPath("monitor/status"), async () => {
    const tenants = db.sqlite.prepare("SELECT id FROM tenants").all() as Array<{ id: string }>;

    const allConnectors: Array<{
      id: string;
      agentId: string;
      displayName: string;
      status: "online" | "offline";
      lastSeenAt: number | null;
      version: string | null;
    }> = [];

    const allAgents: Array<{
      id: string;
      tenantId: string;
      displayName: string;
      workspaces: Array<{ id: string; displayName: string; status: string }>;
    }> = [];

    let sessionsLast24h = 0;
    let tokensInLast24h = 0;
    let tokensOutLast24h = 0;
    let errorsLast24h = 0;
    let estimatedCostLast24h = 0;
    const since24h = Date.now() - 86_400_000;

    for (const tenant of tenants) {
      // Connectors
      const connectors = db.sqlite.prepare(`
        SELECT id, agent_id, display_name, status, last_seen_at
        FROM connectors WHERE tenant_id = ?
      `).all(tenant.id) as Array<{
        id: string; agent_id: string; display_name: string;
        status: string; last_seen_at: number | null;
      }>;

      for (const c of connectors) {
        // Get version from latest connector session
        const session = db.sqlite.prepare(`
          SELECT version FROM connector_sessions
          WHERE tenant_id = ? AND agent_id = ?
          ORDER BY last_seen_at DESC LIMIT 1
        `).get(tenant.id, c.agent_id) as { version: string | null } | undefined;

        allConnectors.push({
          id: c.id,
          agentId: c.agent_id,
          displayName: c.display_name,
          status: c.status === "online" ? "online" : "offline",
          lastSeenAt: c.last_seen_at,
          version: session?.version ?? null,
        });
      }

      // Agents + workspaces
      const agents = db.listAgents(tenant.id);
      for (const agent of agents) {
        const workspaces = db.listWorkspaces(tenant.id, agent.agentId);
        allAgents.push({
          id: agent.agentId,
          tenantId: tenant.id,
          displayName: agent.displayName,
          workspaces: workspaces.map((ws) => ({
            id: ws.workspaceId,
            displayName: ws.displayName,
            status: agent.status === "online" ? "active" : "idle",
          })),
        });
      }

      // Usage aggregates
      const usageRows = db.sqlite.prepare(`
        SELECT COALESCE(SUM(tokens_in), 0) as tin,
               COALESCE(SUM(tokens_out), 0) as tout,
               COALESCE(SUM(estimated_cost_usd), 0) as cost,
               COUNT(*) as cnt
        FROM usage_records
        WHERE tenant_id = ? AND created_at >= ?
      `).get(tenant.id, since24h) as { tin: number; tout: number; cost: number; cnt: number };

      tokensInLast24h += usageRows.tin;
      tokensOutLast24h += usageRows.tout;
      estimatedCostLast24h += usageRows.cost;
      sessionsLast24h += usageRows.cnt;

      // Error count
      const errorRow = db.sqlite.prepare(`
        SELECT COUNT(*) as cnt FROM activity_events
        WHERE tenant_id = ? AND status = 'error' AND created_at >= ?
      `).get(tenant.id, since24h) as { cnt: number };
      errorsLast24h += errorRow.cnt;
    }

    return {
      relay: {
        status: "up" as const,
        uptimeSeconds: Math.round(process.uptime()),
        version: "0.1.0",
      },
      connectors: allConnectors,
      agents: allAgents,
      usage: {
        sessionsLast24h,
        tokensInLast24h,
        tokensOutLast24h,
        errorsLast24h,
        estimatedCostLast24h: Math.round(estimatedCostLast24h * 100) / 100,
      },
    };
  });

  /* -------------------------------------------------------
     Tenant-scoped monitor firehose. One SSE per browser tab.
     Read-only: never invokes any agent operation.
     ------------------------------------------------------- */
  const buildMonitorSnapshot = (tenantId: string, clientId: string, openedSessionId?: string) => {
    const agents = db.listAgents(tenantId).map((a) => ({
      agentId: a.agentId,
      displayName: a.displayName,
      status: a.status,
      version: a.version,
      capabilities: a.capabilities,
      lastSeenAt: a.lastSeenAt,
    }));
    const activity = db.listActivity(tenantId).slice(0, 30);
    const attachedClients = monitor.listClients(tenantId);
    return {
      tenantId,
      clientId,
      agents,
      activity,
      attachedClients,
      openedSessionId: openedSessionId ?? null,
      ts: Date.now(),
    };
  };

  app.get(clawApiPath("tenants/:tenantId/monitor/stream"), async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "monitor:read");
    if (!claims) return;
    const params = request.params as { tenantId: string };
    try {
      authorizeTenant(claims, params.tenantId);
    } catch (error) {
      await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
      return;
    }
    if (monitor.listenerCount(params.tenantId) >= 8) {
      await reply.code(429).header("Retry-After", "30").send({ error: "too_many_monitors" });
      return;
    }
    const query = request.query as { openedSessionId?: string; clientId?: string };
    const clientId = typeof query.clientId === "string" && query.clientId
      ? query.clientId
      : randomUUID();
    const openedSessionId = typeof query.openedSessionId === "string" && query.openedSessionId
      ? query.openedSessionId
      : undefined;

    reply.hijack();
    reply.raw.statusCode = 200;
    reply.raw.setHeader("content-type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("cache-control", "no-cache, no-transform");
    reply.raw.setHeader("connection", "keep-alive");

    const queue: MonitorStreamFrame[] = [];
    const metrics: MonitorStreamMetrics = {
      queuedFrames: 0,
      queuedBytes: 0,
      droppedFrames: 0,
      droppedBytes: 0,
      overflowCount: 0,
      closedSlowConsumers: 0,
    };
    let writing = false;
    let closed = false;
    let unsubscribe: () => void = () => {};
    let refreshTimer: ReturnType<typeof setInterval> | undefined;

    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (refreshTimer) clearInterval(refreshTimer);
      unsubscribe();
      monitor.detachClient(params.tenantId, clientId);
      if (!reply.raw.destroyed) reply.raw.end();
    };

    const closeForOverflow = (frame: MonitorStreamFrame) => {
      metrics.overflowCount += 1;
      metrics.droppedFrames += queue.length + 1;
      metrics.droppedBytes += metrics.queuedBytes + frame.frameBytes;
      metrics.closedSlowConsumers += 1;
      if (!reply.raw.destroyed) {
        const overflow = encodeMonitorEvent("monitor.overflow", {
          reason: "slow_consumer_overflow",
          metrics,
          policyId: monitorStreamPolicy.id,
          ts: Date.now(),
        });
        reply.raw.write(overflow.frame);
      }
      cleanup();
    };

    const pump = () => {
      if (closed || writing || reply.raw.destroyed) return;
      writing = true;
      while (queue.length > 0 && !reply.raw.destroyed) {
        const next = queue.shift()!;
        metrics.queuedBytes -= next.frameBytes;
        metrics.queuedFrames = queue.length;
        if (!reply.raw.write(next.frame)) {
          reply.raw.once("drain", () => {
            writing = false;
            pump();
          });
          return;
        }
      }
      writing = false;
    };

    const writeEvent = (event: string, payload: Record<string, unknown>) => {
      if (closed || reply.raw.destroyed) return;
      for (const frame of splitMonitorPayload(event, payload)) {
        const nextFrames = queue.length + 1;
        const nextBytes = metrics.queuedBytes + frame.frameBytes;
        if (
          nextFrames > monitorStreamPolicy.maxQueuedFrames ||
          nextBytes > monitorStreamPolicy.maxQueuedBytes
        ) {
          closeForOverflow(frame);
          return;
        }
        queue.push(frame);
        metrics.queuedFrames = queue.length;
        metrics.queuedBytes = nextBytes;
      }
      pump();
    };

    writeEvent("monitor.snapshot", buildMonitorSnapshot(params.tenantId, clientId, openedSessionId));

    unsubscribe = monitor.subscribe(params.tenantId, (envelope) => {
      writeEvent(envelope.event, { ...envelope.payload, ts: envelope.ts });
    });

    monitor.attachClient(params.tenantId, {
      clientId,
      attachedAt: Date.now(),
      ...(openedSessionId ? { openedSessionId } : {}),
    });

    refreshTimer = setInterval(() => {
      writeEvent("monitor.snapshot", buildMonitorSnapshot(params.tenantId, clientId, openedSessionId));
    }, 15_000);

    request.raw.on("close", cleanup);
    request.raw.on("error", cleanup);
  });
}
