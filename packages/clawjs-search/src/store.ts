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

export interface SearchDocumentFragmentInput {
  id: string;
  title?: string;
  body?: string;
  snippet?: string;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
}

export type SearchResultAccessInput = Pick<SearchQueryInput, "actor" | "surface" | "filters">;

export interface SearchDocumentInput {
  id: string;
  source: string;
  shard?: string;
  domain: string;
  type: string;
  title: string;
  subtitle?: string;
  snippet?: string;
  body?: string;
  resourceId?: string;
  path?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
  permissions?: SearchResult["permissions"];
  rankingHints?: Record<string, number>;
  fragments?: SearchDocumentFragmentInput[];
  actions?: SearchAction[];
}

export interface SavedSearchInput {
  id: string;
  name: string;
  query: SearchQueryInput;
  createdAt?: string;
  updatedAt?: string;
}

export interface SearchMonitorInput {
  id: string;
  savedSearchId: string;
  name?: string;
  enabled?: boolean;
  cadence?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SearchSourceCursor {
  source: string;
  shard: string;
  cursor: string;
  watermark: string;
  checksum: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export type SearchShardState = "active" | "empty";

export interface SearchShardStatus {
  source: string;
  shard: string;
  domain: string;
  state: SearchShardState;
  documentCount: number;
  fragmentCount: number;
  updatedAt: string;
}

export interface SearchTombstone {
  id: string;
  source: string;
  resourceId: string;
  deletedAt: string;
  reason?: string;
}

export type SearchIndexJobOperation = "upsert" | "delete" | "backfill" | "rebuild" | "embed";

export type SearchIndexJobStatus = "queued" | "leased" | "done" | "failed";

export interface SearchIndexJobInput {
  id?: string;
  source: string;
  shard?: string;
  operation: SearchIndexJobOperation;
  resourceId?: string;
  payload?: Record<string, unknown>;
  priority?: number;
  scheduledAt?: string;
  createdAt?: string;
}

export interface SearchIndexEventInput {
  source: string;
  resourceId: string;
  operation: Extract<SearchIndexJobOperation, "upsert" | "delete">;
  shard?: string;
  payload?: Record<string, unknown>;
  priority?: number;
  scheduledAt?: string;
  observedAt?: string;
}

export interface SearchIndexJob {
  id: string;
  source: string;
  shard: string;
  operation: SearchIndexJobOperation;
  resourceId?: string;
  payload: Record<string, unknown>;
  status: SearchIndexJobStatus;
  attempts: number;
  priority: number;
  scheduledAt: string;
  createdAt: string;
  updatedAt: string;
  leasedUntil?: string;
  error?: string;
}

export interface SearchEmbeddingIndexInput {
  sources?: string[];
  domains?: string[];
  shards?: string[];
  limit?: number;
  model?: string;
}

export interface SearchEmbeddingIndexSummary {
  model: string;
  documents: number;
  indexed: number;
  selectedSources: string[] | null;
  selectedDomains: string[] | null;
  selectedShards: string[] | null;
}

export interface SearchEmbeddingStatusInput {
  sources?: string[];
  domains?: string[];
  shards?: string[];
  model?: string;
}

export interface SearchEmbeddingStatus {
  source: string;
  domain: string;
  shard: string;
  model: string;
  documents: number;
  vectors: number;
  updatedAt?: string;
}

export interface SearchVectorInput {
  documentId: string;
  fragmentId?: string;
  model: string;
  embedding: number[];
  updatedAt?: string;
}

export interface SearchVectorRecord {
  documentId: string;
  fragmentId?: string;
  model: string;
  embedding: number[];
  updatedAt: string;
}

export type SearchAuditEventType = "sensitive_query" | "action";

export interface SearchAuditEventInput {
  type: SearchAuditEventType;
  actor?: string;
  surface?: string;
  query?: string;
  source?: string;
  domain?: string;
  resultId?: string;
  actionId?: string;
  status?: string;
  risk?: string;
  grant?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface SearchAuditEvent extends SearchAuditEventInput {
  id: string;
  createdAt: string;
}

export interface SearchRankingCacheStats {
  entries: number;
  updatedAt?: string;
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
      const deleteFts = this.db.prepare("DELETE FROM search_fts WHERE source = ?");
      const deleteDocuments = this.db.prepare("DELETE FROM search_documents WHERE source = ?");
      const deleteShards = this.db.prepare("DELETE FROM search_shards WHERE source = ?");
      const deleteCursors = this.db.prepare("DELETE FROM search_cursors WHERE source = ?");
      const deleteTombstones = this.db.prepare("DELETE FROM search_tombstones WHERE source = ?");
      for (const source of uniqueSources) {
        this.dropFtsPartitions({ source });
        deleteFts.run(source);
        deleteDocuments.run(source);
        deleteShards.run(source);
        deleteCursors.run(source);
        deleteTombstones.run(source);
      }
      this.db.prepare("DELETE FROM search_ranking_cache").run();
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
    this.db.prepare(`
      UPDATE search_sources
      SET state = ?, backlog = COALESCE(?, backlog), error = ?, last_indexed_at = COALESCE(?, last_indexed_at), updated_at = ?
      WHERE id = ?
    `).run(state, input.backlog ?? null, input.error ?? null, input.lastIndexedAt ?? null, new Date().toISOString(), source);
    this.clearRankingCache();
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
        updated_at, metadata_json, permissions_json, ranking_json, deleted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
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
      const existingDocumentIds = existingSearchDocumentIds(this.db, documents.map((document) => document.id));
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
          JSON.stringify(input.metadata ?? {}),
          JSON.stringify(input.permissions ?? {}),
          JSON.stringify(input.rankingHints ?? {}),
        );
        if (existingDocumentIds.has(input.id)) {
          deleteFragments.run(input.id);
          deleteActions.run(input.id);
          deleteFts.run(input.id);
          if (previousShard) this.deleteDocumentFromFtsPartition(previousShard.source, previousShard.shard, input.id);
        }
        const partitionTable = this.ensureFtsPartition({ source: input.source, shard, domain: input.domain, updatedAt });
        this.deleteDocumentFromFtsPartition(input.source, shard, input.id);
        insertDocumentFts.run(input.id, input.source, shard, input.domain, input.type, input.title, [input.subtitle, input.snippet, body].filter(Boolean).join("\n"), input.path ?? "");
        this.insertFtsPartitionRow(partitionTable, input.id, null, input.type, input.title, [input.subtitle, input.snippet, body].filter(Boolean).join("\n"), input.path ?? "");
        for (const [index, fragment] of fragments.entries()) {
          insertFragment.run(
            fragment.id,
            input.id,
            input.source,
            shard,
            input.domain,
            fragment.title ?? "",
            fragment.body ?? "",
            fragment.snippet ?? null,
            fragment.sortOrder ?? index,
            JSON.stringify(fragment.metadata ?? {}),
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
    const cached = this.rankingCacheGet(cacheKey);
    if (cached) return { ...cached, elapsedMs: Date.now() - startedAt };
    const requestedLimit = Math.max(1, queryInput.limit ?? 20);
    const outputLimit = effectiveResultLimit(requestedLimit, queryInput.agentBudget);
    const candidateLimit = Math.min(200, Math.max(requestedLimit * 4, requestedLimit));
    const sourceSet = queryInput.sourceSet ?? "framework";
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
        elapsedMs: Date.now() - startedAt,
      };
      this.rankingCacheSet(cacheKey, queryInput, output);
      return output;
    }
    const plannedQueryInput = shardPlan.catalogCovered && shardPlan.activeShards.length > 0
      ? { ...queryInput, shards: shardPlan.activeShards }
      : queryInput;
    const rows = new Map<string, SearchDocumentRow>();
    if (strategy !== "semantic" || !plannedQueryInput.embedding) {
      const lexicalRows = this.lexicalRows(plannedQueryInput, sourceSet, match, candidateLimit);
      for (const row of lexicalRows) rows.set(row.id, row);
      if (rows.size < candidateLimit && shouldRunFuzzyFallback(plannedQueryInput.query)) {
        for (const row of this.fuzzyFallbackRows(plannedQueryInput, sourceSet, candidateLimit, rows)) {
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
    const results = [...rows.values()]
      .filter((row) => searchAclAllows(row.permissions_json, plannedQueryInput))
      .map((row) => this.resultFromRow(row, plannedQueryInput))
      .sort((left, right) => right.score - left.score || (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""))
      .filter(agentBudgetResultFilter(plannedQueryInput.agentBudget))
      .slice(0, outputLimit);
    const output: SearchQueryOutput = {
      query: queryInput.query,
      sourceSet,
      results,
      ...(facets.length ? { facets } : {}),
      partial: omittedSources.length > 0,
      omittedSources,
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
    this.clearRankingCache();
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
      this.db.prepare("DELETE FROM search_ranking_cache").run();
    });
    tx();
    return { id, source: input.source, resourceId: input.resourceId, deletedAt, ...(input.reason ? { reason: input.reason } : {}) };
  }

  clearRankingCache(): void {
    this.db.prepare("DELETE FROM search_ranking_cache").run();
  }

  clearRankingCacheForScopes(touched: SearchTouchedCacheScopes): void {
    const rows = this.db.prepare("SELECT cache_key, query_json FROM search_ranking_cache").all() as Array<{ cache_key: string; query_json: string | null }>;
    const deleteCache = this.db.prepare("DELETE FROM search_ranking_cache WHERE cache_key = ?");
    for (const row of rows) {
      const scope = parseJson<SearchRankingCacheScope>(row.query_json);
      if (rankingCacheScopeIntersects(scope, touched)) deleteCache.run(row.cache_key);
    }
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
    return this.resultFromRow(row, { query: "", ...access });
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
      if (
        !this.tableHasColumn("search_cursors", "shard")
        || !this.tableHasColumn("search_cursors", "watermark")
        || !this.tableHasColumn("search_cursors", "checksum")
        || !this.tableHasColumn("search_documents", "shard")
        || !this.tableHasColumn("search_fragments", "shard")
        || !this.tableHasColumn("search_fts", "shard")
        || !this.tableHasColumn("search_ranking_cache", "query_json")
        || !this.tableExists("search_source_sets")
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
    const { clauses, params } = buildDocumentClauses(input, sourceSet, match);
    return this.db.prepare(`
      SELECT d.*, 0 AS rank, NULL AS semantic_score
      FROM search_fts
      JOIN search_documents d ON d.id = search_fts.doc_id
      JOIN search_sources s ON s.id = d.source
      WHERE ${clauses.join(" AND ")}
      GROUP BY d.id
      ORDER BY rank ASC, d.updated_at DESC
      LIMIT ?
    `).all(...params, limit) as SearchDocumentRow[];
  }

  private lexicalRowsFromPartitions(partitions: Array<{ tableName: string }>, input: SearchQueryInput, sourceSet: SearchSourceSetId, match: string, limit: number): SearchDocumentRow[] {
    const { clauses, params } = buildDocumentClauses(input, sourceSet);
    const selects: string[] = [];
    const allParams: unknown[] = [];
    for (const partition of partitions) {
      const table = quoteSqlIdentifier(partition.tableName);
      selects.push(`
        SELECT d.*, 0 AS rank, NULL AS semantic_score
        FROM ${table}
        JOIN search_documents d ON d.id = ${table}.doc_id
        JOIN search_sources s ON s.id = d.source
        WHERE ${table} MATCH ? AND ${clauses.join(" AND ")}
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
    const rows = this.db.prepare(`
      SELECT d.*, 0 AS rank, v.embedding_json
      FROM search_vectors v
      JOIN search_documents d ON d.id = v.document_id
      JOIN search_sources s ON s.id = d.source
      WHERE v.model = ? AND ${clauses.join(" AND ")}
      ORDER BY d.updated_at DESC
      LIMIT ?
    `).all(embedding.model, ...params, Math.max(limit * 4, limit)) as Array<SearchDocumentRow & { embedding_json: string }>;
    const byDocument = new Map<string, SearchDocumentRow>();
    for (const row of rows) {
      const similarity = cosineSimilarity(queryVector, parseJson<number[]>(row.embedding_json));
      if (similarity <= 0) continue;
      const semanticScore = similarity * 100;
      const candidate: SearchDocumentRow = {
        ...row,
        rank: Math.max(0, 100 - semanticScore),
        semantic_score: semanticScore,
      };
      const existing = byDocument.get(row.id);
      if (!existing || (candidate.semantic_score ?? 0) > (existing.semantic_score ?? 0)) byDocument.set(row.id, candidate);
    }
    return [...byDocument.values()]
      .sort((left, right) => (right.semantic_score ?? 0) - (left.semantic_score ?? 0) || (right.updated_at ?? "").localeCompare(left.updated_at ?? ""))
      .slice(0, limit);
  }

  private fuzzyFallbackRows(input: SearchQueryInput, sourceSet: SearchSourceSetId, limit: number, existingRows: Map<string, SearchDocumentRow>): SearchDocumentRow[] {
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
      .map((row) => ({ row, match: scoreLexicalMatch(input.query, `${row.title} ${row.subtitle ?? ""} ${row.snippet ?? ""} ${row.body}`) }))
      .filter((entry) => entry.match.matchedBy.includes("fuzzy"))
      .sort((left, right) => right.match.score - left.match.score || (right.row.updated_at ?? "").localeCompare(left.row.updated_at ?? ""))
      .slice(0, Math.max(0, limit - existingRows.size))
      .map((entry) => entry.row);
  }

  private resultFromRow(row: SearchDocumentRow, input: SearchQueryInput): SearchResult {
    const permissions = { canOpen: true, canPreview: true, redacted: false, ...parseJson(row.permissions_json) };
    const previewRedacted = permissions.redacted === true || permissions.canPreview === false;
    const fragmentsWithMatch = previewRedacted ? [] : (this.db.prepare(`
        SELECT id, title, snippet, body FROM search_fragments
        WHERE document_id = ?
        ORDER BY sort_order ASC, id ASC
        LIMIT 5
      `).all(row.id) as SearchFragmentRow[]).map((fragment) => {
        const match = scoreLexicalMatch(input.query, `${fragment.title} ${fragment.snippet ?? ""} ${fragment.body}`);
        return {
          fragment: {
            id: fragment.id,
            title: fragment.title || undefined,
            snippet: fragment.snippet || fragment.body.slice(0, 180) || undefined,
            score: match.score,
          },
          match,
        };
      });
    const fragments = fragmentsWithMatch.map((entry) => entry.fragment);
    const actions = (this.db.prepare("SELECT action_json FROM search_actions WHERE document_id = ? ORDER BY action_id ASC").all(row.id) as Array<{ action_json: string }>).map((action) => parseJson<SearchAction>(action.action_json));
    const lexical = scoreLexicalMatch(input.query, `${row.title} ${row.subtitle ?? ""} ${row.snippet ?? ""} ${row.body}`);
    const rankingHints = parseJson<Record<string, number>>(row.ranking_json);
    const metadata = parseJson(row.metadata_json);
    const localFrecency = this.localFrecencyForResult(row.id, input);
    const score = centralSearchScore({ lexicalScore: lexical.score, semanticScore: row.semantic_score ?? 0, rowRank: row.rank ?? 0, rankingHints, metadata, input, localFrecency });
    const matchedBy = lexical.matchedBy.length
      ? lexical.matchedBy
      : (fragmentsWithMatch.find((entry) => entry.match.matchedBy.length)?.match.matchedBy ?? []);
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
  }

  private localFrecencyForResult(resultId: string, input: SearchQueryInput): number {
    const rows = this.db.prepare(`
      SELECT actor, surface, interaction_count, last_interacted_at
      FROM search_interactions
      WHERE document_id = ?
    `).all(resultId) as Array<{ actor: string; surface: string; interaction_count: number; last_interacted_at: string }>;
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

  private rankingCacheGet(cacheKey: string): SearchQueryOutput | null {
    const row = this.db.prepare("SELECT result_json FROM search_ranking_cache WHERE cache_key = ?").get(cacheKey) as { result_json: string } | undefined;
    return row ? parseJson<SearchQueryOutput>(row.result_json) : null;
  }

  private rankingCacheSet(cacheKey: string, input: SearchQueryInput, output: SearchQueryOutput): void {
    this.db.prepare(`
      INSERT INTO search_ranking_cache (cache_key, query_json, result_json, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET query_json = excluded.query_json, result_json = excluded.result_json, updated_at = excluded.updated_at
    `).run(cacheKey, JSON.stringify(searchRankingCacheScope(input)), JSON.stringify({ ...output, elapsedMs: 0 }), new Date().toISOString());
  }
}

interface SearchTouchedCacheScopes {
  sources: Set<string>;
  domains: Set<string>;
  shards: Set<string>;
}

interface SearchDocumentRow {
  id: string;
  source: string;
  shard: string;
  domain: string;
  type: string;
  resource_id: string | null;
  title: string;
  subtitle: string | null;
  snippet: string | null;
  body: string;
  path: string | null;
  updated_at: string;
  metadata_json: string;
  permissions_json: string;
  ranking_json: string;
  rank?: number;
  semantic_score?: number | null;
}

interface SearchFragmentRow {
  id: string;
  title: string;
  snippet: string | null;
  body: string;
}

interface SearchCursorRow {
  source: string;
  shard: string;
  cursor: string;
  watermark: string;
  checksum: string;
  updated_at: string;
  metadata_json: string;
}

interface SearchShardRow {
  source: string;
  shard: string;
  domain: string;
  state: SearchShardState;
  document_count: number;
  fragment_count: number;
  updated_at: string;
}

interface SearchFtsPartitionRow {
  source: string;
  shard: string;
  domain: string;
  table_name: string;
  updated_at: string;
}

interface SearchIndexJobRow {
  id: string;
  source: string;
  shard: string;
  operation: SearchIndexJobOperation;
  resource_id: string | null;
  payload_json: string;
  status: SearchIndexJobStatus;
  attempts: number;
  priority: number;
  scheduled_at: string;
  created_at: string;
  updated_at: string;
  leased_until: string | null;
  error: string | null;
}

interface SearchVectorRow {
  document_id: string;
  fragment_id: string;
  model: string;
  embedding_json: string;
  updated_at: string;
}

interface SearchEmbeddingDocumentRow {
  id: string;
  source: string;
  shard: string;
  domain: string;
  title: string;
  subtitle: string | null;
  snippet: string | null;
  body: string;
  updated_at: string;
}

interface SearchEmbeddingFragmentRow {
  title: string;
  snippet: string | null;
  body: string;
}

interface SearchEmbeddingStatusRow {
  source: string;
  domain: string;
  shard: string;
  model: string;
  documents: number;
  vectors: number;
  updated_at: string | null;
}

interface SavedSearchRow {
  id: string;
  name: string;
  query_json: string;
  created_at: string;
  updated_at: string;
}

interface SearchMonitorRow {
  id: string;
  saved_search_id: string;
  name: string | null;
  enabled: number;
  cadence: string | null;
  created_at: string;
  updated_at: string;
}

interface SearchAuditEventRow {
  id: string;
  type: SearchAuditEventType;
  actor: string | null;
  surface: string | null;
  query: string | null;
  source: string | null;
  domain: string | null;
  result_id: string | null;
  action_id: string | null;
  status: string | null;
  risk: string | null;
  grant_id: string | null;
  reason: string | null;
  metadata_json: string;
  created_at: string;
}

interface SearchInteractionRow {
  document_id: string;
  source: string;
  shard: string;
  domain: string;
  actor: string;
  surface: string;
  action_id: string;
  kind: SearchInteraction["kind"];
  interaction_count: number;
  last_interacted_at: string;
  metadata_json: string;
}

function parseJson<T = Record<string, unknown>>(value: string | null | undefined): T {
  if (!value) return {} as T;
  return JSON.parse(value) as T;
}

function existingSearchDocumentIds(db: Database.Database, ids: string[]): Set<string> {
  const uniqueIds = [...new Set(ids)];
  const existing = new Set<string>();
  for (let index = 0; index < uniqueIds.length; index += 900) {
    const chunk = uniqueIds.slice(index, index + 900);
    if (!chunk.length) continue;
    const placeholders = chunk.map(() => "?").join(",");
    const rows = db.prepare(`SELECT id FROM search_documents WHERE id IN (${placeholders})`).all(...chunk) as Array<{ id: string }>;
    for (const row of rows) existing.add(row.id);
  }
  return existing;
}

function existingSearchDocumentShardRows(db: Database.Database, ids: string[]): Map<string, { source: string; shard: string; domain: string }> {
  const uniqueIds = [...new Set(ids)];
  const existing = new Map<string, { source: string; shard: string; domain: string }>();
  for (let index = 0; index < uniqueIds.length; index += 900) {
    const chunk = uniqueIds.slice(index, index + 900);
    if (!chunk.length) continue;
    const placeholders = chunk.map(() => "?").join(",");
    const rows = db.prepare(`SELECT id, source, shard, domain FROM search_documents WHERE id IN (${placeholders})`).all(...chunk) as Array<{ id: string; source: string; shard: string; domain: string }>;
    for (const row of rows) existing.set(row.id, { source: row.source, shard: row.shard, domain: row.domain });
  }
  return existing;
}

function searchCursorFromRow(row: SearchCursorRow): SearchSourceCursor {
  return {
    source: row.source,
    shard: row.shard,
    cursor: row.cursor,
    watermark: row.watermark,
    checksum: row.checksum,
    updatedAt: row.updated_at,
    metadata: parseJson(row.metadata_json),
  };
}

function searchShardFromRow(row: SearchShardRow): SearchShardStatus {
  return {
    source: row.source,
    shard: row.shard,
    domain: row.domain,
    state: row.state,
    documentCount: row.document_count,
    fragmentCount: row.fragment_count,
    updatedAt: row.updated_at,
  };
}

function searchInteractionFromRow(row: SearchInteractionRow): SearchInteraction {
  return {
    resultId: row.document_id,
    source: row.source,
    domain: row.domain,
    ...(row.shard !== "default" ? { shard: row.shard } : {}),
    ...(row.actor ? { actor: row.actor } : {}),
    ...(row.surface ? { surface: row.surface } : {}),
    ...(row.action_id ? { actionId: row.action_id } : {}),
    kind: row.kind,
    count: row.interaction_count,
    lastInteractedAt: row.last_interacted_at,
    metadata: parseJson(row.metadata_json),
  };
}

function searchFtsPartitionFromRow(row: SearchFtsPartitionRow): { source: string; shard: string; domain: string; tableName: string } {
  return {
    source: row.source,
    shard: row.shard,
    domain: row.domain,
    tableName: row.table_name,
  };
}

function searchIndexJobFromRow(row: SearchIndexJobRow): SearchIndexJob {
  return {
    id: row.id,
    source: row.source,
    shard: row.shard,
    operation: row.operation,
    ...(row.resource_id ? { resourceId: row.resource_id } : {}),
    payload: parseJson(row.payload_json),
    status: row.status,
    attempts: row.attempts,
    priority: row.priority,
    scheduledAt: row.scheduled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.leased_until ? { leasedUntil: row.leased_until } : {}),
    ...(row.error ? { error: row.error } : {}),
  };
}

function stableJobIdPart(value: string): string {
  const safe = value.replace(/[^A-Za-z0-9_.:-]+/g, "_").replace(/^_+|_+$/g, "");
  if (safe === value && safe.length > 0 && safe.length <= 120) return safe;
  const hash = createHash("sha256").update(value).digest("hex").slice(0, 16);
  return `${safe.slice(0, 100) || "resource"}-${hash}`;
}

function searchCursorChecksum(input: { source: string; shard: string; cursor: string; watermark: string; metadata: Record<string, unknown> }): string {
  return createHash("sha256").update(stableJson(input)).digest("hex");
}

function ftsPartitionTableName(source: string, shard: string): string {
  return `search_fts_part_${createHash("sha256").update(`${source}\0${shard}`).digest("hex").slice(0, 24)}`;
}

function quoteSqlIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, "\"\"")}"`;
}

function searchVectorFromRow(row: SearchVectorRow): SearchVectorRecord {
  return {
    documentId: row.document_id,
    ...(row.fragment_id ? { fragmentId: row.fragment_id } : {}),
    model: row.model,
    embedding: parseJson<number[]>(row.embedding_json),
    updatedAt: row.updated_at,
  };
}

function buildDocumentClauses(input: SearchQueryInput, sourceSet: SearchSourceSetId, match?: string): { clauses: string[]; params: unknown[] } {
  const clauses = ["d.deleted_at IS NULL"];
  const params: unknown[] = [];
  if (match) {
    clauses.push("search_fts MATCH ?");
    params.push(match);
  }
  if (input.domains?.length) {
    clauses.push(`d.domain IN (${input.domains.map(() => "?").join(", ")})`);
    params.push(...input.domains);
  }
  if (input.sources?.length) {
    clauses.push(`d.source IN (${input.sources.map(() => "?").join(", ")})`);
    params.push(...input.sources);
  }
  if (input.shards?.length) {
    clauses.push(`d.shard IN (${input.shards.map(() => "?").join(", ")})`);
    params.push(...input.shards);
  }
  applySearchFilters(clauses, params, input.filters);
  if (sourceSet !== "full") clauses.push("s.source_set = 'framework'");
  clauses.push("s.state NOT IN ('disabled', 'paused', 'excluded', 'external_pending')");
  return { clauses, params };
}

function searchAclAllows(permissionsJson: string, input: SearchQueryInput): boolean {
  const permissions = parseJson<NonNullable<SearchResult["permissions"]>>(permissionsJson);
  const actor = input.actor?.trim();
  if (!stringListAllows(permissions.allowedActors, actor)) return false;
  if (!stringListAllows(permissions.allowedAgents, actor)) return false;
  const requiredScopes = normalizedStringList(permissions.requiredScopes);
  if (requiredScopes.length) {
    const queryScopes = searchQueryScopes(input);
    if (!requiredScopes.every((scope) => queryScopes.includes(scope))) return false;
  }
  return true;
}

function stringListAllows(values: string[] | undefined, value: string | undefined): boolean {
  const list = normalizedStringList(values);
  if (!list.length) return true;
  return Boolean(value && list.includes(value));
}

function searchQueryScopes(input: SearchQueryInput): string[] {
  const filters = input.filters ?? {};
  return normalizedStringList([
    ...valueToStringList(filters.aclScope),
    ...valueToStringList(filters.aclScopes),
    ...valueToStringList(filters.scope),
    ...valueToStringList(filters.scopes),
    ...valueToStringList(filters["metadata.scope"]),
    ...valueToStringList(filters["metadata.scopeId"]),
    ...valueToStringList(filters.scopeId),
  ]);
}

function valueToStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(valueToStringList);
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return [
      ...valueToStringList(record.scope),
      ...valueToStringList(record.scopeId),
      ...valueToStringList(record.id),
    ];
  }
  return typeof value === "string" && value.trim() ? [value.trim()] : [];
}

function normalizedStringList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()))];
}

function mergeSearchRows(left: SearchDocumentRow, right: SearchDocumentRow): SearchDocumentRow {
  return {
    ...left,
    rank: Math.min(left.rank ?? Number.MAX_SAFE_INTEGER, right.rank ?? Number.MAX_SAFE_INTEGER),
    semantic_score: Math.max(left.semantic_score ?? 0, right.semantic_score ?? 0),
  };
}

function normalizeEmbedding(embedding: number[]): number[] {
  if (!embedding.length) throw new Error("Search vector embedding must not be empty");
  if (!embedding.every((value) => Number.isFinite(value))) throw new Error("Search vector embedding must contain only finite numbers");
  return embedding;
}

function cosineSimilarity(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  if (!length) return 0;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }
  if (!leftMagnitude || !rightMagnitude) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function isRebuildableSearchSchemaMismatch(error: unknown): boolean {
  return error instanceof Error
    && /no such column: source|no such column: shard|search_fts|schema/i.test(error.message);
}

function ftsQuery(query: string): string {
  const terms = query
    .trim()
    .split(/\s+/)
    .flatMap((term) => term.replace(/[^\p{L}\p{N}_]+/gu, " ").split(/\s+/))
    .filter(Boolean);
  return terms.map((term) => `"${term}"*`).join(" ");
}

function shouldRunFuzzyFallback(query: string): boolean {
  return query.trim().split(/[^\p{L}\p{N}_]+/u).some((term) => term.length >= 4);
}

function normalizeInlineSearchQuery(input: SearchQueryInput): SearchQueryInput {
  const parsed = parseInlineSearchFilters(input.query);
  if (!parsed.changed) return input;
  const filters = { ...(input.filters ?? {}) };
  for (const [key, values] of Object.entries(parsed.filters)) {
    filters[key] = mergeInlineFilterValue(filters[key], values);
  }
  return {
    ...input,
    query: parsed.query,
    ...(parsed.domains.length ? { domains: uniqueStrings([...(input.domains ?? []), ...parsed.domains]) } : {}),
    ...(parsed.sources.length ? { sources: uniqueStrings([...(input.sources ?? []), ...parsed.sources]) } : {}),
    ...(parsed.shards.length ? { shards: uniqueStrings([...(input.shards ?? []), ...parsed.shards]) } : {}),
    ...(Object.keys(filters).length ? { filters } : {}),
  };
}

function parseInlineSearchFilters(query: string): {
  changed: boolean;
  query: string;
  domains: string[];
  sources: string[];
  shards: string[];
  filters: Record<string, string[]>;
} {
  const domains: string[] = [];
  const sources: string[] = [];
  const shards: string[] = [];
  const filters: Record<string, string[]> = {};
  let changed = false;
  const text = query.replace(/(?:^|\s)(domain|domains|source|sources|shard|shards|type|types|scope|scopes):(?:"([^"]+)"|'([^']+)'|([^\s]+))/gi, (_token, rawKey: string, quoted: string | undefined, singleQuoted: string | undefined, bare: string | undefined) => {
    const key = rawKey.toLowerCase();
    const value = (quoted ?? singleQuoted ?? bare ?? "").trim();
    if (!value) return " ";
    changed = true;
    switch (key) {
      case "domain":
      case "domains":
        domains.push(value);
        break;
      case "source":
      case "sources":
        sources.push(value);
        break;
      case "shard":
      case "shards":
        shards.push(value);
        break;
      case "type":
      case "types":
        pushInlineFilter(filters, "type", value);
        break;
      case "scope":
      case "scopes":
        pushInlineFilter(filters, "scope", value);
        break;
    }
    return " ";
  }).replace(/\s+/g, " ").trim();
  return {
    changed,
    query: changed ? text : query,
    domains: uniqueStrings(domains),
    sources: uniqueStrings(sources),
    shards: uniqueStrings(shards),
    filters,
  };
}

