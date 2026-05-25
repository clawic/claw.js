// @clawjs-persistent-surface-ddl-source
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import Database from "better-sqlite3";

import {
  LOCAL_TEXT_EMBEDDING_MODEL,
  SEARCH_SQLITE_ENGINE,
  SEARCH_SOURCE_SETS,
  createLocalTextEmbedding,
  createSearchRegistry,
  scoreLexicalMatch,
  type SearchAction,
  type SearchAgentResultBudget,
  type SearchEngineDescriptor,
  type SearchFacetDeclaration,
  type SearchInteraction,
  type SearchInteractionInput,
  type SearchSourceSetId,
  type SearchQueryInput,
  type SearchQueryOutput,
  type SearchResult,
  type SearchSourceManifest,
  type SearchSourceIndexingLimits,
  type SearchSourceState,
  type SearchSourceStatus,
} from "./index.ts";
import {
  SEARCH_RESET_SQL,
  SEARCH_SCHEMA_SQL,
  SavedSearchRow,
  SearchAuditEventRow,
  SearchCursorRow,
  SearchDocumentRow,
  SearchEmbeddingDocumentRow,
  SearchEmbeddingFragmentRow,
  SearchEmbeddingStatusRow,
  SearchFileInventoryRow,
  SearchFragmentRow,
  SearchFtsPartitionRow,
  SearchIndexJobRow,
  SearchInteractionRow,
  SearchMonitorRow,
  SearchRankingCachePayload,
  SearchSemanticCandidate,
  SearchSemanticCandidateRow,
  SearchShardRow,
  SearchTouchedCacheScopes,
  SearchVectorRow,
  addInClause,
  agentBudgetResultFilter,
  buildDocumentClauses,
  centralSearchScore,
  cosineSimilarity,
  effectiveResultLimit,
  existingSearchDocumentIngestFingerprints,
  existingSearchDocumentShardRows,
  ftsPartitionTableName,
  ftsQuery,
  isRebuildableSearchSchemaMismatch,
  mergeSearchRows,
  normalizeEmbedding,
  normalizeInlineSearchQuery,
  parseJson,
  quoteSqlIdentifier,
  rankingCacheCutoffIso,
  rankingCacheScopeDeleteSql,
  searchAclAllows,
  searchCursorChecksum,
  searchCursorFromRow,
  searchEmbeddingText,
  searchFtsPartitionFromRow,
  searchIndexJobFromRow,
  searchInteractionFromRow,
  searchRankingCacheKey,
  searchRankingCacheScope,
  searchShardFromRow,
  searchVectorFromRow,
  shouldRunFuzzyFallback,
  stableJson,
  stableJobIdPart,
  truncateUtf8,
} from "./store-helpers.ts";
import type {
  SavedSearchInput,
  SearchAuditEvent,
  SearchAuditEventInput,
  SearchAuditEventType,
  SearchDocumentFragmentInput,
  SearchDocumentInput,
  SearchEmbeddingIndexInput,
  SearchEmbeddingIndexSummary,
  SearchEmbeddingStatus,
  SearchEmbeddingStatusInput,
  SearchFileInventoryEntry,
  SearchFileInventoryInput,
  SearchFileInventoryState,
  SearchIndexEventInput,
  SearchIndexJob,
  SearchIndexJobInput,
  SearchIndexJobOperation,
  SearchIndexJobStatus,
  SearchMonitorInput,
  SearchRankingCacheStats,
  SearchResultAccessInput,
  SearchShardState,
  SearchShardStatus,
  SearchSourceCursor,
  SearchTombstone,
  SearchVectorInput,
  SearchVectorRecord
} from "./store-types.ts";
import { fileInventoryIdentityPart, searchFileInventoryFromRow } from "./store-types.ts";
export * from "./store-types.ts";

const SEARCH_RESULT_LEXICAL_BODY_CHARS = 2048;

const SEARCH_RANKING_CACHE_LIMITS = {
  maxEntries: 256,
  ttlMs: 24 * 60 * 60 * 1000,
  maxTotalBytes: 16 * 1024 * 1024,
  maxEntryBytes: 256 * 1024,
} as const;

function searchDocumentIngestFingerprint(input: {
  id: string;
  source: string;
  shard: string;
  domain: string;
  type: string;
  resourceId: string | null;
  title: string;
  subtitle: string | null;
  snippet: string | null;
  body: string;
  path: string | null;
  explicitUpdatedAt: string | null;
  metadata: Record<string, unknown>;
  permissions: unknown;
  rankingHints: Record<string, number>;
  fragments: Array<{
    id: string;
    title: string;
    body: string;
    snippet: string | null;
    sortOrder: number;
    metadata: Record<string, unknown>;
  }>;
  actions: SearchAction[];
}): string {
  return createHash("sha256").update(stableJson(input)).digest("hex");
}

type SearchLexicalMatch = ReturnType<typeof scoreLexicalMatch>;
type SearchResultFragment = NonNullable<SearchResult["fragments"]>[number];

interface SearchMaterializationOptions {
  lexicalMatches?: Map<string, SearchLexicalMatch>;
  ftsDocumentIds?: Set<string>;
}

interface SearchFragmentMaterialization {
  fragment: SearchResultFragment;
  match: SearchLexicalMatch;
}

function isRankingCachePayload(value: unknown): value is SearchRankingCachePayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<SearchRankingCachePayload>;
  if (typeof payload.query !== "string") return false;
  if (payload.sourceSet !== "framework" && payload.sourceSet !== "full") return false;
  if (!Array.isArray(payload.results)) return false;
  if (typeof payload.partial !== "boolean") return false;
  if (!Array.isArray(payload.omittedSources)) return false;
  if (payload.facets !== undefined && !Array.isArray(payload.facets)) return false;
  return payload.results.every((result) => {
    const ref = result as Partial<SearchRankingCachePayload["results"][number]>;
    return typeof ref.id === "string"
      && typeof ref.score === "number"
      && Number.isFinite(ref.score)
      && typeof ref.updatedAt === "string"
      && typeof ref.order === "number"
      && Number.isFinite(ref.order);
  });
}

