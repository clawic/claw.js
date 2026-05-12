import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";

import type Database from "better-sqlite3";
import { DatabaseServiceStore } from "@clawjs/database";
import type { FieldDefinition, IndexDefinition } from "@clawjs/database";
import { redactSecrets } from "@clawjs/claw";

export const V1_DATA_EXIT_OK = 0;
export const V1_DATA_EXIT_FAILURE = 1;
export const V1_DATA_EXIT_USAGE = 64;

type Writable = NodeJS.WritableStream;

export interface V1DataCliInput {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  stdout: Writable;
  stderr: Writable;
  wantsJson: boolean;
  binName: string;
  cwd: string;
}

type JsonRecord = Record<string, unknown>;

const PROFILE_ID = "local";
const APP_STATE_DOMAIN_TABLES = [
  "app_state",
  "app_projects",
  "app_pinned_threads",
  "app_session_titles",
  "app_archives",
  "app_sidebar_snapshots",
  "app_terminal_tabs",
];
const LIFE_DOMAIN_TABLES = ["life_verticals", "life_variables", "life_sessions", "life_observations"];
const RESOURCE_DOMAIN_TABLES = ["resources", "apps", "design_resources"];
const AGENT_DOMAIN_TABLES = ["agents", "skills", "skill_collections", "connections"];
const SESSION_DOMAIN_TABLES = ["session_index"];

const LIFE_CATALOG_COLLECTION_FIELDS: FieldDefinition[] = [
  { name: "verticalId", type: "text", required: true },
  { name: "label", type: "text", required: true },
  { name: "category", type: "text" },
  { name: "description", type: "text" },
  { name: "catalogJson", type: "json" },
  { name: "sensitive", type: "boolean" },
  { name: "metadata", type: "json" },
];

const LIFE_CATALOG_COLLECTION_INDEXES: IndexDefinition[] = [
  { name: "life_catalog_vertical_idx", fields: ["verticalId"] },
  { name: "life_catalog_category_idx", fields: ["category"] },
];

export function resolveClawjsDataRoot(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.CLAWJS_MAIN_DATA_DIR || env.CLAWIX_CLAWJS_DATA_DIR;
  if (explicit) return path.resolve(expandHome(explicit));
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Clawix", "clawjs");
  }
  return path.join(os.homedir(), ".clawjs");
}

export function resolveClawjsMainDbPath(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.CLAWJS_MAIN_DB_PATH || env.CLAWJS_DB_PATH;
  if (explicit) return path.resolve(expandHome(explicit));
  return path.join(resolveClawjsDataRoot(env), "clawjs.sqlite");
}

export function resolveClawjsFilesDir(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.CLAWJS_MAIN_FILES_DIR;
  if (explicit) return path.resolve(expandHome(explicit));
  return path.join(resolveClawjsDataRoot(env), "files");
}

export function openMainDataStore(env: NodeJS.ProcessEnv = process.env): DatabaseServiceStore {
  const store = new DatabaseServiceStore(resolveClawjsMainDbPath(env), resolveClawjsFilesDir(env));
  ensureV1MainSchema(store.sqlite);
  ensureV1Collections(store);
  return store;
}

