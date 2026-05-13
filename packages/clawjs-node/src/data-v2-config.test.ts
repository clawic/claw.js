import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import Database from "better-sqlite3";

import { loadAudioConfig } from "../../clawjs-audio/src/config.ts";
import { loadChannelConfig } from "../../clawjs-channel-base/src/index.ts";
import { loadIndexConfig } from "../../clawjs-index/src/config.ts";
import { loadMCPConfig } from "../../clawjs-mcp/src/config.ts";
import { loadRuntimeConfig } from "../../clawjs-runtime/src/config.ts";
import { loadSandboxConfig } from "../../clawjs-sandbox/src/config.ts";
import { loadSessionsConfig } from "../../clawjs-sessions/src/config.ts";
import { loadSignalsServiceConfig } from "../../signals/src/config.ts";
import { loadUserModelConfig } from "../../clawjs-user-model/src/config.ts";
import { loadVoiceConfig } from "../../clawjs-voice/src/config.ts";
import { createSqliteWorkspaceCollectionStore } from "../../clawjs-workspace/src/sqlite-store.ts";
import { createCodeGlobalIndex } from "./code/index.ts";
import { createContextStore } from "./context/store.ts";
import { createAppsStore } from "./apps/store.ts";
import { createLocalStorageStore } from "./storage/store.ts";
import { loadConfig as loadPublishingConfig } from "../../../publishing/src/server/config.ts";
import { loadContentConfig } from "../../../content/src/server/config.ts";
import { loadDelegationPlaneConfig } from "../../../delegation/src/server/config.ts";
import { loadErpConfig } from "../../../modules/erp/src/server/config.ts";
import { loadFeedConfig } from "../../../modules/feed/src/server/config.ts";
import { loadIotConfig } from "../../../iot/src/server/config.ts";
import { loadNotifyConfig } from "../../../notify/src/server/config.ts";
import { loadTimeConfig } from "../../../time/src/server/config.ts";

test("V2 data configs route canonical domains to main DB and sidecars under the ClawJS root", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-v2-config-"));
  withPatchedEnv({
    CLAW_DATA_DIR: root,
    CLAWIX_CLAW_DATA_DIR: undefined,
    CLAW_DB_PATH: undefined,
    USER_MODEL_DATA_DIR: undefined,
    USER_MODEL_DB_PATH: undefined,
    TRACKING_DATA_DIR: undefined,
    TRACKING_DB_PATH: undefined,
    SLEEP_DATA_DIR: undefined,
    SLEEP_DB_PATH: undefined,
    RUNTIME_DATA_DIR: undefined,
    RUNTIME_DB_PATH: undefined,
    SESSIONS_DATA_DIR: undefined,
    SESSIONS_DB_PATH: undefined,
    AUDIO_DATA_DIR: undefined,
    AUDIO_DB_PATH: undefined,
    INDEX_DATA_DIR: undefined,
    INDEX_DB_PATH: undefined,
    CONTENT_DATA_DIR: undefined,
    CONTENT_DB_PATH: undefined,
    ERP_DATA_DIR: undefined,
    ERP_DB_PATH: undefined,
    BADGER_DATA_DIR: undefined,
    BADGER_DB_PATH: undefined,
    NOTIFY_DATA_DIR: undefined,
    NOTIFY_DB_PATH: undefined,
    FEED_DATA_DIR: undefined,
    FEED_DB_PATH: undefined,
    DELEGATION_PLANE_DATA_DIR: undefined,
    DELEGATION_PLANE_DATABASE_FILE: undefined,
    CLAW_TIME_DATA_DIR: undefined,
    CLAW_TIME_DB_FILE: undefined,
    IOT_DATA_DIR: undefined,
    IOT_DB_PATH: undefined,
  }, () => {
    assert.equal(loadUserModelConfig().dataDir, root);
    assert.equal(loadUserModelConfig().dbPath, path.join(root, "core.sqlite"));

    const tracking = loadSignalsServiceConfig({ domain: "sleep", defaultPort: 4701 });
    assert.equal(tracking.dataDir, root);
    assert.equal(tracking.dbPath, path.join(root, "core.sqlite"));

    assert.equal(loadRuntimeConfig().dbPath, path.join(root, "runtime.sqlite"));
    assert.equal(loadSessionsConfig().dbPath, path.join(root, "sessions.sqlite"));
    assert.equal(loadAudioConfig().dbPath, path.join(root, "audio.sqlite"));
    assert.equal(loadIndexConfig().dbPath, path.join(root, "search.sqlite"));
    assert.equal(loadMCPConfig().dbPath, path.join(root, "core.sqlite"));
    assert.equal(loadChannelConfig("telegram").dbPath, path.join(root, "core.sqlite"));
    assert.equal(loadVoiceConfig().dbPath, path.join(root, "audio.sqlite"));
    assert.equal(loadVoiceConfig().outputDir, path.join(root, "audio"));
    assert.equal(loadSandboxConfig().dbPath, path.join(root, "runtime.sqlite"));
    assert.equal(loadContentConfig().dbPath, path.join(root, "core.sqlite"));
    assert.equal(loadErpConfig().dbPath, path.join(root, "core.sqlite"));
    assert.equal(loadPublishingConfig().dbPath, path.join(root, "core.sqlite"));
    assert.equal(loadTimeConfig().dbPath, path.join(root, "core.sqlite"));
    assert.equal(loadIotConfig().dbPath, path.join(root, "core.sqlite"));
    assert.equal(loadNotifyConfig().dbPath, path.join(root, "notify.sqlite"));
    assert.equal(loadFeedConfig().dbPath, path.join(root, "feed.sqlite"));
    assert.equal(loadDelegationPlaneConfig().databaseFile, path.join(root, "runtime.sqlite"));
  });
});