function pushInlineFilter(filters: Record<string, string[]>, key: string, value: string): void {
  filters[key] = uniqueStrings([...(filters[key] ?? []), value]);
}

function mergeInlineFilterValue(current: unknown, values: string[]): string | string[] {
  const merged = uniqueStrings([...valueToStringList(current), ...values]);
  return merged.length === 1 ? merged[0] ?? "" : merged;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function applySearchFilters(clauses: string[], params: unknown[], filters: Record<string, unknown> | undefined): void {
  if (!filters) return;
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;
    switch (key) {
      case "domain":
      case "domains":
        addInClause(clauses, params, "d.domain", value);
        break;
      case "source":
      case "sources":
        addInClause(clauses, params, "d.source", value);
        break;
      case "shard":
      case "shards":
        addInClause(clauses, params, "d.shard", value);
        break;
      case "type":
      case "types":
        addInClause(clauses, params, "d.type", value);
        break;
      case "resourceId":
      case "resource_id":
        addInClause(clauses, params, "d.resource_id", value);
        break;
      case "scope":
      case "scopes":
      case "scopeId":
      case "aclScope":
      case "aclScopes":
        break;
      case "path":
        addInClause(clauses, params, "d.path", value);
        break;
      case "canOpen":
      case "canPreview":
      case "redacted":
        addJsonEqualsClause(clauses, params, "d.permissions_json", key, value);
        break;
      default:
        addJsonEqualsClause(clauses, params, "d.metadata_json", key.startsWith("metadata.") ? key.slice("metadata.".length) : key, value);
        break;
    }
  }
}

