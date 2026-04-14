import Database from "better-sqlite3";

import type {
  Heartbeat,
  Incident,
  LocalInstanceSnapshot,
  Monitor,
  MonitorConfig as MonitorCheckConfig,
  MonitorGroup,
  MonitorStatus,
  MonitorType,
  MonitorWithLatest,
} from "../shared/types.ts";

function now(): number {
  return Date.now();
}

export class MonitorDatabase {
  readonly sqlite: Database.Database;

  constructor(filename: string) {
    this.sqlite = new Database(filename);
    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.pragma("foreign_keys = ON");
    this.init();
  }

  close(): void {
    this.sqlite.close();
  }

  private init(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS monitors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        group_name TEXT NOT NULL,
        type TEXT NOT NULL,
        config TEXT NOT NULL DEFAULT '{}',
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS heartbeats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        monitor_id TEXT NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        response_time_ms INTEGER,
        detail TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_heartbeats_monitor
        ON heartbeats(monitor_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS incidents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        monitor_id TEXT NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        resolved_at INTEGER,
        duration_ms INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_incidents_monitor
        ON incidents(monitor_id, started_at DESC);

      CREATE TABLE IF NOT EXISTS instances (
        id TEXT PRIMARY KEY,
        adapter TEXT NOT NULL,
        runtime_name TEXT NOT NULL,
        gateway_url TEXT NOT NULL,
        version TEXT,
        status TEXT NOT NULL DEFAULT 'stopped',
        config_path TEXT,
        capabilities TEXT NOT NULL DEFAULT '{}',
        discovered_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL
      );
    `);
  }

  /* -------------------------------------------------------
     Monitors CRUD
     ------------------------------------------------------- */

  upsertMonitor(input: {
    id: string;
    name: string;
    group: MonitorGroup;
    type: MonitorType;
    config: MonitorCheckConfig;
  }): void {
    this.sqlite.prepare(`
      INSERT INTO monitors (id, name, group_name, type, config, enabled, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        group_name = excluded.group_name,
        type = excluded.type,
        config = excluded.config
    `).run(input.id, input.name, input.group, input.type, JSON.stringify(input.config), now());
  }

  deleteMonitor(id: string): void {
    this.sqlite.prepare("DELETE FROM monitors WHERE id = ?").run(id);
  }

  listMonitors(): Monitor[] {
    const rows = this.sqlite.prepare("SELECT * FROM monitors ORDER BY group_name, name").all() as Array<{
      id: string;
      name: string;
      group_name: string;
      type: string;
      config: string;
      enabled: number;
      created_at: number;
    }>;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      group: r.group_name as MonitorGroup,
      type: r.type as MonitorType,
      config: JSON.parse(r.config) as MonitorCheckConfig,
      enabled: r.enabled === 1,
      createdAt: r.created_at,
    }));
  }

  getMonitor(id: string): Monitor | null {
    const row = this.sqlite.prepare("SELECT * FROM monitors WHERE id = ?").get(id) as {
      id: string;
      name: string;
      group_name: string;
      type: string;
      config: string;
      enabled: number;
      created_at: number;
    } | undefined;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      group: row.group_name as MonitorGroup,
      type: row.type as MonitorType,
      config: JSON.parse(row.config) as MonitorCheckConfig,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
    };
  }

  /* -------------------------------------------------------
     Instances (local discovery)
     ------------------------------------------------------- */

  upsertInstance(instance: LocalInstanceSnapshot): void {
    this.sqlite.prepare(`
      INSERT INTO instances (id, adapter, runtime_name, gateway_url, version, status, config_path, capabilities, discovered_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        adapter = excluded.adapter,
        runtime_name = excluded.runtime_name,
        gateway_url = excluded.gateway_url,
        version = excluded.version,
        status = excluded.status,
        config_path = excluded.config_path,
        capabilities = excluded.capabilities,
        last_seen_at = excluded.last_seen_at
    `).run(
      instance.id,
      instance.adapter,
      instance.runtimeName,
      instance.gatewayUrl,
      instance.version,
      instance.status,
      instance.configPath,
      JSON.stringify(instance.capabilities),
      instance.discoveredAt,
      instance.lastSeenAt,
    );
  }

  listInstances(): LocalInstanceSnapshot[] {
    const rows = this.sqlite.prepare("SELECT * FROM instances ORDER BY runtime_name").all() as Array<{
      id: string;
      adapter: string;
      runtime_name: string;
      gateway_url: string;
      version: string | null;
      status: string;
      config_path: string | null;
      capabilities: string;
      discovered_at: number;
      last_seen_at: number;
    }>;
    return rows.map((r) => ({
      id: r.id,
      adapter: r.adapter,
      runtimeName: r.runtime_name,
      gatewayUrl: r.gateway_url,
      version: r.version,
      status: r.status as LocalInstanceSnapshot["status"],
      configPath: r.config_path,
      capabilities: JSON.parse(r.capabilities) as Record<string, boolean>,
      discoveredAt: r.discovered_at,
      lastSeenAt: r.last_seen_at,
    }));
  }

  getInstance(id: string): LocalInstanceSnapshot | null {
    const row = this.sqlite.prepare("SELECT * FROM instances WHERE id = ?").get(id) as {
      id: string;
      adapter: string;
      runtime_name: string;
      gateway_url: string;
      version: string | null;
      status: string;
      config_path: string | null;
      capabilities: string;
      discovered_at: number;
      last_seen_at: number;
    } | undefined;
    if (!row) return null;
    return {
      id: row.id,
      adapter: row.adapter,
      runtimeName: row.runtime_name,
      gatewayUrl: row.gateway_url,
      version: row.version,
      status: row.status as LocalInstanceSnapshot["status"],
      configPath: row.config_path,
      capabilities: JSON.parse(row.capabilities) as Record<string, boolean>,
      discoveredAt: row.discovered_at,
      lastSeenAt: row.last_seen_at,
    };
  }

  markInstanceOffline(id: string): void {
    this.sqlite.prepare("UPDATE instances SET status = 'unreachable' WHERE id = ?").run(id);
  }

  /* -------------------------------------------------------
     Heartbeats
     ------------------------------------------------------- */

  appendHeartbeat(monitorId: string, status: MonitorStatus, responseTimeMs: number | null, detail?: string): void {
    this.sqlite.prepare(`
      INSERT INTO heartbeats (monitor_id, status, response_time_ms, detail, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(monitorId, status, responseTimeMs, detail ?? null, now());

    this.handleIncident(monitorId, status);
  }

  getHeartbeats(monitorId: string, limit = 90): Heartbeat[] {
    const rows = this.sqlite.prepare(`
      SELECT * FROM heartbeats
      WHERE monitor_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(monitorId, limit) as Array<{
      id: number;
      monitor_id: string;
      status: string;
      response_time_ms: number | null;
      detail: string | null;
      created_at: number;
    }>;
    return rows.map((r) => ({
      id: r.id,
      monitorId: r.monitor_id,
      status: r.status as MonitorStatus,
      responseTimeMs: r.response_time_ms,
      detail: r.detail,
      createdAt: r.created_at,
    })).reverse(); // oldest first for chart rendering
  }

  getUptimePercent(monitorId: string, sinceMs: number): number {
    const total = this.sqlite.prepare(`
      SELECT COUNT(*) as cnt FROM heartbeats
      WHERE monitor_id = ? AND created_at >= ?
    `).get(monitorId, sinceMs) as { cnt: number };
    if (total.cnt === 0) return 100;

    const up = this.sqlite.prepare(`
      SELECT COUNT(*) as cnt FROM heartbeats
      WHERE monitor_id = ? AND created_at >= ? AND status = 'up'
    `).get(monitorId, sinceMs) as { cnt: number };

    return Math.round((up.cnt / total.cnt) * 10000) / 100;
  }

  getAvgResponseTime(sinceMs: number): number {
    // Only consider HTTP monitors for avg response time (usage monitors
    // store metric values in response_time_ms which would skew the average).
    const httpIds = this.sqlite.prepare(
      "SELECT id FROM monitors WHERE type = 'http'",
    ).all() as Array<{ id: string }>;
    if (httpIds.length === 0) return 0;
    const placeholders = httpIds.map(() => "?").join(",");
    const row = this.sqlite.prepare(`
      SELECT AVG(response_time_ms) as avg_ms FROM heartbeats
      WHERE created_at >= ? AND response_time_ms IS NOT NULL
        AND monitor_id IN (${placeholders})
    `).get(sinceMs, ...httpIds.map((r) => r.id)) as { avg_ms: number | null };
    return Math.round(row.avg_ms ?? 0);
  }

  /* -------------------------------------------------------
     Incidents
     ------------------------------------------------------- */

  private handleIncident(monitorId: string, newStatus: MonitorStatus): void {
    const lastHeartbeat = this.sqlite.prepare(`
      SELECT status FROM heartbeats
      WHERE monitor_id = ? AND id != (SELECT MAX(id) FROM heartbeats WHERE monitor_id = ?)
      ORDER BY created_at DESC LIMIT 1
    `).get(monitorId, monitorId) as { status: string } | undefined;

    const prevStatus = (lastHeartbeat?.status ?? "up") as MonitorStatus;
    if (prevStatus === newStatus) return;

    const timestamp = now();

    // If transitioning to a bad state, open incident
    if (newStatus === "down" || newStatus === "degraded") {
      this.sqlite.prepare(`
        INSERT INTO incidents (monitor_id, status, started_at)
        VALUES (?, ?, ?)
      `).run(monitorId, newStatus, timestamp);
    }

    // If transitioning back to up, resolve open incidents
    if (newStatus === "up") {
      const open = this.sqlite.prepare(`
        SELECT id, started_at FROM incidents
        WHERE monitor_id = ? AND resolved_at IS NULL
        ORDER BY started_at DESC
      `).all(monitorId) as Array<{ id: number; started_at: number }>;

      for (const incident of open) {
        const duration = timestamp - incident.started_at;
        this.sqlite.prepare(`
          UPDATE incidents SET resolved_at = ?, duration_ms = ?
          WHERE id = ?
        `).run(timestamp, duration, incident.id);
      }
    }
  }

  getIncidents(monitorId: string, limit = 20): Incident[] {
    const rows = this.sqlite.prepare(`
      SELECT * FROM incidents
      WHERE monitor_id = ?
      ORDER BY started_at DESC
      LIMIT ?
    `).all(monitorId, limit) as Array<{
      id: number;
      monitor_id: string;
      status: string;
      started_at: number;
      resolved_at: number | null;
      duration_ms: number | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      monitorId: r.monitor_id,
      status: r.status as MonitorStatus,
      startedAt: r.started_at,
      resolvedAt: r.resolved_at,
      durationMs: r.duration_ms,
    }));
  }

  /* -------------------------------------------------------
     Aggregation
     ------------------------------------------------------- */

  listMonitorsWithLatest(heartbeatCount = 45): MonitorWithLatest[] {
    const monitors = this.listMonitors();
    const since24h = now() - 86_400_000;

    return monitors.map((m) => {
      const heartbeats = this.getHeartbeats(m.id, heartbeatCount);
      const latest = heartbeats.length > 0 ? heartbeats[heartbeats.length - 1] : null;
      return {
        ...m,
        latestStatus: latest?.status ?? "pending",
        latestResponseTimeMs: latest?.responseTimeMs ?? null,
        latestCheckedAt: latest?.createdAt ?? null,
        uptimePercent24h: this.getUptimePercent(m.id, since24h),
        heartbeats,
      };
    });
  }

  /* -------------------------------------------------------
     Retention
     ------------------------------------------------------- */

  purgeOldHeartbeats(olderThanMs: number): number {
    const cutoff = now() - olderThanMs;
    const result = this.sqlite.prepare("DELETE FROM heartbeats WHERE created_at < ?").run(cutoff);
    this.sqlite.prepare("DELETE FROM incidents WHERE resolved_at IS NOT NULL AND resolved_at < ?").run(cutoff);
    return result.changes;
  }
}
