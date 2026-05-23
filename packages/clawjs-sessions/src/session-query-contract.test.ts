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

function explainDetails(db: Database.Database, sql: string, params: Record<string, unknown> | unknown[] = {}): string[] {
  return (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(params) as Array<{ detail: string }>).map((row) => row.detail);
}

function assertIndexBacked(details: string[], indexName: string): void {
  assert.ok(
    details.some((detail) => detail.includes(`USING INDEX ${indexName}`)),
    `expected ${indexName} in query plan:\n${details.join("\n")}`,
  );
  assert.equal(
    details.some((detail) => detail.includes("USE TEMP B-TREE")),
    false,
    `critical session query must not sort through a temp b-tree:\n${details.join("\n")}`,
  );
}

test("critical session query contracts stay bounded and index-backed", () => {
  const rootDir = tempRoot("clawjs-session-query-contract-");
  const store = new SessionsServiceStore(path.join(rootDir, "sessions.sqlite"));
  try {
    const projectPath = path.join(rootDir, "project-a");
    const project = store.createProject({ id: "project-a", path: projectPath, displayName: "Project A" });

    for (let index = 0; index < 80; index += 1) {
      const sessionId = `session-${index.toString().padStart(3, "0")}`;
      store.createSession({
        id: sessionId,
        agent: "codex",
        runtime: index % 2 === 0 ? "cli" : "desktop",
        projectId: index % 3 === 0 ? project.id : undefined,
        title: `Session ${index}`,
        createdAt: index + 1,
      });
      if (index % 11 === 0) store.setPinned(sessionId, true);
      store.appendMessage({
        id: `message-${index}`,
        sessionId,
        role: "user",
        contentText: `message ${index}`,
        timestamp: 10_000 + index,
      });
    }

    for (let index = 0; index < 1_105; index += 1) {
      store.appendMessage({
        id: `deep-message-${index}`,
        sessionId: "session-000",
        role: index % 2 === 0 ? "user" : "assistant",
        contentText: `deep message ${index}`,
        timestamp: 20_000 + index,
      });
    }
    for (let index = 0; index < 20; index += 1) {
      store.appendSessionEvent({
        sessionId: "session-000",
        turnId: "turn-hot",
        eventKind: index % 2 === 0 ? "message" : "tool_output",
        eventType: index % 2 === 0 ? "response_item.message" : "response_item.function_call_output",
        timestamp: 30_000 + index,
        sourceLine: index + 1,
        sourceNativeId: `rollout::line:${index + 1}`,
        payloadJson: { index },
        renderedSummary: `event ${index}`,
        searchableText: `event ${index}`,
      });
    }

    const db = rawDb(store);
    const sidebarDetails = explainDetails(
      db,
      `SELECT * FROM sessions
       WHERE archived = @archived AND sidebar_visible = @sidebar_visible
       ORDER BY pinned DESC, COALESCE(last_message_at, created_at) DESC
       LIMIT @limit OFFSET @offset`,
      { archived: 0, sidebar_visible: 1, limit: 20, offset: 0 },
    );
    assertIndexBacked(sidebarDetails, "idx_sessions_sidebar_recent_order");

    const projectDetails = explainDetails(
      db,
      `SELECT * FROM sessions
       WHERE archived = @archived AND sidebar_visible = @sidebar_visible AND project_id = @project_id
       ORDER BY pinned DESC, COALESCE(last_message_at, created_at) DESC
       LIMIT @limit OFFSET @offset`,
      { archived: 0, sidebar_visible: 1, project_id: project.id, limit: 20, offset: 0 },
    );
    assertIndexBacked(projectDetails, "idx_sessions_sidebar_project_recent_order");

    const messagesDetails = explainDetails(
      db,
      `SELECT * FROM session_messages
       WHERE session_id = ?
       ORDER BY timestamp ASC, rowid ASC
       LIMIT ? OFFSET ?`,
      ["session-000", 50, 100],
    );
    assertIndexBacked(messagesDetails, "idx_messages_session_time");

    const turnEventsDetails = explainDetails(
      db,
      `SELECT * FROM session_events
       WHERE session_id = @session_id AND turn_id = @turn_id
       ORDER BY timestamp ASC, source_line ASC
       LIMIT @limit OFFSET @offset`,
      { session_id: "session-000", turn_id: "turn-hot", limit: 10, offset: 0 },
    );
    assertIndexBacked(turnEventsDetails, "idx_session_events_turn_time");

    const page = store.listSessions({ archived: false, sidebarVisible: true, limit: 20 });
    assert.equal(page.items.length, 20);
    assert.equal(page.total, 80);

    const hydrated = store.hydrateSession({ sessionId: "session-000", messageLimit: 5_000 });
    assert.ok(hydrated);
    assert.equal(hydrated.messages.length, 1_000);
    assert.equal(hydrated.messageLimit, 1_000);
    assert.equal(hydrated.messageOffset, 106);
    assert.equal(hydrated.hasOlderMessages, true);
    assert.equal(hydrated.hasNewerMessages, false);
    assert.equal(hydrated.events, null);
  } finally {
    store.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
