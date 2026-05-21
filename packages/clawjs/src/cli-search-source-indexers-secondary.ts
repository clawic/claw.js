// @clawjs-persistent-surface-ddl-source
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto"; import Database from "better-sqlite3";
import { clawCliCommandRegistry, detectClawPublicRepositories, listClawCliAliases, type ClawCliCommandRegistryEntry, type ClawCliSearchResult, type ClawRepositoryRoot } from "@clawjs/core/catalogs";
import {
  DEFAULT_SEARCH_BUDGETS,
  LOCAL_TEXT_EMBEDDING_MODEL,
  SEARCH_SOURCE_SETS,
  SearchStore,
  createBuiltinSearchSourceManifests,
  createLocalTextEmbedding,
  createSearchActionExecutionPlan,
  listSearchEntrypointContracts,
  type SearchAction,
  type SearchActionExecutionPlan,
  type SearchDocumentInput,
  type SearchIndexJob,
  type SearchSourceSetId,
  type SearchQueryInput,
  type SearchQueryOutput,
  type SearchResult,
  type SearchSourceManifest,
  type SearchSourceState,
} from "@clawjs/search";
import type { CliContext } from "./index.ts";
import { CLI_EXIT_DEGRADED, CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { createCliWorkspaceClaw } from "./cli-claw-factory.ts";
import { readBooleanFlag } from "./cli-flag-parsers.ts";
import { writeCommandJsonError, writeCommandJsonOk, writeJsonOk } from "./cli-json.ts";
import { buildCommandHelp, searchCliDiscovery } from "./cli-surface.ts";
import {
  scheduleAppsCatalogSearchEvent,
  scheduleAgentsCatalogSearchEvent,
  scheduleBusinessRecordsSearchEvent,
  scheduleCalendarEventsSearchEvent,
  scheduleCodeSymbolsSearchEvent,
  scheduleConnectorCatalogSearchEvent,
  scheduleContentItemsSearchEvent,
  scheduleDatabaseRecordSearchEvent,
  scheduleDesignResourcesSearchEvent,
  scheduleDocumentBlocksSearchEvent,
  scheduleDocsPagesSearchEvent,
  scheduleElnRecordsSearchEvent,
  scheduleExternalCacheSearchEvent,
  scheduleFinanceRecordsSearchEvent,
  scheduleFinanceRecordTableSearchEvent,
  scheduleGenerationArtifactSearchEvent,
  scheduleImageDerivedSearchEvent,
  scheduleIotConfigSearchEvent,
  scheduleKnowledgeGraphSearchEvent,
  scheduleLocalFileSearchEvent,
  scheduleMarketplaceChoicesSearchEvent,
  scheduleMediaAssetSearchEvent,
  scheduleMcpServersSearchEvent,
  scheduleNotesPagesSearchEvent,
  scheduleProvidersRoutingSearchEvent,
  scheduleRuntimeEventsSearchEvent,
  scheduleSessionChatSearchEvent,
  scheduleSheetsWorkbookSearchEvent,
  scheduleSignalsObservationsSearchEvent,
  scheduleSkillsRegistrySearchEvent,
  scheduleSlidesDeckSearchEvent,
  scheduleSnippetsLibrarySearchEvent,
  scheduleSocialPostsSearchEvent,
  scheduleSurfaceRegistrySearchEvent,
  scheduleSurfaceRouteSearchEvent,
  scheduleWebIngestedSearchEvent,
  scheduleWorkItemsSearchEvent,
  type SearchEventScheduleResult,
} from "./cli-search-events.ts";
import {
  ELN_SEARCH_COLLECTIONS,
  FINANCE_SEARCH_COLLECTIONS,
  OPERATIONAL_SEARCH_SIDECARS,
  SEARCH_ADMIN_COMMANDS,
  WORKSPACE_SEARCH_DOMAINS,
  WORK_SEARCH_COLLECTIONS,
  type BusinessRecordRow,
  type CommandFallbackPolicy,
  type SearchServiceStateFile,
  type SearchServiceWorkerBudgets,
  type SearchServiceWorkerStopReason,
} from "./cli-search-command-constants.ts";
import {
  commandFallbackForSearchQuery as importedCommandFallbackForSearchQuery,
  ensureCommandSourceIndexed as importedEnsureCommandSourceIndexed,
  parseCommandFallbackPolicy as importedParseCommandFallbackPolicy,
  sourceCanIndex as importedSourceCanIndex,
} from "./cli-search-command-source.ts";
import {
  enableNativeSystemSourceFromSnapshotFlag as importedEnableNativeSystemSourceFromSnapshotFlag,
  ensureNativeSystemSourceIndexed as importedEnsureNativeSystemSourceIndexed,
  hasNativeSystemSnapshotFlag as importedHasNativeSystemSnapshotFlag,
  type NativeSystemSearchSourceSnapshot,
  type NativeSystemSearchSourceSnapshotDocument,
} from "./cli-search-native-system-source.ts";
import {
  ensureCodeSymbolResourceIndexed,
  isIgnoredCodeSearchDirectory,
  languageForCodeSearchExtension,
  resolveCodeSearchRoot,
} from "./cli-search-code-symbols-source.ts";
import { scanSearchChangedSourceFiles } from "./cli-search-changes-scan.ts";
import { runIncrementalFileSourceTick } from "./cli-search-incremental-files.ts";
import { ensureDocsPageResourceIndexed, ensureDocsPagesSourceIndexed } from "./cli-search-docs-pages-source.ts";
import { ensureGenerationArtifactResourceIndexed, ensureGenerationsArtifactsSourceIndexed } from "./cli-search-generations-source.ts";
import { ensureImageDerivedResourceIndexed, ensureImagesDerivedSourceIndexed, ensureMediaAssetResourceIndexed, ensureMediaAssetsSourceIndexed } from "./cli-search-image-media-sources.ts";
import { ensureLocalFileResourceIndexed, ensureLocalFilesSourceIndexed } from "./cli-search-local-files-source.ts";
import { ensureSheetsWorkbookResourceIndexed, ensureSheetsWorkbooksSourceIndexed, ensureSlidesDeckResourceIndexed, ensureSlidesDecksSourceIndexed } from "./cli-search-slides-sheets-sources.ts";
import { ensureSurfaceRegistryResourceIndexed, ensureSurfaceRouteResourceIndexed, ensureSurfacesRegistrySourceIndexed, ensureSurfacesRoutesSourceIndexed } from "./cli-search-surface-routes-source.ts";
import {
  ensureExternalCacheResourceIndexed,
  ensureExternalCacheSourceIndexed,
  ensureWebIngestedResourceIndexed,
  ensureWebIngestedSourceIndexed,
  redactExternalCachePayload,
  redactedStructuredText,
} from "./cli-search-web-external-source.ts";
import { pathSafeBasename, resolveRuntimeAdapterId } from "./cli-runtime-utils.ts";
import { listReferences, readReference, referenceDir } from "./references/storage.ts";
import { listStyles, readStyle, styleManifestPath } from "./styles/storage.ts";
import { listTemplates, readTemplate, templateManifestPath } from "./templates/storage.ts";
import { resolveClawjsDataRoot, resolveClawjsMainDbPath } from "./v1-data.ts";
import { ensureV1MainSchema, readMcpServers, type JsonRecord } from "./v1-data-core.ts";
import * as SearchDocuments from "./cli-search-documents.ts";
const BUILTIN_SEARCH_SOURCES: SearchSourceManifest[] = createBuiltinSearchSourceManifests();
export function ensureSkillsRegistrySourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("skills.registry", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "skills")) {
      store.setSourceState("skills.registry", "degraded", {
        backlog: 0,
        error: "core database does not contain skills",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const rows = db.prepare(`
      SELECT id, slug, kind, name, body, scope_json, secret_refs_json, metadata_json, export_path, created_at, updated_at
      FROM skills
      ORDER BY updated_at DESC
    `).all() as SearchDocuments.SkillRegistryRow[];
    let indexed = 0;
    for (const row of rows) {
      const document = SearchDocuments.skillRegistrySearchDocument(row);
      if (!document) continue;
      store.upsertDocument(document);
      indexed += 1;
    }
    store.setCursor({
      source: "skills.registry",
      cursor: `skills:${indexed}`,
      metadata: { store: "core.sqlite", collections: ["skills"] },
    });
    store.setSourceState("skills.registry", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return indexed;
  } finally {
    db.close();
  }
}

export function ensureSkillsRegistryResourceIndexed(store: SearchStore, flags: Record<string, string>, slug: string): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "skills")) return 0;
    const row = db.prepare(`
      SELECT id, slug, kind, name, body, scope_json, secret_refs_json, metadata_json, export_path, created_at, updated_at
      FROM skills
      WHERE slug = ?
      LIMIT 1
    `).get(slug) as SearchDocuments.SkillRegistryRow | undefined;
    if (!row) {
      store.tombstone({ source: "skills.registry", resourceId: slug, reason: "skill missing during Search event refresh" });
      return 1;
    }
    const document = SearchDocuments.skillRegistrySearchDocument(row);
    if (!document) {
      store.tombstone({ source: "skills.registry", resourceId: slug, reason: "skill skipped during Search event refresh" });
      return 1;
    }
    store.upsertDocument(document);
    store.setSourceState("skills.registry", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
  } finally {
    db.close();
  }
}

