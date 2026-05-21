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
  codeFileSearchDocument,
  discoverCodeSearchFiles,
  ensureCodeSymbolResourceIndexed,
  resolveCodeSearchRoot,
  upsertCodeFileSearchDocument,
} from "./cli-search-code-symbols-source.ts";
import { scanSearchChangedSourceFiles } from "./cli-search-changes-scan.ts";
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
import { resolveMainDbPath, resolveSessionsDbPath } from "./cli-search-source-indexers-secondary.ts";

export const SESSIONS_CHATS_INDEX_CURSOR_VERSION = 2;

export interface SessionsChatsIndexCursor {
  updatedAt: string;
  sessionId: string;
}

export function ensureSessionsChatsSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveSessionsDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("sessions.chats", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "conversation_sessions")) {
      store.setSourceState("sessions.chats", "degraded", {
        backlog: 0,
        error: "sessions sidecar does not contain conversation_sessions",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const batchSize = SearchDocuments.boundedNumberFlag(flags["sessions-index-batch-size"], 100, 1, 1000);
    const sessionsAfterCursor = db.prepare(`
      SELECT session_id, source, artifact_path, title, cwd, updated_at, snippet, metadata_json, archived, pinned
      FROM conversation_sessions
      WHERE archived = 0
        AND (
          updated_at > ?
          OR (updated_at = ? AND session_id > ?)
        )
      ORDER BY updated_at ASC, session_id ASC
      LIMIT ?
    `);
    const sessionsFromStart = db.prepare(`
      SELECT session_id, source, artifact_path, title, cwd, updated_at, snippet, metadata_json, archived, pinned
      FROM conversation_sessions
      WHERE archived = 0
      ORDER BY updated_at ASC, session_id ASC
      LIMIT ?
    `);
    const messageRows = SearchDocuments.hasTable(db, "conversation_messages")
      ? db.prepare(`
          SELECT id, role, text, turn_index, created_at, metadata_json
          FROM conversation_messages
          WHERE session_id = ?
          ORDER BY turn_index ASC, id ASC
          LIMIT 50
        `)
      : null;
    let indexed = 0;
    let cursor = sessionsChatsIndexCursor(store);
    while (true) {
      const sessions = cursor
        ? sessionsAfterCursor.all(cursor.updatedAt, cursor.updatedAt, cursor.sessionId, batchSize) as SearchDocuments.ConversationSessionRow[]
        : sessionsFromStart.all(batchSize) as SearchDocuments.ConversationSessionRow[];
      if (sessions.length === 0) break;
      for (const session of sessions) {
        const messages = messageRows?.all(session.session_id) as SearchDocuments.ConversationMessageRow[] | undefined;
        store.upsertDocument(SearchDocuments.sessionSearchDocument(session, messages ?? []));
      }
      const lastSession = sessions.at(-1);
      if (lastSession) {
        cursor = { updatedAt: lastSession.updated_at, sessionId: lastSession.session_id };
        store.setCursor(sessionsChatsCursorInput(cursor, batchSize));
      }
      indexed += sessions.length;
    }
    store.setSourceState("sessions.chats", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return indexed;
  } finally {
    db.close();
  }
}

export function sessionsChatsIndexCursor(store: SearchStore): SessionsChatsIndexCursor | null {
  const cursor = store.getCursor("sessions.chats");
  const metadata = cursor?.metadata ?? {};
  if (
    metadata.version === SESSIONS_CHATS_INDEX_CURSOR_VERSION
    && typeof metadata.updatedAt === "string"
    && typeof metadata.sessionId === "string"
  ) {
    return { updatedAt: metadata.updatedAt, sessionId: metadata.sessionId };
  }
  return null;
}

export function sessionsChatsCursorInput(cursor: SessionsChatsIndexCursor, batchSize: number): { source: string; cursor: string; watermark: string; metadata: Record<string, unknown> } {
  return {
    source: "sessions.chats",
    cursor: `v${SESSIONS_CHATS_INDEX_CURSOR_VERSION}:${cursor.updatedAt}:${cursor.sessionId}`,
    watermark: cursor.updatedAt,
    metadata: {
      sidecar: "sessions.sqlite",
      version: SESSIONS_CHATS_INDEX_CURSOR_VERSION,
      updatedAt: cursor.updatedAt,
      sessionId: cursor.sessionId,
      batchSize,
    },
  };
}

export function ensureSessionChatResourceIndexed(store: SearchStore, flags: Record<string, string>, sessionId: string): number {
  const dbPath = resolveSessionsDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "conversation_sessions")) return 0;
    const session = db.prepare(`
      SELECT session_id, source, artifact_path, title, cwd, updated_at, snippet, metadata_json, archived, pinned
      FROM conversation_sessions
      WHERE session_id = ?
      LIMIT 1
    `).get(sessionId) as SearchDocuments.ConversationSessionRow | undefined;
    if (!session || session.archived === 1) {
      store.tombstone({ source: "sessions.chats", resourceId: sessionId, reason: "session chat missing during Search event refresh" });
      return 1;
    }
    const messages = SearchDocuments.hasTable(db, "conversation_messages")
      ? db.prepare(`
          SELECT id, role, text, turn_index, created_at, metadata_json
          FROM conversation_messages
          WHERE session_id = ?
          ORDER BY turn_index ASC, id ASC
          LIMIT 50
        `).all(sessionId) as SearchDocuments.ConversationMessageRow[]
      : [];
    store.upsertDocument(SearchDocuments.sessionSearchDocument(session, messages));
    store.setSourceState("sessions.chats", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
  } finally {
    db.close();
  }
}

export function ensureDatabaseRecordsSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("database.records", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "records")) {
      store.setSourceState("database.records", "degraded", {
        backlog: 0,
        error: "core database does not contain records",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const rows = db.prepare(`
      SELECT namespace_id, collection_name, id, data_json, created_at, updated_at
      FROM records
      ORDER BY updated_at DESC
    `).all() as SearchDocuments.DatabaseRecordRow[];
    let indexed = 0;
    for (const row of rows) {
      const document = SearchDocuments.databaseRecordSearchDocument(row);
      if (!document) continue;
      store.upsertDocument(document);
      indexed += 1;
    }
    store.setCursor({
      source: "database.records",
      cursor: `rows:${indexed}`,
      metadata: { store: "core.sqlite" },
    });
    store.setSourceState("database.records", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return indexed;
  } finally {
    db.close();
  }
}

export function ensureDatabaseRecordResourceIndexed(store: SearchStore, flags: Record<string, string>, job: SearchIndexJob): number {
  const target = databaseRecordTargetFromJob(job);
  if (!target) return 0;
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "records")) return 0;
    const row = db.prepare(`
      SELECT namespace_id, collection_name, id, data_json, created_at, updated_at
      FROM records
      WHERE namespace_id = ? AND collection_name = ? AND id = ?
      LIMIT 1
    `).get(target.namespaceId, target.collectionName, target.recordId) as SearchDocuments.DatabaseRecordRow | undefined;
    if (!row) {
      store.tombstone({ source: "database.records", resourceId: target.resourceId, reason: "database record missing during Search event refresh" });
      return 1;
    }
    const document = SearchDocuments.databaseRecordSearchDocument(row);
    if (!document) {
      store.tombstone({ source: "database.records", resourceId: target.resourceId, reason: "database record skipped during Search event refresh" });
      return 1;
    }
    store.upsertDocument(document);
    store.setSourceState("database.records", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
  } finally {
    db.close();
  }
}

