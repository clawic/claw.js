import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";

import BetterSqlite3 from "better-sqlite3";
import type Database from "better-sqlite3";
import { DatabaseServiceStore } from "@clawjs/database";
import type { FieldDefinition, IndexDefinition } from "@clawjs/database";
import { redactSecrets } from "@clawjs/claw";
import { assertCodexReadOnlyPath } from "@clawjs/core";

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
const AGENT_DOMAIN_TABLES = ["agents", "skills", "skill_collections", "connections", "channel_accounts", "channel_routing", "channel_messages"];
const SESSION_DOMAIN_TABLES = ["session_index"];
const USER_MODEL_DOMAIN_TABLES = ["user_profile_items", "user_profile_meta", "user_profile_history"];
const TRACKING_RUNTIME_DOMAIN_TABLES = ["system_variables", "user_variables", "observations", "sessions", "healthkit_sync_state", "hidden_system_variables"];
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
const BADGER_SERVICE_TABLES = [
  "badger_workspace",
  "badger_user",
  "badger_workspace_member",
  "badger_workspace_invitation",
  "badger_api_token",
  "badger_audit_event",
  "badger_channel_family",
  "badger_channel_account",
  "badger_channel_account_health",
  "badger_post",
  "badger_post_account",
  "badger_post_variant",
  "badger_post_label",
  "badger_post_label_pivot",
  "badger_media",
  "badger_post_media_pivot",
  "badger_post_activity",
  "badger_queue",
  "badger_queue_slot",
  "badger_queue_account",
  "badger_queue_entry",
  "badger_blackout_window",
  "badger_recurrence",
  "badger_bulk_import_batch",
  "badger_campaign",
  "badger_template",
  "badger_hashtag_group",
  "badger_dynamic_variable",
  "badger_evergreen_pool",
  "badger_evergreen_pool_member",
  "badger_ab_variant_set",
  "badger_ab_variant_member",
  "badger_utm_template",
  "badger_tracked_link",
  "badger_link_shortener_provider",
  "badger_locale_variant_policy",
  "badger_audience_segment",
  "badger_account_metric_daily",
  "badger_post_metric",
  "badger_report",
  "badger_report_export",
  "badger_imported_post",
  "badger_inbox_thread",
  "badger_inbox_message",
  "badger_inbox_rule",
  "badger_approval_workflow",
  "badger_post_approval",
  "badger_post_approval_decision",
  "badger_external_reviewer_link",
  "badger_webhook",
  "badger_webhook_delivery",
  "badger_integration_service",
  "badger_ai_brand_voice",
  "badger_job",
  "badger_job_batch",
  "badger_setting",
  "badger_system_status",
  "badger_badger_migrations",
];
const CONTENT_DOMAIN_TABLES = ["content_items", ...CONTENT_SERVICE_TABLES];
const SOCIAL_DOMAIN_TABLES = ["social_posts", ...BADGER_SERVICE_TABLES];
const BUSINESS_DOMAIN_TABLES = ["business_records", ...CONTENT_DOMAIN_TABLES, ...SOCIAL_DOMAIN_TABLES, "finance_records", "accounting_entries", "accounting_lines", ...ERP_SERVICE_TABLES];
const CALENDAR_DOMAIN_TABLES = ["calendar_events"];
const IOT_DOMAIN_TABLES = ["iot_config"];
const MARKETPLACE_DOMAIN_TABLES = ["marketplace_choices"];
const MCP_DOMAIN_TABLES = ["mcp_servers", "mcp_tools"];

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
  const explicit = env.CLAWJS_MAIN_DATA_DIR || env.CLAWIX_CLAWJS_DATA_DIR || env.CLAW_HOME;
  if (explicit) return path.resolve(expandHome(explicit));
  if (process.platform === "win32") {
    return path.join(env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "Clawix", "clawjs");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Clawix", "clawjs");
  }
  return path.join(env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"), "Clawix", "clawjs");
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
    CREATE INDEX IF NOT EXISTS data_registry_domain_idx ON data_registry(domain, kind);

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
      page_id TEXT,
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
    CREATE INDEX IF NOT EXISTS knowledge_entities_type_idx ON knowledge_entities(type, label);

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
    CREATE INDEX IF NOT EXISTS knowledge_facts_subject_idx ON knowledge_facts(subject_id, predicate);
    CREATE INDEX IF NOT EXISTS knowledge_facts_predicate_idx ON knowledge_facts(predicate);

    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      space TEXT NOT NULL DEFAULT 'notes',
      surface TEXT NOT NULL DEFAULT 'note',
      owner_id TEXT,
      author_kind TEXT NOT NULL DEFAULT 'user',
      author_id TEXT,
      visibility TEXT NOT NULL DEFAULT 'private',
      sensitivity TEXT NOT NULL DEFAULT 'normal',
      tags_json TEXT NOT NULL DEFAULT '[]',
      properties_json TEXT NOT NULL DEFAULT '{}',
      source_record_domain TEXT,
      source_record_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    );
    CREATE INDEX IF NOT EXISTS pages_space_updated_idx ON pages(space, archived_at, updated_at DESC);
    CREATE INDEX IF NOT EXISTS pages_surface_idx ON pages(surface, updated_at DESC);
    CREATE INDEX IF NOT EXISTS pages_source_record_idx ON pages(source_record_domain, source_record_id);

    CREATE TABLE IF NOT EXISTS page_blocks (
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL,
      parent_block_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      kind TEXT NOT NULL DEFAULT 'paragraph',
      content_json TEXT NOT NULL DEFAULT '{}',
      text TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS page_blocks_page_order_idx ON page_blocks(page_id, sort_order, created_at);

    CREATE TABLE IF NOT EXISTS page_links (
      id TEXT PRIMARY KEY,
      source_page_id TEXT NOT NULL,
      target_page_id TEXT NOT NULL,
      relation TEXT NOT NULL DEFAULT 'related',
      created_at TEXT NOT NULL,
      UNIQUE (source_page_id, target_page_id, relation),
      FOREIGN KEY (source_page_id) REFERENCES pages(id) ON DELETE CASCADE,
      FOREIGN KEY (target_page_id) REFERENCES pages(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS page_links_target_idx ON page_links(target_page_id);

    CREATE TABLE IF NOT EXISTS page_mentions (
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL,
      block_id TEXT,
      target_kind TEXT NOT NULL,
      target_id TEXT NOT NULL,
      label TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS page_mentions_target_idx ON page_mentions(target_kind, target_id);

    CREATE TABLE IF NOT EXISTS page_revisions (
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL,
      revision_number INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      author_kind TEXT NOT NULL DEFAULT 'system',
      author_id TEXT,
      UNIQUE (page_id, revision_number),
      FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS page_comments (
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL,
      block_id TEXT,
      parent_comment_id TEXT,
      body TEXT NOT NULL,
      author_kind TEXT NOT NULL DEFAULT 'user',
      author_id TEXT,
      upvotes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS page_comments_page_idx ON page_comments(page_id, created_at);

    CREATE TABLE IF NOT EXISTS profile_projection (
      id TEXT PRIMARY KEY,
      section TEXT NOT NULL,
      content_text TEXT NOT NULL,
      source_fact_ids_json TEXT NOT NULL DEFAULT '[]',
      confidence REAL,
      scope_json TEXT NOT NULL DEFAULT '{}',
      refreshed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS profile_projection_section_idx ON profile_projection(section);

    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      page_id UNINDEXED,
      title,
      body,
      tags,
      tokenize='unicode61'
    );

    CREATE TABLE IF NOT EXISTS productivity_items (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      due_at TEXT,
      anchor_type TEXT,
      anchor_id TEXT,
      page_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS productivity_items_kind_status_idx ON productivity_items(kind, status, due_at);

    CREATE TABLE IF NOT EXISTS business_records (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      page_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS business_records_kind_idx ON business_records(kind, status, name);

    CREATE TABLE IF NOT EXISTS content_items (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'entry',
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      brand_id TEXT,
      campaign_id TEXT,
      page_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS content_items_status_idx ON content_items(status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS social_posts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      channel_json TEXT NOT NULL DEFAULT '{}',
      scheduled_at TEXT,
      published_at TEXT,
      page_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS social_posts_status_idx ON social_posts(status, scheduled_at, updated_at DESC);

    CREATE TABLE IF NOT EXISTS accounting_entries (
      id TEXT PRIMARY KEY,
      entity_id TEXT,
      period_id TEXT,
      entry_date TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      page_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS accounting_lines (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL,
      account_code TEXT NOT NULL,
      side TEXT NOT NULL CHECK (side IN ('debit','credit')),
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (entry_id) REFERENCES accounting_entries(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT,
      calendar_id TEXT,
      source TEXT NOT NULL DEFAULT 'clawjs',
      external_id TEXT,
      page_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS calendar_events_time_idx ON calendar_events(starts_at, ends_at);

    CREATE TABLE IF NOT EXISTS iot_config (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      parent_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      config_json TEXT NOT NULL DEFAULT '{}',
      secret_ref TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS finance_records (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'transaction',
      account_id TEXT,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      occurred_at TEXT NOT NULL,
      merchant TEXT,
      category TEXT,
      page_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS finance_records_time_idx ON finance_records(occurred_at DESC, kind);

    CREATE TABLE IF NOT EXISTS marketplace_choices (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      target TEXT NOT NULL,
      choice TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      rationale TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS marketplace_choices_kind_target_idx ON marketplace_choices(kind, target);
    CREATE INDEX IF NOT EXISTS iot_config_kind_idx ON iot_config(kind, parent_id);

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
      secret_ref TEXT,
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
      secret_refs_json TEXT NOT NULL DEFAULT '[]',
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
  ensureColumn(sqlite, "life_observations", "page_id", "TEXT");
  ensureColumn(sqlite, "agents", "secret_ref", "TEXT");
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
  if (group === "sessions" && (command === "list" || command === "search") && input.flags.workspace) {
    return null;
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
      case "knowledge":
        return runKnowledgeCommand(input, store);
      case "notes":
        return runNotesCommand(input, store);
      case "wiki":
        return runWikiCommand(input, store);
      case "profile":
        return runProfileCommand(input, store);
      case "tasks":
      case "projects":
      case "goals":
      case "reminders":
      case "deadlines":
        return runProductivityCommand(input, store, group);
      case "business":
        return runBusinessCommand(input, store);
      case "content":
        return runContentCommand(input, store);
      case "social":
        return runSocialCommand(input, store);
      case "finance":
        return runFinanceCommand(input, store);
      case "calendar":
        return runCalendarCommand(input, store);
      case "iot":
        return runIotConfigCommand(input, store);
      case "marketplace":
        return runMarketplaceCommand(input, store);
      case "ledger":
        return runLedgerCommand(input, store);
      case "search":
        return runSearchCommand(input, store);
      case "audio":
        return runAudioSidecarCommand(input, store);
      case "drive":
        return runDriveSidecarCommand(input, store);
      case "runtime":
        return runRuntimeSidecarCommand(input, store);
      case "notify":
        return runOperationalSidecarCommand(input, store, "notify.sqlite", "notify");
      case "monitor":
        return runOperationalSidecarCommand(input, store, "monitor.sqlite", "monitor");
      case "infra":
        return runOperationalSidecarCommand(input, store, "infra.sqlite", "infra");
      case "feed":
        return runOperationalSidecarCommand(input, store, "feed.sqlite", "feed");
      case "ops":
        return runOperationalSidecarCommand(input, store, "ops.sqlite", "ops");
      case "mcp":
        return runMcpCommand(input);
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
    "app-state": new Set(["get", "set", "snapshot", "project", "pin", "title", "archive", "sidebar", "terminal", "help"]),
    life: new Set(["catalog", "seed-catalog", "observe", "list", "delete", "help"]),
    knowledge: new Set(["entity", "fact", "list", "search", "promote", "help"]),
    notes: new Set(["create", "list", "get", "update", "delete", "search", "export", "import", "link", "record-note", "help"]),
    wiki: new Set(["create", "list", "get", "update", "delete", "search", "export", "import", "link", "help"]),
    profile: new Set(["get", "refresh", "list", "help"]),
    business: new Set(["upsert", "list", "get", "delete", "help"]),
    content: new Set(["upsert", "list", "get", "delete", "help"]),
    social: new Set(["upsert", "list", "get", "delete", "help"]),
    finance: new Set(["upsert", "list", "get", "delete", "help"]),
    iot: new Set(["config", "help"]),
    marketplace: new Set(["choice", "choices", "help"]),
    ledger: new Set(["entry", "line", "list", "get", "delete", "help"]),
    search: new Set(["query", "rebuild", "help"]),
    audio: new Set(["index", "artifact", "transcript", "help"]),
    drive: new Set(["index", "artifact", "attach", "help"]),
    runtime: new Set(["queue", "job", "event", "retention", "help"]),
    notify: new Set(["event", "list", "retention", "help"]),
    monitor: new Set(["event", "list", "retention", "help"]),
    infra: new Set(["event", "list", "retention", "help"]),
    ops: new Set(["event", "metric", "list", "retention", "help"]),
    mcp: new Set(["list", "get", "upsert", "delete", "config-path", "help"]),
    apps: new Set(["list", "upsert", "help"]),
    design: new Set(["list", "upsert", "help"]),
    agents: new Set(["list", "upsert", "help"]),
    skills: new Set(["upsert", "help"]),
    connections: new Set(["list", "upsert", "help"]),
    sessions: new Set(["index", "list", "get", "search", "help"]),
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
    if (!domain) return usageError(input, "Usage: claw data reset --domain app-state|knowledge|notes|profile|life|business|content|social|marketplace|iot|sessions|audio|drive|search|runtime|notify|monitor|infra|ops|all");
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
      projects: store.sqlite.prepare("SELECT * FROM app_projects ORDER BY COALESCE(sort_order, 999999), name").all().map(normalizeDbRow),
      pinnedThreads: store.sqlite.prepare("SELECT * FROM app_pinned_threads ORDER BY sort_order").all().map(normalizeDbRow),
      titles: store.sqlite.prepare("SELECT * FROM app_session_titles ORDER BY updated_at DESC").all().map(normalizeDbRow),
      archives: store.sqlite.prepare("SELECT * FROM app_archives ORDER BY archived_at DESC").all().map(normalizeDbRow),
      sidebar: store.sqlite.prepare("SELECT * FROM app_sidebar_snapshots ORDER BY pinned DESC, updated_at DESC LIMIT ?").all(Number(input.flags.limit ?? 200)).map(normalizeDbRow),
      terminalTabs: store.sqlite.prepare("SELECT * FROM app_terminal_tabs ORDER BY sort_order, updated_at DESC").all().map(normalizeDbRow),
    };
    writeSuccess(input, payload);
    return V1_DATA_EXIT_OK;
  }
  if (command === "project") {
    const action = input.positionals[2] || "list";
    if (action === "list") {
      const rows = store.sqlite.prepare("SELECT * FROM app_projects ORDER BY COALESCE(sort_order, 999999), name").all();
      writeSuccess(input, { items: rows.map(normalizeDbRow) });
      return V1_DATA_EXIT_OK;
    }
    if (action === "order") {
      const ids = parseCsvOrJson(input.flags.ids || input.positionals.slice(3).join(",")) ?? [];
      const now = nowIso();
      const tx = store.sqlite.transaction(() => {
        ids.forEach((id, index) => {
          store.sqlite.prepare(`
            UPDATE app_projects
            SET sort_order = ?, updated_at = ?
            WHERE id = ?
          `).run((index + 1) * 1000, now, id);
        });
      });
      tx();
      writeSuccess(input, { items: ids });
      return V1_DATA_EXIT_OK;
    }
    const id = input.flags.id || input.positionals[3];
    if (!id) return usageError(input, "Usage: claw app-state project upsert|delete|order ID [--json]");
    if (action === "delete") {
      const changes = store.sqlite.prepare("DELETE FROM app_projects WHERE id = ?").run(id).changes;
      writeSuccess(input, { id, deleted: changes > 0 });
      return V1_DATA_EXIT_OK;
    }
    if (action === "upsert" || action === "set") {
      const now = nowIso();
      const name = input.flags.name || id;
      const projectPath = input.flags.path || "";
      const sortOrder = input.flags["sort-order"] !== undefined ? Number(input.flags["sort-order"]) : null;
      store.sqlite.prepare(`
        INSERT INTO app_projects (id, name, path, sort_order, hidden, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, path = excluded.path,
          sort_order = COALESCE(excluded.sort_order, app_projects.sort_order),
          hidden = excluded.hidden, metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
      `).run(id, name, projectPath, sortOrder, truthy(input.flags.hidden) ? 1 : 0, input.flags.metadata || "{}", now, now);
      writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM app_projects WHERE id = ?").get(id) as JsonRecord));
      return V1_DATA_EXIT_OK;
    }
  }
  if (command === "pin") {
    const action = input.positionals[2] || "list";
    if (action === "list") {
      const rows = store.sqlite.prepare("SELECT * FROM app_pinned_threads ORDER BY sort_order").all();
      writeSuccess(input, { items: rows.map(normalizeDbRow) });
      return V1_DATA_EXIT_OK;
    }
    const threadId = input.flags.id || input.flags["thread-id"] || input.positionals[3];
    if (!threadId) return usageError(input, "Usage: claw app-state pin upsert|delete THREAD_ID [--json]");
    if (action === "delete" || action === "unset") {
      const changes = store.sqlite.prepare("DELETE FROM app_pinned_threads WHERE thread_id = ?").run(threadId).changes;
      writeSuccess(input, { threadId, deleted: changes > 0 });
      return V1_DATA_EXIT_OK;
    }
    if (action === "upsert" || action === "set") {
      const now = nowIso();
      const sortOrder = input.flags["sort-order"] !== undefined
        ? Number(input.flags["sort-order"])
        : ((store.sqlite.prepare("SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM app_pinned_threads").get() as { max_order: number }).max_order + 1000);
      store.sqlite.prepare(`
        INSERT INTO app_pinned_threads (thread_id, sort_order, pinned_at)
        VALUES (?, ?, ?)
        ON CONFLICT(thread_id) DO UPDATE SET sort_order = excluded.sort_order, pinned_at = excluded.pinned_at
      `).run(threadId, sortOrder, now);
      writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM app_pinned_threads WHERE thread_id = ?").get(threadId) as JsonRecord));
      return V1_DATA_EXIT_OK;
    }
    if (action === "order") {
      const ids = parseCsvOrJson(input.flags.ids || input.positionals.slice(3).join(",")) ?? [];
      const now = nowIso();
      const tx = store.sqlite.transaction(() => {
        store.sqlite.prepare("DELETE FROM app_pinned_threads").run();
        ids.forEach((id, index) => {
          store.sqlite.prepare("INSERT INTO app_pinned_threads (thread_id, sort_order, pinned_at) VALUES (?, ?, ?)").run(id, (index + 1) * 1000, now);
        });
      });
      tx();
      writeSuccess(input, { items: ids });
      return V1_DATA_EXIT_OK;
    }
  }
  if (command === "title") {
    const action = input.positionals[2] || "list";
    if (action === "list") {
      const rows = store.sqlite.prepare("SELECT * FROM app_session_titles ORDER BY updated_at DESC").all();
      writeSuccess(input, { items: rows.map(normalizeDbRow) });
      return V1_DATA_EXIT_OK;
    }
    const threadId = input.flags.id || input.flags["thread-id"] || input.positionals[3];
    if (!threadId) return usageError(input, "Usage: claw app-state title upsert|delete THREAD_ID --title TEXT [--json]");
    if (action === "delete") {
      const changes = store.sqlite.prepare("DELETE FROM app_session_titles WHERE thread_id = ?").run(threadId).changes;
      writeSuccess(input, { threadId, deleted: changes > 0 });
      return V1_DATA_EXIT_OK;
    }
    if (action === "upsert" || action === "set") {
      const title = input.flags.title || input.positionals.slice(4).join(" ");
      if (!title.trim()) return usageError(input, "Usage: claw app-state title upsert THREAD_ID --title TEXT [--json]");
      const now = nowIso();
      store.sqlite.prepare(`
        INSERT INTO app_session_titles (thread_id, title, source, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(thread_id) DO UPDATE SET title = excluded.title, source = excluded.source, updated_at = excluded.updated_at
      `).run(threadId, title.trim(), input.flags.source || "manual", now);
      writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM app_session_titles WHERE thread_id = ?").get(threadId) as JsonRecord));
      return V1_DATA_EXIT_OK;
    }
  }
  if (command === "archive") {
    const action = input.positionals[2] || "list";
    if (action === "list") {
      const rows = store.sqlite.prepare("SELECT * FROM app_archives ORDER BY archived_at DESC").all();
      writeSuccess(input, { items: rows.map(normalizeDbRow) });
      return V1_DATA_EXIT_OK;
    }
    const threadId = input.flags.id || input.flags["thread-id"] || input.positionals[3];
    if (!threadId) return usageError(input, "Usage: claw app-state archive set|delete THREAD_ID [--json]");
    if (action === "delete" || action === "unset") {
      const changes = store.sqlite.prepare("DELETE FROM app_archives WHERE thread_id = ?").run(threadId).changes;
      writeSuccess(input, { threadId, deleted: changes > 0 });
      return V1_DATA_EXIT_OK;
    }
    if (action === "upsert" || action === "set") {
      const now = nowIso();
      store.sqlite.prepare(`
        INSERT INTO app_archives (thread_id, archived_at)
        VALUES (?, ?)
        ON CONFLICT(thread_id) DO UPDATE SET archived_at = excluded.archived_at
      `).run(threadId, now);
      writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM app_archives WHERE thread_id = ?").get(threadId) as JsonRecord));
      return V1_DATA_EXIT_OK;
    }
  }
  if (command === "sidebar") {
    const action = input.positionals[2] || "list";
    if (action === "list") {
      const rows = store.sqlite.prepare("SELECT * FROM app_sidebar_snapshots ORDER BY pinned DESC, updated_at DESC LIMIT ?").all(Number(input.flags.limit ?? 200));
      writeSuccess(input, { items: rows.map(normalizeDbRow) });
      return V1_DATA_EXIT_OK;
    }
    if (action === "replace") {
      const rawItems = input.flags.items || "[]";
      const items = JSON.parse(rawItems) as Array<Record<string, unknown>>;
      const now = nowIso();
      const tx = store.sqlite.transaction(() => {
        store.sqlite.prepare("DELETE FROM app_sidebar_snapshots").run();
        for (const item of items) {
          const threadId = String(item.threadId || "");
          if (!threadId) continue;
          store.sqlite.prepare(`
            INSERT INTO app_sidebar_snapshots (thread_id, chat_uuid, title, cwd, project_path, updated_at, archived, pinned, captured_at, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            threadId,
            String(item.chatUuid || ""),
            String(item.title || threadId),
            typeof item.cwd === "string" && item.cwd ? item.cwd : null,
            typeof item.projectPath === "string" && item.projectPath ? item.projectPath : null,
            typeof item.updatedAt === "string" ? item.updatedAt : now,
            truthy(item.archived) ? 1 : 0,
            truthy(item.pinned) ? 1 : 0,
            now,
            typeof item.metadata === "string" ? item.metadata : JSON.stringify(item.metadata || {}),
          );
        }
      });
      tx();
      writeSuccess(input, { count: items.length });
      return V1_DATA_EXIT_OK;
    }
    const threadId = input.flags.id || input.flags["thread-id"] || input.positionals[3];
    if (!threadId) return usageError(input, "Usage: claw app-state sidebar upsert|delete|replace THREAD_ID [--json]");
    if (action === "delete") {
      const changes = store.sqlite.prepare("DELETE FROM app_sidebar_snapshots WHERE thread_id = ?").run(threadId).changes;
      writeSuccess(input, { threadId, deleted: changes > 0 });
      return V1_DATA_EXIT_OK;
    }
    if (action === "upsert" || action === "set") {
      const now = nowIso();
      store.sqlite.prepare(`
        INSERT INTO app_sidebar_snapshots (thread_id, chat_uuid, title, cwd, project_path, updated_at, archived, pinned, captured_at, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(thread_id) DO UPDATE SET chat_uuid = excluded.chat_uuid, title = excluded.title,
          cwd = excluded.cwd, project_path = excluded.project_path, updated_at = excluded.updated_at,
          archived = excluded.archived, pinned = excluded.pinned, captured_at = excluded.captured_at,
          metadata_json = excluded.metadata_json
      `).run(
        threadId,
        input.flags["chat-uuid"] || null,
        input.flags.title || threadId,
        input.flags.cwd || null,
        input.flags["project-path"] || null,
        input.flags["updated-at"] || now,
        truthy(input.flags.archived) ? 1 : 0,
        truthy(input.flags.pinned) ? 1 : 0,
        now,
        input.flags.metadata || "{}",
      );
      writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM app_sidebar_snapshots WHERE thread_id = ?").get(threadId) as JsonRecord));
      return V1_DATA_EXIT_OK;
    }
  }
  if (command === "terminal") {
    const action = input.positionals[2] || "list";
    if (action === "list") {
      const rows = store.sqlite.prepare("SELECT * FROM app_terminal_tabs ORDER BY sort_order, updated_at DESC").all();
      writeSuccess(input, { items: rows.map(normalizeDbRow) });
      return V1_DATA_EXIT_OK;
    }
    const id = input.flags.id || input.positionals[3];
    if (!id) return usageError(input, "Usage: claw app-state terminal upsert|delete ID [--json]");
    if (action === "delete") {
      const changes = store.sqlite.prepare("DELETE FROM app_terminal_tabs WHERE id = ?").run(id).changes;
      writeSuccess(input, { id, deleted: changes > 0 });
      return V1_DATA_EXIT_OK;
    }
    if (action === "upsert" || action === "set") {
      const now = nowIso();
      store.sqlite.prepare(`
        INSERT INTO app_terminal_tabs (id, title, cwd, sort_order, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET title = excluded.title, cwd = excluded.cwd,
          sort_order = excluded.sort_order, metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
      `).run(id, input.flags.title || id, input.flags.cwd || null, Number(input.flags["sort-order"] ?? 0), input.flags.metadata || "{}", now, now);
      writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM app_terminal_tabs WHERE id = ?").get(id) as JsonRecord));
      return V1_DATA_EXIT_OK;
    }
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
    const pageId = input.flags.notes
      ? upsertPageWithBlocks(store.sqlite, {
          id: input.flags["page-id"] || `page-life-${id}`,
          title: input.flags.title || `${variableId} notes`,
          surface: "record_note",
          space: "life",
          sourceRecordDomain: "life_observations",
          sourceRecordId: id,
          sensitivity: variable?.sensitive ? "sensitive" : "normal",
          text: input.flags.notes,
          authorKind: input.flags["author-kind"] || "user",
          authorId: input.flags["author-id"] || null,
        }).id
      : input.flags["page-id"] || null;
    store.sqlite.prepare(`
      INSERT INTO life_observations (id, vertical_id, variable_id, value_json, unit_id, recorded_at, source_json, notes, page_id, session_id, external_id, sensitive, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET value_json = excluded.value_json, unit_id = excluded.unit_id,
        recorded_at = excluded.recorded_at, source_json = excluded.source_json, notes = excluded.notes,
        page_id = excluded.page_id,
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
      null,
      pageId,
      input.flags["session-id"] || null,
      input.flags["external-id"] || null,
      variable?.sensitive ?? 0,
      now,
      now,
    );
    writeSuccess(input, { id, verticalId, variableId, value, pageId, recordedAt: input.flags.at || input.flags["recorded-at"] || now });
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

function runKnowledgeCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "entity") {
    const id = input.flags.id || input.positionals[2] || `ent-${randomUUID()}`;
    const type = input.flags.type || "entity";
    const label = input.flags.label || input.flags.name || input.positionals.slice(3).join(" ") || id;
    const now = nowIso();
    store.sqlite.prepare(`
      INSERT INTO knowledge_entities (id, type, label, description, properties_json, sensitivity, source, provenance_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET type = excluded.type, label = excluded.label, description = excluded.description,
        properties_json = excluded.properties_json, sensitivity = excluded.sensitivity, source = excluded.source,
        provenance_json = excluded.provenance_json, updated_at = excluded.updated_at
    `).run(
      id,
      type,
      label,
      input.flags.description || null,
      input.flags.properties ? JSON.stringify(parseMaybeJson(input.flags.properties)) : "{}",
      input.flags.sensitivity || "normal",
      input.flags.source || "manual",
      input.flags.provenance ? JSON.stringify(parseMaybeJson(input.flags.provenance)) : "{}",
      now,
      now,
    );
    writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM knowledge_entities WHERE id = ?").get(id) as JsonRecord));
    return V1_DATA_EXIT_OK;
  }
  if (command === "fact" || command === "promote") {
    const id = input.flags.id || `fact-${randomUUID()}`;
    const predicate = input.flags.predicate || input.flags.key || input.positionals[2];
    if (!predicate) return usageError(input, "Usage: claw knowledge fact --predicate KEY --value JSON|TEXT [--subject ID]");
    const objectValue = input.flags.json ? JSON.parse(input.flags.json) : parseMaybeJson(input.flags.value ?? input.positionals.slice(3).join(" "));
    const now = nowIso();
    store.sqlite.prepare(`
      INSERT INTO knowledge_facts (id, subject_id, predicate, object_kind, object_value_json, confidence, scope_json, sensitivity, source, provenance_json, supersedes_id, valid_from, valid_to, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET subject_id = excluded.subject_id, predicate = excluded.predicate,
        object_kind = excluded.object_kind, object_value_json = excluded.object_value_json, confidence = excluded.confidence,
        scope_json = excluded.scope_json, sensitivity = excluded.sensitivity, source = excluded.source,
        provenance_json = excluded.provenance_json, supersedes_id = excluded.supersedes_id,
        valid_from = excluded.valid_from, valid_to = excluded.valid_to, updated_at = excluded.updated_at
    `).run(
      id,
      input.flags.subject || input.flags["subject-id"] || "user:me",
      predicate,
      input.flags["object-kind"] || "literal",
      JSON.stringify(objectValue),
      input.flags.confidence ? Number(input.flags.confidence) : null,
      input.flags.scope ? JSON.stringify(parseMaybeJson(input.flags.scope)) : "{}",
      input.flags.sensitivity || "normal",
      input.flags.source || (command === "promote" ? "promotion" : "manual"),
      input.flags.provenance ? JSON.stringify(parseMaybeJson(input.flags.provenance)) : "{}",
      input.flags.supersedes || null,
      input.flags["valid-from"] || null,
      input.flags["valid-to"] || null,
      now,
      now,
    );
    writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM knowledge_facts WHERE id = ?").get(id) as JsonRecord));
    return V1_DATA_EXIT_OK;
  }
  if (command === "list") {
    const kind = input.flags.kind || "facts";
    const limit = Math.max(1, Number(input.flags.limit ?? 100));
    const rows = kind === "entities"
      ? store.sqlite.prepare("SELECT * FROM knowledge_entities ORDER BY updated_at DESC LIMIT ?").all(limit)
      : store.sqlite.prepare("SELECT * FROM knowledge_facts ORDER BY updated_at DESC LIMIT ?").all(limit);
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  if (command === "search") {
    const query = input.flags.query || input.flags.q || input.positionals.slice(2).join(" ");
    if (!query) return usageError(input, "Usage: claw knowledge search QUERY [--json]");
    const like = `%${query}%`;
    const entities = store.sqlite.prepare("SELECT * FROM knowledge_entities WHERE label LIKE ? OR description LIKE ? ORDER BY updated_at DESC LIMIT 25").all(like, like).map(normalizeDbRow);
    const facts = store.sqlite.prepare("SELECT * FROM knowledge_facts WHERE predicate LIKE ? OR object_value_json LIKE ? ORDER BY updated_at DESC LIMIT 25").all(like, like).map(normalizeDbRow);
    writeSuccess(input, { entities, facts });
    return V1_DATA_EXIT_OK;
  }
  return usageError(input, usage(input.binName, "knowledge"));
}

function runNotesCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "create" || command === "record-note") {
    const title = input.flags.title || input.positionals[2] || "Untitled";
    const text = input.flags.body || input.flags.text || input.flags.content || input.positionals.slice(3).join(" ");
    const result = upsertPageWithBlocks(store.sqlite, {
      id: input.flags.id,
      title,
      text,
      space: input.flags.space || (command === "record-note" ? "records" : "notes"),
      surface: input.flags.surface || (command === "record-note" ? "record_note" : "note"),
      visibility: input.flags.visibility || "private",
      sensitivity: input.flags.sensitivity || "normal",
      tags: parseCsvOrJson(input.flags.tags),
      sourceRecordDomain: input.flags["record-domain"] || null,
      sourceRecordId: input.flags["record-id"] || null,
      authorKind: input.flags["author-kind"] || "user",
      authorId: input.flags["author-id"] || null,
      properties: input.flags.properties ? parseMaybeJson(input.flags.properties) as JsonRecord : {},
    });
    writeSuccess(input, result);
    return V1_DATA_EXIT_OK;
  }
  if (command === "list") {
    const limit = Math.max(1, Number(input.flags.limit ?? 100));
    const space = input.flags.space;
    const surface = input.flags.surface;
    const rows = space
      ? store.sqlite.prepare("SELECT * FROM pages WHERE space = ? AND archived_at IS NULL ORDER BY updated_at DESC LIMIT ?").all(space, limit)
      : surface
        ? store.sqlite.prepare("SELECT * FROM pages WHERE surface = ? AND archived_at IS NULL ORDER BY updated_at DESC LIMIT ?").all(surface, limit)
        : store.sqlite.prepare("SELECT * FROM pages WHERE archived_at IS NULL ORDER BY updated_at DESC LIMIT ?").all(limit);
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  if (command === "get" || command === "export") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, "Usage: claw notes get PAGE_ID [--format markdown] [--json]");
    const page = readPage(store.sqlite, id);
    if (!page) {
      writeSuccess(input, null);
      return V1_DATA_EXIT_FAILURE;
    }
    const format = input.flags.format || (command === "export" ? "markdown" : "json");
    writeSuccess(input, format === "markdown" ? { id, markdown: pageToMarkdown(page) } : page);
    return V1_DATA_EXIT_OK;
  }
  if (command === "search") {
    const query = input.flags.query || input.flags.q || input.positionals.slice(2).join(" ");
    if (!query) return usageError(input, "Usage: claw notes search QUERY [--json]");
    rebuildNotesFts(store.sqlite);
    const limit = Math.max(1, Number(input.flags.limit ?? 25));
    const space = input.flags.space;
    const surface = input.flags.surface;
    const rows = space
      ? store.sqlite.prepare(`
          SELECT pages.*
          FROM notes_fts
          JOIN pages ON pages.id = notes_fts.page_id
          WHERE notes_fts MATCH ? AND pages.archived_at IS NULL AND pages.space = ?
          ORDER BY rank
          LIMIT ?
        `).all(ftsPhrase(query), space, limit)
      : surface
        ? store.sqlite.prepare(`
            SELECT pages.*
            FROM notes_fts
            JOIN pages ON pages.id = notes_fts.page_id
            WHERE notes_fts MATCH ? AND pages.archived_at IS NULL AND pages.surface = ?
            ORDER BY rank
            LIMIT ?
          `).all(ftsPhrase(query), surface, limit)
        : store.sqlite.prepare(`
            SELECT pages.*
            FROM notes_fts
            JOIN pages ON pages.id = notes_fts.page_id
            WHERE notes_fts MATCH ? AND pages.archived_at IS NULL
            ORDER BY rank
            LIMIT ?
          `).all(ftsPhrase(query), limit);
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  if (command === "update" || command === "import") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, "Usage: claw notes update PAGE_ID --body TEXT|--from FILE");
    const rawText = input.flags.from ? fs.readFileSync(path.resolve(input.cwd, expandHome(input.flags.from)), "utf8") : (input.flags.body || input.flags.text || input.flags.content || input.positionals.slice(3).join(" "));
    const parsed = markdownToPagePatch(rawText);
    const existing = readPage(store.sqlite, id);
    const result = upsertPageWithBlocks(store.sqlite, {
      id,
      title: input.flags.title || parsed.title || existing?.title || "Untitled",
      text: parsed.body,
      space: input.flags.space || existing?.space || "notes",
      surface: input.flags.surface || existing?.surface || "note",
      visibility: input.flags.visibility || existing?.visibility || "private",
      sensitivity: input.flags.sensitivity || existing?.sensitivity || "normal",
      tags: parseCsvOrJson(input.flags.tags) ?? existing?.tags ?? [],
      authorKind: input.flags["author-kind"] || "user",
      authorId: input.flags["author-id"] || null,
      sourceRecordDomain: existing?.sourceRecordDomain ?? null,
      sourceRecordId: existing?.sourceRecordId ?? null,
      properties: existing?.properties ?? {},
    });
    writeSuccess(input, result);
    return V1_DATA_EXIT_OK;
  }
  if (command === "link") {
    const source = input.flags.source || input.positionals[2];
    const target = input.flags.target || input.positionals[3];
    if (!source || !target) return usageError(input, "Usage: claw notes link SOURCE_PAGE TARGET_PAGE");
    const now = nowIso();
    const id = input.flags.id || `link-${randomUUID()}`;
    store.sqlite.prepare(`
      INSERT OR IGNORE INTO page_links (id, source_page_id, target_page_id, relation, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, source, target, input.flags.relation || "related", now);
    writeSuccess(input, { id, sourcePageId: source, targetPageId: target, relation: input.flags.relation || "related" });
    return V1_DATA_EXIT_OK;
  }
  if (command === "delete") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, "Usage: claw notes delete PAGE_ID");
    const now = nowIso();
    const changes = store.sqlite.prepare("UPDATE pages SET archived_at = ?, updated_at = ? WHERE id = ?").run(now, now, id).changes;
    writeSuccess(input, { deleted: changes > 0, id });
    return changes > 0 ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  return usageError(input, usage(input.binName, "notes"));
}

function runWikiCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const notesInput: V1DataCliInput = {
    ...input,
    positionals: ["notes", ...input.positionals.slice(1)],
    flags: {
      space: "wiki",
      surface: "wiki_page",
      ...input.flags,
    },
  };
  return runNotesCommand(notesInput, store);
}

function runProfileCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "refresh") {
    const result = refreshProfileProjection(store.sqlite);
    writeSuccess(input, result);
    return V1_DATA_EXIT_OK;
  }
  if (command === "get" || command === "list") {
    if (command === "get") refreshProfileProjection(store.sqlite);
    const section = input.flags.section || input.positionals[2];
    const rows = section
      ? store.sqlite.prepare("SELECT * FROM profile_projection WHERE section = ? ORDER BY refreshed_at DESC").all(section)
      : store.sqlite.prepare("SELECT * FROM profile_projection ORDER BY section, refreshed_at DESC").all();
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  return usageError(input, usage(input.binName, "profile"));
}

function runProductivityCommand(input: V1DataCliInput, store: DatabaseServiceStore, group: string): number {
  const command = input.positionals[1];
  const kind = group.endsWith("s") ? group.slice(0, -1) : group;
  if (command === "create") {
    const title = input.flags.title || input.positionals.slice(2).join(" ");
    if (!title) return usageError(input, `Usage: claw ${group} create TITLE [--json]`);
    const now = nowIso();
    const id = input.flags.id || `${kind}-${randomUUID()}`;
    const pageId = input.flags.notes || input.flags.body
      ? upsertPageWithBlocks(store.sqlite, {
          id: input.flags["page-id"] || `page-${id}`,
          title: `${title} notes`,
          text: input.flags.notes || input.flags.body || "",
          space: "tasks",
          surface: "record_note",
          sourceRecordDomain: "productivity_items",
          sourceRecordId: id,
        }).id
      : input.flags["page-id"] || null;
    store.sqlite.prepare(`
      INSERT INTO productivity_items (id, kind, title, status, due_at, anchor_type, anchor_id, page_id, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, title = excluded.title, status = excluded.status,
        due_at = excluded.due_at, anchor_type = excluded.anchor_type, anchor_id = excluded.anchor_id,
        page_id = excluded.page_id, metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
    `).run(id, kind, title, input.flags.status || "active", input.flags.due || input.flags["due-at"] || null, input.flags["anchor-type"] || null, input.flags["anchor-id"] || null, pageId, input.flags.metadata ? JSON.stringify(parseMaybeJson(input.flags.metadata)) : "{}", now, now);
    writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM productivity_items WHERE id = ?").get(id) as JsonRecord));
    return V1_DATA_EXIT_OK;
  }
  if (command === "list") {
    const rows = store.sqlite.prepare("SELECT * FROM productivity_items WHERE kind = ? ORDER BY COALESCE(due_at, updated_at) ASC LIMIT ?").all(kind, Math.max(1, Number(input.flags.limit ?? 100)));
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  if (command === "update" || command === "done") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, `Usage: claw ${group} ${command} ID`);
    const existing = store.sqlite.prepare("SELECT * FROM productivity_items WHERE id = ?").get(id) as {
      title: string;
      status: string;
      due_at: string | null;
      metadata_json: string;
    } | undefined;
    if (!existing) {
      writeSuccess(input, null);
      return V1_DATA_EXIT_FAILURE;
    }
    const now = nowIso();
    store.sqlite.prepare(`
      UPDATE productivity_items SET title = ?, status = ?, due_at = ?, metadata_json = ?, updated_at = ? WHERE id = ?
    `).run(
      input.flags.title || existing.title,
      command === "done" ? "done" : (input.flags.status || existing.status),
      input.flags.due || input.flags["due-at"] || existing.due_at || null,
      input.flags.metadata ? JSON.stringify(parseMaybeJson(input.flags.metadata)) : existing.metadata_json,
      now,
      id,
    );
    writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM productivity_items WHERE id = ?").get(id) as JsonRecord));
    return V1_DATA_EXIT_OK;
  }
  if (command === "delete") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, `Usage: claw ${group} delete ID`);
    const changes = store.sqlite.prepare("DELETE FROM productivity_items WHERE id = ?").run(id).changes;
    writeSuccess(input, { deleted: changes > 0, id });
    return changes > 0 ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  return usageError(input, usage(input.binName, group));
}

function runBusinessCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  return runSimpleRecordCommand(input, store, {
    table: "business_records",
    defaultKind: "record",
    idPrefix: "biz",
    usageGroup: "business",
    fields: ["id", "kind", "name", "status", "page_id", "metadata_json", "created_at", "updated_at"],
  });
}

function runContentCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "upsert") {
    const now = nowIso();
    const id = input.flags.id || `content-${randomUUID()}`;
    const title = input.flags.title || input.positionals.slice(2).join(" ") || id;
    const pageId = input.flags.body || input.flags.content
      ? upsertPageWithBlocks(store.sqlite, { id: input.flags["page-id"] || `page-${id}`, title, text: input.flags.body || input.flags.content || "", space: "content", surface: "content_entry", sourceRecordDomain: "content_items", sourceRecordId: id }).id
      : input.flags["page-id"] || null;
    store.sqlite.prepare(`
      INSERT INTO content_items (id, kind, title, status, brand_id, campaign_id, page_id, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, title = excluded.title, status = excluded.status,
        brand_id = excluded.brand_id, campaign_id = excluded.campaign_id, page_id = excluded.page_id,
        metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
    `).run(id, input.flags.kind || "entry", title, input.flags.status || "draft", input.flags["brand-id"] || null, input.flags["campaign-id"] || null, pageId, input.flags.metadata ? JSON.stringify(parseMaybeJson(input.flags.metadata)) : "{}", now, now);
    writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM content_items WHERE id = ?").get(id) as JsonRecord));
    return V1_DATA_EXIT_OK;
  }
  if (command === "list") {
    const rows = store.sqlite.prepare("SELECT * FROM content_items ORDER BY updated_at DESC LIMIT ?").all(Math.max(1, Number(input.flags.limit ?? 100)));
    writeSuccess(input, { items: rows.map(normalizeDbRow), opsSidecars: ["publication-runs", "webhook-deliveries", "provider-logs"] });
    return V1_DATA_EXIT_OK;
  }
  return runRecordGetDelete(input, store, "content_items", "content");
}

function runSocialCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "upsert") {
    const now = nowIso();
    const id = input.flags.id || `post-${randomUUID()}`;
    const title = input.flags.title || input.positionals.slice(2).join(" ") || id;
    const pageId = input.flags.body || input.flags.content
      ? upsertPageWithBlocks(store.sqlite, { id: input.flags["page-id"] || `page-${id}`, title, text: input.flags.body || input.flags.content || "", space: "social", surface: "social_post", sourceRecordDomain: "social_posts", sourceRecordId: id }).id
      : input.flags["page-id"] || null;
    store.sqlite.prepare(`
      INSERT INTO social_posts (id, title, status, channel_json, scheduled_at, published_at, page_id, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title, status = excluded.status, channel_json = excluded.channel_json,
        scheduled_at = excluded.scheduled_at, published_at = excluded.published_at, page_id = excluded.page_id,
        metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
    `).run(id, title, input.flags.status || "draft", input.flags.channel ? JSON.stringify(parseMaybeJson(input.flags.channel)) : "{}", input.flags["scheduled-at"] || null, input.flags["published-at"] || null, pageId, input.flags.metadata ? JSON.stringify(parseMaybeJson(input.flags.metadata)) : "{}", now, now);
    writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM social_posts WHERE id = ?").get(id) as JsonRecord));
    return V1_DATA_EXIT_OK;
  }
  if (command === "list") {
    const rows = store.sqlite.prepare("SELECT * FROM social_posts ORDER BY COALESCE(scheduled_at, updated_at) DESC LIMIT ?").all(Math.max(1, Number(input.flags.limit ?? 100)));
    writeSuccess(input, { items: rows.map(normalizeDbRow), opsSidecars: ["queues", "webhook-deliveries", "raw-metrics"] });
    return V1_DATA_EXIT_OK;
  }
  return runRecordGetDelete(input, store, "social_posts", "social");
}

function runFinanceCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "upsert") {
    const now = nowIso();
    const id = input.flags.id || input.positionals[2] || `finance-${randomUUID()}`;
    const amount = input.flags.amount ?? input.positionals[3];
    if (amount === undefined) return usageError(input, "Usage: claw finance upsert --id ID --amount NUMBER [--currency USD]");
    const pageId = input.flags.notes || input.flags.body
      ? upsertPageWithBlocks(store.sqlite, {
          id: input.flags["page-id"] || `page-${id}`,
          title: `${input.flags.kind || "transaction"} notes`,
          text: input.flags.notes || input.flags.body || "",
          space: "finance",
          surface: "record_note",
          sourceRecordDomain: "finance_records",
          sourceRecordId: id,
          sensitivity: input.flags.sensitivity || "sensitive",
        }).id
      : input.flags["page-id"] || null;
    store.sqlite.prepare(`
      INSERT INTO finance_records (id, kind, account_id, amount, currency, occurred_at, merchant, category, page_id, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, account_id = excluded.account_id,
        amount = excluded.amount, currency = excluded.currency, occurred_at = excluded.occurred_at,
        merchant = excluded.merchant, category = excluded.category, page_id = excluded.page_id,
        metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
    `).run(id, input.flags.kind || "transaction", input.flags["account-id"] || null, Number(amount), input.flags.currency || "USD", input.flags.at || input.flags["occurred-at"] || now, input.flags.merchant || null, input.flags.category || null, pageId, input.flags.metadata ? JSON.stringify(parseMaybeJson(input.flags.metadata)) : "{}", now, now);
    writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM finance_records WHERE id = ?").get(id) as JsonRecord));
    return V1_DATA_EXIT_OK;
  }
  if (command === "list") {
    const rows = store.sqlite.prepare("SELECT * FROM finance_records ORDER BY occurred_at DESC LIMIT ?").all(Math.max(1, Number(input.flags.limit ?? 100)));
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  return runRecordGetDelete(input, store, "finance_records", "finance");
}

function runCalendarCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "create" || command === "update") {
    const id = input.flags.id || input.positionals[2] || `event-${randomUUID()}`;
    const existing = store.sqlite.prepare("SELECT * FROM calendar_events WHERE id = ?").get(id) as JsonRecord | undefined;
    const title = input.flags.title || (command === "create" ? input.positionals.slice(2).join(" ") : stringValue(existing?.title, id));
    const startsAt = input.flags.start || input.flags["starts-at"] || stringValue(existing?.startsAt, nowIso());
    const now = nowIso();
    store.sqlite.prepare(`
      INSERT INTO calendar_events (id, title, starts_at, ends_at, calendar_id, source, external_id, page_id, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
        calendar_id = excluded.calendar_id, source = excluded.source, external_id = excluded.external_id,
        page_id = excluded.page_id, metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
    `).run(id, title, startsAt, input.flags.end || input.flags["ends-at"] || null, input.flags["calendar-id"] || null, input.flags.source || "clawjs", input.flags["external-id"] || null, input.flags["page-id"] || null, input.flags.metadata ? JSON.stringify(parseMaybeJson(input.flags.metadata)) : "{}", now, now);
    writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM calendar_events WHERE id = ?").get(id) as JsonRecord));
    return V1_DATA_EXIT_OK;
  }
  if (command === "list") {
    const rows = store.sqlite.prepare("SELECT * FROM calendar_events ORDER BY starts_at ASC LIMIT ?").all(Math.max(1, Number(input.flags.limit ?? 100)));
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  return runRecordGetDelete(input, store, "calendar_events", "calendar");
}

function runIotConfigCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const action = input.positionals[2] || "list";
  if (action === "set" || action === "upsert") {
    const id = input.flags.id || input.positionals[3];
    const name = input.flags.name || id;
    if (!id || !name) return usageError(input, "Usage: claw iot config set ID --name NAME [--kind KIND] [--secret-ref REF]");
    const now = nowIso();
    store.sqlite.prepare(`
      INSERT INTO iot_config (id, kind, name, config_json, secret_ref, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, name = excluded.name, config_json = excluded.config_json,
        secret_ref = excluded.secret_ref, enabled = excluded.enabled, updated_at = excluded.updated_at
    `).run(id, input.flags.kind || "device", name, input.flags.config ? JSON.stringify(parseMaybeJson(input.flags.config)) : "{}", input.flags["secret-ref"] || null, truthy(input.flags.enabled ?? "true") ? 1 : 0, now, now);
    writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM iot_config WHERE id = ?").get(id) as JsonRecord));
    return V1_DATA_EXIT_OK;
  }
  if (action === "list") {
    const rows = store.sqlite.prepare("SELECT * FROM iot_config ORDER BY kind, name LIMIT ?").all(Math.max(1, Number(input.flags.limit ?? 100)));
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  return runRecordGetDelete({ ...input, positionals: ["iot", action, ...input.positionals.slice(3)] }, store, "iot_config", "iot config");
}

function runMarketplaceCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const action = input.positionals[2] || "list";
  if (action === "upsert" || action === "set") {
    const id = input.flags.id || input.positionals[3] || `choice-${randomUUID()}`;
    const target = input.flags.target || input.positionals[4];
    const choice = input.flags.choice || input.positionals[5];
    if (!target || !choice) return usageError(input, "Usage: claw marketplace choice upsert --target TARGET --choice CHOICE [--kind KIND]");
    const now = nowIso();
    store.sqlite.prepare(`
      INSERT INTO marketplace_choices (id, kind, target, choice, status, rationale, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, target = excluded.target, choice = excluded.choice,
        status = excluded.status, rationale = excluded.rationale, metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at
    `).run(id, input.flags.kind || "selection", target, choice, input.flags.status || "active", input.flags.rationale || null, input.flags.metadata ? JSON.stringify(parseMaybeJson(input.flags.metadata)) : "{}", now, now);
    writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM marketplace_choices WHERE id = ?").get(id) as JsonRecord));
    return V1_DATA_EXIT_OK;
  }
  if (action === "list") {
    const target = input.flags.target;
    const rows = target
      ? store.sqlite.prepare("SELECT * FROM marketplace_choices WHERE target = ? ORDER BY updated_at DESC LIMIT ?").all(target, Math.max(1, Number(input.flags.limit ?? 100)))
      : store.sqlite.prepare("SELECT * FROM marketplace_choices ORDER BY updated_at DESC LIMIT ?").all(Math.max(1, Number(input.flags.limit ?? 100)));
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  return runRecordGetDelete({ ...input, positionals: ["marketplace", action, ...input.positionals.slice(3)] }, store, "marketplace_choices", "marketplace choice");
}

function runLedgerCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "entry") {
    const action = input.positionals[2] || "upsert";
    if (action === "upsert" || action === "create") {
      const id = input.flags.id || input.positionals[3] || `entry-${randomUUID()}`;
      const description = input.flags.description || input.flags.memo || input.positionals.slice(4).join(" ") || id;
      const now = nowIso();
      store.sqlite.prepare(`
        INSERT INTO accounting_entries (id, entity_id, period_id, entry_date, description, status, page_id, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET entity_id = excluded.entity_id, period_id = excluded.period_id,
          entry_date = excluded.entry_date, description = excluded.description, status = excluded.status,
          page_id = excluded.page_id, metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
      `).run(id, input.flags["entity-id"] || null, input.flags["period-id"] || null, input.flags.date || input.flags["entry-date"] || now.slice(0, 10), description, input.flags.status || "draft", input.flags["page-id"] || null, input.flags.metadata ? JSON.stringify(parseMaybeJson(input.flags.metadata)) : "{}", now, now);
      writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM accounting_entries WHERE id = ?").get(id) as JsonRecord));
      return V1_DATA_EXIT_OK;
    }
    if (action === "list") {
      const rows = store.sqlite.prepare("SELECT * FROM accounting_entries ORDER BY entry_date DESC, updated_at DESC LIMIT ?").all(Math.max(1, Number(input.flags.limit ?? 100)));
      writeSuccess(input, { items: rows.map(normalizeDbRow) });
      return V1_DATA_EXIT_OK;
    }
    return runRecordGetDelete({ ...input, positionals: ["ledger", action, ...input.positionals.slice(3)] }, store, "accounting_entries", "ledger entry");
  }
  if (command === "line") {
    const action = input.positionals[2] || "add";
    if (action === "add" || action === "upsert") {
      const id = input.flags.id || input.positionals[3] || `line-${randomUUID()}`;
      const entryId = input.flags["entry-id"] || input.positionals[4];
      const accountCode = input.flags["account-code"] || input.flags.account || input.positionals[5];
      const amount = input.flags.amount ?? input.positionals[6];
      if (!entryId || !accountCode || amount === undefined) return usageError(input, "Usage: claw ledger line add --entry-id ENTRY --account-code ACCOUNT --amount NUMBER");
      const now = nowIso();
      const numericAmount = Number(amount);
      const side = input.flags.side || (numericAmount >= 0 ? "debit" : "credit");
      store.sqlite.prepare(`
        INSERT INTO accounting_lines (id, entry_id, account_code, side, amount_cents, currency, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET entry_id = excluded.entry_id, account_code = excluded.account_code,
          side = excluded.side, amount_cents = excluded.amount_cents, currency = excluded.currency,
          metadata_json = excluded.metadata_json
      `).run(id, entryId, accountCode, side, Math.round(Math.abs(numericAmount) * 100), input.flags.currency || "USD", input.flags.metadata ? JSON.stringify(parseMaybeJson(input.flags.metadata)) : "{}");
      upsertRegistry(store.sqlite, "ledger", "line", id, { metadata: { entryId, updatedAt: now } });
      writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM accounting_lines WHERE id = ?").get(id) as JsonRecord));
      return V1_DATA_EXIT_OK;
    }
    if (action === "list") {
      const entryId = input.flags["entry-id"];
      const rows = entryId
        ? store.sqlite.prepare("SELECT * FROM accounting_lines WHERE entry_id = ? ORDER BY id LIMIT ?").all(entryId, Math.max(1, Number(input.flags.limit ?? 100)))
        : store.sqlite.prepare("SELECT * FROM accounting_lines ORDER BY entry_id, id LIMIT ?").all(Math.max(1, Number(input.flags.limit ?? 100)));
      writeSuccess(input, { items: rows.map(normalizeDbRow) });
      return V1_DATA_EXIT_OK;
    }
    return runRecordGetDelete({ ...input, positionals: ["ledger", action, ...input.positionals.slice(3)] }, store, "accounting_lines", "ledger line");
  }
  if (command === "list") {
    const rows = store.sqlite.prepare("SELECT * FROM accounting_entries ORDER BY entry_date DESC, updated_at DESC LIMIT ?").all(Math.max(1, Number(input.flags.limit ?? 100)));
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  return runRecordGetDelete(input, store, "accounting_entries", "ledger");
}

function runSearchCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "rebuild") {
    const rebuilt = rebuildNotesFts(store.sqlite);
    const sidecar = rebuildSearchSidecar(store.sqlite);
    upsertRegistry(store.sqlite, "search", "sidecar", "global-search", { path: path.join(resolveClawjsDataRoot(), "search.sqlite"), metadata: { reconstructible: true, rebuilt } });
    writeSuccess(input, { rebuilt, sidecar: "search.sqlite", sidecarDocuments: sidecar, canonical: "main-db" });
    return V1_DATA_EXIT_OK;
  }
  if (command === "query") {
    const query = input.flags.query || input.flags.q || input.positionals.slice(2).join(" ");
    if (!query) return usageError(input, "Usage: claw search query TEXT [--json]");
    rebuildNotesFts(store.sqlite);
    rebuildSearchSidecar(store.sqlite);
    const limit = Math.max(1, Number(input.flags.limit ?? 25));
    const pages = store.sqlite.prepare(`
      SELECT pages.*
      FROM notes_fts
      JOIN pages ON pages.id = notes_fts.page_id
      WHERE notes_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(ftsPhrase(query), limit).map(normalizeDbRow);
    const knowledge = store.sqlite.prepare("SELECT * FROM knowledge_facts WHERE predicate LIKE ? OR object_value_json LIKE ? ORDER BY updated_at DESC LIMIT ?").all(`%${query}%`, `%${query}%`, limit).map(normalizeDbRow);
    const global = querySearchSidecar(query, limit);
    writeSuccess(input, { pages, knowledge, global });
    return V1_DATA_EXIT_OK;
  }
  return usageError(input, usage(input.binName, "search"));
}

function runAudioSidecarCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "index") {
    const file = input.flags.file || input.flags.path || input.positionals[2];
    if (!file) return usageError(input, "Usage: claw audio index --file PATH [--session-id ID] [--transcript TEXT] [--json]");
    const filePath = path.resolve(input.cwd, expandHome(file));
    const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
    const now = nowIso();
    const id = input.flags.id || `audio-${randomUUID()}`;
    const sqlite = openSidecar("audio.sqlite");
    try {
      sqlite.prepare(`
        INSERT INTO audio_items (id, session_id, message_id, path, content_type, duration_ms, size_bytes, transcript_text, transcript_source, created_at, updated_at, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET session_id = excluded.session_id, message_id = excluded.message_id,
          path = excluded.path, content_type = excluded.content_type, duration_ms = excluded.duration_ms,
          size_bytes = excluded.size_bytes, transcript_text = excluded.transcript_text,
          transcript_source = excluded.transcript_source, metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
      `).run(
        id,
        input.flags["session-id"] || null,
        input.flags["message-id"] || null,
        filePath,
        input.flags["content-type"] || guessContentType(filePath),
        input.flags["duration-ms"] ? Number(input.flags["duration-ms"]) : null,
        stat?.size ?? null,
        input.flags.transcript || null,
        input.flags["transcript-source"] || (input.flags.transcript ? "manual" : null),
        now,
        now,
        input.flags.metadata ? JSON.stringify(parseMaybeJson(input.flags.metadata)) : "{}",
      );
      sqlite.prepare("DELETE FROM audio_fts WHERE item_id = ?").run(id);
      sqlite.prepare("INSERT INTO audio_fts (item_id, transcript, path) VALUES (?, ?, ?)").run(id, input.flags.transcript || "", filePath);
    } finally {
      sqlite.close();
    }
    upsertRegistry(store.sqlite, "conversation-artifacts", "audio", id, { path: filePath, metadata: { sessionId: input.flags["session-id"] || null } });
    writeSuccess(input, { id, path: filePath, sidecar: "audio.sqlite", sizeBytes: stat?.size ?? null });
    return V1_DATA_EXIT_OK;
  }
  if (command === "transcript") {
    const id = input.flags.id || input.positionals[2];
    const text = input.flags.text || input.flags.transcript || input.positionals.slice(3).join(" ");
    if (!id || !text) return usageError(input, "Usage: claw audio transcript AUDIO_ID --text TEXT [--json]");
    const sqlite = openSidecar("audio.sqlite");
    try {
      const now = nowIso();
      const changes = sqlite.prepare("UPDATE audio_items SET transcript_text = ?, transcript_source = ?, updated_at = ? WHERE id = ?").run(text, input.flags.source || "manual", now, id).changes;
      sqlite.prepare("DELETE FROM audio_fts WHERE item_id = ?").run(id);
      const row = sqlite.prepare("SELECT path FROM audio_items WHERE id = ?").get(id) as { path: string } | undefined;
      sqlite.prepare("INSERT INTO audio_fts (item_id, transcript, path) VALUES (?, ?, ?)").run(id, text, row?.path ?? "");
      writeSuccess(input, { updated: changes > 0, id });
      return changes > 0 ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
    } finally {
      sqlite.close();
    }
  }
  if (command === "artifact") {
    return runSidecarArtifactCommand(input, "audio.sqlite", "audio_items", "audio");
  }
  return usageError(input, usage(input.binName, "audio"));
}

function runDriveSidecarCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "index" || command === "attach") {
    const file = input.flags.file || input.flags.path || input.positionals[2];
    if (!file) return usageError(input, "Usage: claw drive index --file PATH [--session-id ID] [--json]");
    const filePath = path.resolve(input.cwd, expandHome(file));
    const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
    const now = nowIso();
    const id = input.flags.id || `drive-${randomUUID()}`;
    const name = input.flags.name || path.basename(filePath);
    const sqlite = openSidecar("drive.sqlite");
    try {
      sqlite.prepare(`
        INSERT INTO drive_items (id, parent_id, session_id, message_id, kind, name, path, content_type, size_bytes, checksum, created_at, updated_at, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET parent_id = excluded.parent_id, session_id = excluded.session_id,
          message_id = excluded.message_id, kind = excluded.kind, name = excluded.name, path = excluded.path,
          content_type = excluded.content_type, size_bytes = excluded.size_bytes, checksum = excluded.checksum,
          metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
      `).run(
        id,
        input.flags["parent-id"] || null,
        input.flags["session-id"] || null,
        input.flags["message-id"] || null,
        input.flags.kind || "file",
        name,
        filePath,
        input.flags["content-type"] || guessContentType(filePath),
        stat?.size ?? null,
        input.flags.checksum || null,
        now,
        now,
        input.flags.metadata ? JSON.stringify(parseMaybeJson(input.flags.metadata)) : "{}",
      );
      sqlite.prepare("DELETE FROM drive_fts WHERE item_id = ?").run(id);
      sqlite.prepare("INSERT INTO drive_fts (item_id, name, path, metadata) VALUES (?, ?, ?, ?)").run(id, name, filePath, input.flags.metadata || "");
    } finally {
      sqlite.close();
    }
    upsertRegistry(store.sqlite, "conversation-artifacts", "drive-item", id, { path: filePath, metadata: { sessionId: input.flags["session-id"] || null, name } });
    writeSuccess(input, { id, name, path: filePath, sidecar: "drive.sqlite", sizeBytes: stat?.size ?? null });
    return V1_DATA_EXIT_OK;
  }
  if (command === "artifact") {
    return runSidecarArtifactCommand(input, "drive.sqlite", "drive_items", "drive");
  }
  return usageError(input, usage(input.binName, "drive"));
}

function runRuntimeSidecarCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "queue") {
    const title = input.flags.title || input.positionals.slice(2).join(" ") || "Runtime job";
    const now = nowIso();
    const id = input.flags.id || `job-${randomUUID()}`;
    const sqlite = openSidecar("runtime.sqlite");
    try {
      sqlite.prepare(`
        INSERT INTO runtime_jobs (id, kind, title, status, claim_owner, run_at, attempts, payload_json, created_at, updated_at)
        VALUES (?, ?, ?, 'queued', NULL, ?, 0, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, title = excluded.title, run_at = excluded.run_at,
          payload_json = excluded.payload_json, updated_at = excluded.updated_at
      `).run(id, input.flags.kind || "job", title, input.flags["run-at"] || now, input.flags.payload ? JSON.stringify(parseMaybeJson(input.flags.payload)) : "{}", now, now);
    } finally {
      sqlite.close();
    }
    upsertRegistry(store.sqlite, "runtime", "job", id, { metadata: { status: "queued" } });
    writeSuccess(input, { id, title, status: "queued", sidecar: "runtime.sqlite" });
    return V1_DATA_EXIT_OK;
  }
  if (command === "job") {
    const action = input.positionals[2] || "list";
    const sqlite = openSidecar("runtime.sqlite");
    try {
      if (action === "list") {
        const rows = sqlite.prepare("SELECT * FROM runtime_jobs ORDER BY updated_at DESC LIMIT ?").all(Math.max(1, Number(input.flags.limit ?? 100))).map(normalizeDbRow);
        writeSuccess(input, { items: rows });
        return V1_DATA_EXIT_OK;
      }
      const id = input.flags.id || input.positionals[3];
      if (!id) return usageError(input, "Usage: claw runtime job get|delete ID [--json]");
      if (action === "get") {
        const row = sqlite.prepare("SELECT * FROM runtime_jobs WHERE id = ?").get(id) as JsonRecord | undefined;
        writeSuccess(input, row ? normalizeDbRow(row) : null);
        return row ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
      }
      if (action === "delete") {
        const changes = sqlite.prepare("DELETE FROM runtime_jobs WHERE id = ?").run(id).changes;
        writeSuccess(input, { deleted: changes > 0, id });
        return changes > 0 ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
      }
    } finally {
      sqlite.close();
    }
  }
  if (command === "event") {
    const now = nowIso();
    const sqlite = openSidecar("runtime.sqlite");
    try {
      sqlite.prepare(`
        INSERT INTO runtime_events (id, job_id, kind, level, message, created_at, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(input.flags.id || `event-${randomUUID()}`, input.flags["job-id"] || null, input.flags.kind || "event", input.flags.level || "info", input.flags.message || input.positionals.slice(2).join(" "), now, input.flags.metadata ? JSON.stringify(parseMaybeJson(input.flags.metadata)) : "{}");
    } finally {
      sqlite.close();
    }
    writeSuccess(input, { recorded: true, sidecar: "runtime.sqlite" });
    return V1_DATA_EXIT_OK;
  }
  if (command === "retention") {
    const days = Math.max(1, Number(input.flags.days ?? 30));
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const sqlite = openSidecar("runtime.sqlite");
    try {
      const events = sqlite.prepare("DELETE FROM runtime_events WHERE created_at < ?").run(cutoff).changes;
      const jobs = sqlite.prepare("DELETE FROM runtime_jobs WHERE updated_at < ? AND status IN ('done','failed','cancelled')").run(cutoff).changes;
      writeSuccess(input, { cutoff, deleted: { runtimeEvents: events, runtimeJobs: jobs } });
      return V1_DATA_EXIT_OK;
    } finally {
      sqlite.close();
    }
  }
  return usageError(input, usage(input.binName, "runtime"));
}

function runOperationalSidecarCommand(input: V1DataCliInput, store: DatabaseServiceStore, filename: string, domain: string): number {
  const command = input.positionals[1];
  if (command === "event" || command === "metric") {
    const now = nowIso();
    const id = input.flags.id || `${domain}-${randomUUID()}`;
    const kind = command === "metric" ? (input.flags.kind || "metric") : (input.flags.kind || "event");
    const level = command === "metric" ? (input.flags.level || "info") : (input.flags.level || "info");
    const message = input.flags.message || input.positionals.slice(2).join(" ") || "";
    const metadata = input.flags.metadata ? parseMaybeJson(input.flags.metadata) : {};
    const sqlite = openSidecar(filename);
    try {
      sqlite.prepare(`
        INSERT INTO operational_events (id, kind, level, message, created_at, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, level = excluded.level,
          message = excluded.message, metadata_json = excluded.metadata_json
      `).run(id, kind, level, message, now, JSON.stringify(metadata));
    } finally {
      sqlite.close();
    }
    upsertRegistry(store.sqlite, domain, command === "metric" ? "metric" : "event", id, { metadata: { kind, level } });
    writeSuccess(input, { id, kind, level, message, sidecar: filename });
    return V1_DATA_EXIT_OK;
  }
  if (command === "list") {
    const kind = input.flags.kind;
    const limit = Math.max(1, Number(input.flags.limit ?? 100));
    const sqlite = openSidecar(filename);
    try {
      const rows = kind
        ? sqlite.prepare("SELECT * FROM operational_events WHERE kind = ? ORDER BY created_at DESC LIMIT ?").all(kind, limit)
        : sqlite.prepare("SELECT * FROM operational_events ORDER BY created_at DESC LIMIT ?").all(limit);
      writeSuccess(input, { items: rows.map(normalizeDbRow), sidecar: filename });
      return V1_DATA_EXIT_OK;
    } finally {
      sqlite.close();
    }
  }
  if (command === "retention") {
    const days = Math.max(1, Number(input.flags.days ?? 30));
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const sqlite = openSidecar(filename);
    try {
      const events = sqlite.prepare("DELETE FROM operational_events WHERE created_at < ?").run(cutoff).changes;
      writeSuccess(input, { cutoff, deleted: { operationalEvents: events }, sidecar: filename });
      return V1_DATA_EXIT_OK;
    } finally {
      sqlite.close();
    }
  }
  return usageError(input, usage(input.binName, domain));
}

function runMcpCommand(input: V1DataCliInput): number {
  const command = input.positionals[1];
  const configPath = input.flags.config || path.join(os.homedir(), ".codex", "config.toml");
  if (command === "config-path") {
    const scope = input.flags.scope || input.positionals[2] || "user";
    const resolved = scope === "project"
      ? path.join(path.resolve(input.cwd, expandHome(input.flags.project || input.flags.cwd || input.cwd)), ".codex", "config.toml")
      : configPath;
    writeSuccess(input, { scope, configPath: resolved, exists: fs.existsSync(resolved), source: "codex-config" });
    return V1_DATA_EXIT_OK;
  }
  if (command === "list" || command === "get") {
    const servers = readMcpServers(configPath);
    if (command === "get") {
      const id = input.flags.id || input.positionals[2];
      if (!id) return usageError(input, "Usage: claw mcp get SERVER_ID [--json]");
      writeUnredactedSuccess(input, servers.find((server) => server.id === id) ?? null);
      return servers.some((server) => server.id === id) ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
    }
    writeUnredactedSuccess(input, { source: "codex-config", configPath, items: servers });
    return V1_DATA_EXIT_OK;
  }
  if (command === "upsert") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, "Usage: claw mcp upsert SERVER_ID (--command CMD|--url URL) [--json]");
    const current = readMcpServers(configPath);
    const existing = current.find((server) => server.id === id) ?? { id, source: "codex-config" };
    const next: JsonRecord & { id: string } = {
      ...existing,
      id,
      source: "codex-config",
      ...(input.flags.command ? { command: input.flags.command } : {}),
      ...(input.flags.url ? { url: input.flags.url } : {}),
      ...(input.flags.args ? { args: parseCsvOrJson(input.flags.args) ?? [] } : {}),
      ...(input.flags.cwd ? { cwd: input.flags.cwd } : {}),
      ...(input.flags["env-passthrough"] ? { env_passthrough: parseCsvOrJson(input.flags["env-passthrough"]) ?? [] } : {}),
      ...(input.flags.env ? { env: parseMaybeJson(input.flags.env) } : {}),
      ...(input.flags["bearer-token-env-var"] ? { bearer_token_env_var: input.flags["bearer-token-env-var"] } : {}),
      ...(input.flags.headers ? { headers: parseMaybeJson(input.flags.headers) } : {}),
      ...(input.flags["headers-from-env"] ? { headers_from_env: parseMaybeJson(input.flags["headers-from-env"]) } : {}),
      ...(input.flags.disabled !== undefined ? { disabled: truthy(input.flags.disabled) } : {}),
      ...(input.flags.enabled !== undefined ? { enabled: truthy(input.flags.enabled) } : {}),
    };
    const items = [...current.filter((server) => server.id !== id), next];
    writeMcpServers(configPath, items);
    writeUnredactedSuccess(input, { id, configPath, server: next });
    return V1_DATA_EXIT_OK;
  }
  if (command === "delete") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, "Usage: claw mcp delete SERVER_ID [--json]");
    const current = readMcpServers(configPath);
    const items = current.filter((server) => server.id !== id);
    writeMcpServers(configPath, items);
    writeSuccess(input, { id, deleted: items.length !== current.length, configPath });
    return items.length !== current.length ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  return usageError(input, usage(input.binName, "mcp"));
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
    if (!id || !name) return usageError(input, "Usage: claw agents upsert ID --name NAME [--secret-ref REF]");
    const now = nowIso();
    store.sqlite.prepare(`
      INSERT INTO agents (id, kind, name, runtime, model, builtin, secret_ref, config_json, export_path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, name = excluded.name, runtime = excluded.runtime,
        model = excluded.model, builtin = excluded.builtin, secret_ref = excluded.secret_ref, config_json = excluded.config_json,
        export_path = excluded.export_path, updated_at = excluded.updated_at
    `).run(id, input.flags.kind || "agent", name, input.flags.runtime || null, input.flags.model || null, truthy(input.flags.builtin) ? 1 : 0, input.flags["secret-ref"] || null, input.flags.config ? JSON.stringify(JSON.parse(input.flags.config)) : "{}", input.flags["export-path"] || null, now, now);
    writeSuccess(input, { id, name, secretRef: input.flags["secret-ref"] || null, updatedAt: now });
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
    if (!slug || !name) return usageError(input, "Usage: claw skills upsert SLUG --name NAME [--body TEXT|--file SKILL.md] [--secret-refs REF,REF]");
    const now = nowIso();
    const body = input.flags.file ? fs.readFileSync(path.resolve(input.cwd, expandHome(input.flags.file)), "utf8") : (input.flags.body || "");
    const secretRefs = parseCsvOrJson(input.flags["secret-refs"] || input.flags["secret-ref"]) ?? [];
    store.sqlite.prepare(`
      INSERT INTO skills (id, slug, kind, name, body, scope_json, secret_refs_json, metadata_json, export_path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET kind = excluded.kind, name = excluded.name, body = excluded.body,
        scope_json = excluded.scope_json, secret_refs_json = excluded.secret_refs_json, metadata_json = excluded.metadata_json,
        export_path = excluded.export_path, updated_at = excluded.updated_at
    `).run(input.flags.id || `skill-${slug}`, slug, input.flags.kind || "skill", name, body, input.flags.scope ? JSON.stringify(JSON.parse(input.flags.scope)) : "{}", JSON.stringify(secretRefs), input.flags.metadata ? JSON.stringify(JSON.parse(input.flags.metadata)) : "{}", input.flags["export-path"] || null, now, now);
    writeSuccess(input, { slug, name, secretRefs, updatedAt: now });
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

function runSessionsIndexCommand(input: V1DataCliInput, store: DatabaseServiceStore): number | null {
  const command = input.positionals[1];
  if ((command === "list" || command === "search") && input.flags.workspace) {
    return null;
  }
  if (command === "index") {
    const roots = sessionRoots(input);
    const indexed = indexSessionRoots(store.sqlite, roots, input.flags.source || "codex");
    writeSuccess(input, { indexed, roots });
    return V1_DATA_EXIT_OK;
  }
  if (command === "list") {
    const limit = Math.max(1, Number(input.flags.limit ?? 100));
    const source = input.flags.source;
    const rows = source
      ? store.sqlite.prepare("SELECT * FROM session_index WHERE source = ? ORDER BY updated_at DESC LIMIT ?").all(source, limit)
      : store.sqlite.prepare("SELECT * FROM session_index ORDER BY updated_at DESC LIMIT ?").all(limit);
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  if (command === "get") {
    const id = input.flags.id || input.flags["session-id"] || input.positionals[2];
    if (!id) return usageError(input, "Usage: claw sessions get SESSION_ID [--json]");
    const row = store.sqlite.prepare("SELECT * FROM session_index WHERE session_id = ?").get(id) as JsonRecord | undefined;
    writeSuccess(input, row ? normalizeDbRow(row) : null);
    return row ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  if (command === "search") {
    const query = input.flags.query || input.flags.q || input.positionals.slice(2).join(" ");
    if (!query) return usageError(input, "Usage: claw sessions search --query TEXT [--json]");
    const limit = Math.max(1, Number(input.flags.limit ?? 50));
    const rows = store.sqlite.prepare(`
      SELECT session_index.*
      FROM session_index_fts
      JOIN session_index ON session_index.session_id = session_index_fts.session_id
      WHERE session_index_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(ftsPhrase(query), limit);
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
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
      mainDb: ["knowledge", "notes", "profile", "user-model", "life", "tracking", "tasks", "productivity", "time", "business", "content", "social", "finance", "ledger", "calendar", "iot", "marketplace", "apps", "design", "agents", "skills", "connections"],
      sidecars: ["secrets", "conversation-artifacts", "search", "runtime", "notify", "monitor", "infra", "ops"],
      externalSources: ["codex", "mcp"],
    },
    registry: sqlite.prepare("SELECT * FROM data_registry ORDER BY domain, kind, id").all().map(normalizeDbRow),
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

function resetDomain(sqlite: Database.Database, domain: string): JsonRecord {
  const normalized = domain.trim().toLowerCase();
  const sidecarOnlyDomains = new Set(["audio", "drive", "runtime", "notify", "monitor", "infra", "ops", "conversation-artifacts"]);
  const tables =
    normalized === "all" ? [...APP_STATE_DOMAIN_TABLES, ...LIFE_DOMAIN_TABLES, ...TRACKING_RUNTIME_DOMAIN_TABLES, ...KNOWLEDGE_DOMAIN_TABLES, ...WIKI_VIEW_TABLES, ...USER_MODEL_DOMAIN_TABLES, ...PRODUCTIVITY_DOMAIN_TABLES, ...BUSINESS_DOMAIN_TABLES, ...CALENDAR_DOMAIN_TABLES, ...IOT_DOMAIN_TABLES, ...MARKETPLACE_DOMAIN_TABLES, ...RESOURCE_DOMAIN_TABLES, ...AGENT_DOMAIN_TABLES, ...MCP_DOMAIN_TABLES, ...SESSION_DOMAIN_TABLES] :
    normalized === "app-state" ? APP_STATE_DOMAIN_TABLES :
    normalized === "life" || normalized === "tracking" ? [...LIFE_DOMAIN_TABLES, ...TRACKING_RUNTIME_DOMAIN_TABLES] :
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

function sessionRoots(input: V1DataCliInput): string[] {
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

function openSidecar(filename: string): Database.Database {
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
  if (filename === "sessions.sqlite") {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS conversation_sessions (
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
      CREATE INDEX IF NOT EXISTS conversation_sessions_source_updated_idx ON conversation_sessions(source, updated_at DESC);
      CREATE TABLE IF NOT EXISTS conversation_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        text TEXT NOT NULL,
        turn_index INTEGER NOT NULL DEFAULT 0,
        created_at TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY (session_id) REFERENCES conversation_sessions(session_id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS conversation_messages_session_idx ON conversation_messages(session_id, turn_index);
      CREATE VIRTUAL TABLE IF NOT EXISTS conversation_fts USING fts5(
        session_id UNINDEXED,
        message_id UNINDEXED,
        title,
        body,
        cwd,
        tokenize='unicode61'
      );
    `);
    return;
  }
  if (filename === "audio.sqlite") {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS audio_items (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        message_id TEXT,
        path TEXT NOT NULL,
        content_type TEXT,
        duration_ms INTEGER,
        size_bytes INTEGER,
        transcript_text TEXT,
        transcript_source TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS audio_items_session_idx ON audio_items(session_id, updated_at DESC);
      CREATE VIRTUAL TABLE IF NOT EXISTS audio_fts USING fts5(
        item_id UNINDEXED,
        transcript,
        path,
        tokenize='unicode61'
      );
    `);
    return;
  }
  if (filename === "drive.sqlite") {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS drive_items (
        id TEXT PRIMARY KEY,
        parent_id TEXT,
        session_id TEXT,
        message_id TEXT,
        kind TEXT NOT NULL DEFAULT 'file',
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        content_type TEXT,
        size_bytes INTEGER,
        checksum TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS drive_items_session_idx ON drive_items(session_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS drive_items_parent_idx ON drive_items(parent_id, name);
      CREATE VIRTUAL TABLE IF NOT EXISTS drive_fts USING fts5(
        item_id UNINDEXED,
        name,
        path,
        metadata,
        tokenize='unicode61'
      );
    `);
    return;
  }
  if (filename === "search.sqlite") {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS search_documents (
        id TEXT PRIMARY KEY,
        domain TEXT NOT NULL,
        source_id TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        path TEXT,
        updated_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS search_documents_domain_idx ON search_documents(domain, updated_at DESC);
      CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
        doc_id UNINDEXED,
        domain UNINDEXED,
        title,
        body,
        path,
        tokenize='unicode61'
      );
    `);
    return;
  }
  if (filename === "runtime.sqlite") {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS runtime_jobs (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        claim_owner TEXT,
        run_at TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        payload_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS runtime_jobs_status_idx ON runtime_jobs(status, run_at, updated_at DESC);
      CREATE TABLE IF NOT EXISTS runtime_events (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        kind TEXT NOT NULL,
        level TEXT NOT NULL DEFAULT 'info',
        message TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS runtime_events_job_idx ON runtime_events(job_id, created_at DESC);
    `);
    return;
  }
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS operational_events (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS operational_events_kind_idx ON operational_events(kind, created_at DESC);
  `);
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
    { domain: "secrets", id: "vault", path: path.join(root, "vault.sqlite"), sensitive: true, metadata: { reason: "auth-material" } },
    { domain: "conversation-artifacts", id: "sessions", path: path.join(root, "sessions.sqlite"), metadata: { logicalDomains: ["sessions"], owns: ["messages-index", "conversation-fts"] } },
    { domain: "conversation-artifacts", id: "audio", path: path.join(root, "audio.sqlite"), metadata: { logicalDomains: ["audio"], owns: ["transcripts", "audio-metadata"], blobs: "filesystem" } },
    { domain: "conversation-artifacts", id: "drive", path: path.join(root, "drive.sqlite"), metadata: { logicalDomains: ["drive"], owns: ["attachments", "assets"], blobs: path.join(root, "blobs") } },
    { domain: "search", id: "global-search", path: path.join(root, "search.sqlite"), cache: true, metadata: { reconstructible: true, owns: ["fts", "embeddings", "ranking"] } },
    { domain: "runtime", id: "queues", path: path.join(root, "runtime.sqlite"), cache: true, metadata: { retention: "compact", owns: ["jobs", "claims", "retries", "nudges", "draft-distillations"] } },
    { domain: "notify", id: "deliveries", path: path.join(root, "notify.sqlite"), cache: true, metadata: { operational: true } },
    { domain: "monitor", id: "events", path: path.join(root, "monitor.sqlite"), cache: true, metadata: { operational: true } },
    { domain: "infra", id: "relay-execution-plane", path: path.join(root, "infra.sqlite"), cache: true, metadata: { operational: true } },
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

function upsertPageWithBlocks(sqlite: Database.Database, input: PageUpsertInput): JsonRecord {
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

function readPage(sqlite: Database.Database, id: string): JsonRecord | null {
  const row = sqlite.prepare("SELECT * FROM pages WHERE id = ?").get(id) as JsonRecord | undefined;
  if (!row) return null;
  const page = normalizeDbRow(row) as JsonRecord;
  const blocks = sqlite.prepare("SELECT * FROM page_blocks WHERE page_id = ? ORDER BY sort_order, created_at").all(id).map(normalizeDbRow);
  const links = sqlite.prepare("SELECT * FROM page_links WHERE source_page_id = ? ORDER BY created_at").all(id).map(normalizeDbRow);
  const mentions = sqlite.prepare("SELECT * FROM page_mentions WHERE page_id = ? ORDER BY created_at").all(id).map(normalizeDbRow);
  const comments = sqlite.prepare("SELECT * FROM page_comments WHERE page_id = ? ORDER BY created_at").all(id).map(normalizeDbRow);
  return { ...page, blocks, links, mentions, comments };
}

function pageToMarkdown(page: JsonRecord): string {
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

function markdownToPagePatch(rawText: string): { title?: string; body: string } {
  const lines = rawText.replace(/\r\n/g, "\n").split("\n");
  const first = lines[0]?.trim();
  if (first?.startsWith("# ")) {
    return { title: first.slice(2).trim(), body: lines.slice(1).join("\n").trim() };
  }
  return { body: rawText };
}

function parseCsvOrJson(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const parsed = parseMaybeJson(value);
  if (Array.isArray(parsed)) return parsed.map((entry) => String(entry)).filter(Boolean);
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function refreshProfileProjection(sqlite: Database.Database): JsonRecord {
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

function runSimpleRecordCommand(input: V1DataCliInput, store: DatabaseServiceStore, options: {
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

function runRecordGetDelete(input: V1DataCliInput, store: DatabaseServiceStore, table: string, usageGroup: string): number {
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

function rebuildNotesFts(sqlite: Database.Database): number {
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

function rebuildSearchSidecar(main: Database.Database): number {
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

function querySearchSidecar(query: string, limit: number): unknown[] {
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

function runSidecarArtifactCommand(input: V1DataCliInput, filename: string, table: string, group: string): number {
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

function readMcpServers(configPath: string): Array<JsonRecord & { id: string }> {
  if (!fs.existsSync(configPath)) return [];
  if (path.resolve(configPath).startsWith(path.join(os.homedir(), ".codex"))) {
    assertCodexReadOnlyPath({ homeDir: os.homedir(), path: configPath, operation: "read" });
  }
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

function writeMcpServers(configPath: string, servers: Array<JsonRecord & { id: string }>): void {
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

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function usage(binName: string, group: string): string {
  switch (group) {
    case "data":
      return [
        `Usage: ${binName} data doctor|backup|restore|reset [--json]`,
        `  ${binName} data doctor --json`,
        `  ${binName} data backup --out DIR --json`,
        `  ${binName} data restore --from DIR --json`,
        `  ${binName} data reset --domain app-state|knowledge|notes|profile|life|tasks|business|content|social|calendar|apps|agents|sessions|search|all --json`,
      ].join("\n");
    case "app-state":
      return `Usage: ${binName} app-state get [KEY]|set KEY --value JSON|snapshot [--json]`;
    case "life":
      return `Usage: ${binName} life catalog|seed-catalog|observe|list|delete [--json]`;
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
    case "agents":
      return `Usage: ${binName} agents list|upsert [--json]`;
    case "skills":
      return `Usage: ${binName} skills list|upsert [--json]`;
    case "connections":
      return `Usage: ${binName} connections list|upsert [--json]`;
    case "sessions":
      return `Usage: ${binName} sessions index|list|get|search [--json]`;
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

function writeUnredactedSuccess(input: V1DataCliInput, payload: unknown): void {
  if (input.wantsJson) {
    input.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  input.stdout.write(`${typeof payload === "string" ? payload : JSON.stringify(payload, null, 2)}\n`);
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

function ftsPhrase(value: string): string {
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

function guessContentType(filePath: string): string | null {
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
