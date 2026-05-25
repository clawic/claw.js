import {
  DatabaseServiceStore,
  type FieldDefinition,
  type IndexDefinition,
  type RecordEnvelope,
} from "@clawjs/database";
import { openMainDataStore } from "./v1-data.ts";
import { CliHandledError } from "./cli-errors.ts";
import { writeCommandJsonError, writeCommandJsonOk } from "./cli-json.ts";
import type Database from "better-sqlite3";

const MEMORY_EXIT_OK = 0;
const MEMORY_EXIT_FAILURE = 1;
const MEMORY_EXIT_USAGE = 64;

type Writable = NodeJS.WritableStream;
type MemoryKind = "semantic" | "episodic" | "procedural" | "archival";
type MemorySource = "local" | "runtime" | "all";
type MemoryStrategy = "auto" | "keyword" | "semantic" | "hybrid";

interface RuntimeMemoryEntry {
  id: string;
  label?: string;
  title?: string;
  kind?: string;
  path?: string;
  summary?: string;
  updatedAt?: string;
}

export interface MemoryCliInput {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  workspaceRoot: string;
  workspaceId: string;
  agentId: string;
  stdout: Writable;
  stderr: Writable;
  wantsJson: boolean;
  binName: string;
  runtime?: {
    list: () => Promise<RuntimeMemoryEntry[]>;
    search: (query: string) => Promise<RuntimeMemoryEntry[]>;
  };
}

interface MemoryRecord {
  id: string;
  title: string;
  content: string;
  kind: MemoryKind;
  source: string;
  provenance?: string;
  scopeUser?: string;
  scopeAgent?: string;
  scopeProject?: string;
  confidence: number;
  importance: number;
  validFrom?: string;
  validTo?: string;
  supersedes: string[];
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
}

interface MemorySearchResult extends MemoryRecord {
  score: number;
  snippet: string;
  matchedFields: string[];
  strategy: Exclude<MemoryStrategy, "auto">;
  current: boolean;
}

const MEMORY_COLLECTION = "memory";
const MEMORY_CANONICAL_COMMAND = "knowledge";
const LOW_CONFIDENCE_THRESHOLD = 0.25;

const MEMORY_FIELDS: FieldDefinition[] = [
  { name: "title", type: "text", required: true },
  { name: "content", type: "text", required: true },
  { name: "kind", type: "select", required: true, options: ["semantic", "episodic", "procedural", "archival"] },
  { name: "source", type: "text", required: true },
  { name: "provenance", type: "text" },
  { name: "scopeUser", type: "text" },
  { name: "scopeAgent", type: "text" },
  { name: "scopeProject", type: "text" },
  { name: "confidence", type: "number", required: true },
  { name: "importance", type: "number", required: true },
  { name: "validFrom", type: "date" },
  { name: "validTo", type: "date" },
  { name: "supersedes", type: "json" },
  { name: "tags", type: "json" },
  { name: "metadata", type: "json" },
  { name: "lastSeenAt", type: "date", required: true },
  { name: "normalizedHash", type: "text" },
];

const MEMORY_INDEXES: IndexDefinition[] = [
  { name: "memory_kind_idx", fields: ["kind"] },
  { name: "memory_source_idx", fields: ["source"] },
  { name: "memory_scope_agent_idx", fields: ["scopeAgent"] },
  { name: "memory_scope_project_idx", fields: ["scopeProject"] },
  { name: "memory_hash_idx", fields: ["normalizedHash"] },
];