function addInClause(clauses: string[], params: unknown[], column: string, value: unknown): void {
  const values = Array.isArray(value) ? value : [value];
  const normalized = values.filter((entry) => entry !== undefined && entry !== null && entry !== "");
  if (!normalized.length) return;
  clauses.push(`${column} IN (${normalized.map(() => "?").join(", ")})`);
  params.push(...normalized);
}

function searchEmbeddingText(row: SearchEmbeddingDocumentRow, fragments: SearchEmbeddingFragmentRow[]): string {
  const parts = [
    row.title,
    row.subtitle,
    row.snippet,
    row.body,
    ...fragments.flatMap((fragment) => [fragment.title, fragment.snippet, fragment.body]),
  ];
  return parts
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 128 * 1024);
}

function addJsonEqualsClause(clauses: string[], params: unknown[], jsonColumn: string, key: string, value: unknown): void {
  const path = jsonPath(key);
  const values = Array.isArray(value) ? value : [value];
  const normalized = values.filter((entry) => entry !== undefined && entry !== null && entry !== "");
  if (!normalized.length) return;
  clauses.push(`json_extract(${jsonColumn}, ?) IN (${normalized.map(() => "?").join(", ")})`);
  params.push(path, ...normalized.map(normalizeJsonFilterValue));
}

