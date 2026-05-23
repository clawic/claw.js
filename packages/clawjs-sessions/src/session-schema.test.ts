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
      VALUES ('legacy-message', 'legacy-session', 'user', 'kept authorization=Bearer legacysecret', 2, 'legacy-line');
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
  assert.equal(store.getSessionWithMessages("legacy-session")?.messages[0]?.contentText, "kept authorization=Bearer legacysecret");
  assert.equal(
    (db.prepare("SELECT version FROM sessions_service_schema_meta WHERE id = 'schema'").get() as { version: number }).version,
    7,
  );

  assert.deepEqual(["session_events", "fts_session_events", "session_turn_summaries", "session_projection_meta", "session_memory_extracts", "session_dynamic_tools", "fts_session_messages"].every((name) => objectNames(db, "table").includes(name)), true);
  assert.equal(objectNames(db, "table").includes("fts_messages"), false);
  assert.deepEqual([
    "idx_sessions_sidebar_bootstrap",
    "idx_sessions_sidebar_recent_order",
    "idx_sessions_sidebar_project_recent_order",
    "idx_sessions_sidebar_project_recent",
    "idx_sessions_project_active_recent",
    "idx_sessions_agent_runtime_recent",
    "idx_session_events_session_time",
    "idx_session_events_turn_time",
    "idx_session_events_call",
    "idx_session_events_kind_time",
    "idx_session_turn_summaries_session_time",
    "idx_session_projection_meta_status",
    "idx_session_memory_extracts_status",
    "idx_session_memory_extracts_extracted",
    "idx_session_dynamic_tools_session",
    "idx_session_dynamic_tools_namespace_name",
    "idx_session_dynamic_tools_schema_hash",
  ].every((name) => objectNames(db, "index").includes(name)), true);
  assert.deepEqual(["session_events_ai", "session_events_ad", "session_events_au", "session_messages_search_ai", "session_messages_search_ad", "session_messages_search_au"].every((name) => objectNames(db, "trigger").includes(name)), true);
  assert.deepEqual(["session_messages_ai", "session_messages_ad", "session_messages_au"].every((name) => !objectNames(db, "trigger").includes(name)), true);

  assert.equal(columnNames(db, "session_messages").includes("searchable_text"), true);
  assert.equal(
    (db.prepare("SELECT searchable_text FROM session_messages WHERE id = ?").get("legacy-message") as { searchable_text: string }).searchable_text,
    "kept authorization=[REDACTED]",
  );
  const legacyHits = store.searchMessages({ query: "kept" });
  assert.equal(legacyHits.length, 1);
  assert.equal(legacyHits[0]?.snippet.includes("legacysecret"), false);
  assert.equal(legacyHits[0]?.message.contentText.includes("legacysecret"), true);
  assert.equal(store.searchMessages({ query: "legacysecret" }).length, 0);

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
  assert.deepEqual([
    "session_id",
    "summary_version",
    "status",
    "last_extracted_at",
    "last_extracted_event_count",
    "last_projected_at",
    "summary_json",
    "last_error",
  ].every((name) => columnNames(db, "session_memory_extracts").includes(name)), true);

  store.close();
  const reopened = new SessionsServiceStore(dbPath);
  assert.equal(
    (rawDb(reopened).prepare("SELECT version FROM sessions_service_schema_meta WHERE id = 'schema'").get() as { version: number }).version,
    7,
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
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM session_memory_extracts").get() as { n: number }).n, 0);
  assert.equal(store.searchSessionEvents({ query: "gamma" }).length, 0);
  store.close();
});

