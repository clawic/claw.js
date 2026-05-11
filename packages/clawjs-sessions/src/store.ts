import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import Database from "better-sqlite3";

import type {
  AppendMessageInput,
  CreateSessionInput,
  ListSessionsFilter,
  ListSessionsResult,
  MessageRole,
  SearchSessionsInput,
  SessionMessageRecord,
  SessionOriginRecord,
  SessionRecord,
  SessionSearchHit,
  SessionStatus,
  SessionWithMessages,
  UpsertOriginInput,
} from "./types.ts";

const SCHEMA_DDL = `
  CREATE TABLE IF NOT EXISTS sessions (
    id                 TEXT PRIMARY KEY,
    agent              TEXT NOT NULL,
    runtime            TEXT,
    machine            TEXT,
    workspace_id       TEXT,
    project_path       TEXT,
    title              TEXT NOT NULL,
    created_at         INTEGER NOT NULL,
    last_message_at    INTEGER,
    message_count      INTEGER NOT NULL DEFAULT 0,
    pinned             INTEGER NOT NULL DEFAULT 0,
    archived           INTEGER NOT NULL DEFAULT 0,
    sidebar_visible    INTEGER NOT NULL DEFAULT 1,
    branch             TEXT,
    cwd                TEXT,
    status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','interrupted','archived')),
    custom_metadata    TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_agent          ON sessions(agent);
  CREATE INDEX IF NOT EXISTS idx_sessions_runtime        ON sessions(runtime);
  CREATE INDEX IF NOT EXISTS idx_sessions_machine        ON sessions(machine);
  CREATE INDEX IF NOT EXISTS idx_sessions_project        ON sessions(project_path);
  CREATE INDEX IF NOT EXISTS idx_sessions_workspace      ON sessions(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_created_at     ON sessions(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_last_message   ON sessions(last_message_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_pinned         ON sessions(pinned, last_message_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_status         ON sessions(status, last_message_at DESC);

  CREATE TABLE IF NOT EXISTS session_messages (
    id                 TEXT PRIMARY KEY,
    session_id         TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role               TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
    content_text       TEXT NOT NULL,
    content_blocks     TEXT,
    timestamp          INTEGER NOT NULL,
    tool_calls         TEXT,
    work_summary       TEXT,
    audio_ref          TEXT,
    attachments        TEXT,
    source_native_id   TEXT,
    UNIQUE (session_id, source_native_id)
  );
  CREATE INDEX IF NOT EXISTS idx_messages_session_time   ON session_messages(session_id, timestamp);
  CREATE INDEX IF NOT EXISTS idx_messages_session_role   ON session_messages(session_id, role);

  CREATE TABLE IF NOT EXISTS session_origins (
    session_id         TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    native_path        TEXT NOT NULL,
    native_format      TEXT NOT NULL,
    last_synced_at     INTEGER NOT NULL,
    mirror_hash        TEXT,
    PRIMARY KEY (session_id, native_path)
  );
  CREATE INDEX IF NOT EXISTS idx_origins_path            ON session_origins(native_path);
  CREATE INDEX IF NOT EXISTS idx_origins_format          ON session_origins(native_format);

  CREATE VIRTUAL TABLE IF NOT EXISTS fts_messages USING fts5(
    content_text,
    content='session_messages',
    content_rowid='rowid',
    tokenize='porter unicode61'
  );

  CREATE TRIGGER IF NOT EXISTS session_messages_ai AFTER INSERT ON session_messages BEGIN
    INSERT INTO fts_messages(rowid, content_text) VALUES (new.rowid, new.content_text);
  END;
  CREATE TRIGGER IF NOT EXISTS session_messages_ad AFTER DELETE ON session_messages BEGIN
    INSERT INTO fts_messages(fts_messages, rowid, content_text) VALUES('delete', old.rowid, old.content_text);
  END;
  CREATE TRIGGER IF NOT EXISTS session_messages_au AFTER UPDATE ON session_messages BEGIN
    INSERT INTO fts_messages(fts_messages, rowid, content_text) VALUES('delete', old.rowid, old.content_text);
    INSERT INTO fts_messages(rowid, content_text) VALUES (new.rowid, new.content_text);
  END;
`;

interface SessionRow {
  id: string;
  agent: string;
  runtime: string | null;
  machine: string | null;
  workspace_id: string | null;
  project_path: string | null;
  title: string;
  created_at: number;
  last_message_at: number | null;
  message_count: number;
  pinned: number;
  archived: number;
  sidebar_visible: number;
  branch: string | null;
  cwd: string | null;
  status: SessionStatus;
  custom_metadata: string | null;
}

interface MessageRow {
  id: string;
  session_id: string;
  role: MessageRole;
  content_text: string;
  content_blocks: string | null;
  timestamp: number;
  tool_calls: string | null;
  work_summary: string | null;
  audio_ref: string | null;
  attachments: string | null;
  source_native_id: string | null;
}