export function ensureWorkItemsSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("work.items", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const hasRecords = SearchDocuments.hasTable(db, "records");
    const hasWorkspaceRecords = SearchDocuments.hasTable(db, "workspace_records");
    if (!hasRecords && !hasWorkspaceRecords) {
      store.setSourceState("work.items", "degraded", {
        backlog: 0,
        error: "core database does not contain records/workspace_records",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    let indexed = 0;
    const rows: SearchDocuments.DatabaseRecordRow[] = [];
    if (hasRecords) {
      rows.push(...db.prepare(`
        SELECT namespace_id, collection_name, id, data_json, created_at, updated_at
        FROM records
        WHERE collection_name IN (${Array.from(WORK_SEARCH_COLLECTIONS).map(() => "?").join(", ")})
        ORDER BY updated_at DESC
      `).all(...Array.from(WORK_SEARCH_COLLECTIONS)) as SearchDocuments.DatabaseRecordRow[]);
    }
    if (hasWorkspaceRecords) {
      rows.push(...db.prepare(`
        SELECT
          'main' AS namespace_id,
          collection_name,
          record_id AS id,
          payload_json AS data_json,
          COALESCE(updated_at, '1970-01-01T00:00:00.000Z') AS created_at,
          COALESCE(updated_at, '1970-01-01T00:00:00.000Z') AS updated_at
        FROM workspace_records
        WHERE collection_name IN (${Array.from(WORK_SEARCH_COLLECTIONS).map(() => "?").join(", ")})
        ORDER BY updated_at DESC
      `).all(...Array.from(WORK_SEARCH_COLLECTIONS)) as SearchDocuments.DatabaseRecordRow[]);
    }
    for (const row of rows) {
      const document = SearchDocuments.workItemSearchDocument(row);
      if (!document) continue;
      store.upsertDocument(document);
      indexed += 1;
    }
    store.setCursor({
      source: "work.items",
      cursor: `records:${indexed}`,
      metadata: { store: "core.sqlite", collections: Array.from(WORK_SEARCH_COLLECTIONS).sort(), tables: ["records", "workspace_records"] },
    });
    store.setSourceState("work.items", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return indexed;
  } finally {
    db.close();
  }
}

export function ensureWorkItemResourceIndexed(store: SearchStore, flags: Record<string, string>, job: SearchIndexJob): number {
  const target = databaseRecordTargetFromJob(job);
  if (!target || !WORK_SEARCH_COLLECTIONS.has(target.collectionName)) return 0;
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const row = findWorkItemRecordRow(db, target);
    if (!row) {
      store.tombstone({ source: "work.items", resourceId: target.resourceId, reason: "work item missing during Search event refresh" });
      return 1;
    }
    const document = SearchDocuments.workItemSearchDocument(row);
    if (!document) {
      store.tombstone({ source: "work.items", resourceId: target.resourceId, reason: "work item skipped during Search event refresh" });
      return 1;
    }
    store.upsertDocument(document);
    store.setSourceState("work.items", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
  } finally {
    db.close();
  }
}

export function findWorkItemRecordRow(db: Database.Database, target: { namespaceId: string; collectionName: string; recordId: string }): SearchDocuments.DatabaseRecordRow | undefined {
  if (SearchDocuments.hasTable(db, "records")) {
    const row = db.prepare(`
      SELECT namespace_id, collection_name, id, data_json, created_at, updated_at
      FROM records
      WHERE namespace_id = ? AND collection_name = ? AND id = ?
      LIMIT 1
    `).get(target.namespaceId, target.collectionName, target.recordId) as SearchDocuments.DatabaseRecordRow | undefined;
    if (row) return row;
  }
  if (!SearchDocuments.hasTable(db, "workspace_records")) return undefined;
  return db.prepare(`
    SELECT
      ? AS namespace_id,
      collection_name,
      record_id AS id,
      payload_json AS data_json,
      COALESCE(updated_at, '1970-01-01T00:00:00.000Z') AS created_at,
      COALESCE(updated_at, '1970-01-01T00:00:00.000Z') AS updated_at
    FROM workspace_records
    WHERE collection_name = ? AND record_id = ?
    LIMIT 1
  `).get(target.namespaceId, target.collectionName, target.recordId) as SearchDocuments.DatabaseRecordRow | undefined;
}

export function ensureDocumentsBlocksSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("documents.blocks", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "records")) {
      store.setSourceState("documents.blocks", "degraded", {
        backlog: 0,
        error: "core database does not contain records",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const rows = db.prepare(`
      SELECT namespace_id, collection_name, id, data_json, created_at, updated_at
      FROM records
      WHERE collection_name IN ('documents', 'document_blocks')
      ORDER BY updated_at DESC
    `).all() as SearchDocuments.DatabaseRecordRow[];
    const blocksByDocument = new Map<string, SearchDocuments.DatabaseRecordRow[]>();
    const documents = rows.filter((row) => row.collection_name === "documents");
    for (const block of rows.filter((row) => row.collection_name === "document_blocks")) {
      const payload = SearchDocuments.parseJsonRecord(block.data_json);
      const documentId = typeof payload.documentId === "string" ? payload.documentId : undefined;
      if (!documentId) continue;
      const key = `${block.namespace_id}:${documentId}`;
      const blocks = blocksByDocument.get(key) ?? [];
      blocks.push(block);
      blocksByDocument.set(key, blocks);
    }
    let indexed = 0;
    for (const document of documents) {
      const blocks = blocksByDocument.get(`${document.namespace_id}:${document.id}`) ?? [];
      const searchDocument = SearchDocuments.documentBlocksSearchDocument(document, blocks);
      if (!searchDocument) continue;
      store.upsertDocument(searchDocument);
      indexed += 1;
    }
    store.setCursor({
      source: "documents.blocks",
      cursor: `rows:${indexed}`,
      metadata: { store: "core.sqlite", collections: ["documents", "document_blocks"] },
    });
    store.setSourceState("documents.blocks", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return indexed;
  } finally {
    db.close();
  }
}

export function ensureDocumentBlocksResourceIndexed(store: SearchStore, flags: Record<string, string>, job: SearchIndexJob): number {
  const target = documentTargetFromJob(job);
  if (!target) return 0;
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "records")) return 0;
    const document = db.prepare(`
      SELECT namespace_id, collection_name, id, data_json, created_at, updated_at
      FROM records
      WHERE namespace_id = ? AND collection_name = 'documents' AND id = ?
      LIMIT 1
    `).get(target.namespaceId, target.documentId) as SearchDocuments.DatabaseRecordRow | undefined;
    if (!document) {
      store.tombstone({ source: "documents.blocks", resourceId: target.resourceId, reason: "document missing during Search event refresh" });
      return 1;
    }
    const blockRows = db.prepare(`
      SELECT namespace_id, collection_name, id, data_json, created_at, updated_at
      FROM records
      WHERE namespace_id = ? AND collection_name = 'document_blocks'
      ORDER BY updated_at DESC
    `).all(target.namespaceId) as SearchDocuments.DatabaseRecordRow[];
    const blocks = blockRows.filter((block) => {
      const payload = SearchDocuments.parseJsonRecord(block.data_json);
      return payload.documentId === target.documentId;
    });
    const searchDocument = SearchDocuments.documentBlocksSearchDocument(document, blocks);
    if (!searchDocument) {
      store.tombstone({ source: "documents.blocks", resourceId: target.resourceId, reason: "document skipped during Search event refresh" });
      return 1;
    }
    store.upsertDocument(searchDocument);
    store.setSourceState("documents.blocks", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
  } finally {
    db.close();
  }
}

export function ensureNotesPagesSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("notes.pages", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "pages") || !SearchDocuments.hasTable(db, "page_blocks")) {
      store.setSourceState("notes.pages", "degraded", {
        backlog: 0,
        error: "core database does not contain pages/page_blocks",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const pages = db.prepare(`
      SELECT id, title, space, surface, owner_id, author_kind, author_id, visibility, sensitivity,
        tags_json, properties_json, source_record_domain, source_record_id, created_at, updated_at, archived_at
      FROM pages
      WHERE archived_at IS NULL
      ORDER BY updated_at DESC
    `).all() as SearchDocuments.NotesPageRow[];
    const blockRows = db.prepare(`
      SELECT id, page_id, parent_block_id, sort_order, kind, content_json, text, metadata_json, created_at, updated_at
      FROM page_blocks
      ORDER BY page_id, sort_order ASC, created_at ASC
    `).all() as SearchDocuments.NotesPageBlockRow[];
    const blocksByPage = new Map<string, SearchDocuments.NotesPageBlockRow[]>();
    for (const block of blockRows) {
      const blocks = blocksByPage.get(block.page_id) ?? [];
      blocks.push(block);
      blocksByPage.set(block.page_id, blocks);
    }
    let indexed = 0;
    for (const page of pages) {
      const searchDocument = SearchDocuments.notesPageSearchDocument(page, blocksByPage.get(page.id) ?? []);
      if (!searchDocument) continue;
      store.upsertDocument(searchDocument);
      indexed += 1;
    }
    store.setCursor({
      source: "notes.pages",
      cursor: `pages:${indexed}`,
      metadata: { store: "core.sqlite", tables: ["pages", "page_blocks"] },
    });
    store.setSourceState("notes.pages", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return indexed;
  } finally {
    db.close();
  }
}

export function ensureNotesPageResourceIndexed(store: SearchStore, flags: Record<string, string>, pageId: string): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "pages") || !SearchDocuments.hasTable(db, "page_blocks")) return 0;
    const page = db.prepare(`
      SELECT id, title, space, surface, owner_id, author_kind, author_id, visibility, sensitivity,
        tags_json, properties_json, source_record_domain, source_record_id, created_at, updated_at, archived_at
      FROM pages
      WHERE id = ?
      LIMIT 1
    `).get(pageId) as SearchDocuments.NotesPageRow | undefined;
    if (!page || page.archived_at) {
      store.tombstone({ source: "notes.pages", resourceId: pageId, reason: "note page missing during Search event refresh" });
      return 1;
    }
    const blocks = db.prepare(`
      SELECT id, page_id, parent_block_id, sort_order, kind, content_json, text, metadata_json, created_at, updated_at
      FROM page_blocks
      WHERE page_id = ?
      ORDER BY sort_order ASC, created_at ASC
    `).all(pageId) as SearchDocuments.NotesPageBlockRow[];
    const searchDocument = SearchDocuments.notesPageSearchDocument(page, blocks);
    if (!searchDocument) {
      store.tombstone({ source: "notes.pages", resourceId: pageId, reason: "note page skipped during Search event refresh" });
      return 1;
    }
    store.upsertDocument(searchDocument);
    store.setSourceState("notes.pages", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
  } finally {
    db.close();
  }
}

export function ensureKnowledgeGraphSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("knowledge.graph", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "knowledge_entities") || !SearchDocuments.hasTable(db, "knowledge_facts")) {
      store.setSourceState("knowledge.graph", "degraded", {
        backlog: 0,
        error: "core database does not contain knowledge_entities/knowledge_facts",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const entities = db.prepare(`
      SELECT id, type, label, description, properties_json, sensitivity, source, provenance_json, created_at, updated_at
      FROM knowledge_entities
      ORDER BY updated_at DESC
    `).all() as SearchDocuments.KnowledgeEntityRow[];
    const facts = db.prepare(`
      SELECT id, subject_id, predicate, object_kind, object_value_json, confidence, scope_json,
        sensitivity, source, provenance_json, supersedes_id, valid_from, valid_to, created_at, updated_at
      FROM knowledge_facts
      ORDER BY updated_at DESC
    `).all() as SearchDocuments.KnowledgeFactRow[];
    let indexed = 0;
    for (const entity of entities) {
      const document = SearchDocuments.knowledgeEntitySearchDocument(entity);
      if (!document) continue;
      store.upsertDocument(document);
      indexed += 1;
    }
    for (const fact of facts) {
      const document = SearchDocuments.knowledgeFactSearchDocument(fact);
      if (!document) continue;
      store.upsertDocument(document);
      indexed += 1;
    }
    store.setCursor({
      source: "knowledge.graph",
      cursor: `items:${indexed}`,
      metadata: { store: "core.sqlite", tables: ["knowledge_entities", "knowledge_facts"] },
    });
    store.setSourceState("knowledge.graph", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return indexed;
  } finally {
    db.close();
  }
}

export function ensureKnowledgeGraphResourceIndexed(store: SearchStore, flags: Record<string, string>, resourceId: string): number {
  const target = SearchDocuments.parseKnowledgeGraphResourceId(resourceId);
  if (!target) return 0;
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "knowledge_entities") || !SearchDocuments.hasTable(db, "knowledge_facts")) return 0;
    if (target.kind === "entity") {
      const entity = db.prepare(`
        SELECT id, type, label, description, properties_json, sensitivity, source, provenance_json, created_at, updated_at
        FROM knowledge_entities
        WHERE id = ?
        LIMIT 1
      `).get(target.id) as SearchDocuments.KnowledgeEntityRow | undefined;
      if (!entity) {
        store.tombstone({ source: "knowledge.graph", resourceId, reason: "knowledge entity missing during Search event refresh" });
        return 1;
      }
      store.upsertDocument(SearchDocuments.knowledgeEntitySearchDocument(entity));
    } else {
      const fact = db.prepare(`
        SELECT id, subject_id, predicate, object_kind, object_value_json, confidence, scope_json,
          sensitivity, source, provenance_json, supersedes_id, valid_from, valid_to, created_at, updated_at
        FROM knowledge_facts
        WHERE id = ?
        LIMIT 1
      `).get(target.id) as SearchDocuments.KnowledgeFactRow | undefined;
      if (!fact) {
        store.tombstone({ source: "knowledge.graph", resourceId, reason: "knowledge fact missing during Search event refresh" });
        return 1;
      }
      store.upsertDocument(SearchDocuments.knowledgeFactSearchDocument(fact));
    }
    store.setSourceState("knowledge.graph", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
  } finally {
    db.close();
  }
}