test("message and event search support bounded timestamp ranges", () => {
  const rootDir = tempRoot("clawjs-sessions-search-date-range-");
  const store = new SessionsServiceStore(path.join(rootDir, "sessions.sqlite"));
  try {
    store.createSession({ id: "session-range", agent: "codex", title: "Range" });
    store.appendMessage({
      id: "message-old",
      sessionId: "session-range",
      role: "user",
      contentText: "range needle old",
      timestamp: 10,
    });
    store.appendMessage({
      id: "message-new",
      sessionId: "session-range",
      role: "assistant",
      contentText: "range needle new",
      timestamp: 30,
    });
    store.appendSessionEvent({
      sessionId: "session-range",
      eventKind: "message",
      eventType: "event_msg.user_message",
      timestamp: 10,
      sourceNativeId: "rollout::line:1",
      payloadJson: { message: "range event old" },
      renderedSummary: "range event old",
      searchableText: "range event old",
    });
    store.appendSessionEvent({
      sessionId: "session-range",
      eventKind: "message",
      eventType: "event_msg.agent_message",
      timestamp: 30,
      sourceNativeId: "rollout::line:2",
      payloadJson: { message: "range event new" },
      renderedSummary: "range event new",
      searchableText: "range event new",
    });

    assert.deepEqual(
      store.searchMessages({ query: "range", fromTimestamp: 20 }).map((hit) => hit.message.id),
      ["message-new"],
    );
    assert.deepEqual(
      store.searchMessages({ query: "range", toTimestamp: 20 }).map((hit) => hit.message.id),
      ["message-old"],
    );
    assert.deepEqual(
      store.searchSessionEvents({ query: "range", fromTimestamp: 20 }).map((hit) => hit.event.sourceNativeId),
      ["rollout::line:2"],
    );
    assert.deepEqual(
      store.searchSessionEvents({ query: "range", toTimestamp: 20 }).map((hit) => hit.event.sourceNativeId),
      ["rollout::line:1"],
    );
  } finally {
    store.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("event search supports derived session event filters", () => {
  const rootDir = tempRoot("clawjs-sessions-event-derived-filters-");
  const store = new SessionsServiceStore(path.join(rootDir, "sessions.sqlite"));
  try {
    store.createSession({ id: "session-facets", agent: "codex", title: "Facets" });
    store.appendSessionEvent({
      sessionId: "session-facets",
      eventKind: "tool_output",
      eventType: "response_item.function_call_output",
      timestamp: 10,
      sourceNativeId: "rollout::line:1",
      payloadJson: { name: "exec_command", status: "failed", output: "facet failure" },
      renderedSummary: "facet failure",
      searchableText: "facet failure exit code 1",
    });
    store.appendSessionEvent({
      sessionId: "session-facets",
      eventKind: "patch",
      eventType: "event_msg.patch_apply_end",
      timestamp: 20,
      sourceNativeId: "rollout::line:2",
      payloadJson: { status: "success" },
      renderedSummary: "facet patch",
      searchableText: "facet patch",
    });
    store.appendSessionEvent({
      sessionId: "session-facets",
      eventKind: "search",
      eventType: "event_msg.web_search_end",
      timestamp: 30,
      sourceNativeId: "rollout::line:3",
      payloadJson: { status: "success" },
      renderedSummary: "facet web",
      searchableText: "facet web",
    });
    store.appendSessionEvent({
      sessionId: "session-facets",
      eventKind: "compaction",
      eventType: "event_msg.context_compacted",
      timestamp: 40,
      sourceNativeId: "rollout::line:4",
      payloadJson: { status: "success" },
      renderedSummary: "facet compacted",
      searchableText: "facet compacted",
    });
    store.appendSessionEvent({
      sessionId: "session-facets",
      eventKind: "goal",
      eventType: "event_msg.thread_goal_updated",
      timestamp: 50,
      sourceNativeId: "rollout::line:5",
      payloadJson: { status: "success" },
      renderedSummary: "facet goal",
      searchableText: "facet goal",
    });

    assert.deepEqual(
      store.searchSessionEvents({ query: "facet", toolName: "exec_command", status: "failed", hasFailedTool: true }).map((hit) => hit.event.sourceNativeId),
      ["rollout::line:1"],
    );
    assert.deepEqual(
      store.searchSessionEvents({ query: "facet", hasDiff: true }).map((hit) => hit.event.sourceNativeId),
      ["rollout::line:2"],
    );
    assert.deepEqual(
      store.searchSessionEvents({ query: "facet", hasWebSearch: true }).map((hit) => hit.event.sourceNativeId),
      ["rollout::line:3"],
    );
    assert.deepEqual(
      store.searchSessionEvents({ query: "facet", hasCompaction: true }).map((hit) => hit.event.sourceNativeId),
      ["rollout::line:4"],
    );
    assert.deepEqual(
      store.searchSessionEvents({ query: "facet", hasGoal: true }).map((hit) => hit.event.sourceNativeId),
      ["rollout::line:5"],
    );
  } finally {
    store.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("session memory extracts track current projections and pending changes without reading rollouts", () => {
  const rootDir = tempRoot("clawjs-sessions-memory-extract-");
  const store = new SessionsServiceStore(path.join(rootDir, "sessions.sqlite"));
  try {
    store.createProject({ id: "project-1", path: path.join(rootDir, "project"), displayName: "Project" });
    store.createSession({
      id: "session-memory",
      agent: "codex",
      title: "Memory session",
      projectId: "project-1",
      projectPath: path.join(rootDir, "project"),
    });
    store.appendSessionEvent({
      sessionId: "session-memory",
      turnId: "turn-1",
      itemId: "message-user-1",
      eventKind: "message",
      eventType: "event_msg.user_message",
      role: "user",
      timestamp: 10,
      sourceNativeId: "rollout::line:1",
      payloadJson: { message: "remember deterministic summaries" },
      searchableText: "remember deterministic summaries",
      renderedSummary: "remember deterministic summaries",
    });
    store.appendSessionEvent({
      sessionId: "session-memory",
      turnId: "turn-1",
      itemId: "message-assistant-1",
      eventKind: "message",
      eventType: "event_msg.agent_message",
      role: "assistant",
      timestamp: 20,
      sourceNativeId: "rollout::line:2",
      payloadJson: { message: "memory base response" },
      searchableText: "memory base response",
      renderedSummary: "memory base response",
    });
    store.rebuildSessionProjection("session-memory");

    const pending = store.listPendingSessionMemoryExtractions({ projectId: "project-1" });
    assert.equal(pending.total, 1);
    assert.equal(pending.items[0]?.reason, "never_extracted");
    assert.equal(pending.items[0]?.projectionMeta.projectionStatus, "current");

    const extract = store.rebuildSessionMemoryExtract("session-memory");
    assert.equal(extract.status, "current");
    assert.equal(extract.lastExtractedEventCount, 2);
    assert.match(JSON.stringify(extract.summaryJson), /memory base response/);
    assert.equal(store.listPendingSessionMemoryExtractions({ projectId: "project-1" }).total, 0);

    store.appendSessionEvent({
      sessionId: "session-memory",
      turnId: "turn-2",
      itemId: "message-user-2",
      eventKind: "message",
      eventType: "event_msg.user_message",
      role: "user",
      timestamp: 30,
      sourceNativeId: "rollout::line:3",
      payloadJson: { message: "changed after extract" },
      searchableText: "changed after extract",
      renderedSummary: "changed after extract",
    });
    store.rebuildSessionProjection("session-memory");
    const changed = store.listPendingSessionMemoryExtractions({ projectId: "project-1" });
    assert.equal(changed.total, 1);
    assert.equal(changed.items[0]?.reason, "event_count_changed");
    assert.equal(store.getSessionMemoryExtract("session-memory")?.status, "stale");
  } finally {
    store.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
