import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import Database from "better-sqlite3";

import { SessionsServiceStore, stableProjectIdFromPath } from "./store.ts";

test("projects can use opaque resource ids as stable identity while paths move", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-sessions-resource-id-"));
  const dbPath = path.join(rootDir, "sessions.sqlite");
  const store = new SessionsServiceStore(dbPath);
  const firstPath = path.join(rootDir, "Before");
  const secondPath = path.join(rootDir, "After");

  const created = store.createProject({
    resourceId: "res_projectabc123",
    displayName: "Before",
    path: firstPath,
  });
  assert.equal(created.id, "res_projectabc123");
  assert.equal(created.resourceId, "res_projectabc123");
  assert.notEqual(created.id, stableProjectIdFromPath(firstPath));

  const moved = store.updateProject(created.id, {
    displayName: "After",
    path: secondPath,
  });
  assert.equal(moved?.id, created.id);
  assert.equal(moved?.resourceId, "res_projectabc123");
  assert.equal(moved?.path, secondPath);
  assert.equal(store.getProjectByResourceId("res_projectabc123")?.path, secondPath);
  assert.equal(store.getProjectByPath(secondPath)?.id, created.id);

  store.close();
});

test("legacy project schema migrates resource ids before creating dependent indexes", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-sessions-legacy-projects-"));
  const dbPath = path.join(rootDir, "sessions.sqlite");
  const legacyDb = new Database(dbPath);
  legacyDb.exec(`
    CREATE TABLE projects (
      id                 TEXT PRIMARY KEY,
      display_name       TEXT NOT NULL,
      path               TEXT NOT NULL UNIQUE,
      hidden             INTEGER NOT NULL DEFAULT 0,
      archived           INTEGER NOT NULL DEFAULT 0,
      sort_rank          INTEGER NOT NULL DEFAULT 0,
      created_at         INTEGER NOT NULL,
      updated_at         INTEGER NOT NULL
    );
    CREATE TABLE sessions (
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
      status             TEXT NOT NULL DEFAULT 'active',
      custom_metadata    TEXT
    );
    CREATE TABLE session_messages (
      id                 TEXT PRIMARY KEY,
      session_id         TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role               TEXT NOT NULL,
      content_text       TEXT NOT NULL,
      content_blocks     TEXT,
      timestamp          INTEGER NOT NULL,
      tool_calls         TEXT,
      work_summary       TEXT,
      audio_ref          TEXT,
      attachments        TEXT,
      source_native_id   TEXT
    );
  `);
  legacyDb.close();

  const store = new SessionsServiceStore(dbPath);
  const project = store.createProject({
    resourceId: "res_legacy123",
    displayName: "Migrated",
    path: path.join(rootDir, "Migrated"),
  });

  assert.equal(project.resourceId, "res_legacy123");
  assert.equal(store.getProjectByResourceId("res_legacy123")?.id, "res_legacy123");
  store.close();
});
