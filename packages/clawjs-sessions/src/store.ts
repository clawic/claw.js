import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

import Database from "better-sqlite3";

// @clawjs-persistent-surface-ddl-source

import type {
  AppendMessageInput,
  CreateProjectInput,
  CreateSessionInput,
  ListProjectsFilter,
  ListProjectsResult,
  ListSessionsFilter,
  ListSessionsResult,
  MessageRole,
  ProjectRecord,
  SearchSessionsInput,
  SidebarBootstrapResult,
  SessionMessageRecord,
  SessionOriginRecord,
  SessionRecord,
  SessionSearchHit,
  SessionStatus,
  SessionWithMessages,
  UpdateProjectInput,
  UpsertOriginInput,
  ExportTrajectoryOptions,
  ImportSessionBatchInput,
} from "./types.ts";

const DEFAULT_MESSAGE_LIST_LIMIT = 200;
const MAX_MESSAGE_LIST_LIMIT = 1000;
const DEFAULT_EXPORT_SESSION_LIMIT = 100;
const MAX_EXPORT_SESSION_LIMIT = 500;
const DEFAULT_EXPORT_MESSAGE_LIMIT = 1000;
const MAX_EXPORT_MESSAGE_LIMIT = 2000;

const SCHEMA_DDL = `
  CREATE TABLE IF NOT EXISTS projects (
    id                 TEXT PRIMARY KEY,
    resource_id        TEXT,
    display_name       TEXT NOT NULL,
    path               TEXT NOT NULL UNIQUE,
    hidden             INTEGER NOT NULL DEFAULT 0,
    archived           INTEGER NOT NULL DEFAULT 0,
    sort_rank          INTEGER NOT NULL DEFAULT 0,
    created_at         INTEGER NOT NULL,
    updated_at         INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_projects_hidden_archived ON projects(hidden, archived, sort_rank, updated_at DESC);

  CREATE TABLE IF NOT EXISTS sessions (
    id                 TEXT PRIMARY KEY,
    agent              TEXT NOT NULL,
    runtime            TEXT,
    runtime_adapter    TEXT,
    runtime_session_id TEXT,
    machine            TEXT,
    workspace_id       TEXT,
    project_id         TEXT REFERENCES projects(id) ON DELETE SET NULL,
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
  CREATE INDEX IF NOT EXISTS idx_sessions_sidebar_bootstrap
    ON sessions(archived, sidebar_visible, pinned, last_message_at DESC, created_at DESC);

  CREATE TABLE IF NOT EXISTS session_messages (
    id                 TEXT PRIMARY KEY,
    session_id         TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role               TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
    content_text       TEXT NOT NULL,
    content_blocks     TEXT,
    timestamp          INTEGER NOT NULL,
    tool_calls         TEXT,
    timeline           TEXT,
    work_summary       TEXT,
    streaming_state    TEXT,
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
    source_mtime_ms    REAL,
    source_size        INTEGER,
    source_ino         INTEGER,
    source_dev         INTEGER,
    source_cursor_line INTEGER,
    source_cursor_hash TEXT,
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
const SESSIONS_SCHEMA_META_TABLE = "sessions_service_schema_meta";
const SESSIONS_SCHEMA_VERSION = 2;

interface SessionRow {
  id: string;
  agent: string;
  runtime: string | null;
  runtime_adapter: string | null;
  runtime_session_id: string | null;
  machine: string | null;
  workspace_id: string | null;
  project_id: string | null;
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
  timeline: string | null;
  work_summary: string | null;
  streaming_state: import("./types.ts").MessageStreamingState | null;
  audio_ref: string | null;
  attachments: string | null;
  source_native_id: string | null;
}

interface ProjectRow {
  id: string;
  resource_id: string | null;
  display_name: string;
  path: string;
  hidden: number;
  archived: number;
  sort_rank: number;
  created_at: number;
  updated_at: number;
}

interface OriginRow {
  session_id: string;
  native_path: string;
  native_format: string;
  last_synced_at: number;
  mirror_hash: string | null;
  source_mtime_ms: number | null;
  source_size: number | null;
  source_ino: number | null;
  source_dev: number | null;
  source_cursor_line: number | null;
  source_cursor_hash: string | null;
}

function parseJson<T>(value: string | null): T | null {
  if (value == null) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function normalizeProjectPath(projectPath: string): string {
  const trimmed = projectPath.trim();
  if (!trimmed) throw new Error("project path cannot be empty");
  const resolved = path.resolve(trimmed);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function stableProjectIdFromPath(projectPath: string): string {
  const normalized = normalizeProjectPath(projectPath);
  const hash = createHash("sha1").update(normalized).digest("hex").slice(0, 20);
  return `project_${hash}`;
}

function displayNameFromPath(projectPath: string): string {
  const base = path.basename(projectPath);
  return base || projectPath;
}

function rowToProject(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    resourceId: row.resource_id,
    displayName: row.display_name,
    path: row.path,
    hidden: row.hidden === 1,
    archived: row.archived === 1,
    sortRank: row.sort_rank,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    agent: row.agent,
    runtime: row.runtime,
    machine: row.machine,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    projectPath: row.project_path,
    runtimeAdapter: row.runtime_adapter,
    runtimeSessionId: row.runtime_session_id,
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
    timeline: parseJson<unknown[]>(row.timeline),
    workSummary: parseJson<unknown>(row.work_summary),
    streamingState: row.streaming_state,
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
    sourceMtimeMs: row.source_mtime_ms,
    sourceSize: row.source_size,
    sourceIno: row.source_ino,
    sourceDev: row.source_dev,
    sourceCursorLine: row.source_cursor_line,
    sourceCursorHash: row.source_cursor_hash,
  };
}

export class SessionsServiceStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.ensureSchema();
  }

  close(): void {
    this.db.close();
  }

  private ensureSchema(): void {
    if (this.schemaVersion() >= SESSIONS_SCHEMA_VERSION) return;
    this.db.exec(SCHEMA_DDL);
    this.ensureLegacyColumns();
    this.markSchemaCurrent();
  }

  private schemaVersion(): number {
    const table = this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(SESSIONS_SCHEMA_META_TABLE);
    if (!table) return 0;
    const row = this.db.prepare(`SELECT version FROM ${SESSIONS_SCHEMA_META_TABLE} WHERE id = 'schema'`).get() as { version: number } | undefined;
    return row?.version ?? 0;
  }

  private markSchemaCurrent(): void {
    this.db.prepare(`CREATE TABLE IF NOT EXISTS ${SESSIONS_SCHEMA_META_TABLE} (id TEXT PRIMARY KEY, version INTEGER NOT NULL, updated_at INTEGER NOT NULL)`).run();
    this.db.prepare(`
      INSERT INTO ${SESSIONS_SCHEMA_META_TABLE} (id, version, updated_at)
      VALUES ('schema', ?, ?)
      ON CONFLICT(id) DO UPDATE SET version = excluded.version, updated_at = excluded.updated_at
    `).run(SESSIONS_SCHEMA_VERSION, Date.now());
  }

  private ensureLegacyColumns(): void {
    this.ensureColumn("sessions", "runtime_adapter", "TEXT");
    this.ensureColumn("sessions", "runtime_session_id", "TEXT");
    this.ensureColumn("sessions", "project_id", "TEXT REFERENCES projects(id) ON DELETE SET NULL");
    this.ensureColumn("projects", "resource_id", "TEXT");
    this.db.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_runtime_adapter ON sessions(runtime_adapter)").run();
    this.db.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id)").run();
    this.db.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_sidebar_bootstrap ON sessions(archived, sidebar_visible, pinned, last_message_at DESC, created_at DESC)").run();
    this.db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_resource_id ON projects(resource_id) WHERE resource_id IS NOT NULL").run();
    this.ensureColumn("session_messages", "timeline", "TEXT");
    this.ensureColumn("session_messages", "streaming_state", "TEXT");
    this.ensureColumn("session_origins", "source_mtime_ms", "REAL");
    this.ensureColumn("session_origins", "source_size", "INTEGER");
    this.ensureColumn("session_origins", "source_ino", "INTEGER");
    this.ensureColumn("session_origins", "source_dev", "INTEGER");
    this.ensureColumn("session_origins", "source_cursor_line", "INTEGER");
    this.ensureColumn("session_origins", "source_cursor_hash", "TEXT");
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const rows = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (rows.some((row) => row.name === column)) return;
    this.db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }

  createProject(input: CreateProjectInput): ProjectRecord {
    const normalizedPath = normalizeProjectPath(input.path);
    const now = input.createdAt ?? Date.now();
    const resourceId = input.resourceId?.trim() || null;
    const id = input.id ?? resourceId ?? stableProjectIdFromPath(normalizedPath);
    const displayName = input.displayName?.trim() || displayNameFromPath(normalizedPath);
    this.db.prepare(`
      INSERT INTO projects (
        id, resource_id, display_name, path, hidden, archived, sort_rank, created_at, updated_at
      ) VALUES (
        @id, @resource_id, @display_name, @path, @hidden, @archived, @sort_rank, @created_at, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        resource_id  = excluded.resource_id,
        display_name = excluded.display_name,
        path         = excluded.path,
        hidden       = excluded.hidden,
        archived     = excluded.archived,
        sort_rank    = excluded.sort_rank,
        updated_at   = excluded.updated_at
    `).run({
      id,
      resource_id: resourceId,
      display_name: displayName,
      path: normalizedPath,
      hidden: input.hidden ? 1 : 0,
      archived: input.archived ? 1 : 0,
      sort_rank: input.sortRank ?? 0,
      created_at: now,
      updated_at: now,
    });
    const project = this.getProject(id);
    if (!project) throw new Error(`createProject: failed to read back ${id}`);
    return project;
  }

  getProject(id: string): ProjectRecord | null {
    const row = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow | undefined;
    return row ? rowToProject(row) : null;
  }

  getProjectByPath(projectPath: string): ProjectRecord | null {
    const normalizedPath = normalizeProjectPath(projectPath);
    const row = this.db.prepare("SELECT * FROM projects WHERE path = ?").get(normalizedPath) as ProjectRow | undefined;
    return row ? rowToProject(row) : null;
  }

  getProjectByResourceId(resourceId: string): ProjectRecord | null {
    const row = this.db.prepare("SELECT * FROM projects WHERE resource_id = ?").get(resourceId) as ProjectRow | undefined;
    return row ? rowToProject(row) : null;
  }

  listProjects(filter: ListProjectsFilter = {}): ListProjectsResult {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    if (filter.hidden !== undefined) { conditions.push("hidden = @hidden"); params.hidden = filter.hidden ? 1 : 0; }
    if (filter.archived !== undefined) { conditions.push("archived = @archived"); params.archived = filter.archived ? 1 : 0; }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.min(filter.limit ?? 500, 1000);
    const offset = filter.offset ?? 0;
    const total = (this.db.prepare(`SELECT COUNT(*) AS n FROM projects ${where}`).get(params) as { n: number }).n;
    const rows = this.db.prepare(
      `SELECT * FROM projects ${where} ORDER BY sort_rank ASC, updated_at DESC LIMIT ${limit} OFFSET ${offset}`,
    ).all(params) as ProjectRow[];
    return { items: rows.map(rowToProject), total };
  }

  updateProject(id: string, patch: UpdateProjectInput): ProjectRecord | null {
    const existing = this.getProject(id);
    if (!existing) return null;
    const nextPath = patch.path !== undefined ? normalizeProjectPath(patch.path) : existing.path;
    const nextName = patch.displayName !== undefined ? patch.displayName.trim() : existing.displayName;
    const nextResourceId = patch.resourceId !== undefined ? patch.resourceId?.trim() || null : existing.resourceId;
    if (!nextName) throw new Error("updateProject: displayName cannot be empty");
    this.db.prepare(`
      UPDATE projects
      SET resource_id = @resource_id,
          display_name = @display_name,
          path = @path,
          hidden = @hidden,
          archived = @archived,
          sort_rank = @sort_rank,
          updated_at = @updated_at
      WHERE id = @id
    `).run({
      id,
      resource_id: nextResourceId,
      display_name: nextName,
      path: nextPath,
      hidden: (patch.hidden ?? existing.hidden) ? 1 : 0,
      archived: (patch.archived ?? existing.archived) ? 1 : 0,
      sort_rank: patch.sortRank ?? existing.sortRank,
      updated_at: Date.now(),
    });
    return this.getProject(id);
  }

  deleteProject(id: string): boolean {
    const tx = this.db.transaction(() => {
      this.db.prepare("UPDATE sessions SET project_id = NULL WHERE project_id = ?").run(id);
      return this.db.prepare("DELETE FROM projects WHERE id = ?").run(id).changes > 0;
    });
    return tx();
  }

  createSession(input: CreateSessionInput): SessionRecord {
    const id = input.id ?? randomUUID();
    const createdAt = input.createdAt ?? Date.now();
    const title = input.title?.trim() || `${input.agent} session ${new Date(createdAt).toISOString().slice(0, 16)}`;
    const inputProject = input.projectId ? this.getProject(input.projectId) : null;
    const projectPath = input.projectPath
      ? normalizeProjectPath(input.projectPath)
      : inputProject?.path ?? null;
    const projectId = inputProject?.id ?? (projectPath ? this.getProjectByPath(projectPath)?.id ?? null : null);
    this.db.prepare(`
      INSERT INTO sessions (
        id, agent, runtime, runtime_adapter, runtime_session_id, machine, workspace_id, project_id, project_path, title,
        created_at, last_message_at, message_count, pinned, archived, sidebar_visible,
        branch, cwd, status, custom_metadata
      ) VALUES (
        @id, @agent, @runtime, @runtime_adapter, @runtime_session_id, @machine, @workspace_id, @project_id, @project_path, @title,
        @created_at, NULL, 0, 0, 0, 1,
        @branch, @cwd, @status, @custom_metadata
      )
      ON CONFLICT(id) DO NOTHING
    `).run({
      id,
      agent: input.agent,
      runtime: input.runtime ?? null,
      runtime_adapter: input.runtimeAdapter ?? input.runtime ?? null,
      runtime_session_id: input.runtimeSessionId ?? null,
      machine: input.machine ?? null,
      workspace_id: input.workspaceId ?? null,
      project_id: projectId,
      project_path: projectPath,
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

  getSessionWithMessages(id: string, limit = DEFAULT_MESSAGE_LIST_LIMIT): SessionWithMessages | null {
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
    if (filter.projectId) { conditions.push("project_id = @project_id"); params.project_id = filter.projectId; }
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

  sidebarBootstrap(input: { recentLimit?: number } = {}): SidebarBootstrapResult {
    const recentLimit = Math.min(Math.max(input.recentLimit ?? 200, 0), 1000);
    const baseWhere = "archived = 0 AND sidebar_visible = 1";
    const totalActiveVisible = (this.db.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE ${baseWhere}`).get() as { n: number }).n;
    const projects = this.listProjects({ hidden: false, archived: false }).items;
    const pinnedRows = this.db.prepare(`
      SELECT * FROM sessions
      WHERE ${baseWhere} AND pinned = 1
      ORDER BY COALESCE(last_message_at, created_at) DESC
    `).all() as SessionRow[];
    const recentRows = this.db.prepare(`
      SELECT * FROM sessions
      WHERE ${baseWhere} AND pinned = 0
      ORDER BY COALESCE(last_message_at, created_at) DESC
      LIMIT ?
    `).all(recentLimit) as SessionRow[];
    return {
      projects,
      pinned: pinnedRows.map(rowToSession),
      recent: recentRows.map(rowToSession),
      totalActiveVisible,
    };
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
    const normalizedPath = projectPath ? normalizeProjectPath(projectPath) : null;
    const projectId = normalizedPath ? this.getProjectByPath(normalizedPath)?.id ?? null : null;
    this.db.prepare("UPDATE sessions SET project_id = ?, project_path = ? WHERE id = ?").run(projectId, normalizedPath, id);
    return this.getSession(id);
  }

  assignProjectById(id: string, projectId: string | null): SessionRecord | null {
    const project = projectId ? this.getProject(projectId) : null;
    this.db.prepare("UPDATE sessions SET project_id = ?, project_path = ? WHERE id = ?").run(
      project?.id ?? null,
      project?.path ?? null,
      id,
    );
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
          tool_calls, timeline, work_summary, streaming_state, audio_ref, attachments, source_native_id
        ) VALUES (
          @id, @session_id, @role, @content_text, @content_blocks, @timestamp,
          @tool_calls, @timeline, @work_summary, @streaming_state, @audio_ref, @attachments, @source_native_id
        )
      `).run({
        id,
        session_id: input.sessionId,
        role: input.role,
        content_text: input.contentText,
        content_blocks: input.contentBlocks ? JSON.stringify(input.contentBlocks) : null,
        timestamp,
        tool_calls: input.toolCalls ? JSON.stringify(input.toolCalls) : null,
        timeline: input.timeline ? JSON.stringify(input.timeline) : null,
        work_summary: input.workSummary != null ? JSON.stringify(input.workSummary) : null,
        streaming_state: input.streamingState ?? null,
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

  importSessionBatch(input: ImportSessionBatchInput): { messagesInserted: number } {
    const tx = this.db.transaction(() => {
      for (const session of input.sessions ?? []) this.createSession(session);
      let messagesInserted = 0;
      for (const message of input.messages ?? []) {
        const id = message.id ?? randomUUID();
        const timestamp = message.timestamp ?? Date.now();
        if (message.sourceNativeId) {
          const existing = this.db.prepare(
            "SELECT id FROM session_messages WHERE session_id = ? AND source_native_id = ?",
          ).get(message.sessionId, message.sourceNativeId) as { id: string } | undefined;
          if (existing) continue;
        }
        this.db.prepare(`
          INSERT INTO session_messages (
            id, session_id, role, content_text, content_blocks, timestamp,
            tool_calls, timeline, work_summary, streaming_state, audio_ref, attachments, source_native_id
          ) VALUES (
            @id, @session_id, @role, @content_text, @content_blocks, @timestamp,
            @tool_calls, @timeline, @work_summary, @streaming_state, @audio_ref, @attachments, @source_native_id
          )
        `).run({
          id,
          session_id: message.sessionId,
          role: message.role,
          content_text: message.contentText,
          content_blocks: message.contentBlocks ? JSON.stringify(message.contentBlocks) : null,
          timestamp,
          tool_calls: message.toolCalls ? JSON.stringify(message.toolCalls) : null,
          timeline: message.timeline ? JSON.stringify(message.timeline) : null,
          work_summary: message.workSummary != null ? JSON.stringify(message.workSummary) : null,
          streaming_state: message.streamingState ?? null,
          audio_ref: message.audioRef ? JSON.stringify(message.audioRef) : null,
          attachments: message.attachments ? JSON.stringify(message.attachments) : null,
          source_native_id: message.sourceNativeId ?? null,
        });
        this.db.prepare(`
          UPDATE sessions
          SET message_count = message_count + 1,
              last_message_at = CASE
                WHEN last_message_at IS NULL OR last_message_at < @timestamp THEN @timestamp
                ELSE last_message_at
              END
          WHERE id = @session_id
        `).run({ session_id: message.sessionId, timestamp });
        messagesInserted += 1;
      }
      if (input.origin) this.upsertOrigin(input.origin);
      return { messagesInserted };
    });
    return tx();
  }

  updateMessage(id: string, patch: Partial<Pick<AppendMessageInput, "contentText" | "contentBlocks" | "toolCalls" | "timeline" | "workSummary" | "streamingState" | "attachments">>): SessionMessageRecord | null {
    const row = this.db.prepare("SELECT * FROM session_messages WHERE id = ?").get(id) as MessageRow | undefined;
    if (!row) return null;
    const next = {
      id,
      content_text: patch.contentText ?? row.content_text,
      content_blocks: patch.contentBlocks !== undefined ? JSON.stringify(patch.contentBlocks) : row.content_blocks,
      tool_calls: patch.toolCalls !== undefined ? JSON.stringify(patch.toolCalls) : row.tool_calls,
      timeline: patch.timeline !== undefined ? JSON.stringify(patch.timeline) : row.timeline,
      work_summary: patch.workSummary !== undefined ? JSON.stringify(patch.workSummary) : row.work_summary,
      streaming_state: patch.streamingState !== undefined ? patch.streamingState : row.streaming_state,
      attachments: patch.attachments !== undefined ? JSON.stringify(patch.attachments) : row.attachments,
    };
    this.db.prepare(`
      UPDATE session_messages
      SET content_text = @content_text,
          content_blocks = @content_blocks,
          tool_calls = @tool_calls,
          timeline = @timeline,
          work_summary = @work_summary,
          streaming_state = @streaming_state,
          attachments = @attachments
      WHERE id = @id
    `).run(next);
    const updated = this.db.prepare("SELECT * FROM session_messages WHERE id = ?").get(id) as MessageRow;
    return rowToMessage(updated);
  }

  listMessages(sessionId: string, limit = DEFAULT_MESSAGE_LIST_LIMIT, offset = 0): SessionMessageRecord[] {
    const resolvedLimit = clampInt(limit, 1, MAX_MESSAGE_LIST_LIMIT, DEFAULT_MESSAGE_LIST_LIMIT);
    const resolvedOffset = clampInt(offset, 0, Number.MAX_SAFE_INTEGER, 0);
    const rows = this.db.prepare(
      `SELECT * FROM session_messages
       WHERE session_id = ?
       ORDER BY timestamp ASC, rowid ASC
       LIMIT ? OFFSET ?`,
    ).all(sessionId, resolvedLimit, resolvedOffset) as MessageRow[];
    return rows.map(rowToMessage);
  }

  searchMessages(input: SearchSessionsInput): SessionSearchHit[] {
    const query = input.query.trim();
    if (!query) return [];
    const limit = Math.min(input.limit ?? 50, 200);

    const conditions: string[] = [];
    const params: Record<string, unknown> = { query, limit };
    if (input.agent) { conditions.push("s.agent = @agent"); params.agent = input.agent; }
    if (input.projectId) { conditions.push("s.project_id = @project_id"); params.project_id = input.projectId; }
    if (input.projectPath) { conditions.push("s.project_path = @project_path"); params.project_path = input.projectPath; }
    const extra = conditions.length ? `AND ${conditions.join(" AND ")}` : "";

    const rows = this.db.prepare(
      `SELECT
              m.id AS message_id,
              m.session_id AS message_session_id,
              m.role AS message_role,
              m.content_text AS message_content_text,
              m.content_blocks AS message_content_blocks,
              m.timestamp AS message_timestamp,
              m.tool_calls AS message_tool_calls,
              m.timeline AS message_timeline,
              m.work_summary AS message_work_summary,
              m.streaming_state AS message_streaming_state,
              m.audio_ref AS message_audio_ref,
              m.attachments AS message_attachments,
              m.source_native_id AS message_source_native_id,
              s.*,
              snippet(fts_messages, 0, '<<', '>>', '...', 32) AS snippet,
              bm25(fts_messages) AS rank
       FROM fts_messages
       JOIN session_messages m ON m.rowid = fts_messages.rowid
       JOIN sessions s         ON s.id = m.session_id
       WHERE fts_messages MATCH @query
       ${extra}
       ORDER BY rank ASC
       LIMIT @limit`,
    ).all(params) as Array<SessionRow & {
      message_id: string;
      message_session_id: string;
      message_role: MessageRole;
      message_content_text: string;
      message_content_blocks: string | null;
      message_timestamp: number;
      message_tool_calls: string | null;
      message_timeline: string | null;
      message_work_summary: string | null;
      message_streaming_state: import("./types.ts").MessageStreamingState | null;
      message_audio_ref: string | null;
      message_attachments: string | null;
      message_source_native_id: string | null;
      snippet: string;
      rank: number;
    }>;

    return rows.map((row) => ({
      session: rowToSession(row),
      message: rowToMessage({
        id: row.message_id,
        session_id: row.message_session_id,
        role: row.message_role,
        content_text: row.message_content_text,
        content_blocks: row.message_content_blocks,
        timestamp: row.message_timestamp,
        tool_calls: row.message_tool_calls,
        timeline: row.message_timeline,
        work_summary: row.message_work_summary,
        streaming_state: row.message_streaming_state,
        audio_ref: row.message_audio_ref,
        attachments: row.message_attachments,
        source_native_id: row.message_source_native_id,
      }),
      snippet: row.snippet,
      rank: row.rank,
    }));
  }

  upsertOrigin(input: UpsertOriginInput): SessionOriginRecord {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO session_origins (
        session_id, native_path, native_format, last_synced_at, mirror_hash,
        source_mtime_ms, source_size, source_ino, source_dev, source_cursor_line,
        source_cursor_hash
      )
      VALUES (
        @session_id, @native_path, @native_format, @last_synced_at, @mirror_hash,
        @source_mtime_ms, @source_size, @source_ino, @source_dev, @source_cursor_line,
        @source_cursor_hash
      )
      ON CONFLICT(session_id, native_path) DO UPDATE SET
        native_format      = excluded.native_format,
        last_synced_at     = excluded.last_synced_at,
        mirror_hash        = excluded.mirror_hash,
        source_mtime_ms    = excluded.source_mtime_ms,
        source_size        = excluded.source_size,
        source_ino         = excluded.source_ino,
        source_dev         = excluded.source_dev,
        source_cursor_line = excluded.source_cursor_line,
        source_cursor_hash = excluded.source_cursor_hash
    `).run({
      session_id: input.sessionId,
      native_path: input.nativePath,
      native_format: input.nativeFormat,
      last_synced_at: now,
      mirror_hash: input.mirrorHash ?? null,
      source_mtime_ms: input.sourceMtimeMs ?? null,
      source_size: input.sourceSize ?? null,
      source_ino: input.sourceIno ?? null,
      source_dev: input.sourceDev ?? null,
      source_cursor_line: input.sourceCursorLine ?? null,
      source_cursor_hash: input.sourceCursorHash ?? null,
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

  exportTrajectories(options: ExportTrajectoryOptions = {}): import("./types.ts").TrajectoryRecord[] {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {
      limit: clampInt(options.limit, 1, MAX_EXPORT_SESSION_LIMIT, DEFAULT_EXPORT_SESSION_LIMIT),
      offset: clampInt(options.offset, 0, Number.MAX_SAFE_INTEGER, 0),
    };
    if (options.agent) { conditions.push("agent = @agent"); params.agent = options.agent; }
    const sinceCreatedAt = options.sinceCreatedAt ?? options.since;
    if (sinceCreatedAt !== undefined) { conditions.push("created_at >= @since"); params.since = sinceCreatedAt; }
    if (!options.includeFailed) { conditions.push("status IN ('active','completed')"); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const sessionRows = this.db.prepare(`SELECT * FROM sessions ${where} ORDER BY created_at ASC LIMIT @limit OFFSET @offset`).all(params) as SessionRow[];
    const messageLimit = clampInt(options.messageLimit, 1, MAX_EXPORT_MESSAGE_LIMIT, DEFAULT_EXPORT_MESSAGE_LIMIT);
    const trajectories: import("./types.ts").TrajectoryRecord[] = [];
    for (const row of sessionRows) {
      const session = rowToSession(row);
      const messages = this.listMessages(session.id, messageLimit);
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

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}
