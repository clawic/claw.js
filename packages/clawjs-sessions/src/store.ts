import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

import Database from "better-sqlite3";

// @clawjs-persistent-surface-ddl-source

import type {
  AppendMessageInput,
  AppendSessionEventInput,
  CreateProjectInput,
  CreateSessionInput,
  HydrateSessionInput,
  HydratedSessionResult,
  ListSessionDynamicToolsOptions,
  ListSessionEventsFilter,
  ListProjectsFilter,
  ListProjectsResult,
  ListSessionsFilter,
  ListSessionsResult,
  MessageRole,
  ProjectRecord,
  QuickSwitchSessionsInput,
  QuickSwitchSessionsResult,
  RebuildSessionProjectionsInput,
  RebuildSessionProjectionsResult,
  RebuildSessionProjectionResult,
  RebuildSessionMemoryExtractsInput,
  RebuildSessionMemoryExtractsResult,
  SearchSessionsInput,
  SearchSessionEventsInput,
  SidebarBootstrapResult,
  SessionDynamicToolRecord,
  SessionEventSearchHit,
  SessionMemoryExtractRecord,
  ListPendingSessionMemoryExtractionsInput,
  PendingSessionMemoryExtractionRecord,
  SessionMessageRecord,
  SessionOriginRecord,
  SessionProjectionMetaRecord,
  SessionProjectionStatus,
  SessionRecord,
  SessionStructuredEventRecord,
  SessionSearchHit,
  SessionStatus,
  SessionTurnSummaryRecord,
  SessionWithMessages,
  UpdateProjectInput,
  UpsertSessionDynamicToolInput,
  UpsertOriginInput,
  ExportTrajectoryOptions,
  ImportSessionBatchInput,
} from "./types.ts";
import { redactSearchableText } from "./redaction.ts";

