import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import Database from "better-sqlite3";

import type {
  CommitSnapshotInput,
  ForgetInput,
  ForgetResult,
  UpdateItemInput,
  UpsertItemInput,
  UserModelSection,
  UserProfileBySection,
  UserProfileHistoryRecord,
  UserProfileItem,
  UserProfileSnapshot,
} from "./types.ts";
import { USER_MODEL_SECTIONS } from "./types.ts";

const SCHEMA_DDL = `
  CREATE TABLE IF NOT EXISTS user_profile_items (
    id              TEXT PRIMARY KEY,
    section         TEXT NOT NULL CHECK (section IN ('communication_style','expertise','project','edge_case','preference','goal','blocker')),
    content_text    TEXT NOT NULL,
    confidence      REAL,
    source          TEXT NOT NULL DEFAULT 'manual',
    topic           TEXT,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    metadata_json   TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_upi_section        ON user_profile_items(section, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_upi_topic          ON user_profile_items(topic);
  CREATE INDEX IF NOT EXISTS idx_upi_source         ON user_profile_items(source);

  CREATE TABLE IF NOT EXISTS user_profile_meta (
    id                  INTEGER PRIMARY KEY CHECK (id = 1),
    last_refresh_at     INTEGER,
    last_refresh_reason TEXT
  );
  INSERT OR IGNORE INTO user_profile_meta (id, last_refresh_at) VALUES (1, NULL);

  CREATE TABLE IF NOT EXISTS user_profile_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_json   TEXT NOT NULL,
    snapshot_at     INTEGER NOT NULL,
    reason          TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_uph_at             ON user_profile_history(snapshot_at DESC);
`;

interface ItemRow {
  id: string;
  section: UserModelSection;
  content_text: string;
  confidence: number | null;
  source: string;
  topic: string | null;
  created_at: number;
  updated_at: number;
  metadata_json: string | null;
}

interface MetaRow {
  id: 1;
  last_refresh_at: number | null;
  last_refresh_reason: string | null;
}

interface HistoryRow {
  id: number;
  snapshot_json: string;
  snapshot_at: number;
  reason: string | null;
}