test("V2 workspace collections and context memory use the main DB", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-v2-main-stores-"));
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-v2-main-workspace-"));
  withPatchedEnv({
    CLAW_DATA_DIR: root,
    CLAWIX_CLAW_DATA_DIR: undefined,
    CLAW_DB_PATH: undefined,
  }, () => {
    const collectionStore = createSqliteWorkspaceCollectionStore(workspaceDir);
    assert.equal(collectionStore.dbPath(), path.join(root, "core.sqlite"));
    collectionStore.collection("tasks").put("task_1", { id: "task_1", title: "Ship main DB" });

    const sqlite = new Database(path.join(root, "core.sqlite"));
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_entities (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        label TEXT NOT NULL,
        description TEXT,
        properties_json TEXT NOT NULL DEFAULT '{}',
        sensitivity TEXT NOT NULL DEFAULT 'normal',
        source TEXT NOT NULL DEFAULT 'manual',
        provenance_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS knowledge_facts (
        id TEXT PRIMARY KEY,
        subject_id TEXT,
        predicate TEXT NOT NULL,
        object_kind TEXT NOT NULL DEFAULT 'literal',
        object_value_json TEXT NOT NULL,
        confidence REAL,
        scope_json TEXT NOT NULL DEFAULT '{}',
        sensitivity TEXT NOT NULL DEFAULT 'normal',
        source TEXT NOT NULL DEFAULT 'manual',
        provenance_json TEXT NOT NULL DEFAULT '{}',
        supersedes_id TEXT,
        valid_from TEXT,
        valid_to TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    const now = new Date().toISOString();
    sqlite.prepare(`
      INSERT INTO knowledge_entities (id, type, label, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run("entity_user", "person", "Local user", now, now);
    sqlite.prepare(`
      INSERT INTO knowledge_facts (id, subject_id, predicate, object_value_json, confidence, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run("fact_language", "entity_user", "prefers_language", JSON.stringify("Spanish"), 0.9, now, now);
    sqlite.close();

    const context = createContextStore({ workspaceDir }).prepare({
      query: "Spanish language preference",
      maxItems: 3,
      maxChars: 1000,
    }, {
      rules: [],
      learnings: [],
    });
    assert.equal(context.items.some((item) => item.source === "memory" && item.sourceId === "fact_language"), true);

    const storage = createLocalStorageStore({ workspaceDir, agentId: "agent_1" });
    storage.close();
    assert.equal(fs.existsSync(path.join(root, "drive.sqlite")), true);
    assert.equal(fs.existsSync(path.join(root, "blobs")), true);
    const codeIndex = createCodeGlobalIndex();
    assert.equal(codeIndex.databasePath, path.join(root, "runtime.sqlite"));
    assert.equal(fs.existsSync(path.join(root, "runtime.sqlite")), true);

    const apps = createAppsStore();
    const app = apps.create({ name: "V2 App", slug: "v2-app", indexHtml: "<!doctype html><title>V2</title>" });
    const appsSqlite = new Database(path.join(root, "core.sqlite"));
    const row = appsSqlite.prepare("SELECT slug, root_path, manifest_json FROM apps WHERE id = ?").get(app.id) as { slug: string; root_path: string; manifest_json: string };
    assert.equal(row.slug, "v2-app");
    assert.equal(row.root_path, path.join(root, "apps", "v2-app"));
    assert.equal(JSON.parse(row.manifest_json).name, "V2 App");
    appsSqlite.close();
    assert.equal(fs.existsSync(path.join(root, "apps", "v2-app", "index.html")), true);

    assert.equal(fs.existsSync(path.join(workspaceDir, ".claw", "data", "database.sqlite")), false);
    assert.equal(fs.existsSync(path.join(workspaceDir, ".claw", "data", "productivity.sqlite")), false);
    assert.equal(fs.existsSync(path.join(workspaceDir, ".claw", "data", "storage.sqlite")), false);
    assert.equal(fs.existsSync(path.join(workspaceDir, ".claw", "code", "code.sqlite")), false);
  });
});

function withPatchedEnv(patch: Record<string, string | undefined>, fn: () => void): void {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(patch)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