interface OriginRow {
  session_id: string;
  native_path: string;
  native_format: string;
  last_synced_at: number;
  mirror_hash: string | null;
}

function parseJson<T>(value: string | null): T | null {
  if (value == null) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function rowToSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    agent: row.agent,
    runtime: row.runtime,
    machine: row.machine,
    workspaceId: row.workspace_id,
    projectPath: row.project_path,
    title: row.title,
    createdAt: row.created_at,
    lastMessageAt: row.last_message_at,
    messageCount: row.message_count,
    pinned: row.pinned === 1,
    archived: row.archived === 1,
    sidebarVisible: row.sidebar_visible === 1,
    branch: row.branch,
    cwd: row.cwd,
    status: row.status,
    customMetadata: parseJson<Record<string, unknown>>(row.custom_metadata),
  };
}

function rowToMessage(row: MessageRow): SessionMessageRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    contentText: row.content_text,
    contentBlocks: parseJson<unknown[]>(row.content_blocks),
    timestamp: row.timestamp,
    toolCalls: parseJson<unknown[]>(row.tool_calls),
    workSummary: parseJson<unknown>(row.work_summary),
    audioRef: parseJson<{ id: string; mimeType: string; durationMs: number }>(row.audio_ref),
    attachments: parseJson<unknown[]>(row.attachments),
    sourceNativeId: row.source_native_id,
  };
}

function rowToOrigin(row: OriginRow): SessionOriginRecord {
  return {
    sessionId: row.session_id,
    nativePath: row.native_path,
    nativeFormat: row.native_format,
    lastSyncedAt: row.last_synced_at,
    mirrorHash: row.mirror_hash,
  };
}

export class SessionsServiceStore {
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

  createSession(input: CreateSessionInput): SessionRecord {
    const id = input.id ?? randomUUID();
    const createdAt = input.createdAt ?? Date.now();
    const title = input.title?.trim() || `${input.agent} session ${new Date(createdAt).toISOString().slice(0, 16)}`;
    this.db.prepare(`
      INSERT INTO sessions (
        id, agent, runtime, machine, workspace_id, project_path, title,
        created_at, last_message_at, message_count, pinned, archived, sidebar_visible,
        branch, cwd, status, custom_metadata
      ) VALUES (
        @id, @agent, @runtime, @machine, @workspace_id, @project_path, @title,
        @created_at, NULL, 0, 0, 0, 1,
        @branch, @cwd, @status, @custom_metadata
      )
      ON CONFLICT(id) DO NOTHING
    `).run({
      id,
      agent: input.agent,
      runtime: input.runtime ?? null,
      machine: input.machine ?? null,
      workspace_id: input.workspaceId ?? null,
      project_path: input.projectPath ?? null,
      title,
      created_at: createdAt,
      branch: input.branch ?? null,
      cwd: input.cwd ?? null,
      status: input.status ?? "active",
      custom_metadata: input.customMetadata ? JSON.stringify(input.customMetadata) : null,
    });
    const session = this.getSession(id);
    if (!session) throw new Error(`createSession: failed to read back ${id}`);
    return session;
  }

  getSession(id: string): SessionRecord | null {
    const row = this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | undefined;
    return row ? rowToSession(row) : null;
  }

  getSessionWithMessages(id: string, limit = 500): SessionWithMessages | null {
    const session = this.getSession(id);
    if (!session) return null;
    const messages = this.listMessages(id, limit);
    return { session, messages };
  }

  listSessions(filter: ListSessionsFilter = {}): ListSessionsResult {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    if (filter.agent) { conditions.push("agent = @agent"); params.agent = filter.agent; }
    if (filter.runtime) { conditions.push("runtime = @runtime"); params.runtime = filter.runtime; }
    if (filter.machine) { conditions.push("machine = @machine"); params.machine = filter.machine; }
    if (filter.workspaceId) { conditions.push("workspace_id = @workspace_id"); params.workspace_id = filter.workspaceId; }
    if (filter.projectPath) { conditions.push("project_path = @project_path"); params.project_path = filter.projectPath; }
    if (filter.pinned !== undefined) { conditions.push("pinned = @pinned"); params.pinned = filter.pinned ? 1 : 0; }
    if (filter.archived !== undefined) { conditions.push("archived = @archived"); params.archived = filter.archived ? 1 : 0; }
    if (filter.sidebarVisible !== undefined) { conditions.push("sidebar_visible = @sidebar_visible"); params.sidebar_visible = filter.sidebarVisible ? 1 : 0; }
    if (filter.status) { conditions.push("status = @status"); params.status = filter.status; }
    if (filter.fromCreatedAt !== undefined) { conditions.push("created_at >= @from_created_at"); params.from_created_at = filter.fromCreatedAt; }
    if (filter.toCreatedAt !== undefined) { conditions.push("created_at <= @to_created_at"); params.to_created_at = filter.toCreatedAt; }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.min(filter.limit ?? 100, 1000);
    const offset = filter.offset ?? 0;

    const total = (this.db.prepare(`SELECT COUNT(*) AS n FROM sessions ${where}`).get(params) as { n: number }).n;
    const rows = this.db.prepare(
      `SELECT * FROM sessions ${where} ORDER BY pinned DESC, COALESCE(last_message_at, created_at) DESC LIMIT ${limit} OFFSET ${offset}`,
    ).all(params) as SessionRow[];
    return { items: rows.map(rowToSession), total };
  }