function jsonPath(key: string): string {
  return `$.${key.split(".").map((part) => `"${part.replace(/"/g, '\\"')}"`).join(".")}`;
}

function normalizeJsonFilterValue(value: unknown): unknown {
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  let bytes = 0;
  let output = "";
  for (const char of value) {
    const size = Buffer.byteLength(char, "utf8");
    if (bytes + size > maxBytes) break;
    output += char;
    bytes += size;
  }
  return output;
}

function centralSearchScore(input: {
  lexicalScore: number;
  semanticScore: number;
  rowRank: number;
  rankingHints: Record<string, unknown>;
  metadata: Record<string, unknown>;
  input: SearchQueryInput;
  localFrecency?: number;
}): { total: number; breakdown: NonNullable<SearchResult["explanation"]>["scoreBreakdown"] } {
  const base = Math.max(1, 100 - Math.max(0, input.rowRank)) + input.lexicalScore / 100;
  const semanticBoost = boundedNumber(input.semanticScore, 0, 100) / 4;
  const hintBoost = boundedNumber(input.rankingHints.priority, 0, 10)
    + boundedNumber(input.rankingHints.hot, 0, 5)
    + boundedNumber(input.rankingHints.fastPath, 0, 2);
  const frecency = Math.min(1, boundedNumber(input.rankingHints.frecency ?? input.metadata.frecency, 0, 1) + boundedNumber(input.localFrecency, 0, 1));
  const frecencyBoost = frecency * 8;
  const actorBoost = contextMatchBoost(input.input.actor, input.metadata, input.rankingHints, ["actor", "actorId", "agentId", "ownerActorId"], "actor");
  const surfaceBoost = contextMatchBoost(input.input.surface, input.metadata, input.rankingHints, ["surface", "surfaceId"], "surface");
  const scopeBoost = scopeFilterBoost(input.input.filters, input.metadata, input.rankingHints);
  const context = actorBoost + surfaceBoost + scopeBoost;
  return {
    total: base + semanticBoost + hintBoost + frecencyBoost + context,
    breakdown: {
      lexical: input.lexicalScore,
      semantic: semanticBoost,
      base,
      hints: hintBoost,
      frecency: frecencyBoost,
      context,
    },
  };
}

