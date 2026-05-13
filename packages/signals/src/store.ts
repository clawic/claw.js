import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import Database from "better-sqlite3";

import type {
  CatalogEntry,
  HealthKitAnchor,
  Observation,
  ObservationQuery,
  ObservationValue,
  Session,
  Source,
  StatsBucket,
  StatsResult,
  UpsertCatalogInput,
  UpsertObservationInput,
  UpsertSessionInput,
  ValueType,
} from "@clawjs/signals-core";

const SCHEMA_DDL = `
  CREATE TABLE IF NOT EXISTS system_variables (
    id              TEXT PRIMARY KEY,
    domain          TEXT NOT NULL,
    label           TEXT NOT NULL,
    unit_id         TEXT NOT NULL,
    unit_label      TEXT NOT NULL,
    unit_group      TEXT,
    value_type      TEXT NOT NULL,
    valid_min       REAL,
    valid_max       REAL,
    enum_values     TEXT,
    category        TEXT,
    healthkit_type_id TEXT,
    description     TEXT,
    hidden          INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sys_var_category ON system_variables(category);

  CREATE TABLE IF NOT EXISTS user_variables (
    id              TEXT PRIMARY KEY,
    domain          TEXT NOT NULL,
    label           TEXT NOT NULL,
    unit_id         TEXT NOT NULL,
    unit_label      TEXT NOT NULL,
    unit_group      TEXT,
    value_type      TEXT NOT NULL,
    valid_min       REAL,
    valid_max       REAL,
    enum_values     TEXT,
    category        TEXT,
    healthkit_type_id TEXT,
    description     TEXT,
    hidden          INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_usr_var_category ON user_variables(category);

  CREATE TABLE IF NOT EXISTS observations (
    id              TEXT PRIMARY KEY,
    variable_id     TEXT NOT NULL,
    value_text      TEXT NOT NULL,
    value_numeric   REAL,
    unit_id         TEXT NOT NULL,
    recorded_at     INTEGER NOT NULL,
    source          TEXT NOT NULL,
    notes           TEXT,
    metadata_json   TEXT,
    session_id      TEXT,
    external_id     TEXT,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_obs_var_time ON observations(variable_id, recorded_at DESC);
  CREATE INDEX IF NOT EXISTS idx_obs_session ON observations(session_id);
  CREATE INDEX IF NOT EXISTS idx_obs_external ON observations(external_id);
  CREATE INDEX IF NOT EXISTS idx_obs_source ON observations(source);

  CREATE TABLE IF NOT EXISTS sessions (
    id              TEXT PRIMARY KEY,
    domain          TEXT NOT NULL,
    type            TEXT NOT NULL,
    started_at      INTEGER NOT NULL,
    ended_at        INTEGER,
    notes           TEXT,
    metadata_json   TEXT,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sess_started ON sessions(started_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sess_type ON sessions(type);

  CREATE TABLE IF NOT EXISTS healthkit_sync_state (
    variable_id     TEXT PRIMARY KEY,
    anchor_blob     TEXT NOT NULL,
    last_synced_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS hidden_system_variables (
    id              TEXT PRIMARY KEY,
    hidden_at       INTEGER NOT NULL
  );
`;

interface CatalogRow {
  id: string;
  domain: string;
  label: string;
  unit_id: string;
  unit_label: string;
  unit_group: string | null;
  value_type: ValueType;
  valid_min: number | null;
  valid_max: number | null;
  enum_values: string | null;
  category: string | null;
  healthkit_type_id: string | null;
  description: string | null;
  hidden: number;
  created_at: number;
  updated_at: number;
}

interface ObservationRow {
  id: string;
  variable_id: string;
  value_text: string;
  value_numeric: number | null;
  unit_id: string;
  recorded_at: number;
  source: Source;
  notes: string | null;
  metadata_json: string | null;
  session_id: string | null;
  external_id: string | null;
  created_at: number;
  updated_at: number;
}

interface SessionRow {
  id: string;
  domain: string;
  type: string;
  started_at: number;
  ended_at: number | null;
  notes: string | null;
  metadata_json: string | null;
  created_at: number;
  updated_at: number;
}

interface AnchorRow {
  variable_id: string;
  anchor_blob: string;
  last_synced_at: number;
}