export function ensureSignalsObservationsSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("signals.observations", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "signals_verticals") || !SearchDocuments.hasTable(db, "signals_variables") || !SearchDocuments.hasTable(db, "signals_observations")) {
      store.setSourceState("signals.observations", "degraded", {
        backlog: 0,
        error: "core database does not contain signals catalog/observations tables",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const verticals = db.prepare(`
      SELECT id, label, category, description, status, sensitive, catalog_version, catalog_source, metadata_json, synced_at
      FROM signals_verticals
      ORDER BY label ASC
    `).all() as SearchDocuments.SignalsVerticalRow[];
    const variables = db.prepare(`
      SELECT id, vertical_id, label, value_type, unit_json, category, sensitive, definition_json, updated_at
      FROM signals_variables
      ORDER BY updated_at DESC
    `).all() as SearchDocuments.SignalsVariableRow[];
    const observations = db.prepare(`
      SELECT id, vertical_id, variable_id, value_json, unit_id, recorded_at, source_json, notes, page_id,
        session_id, external_id, sensitive, created_at, updated_at
      FROM signals_observations
      ORDER BY recorded_at DESC
    `).all() as SearchDocuments.SignalsObservationRow[];
    const verticalsById = new Map(verticals.map((vertical) => [vertical.id, vertical]));
    const variablesById = new Map(variables.map((variable) => [variable.id, variable]));
    let indexed = 0;
    for (const vertical of verticals) {
      store.upsertDocument(SearchDocuments.signalVerticalSearchDocument(vertical));
      indexed += 1;
    }
    for (const variable of variables) {
      store.upsertDocument(SearchDocuments.signalVariableSearchDocument(variable, verticalsById.get(variable.vertical_id)));
      indexed += 1;
    }
    for (const observation of observations) {
      store.upsertDocument(SearchDocuments.signalObservationSearchDocument(observation, verticalsById.get(observation.vertical_id), variablesById.get(observation.variable_id)));
      indexed += 1;
    }
    store.setCursor({
      source: "signals.observations",
      cursor: `items:${indexed}`,
      metadata: { store: "core.sqlite", tables: ["signals_verticals", "signals_variables", "signals_observations"] },
    });
    store.setSourceState("signals.observations", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return indexed;
  } finally {
    db.close();
  }
}

export function ensureSignalsObservationsResourceIndexed(store: SearchStore, flags: Record<string, string>, resourceId: string): number {
  const target = SearchDocuments.parseSignalsObservationsResourceId(resourceId);
  if (!target) return 0;
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "signals_verticals") || !SearchDocuments.hasTable(db, "signals_variables") || !SearchDocuments.hasTable(db, "signals_observations")) return 0;
    if (target.kind === "vertical") {
      const vertical = db.prepare(`
        SELECT id, label, category, description, status, sensitive, catalog_version, catalog_source, metadata_json, synced_at
        FROM signals_verticals
        WHERE id = ?
        LIMIT 1
      `).get(target.id) as SearchDocuments.SignalsVerticalRow | undefined;
      if (!vertical) {
        store.tombstone({ source: "signals.observations", resourceId, reason: "signals vertical missing during Search event refresh" });
        return 1;
      }
      store.upsertDocument(SearchDocuments.signalVerticalSearchDocument(vertical));
    } else if (target.kind === "variable") {
      const variable = db.prepare(`
        SELECT id, vertical_id, label, value_type, unit_json, category, sensitive, definition_json, updated_at
        FROM signals_variables
        WHERE id = ?
        LIMIT 1
      `).get(target.id) as SearchDocuments.SignalsVariableRow | undefined;
      if (!variable) {
        store.tombstone({ source: "signals.observations", resourceId, reason: "signals variable missing during Search event refresh" });
        return 1;
      }
      const vertical = db.prepare(`
        SELECT id, label, category, description, status, sensitive, catalog_version, catalog_source, metadata_json, synced_at
        FROM signals_verticals
        WHERE id = ?
        LIMIT 1
      `).get(variable.vertical_id) as SearchDocuments.SignalsVerticalRow | undefined;
      store.upsertDocument(SearchDocuments.signalVariableSearchDocument(variable, vertical));
    } else {
      const observation = db.prepare(`
        SELECT id, vertical_id, variable_id, value_json, unit_id, recorded_at, source_json, notes, page_id,
          session_id, external_id, sensitive, created_at, updated_at
        FROM signals_observations
        WHERE id = ?
        LIMIT 1
      `).get(target.id) as SearchDocuments.SignalsObservationRow | undefined;
      if (!observation) {
        store.tombstone({ source: "signals.observations", resourceId, reason: "signals observation missing during Search event refresh" });
        return 1;
      }
      const vertical = db.prepare(`
        SELECT id, label, category, description, status, sensitive, catalog_version, catalog_source, metadata_json, synced_at
        FROM signals_verticals
        WHERE id = ?
        LIMIT 1
      `).get(observation.vertical_id) as SearchDocuments.SignalsVerticalRow | undefined;
      const variable = db.prepare(`
        SELECT id, vertical_id, label, value_type, unit_json, category, sensitive, definition_json, updated_at
        FROM signals_variables
        WHERE id = ?
        LIMIT 1
      `).get(observation.variable_id) as SearchDocuments.SignalsVariableRow | undefined;
      store.upsertDocument(SearchDocuments.signalObservationSearchDocument(observation, vertical, variable));
    }
    store.setSourceState("signals.observations", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
  } finally {
    db.close();
  }
}

