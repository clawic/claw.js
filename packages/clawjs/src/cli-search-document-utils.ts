import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { clawCliCommandRegistry, type ClawCliSearchResult, type ClawRepositoryRoot } from "@clawjs/core/catalogs";
import { createLocalTextEmbedding, LOCAL_TEXT_EMBEDDING_MODEL, type SearchQueryInput, type SearchQueryOutput, type SearchResult } from "@clawjs/search";
import { CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import type { BusinessRecordRow } from "./cli-search-command-constants.ts";
import type { DatabaseRecordRow } from "./cli-search-document-rows.ts";

export function boundedNumberFlag(value: string | undefined, fallback: number, min: number, max: number): number {
  const number = value ? Number(value) : fallback;
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}
export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
export function firstMeaningfulLine(content: string): string | undefined {
  return content.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 0)?.slice(0, 180);
}
export function stableSearchId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 20);
}
export function hasTable(db: Database.Database, table: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?").get(table) as { name: string } | undefined;
  return !!row;
}

export function titleForDatabaseRecord(row: DatabaseRecordRow, payload: Record<string, unknown>): string {
  const fullName = [payload.firstName, payload.lastName]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .trim();
  if (fullName) return fullName;
  const value = payload.title ?? payload.name ?? payload.displayName ?? payload.subject ?? payload.label ?? payload.email;
  return typeof value === "string" && value.trim() ? value.trim() : `${row.collection_name}:${row.id}`;
}
export function searchableRecordFields(payload: Record<string, unknown>): Array<[string, unknown]> {
  const fields: Array<[string, unknown]> = [];
  for (const [key, value] of Object.entries(payload)) {
    if (["id", "createdAt", "updatedAt", "archivedAt", "deletedAt"].includes(key) || !isSearchableValue(value)) continue;
    if (isPlainRecord(value)) {
      for (const [childKey, childValue] of Object.entries(value)) {
        if (isSearchableValue(childValue)) fields.push([key === "metadata" ? childKey : `${key}.${childKey}`, childValue]);
      }
      continue;
    }
    fields.push([key, value]);
  }
  return fields;
}

export function isSearchableValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

export function stringifySearchValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim()).sort()
    : [];
}

export function sortedRecordKeys(value: unknown): string[] {
  return isPlainRecord(value) ? Object.keys(value).sort() : [];
}

export function safeSearchUrlHost(value: string): string | undefined {
  try {
    return new URL(value).host || undefined;
  } catch {
    return undefined;
  }
}

export function textFromStructuredContent(value: unknown): string | undefined {
  const parts: string[] = [];
  collectStructuredText(value, parts, 0);
  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  return text || undefined;
}