export function ensureProvidersRoutingSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("providers.routing", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "provider_routing") || !SearchDocuments.hasTable(db, "provider_settings")) {
      store.setSourceState("providers.routing", "degraded", {
        backlog: 0,
        error: "core database does not contain provider routing tables",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const routingRows = db.prepare(`
      SELECT id, feature, capability, provider, model, account_ref, policy_json, metadata_json, created_at, updated_at
      FROM provider_routing
      ORDER BY updated_at DESC
    `).all() as SearchDocuments.ProviderRoutingRow[];
    const settingRows = db.prepare(`
      SELECT id, provider, enabled, policy_json, metadata_json, created_at, updated_at
      FROM provider_settings
      ORDER BY updated_at DESC
    `).all() as SearchDocuments.ProviderSettingRow[];
    let indexed = 0;
    for (const row of routingRows) {
      store.upsertDocument(SearchDocuments.providerRoutingSearchDocument(row));
      indexed += 1;
    }
    for (const row of settingRows) {
      store.upsertDocument(SearchDocuments.providerSettingSearchDocument(row));
      indexed += 1;
    }
    store.setCursor({
      source: "providers.routing",
      cursor: `providers:${indexed}`,
      metadata: { store: "core.sqlite", collections: ["provider_routing", "provider_settings"] },
    });
    store.setSourceState("providers.routing", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return indexed;
  } finally {
    db.close();
  }
}

export function ensureProvidersRoutingResourceIndexed(store: SearchStore, flags: Record<string, string>, resourceId: string): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "provider_routing") || !SearchDocuments.hasTable(db, "provider_settings")) return 0;
    if (resourceId.startsWith("setting:")) {
      const provider = resourceId.slice("setting:".length);
      const row = db.prepare(`
        SELECT id, provider, enabled, policy_json, metadata_json, created_at, updated_at
        FROM provider_settings
        WHERE provider = ?
        LIMIT 1
      `).get(provider) as SearchDocuments.ProviderSettingRow | undefined;
      if (!row) {
        store.tombstone({ source: "providers.routing", resourceId, reason: "provider setting missing during Search event refresh" });
        return 1;
      }
      store.upsertDocument(SearchDocuments.providerSettingSearchDocument(row));
      store.setSourceState("providers.routing", "enabled", {
        backlog: 0,
        error: null,
        lastIndexedAt: new Date().toISOString(),
      });
      return 1;
    }
    const parsed = parseProviderRoutingResourceId(resourceId);
    if (!parsed) {
      store.tombstone({ source: "providers.routing", resourceId, reason: "unknown provider routing resource during Search event refresh" });
      return 1;
    }
    const row = db.prepare(`
      SELECT id, feature, capability, provider, model, account_ref, policy_json, metadata_json, created_at, updated_at
      FROM provider_routing
      WHERE feature = ? AND capability = ?
      LIMIT 1
    `).get(parsed.feature, parsed.capability) as SearchDocuments.ProviderRoutingRow | undefined;
    if (!row) {
      store.tombstone({ source: "providers.routing", resourceId, reason: "provider route missing during Search event refresh" });
      return 1;
    }
    store.upsertDocument(SearchDocuments.providerRoutingSearchDocument(row));
    store.setSourceState("providers.routing", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
  } finally {
    db.close();
  }
}

export function ensureSnippetsLibrarySourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("snippets.library", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "snippets")) {
      store.setSourceState("snippets.library", "degraded", {
        backlog: 0,
        error: "core database does not contain snippets",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const rows = db.prepare(`
      SELECT id, slug, kind, title, body, shortcut, scope_json, skill_refs_json, metadata_json, created_at, updated_at
      FROM snippets
      ORDER BY updated_at DESC
    `).all() as SearchDocuments.SnippetLibraryRow[];
    for (const row of rows) store.upsertDocument(SearchDocuments.snippetLibrarySearchDocument(row));
    store.setCursor({
      source: "snippets.library",
      cursor: `snippets:${rows.length}`,
      metadata: { store: "core.sqlite", collections: ["snippets"] },
    });
    store.setSourceState("snippets.library", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return rows.length;
  } finally {
    db.close();
  }
}

export function ensureSnippetsLibraryResourceIndexed(store: SearchStore, flags: Record<string, string>, slug: string): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "snippets")) return 0;
    const row = db.prepare(`
      SELECT id, slug, kind, title, body, shortcut, scope_json, skill_refs_json, metadata_json, created_at, updated_at
      FROM snippets
      WHERE slug = ?
      LIMIT 1
    `).get(slug) as SearchDocuments.SnippetLibraryRow | undefined;
    if (!row) {
      store.tombstone({ source: "snippets.library", resourceId: slug, reason: "snippet missing during Search event refresh" });
      return 1;
    }
    store.upsertDocument(SearchDocuments.snippetLibrarySearchDocument(row));
    store.setSourceState("snippets.library", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
  } finally {
    db.close();
  }
}

export function ensureAgentsCatalogSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("agents.catalog", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "agents") || !SearchDocuments.hasTable(db, "personalities") || !SearchDocuments.hasTable(db, "skill_collections") || !SearchDocuments.hasTable(db, "connections")) {
      store.setSourceState("agents.catalog", "degraded", {
        backlog: 0,
        error: "core database does not contain agent catalog tables",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const agents = db.prepare(`
      SELECT id, kind, name, status, agency_mode, role, title, description, owner_kind, owner_id,
        workspace_id, project_id, runtime, model, autonomy_profile, builtin, secret_ref,
        config_json, export_path, retired_at, created_at, updated_at
      FROM agents
      ORDER BY updated_at DESC
    `).all() as SearchDocuments.AgentCatalogAgentRow[];
    const personalities = db.prepare(`
      SELECT id, name, description, prompt, version, created_at, updated_at
      FROM personalities
      ORDER BY updated_at DESC
    `).all() as SearchDocuments.AgentCatalogPersonalityRow[];
    const collections = db.prepare(`
      SELECT id, name, description, skills_json, metadata_json, export_path, created_at, updated_at
      FROM skill_collections
      ORDER BY updated_at DESC
    `).all() as SearchDocuments.AgentCatalogSkillCollectionRow[];
    const connections = db.prepare(`
      SELECT id, provider, label, secret_ref, config_json, metadata_json, created_at, updated_at
      FROM connections
      ORDER BY updated_at DESC
    `).all() as SearchDocuments.AgentCatalogConnectionRow[];
    let indexed = 0;
    for (const row of agents) {
      store.upsertDocument(SearchDocuments.agentCatalogAgentSearchDocument(row));
      indexed += 1;
    }
    for (const row of personalities) {
      store.upsertDocument(SearchDocuments.agentCatalogPersonalitySearchDocument(row));
      indexed += 1;
    }
    for (const row of collections) {
      store.upsertDocument(SearchDocuments.agentCatalogSkillCollectionSearchDocument(row));
      indexed += 1;
    }
    for (const row of connections) {
      store.upsertDocument(SearchDocuments.agentCatalogConnectionSearchDocument(row));
      indexed += 1;
    }
    store.setCursor({
      source: "agents.catalog",
      cursor: `agents:${indexed}`,
      metadata: { store: "core.sqlite", collections: ["agents", "personalities", "skill_collections", "connections"] },
    });
    store.setSourceState("agents.catalog", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return indexed;
  } finally {
    db.close();
  }
}

export function ensureAgentsCatalogResourceIndexed(store: SearchStore, flags: Record<string, string>, resourceId: string): number {
  const parsed = parseAgentCatalogResourceId(resourceId);
  if (!parsed) {
    store.tombstone({ source: "agents.catalog", resourceId, reason: "unknown agent catalog resource during Search event refresh" });
    return 1;
  }
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (parsed.kind === "agent") {
      if (!SearchDocuments.hasTable(db, "agents")) return 0;
      const row = db.prepare(`
        SELECT id, kind, name, status, agency_mode, role, title, description, owner_kind, owner_id,
          workspace_id, project_id, runtime, model, autonomy_profile, builtin, secret_ref,
          config_json, export_path, retired_at, created_at, updated_at
        FROM agents
        WHERE id = ?
        LIMIT 1
      `).get(parsed.id) as SearchDocuments.AgentCatalogAgentRow | undefined;
      if (!row) {
        store.tombstone({ source: "agents.catalog", resourceId, reason: "agent missing during Search event refresh" });
        return 1;
      }
      store.upsertDocument(SearchDocuments.agentCatalogAgentSearchDocument(row));
      store.setSourceState("agents.catalog", "enabled", { backlog: 0, error: null, lastIndexedAt: new Date().toISOString() });
      return 1;
    }
    if (parsed.kind === "personality") {
      if (!SearchDocuments.hasTable(db, "personalities")) return 0;
      const row = db.prepare(`
        SELECT id, name, description, prompt, version, created_at, updated_at
        FROM personalities
        WHERE id = ?
        LIMIT 1
      `).get(parsed.id) as SearchDocuments.AgentCatalogPersonalityRow | undefined;
      if (!row) {
        store.tombstone({ source: "agents.catalog", resourceId, reason: "personality missing during Search event refresh" });
        return 1;
      }
      store.upsertDocument(SearchDocuments.agentCatalogPersonalitySearchDocument(row));
      store.setSourceState("agents.catalog", "enabled", { backlog: 0, error: null, lastIndexedAt: new Date().toISOString() });
      return 1;
    }
    if (parsed.kind === "skill_collection") {
      if (!SearchDocuments.hasTable(db, "skill_collections")) return 0;
      const row = db.prepare(`
        SELECT id, name, description, skills_json, metadata_json, export_path, created_at, updated_at
        FROM skill_collections
        WHERE id = ?
        LIMIT 1
      `).get(parsed.id) as SearchDocuments.AgentCatalogSkillCollectionRow | undefined;
      if (!row) {
        store.tombstone({ source: "agents.catalog", resourceId, reason: "skill collection missing during Search event refresh" });
        return 1;
      }
      store.upsertDocument(SearchDocuments.agentCatalogSkillCollectionSearchDocument(row));
      store.setSourceState("agents.catalog", "enabled", { backlog: 0, error: null, lastIndexedAt: new Date().toISOString() });
      return 1;
    }
    if (!SearchDocuments.hasTable(db, "connections")) return 0;
    const row = db.prepare(`
      SELECT id, provider, label, secret_ref, config_json, metadata_json, created_at, updated_at
      FROM connections
      WHERE id = ?
      LIMIT 1
    `).get(parsed.id) as SearchDocuments.AgentCatalogConnectionRow | undefined;
    if (!row) {
      store.tombstone({ source: "agents.catalog", resourceId, reason: "connection missing during Search event refresh" });
      return 1;
    }
    store.upsertDocument(SearchDocuments.agentCatalogConnectionSearchDocument(row));
    store.setSourceState("agents.catalog", "enabled", { backlog: 0, error: null, lastIndexedAt: new Date().toISOString() });
    return 1;
  } finally {
    db.close();
  }
}

export function ensureMarketplaceChoicesSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("marketplace.choices", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "marketplace_choices")) {
      store.setSourceState("marketplace.choices", "degraded", {
        backlog: 0,
        error: "core database does not contain marketplace choices",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const rows = db.prepare(`
      SELECT id, kind, target, choice, status, rationale, metadata_json, created_at, updated_at
      FROM marketplace_choices
      ORDER BY updated_at DESC
    `).all() as SearchDocuments.MarketplaceChoiceRow[];
    for (const row of rows) store.upsertDocument(SearchDocuments.marketplaceChoiceSearchDocument(row));
    store.setCursor({
      source: "marketplace.choices",
      cursor: `marketplace:${rows.length}`,
      metadata: { store: "core.sqlite", collections: ["marketplace_choices"] },
    });
    store.setSourceState("marketplace.choices", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return rows.length;
  } finally {
    db.close();
  }
}

export function ensureMarketplaceChoiceResourceIndexed(store: SearchStore, flags: Record<string, string>, choiceId: string): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "marketplace_choices")) return 0;
    const row = db.prepare(`
      SELECT id, kind, target, choice, status, rationale, metadata_json, created_at, updated_at
      FROM marketplace_choices
      WHERE id = ?
      LIMIT 1
    `).get(choiceId) as SearchDocuments.MarketplaceChoiceRow | undefined;
    if (!row) {
      store.tombstone({ source: "marketplace.choices", resourceId: choiceId, reason: "marketplace choice missing during Search event refresh" });
      return 1;
    }
    store.upsertDocument(SearchDocuments.marketplaceChoiceSearchDocument(row));
    store.setSourceState("marketplace.choices", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
  } finally {
    db.close();
  }
}

