import os from "os";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

import {
  listSystemTelemetryMetrics,
  listSystemTelemetryWidgets,
  resolveClawPersistentSurfacePath,
  type SystemTelemetryMetricDefinition,
  type SystemTelemetryMetricSample,
  type SystemTelemetrySnapshot,
  type SystemTelemetryRuleDefinition,
  type SystemTelemetryWidgetDefinition,
} from "@clawjs/core";

import { CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { writeCommandJsonOk, writeJsonLine } from "./cli-json.ts";
import type { CliContext } from "./index.ts";

type SystemTelemetryState = {
  schemaVersion: 1;
  updatedAt: string;
  rules: SystemTelemetryRuleDefinition[];
  widgets: SystemTelemetryWidgetDefinition[];
  deletedRuleIds: string[];
  deletedWidgetIds: string[];
};

type MetricValueType = "number" | "string" | "boolean";

type MonitorMetricSampleRow = {
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
};

type MonitorMetricRollupRow = {
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
};

type MonitorMetricIncidentRow = {
  id: string;
  rule_id: string;
  metric_key: string;
  severity: SystemTelemetryRuleDefinition["severity"];
  status: "open" | "resolved";
  operator: SystemTelemetryRuleDefinition["operator"];
  threshold_json: string;
  sample_value_type: MetricValueType;
  sample_value_number: number | null;
  sample_value_text: string | null;
  sample_value_bool: number | null;
  unit: string;
  message: string;
  opened_at: number;
  last_seen_at: number;
};

const SYSTEM_DEFAULT_RULES: SystemTelemetryRuleDefinition[] = [
  {
    id: "cpu-load-high",
    metricKey: "system.cpu.load1",
    operator: "gte",
    threshold: os.cpus().length,
    severity: "warning",
    enabled: true,
  },
];

const RULE_OPERATORS = new Set<SystemTelemetryRuleDefinition["operator"]>(["gt", "gte", "lt", "lte", "eq", "changed"]);
const RULE_SEVERITIES = new Set<SystemTelemetryRuleDefinition["severity"]>(["info", "warning", "critical"]);
const WIDGET_PRESENTATIONS = new Set<SystemTelemetryWidgetDefinition["presentation"]>(["text", "icon", "gauge", "sparkline", "threshold", "dropdown"]);
const WIDGET_PLACEMENTS = new Set<SystemTelemetryWidgetDefinition["placement"]>(["menubar", "combined_panel", "both"]);
const MONITOR_SOURCE_ID = "system.telemetry.local";
const MONITOR_ROLLUP_BUCKET_MS = 60_000;
const MONITOR_METRIC_SCHEMA_SQL = String.raw`
  CREATE TABLE IF NOT EXISTS metric_sources (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    adapter TEXT NOT NULL,
    host_id TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS metric_samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id TEXT NOT NULL REFERENCES metric_sources(id) ON DELETE CASCADE,
    metric_key TEXT NOT NULL,
    value_type TEXT NOT NULL,
    value_number REAL,
    value_text TEXT,
    value_bool INTEGER,
    unit TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '{}',
    quality TEXT NOT NULL DEFAULT 'ok',
    captured_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_metric_samples_key_time
    ON metric_samples(metric_key, captured_at DESC);

  CREATE TABLE IF NOT EXISTS metric_rollups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id TEXT NOT NULL REFERENCES metric_sources(id) ON DELETE CASCADE,
    metric_key TEXT NOT NULL,
    bucket_ms INTEGER NOT NULL,
    bucket_start_at INTEGER NOT NULL,
    count INTEGER NOT NULL,
    min_value REAL,
    max_value REAL,
    avg_value REAL,
    last_value_type TEXT NOT NULL,
    last_value_number REAL,
    last_value_text TEXT,
    last_value_bool INTEGER,
    unit TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '{}',
    UNIQUE(source_id, metric_key, bucket_ms, bucket_start_at, tags)
  );
  CREATE INDEX IF NOT EXISTS idx_metric_rollups_key_bucket
    ON metric_rollups(metric_key, bucket_ms, bucket_start_at DESC);

  CREATE TABLE IF NOT EXISTS metric_incidents (
    id TEXT PRIMARY KEY,
    rule_id TEXT NOT NULL,
    source_id TEXT NOT NULL REFERENCES metric_sources(id) ON DELETE CASCADE,
    metric_key TEXT NOT NULL,
    severity TEXT NOT NULL,
    status TEXT NOT NULL,
    operator TEXT NOT NULL,
    threshold_json TEXT NOT NULL,
    sample_value_type TEXT NOT NULL,
    sample_value_number REAL,
    sample_value_text TEXT,
    sample_value_bool INTEGER,
    unit TEXT NOT NULL,
    message TEXT NOT NULL,
    opened_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_metric_incidents_key_time
    ON metric_incidents(metric_key, last_seen_at DESC);
`;

function nowIso(): string {
  return new Date().toISOString();
}

function metricByKey(key: string): SystemTelemetryMetricDefinition | null {
  return listSystemTelemetryMetrics().find((metric) => metric.key === key) ?? null;
}

function systemTelemetryStatePath(workspaceRoot: string): string {
  return resolveClawPersistentSurfacePath("claw.workspace.data", workspaceRoot, "system-telemetry-state.json");
}

function expandHome(value: string): string {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}

function monitorDatabasePath(flags: Record<string, string>): string {
  if (flags["monitor-db"]) return expandHome(flags["monitor-db"]);
  if (process.env.CLAW_MONITOR_DB_PATH) return expandHome(process.env.CLAW_MONITOR_DB_PATH);
  if (process.env.CLAW_MONITOR_DATA_DIR) return path.join(expandHome(process.env.CLAW_MONITOR_DATA_DIR), "monitor.sqlite");
  if (process.env.CLAW_DATA_DIR) return path.join(expandHome(process.env.CLAW_DATA_DIR), "monitor.sqlite");
  if (process.env.CLAW_HOME) return path.join(expandHome(process.env.CLAW_HOME), "data", "monitor.sqlite");
  return expandHome(resolveClawPersistentSurfacePath("claw.database.monitor"));
}

function openMonitorDatabase(flags: Record<string, string>): { db: Database.Database; dbPath: string } {
  const dbPath = monitorDatabasePath(flags);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(MONITOR_METRIC_SCHEMA_SQL);
  return { db, dbPath };
}

function emptyMonitorHistory(dbPath: string): ReturnType<typeof readMonitorHistory> {
  return { store: "monitor.sqlite", dbPath, samples: [], rollups: [], incidents: [] };
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

function readSystemTelemetryState(workspaceRoot: string): SystemTelemetryState {
  const file = systemTelemetryStatePath(workspaceRoot);
  if (!fs.existsSync(file)) return emptySystemTelemetryState();
  try {
    return normalizeSystemTelemetryState(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return emptySystemTelemetryState();
  }
}

function writeSystemTelemetryState(workspaceRoot: string, state: SystemTelemetryState): void {
  const file = systemTelemetryStatePath(workspaceRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(normalizeSystemTelemetryState({ ...state, updatedAt: nowIso() }), null, 2)}\n`);
}

function emptySystemTelemetryState(): SystemTelemetryState {
  return {
    schemaVersion: 1,
    updatedAt: new Date(0).toISOString(),
    rules: [],
    widgets: [],
    deletedRuleIds: [],
    deletedWidgetIds: [],
  };
}

function normalizeSystemTelemetryState(value: unknown): SystemTelemetryState {
  const state = value && typeof value === "object" ? value as Partial<SystemTelemetryState> : {};
  return {
    schemaVersion: 1,
    updatedAt: typeof state.updatedAt === "string" ? state.updatedAt : new Date(0).toISOString(),
    rules: Array.isArray(state.rules) ? state.rules.map(normalizeRule).filter(Boolean) as SystemTelemetryRuleDefinition[] : [],
    widgets: Array.isArray(state.widgets) ? state.widgets.map(normalizeWidget).filter(Boolean) as SystemTelemetryWidgetDefinition[] : [],
    deletedRuleIds: Array.isArray(state.deletedRuleIds) ? state.deletedRuleIds.filter((id): id is string => typeof id === "string" && id.length > 0) : [],
    deletedWidgetIds: Array.isArray(state.deletedWidgetIds) ? state.deletedWidgetIds.filter((id): id is string => typeof id === "string" && id.length > 0) : [],
  };
}

function normalizeRule(value: unknown): SystemTelemetryRuleDefinition | null {
  const rule = value && typeof value === "object" ? value as Partial<SystemTelemetryRuleDefinition> : {};
  if (!rule.id || !rule.metricKey || !metricByKey(rule.metricKey)) return null;
  const operator = RULE_OPERATORS.has(rule.operator as SystemTelemetryRuleDefinition["operator"]) ? rule.operator as SystemTelemetryRuleDefinition["operator"] : "gte";
  const severity = RULE_SEVERITIES.has(rule.severity as SystemTelemetryRuleDefinition["severity"]) ? rule.severity as SystemTelemetryRuleDefinition["severity"] : "warning";
  return {
    id: rule.id,
    metricKey: rule.metricKey,
    operator,
    threshold: rule.threshold ?? 0,
    severity,
    enabled: rule.enabled !== false,
  };
}

function normalizeWidget(value: unknown): SystemTelemetryWidgetDefinition | null {
  const widget = value && typeof value === "object" ? value as Partial<SystemTelemetryWidgetDefinition> : {};
  if (!widget.id || !widget.metricKey || !metricByKey(widget.metricKey)) return null;
  const presentation = WIDGET_PRESENTATIONS.has(widget.presentation as SystemTelemetryWidgetDefinition["presentation"]) ? widget.presentation as SystemTelemetryWidgetDefinition["presentation"] : "text";
  const placement = WIDGET_PLACEMENTS.has(widget.placement as SystemTelemetryWidgetDefinition["placement"]) ? widget.placement as SystemTelemetryWidgetDefinition["placement"] : "menubar";
  return {
    id: widget.id,
    metricKey: widget.metricKey,
    title: widget.title || widget.id,
    presentation,
    placement,
    enabledByDefault: widget.enabledByDefault !== false,
  };
}

function mergedRules(state: SystemTelemetryState): SystemTelemetryRuleDefinition[] {
  const deleted = new Set(state.deletedRuleIds);
  const byId = new Map(SYSTEM_DEFAULT_RULES.filter((rule) => !deleted.has(rule.id)).map((rule) => [rule.id, rule]));
  for (const rule of state.rules) byId.set(rule.id, rule);
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function mergedWidgets(state: SystemTelemetryState): SystemTelemetryWidgetDefinition[] {
  const deleted = new Set(state.deletedWidgetIds);
  const byId = new Map(listSystemTelemetryWidgets().filter((widget) => !deleted.has(widget.id)).map((widget) => [widget.id, widget]));
  for (const widget of state.widgets) byId.set(widget.id, widget);
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (["true", "1", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["false", "0", "no", "off"].includes(value.toLowerCase())) return false;
  throw new CliHandledError("invalid_boolean", `Invalid boolean value: ${value}`, CLI_EXIT_USAGE);
}

function parseThreshold(value: string | undefined): number | string | boolean {
  if (value === undefined) throw new CliHandledError("missing_threshold", "Missing --threshold.", CLI_EXIT_USAGE);
  if (["true", "false"].includes(value.toLowerCase())) return value.toLowerCase() === "true";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
}

function parsePositiveInteger(value: string | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliHandledError("invalid_number", `${label} must be a positive integer.`, CLI_EXIT_USAGE);
  }
  return parsed;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function compareMetricValue(value: number | string | boolean | null, operator: SystemTelemetryRuleDefinition["operator"], threshold: number | string | boolean): boolean {
  if (value === null) return false;
  if (operator === "changed") return false;
  if (operator === "eq") return value === threshold;
  if (typeof value === "number" && typeof threshold === "number") {
    if (operator === "gt") return value > threshold;
    if (operator === "gte") return value >= threshold;
    if (operator === "lt") return value < threshold;
    if (operator === "lte") return value <= threshold;
  }
  if (typeof value === "string" && typeof threshold === "string") {
    if (operator === "gt") return value > threshold;
    if (operator === "gte") return value >= threshold;
    if (operator === "lt") return value < threshold;
    if (operator === "lte") return value <= threshold;
  }
  return false;
}

function metricIncidentId(rule: SystemTelemetryRuleDefinition, sample: SystemTelemetryMetricSample, bucketStartAt: number): string {
  const safeRuleId = rule.id.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const safeMetricKey = sample.key.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return `metric_incident_${safeRuleId}_${safeMetricKey}_${bucketStartAt}`;
}

function evaluateRulesForSnapshot(snapshot: SystemTelemetrySnapshot, rules: SystemTelemetryRuleDefinition[], capturedAt: number): Array<{
  id: string;
  rule: SystemTelemetryRuleDefinition;
  sample: SystemTelemetryMetricSample;
  value: ReturnType<typeof splitMetricValue>;
  message: string;
}> {
  const enabledRules = rules.filter((rule) => rule.enabled);
  const samplesByKey = new Map(snapshot.samples.map((entry) => [entry.key, entry]));
  const bucketStartAt = Math.floor(capturedAt / MONITOR_ROLLUP_BUCKET_MS) * MONITOR_ROLLUP_BUCKET_MS;
  const incidents: Array<{
    id: string;
    rule: SystemTelemetryRuleDefinition;
    sample: SystemTelemetryMetricSample;
    value: ReturnType<typeof splitMetricValue>;
    message: string;
  }> = [];
  for (const rule of enabledRules) {
    const entry = samplesByKey.get(rule.metricKey);
    if (!entry || !compareMetricValue(entry.value, rule.operator, rule.threshold)) continue;
    incidents.push({
      id: metricIncidentId(rule, entry, bucketStartAt),
      rule,
      sample: entry,
      value: splitMetricValue(entry.value),
      message: `${rule.metricKey} ${rule.operator} ${String(rule.threshold)}`,
    });
  }
  return incidents;
}

function upsertRule(state: SystemTelemetryState, input: { id: string; flags: Record<string, string> }): SystemTelemetryState {
  const existing = mergedRules(state).find((rule) => rule.id === input.id);
  const metricKey = input.flags["metric-key"] ?? input.flags.metric ?? existing?.metricKey;
  if (!metricKey) throw new CliHandledError("missing_metric", "Missing --metric-key.", CLI_EXIT_USAGE);
  const metric = metricByKey(metricKey);
  if (!metric) throw new CliHandledError("unknown_metric", `Unknown system metric: ${metricKey}`, CLI_EXIT_USAGE);
  const operator = (input.flags.operator ?? existing?.operator ?? "gte") as SystemTelemetryRuleDefinition["operator"];
  if (!RULE_OPERATORS.has(operator)) throw new CliHandledError("invalid_operator", `Invalid rule operator: ${operator}`, CLI_EXIT_USAGE);
  const severity = (input.flags.severity ?? existing?.severity ?? "warning") as SystemTelemetryRuleDefinition["severity"];
  if (!RULE_SEVERITIES.has(severity)) throw new CliHandledError("invalid_severity", `Invalid rule severity: ${severity}`, CLI_EXIT_USAGE);
  const rule: SystemTelemetryRuleDefinition = {
    id: input.id,
    metricKey,
    operator,
    threshold: input.flags.threshold === undefined ? existing?.threshold ?? 0 : parseThreshold(input.flags.threshold),
    severity,
    enabled: parseBoolean(input.flags.enabled, existing?.enabled ?? true),
  };
  const rules = state.rules.filter((entry) => entry.id !== input.id);
  return {
    ...state,
    rules: [...rules, rule],
    deletedRuleIds: state.deletedRuleIds.filter((id) => id !== input.id),
  };
}

function upsertWidget(state: SystemTelemetryState, input: { id: string; flags: Record<string, string> }): SystemTelemetryState {
  const existing = mergedWidgets(state).find((widget) => widget.id === input.id);
  const metricKey = input.flags["metric-key"] ?? input.flags.metric ?? existing?.metricKey;
  if (!metricKey) throw new CliHandledError("missing_metric", "Missing --metric-key.", CLI_EXIT_USAGE);
  const metric = metricByKey(metricKey);
  if (!metric) throw new CliHandledError("unknown_metric", `Unknown system metric: ${metricKey}`, CLI_EXIT_USAGE);
  const presentation = (input.flags.presentation ?? existing?.presentation ?? "text") as SystemTelemetryWidgetDefinition["presentation"];
  if (!WIDGET_PRESENTATIONS.has(presentation)) throw new CliHandledError("invalid_presentation", `Invalid widget presentation: ${presentation}`, CLI_EXIT_USAGE);
  const placement = (input.flags.placement ?? existing?.placement ?? "menubar") as SystemTelemetryWidgetDefinition["placement"];
  if (!WIDGET_PLACEMENTS.has(placement)) throw new CliHandledError("invalid_placement", `Invalid widget placement: ${placement}`, CLI_EXIT_USAGE);
  const widget: SystemTelemetryWidgetDefinition = {
    id: input.id,
    metricKey,
    title: input.flags.title ?? existing?.title ?? metric.label,
    presentation,
    placement,
    enabledByDefault: parseBoolean(input.flags.enabled, existing?.enabledByDefault ?? true),
  };
  const widgets = state.widgets.filter((entry) => entry.id !== input.id);
  return {
    ...state,
    widgets: [...widgets, widget],
    deletedWidgetIds: state.deletedWidgetIds.filter((id) => id !== input.id),
  };
}

function sample(input: Omit<SystemTelemetryMetricSample, "capturedAt" | "source"> & { detail?: string }): SystemTelemetryMetricSample {
  return {
    key: input.key,
    value: input.value,
    unit: input.unit,
    availability: input.availability,
    capturedAt: nowIso(),
    quality: input.quality,
    tags: input.tags,
    source: {
      adapter: "node",
      confidence: "official",
      detail: input.detail,
    },
  };
}

function safeOsUptime(): number | null {
  try {
    return Math.round(os.uptime());
  } catch {
    return null;
  }
}

function collectSafeLocalSnapshot(): SystemTelemetrySnapshot {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const uptime = safeOsUptime();
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
      key: "system.power.uptime",
      value: uptime,
      unit: "seconds",
      availability: uptime === null ? "unavailable" : "available",
      quality: uptime === null ? "unsupported" : "ok",
    }),
  ];
  const sampledKeys = new Set(samples.map((entry) => entry.key));
  return {
    schemaVersion: 1,
    generatedAt: nowIso(),
    host: {
      platform: os.platform(),
      arch: os.arch(),
      id: "local",
    },
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
  if (!match) throw new CliHandledError("invalid_range", "Use --range with values like 15m, 1h or 24h.", CLI_EXIT_USAGE);
  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === "m") return amount * 60_000;
  if (unit === "h") return amount * 3_600_000;
  return amount * 86_400_000;
}

function purgeMonitorRetention(db: Database.Database, now: number, flags: Record<string, string>): { samples: number; rollups: number; incidents: number } {
  const rawRetentionMs = parseRangeMs(flags["raw-retention"] ?? flags["sample-retention"] ?? "6h");
  const rollupRetentionMs = parseRangeMs(flags["rollup-retention"] ?? "7d");
  const incidentRetentionMs = parseRangeMs(flags["incident-retention"] ?? "7d");
  const sampleResult = db.prepare("DELETE FROM metric_samples WHERE captured_at < ?").run(now - rawRetentionMs);
  const rollupResult = db.prepare("DELETE FROM metric_rollups WHERE bucket_start_at < ?").run(now - rollupRetentionMs);
  const incidentResult = db.prepare("DELETE FROM metric_incidents WHERE last_seen_at < ?").run(now - incidentRetentionMs);
  return {
    samples: sampleResult.changes,
    rollups: rollupResult.changes,
    incidents: incidentResult.changes,
  };
}

function recordSnapshotToMonitor(snapshot: SystemTelemetrySnapshot, flags: Record<string, string>, state: SystemTelemetryState): {
  store: "monitor.sqlite";
  dbPath: string;
  sourceId: string;
  sampleCount: number;
  rollupCount: number;
  incidentCount: number;
  purged: { samples: number; rollups: number; incidents: number };
} {
  const { db, dbPath } = openMonitorDatabase(flags);
  try {
    const timestamp = Date.parse(snapshot.generatedAt);
    const capturedAt = Number.isFinite(timestamp) ? timestamp : Date.now();
    const upsertSource = db.prepare(`
      INSERT INTO metric_sources (id, kind, adapter, host_id, metadata, created_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        kind = excluded.kind,
        adapter = excluded.adapter,
        host_id = excluded.host_id,
        metadata = excluded.metadata,
        last_seen_at = excluded.last_seen_at
    `);
    const appendSample = db.prepare(`
      INSERT INTO metric_samples (source_id, metric_key, value_type, value_number, value_text, value_bool, unit, tags, quality, captured_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const upsertRollup = db.prepare(`
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
    `);
    const upsertIncident = db.prepare(`
      INSERT INTO metric_incidents (
        id, rule_id, source_id, metric_key, severity, status, operator, threshold_json,
        sample_value_type, sample_value_number, sample_value_text, sample_value_bool,
        unit, message, opened_at, last_seen_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        severity = excluded.severity,
        status = 'open',
        threshold_json = excluded.threshold_json,
        sample_value_type = excluded.sample_value_type,
        sample_value_number = excluded.sample_value_number,
        sample_value_text = excluded.sample_value_text,
        sample_value_bool = excluded.sample_value_bool,
        unit = excluded.unit,
        message = excluded.message,
        last_seen_at = excluded.last_seen_at
    `);
    const transaction = db.transaction(() => {
      upsertSource.run(
        MONITOR_SOURCE_ID,
        "system",
        "node",
        snapshot.host.id,
        JSON.stringify({ platform: snapshot.host.platform, arch: snapshot.host.arch, policy: snapshot.policy }),
        capturedAt,
        capturedAt,
      );
      let sampleCount = 0;
      let rollupCount = 0;
      for (const entry of snapshot.samples) {
        const value = splitMetricValue(entry.value);
        const tags = JSON.stringify(entry.tags ?? {});
        appendSample.run(
          MONITOR_SOURCE_ID,
          entry.key,
          value.valueType,
          value.valueNumber,
          value.valueText,
          value.valueBool,
          entry.unit,
          tags,
          entry.quality ?? "ok",
          capturedAt,
        );
        sampleCount += 1;
        const bucketStartAt = Math.floor(capturedAt / MONITOR_ROLLUP_BUCKET_MS) * MONITOR_ROLLUP_BUCKET_MS;
        upsertRollup.run(
          MONITOR_SOURCE_ID,
          entry.key,
          MONITOR_ROLLUP_BUCKET_MS,
          bucketStartAt,
          1,
          typeof entry.value === "number" ? entry.value : null,
          typeof entry.value === "number" ? entry.value : null,
          typeof entry.value === "number" ? entry.value : null,
          value.valueType,
          value.valueNumber,
          value.valueText,
          value.valueBool,
          entry.unit,
          tags,
        );
        rollupCount += 1;
      }
      let incidentCount = 0;
      for (const incident of evaluateRulesForSnapshot(snapshot, mergedRules(state), capturedAt)) {
        upsertIncident.run(
          incident.id,
          incident.rule.id,
          MONITOR_SOURCE_ID,
          incident.sample.key,
          incident.rule.severity,
          "open",
          incident.rule.operator,
          JSON.stringify(incident.rule.threshold),
          incident.value.valueType,
          incident.value.valueNumber,
          incident.value.valueText,
          incident.value.valueBool,
          incident.sample.unit,
          incident.message,
          capturedAt,
          capturedAt,
        );
        incidentCount += 1;
      }
      const purged = purgeMonitorRetention(db, Date.now(), flags);
      return { sampleCount, rollupCount, incidentCount, purged };
    });
    const recorded = transaction();
    return {
      store: "monitor.sqlite",
      dbPath,
      sourceId: MONITOR_SOURCE_ID,
      ...recorded,
    };
  } finally {
    db.close();
  }
}

function readMonitorHistory(metricKey: string, rangeMs: number, flags: Record<string, string>): {
  store: "monitor.sqlite";
  dbPath: string;
  samples: Array<{
    id: number;
    sourceId: string;
    metricKey: string;
    value: number | string | boolean | null;
    valueType: MetricValueType;
    unit: string;
    tags: Record<string, string>;
    quality: string;
    capturedAt: number;
  }>;
  rollups: Array<{
    id: number;
    sourceId: string;
    metricKey: string;
    bucketMs: number;
    bucketStartAt: number;
    count: number;
    minValue: number | null;
    maxValue: number | null;
    avgValue: number | null;
    lastValue: number | string | boolean | null;
    unit: string;
    tags: Record<string, string>;
  }>;
  incidents: Array<{
    id: string;
    ruleId: string;
    metricKey: string;
    severity: SystemTelemetryRuleDefinition["severity"];
    status: "open" | "resolved";
    operator: SystemTelemetryRuleDefinition["operator"];
    threshold: number | string | boolean | null;
    sampleValue: number | string | boolean | null;
    unit: string;
    message: string;
    openedAt: number;
    lastSeenAt: number;
  }>;
} {
  const sinceMs = Date.now() - rangeMs;
  const dbPath = monitorDatabasePath(flags);
  if (!fs.existsSync(dbPath)) return emptyMonitorHistory(dbPath);
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const samples = (db.prepare(`
      SELECT * FROM metric_samples
      WHERE metric_key = ? AND captured_at >= ?
      ORDER BY captured_at DESC
      LIMIT ?
    `).all(metricKey, sinceMs, 300) as MonitorMetricSampleRow[]).map((row) => ({
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
    `).all(metricKey, MONITOR_ROLLUP_BUCKET_MS, sinceMs, 300) as MonitorMetricRollupRow[]).map((row) => ({
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
    `).all(metricKey, sinceMs, 100) as MonitorMetricIncidentRow[]).map((row) => ({
      id: row.id,
      ruleId: row.rule_id,
      metricKey: row.metric_key,
      severity: row.severity,
      status: row.status,
      operator: row.operator,
      threshold: JSON.parse(row.threshold_json) as number | string | boolean | null,
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
    return { store: "monitor.sqlite", dbPath, samples, rollups, incidents };
  } catch (error) {
    if (error instanceof Error && /no such table/i.test(error.message)) return emptyMonitorHistory(dbPath);
    throw error;
  } finally {
    db.close();
  }
}

function writeHuman(context: CliContext, value: unknown): void {
  context.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export async function runSystemCli(input: {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
  workspaceRoot: string;
}): Promise<number> {
  const [, command, subcommand] = input.positionals;
  if (!command || command === "help") {
    input.context.stdout.write(`Usage: ${input.binName} system snapshot|metrics|history|watch|rules|widgets|capabilities [options]\n`);
    return CLI_EXIT_OK;
  }

  if (command === "snapshot") {
    const snapshot = collectSafeLocalSnapshot();
    const record = parseBoolean(input.flags.record, false);
    const payload = record ? {
      ...snapshot,
      recorded: recordSnapshotToMonitor(snapshot, input.flags, readSystemTelemetryState(input.workspaceRoot)),
    } : snapshot;
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "system", payload, { subcommand: "snapshot" });
    else writeHuman(input.context, payload);
    return CLI_EXIT_OK;
  }

  if (command === "metrics") {
    if (subcommand && subcommand !== "list") throw new CliHandledError("usage_error", `Usage: ${input.binName} system metrics list`, CLI_EXIT_USAGE);
    const payload = { metrics: listSystemTelemetryMetrics() };
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "system", payload, { subcommand: "metrics list" });
    else writeHuman(input.context, payload);
    return CLI_EXIT_OK;
  }

  if (command === "history") {
    const metricKey = subcommand;
    if (!metricKey) throw new CliHandledError("usage_error", `Usage: ${input.binName} system history <metric-key> --range 1h`, CLI_EXIT_USAGE);
    const metric = metricByKey(metricKey);
    if (!metric) throw new CliHandledError("unknown_metric", `Unknown system metric: ${metricKey}`, CLI_EXIT_USAGE);
    const rangeMs = parseRangeMs(input.flags.range);
    const history = readMonitorHistory(metricKey, rangeMs, input.flags);
    const payload = {
      metric,
      rangeMs,
      retention: {
        store: history.store,
        dbPath: history.dbPath,
        status: history.samples.length > 0 ? "recorded" : "empty",
        rawPolicy: "short_local",
        rollups: true,
        rollupBucketMs: MONITOR_ROLLUP_BUCKET_MS,
      },
      samples: history.samples,
      rollups: history.rollups,
      incidents: history.incidents,
    };
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "system", payload, { subcommand: "history" });
    else writeHuman(input.context, payload);
    return CLI_EXIT_OK;
  }

  if (command === "watch") {
    const intervalMs = parsePositiveInteger(input.flags.interval, 1_000, "--interval");
    const count = parsePositiveInteger(input.flags.count, Number.POSITIVE_INFINITY, "--count");
    for (let emitted = 0; emitted < count; emitted += 1) {
      const snapshot = collectSafeLocalSnapshot();
      if (input.wantsJson) writeJsonLine(input.context.stdout, { ok: true, data: snapshot, meta: { schemaVersion: 1, canonicalCommand: "system", subcommand: "watch", intervalMs } });
      else writeHuman(input.context, snapshot);
      if (emitted + 1 < count) await sleep(intervalMs);
    }
    return CLI_EXIT_OK;
  }

  if (command === "rules") {
    const state = readSystemTelemetryState(input.workspaceRoot);
    if (!subcommand || subcommand === "list") {
      const payload = { rules: mergedRules(state), statePath: systemTelemetryStatePath(input.workspaceRoot) };
      if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "system", payload, { subcommand: "rules list" });
      else writeHuman(input.context, payload);
      return CLI_EXIT_OK;
    }
    if (subcommand === "upsert") {
      const id = input.positionals[3] ?? input.flags.id;
      if (!id) throw new CliHandledError("usage_error", `Usage: ${input.binName} system rules upsert <id> --metric-key <key> --operator gte --threshold <value>`, CLI_EXIT_USAGE);
      const next = upsertRule(state, { id, flags: input.flags });
      writeSystemTelemetryState(input.workspaceRoot, next);
      const payload = { rule: mergedRules(next).find((rule) => rule.id === id), statePath: systemTelemetryStatePath(input.workspaceRoot), mutatesHardware: false };
      if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "system", payload, { subcommand: "rules upsert" });
      else writeHuman(input.context, payload);
      return CLI_EXIT_OK;
    }
    if (subcommand === "delete") {
      const id = input.positionals[3] ?? input.flags.id;
      if (!id) throw new CliHandledError("usage_error", `Usage: ${input.binName} system rules delete <id>`, CLI_EXIT_USAGE);
      const next: SystemTelemetryState = {
        ...state,
        rules: state.rules.filter((rule) => rule.id !== id),
        deletedRuleIds: [...new Set([...state.deletedRuleIds, id])],
      };
      writeSystemTelemetryState(input.workspaceRoot, next);
      const payload = { deleted: id, rules: mergedRules(next), statePath: systemTelemetryStatePath(input.workspaceRoot), mutatesHardware: false };
      if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "system", payload, { subcommand: "rules delete" });
      else writeHuman(input.context, payload);
      return CLI_EXIT_OK;
    }
    throw new CliHandledError("usage_error", `Usage: ${input.binName} system rules list|upsert|delete`, CLI_EXIT_USAGE);
  }

  if (command === "widgets") {
    const state = readSystemTelemetryState(input.workspaceRoot);
    if (!subcommand || subcommand === "list") {
      const payload = { widgets: mergedWidgets(state), statePath: systemTelemetryStatePath(input.workspaceRoot) };
      if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "system", payload, { subcommand: "widgets list" });
      else writeHuman(input.context, payload);
      return CLI_EXIT_OK;
    }
    if (subcommand === "upsert") {
      const id = input.positionals[3] ?? input.flags.id;
      if (!id) throw new CliHandledError("usage_error", `Usage: ${input.binName} system widgets upsert <id> --metric-key <key> --presentation text --placement menubar`, CLI_EXIT_USAGE);
      const next = upsertWidget(state, { id, flags: input.flags });
      writeSystemTelemetryState(input.workspaceRoot, next);
      const payload = { widget: mergedWidgets(next).find((widget) => widget.id === id), statePath: systemTelemetryStatePath(input.workspaceRoot), hostSpecific: true };
      if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "system", payload, { subcommand: "widgets upsert" });
      else writeHuman(input.context, payload);
      return CLI_EXIT_OK;
    }
    if (subcommand === "delete") {
      const id = input.positionals[3] ?? input.flags.id;
      if (!id) throw new CliHandledError("usage_error", `Usage: ${input.binName} system widgets delete <id>`, CLI_EXIT_USAGE);
      const next: SystemTelemetryState = {
        ...state,
        widgets: state.widgets.filter((widget) => widget.id !== id),
        deletedWidgetIds: [...new Set([...state.deletedWidgetIds, id])],
      };
      writeSystemTelemetryState(input.workspaceRoot, next);
      const payload = { deleted: id, widgets: mergedWidgets(next), statePath: systemTelemetryStatePath(input.workspaceRoot), hostSpecific: true };
      if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "system", payload, { subcommand: "widgets delete" });
      else writeHuman(input.context, payload);
      return CLI_EXIT_OK;
    }
    throw new CliHandledError("usage_error", `Usage: ${input.binName} system widgets list|upsert|delete`, CLI_EXIT_USAGE);
  }

  return CLI_EXIT_USAGE;
}