function buildMemoryUsage(binName = "claw"): string {
  return [
    "Knowledge memory commands:",
    `  ${binName} knowledge memories capabilities [--json]`,
    `  ${binName} knowledge memories status [--json]`,
    `  ${binName} knowledge memories save <content> [--title TEXT] [--kind semantic|episodic|procedural|archival]`,
    `  ${binName} knowledge memories list [--kind KIND] [--include-history] [--json]`,
    `  ${binName} knowledge memories get <id> [--json]`,
    `  ${binName} knowledge memories update <id> [--content TEXT] [--title TEXT] [--confidence N]`,
    `  ${binName} knowledge memories delete <id> [--json]`,
    `  ${binName} knowledge memories search <query> [--strategy keyword|semantic|hybrid|auto] [--source local|runtime|all]`,
    `  ${binName} knowledge memories context <query> [--limit N] [--include-low-confidence]`,
    "",
    "Examples:",
    `  ${binName} knowledge memories save "User prefers concise answers" --title "Response style" --tags preference`,
    `  ${binName} knowledge memories search concise --json`,
    `  ${binName} knowledge memories context "answer style" --json`,
    `  ${binName} knowledge memories search deploy --source runtime --json`,
  ].join("\n");
}

export async function runMemoryCli(input: MemoryCliInput): Promise<number> {
  const command = input.positionals[1];
  const wantsHelp = input.argv.includes("--help") || input.argv.includes("-h");

  if (!command || wantsHelp || command === "help") {
    input.stdout.write(`${buildMemoryUsage(input.binName)}\n`);
    return MEMORY_EXIT_OK;
  }

  try {
    switch (command) {
      case "capabilities":
        writeSuccess(input, buildCapabilities(input));
        return MEMORY_EXIT_OK;
      case "status":
        writeSuccess(input, buildStatus(input));
        return MEMORY_EXIT_OK;
      case "save":
        return saveMemory(input);
      case "list":
        return await listMemory(input);
      case "get":
      case "inspect":
        return getMemory(input);
      case "update":
        return updateMemory(input);
      case "delete":
        return deleteMemory(input);
      case "search":
        return searchMemory(input);
      case "context":
        return contextMemory(input);
      default:
        return usageError(input, `Unsupported memory command: ${command}`);
    }
  } catch (error) {
    if (error instanceof CliHandledError) {
      writeError(input, error.code, error.message, error.exitCode);
      return error.exitCode;
    }
    const message = error instanceof Error ? error.message : String(error);
    writeError(input, "internal_error", message, MEMORY_EXIT_FAILURE);
    return MEMORY_EXIT_FAILURE;
  }
}

function openStore(workspaceRoot: string): DatabaseServiceStore {
  void workspaceRoot;
  return openMainDataStore();
}

function ensureMemoryStore(input: MemoryCliInput): DatabaseServiceStore {
  const store = openStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId(input), displayName: namespaceId(input) });
  const current = store.ensureCollection(namespaceId(input), {
    name: MEMORY_COLLECTION,
    displayName: "Memory",
    fields: MEMORY_FIELDS,
    indexes: MEMORY_INDEXES,
    coreFieldNames: ["title", "content", "kind"],
  });
  const currentFields = new Map(current.fields.map((field) => [field.name, field]));
  const missingFields = MEMORY_FIELDS.filter((field) => !currentFields.has(field.name));
  if (missingFields.length > 0) {
    store.updateCollection(namespaceId(input), MEMORY_COLLECTION, {
      displayName: "Memory",
      fields: mergeFields(current.fields, MEMORY_FIELDS),
      indexes: mergeIndexes(current.indexes, MEMORY_INDEXES),
    });
  }
  return store;
}

function mergeFields(current: FieldDefinition[], expected: FieldDefinition[]): FieldDefinition[] {
  const byName = new Map(current.map((field) => [field.name, field]));
  for (const field of expected) {
    byName.set(field.name, byName.get(field.name) ?? field);
  }
  return [...byName.values()];
}

function mergeIndexes(current: IndexDefinition[], expected: IndexDefinition[]): IndexDefinition[] {
  const byName = new Map(current.map((index) => [index.name, index]));
  for (const index of expected) {
    byName.set(index.name, byName.get(index.name) ?? index);
  }
  return [...byName.values()];
}

