import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { test } from "vitest";

import { clawApiPath } from "@clawjs/core";

import { buildSessionsApp } from "./app.ts";
import { SessionsServiceStore } from "./store.ts";

function tempRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function rawDb(store: SessionsServiceStore): Database.Database {
  return (store as unknown as { db: Database.Database }).db;
}

function explainDetails(db: Database.Database, sql: string, params: Record<string, unknown> = {}): string[] {
  return (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(params) as Array<{ detail: string }>).map((row) => row.detail);
}

test("quickSwitchSessions stays on session headers and ignores transcript-only matches", () => {
  const rootDir = tempRoot("clawjs-quick-switch-");
  const store = new SessionsServiceStore(path.join(rootDir, "sessions.sqlite"));
  try {
    const projectPath = path.join(rootDir, "workspace-alpha");
    const project = store.createProject({ id: "project-alpha", path: projectPath, displayName: "Alpha" });
    store.createSession({
      id: "header-match-old",
      agent: "codex",
      projectId: project.id,
      projectPath,
      createdAt: 1_000,
      title: "Needle migration",
      cwd: projectPath,
      branch: "feature/alpha",
    });
    store.createSession({
      id: "header-match-pinned",
      agent: "codex",
      projectId: project.id,
      projectPath,
      createdAt: 2_000,
      title: "Needle release",
      cwd: projectPath,
      branch: "main",
    });
    store.setPinned("header-match-pinned", true);
    store.createSession({
      id: "transcript-only",
      agent: "codex",
      projectId: project.id,
      projectPath,
      createdAt: 3_000,
      title: "Unrelated title",
    });
    store.appendMessage({
      id: "message-transcript-only",
      sessionId: "transcript-only",
      role: "user",
      contentText: "needle appears only in a transcript body",
      timestamp: 3_500,
    });
    store.createSession({
      id: "hidden-alpha",
      agent: "codex",
      projectId: project.id,
      projectPath,
      createdAt: 4_000,
      title: "Needle hidden",
    });
    store.setSidebarVisibility("hidden-alpha", false);
    store.createSession({
      id: "archived-alpha",
      agent: "codex",
      projectId: project.id,
      projectPath,
      createdAt: 5_000,
      title: "Needle archived",
    });
    store.setArchived("archived-alpha", true);

    const result = store.quickSwitchSessions({ query: "needle", limit: 999 });

    assert.deepEqual(result.items.map((session) => session.id), ["header-match-pinned", "header-match-old"]);
    assert.equal(result.total, 2);
    assert.equal(result.limit, 50);
    assert.equal(result.source, "sessions.quick_switch");
    assert.equal(result.searchedMessageHistory, false);
  } finally {
    store.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("quick switch ordering remains index-backed for unfiltered sidebar headers", () => {
  const rootDir = tempRoot("clawjs-quick-switch-plan-");
  const store = new SessionsServiceStore(path.join(rootDir, "sessions.sqlite"));
  try {
    const db = rawDb(store);
    const details = explainDetails(
      db,
      `SELECT * FROM sessions
       WHERE sidebar_visible = @sidebar_visible AND archived = @archived
       ORDER BY pinned DESC, COALESCE(last_message_at, created_at) DESC
       LIMIT @limit OFFSET @offset`,
      { sidebar_visible: 1, archived: 0, limit: 20, offset: 0 },
    );
    assert.equal(
      details.some((detail) => detail.includes("session_messages") || detail.includes("fts_session_messages") || detail.includes("fts_session_events")),
      false,
      `quick switch query must not touch deep search tables:\n${details.join("\n")}`,
    );
    assert.ok(
      details.some((detail) => detail.includes("USING INDEX idx_sessions_sidebar_recent_order")),
      `expected sidebar index in query plan:\n${details.join("\n")}`,
    );
    assert.equal(
      details.some((detail) => detail.includes("USE TEMP B-TREE")),
      false,
      `quick switch query must not sort through a temp b-tree:\n${details.join("\n")}`,
    );
  } finally {
    store.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("quick switch endpoint returns the bounded header-only result contract", async () => {
  const rootDir = tempRoot("clawjs-quick-switch-api-");
  const dbPath = path.join(rootDir, "sessions.sqlite");
  const seed = new SessionsServiceStore(dbPath);
  try {
    seed.createSession({ id: "api-match", agent: "codex", title: "Deploy notes", createdAt: 10 });
    seed.createSession({ id: "api-message-only", agent: "codex", title: "Other", createdAt: 11 });
    seed.appendMessage({
      id: "api-message-only-text",
      sessionId: "api-message-only",
      role: "user",
      contentText: "deploy appears only in message history",
      timestamp: 12,
    });
  } finally {
    seed.close();
  }
  const { app } = buildSessionsApp({
    config: {
      sharedSecret: "test-secret",
      dataDir: path.join(rootDir, "data"),
      dbPath,
    },
  });
  try {
    const response = await app.inject({
      method: "GET",
      url: `${clawApiPath("sidebar/quick-switch")}?q=deploy&limit=5`,
      headers: { authorization: "Bearer test-secret" },
    });
    assert.equal(response.statusCode, 200);
    const body = response.json() as {
      items: Array<{ id: string }>;
      source: string;
      searchedMessageHistory: boolean;
    };
    assert.deepEqual(body.items.map((session) => session.id), ["api-match"]);
    assert.equal(body.source, "sessions.quick_switch");
    assert.equal(body.searchedMessageHistory, false);
  } finally {
    await app.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
