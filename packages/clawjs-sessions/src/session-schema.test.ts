import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { test } from "vitest";

import { SessionsServiceStore } from "./store.ts";

function tempRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function rawDb(store: SessionsServiceStore): Database.Database {
  return (store as unknown as { db: Database.Database }).db;
}

function columnNames(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((row) => row.name);
}

function objectNames(db: Database.Database, type: "table" | "index" | "trigger"): string[] {
  return (db.prepare("SELECT name FROM sqlite_master WHERE type = ? ORDER BY name").all(type) as Array<{ name: string }>).map((row) => row.name);
}

function createV2Database(dbPath: string): void {
  const db = new Database(dbPath);
  try {
    db.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        hidden INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0,
        sort_rank INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        agent TEXT NOT NULL,
        runtime TEXT,
        machine TEXT,
        workspace_id TEXT,
        project_path TEXT,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_message_at INTEGER,
        message_count INTEGER NOT NULL DEFAULT 0,
        pinned INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0,
        sidebar_visible INTEGER NOT NULL DEFAULT 1,
        branch TEXT,
        cwd TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        custom_metadata TEXT
      );
      CREATE TABLE session_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content_text TEXT NOT NULL,
        content_blocks TEXT,
        timestamp INTEGER NOT NULL,
        tool_calls TEXT,
        work_summary TEXT,
        audio_ref TEXT,
        attachments TEXT,
        source_native_id TEXT,
        UNIQUE (session_id, source_native_id)
      );
      CREATE TABLE session_origins (
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        native_path TEXT NOT NULL,
        native_format TEXT NOT NULL,
        last_synced_at INTEGER NOT NULL,
        mirror_hash TEXT,
        PRIMARY KEY (session_id, native_path)
      );
      CREATE VIRTUAL TABLE fts_messages USING fts5(
        content_text,
        content='session_messages',
        content_rowid='rowid'
      );
      CREATE TABLE sessions_service_schema_meta (
        id TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      INSERT INTO sessions_service_schema_meta (id, version, updated_at)
      VALUES ('schema', 2, 1);
      INSERT INTO sessions (id, agent, title, created_at, status)
      VALUES ('legacy-session', 'codex', 'Legacy', 1, 'active');
      INSERT INTO session_messages (id, session_id, role, content_text, timestamp, source_native_id)
      VALUES ('legacy-message', 'legacy-session', 'user', 'kept', 2, 'legacy-line');
    `);
  } finally {
    db.close();
  }
}

test("sessions schema migrates v2 stores idempotently and adds event projection surfaces", () => {
  const rootDir = tempRoot("clawjs-sessions-schema-migrate-");
  const dbPath = path.join(rootDir, "sessions.sqlite");
  createV2Database(dbPath);

  const store = new SessionsServiceStore(dbPath);
  const db = rawDb(store);

  assert.equal(db.pragma("foreign_keys", { simple: true }), 1);
  assert.equal(store.getSessionWithMessages("legacy-session")?.messages[0]?.contentText, "kept");
  assert.equal(
    (db.prepare("SELECT version FROM sessions_service_schema_meta WHERE id = 'schema'").get() as { version: number }).version,
    4,
  );

  assert.deepEqual(["session_events", "fts_session_events", "session_turn_summaries", "session_projection_meta", "session_dynamic_tools"].every((name) => objectNames(db, "table").includes(name)), true);
  assert.deepEqual([
    "idx_sessions_sidebar_bootstrap",
    "idx_sessions_sidebar_project_recent",
    "idx_sessions_project_active_recent",
    "idx_sessions_agent_runtime_recent",
    "idx_session_events_session_time",
    "idx_session_events_turn_time",
    "idx_session_events_call",
    "idx_session_events_kind_time",
    "idx_session_turn_summaries_session_time",
    "idx_session_projection_meta_status",
    "idx_session_dynamic_tools_session",
    "idx_session_dynamic_tools_namespace_name",
    "idx_session_dynamic_tools_schema_hash",
  ].every((name) => objectNames(db, "index").includes(name)), true);
  assert.deepEqual(["session_events_ai", "session_events_ad", "session_events_au"].every((name) => objectNames(db, "trigger").includes(name)), true);

  assert.deepEqual([
    "completed_at",
    "status",
    "assistant_message_id",
    "user_message_id",
    "subagent_count",
    "compacted",
    "token_usage_json",
    "summary_json",
  ].every((name) => columnNames(db, "session_turn_summaries").includes(name)), true);
  assert.deepEqual([
    "source_native_path",
    "source_native_format",
    "source_cursor_line",
    "mirror_hash",
    "last_imported_at",
    "last_projected_at",
    "projection_version",
    "last_error",
  ].every((name) => columnNames(db, "session_projection_meta").includes(name)), true);
  assert.deepEqual([
    "session_id",
    "position",
    "name",
    "namespace",
    "description",
    "input_schema_json",
    "schema_hash",
    "defer_loading",
    "source",
  ].every((name) => columnNames(db, "session_dynamic_tools").includes(name)), true);

  store.close();
  const reopened = new SessionsServiceStore(dbPath);
  assert.equal(
    (rawDb(reopened).prepare("SELECT version FROM sessions_service_schema_meta WHERE id = 'schema'").get() as { version: number }).version,
    4,
  );
  assert.equal(reopened.getSessionWithMessages("legacy-session")?.messages.length, 1);
  reopened.close();
});

test("session_events FTS tracks insert, update, delete and session cascades", () => {
  const rootDir = tempRoot("clawjs-sessions-schema-fts-");
  const store = new SessionsServiceStore(path.join(rootDir, "sessions.sqlite"));
  const db = rawDb(store);
  store.createSession({ id: "session-1", agent: "codex", title: "Session" });

  const event = store.appendSessionEvent({
    sessionId: "session-1",
    turnId: "turn-1",
    eventKind: "tool_output",
    eventType: "response_item.function_call_output",
    timestamp: 10,
    sourceNativeId: "rollout::line:1",
    payloadJson: { output: "alpha failure" },
    searchableText: "alpha failure",
    renderedSummary: "alpha failure",
  });
  assert.equal(store.searchSessionEvents({ query: "alpha", sessionId: "session-1" }).length, 1);

  db.prepare("UPDATE session_events SET searchable_text = ?, rendered_summary = ? WHERE id = ?").run("beta fixed", "beta fixed", event.id);
  assert.equal(store.searchSessionEvents({ query: "alpha", sessionId: "session-1" }).length, 0);
  assert.equal(store.searchSessionEvents({ query: "beta", sessionId: "session-1" }).length, 1);

  db.prepare("DELETE FROM session_events WHERE id = ?").run(event.id);
  assert.equal(store.searchSessionEvents({ query: "beta", sessionId: "session-1" }).length, 0);

  store.appendSessionEvent({
    sessionId: "session-1",
    turnId: "turn-1",
    eventKind: "tool_output",
    eventType: "response_item.function_call_output",
    timestamp: 20,
    sourceNativeId: "rollout::line:2",
    payloadJson: { output: "gamma failure" },
    searchableText: "gamma failure",
    renderedSummary: "gamma failure",
  });
  assert.equal(store.rebuildSessionProjection("session-1").summaries.length, 1);
  assert.equal(store.deleteSession("session-1"), true);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM session_events").get() as { n: number }).n, 0);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM session_turn_summaries").get() as { n: number }).n, 0);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM session_projection_meta").get() as { n: number }).n, 0);
  assert.equal(store.searchSessionEvents({ query: "gamma" }).length, 0);
  store.close();
});