function namespaceId(input: MemoryCliInput): string {
  return input.flags.namespace ?? "main";
}

function buildCapabilities(input: MemoryCliInput) {
  return {
    read: true,
    write: true,
    search: true,
    context: true,
    semanticAvailable: false,
    runtimeAvailable: Boolean(input.runtime),
    defaultSource: "local",
    strategies: ["keyword", "auto", "semantic", "hybrid"],
  };
}

function buildStatus(input: MemoryCliInput) {
  const store = ensureMemoryStore(input);
  const memories = listLocalRecords(input, store).map(toMemoryRecord);
  return {
    workspace: input.workspaceRoot,
    namespace: namespaceId(input),
    memories: memories.length,
    current: memories.filter(isCurrentMemory).length,
    index: {
      available: true,
      strategy: "keyword",
      semanticAvailable: false,
    },
    runtimeAvailable: Boolean(input.runtime),
    warnings: [],
  };
}

function saveMemory(input: MemoryCliInput): number {
  const content = input.flags.content || input.flags.text || joinedPositionals(input.positionals, 2);
  if (!content) return usageError(input, `Usage: ${input.binName} knowledge memories save <content> [--title TEXT]`);
  const now = new Date().toISOString();
  const title = input.flags.title || deriveTitle(content);
  const memory = normalizeMemoryPayload(input, {
    title,
    content,
    kind: readKind(input.flags.kind),
    source: input.flags.source || "local",
    provenance: input.flags.provenance,
    scopeUser: input.flags["scope-user"],
    scopeAgent: input.flags["scope-agent"],
    scopeProject: input.flags["scope-project"],
    confidence: readUnitNumber(input.flags.confidence, 1, "--confidence", "invalid_memory_confidence"),
    importance: readUnitNumber(input.flags.importance, 0.5, "--importance", "invalid_memory_importance"),
    validFrom: input.flags["valid-from"],
    validTo: input.flags["valid-to"],
    supersedes: parseCsv(input.flags.supersedes),
    tags: parseCsv(input.flags.tags),
    metadata: parseJsonObject(input.flags.metadata),
    lastSeenAt: input.flags["last-seen-at"] || now,
  });
  const store = ensureMemoryStore(input);
  const record = store.createRecord(namespaceId(input), MEMORY_COLLECTION, memory);
  mirrorMemoryToKnowledge(store.sqlite, record.id, toMemoryRecord(record));
  writeSuccess(input, toMemoryRecord(record));
  return MEMORY_EXIT_OK;
}

async function listMemory(input: MemoryCliInput): Promise<number> {
  const source = readSource(input);
  const local = source === "runtime" ? [] : listLocal(input);
  const runtime = source === "local" || !input.runtime
    ? []
    : (await input.runtime.list()).map(runtimeToMemoryRecord);
  const results = filterMemories(input, [...local, ...runtime]);
  writeResults(input, results);
  return MEMORY_EXIT_OK;
}

function getMemory(input: MemoryCliInput): number {
  const id = input.positionals[2] || input.flags.id;
  if (!id) return usageError(input, `Usage: ${input.binName} knowledge memories ${input.positionals[1]} <id>`);
  const store = ensureMemoryStore(input);
  const record = store.getRecord(namespaceId(input), MEMORY_COLLECTION, id);
  if (!record) {
    writeError(input, "not_found", `Memory not found: ${id}`, MEMORY_EXIT_FAILURE);
    return MEMORY_EXIT_FAILURE;
  }
  writeSuccess(input, toMemoryRecord(record));
  return MEMORY_EXIT_OK;
}