function parseJson<T>(value: string | null): T | null {
  if (value == null) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function rowToCatalog(row: CatalogRow, origin: "system" | "user"): CatalogEntry {
  return {
    id: row.id,
    domain: row.domain,
    label: row.label,
    unit: { id: row.unit_id, label: row.unit_label, group: row.unit_group ?? undefined },
    valueType: row.value_type,
    validRange:
      row.valid_min != null || row.valid_max != null
        ? { min: row.valid_min ?? undefined, max: row.valid_max ?? undefined }
        : undefined,
    enumValues: row.enum_values ? (parseJson<string[]>(row.enum_values) ?? undefined) : undefined,
    category: row.category ?? undefined,
    healthkitTypeId: row.healthkit_type_id ?? undefined,
    description: row.description ?? undefined,
    origin,
    hidden: row.hidden === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToObservation(row: ObservationRow): Observation {
  const parsed = parseJson<ObservationValue>(row.value_text);
  return {
    id: row.id,
    variableId: row.variable_id,
    value: (parsed as ObservationValue) ?? (row.value_numeric ?? row.value_text),
    unitId: row.unit_id,
    recordedAt: row.recorded_at,
    source: row.source,
    notes: row.notes,
    metadata: parseJson<Record<string, unknown>>(row.metadata_json),
    sessionId: row.session_id,
    externalId: row.external_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    domain: row.domain,
    type: row.type,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    notes: row.notes,
    metadata: parseJson<Record<string, unknown>>(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function numericFrom(value: ObservationValue): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  return null;
}

export interface TrackingStoreOptions {
  domain: string;
  dbPath: string;
  seedCatalog?: readonly CatalogEntry[];
}

export class TrackingStore {
  private readonly db: Database.Database;
  private readonly domain: string;

  constructor(options: TrackingStoreOptions) {
    fs.mkdirSync(path.dirname(options.dbPath), { recursive: true });
    this.db = new Database(options.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(SCHEMA_DDL);
    this.domain = options.domain;
    if (options.seedCatalog && options.seedCatalog.length > 0) {
      this.seedSystemCatalog(options.seedCatalog);
    }
  }

  close(): void {
    this.db.close();
  }

  private seedSystemCatalog(entries: readonly CatalogEntry[]): void {
    const insert = this.db.prepare(`
      INSERT INTO system_variables (
        id, domain, label, unit_id, unit_label, unit_group, value_type,
        valid_min, valid_max, enum_values, category, healthkit_type_id,
        description, hidden, created_at, updated_at
      ) VALUES (
        @id, @domain, @label, @unit_id, @unit_label, @unit_group, @value_type,
        @valid_min, @valid_max, @enum_values, @category, @healthkit_type_id,
        @description, 0, @created_at, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        label = excluded.label,
        unit_id = excluded.unit_id,
        unit_label = excluded.unit_label,
        unit_group = excluded.unit_group,
        value_type = excluded.value_type,
        valid_min = excluded.valid_min,
        valid_max = excluded.valid_max,
        enum_values = excluded.enum_values,
        category = excluded.category,
        healthkit_type_id = excluded.healthkit_type_id,
        description = excluded.description,
        updated_at = excluded.updated_at
    `);
    const now = Date.now();
    const tx = this.db.transaction((rows: readonly CatalogEntry[]) => {
      for (const entry of rows) {
        insert.run({
          id: entry.id,
          domain: entry.domain,
          label: entry.label,
          unit_id: entry.unit.id,
          unit_label: entry.unit.label,
          unit_group: entry.unit.group ?? null,
          value_type: entry.valueType,
          valid_min: entry.validRange?.min ?? null,
          valid_max: entry.validRange?.max ?? null,
          enum_values: entry.enumValues ? JSON.stringify(entry.enumValues) : null,
          category: entry.category ?? null,
          healthkit_type_id: entry.healthkitTypeId ?? null,
          description: entry.description ?? null,
          created_at: entry.createdAt ?? now,
          updated_at: entry.updatedAt ?? now,
        });
      }
    });
    tx(entries);
  }

  listCatalog(): CatalogEntry[] {
    const sys = this.db
      .prepare(
        `SELECT s.* FROM system_variables s
         LEFT JOIN hidden_system_variables h ON h.id = s.id
         WHERE h.id IS NULL
         ORDER BY s.category, s.label`,
      )
      .all() as CatalogRow[];
    const usr = this.db
      .prepare("SELECT * FROM user_variables ORDER BY category, label")
      .all() as CatalogRow[];
    return [
      ...sys.map((row) => rowToCatalog(row, "system")),
      ...usr.map((row) => rowToCatalog(row, "user")),
    ];
  }

  getVariable(id: string): CatalogEntry | null {
    const sys = this.db.prepare("SELECT * FROM system_variables WHERE id = ?").get(id) as
      | CatalogRow
      | undefined;
    if (sys) {
      const hidden = this.db.prepare("SELECT 1 FROM hidden_system_variables WHERE id = ?").get(id);
      const entry = rowToCatalog(sys, "system");
      if (hidden) entry.hidden = true;
      return entry;
    }
    const usr = this.db.prepare("SELECT * FROM user_variables WHERE id = ?").get(id) as
      | CatalogRow
      | undefined;
    if (usr) return rowToCatalog(usr, "user");
    return null;
  }

  createUserVariable(input: UpsertCatalogInput): CatalogEntry {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO user_variables (
           id, domain, label, unit_id, unit_label, unit_group, value_type,
           valid_min, valid_max, enum_values, category, healthkit_type_id,
           description, hidden, created_at, updated_at
         ) VALUES (
           @id, @domain, @label, @unit_id, @unit_label, @unit_group, @value_type,
           @valid_min, @valid_max, @enum_values, @category, @healthkit_type_id,
           @description, 0, @created_at, @updated_at
         )
         ON CONFLICT(id) DO UPDATE SET
           label = excluded.label,
           unit_id = excluded.unit_id,
           unit_label = excluded.unit_label,
           unit_group = excluded.unit_group,
           value_type = excluded.value_type,
           valid_min = excluded.valid_min,
           valid_max = excluded.valid_max,
           enum_values = excluded.enum_values,
           category = excluded.category,
           healthkit_type_id = excluded.healthkit_type_id,
           description = excluded.description,
           updated_at = excluded.updated_at`,
      )
      .run({
        id: input.id,
        domain: this.domain,
        label: input.label,
        unit_id: input.unit.id,
        unit_label: input.unit.label,
        unit_group: input.unit.group ?? null,
        value_type: input.valueType,
        valid_min: input.validRange?.min ?? null,
        valid_max: input.validRange?.max ?? null,
        enum_values: input.enumValues ? JSON.stringify(input.enumValues) : null,
        category: input.category ?? null,
        healthkit_type_id: input.healthkitTypeId ?? null,
        description: input.description ?? null,
        created_at: now,
        updated_at: now,
      });
    const created = this.getVariable(input.id);
    if (!created) throw new Error(`createUserVariable: failed to read back ${input.id}`);
    return created;
  }

  deleteVariable(id: string): { deleted: boolean; hidden: boolean } {
    const usr = this.db.prepare("DELETE FROM user_variables WHERE id = ?").run(id);
    if (usr.changes > 0) return { deleted: true, hidden: false };
    const sys = this.db.prepare("SELECT id FROM system_variables WHERE id = ?").get(id);
    if (sys) {
      this.db
        .prepare(
          "INSERT OR IGNORE INTO hidden_system_variables (id, hidden_at) VALUES (?, ?)",
        )
        .run(id, Date.now());
      return { deleted: false, hidden: true };
    }
    return { deleted: false, hidden: false };
  }

  unhideSystemVariable(id: string): boolean {
    const info = this.db.prepare("DELETE FROM hidden_system_variables WHERE id = ?").run(id);
    return info.changes > 0;
  }

  upsertObservation(input: UpsertObservationInput): Observation {
    const id = input.id ?? randomUUID();
    const now = Date.now();
    const variable = this.getVariable(input.variableId);
    const unitId = input.unitId ?? variable?.unit.id ?? "count";
    const recordedAt = input.recordedAt ?? now;
    const valueText = JSON.stringify(input.value);
    const valueNumeric = numericFrom(input.value);
    const existing = this.db
      .prepare("SELECT id, created_at FROM observations WHERE id = ?")
      .get(id) as { id: string; created_at: number } | undefined;
    if (existing) {
      this.db
        .prepare(
          `UPDATE observations
             SET variable_id = @variable_id,
                 value_text = @value_text,
                 value_numeric = @value_numeric,
                 unit_id = @unit_id,
                 recorded_at = @recorded_at,
                 source = @source,
                 notes = @notes,
                 metadata_json = @metadata_json,
                 session_id = @session_id,
                 external_id = @external_id,
                 updated_at = @updated_at
           WHERE id = @id`,
        )
        .run({
          id,
          variable_id: input.variableId,
          value_text: valueText,
          value_numeric: valueNumeric,
          unit_id: unitId,
          recorded_at: recordedAt,
          source: input.source ?? "manual",
          notes: input.notes ?? null,
          metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
          session_id: input.sessionId ?? null,
          external_id: input.externalId ?? null,
          updated_at: now,
        });
    } else {
      this.db
        .prepare(
          `INSERT INTO observations (
             id, variable_id, value_text, value_numeric, unit_id, recorded_at,
             source, notes, metadata_json, session_id, external_id, created_at, updated_at
           ) VALUES (
             @id, @variable_id, @value_text, @value_numeric, @unit_id, @recorded_at,
             @source, @notes, @metadata_json, @session_id, @external_id, @created_at, @updated_at
           )`,
        )
        .run({
          id,
          variable_id: input.variableId,
          value_text: valueText,
          value_numeric: valueNumeric,
          unit_id: unitId,
          recorded_at: recordedAt,
          source: input.source ?? "manual",
          notes: input.notes ?? null,
          metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
          session_id: input.sessionId ?? null,
          external_id: input.externalId ?? null,
          created_at: now,
          updated_at: now,
        });
    }
    const row = this.db.prepare("SELECT * FROM observations WHERE id = ?").get(id) as ObservationRow;
    return rowToObservation(row);
  }

  bulkUpsertObservations(inputs: readonly UpsertObservationInput[]): Observation[] {
    const tx = this.db.transaction((rows: readonly UpsertObservationInput[]): Observation[] => {
      return rows.map((row) => this.upsertObservation(row));
    });
    return tx(inputs);
  }

  getObservation(id: string): Observation | null {
    const row = this.db.prepare("SELECT * FROM observations WHERE id = ?").get(id) as
      | ObservationRow
      | undefined;
    return row ? rowToObservation(row) : null;
  }

  listObservations(query: ObservationQuery = {}): Observation[] {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    if (query.variableId) {
      conditions.push("variable_id = @variable_id");
      params.variable_id = query.variableId;
    }
    if (query.from !== undefined) {
      conditions.push("recorded_at >= @from");
      params.from = query.from;
    }
    if (query.to !== undefined) {
      conditions.push("recorded_at <= @to");
      params.to = query.to;
    }
    if (query.source) {
      conditions.push("source = @source");
      params.source = query.source;
    }
    if (query.sessionId) {
      conditions.push("session_id = @session_id");
      params.session_id = query.sessionId;
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.min(Math.max(query.limit ?? 500, 1), 5000);
    const offset = Math.max(query.offset ?? 0, 0);
    const rows = this.db
      .prepare(
        `SELECT * FROM observations ${where} ORDER BY recorded_at DESC LIMIT @limit OFFSET @offset`,
      )
      .all({ ...params, limit, offset }) as ObservationRow[];
    return rows.map(rowToObservation);
  }

  updateObservation(id: string, patch: Partial<UpsertObservationInput>): Observation | null {
    const existing = this.getObservation(id);
    if (!existing) return null;
    return this.upsertObservation({
      id,
      variableId: patch.variableId ?? existing.variableId,
      value: patch.value ?? existing.value,
      unitId: patch.unitId ?? existing.unitId,
      recordedAt: patch.recordedAt ?? existing.recordedAt,
      source: patch.source ?? existing.source,
      notes: patch.notes === undefined ? existing.notes : patch.notes,
      metadata: patch.metadata === undefined ? existing.metadata : patch.metadata,
      sessionId: patch.sessionId === undefined ? existing.sessionId : patch.sessionId,
      externalId: patch.externalId === undefined ? existing.externalId : patch.externalId,
    });
  }

  deleteObservation(id: string): boolean {
    const info = this.db.prepare("DELETE FROM observations WHERE id = ?").run(id);
    return info.changes > 0;
  }

  upsertSession(input: UpsertSessionInput): Session {
    const id = input.id ?? randomUUID();
    const now = Date.now();
    const startedAt = input.startedAt ?? now;
    const existing = this.db.prepare("SELECT id FROM sessions WHERE id = ?").get(id);
    if (existing) {
      this.db
        .prepare(
          `UPDATE sessions
             SET type = @type,
                 started_at = @started_at,
                 ended_at = @ended_at,
                 notes = @notes,
                 metadata_json = @metadata_json,
                 updated_at = @updated_at
           WHERE id = @id`,
        )
        .run({
          id,
          type: input.type,
          started_at: startedAt,
          ended_at: input.endedAt ?? null,
          notes: input.notes ?? null,
          metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
          updated_at: now,
        });
    } else {
      this.db
        .prepare(
          `INSERT INTO sessions (
             id, domain, type, started_at, ended_at, notes, metadata_json, created_at, updated_at
           ) VALUES (
             @id, @domain, @type, @started_at, @ended_at, @notes, @metadata_json, @created_at, @updated_at
           )`,
        )
        .run({
          id,
          domain: this.domain,
          type: input.type,
          started_at: startedAt,
          ended_at: input.endedAt ?? null,
          notes: input.notes ?? null,
          metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
          created_at: now,
          updated_at: now,
        });
    }
    const row = this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow;
    return rowToSession(row);
  }

  listSessions(query: { from?: number; to?: number; limit?: number } = {}): Session[] {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    if (query.from !== undefined) {
      conditions.push("started_at >= @from");
      params.from = query.from;
    }
    if (query.to !== undefined) {
      conditions.push("started_at <= @to");
      params.to = query.to;
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.min(Math.max(query.limit ?? 200, 1), 2000);
    const rows = this.db
      .prepare(`SELECT * FROM sessions ${where} ORDER BY started_at DESC LIMIT @limit`)
      .all({ ...params, limit }) as SessionRow[];
    return rows.map(rowToSession);
  }

  getSession(id: string): Session | null {
    const row = this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
      | SessionRow
      | undefined;
    return row ? rowToSession(row) : null;
  }

  deleteSession(id: string): boolean {
    const tx = this.db.transaction((sessionId: string) => {
      this.db.prepare("UPDATE observations SET session_id = NULL WHERE session_id = ?").run(sessionId);
      const info = this.db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
      return info.changes > 0;
    });
    return tx(id);
  }

  stats(
    variableId: string,
    from: number,
    to: number,
    period: StatsResult["period"] = "day",
  ): StatsResult {
    const rows = this.db
      .prepare(
        `SELECT value_numeric, recorded_at FROM observations
         WHERE variable_id = @variable_id AND value_numeric IS NOT NULL
           AND recorded_at >= @from AND recorded_at <= @to
         ORDER BY recorded_at ASC`,
      )
      .all({ variable_id: variableId, from, to }) as Array<{
      value_numeric: number;
      recorded_at: number;
    }>;
    const buckets = new Map<number, number[]>();
    for (const row of rows) {
      const key = bucketKey(row.recorded_at, period);
      const arr = buckets.get(key) ?? [];
      arr.push(row.value_numeric);
      buckets.set(key, arr);
    }
    const result: StatsBucket[] = [];
    for (const [bucket, values] of Array.from(buckets.entries()).sort((a, b) => a[0] - b[0])) {
      values.sort((a, b) => a - b);
      const sum = values.reduce((acc, v) => acc + v, 0);
      const count = values.length;
      const p50 = values[Math.floor(count * 0.5)];
      const p95 = values[Math.min(count - 1, Math.floor(count * 0.95))];
      result.push({
        bucket,
        count,
        sum,
        avg: count > 0 ? sum / count : 0,
        min: values[0] ?? 0,
        max: values[count - 1] ?? 0,
        p50,
        p95,
      });
    }
    return { variableId, from, to, period, buckets: result };
  }

  getHealthKitAnchor(variableId: string): HealthKitAnchor | null {
    const row = this.db
      .prepare("SELECT * FROM healthkit_sync_state WHERE variable_id = ?")
      .get(variableId) as AnchorRow | undefined;
    if (!row) return null;
    return {
      variableId: row.variable_id,
      anchorBlob: row.anchor_blob,
      lastSyncedAt: row.last_synced_at,
    };
  }

  setHealthKitAnchor(anchor: HealthKitAnchor): void {
    this.db
      .prepare(
        `INSERT INTO healthkit_sync_state (variable_id, anchor_blob, last_synced_at)
         VALUES (@variable_id, @anchor_blob, @last_synced_at)
         ON CONFLICT(variable_id) DO UPDATE SET
           anchor_blob = excluded.anchor_blob,
           last_synced_at = excluded.last_synced_at`,
      )
      .run({
        variable_id: anchor.variableId,
        anchor_blob: anchor.anchorBlob,
        last_synced_at: anchor.lastSyncedAt,
      });
  }
}

function bucketKey(ts: number, period: StatsResult["period"]): number {
  const d = new Date(ts);
  switch (period) {
    case "raw":
      return ts;
    case "hour":
      d.setMinutes(0, 0, 0);
      return d.getTime();
    case "day":
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    case "week": {
      d.setHours(0, 0, 0, 0);
      const day = (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - day);
      return d.getTime();
    }
    case "month":
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    case "year":
      d.setMonth(0, 1);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    default:
      return ts;
  }
}
