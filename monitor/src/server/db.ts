import Database from "better-sqlite3";
import { MONITOR_STORE_SCHEMA_SQL } from "./surface.ts";

import type {
  Heartbeat,
  Incident,
  LocalInstanceSnapshot,
  MetricQuality,
  MetricRollup,
  MetricSample,
  MetricSource,
  MetricValueType,
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

function splitMetricValue(value: number | string | boolean | null): {
  valueType: MetricValueType;
  valueNumber: number | null;
  valueText: string | null;
  valueBool: number | null;
} {
  if (typeof value === "number") return { valueType: "number", valueNumber: value, valueText: null, valueBool: null };
  if (typeof value === "boolean") return { valueType: "boolean", valueNumber: null, valueText: null, valueBool: value ? 1 : 0 };
  return { valueType: "string", valueNumber: null, valueText: value, valueBool: null };
}

function joinMetricValue(row: { value_type: string; value_number?: number | null; value_text?: string | null; value_bool?: number | null }): number | string | boolean | null {
  if (row.value_type === "number") return row.value_number ?? null;
  if (row.value_type === "boolean") return row.value_bool === null || row.value_bool === undefined ? null : row.value_bool === 1;
  return row.value_text ?? null;
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
    this.sqlite.exec(MONITOR_STORE_SCHEMA_SQL);
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
     Generic metric samples and rollups
     ------------------------------------------------------- */

  upsertMetricSource(input: {
    id: string;
    kind: MetricSource["kind"];
    adapter: string;
    hostId: string;
    metadata?: Record<string, unknown>;
  }): void {
    const timestamp = now();
    this.sqlite.prepare(`
      INSERT INTO metric_sources (id, kind, adapter, host_id, metadata, created_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        kind = excluded.kind,
        adapter = excluded.adapter,
        host_id = excluded.host_id,
        metadata = excluded.metadata,
        last_seen_at = excluded.last_seen_at
    `).run(input.id, input.kind, input.adapter, input.hostId, JSON.stringify(input.metadata ?? {}), timestamp, timestamp);
  }

  appendMetricSample(input: {
    sourceId: string;
    metricKey: string;
    value: number | string | boolean | null;
    unit: string;
    tags?: Record<string, string>;
    quality?: MetricQuality;
    capturedAt?: number;
  }): void {
    const value = splitMetricValue(input.value);
    this.sqlite.prepare(`
      INSERT INTO metric_samples (source_id, metric_key, value_type, value_number, value_text, value_bool, unit, tags, quality, captured_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.sourceId,
      input.metricKey,
      value.valueType,
      value.valueNumber,
      value.valueText,
      value.valueBool,
      input.unit,
      JSON.stringify(input.tags ?? {}),
      input.quality ?? "ok",
      input.capturedAt ?? now(),
    );
  }

  getMetricSamples(metricKey: string, input: { sinceMs?: number; limit?: number } = {}): MetricSample[] {
    const limit = input.limit ?? 300;
    const sinceMs = input.sinceMs ?? 0;
    const rows = this.sqlite.prepare(`
      SELECT * FROM metric_samples
      WHERE metric_key = ? AND captured_at >= ?
      ORDER BY captured_at DESC
      LIMIT ?
    `).all(metricKey, sinceMs, limit) as Array<{
      id: number;
      source_id: string;
      metric_key: string;
      value_type: string;
      value_number: number | null;
      value_text: string | null;
      value_bool: number | null;
      unit: string;
      tags: string;
      quality: string;
      captured_at: number;
    }>;
    return rows.map((r) => ({
      id: r.id,
      sourceId: r.source_id,
      metricKey: r.metric_key,
      valueType: r.value_type as MetricValueType,
      value: joinMetricValue(r),
      unit: r.unit,
      tags: JSON.parse(r.tags) as Record<string, string>,
      quality: r.quality as MetricQuality,
      capturedAt: r.captured_at,
    })).reverse();
  }

  upsertMetricRollup(input: {
    sourceId: string;
    metricKey: string;
    bucketMs: number;
    bucketStartAt: number;
    count: number;
    minValue?: number | null;
    maxValue?: number | null;
    avgValue?: number | null;
    lastValue: number | string | boolean | null;
    unit: string;
    tags?: Record<string, string>;
  }): void {
    const value = splitMetricValue(input.lastValue);
    const tags = JSON.stringify(input.tags ?? {});
    this.sqlite.prepare(`
      INSERT INTO metric_rollups (
        source_id, metric_key, bucket_ms, bucket_start_at, count,
        min_value, max_value, avg_value,
        last_value_type, last_value_number, last_value_text, last_value_bool,
        unit, tags
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_id, metric_key, bucket_ms, bucket_start_at, tags) DO UPDATE SET
        count = excluded.count,
        min_value = excluded.min_value,
        max_value = excluded.max_value,
        avg_value = excluded.avg_value,
        last_value_type = excluded.last_value_type,
        last_value_number = excluded.last_value_number,
        last_value_text = excluded.last_value_text,
        last_value_bool = excluded.last_value_bool,
        unit = excluded.unit
    `).run(
      input.sourceId,
      input.metricKey,
      input.bucketMs,
      input.bucketStartAt,
      input.count,
      input.minValue ?? null,
      input.maxValue ?? null,
      input.avgValue ?? null,
      value.valueType,
      value.valueNumber,
      value.valueText,
      value.valueBool,
      input.unit,
      tags,
    );
  }

  getMetricRollups(metricKey: string, input: { bucketMs: number; sinceMs?: number; limit?: number }): MetricRollup[] {
    const rows = this.sqlite.prepare(`
      SELECT * FROM metric_rollups
      WHERE metric_key = ? AND bucket_ms = ? AND bucket_start_at >= ?
      ORDER BY bucket_start_at DESC
      LIMIT ?
    `).all(metricKey, input.bucketMs, input.sinceMs ?? 0, input.limit ?? 300) as Array<{
      id: number;
      source_id: string;
      metric_key: string;
      bucket_ms: number;
      bucket_start_at: number;
      count: number;
      min_value: number | null;
      max_value: number | null;
      avg_value: number | null;
      last_value_type: string;
      last_value_number: number | null;
      last_value_text: string | null;
      last_value_bool: number | null;
      unit: string;
      tags: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      sourceId: r.source_id,
      metricKey: r.metric_key,
      bucketMs: r.bucket_ms,
      bucketStartAt: r.bucket_start_at,
      count: r.count,
      minValue: r.min_value,
      maxValue: r.max_value,
      avgValue: r.avg_value,
      lastValue: joinMetricValue({
        value_type: r.last_value_type,
        value_number: r.last_value_number,
        value_text: r.last_value_text,
        value_bool: r.last_value_bool,
      }),
      unit: r.unit,
      tags: JSON.parse(r.tags) as Record<string, string>,
    })).reverse();
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
    this.sqlite.prepare("DELETE FROM metric_samples WHERE captured_at < ?").run(cutoff);
    this.sqlite.prepare("DELETE FROM metric_rollups WHERE bucket_start_at < ?").run(cutoff);
    return result.changes;
  }
}