function updateMemory(input: MemoryCliInput): number {
  const id = input.positionals[2] || input.flags.id;
  if (!id) return usageError(input, `Usage: ${input.binName} knowledge memories update <id> [--content TEXT] [--title TEXT]`);
  const store = ensureMemoryStore(input);
  const current = store.getRecord(namespaceId(input), MEMORY_COLLECTION, id);
  if (!current) {
    writeError(input, "not_found", `Memory not found: ${id}`, MEMORY_EXIT_FAILURE);
    return MEMORY_EXIT_FAILURE;
  }
  const currentMemory = toMemoryRecord(current);
  const content = input.flags.content || input.flags.text || joinedPositionals(input.positionals, 3);
  const patch = normalizeMemoryPayload(input, {
    title: input.flags.title ?? currentMemory.title,
    content: content ?? currentMemory.content,
    kind: input.flags.kind ? readKind(input.flags.kind) : currentMemory.kind,
    source: input.flags.source ?? currentMemory.source,
    provenance: input.flags.provenance ?? currentMemory.provenance,
    scopeUser: input.flags["scope-user"] ?? currentMemory.scopeUser,
    scopeAgent: input.flags["scope-agent"] ?? currentMemory.scopeAgent,
    scopeProject: input.flags["scope-project"] ?? currentMemory.scopeProject,
    confidence: readUnitNumber(input.flags.confidence, currentMemory.confidence, "--confidence", "invalid_memory_confidence"),
    importance: readUnitNumber(input.flags.importance, currentMemory.importance, "--importance", "invalid_memory_importance"),
    validFrom: input.flags["valid-from"] ?? currentMemory.validFrom,
    validTo: input.flags["valid-to"] ?? currentMemory.validTo,
    supersedes: input.flags.supersedes ? parseCsv(input.flags.supersedes) : currentMemory.supersedes,
    tags: input.flags.tags ? parseCsv(input.flags.tags) : currentMemory.tags,
    metadata: input.flags.metadata ? parseJsonObject(input.flags.metadata) : currentMemory.metadata,
    lastSeenAt: input.flags["last-seen-at"] || new Date().toISOString(),
  });
  const updated = store.updateRecord(namespaceId(input), MEMORY_COLLECTION, id, patch);
  mirrorMemoryToKnowledge(store.sqlite, updated.id, toMemoryRecord(updated));
  writeSuccess(input, toMemoryRecord(updated));
  return MEMORY_EXIT_OK;
}

function deleteMemory(input: MemoryCliInput): number {
  const id = input.positionals[2] || input.flags.id;
  if (!id) return usageError(input, `Usage: ${input.binName} knowledge memories delete <id>`);
  const store = ensureMemoryStore(input);
  const removed = store.deleteRecord(namespaceId(input), MEMORY_COLLECTION, id);
  if (!removed) {
    writeError(input, "not_found", `Memory not found: ${id}`, MEMORY_EXIT_FAILURE);
    return MEMORY_EXIT_FAILURE;
  }
  deleteKnowledgeMirror(store.sqlite, id);
  writeSuccess(input, { deleted: true, id });
  return MEMORY_EXIT_OK;
}

function mirrorMemoryToKnowledge(sqlite: Database.Database, memoryId: string, memory: MemoryRecord): void {
  const now = new Date().toISOString();
  const predicate = memory.tags.includes("preference")
    ? "preference"
    : memory.tags.includes("style")
      ? "communication_style"
      : `memory_${memory.kind}`;
  const subjectId = memory.scopeUser ? `user:${memory.scopeUser}` : "user:me";
  sqlite.prepare(`
    INSERT INTO knowledge_facts (id, subject_id, predicate, object_kind, object_value_json, confidence, scope_json, sensitivity, source, provenance_json, supersedes_id, valid_from, valid_to, created_at, updated_at)
    VALUES (?, ?, ?, 'memory', ?, ?, ?, ?, 'memory', ?, NULL, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET subject_id = excluded.subject_id, predicate = excluded.predicate,
      object_value_json = excluded.object_value_json, confidence = excluded.confidence,
      scope_json = excluded.scope_json, sensitivity = excluded.sensitivity, source = excluded.source,
      provenance_json = excluded.provenance_json, valid_from = excluded.valid_from,
      valid_to = excluded.valid_to, updated_at = excluded.updated_at
  `).run(
    `memory:${memoryId}`,
    subjectId,
    predicate,
    JSON.stringify({
      title: memory.title,
      content: memory.content,
      kind: memory.kind,
      tags: memory.tags,
      importance: memory.importance,
    }),
    memory.confidence,
    JSON.stringify({
      user: memory.scopeUser ?? null,
      agent: memory.scopeAgent ?? null,
      project: memory.scopeProject ?? null,
    }),
    stringFromMetadata(memory.metadata, "sensitivity") ?? "normal",
    JSON.stringify({
      memoryId,
      source: memory.source,
      provenance: memory.provenance ?? null,
      supersedes: memory.supersedes,
    }),
    memory.validFrom ?? null,
    memory.validTo ?? null,
    now,
    now,
  );
}

