import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import Database from "better-sqlite3";

import {
  SEARCH_PROFILES,
  createSearchRegistry,
  scoreLexicalMatch,
  type SearchAction,
  type SearchFacetDeclaration,
  type SearchProfileId,
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
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface SearchTombstone {
  id: string;
  source: string;
  resourceId: string;
  deletedAt: string;
  reason?: string;
}

export type SearchIndexJobOperation = "upsert" | "delete" | "backfill" | "rebuild";

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

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.ensureSchema();
    this.seedProfiles();
  }

  reset(): void {
    this.db.exec(SEARCH_RESET_SQL);
    this.db.exec(SEARCH_SCHEMA_SQL);
    this.seedProfiles();
  }

  resetSources(sources: string[]): void {
    const uniqueSources = Array.from(new Set(sources.map((source) => source.trim()).filter(Boolean)));
    if (!uniqueSources.length) return;
    const tx = this.db.transaction(() => {
      const deleteFts = this.db.prepare("DELETE FROM search_fts WHERE source = ?");
      const deleteDocuments = this.db.prepare("DELETE FROM search_documents WHERE source = ?");
      const deleteCursors = this.db.prepare("DELETE FROM search_cursors WHERE source = ?");
      const deleteTombstones = this.db.prepare("DELETE FROM search_tombstones WHERE source = ?");
      for (const source of uniqueSources) {
        deleteFts.run(source);
        deleteDocuments.run(source);
        deleteCursors.run(source);
        deleteTombstones.run(source);
      }
      this.db.prepare("DELETE FROM search_ranking_cache").run();
    });
    tx();
  }

  close(): void {
    this.db.close();
  }

  registerSource(manifest: SearchSourceManifest, options: { state?: SearchSourceState; backlog?: number; error?: string | null } = {}): void {
    const now = new Date().toISOString();
    const manifestJson = JSON.stringify(manifest);
    const existing = this.db.prepare("SELECT state, backlog, error, manifest_json FROM search_sources WHERE id = ?").get(manifest.id) as { state: SearchSourceState; backlog: number; error: string | null; manifest_json: string } | undefined;
    this.db.prepare(`
      INSERT INTO search_sources (id, domain, name, version, profile, manifest_json, state, backlog, error, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        domain = excluded.domain,
        name = excluded.name,
        version = excluded.version,
        profile = excluded.profile,
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
      manifest.profile,
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

  listSources(profile: SearchProfileId = "framework"): SearchSourceManifest[] {
    const rows = this.db.prepare(`
      SELECT manifest_json FROM search_sources
      WHERE ? = 'full' OR profile = 'framework'
      ORDER BY domain ASC, id ASC
    `).all(profile) as Array<{ manifest_json: string }>;
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
      const touchedCacheScopes: SearchTouchedCacheScopes = { sources: new Set(), domains: new Set(), shards: new Set() };
      for (const input of documents) {
        const updatedAt = input.updatedAt ?? new Date().toISOString();
        const shard = input.shard ?? "default";
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
        }
        insertDocumentFts.run(input.id, input.source, shard, input.domain, input.type, input.title, [input.subtitle, input.snippet, body].filter(Boolean).join("\n"), input.path ?? "");
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
        }
        for (const action of input.actions ?? []) {
          insertAction.run(input.id, action.id, JSON.stringify(action));
        }
        touchedSources.set(input.source, updatedAt);
        touchedCacheScopes.sources.add(input.source);
        touchedCacheScopes.domains.add(input.domain);
        touchedCacheScopes.shards.add(shard);
      }
      for (const [source, updatedAt] of touchedSources) {
        updateSource.run(updatedAt, updatedAt, source);
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
    const limit = Math.max(1, queryInput.limit ?? 20);
    const candidateLimit = Math.min(200, Math.max(limit * 4, limit));
    const profile = queryInput.profile ?? "framework";
    const strategy = queryInput.strategy ?? (queryInput.embedding ? "hybrid" : "lexical");
    const match = ftsQuery(queryInput.query);
    const omittedSources = this.omittedSourcesForInput(queryInput, profile);
    const facets = this.facetsForInput(queryInput, profile);
    const rows = new Map<string, SearchDocumentRow>();
    if (strategy !== "semantic" || !queryInput.embedding) {
      const { clauses, params } = buildDocumentClauses(queryInput, profile, match);
      const lexicalRows = this.db.prepare(`
        SELECT d.*, 0 AS rank, NULL AS semantic_score
        FROM search_fts
        JOIN search_documents d ON d.id = search_fts.doc_id
        JOIN search_sources s ON s.id = d.source
        WHERE ${clauses.join(" AND ")}
        GROUP BY d.id
        ORDER BY rank ASC, d.updated_at DESC
        LIMIT ?
      `).all(...params, candidateLimit) as SearchDocumentRow[];
      for (const row of lexicalRows) rows.set(row.id, row);
    }
    if (queryInput.embedding && strategy !== "lexical") {
      for (const row of this.semanticRows(queryInput, profile, queryInput.embedding, candidateLimit)) {
        const existing = rows.get(row.id);
        rows.set(row.id, existing ? mergeSearchRows(existing, row) : row);
      }
    }
    const results = [...rows.values()]
      .filter((row) => searchAclAllows(row.permissions_json, queryInput))
      .map((row) => this.resultFromRow(row, queryInput))
      .sort((left, right) => right.score - left.score || (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""))
      .slice(0, limit);
    const output: SearchQueryOutput = {
      query: queryInput.query,
      profile,
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
      this.db.prepare(`
        INSERT INTO search_tombstones (id, source, resource_id, deleted_at, reason)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET deleted_at = excluded.deleted_at, reason = excluded.reason
      `).run(id, input.source, input.resourceId, deletedAt, input.reason ?? null);
      this.db.prepare("UPDATE search_documents SET deleted_at = ? WHERE source = ? AND resource_id = ?").run(deletedAt, input.source, input.resourceId);
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

  setCursor(input: { source: string; shard?: string; cursor: string; metadata?: Record<string, unknown>; updatedAt?: string }): SearchSourceCursor {
    const updatedAt = input.updatedAt ?? new Date().toISOString();
    const shard = input.shard ?? "default";
    this.db.prepare(`
      INSERT INTO search_cursors (source, shard, cursor, updated_at, metadata_json)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(source, shard) DO UPDATE SET cursor = excluded.cursor, updated_at = excluded.updated_at, metadata_json = excluded.metadata_json
    `).run(input.source, shard, input.cursor, updatedAt, JSON.stringify(input.metadata ?? {}));
    return { source: input.source, shard, cursor: input.cursor, updatedAt, metadata: input.metadata ?? {} };
  }

  getCursor(source: string, shard = "default"): SearchSourceCursor | null {
    const row = this.db.prepare("SELECT source, shard, cursor, updated_at, metadata_json FROM search_cursors WHERE source = ? AND shard = ?").get(source, shard) as SearchCursorRow | undefined;
    return row ? searchCursorFromRow(row) : null;
  }

  listCursors(source?: string): SearchSourceCursor[] {
    const rows = source
      ? this.db.prepare("SELECT source, shard, cursor, updated_at, metadata_json FROM search_cursors WHERE source = ? ORDER BY shard ASC").all(source) as SearchCursorRow[]
      : this.db.prepare("SELECT source, shard, cursor, updated_at, metadata_json FROM search_cursors ORDER BY source ASC, shard ASC").all() as SearchCursorRow[];
    return rows.map(searchCursorFromRow);
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

  actionsForResult(resultId: string): SearchAction[] {
    return (this.db.prepare("SELECT action_json FROM search_actions WHERE document_id = ? ORDER BY action_id ASC").all(resultId) as Array<{ action_json: string }>)
      .map((action) => parseJson<SearchAction>(action.action_json));
  }

  resultForId(resultId: string): SearchResult | null {
    const row = this.db.prepare(`
      SELECT d.*, 0 AS rank
      FROM search_documents d
      JOIN search_sources s ON s.id = d.source
      WHERE d.id = ? AND d.deleted_at IS NULL AND s.state NOT IN ('disabled', 'paused', 'excluded')
      LIMIT 1
    `).get(resultId) as SearchDocumentRow | undefined;
    return row ? this.resultFromRow(row, { query: "" }) : null;
  }

  private indexJob(id: string): SearchIndexJob | null {
    const row = this.db.prepare("SELECT * FROM search_index_jobs WHERE id = ?").get(id) as SearchIndexJobRow | undefined;
    return row ? searchIndexJobFromRow(row) : null;
  }

  private seedProfiles(): void {
    const insert = this.db.prepare(`
      INSERT INTO search_profiles (id, label, default_enabled)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET label = excluded.label, default_enabled = excluded.default_enabled
    `);
    for (const profile of SEARCH_PROFILES) insert.run(profile.id, profile.label, profile.defaultEnabled ? 1 : 0);
  }

  private ensureSchema(): void {
    try {
      this.db.exec(SEARCH_SCHEMA_SQL);
      if (
        !this.tableHasColumn("search_cursors", "shard")
        || !this.tableHasColumn("search_documents", "shard")
        || !this.tableHasColumn("search_fragments", "shard")
        || !this.tableHasColumn("search_fts", "shard")
        || !this.tableHasColumn("search_ranking_cache", "query_json")
      ) {
        this.db.exec(SEARCH_RESET_SQL);
        this.db.exec(SEARCH_SCHEMA_SQL);
      }
    } catch (error) {
      if (!isRebuildableSearchSchemaMismatch(error)) throw error;
      this.db.exec(SEARCH_RESET_SQL);
      this.db.exec(SEARCH_SCHEMA_SQL);
    }
  }

  private tableHasColumn(table: string, column: string): boolean {
    const rows = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return rows.some((row) => row.name === column);
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

  private omittedSourcesForInput(input: SearchQueryInput, profile: SearchProfileId): SearchQueryOutput["omittedSources"] {
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
    if (profile !== "full" && !explicitlyScoped) {
      selectedClauses.push("profile = 'framework'");
    }
    const omissionClauses = ["state IN ('disabled', 'paused', 'excluded')"];
    if (profile !== "full" && explicitlyScoped) omissionClauses.push("profile != 'framework'");
    const rows = this.db.prepare(`
      SELECT id, state, profile FROM search_sources
      WHERE ${selectedClauses.length ? `${selectedClauses.join(" AND ")} AND ` : ""}(${omissionClauses.join(" OR ")})
      ORDER BY domain ASC, id ASC
    `).all(...params) as Array<{ id: string; state: SearchSourceState; profile: string }>;
    return rows.map((row) => row.profile !== "framework" && profile !== "full"
      ? { source: row.id, reason: "profile" as const, message: "source is only available in the full profile" }
      : { source: row.id, reason: "disabled" as const, message: `source is ${row.state}` });
  }

  private facetsForInput(input: SearchQueryInput, profile: SearchProfileId): SearchFacetDeclaration[] {
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
    if (profile !== "full") clauses.push("profile = 'framework'");
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

  private semanticRows(input: SearchQueryInput, profile: SearchProfileId, embedding: NonNullable<SearchQueryInput["embedding"]>, limit: number): SearchDocumentRow[] {
    const queryVector = normalizeEmbedding(embedding.vector);
    const { clauses, params } = buildDocumentClauses(input, profile);
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
    const score = centralSearchScore({ lexicalScore: lexical.score, semanticScore: row.semantic_score ?? 0, rowRank: row.rank ?? 0, rankingHints, metadata, input });
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
          rankingHints,
          scoreBreakdown: score.breakdown,
          matchedBy,
        },
      } : {}),
    };
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
  updated_at: string;
  metadata_json: string;
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

function searchCursorFromRow(row: SearchCursorRow): SearchSourceCursor {
  return { source: row.source, shard: row.shard, cursor: row.cursor, updatedAt: row.updated_at, metadata: parseJson(row.metadata_json) };
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

function searchVectorFromRow(row: SearchVectorRow): SearchVectorRecord {
  return {
    documentId: row.document_id,
    ...(row.fragment_id ? { fragmentId: row.fragment_id } : {}),
    model: row.model,
    embedding: parseJson<number[]>(row.embedding_json),
    updatedAt: row.updated_at,
  };
}

function buildDocumentClauses(input: SearchQueryInput, profile: SearchProfileId, match?: string): { clauses: string[]; params: unknown[] } {
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
  if (profile !== "full") clauses.push("s.profile = 'framework'");
  clauses.push("s.state NOT IN ('disabled', 'paused', 'excluded')");
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
    .map((term) => term.replace(/[^\p{L}\p{N}_-]/gu, ""))
    .filter(Boolean);
  return terms.map((term) => `"${term}"*`).join(" ");
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
}): { total: number; breakdown: NonNullable<SearchResult["explanation"]>["scoreBreakdown"] } {
  const base = Math.max(1, 100 - Math.max(0, input.rowRank)) + input.lexicalScore / 100;
  const semanticBoost = boundedNumber(input.semanticScore, 0, 100) / 4;
  const hintBoost = boundedNumber(input.rankingHints.priority, 0, 10)
    + boundedNumber(input.rankingHints.hot, 0, 5)
    + boundedNumber(input.rankingHints.fastPath, 0, 2);
  const frecencyBoost = boundedNumber(input.rankingHints.frecency ?? input.metadata.frecency, 0, 1) * 8;
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

function searchRankingCacheKey(input: SearchQueryInput): string {
  return createHash("sha256").update(stableJson({
    query: input.query,
    domains: sortedStrings(input.domains),
    sources: sortedStrings(input.sources),
    shards: sortedStrings(input.shards),
    profile: input.profile ?? "framework",
    actor: input.actor ?? "",
    surface: input.surface ?? "",
    limit: input.limit ?? 20,
    explain: input.explain === true,
    filters: normalizeCacheValue(input.filters ?? {}),
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
CREATE TABLE IF NOT EXISTS search_profiles (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  default_enabled INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS search_sources (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  name TEXT NOT NULL,
  version INTEGER NOT NULL,
  profile TEXT NOT NULL,
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
DROP TABLE IF EXISTS search_ranking_cache;
DROP TABLE IF EXISTS search_vectors;
DROP TABLE IF EXISTS search_audit_events;
DROP TABLE IF EXISTS search_monitors;
DROP TABLE IF EXISTS saved_searches;
DROP TABLE IF EXISTS search_tombstones;
DROP TABLE IF EXISTS search_index_jobs;
DROP TABLE IF EXISTS search_cursors;
DROP TABLE IF EXISTS search_actions;
DROP TABLE IF EXISTS search_fragments;
DROP TABLE IF EXISTS search_documents;
DROP TABLE IF EXISTS search_sources;
DROP TABLE IF EXISTS search_profiles;
`;