function contextMatchBoost(
  value: string | undefined,
  metadata: Record<string, unknown>,
  rankingHints: Record<string, unknown>,
  metadataKeys: string[],
  hintPrefix: string,
): number {
  if (!value) return 0;
  let boost = boundedNumber(rankingHints[`${hintPrefix}:${value}`], 0, 10);
  if (metadataKeys.some((key) => metadataValueMatches(metadata[key], value))) boost += 6;
  return boost;
}

function scopeFilterBoost(filters: Record<string, unknown> | undefined, metadata: Record<string, unknown>, rankingHints: Record<string, unknown>): number {
  if (!filters) return 0;
  let boost = 0;
  for (const [key, value] of Object.entries(filters)) {
    if (!key.startsWith("metadata.")) continue;
    const metadataKey = key.slice("metadata.".length);
    if (metadataValueMatches(metadata[metadataKey], value)) boost += 2;
  }
  return Math.min(8, boost + boundedNumber(rankingHints.scope, 0, 4));
}

function metadataValueMatches(left: unknown, right: unknown): boolean {
  if (Array.isArray(right)) return right.some((entry) => metadataValueMatches(left, entry));
  if (Array.isArray(left)) return left.some((entry) => metadataValueMatches(entry, right));
  return left !== undefined && left !== null && right !== undefined && right !== null && String(left) === String(right);
}