function deleteKnowledgeMirror(sqlite: Database.Database, memoryId: string): void {
  sqlite.prepare("DELETE FROM knowledge_facts WHERE id = ?").run(`memory:${memoryId}`);
}

function stringFromMetadata(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function searchMemory(input: MemoryCliInput): Promise<number> {
  const query = readQuery(input, 2);
  if (!query) return usageError(input, `Usage: ${input.binName} knowledge memories search <query> [--source local|runtime|all]`);

  const source = readSource(input);
  const strategy = readStrategy(input.flags.strategy);
  const limit = readPositiveInteger(input.flags.limit, 10);
  let results: MemorySearchResult[] = [];

  if (source === "local" || source === "all") {
    results = results.concat(searchLocal(input, query, strategy, limit));
  }
  if ((source === "runtime" || source === "all") && input.runtime) {
    const runtimeHits = await input.runtime.search(query);
    results = results.concat(runtimeHits.map((entry, index) => runtimeToSearchResult(entry, index, strategy)));
  }

  const deduped = dedupeSearchResults(results)
    .sort((left, right) => right.score - left.score || right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit);

  writeResults(input, deduped, { query, strategy: effectiveStrategy(strategy) });
  return MEMORY_EXIT_OK;
}

async function contextMemory(input: MemoryCliInput): Promise<number> {
  const query = readQuery(input, 2);
  if (!query) return usageError(input, `Usage: ${input.binName} knowledge memories context <query>`);
  const limit = readPositiveInteger(input.flags.limit, 6);
  const includeLowConfidence = input.argv.includes("--include-low-confidence");
  const strategy = readStrategy(input.flags.strategy);
  const memories = searchLocal(input, query, strategy, Math.max(limit * 2, limit))
    .filter((memory) => includeLowConfidence || memory.confidence >= LOW_CONFIDENCE_THRESHOLD)
    .slice(0, limit);
  const citations = memories.map((memory) => ({
    id: memory.id,
    title: memory.title,
    source: memory.source,
    provenance: memory.provenance,
  }));
  const summary = memories.length === 0
    ? `No local memories matched "${query}".`
    : memories.map((memory) => `- ${memory.title}: ${memory.snippet}`).join("\n");
  writeSuccess(input, {
    query,
    strategy: effectiveStrategy(strategy),
    summary,
    memories,
    citations,
  });
  return MEMORY_EXIT_OK;
}

function listLocal(input: MemoryCliInput): MemoryRecord[] {
  const store = ensureMemoryStore(input);
  return filterMemories(input, listLocalRecords(input, store).map(toMemoryRecord));
}

function listLocalRecords(input: MemoryCliInput, store: DatabaseServiceStore): RecordEnvelope[] {
  try {
    return store.listRecords(namespaceId(input), MEMORY_COLLECTION, { limit: 10_000 }).items;
  } catch {
    return [];
  }
}

function filterMemories(input: MemoryCliInput, memories: MemoryRecord[]): MemoryRecord[] {
  const includeHistory = input.argv.includes("--include-history");
  const includeAllWorkspaces = input.argv.includes("--all-workspaces");
  const kind = input.flags.kind;
  const scopeUser = input.flags["scope-user"];
  const scopeAgent = input.flags["scope-agent"];
  const scopeProject = input.flags["scope-project"];
  const limit = readPositiveInteger(input.flags.limit, 50);
  return memories
    .filter((memory) => includeHistory || isCurrentMemory(memory))
    .filter((memory) => includeAllWorkspaces || memory.metadata.workspaceId === input.workspaceId)
    .filter((memory) => !kind || memory.kind === kind)
    .filter((memory) => !scopeUser || memory.scopeUser === scopeUser)
    .filter((memory) => !scopeAgent || memory.scopeAgent === scopeAgent)
    .filter((memory) => !scopeProject || memory.scopeProject === scopeProject)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit);
}

