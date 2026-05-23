// @clawjs-persistent-surface-ddl-source
import { createHash } from "node:crypto";

import Database from "better-sqlite3";

import {
  LOCAL_TEXT_EMBEDDING_MODEL,
  SEARCH_SOURCE_SETS,
  createLocalTextEmbedding,
  scoreLexicalMatch,
  type SearchAction,
  type SearchAgentResultBudget,
  type SearchFacetDeclaration,
  type SearchInteraction,
  type SearchQueryInput,
  type SearchQueryOutput,
  type SearchResult,
  type SearchSourceManifest,
  type SearchSourceSetId,
  type SearchSourceState,
} from "./index.ts";
import type {
  SearchAuditEvent,
  SearchAuditEventType,
  SearchEmbeddingStatus,
  SearchIndexJob,
  SearchIndexJobOperation,
  SearchIndexJobStatus,
  SearchMonitorInput,
  SearchShardState,
  SearchShardStatus,
  SearchSourceCursor,
  SearchTombstone,
  SearchVectorRecord,
  SavedSearchInput,
} from "./store-types.ts";

const SEARCH_RANKING_CACHE_LIMITS = {
  maxEntries: 256,
  ttlMs: 24 * 60 * 60 * 1000,
  maxTotalBytes: 16 * 1024 * 1024,
  maxEntryBytes: 256 * 1024,
} as const;

export interface SearchTouchedCacheScopes {
  sources: Set<string>;
  domains: Set<string>;
  shards: Set<string>;
}

export interface SearchRankingCachePayload {
  query: string;
  sourceSet: SearchSourceSetId;
  results: SearchRankingCacheResultRef[];
  facets?: SearchFacetDeclaration[];
  partial: boolean;
  omittedSources: SearchQueryOutput["omittedSources"];
}

export interface SearchRankingCacheResultRef {
  id: string;
  score: number;
  updatedAt: string;
  order: number;
  rowRank?: number;
  semanticScore?: number | null;
}