export function ensureV1MainSchema(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS data_registry (
      domain TEXT NOT NULL,
      kind TEXT NOT NULL,
      id TEXT NOT NULL,
      owner TEXT NOT NULL DEFAULT 'clawjs-core',
      storage TEXT NOT NULL DEFAULT 'main-db',
      path TEXT,
      sensitive INTEGER NOT NULL DEFAULT 0,
      secret_ref TEXT,
      cache INTEGER NOT NULL DEFAULT 0,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (domain, kind, id)
    );

    CREATE TABLE IF NOT EXISTS app_state (
      profile_id TEXT NOT NULL DEFAULT 'local',
      key TEXT NOT NULL,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (profile_id, key)
    );
    CREATE TABLE IF NOT EXISTS app_projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL DEFAULT '',
      sort_order INTEGER,
      hidden INTEGER NOT NULL DEFAULT 0,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS app_projects_path_idx ON app_projects(path);
    CREATE TABLE IF NOT EXISTS app_pinned_threads (
      thread_id TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL,
      pinned_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_session_titles (
      thread_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_archives (
      thread_id TEXT PRIMARY KEY,
      archived_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_sidebar_snapshots (
      thread_id TEXT PRIMARY KEY,
      chat_uuid TEXT,
      title TEXT NOT NULL,
      cwd TEXT,
      project_path TEXT,
      updated_at TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0,
      captured_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS app_sidebar_snapshots_order_idx
      ON app_sidebar_snapshots(pinned DESC, updated_at DESC);
    CREATE TABLE IF NOT EXISTS app_terminal_tabs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      cwd TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS life_verticals (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      category TEXT,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'alpha',
      sensitive INTEGER NOT NULL DEFAULT 0,
      catalog_version TEXT,
      catalog_source TEXT NOT NULL DEFAULT 'repo',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      synced_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS life_variables (
      id TEXT PRIMARY KEY,
      vertical_id TEXT NOT NULL,
      label TEXT NOT NULL,
      value_type TEXT NOT NULL,
      unit_json TEXT,
      category TEXT,
      sensitive INTEGER NOT NULL DEFAULT 0,
      definition_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (vertical_id) REFERENCES life_verticals(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS life_variables_vertical_idx ON life_variables(vertical_id);
    CREATE TABLE IF NOT EXISTS life_sessions (
      id TEXT PRIMARY KEY,
      vertical_id TEXT NOT NULL,
      started_at TEXT,
      ended_at TEXT,
      title TEXT,
      source TEXT,
      external_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (vertical_id) REFERENCES life_verticals(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS life_observations (
      id TEXT PRIMARY KEY,
      vertical_id TEXT NOT NULL,
      variable_id TEXT NOT NULL,
      value_json TEXT NOT NULL,
      unit_id TEXT,
      recorded_at TEXT NOT NULL,
      source_json TEXT NOT NULL DEFAULT '{}',
      notes TEXT,
      session_id TEXT,
      external_id TEXT,
      sensitive INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (vertical_id) REFERENCES life_verticals(id) ON DELETE CASCADE,
      FOREIGN KEY (variable_id) REFERENCES life_variables(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS life_observations_variable_time_idx
      ON life_observations(variable_id, recorded_at DESC);
    CREATE INDEX IF NOT EXISTS life_observations_vertical_time_idx
      ON life_observations(vertical_id, recorded_at DESC);

    CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY,
      domain TEXT NOT NULL,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      path TEXT,
      content_type TEXT,
      size_bytes INTEGER,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS resources_domain_kind_idx ON resources(domain, kind);

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'agent',
      name TEXT NOT NULL,
      runtime TEXT,
      model TEXT,
      builtin INTEGER NOT NULL DEFAULT 0,
      config_json TEXT NOT NULL DEFAULT '{}',
      export_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      scope_json TEXT NOT NULL DEFAULT '{}',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      export_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS skill_collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      skills_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      export_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      label TEXT NOT NULL,
      secret_ref TEXT,
      config_json TEXT NOT NULL DEFAULT '{}',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS apps (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      root_path TEXT NOT NULL,
      manifest_json TEXT NOT NULL DEFAULT '{}',
      permissions_json TEXT NOT NULL DEFAULT '{}',
      pinned INTEGER NOT NULL DEFAULT 0,
      last_opened_at TEXT,
      created_by_chat_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS design_resources (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      root_path TEXT,
      manifest_json TEXT NOT NULL DEFAULT '{}',
      builtin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS design_resources_kind_idx ON design_resources(kind);

    CREATE TABLE IF NOT EXISTS session_index (
      session_id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      artifact_path TEXT NOT NULL,
      mtime_ms INTEGER NOT NULL,
      size_bytes INTEGER NOT NULL,
      title TEXT NOT NULL,
      cwd TEXT,
      created_at TEXT,
      updated_at TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0,
      snippet TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      indexed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS session_index_source_updated_idx
      ON session_index(source, updated_at DESC);
    CREATE VIRTUAL TABLE IF NOT EXISTS session_index_fts USING fts5(
      session_id UNINDEXED,
      title,
      snippet,
      cwd
    );
  `);
  sqlite.prepare(`
    INSERT OR IGNORE INTO app_state (profile_id, key, value_json, updated_at)
    VALUES (?, 'profile.id', ?, ?)
  `).run(PROFILE_ID, JSON.stringify(PROFILE_ID), nowIso());
}

export async function runV1DataCli(input: V1DataCliInput): Promise<number | null> {
  const group = input.positionals[0];
  const command = input.positionals[1];
  if (!shouldHandleV1DataCommand(group, command, input.argv.includes("--help") || input.argv.includes("-h"))) {
    return null;
  }
  const wantsHelp = input.argv.includes("--help") || input.argv.includes("-h");
  if (wantsHelp || !command || command === "help") {
    input.stdout.write(`${usage(input.binName, group)}\n`);
    return V1_DATA_EXIT_OK;
  }
  if (group === "data" && command === "restore") {
    const from = input.flags.from || input.flags.input;
    if (!from) return usageError(input, "Usage: claw data restore --from DIR [--json]");
    try {
      const restored = restoreData(path.resolve(input.cwd, expandHome(from)));
      writeSuccess(input, restored);
      return V1_DATA_EXIT_OK;
    } catch (error) {
      writeError(input, "data_error", error instanceof Error ? error.message : String(error));
      return V1_DATA_EXIT_FAILURE;
    }
  }

  let store: DatabaseServiceStore | null = null;
  try {
    store = openMainDataStore();
    switch (group) {
      case "data":
        return runDataCommand(input, store);
      case "app-state":
        return runAppStateCommand(input, store);
      case "life":
        return runLifeCommand(input, store);
      case "apps":
        return runAppsCommand(input, store);
      case "design":
        return runDesignCommand(input, store);
      case "agents":
        return runAgentsCommand(input, store);
      case "skills":
        return runSkillsCommand(input, store);
      case "connections":
        return runConnectionsCommand(input, store);
      case "sessions":
        return runSessionsIndexCommand(input, store);
      default:
        return null;
    }
  } catch (error) {
    writeError(input, "data_error", error instanceof Error ? error.message : String(error));
    return V1_DATA_EXIT_FAILURE;
  } finally {
    store?.close();
  }
}

function shouldHandleV1DataCommand(group: string | undefined, command: string | undefined, wantsHelp: boolean): group is string {
  const commandsByGroup: Record<string, Set<string>> = {
    data: new Set(["doctor", "backup", "restore", "reset", "help"]),
    "app-state": new Set(["get", "set", "snapshot", "help"]),
    life: new Set(["catalog", "seed-catalog", "observe", "list", "delete", "help"]),
    apps: new Set(["list", "upsert", "help"]),
    design: new Set(["list", "upsert", "help"]),
    agents: new Set(["list", "upsert", "help"]),
    skills: new Set(["upsert", "help"]),
    connections: new Set(["list", "upsert", "help"]),
    sessions: new Set(["index", "get", "help"]),
  };
  if (!group || !(group in commandsByGroup)) return false;
  if (wantsHelp || !command) return true;
  return commandsByGroup[group].has(command);
}

function runDataCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "doctor") {
    const payload = doctorPayload(store.sqlite);
    writeSuccess(input, payload);
    return V1_DATA_EXIT_OK;
  }
  if (command === "backup") {
    const out = input.flags.out || input.flags.to;
    if (!out) return usageError(input, "Usage: claw data backup --out DIR [--json]");
    const backup = backupData(path.resolve(input.cwd, expandHome(out)));
    writeSuccess(input, backup);
    return V1_DATA_EXIT_OK;
  }
  if (command === "reset") {
    const domain = input.flags.domain || input.positionals[2];
    if (!domain) return usageError(input, "Usage: claw data reset --domain app-state|life|resources|agents|sessions-index|all");
    const result = resetDomain(store.sqlite, domain);
    writeSuccess(input, result);
    return V1_DATA_EXIT_OK;
  }
  return usageError(input, usage(input.binName, "data"));
}

function runAppStateCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "get") {
    const key = input.flags.key || input.positionals[2];
    if (!key) {
      const rows = store.sqlite.prepare("SELECT key, value_json, updated_at FROM app_state WHERE profile_id = ? ORDER BY key").all(PROFILE_ID) as Array<{ key: string; value_json: string; updated_at: string }>;
      writeSuccess(input, { items: rows.map((row) => ({ key: row.key, value: parseJson(row.value_json, null), updatedAt: row.updated_at })) });
      return V1_DATA_EXIT_OK;
    }
    const row = store.sqlite.prepare("SELECT value_json, updated_at FROM app_state WHERE profile_id = ? AND key = ?").get(PROFILE_ID, key) as { value_json: string; updated_at: string } | undefined;
    writeSuccess(input, row ? { key, value: parseJson(row.value_json, null), updatedAt: row.updated_at } : null);
    return row ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  if (command === "set") {
    const key = input.flags.key || input.positionals[2];
    if (!key) return usageError(input, "Usage: claw app-state set KEY --value JSON|TEXT");
    const value = input.flags.json ? JSON.parse(input.flags.json) : parseMaybeJson(input.flags.value ?? input.positionals.slice(3).join(" "));
    const now = nowIso();
    store.sqlite.prepare(`
      INSERT INTO app_state (profile_id, key, value_json, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(profile_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
    `).run(PROFILE_ID, key, JSON.stringify(value), now);
    writeSuccess(input, { key, value, updatedAt: now });
    return V1_DATA_EXIT_OK;
  }
  if (command === "snapshot") {
    const payload = {
      projects: store.sqlite.prepare("SELECT * FROM app_projects ORDER BY COALESCE(sort_order, 999999), name").all(),
      pinnedThreads: store.sqlite.prepare("SELECT * FROM app_pinned_threads ORDER BY sort_order").all(),
      titles: store.sqlite.prepare("SELECT * FROM app_session_titles ORDER BY updated_at DESC").all(),
      archives: store.sqlite.prepare("SELECT * FROM app_archives ORDER BY archived_at DESC").all(),
      sidebar: store.sqlite.prepare("SELECT * FROM app_sidebar_snapshots ORDER BY pinned DESC, updated_at DESC LIMIT ?").all(Number(input.flags.limit ?? 200)),
      terminalTabs: store.sqlite.prepare("SELECT * FROM app_terminal_tabs ORDER BY sort_order, updated_at DESC").all(),
    };
    writeSuccess(input, payload);
    return V1_DATA_EXIT_OK;
  }
  return usageError(input, usage(input.binName, "app-state"));
}

function runLifeCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "catalog") {
    const verticalId = input.flags.vertical || input.flags["vertical-id"] || input.positionals[2];
    const rows = verticalId
      ? store.sqlite.prepare("SELECT * FROM life_variables WHERE vertical_id = ? ORDER BY id").all(verticalId)
      : store.sqlite.prepare("SELECT * FROM life_verticals ORDER BY category, label").all();
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  if (command === "seed-catalog") {
    const file = input.flags.file;
    const verticalId = input.flags.vertical || input.flags["vertical-id"];
    if (!file || !verticalId) return usageError(input, "Usage: claw life seed-catalog --vertical ID --file catalog.json");
    const raw = fs.readFileSync(path.resolve(input.cwd, expandHome(file)), "utf8");
    const catalog = JSON.parse(raw) as { vertical?: JsonRecord; variables?: JsonRecord[] } | JsonRecord[];
    const variables = Array.isArray(catalog) ? catalog : Array.isArray(catalog.variables) ? catalog.variables : [];
    const vertical = !Array.isArray(catalog) && catalog.vertical ? catalog.vertical : {};
    const now = nowIso();
    store.sqlite.prepare(`
      INSERT INTO life_verticals (id, label, category, description, status, sensitive, catalog_version, metadata_json, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET label = excluded.label, category = excluded.category, description = excluded.description,
        status = excluded.status, sensitive = excluded.sensitive, catalog_version = excluded.catalog_version,
        metadata_json = excluded.metadata_json, synced_at = excluded.synced_at
    `).run(
      verticalId,
      stringValue(vertical.label, verticalId),
      stringValue(vertical.category, null),
      stringValue(vertical.description, null),
      stringValue(vertical.status, "alpha"),
      truthy(vertical.sensitive) ? 1 : 0,
      stringValue(vertical.version, null),
      JSON.stringify(vertical),
      now,
    );
    const insert = store.sqlite.prepare(`
      INSERT INTO life_variables (id, vertical_id, label, value_type, unit_json, category, sensitive, definition_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET label = excluded.label, value_type = excluded.value_type,
        unit_json = excluded.unit_json, category = excluded.category, sensitive = excluded.sensitive,
        definition_json = excluded.definition_json, updated_at = excluded.updated_at
    `);
    const tx = store.sqlite.transaction(() => {
      for (const entry of variables) {
        const id = stringValue(entry.id, "");
        if (!id) continue;
        insert.run(
          id,
          verticalId,
          stringValue(entry.label, id),
          stringValue(entry.valueType ?? entry.value_type, "text"),
          entry.unit ? JSON.stringify(entry.unit) : null,
          stringValue(entry.category, null),
          truthy(entry.sensitive) ? 1 : 0,
          JSON.stringify(entry),
          now,
        );
      }
    });
    tx();
    upsertRegistry(store.sqlite, "life", "catalog", verticalId, { sensitive: truthy(vertical.sensitive), metadata: { count: variables.length } });
    writeSuccess(input, { verticalId, variables: variables.length, syncedAt: now });
    return V1_DATA_EXIT_OK;
  }
  if (command === "observe") {
    const variableId = input.flags.variable || input.flags["variable-id"];
    if (!variableId) return usageError(input, "Usage: claw life observe --variable ID --value JSON|TEXT [--vertical ID]");
    const variable = store.sqlite.prepare("SELECT vertical_id, sensitive FROM life_variables WHERE id = ?").get(variableId) as { vertical_id: string; sensitive: number } | undefined;
    const verticalId = input.flags.vertical || input.flags["vertical-id"] || variable?.vertical_id;
    if (!verticalId) return usageError(input, "--vertical is required when the variable is not seeded");
    ensureLifeVertical(store.sqlite, verticalId);
    if (!variable) ensureLifeVariable(store.sqlite, verticalId, variableId);
    const now = nowIso();
    const id = input.flags.id || `obs-${randomUUID()}`;
    const value = input.flags.json ? JSON.parse(input.flags.json) : parseMaybeJson(input.flags.value ?? input.positionals.slice(2).join(" "));
    store.sqlite.prepare(`
      INSERT INTO life_observations (id, vertical_id, variable_id, value_json, unit_id, recorded_at, source_json, notes, session_id, external_id, sensitive, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET value_json = excluded.value_json, unit_id = excluded.unit_id,
        recorded_at = excluded.recorded_at, source_json = excluded.source_json, notes = excluded.notes,
        session_id = excluded.session_id, external_id = excluded.external_id, sensitive = excluded.sensitive,
        updated_at = excluded.updated_at
    `).run(
      id,
      verticalId,
      variableId,
      JSON.stringify(value),
      input.flags.unit || input.flags["unit-id"] || null,
      input.flags.at || input.flags["recorded-at"] || now,
      input.flags.source ? JSON.stringify(parseMaybeJson(input.flags.source)) : "{}",
      input.flags.notes || null,
      input.flags["session-id"] || null,
      input.flags["external-id"] || null,
      variable?.sensitive ?? 0,
      now,
      now,
    );
    writeSuccess(input, { id, verticalId, variableId, value, recordedAt: input.flags.at || input.flags["recorded-at"] || now });
    return V1_DATA_EXIT_OK;
  }
  if (command === "list") {
    const verticalId = input.flags.vertical || input.flags["vertical-id"];
    const variableId = input.flags.variable || input.flags["variable-id"];
    const limit = Math.max(1, Number(input.flags.limit ?? 200));
    const rows = variableId
      ? store.sqlite.prepare("SELECT * FROM life_observations WHERE variable_id = ? ORDER BY recorded_at DESC LIMIT ?").all(variableId, limit)
      : verticalId
        ? store.sqlite.prepare("SELECT * FROM life_observations WHERE vertical_id = ? ORDER BY recorded_at DESC LIMIT ?").all(verticalId, limit)
        : store.sqlite.prepare("SELECT * FROM life_observations ORDER BY recorded_at DESC LIMIT ?").all(limit);
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  if (command === "delete") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, "Usage: claw life delete OBSERVATION_ID");
    const changes = store.sqlite.prepare("DELETE FROM life_observations WHERE id = ?").run(id).changes;
    writeSuccess(input, { deleted: changes > 0, id });
    return changes > 0 ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  return usageError(input, usage(input.binName, "life"));
}

function runAppsCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "list") {
    const rows = store.sqlite.prepare("SELECT * FROM apps ORDER BY pinned DESC, COALESCE(last_opened_at, updated_at) DESC").all();
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  if (command === "upsert") {
    const slug = input.flags.slug || input.positionals[2];
    const name = input.flags.name || slug;
    const rootPath = input.flags.path || input.flags.root || (slug ? path.join(resolveClawjsDataRoot(), "apps", slug) : "");
    if (!slug || !name || !rootPath) return usageError(input, "Usage: claw apps upsert SLUG --name NAME --path PATH");
    const now = nowIso();
    const manifest = input.flags.manifest ? JSON.parse(input.flags.manifest) : {};
    store.sqlite.prepare(`
      INSERT INTO apps (id, slug, name, description, root_path, manifest_json, permissions_json, pinned, last_opened_at, created_by_chat_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET name = excluded.name, description = excluded.description, root_path = excluded.root_path,
        manifest_json = excluded.manifest_json, permissions_json = excluded.permissions_json, pinned = excluded.pinned,
        last_opened_at = excluded.last_opened_at, created_by_chat_id = excluded.created_by_chat_id, updated_at = excluded.updated_at
    `).run(
      input.flags.id || `app-${slug}`,
      slug,
      name,
      input.flags.description || null,
      path.resolve(input.cwd, expandHome(rootPath)),
      JSON.stringify(manifest),
      input.flags.permissions ? JSON.stringify(JSON.parse(input.flags.permissions)) : "{}",
      truthy(input.flags.pinned) ? 1 : 0,
      input.flags["last-opened-at"] || null,
      input.flags["created-by-chat-id"] || null,
      now,
      now,
    );
    writeSuccess(input, { slug, name, rootPath: path.resolve(input.cwd, expandHome(rootPath)), updatedAt: now });
    return V1_DATA_EXIT_OK;
  }
  return usageError(input, usage(input.binName, "apps"));
}

function runDesignCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "list") {
    const kind = input.flags.kind;
    const rows = kind
      ? store.sqlite.prepare("SELECT * FROM design_resources WHERE kind = ? ORDER BY updated_at DESC").all(kind)
      : store.sqlite.prepare("SELECT * FROM design_resources ORDER BY kind, updated_at DESC").all();
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  if (command === "upsert") {
    const kind = input.flags.kind || input.positionals[2];
    const id = input.flags.id || input.positionals[3] || (kind ? `${kind}-${randomUUID().slice(0, 8)}` : "");
    const name = input.flags.name || id;
    if (!kind || !id || !name) return usageError(input, "Usage: claw design upsert KIND ID --name NAME [--path PATH]");
    const now = nowIso();
    store.sqlite.prepare(`
      INSERT INTO design_resources (id, kind, name, root_path, manifest_json, builtin, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, name = excluded.name, root_path = excluded.root_path,
        manifest_json = excluded.manifest_json, builtin = excluded.builtin, updated_at = excluded.updated_at
    `).run(id, kind, name, input.flags.path ? path.resolve(input.cwd, expandHome(input.flags.path)) : null, input.flags.manifest ? JSON.stringify(JSON.parse(input.flags.manifest)) : "{}", truthy(input.flags.builtin) ? 1 : 0, now, now);
    writeSuccess(input, { id, kind, name, updatedAt: now });
    return V1_DATA_EXIT_OK;
  }
  return usageError(input, usage(input.binName, "design"));
}

function runAgentsCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "list") {
    const rows = store.sqlite.prepare("SELECT * FROM agents ORDER BY builtin DESC, name").all();
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  if (command === "upsert") {
    const id = input.flags.id || input.positionals[2];
    const name = input.flags.name || input.positionals.slice(3).join(" ") || id;
    if (!id || !name) return usageError(input, "Usage: claw agents upsert ID --name NAME");
    const now = nowIso();
    store.sqlite.prepare(`
      INSERT INTO agents (id, kind, name, runtime, model, builtin, config_json, export_path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, name = excluded.name, runtime = excluded.runtime,
        model = excluded.model, builtin = excluded.builtin, config_json = excluded.config_json,
        export_path = excluded.export_path, updated_at = excluded.updated_at
    `).run(id, input.flags.kind || "agent", name, input.flags.runtime || null, input.flags.model || null, truthy(input.flags.builtin) ? 1 : 0, input.flags.config ? JSON.stringify(JSON.parse(input.flags.config)) : "{}", input.flags["export-path"] || null, now, now);
    writeSuccess(input, { id, name, updatedAt: now });
    return V1_DATA_EXIT_OK;
  }
  return usageError(input, usage(input.binName, "agents"));
}

function runSkillsCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "list") {
    const rows = store.sqlite.prepare("SELECT * FROM skills ORDER BY kind, name").all();
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  if (command === "upsert") {
    const slug = input.flags.slug || input.positionals[2];
    const name = input.flags.name || slug;
    if (!slug || !name) return usageError(input, "Usage: claw skills upsert SLUG --name NAME [--body TEXT|--file SKILL.md]");
    const now = nowIso();
    const body = input.flags.file ? fs.readFileSync(path.resolve(input.cwd, expandHome(input.flags.file)), "utf8") : (input.flags.body || "");
    store.sqlite.prepare(`
      INSERT INTO skills (id, slug, kind, name, body, scope_json, metadata_json, export_path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET kind = excluded.kind, name = excluded.name, body = excluded.body,
        scope_json = excluded.scope_json, metadata_json = excluded.metadata_json,
        export_path = excluded.export_path, updated_at = excluded.updated_at
    `).run(input.flags.id || `skill-${slug}`, slug, input.flags.kind || "skill", name, body, input.flags.scope ? JSON.stringify(JSON.parse(input.flags.scope)) : "{}", input.flags.metadata ? JSON.stringify(JSON.parse(input.flags.metadata)) : "{}", input.flags["export-path"] || null, now, now);
    writeSuccess(input, { slug, name, updatedAt: now });
    return V1_DATA_EXIT_OK;
  }
  return usageError(input, usage(input.binName, "skills"));
}

function runConnectionsCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "list") {
    const rows = store.sqlite.prepare("SELECT * FROM connections ORDER BY provider, label").all();
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  if (command === "upsert") {
    const id = input.flags.id || input.positionals[2];
    const provider = input.flags.provider || input.positionals[3];
    const label = input.flags.label || id;
    if (!id || !provider || !label) return usageError(input, "Usage: claw connections upsert ID --provider PROVIDER --label LABEL --secret-ref REF");
    const now = nowIso();
    store.sqlite.prepare(`
      INSERT INTO connections (id, provider, label, secret_ref, config_json, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET provider = excluded.provider, label = excluded.label,
        secret_ref = excluded.secret_ref, config_json = excluded.config_json,
        metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
    `).run(id, provider, label, input.flags["secret-ref"] || null, input.flags.config ? JSON.stringify(JSON.parse(input.flags.config)) : "{}", input.flags.metadata ? JSON.stringify(JSON.parse(input.flags.metadata)) : "{}", now, now);
    writeSuccess(input, { id, provider, label, secretRef: input.flags["secret-ref"] || null, updatedAt: now });
    return V1_DATA_EXIT_OK;
  }
  return usageError(input, usage(input.binName, "connections"));
}

function runSessionsIndexCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "index") {
    const roots = sessionRoots(input);
    const indexed = indexSessionRoots(store.sqlite, roots, input.flags.source || "codex");
    writeSuccess(input, { indexed, roots });
    return V1_DATA_EXIT_OK;
  }
  if (command === "get") {
    const id = input.flags.id || input.flags["session-id"] || input.positionals[2];
    if (!id) return usageError(input, "Usage: claw sessions get SESSION_ID [--json]");
    const row = store.sqlite.prepare("SELECT * FROM session_index WHERE session_id = ?").get(id) as JsonRecord | undefined;
    writeSuccess(input, row ? normalizeDbRow(row) : null);
    return row ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  return usageError(input, usage(input.binName, "sessions"));
}

function ensureV1Collections(store: DatabaseServiceStore): void {
  store.ensureNamespace({ id: "main", displayName: "Main" });
  store.ensureCollection("main", {
    name: "life_catalog",
    displayName: "Life Catalog",
    fields: LIFE_CATALOG_COLLECTION_FIELDS,
    indexes: LIFE_CATALOG_COLLECTION_INDEXES,
    coreFieldNames: ["verticalId", "label"],
  });
}

function doctorPayload(sqlite: Database.Database): JsonRecord {
  const dbPath = resolveClawjsMainDbPath();
  const tables = sqlite.prepare(`
    SELECT name FROM sqlite_master
    WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all() as Array<{ name: string }>;
  const counts: Record<string, number> = {};
  for (const { name } of tables) {
    if (name.endsWith("_fts") || name.includes("_fts_")) continue;
    try {
      counts[name] = Number((sqlite.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdent(name)}`).get() as { count: number }).count);
    } catch {
      // Ignore virtual/internal tables.
    }
  }
  return {
    ok: true,
    version: 1,
    dbPath,
    filesDir: resolveClawjsFilesDir(),
    policy: {
      writer: "clawjs-core",
      clients: "cli-json",
      secrets: "external-vault",
      sessionBodies: "external-artifacts-indexed",
      blobs: "filesystem-referenced",
    },
    tables: tables.map((row) => row.name),
    counts,
  };
}

function backupData(outDir: string): JsonRecord {
  fs.mkdirSync(outDir, { recursive: true });
  const dbPath = resolveClawjsMainDbPath();
  const copied: string[] = [];
  for (const suffix of ["", "-wal", "-shm"]) {
    const src = `${dbPath}${suffix}`;
    if (!fs.existsSync(src)) continue;
    const dest = path.join(outDir, `clawjs.sqlite${suffix}`);
    fs.copyFileSync(src, dest);
    copied.push(dest);
  }
  const manifest = {
    version: 1,
    createdAt: nowIso(),
    dbPath,
    filesDir: resolveClawjsFilesDir(),
    copied,
    includes: ["main-db"],
    excludes: ["vault", "raw-session-artifacts", "blob-files"],
  };
  const manifestPath = path.join(outDir, "backup-manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return { outDir, manifestPath, copied };
}

function restoreData(fromDir: string): JsonRecord {
  const src = path.join(fromDir, "clawjs.sqlite");
  if (!fs.existsSync(src)) throw new Error(`Missing backup DB at ${src}`);
  const dest = resolveClawjsMainDbPath();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) {
    const srcFile = `${src}${suffix}`;
    const destFile = `${dest}${suffix}`;
    if (fs.existsSync(srcFile)) fs.copyFileSync(srcFile, destFile);
    else if (suffix && fs.existsSync(destFile)) fs.rmSync(destFile, { force: true });
  }
  return { restored: true, fromDir, dbPath: dest };
}

function resetDomain(sqlite: Database.Database, domain: string): JsonRecord {
  const normalized = domain.trim().toLowerCase();
  const tables =
    normalized === "all" ? [...APP_STATE_DOMAIN_TABLES, ...LIFE_DOMAIN_TABLES, ...RESOURCE_DOMAIN_TABLES, ...AGENT_DOMAIN_TABLES, ...SESSION_DOMAIN_TABLES] :
    normalized === "app-state" ? APP_STATE_DOMAIN_TABLES :
    normalized === "life" ? LIFE_DOMAIN_TABLES :
    normalized === "resources" || normalized === "apps" || normalized === "design" ? RESOURCE_DOMAIN_TABLES :
    normalized === "agents" || normalized === "skills" || normalized === "connections" ? AGENT_DOMAIN_TABLES :
    normalized === "sessions-index" || normalized === "sessions" ? SESSION_DOMAIN_TABLES :
    [];
  if (tables.length === 0) throw new Error(`Unknown reset domain: ${domain}`);
  const deleted: Record<string, number> = {};
  const tx = sqlite.transaction(() => {
    if (tables.includes("session_index")) sqlite.prepare("DELETE FROM session_index_fts").run();
    for (const table of tables) {
      deleted[table] = sqlite.prepare(`DELETE FROM ${quoteIdent(table)}`).run().changes;
    }
  });
  tx();
  return { domain: normalized, deleted };
}

function sessionRoots(input: V1DataCliInput): string[] {
  const roots = [
    ...(input.flags.root ? [input.flags.root] : []),
    ...(input.flags.roots ? input.flags.roots.split(",") : []),
  ].map((entry) => path.resolve(input.cwd, expandHome(entry.trim()))).filter(Boolean);
  if (roots.length > 0) return roots;
  return [
    path.join(os.homedir(), ".codex", "sessions"),
    path.join(os.homedir(), ".codex", "archived_sessions"),
  ];
}

function indexSessionRoots(sqlite: Database.Database, roots: string[], source: string): number {
  const files = roots.flatMap((root) => findSessionArtifacts(root));
  const now = nowIso();
  const upsert = sqlite.prepare(`
    INSERT INTO session_index (session_id, source, artifact_path, mtime_ms, size_bytes, title, cwd, created_at, updated_at, archived, pinned, snippet, metadata_json, indexed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET source = excluded.source, artifact_path = excluded.artifact_path,
      mtime_ms = excluded.mtime_ms, size_bytes = excluded.size_bytes, title = excluded.title, cwd = excluded.cwd,
      created_at = excluded.created_at, updated_at = excluded.updated_at, archived = excluded.archived,
      snippet = excluded.snippet, metadata_json = excluded.metadata_json, indexed_at = excluded.indexed_at
  `);
  const replaceFts = sqlite.prepare("INSERT INTO session_index_fts (session_id, title, snippet, cwd) VALUES (?, ?, ?, ?)");
  const deleteFts = sqlite.prepare("DELETE FROM session_index_fts WHERE session_id = ?");
  const tx = sqlite.transaction(() => {
    for (const file of files) {
      const stat = fs.statSync(file);
      const summary = summarizeSessionArtifact(file, stat);
      upsert.run(
        summary.sessionId,
        source,
        file,
        Math.trunc(stat.mtimeMs),
        stat.size,
        summary.title,
        summary.cwd,
        summary.createdAt,
        summary.updatedAt,
        file.includes(`${path.sep}archived_sessions${path.sep}`) ? 1 : 0,
        0,
        summary.snippet,
        JSON.stringify(summary.metadata),
        now,
      );
      deleteFts.run(summary.sessionId);
      replaceFts.run(summary.sessionId, summary.title, summary.snippet, summary.cwd ?? "");
    }
  });
  tx();
  return files.length;
}

function findSessionArtifacts(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (
        (entry.name.startsWith("rollout-") && entry.name.endsWith(".jsonl")) ||
        entry.name.endsWith(".jsonl")
      ) {
        out.push(full);
      }
    }
  }
  return out;
}

function summarizeSessionArtifact(file: string, stat: fs.Stats): {
  sessionId: string;
  title: string;
  cwd: string | null;
  createdAt: string;
  updatedAt: string;
  snippet: string;
  metadata: JsonRecord;
} {
  const fd = fs.openSync(file, "r");
  try {
    const probe = Buffer.alloc(Math.min(256 * 1024, stat.size));
    fs.readSync(fd, probe, 0, probe.length, 0);
    const lines = probe.toString("utf8").split("\n").filter(Boolean);
    let sessionId = path.basename(file).replace(/^rollout-/, "").replace(/\.jsonl$/, "");
    let cwd: string | null = null;
    let firstUser = "";
    let createdAt = new Date(stat.birthtimeMs || stat.mtimeMs).toISOString();
    for (const line of lines) {
      const obj = parseJson<JsonRecord>(line, {});
      const type = obj.type;
      const payload = isRecord(obj.payload) ? obj.payload : {};
      if (type === "session_meta") {
        sessionId = stringValue(payload.id, sessionId) ?? sessionId;
        cwd = stringValue(payload.cwd, cwd);
        createdAt = stringValue(payload.timestamp ?? payload.created_at, createdAt) ?? createdAt;
      } else if (type === "session") {
        sessionId = stringValue(obj.id, sessionId) ?? sessionId;
        createdAt = stringValue(obj.timestamp, createdAt) ?? createdAt;
        firstUser ||= stringValue(obj.title, "") ?? "";
      } else if (type === "event_msg" && payload.type === "user_message") {
        firstUser ||= stringValue(payload.message, "") ?? "";
      } else if (type === "message" && isRecord(obj.message)) {
        const message = obj.message as JsonRecord;
        if (message.role === "user") {
          firstUser ||= extractTextContent(message.content);
        }
      }
      if (cwd && firstUser) break;
    }
    const title = truncate(firstUser || path.basename(file), 80);
    return {
      sessionId,
      title,
      cwd,
      createdAt,
      updatedAt: new Date(stat.mtimeMs).toISOString(),
      snippet: truncate(firstUser, 300),
      metadata: { artifactKind: path.basename(file).startsWith("rollout-") ? "codex-rollout" : "jsonl" },
    };
  } finally {
    fs.closeSync(fd);
  }
}

function ensureLifeVertical(sqlite: Database.Database, verticalId: string): void {
  const now = nowIso();
  sqlite.prepare(`
    INSERT OR IGNORE INTO life_verticals (id, label, status, metadata_json, synced_at)
    VALUES (?, ?, 'alpha', '{}', ?)
  `).run(verticalId, verticalId, now);
}

function ensureLifeVariable(sqlite: Database.Database, verticalId: string, variableId: string): void {
  const now = nowIso();
  sqlite.prepare(`
    INSERT OR IGNORE INTO life_variables (id, vertical_id, label, value_type, definition_json, updated_at)
    VALUES (?, ?, ?, 'json', '{}', ?)
  `).run(variableId, verticalId, variableId, now);
}

function upsertRegistry(sqlite: Database.Database, domain: string, kind: string, id: string, input: { sensitive?: boolean; metadata?: JsonRecord; path?: string | null; secretRef?: string | null }): void {
  const now = nowIso();
  sqlite.prepare(`
    INSERT INTO data_registry (domain, kind, id, sensitive, path, secret_ref, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(domain, kind, id) DO UPDATE SET sensitive = excluded.sensitive, path = excluded.path,
      secret_ref = excluded.secret_ref, metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
  `).run(domain, kind, id, input.sensitive ? 1 : 0, input.path ?? null, input.secretRef ?? null, JSON.stringify(input.metadata ?? {}), now, now);
}

function usage(binName: string, group: string): string {
  switch (group) {
    case "data":
      return [
        `Usage: ${binName} data doctor|backup|restore|reset [--json]`,
        `  ${binName} data doctor --json`,
        `  ${binName} data backup --out DIR --json`,
        `  ${binName} data restore --from DIR --json`,
        `  ${binName} data reset --domain app-state|life|resources|agents|sessions-index|all --json`,
      ].join("\n");
    case "app-state":
      return `Usage: ${binName} app-state get [KEY]|set KEY --value JSON|snapshot [--json]`;
    case "life":
      return `Usage: ${binName} life catalog|seed-catalog|observe|list|delete [--json]`;
    case "apps":
      return `Usage: ${binName} apps list|upsert [--json]`;
    case "design":
      return `Usage: ${binName} design list|upsert [--json]`;
    case "agents":
      return `Usage: ${binName} agents list|upsert [--json]`;
    case "skills":
      return `Usage: ${binName} skills list|upsert [--json]`;
    case "connections":
      return `Usage: ${binName} connections list|upsert [--json]`;
    case "sessions":
      return `Usage: ${binName} sessions index|get [--json]`;
    default:
      return `Usage: ${binName} data doctor [--json]`;
  }
}

function writeSuccess(input: V1DataCliInput, payload: unknown): void {
  if (input.wantsJson) {
    input.stdout.write(`${JSON.stringify(redactSecrets(payload), null, 2)}\n`);
    return;
  }
  input.stdout.write(`${typeof payload === "string" ? payload : JSON.stringify(redactSecrets(payload), null, 2)}\n`);
}

function writeError(input: V1DataCliInput, code: string, message: string): void {
  const payload = { ok: false, error: { code, message } };
  if (input.wantsJson) input.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  else input.stderr.write(`${message}\n`);
}

function usageError(input: V1DataCliInput, message: string): number {
  writeError(input, "usage", message);
  return V1_DATA_EXIT_USAGE;
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function parseMaybeJson(value: string | undefined): unknown {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^(true|false|null|-?\d+(\.\d+)?|\{|\[|")/.test(trimmed)) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

function normalizeDbRow(row: unknown): unknown {
  if (!isRecord(row)) return row;
  const out: JsonRecord = {};
  for (const [key, value] of Object.entries(row)) {
    if (key.endsWith("_json") && typeof value === "string") {
      out[toCamel(key.slice(0, -5))] = parseJson(value, {});
    } else {
      out[toCamel(key)] = value;
    }
  }
  return out;
}

function toCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function stringValue(value: unknown, fallback: string | null): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function truthy(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true" || value === "yes";
}

function expandHome(value: string): string {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function truncate(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3).trim()}...`;
}

function extractTextContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map((entry) => {
    if (typeof entry === "string") return entry;
    if (isRecord(entry) && typeof entry.text === "string") return entry.text;
    return "";
  }).join(" ").trim();
}