function searchLocal(input: MemoryCliInput, query: string, strategy: MemoryStrategy, limit: number): MemorySearchResult[] {
  const normalizedQuery = normalizeSearchText(query);
  const queryTokens = tokenSet(query);
  const memories = filterMemories({ ...input, flags: { ...input.flags, limit: String(Math.max(limit * 4, limit)) } }, listLocal(input));
  const scored: MemorySearchResult[] = [];
  for (const memory of memories) {
    const title = normalizeSearchText(memory.title);
    const content = normalizeSearchText(memory.content);
    const tags = normalizeSearchText(memory.tags.join(" "));
    const matchedFields: string[] = [];
    let score = 0;

    if (title.includes(normalizedQuery)) {
      score += 100;
      matchedFields.push("title");
    }
    if (content.includes(normalizedQuery)) {
      score += 70;
      matchedFields.push("content");
    }
    if (tags.includes(normalizedQuery)) {
      score += 40;
      matchedFields.push("tags");
    }

    const haystackTokens = new Set([...tokenSet(memory.title), ...tokenSet(memory.content), ...tokenSet(memory.tags.join(" "))]);
    for (const token of queryTokens) {
      if (haystackTokens.has(token)) score += 10;
    }

    if (score <= 0) continue;
    const confidenceBoost = Math.max(0, memory.confidence) * 8;
    const importanceBoost = Math.max(0, memory.importance) * 6;
    scored.push({
      ...memory,
      score: score + confidenceBoost + importanceBoost,
      snippet: buildSnippet(memory, query),
      matchedFields: matchedFields.length > 0 ? [...new Set(matchedFields)] : ["content"],
      strategy: effectiveStrategy(strategy),
      current: isCurrentMemory(memory),
    });
  }
  return dedupeSearchResults(scored);
}

function dedupeSearchResults(results: MemorySearchResult[]): MemorySearchResult[] {
  const byHash = new Map<string, MemorySearchResult>();
  for (const result of results) {
    const key = normalizeHash(result.content);
    const existing = byHash.get(key);
    if (!existing || result.score > existing.score || result.updatedAt > existing.updatedAt) {
      byHash.set(key, result);
    }
  }
  return [...byHash.values()];
}

function toMemoryRecord(record: RecordEnvelope): MemoryRecord {
  const content = stringValue(record.content) || stringValue(record.description) || stringValue(record.title);
  return {
    id: record.id,
    title: stringValue(record.title) || deriveTitle(content),
    content,
    kind: readKind(stringValue(record.kind) || undefined),
    source: stringValue(record.source) || "local",
    ...(stringValue(record.provenance) ? { provenance: stringValue(record.provenance) } : {}),
    ...(stringValue(record.scopeUser) ? { scopeUser: stringValue(record.scopeUser) } : {}),
    ...(stringValue(record.scopeAgent) ? { scopeAgent: stringValue(record.scopeAgent) } : {}),
    ...(stringValue(record.scopeProject) ? { scopeProject: stringValue(record.scopeProject) } : {}),
    confidence: numberValue(record.confidence, 1),
    importance: numberValue(record.importance, 0.5),
    ...(stringValue(record.validFrom) ? { validFrom: stringValue(record.validFrom) } : {}),
    ...(stringValue(record.validTo) ? { validTo: stringValue(record.validTo) } : {}),
    supersedes: arrayOfStrings(record.supersedes),
    tags: arrayOfStrings(record.tags),
    metadata: objectValue(record.metadata),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastSeenAt: stringValue(record.lastSeenAt) || record.updatedAt,
  };
}