export function ensureContentItemsSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("content.items", "enabled", { backlog: 0, lastIndexedAt: new Date().toISOString() });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "content_items")) {
      store.setSourceState("content.items", "degraded", {
        backlog: 0,
        error: "core database does not contain content items",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const rows = db.prepare(`
      SELECT id, kind, title, status, brand_id, campaign_id, page_id, metadata_json, created_at, updated_at
      FROM content_items
      ORDER BY updated_at DESC
    `).all() as SearchDocuments.ContentItemRow[];
    for (const row of rows) store.upsertDocument(SearchDocuments.contentItemSearchDocument(row, SearchDocuments.pageBodyForSearch(db, row.page_id)));
    store.setCursor({
      source: "content.items",
      cursor: `content:${rows.length}`,
      metadata: { store: "core.sqlite", collections: ["content_items"] },
    });
    store.setSourceState("content.items", "enabled", { backlog: 0, error: null, lastIndexedAt: new Date().toISOString() });
    return rows.length;
  } finally {
    db.close();
  }
}

export function ensureContentItemResourceIndexed(store: SearchStore, flags: Record<string, string>, itemId: string): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "content_items")) return 0;
    const row = db.prepare(`
      SELECT id, kind, title, status, brand_id, campaign_id, page_id, metadata_json, created_at, updated_at
      FROM content_items
      WHERE id = ?
      LIMIT 1
    `).get(itemId) as SearchDocuments.ContentItemRow | undefined;
    if (!row) {
      store.tombstone({ source: "content.items", resourceId: itemId, reason: "content item missing during Search event refresh" });
      return 1;
    }
    store.upsertDocument(SearchDocuments.contentItemSearchDocument(row, SearchDocuments.pageBodyForSearch(db, row.page_id)));
    store.setSourceState("content.items", "enabled", { backlog: 0, error: null, lastIndexedAt: new Date().toISOString() });
    return 1;
  } finally {
    db.close();
  }
}

export function ensureBusinessRecordsSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("business.records", "enabled", { backlog: 0, lastIndexedAt: new Date().toISOString() });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "business_records")) {
      store.setSourceState("business.records", "degraded", {
        backlog: 0,
        error: "core database does not contain business records",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const rows = db.prepare(`
      SELECT id, kind, name, status, page_id, metadata_json, created_at, updated_at
      FROM business_records
      ORDER BY updated_at DESC
    `).all() as BusinessRecordRow[];
    for (const row of rows) store.upsertDocument(SearchDocuments.businessRecordSearchDocument(row, SearchDocuments.pageBodyForSearch(db, row.page_id)));
    store.setCursor({
      source: "business.records",
      cursor: `business:${rows.length}`,
      metadata: { store: "core.sqlite", collections: ["business_records"] },
    });
    store.setSourceState("business.records", "enabled", { backlog: 0, error: null, lastIndexedAt: new Date().toISOString() });
    return rows.length;
  } finally {
    db.close();
  }
}

export function ensureBusinessRecordResourceIndexed(store: SearchStore, flags: Record<string, string>, recordId: string): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "business_records")) return 0;
    const row = db.prepare(`
      SELECT id, kind, name, status, page_id, metadata_json, created_at, updated_at
      FROM business_records
      WHERE id = ?
      LIMIT 1
    `).get(recordId) as BusinessRecordRow | undefined;
    if (!row) {
      store.tombstone({ source: "business.records", resourceId: recordId, reason: "business record missing during Search event refresh" });
      return 1;
    }
    store.upsertDocument(SearchDocuments.businessRecordSearchDocument(row, SearchDocuments.pageBodyForSearch(db, row.page_id)));
    store.setSourceState("business.records", "enabled", { backlog: 0, error: null, lastIndexedAt: new Date().toISOString() });
    return 1;
  } finally {
    db.close();
  }
}

