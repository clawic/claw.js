import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";

import BetterSqlite3 from "better-sqlite3";
import type Database from "better-sqlite3";
import { DatabaseServiceStore } from "@clawjs/database";
import type { FieldDefinition, IndexDefinition } from "@clawjs/database";
import { redactSecrets } from "@clawjs/claw";
import { V1_MAIN_SCHEMA_SQL, V1_SIDECAR_SCHEMA_SQL_BY_FILE } from "./v1-data-surface.ts";
import { assertCodexReadOnlyPath, resolveClawCliCommand, resolveClawPersistentSurfacePath } from "@clawjs/core";
import { writeCommandJsonError, writeCommandJsonOk } from "./cli-json.ts";

export const V1_DATA_EXIT_OK = 0;
export const V1_DATA_EXIT_FAILURE = 1;
const V1_DATA_EXIT_USAGE = 64;

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

export type JsonRecord = Record<string, unknown>;
type PageUpsertInput = {
  id?: string | null;
  title: string;
  text?: string | null;
  space?: string;
  surface?: string;
  ownerId?: string | null;
  authorKind?: string;
  authorId?: string | null;
  visibility?: string;
  sensitivity?: string;
  tags?: string[] | null;
  properties?: JsonRecord;
  sourceRecordDomain?: string | null;
  sourceRecordId?: string | null;
};

export const PROFILE_ID = "local";
const APP_STATE_DOMAIN_TABLES = [
  "app_state",
  "app_projects",
  "app_pinned_threads",
  "app_session_titles",
  "app_archives",
  "app_sidebar_snapshots",
  "app_terminal_tabs",
];
const SIGNALS_DOMAIN_TABLES = ["signals_verticals", "signals_variables", "signals_sessions", "signals_observations"];
const RESOURCE_DOMAIN_TABLES = ["resources", "apps", "design_resources"];
const AGENT_DOMAIN_TABLES = [
  "agents",
  "personalities",
  "skills",
  "skill_collections",
  "connections",
  "agent_assignments",
  "agent_execution_profiles",
  "agent_resource_grants",
  "agent_memory_policies",
  "agent_budgets",
  "agent_config_revisions",
  "agent_evaluations",
  "agent_incidents",
  "agent_blueprints",
  "agent_runs",
  "agent_sessions",
  "agent_session_activities",
  "provider_routing",
  "provider_settings",
  "snippets",
  "channel_accounts",
  "channel_routing",
  "channel_messages",
];
const CONNECTOR_CONTROL_PLANE_DOMAIN_TABLES = [
  "connector_audit_events",
  "connector_budgets",
  "connector_credential_bindings",
  "connector_operations",
  "connector_external_principals",
  "connector_capabilities",
  "connector_policies",
  "connector_network_policies",
  "connector_providers",
];
const SESSION_DOMAIN_TABLES = ["session_index"];
const USER_MODEL_DOMAIN_TABLES = ["user_profile_items", "user_profile_meta", "user_profile_history"];
const SIGNALS_RUNTIME_DOMAIN_TABLES = ["system_variables", "user_variables", "observations", "sessions", "healthkit_sync_state", "hidden_system_variables"];
const TIME_RUNTIME_DOMAIN_TABLES = ["temporal_projections", "temporal_run_log", "temporal_executions", "temporal_items"];
const SIDECAR_FILENAMES = ["vault.sqlite", "sessions.sqlite", "audio.sqlite", "drive.sqlite", "search.sqlite", "runtime.sqlite", "notify.sqlite", "monitor.sqlite", "infra.sqlite", "feed.sqlite", "ops.sqlite"];
const KNOWLEDGE_DOMAIN_TABLES = [
  "knowledge_entities",
  "knowledge_facts",
  "pages",
  "page_blocks",
  "page_links",
  "page_mentions",
  "page_revisions",
  "page_comments",
  "profile_projection",
];
const WIKI_VIEW_TABLES = [
  "wiki_admins",
  "wiki_spaces",
  "wiki_scoped_tokens",
];
const PRODUCTIVITY_DOMAIN_TABLES = ["productivity_items", "workspace_records", "workspace_meta", ...TIME_RUNTIME_DOMAIN_TABLES];
const CONTENT_SERVICE_TABLES = [
  "content_admins",
  "content_brands",
  "content_destinations",
  "content_campaigns",
  "content_entries",
  "content_revisions",
  "content_assets",
  "content_variants",
  "content_approvals",
  "content_plans",
  "content_publication_runs",
  "content_scoped_tokens",
];
const ERP_SERVICE_TABLES = [
  "erp_admins",
  "erp_tenants",
  "erp_legal_entities",
  "erp_branches",
  "erp_warehouses",
  "erp_fiscal_periods",
  "erp_accounts",
  "erp_items",
  "erp_employees",
  "erp_projects",
  "erp_localizations",
  "erp_counters",
  "erp_documents",
  "erp_journal_entries",
  "erp_journal_lines",
  "erp_inventory_balances",
  "erp_approvals",
  "erp_jobs",
  "erp_audit_events",
];
const PUBLISHING_SERVICE_TABLES = [
  "publishing_workspace",
  "publishing_user",
  "publishing_workspace_member",
  "publishing_workspace_invitation",
  "publishing_api_token",
  "publishing_audit_event",
  "publishing_channel_family",
  "publishing_channel_account",
  "publishing_channel_account_health",
  "publishing_post",
  "publishing_post_account",
  "publishing_post_variant",
  "publishing_post_label",
  "publishing_post_label_pivot",
  "publishing_media",
  "publishing_post_media_pivot",
  "publishing_post_activity",
  "publishing_queue",
  "publishing_queue_slot",
  "publishing_queue_account",
  "publishing_queue_entry",
  "publishing_blackout_window",
  "publishing_recurrence",
  "publishing_bulk_import_batch",
  "publishing_campaign",
  "publishing_template",
  "publishing_hashtag_group",
  "publishing_dynamic_variable",
  "publishing_evergreen_pool",
  "publishing_evergreen_pool_member",
  "publishing_ab_variant_set",
  "publishing_ab_variant_member",
  "publishing_utm_template",
  "publishing_tracked_link",
  "publishing_link_shortener_provider",
  "publishing_locale_variant_policy",
  "publishing_audience_segment",
  "publishing_account_metric_daily",
  "publishing_post_metric",
  "publishing_report",
  "publishing_report_export",
  "publishing_imported_post",
  "publishing_inbox_thread",
  "publishing_inbox_message",
  "publishing_inbox_rule",
  "publishing_approval_workflow",
  "publishing_post_approval",
  "publishing_post_approval_decision",
  "publishing_external_reviewer_link",
  "publishing_webhook",
  "publishing_webhook_delivery",
  "publishing_integration_service",
  "publishing_ai_brand_voice",
  "publishing_job",
  "publishing_job_batch",
  "publishing_setting",
  "publishing_system_status",
  "publishing_migrations",
];
const CONTENT_DOMAIN_TABLES = ["content_items", ...CONTENT_SERVICE_TABLES];
const SOCIAL_DOMAIN_TABLES = ["social_posts", ...PUBLISHING_SERVICE_TABLES];
const BUSINESS_DOMAIN_TABLES = ["business_records", ...CONTENT_DOMAIN_TABLES, ...SOCIAL_DOMAIN_TABLES, "finance_records", "accounting_entries", "accounting_lines", ...ERP_SERVICE_TABLES];
const CALENDAR_DOMAIN_TABLES = ["calendar_events"];
const IOT_DOMAIN_TABLES = ["iot_config"];
const MARKETPLACE_DOMAIN_TABLES = ["marketplace_choices"];
const MCP_DOMAIN_TABLES = ["mcp_servers", "mcp_tools"];

const SIGNALS_CATALOG_COLLECTION_FIELDS: FieldDefinition[] = [
  { name: "verticalId", type: "text", required: true },
  { name: "label", type: "text", required: true },
  { name: "category", type: "text" },
  { name: "description", type: "text" },
  { name: "catalogJson", type: "json" },
  { name: "sensitive", type: "boolean" },
  { name: "metadata", type: "json" },
];

const SIGNALS_CATALOG_COLLECTION_INDEXES: IndexDefinition[] = [
  { name: "signals_catalog_vertical_idx", fields: ["verticalId"] },
  { name: "signals_catalog_category_idx", fields: ["category"] },
];