export function ensureCalendarEventsSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("calendar.events", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const hasCalendarEvents = SearchDocuments.hasTable(db, "calendar_events");
    const hasTemporalItems = SearchDocuments.hasTable(db, "temporal_items");
    if (!hasCalendarEvents && !hasTemporalItems) {
      store.setSourceState("calendar.events", "degraded", {
        backlog: 0,
        error: "core database does not contain calendar event tables",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    let indexed = 0;
    if (hasCalendarEvents) {
      const rows = db.prepare(`
        SELECT id, title, starts_at, ends_at, calendar_id, source, external_id, page_id, metadata_json, created_at, updated_at
        FROM calendar_events
        ORDER BY starts_at ASC
      `).all() as SearchDocuments.CalendarEventRow[];
      for (const row of rows) {
        store.upsertDocument(SearchDocuments.calendarEventSearchDocument(row));
        indexed += 1;
      }
    }
    if (hasTemporalItems) {
      const rows = db.prepare(`
        SELECT id, title, status, workspace_id, project_id, agent_id, source_provider, starts_at, next_run_at, created_at, updated_at, payload
        FROM temporal_items
        WHERE kind = 'event'
        ORDER BY COALESCE(starts_at, next_run_at, updated_at) ASC
      `).all() as SearchDocuments.TemporalCalendarEventRow[];
      for (const row of rows) {
        store.upsertDocument(SearchDocuments.temporalCalendarEventSearchDocument(row));
        indexed += 1;
      }
    }
    store.setCursor({
      source: "calendar.events",
      cursor: `events:${indexed}`,
      metadata: { store: "core.sqlite", tables: [...(hasCalendarEvents ? ["calendar_events"] : []), ...(hasTemporalItems ? ["temporal_items"] : [])] },
    });
    store.setSourceState("calendar.events", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return indexed;
  } finally {
    db.close();
  }
}

export function ensureCalendarEventResourceIndexed(store: SearchStore, flags: Record<string, string>, eventId: string): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (SearchDocuments.hasTable(db, "calendar_events")) {
      const row = db.prepare(`
        SELECT id, title, starts_at, ends_at, calendar_id, source, external_id, page_id, metadata_json, created_at, updated_at
        FROM calendar_events
        WHERE id = ?
        LIMIT 1
      `).get(eventId) as SearchDocuments.CalendarEventRow | undefined;
      if (row) {
        store.upsertDocument(SearchDocuments.calendarEventSearchDocument(row));
        store.setSourceState("calendar.events", "enabled", {
          backlog: 0,
          error: null,
          lastIndexedAt: new Date().toISOString(),
        });
        return 1;
      }
    }
    if (SearchDocuments.hasTable(db, "temporal_items")) {
      const row = db.prepare(`
        SELECT id, title, status, workspace_id, project_id, agent_id, source_provider, starts_at, next_run_at, created_at, updated_at, payload
        FROM temporal_items
        WHERE kind = 'event' AND id = ?
        LIMIT 1
      `).get(eventId) as SearchDocuments.TemporalCalendarEventRow | undefined;
      if (row) {
        store.upsertDocument(SearchDocuments.temporalCalendarEventSearchDocument(row));
        store.setSourceState("calendar.events", "enabled", {
          backlog: 0,
          error: null,
          lastIndexedAt: new Date().toISOString(),
        });
        return 1;
      }
    }
    store.tombstone({ source: "calendar.events", resourceId: eventId, reason: "calendar event missing during Search event refresh" });
    return 1;
  } finally {
    db.close();
  }
}

export function ensureFinanceRecordsSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("finance.records", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "records") && !SearchDocuments.hasTable(db, "finance_records")) {
      store.setSourceState("finance.records", "degraded", {
        backlog: 0,
        error: "core database does not contain finance records",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    let indexed = 0;
    if (SearchDocuments.hasTable(db, "records")) {
      const placeholders = FINANCE_SEARCH_COLLECTIONS.map(() => "?").join(", ");
      const rows = db.prepare(`
        SELECT namespace_id, collection_name, id, data_json, created_at, updated_at
        FROM records
        WHERE collection_name IN (${placeholders})
        ORDER BY updated_at DESC
      `).all(...FINANCE_SEARCH_COLLECTIONS) as SearchDocuments.DatabaseRecordRow[];
      for (const row of rows) {
        store.upsertDocument(SearchDocuments.financeRecordSearchDocument(row));
        indexed += 1;
      }
    }
    if (SearchDocuments.hasTable(db, "finance_records")) {
      const rows = db.prepare(`
        SELECT id, kind, account_id, amount, currency, occurred_at, merchant, category, page_id, metadata_json, created_at, updated_at
        FROM finance_records
        ORDER BY occurred_at DESC, updated_at DESC
      `).all() as SearchDocuments.FinanceRecordTableRow[];
      for (const row of rows) {
        store.upsertDocument(SearchDocuments.financeRecordTableSearchDocument(row, SearchDocuments.pageBodyForSearch(db, row.page_id)));
        indexed += 1;
      }
    }
    store.setCursor({
      source: "finance.records",
      cursor: `records:${indexed}`,
      metadata: { store: "core.sqlite", collections: [...FINANCE_SEARCH_COLLECTIONS, "finance_records"] },
    });
    store.setSourceState("finance.records", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return indexed;
  } finally {
    db.close();
  }
}

export function ensureFinanceRecordResourceIndexed(store: SearchStore, flags: Record<string, string>, recordId: string): number {
  const tableRecordId = financeRecordTableIdFromResourceId(recordId);
  if (tableRecordId) return ensureFinanceRecordTableResourceIndexed(store, flags, tableRecordId, recordId);
  const target = financeRecordTargetFromResourceId(recordId);
  if (!target || !FINANCE_SEARCH_COLLECTIONS.includes(target.collectionName as typeof FINANCE_SEARCH_COLLECTIONS[number])) return 0;
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "records")) return 0;
    const row = db.prepare(`
      SELECT namespace_id, collection_name, id, data_json, created_at, updated_at
      FROM records
      WHERE namespace_id = ? AND collection_name = ? AND id = ?
      LIMIT 1
    `).get(target.namespaceId, target.collectionName, target.recordId) as SearchDocuments.DatabaseRecordRow | undefined;
    if (!row) {
      store.tombstone({ source: "finance.records", resourceId: recordId, reason: "finance record missing during Search event refresh" });
      return 1;
    }
    store.upsertDocument(SearchDocuments.financeRecordSearchDocument(row));
    store.setSourceState("finance.records", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
  } finally {
    db.close();
  }
}