function boundedNumber(value: unknown, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : 0;
}

function effectiveResultLimit(limit: number, budget: SearchAgentResultBudget | undefined): number {
  const maxResults = boundedPositiveInteger(budget?.maxResults);
  return maxResults === undefined ? limit : Math.min(limit, maxResults);
}

function agentBudgetResultFilter(budget: SearchAgentResultBudget | undefined): (result: SearchResult) => boolean {
  const maxPerSource = boundedPositiveInteger(budget?.maxResultsPerSource);
  const maxPerDomain = boundedPositiveInteger(budget?.maxResultsPerDomain);
  if (maxPerSource === undefined && maxPerDomain === undefined) return () => true;
  const bySource = new Map<string, number>();
  const byDomain = new Map<string, number>();
  return (result) => {
    const sourceCount = bySource.get(result.source) ?? 0;
    const domainCount = byDomain.get(result.domain) ?? 0;
    if (maxPerSource !== undefined && sourceCount >= maxPerSource) return false;
    if (maxPerDomain !== undefined && domainCount >= maxPerDomain) return false;
    if (maxPerSource !== undefined) {
      bySource.set(result.source, sourceCount + 1);
    }
    if (maxPerDomain !== undefined) {
      byDomain.set(result.domain, domainCount + 1);
    }
    return true;
  };
}

function boundedPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(1, Math.floor(value));
}

function searchRankingCacheKey(input: SearchQueryInput): string {
  return createHash("sha256").update(stableJson({
    query: input.query,
    domains: sortedStrings(input.domains),
    sources: sortedStrings(input.sources),
    shards: sortedStrings(input.shards),
    sourceSet: input.sourceSet ?? "framework",
    actor: input.actor ?? "",
    surface: input.surface ?? "",
    limit: input.limit ?? 20,
    explain: input.explain === true,
    filters: normalizeCacheValue(input.filters ?? {}),
    agentBudget: normalizeCacheValue(input.agentBudget ?? {}),
    strategy: input.strategy ?? (input.embedding ? "hybrid" : "lexical"),
    embedding: input.embedding ? {
      model: input.embedding.model,
      vectorHash: createHash("sha256").update(JSON.stringify(normalizeEmbedding(input.embedding.vector))).digest("hex"),
    } : null,
  })).digest("hex");
}

interface SearchRankingCacheScope {
  domains: string[];
  sources: string[];
  shards: string[];
}

function searchRankingCacheScope(input: SearchQueryInput): SearchRankingCacheScope {
  return {
    domains: sortedStrings(input.domains),
    sources: sortedStrings(input.sources),
    shards: sortedStrings(input.shards),
  };
}

function rankingCacheScopeIntersects(scope: SearchRankingCacheScope, touched: SearchTouchedCacheScopes): boolean {
  const sources = Array.isArray(scope.sources) ? scope.sources : [];
  const domains = Array.isArray(scope.domains) ? scope.domains : [];
  const shards = Array.isArray(scope.shards) ? scope.shards : [];
  if (sources.length && !sources.some((source) => touched.sources.has(source))) return false;
  if (domains.length && !domains.some((domain) => touched.domains.has(domain))) return false;
  if (shards.length && !shards.some((shard) => touched.shards.has(shard))) return false;
  return true;
}

function sortedStrings(values: string[] | undefined): string[] {
  return [...new Set(values ?? [])].sort();
}

function stableJson(value: unknown): string {
  return JSON.stringify(normalizeCacheValue(value));
}

function normalizeCacheValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeCacheValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalizeCacheValue(entry)]));
  }
  return value;
}