  updateSessionTitle(id: string, title: string): SessionRecord | null {
    const trimmed = title.trim();
    if (!trimmed) throw new Error("updateSessionTitle: title cannot be empty");
    this.db.prepare("UPDATE sessions SET title = ? WHERE id = ?").run(trimmed, id);
    return this.getSession(id);
  }

  setPinned(id: string, pinned: boolean): SessionRecord | null {
    this.db.prepare("UPDATE sessions SET pinned = ? WHERE id = ?").run(pinned ? 1 : 0, id);
    return this.getSession(id);
  }

  setArchived(id: string, archived: boolean): SessionRecord | null {
    this.db.prepare("UPDATE sessions SET archived = ? WHERE id = ?").run(archived ? 1 : 0, id);
    return this.getSession(id);
  }

  setSidebarVisibility(id: string, visible: boolean): SessionRecord | null {
    this.db.prepare("UPDATE sessions SET sidebar_visible = ? WHERE id = ?").run(visible ? 1 : 0, id);
    return this.getSession(id);
  }

  assignProject(id: string, projectPath: string | null): SessionRecord | null {
    this.db.prepare("UPDATE sessions SET project_path = ? WHERE id = ?").run(projectPath, id);
    return this.getSession(id);
  }

  setStatus(id: string, status: SessionStatus): SessionRecord | null {
    this.db.prepare("UPDATE sessions SET status = ? WHERE id = ?").run(status, id);
    return this.getSession(id);
  }

  deleteSession(id: string): boolean {
    const info = this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    return info.changes > 0;
  }

  appendMessage(input: AppendMessageInput): SessionMessageRecord {
    return this.appendMessageResult(input).message;
  }

  appendMessageResult(input: AppendMessageInput): { message: SessionMessageRecord; inserted: boolean } {
    const id = input.id ?? randomUUID();
    const timestamp = input.timestamp ?? Date.now();
    const tx = this.db.transaction(() => {
      if (input.sourceNativeId) {
        const existing = this.db.prepare(
          "SELECT id FROM session_messages WHERE session_id = ? AND source_native_id = ?",
        ).get(input.sessionId, input.sourceNativeId) as { id: string } | undefined;
        if (existing) return { id: existing.id, inserted: false };
      }
      this.db.prepare(`
        INSERT INTO session_messages (
          id, session_id, role, content_text, content_blocks, timestamp,
          tool_calls, work_summary, audio_ref, attachments, source_native_id
        ) VALUES (
          @id, @session_id, @role, @content_text, @content_blocks, @timestamp,
          @tool_calls, @work_summary, @audio_ref, @attachments, @source_native_id
        )
      `).run({
        id,
        session_id: input.sessionId,
        role: input.role,
        content_text: input.contentText,
        content_blocks: input.contentBlocks ? JSON.stringify(input.contentBlocks) : null,
        timestamp,
        tool_calls: input.toolCalls ? JSON.stringify(input.toolCalls) : null,
        work_summary: input.workSummary != null ? JSON.stringify(input.workSummary) : null,
        audio_ref: input.audioRef ? JSON.stringify(input.audioRef) : null,
        attachments: input.attachments ? JSON.stringify(input.attachments) : null,
        source_native_id: input.sourceNativeId ?? null,
      });
      this.db.prepare(`
        UPDATE sessions
        SET message_count = message_count + 1,
            last_message_at = CASE
              WHEN last_message_at IS NULL OR last_message_at < @timestamp THEN @timestamp
              ELSE last_message_at
            END
        WHERE id = @session_id
      `).run({ session_id: input.sessionId, timestamp });
      return { id, inserted: true };
    });
    const resolved = tx();
    const row = this.db.prepare("SELECT * FROM session_messages WHERE id = ?").get(resolved.id) as MessageRow | undefined;
    if (!row) throw new Error(`appendMessage: failed to read back ${resolved.id}`);
    return { message: rowToMessage(row), inserted: resolved.inserted };
  }