export function ensureFinanceRecordTableResourceIndexed(store: SearchStore, flags: Record<string, string>, tableRecordId: string, resourceId: string): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "finance_records")) return 0;
    const row = db.prepare(`
      SELECT id, kind, account_id, amount, currency, occurred_at, merchant, category, page_id, metadata_json, created_at, updated_at
      FROM finance_records
      WHERE id = ?
      LIMIT 1
    `).get(tableRecordId) as SearchDocuments.FinanceRecordTableRow | undefined;
    if (!row) {
      store.tombstone({ source: "finance.records", resourceId, reason: "finance table record missing during Search event refresh" });
      return 1;
    }
    store.upsertDocument(SearchDocuments.financeRecordTableSearchDocument(row, SearchDocuments.pageBodyForSearch(db, row.page_id)));
    store.setSourceState("finance.records", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
  } finally {
    db.close();
  }
}

export function ensureElnRecordsSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("eln.records", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "records")) {
      store.setSourceState("eln.records", "degraded", {
        backlog: 0,
        error: "core database does not contain records",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const placeholders = ELN_SEARCH_COLLECTIONS.map(() => "?").join(", ");
    const rows = db.prepare(`
      SELECT namespace_id, collection_name, id, data_json, created_at, updated_at
      FROM records
      WHERE collection_name IN (${placeholders})
      ORDER BY updated_at DESC
    `).all(...ELN_SEARCH_COLLECTIONS) as SearchDocuments.DatabaseRecordRow[];
    let indexed = 0;
    for (const row of rows) {
      const document = SearchDocuments.elnRecordSearchDocument(row);
      if (!document) continue;
      store.upsertDocument(document);
      indexed += 1;
    }
    store.setCursor({
      source: "eln.records",
      cursor: `eln:${indexed}`,
      metadata: { store: "core.sqlite", collections: [...ELN_SEARCH_COLLECTIONS] },
    });
    store.setSourceState("eln.records", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return indexed;
  } finally {
    db.close();
  }
}

export function ensureElnRecordResourceIndexed(store: SearchStore, flags: Record<string, string>, job: SearchIndexJob): number {
  const target = databaseRecordTargetFromJob(job);
  if (!target || !ELN_SEARCH_COLLECTIONS.includes(target.collectionName as typeof ELN_SEARCH_COLLECTIONS[number])) return 0;
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "records")) return 0;
    const row = db.prepare(`
      SELECT namespace_id, collection_name, id, data_json, created_at, updated_at
      FROM records
      WHERE namespace_id = ? AND collection_name = ? AND id = ?
      LIMIT 1
    `).get(target.namespaceId, target.collectionName, target.recordId) as SearchDocuments.DatabaseRecordRow | undefined;
    if (!row) {
      store.tombstone({ source: "eln.records", resourceId: target.resourceId, reason: "ELN record missing during Search event refresh" });
      return 1;
    }
    const document = SearchDocuments.elnRecordSearchDocument(row);
    if (!document) {
      store.tombstone({ source: "eln.records", resourceId: target.resourceId, reason: "ELN record excluded during Search event refresh" });
      return 1;
    }
    store.upsertDocument(document);
    store.setSourceState("eln.records", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
  } finally {
    db.close();
  }
}