export function ensureSocialPostsSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("social.posts", "enabled", { backlog: 0, lastIndexedAt: new Date().toISOString() });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "social_posts")) {
      store.setSourceState("social.posts", "degraded", {
        backlog: 0,
        error: "core database does not contain social posts",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const rows = db.prepare(`
      SELECT id, title, status, channel_json, scheduled_at, published_at, page_id, metadata_json, created_at, updated_at
      FROM social_posts
      ORDER BY COALESCE(scheduled_at, updated_at) DESC
    `).all() as SearchDocuments.SocialPostRow[];
    for (const row of rows) store.upsertDocument(SearchDocuments.socialPostSearchDocument(row, SearchDocuments.pageBodyForSearch(db, row.page_id)));
    store.setCursor({
      source: "social.posts",
      cursor: `social:${rows.length}`,
      metadata: { store: "core.sqlite", collections: ["social_posts"] },
    });
    store.setSourceState("social.posts", "enabled", { backlog: 0, error: null, lastIndexedAt: new Date().toISOString() });
    return rows.length;
  } finally {
    db.close();
  }
}

export function ensureSocialPostResourceIndexed(store: SearchStore, flags: Record<string, string>, postId: string): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "social_posts")) return 0;
    const row = db.prepare(`
      SELECT id, title, status, channel_json, scheduled_at, published_at, page_id, metadata_json, created_at, updated_at
      FROM social_posts
      WHERE id = ?
      LIMIT 1
    `).get(postId) as SearchDocuments.SocialPostRow | undefined;
    if (!row) {
      store.tombstone({ source: "social.posts", resourceId: postId, reason: "social post missing during Search event refresh" });
      return 1;
    }
    store.upsertDocument(SearchDocuments.socialPostSearchDocument(row, SearchDocuments.pageBodyForSearch(db, row.page_id)));
    store.setSourceState("social.posts", "enabled", { backlog: 0, error: null, lastIndexedAt: new Date().toISOString() });
    return 1;
  } finally {
    db.close();
  }
}

export function ensureIotConfigSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("iot.config", "enabled", { backlog: 0, lastIndexedAt: new Date().toISOString() });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "iot_config")) {
      store.setSourceState("iot.config", "degraded", {
        backlog: 0,
        error: "core database does not contain IoT config",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const rows = db.prepare(`
      SELECT id, kind, name, parent_id, status, config_json, secret_ref, enabled, metadata_json, created_at, updated_at
      FROM iot_config
      ORDER BY kind, name
    `).all() as SearchDocuments.IotConfigRow[];
    for (const row of rows) store.upsertDocument(SearchDocuments.iotConfigSearchDocument(row));
    store.setCursor({
      source: "iot.config",
      cursor: `iot:${rows.length}`,
      metadata: { store: "core.sqlite", collections: ["iot_config"] },
    });
    store.setSourceState("iot.config", "enabled", { backlog: 0, error: null, lastIndexedAt: new Date().toISOString() });
    return rows.length;
  } finally {
    db.close();
  }
}

export function ensureIotConfigResourceIndexed(store: SearchStore, flags: Record<string, string>, configId: string): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "iot_config")) return 0;
    const row = db.prepare(`
      SELECT id, kind, name, parent_id, status, config_json, secret_ref, enabled, metadata_json, created_at, updated_at
      FROM iot_config
      WHERE id = ?
      LIMIT 1
    `).get(configId) as SearchDocuments.IotConfigRow | undefined;
    if (!row) {
      store.tombstone({ source: "iot.config", resourceId: configId, reason: "IoT config missing during Search event refresh" });
      return 1;
    }
    store.upsertDocument(SearchDocuments.iotConfigSearchDocument(row));
    store.setSourceState("iot.config", "enabled", { backlog: 0, error: null, lastIndexedAt: new Date().toISOString() });
    return 1;
  } finally {
    db.close();
  }
}

export function ensureConnectorsCatalogSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("connectors.catalog", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "connector_operations") || !SearchDocuments.hasTable(db, "connector_providers")) {
      store.setSourceState("connectors.catalog", "degraded", {
        backlog: 0,
        error: "core database does not contain connector catalog tables",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const capabilities = SearchDocuments.connectorCapabilitiesById(db);
    const rows = db.prepare(`
      SELECT
        o.id, o.provider_id, o.runtime_kind, o.support, o.native_name,
        o.capability_ids_json, o.risk_tiers_json, o.credential_required,
        o.cost_risk, o.requires_approval, o.network_policy_id,
        o.metadata_json, o.created_at, o.updated_at,
        p.display_name AS provider_display_name,
        p.trust_tier AS provider_trust_tier,
        p.enabled AS provider_enabled
      FROM connector_operations o
      LEFT JOIN connector_providers p ON p.id = o.provider_id
      ORDER BY o.updated_at DESC
    `).all() as SearchDocuments.ConnectorOperationRow[];
    let indexed = 0;
    for (const row of rows) {
      const document = SearchDocuments.connectorCatalogSearchDocument(row, capabilities);
      if (!document) continue;
      store.upsertDocument(document);
      indexed += 1;
    }
    store.setCursor({
      source: "connectors.catalog",
      cursor: `operations:${indexed}`,
      metadata: { store: "core.sqlite", collections: ["connector_operations", "connector_providers", "connector_capabilities"] },
    });
    store.setSourceState("connectors.catalog", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return indexed;
  } finally {
    db.close();
  }
}

export function ensureConnectorCatalogResourceIndexed(store: SearchStore, flags: Record<string, string>, operationId: string): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "connector_operations") || !SearchDocuments.hasTable(db, "connector_providers")) return 0;
    const row = db.prepare(`
      SELECT
        o.id, o.provider_id, o.runtime_kind, o.support, o.native_name,
        o.capability_ids_json, o.risk_tiers_json, o.credential_required,
        o.cost_risk, o.requires_approval, o.network_policy_id,
        o.metadata_json, o.created_at, o.updated_at,
        p.display_name AS provider_display_name,
        p.trust_tier AS provider_trust_tier,
        p.enabled AS provider_enabled
      FROM connector_operations o
      LEFT JOIN connector_providers p ON p.id = o.provider_id
      WHERE o.id = ?
      LIMIT 1
    `).get(operationId) as SearchDocuments.ConnectorOperationRow | undefined;
    if (!row) {
      store.tombstone({ source: "connectors.catalog", resourceId: operationId, reason: "connector operation missing during Search event refresh" });
      return 1;
    }
    const document = SearchDocuments.connectorCatalogSearchDocument(row, SearchDocuments.connectorCapabilitiesById(db));
    if (!document) {
      store.tombstone({ source: "connectors.catalog", resourceId: operationId, reason: "connector operation skipped during Search event refresh" });
      return 1;
    }
    store.upsertDocument(document);
    store.setSourceState("connectors.catalog", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
  } finally {
    db.close();
  }
}