export interface SearchDocumentRow {
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

export interface SearchSemanticCandidateRow {
  document_id: string;
  embedding_json: string;
  updated_at: string;
}

export interface SearchSemanticCandidate {
  documentId: string;
  updatedAt: string;
  rank: number;
  semanticScore: number;
}

export interface SearchFragmentRow {
  id: string;
  title: string;
  snippet: string | null;
  body: string;
}

export interface SearchCursorRow {
  source: string;
  shard: string;
  cursor: string;
  watermark: string;
  checksum: string;
  updated_at: string;
  metadata_json: string;
}

export interface SearchShardRow {
  source: string;
  shard: string;
  domain: string;
  state: SearchShardState;
  document_count: number;
  fragment_count: number;
  updated_at: string;
}

export interface SearchFtsPartitionRow {
  source: string;
  shard: string;
  domain: string;
  table_name: string;
  updated_at: string;
}

export interface SearchIndexJobRow {
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

export interface SearchFileInventoryRow {
  source: string;
  root: string;
  relative_path: string;
  dev: string | null;
  ino: string | null;
  mtime_ms: number;
  size: number;
  checksum: string | null;
  extension: string | null;
  kind: string | null;
  last_seen_generation: number;
  last_indexed_at: string | null;
  state: "active" | "deleted" | "skipped";
  updated_at: string;
}

export interface SearchVectorRow {
  document_id: string;
  fragment_id: string;
  model: string;
  embedding_json: string;
  updated_at: string;
}

export interface SearchEmbeddingDocumentRow {
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

export interface SearchEmbeddingFragmentRow {
  title: string;
  snippet: string | null;
  body: string;
}

export interface SearchEmbeddingStatusRow {
  source: string;
  domain: string;
  shard: string;
  model: string;
  documents: number;
  vectors: number;
  updated_at: string | null;
}

export interface SavedSearchRow {
  id: string;
  name: string;
  query_json: string;
  created_at: string;
  updated_at: string;
}

export interface SearchMonitorRow {
  id: string;
  saved_search_id: string;
  name: string | null;
  enabled: number;
  cadence: string | null;
  created_at: string;
  updated_at: string;
}

export interface SearchAuditEventRow {
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

export interface SearchInteractionRow {
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

export function parseJson<T = Record<string, unknown>>(value: string | null | undefined): T {
  if (!value) return {} as T;
  return JSON.parse(value) as T;
}

export function existingSearchDocumentIds(db: Database.Database, ids: string[]): Set<string> {
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

export function existingSearchDocumentShardRows(db: Database.Database, ids: string[]): Map<string, { source: string; shard: string; domain: string }> {
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

export function searchCursorFromRow(row: SearchCursorRow): SearchSourceCursor {
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

export function searchShardFromRow(row: SearchShardRow): SearchShardStatus {
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

export function searchInteractionFromRow(row: SearchInteractionRow): SearchInteraction {
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

export function searchFtsPartitionFromRow(row: SearchFtsPartitionRow): { source: string; shard: string; domain: string; tableName: string } {
  return {
    source: row.source,
    shard: row.shard,
    domain: row.domain,
    tableName: row.table_name,
  };
}

export function searchIndexJobFromRow(row: SearchIndexJobRow): SearchIndexJob {
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

export function stableJobIdPart(value: string): string {
  const safe = value.replace(/[^A-Za-z0-9_.:-]+/g, "_").replace(/^_+|_+$/g, "");
  if (safe === value && safe.length > 0 && safe.length <= 120) return safe;
  const hash = createHash("sha256").update(value).digest("hex").slice(0, 16);
  return `${safe.slice(0, 100) || "resource"}-${hash}`;
}

export function searchCursorChecksum(input: { source: string; shard: string; cursor: string; watermark: string; metadata: Record<string, unknown> }): string {
  return createHash("sha256").update(stableJson(input)).digest("hex");
}

export function ftsPartitionTableName(source: string, shard: string): string {
  return `search_fts_part_${createHash("sha256").update(`${source}\0${shard}`).digest("hex").slice(0, 24)}`;
}

export function quoteSqlIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, "\"\"")}"`;
}

export function searchVectorFromRow(row: SearchVectorRow): SearchVectorRecord {
  return {
    documentId: row.document_id,
    ...(row.fragment_id ? { fragmentId: row.fragment_id } : {}),
    model: row.model,
    embedding: parseJson<number[]>(row.embedding_json),
    updatedAt: row.updated_at,
  };
}

export function buildDocumentClauses(input: SearchQueryInput, sourceSet: SearchSourceSetId, match?: string): { clauses: string[]; params: unknown[] } {
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

export function searchAclAllows(permissionsJson: string, input: SearchQueryInput): boolean {
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

export function stringListAllows(values: string[] | undefined, value: string | undefined): boolean {
  const list = normalizedStringList(values);
  if (!list.length) return true;
  return Boolean(value && list.includes(value));
}

export function searchQueryScopes(input: SearchQueryInput): string[] {
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

export function valueToStringList(value: unknown): string[] {
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

export function normalizedStringList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()))];
}

export function mergeSearchRows(left: SearchDocumentRow, right: SearchDocumentRow): SearchDocumentRow {
  return {
    ...left,
    rank: Math.min(left.rank ?? Number.MAX_SAFE_INTEGER, right.rank ?? Number.MAX_SAFE_INTEGER),
    semantic_score: Math.max(left.semantic_score ?? 0, right.semantic_score ?? 0),
  };
}

export function normalizeEmbedding(embedding: number[]): number[] {
  if (!embedding.length) throw new Error("Search vector embedding must not be empty");
  if (!embedding.every((value) => Number.isFinite(value))) throw new Error("Search vector embedding must contain only finite numbers");
  return embedding;
}

export function cosineSimilarity(left: number[], right: number[]): number {
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

export function isRebuildableSearchSchemaMismatch(error: unknown): boolean {
  return error instanceof Error
    && /no such column: source|no such column: shard|no such column: byte_count|no such column: source_count|no such column: domain_count|no such column: shard_count|search_fts|schema/i.test(error.message);
}

export function ftsQuery(query: string): string {
  const terms = query
    .trim()
    .split(/\s+/)
    .flatMap((term) => term.replace(/[^\p{L}\p{N}_]+/gu, " ").split(/\s+/))
    .filter(Boolean);
  return terms.map((term) => `"${term}"*`).join(" ");
}

export function shouldRunFuzzyFallback(query: string): boolean {
  return query.trim().split(/[^\p{L}\p{N}_]+/u).some((term) => term.length >= 4);
}

export function normalizeInlineSearchQuery(input: SearchQueryInput): SearchQueryInput {
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

export function parseInlineSearchFilters(query: string): {
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

export function pushInlineFilter(filters: Record<string, string[]>, key: string, value: string): void {
  filters[key] = uniqueStrings([...(filters[key] ?? []), value]);
}

export function mergeInlineFilterValue(current: unknown, values: string[]): string | string[] {
  const merged = uniqueStrings([...valueToStringList(current), ...values]);
  return merged.length === 1 ? merged[0] ?? "" : merged;
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function applySearchFilters(clauses: string[], params: unknown[], filters: Record<string, unknown> | undefined): void {
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

export function addInClause(clauses: string[], params: unknown[], column: string, value: unknown): void {
  const values = Array.isArray(value) ? value : [value];
  const normalized = values.filter((entry) => entry !== undefined && entry !== null && entry !== "");
  if (!normalized.length) return;
  clauses.push(`${column} IN (${normalized.map(() => "?").join(", ")})`);
  params.push(...normalized);
}

export function searchEmbeddingText(row: SearchEmbeddingDocumentRow, fragments: SearchEmbeddingFragmentRow[]): string {
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

export function addJsonEqualsClause(clauses: string[], params: unknown[], jsonColumn: string, key: string, value: unknown): void {
  const path = jsonPath(key);
  const values = Array.isArray(value) ? value : [value];
  const normalized = values.filter((entry) => entry !== undefined && entry !== null && entry !== "");
  if (!normalized.length) return;
  clauses.push(`json_extract(${jsonColumn}, ?) IN (${normalized.map(() => "?").join(", ")})`);
  params.push(path, ...normalized.map(normalizeJsonFilterValue));
}

export function jsonPath(key: string): string {
  return `$.${key.split(".").map((part) => `"${part.replace(/"/g, '\\"')}"`).join(".")}`;
}

export function normalizeJsonFilterValue(value: unknown): unknown {
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

export function truncateUtf8(value: string, maxBytes: number): string {
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

export function centralSearchScore(input: {
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

export function contextMatchBoost(
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

export function scopeFilterBoost(filters: Record<string, unknown> | undefined, metadata: Record<string, unknown>, rankingHints: Record<string, unknown>): number {
  if (!filters) return 0;
  let boost = 0;
  for (const [key, value] of Object.entries(filters)) {
    if (!key.startsWith("metadata.")) continue;
    const metadataKey = key.slice("metadata.".length);
    if (metadataValueMatches(metadata[metadataKey], value)) boost += 2;
  }
  return Math.min(8, boost + boundedNumber(rankingHints.scope, 0, 4));
}

export function metadataValueMatches(left: unknown, right: unknown): boolean {
  if (Array.isArray(right)) return right.some((entry) => metadataValueMatches(left, entry));
  if (Array.isArray(left)) return left.some((entry) => metadataValueMatches(entry, right));
  return left !== undefined && left !== null && right !== undefined && right !== null && String(left) === String(right);
}

export function boundedNumber(value: unknown, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : 0;
}

export function effectiveResultLimit(limit: number, budget: SearchAgentResultBudget | undefined): number {
  const maxResults = boundedPositiveInteger(budget?.maxResults);
  return maxResults === undefined ? limit : Math.min(limit, maxResults);
}

export function agentBudgetResultFilter(budget: SearchAgentResultBudget | undefined): (result: SearchResult) => boolean {
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

export function boundedPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(1, Math.floor(value));
}

export function searchRankingCacheKey(input: SearchQueryInput): string {
  return createHash("sha256").update(stableJson({
    query: input.query,
    domains: sortedStrings(input.domains),
    sources: sortedStrings(input.sources),
    shards: sortedStrings(input.shards),
    sourceSet: input.sourceSet ?? input.profile ?? "framework",
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

export interface SearchRankingCacheScope {
  domains: string[];
  sources: string[];
  shards: string[];
}

export function searchRankingCacheScope(input: SearchQueryInput): SearchRankingCacheScope {
  return {
    domains: sortedStrings(input.domains),
    sources: sortedStrings(input.sources),
    shards: sortedStrings(input.shards),
  };
}

export function rankingCacheScopeDeleteSql(touched: SearchTouchedCacheScopes): { sql: string; params: string[] } | null {
  const sources = sortedStrings([...touched.sources]);
  const domains = sortedStrings([...touched.domains]);
  const shards = sortedStrings([...touched.shards]);
  if (!sources.length && !domains.length && !shards.length) return null;
  const params: string[] = [];
  const sourceMatch = rankingCacheScopeDimensionSql("source", "source_count", sources, params);
  const domainMatch = rankingCacheScopeDimensionSql("domain", "domain_count", domains, params);
  const shardMatch = rankingCacheScopeDimensionSql("shard", "shard_count", shards, params);
  return {
    sql: `
      DELETE FROM search_ranking_cache
      WHERE ${sourceMatch}
        AND ${domainMatch}
        AND ${shardMatch}
    `,
    params,
  };
}

export function rankingCacheScopeDimensionSql(kind: "source" | "domain" | "shard", countColumn: string, values: string[], params: string[]): string {
  if (!values.length) return `${countColumn} = 0`;
  params.push(kind, ...values);
  return `(
    ${countColumn} = 0
    OR cache_key IN (
      SELECT cache_key
      FROM search_ranking_cache_scopes
      WHERE scope_kind = ? AND scope_value IN (${values.map(() => "?").join(", ")})
    )
  )`;
}

export function rankingCacheCutoffIso(now: number = Date.now()): string {
  return new Date(now - SEARCH_RANKING_CACHE_LIMITS.ttlMs).toISOString();
}

export function sortedStrings(values: string[] | undefined): string[] {
  return [...new Set(values ?? [])].sort();
}

export function stableJson(value: unknown): string {
  return JSON.stringify(normalizeCacheValue(value));
}

export function normalizeCacheValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeCacheValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalizeCacheValue(entry)]));
  }
  return value;
}

export const SEARCH_SCHEMA_SQL = String.raw`
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

CREATE TABLE IF NOT EXISTS search_file_inventory (
  source TEXT NOT NULL REFERENCES search_sources(id) ON DELETE CASCADE,
  root TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  dev TEXT,
  ino TEXT,
  mtime_ms REAL NOT NULL,
  size INTEGER NOT NULL,
  checksum TEXT,
  extension TEXT,
  kind TEXT,
  last_seen_generation INTEGER NOT NULL DEFAULT 0,
  last_indexed_at TEXT,
  state TEXT NOT NULL DEFAULT 'active',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source, root, relative_path)
);
CREATE INDEX IF NOT EXISTS search_file_inventory_seen_idx ON search_file_inventory(source, root, state, last_seen_generation);
CREATE INDEX IF NOT EXISTS search_file_inventory_identity_idx ON search_file_inventory(source, root, dev, ino);

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
CREATE INDEX IF NOT EXISTS search_vectors_model_document_idx ON search_vectors(model, document_id);

CREATE TABLE IF NOT EXISTS search_ranking_cache (
  cache_key TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  byte_count INTEGER NOT NULL DEFAULT 0,
  result_count INTEGER NOT NULL DEFAULT 0,
  source_count INTEGER NOT NULL DEFAULT 0,
  domain_count INTEGER NOT NULL DEFAULT 0,
  shard_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS search_ranking_cache_updated_idx ON search_ranking_cache(updated_at DESC);
CREATE INDEX IF NOT EXISTS search_ranking_cache_bytes_idx ON search_ranking_cache(byte_count);

CREATE TABLE IF NOT EXISTS search_ranking_cache_scopes (
  cache_key TEXT NOT NULL REFERENCES search_ranking_cache(cache_key) ON DELETE CASCADE,
  scope_kind TEXT NOT NULL,
  scope_value TEXT NOT NULL,
  PRIMARY KEY (cache_key, scope_kind, scope_value)
);
CREATE INDEX IF NOT EXISTS search_ranking_cache_scopes_lookup_idx ON search_ranking_cache_scopes(scope_kind, scope_value, cache_key);

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

export const SEARCH_RESET_SQL = String.raw`
DROP TABLE IF EXISTS search_fts;
DROP TABLE IF EXISTS search_fts_partitions;
DROP TABLE IF EXISTS search_ranking_cache_scopes;
DROP TABLE IF EXISTS search_ranking_cache;
DROP TABLE IF EXISTS search_vectors;
DROP TABLE IF EXISTS search_interactions;
DROP TABLE IF EXISTS search_audit_events;
DROP TABLE IF EXISTS search_monitors;
DROP TABLE IF EXISTS saved_searches;
DROP TABLE IF EXISTS search_tombstones;
DROP TABLE IF EXISTS search_file_inventory;
DROP TABLE IF EXISTS search_index_jobs;
DROP TABLE IF EXISTS search_cursors;
DROP TABLE IF EXISTS search_actions;
DROP TABLE IF EXISTS search_fragments;
DROP TABLE IF EXISTS search_shards;
DROP TABLE IF EXISTS search_documents;
DROP TABLE IF EXISTS search_sources;
DROP TABLE IF EXISTS search_source_sets;
`;