function normalizeMemoryPayload(input: MemoryCliInput, memory: Omit<MemoryRecord, "id" | "createdAt" | "updatedAt">): Record<string, unknown> {
  const content = memory.content.trim();
  const title = memory.title.trim() || deriveTitle(content);
  return {
    title,
    content,
    kind: memory.kind,
    source: memory.source || "local",
    ...(memory.provenance ? { provenance: memory.provenance } : {}),
    ...(memory.scopeUser ? { scopeUser: memory.scopeUser } : {}),
    ...(memory.scopeAgent ? { scopeAgent: memory.scopeAgent } : {}),
    ...(memory.scopeProject ? { scopeProject: memory.scopeProject } : {}),
    confidence: clamp01(memory.confidence),
    importance: clamp01(memory.importance),
    ...(memory.validFrom ? { validFrom: memory.validFrom } : {}),
    ...(memory.validTo ? { validTo: memory.validTo } : {}),
    supersedes: memory.supersedes,
    tags: memory.tags,
    metadata: {
      ...memory.metadata,
      workspaceId: input.workspaceId,
      agentId: input.agentId,
    },
    lastSeenAt: memory.lastSeenAt,
    normalizedHash: normalizeHash(content),
  };
}

function runtimeToSearchResult(entry: RuntimeMemoryEntry, index: number, strategy: MemoryStrategy): MemorySearchResult {
  return {
    ...runtimeToMemoryRecord(entry, index),
    score: 50,
    snippet: entry.summary || entry.label || entry.title || entry.id,
    matchedFields: ["runtime"],
    strategy: effectiveStrategy(strategy),
    current: true,
  };
}

function runtimeToMemoryRecord(entry: RuntimeMemoryEntry, index = 0): MemoryRecord {
  const content = entry.summary || entry.label || entry.title || entry.id;
  const now = new Date().toISOString();
  return {
    id: `runtime:${entry.id || index}`,
    title: entry.title || entry.label || entry.id || "Runtime memory",
    content,
    kind: "archival",
    source: "runtime",
    provenance: entry.path,
    confidence: 1,
    importance: 0.5,
    supersedes: [],
    tags: [],
    metadata: {},
    createdAt: entry.updatedAt || now,
    updatedAt: entry.updatedAt || now,
    lastSeenAt: entry.updatedAt || now,
  };
}

function readQuery(input: MemoryCliInput, startIndex: number): string | undefined {
  return (input.flags.query || joinedPositionals(input.positionals, startIndex))?.trim() || undefined;
}

function readSource(input: MemoryCliInput): MemorySource {
  if (input.argv.includes("--include-runtime")) return "all";
  const source = input.flags.source;
  if (source === "runtime" || source === "all" || source === "local") return source;
  return "local";
}

function readStrategy(value: string | undefined): MemoryStrategy {
  if (value === "keyword" || value === "semantic" || value === "hybrid" || value === "auto") return value;
  return "auto";
}

function effectiveStrategy(strategy: MemoryStrategy): Exclude<MemoryStrategy, "auto"> {
  return strategy === "semantic" || strategy === "hybrid" ? "keyword" : "keyword";
}

function readKind(value: string | undefined): MemoryKind {
  if (value === "episodic" || value === "procedural" || value === "archival" || value === "semantic") return value;
  return "semantic";
}

