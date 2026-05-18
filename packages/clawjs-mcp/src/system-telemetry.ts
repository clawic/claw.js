import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import {
  listSystemTelemetryMetrics,
  listSystemTelemetryWidgets,
  resolveClawPersistentSurfacePath,
  type SystemTelemetryMetricSample,
  type SystemTelemetrySnapshot,
} from "@clawjs/core";

type MetricValueType = "number" | "string" | "boolean";

interface MetricSampleRow {
  id: number;
  source_id: string;
  metric_key: string;
  value_type: MetricValueType;
  value_number: number | null;
  value_text: string | null;
  value_bool: number | null;
  unit: string;
  tags: string;
  quality: string;
  captured_at: number;
}

interface MetricRollupRow {
  id: number;
  source_id: string;
  metric_key: string;
  bucket_ms: number;
  bucket_start_at: number;
  count: number;
  min_value: number | null;
  max_value: number | null;
  avg_value: number | null;
  last_value_type: MetricValueType;
  last_value_number: number | null;
  last_value_text: string | null;
  last_value_bool: number | null;
  unit: string;
  tags: string;
}

interface MetricIncidentRow {
  id: string;
  rule_id: string;
  metric_key: string;
  severity: "info" | "warning" | "critical";
  status: "open" | "resolved";
  operator: string;
  threshold_json: string;
  sample_value_type: MetricValueType;
  sample_value_number: number | null;
  sample_value_text: string | null;
  sample_value_bool: number | null;
  unit: string;
  message: string;
  opened_at: number;
  last_seen_at: number;
}

const MONITOR_ROLLUP_BUCKET_MS = 60_000;

function expandHome(value: string): string {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}

export function systemTelemetryMonitorDbPath(input: { monitorDb?: string } = {}): string {
  if (input.monitorDb) return expandHome(input.monitorDb);
  if (process.env.CLAW_MONITOR_DB_PATH) return expandHome(process.env.CLAW_MONITOR_DB_PATH);
  if (process.env.CLAW_MONITOR_DATA_DIR) return path.join(expandHome(process.env.CLAW_MONITOR_DATA_DIR), "monitor.sqlite");
  if (process.env.CLAW_DATA_DIR) return path.join(expandHome(process.env.CLAW_DATA_DIR), "monitor.sqlite");
  if (process.env.CLAW_HOME) return path.join(expandHome(process.env.CLAW_HOME), "data", "monitor.sqlite");
  return expandHome(resolveClawPersistentSurfacePath("claw.database.monitor"));
}

function nowIso(): string {
  return new Date().toISOString();
}

function sample(input: Omit<SystemTelemetryMetricSample, "capturedAt" | "source">): SystemTelemetryMetricSample {
  return {
    ...input,
    capturedAt: nowIso(),
    source: { adapter: "node", confidence: "official" },
  };
}

export function collectMcpSystemTelemetrySnapshot(): SystemTelemetrySnapshot {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const samples: SystemTelemetryMetricSample[] = [
    sample({
      key: "system.cpu.load1",
      value: os.loadavg()[0] ?? null,
      unit: "count",
      availability: "available",
    }),
    sample({
      key: "system.memory.used",
      value: Math.max(0, totalMemory - freeMemory),
      unit: "bytes",
      availability: "available",
    }),
    sample({
      key: "system.memory.free",
      value: freeMemory,
      unit: "bytes",
      availability: "available",
    }),
    sample({
      key: "system.power.uptime",
      value: Math.round(os.uptime()),
      unit: "seconds",
      availability: "available",
    }),
  ];
  const sampledKeys = new Set(samples.map((entry) => entry.key));
  return {
    schemaVersion: 1,
    generatedAt: nowIso(),
    host: { platform: os.platform(), arch: os.arch(), id: "local" },
    policy: {
      defaultAgentAccess: "safe_read",
      sensitiveRequiresGrant: true,
      controlsRequireSignedHostBroker: true,
    },
    samples,
    unavailableMetrics: listSystemTelemetryMetrics()
      .filter((metric) => !sampledKeys.has(metric.key))
      .map((metric) => metric.key),
  };
}

function parseRangeMs(value: string | undefined): number {
  if (!value) return 3_600_000;
  const match = value.match(/^(\d+)(m|h|d)$/);
  if (!match) return 3_600_000;
  const amount = Number(match[1]);
  if (match[2] === "m") return amount * 60_000;
  if (match[2] === "h") return amount * 3_600_000;
  return amount * 86_400_000;
}

function joinMetricValue(row: {
  value_type: MetricValueType;
  value_number?: number | null;
  value_text?: string | null;
  value_bool?: number | null;
}): number | string | boolean | null {
  if (row.value_type === "number") return row.value_number ?? null;
  if (row.value_type === "boolean") return row.value_bool === null || row.value_bool === undefined ? null : row.value_bool === 1;
  return row.value_text ?? null;
}