export function ensureMcpServersSourceIndexed(store: SearchStore, flags: Record<string, string>, cwd: string): number {
  const configPath = resolveMcpSearchConfigPath(flags, cwd);
  const updatedAt = mcpConfigUpdatedAt(configPath);
  const servers = readMcpServers(configPath);
  let indexed = 0;
  for (const server of servers) {
    store.upsertDocument(SearchDocuments.mcpServerSearchDocument(server, configPath, updatedAt));
    indexed += 1;
  }
  store.setCursor({
    source: "mcp.servers",
    cursor: `config:${SearchDocuments.stableSearchId(configPath)}:servers:${indexed}`,
    metadata: { configPath, count: indexed },
  });
  store.setSourceState("mcp.servers", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  return indexed;
}

export function ensureMcpServerResourceIndexed(store: SearchStore, flags: Record<string, string>, serverId: string, cwd: string, configPathFromJob?: string): number {
  const configPath = configPathFromJob ? path.resolve(expandSearchHome(configPathFromJob)) : resolveMcpSearchConfigPath(flags, cwd);
  const updatedAt = mcpConfigUpdatedAt(configPath);
  const server = readMcpServers(configPath).find((entry) => entry.id === serverId);
  if (!server) {
    store.tombstone({ source: "mcp.servers", resourceId: serverId, reason: "MCP server missing during Search event refresh" });
    return 1;
  }
  store.upsertDocument(SearchDocuments.mcpServerSearchDocument(server, configPath, updatedAt));
  store.setSourceState("mcp.servers", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  return 1;
}

export function ensureAppsCatalogSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "apps")) return 0;
    const rows = db.prepare(`
      SELECT id, slug, name, description, root_path, manifest_json, permissions_json, pinned, last_opened_at, created_by_chat_id, created_at, updated_at
      FROM apps
      ORDER BY pinned DESC, COALESCE(last_opened_at, updated_at) DESC
    `).all() as SearchDocuments.AppCatalogRow[];
    for (const row of rows) store.upsertDocument(SearchDocuments.appCatalogSearchDocument(row));
    store.setCursor({
      source: "apps.catalog",
      cursor: `apps:${rows.length}`,
      metadata: { store: "core.sqlite", table: "apps" },
    });
    store.setSourceState("apps.catalog", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return rows.length;
  } finally {
    db.close();
  }
}

export function ensureAppCatalogResourceIndexed(store: SearchStore, flags: Record<string, string>, appId: string): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "apps")) return 0;
    const row = db.prepare(`
      SELECT id, slug, name, description, root_path, manifest_json, permissions_json, pinned, last_opened_at, created_by_chat_id, created_at, updated_at
      FROM apps
      WHERE id = ? OR slug = ?
      LIMIT 1
    `).get(appId, appId) as SearchDocuments.AppCatalogRow | undefined;
    if (!row) {
      store.tombstone({ source: "apps.catalog", resourceId: appId, reason: "app missing during Search event refresh" });
      return 1;
    }
    store.upsertDocument(SearchDocuments.appCatalogSearchDocument(row));
    store.setSourceState("apps.catalog", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
  } finally {
    db.close();
  }
}

export function ensureDesignResourcesSourceIndexed(store: SearchStore, flags: Record<string, string>, cwd: string): number {
  const workspaceRoot = resolveDesignWorkspaceRoot(flags, cwd);
  let indexed = ensureFileBackedDesignResourcesIndexed(store, workspaceRoot);
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setCursor({
      source: "design.resources",
      cursor: `workspace:${SearchDocuments.stableSearchId(workspaceRoot)}:resources:${indexed}`,
      metadata: { workspaceRoot, fileBacked: true },
    });
    store.setSourceState("design.resources", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return indexed;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "design_resources")) {
      store.setCursor({
        source: "design.resources",
        cursor: `workspace:${SearchDocuments.stableSearchId(workspaceRoot)}:resources:${indexed}`,
        metadata: { workspaceRoot, fileBacked: true },
      });
      store.setSourceState("design.resources", "enabled", {
        backlog: 0,
        error: null,
        lastIndexedAt: new Date().toISOString(),
      });
      return indexed;
    }
    const rows = db.prepare(`
      SELECT id, kind, name, root_path, manifest_json, builtin, created_at, updated_at
      FROM design_resources
      ORDER BY kind, updated_at DESC
    `).all() as SearchDocuments.DesignResourceRow[];
    for (const row of rows) store.upsertDocument(SearchDocuments.designResourceSearchDocument(row));
    indexed += rows.length;
    store.setCursor({
      source: "design.resources",
      cursor: `resources:${rows.length}:workspace:${SearchDocuments.stableSearchId(workspaceRoot)}:${indexed}`,
      metadata: { store: "core.sqlite", table: "design_resources", workspaceRoot, fileBacked: true },
    });
    store.setSourceState("design.resources", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return indexed;
  } finally {
    db.close();
  }
}

export function ensureDesignResourceIndexed(store: SearchStore, flags: Record<string, string>, resourceId: string, cwd: string, workspaceRootOverride?: string): number {
  const dbPath = resolveMainDbPath(flags);
  if (fs.existsSync(dbPath)) {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      if (SearchDocuments.hasTable(db, "design_resources")) {
        const row = db.prepare(`
      SELECT id, kind, name, root_path, manifest_json, builtin, created_at, updated_at
      FROM design_resources
      WHERE id = ?
      LIMIT 1
    `).get(resourceId) as SearchDocuments.DesignResourceRow | undefined;
        if (row) {
          store.upsertDocument(SearchDocuments.designResourceSearchDocument(row));
          store.setSourceState("design.resources", "enabled", {
            backlog: 0,
            error: null,
            lastIndexedAt: new Date().toISOString(),
          });
          return 1;
        }
      }
    } finally {
      db.close();
    }
  }
  const workspaceRoot = workspaceRootOverride ? path.resolve(workspaceRootOverride) : resolveDesignWorkspaceRoot(flags, cwd);
  const fileBacked = fileBackedDesignResourceSearchDocument(workspaceRoot, resourceId);
  if (fileBacked) {
    store.upsertDocument(fileBacked);
  } else {
    store.tombstone({ source: "design.resources", resourceId, reason: "design resource missing during Search event refresh" });
  }
  store.setSourceState("design.resources", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  return 1;
}

export function resolveDesignWorkspaceRoot(flags: Record<string, string>, cwd: string): string {
  return path.resolve(flags.workspace ?? cwd);
}