function isCurrentMemory(memory: MemoryRecord): boolean {
  if (!memory.validTo) return true;
  return Date.parse(memory.validTo) > Date.now();
}

function deriveTitle(content: string): string {
  return content.trim().replace(/\s+/g, " ").slice(0, 80) || "Memory";
}

function buildSnippet(memory: MemoryRecord, query: string): string {
  const text = memory.content || memory.title;
  const lower = text.toLowerCase();
  const index = lower.indexOf(query.toLowerCase());
  if (index < 0) return text.slice(0, 220);
  const start = Math.max(0, index - 80);
  return text.slice(start, Math.min(text.length, index + query.length + 140));
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeHash(value: string): string {
  return normalizeSearchText(value).replace(/[^a-z0-9 ]/g, "");
}

function tokenSet(value: string): Set<string> {
  return new Set(normalizeSearchText(value).split(/[^a-z0-9]+/).filter((token) => token.length > 1));
}

function joinedPositionals(positionals: string[], startIndex: number): string | undefined {
  const value = positionals.slice(startIndex).join(" ").trim();
  return value || undefined;
}

function parseCsv(value: string | undefined): string[] {
  return (value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
}

function parseJsonObject(value: string | undefined): Record<string, unknown> {
  if (!value?.trim()) return {};
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("--metadata must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function readUnitNumber(value: string | undefined, fallback: number, flagName: string, code: string): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new CliHandledError(code, `${flagName} must be a number between 0 and 1.`, MEMORY_EXIT_USAGE, {
      location: "cli.knowledge.memories",
      suggestion: `Pass ${flagName} with a value such as 0.5, or omit it to use the default.`,
      safeNextStep: `Rerun the knowledge memories command with a valid ${flagName} value.`,
      details: { flag: flagName, value },
    });
  }
  return parsed;
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function memoryJsonMeta(input: MemoryCliInput): Record<string, unknown> {
  return {
    subcommand: input.positionals[1] ?? "unknown",
    invokedCommand: "knowledge",
  };
}

function writeSuccess(input: MemoryCliInput, data: unknown): void {
  if (input.wantsJson) {
    writeCommandJsonOk(input.stdout, MEMORY_CANONICAL_COMMAND, data, memoryJsonMeta(input));
    return;
  }
  input.stdout.write(`${renderHuman(data)}\n`);
}

function writeResults(input: MemoryCliInput, results: unknown[], extra: Record<string, unknown> = {}): void {
  if (input.wantsJson) {
    writeCommandJsonOk(input.stdout, MEMORY_CANONICAL_COMMAND, { ...extra, results, count: results.length }, memoryJsonMeta(input));
    return;
  }
  if (results.length === 0) {
    input.stdout.write("No memories found\n");
    return;
  }
  input.stdout.write(`${results.map((entry) => renderHuman(entry)).join("\n")}\n`);
}

function writeError(input: MemoryCliInput, code: string, message: string, exitCode: number): void {
  if (input.wantsJson) {
    writeCommandJsonError(input.stdout, MEMORY_CANONICAL_COMMAND, new CliHandledError(code, message, exitCode), memoryJsonMeta(input));
  } else {
    input.stderr.write(`${message}\n`);
  }
}

function usageError(input: MemoryCliInput, message: string): number {
  writeError(input, "usage_error", message, MEMORY_EXIT_USAGE);
  return MEMORY_EXIT_USAGE;
}

function renderHuman(value: unknown): string {
  if (!value || typeof value !== "object") return String(value ?? "");
  const record = value as Record<string, unknown>;
  const id = stringValue(record.id);
  const title = stringValue(record.title) || stringValue(record.summary) || stringValue(record.content);
  if ("score" in record) return `${Number(record.score).toFixed(1)} ${id} ${title}`.trim();
  if ("memories" in record && Array.isArray(record.memories)) return `memories=${record.memories.length}`;
  if ("read" in record) return JSON.stringify(record);
  return `${id} ${title}`.trim();
}