const SEARCH_SCHEMA_SQL = String.raw`
CREATE TABLE IF NOT EXISTS search_source_sets (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  default_enabled INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS search_sources (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  name TEXT NOT NULL,
  version INTEGER NOT NULL,
  source_set TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  state TEXT NOT NULL,
  backlog INTEGER NOT NULL DEFAULT 0,
  last_indexed_at TEXT,
  error TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS search_sources_domain_idx ON search_sources(domain, state);

CREATE TABLE IF NOT EXISTS search_documents (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL REFERENCES search_sources(id) ON DELETE CASCADE,
  shard TEXT NOT NULL DEFAULT 'default',
  domain TEXT NOT NULL,
  type TEXT NOT NULL,
  resource_id TEXT,
  title TEXT NOT NULL,
  subtitle TEXT,
  snippet TEXT,
  body TEXT NOT NULL DEFAULT '',
  path TEXT,
  updated_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  permissions_json TEXT NOT NULL DEFAULT '{}',
  ranking_json TEXT NOT NULL DEFAULT '{}',
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS search_documents_source_idx ON search_documents(source, updated_at DESC);
CREATE INDEX IF NOT EXISTS search_documents_shard_idx ON search_documents(source, shard, updated_at DESC);
CREATE INDEX IF NOT EXISTS search_documents_domain_idx ON search_documents(domain, updated_at DESC);
CREATE INDEX IF NOT EXISTS search_documents_resource_idx ON search_documents(source, resource_id);

CREATE TABLE IF NOT EXISTS search_fts_partitions (
  source TEXT NOT NULL REFERENCES search_sources(id) ON DELETE CASCADE,
  shard TEXT NOT NULL DEFAULT 'default',
  domain TEXT NOT NULL,
  table_name TEXT NOT NULL UNIQUE,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source, shard)
);
CREATE INDEX IF NOT EXISTS search_fts_partitions_domain_idx ON search_fts_partitions(domain, shard);

CREATE TABLE IF NOT EXISTS search_shards (
  source TEXT NOT NULL REFERENCES search_sources(id) ON DELETE CASCADE,
  shard TEXT NOT NULL DEFAULT 'default',
  domain TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'active',
  document_count INTEGER NOT NULL DEFAULT 0,
  fragment_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source, shard)
);
CREATE INDEX IF NOT EXISTS search_shards_domain_idx ON search_shards(domain, shard, state);

CREATE TABLE IF NOT EXISTS search_fragments (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES search_documents(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  shard TEXT NOT NULL DEFAULT 'default',
  domain TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  snippet TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS search_fragments_document_idx ON search_fragments(document_id, sort_order);

CREATE TABLE IF NOT EXISTS search_actions (
  document_id TEXT NOT NULL REFERENCES search_documents(id) ON DELETE CASCADE,
  action_id TEXT NOT NULL,
  action_json TEXT NOT NULL,
  PRIMARY KEY (document_id, action_id)
);

CREATE TABLE IF NOT EXISTS search_cursors (
  source TEXT NOT NULL REFERENCES search_sources(id) ON DELETE CASCADE,
  shard TEXT NOT NULL DEFAULT 'default',
  cursor TEXT NOT NULL,
  watermark TEXT NOT NULL,
  checksum TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (source, shard)
);
CREATE INDEX IF NOT EXISTS search_cursors_source_idx ON search_cursors(source, updated_at DESC);

CREATE TABLE IF NOT EXISTS search_index_jobs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL REFERENCES search_sources(id) ON DELETE CASCADE,
  shard TEXT NOT NULL DEFAULT 'default',
  operation TEXT NOT NULL,
  resource_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 0,
  scheduled_at TEXT NOT NULL,
  leased_until TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS search_index_jobs_claim_idx ON search_index_jobs(status, scheduled_at, priority DESC);
CREATE INDEX IF NOT EXISTS search_index_jobs_source_idx ON search_index_jobs(source, shard, status, scheduled_at);

CREATE TABLE IF NOT EXISTS search_tombstones (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  reason TEXT
);
CREATE INDEX IF NOT EXISTS search_tombstones_source_idx ON search_tombstones(source, resource_id);

CREATE TABLE IF NOT EXISTS saved_searches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  query_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS search_monitors (
  id TEXT PRIMARY KEY,
  saved_search_id TEXT NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
  name TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  cadence TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS search_monitors_saved_search_idx ON search_monitors(saved_search_id, enabled);

CREATE TABLE IF NOT EXISTS search_audit_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  actor TEXT,
  surface TEXT,
  query TEXT,
  source TEXT,
  domain TEXT,
  result_id TEXT,
  action_id TEXT,
  status TEXT,
  risk TEXT,
  grant_id TEXT,
  reason TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS search_audit_events_type_idx ON search_audit_events(type, created_at DESC);
CREATE INDEX IF NOT EXISTS search_audit_events_actor_idx ON search_audit_events(actor, created_at DESC);

CREATE TABLE IF NOT EXISTS search_interactions (
  document_id TEXT NOT NULL REFERENCES search_documents(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  shard TEXT NOT NULL DEFAULT 'default',
  domain TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT '',
  surface TEXT NOT NULL DEFAULT '',
  action_id TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'action',
  interaction_count INTEGER NOT NULL DEFAULT 0,
  last_interacted_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (document_id, actor, surface, action_id, kind)
);
CREATE INDEX IF NOT EXISTS search_interactions_document_idx ON search_interactions(document_id, last_interacted_at DESC);
CREATE INDEX IF NOT EXISTS search_interactions_context_idx ON search_interactions(actor, surface, last_interacted_at DESC);

CREATE TABLE IF NOT EXISTS search_vectors (
  document_id TEXT NOT NULL REFERENCES search_documents(id) ON DELETE CASCADE,
  fragment_id TEXT,
  model TEXT NOT NULL,
  embedding_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (document_id, fragment_id, model)
);

CREATE TABLE IF NOT EXISTS search_ranking_cache (
  cache_key TEXT PRIMARY KEY,
  query_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
  doc_id UNINDEXED,
  fragment_id UNINDEXED,
  source UNINDEXED,
  shard UNINDEXED,
  domain UNINDEXED,
  type UNINDEXED,
  title,
  body,
  path,
  tokenize='unicode61'
);
`;

const SEARCH_RESET_SQL = String.raw`
DROP TABLE IF EXISTS search_fts;
DROP TABLE IF EXISTS search_fts_partitions;
DROP TABLE IF EXISTS search_ranking_cache;
DROP TABLE IF EXISTS search_vectors;
DROP TABLE IF EXISTS search_interactions;
DROP TABLE IF EXISTS search_audit_events;
DROP TABLE IF EXISTS search_monitors;
DROP TABLE IF EXISTS saved_searches;
DROP TABLE IF EXISTS search_tombstones;
DROP TABLE IF EXISTS search_index_jobs;
DROP TABLE IF EXISTS search_cursors;
DROP TABLE IF EXISTS search_actions;
DROP TABLE IF EXISTS search_fragments;
DROP TABLE IF EXISTS search_shards;
DROP TABLE IF EXISTS search_documents;
DROP TABLE IF EXISTS search_sources;
DROP TABLE IF EXISTS search_source_sets;
`;