export function ensureFileBackedDesignResourcesIndexed(store: SearchStore, workspaceRoot: string): number {
  const documents = [
    ...listStyles(workspaceRoot).map((summary) => fileBackedDesignResourceSearchDocument(workspaceRoot, `style:${summary.id}`)),
    ...listTemplates(workspaceRoot).map((summary) => fileBackedDesignResourceSearchDocument(workspaceRoot, `template:${summary.id}`)),
    ...listReferences(workspaceRoot).map((summary) => fileBackedDesignResourceSearchDocument(workspaceRoot, `reference:${summary.id}`)),
  ].filter((document): document is SearchDocumentInput => !!document);
  for (const document of documents) store.upsertDocument(document);
  return documents.length;
}

export function fileBackedDesignResourceSearchDocument(workspaceRoot: string, resourceId: string): SearchDocumentInput | null {
  const [kind, id] = parseDesignResourceId(resourceId);
  try {
    if (kind === "style") {
      const manifest = readStyle(workspaceRoot, id);
      return SearchDocuments.designResourceSearchDocument({
        id: `style:${manifest.id}`,
        kind: "style",
        name: manifest.name,
        root_path: styleManifestPath(workspaceRoot, manifest.id),
        manifest_json: JSON.stringify(manifest),
        builtin: manifest.builtin ? 1 : 0,
        created_at: manifest.createdAt,
        updated_at: manifest.updatedAt,
      });
    }
    if (kind === "template") {
      const manifest = readTemplate(workspaceRoot, id);
      return SearchDocuments.designResourceSearchDocument({
        id: `template:${manifest.id}`,
        kind: "template",
        name: manifest.name,
        root_path: templateManifestPath(workspaceRoot, manifest.id),
        manifest_json: JSON.stringify(manifest),
        builtin: manifest.builtin ? 1 : 0,
        created_at: manifest.createdAt,
        updated_at: manifest.updatedAt,
      });
    }
    if (kind === "reference") {
      const manifest = readReference(workspaceRoot, id);
      return SearchDocuments.designResourceSearchDocument({
        id: `reference:${manifest.id}`,
        kind: "reference",
        name: manifest.name,
        root_path: path.join(referenceDir(workspaceRoot, manifest.id), "REFERENCE.md"),
        manifest_json: JSON.stringify(manifest),
        builtin: 0,
        created_at: manifest.createdAt,
        updated_at: manifest.updatedAt,
      });
    }
  } catch {
    return null;
  }
  return null;
}

export function parseDesignResourceId(resourceId: string): ["style" | "template" | "reference", string] {
  const separator = resourceId.indexOf(":");
  if (separator > 0) {
    const kind = resourceId.slice(0, separator);
    const id = resourceId.slice(separator + 1);
    if ((kind === "style" || kind === "template" || kind === "reference") && id) return [kind, id];
  }
  return ["style", resourceId];
}

export function ensureRuntimeEventsSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  let indexed = 0;
  const runtimePath = resolveSearchSidecarPath(flags, "runtime.sqlite");
  if (fs.existsSync(runtimePath)) {
    const db = new Database(runtimePath, { readonly: true, fileMustExist: true });
    try {
      if (SearchDocuments.hasTable(db, "runtime_jobs")) {
        const jobs = db.prepare(`
          SELECT id, kind, title, status, claim_owner, run_at, attempts, payload_json, created_at, updated_at
          FROM runtime_jobs
          ORDER BY updated_at DESC
        `).all() as SearchDocuments.RuntimeJobRow[];
        for (const job of jobs) {
          store.upsertDocument(SearchDocuments.runtimeJobSearchDocument(job));
          indexed += 1;
        }
      }
      if (SearchDocuments.hasTable(db, "runtime_events")) {
        const events = db.prepare(`
          SELECT id, job_id, kind, level, message, created_at, metadata_json
          FROM runtime_events
          ORDER BY created_at DESC
        `).all() as SearchDocuments.RuntimeEventRow[];
        for (const event of events) {
          store.upsertDocument(SearchDocuments.runtimeEventSearchDocument(event));
          indexed += 1;
        }
      }
    } finally {
      db.close();
    }
  }
  for (const sidecar of OPERATIONAL_SEARCH_SIDECARS) {
    const dbPath = resolveSearchSidecarPath(flags, sidecar.filename);
    if (!fs.existsSync(dbPath)) continue;
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      if (!SearchDocuments.hasTable(db, "operational_events")) continue;
      const rows = db.prepare(`
        SELECT id, kind, level, message, created_at, metadata_json
        FROM operational_events
        ORDER BY created_at DESC
      `).all() as SearchDocuments.OperationalEventRow[];
      for (const row of rows) {
        store.upsertDocument(SearchDocuments.operationalEventSearchDocument(row, sidecar));
        indexed += 1;
      }
    } finally {
      db.close();
    }
  }
  store.setCursor({
    source: "runtime.events",
    cursor: `items:${indexed}`,
    metadata: {
      sidecars: ["runtime.sqlite", ...OPERATIONAL_SEARCH_SIDECARS.map((entry) => entry.filename)],
    },
  });
  store.setSourceState("runtime.events", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  return indexed;
}