export class SearchStore {
  readonly db: Database.Database;
  readonly engine = SEARCH_SQLITE_ENGINE;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.ensureSchema();
    this.seedSourceSets();
  }

  reset(): void {
    this.resetSearchSchema();
    this.db.exec(SEARCH_SCHEMA_SQL);
    this.seedSourceSets();
  }

  resetSources(sources: string[]): void {
    const uniqueSources = Array.from(new Set(sources.map((source) => source.trim()).filter(Boolean)));
    if (!uniqueSources.length) return;
    const tx = this.db.transaction(() => {
      const touchedCacheScopes = this.cacheScopesForSources(uniqueSources);
      const deleteFts = this.db.prepare("DELETE FROM search_fts WHERE source = ?");
      const deleteDocuments = this.db.prepare("DELETE FROM search_documents WHERE source = ?");
      const deleteShards = this.db.prepare("DELETE FROM search_shards WHERE source = ?");
      const deleteCursors = this.db.prepare("DELETE FROM search_cursors WHERE source = ?");
      const deleteTombstones = this.db.prepare("DELETE FROM search_tombstones WHERE source = ?");
      const deleteFileInventory = this.db.prepare("DELETE FROM search_file_inventory WHERE source = ?");
      for (const source of uniqueSources) {
        this.dropFtsPartitions({ source });
        deleteFts.run(source);
        deleteDocuments.run(source);
        deleteShards.run(source);
        deleteCursors.run(source);
        deleteTombstones.run(source);
        deleteFileInventory.run(source);
      }
      this.clearRankingCacheForScopes(touchedCacheScopes);
    });
    tx();
  }

  resetSourceShards(input: { sources: string[]; shards: string[] }): void {
    const uniqueSources = Array.from(new Set(input.sources.map((source) => source.trim()).filter(Boolean)));
    const uniqueShards = Array.from(new Set(input.shards.map((shard) => shard.trim()).filter(Boolean)));
    if (!uniqueSources.length || !uniqueShards.length) return;
    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      const findShard = this.db.prepare("SELECT domain FROM search_shards WHERE source = ? AND shard = ?");
      const findDocument = this.db.prepare("SELECT domain FROM search_documents WHERE source = ? AND shard = ? LIMIT 1");
      const deleteFts = this.db.prepare("DELETE FROM search_fts WHERE source = ? AND shard = ?");
      const deleteDocuments = this.db.prepare("DELETE FROM search_documents WHERE source = ? AND shard = ?");
      const deleteCursors = this.db.prepare("DELETE FROM search_cursors WHERE source = ? AND shard = ?");
      const markShardEmpty = this.db.prepare(`
        INSERT INTO search_shards (source, shard, domain, state, document_count, fragment_count, updated_at)
        VALUES (?, ?, ?, 'empty', 0, 0, ?)
        ON CONFLICT(source, shard) DO UPDATE SET
          domain = excluded.domain,
          state = 'empty',
          document_count = 0,
          fragment_count = 0,
          updated_at = excluded.updated_at
      `);
      const touchedCacheScopes: SearchTouchedCacheScopes = { sources: new Set(), domains: new Set(), shards: new Set() };
      for (const source of uniqueSources) {
        touchedCacheScopes.sources.add(source);
        for (const shard of uniqueShards) {
          touchedCacheScopes.shards.add(shard);
          const shardRow = findShard.get(source, shard) as { domain: string } | undefined;
          const documentRow = findDocument.get(source, shard) as { domain: string } | undefined;
          const domain = shardRow?.domain ?? documentRow?.domain;
          this.dropFtsPartitions({ source, shard });
          deleteFts.run(source, shard);
          deleteDocuments.run(source, shard);
          deleteCursors.run(source, shard);
          if (domain) {
            touchedCacheScopes.domains.add(domain);
            markShardEmpty.run(source, shard, domain, now);
          }
        }
      }
      this.clearRankingCacheForScopes(touchedCacheScopes);
    });
    tx();
  }

  close(): void {
    this.db.close();
  }

  engineDescriptor(): SearchEngineDescriptor {
    return this.engine;
  }

  registerSource(manifest: SearchSourceManifest, options: { state?: SearchSourceState; backlog?: number; error?: string | null } = {}): void {
    const now = new Date().toISOString();
    const manifestJson = JSON.stringify(manifest);
    const existing = this.db.prepare("SELECT state, backlog, error, manifest_json FROM search_sources WHERE id = ?").get(manifest.id) as { state: SearchSourceState; backlog: number; error: string | null; manifest_json: string } | undefined;
    this.db.prepare(`
      INSERT INTO search_sources (id, domain, name, version, source_set, manifest_json, state, backlog, error, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        domain = excluded.domain,
        name = excluded.name,
        version = excluded.version,
        source_set = excluded.source_set,
        manifest_json = excluded.manifest_json,
        state = CASE WHEN ? THEN excluded.state ELSE search_sources.state END,
        backlog = CASE WHEN ? THEN excluded.backlog ELSE search_sources.backlog END,
        error = CASE WHEN ? THEN excluded.error ELSE search_sources.error END,
        updated_at = excluded.updated_at
    `).run(
      manifest.id,
      manifest.domain,
      manifest.name,
      manifest.version,
      manifest.sourceSet,
      manifestJson,
      options.state ?? existing?.state ?? (manifest.indexing.defaultState === "on" ? "enabled" : "disabled"),
      options.backlog ?? existing?.backlog ?? 0,
      options.error ?? existing?.error ?? null,
      now,
      options.state ? 1 : 0,
      options.backlog !== undefined ? 1 : 0,
      options.error !== undefined ? 1 : 0,
    );
    if (
      !existing
      || existing.manifest_json !== manifestJson
      || options.state !== undefined
      || options.backlog !== undefined
      || options.error !== undefined
    ) {
      this.clearRankingCache();
    }
  }

  listSources(sourceSet: SearchSourceSetId = "framework"): SearchSourceManifest[] {
    const rows = this.db.prepare(`
      SELECT manifest_json FROM search_sources
      WHERE ? = 'full' OR source_set = 'framework'
      ORDER BY domain ASC, id ASC
    `).all(sourceSet) as Array<{ manifest_json: string }>;
    return rows.map((row) => JSON.parse(row.manifest_json) as SearchSourceManifest);
  }

  sourceStatus(): SearchSourceStatus[] {
    return (this.db.prepare(`
      SELECT id, domain, state, backlog, last_indexed_at, error
      FROM search_sources
      ORDER BY domain ASC, id ASC
    `).all() as Array<{ id: string; domain: string; state: SearchSourceState; backlog: number; last_indexed_at: string | null; error: string | null }>).map((row) => ({
      source: row.id,
      domain: row.domain,
      state: row.state,
      backlog: row.backlog,
      ...(row.last_indexed_at ? { lastIndexedAt: row.last_indexed_at } : {}),
      ...(row.error ? { error: row.error } : {}),
    }));
  }

  setSourceState(source: string, state: SearchSourceState, input: { backlog?: number; error?: string | null; lastIndexedAt?: string | null } = {}): void {
    const touchedCacheScopes = this.cacheScopesForSources([source]);
    this.db.prepare(`
      UPDATE search_sources
      SET state = ?, backlog = COALESCE(?, backlog), error = ?, last_indexed_at = COALESCE(?, last_indexed_at), updated_at = ?
      WHERE id = ?
    `).run(state, input.backlog ?? null, input.error ?? null, input.lastIndexedAt ?? null, new Date().toISOString(), source);
    this.clearRankingCacheForScopes(touchedCacheScopes);
  }

  sourceState(source: string): SearchSourceState | null {
    const row = this.db.prepare("SELECT state FROM search_sources WHERE id = ?").get(source) as { state: SearchSourceState } | undefined;
    return row?.state ?? null;
  }

  upsertDocument(input: SearchDocumentInput): void {
    this.upsertDocuments([input]);
  }

  upsertDocuments(inputs: SearchDocumentInput[]): number {
    if (inputs.length === 0) return 0;
    const upsertDocument = this.db.prepare(`
      INSERT INTO search_documents (
        id, source, shard, domain, type, resource_id, title, subtitle, snippet, body, path,
        updated_at, metadata_json, permissions_json, ranking_json, ingest_fingerprint, deleted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(id) DO UPDATE SET
        source = excluded.source,
        shard = excluded.shard,
        domain = excluded.domain,
        type = excluded.type,
        resource_id = excluded.resource_id,
        title = excluded.title,
        subtitle = excluded.subtitle,
        snippet = excluded.snippet,
        body = excluded.body,
        path = excluded.path,
        updated_at = excluded.updated_at,
        metadata_json = excluded.metadata_json,
        permissions_json = excluded.permissions_json,
        ranking_json = excluded.ranking_json,
        ingest_fingerprint = excluded.ingest_fingerprint,
        deleted_at = NULL
    `);
    const deleteFragments = this.db.prepare("DELETE FROM search_fragments WHERE document_id = ?");
    const deleteActions = this.db.prepare("DELETE FROM search_actions WHERE document_id = ?");
    const deleteFts = this.db.prepare("DELETE FROM search_fts WHERE doc_id = ?");
    const insertDocumentFts = this.db.prepare(`
      INSERT INTO search_fts (doc_id, fragment_id, source, shard, domain, type, title, body, path)
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertFragment = this.db.prepare(`
      INSERT INTO search_fragments (id, document_id, source, shard, domain, title, body, snippet, sort_order, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertFragmentFts = this.db.prepare(`
      INSERT INTO search_fts (doc_id, fragment_id, source, shard, domain, type, title, body, path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertAction = this.db.prepare("INSERT INTO search_actions (document_id, action_id, action_json) VALUES (?, ?, ?)");
    const updateSource = this.db.prepare("UPDATE search_sources SET last_indexed_at = ?, updated_at = ? WHERE id = ?");
    const tx = this.db.transaction((documents: SearchDocumentInput[]) => {
      const touchedSources = new Map<string, string>();
      const limitsBySource = new Map<string, SearchSourceIndexingLimits>();
      const existingDocumentFingerprints = existingSearchDocumentIngestFingerprints(this.db, documents.map((document) => document.id));
      const previousDocumentShards = existingSearchDocumentShardRows(this.db, documents.map((document) => document.id));
      const touchedCacheScopes: SearchTouchedCacheScopes = { sources: new Set(), domains: new Set(), shards: new Set() };
      const touchedShards = new Map<string, { source: string; shard: string; domain: string; updatedAt: string }>();
      for (const input of documents) {
        const updatedAt = input.updatedAt ?? new Date().toISOString();
        const shard = input.shard ?? "default";
        const previousShard = previousDocumentShards.get(input.id);
        const limits = limitsBySource.get(input.source) ?? this.indexingLimitsForSource(input.source);
        limitsBySource.set(input.source, limits);
        const body = truncateUtf8(input.body ?? "", limits.maxBodyBytes);
        const fragments = (input.fragments ?? []).slice(0, limits.maxFragments).map((fragment) => ({
          ...fragment,
          body: fragment.body ? truncateUtf8(fragment.body, limits.maxFragmentBytes) : undefined,
          snippet: fragment.snippet ? truncateUtf8(fragment.snippet, limits.maxFragmentBytes) : undefined,
        }));
        const metadata = input.metadata ?? {};
        const permissions = input.permissions ?? {};
        const rankingHints = input.rankingHints ?? {};
        const normalizedFragments = fragments.map((fragment, index) => ({
          id: fragment.id,
          title: fragment.title ?? "",
          body: fragment.body ?? "",
          snippet: fragment.snippet ?? null,
          sortOrder: fragment.sortOrder ?? index,
          metadata: fragment.metadata ?? {},
        }));
        const ingestFingerprint = searchDocumentIngestFingerprint({
          id: input.id,
          source: input.source,
          shard,
          domain: input.domain,
          type: input.type,
          resourceId: input.resourceId ?? null,
          title: input.title,
          subtitle: input.subtitle ?? null,
          snippet: input.snippet ?? null,
          body,
          path: input.path ?? null,
          explicitUpdatedAt: input.updatedAt ?? null,
          metadata,
          permissions,
          rankingHints,
          fragments: normalizedFragments,
          actions: input.actions ?? [],
        });
        if (existingDocumentFingerprints.get(input.id) === ingestFingerprint) {
          continue;
        }
        upsertDocument.run(
          input.id,
          input.source,
          shard,
          input.domain,
          input.type,
          input.resourceId ?? null,
          input.title,
          input.subtitle ?? null,
          input.snippet ?? null,
          body,
          input.path ?? null,
          updatedAt,
          JSON.stringify(metadata),
          JSON.stringify(permissions),
          JSON.stringify(rankingHints),
          ingestFingerprint,
        );
        if (existingDocumentFingerprints.has(input.id)) {
          deleteFragments.run(input.id);
          deleteActions.run(input.id);
          deleteFts.run(input.id);
          if (previousShard) this.deleteDocumentFromFtsPartition(previousShard.source, previousShard.shard, input.id);
        }
        const partitionTable = this.ensureFtsPartition({ source: input.source, shard, domain: input.domain, updatedAt });
        this.deleteDocumentFromFtsPartition(input.source, shard, input.id);
        insertDocumentFts.run(input.id, input.source, shard, input.domain, input.type, input.title, [input.subtitle, input.snippet, body].filter(Boolean).join("\n"), input.path ?? "");
        this.insertFtsPartitionRow(partitionTable, input.id, null, input.type, input.title, [input.subtitle, input.snippet, body].filter(Boolean).join("\n"), input.path ?? "");
        for (const fragment of normalizedFragments) {
          insertFragment.run(
            fragment.id,
            input.id,
            input.source,
            shard,
            input.domain,
            fragment.title ?? "",
            fragment.body ?? "",
            fragment.snippet ?? null,
            fragment.sortOrder,
            JSON.stringify(fragment.metadata),
          );
          insertFragmentFts.run(input.id, fragment.id, input.source, shard, input.domain, input.type, fragment.title ?? "", [fragment.snippet, fragment.body].filter(Boolean).join("\n"), input.path ?? "");
          this.insertFtsPartitionRow(partitionTable, input.id, fragment.id, input.type, fragment.title ?? "", [fragment.snippet, fragment.body].filter(Boolean).join("\n"), input.path ?? "");
        }
        for (const action of input.actions ?? []) {
          insertAction.run(input.id, action.id, JSON.stringify(action));
        }
        touchedSources.set(input.source, updatedAt);
        touchedCacheScopes.sources.add(input.source);
        touchedCacheScopes.domains.add(input.domain);
        touchedCacheScopes.shards.add(shard);
        touchedShards.set(`${input.source}\0${shard}`, { source: input.source, shard, domain: input.domain, updatedAt });
        if (previousShard && (previousShard.source !== input.source || previousShard.shard !== shard || previousShard.domain !== input.domain)) {
          touchedCacheScopes.sources.add(previousShard.source);
          touchedCacheScopes.domains.add(previousShard.domain);
          touchedCacheScopes.shards.add(previousShard.shard);
          touchedShards.set(`${previousShard.source}\0${previousShard.shard}`, { ...previousShard, updatedAt });
        }
      }
      for (const [source, updatedAt] of touchedSources) {
        updateSource.run(updatedAt, updatedAt, source);
      }
      for (const shard of touchedShards.values()) {
        this.refreshShardStats(shard);
      }
      this.clearRankingCacheForScopes(touchedCacheScopes);
    });
    tx(inputs);
    return inputs.length;
  }

  query(input: SearchQueryInput): SearchQueryOutput {
    const startedAt = Date.now();
    const queryInput = normalizeInlineSearchQuery(input);
    const cacheKey = searchRankingCacheKey(queryInput);
    const cached = this.rankingCacheGet(cacheKey, queryInput);
    if (cached) return { ...cached, elapsedMs: Date.now() - startedAt };
    const requestedLimit = Math.max(1, queryInput.limit ?? 20);
    const outputLimit = effectiveResultLimit(requestedLimit, queryInput.agentBudget);
    const candidateLimit = Math.min(200, Math.max(requestedLimit * 4, requestedLimit));
    const sourceSet = queryInput.sourceSet ?? queryInput.profile ?? "framework";
    const strategy = queryInput.strategy ?? (queryInput.embedding ? "hybrid" : "lexical");
    const match = ftsQuery(queryInput.query);
    const omittedSources = this.omittedSourcesForInput(queryInput, sourceSet);
    const facets = this.facetsForInput(queryInput, sourceSet);
    const shardPlan = this.shardQueryPlan(queryInput, sourceSet);
    if (shardPlan.catalogCovered && shardPlan.activeShards.length === 0) {
      const output: SearchQueryOutput = {
        query: queryInput.query,
        sourceSet,
        results: [],
        ...(facets.length ? { facets } : {}),
        partial: omittedSources.length > 0,
        omittedSources,
        stale: false,
        staleSources: [],
        elapsedMs: Date.now() - startedAt,
      };
      this.rankingCacheSet(cacheKey, queryInput, output);
      return output;
    }
    const plannedQueryInput = shardPlan.catalogCovered && shardPlan.activeShards.length > 0
      ? { ...queryInput, shards: shardPlan.activeShards }
      : queryInput;
    const rows = new Map<string, SearchDocumentRow>();
    const lexicalMatches = new Map<string, SearchLexicalMatch>();
    const ftsDocumentIds = new Set<string>();
    if (strategy !== "semantic" || !plannedQueryInput.embedding) {
      if (match) {
        const lexicalRows = this.lexicalRows(plannedQueryInput, sourceSet, match, candidateLimit);
        for (const row of lexicalRows) {
          rows.set(row.id, row);
          ftsDocumentIds.add(row.id);
        }
        if (rows.size < candidateLimit && shouldRunFuzzyFallback(plannedQueryInput.query)) {
          for (const row of this.fuzzyFallbackRows(plannedQueryInput, sourceSet, candidateLimit, rows, lexicalMatches)) {
            rows.set(row.id, row);
          }
        }
      } else if (this.hasStructuredSearchScope(plannedQueryInput)) {
        for (const row of this.filteredRows(plannedQueryInput, sourceSet, candidateLimit)) {
          rows.set(row.id, row);
        }
      }
    }
    if (plannedQueryInput.embedding && strategy !== "lexical") {
      for (const row of this.semanticRows(plannedQueryInput, sourceSet, plannedQueryInput.embedding, candidateLimit)) {
        const existing = rows.get(row.id);
        rows.set(row.id, existing ? mergeSearchRows(existing, row) : row);
      }
    }
    const rankedCandidates = this.rankCandidateRows(
      [...rows.values()].filter((row) => searchAclAllows(row.permissions_json, plannedQueryInput)),
      plannedQueryInput,
      { lexicalMatches, ftsDocumentIds },
    );
    const budgetFilter = agentBudgetResultFilter(plannedQueryInput.agentBudget);
    const finalRows = rankedCandidates
      .sort((left, right) => right.result.score - left.result.score || (right.result.updatedAt ?? "").localeCompare(left.result.updatedAt ?? ""))
      .filter((candidate) => budgetFilter(candidate.result))
      .slice(0, outputLimit)
      .map((candidate) => candidate.row);
    const results = this.materializeResults(finalRows, plannedQueryInput, { lexicalMatches, ftsDocumentIds });
    const output: SearchQueryOutput = {
      query: queryInput.query,
      sourceSet,
      results,
      ...(facets.length ? { facets } : {}),
      partial: omittedSources.length > 0,
      omittedSources,
      stale: false,
      staleSources: [],
      elapsedMs: Date.now() - startedAt,
    };
    this.rankingCacheSet(cacheKey, queryInput, output);
    return output;
  }

  upsertVector(input: SearchVectorInput): SearchVectorRecord {
    const updatedAt = input.updatedAt ?? new Date().toISOString();
    const embedding = normalizeEmbedding(input.embedding);
    const fragmentId = input.fragmentId ?? "";
    this.db.prepare(`
      INSERT INTO search_vectors (document_id, fragment_id, model, embedding_json, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(document_id, fragment_id, model) DO UPDATE SET
        embedding_json = excluded.embedding_json,
        updated_at = excluded.updated_at
    `).run(input.documentId, fragmentId, input.model, JSON.stringify(embedding), updatedAt);
    const row = this.db.prepare("SELECT source, shard, domain FROM search_documents WHERE id = ? LIMIT 1").get(input.documentId) as { source: string; shard: string; domain: string } | undefined;
    if (row) {
      this.clearRankingCacheForScopes({
        sources: new Set([row.source]),
        domains: new Set([row.domain]),
        shards: new Set([row.shard]),
      });
    } else {
      this.clearRankingCache();
    }
    return { documentId: input.documentId, ...(input.fragmentId ? { fragmentId: input.fragmentId } : {}), model: input.model, embedding, updatedAt };
  }

  listVectors(documentId: string): SearchVectorRecord[] {
    const rows = this.db.prepare(`
      SELECT document_id, fragment_id, model, embedding_json, updated_at
      FROM search_vectors
      WHERE document_id = ?
      ORDER BY model ASC, fragment_id ASC
    `).all(documentId) as SearchVectorRow[];
    return rows.map(searchVectorFromRow);
  }

  indexLocalEmbeddings(input: SearchEmbeddingIndexInput = {}): SearchEmbeddingIndexSummary {
    const model = input.model ?? LOCAL_TEXT_EMBEDDING_MODEL;
    const limit = Math.max(1, Math.min(10_000, Math.floor(Number.isFinite(input.limit) ? input.limit as number : 500)));
    const clauses = [
      "d.deleted_at IS NULL",
      "s.state NOT IN ('disabled', 'paused', 'excluded', 'external_pending')",
      "json_extract(s.manifest_json, '$.capabilities.semantic') IN ('optional', 'required')",
    ];
    const params: unknown[] = [];
    addInClause(clauses, params, "d.source", input.sources);
    addInClause(clauses, params, "d.domain", input.domains);
    addInClause(clauses, params, "d.shard", input.shards);
    const rows = this.db.prepare(`
      SELECT d.id, d.source, d.shard, d.domain, d.title, d.subtitle, d.snippet, d.body, d.updated_at
      FROM search_documents d
      JOIN search_sources s ON s.id = d.source
      WHERE ${clauses.join(" AND ")}
      ORDER BY d.updated_at DESC, d.id ASC
      LIMIT ?
    `).all(...params, limit) as SearchEmbeddingDocumentRow[];
    const fragmentsForDocument = this.db.prepare(`
      SELECT title, snippet, body
      FROM search_fragments
      WHERE document_id = ?
      ORDER BY sort_order ASC, id ASC
      LIMIT 20
    `);
    const updatedAt = new Date().toISOString();
    let indexed = 0;
    const transaction = this.db.transaction((documents: SearchEmbeddingDocumentRow[]) => {
      for (const row of documents) {
        const fragments = fragmentsForDocument.all(row.id) as SearchEmbeddingFragmentRow[];
        const text = searchEmbeddingText(row, fragments);
        if (!text) continue;
        const embedding = createLocalTextEmbedding(text, { model });
        this.upsertVector({
          documentId: row.id,
          model: embedding.model,
          embedding: embedding.vector,
          updatedAt,
        });
        indexed += 1;
      }
    });
    transaction(rows);
    return {
      model,
      documents: rows.length,
      indexed,
      selectedSources: input.sources ?? null,
      selectedDomains: input.domains ?? null,
      selectedShards: input.shards ?? null,
    };
  }

  listEmbeddingStatus(input: SearchEmbeddingStatusInput = {}): SearchEmbeddingStatus[] {
    const clauses = [
      "d.deleted_at IS NULL",
      "s.state NOT IN ('disabled', 'paused', 'excluded', 'external_pending')",
    ];
    const params: unknown[] = [];
    addInClause(clauses, params, "d.source", input.sources);
    addInClause(clauses, params, "d.domain", input.domains);
    addInClause(clauses, params, "d.shard", input.shards);
    if (input.model) {
      clauses.push("v.model = ?");
      params.push(input.model);
    }
    const rows = this.db.prepare(`
      SELECT d.source, d.domain, d.shard, v.model, COUNT(DISTINCT v.document_id) AS documents,
        COUNT(*) AS vectors, MAX(v.updated_at) AS updated_at
      FROM search_vectors v
      JOIN search_documents d ON d.id = v.document_id
      JOIN search_sources s ON s.id = d.source
      WHERE ${clauses.join(" AND ")}
      GROUP BY d.source, d.domain, d.shard, v.model
      ORDER BY d.source ASC, d.shard ASC, v.model ASC
    `).all(...params) as SearchEmbeddingStatusRow[];
    return rows.map((row) => ({
      source: row.source,
      domain: row.domain,
      shard: row.shard,
      model: row.model,
      documents: row.documents,
      vectors: row.vectors,
      ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
    }));
  }

  createAdapterRegistry(): ReturnType<typeof createSearchRegistry> {
    const registry = createSearchRegistry();
    for (const manifest of this.listSources("full")) {
      registry.register({
        manifest,
        query: (input) => this.query({ ...input, sources: [manifest.id] }).results,
        status: () => this.sourceStatus().find((row) => row.source === manifest.id) ?? {
          source: manifest.id,
          domain: manifest.domain,
          state: "disabled",
          backlog: 0,
        },
      });
    }
    return registry;
  }

  tombstone(input: { id?: string; source: string; resourceId: string; reason?: string; deletedAt?: string }): SearchTombstone {
    const deletedAt = input.deletedAt ?? new Date().toISOString();
    const id = input.id ?? `${input.source}:${input.resourceId}`;
    const tx = this.db.transaction(() => {
      const affectedShards = this.db.prepare(`
        SELECT DISTINCT source, shard, domain
        FROM search_documents
        WHERE source = ? AND resource_id = ?
      `).all(input.source, input.resourceId) as Array<{ source: string; shard: string; domain: string }>;
      this.db.prepare(`
        INSERT INTO search_tombstones (id, source, resource_id, deleted_at, reason)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET deleted_at = excluded.deleted_at, reason = excluded.reason
      `).run(id, input.source, input.resourceId, deletedAt, input.reason ?? null);
      this.db.prepare("UPDATE search_documents SET deleted_at = ? WHERE source = ? AND resource_id = ?").run(deletedAt, input.source, input.resourceId);
      for (const shard of affectedShards) {
        this.refreshShardStats({ ...shard, updatedAt: deletedAt });
      }
      this.clearRankingCacheForScopes({
        sources: new Set([input.source]),
        domains: new Set(affectedShards.map((shard) => shard.domain)),
        shards: new Set(affectedShards.map((shard) => shard.shard)),
      });
    });
    tx();
    return { id, source: input.source, resourceId: input.resourceId, deletedAt, ...(input.reason ? { reason: input.reason } : {}) };
  }

  clearRankingCache(): void {
    this.db.prepare("DELETE FROM search_ranking_cache").run();
  }

  clearRankingCacheForScopes(touched: SearchTouchedCacheScopes): void {
    const scopeDelete = rankingCacheScopeDeleteSql(touched);
    if (!scopeDelete) return;
    this.db.prepare(scopeDelete.sql).run(...scopeDelete.params);
  }

  rankingCacheStats(): SearchRankingCacheStats {
    const row = this.db.prepare("SELECT COUNT(*) AS entries, MAX(updated_at) AS updated_at FROM search_ranking_cache").get() as { entries: number; updated_at: string | null };
    return {
      entries: row.entries,
      ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
    };
  }

  setCursor(input: { source: string; shard?: string; cursor: string; watermark?: string; checksum?: string; metadata?: Record<string, unknown>; updatedAt?: string }): SearchSourceCursor {
    const updatedAt = input.updatedAt ?? new Date().toISOString();
    const shard = input.shard ?? "default";
    const metadata = input.metadata ?? {};
    const watermark = input.watermark ?? input.cursor;
    const checksum = input.checksum ?? searchCursorChecksum({ source: input.source, shard, cursor: input.cursor, watermark, metadata });
    this.db.prepare(`
      INSERT INTO search_cursors (source, shard, cursor, watermark, checksum, updated_at, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source, shard) DO UPDATE SET
        cursor = excluded.cursor,
        watermark = excluded.watermark,
        checksum = excluded.checksum,
        updated_at = excluded.updated_at,
        metadata_json = excluded.metadata_json
    `).run(input.source, shard, input.cursor, watermark, checksum, updatedAt, JSON.stringify(metadata));
    return { source: input.source, shard, cursor: input.cursor, watermark, checksum, updatedAt, metadata };
  }

  getCursor(source: string, shard = "default"): SearchSourceCursor | null {
    const row = this.db.prepare("SELECT source, shard, cursor, watermark, checksum, updated_at, metadata_json FROM search_cursors WHERE source = ? AND shard = ?").get(source, shard) as SearchCursorRow | undefined;
    return row ? searchCursorFromRow(row) : null;
  }

  listCursors(source?: string): SearchSourceCursor[] {
    const rows = source
      ? this.db.prepare("SELECT source, shard, cursor, watermark, checksum, updated_at, metadata_json FROM search_cursors WHERE source = ? ORDER BY shard ASC").all(source) as SearchCursorRow[]
      : this.db.prepare("SELECT source, shard, cursor, watermark, checksum, updated_at, metadata_json FROM search_cursors ORDER BY source ASC, shard ASC").all() as SearchCursorRow[];
    return rows.map(searchCursorFromRow);
  }

  listShards(input: { source?: string; domain?: string } = {}): SearchShardStatus[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (input.source) {
      clauses.push("source = ?");
      params.push(input.source);
    }
    if (input.domain) {
      clauses.push("domain = ?");
      params.push(input.domain);
    }
    const rows = this.db.prepare(`
      SELECT source, shard, domain, state, document_count, fragment_count, updated_at
      FROM search_shards
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY source ASC, shard ASC
    `).all(...params) as SearchShardRow[];
    return rows.map(searchShardFromRow);
  }

  enqueueIndexJob(input: SearchIndexJobInput): SearchIndexJob {
    const now = input.createdAt ?? new Date().toISOString();
    const shard = input.shard ?? "default";
    const id = input.id ?? `${input.source}:${shard}:${input.operation}:${input.resourceId ?? Math.random().toString(36).slice(2, 10)}`;
    const priority = Math.max(0, Math.min(100, input.priority ?? 0));
    const scheduledAt = input.scheduledAt ?? now;
    this.db.prepare(`
      INSERT INTO search_index_jobs (
        id, source, shard, operation, resource_id, payload_json, status, attempts,
        priority, scheduled_at, leased_until, error, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?, NULL, NULL, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        source = excluded.source,
        shard = excluded.shard,
        operation = excluded.operation,
        resource_id = excluded.resource_id,
        payload_json = excluded.payload_json,
        status = 'queued',
        priority = excluded.priority,
        scheduled_at = excluded.scheduled_at,
        leased_until = NULL,
        error = NULL,
        updated_at = excluded.updated_at
    `).run(id, input.source, shard, input.operation, input.resourceId ?? null, JSON.stringify(input.payload ?? {}), priority, scheduledAt, now, now);
    return this.indexJob(id) as SearchIndexJob;
  }

  scheduleIndexEvent(input: SearchIndexEventInput): SearchIndexJob {
    const shard = input.shard ?? "hot";
    const observedAt = input.observedAt ?? new Date().toISOString();
    return this.enqueueIndexJob({
      id: `event:${input.source}:${shard}:${input.operation}:${stableJobIdPart(input.resourceId)}`,
      source: input.source,
      shard,
      operation: input.operation,
      resourceId: input.resourceId,
      payload: {
        eventDriven: true,
        observedAt,
        ...(input.payload ?? {}),
      },
      priority: input.priority ?? (input.operation === "delete" ? 80 : 60),
      scheduledAt: input.scheduledAt ?? observedAt,
      createdAt: observedAt,
    });
  }

  claimIndexJobs(input: { limit?: number; now?: string; leaseMs?: number; sources?: string[]; shards?: string[] } = {}): SearchIndexJob[] {
    const limit = Math.max(1, Math.min(100, input.limit ?? 10));
    const now = input.now ?? new Date().toISOString();
    const leasedUntil = new Date(Date.parse(now) + Math.max(1000, input.leaseMs ?? 30_000)).toISOString();
    const clauses = ["status IN ('queued', 'leased')", "scheduled_at <= ?", "(leased_until IS NULL OR leased_until <= ?)"];
    const params: unknown[] = [now, now];
    if (input.sources?.length) {
      clauses.push(`source IN (${input.sources.map(() => "?").join(", ")})`);
      params.push(...input.sources);
    }
    if (input.shards?.length) {
      clauses.push(`shard IN (${input.shards.map(() => "?").join(", ")})`);
      params.push(...input.shards);
    }
    const tx = this.db.transaction(() => {
      const rows = this.db.prepare(`
        SELECT id FROM search_index_jobs
        WHERE ${clauses.join(" AND ")}
        ORDER BY priority DESC, scheduled_at ASC, created_at ASC, id ASC
        LIMIT ?
      `).all(...params, limit) as Array<{ id: string }>;
      const lease = this.db.prepare(`
        UPDATE search_index_jobs
        SET status = 'leased', attempts = attempts + 1, leased_until = ?, updated_at = ?
        WHERE id = ?
      `);
      for (const row of rows) lease.run(leasedUntil, now, row.id);
      return rows.map((row) => this.indexJob(row.id)).filter((job): job is SearchIndexJob => !!job);
    });
    return tx();
  }

  completeIndexJob(id: string, input: { updatedAt?: string } = {}): SearchIndexJob | null {
    const updatedAt = input.updatedAt ?? new Date().toISOString();
    this.db.prepare(`
      UPDATE search_index_jobs
      SET status = 'done', leased_until = NULL, error = NULL, updated_at = ?
      WHERE id = ?
    `).run(updatedAt, id);
    return this.indexJob(id);
  }

  failIndexJob(id: string, input: { error: string; retry?: boolean; scheduledAt?: string; updatedAt?: string }): SearchIndexJob | null {
    const updatedAt = input.updatedAt ?? new Date().toISOString();
    this.db.prepare(`
      UPDATE search_index_jobs
      SET status = ?, leased_until = NULL, error = ?, scheduled_at = COALESCE(?, scheduled_at), updated_at = ?
      WHERE id = ?
    `).run(input.retry === true ? "queued" : "failed", input.error, input.scheduledAt ?? null, updatedAt, id);
    return this.indexJob(id);
  }

  listIndexJobs(input: { status?: SearchIndexJobStatus; source?: string; limit?: number } = {}): SearchIndexJob[] {
    const limit = Math.max(1, Math.min(200, input.limit ?? 50));
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (input.status) {
      clauses.push("status = ?");
      params.push(input.status);
    }
    if (input.source) {
      clauses.push("source = ?");
      params.push(input.source);
    }
    const rows = this.db.prepare(`
      SELECT * FROM search_index_jobs
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY priority DESC, scheduled_at ASC, created_at ASC, id ASC
      LIMIT ?
    `).all(...params, limit) as SearchIndexJobRow[];
    return rows.map(searchIndexJobFromRow);
  }

  upsertFileInventoryEntry(input: SearchFileInventoryInput): SearchFileInventoryEntry {
    const updatedAt = input.updatedAt ?? new Date().toISOString();
    const state = input.state ?? "active";
    this.db.prepare(`
      INSERT INTO search_file_inventory (
        source, root, relative_path, dev, ino, mtime_ms, size, checksum,
        extension, kind, last_seen_generation, last_indexed_at, state, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source, root, relative_path) DO UPDATE SET
        dev = excluded.dev,
        ino = excluded.ino,
        mtime_ms = excluded.mtime_ms,
        size = excluded.size,
        checksum = COALESCE(excluded.checksum, search_file_inventory.checksum),
        extension = excluded.extension,
        kind = excluded.kind,
        last_seen_generation = excluded.last_seen_generation,
        last_indexed_at = COALESCE(excluded.last_indexed_at, search_file_inventory.last_indexed_at),
        state = excluded.state,
        updated_at = excluded.updated_at
    `).run(
      input.source,
      input.root,
      input.relativePath,
      fileInventoryIdentityPart(input.dev),
      fileInventoryIdentityPart(input.ino),
      input.mtimeMs,
      input.size,
      input.checksum ?? null,
      input.extension ?? null,
      input.kind ?? null,
      input.lastSeenGeneration,
      input.lastIndexedAt ?? null,
      state,
      updatedAt,
    );
    const stored = this.fileInventoryEntry(input.source, input.root, input.relativePath);
    if (!stored) throw new Error("Search file inventory upsert failed");
    return stored;
  }

  markFileInventoryIndexed(input: { source: string; root: string; relativePath: string; checksum?: string | null; indexedAt?: string }): SearchFileInventoryEntry | null {
    const indexedAt = input.indexedAt ?? new Date().toISOString();
    this.db.prepare(`
      UPDATE search_file_inventory
      SET checksum = COALESCE(?, checksum), last_indexed_at = ?, state = 'active', updated_at = ?
      WHERE source = ? AND root = ? AND relative_path = ?
    `).run(input.checksum ?? null, indexedAt, indexedAt, input.source, input.root, input.relativePath);
    return this.fileInventoryEntry(input.source, input.root, input.relativePath);
  }

  markFileInventoryDeleted(input: { source: string; root: string; relativePath: string; generation?: number; updatedAt?: string }): SearchFileInventoryEntry | null {
    const updatedAt = input.updatedAt ?? new Date().toISOString();
    this.db.prepare(`
      UPDATE search_file_inventory
      SET state = 'deleted',
          last_seen_generation = COALESCE(?, last_seen_generation),
          updated_at = ?
      WHERE source = ? AND root = ? AND relative_path = ?
    `).run(input.generation ?? null, updatedAt, input.source, input.root, input.relativePath);
    return this.fileInventoryEntry(input.source, input.root, input.relativePath);
  }

  fileInventoryEntry(source: string, root: string, relativePath: string): SearchFileInventoryEntry | null {
    const row = this.db.prepare(`
      SELECT * FROM search_file_inventory
      WHERE source = ? AND root = ? AND relative_path = ?
    `).get(source, root, relativePath) as SearchFileInventoryRow | undefined;
    return row ? searchFileInventoryFromRow(row) : null;
  }

  staleFileInventoryEntries(input: { source: string; root: string; generation: number; limit?: number }): SearchFileInventoryEntry[] {
    const limit = Math.max(1, Math.min(1000, input.limit ?? 100));
    const rows = this.db.prepare(`
      SELECT * FROM search_file_inventory
      WHERE source = ? AND root = ? AND state != 'deleted' AND last_seen_generation < ?
      ORDER BY relative_path ASC
      LIMIT ?
    `).all(input.source, input.root, input.generation, limit) as SearchFileInventoryRow[];
    return rows.map(searchFileInventoryFromRow);
  }

  saveSearch(input: SavedSearchInput): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO saved_searches (id, name, query_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, query_json = excluded.query_json, updated_at = excluded.updated_at
    `).run(input.id, input.name, JSON.stringify(input.query), input.createdAt ?? now, input.updatedAt ?? now);
  }

  listSavedSearches(): Array<SavedSearchInput & { createdAt: string; updatedAt: string }> {
    return (this.db.prepare("SELECT id, name, query_json, created_at, updated_at FROM saved_searches ORDER BY updated_at DESC").all() as SavedSearchRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      query: parseJson(row.query_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  deleteSavedSearch(id: string): boolean {
    const result = this.db.prepare("DELETE FROM saved_searches WHERE id = ?").run(id);
    return result.changes > 0;
  }

  saveMonitor(input: SearchMonitorInput): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO search_monitors (id, saved_search_id, name, enabled, cadence, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        saved_search_id = excluded.saved_search_id,
        name = excluded.name,
        enabled = excluded.enabled,
        cadence = excluded.cadence,
        updated_at = excluded.updated_at
    `).run(input.id, input.savedSearchId, input.name ?? null, input.enabled === false ? 0 : 1, input.cadence ?? null, input.createdAt ?? now, input.updatedAt ?? now);
  }

  listMonitors(): Array<SearchMonitorInput & { enabled: boolean; createdAt: string; updatedAt: string }> {
    return (this.db.prepare("SELECT id, saved_search_id, name, enabled, cadence, created_at, updated_at FROM search_monitors ORDER BY updated_at DESC").all() as SearchMonitorRow[]).map((row) => ({
      id: row.id,
      savedSearchId: row.saved_search_id,
      ...(row.name ? { name: row.name } : {}),
      enabled: row.enabled === 1,
      ...(row.cadence ? { cadence: row.cadence } : {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  deleteMonitor(id: string): boolean {
    const result = this.db.prepare("DELETE FROM search_monitors WHERE id = ?").run(id);
    return result.changes > 0;
  }

  recordAuditEvent(input: SearchAuditEventInput): SearchAuditEvent {
    const createdAt = input.createdAt ?? new Date().toISOString();
    const id = `audit:${createdAt}:${Math.random().toString(36).slice(2, 10)}`;
    this.db.prepare(`
      INSERT INTO search_audit_events (
        id, type, actor, surface, query, source, domain, result_id, action_id,
        status, risk, grant_id, reason, metadata_json, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.type,
      input.actor ?? null,
      input.surface ?? null,
      input.query ?? null,
      input.source ?? null,
      input.domain ?? null,
      input.resultId ?? null,
      input.actionId ?? null,
      input.status ?? null,
      input.risk ?? null,
      input.grant ?? null,
      input.reason ?? null,
      JSON.stringify(input.metadata ?? {}),
      createdAt,
    );
    return { ...input, id, createdAt };
  }

  listAuditEvents(input: { limit?: number; type?: SearchAuditEventType } = {}): SearchAuditEvent[] {
    const limit = Math.max(1, Math.min(200, input.limit ?? 50));
    const rows = input.type
      ? this.db.prepare(`
        SELECT * FROM search_audit_events
        WHERE type = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ?
      `).all(input.type, limit) as SearchAuditEventRow[]
      : this.db.prepare(`
        SELECT * FROM search_audit_events
        ORDER BY created_at DESC, id DESC
        LIMIT ?
      `).all(limit) as SearchAuditEventRow[];
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      ...(row.actor ? { actor: row.actor } : {}),
      ...(row.surface ? { surface: row.surface } : {}),
      ...(row.query ? { query: row.query } : {}),
      ...(row.source ? { source: row.source } : {}),
      ...(row.domain ? { domain: row.domain } : {}),
      ...(row.result_id ? { resultId: row.result_id } : {}),
      ...(row.action_id ? { actionId: row.action_id } : {}),
      ...(row.status ? { status: row.status } : {}),
      ...(row.risk ? { risk: row.risk } : {}),
      ...(row.grant_id ? { grant: row.grant_id } : {}),
      ...(row.reason ? { reason: row.reason } : {}),
      metadata: parseJson(row.metadata_json),
      createdAt: row.created_at,
      }));
  }

  recordInteraction(input: SearchInteractionInput): SearchInteraction | null {
    const row = this.db.prepare(`
      SELECT id, source, shard, domain
      FROM search_documents
      WHERE id = ? AND deleted_at IS NULL
      LIMIT 1
    `).get(input.resultId) as Pick<SearchDocumentRow, "id" | "source" | "shard" | "domain"> | undefined;
    if (!row) return null;
    const now = input.createdAt ?? new Date().toISOString();
    const actor = input.actor?.trim() ?? "";
    const surface = input.surface?.trim() ?? "";
    const actionId = input.actionId?.trim() ?? "";
    const kind = input.kind ?? "action";
    const metadata = input.metadata ?? {};
    this.db.prepare(`
      INSERT INTO search_interactions (
        document_id, source, shard, domain, actor, surface, action_id,
        kind, interaction_count, last_interacted_at, metadata_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(document_id, actor, surface, action_id, kind) DO UPDATE SET
        source = excluded.source,
        shard = excluded.shard,
        domain = excluded.domain,
        interaction_count = search_interactions.interaction_count + 1,
        last_interacted_at = excluded.last_interacted_at,
        metadata_json = excluded.metadata_json
    `).run(row.id, row.source, row.shard, row.domain, actor, surface, actionId, kind, now, JSON.stringify(metadata));
    this.clearRankingCacheForScopes({
      sources: new Set([row.source]),
      domains: new Set([row.domain]),
      shards: new Set([row.shard]),
    });
    const stored = this.db.prepare(`
      SELECT document_id, source, shard, domain, actor, surface, action_id, kind,
        interaction_count, last_interacted_at, metadata_json
      FROM search_interactions
      WHERE document_id = ? AND actor = ? AND surface = ? AND action_id = ? AND kind = ?
      LIMIT 1
    `).get(row.id, actor, surface, actionId, kind) as SearchInteractionRow;
    return searchInteractionFromRow(stored);
  }

  actionsForResult(resultId: string, access: SearchResultAccessInput = {}): SearchAction[] {
    return (this.db.prepare(`
      SELECT a.action_json, d.permissions_json
      FROM search_actions a
      JOIN search_documents d ON d.id = a.document_id
      JOIN search_sources s ON s.id = d.source
      WHERE a.document_id = ?
        AND d.deleted_at IS NULL
        AND s.state NOT IN ('disabled', 'paused', 'excluded', 'external_pending')
      ORDER BY a.action_id ASC
    `).all(resultId) as Array<{ action_json: string; permissions_json: string }>)
      .filter((action) => searchAclAllows(action.permissions_json, { query: "", ...access }))
      .map((action) => parseJson<SearchAction>(action.action_json));
  }

  resultForId(resultId: string, access: SearchResultAccessInput = {}): SearchResult | null {
    const row = this.db.prepare(`
      SELECT d.*, 0 AS rank
      FROM search_documents d
      JOIN search_sources s ON s.id = d.source
      WHERE d.id = ? AND d.deleted_at IS NULL AND s.state NOT IN ('disabled', 'paused', 'excluded', 'external_pending')
      LIMIT 1
    `).get(resultId) as SearchDocumentRow | undefined;
    if (!row || !searchAclAllows(row.permissions_json, { query: "", ...access })) return null;
    return this.materializeResults([row], { query: "", ...access })[0] ?? null;
  }

  private indexJob(id: string): SearchIndexJob | null {
    const row = this.db.prepare("SELECT * FROM search_index_jobs WHERE id = ?").get(id) as SearchIndexJobRow | undefined;
    return row ? searchIndexJobFromRow(row) : null;
  }

  private seedSourceSets(): void {
    const insert = this.db.prepare(`
      INSERT INTO search_source_sets (id, label, default_enabled)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET label = excluded.label, default_enabled = excluded.default_enabled
    `);
    for (const sourceSet of SEARCH_SOURCE_SETS) insert.run(sourceSet.id, sourceSet.label, sourceSet.defaultEnabled ? 1 : 0);
  }

  private ensureSchema(): void {
    try {
      this.db.exec(SEARCH_SCHEMA_SQL);
      if (!this.tableHasColumn("search_documents", "ingest_fingerprint")) {
        this.db.exec("ALTER TABLE search_documents ADD COLUMN ingest_fingerprint TEXT");
      }
      if (
        !this.tableHasColumn("search_cursors", "shard")
        || !this.tableHasColumn("search_cursors", "watermark")
        || !this.tableHasColumn("search_cursors", "checksum")
        || !this.tableHasColumn("search_documents", "shard")
        || !this.tableHasColumn("search_fragments", "shard")
        || !this.tableHasColumn("search_fts", "shard")
        || !this.tableHasColumn("search_ranking_cache", "payload_json")
        || !this.tableHasColumn("search_ranking_cache", "byte_count")
        || !this.tableHasColumn("search_ranking_cache", "source_count")
        || !this.tableHasColumn("search_ranking_cache", "domain_count")
        || !this.tableHasColumn("search_ranking_cache", "shard_count")
        || !this.tableExists("search_ranking_cache_scopes")
        || !this.tableExists("search_source_sets")
        || !this.tableExists("search_file_inventory")
        || !this.tableHasColumn("search_sources", "source_set")
      ) {
        this.resetSearchSchema();
        this.db.exec(SEARCH_SCHEMA_SQL);
      }
    } catch (error) {
      if (!isRebuildableSearchSchemaMismatch(error)) throw error;
      this.resetSearchSchema();
      this.db.exec(SEARCH_SCHEMA_SQL);
    }
  }

  private tableHasColumn(table: string, column: string): boolean {
    const rows = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return rows.some((row) => row.name === column);
  }

  private resetSearchSchema(): void {
    this.dropFtsPartitions();
    this.db.exec(SEARCH_RESET_SQL);
  }

  private ensureFtsPartition(input: { source: string; shard: string; domain: string; updatedAt: string }): string {
    const tableName = ftsPartitionTableName(input.source, input.shard);
    const quotedTable = quoteSqlIdentifier(tableName);
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS ${quotedTable} USING fts5(
        doc_id UNINDEXED,
        fragment_id UNINDEXED,
        type UNINDEXED,
        title,
        body,
        path,
        tokenize='unicode61'
      )
    `);
    this.db.prepare(`
      INSERT INTO search_fts_partitions (source, shard, domain, table_name, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(source, shard) DO UPDATE SET
        domain = excluded.domain,
        table_name = excluded.table_name,
        updated_at = excluded.updated_at
    `).run(input.source, input.shard, input.domain, tableName, input.updatedAt);
    return tableName;
  }

  private deleteDocumentFromFtsPartition(source: string, shard: string, documentId: string): void {
    const partition = this.ftsPartitionForShard(source, shard);
    if (!partition) return;
    this.db.prepare(`DELETE FROM ${quoteSqlIdentifier(partition.tableName)} WHERE doc_id = ?`).run(documentId);
  }

  private insertFtsPartitionRow(tableName: string, documentId: string, fragmentId: string | null, type: string, title: string, body: string, filePath: string): void {
    this.db.prepare(`
      INSERT INTO ${quoteSqlIdentifier(tableName)} (doc_id, fragment_id, type, title, body, path)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(documentId, fragmentId, type, title, body, filePath);
  }

  private dropFtsPartitions(input: { source?: string; shard?: string } = {}): void {
    if (!this.tableExists("search_fts_partitions")) return;
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (input.source) {
      clauses.push("source = ?");
      params.push(input.source);
    }
    if (input.shard) {
      clauses.push("shard = ?");
      params.push(input.shard);
    }
    const rows = this.db.prepare(`
      SELECT table_name FROM search_fts_partitions
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
    `).all(...params) as Array<{ table_name: string }>;
    for (const row of rows) this.db.exec(`DROP TABLE IF EXISTS ${quoteSqlIdentifier(row.table_name)}`);
    this.db.prepare(`
      DELETE FROM search_fts_partitions
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
    `).run(...params);
  }

  private tableExists(table: string): boolean {
    const row = this.db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?").get(table) as { name: string } | undefined;
    return !!row;
  }

  private ftsPartitionForShard(source: string, shard: string): { source: string; shard: string; domain: string; tableName: string } | null {
    if (!this.tableExists("search_fts_partitions")) return null;
    const row = this.db.prepare(`
      SELECT source, shard, domain, table_name
      FROM search_fts_partitions
      WHERE source = ? AND shard = ?
      LIMIT 1
    `).get(source, shard) as SearchFtsPartitionRow | undefined;
    return row ? searchFtsPartitionFromRow(row) : null;
  }

  private lexicalRows(input: SearchQueryInput, sourceSet: SearchSourceSetId, match: string, limit: number): SearchDocumentRow[] {
    const partitions = this.ftsPartitionsForInput(input, sourceSet);
    if (partitions.length > 0) return this.lexicalRowsFromPartitions(partitions, input, sourceSet, match, limit);
    return this.lexicalRowsFromGlobalFts(input, sourceSet, match, limit);
  }

  private lexicalRowsFromGlobalFts(input: SearchQueryInput, sourceSet: SearchSourceSetId, match: string, limit: number): SearchDocumentRow[] {
    const { clauses, params } = buildDocumentClauses(input, sourceSet);
    return this.db.prepare(`
      SELECT d.*, MIN(hit.rank) AS rank, NULL AS semantic_score
      FROM (
        SELECT doc_id, rank
        FROM search_fts
        WHERE search_fts MATCH ?
      ) hit
      JOIN search_documents d ON d.id = hit.doc_id
      JOIN search_sources s ON s.id = d.source
      WHERE ${clauses.join(" AND ")}
      GROUP BY d.id
      ORDER BY rank ASC, d.updated_at DESC
      LIMIT ?
    `).all(match, ...params, limit) as SearchDocumentRow[];
  }

  private lexicalRowsFromPartitions(partitions: Array<{ tableName: string }>, input: SearchQueryInput, sourceSet: SearchSourceSetId, match: string, limit: number): SearchDocumentRow[] {
    const { clauses, params } = buildDocumentClauses(input, sourceSet);
    const selects: string[] = [];
    const allParams: unknown[] = [];
    for (const partition of partitions) {
      const table = quoteSqlIdentifier(partition.tableName);
      selects.push(`
        SELECT d.*, MIN(hit.rank) AS rank, NULL AS semantic_score
        FROM (
          SELECT doc_id, rank
          FROM ${table}
          WHERE ${table} MATCH ?
        ) hit
        JOIN search_documents d ON d.id = hit.doc_id
        JOIN search_sources s ON s.id = d.source
        WHERE ${clauses.join(" AND ")}
        GROUP BY d.id
      `);
      allParams.push(match, ...params);
    }
    return this.db.prepare(`
      SELECT *
      FROM (${selects.join(" UNION ALL ")})
      GROUP BY id
      ORDER BY rank ASC, updated_at DESC
      LIMIT ?
    `).all(...allParams, limit) as SearchDocumentRow[];
  }

  private ftsPartitionsForInput(input: SearchQueryInput, sourceSet: SearchSourceSetId): Array<{ source: string; shard: string; domain: string; tableName: string }> {
    if (!input.shards?.length || !this.tableExists("search_fts_partitions")) return [];
    const shardClauses: string[] = [`shard IN (${input.shards.map(() => "?").join(", ")})`, "state = 'active'", "document_count > 0"];
    const shardParams: unknown[] = [...input.shards];
    if (input.sources?.length) {
      shardClauses.push(`source IN (${input.sources.map(() => "?").join(", ")})`);
      shardParams.push(...input.sources);
    }
    if (input.domains?.length) {
      shardClauses.push(`domain IN (${input.domains.map(() => "?").join(", ")})`);
      shardParams.push(...input.domains);
    }
    if (sourceSet !== "full") shardClauses.push("source IN (SELECT id FROM search_sources WHERE source_set = 'framework')");
    const activeShards = this.db.prepare(`
      SELECT source, shard, domain
      FROM search_shards
      WHERE ${shardClauses.join(" AND ")}
      ORDER BY source ASC, shard ASC
    `).all(...shardParams) as Array<{ source: string; shard: string; domain: string }>;
    if (activeShards.length === 0) return [];
    const partitions = this.db.prepare(`
      SELECT source, shard, domain, table_name
      FROM search_fts_partitions
      WHERE source = ? AND shard = ?
      LIMIT 1
    `);
    const out: Array<{ source: string; shard: string; domain: string; tableName: string }> = [];
    for (const shard of activeShards) {
      const row = partitions.get(shard.source, shard.shard) as SearchFtsPartitionRow | undefined;
      if (!row) return [];
      out.push(searchFtsPartitionFromRow(row));
    }
    return out;
  }

  private refreshShardStats(input: { source: string; shard: string; domain: string; updatedAt: string }): void {
    this.db.prepare(`
      INSERT INTO search_shards (source, shard, domain, state, document_count, fragment_count, updated_at)
      VALUES (?, ?, ?, 'active', 0, 0, ?)
      ON CONFLICT(source, shard) DO UPDATE SET domain = excluded.domain, updated_at = excluded.updated_at
    `).run(input.source, input.shard, input.domain, input.updatedAt);
    this.db.prepare(`
      UPDATE search_shards
      SET
        state = CASE
          WHEN (
            SELECT COUNT(*)
            FROM search_documents
            WHERE source = ? AND shard = ? AND deleted_at IS NULL
          ) > 0 THEN 'active'
          ELSE 'empty'
        END,
        document_count = (
          SELECT COUNT(*)
          FROM search_documents
          WHERE source = ? AND shard = ? AND deleted_at IS NULL
        ),
        fragment_count = (
          SELECT COUNT(*)
          FROM search_fragments f
          JOIN search_documents d ON d.id = f.document_id
          WHERE f.source = ? AND f.shard = ? AND d.deleted_at IS NULL
        ),
        updated_at = ?
      WHERE source = ? AND shard = ?
    `).run(
      input.source,
      input.shard,
      input.source,
      input.shard,
      input.source,
      input.shard,
      input.updatedAt,
      input.source,
      input.shard,
    );
  }

  private indexingLimitsForSource(source: string): SearchSourceIndexingLimits {
    const row = this.db.prepare("SELECT manifest_json FROM search_sources WHERE id = ?").get(source) as { manifest_json: string } | undefined;
    const limits = row ? parseJson<SearchSourceManifest>(row.manifest_json).indexing.limits : undefined;
    return {
      maxBodyBytes: Math.max(1024, limits?.maxBodyBytes ?? 64 * 1024),
      maxFragments: Math.max(0, limits?.maxFragments ?? 50),
      maxFragmentBytes: Math.max(512, limits?.maxFragmentBytes ?? 8 * 1024),
    };
  }

  private omittedSourcesForInput(input: SearchQueryInput, sourceSet: SearchSourceSetId): SearchQueryOutput["omittedSources"] {
    const selectedClauses: string[] = [];
    const params: unknown[] = [];
    const explicitlyScoped = Boolean(input.sources?.length || input.domains?.length);
    if (input.sources?.length) {
      selectedClauses.push(`id IN (${input.sources.map(() => "?").join(", ")})`);
      params.push(...input.sources);
    }
    if (input.domains?.length) {
      selectedClauses.push(`domain IN (${input.domains.map(() => "?").join(", ")})`);
      params.push(...input.domains);
    }
    if (sourceSet !== "full" && !explicitlyScoped) {
      selectedClauses.push("source_set = 'framework'");
    }
    const omissionClauses = ["state IN ('disabled', 'paused', 'excluded', 'external_pending')"];
    if (sourceSet !== "full" && explicitlyScoped) omissionClauses.push("source_set != 'framework'");
    const rows = this.db.prepare(`
      SELECT id, state, source_set AS sourceSet FROM search_sources
      WHERE ${selectedClauses.length ? `${selectedClauses.join(" AND ")} AND ` : ""}(${omissionClauses.join(" OR ")})
      ORDER BY domain ASC, id ASC
    `).all(...params) as Array<{ id: string; state: SearchSourceState; sourceSet: string }>;
    return rows.map((row) => row.sourceSet !== "framework" && sourceSet !== "full"
      ? { source: row.id, reason: "sourceSet" as const, message: "source is only available in the full sourceSet" }
      : { source: row.id, reason: "disabled" as const, message: `source is ${row.state}` });
  }

  private facetsForInput(input: SearchQueryInput, sourceSet: SearchSourceSetId): SearchFacetDeclaration[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (input.sources?.length) {
      clauses.push(`id IN (${input.sources.map(() => "?").join(", ")})`);
      params.push(...input.sources);
    }
    if (input.domains?.length) {
      clauses.push(`domain IN (${input.domains.map(() => "?").join(", ")})`);
      params.push(...input.domains);
    }
    if (sourceSet !== "full") clauses.push("source_set = 'framework'");
    const rows = this.db.prepare(`
      SELECT manifest_json FROM search_sources
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY domain ASC, id ASC
    `).all(...params) as Array<{ manifest_json: string }>;
    const facets = new Map<string, SearchFacetDeclaration>();
    for (const row of rows) {
      const manifest = parseJson<SearchSourceManifest>(row.manifest_json);
      for (const facet of manifest.facets ?? []) {
        if (!facets.has(facet.id)) facets.set(facet.id, facet);
      }
    }
    return [...facets.values()];
  }

  private shardQueryPlan(input: SearchQueryInput, sourceSet: SearchSourceSetId): { catalogCovered: boolean; activeShards: string[] } {
    if (!input.shards?.length) return { catalogCovered: false, activeShards: [] };
    const coverageClauses: string[] = ["shard IN (" + input.shards.map(() => "?").join(", ") + ")"];
    const activeClauses: string[] = [...coverageClauses, "state = 'active'", "document_count > 0"];
    const params: unknown[] = [...input.shards];
    const activeParams: unknown[] = [...params];
    if (input.sources?.length) {
      const clause = `source IN (${input.sources.map(() => "?").join(", ")})`;
      coverageClauses.push(clause);
      activeClauses.push(clause);
      params.push(...input.sources);
      activeParams.push(...input.sources);
    }
    if (input.domains?.length) {
      const clause = `domain IN (${input.domains.map(() => "?").join(", ")})`;
      coverageClauses.push(clause);
      activeClauses.push(clause);
      params.push(...input.domains);
      activeParams.push(...input.domains);
    }
    if (sourceSet !== "full") {
      coverageClauses.push("source IN (SELECT id FROM search_sources WHERE source_set = 'framework')");
      activeClauses.push("source IN (SELECT id FROM search_sources WHERE source_set = 'framework')");
    }
    const coverage = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM search_shards
      WHERE ${coverageClauses.join(" AND ")}
    `).get(...params) as { count: number };
    if (coverage.count === 0) return { catalogCovered: false, activeShards: [] };
    const rows = this.db.prepare(`
      SELECT DISTINCT shard
      FROM search_shards
      WHERE ${activeClauses.join(" AND ")}
      ORDER BY shard ASC
    `).all(...activeParams) as Array<{ shard: string }>;
    return { catalogCovered: true, activeShards: rows.map((row) => row.shard) };
  }

  private semanticRows(input: SearchQueryInput, sourceSet: SearchSourceSetId, embedding: NonNullable<SearchQueryInput["embedding"]>, limit: number): SearchDocumentRow[] {
    const queryVector = normalizeEmbedding(embedding.vector);
    const { clauses, params } = buildDocumentClauses(input, sourceSet);
    const vectorRows = this.db.prepare(`
      SELECT v.document_id, v.embedding_json, d.updated_at
      FROM search_vectors v
      JOIN search_documents d ON d.id = v.document_id
      JOIN search_sources s ON s.id = d.source
      WHERE v.model = ? AND ${clauses.join(" AND ")}
      ORDER BY d.updated_at DESC
      LIMIT ?
    `).all(embedding.model, ...params, Math.max(limit * 4, limit)) as SearchSemanticCandidateRow[];
    const byDocument = new Map<string, SearchSemanticCandidate>();
    for (const row of vectorRows) {
      const similarity = cosineSimilarity(queryVector, parseJson<number[]>(row.embedding_json));
      if (similarity <= 0) continue;
      const semanticScore = similarity * 100;
      const candidate: SearchSemanticCandidate = {
        documentId: row.document_id,
        updatedAt: row.updated_at,
        rank: Math.max(0, 100 - semanticScore),
        semanticScore,
      };
      const existing = byDocument.get(row.document_id);
      if (!existing || candidate.semanticScore > existing.semanticScore) byDocument.set(row.document_id, candidate);
    }
    const candidates = [...byDocument.values()]
      .sort((left, right) => right.semanticScore - left.semanticScore || right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, limit);
    if (!candidates.length) return [];
    const documentIds = candidates.map((candidate) => candidate.documentId);
    const documentRows = this.db.prepare(`
      SELECT d.*, 0 AS rank, NULL AS semantic_score
      FROM search_documents d
      WHERE d.id IN (${documentIds.map(() => "?").join(", ")})
    `).all(...documentIds) as SearchDocumentRow[];
    const documentsById = new Map(documentRows.map((row) => [row.id, row]));
    return candidates.flatMap((candidate) => {
      const row = documentsById.get(candidate.documentId);
      return row ? [{
        ...row,
        rank: candidate.rank,
        semantic_score: candidate.semanticScore,
      }] : [];
    });
  }

  private fuzzyFallbackRows(
    input: SearchQueryInput,
    sourceSet: SearchSourceSetId,
    limit: number,
    existingRows: Map<string, SearchDocumentRow>,
    lexicalMatches: Map<string, SearchLexicalMatch>,
  ): SearchDocumentRow[] {
    const { clauses, params } = buildDocumentClauses(input, sourceSet);
    const scanLimit = Math.min(1000, Math.max(limit * 8, 100));
    const rows = this.db.prepare(`
      SELECT d.*, 100 AS rank, NULL AS semantic_score
      FROM search_documents d
      JOIN search_sources s ON s.id = d.source
      WHERE ${clauses.join(" AND ")}
      ORDER BY d.updated_at DESC
      LIMIT ?
    `).all(...params, scanLimit) as SearchDocumentRow[];
    return rows
      .filter((row) => !existingRows.has(row.id))
      .map((row) => ({ row, match: scoreLexicalMatch(input.query, this.lexicalTextForRow(row, true)) }))
      .filter((entry) => entry.match.matchedBy.includes("fuzzy"))
      .sort((left, right) => right.match.score - left.match.score || (right.row.updated_at ?? "").localeCompare(left.row.updated_at ?? ""))
      .slice(0, Math.max(0, limit - existingRows.size))
      .map((entry) => {
        lexicalMatches.set(entry.row.id, entry.match);
        return entry.row;
      });
  }

  private filteredRows(input: SearchQueryInput, sourceSet: SearchSourceSetId, limit: number): SearchDocumentRow[] {
    const { clauses, params } = buildDocumentClauses(input, sourceSet);
    return this.db.prepare(`
      SELECT d.*, 100 AS rank, NULL AS semantic_score
      FROM search_documents d
      JOIN search_sources s ON s.id = d.source
      WHERE ${clauses.join(" AND ")}
      ORDER BY d.updated_at DESC, d.id ASC
      LIMIT ?
    `).all(...params, limit) as SearchDocumentRow[];
  }

  private hasStructuredSearchScope(input: SearchQueryInput): boolean {
    return Boolean(
      input.domains?.length
      || input.sources?.length
      || input.shards?.length
      || Object.values(input.filters ?? {}).some((value) => {
        if (Array.isArray(value)) return value.length > 0;
        return value !== undefined && value !== null && value !== "";
      }),
    );
  }

  private rankCandidateRows(rows: SearchDocumentRow[], input: SearchQueryInput, options: SearchMaterializationOptions): Array<{ row: SearchDocumentRow; result: SearchResult }> {
    if (!rows.length) return [];
    const interactionsByDocument = this.interactionsByDocument(rows.map((row) => row.id));
    return rows.map((row) => {
      const lexical = options.lexicalMatches?.get(row.id) ?? this.lexicalMatchForRow(row, input, options.ftsDocumentIds?.has(row.id) === true);
      const rankingHints = parseJson<Record<string, number>>(row.ranking_json);
      const metadata = parseJson(row.metadata_json);
      const localFrecency = this.localFrecencyFromInteractions(interactionsByDocument.get(row.id) ?? [], input);
      const score = centralSearchScore({ lexicalScore: lexical.score, semanticScore: row.semantic_score ?? 0, rowRank: this.normalizedRowRank(row.rank), rankingHints, metadata, input, localFrecency });
      return {
        row,
        result: {
          id: row.id,
          source: row.source,
          domain: row.domain,
          type: row.type,
          title: row.title,
          score: score.total,
          updatedAt: row.updated_at,
        },
      };
    });
  }

  private materializeResults(rows: SearchDocumentRow[], input: SearchQueryInput, options: SearchMaterializationOptions = {}): SearchResult[] {
    if (!rows.length) return [];
    const permissionsById = new Map<string, NonNullable<SearchResult["permissions"]>>();
    const previewableIds: string[] = [];
    for (const row of rows) {
      const permissions = { canOpen: true, canPreview: true, redacted: false, ...parseJson(row.permissions_json) };
      permissionsById.set(row.id, permissions);
      if (permissions.redacted !== true && permissions.canPreview !== false) previewableIds.push(row.id);
    }
    const allIds = rows.map((row) => row.id);
    const fragmentsByDocument = this.fragmentsByDocument(previewableIds, input);
    const actionsByDocument = this.actionsByDocument(allIds);
    const interactionsByDocument = this.interactionsByDocument(allIds);

    return rows.map((row) => {
      const permissions = permissionsById.get(row.id) ?? { canOpen: true, canPreview: true, redacted: false };
      const previewRedacted = permissions.redacted === true || permissions.canPreview === false;
      const fragmentsWithMatch = previewRedacted ? [] : fragmentsByDocument.get(row.id) ?? [];
      const fragments = fragmentsWithMatch.map((entry) => entry.fragment);
      const actions = actionsByDocument.get(row.id) ?? [];
      const lexical = options.lexicalMatches?.get(row.id) ?? this.lexicalMatchForRow(row, input, options.ftsDocumentIds?.has(row.id) === true);
      const rankingHints = parseJson<Record<string, number>>(row.ranking_json);
      const metadata = parseJson(row.metadata_json);
      const localFrecency = this.localFrecencyFromInteractions(interactionsByDocument.get(row.id) ?? [], input);
      const score = centralSearchScore({ lexicalScore: lexical.score, semanticScore: row.semantic_score ?? 0, rowRank: this.normalizedRowRank(row.rank), rankingHints, metadata, input, localFrecency });
      const matchedBy = lexical.matchedBy.length
        ? [...lexical.matchedBy]
        : [...(fragmentsWithMatch.find((entry) => entry.match.matchedBy.length)?.match.matchedBy ?? [])];
      if ((row.semantic_score ?? 0) > 0 && !matchedBy.includes("semantic")) matchedBy.push("semantic");
      return {
        id: row.id,
        source: row.source,
        ...(row.shard !== "default" ? { shard: row.shard } : {}),
        domain: row.domain,
        type: row.type,
        title: row.title,
        ...(row.subtitle ? { subtitle: row.subtitle } : {}),
        snippet: previewRedacted ? "[redacted]" : row.snippet ?? row.body.slice(0, 180),
        score: score.total,
        updatedAt: row.updated_at,
        ...(row.resource_id ? { resourceId: row.resource_id } : {}),
        ...(row.path ? { path: row.path } : {}),
        ...(fragments.length ? { fragments } : {}),
        ...(actions.length ? { actions } : {}),
        permissions: {
          ...permissions,
          ...(previewRedacted ? { canPreview: false, redacted: true } : {}),
        },
        metadata,
        ...(input.explain ? {
          explanation: {
            sourceScore: lexical.score,
            rankingHints: localFrecency > 0 ? { ...rankingHints, localFrecency } : rankingHints,
            scoreBreakdown: score.breakdown,
            matchedBy,
          },
        } : {}),
      };
    });
  }

  private fragmentsByDocument(documentIds: string[], input: SearchQueryInput): Map<string, SearchFragmentMaterialization[]> {
    const fragmentsByDocument = new Map<string, SearchFragmentMaterialization[]>();
    const uniqueIds = [...new Set(documentIds)];
    if (!uniqueIds.length) return fragmentsByDocument;
    const placeholders = uniqueIds.map(() => "?").join(", ");
    const rows = this.db.prepare(`
      SELECT id, document_id, title, snippet, body
      FROM (
        SELECT id, document_id, title, snippet, body,
          ROW_NUMBER() OVER (PARTITION BY document_id ORDER BY sort_order ASC, id ASC) AS row_number
        FROM search_fragments
        WHERE document_id IN (${placeholders})
      )
      WHERE row_number <= 5
      ORDER BY document_id ASC, row_number ASC
    `).all(...uniqueIds) as Array<SearchFragmentRow & { document_id: string }>;
    for (const fragment of rows) {
      const match = scoreLexicalMatch(input.query, `${fragment.title} ${fragment.snippet ?? ""} ${fragment.body}`);
      const entries = fragmentsByDocument.get(fragment.document_id) ?? [];
      entries.push({
        fragment: {
          id: fragment.id,
          title: fragment.title || undefined,
          snippet: fragment.snippet || fragment.body.slice(0, 180) || undefined,
          score: match.score,
        },
        match,
      });
      fragmentsByDocument.set(fragment.document_id, entries);
    }
    return fragmentsByDocument;
  }

  private actionsByDocument(documentIds: string[]): Map<string, SearchAction[]> {
    const actionsByDocument = new Map<string, SearchAction[]>();
    const uniqueIds = [...new Set(documentIds)];
    if (!uniqueIds.length) return actionsByDocument;
    const placeholders = uniqueIds.map(() => "?").join(", ");
    const rows = this.db.prepare(`
      SELECT document_id, action_json
      FROM search_actions
      WHERE document_id IN (${placeholders})
      ORDER BY document_id ASC, action_id ASC
    `).all(...uniqueIds) as Array<{ document_id: string; action_json: string }>;
    for (const row of rows) {
      const entries = actionsByDocument.get(row.document_id) ?? [];
      entries.push(parseJson<SearchAction>(row.action_json));
      actionsByDocument.set(row.document_id, entries);
    }
    return actionsByDocument;
  }

  private interactionsByDocument(documentIds: string[]): Map<string, SearchInteractionRow[]> {
    const interactionsByDocument = new Map<string, SearchInteractionRow[]>();
    const uniqueIds = [...new Set(documentIds)];
    if (!uniqueIds.length) return interactionsByDocument;
    const placeholders = uniqueIds.map(() => "?").join(", ");
    const rows = this.db.prepare(`
      SELECT document_id, source, shard, domain, actor, surface, action_id, kind,
        interaction_count, last_interacted_at, metadata_json
      FROM search_interactions
      WHERE document_id IN (${placeholders})
      ORDER BY document_id ASC, last_interacted_at DESC
    `).all(...uniqueIds) as SearchInteractionRow[];
    for (const row of rows) {
      const entries = interactionsByDocument.get(row.document_id) ?? [];
      entries.push(row);
      interactionsByDocument.set(row.document_id, entries);
    }
    return interactionsByDocument;
  }

  private lexicalMatchForRow(row: SearchDocumentRow, input: SearchQueryInput, matchedByFts: boolean): SearchLexicalMatch {
    const headerMatch = scoreLexicalMatch(input.query, `${row.title} ${row.subtitle ?? ""} ${row.snippet ?? ""}`);
    if (headerMatch.score > 0) return headerMatch;
    if (matchedByFts) return { score: 70, matchedBy: ["fts"] };
    return scoreLexicalMatch(input.query, this.lexicalTextForRow(row, true));
  }

  private lexicalTextForRow(row: SearchDocumentRow, includeBody: boolean): string {
    return [
      row.title,
      row.subtitle ?? "",
      row.snippet ?? "",
      includeBody ? row.body.slice(0, SEARCH_RESULT_LEXICAL_BODY_CHARS) : "",
    ].filter(Boolean).join(" ");
  }

  private normalizedRowRank(rank: number | undefined): number {
    if (typeof rank !== "number" || !Number.isFinite(rank)) return 0;
    if (rank <= 0) return 0;
    return Math.min(99, rank);
  }

  private localFrecencyFromInteractions(rows: SearchInteractionRow[], input: SearchQueryInput): number {
    if (!rows.length) return 0;
    const actor = input.actor?.trim() ?? "";
    const surface = input.surface?.trim() ?? "";
    let score = 0;
    for (const row of rows) {
      const count = Math.max(0, row.interaction_count);
      score += Math.min(0.35, count * 0.08);
      if (actor && row.actor === actor) score += Math.min(0.35, count * 0.12);
      if (surface && row.surface === surface) score += Math.min(0.2, count * 0.08);
    }
    return Math.min(1, score);
  }

  private rankingCacheGet(cacheKey: string, input: SearchQueryInput): SearchQueryOutput | null {
    const row = this.db.prepare(`
      SELECT payload_json, updated_at
      FROM search_ranking_cache
      WHERE cache_key = ?
      LIMIT 1
    `).get(cacheKey) as { payload_json: string; updated_at: string } | undefined;
    if (!row) return null;
    if (row.updated_at < rankingCacheCutoffIso()) {
      this.db.prepare("DELETE FROM search_ranking_cache WHERE cache_key = ?").run(cacheKey);
      return null;
    }
    let payload: SearchRankingCachePayload;
    try {
      const parsed = parseJson<unknown>(row.payload_json);
      if (!isRankingCachePayload(parsed)) {
        this.db.prepare("DELETE FROM search_ranking_cache WHERE cache_key = ?").run(cacheKey);
        return null;
      }
      payload = parsed;
    } catch {
      this.db.prepare("DELETE FROM search_ranking_cache WHERE cache_key = ?").run(cacheKey);
      return null;
    }
    const resultRefs = Array.isArray(payload.results) ? payload.results : [];
    if (!resultRefs.length) {
      return {
        query: payload.query,
        sourceSet: payload.sourceSet,
        results: [],
        ...(payload.facets?.length ? { facets: payload.facets } : {}),
        partial: payload.partial,
        omittedSources: payload.omittedSources ?? [],
        stale: false,
        staleSources: [],
        elapsedMs: 0,
      };
    }
    const rows = this.rankingCacheRows(resultRefs.map((result) => result.id), payload.sourceSet);
    const rowRefs: SearchDocumentRow[] = [];
    for (const ref of resultRefs) {
      const document = rows.get(ref.id);
      if (!document || document.updated_at !== ref.updatedAt || !searchAclAllows(document.permissions_json, input)) {
        this.db.prepare("DELETE FROM search_ranking_cache WHERE cache_key = ?").run(cacheKey);
        return null;
      }
      rowRefs.push({
        ...document,
        rank: ref.rowRank ?? 0,
        semantic_score: ref.semanticScore ?? null,
      });
    }
    const materializedById = new Map(this.materializeResults(rowRefs, input).map((result) => [result.id, result]));
    const results = resultRefs.flatMap((ref) => {
      const result = materializedById.get(ref.id);
      return result ? [{ ...result, score: ref.score }] : [];
    });
    return {
      query: payload.query,
      sourceSet: payload.sourceSet,
      results,
      ...(payload.facets?.length ? { facets: payload.facets } : {}),
      partial: payload.partial,
      omittedSources: payload.omittedSources ?? [],
      stale: false,
      staleSources: [],
      elapsedMs: 0,
    };
  }

  private rankingCacheSet(cacheKey: string, input: SearchQueryInput, output: SearchQueryOutput): void {
    const scope = searchRankingCacheScope(input);
    const payload: SearchRankingCachePayload = {
      query: output.query,
      sourceSet: output.sourceSet,
      results: output.results.map((result) => ({
        id: result.id,
        score: result.score,
        updatedAt: result.updatedAt ?? "",
        semanticScore: typeof result.explanation?.scoreBreakdown?.semantic === "number"
          ? result.explanation.scoreBreakdown.semantic * 4
          : undefined,
      })).map((result, index) => ({
        ...result,
        order: index,
      })),
      ...(output.facets?.length ? { facets: output.facets } : {}),
      partial: output.partial,
      omittedSources: output.omittedSources,
    };
    const payloadJson = JSON.stringify(payload);
    const byteCount = Buffer.byteLength(payloadJson, "utf8");
    if (byteCount > SEARCH_RANKING_CACHE_LIMITS.maxEntryBytes) {
      this.db.prepare("DELETE FROM search_ranking_cache WHERE cache_key = ?").run(cacheKey);
      this.pruneRankingCache();
      return;
    }
    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO search_ranking_cache (
          cache_key, payload_json, byte_count, result_count,
          source_count, domain_count, shard_count, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(cache_key) DO UPDATE SET
          payload_json = excluded.payload_json,
          byte_count = excluded.byte_count,
          result_count = excluded.result_count,
          source_count = excluded.source_count,
          domain_count = excluded.domain_count,
          shard_count = excluded.shard_count,
          updated_at = excluded.updated_at
      `).run(
        cacheKey,
        payloadJson,
        byteCount,
        output.results.length,
        scope.sources.length,
        scope.domains.length,
        scope.shards.length,
        now,
      );
      this.db.prepare("DELETE FROM search_ranking_cache_scopes WHERE cache_key = ?").run(cacheKey);
      const insertScope = this.db.prepare("INSERT INTO search_ranking_cache_scopes (cache_key, scope_kind, scope_value) VALUES (?, ?, ?)");
      for (const source of scope.sources) insertScope.run(cacheKey, "source", source);
      for (const domain of scope.domains) insertScope.run(cacheKey, "domain", domain);
      for (const shard of scope.shards) insertScope.run(cacheKey, "shard", shard);
      this.pruneRankingCache();
    });
    tx();
  }

  private rankingCacheRows(ids: string[], sourceSet: SearchSourceSetId): Map<string, SearchDocumentRow> {
    const rows = new Map<string, SearchDocumentRow>();
    const uniqueIds = [...new Set(ids)];
    for (let index = 0; index < uniqueIds.length; index += 900) {
      const chunk = uniqueIds.slice(index, index + 900);
      if (!chunk.length) continue;
      const placeholders = chunk.map(() => "?").join(",");
      const sourceSetClause = sourceSet === "full" ? "" : "AND s.source_set = 'framework'";
      const chunkRows = this.db.prepare(`
        SELECT d.*, 0 AS rank, NULL AS semantic_score
        FROM search_documents d
        JOIN search_sources s ON s.id = d.source
        WHERE d.id IN (${placeholders})
          AND d.deleted_at IS NULL
          AND s.state NOT IN ('disabled', 'paused', 'excluded', 'external_pending')
          ${sourceSetClause}
      `).all(...chunk) as SearchDocumentRow[];
      for (const row of chunkRows) rows.set(row.id, row);
    }
    return rows;
  }

  private cacheScopesForSources(sources: string[]): SearchTouchedCacheScopes {
    const touched: SearchTouchedCacheScopes = {
      sources: new Set(sources),
      domains: new Set(),
      shards: new Set(),
    };
    const uniqueSources = [...new Set(sources.map((source) => source.trim()).filter(Boolean))];
    if (!uniqueSources.length) return touched;
    for (let index = 0; index < uniqueSources.length; index += 900) {
      const chunk = uniqueSources.slice(index, index + 900);
      const placeholders = chunk.map(() => "?").join(",");
      const rows = this.db.prepare(`
        SELECT domain, NULL AS shard FROM search_sources WHERE id IN (${placeholders})
        UNION
        SELECT domain, shard FROM search_documents WHERE source IN (${placeholders})
        UNION
        SELECT domain, shard FROM search_shards WHERE source IN (${placeholders})
      `).all(...chunk, ...chunk, ...chunk) as Array<{ domain: string | null; shard: string | null }>;
      for (const row of rows) {
        if (row.domain) touched.domains.add(row.domain);
        if (row.shard) touched.shards.add(row.shard);
      }
    }
    return touched;
  }

  private pruneRankingCache(): void {
    const cutoff = rankingCacheCutoffIso();
    this.db.prepare("DELETE FROM search_ranking_cache WHERE updated_at < ?").run(cutoff);
    this.db.prepare(`
      DELETE FROM search_ranking_cache
      WHERE cache_key IN (
        SELECT cache_key
        FROM search_ranking_cache
        ORDER BY updated_at DESC, cache_key ASC
        LIMIT -1 OFFSET ?
      )
    `).run(SEARCH_RANKING_CACHE_LIMITS.maxEntries);
    this.db.prepare(`
      DELETE FROM search_ranking_cache
      WHERE cache_key IN (
        SELECT cache_key
        FROM (
          SELECT cache_key,
            SUM(byte_count) OVER (ORDER BY updated_at DESC, cache_key ASC) AS running_bytes
          FROM search_ranking_cache
        )
        WHERE running_bytes > ?
      )
    `).run(SEARCH_RANKING_CACHE_LIMITS.maxTotalBytes);
  }
}