function safeJsonObject(value: string): Record<string, string> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    return {};
  }
}

function safeJsonValue(value: string): number | string | boolean | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed === "number" || typeof parsed === "string" || typeof parsed === "boolean" || parsed === null) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function readMcpSystemTelemetryHistory(input: { metricKey: string; range?: string; monitorDb?: string }) {
  const dbPath = systemTelemetryMonitorDbPath({ monitorDb: input.monitorDb });
  const metric = listSystemTelemetryMetrics().find((entry) => entry.key === input.metricKey) ?? null;
  const rangeMs = parseRangeMs(input.range);
  if (!metric) return { metric, rangeMs, retention: { store: "monitor.sqlite", dbPath, status: "unknown_metric", rawPolicy: "short_local", rollups: true, rollupBucketMs: MONITOR_ROLLUP_BUCKET_MS }, samples: [], rollups: [], incidents: [] };
  if (!fs.existsSync(dbPath)) return { metric, rangeMs, retention: { store: "monitor.sqlite", dbPath, status: "empty", rawPolicy: "short_local", rollups: true, rollupBucketMs: MONITOR_ROLLUP_BUCKET_MS }, samples: [], rollups: [], incidents: [] };
  const sinceMs = Date.now() - rangeMs;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const samples = (db.prepare(`
      SELECT * FROM metric_samples
      WHERE metric_key = ? AND captured_at >= ?
      ORDER BY captured_at DESC
      LIMIT ?
    `).all(input.metricKey, sinceMs, 300) as MetricSampleRow[]).map((row) => ({
      id: row.id,
      sourceId: row.source_id,
      metricKey: row.metric_key,
      value: joinMetricValue(row),
      valueType: row.value_type,
      unit: row.unit,
      tags: safeJsonObject(row.tags),
      quality: row.quality,
      capturedAt: row.captured_at,
    })).reverse();
    const rollups = (db.prepare(`
      SELECT * FROM metric_rollups
      WHERE metric_key = ? AND bucket_ms = ? AND bucket_start_at >= ?
      ORDER BY bucket_start_at DESC
      LIMIT ?
    `).all(input.metricKey, MONITOR_ROLLUP_BUCKET_MS, sinceMs, 300) as MetricRollupRow[]).map((row) => ({
      id: row.id,
      sourceId: row.source_id,
      metricKey: row.metric_key,
      bucketMs: row.bucket_ms,
      bucketStartAt: row.bucket_start_at,
      count: row.count,
      minValue: row.min_value,
      maxValue: row.max_value,
      avgValue: row.avg_value,
      lastValue: joinMetricValue({
        value_type: row.last_value_type,
        value_number: row.last_value_number,
        value_text: row.last_value_text,
        value_bool: row.last_value_bool,
      }),
      unit: row.unit,
      tags: safeJsonObject(row.tags),
    })).reverse();
    const incidents = (db.prepare(`
      SELECT * FROM metric_incidents
      WHERE metric_key = ? AND last_seen_at >= ?
      ORDER BY last_seen_at DESC
      LIMIT ?
    `).all(input.metricKey, sinceMs, 100) as MetricIncidentRow[]).map((row) => ({
      id: row.id,
      ruleId: row.rule_id,
      metricKey: row.metric_key,
      severity: row.severity,
      status: row.status,
      operator: row.operator,
      threshold: safeJsonValue(row.threshold_json),
      sampleValue: joinMetricValue({
        value_type: row.sample_value_type,
        value_number: row.sample_value_number,
        value_text: row.sample_value_text,
        value_bool: row.sample_value_bool,
      }),
      unit: row.unit,
      message: row.message,
      openedAt: row.opened_at,
      lastSeenAt: row.last_seen_at,
    })).reverse();
    return {
      metric,
      rangeMs,
      retention: { store: "monitor.sqlite", dbPath, status: samples.length > 0 ? "recorded" : "empty", rawPolicy: "short_local", rollups: true, rollupBucketMs: MONITOR_ROLLUP_BUCKET_MS },
      samples,
      rollups,
      incidents,
    };
  } catch (error) {
    if (error instanceof Error && /no such table/i.test(error.message)) {
      return { metric, rangeMs, retention: { store: "monitor.sqlite", dbPath, status: "empty", rawPolicy: "short_local", rollups: true, rollupBucketMs: MONITOR_ROLLUP_BUCKET_MS }, samples: [], rollups: [], incidents: [] };
    }
    throw error;
  } finally {
    db.close();
  }
}

export function mcpSystemTelemetryMetricsPayload() {
  return { metrics: listSystemTelemetryMetrics() };
}

export function mcpSystemTelemetryWidgetsPayload() {
  return { widgets: listSystemTelemetryWidgets() };
}