export function collectStructuredText(value: unknown, parts: string[], depth: number): void {
  if (parts.join(" ").length > 8192 || depth > 4 || value === null || value === undefined) return;
  if (typeof value === "string") {
    if (value.trim()) parts.push(value.trim());
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    parts.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStructuredText(item, parts, depth + 1);
    return;
  }
  if (!isPlainRecord(value)) return;
  for (const key of ["text", "plainText", "title", "heading", "caption", "alt", "code", "content", "children"]) {
    if (key in value) collectStructuredText(value[key], parts, depth + 1);
  }
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function pageBodyForSearch(db: Database.Database, pageId: string | null): string | undefined {
  if (!pageId || !hasTable(db, "page_blocks")) return undefined;
  const rows = db.prepare(`
    SELECT text
    FROM page_blocks
    WHERE page_id = ?
    ORDER BY sort_order, created_at
  `).all(pageId) as Array<{ text: string }>;
  const body = rows.map((row) => row.text).filter(Boolean).join("\n\n").trim();
  return body || undefined;
}

export function firstTextValue(payload: Record<string, unknown>): string | undefined {
  for (const key of ["description", "summary", "body", "content", "notes"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 180);
  }
  const metadata = payload.metadata;
  if (isPlainRecord(metadata) && typeof metadata.notes === "string" && metadata.notes.trim()) {
    return metadata.notes.trim().slice(0, 180);
  }
  return undefined;
}

export function isSensitiveRecord(payload: Record<string, unknown>): boolean {
  const metadata = isPlainRecord(payload.metadata) ? payload.metadata : {};
  const sensitivity = String(payload.sensitivity ?? metadata.sensitivity ?? payload.visibility ?? metadata.visibility ?? payload.privacy ?? metadata.privacy ?? "").toLowerCase();
  return ["sensitive", "private", "secret", "restricted"].includes(sensitivity);
}

export function parseJsonRecord(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function parseJsonValue(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

export function parseJsonArray(value: string | null | undefined): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parseKnowledgeGraphResourceId(resourceId: string): { kind: "entity" | "fact"; id: string } | null {
  const separator = resourceId.indexOf(":");
  if (separator <= 0 || separator === resourceId.length - 1) return null;
  const kind = resourceId.slice(0, separator);
  if (kind !== "entity" && kind !== "fact") return null;
  return { kind, id: resourceId.slice(separator + 1) };
}

export function parseSignalsObservationsResourceId(resourceId: string): { kind: "vertical" | "variable" | "observation"; id: string } | null {
  const separator = resourceId.indexOf(":");
  if (separator <= 0 || separator === resourceId.length - 1) return null;
  const kind = resourceId.slice(0, separator);
  if (kind !== "vertical" && kind !== "variable" && kind !== "observation") return null;
  return { kind, id: resourceId.slice(separator + 1) };
}

export function signalUnitLabel(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (isPlainRecord(value)) {
    return stringValue(value.id)
      ?? stringValue(value.symbol)
      ?? stringValue(value.label)
      ?? stringValue(value.name);
  }
  return undefined;
}

export function financeRecordKind(collectionName: string, payload: Record<string, unknown>): string {
  const explicit = stringValue(payload.kind) ?? stringValue(payload.type);
  if (explicit) return explicit;
  if (collectionName === "transactions") return "transaction";
  if (collectionName === "financial_accounts") return "financial_account";
  if (collectionName === "invoices") return "invoice";
  if (collectionName === "payment_intents") return "payment_intent";
  if (collectionName === "accounting_entries") return "accounting_entry";
  if (collectionName === "accounting_lines") return "accounting_line";
  return "finance_record";
}

export function isSensitiveKnowledge(sensitivity: string): boolean {
  return ["sensitive", "private", "secret", "restricted"].includes(sensitivity.toLowerCase());
}

export function stringMetadata(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function parseListFlag(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const entries = value.split(",").map((entry) => entry.trim()).filter(Boolean);
  return entries.length ? entries : undefined;
}

export function parseSearchFiltersFlag(value: string | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("{")) {
    const parsed = parseSearchJsonFlag(trimmed, "filters") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw searchJsonFlagUsageError("filters", "--filters must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  }
  const filters: Record<string, unknown> = {};
  for (const entry of trimmed.split(",")) {
    const [rawKey, ...rawValue] = entry.split("=");
    const key = rawKey?.trim();
    const text = rawValue.join("=").trim();
    if (!key || !text) continue;
    filters[key] = parseFilterValue(text);
  }
  return Object.keys(filters).length ? filters : undefined;
}

export function parseSearchStrategyFlag(value: string | undefined): "lexical" | "semantic" | "hybrid" | undefined {
  return value === "semantic" || value === "hybrid" || value === "lexical" ? value : undefined;
}

export function parseSearchAgentBudget(flags: Record<string, string>): SearchQueryInput["agentBudget"] | undefined {
  const maxResults = parseOptionalBoundedInteger(flags["agent-result-limit"] ?? flags["agent-results-limit"], 1, 1000);
  const maxResultsPerSource = parseOptionalBoundedInteger(flags["agent-source-limit"] ?? flags["agent-results-per-source"], 1, 1000);
  const maxResultsPerDomain = parseOptionalBoundedInteger(flags["agent-domain-limit"] ?? flags["agent-results-per-domain"], 1, 1000);
  if (maxResults === undefined && maxResultsPerSource === undefined && maxResultsPerDomain === undefined) return undefined;
  return {
    ...(maxResults === undefined ? {} : { maxResults }),
    ...(maxResultsPerSource === undefined ? {} : { maxResultsPerSource }),
    ...(maxResultsPerDomain === undefined ? {} : { maxResultsPerDomain }),
  };
}

export function parseOptionalBoundedInteger(value: string | undefined, min: number, max: number): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

export function parseSearchIndexJobOperation(value: string | undefined): "upsert" | "delete" | "backfill" | "rebuild" | "embed" | undefined {
  return value === "upsert" || value === "delete" || value === "backfill" || value === "rebuild" || value === "embed" ? value : undefined;
}

export function parseSearchChangedOperation(value: string | undefined): "upsert" | "delete" | undefined {
  return value === "upsert" || value === "delete" ? value : undefined;
}

export function parseSearchIndexJobStatus(value: string | undefined): "queued" | "leased" | "done" | "failed" | undefined {
  return value === "queued" || value === "leased" || value === "done" || value === "failed" ? value : undefined;
}

export function parseSearchJobPayloadFlag(value: string | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const parsed = parseSearchJsonFlag(value, "payload") as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw searchJsonFlagUsageError("payload", "--payload must be a JSON object");
  return parsed as Record<string, unknown>;
}

export function formatSearchJobLine(item: unknown): string {
  if (!item || typeof item !== "object") return String(item);
  const job = item as { id?: string; source?: string; shard?: string; operation?: string; status?: string; attempts?: number };
  return `${job.id ?? ""}\t${job.source ?? ""}\t${job.shard ?? ""}\t${job.operation ?? ""}\t${job.status ?? ""}\tattempts=${job.attempts ?? 0}`;
}

export function formatSearchShardLine(item: unknown): string {
  if (!item || typeof item !== "object") return String(item);
  const shard = item as { source?: string; shard?: string; domain?: string; state?: string; documentCount?: number; fragmentCount?: number };
  return `${shard.source ?? ""}\t${shard.shard ?? ""}\t${shard.domain ?? ""}\t${shard.state ?? ""}\tdocuments=${shard.documentCount ?? 0}\tfragments=${shard.fragmentCount ?? 0}`;
}

export function parseSearchEmbeddingFlag(value: string | undefined, model: string | undefined): { model: string; vector: number[] } | undefined {
  if (!value) return undefined;
  const parsed = parseSearchJsonFlag(value, "embedding") as unknown;
  if (!Array.isArray(parsed)) throw searchJsonFlagUsageError("embedding", "--embedding must be a JSON number array");
  const vector = parsed.map((entry) => {
    if (typeof entry !== "number" || !Number.isFinite(entry)) throw searchJsonFlagUsageError("embedding", "--embedding must be a JSON number array");
    return entry;
  });
  if (!vector.length) throw searchJsonFlagUsageError("embedding", "--embedding must not be empty");
  return { model: model ?? "local", vector };
}

function parseSearchJsonFlag(value: string, flag: "filters" | "payload" | "embedding"): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw searchJsonFlagUsageError(flag, `--${flag} must be valid JSON`);
  }
}

function searchJsonFlagUsageError(flag: "filters" | "payload" | "embedding", message: string): CliHandledError {
  return new CliHandledError(`invalid_search_${flag}_json`, message, {
    exitCode: CLI_EXIT_USAGE,
    location: `cli.search.${flag}`,
    details: { flag },
  });
}

export function localTextEmbeddingForQuery(query: string, strategy: SearchQueryInput["strategy"], flags: Record<string, string>): { model: string; vector: number[] } | undefined {
  const model = flags["embedding-model"] ?? flags.model;
  const requested = model !== undefined || flags["local-embedding"] === "true";
  if (!requested || strategy === "lexical") return undefined;
  return createLocalTextEmbedding(query, { model: localSearchEmbeddingModel(model) });
}

function localSearchEmbeddingModel(model: string | undefined): string {
  if (!model || model === LOCAL_TEXT_EMBEDDING_MODEL) return LOCAL_TEXT_EMBEDDING_MODEL;
  throw new CliHandledError("SEARCH_EMBEDDING_PROVIDER_PENDING", `Search local embedding indexing only supports ${LOCAL_TEXT_EMBEDDING_MODEL}; provider-backed embedding workers are EXTERNAL PENDING.`, CLI_EXIT_USAGE);
}

export function searchQueryRequiresAudit(query: string, results: SearchResult[], filters: Record<string, unknown> | undefined): boolean {
  if (results.some((result) => result.permissions?.redacted)) return true;
  if (filters?.redacted === true || filters?.canPreview === false) return true;
  return /\b(secret|private|restricted|sensitive|token|password|credential)\b/i.test(query);
}

export function mergeQueryOutputWithLocalDiscovery(output: SearchQueryOutput, localResults: ClawCliSearchResult[], limit: number): SearchQueryOutput {
  if (localResults.length === 0) return output;
  const merged = new Map<string, SearchResult>();
  for (const result of output.results) merged.set(`${result.source}:${result.id}`, result);
  for (const result of localResults) {
    const searchResult = localDiscoveryToSearchResult(result);
    const key = `${searchResult.source}:${searchResult.id}`;
    const previous = merged.get(key);
    if (!previous || searchResult.score > previous.score) merged.set(key, searchResult);
  }
  return {
    ...output,
    results: [...merged.values()]
      .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
      .slice(0, limit),
  };
}

export function localDiscoveryToSearchResult(result: ClawCliSearchResult): SearchResult {
  return {
    id: `local:${result.path}`,
    source: "local.files",
    domain: "files",
    type: result.type,
    title: result.name,
    subtitle: result.canonicalName,
    snippet: result.summary,
    score: result.score,
    updatedAt: "1970-01-01T00:00:00.000Z",
    resourceId: result.path,
    path: result.path,
    fragments: [{
      id: `local:${result.path}:match`,
      title: "Local file",
      snippet: result.summary,
      score: result.score,
    }],
    actions: [],
    permissions: {
      canOpen: true,
      canPreview: true,
      redacted: false,
    },
    metadata: {
      canonicalName: result.canonicalName,
      relativePath: result.path,
    },
  };
}

export function parseFilterValue(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value.includes("|")) return value.split("|").map((entry) => parseFilterValue(entry.trim()));
  return value;
}

export type SearchRepositoryRoot = Pick<ClawRepositoryRoot, "repo" | "rootDir">;

export function searchRegisteredRepositoryFiles(query: string, repositories: SearchRepositoryRoot[]): ClawCliSearchResult[] {
  return repositories.flatMap((repository) => searchRegisteredRepositoryLocalFiles(query, repository));
}

export function searchRegisteredLocalFiles(query: string, cwd: string): ClawCliSearchResult[] {
  return searchRegisteredRepositoryFiles(query, [{ repo: "clawjs", rootDir: cwd }]);
}

export function searchRegisteredRepositoryLocalFiles(query: string, repository: SearchRepositoryRoot): ClawCliSearchResult[] {
  const cwd = repository.rootDir;
  const paths = new Map<string, { type: ClawCliSearchResult["type"]; canonicalName: string }>();
  if (repository.repo === "clawjs") {
    for (const entry of clawCliCommandRegistry.commands) {
      for (const doc of entry.docs) paths.set(doc, { type: doc.includes("/adr/") ? "adr" : "doc", canonicalName: entry.target ?? entry.name });
      for (const adr of entry.adrs) paths.set(adr, { type: "adr", canonicalName: entry.target ?? entry.name });
      for (const test of entry.tests) paths.set(test, { type: "test", canonicalName: entry.target ?? entry.name });
      paths.set(entry.source.file, { type: "source", canonicalName: entry.target ?? entry.name });
    }
  }
  for (const entry of discoverabilitySearchFiles(cwd)) {
    paths.set(entry.path, { type: entry.type, canonicalName: entry.canonicalName });
  }

  const results: ClawCliSearchResult[] = [];
  for (const [relativePath, meta] of paths) {
    const absolutePath = path.resolve(cwd, relativePath);
    if (!isSafeSearchFile(cwd, absolutePath)) continue;
    let content = "";
    try {
      const stat = fs.statSync(absolutePath);
      if (!stat.isFile() || stat.size > 512 * 1024) continue;
      content = fs.readFileSync(absolutePath, "utf8");
    } catch {
      continue;
    }
    const match = scoreFileContent(query, `${meta.canonicalName}\n${relativePath}\n${content}`);
    if (!match) continue;
    results.push({
      type: meta.type,
      name: relativePath,
      canonicalName: meta.canonicalName,
      score: match.score,
      summary: match.summary,
      path: relativePath,
      repo: repository.repo,
    });
  }
  return results;
}

export function discoverabilitySearchFiles(cwd: string): Array<{ path: string; type: ClawCliSearchResult["type"]; canonicalName: string }> {
  const registryPath = path.resolve(cwd, "docs/discoverability.registry.json");
  try {
    const registry = JSON.parse(fs.readFileSync(registryPath, "utf8")) as {
      artifacts?: Array<{
        id?: string;
        kind?: string;
        canonicalName?: string;
        canonicalSource?: string;
        searchQueries?: Array<{ expectPath?: string }>;
      }>;
    };
    const entries: Array<{ path: string; type: ClawCliSearchResult["type"]; canonicalName: string }> = [];
    for (const artifact of registry.artifacts ?? []) {
      const type: ClawCliSearchResult["type"] = artifact.kind === "adr" || artifact.canonicalSource?.includes("/adr/") ? "adr"
        : artifact.kind === "skill" || artifact.canonicalSource?.includes("/skills/") ? "doc"
          : "doc";
      const canonicalName = artifact.canonicalName ?? artifact.id ?? "discoverability";
      if (artifact.canonicalSource) entries.push({ path: artifact.canonicalSource, type, canonicalName });
      for (const query of artifact.searchQueries ?? []) {
        if (query.expectPath) entries.push({ path: query.expectPath, type, canonicalName });
      }
    }
    return entries;
  } catch {
    return [];
  }
}

export function isSafeSearchFile(cwd: string, absolutePath: string): boolean {
  const relativePath = path.relative(cwd, absolutePath);
  return !!relativePath
    && !relativePath.startsWith("..")
    && !path.isAbsolute(relativePath)
    && !relativePath.split(path.sep).some((segment) => ["node_modules", "dist", ".git", ".tmp", "build", ".next"].includes(segment));
}

export function scoreFileContent(query: string, content: string): { score: number; summary: string } | null {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return null;
  const lines = content.split(/\r?\n/);
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  let best: { score: number; summary: string } | null = null;
  for (const line of lines) {
    const normalizedLine = line.toLowerCase();
    let score = 0;
    if (normalizedLine.includes(normalizedQuery)) score = 75;
    else {
      const hits = terms.filter((term) => normalizedLine.includes(term)).length;
      if (hits > 0) score = 20 + hits * 8;
    }
    if (score === 0) continue;
    const summary = line.trim().replace(/\s+/g, " ").slice(0, 180);
    if (!best || score > best.score) best = { score, summary };
  }
  return best;
}

export function mergeSearchResults(results: ClawCliSearchResult[], limit: number): ClawCliSearchResult[] {
  const byKey = new Map<string, ClawCliSearchResult>();
  for (const result of results) {
    const key = `${result.repo ?? ""}:${result.type}:${result.name}:${result.canonicalName ?? ""}`;
    const previous = byKey.get(key);
    if (!previous || result.score > previous.score) byKey.set(key, result);
  }
  return [...byKey.values()]
    .sort((left, right) => right.score - left.score || left.type.localeCompare(right.type) || left.name.localeCompare(right.name))
    .slice(0, limit);
}
