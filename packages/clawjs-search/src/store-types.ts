import type { SearchAction, SearchAgentResultBudget, SearchInteraction, SearchQueryInput, SearchResult } from "./index.ts";

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

export type SearchFileInventoryState = "active" | "deleted" | "skipped";

export interface SearchFileInventoryInput {
  source: string;
  root: string;
  relativePath: string;
  dev?: string | number | null;
  ino?: string | number | null;
  mtimeMs: number;
  size: number;
  checksum?: string | null;
  extension?: string | null;
  kind?: string | null;
  lastSeenGeneration: number;
  lastIndexedAt?: string | null;
  state?: SearchFileInventoryState;
  updatedAt?: string;
}

export interface SearchFileInventoryEntry {
  source: string;
  root: string;
  relativePath: string;
  dev?: string;
  ino?: string;
  mtimeMs: number;
  size: number;
  checksum?: string;
  extension?: string;
  kind?: string;
  lastSeenGeneration: number;
  lastIndexedAt?: string;
  state: SearchFileInventoryState;
  updatedAt: string;
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

export interface SearchEmbeddingIndexInput {
  sources?: string[];
  domains?: string[];
  shards?: string[];
  limit?: number;
  model?: string;
}

export function fileInventoryIdentityPart(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

export function searchFileInventoryFromRow(row: SearchFileInventoryRow): SearchFileInventoryEntry {
  return {
    source: row.source,
    root: row.root,
    relativePath: row.relative_path,
    ...(row.dev ? { dev: row.dev } : {}),
    ...(row.ino ? { ino: row.ino } : {}),
    mtimeMs: row.mtime_ms,
    size: row.size,
    ...(row.checksum ? { checksum: row.checksum } : {}),
    ...(row.extension ? { extension: row.extension } : {}),
    ...(row.kind ? { kind: row.kind } : {}),
    lastSeenGeneration: row.last_seen_generation,
    ...(row.last_indexed_at ? { lastIndexedAt: row.last_indexed_at } : {}),
    state: row.state,
    updatedAt: row.updated_at,
  };
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