  listMessages(sessionId: string, limit = 500, offset = 0): SessionMessageRecord[] {
    const rows = this.db.prepare(
      `SELECT * FROM session_messages
       WHERE session_id = ?
       ORDER BY timestamp ASC, rowid ASC
       LIMIT ? OFFSET ?`,
    ).all(sessionId, Math.min(limit, 5000), offset) as MessageRow[];
    return rows.map(rowToMessage);
  }

  searchMessages(input: SearchSessionsInput): SessionSearchHit[] {
    const query = input.query.trim();
    if (!query) return [];
    const limit = Math.min(input.limit ?? 50, 200);

    const conditions: string[] = [];
    const params: Record<string, unknown> = { query, limit };
    if (input.agent) { conditions.push("s.agent = @agent"); params.agent = input.agent; }
    if (input.projectPath) { conditions.push("s.project_path = @project_path"); params.project_path = input.projectPath; }
    const extra = conditions.length ? `AND ${conditions.join(" AND ")}` : "";

    const rows = this.db.prepare(
      `SELECT m.*, s.*,
              snippet(fts_messages, 0, '<<', '>>', '...', 32) AS snippet,
              bm25(fts_messages) AS rank
       FROM fts_messages
       JOIN session_messages m ON m.rowid = fts_messages.rowid
       JOIN sessions s         ON s.id = m.session_id
       WHERE fts_messages MATCH @query
       ${extra}
       ORDER BY rank ASC
       LIMIT @limit`,
    ).all(params) as Array<MessageRow & SessionRow & { snippet: string; rank: number }>;

    return rows.map((row) => ({
      session: rowToSession(row),
      message: rowToMessage(row),
      snippet: row.snippet,
      rank: row.rank,
    }));
  }

  upsertOrigin(input: UpsertOriginInput): SessionOriginRecord {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO session_origins (session_id, native_path, native_format, last_synced_at, mirror_hash)
      VALUES (@session_id, @native_path, @native_format, @last_synced_at, @mirror_hash)
      ON CONFLICT(session_id, native_path) DO UPDATE SET
        native_format  = excluded.native_format,
        last_synced_at = excluded.last_synced_at,
        mirror_hash    = excluded.mirror_hash
    `).run({
      session_id: input.sessionId,
      native_path: input.nativePath,
      native_format: input.nativeFormat,
      last_synced_at: now,
      mirror_hash: input.mirrorHash ?? null,
    });
    const row = this.db.prepare(
      "SELECT * FROM session_origins WHERE session_id = ? AND native_path = ?",
    ).get(input.sessionId, input.nativePath) as OriginRow;
    return rowToOrigin(row);
  }

  listOrigins(sessionId: string): SessionOriginRecord[] {
    const rows = this.db.prepare(
      "SELECT * FROM session_origins WHERE session_id = ? ORDER BY last_synced_at DESC",
    ).all(sessionId) as OriginRow[];
    return rows.map(rowToOrigin);
  }

  findOriginByPath(nativePath: string): SessionOriginRecord | null {
    const row = this.db.prepare(
      "SELECT * FROM session_origins WHERE native_path = ? ORDER BY last_synced_at DESC LIMIT 1",
    ).get(nativePath) as OriginRow | undefined;
    return row ? rowToOrigin(row) : null;
  }

  exportTrajectories(options: { agent?: string; sinceCreatedAt?: number; includeFailed?: boolean; tag?: string } = {}): import("./types.ts").TrajectoryRecord[] {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    if (options.agent) { conditions.push("agent = @agent"); params.agent = options.agent; }
    if (options.sinceCreatedAt !== undefined) { conditions.push("created_at >= @since"); params.since = options.sinceCreatedAt; }
    if (!options.includeFailed) { conditions.push("status IN ('active','completed')"); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const sessionRows = this.db.prepare(`SELECT * FROM sessions ${where} ORDER BY created_at ASC`).all(params) as SessionRow[];
    const trajectories: import("./types.ts").TrajectoryRecord[] = [];
    for (const row of sessionRows) {
      const session = rowToSession(row);
      const messages = this.listMessages(session.id, 5000);
      const lastMessageAt = session.lastMessageAt ?? session.createdAt;
      const outcome: import("./types.ts").TrajectoryRecord["outcome"] =
        session.status === "completed" ? "success"
        : session.status === "interrupted" ? "failure"
        : session.status === "archived" ? "partial"
        : "unknown";
      trajectories.push({
        sessionId: session.id,
        agent: session.agent,
        runtime: session.runtime,
        createdAt: session.createdAt,
        outcome,
        outcomeReason: null,
        durationMs: lastMessageAt - session.createdAt,
        messages,
        metadata: {
          messageCount: session.messageCount,
          tag: options.tag ?? null,
          projectPath: session.projectPath,
        },
      });
    }
    return trajectories;
  }
}
