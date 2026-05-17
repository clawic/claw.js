import fs from "node:fs";
import path from "node:path";

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

  close(): void {
    this.db.close();
  }

  registerSource(manifest: SearchSourceManifest, options: { state?: SearchSourceState; backlog?: number; error?: string | null } = {}): void {
    const now = new Date().toISOString();
    const existing = this.db.prepare("SELECT state, backlog, error FROM search_sources WHERE id = ?").get(manifest.id) as { state: SearchSourceState; backlog: number; error: string | null } | undefined;
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
      JSON.stringify(manifest),
      options.state ?? existing?.state ?? (manifest.indexing.defaultState === "on" ? "enabled" : "disabled"),
      options.backlog ?? existing?.backlog ?? 0,
      options.error ?? existing?.error ?? null,
      now,
      options.state ? 1 : 0,
      options.backlog !== undefined ? 1 : 0,
      options.error !== undefined ? 1 : 0,
    );
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
  }

  sourceState(source: string): SearchSourceState | null {
    const row = this.db.prepare("SELECT state FROM search_sources WHERE id = ?").get(source) as { state: SearchSourceState } | undefined;
    return row?.state ?? null;
  }

  upsertDocument(input: SearchDocumentInput): void {
    const updatedAt = input.updatedAt ?? new Date().toISOString();
    const tx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO search_documents (
          id, source, domain, type, resource_id, title, subtitle, snippet, body, path,
          updated_at, metadata_json, permissions_json, ranking_json, deleted_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(id) DO UPDATE SET
          source = excluded.source,
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
      `).run(
        input.id,
        input.source,
        input.domain,
        input.type,
        input.resourceId ?? null,
        input.title,
        input.subtitle ?? null,
        input.snippet ?? null,
        input.body ?? "",
        input.path ?? null,
        updatedAt,
        JSON.stringify(input.metadata ?? {}),
        JSON.stringify(input.permissions ?? {}),
        JSON.stringify(input.rankingHints ?? {}),
      );
      this.db.prepare("DELETE FROM search_fragments WHERE document_id = ?").run(input.id);
      this.db.prepare("DELETE FROM search_actions WHERE document_id = ?").run(input.id);
      this.db.prepare("DELETE FROM search_fts WHERE doc_id = ?").run(input.id);
      this.db.prepare(`
        INSERT INTO search_fts (doc_id, fragment_id, source, domain, type, title, body, path)
        VALUES (?, NULL, ?, ?, ?, ?, ?, ?)
      `).run(input.id, input.source, input.domain, input.type, input.title, [input.subtitle, input.snippet, input.body].filter(Boolean).join("\n"), input.path ?? "");
      const insertFragment = this.db.prepare(`
        INSERT INTO search_fragments (id, document_id, source, domain, title, body, snippet, sort_order, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertFragmentFts = this.db.prepare(`
        INSERT INTO search_fts (doc_id, fragment_id, source, domain, type, title, body, path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const [index, fragment] of (input.fragments ?? []).entries()) {
        insertFragment.run(
          fragment.id,
          input.id,
          input.source,
          input.domain,
          fragment.title ?? "",
          fragment.body ?? "",
          fragment.snippet ?? null,
          fragment.sortOrder ?? index,
          JSON.stringify(fragment.metadata ?? {}),
        );
        insertFragmentFts.run(input.id, fragment.id, input.source, input.domain, input.type, fragment.title ?? "", [fragment.snippet, fragment.body].filter(Boolean).join("\n"), input.path ?? "");
      }
      const insertAction = this.db.prepare("INSERT INTO search_actions (document_id, action_id, action_json) VALUES (?, ?, ?)");
      for (const action of input.actions ?? []) {
        insertAction.run(input.id, action.id, JSON.stringify(action));
      }
      this.db.prepare("UPDATE search_sources SET last_indexed_at = ?, updated_at = ? WHERE id = ?").run(updatedAt, updatedAt, input.source);
    });
    tx();
  }

  query(input: SearchQueryInput): SearchQueryOutput {
    const startedAt = Date.now();
    const limit = Math.max(1, input.limit ?? 20);
    const profile = input.profile ?? "framework";
    const match = ftsQuery(input.query);
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
    applySearchFilters(clauses, params, input.filters);
    if (profile !== "full") {
      clauses.push("s.profile = 'framework'");
    }
    clauses.push("s.state NOT IN ('disabled', 'paused', 'excluded')");
    const omittedSources = this.omittedSourcesForInput(input, profile);
    const facets = this.facetsForInput(input, profile);
    params.push(limit);
    const rows = this.db.prepare(`
      SELECT d.*, 0 AS rank
      FROM search_fts
      JOIN search_documents d ON d.id = search_fts.doc_id
      JOIN search_sources s ON s.id = d.source
      WHERE ${clauses.join(" AND ")}
      GROUP BY d.id
      ORDER BY rank ASC, d.updated_at DESC
      LIMIT ?
    `).all(...params) as SearchDocumentRow[];
    const results = rows.map((row) => this.resultFromRow(row, input));
    return {
      query: input.query,
      profile,
      results,
      ...(facets.length ? { facets } : {}),
      partial: omittedSources.length > 0,
      omittedSources,
      elapsedMs: Date.now() - startedAt,
    };
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
    });
    tx();
    return { id, source: input.source, resourceId: input.resourceId, deletedAt, ...(input.reason ? { reason: input.reason } : {}) };
  }

  setCursor(input: { source: string; cursor: string; metadata?: Record<string, unknown>; updatedAt?: string }): SearchSourceCursor {
    const updatedAt = input.updatedAt ?? new Date().toISOString();
    this.db.prepare(`
      INSERT INTO search_cursors (source, cursor, updated_at, metadata_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(source) DO UPDATE SET cursor = excluded.cursor, updated_at = excluded.updated_at, metadata_json = excluded.metadata_json
    `).run(input.source, input.cursor, updatedAt, JSON.stringify(input.metadata ?? {}));
    return { source: input.source, cursor: input.cursor, updatedAt, metadata: input.metadata ?? {} };
  }

  getCursor(source: string): SearchSourceCursor | null {
    const row = this.db.prepare("SELECT source, cursor, updated_at, metadata_json FROM search_cursors WHERE source = ?").get(source) as SearchCursorRow | undefined;
    return row ? { source: row.source, cursor: row.cursor, updatedAt: row.updated_at, metadata: parseJson(row.metadata_json) } : null;
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

  actionsForResult(resultId: string): SearchAction[] {
    return (this.db.prepare("SELECT action_json FROM search_actions WHERE document_id = ? ORDER BY action_id ASC").all(resultId) as Array<{ action_json: string }>)
      .map((action) => parseJson<SearchAction>(action.action_json));
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
    } catch (error) {
      if (!isRebuildableSearchSchemaMismatch(error)) throw error;
      this.db.exec(SEARCH_RESET_SQL);
      this.db.exec(SEARCH_SCHEMA_SQL);
    }
  }

  private omittedSourcesForInput(input: SearchQueryInput, profile: SearchProfileId): SearchQueryOutput["omittedSources"] {
    const selectedClauses: string[] = [];
    const params: unknown[] = [];
    if (input.sources?.length) {
      selectedClauses.push(`id IN (${input.sources.map(() => "?").join(", ")})`);
      params.push(...input.sources);
    }
    if (input.domains?.length) {
      selectedClauses.push(`domain IN (${input.domains.map(() => "?").join(", ")})`);
      params.push(...input.domains);
    }
    const omissionClauses = ["state IN ('disabled', 'paused', 'excluded')"];
    if (profile !== "full") omissionClauses.push("profile != 'framework'");
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

  private resultFromRow(row: SearchDocumentRow, input: SearchQueryInput): SearchResult {
    const fragmentsWithMatch = (this.db.prepare(`
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
    return {
      id: row.id,
      source: row.source,
      domain: row.domain,
      type: row.type,
      title: row.title,
      ...(row.subtitle ? { subtitle: row.subtitle } : {}),
      snippet: row.snippet ?? row.body.slice(0, 180),
      score: Math.max(1, 100 - Math.max(0, row.rank ?? 0)) + lexical.score / 100,
      updatedAt: row.updated_at,
      ...(row.resource_id ? { resourceId: row.resource_id } : {}),
      ...(row.path ? { path: row.path } : {}),
      ...(fragments.length ? { fragments } : {}),
      ...(actions.length ? { actions } : {}),
      permissions: { canOpen: true, canPreview: true, redacted: false, ...parseJson(row.permissions_json) },
      metadata: parseJson(row.metadata_json),
      ...(input.explain ? {
        explanation: {
          sourceScore: lexical.score,
          rankingHints: parseJson(row.ranking_json),
          matchedBy: lexical.matchedBy.length ? lexical.matchedBy : (fragmentsWithMatch.find((entry) => entry.match.matchedBy.length)?.match.matchedBy ?? []),
        },
      } : {}),
    };
  }
}

interface SearchDocumentRow {
  id: string;
  source: string;
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
}

interface SearchFragmentRow {
  id: string;
  title: string;
  snippet: string | null;
  body: string;
}

interface SearchCursorRow {
  source: string;
  cursor: string;
  updated_at: string;
  metadata_json: string;
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

function parseJson<T = Record<string, unknown>>(value: string | null | undefined): T {
  if (!value) return {} as T;
  return JSON.parse(value) as T;
}

function isRebuildableSearchSchemaMismatch(error: unknown): boolean {
  return error instanceof Error
    && /no such column: source|search_fts|schema/i.test(error.message);
}

function ftsQuery(query: string): string {
  const terms = query
    .trim()
    .split(/\s+/)
    .map((term) => term.replace(/[^\p{L}\p{N}_-]/gu, ""))
    .filter(Boolean);
  return terms.map((term) => `"${term}"*`).join(" ");
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
      case "type":
      case "types":
        addInClause(clauses, params, "d.type", value);
        break;
      case "resourceId":
      case "resource_id":
        addInClause(clauses, params, "d.resource_id", value);
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
CREATE INDEX IF NOT EXISTS search_documents_domain_idx ON search_documents(domain, updated_at DESC);
CREATE INDEX IF NOT EXISTS search_documents_resource_idx ON search_documents(source, resource_id);

CREATE TABLE IF NOT EXISTS search_fragments (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES search_documents(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
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
  source TEXT PRIMARY KEY REFERENCES search_sources(id) ON DELETE CASCADE,
  cursor TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

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
  result_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
  doc_id UNINDEXED,
  fragment_id UNINDEXED,
  source UNINDEXED,
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
DROP TABLE IF EXISTS search_monitors;
DROP TABLE IF EXISTS saved_searches;
DROP TABLE IF EXISTS search_tombstones;
DROP TABLE IF EXISTS search_cursors;
DROP TABLE IF EXISTS search_actions;
DROP TABLE IF EXISTS search_fragments;
DROP TABLE IF EXISTS search_documents;
DROP TABLE IF EXISTS search_sources;
DROP TABLE IF EXISTS search_profiles;
`;