const DEFAULT_MESSAGE_LIST_LIMIT = 200;
const MAX_MESSAGE_LIST_LIMIT = 1000;
const DEFAULT_EVENT_LIST_LIMIT = 200;
const MAX_EVENT_LIST_LIMIT = 1000;
const SESSION_PROJECTION_SCHEMA_VERSION = 1;
const SESSION_PROJECTION_PARSER_VERSION = "codex-rollout-events-v1";
const DEFAULT_EXPORT_SESSION_LIMIT = 100;
const MAX_EXPORT_SESSION_LIMIT = 500;
const DEFAULT_EXPORT_MESSAGE_LIMIT = 1000;
const MAX_EXPORT_MESSAGE_LIMIT = 2000;
const DEFAULT_QUICK_SWITCH_LIMIT = 20;
const MAX_QUICK_SWITCH_LIMIT = 50;

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
  CREATE INDEX IF NOT EXISTS idx_sessions_sidebar_recent_order
    ON sessions(archived, sidebar_visible, pinned DESC, COALESCE(last_message_at, created_at) DESC, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_agent_runtime_recent
    ON sessions(agent, runtime, last_message_at DESC);

  CREATE TABLE IF NOT EXISTS session_messages (
    id                 TEXT PRIMARY KEY,
    session_id         TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role               TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
    content_text       TEXT NOT NULL,
    searchable_text    TEXT,
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

  CREATE TABLE IF NOT EXISTS session_events (
    id                 TEXT PRIMARY KEY,
    session_id         TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    turn_id            TEXT,
    item_id            TEXT,
    call_id            TEXT,
    event_kind         TEXT NOT NULL,
    event_type         TEXT,
    role               TEXT,
    timestamp          INTEGER NOT NULL,
    source_native_id   TEXT NOT NULL,
    source_line        INTEGER,
    payload_json       TEXT NOT NULL,
    rendered_summary   TEXT,
    searchable_text    TEXT,
    created_at         INTEGER NOT NULL,
    UNIQUE (session_id, source_native_id)
  );
  CREATE INDEX IF NOT EXISTS idx_session_events_session_time
    ON session_events(session_id, timestamp, source_line);
  CREATE INDEX IF NOT EXISTS idx_session_events_turn_time
    ON session_events(session_id, turn_id, timestamp, source_line);
  CREATE INDEX IF NOT EXISTS idx_session_events_call
    ON session_events(session_id, call_id);
  CREATE INDEX IF NOT EXISTS idx_session_events_kind_time
    ON session_events(event_kind, event_type, timestamp DESC);

  CREATE VIRTUAL TABLE IF NOT EXISTS fts_session_events USING fts5(
    searchable_text,
    rendered_summary,
    content='session_events',
    content_rowid='rowid',
    tokenize='porter unicode61'
  );

  CREATE TRIGGER IF NOT EXISTS session_events_ai AFTER INSERT ON session_events BEGIN
    INSERT INTO fts_session_events(rowid, searchable_text, rendered_summary)
    VALUES (new.rowid, COALESCE(new.searchable_text, ''), COALESCE(new.rendered_summary, ''));
  END;
  CREATE TRIGGER IF NOT EXISTS session_events_ad AFTER DELETE ON session_events BEGIN
    INSERT INTO fts_session_events(fts_session_events, rowid, searchable_text, rendered_summary)
    VALUES('delete', old.rowid, COALESCE(old.searchable_text, ''), COALESCE(old.rendered_summary, ''));
  END;
  CREATE TRIGGER IF NOT EXISTS session_events_au AFTER UPDATE ON session_events BEGIN
    INSERT INTO fts_session_events(fts_session_events, rowid, searchable_text, rendered_summary)
    VALUES('delete', old.rowid, COALESCE(old.searchable_text, ''), COALESCE(old.rendered_summary, ''));
    INSERT INTO fts_session_events(rowid, searchable_text, rendered_summary)
    VALUES (new.rowid, COALESCE(new.searchable_text, ''), COALESCE(new.rendered_summary, ''));
  END;

  CREATE TABLE IF NOT EXISTS session_turn_summaries (
    session_id              TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    turn_id                 TEXT NOT NULL,
    started_at              INTEGER NOT NULL,
    completed_at            INTEGER,
    ended_at                INTEGER,
    duration_ms             INTEGER,
    status                  TEXT NOT NULL DEFAULT 'unknown',
    assistant_message_id    TEXT,
    user_message_id         TEXT,
    title                   TEXT,
    prompt_preview          TEXT,
    response_preview        TEXT,
    tool_call_count         INTEGER NOT NULL DEFAULT 0,
    failed_tool_call_count  INTEGER NOT NULL DEFAULT 0,
    diff_file_count         INTEGER NOT NULL DEFAULT 0,
    web_search_count        INTEGER NOT NULL DEFAULT 0,
    subagent_count          INTEGER NOT NULL DEFAULT 0,
    compacted               INTEGER NOT NULL DEFAULT 0,
    token_input             INTEGER,
    token_output            INTEGER,
    token_usage_json        TEXT,
    summary_json            TEXT,
    has_compaction          INTEGER NOT NULL DEFAULT 0,
    aborted                 INTEGER NOT NULL DEFAULT 0,
    interrupted             INTEGER NOT NULL DEFAULT 0,
    event_count             INTEGER NOT NULL DEFAULT 0,
    updated_at              INTEGER NOT NULL,
    PRIMARY KEY (session_id, turn_id)
  );
  CREATE INDEX IF NOT EXISTS idx_session_turn_summaries_session_time
    ON session_turn_summaries(session_id, started_at DESC);
  CREATE INDEX IF NOT EXISTS idx_session_turn_summaries_user_message
    ON session_turn_summaries(session_id, user_message_id);
  CREATE INDEX IF NOT EXISTS idx_session_turn_summaries_assistant_message
    ON session_turn_summaries(session_id, assistant_message_id);

  CREATE TABLE IF NOT EXISTS session_projection_meta (
    session_id          TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    source_native_path  TEXT,
    source_native_format TEXT,
    source_mtime_ms     REAL,
    source_size         INTEGER,
    source_ino          INTEGER,
    source_dev          INTEGER,
    source_cursor_line  INTEGER,
    source_cursor_hash  TEXT,
    mirror_hash         TEXT,
    last_imported_at    INTEGER,
    last_projected_at   INTEGER,
    projection_version  INTEGER NOT NULL DEFAULT 1,
    schema_version      INTEGER NOT NULL,
    parser_version      TEXT NOT NULL,
    projection_status   TEXT NOT NULL,
    event_count         INTEGER NOT NULL DEFAULT 0,
    summary_count       INTEGER NOT NULL DEFAULT 0,
    projected_at        INTEGER,
    stale_reason        TEXT,
    error               TEXT,
    last_error          TEXT,
    updated_at          INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_session_projection_meta_status
    ON session_projection_meta(projection_status, updated_at DESC);

  CREATE TABLE IF NOT EXISTS session_memory_extracts (
    session_id                  TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    summary_version             INTEGER NOT NULL DEFAULT 1,
    status                      TEXT NOT NULL DEFAULT 'stale',
    last_extracted_at           INTEGER,
    last_extracted_event_count  INTEGER NOT NULL DEFAULT 0,
    last_projected_at           INTEGER,
    summary_json                TEXT,
    last_error                  TEXT,
    updated_at                  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_session_memory_extracts_status
    ON session_memory_extracts(status, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_session_memory_extracts_extracted
    ON session_memory_extracts(last_extracted_at, last_extracted_event_count);

  CREATE TABLE IF NOT EXISTS session_dynamic_tools (
    session_id          TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    position            INTEGER NOT NULL,
    name                TEXT NOT NULL,
    namespace           TEXT,
    description         TEXT NOT NULL DEFAULT '',
    input_schema_json   TEXT NOT NULL DEFAULT '{}',
    schema_hash         TEXT NOT NULL,
    defer_loading       INTEGER NOT NULL DEFAULT 0,
    source              TEXT,
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    PRIMARY KEY (session_id, position)
  );
  CREATE INDEX IF NOT EXISTS idx_session_dynamic_tools_session
    ON session_dynamic_tools(session_id, position);
  CREATE INDEX IF NOT EXISTS idx_session_dynamic_tools_namespace_name
    ON session_dynamic_tools(namespace, name);
  CREATE INDEX IF NOT EXISTS idx_session_dynamic_tools_schema_hash
    ON session_dynamic_tools(schema_hash);

`;
const SESSIONS_SCHEMA_META_TABLE = "sessions_service_schema_meta";
const SESSIONS_SCHEMA_VERSION = 7;
const SESSION_MEMORY_SUMMARY_VERSION = 1;

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
  searchable_text: string | null;
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

interface SessionEventRow {
  id: string;
  session_id: string;
  turn_id: string | null;
  item_id: string | null;
  call_id: string | null;
  event_kind: SessionStructuredEventRecord["eventKind"];
  event_type: string | null;
  role: string | null;
  timestamp: number;
  source_native_id: string;
  source_line: number | null;
  payload_json: string;
  rendered_summary: string | null;
  searchable_text: string | null;
  created_at: number;
}

interface TurnSummaryRow {
  session_id: string;
  turn_id: string;
  started_at: number;
  completed_at: number | null;
  ended_at: number | null;
  duration_ms: number | null;
  status: SessionTurnSummaryRecord["status"];
  assistant_message_id: string | null;
  user_message_id: string | null;
  title: string | null;
  prompt_preview: string | null;
  response_preview: string | null;
  tool_call_count: number;
  failed_tool_call_count: number;
  diff_file_count: number;
  web_search_count: number;
  subagent_count: number;
  compacted: number;
  token_input: number | null;
  token_output: number | null;
  token_usage_json: string | null;
  summary_json: string | null;
  has_compaction: number;
  aborted: number;
  interrupted: number;
  event_count: number;
  updated_at: number;
}

interface ProjectionMetaRow {
  session_id: string;
  source_native_path: string | null;
  source_native_format: string | null;
  source_mtime_ms: number | null;
  source_size: number | null;
  source_ino: number | null;
  source_dev: number | null;
  source_cursor_line: number | null;
  source_cursor_hash: string | null;
  mirror_hash: string | null;
  last_imported_at: number | null;
  last_projected_at: number | null;
  projection_version: number;
  schema_version: number;
  parser_version: string;
  projection_status: SessionProjectionStatus;
  event_count: number;
  summary_count: number;
  projected_at: number | null;
  stale_reason: string | null;
  error: string | null;
  last_error: string | null;
  updated_at: number;
}

interface MemoryExtractRow {
  session_id: string;
  summary_version: number;
  status: SessionMemoryExtractRecord["status"];
  last_extracted_at: number | null;
  last_extracted_event_count: number;
  last_projected_at: number | null;
  summary_json: string | null;
  last_error: string | null;
  updated_at: number;
}

interface DynamicToolRow {
  session_id: string;
  position: number;
  name: string;
  namespace: string | null;
  description: string;
  input_schema_json: string;
  schema_hash: string;
  defer_loading: number;
  source: string | null;
  created_at: number;
  updated_at: number;
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

function rowToStructuredEvent(row: SessionEventRow): SessionStructuredEventRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    turnId: row.turn_id,
    itemId: row.item_id,
    callId: row.call_id,
    eventKind: row.event_kind,
    eventType: row.event_type,
    role: row.role,
    timestamp: row.timestamp,
    sourceNativeId: row.source_native_id,
    sourceLine: row.source_line,
    payloadJson: parseJson<unknown>(row.payload_json),
    renderedSummary: row.rendered_summary,
    searchableText: row.searchable_text,
    createdAt: row.created_at,
  };
}

function rowToTurnSummary(row: TurnSummaryRow): SessionTurnSummaryRecord {
  return {
    sessionId: row.session_id,
    turnId: row.turn_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    endedAt: row.ended_at,
    durationMs: row.duration_ms,
    status: row.status,
    assistantMessageId: row.assistant_message_id,
    userMessageId: row.user_message_id,
    title: row.title,
    promptPreview: row.prompt_preview,
    responsePreview: row.response_preview,
    toolCallCount: row.tool_call_count,
    failedToolCallCount: row.failed_tool_call_count,
    diffFileCount: row.diff_file_count,
    webSearchCount: row.web_search_count,
    subagentCount: row.subagent_count,
    compacted: row.compacted === 1,
    tokenInput: row.token_input,
    tokenOutput: row.token_output,
    tokenUsage: parseJson<unknown>(row.token_usage_json),
    summary: parseJson<unknown>(row.summary_json),
    hasCompaction: row.has_compaction === 1,
    aborted: row.aborted === 1,
    interrupted: row.interrupted === 1,
    eventCount: row.event_count,
    updatedAt: row.updated_at,
  };
}

function rowToProjectionMeta(row: ProjectionMetaRow): SessionProjectionMetaRecord {
  return {
    sessionId: row.session_id,
    sourceNativePath: row.source_native_path,
    sourceNativeFormat: row.source_native_format,
    sourceMtimeMs: row.source_mtime_ms,
    sourceSize: row.source_size,
    sourceIno: row.source_ino,
    sourceDev: row.source_dev,
    sourceCursorLine: row.source_cursor_line,
    sourceCursorHash: row.source_cursor_hash,
    mirrorHash: row.mirror_hash,
    lastImportedAt: row.last_imported_at,
    lastProjectedAt: row.last_projected_at,
    projectionVersion: row.projection_version,
    schemaVersion: row.schema_version,
    parserVersion: row.parser_version,
    projectionStatus: row.projection_status,
    eventCount: row.event_count,
    summaryCount: row.summary_count,
    projectedAt: row.projected_at,
    staleReason: row.stale_reason,
    error: row.error,
    lastError: row.last_error,
    updatedAt: row.updated_at,
  };
}

function rowToMemoryExtract(row: MemoryExtractRow): SessionMemoryExtractRecord {
  return {
    sessionId: row.session_id,
    summaryVersion: row.summary_version,
    status: row.status,
    lastExtractedAt: row.last_extracted_at,
    lastExtractedEventCount: row.last_extracted_event_count,
    lastProjectedAt: row.last_projected_at,
    summaryJson: parseJson<unknown>(row.summary_json),
    lastError: row.last_error,
    updatedAt: row.updated_at,
  };
}

function rowToDynamicTool(row: DynamicToolRow, includeSchema: boolean): SessionDynamicToolRecord {
  const deferLoading = row.defer_loading === 1;
  return {
    sessionId: row.session_id,
    position: row.position,
    name: row.name,
    namespace: row.namespace,
    description: row.description,
    inputSchemaJson: deferLoading && !includeSchema ? null : parseJson<unknown>(row.input_schema_json),
    schemaHash: row.schema_hash,
    deferLoading,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function stableEventId(sessionId: string, sourceNativeId: string): string {
  return `event_${createHash("sha1").update(`${sessionId}\0${sourceNativeId}`).digest("hex")}`;
}

function redactOptionalSearchableText(text: string | null | undefined): string | null {
  if (text == null) return null;
  return redactSearchableText(text);
}

function previewText(value: string | null | undefined): string | null {
  if (!value) return null;
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return null;
  return compact.length > 240 ? compact.slice(0, 240) : compact;
}

function payloadObject(event: SessionStructuredEventRecord): Record<string, unknown> {
  return typeof event.payloadJson === "object" && event.payloadJson !== null && !Array.isArray(event.payloadJson)
    ? event.payloadJson as Record<string, unknown>
    : {};
}

function numberPayloadField(payload: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function nestedNumberPayloadField(payload: Record<string, unknown>, paths: string[][]): number | null {
  for (const pathParts of paths) {
    let value: unknown = payload;
    for (const part of pathParts) {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        value = undefined;
        break;
      }
      value = (value as Record<string, unknown>)[part];
    }
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function looksLikeFailedTool(event: SessionStructuredEventRecord): boolean {
  const payload = payloadObject(event);
  const status = typeof payload.status === "string" ? payload.status.toLowerCase() : "";
  if (status === "failed" || status === "error") return true;
  if (typeof payload.error === "string" && payload.error.trim()) return true;
  const text = `${event.renderedSummary ?? ""}\n${event.searchableText ?? ""}`.toLowerCase();
  return /\b(exit code|code)\s+([1-9]\d*)\b/.test(text) || /\b(error|failed|failure|traceback)\b/.test(text);
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
    this.db.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_sidebar_recent_order ON sessions(archived, sidebar_visible, pinned DESC, COALESCE(last_message_at, created_at) DESC, created_at DESC)").run();
    this.db.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_sidebar_project_recent_order ON sessions(archived, sidebar_visible, project_id, pinned DESC, COALESCE(last_message_at, created_at) DESC, created_at DESC)").run();
    this.db.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_sidebar_project_recent ON sessions(archived, sidebar_visible, project_id, last_message_at DESC, created_at DESC)").run();
    this.db.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_project_active_recent ON sessions(project_id, archived, sidebar_visible, last_message_at DESC)").run();
    this.db.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_agent_runtime_recent ON sessions(agent, runtime, last_message_at DESC)").run();
    this.db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_resource_id ON projects(resource_id) WHERE resource_id IS NOT NULL").run();
    this.ensureColumn("session_messages", "timeline", "TEXT");
    this.ensureColumn("session_messages", "streaming_state", "TEXT");
    this.ensureColumn("session_messages", "searchable_text", "TEXT");
    this.ensureColumn("session_origins", "source_mtime_ms", "REAL");
    this.ensureColumn("session_origins", "source_size", "INTEGER");
    this.ensureColumn("session_origins", "source_ino", "INTEGER");
    this.ensureColumn("session_origins", "source_dev", "INTEGER");
    this.ensureColumn("session_origins", "source_cursor_line", "INTEGER");
    this.ensureColumn("session_origins", "source_cursor_hash", "TEXT");
    this.db.exec(SCHEMA_DDL);
    this.ensureColumn("session_turn_summaries", "completed_at", "INTEGER");
    this.ensureColumn("session_turn_summaries", "status", "TEXT NOT NULL DEFAULT 'unknown'");
    this.ensureColumn("session_turn_summaries", "assistant_message_id", "TEXT");
    this.ensureColumn("session_turn_summaries", "user_message_id", "TEXT");
    this.db.prepare("CREATE INDEX IF NOT EXISTS idx_session_turn_summaries_user_message ON session_turn_summaries(session_id, user_message_id)").run();
    this.db.prepare("CREATE INDEX IF NOT EXISTS idx_session_turn_summaries_assistant_message ON session_turn_summaries(session_id, assistant_message_id)").run();
    this.ensureColumn("session_turn_summaries", "subagent_count", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("session_turn_summaries", "compacted", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("session_turn_summaries", "token_usage_json", "TEXT");
    this.ensureColumn("session_turn_summaries", "summary_json", "TEXT");
    this.ensureColumn("session_projection_meta", "source_native_path", "TEXT");
    this.ensureColumn("session_projection_meta", "source_native_format", "TEXT");
    this.ensureColumn("session_projection_meta", "source_mtime_ms", "REAL");
    this.ensureColumn("session_projection_meta", "source_size", "INTEGER");
    this.ensureColumn("session_projection_meta", "source_ino", "INTEGER");
    this.ensureColumn("session_projection_meta", "source_dev", "INTEGER");
    this.ensureColumn("session_projection_meta", "source_cursor_line", "INTEGER");
    this.ensureColumn("session_projection_meta", "source_cursor_hash", "TEXT");
    this.ensureColumn("session_projection_meta", "mirror_hash", "TEXT");
    this.ensureColumn("session_projection_meta", "last_imported_at", "INTEGER");
    this.ensureColumn("session_projection_meta", "last_projected_at", "INTEGER");
    this.ensureColumn("session_projection_meta", "projection_version", "INTEGER NOT NULL DEFAULT 1");
    this.ensureColumn("session_projection_meta", "last_error", "TEXT");
    this.db.prepare("CREATE INDEX IF NOT EXISTS idx_session_memory_extracts_status ON session_memory_extracts(status, updated_at DESC)").run();
    this.db.prepare("CREATE INDEX IF NOT EXISTS idx_session_memory_extracts_extracted ON session_memory_extracts(last_extracted_at, last_extracted_event_count)").run();
    this.ensureSessionEventSearchRedactions();
    this.ensureMessageSearchIndex();
  }

  private ensureSessionEventSearchRedactions(): void {
    const rows = this.db.prepare("SELECT id, rendered_summary, searchable_text FROM session_events").all() as Array<{
      id: string;
      rendered_summary: string | null;
      searchable_text: string | null;
    }>;
    const update = this.db.prepare("UPDATE session_events SET rendered_summary = ?, searchable_text = ? WHERE id = ?");
    for (const row of rows) {
      const renderedSummary = redactOptionalSearchableText(row.rendered_summary);
      const searchableText = redactOptionalSearchableText(row.searchable_text);
      if (row.rendered_summary !== renderedSummary || row.searchable_text !== searchableText) {
        update.run(renderedSummary, searchableText, row.id);
      }
    }
  }

  private ensureMessageSearchIndex(): void {
    this.db.exec(`
      DROP TRIGGER IF EXISTS session_messages_ai;
      DROP TRIGGER IF EXISTS session_messages_ad;
      DROP TRIGGER IF EXISTS session_messages_au;
      DROP TABLE IF EXISTS fts_messages;
    `);
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS fts_session_messages USING fts5(
        message_id UNINDEXED,
        searchable_text,
        tokenize='porter unicode61'
      );
    `);
    const rows = this.db.prepare("SELECT id, content_text, searchable_text FROM session_messages").all() as Array<{
      id: string;
      content_text: string;
      searchable_text: string | null;
    }>;
    const update = this.db.prepare("UPDATE session_messages SET searchable_text = ? WHERE id = ?");
    for (const row of rows) {
      const redacted = redactSearchableText(row.content_text);
      if (row.searchable_text !== redacted) update.run(redacted, row.id);
    }
    this.db.prepare("DELETE FROM fts_session_messages").run();
    this.db.prepare(`
      INSERT INTO fts_session_messages(rowid, message_id, searchable_text)
      SELECT rowid, id, COALESCE(searchable_text, content_text)
      FROM session_messages
    `).run();
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS session_messages_search_ai AFTER INSERT ON session_messages BEGIN
        INSERT INTO fts_session_messages(rowid, message_id, searchable_text)
        VALUES (new.rowid, new.id, COALESCE(new.searchable_text, new.content_text));
      END;
      CREATE TRIGGER IF NOT EXISTS session_messages_search_ad AFTER DELETE ON session_messages BEGIN
        DELETE FROM fts_session_messages WHERE rowid = old.rowid;
      END;
      CREATE TRIGGER IF NOT EXISTS session_messages_search_au AFTER UPDATE ON session_messages BEGIN
        DELETE FROM fts_session_messages WHERE rowid = old.rowid;
        INSERT INTO fts_session_messages(rowid, message_id, searchable_text)
        VALUES (new.rowid, new.id, COALESCE(new.searchable_text, new.content_text));
      END;
    `);
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

  upsertSessionDynamicTool(input: UpsertSessionDynamicToolInput): SessionDynamicToolRecord {
    const session = this.getSession(input.sessionId);
    if (!session) throw new Error(`session not found: ${input.sessionId}`);
    const position = clampInt(input.position, 0, Number.MAX_SAFE_INTEGER, 0);
    const inputSchemaJson = JSON.stringify(input.inputSchemaJson ?? {});
    const computedSchemaHash = createHash("sha256").update(inputSchemaJson).digest("hex");
    if (input.schemaHash !== undefined && input.schemaHash !== computedSchemaHash) {
      throw new Error(`dynamic tool schema hash mismatch for ${input.sessionId}:${position}`);
    }
    const schemaHash = input.schemaHash ?? computedSchemaHash;
    const now = Date.now();
    const createdAt = input.createdAt ?? now;
    const updatedAt = input.updatedAt ?? now;
    this.db.prepare(`
      INSERT INTO session_dynamic_tools (
        session_id, position, name, namespace, description, input_schema_json,
        schema_hash, defer_loading, source, created_at, updated_at
      ) VALUES (
        @session_id, @position, @name, @namespace, @description, @input_schema_json,
        @schema_hash, @defer_loading, @source, @created_at, @updated_at
      )
      ON CONFLICT(session_id, position) DO UPDATE SET
        name=excluded.name,
        namespace=excluded.namespace,
        description=excluded.description,
        input_schema_json=excluded.input_schema_json,
        schema_hash=excluded.schema_hash,
        defer_loading=excluded.defer_loading,
        source=excluded.source,
        updated_at=excluded.updated_at
    `).run({
      session_id: input.sessionId,
      position,
      name: input.name,
      namespace: input.namespace ?? null,
      description: input.description ?? "",
      input_schema_json: inputSchemaJson,
      schema_hash: schemaHash,
      defer_loading: input.deferLoading ? 1 : 0,
      source: input.source ?? null,
      created_at: createdAt,
      updated_at: updatedAt,
    });
    const row = this.db.prepare("SELECT * FROM session_dynamic_tools WHERE session_id = ? AND position = ?").get(input.sessionId, position) as DynamicToolRow;
    return rowToDynamicTool(row, true);
  }

  replaceSessionDynamicTools(sessionId: string, tools: Omit<UpsertSessionDynamicToolInput, "sessionId">[]): SessionDynamicToolRecord[] {
    const session = this.getSession(sessionId);
    if (!session) throw new Error(`session not found: ${sessionId}`);
    const tx = this.db.transaction(() => {
      this.db.prepare("DELETE FROM session_dynamic_tools WHERE session_id = ?").run(sessionId);
      return tools.map((tool) => this.upsertSessionDynamicTool({ ...tool, sessionId }));
    });
    return tx();
  }

  listSessionDynamicTools(sessionId: string, options: ListSessionDynamicToolsOptions = {}): SessionDynamicToolRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM session_dynamic_tools
      WHERE session_id = ?
      ORDER BY position ASC
    `).all(sessionId) as DynamicToolRow[];
    return rows.map((row) => rowToDynamicTool(row, options.includeDeferredSchemas === true));
  }

  hydrateSession(input: HydrateSessionInput): HydratedSessionResult | null {
    const session = this.getSession(input.sessionId);
    if (!session) return null;
    const messageLimit = clampInt(input.messageLimit, 1, MAX_MESSAGE_LIST_LIMIT, DEFAULT_MESSAGE_LIST_LIMIT);
    const requestedOffset = clampInt(input.messageOffset, 0, Number.MAX_SAFE_INTEGER, 0);
    const messageOffset = input.recent === false
      ? Math.min(requestedOffset, Math.max(0, session.messageCount - 1))
      : Math.max(0, session.messageCount - messageLimit);
    const messages = this.listMessages(session.id, messageLimit, messageOffset);
    const summaryLimit = clampInt(input.summaryLimit, 1, MAX_EVENT_LIST_LIMIT, DEFAULT_EVENT_LIST_LIMIT);
    const visibleMessageIds = messages.map((message) => message.id);
    const matchedSummaries = this.listTurnSummariesForMessageIds(session.id, visibleMessageIds, summaryLimit);
    const turnSummaries = matchedSummaries.length > 0
      ? matchedSummaries
      : this.listTurnSummaries(session.id, undefined, summaryLimit);
    const projectionMeta = this.getProjectionMeta(session.id);
    const dynamicTools = this.listSessionDynamicTools(session.id, { includeDeferredSchemas: false });
    const events = input.includeEvents
      ? this.listSessionEvents({
          sessionId: session.id,
          turnId: input.eventTurnId,
          limit: input.eventLimit,
          offset: input.eventOffset,
        })
      : null;
    return {
      session,
      messages,
      messageOffset,
      messageLimit,
      hasOlderMessages: messageOffset > 0,
      hasNewerMessages: messageOffset + messages.length < session.messageCount,
      turnSummaries,
      projectionMeta,
      dynamicTools,
      events,
      eventsLoaded: input.includeEvents === true,
      fallbackRequired: projectionMeta === null || projectionMeta.projectionStatus === "stale" || projectionMeta.projectionStatus === "failed",
    };
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

  quickSwitchSessions(input: QuickSwitchSessionsInput = {}): QuickSwitchSessionsResult {
    const query = (input.query ?? "").trim();
    const limit = clampInt(input.limit, 1, MAX_QUICK_SWITCH_LIMIT, DEFAULT_QUICK_SWITCH_LIMIT);
    const offset = clampInt(input.offset, 0, Number.MAX_SAFE_INTEGER, 0);
    const conditions: string[] = ["sidebar_visible = 1"];
    const params: Record<string, unknown> = { limit, offset };
    if (input.includeArchived !== true) conditions.push("archived = 0");
    if (input.projectId) { conditions.push("project_id = @project_id"); params.project_id = input.projectId; }
    if (input.projectPath) { conditions.push("project_path = @project_path"); params.project_path = input.projectPath; }
    if (query) {
      params.quick_query = `%${escapeSqlLike(query.toLowerCase())}%`;
      conditions.push(`(
        lower(title) LIKE @quick_query ESCAPE '~'
        OR lower(COALESCE(cwd, '')) LIKE @quick_query ESCAPE '~'
        OR lower(COALESCE(branch, '')) LIKE @quick_query ESCAPE '~'
        OR lower(COALESCE(project_path, '')) LIKE @quick_query ESCAPE '~'
        OR lower(COALESCE(runtime_session_id, '')) LIKE @quick_query ESCAPE '~'
      )`);
    }
    const where = `WHERE ${conditions.join(" AND ")}`;
    const total = (this.db.prepare(`SELECT COUNT(*) AS n FROM sessions ${where}`).get(params) as { n: number }).n;
    const rows = this.db.prepare(
      `SELECT * FROM sessions
       ${where}
       ORDER BY pinned DESC, COALESCE(last_message_at, created_at) DESC
       LIMIT @limit OFFSET @offset`,
    ).all(params) as SessionRow[];
    return {
      items: rows.map(rowToSession),
      total,
      query,
      limit,
      offset,
      source: "sessions.quick_switch",
      searchedMessageHistory: false,
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
          id, session_id, role, content_text, searchable_text, content_blocks, timestamp,
          tool_calls, timeline, work_summary, streaming_state, audio_ref, attachments, source_native_id
        ) VALUES (
          @id, @session_id, @role, @content_text, @searchable_text, @content_blocks, @timestamp,
          @tool_calls, @timeline, @work_summary, @streaming_state, @audio_ref, @attachments, @source_native_id
        )
      `).run({
        id,
        session_id: input.sessionId,
        role: input.role,
        content_text: input.contentText,
        searchable_text: redactSearchableText(input.contentText),
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
            id, session_id, role, content_text, searchable_text, content_blocks, timestamp,
            tool_calls, timeline, work_summary, streaming_state, audio_ref, attachments, source_native_id
          ) VALUES (
            @id, @session_id, @role, @content_text, @searchable_text, @content_blocks, @timestamp,
            @tool_calls, @timeline, @work_summary, @streaming_state, @audio_ref, @attachments, @source_native_id
          )
        `).run({
          id,
          session_id: message.sessionId,
          role: message.role,
          content_text: message.contentText,
          searchable_text: redactSearchableText(message.contentText),
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
      for (const event of input.events ?? []) {
        this.appendSessionEventResult(event);
      }
      for (const tool of input.dynamicTools ?? []) {
        this.upsertSessionDynamicTool(tool);
      }
      if (input.origin) this.upsertOrigin(input.origin);
      return { messagesInserted };
    });
    return tx();
  }

  appendSessionEvent(input: AppendSessionEventInput): SessionStructuredEventRecord {
    return this.appendSessionEventResult(input).event;
  }

  appendSessionEventResult(input: AppendSessionEventInput): { event: SessionStructuredEventRecord; inserted: boolean } {
    const id = input.id ?? stableEventId(input.sessionId, input.sourceNativeId);
    const timestamp = input.timestamp ?? Date.now();
    const createdAt = input.createdAt ?? Date.now();
    const payloadJson = JSON.stringify(input.payloadJson ?? null);
    const tx = this.db.transaction(() => {
      const existing = this.db.prepare(
        "SELECT id FROM session_events WHERE session_id = ? AND source_native_id = ?",
      ).get(input.sessionId, input.sourceNativeId) as { id: string } | undefined;
      if (existing) return { id: existing.id, inserted: false };
      this.db.prepare(`
        INSERT INTO session_events (
          id, session_id, turn_id, item_id, call_id, event_kind, event_type, role,
          timestamp, source_native_id, source_line, payload_json, rendered_summary,
          searchable_text, created_at
        ) VALUES (
          @id, @session_id, @turn_id, @item_id, @call_id, @event_kind, @event_type, @role,
          @timestamp, @source_native_id, @source_line, @payload_json, @rendered_summary,
          @searchable_text, @created_at
        )
      `).run({
        id,
        session_id: input.sessionId,
        turn_id: input.turnId ?? null,
        item_id: input.itemId ?? null,
        call_id: input.callId ?? null,
        event_kind: input.eventKind,
        event_type: input.eventType ?? null,
        role: input.role ?? null,
        timestamp,
        source_native_id: input.sourceNativeId,
        source_line: input.sourceLine ?? null,
        payload_json: payloadJson,
        rendered_summary: redactOptionalSearchableText(input.renderedSummary),
        searchable_text: redactOptionalSearchableText(input.searchableText),
        created_at: createdAt,
      });
      return { id, inserted: true };
    });
    const resolved = tx();
    const row = this.db.prepare("SELECT * FROM session_events WHERE id = ?").get(resolved.id) as SessionEventRow | undefined;
    if (!row) throw new Error(`appendSessionEvent: failed to read back ${resolved.id}`);
    return { event: rowToStructuredEvent(row), inserted: resolved.inserted };
  }

  listSessionEvents(filter: ListSessionEventsFilter): SessionStructuredEventRecord[] {
    const conditions = ["session_id = @session_id"];
    const params: Record<string, unknown> = { session_id: filter.sessionId };
    if (filter.eventKind) { conditions.push("event_kind = @event_kind"); params.event_kind = filter.eventKind; }
    if (filter.eventType) { conditions.push("event_type = @event_type"); params.event_type = filter.eventType; }
    if (filter.turnId) { conditions.push("turn_id = @turn_id"); params.turn_id = filter.turnId; }
    if (filter.callId) { conditions.push("call_id = @call_id"); params.call_id = filter.callId; }
    const limit = clampInt(filter.limit, 1, MAX_EVENT_LIST_LIMIT, DEFAULT_EVENT_LIST_LIMIT);
    const offset = clampInt(filter.offset, 0, Number.MAX_SAFE_INTEGER, 0);
    params.limit = limit;
    params.offset = offset;
    const rows = this.db.prepare(`
      SELECT * FROM session_events
      WHERE ${conditions.join(" AND ")}
      ORDER BY timestamp ASC, source_line ASC
      LIMIT @limit OFFSET @offset
    `).all(params) as SessionEventRow[];
    return rows.map(rowToStructuredEvent);
  }

  updateMessage(id: string, patch: Partial<Pick<AppendMessageInput, "contentText" | "contentBlocks" | "toolCalls" | "timeline" | "workSummary" | "streamingState" | "attachments">>): SessionMessageRecord | null {
    const row = this.db.prepare("SELECT * FROM session_messages WHERE id = ?").get(id) as MessageRow | undefined;
    if (!row) return null;
    const next = {
      id,
      content_text: patch.contentText ?? row.content_text,
      searchable_text: patch.contentText !== undefined
        ? redactSearchableText(patch.contentText)
        : row.searchable_text ?? redactSearchableText(row.content_text),
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
          searchable_text = @searchable_text,
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
    const limit = clampInt(input.limit, 1, 200, 50);
    const offset = clampInt(input.offset, 0, Number.MAX_SAFE_INTEGER, 0);

    const conditions: string[] = [];
    const params: Record<string, unknown> = { query, limit, offset };
    if (input.agent) { conditions.push("s.agent = @agent"); params.agent = input.agent; }
    if (input.projectId) { conditions.push("s.project_id = @project_id"); params.project_id = input.projectId; }
    if (input.projectPath) { conditions.push("s.project_path = @project_path"); params.project_path = input.projectPath; }
    if (input.fromTimestamp !== undefined) { conditions.push("m.timestamp >= @from_timestamp"); params.from_timestamp = input.fromTimestamp; }
    if (input.toTimestamp !== undefined) { conditions.push("m.timestamp <= @to_timestamp"); params.to_timestamp = input.toTimestamp; }
    const extra = conditions.length ? `AND ${conditions.join(" AND ")}` : "";

    const rows = this.db.prepare(
      `SELECT
              m.id AS message_id,
              m.session_id AS message_session_id,
              m.role AS message_role,
              m.content_text AS message_content_text,
              m.searchable_text AS message_searchable_text,
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
              snippet(fts_session_messages, 1, '<<', '>>', '...', 32) AS snippet,
              bm25(fts_session_messages) AS rank
       FROM fts_session_messages
       JOIN session_messages m ON m.rowid = fts_session_messages.rowid
       JOIN sessions s         ON s.id = m.session_id
       WHERE fts_session_messages MATCH @query
       ${extra}
       ORDER BY rank ASC
       LIMIT @limit OFFSET @offset`,
    ).all(params) as Array<SessionRow & {
      message_id: string;
      message_session_id: string;
      message_role: MessageRole;
      message_content_text: string;
      message_searchable_text: string | null;
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
        searchable_text: row.message_searchable_text,
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

  searchSessionEvents(input: SearchSessionEventsInput): SessionEventSearchHit[] {
    const query = input.query.trim();
    if (!query) return [];
    const conditions: string[] = [];
    const params: Record<string, unknown> = {
      query,
      limit: clampInt(input.limit, 1, 200, 50),
      offset: clampInt(input.offset, 0, Number.MAX_SAFE_INTEGER, 0),
    };
    if (input.sessionId) { conditions.push("e.session_id = @session_id"); params.session_id = input.sessionId; }
    if (input.eventKind) { conditions.push("e.event_kind = @event_kind"); params.event_kind = input.eventKind; }
    if (input.eventType) { conditions.push("e.event_type = @event_type"); params.event_type = input.eventType; }
    if (input.toolName) { conditions.push("json_extract(e.payload_json, '$.name') = @tool_name"); params.tool_name = input.toolName; }
    if (input.status) { conditions.push("json_extract(e.payload_json, '$.status') = @status"); params.status = input.status; }
    if (input.hasDiff !== undefined) conditions.push(input.hasDiff ? "e.event_kind = 'patch'" : "e.event_kind != 'patch'");
    if (input.hasWebSearch !== undefined) conditions.push(input.hasWebSearch ? "e.event_kind = 'search'" : "e.event_kind != 'search'");
    if (input.hasCompaction !== undefined) conditions.push(input.hasCompaction ? "e.event_kind = 'compaction'" : "e.event_kind != 'compaction'");
    if (input.hasGoal !== undefined) conditions.push(input.hasGoal ? "e.event_kind = 'goal'" : "e.event_kind != 'goal'");
    if (input.hasFailedTool !== undefined) {
      const failedToolCondition = `(
        e.event_kind = 'tool_output'
        AND (
          lower(COALESCE(json_extract(e.payload_json, '$.status'), '')) IN ('failed', 'error')
          OR json_extract(e.payload_json, '$.error') IS NOT NULL
          OR lower(COALESCE(e.searchable_text, '') || ' ' || COALESCE(e.rendered_summary, '')) LIKE '%exit code 1%'
          OR lower(COALESCE(e.searchable_text, '') || ' ' || COALESCE(e.rendered_summary, '')) LIKE '%error%'
          OR lower(COALESCE(e.searchable_text, '') || ' ' || COALESCE(e.rendered_summary, '')) LIKE '%failed%'
          OR lower(COALESCE(e.searchable_text, '') || ' ' || COALESCE(e.rendered_summary, '')) LIKE '%failure%'
          OR lower(COALESCE(e.searchable_text, '') || ' ' || COALESCE(e.rendered_summary, '')) LIKE '%traceback%'
        )
      )`;
      conditions.push(input.hasFailedTool ? failedToolCondition : `NOT ${failedToolCondition}`);
    }
    if (input.fromTimestamp !== undefined) { conditions.push("e.timestamp >= @from_timestamp"); params.from_timestamp = input.fromTimestamp; }
    if (input.toTimestamp !== undefined) { conditions.push("e.timestamp <= @to_timestamp"); params.to_timestamp = input.toTimestamp; }
    const extra = conditions.length ? `AND ${conditions.join(" AND ")}` : "";
    const rows = this.db.prepare(`
      SELECT e.*,
             snippet(fts_session_events, 0, '<<', '>>', '...', 32) AS snippet,
             bm25(fts_session_events) AS rank
      FROM fts_session_events
      JOIN session_events e ON e.rowid = fts_session_events.rowid
      WHERE fts_session_events MATCH @query
      ${extra}
      ORDER BY rank ASC
      LIMIT @limit OFFSET @offset
    `).all(params) as Array<SessionEventRow & { snippet: string; rank: number }>;
    return rows.map((row) => ({
      event: rowToStructuredEvent(row),
      snippet: row.snippet,
      rank: row.rank,
    }));
  }

  listTurnSummaries(sessionId: string, turnIds?: string[], limit?: number): SessionTurnSummaryRecord[] {
    const params: Record<string, unknown> = { session_id: sessionId };
    let turnFilter = "";
    if (turnIds?.length) {
      const placeholders = turnIds.map((_, index) => `@turn_id_${index}`);
      turnIds.forEach((turnId, index) => { params[`turn_id_${index}`] = turnId; });
      turnFilter = `AND turn_id IN (${placeholders.join(", ")})`;
    }
    const resolvedLimit = limit === undefined ? null : clampInt(limit, 1, MAX_EVENT_LIST_LIMIT, DEFAULT_EVENT_LIST_LIMIT);
    const rows = this.db.prepare(`
      SELECT * FROM session_turn_summaries
      WHERE session_id = @session_id
      ${turnFilter}
      ORDER BY started_at ASC, turn_id ASC
      ${resolvedLimit === null ? "" : "LIMIT @limit"}
    `).all(resolvedLimit === null ? params : { ...params, limit: resolvedLimit }) as TurnSummaryRow[];
    return rows.map(rowToTurnSummary);
  }

  listTurnSummariesForMessageIds(sessionId: string, messageIds: string[], limit = DEFAULT_EVENT_LIST_LIMIT): SessionTurnSummaryRecord[] {
    const uniqueMessageIds = [...new Set(messageIds.filter((id) => id.trim().length > 0))];
    if (!uniqueMessageIds.length) return [];
    const params: Record<string, unknown> = {
      session_id: sessionId,
      limit: clampInt(limit, 1, MAX_EVENT_LIST_LIMIT, DEFAULT_EVENT_LIST_LIMIT),
    };
    const placeholders = uniqueMessageIds.map((id, index) => {
      const key = `message_id_${index}`;
      params[key] = id;
      return `@${key}`;
    }).join(", ");
    const rows = this.db.prepare(`
      SELECT * FROM session_turn_summaries
      WHERE session_id = @session_id
        AND (
          user_message_id IN (${placeholders})
          OR assistant_message_id IN (${placeholders})
        )
      ORDER BY started_at ASC, turn_id ASC
      LIMIT @limit
    `).all(params) as TurnSummaryRow[];
    return rows.map(rowToTurnSummary);
  }

  getProjectionMeta(sessionId: string): SessionProjectionMetaRecord | null {
    const row = this.db.prepare("SELECT * FROM session_projection_meta WHERE session_id = ?").get(sessionId) as ProjectionMetaRow | undefined;
    return row ? rowToProjectionMeta(row) : null;
  }

  markSessionProjectionStale(sessionId: string, reason: string): SessionProjectionMetaRecord {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO session_projection_meta (
        session_id, schema_version, parser_version, projection_status, projection_version,
        event_count, summary_count, projected_at, last_projected_at, stale_reason,
        error, last_error, updated_at
      ) VALUES (
        @session_id, @schema_version, @parser_version, 'stale', @projection_version,
        0, 0, NULL, NULL, @stale_reason, NULL, NULL, @updated_at
      )
      ON CONFLICT(session_id) DO UPDATE SET
        schema_version=excluded.schema_version,
        parser_version=excluded.parser_version,
        projection_version=excluded.projection_version,
        projection_status='stale',
        stale_reason=excluded.stale_reason,
        error=NULL,
        last_error=NULL,
        updated_at=excluded.updated_at
    `).run({
      session_id: sessionId,
      schema_version: SESSION_PROJECTION_SCHEMA_VERSION,
      parser_version: SESSION_PROJECTION_PARSER_VERSION,
      projection_version: SESSION_PROJECTION_SCHEMA_VERSION,
      stale_reason: reason,
      updated_at: now,
    });
    const meta = this.getProjectionMeta(sessionId);
    if (!meta) throw new Error(`markSessionProjectionStale: failed to read back ${sessionId}`);
    return meta;
  }

  rebuildSessionProjection(sessionId: string): RebuildSessionProjectionResult {
    const events = (this.db.prepare(`
      SELECT * FROM session_events
      WHERE session_id = ?
      ORDER BY timestamp ASC, source_line ASC
    `).all(sessionId) as SessionEventRow[]).map(rowToStructuredEvent);
    const now = Date.now();
    const origin = this.listOrigins(sessionId)[0] ?? null;
    const byTurn = new Map<string, SessionStructuredEventRecord[]>();
    for (const event of events) {
      if (!event.turnId) continue;
      const bucket = byTurn.get(event.turnId) ?? [];
      bucket.push(event);
      byTurn.set(event.turnId, bucket);
    }

    const summaries: SessionTurnSummaryRecord[] = [...byTurn.entries()].map(([turnId, turnEvents]) => {
      const sorted = [...turnEvents].sort((a, b) => a.timestamp - b.timestamp || (a.sourceLine ?? 0) - (b.sourceLine ?? 0));
      const startedAt = sorted[0]?.timestamp ?? now;
      const endedAt = sorted.at(-1)?.timestamp ?? null;
      let promptPreview: string | null = null;
      let responsePreview: string | null = null;
      let toolCallCount = 0;
      let failedToolCallCount = 0;
      let diffFileCount = 0;
      let webSearchCount = 0;
      let subagentCount = 0;
      let tokenInput: number | null = null;
      let tokenOutput: number | null = null;
      let hasCompaction = false;
      let aborted = false;
      let interrupted = false;
      let completed = false;
      let userMessageId: string | null = null;
      let assistantMessageId: string | null = null;

      for (const event of sorted) {
        const payload = payloadObject(event);
        if (event.eventKind === "message" && event.role === "user") {
          if (!promptPreview) promptPreview = previewText(event.renderedSummary ?? event.searchableText);
          userMessageId ??= event.itemId;
        }
        if (event.eventKind === "message" && event.role === "assistant") {
          if (!responsePreview) responsePreview = previewText(event.renderedSummary ?? event.searchableText);
          assistantMessageId ??= event.itemId;
        }
        if (event.eventKind === "tool_call" || event.eventKind === "subagent" || event.eventKind === "question" || event.eventKind === "mcp") toolCallCount += 1;
        if (event.eventKind === "subagent") subagentCount += 1;
        if (event.eventKind === "tool_output" && looksLikeFailedTool(event)) failedToolCallCount += 1;
        if (event.eventKind === "patch") diffFileCount += 1;
        if (event.eventKind === "search") webSearchCount += 1;
        if (event.eventKind === "usage") {
          const input = numberPayloadField(payload, ["input_tokens", "inputTokens", "prompt_tokens", "promptTokens"])
            ?? nestedNumberPayloadField(payload, [["usage", "input_tokens"], ["usage", "prompt_tokens"], ["total_token_usage", "input_tokens"]]);
          const output = numberPayloadField(payload, ["output_tokens", "outputTokens", "completion_tokens", "completionTokens"])
            ?? nestedNumberPayloadField(payload, [["usage", "output_tokens"], ["usage", "completion_tokens"], ["total_token_usage", "output_tokens"]]);
          if (input !== null) tokenInput = (tokenInput ?? 0) + input;
          if (output !== null) tokenOutput = (tokenOutput ?? 0) + output;
        }
        hasCompaction ||= event.eventKind === "compaction";
        aborted ||= event.eventType === "event_msg.turn_aborted";
        interrupted ||= event.eventType === "event_msg.turn_interrupted" || payload.status === "interrupted";
        completed ||= event.eventType === "event_msg.task_complete" || event.eventType === "event_msg.item_completed";
      }
      const status: SessionTurnSummaryRecord["status"] = aborted
        ? "aborted"
        : interrupted
          ? "interrupted"
          : failedToolCallCount > 0
            ? "failed"
            : completed
              ? "completed"
              : endedAt === null
                ? "running"
                : "unknown";
      const tokenUsage = tokenInput !== null || tokenOutput !== null ? { input: tokenInput, output: tokenOutput } : null;
      const summary = {
        title: promptPreview ?? responsePreview,
        promptPreview,
        responsePreview,
        eventCount: sorted.length,
      };

      return {
        sessionId,
        turnId,
        startedAt,
        completedAt: status === "completed" || status === "failed" || status === "aborted" || status === "interrupted" ? endedAt : null,
        endedAt,
        durationMs: endedAt === null ? null : Math.max(0, endedAt - startedAt),
        status,
        assistantMessageId,
        userMessageId,
        title: promptPreview ?? responsePreview,
        promptPreview,
        responsePreview,
        toolCallCount,
        failedToolCallCount,
        diffFileCount,
        webSearchCount,
        subagentCount,
        compacted: hasCompaction,
        tokenInput,
        tokenOutput,
        tokenUsage,
        summary,
        hasCompaction,
        aborted,
        interrupted,
        eventCount: sorted.length,
        updatedAt: now,
      };
    });

    const tx = this.db.transaction(() => {
      this.db.prepare("DELETE FROM session_turn_summaries WHERE session_id = ?").run(sessionId);
      const insertSummary = this.db.prepare(`
        INSERT INTO session_turn_summaries (
          session_id, turn_id, started_at, completed_at, ended_at, duration_ms,
          status, assistant_message_id, user_message_id, title,
          prompt_preview, response_preview, tool_call_count, failed_tool_call_count,
          diff_file_count, web_search_count, subagent_count, compacted,
          token_input, token_output, token_usage_json, summary_json,
          has_compaction, aborted, interrupted, event_count, updated_at
        ) VALUES (
          @session_id, @turn_id, @started_at, @completed_at, @ended_at, @duration_ms,
          @status, @assistant_message_id, @user_message_id, @title,
          @prompt_preview, @response_preview, @tool_call_count, @failed_tool_call_count,
          @diff_file_count, @web_search_count, @subagent_count, @compacted,
          @token_input, @token_output, @token_usage_json, @summary_json,
          @has_compaction, @aborted, @interrupted, @event_count, @updated_at
        )
      `);
      for (const summary of summaries) {
        insertSummary.run({
          session_id: summary.sessionId,
          turn_id: summary.turnId,
          started_at: summary.startedAt,
          completed_at: summary.completedAt,
          ended_at: summary.endedAt,
          duration_ms: summary.durationMs,
          status: summary.status,
          assistant_message_id: summary.assistantMessageId,
          user_message_id: summary.userMessageId,
          title: summary.title,
          prompt_preview: summary.promptPreview,
          response_preview: summary.responsePreview,
          tool_call_count: summary.toolCallCount,
          failed_tool_call_count: summary.failedToolCallCount,
          diff_file_count: summary.diffFileCount,
          web_search_count: summary.webSearchCount,
          subagent_count: summary.subagentCount,
          compacted: summary.compacted ? 1 : 0,
          token_input: summary.tokenInput,
          token_output: summary.tokenOutput,
          token_usage_json: summary.tokenUsage != null ? JSON.stringify(summary.tokenUsage) : null,
          summary_json: summary.summary != null ? JSON.stringify(summary.summary) : null,
          has_compaction: summary.hasCompaction ? 1 : 0,
          aborted: summary.aborted ? 1 : 0,
          interrupted: summary.interrupted ? 1 : 0,
          event_count: summary.eventCount,
          updated_at: summary.updatedAt,
        });
      }
      this.db.prepare(`
        INSERT INTO session_projection_meta (
          session_id, source_native_path, source_native_format, source_mtime_ms,
          source_size, source_ino, source_dev, source_cursor_line, source_cursor_hash,
          mirror_hash, last_imported_at, last_projected_at, projection_version,
          schema_version, parser_version, projection_status, event_count,
          summary_count, projected_at, stale_reason, error, last_error, updated_at
        ) VALUES (
          @session_id, @source_native_path, @source_native_format, @source_mtime_ms,
          @source_size, @source_ino, @source_dev, @source_cursor_line, @source_cursor_hash,
          @mirror_hash, @last_imported_at, @last_projected_at, @projection_version,
          @schema_version, @parser_version, 'current', @event_count,
          @summary_count, @projected_at, NULL, NULL, NULL, @updated_at
        )
        ON CONFLICT(session_id) DO UPDATE SET
          source_native_path=excluded.source_native_path,
          source_native_format=excluded.source_native_format,
          source_mtime_ms=excluded.source_mtime_ms,
          source_size=excluded.source_size,
          source_ino=excluded.source_ino,
          source_dev=excluded.source_dev,
          source_cursor_line=excluded.source_cursor_line,
          source_cursor_hash=excluded.source_cursor_hash,
          mirror_hash=excluded.mirror_hash,
          last_imported_at=excluded.last_imported_at,
          last_projected_at=excluded.last_projected_at,
          projection_version=excluded.projection_version,
          schema_version=excluded.schema_version,
          parser_version=excluded.parser_version,
          projection_status='current',
          event_count=excluded.event_count,
          summary_count=excluded.summary_count,
          projected_at=excluded.projected_at,
          stale_reason=NULL,
          error=NULL,
          last_error=NULL,
          updated_at=excluded.updated_at
      `).run({
        session_id: sessionId,
        source_native_path: origin?.nativePath ?? null,
        source_native_format: origin?.nativeFormat ?? null,
        source_mtime_ms: origin?.sourceMtimeMs ?? null,
        source_size: origin?.sourceSize ?? null,
        source_ino: origin?.sourceIno ?? null,
        source_dev: origin?.sourceDev ?? null,
        source_cursor_line: origin?.sourceCursorLine ?? null,
        source_cursor_hash: origin?.sourceCursorHash ?? null,
        mirror_hash: origin?.mirrorHash ?? null,
        last_imported_at: origin?.lastSyncedAt ?? null,
        last_projected_at: now,
        projection_version: SESSION_PROJECTION_SCHEMA_VERSION,
        schema_version: SESSION_PROJECTION_SCHEMA_VERSION,
        parser_version: SESSION_PROJECTION_PARSER_VERSION,
        event_count: events.length,
        summary_count: summaries.length,
        projected_at: now,
        updated_at: now,
      });
      this.db.prepare(`
        UPDATE session_memory_extracts
        SET status='stale', updated_at=@updated_at
        WHERE session_id=@session_id
          AND (
            last_extracted_event_count != @event_count
            OR COALESCE(last_projected_at, 0) < @projected_at
          )
      `).run({
        session_id: sessionId,
        event_count: events.length,
        projected_at: now,
        updated_at: now,
      });
    });
    tx();

    const meta = this.getProjectionMeta(sessionId);
    if (!meta) throw new Error(`rebuildSessionProjection: failed to read back ${sessionId}`);
    return { meta, summaries: this.listTurnSummaries(sessionId) };
  }

  rebuildSessionProjections(input: RebuildSessionProjectionsInput = {}): RebuildSessionProjectionsResult {
    const start = performance.now();
    const maxSessions = optionalBoundedInt(input.maxSessions, 1, 1_000_000);
    const budgetMs = optionalBoundedInt(input.budgetMs, 1, 10 * 60 * 1000);
    const batchSize = clampInt(input.batchSize, 1, 500, 50);
    let offset = clampInt(input.offset, 0, Number.MAX_SAFE_INTEGER, 0);
    const sessionIds: string[] = [];
    let totalMatched = 0;
    let budgetExhausted = false;
    let stopReason: RebuildSessionProjectionsResult["stopReason"] = "drained";

    while (true) {
      if (budgetMs !== undefined && performance.now() - start >= budgetMs) {
        budgetExhausted = true;
        stopReason = "budget_ms";
        break;
      }
      if (maxSessions !== undefined && sessionIds.length >= maxSessions) {
        stopReason = "max_sessions";
        break;
      }
      const page = this.listSessions({
        projectId: input.projectId,
        projectPath: input.projectPath,
        limit: batchSize,
        offset,
      });
      totalMatched = page.total;
      if (page.items.length === 0) break;
      for (const session of page.items) {
        if (budgetMs !== undefined && performance.now() - start >= budgetMs) {
          budgetExhausted = true;
          stopReason = "budget_ms";
          break;
        }
        if (maxSessions !== undefined && sessionIds.length >= maxSessions) {
          stopReason = "max_sessions";
          break;
        }
        this.rebuildSessionProjection(session.id);
        sessionIds.push(session.id);
      }
      offset += page.items.length;
      if (stopReason !== "drained") break;
      if (offset >= page.total) break;
    }

    return {
      sessionsProcessed: sessionIds.length,
      sessionIds,
      totalMatched,
      budgetExhausted,
      stopReason,
      nextOffset: stopReason === "drained" ? null : offset,
    };
  }

  getSessionMemoryExtract(sessionId: string): SessionMemoryExtractRecord | null {
    const row = this.db.prepare("SELECT * FROM session_memory_extracts WHERE session_id = ?").get(sessionId) as MemoryExtractRow | undefined;
    return row ? rowToMemoryExtract(row) : null;
  }

  listPendingSessionMemoryExtractions(input: ListPendingSessionMemoryExtractionsInput = {}): { items: PendingSessionMemoryExtractionRecord[]; total: number } {
    const limit = clampInt(input.limit, 1, 500, 100);
    const offset = clampInt(input.offset, 0, Number.MAX_SAFE_INTEGER, 0);
    const conditions = [
      "pm.projection_status = 'current'",
      "pm.summary_count > 0",
      `(
        me.session_id IS NULL
        OR me.status != 'current'
        OR pm.event_count != me.last_extracted_event_count
        OR COALESCE(pm.projected_at, pm.updated_at, 0) > COALESCE(me.last_extracted_at, 0)
      )`,
    ];
    const params: Record<string, unknown> = { limit, offset };
    if (input.projectId) {
      conditions.push("s.project_id = @project_id");
      params.project_id = input.projectId;
    }
    if (input.projectPath) {
      conditions.push("s.project_path = @project_path");
      params.project_path = normalizeProjectPath(input.projectPath);
    }
    const where = conditions.join(" AND ");
    const total = (this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM session_projection_meta pm
      JOIN sessions s ON s.id = pm.session_id
      LEFT JOIN session_memory_extracts me ON me.session_id = pm.session_id
      WHERE ${where}
    `).get(params) as { count: number }).count;
    const rows = this.db.prepare(`
      SELECT pm.session_id AS session_id,
        CASE
          WHEN me.session_id IS NULL THEN 'never_extracted'
          WHEN pm.event_count != me.last_extracted_event_count THEN 'event_count_changed'
          ELSE 'projection_newer'
        END AS reason
      FROM session_projection_meta pm
      JOIN sessions s ON s.id = pm.session_id
      LEFT JOIN session_memory_extracts me ON me.session_id = pm.session_id
      WHERE ${where}
      ORDER BY COALESCE(pm.projected_at, pm.updated_at, 0) ASC, pm.session_id ASC
      LIMIT @limit OFFSET @offset
    `).all(params) as Array<{ session_id: string; reason: PendingSessionMemoryExtractionRecord["reason"] }>;
    return {
      total,
      items: rows.map((row) => {
        const session = this.getSession(row.session_id);
        const projectionMeta = this.getProjectionMeta(row.session_id);
        if (!session || !projectionMeta) throw new Error(`pending memory extraction referenced missing session ${row.session_id}`);
        return {
          session,
          projectionMeta,
          extract: this.getSessionMemoryExtract(row.session_id),
          reason: row.reason,
        };
      }),
    };
  }

  rebuildSessionMemoryExtract(sessionId: string): SessionMemoryExtractRecord {
    const session = this.getSession(sessionId);
    if (!session) throw new Error(`session not found: ${sessionId}`);
    const meta = this.getProjectionMeta(sessionId);
    if (!meta || meta.projectionStatus !== "current") {
      throw new Error(`session projection is not current: ${sessionId}`);
    }
    const summaries = this.listTurnSummaries(sessionId);
    const now = Date.now();
    const summary = {
      session: {
        id: session.id,
        title: session.title,
        agent: session.agent,
        runtime: session.runtime,
        projectId: session.projectId,
        projectPath: session.projectPath,
        cwd: session.cwd,
        branch: session.branch,
        createdAt: session.createdAt,
        lastMessageAt: session.lastMessageAt,
      },
      projection: {
        eventCount: meta.eventCount,
        summaryCount: meta.summaryCount,
        projectedAt: meta.projectedAt,
        parserVersion: meta.parserVersion,
      },
      totals: {
        turns: summaries.length,
        toolCalls: summaries.reduce((sum, item) => sum + item.toolCallCount, 0),
        failedToolCalls: summaries.reduce((sum, item) => sum + item.failedToolCallCount, 0),
        diffFiles: summaries.reduce((sum, item) => sum + item.diffFileCount, 0),
        webSearches: summaries.reduce((sum, item) => sum + item.webSearchCount, 0),
        subagents: summaries.reduce((sum, item) => sum + item.subagentCount, 0),
        compactedTurns: summaries.filter((item) => item.compacted).length,
        interruptedTurns: summaries.filter((item) => item.interrupted).length,
        abortedTurns: summaries.filter((item) => item.aborted).length,
      },
      turns: summaries.map((summary) => ({
        turnId: summary.turnId,
        startedAt: summary.startedAt,
        completedAt: summary.completedAt,
        status: summary.status,
        title: summary.title,
        promptPreview: summary.promptPreview,
        responsePreview: summary.responsePreview,
        toolCallCount: summary.toolCallCount,
        failedToolCallCount: summary.failedToolCallCount,
        diffFileCount: summary.diffFileCount,
        webSearchCount: summary.webSearchCount,
        subagentCount: summary.subagentCount,
        compacted: summary.compacted,
        tokenUsage: summary.tokenUsage,
      })),
    };
    this.db.prepare(`
      INSERT INTO session_memory_extracts (
        session_id, summary_version, status, last_extracted_at,
        last_extracted_event_count, last_projected_at, summary_json,
        last_error, updated_at
      ) VALUES (
        @session_id, @summary_version, 'current', @last_extracted_at,
        @last_extracted_event_count, @last_projected_at, @summary_json,
        NULL, @updated_at
      )
      ON CONFLICT(session_id) DO UPDATE SET
        summary_version=excluded.summary_version,
        status='current',
        last_extracted_at=excluded.last_extracted_at,
        last_extracted_event_count=excluded.last_extracted_event_count,
        last_projected_at=excluded.last_projected_at,
        summary_json=excluded.summary_json,
        last_error=NULL,
        updated_at=excluded.updated_at
    `).run({
      session_id: sessionId,
      summary_version: SESSION_MEMORY_SUMMARY_VERSION,
      last_extracted_at: now,
      last_extracted_event_count: meta.eventCount,
      last_projected_at: meta.projectedAt ?? meta.updatedAt,
      summary_json: JSON.stringify(summary),
      updated_at: now,
    });
    const extract = this.getSessionMemoryExtract(sessionId);
    if (!extract) throw new Error(`rebuildSessionMemoryExtract: failed to read back ${sessionId}`);
    return extract;
  }

  rebuildSessionMemoryExtracts(input: RebuildSessionMemoryExtractsInput = {}): RebuildSessionMemoryExtractsResult {
    const start = performance.now();
    const maxSessions = optionalBoundedInt(input.maxSessions, 1, 1_000_000);
    const budgetMs = optionalBoundedInt(input.budgetMs, 1, 10 * 60 * 1000);
    const sessionIds: string[] = [];
    let totalPending = 0;
    let budgetExhausted = false;
    let stopReason: RebuildSessionMemoryExtractsResult["stopReason"] = "drained";
    let offset = clampInt(input.offset, 0, Number.MAX_SAFE_INTEGER, 0);

    while (true) {
      if (budgetMs !== undefined && performance.now() - start >= budgetMs) {
        budgetExhausted = true;
        stopReason = "budget_ms";
        break;
      }
      if (maxSessions !== undefined && sessionIds.length >= maxSessions) {
        stopReason = "max_sessions";
        break;
      }
      const remaining = maxSessions === undefined ? 100 : Math.max(1, Math.min(100, maxSessions - sessionIds.length));
      const page = this.listPendingSessionMemoryExtractions({
        projectId: input.projectId,
        projectPath: input.projectPath,
        limit: remaining,
        offset,
      });
      totalPending = Math.max(totalPending, page.total + sessionIds.length);
      if (page.items.length === 0) break;
      for (const item of page.items) {
        if (budgetMs !== undefined && performance.now() - start >= budgetMs) {
          budgetExhausted = true;
          stopReason = "budget_ms";
          break;
        }
        if (maxSessions !== undefined && sessionIds.length >= maxSessions) {
          stopReason = "max_sessions";
          break;
        }
        this.rebuildSessionMemoryExtract(item.session.id);
        sessionIds.push(item.session.id);
      }
      offset = 0;
      if (stopReason !== "drained") break;
    }

    return {
      sessionsProcessed: sessionIds.length,
      sessionIds,
      totalPending,
      budgetExhausted,
      stopReason,
      nextOffset: stopReason === "drained" ? null : 0,
    };
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

function optionalBoundedInt(value: unknown, min: number, max: number): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function escapeSqlLike(value: string): string {
  return value.replaceAll("~", "~~").replaceAll("%", "~%").replaceAll("_", "~_");
}
