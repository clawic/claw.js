import { randomUUID, createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import { canonicalTypes } from "./schema/registry.ts";
import { MarketplaceStore } from "./marketplace-store.ts";
import type {
  AlertRow, AlertRule, AlertRuleKind, CollectionRow, DeviceTokenRow, EntityRow,
  EntityType, FieldHistoryPoint, IndexEvent, JsonSchema, MonitorRow,
  ObservationRow, RelationRow, RunRow, RunStatus, SearchRow, TagRow, UiHints,
} from "./types.ts";

type IndexEventListener = (event: IndexEvent) => void;

function readSchema(): string {
  const candidates = [
    fileURLToPath(new URL("./db/schema.sql", import.meta.url)),
    fileURLToPath(new URL("../src/db/schema.sql", import.meta.url)),
    path.join(process.cwd(), "src/db/schema.sql"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return fs.readFileSync(candidate, "utf8");
  }
  throw new Error("Index schema.sql not found near package dist");
}

function uuid(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 22)}`;
}

function deriveIdentityKey(typeName: string, identityFields: string[], data: Record<string, unknown>): string {
  const parts = identityFields.map((field) => {
    const value = (data as Record<string, unknown>)[field];
    if (value === undefined || value === null) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  });
  if (parts.every((value) => value === "")) {
    const fallback = (data.canonical_url || data.source_url || data.title || JSON.stringify(data)) as string;
    return createHash("sha1").update(`${typeName}|${fallback}`).digest("hex");
  }
  return parts.join("|");
}

function snapshotTitle(typeName: string, data: Record<string, unknown>): string | null {
  if (typeof data.title === "string" && data.title) return data.title;
  if (typeof data.name === "string" && data.name) return data.name;
  if (typeName === "review" && data.rating !== undefined) return `${data.rating} ★ review`;
  return null;
}

function snapshotThumb(data: Record<string, unknown>): string | null {
  if (typeof data.thumbnail_url === "string") return data.thumbnail_url;
  const photos = data.photos as string[] | undefined;
  if (Array.isArray(photos) && photos.length > 0 && typeof photos[0] === "string") return photos[0];
  if (typeof data.avatar_url === "string") return data.avatar_url;
  if (typeof data.cover_url === "string") return data.cover_url;
  return null;
}

interface ChangedField { path: string; before: unknown; after: unknown; }
function diffRecordPayload(previous: Record<string, unknown>, next: Record<string, unknown>): ChangedField[] {
  const out: ChangedField[] = [];
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const key of keys) {
    const before = previous[key], after = next[key];
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      out.push({ path: key, before, after });
    }
  }
  return out;
}

function typeFromRow(row: any): EntityType {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    schemaJson: JSON.parse(row.schema_json) as JsonSchema,
    uiHints: row.ui_hints_json ? (JSON.parse(row.ui_hints_json) as UiHints) : undefined,
    identityFields: JSON.parse(row.identity_fields_json),
    timeseriesFields: JSON.parse(row.timeseries_fields_json),
    canonical: row.canonical === 1,
    createdAt: row.created_at,
  };
}

function entityFromRow(row: any): EntityRow {
  return {
    id: row.id,
    typeId: row.type_id,
    typeName: row.type_name,
    identityKey: row.identity_key,
    data: JSON.parse(row.data_json),
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    observationCount: row.observation_count,
    sourceUrl: row.source_url,
    title: row.title,
    thumbnailUrl: row.thumbnail_url,
  };
}

function monitorFromRow(row: any): MonitorRow {
  return {
    id: row.id, searchId: row.search_id, name: row.name, cronExpr: row.cron_expr,
    enabled: row.enabled === 1, lastFireAt: row.last_fire_at, nextFireAt: row.next_fire_at,
    alertRules: JSON.parse(row.alert_rules_json), muteUntil: row.mute_until, createdAt: row.created_at,
  };
}

function runFromRow(row: any): RunRow {
  return {
    id: row.id, monitorId: row.monitor_id, searchId: row.search_id, kind: row.kind,
    status: row.status, startedAt: row.started_at, endedAt: row.ended_at,
    codexSessionId: row.codex_session_id, error: row.error,
    entitiesSeen: row.entities_seen, observationsCount: row.observations_count,
    alertsFired: row.alerts_fired, tokensIn: row.tokens_in, tokensOut: row.tokens_out,
    prompt: row.prompt, log: row.log_json ? JSON.parse(row.log_json) : null, createdAt: row.created_at,
  };
}

function alertFromRow(row: any): AlertRow {
  return {
    id: row.id, monitorId: row.monitor_id, runId: row.run_id, entityId: row.entity_id,
    ruleId: row.rule_id, ruleKind: row.rule_kind as AlertRuleKind, ts: row.ts,
    payload: JSON.parse(row.payload_json), ackAt: row.ack_at,
  };
}

export class IndexStore {
  private readonly db: Database.Database;
  private readonly listeners = new Set<IndexEventListener>();
  readonly marketplace: MarketplaceStore;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(readSchema());
    this.seedCanonicalTypes();
    this.marketplace = new MarketplaceStore(this.db);
  }

  close(): void { this.db.close(); }

  subscribe(listener: IndexEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: IndexEvent): void {
    for (const listener of this.listeners) {
      try { listener(event); } catch (error) { console.error("[index] listener error", error); }
    }
  }

  private seedCanonicalTypes(): void {
    const existingNames = new Set(
      this.db.prepare<[], { name: string }>("SELECT name FROM entity_types WHERE canonical = 1").all().map((r) => r.name),
    );
    const insert = this.db.prepare(`
      INSERT INTO entity_types (id, name, version, schema_json, ui_hints_json, identity_fields_json, timeseries_fields_json, canonical, created_at)
      VALUES (?, ?, 1, ?, ?, ?, ?, 1, datetime('now'))
    `);
    for (const definition of canonicalTypes) {
      if (existingNames.has(definition.name)) continue;
      insert.run(
        uuid("type"), definition.name,
        JSON.stringify(definition.schemaJson),
        definition.uiHints ? JSON.stringify(definition.uiHints) : null,
        JSON.stringify(definition.identityFields),
        JSON.stringify(definition.timeseriesFields),
      );
    }
  }

  listTypes(): EntityType[] {
    return this.db.prepare(`SELECT id, name, version, schema_json, ui_hints_json, identity_fields_json, timeseries_fields_json, canonical, created_at FROM entity_types ORDER BY canonical DESC, name ASC`).all().map((r) => typeFromRow(r as any));
  }
  getTypeById(id: string): EntityType | null {
    const row = this.db.prepare(`SELECT id, name, version, schema_json, ui_hints_json, identity_fields_json, timeseries_fields_json, canonical, created_at FROM entity_types WHERE id = ?`).get(id);
    return row ? typeFromRow(row) : null;
  }
  getTypeByName(name: string): EntityType | null {
    const row = this.db.prepare(`SELECT id, name, version, schema_json, ui_hints_json, identity_fields_json, timeseries_fields_json, canonical, created_at FROM entity_types WHERE name = ?`).get(name);
    return row ? typeFromRow(row) : null;
  }
  declareType(input: { name: string; schema: JsonSchema; identityFields: string[]; timeseriesFields?: string[]; uiHints?: UiHints }): EntityType {
    const existing = this.getTypeByName(input.name);
    if (existing) {
      this.db.prepare(`UPDATE entity_types SET version = version + 1, schema_json = ?, ui_hints_json = ?, identity_fields_json = ?, timeseries_fields_json = ? WHERE id = ?`).run(
        JSON.stringify(input.schema),
        input.uiHints ? JSON.stringify(input.uiHints) : null,
        JSON.stringify(input.identityFields),
        JSON.stringify(input.timeseriesFields ?? []),
        existing.id,
      );
      const fresh = this.getTypeById(existing.id)!;
      this.emit({ kind: "type_declared", type: fresh });
      return fresh;
    }
    const id = uuid("type");
    this.db.prepare(`INSERT INTO entity_types (id, name, version, schema_json, ui_hints_json, identity_fields_json, timeseries_fields_json, canonical, created_at) VALUES (?, ?, 1, ?, ?, ?, ?, 0, datetime('now'))`).run(
      id, input.name, JSON.stringify(input.schema),
      input.uiHints ? JSON.stringify(input.uiHints) : null,
      JSON.stringify(input.identityFields),
      JSON.stringify(input.timeseriesFields ?? []),
    );
    const fresh = this.getTypeById(id)!;
    this.emit({ kind: "type_declared", type: fresh });
    return fresh;
  }

  private selectEntity(): string {
    return `SELECT e.id, e.type_id, t.name AS type_name, e.identity_key, e.data_json,
                   e.first_seen_at, e.last_seen_at, e.observation_count, e.source_url,
                   e.title, e.thumbnail_url
            FROM entities e JOIN entity_types t ON t.id = e.type_id`;
  }

  upsertEntity(input: {
    typeName: string; data: Record<string, unknown>; sourceUrl?: string;
    observedAt?: string; runId?: string | null; agentSessionId?: string | null;
  }): { entityId: string; isNew: boolean; changedFields: string[]; entity: EntityRow } {
    const type = this.getTypeByName(input.typeName);
    if (!type) throw new Error(`unknown entity type "${input.typeName}". Declare it via search.types.declare first or pick a canonical type.`);
    const identityKey = deriveIdentityKey(type.name, type.identityFields, input.data);
    const existing = this.db.prepare(`${this.selectEntity()} WHERE e.type_id = ? AND e.identity_key = ?`).get(type.id, identityKey);
    const observedAt = input.observedAt ?? new Date().toISOString();
    const title = snapshotTitle(type.name, input.data);
    const thumb = snapshotThumb(input.data);
    const sourceUrl = input.sourceUrl ?? (input.data.source_url as string | undefined) ?? (input.data.canonical_url as string | undefined) ?? null;
    let entityId: string;
    let isNew = false;
    let changes: ChangedField[] = [];
    if (existing) {
      const prev = entityFromRow(existing);
      entityId = prev.id;
      changes = diffRecordPayload(prev.data, input.data);
      const merged = { ...prev.data, ...input.data };
      this.db.prepare(`UPDATE entities SET data_json = ?, last_seen_at = ?, observation_count = observation_count + 1, source_url = COALESCE(?, source_url), title = COALESCE(?, title), thumbnail_url = COALESCE(?, thumbnail_url) WHERE id = ?`).run(JSON.stringify(merged), observedAt, sourceUrl, title, thumb, entityId);
    } else {
      isNew = true;
      entityId = uuid("ent");
      this.db.prepare(`INSERT INTO entities (id, type_id, identity_key, data_json, first_seen_at, last_seen_at, observation_count, source_url, title, thumbnail_url) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`).run(entityId, type.id, identityKey, JSON.stringify(input.data), observedAt, observedAt, sourceUrl, title, thumb);
      for (const key of Object.keys(input.data)) {
        changes.push({ path: key, before: undefined, after: input.data[key] });
      }
    }
    this.db.prepare(`INSERT INTO observations (id, entity_id, run_id, source_url, observed_at, snapshot_json, changed_fields_json, agent_session_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      uuid("obs"), entityId, input.runId ?? null, sourceUrl, observedAt,
      JSON.stringify(input.data), JSON.stringify(changes.map((c) => c.path)), input.agentSessionId ?? null,
    );
    for (const change of changes) {
      if (!type.timeseriesFields.includes(change.path)) continue;
      this.db.prepare(`INSERT INTO field_history (entity_id, field_path, value_json, valid_from, run_id) VALUES (?, ?, ?, ?, ?)`).run(entityId, change.path, JSON.stringify(change.after ?? null), observedAt, input.runId ?? null);
    }
    this.db.prepare(`INSERT INTO entities_fts (id, type_id, title, body) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title, body = excluded.body`).run(entityId, type.id, title ?? "", JSON.stringify(input.data).slice(0, 4000));
    if (input.runId) {
      this.db.prepare(`INSERT OR IGNORE INTO run_entities (run_id, entity_id) VALUES (?, ?)`).run(input.runId, entityId);
      this.db.prepare(`UPDATE runs SET observations_count = observations_count + 1, entities_seen = (SELECT COUNT(*) FROM run_entities WHERE run_id = ?) WHERE id = ?`).run(input.runId, input.runId);
    }
    const fresh = this.db.prepare(`${this.selectEntity()} WHERE e.id = ?`).get(entityId)!;
    const entity = entityFromRow(fresh);
    const paths = changes.map((c) => c.path);
    this.emit({ kind: "entity_upserted", entity, isNew, changedFields: paths });
    return { entityId, isNew, changedFields: paths, entity };
  }

  getEntity(id: string): EntityRow | null {
    const row = this.db.prepare(`${this.selectEntity()} WHERE e.id = ?`).get(id);
    return row ? entityFromRow(row) : null;
  }

  listObservations(entityId: string, limit = 50): ObservationRow[] {
    return this.db.prepare(`SELECT id, entity_id, run_id, source_url, observed_at, snapshot_json, changed_fields_json, agent_session_id FROM observations WHERE entity_id = ? ORDER BY observed_at DESC LIMIT ?`).all(entityId, limit).map((row: any) => ({
      id: row.id, entityId: row.entity_id, runId: row.run_id, sourceUrl: row.source_url,
      observedAt: row.observed_at, snapshot: JSON.parse(row.snapshot_json),
      changedFields: row.changed_fields_json ? JSON.parse(row.changed_fields_json) : [],
      agentSessionId: row.agent_session_id,
    }));
  }

  getFieldHistory(entityId: string, fieldPath: string, limit = 200): FieldHistoryPoint[] {
    return this.db.prepare(`SELECT field_path, value_json, valid_from, run_id FROM field_history WHERE entity_id = ? AND field_path = ? ORDER BY valid_from DESC LIMIT ?`).all(entityId, fieldPath, limit).map((row: any) => ({
      fieldPath: row.field_path, value: row.value_json ? JSON.parse(row.value_json) : null,
      validFrom: row.valid_from, runId: row.run_id,
    }));
  }

  queryEntities(input: {
    typeName?: string; where?: Record<string, unknown>;
    orderBy?: { field: string; direction: "asc" | "desc" };
    limit?: number; offset?: number; tagIds?: string[]; collectionId?: string;
  }): EntityRow[] {
    const clauses: string[] = []; const params: unknown[] = [];
    if (input.typeName) { clauses.push("t.name = ?"); params.push(input.typeName); }
    for (const [field, value] of Object.entries(input.where ?? {})) {
      clauses.push("json_extract(e.data_json, '$.' || ?) = ?");
      params.push(field);
      params.push(typeof value === "object" ? JSON.stringify(value) : value);
    }
    if (input.tagIds && input.tagIds.length > 0) {
      clauses.push(`e.id IN (SELECT entity_id FROM entity_tags WHERE tag_id IN (${input.tagIds.map(() => "?").join(",")}))`);
      params.push(...input.tagIds);
    }
    if (input.collectionId) {
      clauses.push("e.id IN (SELECT entity_id FROM collection_members WHERE collection_id = ?)");
      params.push(input.collectionId);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const order = input.orderBy ? `ORDER BY ${input.orderBy.field === "last_seen_at" ? "e.last_seen_at" : input.orderBy.field === "first_seen_at" ? "e.first_seen_at" : "e.last_seen_at"} ${input.orderBy.direction.toUpperCase()}` : "ORDER BY e.last_seen_at DESC";
    const limit = input.limit ?? 200;
    const offset = input.offset ?? 0;
    return this.db.prepare(`${this.selectEntity()} ${where} ${order} LIMIT ? OFFSET ?`).all(...params, limit, offset).map((r) => entityFromRow(r));
  }

  searchEntitiesFullText(query: string, typeName?: string, limit = 100): EntityRow[] {
    const cleaned = query.trim().replace(/"/g, '""');
    if (!cleaned) return [];
    const rows = typeName
      ? this.db.prepare(`${this.selectEntity()} JOIN entities_fts f ON f.id = e.id WHERE f.body MATCH ? AND t.name = ? LIMIT ?`).all(`${cleaned}*`, typeName, limit)
      : this.db.prepare(`${this.selectEntity()} JOIN entities_fts f ON f.id = e.id WHERE f.body MATCH ? LIMIT ?`).all(`${cleaned}*`, limit);
    return rows.map((r) => entityFromRow(r));
  }

  countByType(): { typeName: string; total: number }[] {
    return this.db.prepare(`SELECT t.name AS type_name, COUNT(e.id) AS total FROM entity_types t LEFT JOIN entities e ON e.type_id = t.id GROUP BY t.id ORDER BY t.canonical DESC, t.name ASC`).all().map((r: any) => ({ typeName: r.type_name, total: r.total }));
  }

  createSearch(input: { name: string; typeName?: string; criteria: Record<string, unknown>; promptTemplate?: string | null }): SearchRow {
    const id = uuid("srch");
    const typeId = input.typeName ? this.getTypeByName(input.typeName)?.id ?? null : null;
    this.db.prepare(`INSERT INTO searches (id, name, type_id, criteria_json, prompt_template, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`).run(id, input.name, typeId, JSON.stringify(input.criteria), input.promptTemplate ?? null);
    const row = this.getSearch(id)!;
    this.emit({ kind: "search_changed", search: row });
    return row;
  }
  updateSearch(id: string, input: Partial<Omit<SearchRow, "id" | "createdAt" | "updatedAt">>): SearchRow | null {
    const current = this.getSearch(id);
    if (!current) return null;
    this.db.prepare(`UPDATE searches SET name = COALESCE(?, name), type_id = ?, criteria_json = COALESCE(?, criteria_json), prompt_template = COALESCE(?, prompt_template), updated_at = datetime('now') WHERE id = ?`).run(
      input.name ?? null,
      input.typeId !== undefined ? input.typeId : current.typeId,
      input.criteria ? JSON.stringify(input.criteria) : null,
      input.promptTemplate ?? null, id,
    );
    const fresh = this.getSearch(id);
    if (fresh) this.emit({ kind: "search_changed", search: fresh });
    return fresh;
  }
  deleteSearch(id: string): void { this.db.prepare("DELETE FROM searches WHERE id = ?").run(id); }
  getSearch(id: string): SearchRow | null {
    const row: any = this.db.prepare(`SELECT id, name, type_id, criteria_json, prompt_template, created_at, updated_at FROM searches WHERE id = ?`).get(id);
    return row ? { id: row.id, name: row.name, typeId: row.type_id, criteria: JSON.parse(row.criteria_json), promptTemplate: row.prompt_template, createdAt: row.created_at, updatedAt: row.updated_at } : null;
  }
  listSearches(): SearchRow[] {
    return this.db.prepare(`SELECT id, name, type_id, criteria_json, prompt_template, created_at, updated_at FROM searches ORDER BY updated_at DESC`).all().map((row: any) => ({
      id: row.id, name: row.name, typeId: row.type_id, criteria: JSON.parse(row.criteria_json),
      promptTemplate: row.prompt_template, createdAt: row.created_at, updatedAt: row.updated_at,
    }));
  }

  createMonitor(input: { searchId: string; name?: string | null; cronExpr: string; alertRules: AlertRule[]; enabled?: boolean; nextFireAt?: string | null }): MonitorRow {
    const id = uuid("mon");
    this.db.prepare(`INSERT INTO monitors (id, search_id, name, cron_expr, enabled, next_fire_at, alert_rules_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`).run(
      id, input.searchId, input.name ?? null, input.cronExpr,
      input.enabled === false ? 0 : 1, input.nextFireAt ?? null,
      JSON.stringify(input.alertRules),
    );
    const fresh = this.getMonitor(id)!;
    this.emit({ kind: "monitor_changed", monitor: fresh });
    return fresh;
  }
  updateMonitor(id: string, input: Partial<Omit<MonitorRow, "id" | "createdAt">>): MonitorRow | null {
    if (!this.getMonitor(id)) return null;
    this.db.prepare(`UPDATE monitors SET name = COALESCE(?, name), cron_expr = COALESCE(?, cron_expr), enabled = COALESCE(?, enabled), last_fire_at = COALESCE(?, last_fire_at), next_fire_at = COALESCE(?, next_fire_at), alert_rules_json = COALESCE(?, alert_rules_json), mute_until = COALESCE(?, mute_until) WHERE id = ?`).run(
      input.name ?? null, input.cronExpr ?? null,
      input.enabled === undefined ? null : input.enabled ? 1 : 0,
      input.lastFireAt ?? null, input.nextFireAt ?? null,
      input.alertRules ? JSON.stringify(input.alertRules) : null,
      input.muteUntil ?? null, id,
    );
    const fresh = this.getMonitor(id);
    if (fresh) this.emit({ kind: "monitor_changed", monitor: fresh });
    return fresh;
  }
  deleteMonitor(id: string): void { this.db.prepare("DELETE FROM monitors WHERE id = ?").run(id); }
  getMonitor(id: string): MonitorRow | null {
    const row = this.db.prepare(`SELECT id, search_id, name, cron_expr, enabled, last_fire_at, next_fire_at, alert_rules_json, mute_until, created_at FROM monitors WHERE id = ?`).get(id);
    return row ? monitorFromRow(row) : null;
  }
  listMonitors(): MonitorRow[] {
    return this.db.prepare(`SELECT id, search_id, name, cron_expr, enabled, last_fire_at, next_fire_at, alert_rules_json, mute_until, created_at FROM monitors ORDER BY created_at DESC`).all().map((r: any) => monitorFromRow(r));
  }
  monitorsDueNow(at: Date = new Date()): MonitorRow[] {
    return this.db.prepare(`SELECT id, search_id, name, cron_expr, enabled, last_fire_at, next_fire_at, alert_rules_json, mute_until, created_at FROM monitors WHERE enabled = 1 AND (next_fire_at IS NULL OR next_fire_at <= ?)`).all(at.toISOString()).map((r: any) => monitorFromRow(r));
  }

  createRun(input: { monitorId?: string | null; searchId?: string | null; kind: "manual" | "monitor"; prompt?: string }): RunRow {
    const id = uuid("run");
    this.db.prepare(`INSERT INTO runs (id, monitor_id, search_id, kind, status, prompt, created_at) VALUES (?, ?, ?, ?, 'queued', ?, datetime('now'))`).run(id, input.monitorId ?? null, input.searchId ?? null, input.kind, input.prompt ?? null);
    const fresh = this.getRun(id)!;
    this.emit({ kind: "run_started", run: fresh });
    return fresh;
  }
  updateRun(id: string, input: Partial<Omit<RunRow, "id" | "createdAt">> & { status?: RunStatus }): RunRow | null {
    const fields: string[] = []; const values: unknown[] = [];
    const push = (col: string, val: unknown) => { fields.push(`${col} = ?`); values.push(val); };
    if (input.status) push("status", input.status);
    if (input.startedAt !== undefined) push("started_at", input.startedAt);
    if (input.endedAt !== undefined) push("ended_at", input.endedAt);
    if (input.codexSessionId !== undefined) push("codex_session_id", input.codexSessionId);
    if (input.error !== undefined) push("error", input.error);
    if (input.entitiesSeen !== undefined) push("entities_seen", input.entitiesSeen);
    if (input.observationsCount !== undefined) push("observations_count", input.observationsCount);
    if (input.alertsFired !== undefined) push("alerts_fired", input.alertsFired);
    if (input.tokensIn !== undefined) push("tokens_in", input.tokensIn);
    if (input.tokensOut !== undefined) push("tokens_out", input.tokensOut);
    if (input.log !== undefined) push("log_json", JSON.stringify(input.log));
    if (fields.length === 0) return this.getRun(id);
    this.db.prepare(`UPDATE runs SET ${fields.join(", ")} WHERE id = ?`).run(...values, id);
    const fresh = this.getRun(id);
    if (fresh && (input.status === "succeeded" || input.status === "failed" || input.status === "timeout")) {
      this.emit({ kind: "run_ended", run: fresh });
    }
    return fresh;
  }
  getRun(id: string): RunRow | null {
    const row = this.db.prepare(`SELECT id, monitor_id, search_id, kind, status, started_at, ended_at, codex_session_id, error, entities_seen, observations_count, alerts_fired, tokens_in, tokens_out, prompt, log_json, created_at FROM runs WHERE id = ?`).get(id);
    return row ? runFromRow(row) : null;
  }
  listRuns(limit = 100): RunRow[] {
    return this.db.prepare(`SELECT id, monitor_id, search_id, kind, status, started_at, ended_at, codex_session_id, error, entities_seen, observations_count, alerts_fired, tokens_in, tokens_out, prompt, log_json, created_at FROM runs ORDER BY COALESCE(started_at, created_at) DESC LIMIT ?`).all(limit).map((r: any) => runFromRow(r));
  }
  listRunsForMonitor(monitorId: string, limit = 50): RunRow[] {
    return this.db.prepare(`SELECT id, monitor_id, search_id, kind, status, started_at, ended_at, codex_session_id, error, entities_seen, observations_count, alerts_fired, tokens_in, tokens_out, prompt, log_json, created_at FROM runs WHERE monitor_id = ? ORDER BY started_at DESC LIMIT ?`).all(monitorId, limit).map((r: any) => runFromRow(r));
  }
  listEntitiesForRun(runId: string): EntityRow[] {
    return this.db.prepare(`${this.selectEntity()} JOIN run_entities r ON r.entity_id = e.id WHERE r.run_id = ?`).all(runId).map((r) => entityFromRow(r));
  }
  attachRunEntity(runId: string, entityId: string): void {
    this.db.prepare(`INSERT OR IGNORE INTO run_entities (run_id, entity_id) VALUES (?, ?)`).run(runId, entityId);
  }

  recordAlert(input: { monitorId?: string | null; runId?: string | null; entityId?: string | null; ruleId: string; ruleKind: AlertRuleKind; payload: Record<string, unknown> }): AlertRow {
    const id = uuid("alrt");
    this.db.prepare(`INSERT INTO alerts (id, monitor_id, run_id, entity_id, rule_id, rule_kind, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, input.monitorId ?? null, input.runId ?? null, input.entityId ?? null, input.ruleId, input.ruleKind, JSON.stringify(input.payload));
    if (input.runId) this.db.prepare(`UPDATE runs SET alerts_fired = alerts_fired + 1 WHERE id = ?`).run(input.runId);
    const fresh = this.getAlert(id)!;
    this.emit({ kind: "alert_fired", alert: fresh });
    return fresh;
  }
  ackAlert(id: string): void { this.db.prepare(`UPDATE alerts SET ack_at = datetime('now') WHERE id = ?`).run(id); }
  getAlert(id: string): AlertRow | null {
    const row = this.db.prepare(`SELECT id, monitor_id, run_id, entity_id, rule_id, rule_kind, ts, payload_json, ack_at FROM alerts WHERE id = ?`).get(id);
    return row ? alertFromRow(row) : null;
  }
  listAlerts(limit = 200): AlertRow[] {
    return this.db.prepare(`SELECT id, monitor_id, run_id, entity_id, rule_id, rule_kind, ts, payload_json, ack_at FROM alerts ORDER BY ts DESC LIMIT ?`).all(limit).map((r: any) => alertFromRow(r));
  }
  countUnackedAlerts(): number {
    const row: any = this.db.prepare(`SELECT COUNT(*) AS c FROM alerts WHERE ack_at IS NULL`).get();
    return row?.c ?? 0;
  }

  upsertTag(input: { name: string; color?: string | null }): TagRow {
    const existing: any = this.db.prepare(`SELECT id FROM tags WHERE name = ?`).get(input.name);
    if (existing) {
      if (input.color) this.db.prepare(`UPDATE tags SET color = ? WHERE id = ?`).run(input.color, existing.id);
      return this.getTag(existing.id)!;
    }
    const id = uuid("tag");
    this.db.prepare(`INSERT INTO tags (id, name, color) VALUES (?, ?, ?)`).run(id, input.name, input.color ?? null);
    return this.getTag(id)!;
  }
  getTag(id: string): TagRow | null {
    const row: any = this.db.prepare(`SELECT id, name, color, created_at FROM tags WHERE id = ?`).get(id);
    return row ? { id: row.id, name: row.name, color: row.color, createdAt: row.created_at } : null;
  }
  listTags(): TagRow[] {
    return this.db.prepare(`SELECT id, name, color, created_at FROM tags ORDER BY name ASC`).all().map((r: any) => ({ id: r.id, name: r.name, color: r.color, createdAt: r.created_at }));
  }
  applyTag(entityId: string, tagName: string, color?: string | null): TagRow {
    const tag = this.upsertTag({ name: tagName, color: color ?? null });
    this.db.prepare(`INSERT OR IGNORE INTO entity_tags (entity_id, tag_id) VALUES (?, ?)`).run(entityId, tag.id);
    return tag;
  }
  removeTag(entityId: string, tagId: string): void {
    this.db.prepare(`DELETE FROM entity_tags WHERE entity_id = ? AND tag_id = ?`).run(entityId, tagId);
  }
  listEntityTags(entityId: string): TagRow[] {
    return this.db.prepare(`SELECT t.id, t.name, t.color, t.created_at FROM tags t JOIN entity_tags et ON et.tag_id = t.id WHERE et.entity_id = ?`).all(entityId).map((r: any) => ({ id: r.id, name: r.name, color: r.color, createdAt: r.created_at }));
  }
  createCollection(input: { name: string; description?: string; kind?: "manual" | "smart"; criteria?: Record<string, unknown> }): CollectionRow {
    const id = uuid("coll");
    this.db.prepare(`INSERT INTO collections (id, name, description, kind, criteria_json) VALUES (?, ?, ?, ?, ?)`).run(id, input.name, input.description ?? null, input.kind ?? "manual", input.criteria ? JSON.stringify(input.criteria) : null);
    return this.getCollection(id)!;
  }
  getCollection(id: string): CollectionRow | null {
    const row: any = this.db.prepare(`SELECT c.id, c.name, c.description, c.kind, c.criteria_json, c.created_at, COUNT(m.entity_id) AS member_count FROM collections c LEFT JOIN collection_members m ON m.collection_id = c.id WHERE c.id = ? GROUP BY c.id`).get(id);
    return row ? { id: row.id, name: row.name, description: row.description, kind: row.kind, criteria: row.criteria_json ? JSON.parse(row.criteria_json) : null, createdAt: row.created_at, memberCount: row.member_count ?? 0 } : null;
  }
  listCollections(): CollectionRow[] {
    return this.db.prepare(`SELECT c.id, c.name, c.description, c.kind, c.criteria_json, c.created_at, COUNT(m.entity_id) AS member_count FROM collections c LEFT JOIN collection_members m ON m.collection_id = c.id GROUP BY c.id ORDER BY c.created_at DESC`).all().map((r: any) => ({ id: r.id, name: r.name, description: r.description, kind: r.kind, criteria: r.criteria_json ? JSON.parse(r.criteria_json) : null, createdAt: r.created_at, memberCount: r.member_count ?? 0 }));
  }
  addToCollection(collectionId: string, entityId: string): void {
    this.db.prepare(`INSERT OR IGNORE INTO collection_members (collection_id, entity_id) VALUES (?, ?)`).run(collectionId, entityId);
  }
  removeFromCollection(collectionId: string, entityId: string): void {
    this.db.prepare(`DELETE FROM collection_members WHERE collection_id = ? AND entity_id = ?`).run(collectionId, entityId);
  }

  linkEntities(input: { fromEntityId: string; toEntityId: string; relationType: string; attrs?: Record<string, unknown> }): RelationRow {
    const result = this.db.prepare(`INSERT INTO entity_relations (from_entity_id, to_entity_id, relation_type, attrs_json) VALUES (?, ?, ?, ?)`).run(input.fromEntityId, input.toEntityId, input.relationType, input.attrs ? JSON.stringify(input.attrs) : null);
    const id = Number(result.lastInsertRowid);
    const row: any = this.db.prepare(`SELECT id, from_entity_id, to_entity_id, relation_type, attrs_json, created_at FROM entity_relations WHERE id = ?`).get(id);
    return { id: row.id, fromEntityId: row.from_entity_id, toEntityId: row.to_entity_id, relationType: row.relation_type, attrs: row.attrs_json ? JSON.parse(row.attrs_json) : null, createdAt: row.created_at };
  }
  listRelationsFrom(entityId: string): RelationRow[] {
    return this.db.prepare(`SELECT id, from_entity_id, to_entity_id, relation_type, attrs_json, created_at FROM entity_relations WHERE from_entity_id = ?`).all(entityId).map((r: any) => ({ id: r.id, fromEntityId: r.from_entity_id, toEntityId: r.to_entity_id, relationType: r.relation_type, attrs: r.attrs_json ? JSON.parse(r.attrs_json) : null, createdAt: r.created_at }));
  }
  listRelationsTo(entityId: string): RelationRow[] {
    return this.db.prepare(`SELECT id, from_entity_id, to_entity_id, relation_type, attrs_json, created_at FROM entity_relations WHERE to_entity_id = ?`).all(entityId).map((r: any) => ({ id: r.id, fromEntityId: r.from_entity_id, toEntityId: r.to_entity_id, relationType: r.relation_type, attrs: r.attrs_json ? JSON.parse(r.attrs_json) : null, createdAt: r.created_at }));
  }

  registerDeviceToken(input: { platform: "macos" | "ios"; token: string; label?: string }): DeviceTokenRow {
    const id = uuid("dvc");
    this.db.prepare(`INSERT INTO device_tokens (id, platform, token, label, last_seen_at) VALUES (?, ?, ?, ?, datetime('now')) ON CONFLICT(platform, token) DO UPDATE SET label = excluded.label, last_seen_at = excluded.last_seen_at`).run(id, input.platform, input.token, input.label ?? null);
    const row: any = this.db.prepare(`SELECT id, platform, token, label, last_seen_at FROM device_tokens WHERE platform = ? AND token = ?`).get(input.platform, input.token);
    return { id: row.id, platform: row.platform, token: row.token, label: row.label, lastSeenAt: row.last_seen_at };
  }
  listDeviceTokens(platform?: "macos" | "ios"): DeviceTokenRow[] {
    const rows = platform ? this.db.prepare(`SELECT id, platform, token, label, last_seen_at FROM device_tokens WHERE platform = ?`).all(platform) : this.db.prepare(`SELECT id, platform, token, label, last_seen_at FROM device_tokens`).all();
    return rows.map((r: any) => ({ id: r.id, platform: r.platform, token: r.token, label: r.label, lastSeenAt: r.last_seen_at }));
  }

  fieldValueOnOrBefore(entityId: string, fieldPath: string, before: string): unknown {
    const row: any = this.db.prepare(`SELECT value_json FROM field_history WHERE entity_id = ? AND field_path = ? AND valid_from < ? ORDER BY valid_from DESC LIMIT 1`).get(entityId, fieldPath, before);
    return row ? JSON.parse(row.value_json) : null;
  }
}
