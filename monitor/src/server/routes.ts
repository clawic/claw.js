import type { FastifyInstance } from "fastify";
import type { MonitorDatabase } from "./db.ts";
import type { HeartbeatCollector } from "./collector.ts";
import type { LocalCollector } from "./local-collector.ts";
import type { MonitorConfig } from "./config.ts";
import type { MonitorGroup, MonitorModeSnapshot, MonitorSummary, MonitorType, MonitorConfig as MonitorCheckConfig } from "../shared/types.ts";

export function registerRoutes(
  app: FastifyInstance,
  db: MonitorDatabase,
  config: MonitorConfig,
  relayCollector: HeartbeatCollector | null,
  localCollector: LocalCollector | null,
): void {

  /* -------------------------------------------------------
     GET /api/config - monitor mode snapshot
     ------------------------------------------------------- */
  app.get("/api/config", async () => {
    const modeSnapshot: MonitorModeSnapshot = {
      mode: config.mode,
      relayUrl: config.mode !== "local" ? config.relayUrl : null,
      localInstanceCount: db.listInstances().length,
    };
    return modeSnapshot;
  });

  /* -------------------------------------------------------
     GET /api/summary
     ------------------------------------------------------- */
  app.get("/api/summary", async () => {
    const monitors = db.listMonitorsWithLatest(1);
    const since24h = Date.now() - 86_400_000;

    const summary: MonitorSummary = {
      total: monitors.length,
      up: monitors.filter((m) => m.latestStatus === "up").length,
      down: monitors.filter((m) => m.latestStatus === "down").length,
      degraded: monitors.filter((m) => m.latestStatus === "degraded").length,
      pending: monitors.filter((m) => m.latestStatus === "pending").length,
      overallUptimePercent: 0,
      avgResponseTimeMs: db.getAvgResponseTime(since24h),
    };

    if (monitors.length > 0) {
      const totalUptime = monitors.reduce((sum, m) => sum + m.uptimePercent24h, 0);
      summary.overallUptimePercent = Math.round((totalUptime / monitors.length) * 100) / 100;
    }

    return summary;
  });

  /* -------------------------------------------------------
     GET /api/monitors
     ------------------------------------------------------- */
  app.get("/api/monitors", async () => {
    return db.listMonitorsWithLatest(45);
  });

  /* -------------------------------------------------------
     GET /api/monitors/:id
     ------------------------------------------------------- */
  app.get<{ Params: { id: string } }>("/api/monitors/:id", async (request, reply) => {
    const monitor = db.getMonitor(request.params.id);
    if (!monitor) {
      return reply.code(404).send({ error: "Monitor not found" });
    }
    const heartbeats = db.getHeartbeats(monitor.id, 90);
    const incidents = db.getIncidents(monitor.id, 20);
    const since24h = Date.now() - 86_400_000;
    const uptimePercent24h = db.getUptimePercent(monitor.id, since24h);
    const latest = heartbeats.length > 0 ? heartbeats[heartbeats.length - 1] : null;

    return {
      ...monitor,
      latestStatus: latest?.status ?? "pending",
      latestResponseTimeMs: latest?.responseTimeMs ?? null,
      latestCheckedAt: latest?.createdAt ?? null,
      uptimePercent24h,
      heartbeats,
      incidents,
    };
  });

  /* -------------------------------------------------------
     GET /api/monitors/:id/heartbeats
     ------------------------------------------------------- */
  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    "/api/monitors/:id/heartbeats",
    async (request, reply) => {
      const monitor = db.getMonitor(request.params.id);
      if (!monitor) {
        return reply.code(404).send({ error: "Monitor not found" });
      }
      const limit = Math.min(Number(request.query.limit ?? "200"), 1000);
      return db.getHeartbeats(monitor.id, limit);
    },
  );

  /* -------------------------------------------------------
     POST /api/monitors
     ------------------------------------------------------- */
  app.post<{
    Body: {
      id: string;
      name: string;
      group: MonitorGroup;
      type: MonitorType;
      config: MonitorCheckConfig;
    };
  }>("/api/monitors", async (request) => {
    const { id, name, group, type, config: monitorConfig } = request.body;
    db.upsertMonitor({ id, name, group, type, config: monitorConfig });
    return { ok: true, id };
  });

  /* -------------------------------------------------------
     PUT /api/monitors/:id
     ------------------------------------------------------- */
  app.put<{
    Params: { id: string };
    Body: {
      name?: string;
      group?: MonitorGroup;
      type?: MonitorType;
      config?: MonitorCheckConfig;
      enabled?: boolean;
    };
  }>("/api/monitors/:id", async (request, reply) => {
    const existing = db.getMonitor(request.params.id);
    if (!existing) {
      return reply.code(404).send({ error: "Monitor not found" });
    }
    const body = request.body;
    db.upsertMonitor({
      id: existing.id,
      name: body.name ?? existing.name,
      group: body.group ?? existing.group,
      type: body.type ?? existing.type,
      config: body.config ?? existing.config,
    });
    if (body.enabled !== undefined) {
      db.sqlite.prepare("UPDATE monitors SET enabled = ? WHERE id = ?").run(body.enabled ? 1 : 0, existing.id);
    }
    return { ok: true };
  });

  /* -------------------------------------------------------
     DELETE /api/monitors/:id
     ------------------------------------------------------- */
  app.delete<{ Params: { id: string } }>("/api/monitors/:id", async (request) => {
    db.deleteMonitor(request.params.id);
    return { ok: true };
  });

  /* -------------------------------------------------------
     POST /api/setup - Auto-discover monitors (relay + local)
     ------------------------------------------------------- */
  app.post("/api/setup", async () => {
    const results: { relay?: { created: number; monitors: string[] }; local?: { created: number; monitors: string[] } } = {};

    if (relayCollector) {
      results.relay = await relayCollector.discover();
    }
    if (localCollector) {
      results.local = await localCollector.discover();
    }

    const totalCreated = (results.relay?.created ?? 0) + (results.local?.created ?? 0);
    const allMonitors = [...(results.relay?.monitors ?? []), ...(results.local?.monitors ?? [])];
    return { created: totalCreated, monitors: allMonitors, ...results };
  });

  /* -------------------------------------------------------
     GET /api/instances - list discovered local instances
     ------------------------------------------------------- */
  app.get("/api/instances", async () => {
    return db.listInstances();
  });

  /* -------------------------------------------------------
     GET /api/instances/:id - instance detail
     ------------------------------------------------------- */
  app.get<{ Params: { id: string } }>("/api/instances/:id", async (request, reply) => {
    const instance = db.getInstance(request.params.id);
    if (!instance) {
      return reply.code(404).send({ error: "Instance not found" });
    }

    // Also return heartbeats from the associated monitor
    const monitorId = `instance:${instance.id}`;
    const heartbeats = db.getHeartbeats(monitorId, 90);
    const incidents = db.getIncidents(monitorId, 20);
    const since24h = Date.now() - 86_400_000;
    const uptimePercent24h = db.getUptimePercent(monitorId, since24h);

    return {
      ...instance,
      heartbeats,
      incidents,
      uptimePercent24h,
    };
  });

  /* -------------------------------------------------------
     POST /api/discover/local - force local re-discovery
     ------------------------------------------------------- */
  app.post("/api/discover/local", async (_request, reply) => {
    if (!localCollector) {
      return reply.code(400).send({ error: "Local discovery is not enabled (mode is relay-only)" });
    }
    return localCollector.discover();
  });
}