export function ensureRuntimeEventsResourceIndexed(store: SearchStore, flags: Record<string, string>, resourceId: string): number {
  if (resourceId.startsWith("job:")) {
    const jobId = resourceId.slice("job:".length);
    const runtimePath = resolveSearchSidecarPath(flags, "runtime.sqlite");
    if (!jobId || !fs.existsSync(runtimePath)) {
      store.tombstone({ source: "runtime.events", resourceId, reason: "runtime job missing during Search event refresh" });
      return 1;
    }
    const db = new Database(runtimePath, { readonly: true, fileMustExist: true });
    try {
      if (!SearchDocuments.hasTable(db, "runtime_jobs")) {
        store.tombstone({ source: "runtime.events", resourceId, reason: "runtime job table missing during Search event refresh" });
        return 1;
      }
      const row = db.prepare(`
        SELECT id, kind, title, status, claim_owner, run_at, attempts, payload_json, created_at, updated_at
        FROM runtime_jobs
        WHERE id = ?
      `).get(jobId) as SearchDocuments.RuntimeJobRow | undefined;
      if (!row) {
        store.tombstone({ source: "runtime.events", resourceId, reason: "runtime job missing during Search event refresh" });
        return 1;
      }
      store.upsertDocument(SearchDocuments.runtimeJobSearchDocument(row));
    } finally {
      db.close();
    }
    setRuntimeEventsResourceState(store);
    return 1;
  }
  if (resourceId.startsWith("event:")) {
    const eventId = resourceId.slice("event:".length);
    const runtimePath = resolveSearchSidecarPath(flags, "runtime.sqlite");
    if (!eventId || !fs.existsSync(runtimePath)) {
      store.tombstone({ source: "runtime.events", resourceId, reason: "runtime event missing during Search event refresh" });
      return 1;
    }
    const db = new Database(runtimePath, { readonly: true, fileMustExist: true });
    try {
      if (!SearchDocuments.hasTable(db, "runtime_events")) {
        store.tombstone({ source: "runtime.events", resourceId, reason: "runtime event table missing during Search event refresh" });
        return 1;
      }
      const row = db.prepare(`
        SELECT id, job_id, kind, level, message, created_at, metadata_json
        FROM runtime_events
        WHERE id = ?
      `).get(eventId) as SearchDocuments.RuntimeEventRow | undefined;
      if (!row) {
        store.tombstone({ source: "runtime.events", resourceId, reason: "runtime event missing during Search event refresh" });
        return 1;
      }
      store.upsertDocument(SearchDocuments.runtimeEventSearchDocument(row));
    } finally {
      db.close();
    }
    setRuntimeEventsResourceState(store);
    return 1;
  }
  if (resourceId.startsWith("operational:")) {
    const [, domain, ...idParts] = resourceId.split(":");
    const eventId = idParts.join(":");
    const sidecar = OPERATIONAL_SEARCH_SIDECARS.find((entry) => entry.domain === domain);
    if (!sidecar || !eventId) {
      store.tombstone({ source: "runtime.events", resourceId, reason: "operational event target missing during Search event refresh" });
      return 1;
    }
    const sidecarPath = resolveSearchSidecarPath(flags, sidecar.filename);
    if (!fs.existsSync(sidecarPath)) {
      store.tombstone({ source: "runtime.events", resourceId, reason: "operational sidecar missing during Search event refresh" });
      return 1;
    }
    const db = new Database(sidecarPath, { readonly: true, fileMustExist: true });
    try {
      if (!SearchDocuments.hasTable(db, "operational_events")) {
        store.tombstone({ source: "runtime.events", resourceId, reason: "operational event table missing during Search event refresh" });
        return 1;
      }
      const row = db.prepare(`
        SELECT id, kind, level, message, created_at, metadata_json
        FROM operational_events
        WHERE id = ?
      `).get(eventId) as SearchDocuments.OperationalEventRow | undefined;
      if (!row) {
        store.tombstone({ source: "runtime.events", resourceId, reason: "operational event missing during Search event refresh" });
        return 1;
      }
      store.upsertDocument(SearchDocuments.operationalEventSearchDocument(row, sidecar));
    } finally {
      db.close();
    }
    setRuntimeEventsResourceState(store);
    return 1;
  }
  store.tombstone({ source: "runtime.events", resourceId, reason: "unknown runtime event resource during Search event refresh" });
  return 1;
}

export function setRuntimeEventsResourceState(store: SearchStore): void {
  store.setSourceState("runtime.events", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
}

export function ensureCodeSymbolsSourceIndexed(store: SearchStore, flags: Record<string, string>, cwd: string): number {
  const root = resolveCodeSearchRoot(flags, cwd);
  if (!fs.existsSync(root)) {
    store.setSourceState("code.symbols", "degraded", {
      backlog: 0,
      error: `code root does not exist: ${root}`,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const maxFiles = SearchDocuments.boundedNumberFlag(flags["code-limit"] ?? flags["search-code-limit"], 500, 1, 10000);
  const maxDepth = SearchDocuments.boundedNumberFlag(flags["code-max-depth"], 8, 1, 32);
  const maxBytes = SearchDocuments.boundedNumberFlag(flags["code-max-bytes"], 256 * 1024, 1024, 2 * 1024 * 1024);
  const tick = runIncrementalFileSourceTick({
    store,
    source: "code.symbols",
    root,
    limits: { maxFiles, maxDepth, maxBytes },
    ignoreDirectory: (name) => isIgnoredCodeSearchDirectory(name),
    fileInfo: ({ extension, stat }) => ({
      indexable: languageForCodeSearchExtension(extension) !== null && stat.size <= maxBytes,
      kind: languageForCodeSearchExtension(extension) ?? "unsupported",
      reason: "code symbol file skipped during incremental Search scan",
    }),
    onUpsert: ({ relativePath }) => ({ indexed: ensureCodeSymbolResourceIndexed(store, flags, cwd, relativePath, root) }),
    onDelete: ({ relativePath, reason }) => {
      store.tombstone({ source: "code.symbols", resourceId: relativePath, reason });
      return { indexed: 1 };
    },
  });
  store.setSourceState("code.symbols", "enabled", {
    backlog: tick.pending ? Math.max(1, tick.frontierRemaining) : 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  if (tick.pending) {
    store.enqueueIndexJob({
      id: `scan:code.symbols:${SearchDocuments.stableSearchId(root)}:continue`,
      source: "code.symbols",
      operation: "rebuild",
      resourceId: root,
      payload: { root },
      priority: 20,
    });
  }
  return tick.indexed;
}

export function resolveSessionsDbPath(flags: Record<string, string>): string {
  if (flags["sessions-db-path"]) return path.resolve(flags["sessions-db-path"]);
  if (process.env.CLAW_SESSIONS_DB_PATH) return path.resolve(process.env.CLAW_SESSIONS_DB_PATH);
  const env = flags["data-dir"] ? { ...process.env, CLAW_DATA_DIR: flags["data-dir"] } : process.env;
  return path.join(resolveClawjsDataRoot(env), "sessions.sqlite");
}
export function resolveMainDbPath(flags: Record<string, string>): string {
  const env = flags["data-dir"] ? { ...process.env, CLAW_DATA_DIR: flags["data-dir"] } : process.env;
  return resolveClawjsMainDbPath(env);
}
export function resolveMcpSearchConfigPath(flags: Record<string, string>, cwd: string): string {
  const configured = flags["mcp-config"] ?? flags.config ?? process.env.CLAW_MCP_CONFIG_PATH;
  if (!configured) return path.join(os.homedir(), ".codex", "config.toml");
  const expanded = expandSearchHome(configured);
  return path.isAbsolute(expanded) ? expanded : path.resolve(cwd, expanded);
}
export function expandSearchHome(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}
export function mcpConfigUpdatedAt(configPath: string): string {
  try {
    return fs.statSync(configPath).mtime.toISOString();
  } catch {
    return new Date().toISOString();
  }
}