function parseJson<T>(value: string | null): T | null {
  if (value == null) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function rowToItem(row: ItemRow): UserProfileItem {
  return {
    id: row.id,
    section: row.section,
    contentText: row.content_text,
    confidence: row.confidence,
    source: row.source,
    topic: row.topic,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: parseJson<Record<string, unknown>>(row.metadata_json),
  };
}

export class UserModelServiceStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(SCHEMA_DDL);
  }

  close(): void {
    this.db.close();
  }

  listItems(section?: UserModelSection): UserProfileItem[] {
    if (section) {
      const rows = this.db.prepare(
        "SELECT * FROM user_profile_items WHERE section = ? ORDER BY updated_at DESC",
      ).all(section) as ItemRow[];
      return rows.map(rowToItem);
    }
    const rows = this.db.prepare(
      "SELECT * FROM user_profile_items ORDER BY section ASC, updated_at DESC",
    ).all() as ItemRow[];
    return rows.map(rowToItem);
  }

  getItem(id: string): UserProfileItem | null {
    const row = this.db.prepare("SELECT * FROM user_profile_items WHERE id = ?").get(id) as ItemRow | undefined;
    return row ? rowToItem(row) : null;
  }

  upsertItem(input: UpsertItemInput): UserProfileItem {
    const id = input.id ?? randomUUID();
    const now = Date.now();
    const existing = this.db.prepare("SELECT id, created_at FROM user_profile_items WHERE id = ?").get(id) as
      | { id: string; created_at: number }
      | undefined;
    if (existing) {
      this.db.prepare(`
        UPDATE user_profile_items
        SET content_text = @content_text,
            confidence   = @confidence,
            source       = @source,
            topic        = @topic,
            updated_at   = @updated_at,
            metadata_json = @metadata_json
        WHERE id = @id
      `).run({
        id,
        content_text: input.contentText,
        confidence: input.confidence ?? null,
        source: input.source ?? "manual",
        topic: input.topic ?? null,
        updated_at: now,
        metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
      });
    } else {
      this.db.prepare(`
        INSERT INTO user_profile_items (
          id, section, content_text, confidence, source, topic, created_at, updated_at, metadata_json
        ) VALUES (
          @id, @section, @content_text, @confidence, @source, @topic, @created_at, @updated_at, @metadata_json
        )
      `).run({
        id,
        section: input.section,
        content_text: input.contentText,
        confidence: input.confidence ?? null,
        source: input.source ?? "manual",
        topic: input.topic ?? null,
        created_at: now,
        updated_at: now,
        metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
      });
    }
    const item = this.getItem(id);
    if (!item) throw new Error(`upsertItem: failed to read back ${id}`);
    return item;
  }

  updateItem(id: string, patch: UpdateItemInput): UserProfileItem | null {
    const existing = this.getItem(id);
    if (!existing) return null;
    const now = Date.now();
    this.db.prepare(`
      UPDATE user_profile_items
      SET content_text  = @content_text,
          confidence    = @confidence,
          topic         = @topic,
          updated_at    = @updated_at,
          metadata_json = @metadata_json
      WHERE id = @id
    `).run({
      id,
      content_text: patch.contentText ?? existing.contentText,
      confidence: patch.confidence === undefined ? existing.confidence : patch.confidence,
      topic: patch.topic === undefined ? existing.topic : patch.topic,
      updated_at: now,
      metadata_json: patch.metadata === undefined
        ? (existing.metadata ? JSON.stringify(existing.metadata) : null)
        : (patch.metadata ? JSON.stringify(patch.metadata) : null),
    });
    return this.getItem(id);
  }

  deleteItem(id: string): boolean {
    const info = this.db.prepare("DELETE FROM user_profile_items WHERE id = ?").run(id);
    return info.changes > 0;
  }

  forget(input: ForgetInput): ForgetResult {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    if (input.section) { conditions.push("section = @section"); params.section = input.section; }
    if (input.topic) { conditions.push("topic = @topic"); params.topic = input.topic; }
    if (input.about) {
      conditions.push("(content_text LIKE @like OR topic LIKE @like)");
      params.like = `%${input.about}%`;
    }
    if (input.ids && input.ids.length > 0) {
      const placeholders = input.ids.map((_, idx) => `@id${idx}`).join(",");
      conditions.push(`id IN (${placeholders})`);
      input.ids.forEach((value, idx) => { params[`id${idx}`] = value; });
    }
    if (conditions.length === 0) {
      return { forgottenCount: 0, forgottenIds: [] };
    }
    const where = conditions.join(" AND ");
    const idRows = this.db.prepare(`SELECT id FROM user_profile_items WHERE ${where}`).all(params) as { id: string }[];
    const ids = idRows.map((row) => row.id);
    if (ids.length === 0) return { forgottenCount: 0, forgottenIds: [] };
    const info = this.db.prepare(`DELETE FROM user_profile_items WHERE ${where}`).run(params);
    return { forgottenCount: info.changes, forgottenIds: ids };
  }

  snapshot(): UserProfileSnapshot {
    const items = this.listItems();
    const meta = this.db.prepare("SELECT * FROM user_profile_meta WHERE id = 1").get() as MetaRow | undefined;
    return {
      items,
      capturedAt: Date.now(),
      lastRefreshAt: meta?.last_refresh_at ?? null,
    };
  }

  bySection(): UserProfileBySection {
    const result: UserProfileBySection = {
      communication_style: [],
      expertise: [],
      project: [],
      edge_case: [],
      preference: [],
      goal: [],
      blocker: [],
    };
    for (const item of this.listItems()) {
      result[item.section].push(item);
    }
    return result;
  }

  commitSnapshot(input: CommitSnapshotInput = {}): UserProfileHistoryRecord {
    const snap = this.snapshot();
    const info = this.db.prepare(
      "INSERT INTO user_profile_history (snapshot_json, snapshot_at, reason) VALUES (@json, @at, @reason)",
    ).run({
      json: JSON.stringify(snap),
      at: snap.capturedAt,
      reason: input.reason ?? null,
    });
    const row = this.db.prepare("SELECT * FROM user_profile_history WHERE id = ?").get(info.lastInsertRowid) as HistoryRow;
    return {
      id: row.id,
      snapshot: snap,
      snapshotAt: row.snapshot_at,
      reason: row.reason,
    };
  }

  listHistory(limit = 50): UserProfileHistoryRecord[] {
    const rows = this.db.prepare(
      "SELECT * FROM user_profile_history ORDER BY snapshot_at DESC LIMIT ?",
    ).all(Math.min(limit, 500)) as HistoryRow[];
    return rows.map((row) => ({
      id: row.id,
      snapshot: JSON.parse(row.snapshot_json) as UserProfileSnapshot,
      snapshotAt: row.snapshot_at,
      reason: row.reason,
    }));
  }

  setRefreshMetadata(reason?: string | null): void {
    this.db.prepare(
      "UPDATE user_profile_meta SET last_refresh_at = @at, last_refresh_reason = @reason WHERE id = 1",
    ).run({ at: Date.now(), reason: reason ?? null });
  }

  countBySection(): Record<UserModelSection, number> {
    const result = {} as Record<UserModelSection, number>;
    for (const section of USER_MODEL_SECTIONS) result[section] = 0;
    const rows = this.db.prepare(
      "SELECT section, COUNT(*) AS n FROM user_profile_items GROUP BY section",
    ).all() as Array<{ section: UserModelSection; n: number }>;
    for (const row of rows) result[row.section] = row.n;
    return result;
  }
}