export function resolveClawjsDataRoot(env: NodeJS.ProcessEnv = process.env): string {
  const explicitData = env.CLAW_DATA_DIR;
  if (explicitData) return path.resolve(expandHome(explicitData));
  const home = path.resolve(expandHome(env.CLAW_HOME || resolveClawPersistentSurfacePath("claw.global")));
  return path.join(home, "data");
}

export function resolveClawjsMainDbPath(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.CLAW_DB_PATH;
  if (explicit) return path.resolve(expandHome(explicit));
  return path.join(resolveClawjsDataRoot(env), "core.sqlite");
}

export function resolveClawjsFilesDir(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.CLAW_FILES_DIR;
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
  sqlite.exec(V1_MAIN_SCHEMA_SQL);
  ensureColumn(sqlite, "app_projects", "resource_id", "TEXT");
  sqlite.prepare("CREATE INDEX IF NOT EXISTS app_projects_resource_id_idx ON app_projects(resource_id) WHERE resource_id IS NOT NULL").run();
  ensureColumn(sqlite, "signals_observations", "page_id", "TEXT");
  ensureColumn(sqlite, "agents", "secret_ref", "TEXT");
  ensureColumn(sqlite, "agents", "status", "TEXT NOT NULL DEFAULT 'active'");
  ensureColumn(sqlite, "agents", "agency_mode", "TEXT NOT NULL DEFAULT 'assistant'");
  ensureColumn(sqlite, "agents", "role", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(sqlite, "agents", "title", "TEXT");
  ensureColumn(sqlite, "agents", "description", "TEXT");
  ensureColumn(sqlite, "agents", "owner_kind", "TEXT");
  ensureColumn(sqlite, "agents", "owner_id", "TEXT");
  ensureColumn(sqlite, "agents", "workspace_id", "TEXT");
  ensureColumn(sqlite, "agents", "project_id", "TEXT");
  ensureColumn(sqlite, "agents", "autonomy_profile", "TEXT NOT NULL DEFAULT 'respond_only'");
  ensureColumn(sqlite, "agents", "default_execution_profile_id", "TEXT");
  ensureColumn(sqlite, "agents", "default_memory_policy_id", "TEXT");
  ensureColumn(sqlite, "agents", "default_budget_id", "TEXT");
  ensureColumn(sqlite, "agents", "retired_at", "TEXT");
  ensureColumn(sqlite, "agents", "retirement_snapshot_ref", "TEXT");
  ensureColumn(sqlite, "skills", "secret_refs_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(sqlite, "iot_config", "config_json", "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(sqlite, "iot_config", "secret_ref", "TEXT");
  ensureColumn(sqlite, "iot_config", "enabled", "INTEGER NOT NULL DEFAULT 1");
  sqlite.prepare(`
    INSERT OR IGNORE INTO app_state (profile_id, key, value_json, updated_at)
    VALUES (?, 'profile.id', ?, ?)
  `).run(PROFILE_ID, JSON.stringify(PROFILE_ID), nowIso());
  seedSidecarRegistry(sqlite);
  ensureV2Sidecars();
}

function ensureV1Collections(store: DatabaseServiceStore): void {
  store.ensureNamespace({ id: "main", displayName: "Main" });
  store.ensureCollection("main", {
    name: "signals_catalog",
    displayName: "Signals Catalog",
    fields: SIGNALS_CATALOG_COLLECTION_FIELDS,
    indexes: SIGNALS_CATALOG_COLLECTION_INDEXES,
    coreFieldNames: ["verticalId", "label"],
  });
}

export function doctorPayload(sqlite: Database.Database): JsonRecord {
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
    version: 2,
    dbPath,
    filesDir: resolveClawjsFilesDir(),
    policy: {
      writer: "clawjs-core",
      clients: "cli-json",
      secrets: "external-secrets",
      knowledge: "main-db",
      notes: "main-db-pages-blocks",
      userModel: "profile-projection-from-knowledge",
      sessionBodies: "conversation-artifacts-sidecars",
      blobs: "filesystem-referenced-sidecars",
      rawRuntime: "operational-sidecars",
    },
    logicalDomains: {
      mainDb: ["knowledge", "notes", "profile", "user-model", "signals", "tasks", "productivity", "time", "business", "content", "social", "finance", "ledger", "calendar", "iot", "marketplace", "apps", "design", "agents", "skills", "connections", "connectors"],
      sidecars: ["secrets", "conversation-artifacts", "search", "runtime", "notify", "monitor", "infra", "ops"],
      externalSources: ["codex", "mcp"],
    },
    registry: sqlite.prepare("SELECT * FROM data_registry ORDER BY domain, kind, id").all().map(normalizeDbRow),
    tables: tables.map((row) => row.name),
    counts,
  };
}

export function backupDataStore(outDir: string): JsonRecord {
  fs.mkdirSync(outDir, { recursive: true });
  const dbPath = resolveClawjsMainDbPath();
  const copied: string[] = [];
  for (const suffix of ["", "-wal", "-shm"]) {
    const src = `${dbPath}${suffix}`;
    if (!fs.existsSync(src)) continue;
    const dest = path.join(outDir, `core.sqlite${suffix}`);
    fs.copyFileSync(src, dest);
    copied.push(dest);
  }
  const root = resolveClawjsDataRoot();
  const sidecarDir = path.join(outDir, "sidecars");
  for (const name of SIDECAR_FILENAMES) {
    for (const suffix of ["", "-wal", "-shm"]) {
      const src = path.join(root, `${name}${suffix}`);
      if (!fs.existsSync(src)) continue;
      fs.mkdirSync(sidecarDir, { recursive: true });
      const dest = path.join(sidecarDir, `${name}${suffix}`);
      fs.copyFileSync(src, dest);
      copied.push(dest);
    }
  }
  const filesDir = resolveClawjsFilesDir();
  const filesBackupDir = path.join(outDir, "files");
  if (fs.existsSync(filesDir)) {
    fs.cpSync(filesDir, filesBackupDir, { recursive: true });
    copied.push(filesBackupDir);
  }
  const blobsDir = path.join(root, "blobs");
  const blobsBackupDir = path.join(outDir, "blobs");
  if (fs.existsSync(blobsDir)) {
    fs.cpSync(blobsDir, blobsBackupDir, { recursive: true });
    copied.push(blobsBackupDir);
  }
  const manifest = {
    version: 2,
    createdAt: nowIso(),
    dbPath,
    root,
    filesDir,
    copied,
    includes: ["main-db", "sidecar-sqlite-files-present", "files-dir-present", "blobs-dir-present"],
    excludes: ["external-codex-source", "external-mcp-source"],
  };
  const manifestPath = path.join(outDir, "backup-manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return { outDir, manifestPath, copied };
}

export function restoreDataStore(fromDir: string): JsonRecord {
  const src = path.join(fromDir, "core.sqlite");
  if (!fs.existsSync(src)) throw new Error(`Missing backup DB at ${src}`);
  const dest = resolveClawjsMainDbPath();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) {
    const srcFile = `${src}${suffix}`;
    const destFile = `${dest}${suffix}`;
    if (fs.existsSync(srcFile)) fs.copyFileSync(srcFile, destFile);
    else if (suffix && fs.existsSync(destFile)) fs.rmSync(destFile, { force: true });
  }
  const root = resolveClawjsDataRoot();
  const sidecarDir = path.join(fromDir, "sidecars");
  const restored: string[] = [dest];
  if (fs.existsSync(sidecarDir)) {
    for (const entry of fs.readdirSync(sidecarDir)) {
      const srcFile = path.join(sidecarDir, entry);
      const destFile = path.join(root, entry);
      fs.mkdirSync(path.dirname(destFile), { recursive: true });
      fs.copyFileSync(srcFile, destFile);
      restored.push(destFile);
    }
  }
  for (const dirName of ["files", "blobs"]) {
    const srcDir = path.join(fromDir, dirName);
    if (!fs.existsSync(srcDir)) continue;
    const destDir = dirName === "files" ? resolveClawjsFilesDir() : path.join(root, "blobs");
    fs.rmSync(destDir, { recursive: true, force: true });
    fs.cpSync(srcDir, destDir, { recursive: true });
    restored.push(destDir);
  }
  return { restored: true, fromDir, dbPath: dest, restoredPaths: restored };
}

export function resetDomain(sqlite: Database.Database, domain: string): JsonRecord {
  const normalized = domain.trim().toLowerCase();
  const sidecarOnlyDomains = new Set(["audio", "drive", "runtime", "notify", "monitor", "infra", "ops", "conversation-artifacts"]);
  const tables =
    normalized === "all" ? [...APP_STATE_DOMAIN_TABLES, ...SIGNALS_DOMAIN_TABLES, ...SIGNALS_RUNTIME_DOMAIN_TABLES, ...KNOWLEDGE_DOMAIN_TABLES, ...WIKI_VIEW_TABLES, ...USER_MODEL_DOMAIN_TABLES, ...PRODUCTIVITY_DOMAIN_TABLES, ...BUSINESS_DOMAIN_TABLES, ...CALENDAR_DOMAIN_TABLES, ...IOT_DOMAIN_TABLES, ...MARKETPLACE_DOMAIN_TABLES, ...RESOURCE_DOMAIN_TABLES, ...AGENT_DOMAIN_TABLES, ...CONNECTOR_CONTROL_PLANE_DOMAIN_TABLES, ...MCP_DOMAIN_TABLES, ...SESSION_DOMAIN_TABLES] :
    normalized === "app-state" ? APP_STATE_DOMAIN_TABLES :
    normalized === "signals" ? [...SIGNALS_DOMAIN_TABLES, ...SIGNALS_RUNTIME_DOMAIN_TABLES] :
    normalized === "knowledge" || normalized === "notes" ? KNOWLEDGE_DOMAIN_TABLES :
    normalized === "wiki" ? WIKI_VIEW_TABLES :
    normalized === "profile" || normalized === "user-model" ? [...KNOWLEDGE_DOMAIN_TABLES, ...USER_MODEL_DOMAIN_TABLES] :
    normalized === "tasks" || normalized === "productivity" || normalized === "time" ? PRODUCTIVITY_DOMAIN_TABLES :
    normalized === "business" ? BUSINESS_DOMAIN_TABLES :
    normalized === "content" ? CONTENT_DOMAIN_TABLES :
    normalized === "social" ? SOCIAL_DOMAIN_TABLES :
    normalized === "finance" || normalized === "ledger" ? ["finance_records", "accounting_entries", "accounting_lines", ...ERP_SERVICE_TABLES] :
    normalized === "marketplace" ? MARKETPLACE_DOMAIN_TABLES :
    normalized === "calendar" ? CALENDAR_DOMAIN_TABLES :
    normalized === "iot" ? IOT_DOMAIN_TABLES :
    normalized === "resources" || normalized === "apps" || normalized === "design" ? RESOURCE_DOMAIN_TABLES :
    normalized === "agents" || normalized === "skills" || normalized === "connections" ? AGENT_DOMAIN_TABLES :
    normalized === "connectors" || normalized === "integrations" ? CONNECTOR_CONTROL_PLANE_DOMAIN_TABLES :
    normalized === "mcp" ? MCP_DOMAIN_TABLES :
    normalized === "sessions-index" || normalized === "sessions" ? SESSION_DOMAIN_TABLES :
    normalized === "search" ? ["notes_fts", "session_index_fts"] :
    sidecarOnlyDomains.has(normalized) ? [] :
    [];
  if (tables.length === 0 && !sidecarOnlyDomains.has(normalized)) throw new Error(`Unknown reset domain: ${domain}`);
  const deleted: Record<string, number> = {};
  const tx = sqlite.transaction(() => {
    if (tables.includes("session_index") && tableExists(sqlite, "session_index_fts")) sqlite.prepare("DELETE FROM session_index_fts").run();
    if (tables.includes("pages") && tableExists(sqlite, "notes_fts")) sqlite.prepare("DELETE FROM notes_fts").run();
    if (normalized === "wiki" && tableExists(sqlite, "pages")) {
      if (tableExists(sqlite, "notes_fts")) {
        sqlite.prepare("DELETE FROM notes_fts WHERE page_id IN (SELECT id FROM pages WHERE surface = 'wiki')").run();
      }
      deleted.wikiPageViews = sqlite.prepare("DELETE FROM pages WHERE surface = 'wiki'").run().changes;
    }
    for (const table of tables) {
      if (!tableExists(sqlite, table)) {
        deleted[table] = 0;
        continue;
      }
      deleted[table] = sqlite.prepare(`DELETE FROM ${quoteIdent(table)}`).run().changes;
    }
  });
  tx();
  resetSidecarDomain(normalized, deleted);
  seedSidecarRegistry(sqlite);
  ensureV2Sidecars();
  return { domain: normalized, deleted };
}

export function sessionRoots(input: V1DataCliInput): string[] {
  const roots = [
    ...(input.flags.root ? [input.flags.root] : []),
    ...(input.flags.roots ? input.flags.roots.split(",") : []),
  ].map((entry) => path.resolve(input.cwd, expandHome(entry.trim()))).filter(Boolean);
  const resolved = roots.length > 0 ? roots : [
    path.join(os.homedir(), ".codex", "sessions"),
    path.join(os.homedir(), ".codex", "archived_sessions"),
  ];
  for (const root of resolved) {
    assertCodexReadOnlyPath({ homeDir: os.homedir(), path: root, operation: "read" });
  }
  return resolved;
}

export function indexSessionRoots(sqlite: Database.Database, roots: string[], source: string): number {
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
  indexSessionSidecar(files, source, now);
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

function ensureColumn(sqlite: Database.Database, table: string, column: string, definition: string): void {
  const columns = sqlite.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all() as Array<{ name: string }>;
  if (columns.some((entry) => entry.name === column)) return;
  sqlite.prepare(`ALTER TABLE ${quoteIdent(table)} ADD COLUMN ${quoteIdent(column)} ${definition}`).run();
}

export function openSidecar(filename: string): Database.Database {
  const dbPath = path.join(resolveClawjsDataRoot(), filename);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new BetterSqlite3(dbPath);
  sqlite.pragma("journal_mode = WAL");
  ensureSidecarSchema(filename, sqlite);
  return sqlite;
}

function ensureV2Sidecars(): void {
  for (const filename of SIDECAR_FILENAMES) {
    if (filename === "vault.sqlite") continue;
    const sqlite = openSidecar(filename);
    sqlite.close();
  }
}

function ensureSidecarSchema(filename: string, sqlite: Database.Database): void {
  if (filename === "vault.sqlite") {
    sqlite.exec(V1_SIDECAR_SCHEMA_SQL_BY_FILE["vault.sqlite"]);
    return;
  }
  if (filename === "sessions.sqlite") {
    sqlite.exec(V1_SIDECAR_SCHEMA_SQL_BY_FILE["sessions.sqlite"]);
    return;
  }
  if (filename === "audio.sqlite") {
    sqlite.exec(V1_SIDECAR_SCHEMA_SQL_BY_FILE["audio.sqlite"]);
    return;
  }
  if (filename === "drive.sqlite") {
    sqlite.exec(V1_SIDECAR_SCHEMA_SQL_BY_FILE["drive.sqlite"]);
    return;
  }
  if (filename === "search.sqlite") {
    sqlite.exec(V1_SIDECAR_SCHEMA_SQL_BY_FILE["search.sqlite"]);
    return;
  }
  if (filename === "runtime.sqlite") {
    sqlite.exec(V1_SIDECAR_SCHEMA_SQL_BY_FILE["runtime.sqlite"]);
    return;
  }
  sqlite.exec(V1_SIDECAR_SCHEMA_SQL_BY_FILE.default);
}

function indexSessionSidecar(files: string[], source: string, indexedAt: string): void {
  const sqlite = openSidecar("sessions.sqlite");
  const upsertSession = sqlite.prepare(`
    INSERT INTO conversation_sessions (session_id, source, artifact_path, mtime_ms, size_bytes, title, cwd, created_at, updated_at, archived, pinned, snippet, metadata_json, indexed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET source = excluded.source, artifact_path = excluded.artifact_path,
      mtime_ms = excluded.mtime_ms, size_bytes = excluded.size_bytes, title = excluded.title, cwd = excluded.cwd,
      created_at = excluded.created_at, updated_at = excluded.updated_at, archived = excluded.archived,
      snippet = excluded.snippet, metadata_json = excluded.metadata_json, indexed_at = excluded.indexed_at
  `);
  const insertMessage = sqlite.prepare(`
    INSERT OR REPLACE INTO conversation_messages (id, session_id, role, text, turn_index, created_at, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertFts = sqlite.prepare("INSERT INTO conversation_fts (session_id, message_id, title, body, cwd) VALUES (?, ?, ?, ?, ?)");
  const tx = sqlite.transaction(() => {
    for (const file of files) {
      const stat = fs.statSync(file);
      const summary = summarizeSessionArtifact(file, stat);
      upsertSession.run(
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
        indexedAt,
      );
      sqlite.prepare("DELETE FROM conversation_messages WHERE session_id = ?").run(summary.sessionId);
      sqlite.prepare("DELETE FROM conversation_fts WHERE session_id = ?").run(summary.sessionId);
      const messages = extractSessionMessages(file, summary.sessionId);
      for (const message of messages) {
        insertMessage.run(message.id, summary.sessionId, message.role, message.text, message.turnIndex, message.createdAt, JSON.stringify(message.metadata));
        insertFts.run(summary.sessionId, message.id, summary.title, message.text, summary.cwd ?? "");
      }
      if (messages.length === 0) {
        insertFts.run(summary.sessionId, `${summary.sessionId}:summary`, summary.title, summary.snippet, summary.cwd ?? "");
      }
    }
  });
  try {
    tx();
  } finally {
    sqlite.close();
  }
}

function extractSessionMessages(file: string, sessionId: string): Array<{ id: string; role: string; text: string; turnIndex: number; createdAt: string | null; metadata: JsonRecord }> {
  const maxBytes = 2 * 1024 * 1024;
  const fd = fs.openSync(file, "r");
  try {
    const stat = fs.fstatSync(fd);
    const probe = Buffer.alloc(Math.min(maxBytes, stat.size));
    fs.readSync(fd, probe, 0, probe.length, 0);
    const messages: Array<{ id: string; role: string; text: string; turnIndex: number; createdAt: string | null; metadata: JsonRecord }> = [];
    let turnIndex = 0;
    for (const line of probe.toString("utf8").split("\n")) {
      if (!line.trim()) continue;
      const obj = parseJson<JsonRecord>(line, {});
      const payload = isRecord(obj.payload) ? obj.payload : {};
      let role = "";
      let text = "";
      let createdAt = stringValue(obj.timestamp ?? payload.timestamp ?? payload.created_at, null);
      if (obj.type === "event_msg" && payload.type === "user_message") {
        role = "user";
        text = stringValue(payload.message, "") ?? "";
      } else if (isRecord(obj.message)) {
        const message = obj.message as JsonRecord;
        role = stringValue(message.role, "") ?? "";
        text = extractTextContent(message.content);
      }
      if (!role || !text) continue;
      turnIndex += 1;
      messages.push({
        id: `${sessionId}:${turnIndex}`,
        role,
        text: truncate(text, 4000),
        turnIndex,
        createdAt,
        metadata: { truncated: text.length > 4000 },
      });
      if (messages.length >= 200) break;
    }
    return messages;
  } finally {
    fs.closeSync(fd);
  }
}

function seedSidecarRegistry(sqlite: Database.Database): void {
  const root = resolveClawjsDataRoot();
  const sidecars: Array<{ domain: string; id: string; path: string; sensitive?: boolean; cache?: boolean; metadata?: JsonRecord }> = [
    { domain: "secrets", id: "vault", path: path.join(root, "vault.sqlite"), sensitive: true, metadata: { reason: "auth-material", connectorRawTraceRefs: "encrypted-ref-only" } },
    { domain: "conversation-artifacts", id: "sessions", path: path.join(root, "sessions.sqlite"), metadata: { logicalDomains: ["sessions"], owns: ["messages-index", "conversation-fts"] } },
    { domain: "conversation-artifacts", id: "audio", path: path.join(root, "audio.sqlite"), metadata: { logicalDomains: ["audio"], owns: ["transcripts", "audio-metadata"], blobs: "filesystem" } },
    { domain: "conversation-artifacts", id: "drive", path: path.join(root, "drive.sqlite"), metadata: { logicalDomains: ["drive"], owns: ["attachments", "assets"], blobs: path.join(root, "blobs") } },
    { domain: "search", id: "global-search", path: path.join(root, "search.sqlite"), cache: true, metadata: { reconstructible: true, owns: ["fts", "embeddings", "ranking"] } },
    { domain: "runtime", id: "queues", path: path.join(root, "runtime.sqlite"), cache: true, metadata: { retention: "compact", owns: ["jobs", "claims", "retries", "nudges", "draft-distillations"] } },
    { domain: "notify", id: "deliveries", path: path.join(root, "notify.sqlite"), cache: true, metadata: { operational: true } },
    { domain: "monitor", id: "events", path: path.join(root, "monitor.sqlite"), cache: true, metadata: { operational: true } },
    { domain: "infra", id: "relay-execution", path: path.join(root, "infra.sqlite"), cache: true, metadata: { operational: true } },
    { domain: "feed", id: "raw-provider-cache", path: path.join(root, "feed.sqlite"), cache: true, metadata: { rawCache: true, operational: true } },
    { domain: "ops", id: "metrics-cache", path: path.join(root, "ops.sqlite"), cache: true, metadata: { operational: true, rawCache: true } },
  ];
  const now = nowIso();
  const stmt = sqlite.prepare(`
    INSERT INTO data_registry (domain, kind, id, owner, storage, path, sensitive, cache, metadata_json, created_at, updated_at)
    VALUES (?, 'sidecar', ?, 'clawjs-core', 'sidecar-db', ?, ?, ?, ?, ?, ?)
    ON CONFLICT(domain, kind, id) DO UPDATE SET path = excluded.path, sensitive = excluded.sensitive,
      cache = excluded.cache, metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
  `);
  const tx = sqlite.transaction(() => {
    for (const sidecar of sidecars) {
      stmt.run(sidecar.domain, sidecar.id, sidecar.path, sidecar.sensitive ? 1 : 0, sidecar.cache ? 1 : 0, JSON.stringify(sidecar.metadata ?? {}), now, now);
    }
  });
  tx();
}

export function upsertPageWithBlocks(sqlite: Database.Database, input: PageUpsertInput): JsonRecord {
  const now = nowIso();
  const id = input.id || `page-${randomUUID()}`;
  const text = input.text ?? "";
  const blocks = textToBlocks(text, id, now);
  const tags = input.tags ?? [];
  const properties = input.properties ?? {};
  const tx = sqlite.transaction(() => {
    sqlite.prepare(`
      INSERT INTO pages (id, title, space, surface, owner_id, author_kind, author_id, visibility, sensitivity, tags_json, properties_json, source_record_domain, source_record_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title, space = excluded.space, surface = excluded.surface,
        owner_id = excluded.owner_id, author_kind = excluded.author_kind, author_id = excluded.author_id,
        visibility = excluded.visibility, sensitivity = excluded.sensitivity, tags_json = excluded.tags_json,
        properties_json = excluded.properties_json, source_record_domain = excluded.source_record_domain,
        source_record_id = excluded.source_record_id, updated_at = excluded.updated_at, archived_at = NULL
    `).run(
      id,
      input.title,
      input.space || "notes",
      input.surface || "note",
      input.ownerId ?? null,
      input.authorKind || "user",
      input.authorId ?? null,
      input.visibility || "private",
      input.sensitivity || "normal",
      JSON.stringify(tags),
      JSON.stringify(properties),
      input.sourceRecordDomain ?? null,
      input.sourceRecordId ?? null,
      now,
      now,
    );
    sqlite.prepare("DELETE FROM page_blocks WHERE page_id = ?").run(id);
    const insertBlock = sqlite.prepare(`
      INSERT INTO page_blocks (id, page_id, parent_block_id, sort_order, kind, content_json, text, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const block of blocks) {
      insertBlock.run(block.id, id, null, block.sortOrder, block.kind, JSON.stringify(block.content), block.text, "{}", now, now);
    }
    const revisionNumber = Number((sqlite.prepare("SELECT COALESCE(MAX(revision_number), 0) + 1 AS revision FROM page_revisions WHERE page_id = ?").get(id) as { revision: number }).revision);
    sqlite.prepare(`
      INSERT INTO page_revisions (id, page_id, revision_number, snapshot_json, created_at, author_kind, author_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(`rev-${id}-${revisionNumber}`, id, revisionNumber, JSON.stringify({ title: input.title, text, tags, properties }), now, input.authorKind || "user", input.authorId ?? null);
    sqlite.prepare("DELETE FROM notes_fts WHERE page_id = ?").run(id);
    sqlite.prepare("INSERT INTO notes_fts (page_id, title, body, tags) VALUES (?, ?, ?, ?)").run(id, input.title, text, tags.join(" "));
  });
  tx();
  upsertRegistry(sqlite, "notes", "page", id, { sensitive: input.sensitivity === "sensitive", metadata: { space: input.space || "notes", surface: input.surface || "note" } });
  return readPage(sqlite, id) ?? { id };
}

function textToBlocks(text: string, pageId: string, now: string): Array<{ id: string; sortOrder: number; kind: string; text: string; content: JsonRecord }> {
  const chunks = text.trim() ? text.trim().split(/\n{2,}/) : [""];
  return chunks.map((chunk, index) => {
    const trimmed = chunk.trim();
    const kind = trimmed.startsWith("# ") ? "heading_1" : trimmed.startsWith("## ") ? "heading_2" : /^[-*] /.test(trimmed) ? "bulleted_list" : "paragraph";
    const cleanText = trimmed.replace(/^#{1,6}\s+/, "").replace(/^[-*]\s+/, "");
    return {
      id: `block-${pageId}-${index + 1}-${now.replace(/[^0-9]/g, "")}`,
      sortOrder: index,
      kind,
      text: cleanText,
      content: { text: cleanText },
    };
  });
}

export function readPage(sqlite: Database.Database, id: string): JsonRecord | null {
  const row = sqlite.prepare("SELECT * FROM pages WHERE id = ?").get(id) as JsonRecord | undefined;
  if (!row) return null;
  const page = normalizeDbRow(row) as JsonRecord;
  const blocks = sqlite.prepare("SELECT * FROM page_blocks WHERE page_id = ? ORDER BY sort_order, created_at").all(id).map(normalizeDbRow);
  const links = sqlite.prepare("SELECT * FROM page_links WHERE source_page_id = ? ORDER BY created_at").all(id).map(normalizeDbRow);
  const mentions = sqlite.prepare("SELECT * FROM page_mentions WHERE page_id = ? ORDER BY created_at").all(id).map(normalizeDbRow);
  const comments = sqlite.prepare("SELECT * FROM page_comments WHERE page_id = ? ORDER BY created_at").all(id).map(normalizeDbRow);
  return { ...page, blocks, links, mentions, comments };
}

export function pageToMarkdown(page: JsonRecord): string {
  const title = stringValue(page.title, "Untitled") ?? "Untitled";
  const blocks = Array.isArray(page.blocks) ? page.blocks : [];
  const body = blocks.map((entry) => {
    if (!isRecord(entry)) return "";
    const kind = stringValue(entry.kind, "paragraph");
    const text = stringValue(entry.text, "") ?? "";
    if (kind === "heading_1") return `# ${text}`;
    if (kind === "heading_2") return `## ${text}`;
    if (kind === "bulleted_list") return `- ${text}`;
    return text;
  }).filter(Boolean).join("\n\n");
  return `# ${title}${body ? `\n\n${body}` : ""}\n`;
}

export function markdownToPagePatch(rawText: string): { title?: string; body: string } {
  const lines = rawText.replace(/\r\n/g, "\n").split("\n");
  const first = lines[0]?.trim();
  if (first?.startsWith("# ")) {
    return { title: first.slice(2).trim(), body: lines.slice(1).join("\n").trim() };
  }
  return { body: rawText };
}

export function parseCsvOrJson(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const parsed = parseMaybeJson(value);
  if (Array.isArray(parsed)) return parsed.map((entry) => String(entry)).filter(Boolean);
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

export function refreshProfileProjection(sqlite: Database.Database): JsonRecord {
  const rows = sqlite.prepare(`
    SELECT id, predicate, object_value_json, confidence, scope_json
    FROM knowledge_facts
    WHERE COALESCE(subject_id, 'user:me') = 'user:me'
      AND sensitivity NOT IN ('secret', 'journal', 'therapy')
      AND valid_to IS NULL
    ORDER BY predicate, updated_at DESC
  `).all() as Array<{ id: string; predicate: string; object_value_json: string; confidence: number | null; scope_json: string }>;
  const byPredicate = new Map<string, Array<{ id: string; value: unknown; confidence: number | null; scope: unknown }>>();
  for (const row of rows) {
    const list = byPredicate.get(row.predicate) ?? [];
    list.push({ id: row.id, value: parseJson(row.object_value_json, null), confidence: row.confidence, scope: parseJson(row.scope_json, {}) });
    byPredicate.set(row.predicate, list);
  }
  const now = nowIso();
  const tx = sqlite.transaction(() => {
    sqlite.prepare("DELETE FROM profile_projection").run();
    const insert = sqlite.prepare(`
      INSERT INTO profile_projection (id, section, content_text, source_fact_ids_json, confidence, scope_json, refreshed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const [predicate, facts] of byPredicate) {
      insert.run(
        `profile-${predicate}`,
        predicate,
        facts.map((fact) => typeof fact.value === "string" ? fact.value : JSON.stringify(fact.value)).join("\n"),
        JSON.stringify(facts.map((fact) => fact.id)),
        average(facts.map((fact) => fact.confidence).filter((value): value is number => typeof value === "number")),
        JSON.stringify(facts[0]?.scope ?? {}),
        now,
      );
    }
  });
  tx();
  return { refreshedAt: now, sections: byPredicate.size, facts: rows.length };
}

export function runSimpleRecordCommand(input: V1DataCliInput, store: DatabaseServiceStore, options: {
  table: string;
  defaultKind: string;
  idPrefix: string;
  usageGroup: string;
  fields: string[];
}): number {
  const command = input.positionals[1];
  if (command === "upsert") {
    const now = nowIso();
    const id = input.flags.id || `${options.idPrefix}-${randomUUID()}`;
    const name = input.flags.name || input.flags.title || input.positionals.slice(2).join(" ") || id;
    const pageId = input.flags.notes || input.flags.body
      ? upsertPageWithBlocks(store.sqlite, {
          id: input.flags["page-id"] || `page-${id}`,
          title: `${name} notes`,
          text: input.flags.notes || input.flags.body || "",
          space: options.usageGroup,
          surface: "record_note",
          sourceRecordDomain: options.table,
          sourceRecordId: id,
        }).id
      : input.flags["page-id"] || null;
    store.sqlite.prepare(`
      INSERT INTO ${quoteIdent(options.table)} (id, kind, name, status, page_id, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, name = excluded.name, status = excluded.status,
        page_id = excluded.page_id, metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
    `).run(id, input.flags.kind || options.defaultKind, name, input.flags.status || "active", pageId, input.flags.metadata ? JSON.stringify(parseMaybeJson(input.flags.metadata)) : "{}", now, now);
    writeSuccess(input, normalizeDbRow(store.sqlite.prepare(`SELECT * FROM ${quoteIdent(options.table)} WHERE id = ?`).get(id) as JsonRecord));
    return V1_DATA_EXIT_OK;
  }
  if (command === "list") {
    const rows = store.sqlite.prepare(`SELECT * FROM ${quoteIdent(options.table)} ORDER BY updated_at DESC LIMIT ?`).all(Math.max(1, Number(input.flags.limit ?? 100)));
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  return runRecordGetDelete(input, store, options.table, options.usageGroup);
}

export function runRecordGetDelete(input: V1DataCliInput, store: DatabaseServiceStore, table: string, usageGroup: string): number {
  const command = input.positionals[1];
  if (command === "get") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, `Usage: claw ${usageGroup} get ID [--json]`);
    const row = store.sqlite.prepare(`SELECT * FROM ${quoteIdent(table)} WHERE id = ?`).get(id) as JsonRecord | undefined;
    writeSuccess(input, row ? normalizeDbRow(row) : null);
    return row ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  if (command === "delete") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, `Usage: claw ${usageGroup} delete ID [--json]`);
    const changes = store.sqlite.prepare(`DELETE FROM ${quoteIdent(table)} WHERE id = ?`).run(id).changes;
    writeSuccess(input, { deleted: changes > 0, id });
    return changes > 0 ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  return usageError(input, usage(input.binName, usageGroup));
}

export function rebuildNotesFts(sqlite: Database.Database): number {
  const pages = sqlite.prepare("SELECT id, title, tags_json FROM pages WHERE archived_at IS NULL").all() as Array<{ id: string; title: string; tags_json: string }>;
  const blocks = sqlite.prepare("SELECT text FROM page_blocks WHERE page_id = ? ORDER BY sort_order, created_at");
  const tx = sqlite.transaction(() => {
    sqlite.prepare("DELETE FROM notes_fts").run();
    const insert = sqlite.prepare("INSERT INTO notes_fts (page_id, title, body, tags) VALUES (?, ?, ?, ?)");
    for (const page of pages) {
      const body = (blocks.all(page.id) as Array<{ text: string }>).map((block) => block.text).join("\n\n");
      const tags = parseJson<string[]>(page.tags_json, []).join(" ");
      insert.run(page.id, page.title, body, tags);
    }
  });
  tx();
  return pages.length;
}

export function rebuildSearchSidecar(main: Database.Database): number {
  const sqlite = openSidecar("search.sqlite");
  const docs: Array<{ id: string; domain: string; sourceId: string; title: string; body: string; path: string | null; updatedAt: string; metadata: JsonRecord }> = [];
  const pages = main.prepare("SELECT id, title, updated_at, tags_json FROM pages WHERE archived_at IS NULL").all() as Array<{ id: string; title: string; updated_at: string; tags_json: string }>;
  const pageBlocks = main.prepare("SELECT text FROM page_blocks WHERE page_id = ? ORDER BY sort_order, created_at");
  for (const page of pages) {
    docs.push({
      id: `notes:${page.id}`,
      domain: "notes",
      sourceId: page.id,
      title: page.title,
      body: (pageBlocks.all(page.id) as Array<{ text: string }>).map((block) => block.text).join("\n\n"),
      path: null,
      updatedAt: page.updated_at,
      metadata: { tags: parseJson(page.tags_json, []) },
    });
  }
  const facts = main.prepare("SELECT id, predicate, object_value_json, updated_at FROM knowledge_facts").all() as Array<{ id: string; predicate: string; object_value_json: string; updated_at: string }>;
  for (const fact of facts) {
    docs.push({
      id: `knowledge:${fact.id}`,
      domain: "knowledge",
      sourceId: fact.id,
      title: fact.predicate,
      body: JSON.stringify(parseJson(fact.object_value_json, null)),
      path: null,
      updatedAt: fact.updated_at,
      metadata: {},
    });
  }
  if (tableExists(main, "workspace_records")) {
    const records = main.prepare(`
      SELECT collection_name, record_id, payload_json, updated_at
      FROM workspace_records
      WHERE archived_at IS NULL
      ORDER BY updated_at DESC
      LIMIT 10000
    `).all() as Array<{ collection_name: string; record_id: string; payload_json: string; updated_at: string | null }>;
    for (const record of records) {
      const payload = parseJson(record.payload_json, {}) as JsonRecord;
      const title = String(payload.title ?? payload.name ?? payload.subject ?? payload.label ?? record.record_id);
      const body = [
        payload.description,
        payload.content,
        payload.body,
        payload.summary,
        payload.status,
        payload.kind,
        payload.email,
      ].filter((value) => typeof value === "string" && value.trim()).join("\n");
      docs.push({
        id: `${record.collection_name}:${record.record_id}`,
        domain: record.collection_name === "inbox_threads" || record.collection_name === "inbox_messages" ? "inbox" : record.collection_name,
        sourceId: record.record_id,
        title,
        body,
        path: null,
        updatedAt: record.updated_at ?? new Date(0).toISOString(),
        metadata: { collection: record.collection_name },
      });
    }
  }
  const sessionSidecar = openSidecar("sessions.sqlite");
  try {
    const sessions = sessionSidecar.prepare("SELECT session_id, title, snippet, cwd, artifact_path, updated_at FROM conversation_sessions").all() as Array<{ session_id: string; title: string; snippet: string; cwd: string | null; artifact_path: string; updated_at: string }>;
    for (const session of sessions) {
      docs.push({
        id: `sessions:${session.session_id}`,
        domain: "sessions",
        sourceId: session.session_id,
        title: session.title,
        body: session.snippet,
        path: session.artifact_path,
        updatedAt: session.updated_at,
        metadata: { cwd: session.cwd },
      });
    }
  } finally {
    sessionSidecar.close();
  }
  const audioSidecar = openSidecar("audio.sqlite");
  try {
    const audio = audioSidecar.prepare("SELECT id, path, transcript_text, updated_at FROM audio_items").all() as Array<{ id: string; path: string; transcript_text: string | null; updated_at: string }>;
    for (const item of audio) {
      docs.push({
        id: `audio:${item.id}`,
        domain: "audio",
        sourceId: item.id,
        title: path.basename(item.path),
        body: item.transcript_text ?? "",
        path: item.path,
        updatedAt: item.updated_at,
        metadata: {},
      });
    }
  } finally {
    audioSidecar.close();
  }
  const driveSidecar = openSidecar("drive.sqlite");
  try {
    const items = driveSidecar.prepare("SELECT id, name, path, metadata_json, updated_at FROM drive_items").all() as Array<{ id: string; name: string; path: string; metadata_json: string; updated_at: string }>;
    for (const item of items) {
      docs.push({
        id: `drive:${item.id}`,
        domain: "drive",
        sourceId: item.id,
        title: item.name,
        body: item.metadata_json,
        path: item.path,
        updatedAt: item.updated_at,
        metadata: {},
      });
    }
  } finally {
    driveSidecar.close();
  }
  const tx = sqlite.transaction(() => {
    sqlite.prepare("DELETE FROM search_documents").run();
    sqlite.prepare("DELETE FROM search_fts").run();
    const insertDoc = sqlite.prepare(`
      INSERT INTO search_documents (id, domain, source_id, title, body, path, updated_at, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertFts = sqlite.prepare("INSERT INTO search_fts (doc_id, domain, title, body, path) VALUES (?, ?, ?, ?, ?)");
    for (const doc of docs) {
      insertDoc.run(doc.id, doc.domain, doc.sourceId, doc.title, doc.body, doc.path, doc.updatedAt, JSON.stringify(doc.metadata));
      insertFts.run(doc.id, doc.domain, doc.title, doc.body, doc.path ?? "");
    }
  });
  try {
    tx();
  } finally {
    sqlite.close();
  }
  return docs.length;
}

export function querySearchSidecar(query: string, limit: number): unknown[] {
  const sqlite = openSidecar("search.sqlite");
  try {
    return sqlite.prepare(`
      SELECT search_documents.*
      FROM search_fts
      JOIN search_documents ON search_documents.id = search_fts.doc_id
      WHERE search_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(ftsPhrase(query), limit).map(normalizeDbRow);
  } finally {
    sqlite.close();
  }
}

export function runSidecarArtifactCommand(input: V1DataCliInput, filename: string, table: string, group: string): number {
  const action = input.positionals[2] || "list";
  const sqlite = openSidecar(filename);
  try {
    if (action === "list") {
      const sessionId = input.flags["session-id"];
      const limit = Math.max(1, Number(input.flags.limit ?? 100));
      const rows = sessionId
        ? sqlite.prepare(`SELECT * FROM ${quoteIdent(table)} WHERE session_id = ? ORDER BY updated_at DESC LIMIT ?`).all(sessionId, limit)
        : sqlite.prepare(`SELECT * FROM ${quoteIdent(table)} ORDER BY updated_at DESC LIMIT ?`).all(limit);
      writeSuccess(input, { items: rows.map(normalizeDbRow), sidecar: filename });
      return V1_DATA_EXIT_OK;
    }
    const id = input.flags.id || input.positionals[3];
    if (!id) return usageError(input, `Usage: claw ${group} artifact list|get|delete [ID] [--json]`);
    if (action === "get") {
      const row = sqlite.prepare(`SELECT * FROM ${quoteIdent(table)} WHERE id = ?`).get(id) as JsonRecord | undefined;
      writeSuccess(input, row ? normalizeDbRow(row) : null);
      return row ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
    }
    if (action === "delete") {
      const changes = sqlite.prepare(`DELETE FROM ${quoteIdent(table)} WHERE id = ?`).run(id).changes;
      writeSuccess(input, { deleted: changes > 0, id, sidecar: filename });
      return changes > 0 ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
    }
    return usageError(input, `Usage: claw ${group} artifact list|get|delete [ID] [--json]`);
  } finally {
    sqlite.close();
  }
}

function resetSidecarDomain(domain: string, deleted: Record<string, number>): void {
  const clear = (filename: string, tables: string[]) => {
    const sqlite = openSidecar(filename);
    try {
      for (const table of tables) {
        if (!tableExists(sqlite, table)) {
          deleted[`${filename}:${table}`] = 0;
          continue;
        }
        deleted[`${filename}:${table}`] = sqlite.prepare(`DELETE FROM ${quoteIdent(table)}`).run().changes;
      }
    } finally {
      sqlite.close();
    }
  };
  if (domain === "all" || domain === "sessions" || domain === "sessions-index" || domain === "conversation-artifacts") {
    clear("sessions.sqlite", ["conversation_fts", "conversation_messages", "conversation_sessions"]);
  }
  if (domain === "all" || domain === "audio" || domain === "conversation-artifacts") {
    clear("audio.sqlite", ["audio_fts", "audio_items", "voice_tts_runs", "voice_stt_runs"]);
  }
  if (domain === "all" || domain === "drive" || domain === "conversation-artifacts") {
    clear("drive.sqlite", ["drive_fts", "drive_items", "storage_objects", "storage_tokens", "storage_shares"]);
  }
  if (domain === "all" || domain === "search") {
    clear("search.sqlite", ["search_fts", "search_documents"]);
  }
  if (domain === "all" || domain === "runtime") {
    clear("runtime.sqlite", [
      "runtime_events",
      "runtime_jobs",
      "sandbox_runs",
      "code_gate_runs",
      "code_policies",
      "code_host_syncs",
      "code_queue",
      "code_reviews",
      "code_checks",
      "code_evidence",
      "code_reservations",
      "code_intents",
      "code_repositories",
      "code_agents",
      "code_projects",
      "delegation_graphs",
      "delegation_nodes",
      "dependency_edges",
      "agent_workers",
      "agent_runs",
      "delegation_events",
      "run_logs",
    ]);
  }
  if (domain === "all" || domain === "notify") {
    clear("notify.sqlite", [
      "operational_events",
      "admins",
      "source_apps",
      "source_app_tokens",
      "client_apps",
      "device_installations",
      "user_preferences",
      "subscriptions",
      "notifications",
      "deliveries",
      "delivery_attempts",
      "receipts",
      "glance_states",
    ]);
  }
  if (domain === "all" || domain === "monitor") {
    clear("monitor.sqlite", ["operational_events", "monitors", "heartbeats", "incidents", "instances"]);
  }
  if (domain === "all" || domain === "infra") {
    clear("infra.sqlite", ["operational_events"]);
  }
  if (domain === "all" || domain === "feed") {
    clear("feed.sqlite", ["operational_events", "admins", "sources", "items", "annotations", "collections", "collection_items", "scoped_tokens"]);
  }
  if (domain === "all" || domain === "ops") {
    clear("ops.sqlite", ["operational_events"]);
  }
}

function tableExists(sqlite: Database.Database, table: string): boolean {
  const row = sqlite.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?").get(table) as { name: string } | undefined;
  return !!row;
}

export function readMcpServers(configPath: string): Array<JsonRecord & { id: string }> {
  if (!fs.existsSync(configPath)) return [];
  assertCodexReadOnlyPath({ homeDir: os.homedir(), path: configPath, operation: "read" });
  const raw = fs.readFileSync(configPath, "utf8");
  const servers: Array<JsonRecord & { id: string }> = [];
  const lines = raw.split(/\r?\n/);
  let current: (JsonRecord & { id: string }) | null = null;
  let currentSubtable: string | null = null;
  for (const line of lines) {
    const section = line.match(/^\s*\[mcp_servers\.([^\]]+)\]\s*$/);
    if (section) {
      const [id, subtable] = section[1].split(".", 2);
      current = servers.find((server) => server.id === id) ?? null;
      if (!current) {
        current = { id, source: "codex-config" };
        servers.push(current);
      }
      currentSubtable = subtable ?? null;
      continue;
    }
    if (!current) continue;
    const kv = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*(.+?)\s*$/);
    if (!kv) continue;
    const key = kv[1];
    const value = kv[2].replace(/\s+#.*$/, "").trim();
    if (currentSubtable) {
      const nested = isRecord(current[currentSubtable]) ? current[currentSubtable] as JsonRecord : {};
      nested[key] = parseTomlScalar(value);
      current[currentSubtable] = nested;
    } else {
      current[key] = parseTomlScalar(value);
    }
  }
  return servers;
}

export function writeMcpServers(configPath: string, servers: Array<JsonRecord & { id: string }>): void {
  assertCodexReadOnlyPath({ homeDir: os.homedir(), path: configPath, operation: "write" });
  const raw = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf8") : "";
  const preserved = stripMcpServerBlocks(raw).trimEnd();
  const rendered = servers.map(renderMcpServer).filter(Boolean).join("\n\n");
  const body = [preserved, rendered].filter(Boolean).join("\n\n");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${body}${body ? "\n" : ""}`);
}

function stripMcpServerBlocks(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const kept: string[] = [];
  let skipping = false;
  for (const line of lines) {
    const header = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (header) {
      skipping = header[1] === "mcp_servers" || header[1].startsWith("mcp_servers.");
    }
    if (!skipping) kept.push(line);
  }
  return kept.join("\n");
}

function renderMcpServer(server: JsonRecord & { id: string }): string {
  const id = server.id;
  const root: string[] = [`[mcp_servers.${id}]`];
  if (typeof server.command === "string") root.push(`command = ${tomlString(server.command)}`);
  if (typeof server.url === "string") root.push(`url = ${tomlString(server.url)}`);
  if (Array.isArray(server.args)) root.push(`args = [${server.args.map((entry) => tomlString(String(entry))).join(", ")}]`);
  if (Array.isArray(server.env_passthrough)) root.push(`env_passthrough = [${server.env_passthrough.map((entry) => tomlString(String(entry))).join(", ")}]`);
  if (typeof server.cwd === "string") root.push(`cwd = ${tomlString(server.cwd)}`);
  if (typeof server.bearer_token_env_var === "string") root.push(`bearer_token_env_var = ${tomlString(server.bearer_token_env_var)}`);
  const enabled = typeof server.enabled === "boolean" ? server.enabled : (typeof server.disabled === "boolean" ? !server.disabled : true);
  if (!enabled) root.push("enabled = false");
  const env = isRecord(server.env) ? server.env : {};
  const envLines = Object.entries(env).map(([key, value]) => `${key} = ${tomlString(String(value))}`);
  if (envLines.length > 0) {
    root.push("", `[mcp_servers.${id}.env]`, ...envLines);
  }
  const headers = isRecord(server.headers) ? server.headers : {};
  const headerLines = Object.entries(headers).map(([key, value]) => `${key} = ${tomlString(String(value))}`);
  if (headerLines.length > 0) {
    root.push("", `[mcp_servers.${id}.headers]`, ...headerLines);
  }
  const headersFromEnv = isRecord(server.headers_from_env) ? server.headers_from_env : {};
  const headersFromEnvLines = Object.entries(headersFromEnv).map(([key, value]) => `${key} = ${tomlString(String(value))}`);
  if (headersFromEnvLines.length > 0) {
    root.push("", `[mcp_servers.${id}.headers_from_env]`, ...headersFromEnvLines);
  }
  return root.join("\n");
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function parseTomlScalar(value: string): unknown {
  if (value.startsWith("\"") && value.endsWith("\"")) return value.slice(1, -1);
  if (value.startsWith("[") && value.endsWith("]")) {
    return value.slice(1, -1).split(",").map((entry) => entry.trim().replace(/^"|"$/g, "")).filter(Boolean);
  }
  if (value === "true") return true;
  if (value === "false") return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
}

export function ensureSignalsVertical(sqlite: Database.Database, verticalId: string): void {
  const now = nowIso();
  sqlite.prepare(`
    INSERT OR IGNORE INTO signals_verticals (id, label, status, metadata_json, synced_at)
    VALUES (?, ?, 'dev_only', '{}', ?)
  `).run(verticalId, verticalId, now);
}

export function ensureSignalsVariable(sqlite: Database.Database, verticalId: string, variableId: string): void {
  const now = nowIso();
  sqlite.prepare(`
    INSERT OR IGNORE INTO signals_variables (id, vertical_id, label, value_type, definition_json, updated_at)
    VALUES (?, ?, ?, 'json', '{}', ?)
  `).run(variableId, verticalId, variableId, now);
}

export function upsertRegistry(sqlite: Database.Database, domain: string, kind: string, id: string, input: { sensitive?: boolean; metadata?: JsonRecord; path?: string | null; secretRef?: string | null }): void {
  const now = nowIso();
  sqlite.prepare(`
    INSERT INTO data_registry (domain, kind, id, sensitive, path, secret_ref, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(domain, kind, id) DO UPDATE SET sensitive = excluded.sensitive, path = excluded.path,
      secret_ref = excluded.secret_ref, metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
  `).run(domain, kind, id, input.sensitive ? 1 : 0, input.path ?? null, input.secretRef ?? null, JSON.stringify(input.metadata ?? {}), now, now);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function usage(binName: string, group: string): string {
  const registryEntry = resolveClawCliCommand(group);
  if (registryEntry) return [`Usage: ${binName} ${registryEntry.usage ?? `${group} [command] [options]`}`, "", `${registryEntry.kind}: ${registryEntry.summary}`, ...(registryEntry.target ? [`Routes to: ${registryEntry.target}`] : []), `Support: ${registryEntry.support.state} - ${registryEntry.support.reason}`, `Security: ${registryEntry.securityPolicy}`, "", `Run \`${binName} --help --all\` to see the full public surface.`].join("\n");
  switch (group) {
    case "data":
      return [
        `Usage: ${binName} data doctor|backup|restore|reset [--json]`,
        `  ${binName} data doctor --json`,
        `  ${binName} data backup --out DIR --json`,
        `  ${binName} data restore --from DIR --json`,
        `  ${binName} data reset --domain app-state|knowledge|notes|profile|signals|tasks|business|content|social|calendar|apps|agents|sessions|search|all --json`,
      ].join("\n");
    case "app-state":
      return `Usage: ${binName} app-state get [KEY]|set KEY --value JSON|snapshot [--json]`;
    case "knowledge":
      return `Usage: ${binName} knowledge entity|fact|list|search|promote [--json]`;
    case "notes":
      return `Usage: ${binName} notes create|list|get|update|delete|search|record-note|export|import|link [--json]`;
    case "wiki":
      return `Usage: ${binName} wiki create|list|get|update|delete|search|export|import|link [--json]`;
    case "profile":
      return `Usage: ${binName} profile get|refresh|list [--json]`;
    case "tasks":
    case "projects":
    case "goals":
    case "reminders":
    case "deadlines":
      return `Usage: ${binName} ${group} create|list|update|done|delete [--json]`;
    case "business":
      return `Usage: ${binName} business upsert|list|get|delete [--json]`;
    case "content":
      return `Usage: ${binName} content upsert|list|get|delete [--json]`;
    case "social":
      return `Usage: ${binName} social upsert|list|get|delete [--json]`;
    case "finance":
      return `Usage: ${binName} finance upsert|list|get|delete [--json]`;
    case "calendar":
      return `Usage: ${binName} calendar create|list|get|update|delete [--json]`;
    case "iot":
      return `Usage: ${binName} iot config set|list|get|delete [--json]`;
    case "marketplace":
      return `Usage: ${binName} marketplace choice upsert|list|get|delete [--json]`;
    case "ledger":
      return `Usage: ${binName} ledger entry upsert|list|get|delete | ledger line add|list|get|delete [--json]`;
    case "search":
      return `Usage: ${binName} search query|rebuild [--json]`;
    case "audio":
      return `Usage: ${binName} audio index|transcript|artifact list|get|delete [--json]`;
    case "drive":
      return `Usage: ${binName} drive index|attach|artifact list|get|delete [--json]`;
    case "runtime":
      return `Usage: ${binName} runtime queue|job list|get|delete|event|retention [--json]`;
    case "notify":
      return `Usage: ${binName} notify event|list|retention [--json]`;
    case "monitor":
      return `Usage: ${binName} monitor event|list|retention [--json]`;
    case "infra":
      return `Usage: ${binName} infra event|list|retention [--json]`;
    case "ops":
      return `Usage: ${binName} ops event|metric|list|retention [--json]`;
    case "mcp":
      return `Usage: ${binName} mcp list|get|upsert|delete|config-path [--json]`;
    case "apps":
      return `Usage: ${binName} apps list|upsert [--json]`;
    case "design":
      return `Usage: ${binName} design list|upsert [--json]`;
    case "agents": return `Usage: ${binName} agents list|get|upsert|delete|schema|evaluate-access|route-check|resolve-external-identity|project-support-inbox|memory-check|surface-projection [--json]`;
    case "skills": return `Usage: ${binName} skills get|upsert|delete [--json]`;
    case "personalities": return `Usage: ${binName} personalities list|get|upsert|delete [--json]`;
    case "skill-collections": return `Usage: ${binName} skill-collections list|get|upsert|delete [--json]`;
    case "connections": return `Usage: ${binName} connections list|get|upsert|delete [--json]`;
    case "providers": return `Usage: ${binName} providers routing list|set|delete FEATURE --capability CAP --provider PROVIDER [--model MODEL] [--account-ref REF] [--json]\n       ${binName} providers settings list|set PROVIDER --enabled true|false [--json]`;
    case "snippets": return `Usage: ${binName} snippets list|upsert|delete SLUG --title TITLE --body TEXT [--kind prompt|template|slash] [--json]`;
    case "sessions": return `Usage: ${binName} sessions index|list|get|search [--json]`;
    default:
      return `Usage: ${binName} data doctor [--json]`;
  }
}

export function writeSuccess(input: V1DataCliInput, payload: unknown): void {
  if (input.wantsJson) return writeCommandJsonOk(input.stdout, input.positionals[0] || "data", payload, v1JsonMeta(input));
  input.stdout.write(`${typeof payload === "string" ? payload : JSON.stringify(redactSecrets(payload), null, 2)}\n`);
}

export function writeUnredactedSuccess(input: V1DataCliInput, payload: unknown): void {
  if (input.wantsJson) return void input.stdout.write(`${JSON.stringify({ ok: true, data: payload, meta: v1JsonMeta(input) }, null, 2)}\n`);
  input.stdout.write(`${typeof payload === "string" ? payload : JSON.stringify(payload, null, 2)}\n`);
}

export function writeError(input: V1DataCliInput, code: string, message: string): void {
  if (input.wantsJson) writeCommandJsonError(input.stdout, input.positionals[0] || "data", { code, message }, v1JsonMeta(input));
  else input.stderr.write(`${message}\n`);
}

function v1JsonMeta(input: V1DataCliInput): Record<string, unknown> {
  const canonicalCommand = input.positionals[0] || "data";
  const command = resolveClawCliCommand(canonicalCommand);
  return { schemaVersion: command?.schemaVersion ?? 1, canonicalCommand, ...(command?.jsonSchemaId ? { jsonSchemaId: command.jsonSchemaId } : {}), invokedCommand: input.positionals[0] ?? null, subcommand: input.positionals[1] ?? null, operation: input.positionals[2] ?? null };
}

export function usageError(input: V1DataCliInput, message: string): number {
  writeError(input, "usage", message);
  return V1_DATA_EXIT_USAGE;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function parseMaybeJson(value: string | undefined): unknown {
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

export function normalizeDbRow(row: unknown): unknown {
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

export function stringValue(value: unknown, fallback: string | null): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function truthy(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true" || value === "yes";
}

export function expandHome(value: string): string {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function ftsPhrase(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function truncate(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3).trim()}...`;
}

export function guessContentType(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".aac": "audio/aac",
    ".aiff": "audio/aiff",
    ".flac": "audio/flac",
    ".m4a": "audio/mp4",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
    ".webm": "audio/webm",
    ".gif": "image/gif",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".json": "application/json",
    ".md": "text/markdown",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".txt": "text/plain",
    ".webp": "image/webp",
  };
  return map[ext] ?? null;
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
