import fs from "fs";
import os from "os";
import path from "path";
import { createHash, randomUUID } from "crypto";

import Database from "better-sqlite3";

import {
  contextPackRecordSchema,
  contextPackStateSchema,
  type ContextPackItem,
  type ContextPackListInput,
  type ContextPackPrepareInput,
  type ContextPackPurpose,
  type ContextPackRecord,
  type ContextPackSensitivity,
  type ContextPackSource,
  type ContextPackState,
  type LearningRecord,
  type RulesCompileMatch,
  type SessionRecord,
  type SoulSpec,
  type UserFactSensitivity,
  type UserSpec,
} from "@clawjs/core";

import { NodeFileSystemHost, resolveFileLockPath } from "../host/filesystem.ts";
import { CLAWJS_DIR } from "../workspace/manifest.ts";

export const CONTEXT_STATE_FILE = "context.json";

export interface ContextPrepareSources {
  rules: RulesCompileMatch[];
  learnings: LearningRecord[];
  user?: UserSpec | null;
  soul?: SoulSpec | null;
  session?: SessionRecord | null;
}

export interface ContextStoreOptions {
  workspaceDir: string;
  filesystem?: NodeFileSystemHost;
}

interface MemoryCandidate {
  id: string;
  title: string;
  content: string;
  confidence: number;
  source?: string;
  provenance?: string;
  metadata?: Record<string, unknown>;
  updatedAt?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeKey(value: unknown): string {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value! > 0 ? value! : fallback;
}

function tokens(...values: Array<string | undefined>): string[] {
  return [...new Set(values
    .flatMap((value) => normalizeKey(value ?? "").split(" "))
    .filter((token) => token.length > 2))]
    .slice(0, 32);
}

function relevance(text: string, queryTokens: string[], query: string): number {
  const haystack = normalizeKey(text);
  if (!haystack || queryTokens.length === 0) return 0;
  const hits = queryTokens.filter((token) => haystack.includes(token)).length;
  const ratio = hits / queryTokens.length;
  const phraseBonus = haystack.includes(normalizeKey(query)) ? 0.25 : 0;
  return clamp01(ratio * 0.75 + phraseBonus);
}

function snippet(text: string, maxChars: number): string {
  const normalized = normalizeText(text);
  if (normalized.length <= maxChars) return normalized || "No content.";
  return `${normalized.slice(0, Math.max(1, maxChars - 3)).trim()}...`;
}

function mapSensitivity(value: UserFactSensitivity | string | undefined, fallback: ContextPackSensitivity): ContextPackSensitivity {
  if (value === "public") return "public";
  if (value === "personal") return "personal";
  if (value === "sensitive" || value === "medical" || value === "financial" || value === "legal" || value === "location" || value === "intimate" || value === "child" || value === "official_id" || value === "account") return "sensitive";
  return fallback;
}

function item(input: {
  source: ContextPackSource;
  sourceId: string;
  title: string;
  text: string;
  reason: string;
  score: number;
  confidence?: number;
  sensitivity: ContextPackSensitivity;
  metadata?: Record<string, unknown>;
}): ContextPackItem {
  const title = snippet(input.title, 100);
  const body = snippet(input.text, 700);
  return {
    id: `${input.source}:${input.sourceId}:${shortHash(`${title}:${body}`)}`,
    source: input.source,
    sourceId: input.sourceId,
    title,
    snippet: body,
    reason: input.reason,
    score: clamp01(input.score),
    confidence: clamp01(input.confidence ?? input.score),
    sensitivity: input.sensitivity,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

function userItems(user: UserSpec | null | undefined, queryTokens: string[], query: string): ContextPackItem[] {
  if (!user) return [];
  const items: ContextPackItem[] = [];
  for (const [facet, facts] of Object.entries(user.facets)) {
    for (const fact of facts) {
      const text = `${fact.key}: ${JSON.stringify(fact.value)}`;
      const score = relevance(text, queryTokens, query);
      if (score <= 0) continue;
      items.push(item({
        source: "user",
        sourceId: fact.id,
        title: `${facet}.${fact.key}`,
        text,
        reason: `Matched user ${facet} fact.`,
        score: 0.2 + score * 0.6,
        confidence: fact.metadata.confidence,
        sensitivity: mapSensitivity(fact.metadata.sensitivity, "personal"),
        metadata: { facet, path: fact.key },
      }));
    }
  }
  for (const fact of user.customFacts) {
    const text = `${fact.title}: ${JSON.stringify(fact.value)}`;
    const score = relevance(text, queryTokens, query);
    if (score <= 0) continue;
    items.push(item({
      source: "user",
      sourceId: fact.id,
      title: fact.title,
      text,
      reason: "Matched user custom fact.",
      score: 0.2 + score * 0.6,
      confidence: fact.metadata.confidence,
      sensitivity: mapSensitivity(fact.metadata.sensitivity, "personal"),
    }));
  }
  for (const proposal of user.proposals.filter((entry) => entry.status === "pending")) {
    const text = `${proposal.title ?? proposal.path ?? proposal.id}: ${JSON.stringify(proposal.value ?? proposal.fields ?? {})}`;
    const score = relevance(text, queryTokens, query);
    if (score <= 0) continue;
    items.push(item({
      source: "user",
      sourceId: proposal.id,
      title: proposal.title ?? proposal.path ?? proposal.id,
      text,
      reason: "Matched pending user proposal.",
      score: 0.15 + score * 0.45,
      confidence: proposal.confidence ?? 0.45,
      sensitivity: mapSensitivity(proposal.sensitivity, "personal"),
      metadata: { status: proposal.status },
    }));
  }
  return items;
}

function soulItem(soul: SoulSpec | null | undefined, queryTokens: string[], query: string, purpose: ContextPackPurpose): ContextPackItem[] {
  if (!soul) return [];
  const text = JSON.stringify(soul);
  const score = relevance(text, queryTokens, query);
  if (score <= 0 && purpose !== "judgment") return [];
  return [item({
    source: "soul",
    sourceId: soul.id,
    title: soul.title ?? soul.id,
    text: `Agent posture: ${soul.description ?? soul.title ?? soul.id}`,
    reason: score > 0 ? "Matched agent soul." : "Included for judgment posture.",
    score: Math.max(0.18, score * 0.5),
    confidence: 1,
    sensitivity: "internal",
  })];
}

function sessionItem(session: SessionRecord | null | undefined, queryTokens: string[], query: string): ContextPackItem[] {
  if (!session) return [];
  const text = session.messages.map((message) => `${message.role}: ${message.content}`).join("\n");
  const score = relevance(text, queryTokens, query);
  if (score <= 0) return [];
  return [item({
    source: "session",
    sourceId: session.sessionId,
    title: session.title || session.sessionId,
    text,
    reason: "Matched source session transcript.",
    score: 0.2 + score * 0.55,
    confidence: 0.8,
    sensitivity: "personal",
  })];
}

function sourceCounts(items: ContextPackItem[]): Partial<Record<ContextPackSource, number>> {
  const counts: Partial<Record<ContextPackSource, number>> = {};
  for (const entry of items) counts[entry.source] = (counts[entry.source] ?? 0) + 1;
  return counts;
}

function summaryFor(items: ContextPackItem[], query: string): string {
  if (items.length === 0) return `No context items matched "${query}".`;
  const counts = Object.entries(sourceCounts(items)).map(([source, count]) => `${count} ${source}`).join(", ");
  return `Prepared ${items.length} context item${items.length === 1 ? "" : "s"} for "${query}" from ${counts}.`;
}

export class ContextStore {
  readonly workspaceDir: string;
  private readonly filesystem: NodeFileSystemHost;

  constructor(options: ContextStoreOptions) {
    this.workspaceDir = options.workspaceDir;
    this.filesystem = options.filesystem ?? new NodeFileSystemHost();
  }

  get statePath(): string {
    return path.join(this.workspaceDir, CLAWJS_DIR, CONTEXT_STATE_FILE);
  }

  readState(): ContextPackState {
    try {
      return contextPackStateSchema.parse(JSON.parse(this.filesystem.readText(this.statePath))) as ContextPackState;
    } catch {
      return { schemaVersion: 1, packs: [], updatedAt: nowIso() };
    }
  }

  writeState(state: ContextPackState): ContextPackState {
    const next = contextPackStateSchema.parse({
      schemaVersion: 1,
      packs: [...state.packs].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      updatedAt: nowIso(),
    }) as ContextPackState;
    this.filesystem.ensureDir(path.dirname(this.statePath));
    this.filesystem.withLockRetry(resolveFileLockPath(this.statePath), () => {
      this.filesystem.writeTextAtomic(this.statePath, `${JSON.stringify(next, null, 2)}\n`);
    });
    return next;
  }

  list(input: ContextPackListInput = {}): ContextPackRecord[] {
    return this.readState().packs
      .filter((pack) => !input.purpose || pack.purpose === input.purpose)
      .filter((pack) => !input.status || pack.status === input.status);
  }

  get(id: string): ContextPackRecord | null {
    return this.readState().packs.find((pack) => pack.id === id) ?? null;
  }

  prepare(input: ContextPackPrepareInput, sources: ContextPrepareSources): ContextPackRecord {
    const query = normalizeText(input.query);
    if (!query) throw new Error("Context query is required.");
    const purpose = input.purpose ?? "manual";
    const maxItems = positiveInteger(input.maxItems, 12);
    const maxChars = positiveInteger(input.maxChars, 6_000);
    const queryTokens = tokens(query, input.domain);
    const candidates = [
      ...sources.rules.map((match) => item({
        source: "rule" as const,
        sourceId: match.rule.id,
        title: match.rule.title,
        text: match.rule.content,
        reason: match.reasons.join("; ") || "Applicable rule.",
        score: 0.75 + Math.min(0.2, match.specificity * 0.05),
        confidence: 1,
        sensitivity: "internal" as const,
        metadata: { scopePath: match.scopePath.map((scope) => scope.id) },
      })),
      ...sources.learnings.map((learning) => {
        const text = `${learning.claim} ${learning.evidence.map((entry) => entry.note).join(" ")}`;
        const score = relevance(text, queryTokens, query);
        return score > 0 ? item({
          source: "learning" as const,
          sourceId: learning.id,
          title: learning.claim,
          text,
          reason: "Matched active learning.",
          score: 0.2 + score * 0.55,
          confidence: learning.confidence,
          sensitivity: learning.target === "user" ? "personal" : "internal",
          metadata: { target: learning.target, kind: learning.kind },
        }) : null;
      }).filter((entry): entry is ContextPackItem => Boolean(entry)),
      ...userItems(sources.user, queryTokens, query),
      ...soulItem(sources.soul, queryTokens, query, purpose),
      ...sessionItem(sources.session, queryTokens, query),
      ...this.readMemoryCandidates().map((memory) => {
        const text = `${memory.title} ${memory.content}`;
        const score = relevance(text, queryTokens, query);
        return score > 0 ? item({
          source: "memory" as const,
          sourceId: memory.id,
          title: memory.title,
          text: memory.content,
          reason: "Matched local memory.",
          score: 0.2 + score * 0.6,
          confidence: memory.confidence,
          sensitivity: mapSensitivity(typeof memory.metadata?.sensitivity === "string" ? memory.metadata.sensitivity : undefined, "personal"),
          metadata: { source: memory.source, provenance: memory.provenance, updatedAt: memory.updatedAt },
        }) : null;
      }).filter((entry): entry is ContextPackItem => Boolean(entry)),
    ].sort((left, right) => right.score - left.score || right.confidence - left.confidence || left.source.localeCompare(right.source));

    const items: ContextPackItem[] = [];
    let charCount = 0;
    for (const candidate of candidates) {
      if (items.length >= maxItems) break;
      const remaining = maxChars - charCount;
      if (remaining <= 0) break;
      const next = remaining < candidate.snippet.length ? { ...candidate, snippet: snippet(candidate.snippet, remaining) } : candidate;
      if (!next.snippet.trim()) continue;
      items.push(next);
      charCount += next.snippet.length;
    }

    const timestamp = nowIso();
    const id = `context_${shortHash(`${query}:${purpose}:${timestamp}:${randomUUID()}`)}`;
    const pack = contextPackRecordSchema.parse({
      id,
      status: "active",
      purpose,
      query,
      ...(input.domain ? { domain: normalizeText(input.domain) } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      summary: summaryFor(items, query),
      items,
      sourceCounts: sourceCounts(items),
      budget: { maxItems, maxChars, itemCount: items.length, charCount },
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    }) as ContextPackRecord;
    const state = this.readState();
    this.writeState({ ...state, packs: [...state.packs, pack] });
    return pack;
  }

  archive(id: string, reason?: string): ContextPackRecord {
    const state = this.readState();
    const current = state.packs.find((pack) => pack.id === id);
    if (!current) throw new Error(`Context pack not found: ${id}`);
    const timestamp = nowIso();
    const next = contextPackRecordSchema.parse({
      ...current,
      status: "archived",
      ...(reason ? { archiveReason: normalizeText(reason) } : {}),
      archivedAt: timestamp,
      updatedAt: timestamp,
    }) as ContextPackRecord;
    this.writeState({ ...state, packs: state.packs.map((pack) => pack.id === id ? next : pack) });
    return next;
  }

  private readMemoryCandidates(): MemoryCandidate[] {
    const dbPath = resolveMainDbPath();
    if (!fs.existsSync(dbPath)) return this.readLegacyMemoryCandidates();
    let db: Database.Database | null = null;
    try {
      db = new Database(dbPath, { readonly: true, fileMustExist: true });
      return [
        ...readKnowledgeFactCandidates(db),
        ...readGenericMemoryCandidates(db),
      ];
    } catch {
      return [];
    } finally {
      db?.close();
    }
  }

  private readLegacyMemoryCandidates(): MemoryCandidate[] {
    const dbPath = path.join(this.workspaceDir, CLAWJS_DIR, "data", "database.sqlite");
    if (!fs.existsSync(dbPath)) return [];
    let db: Database.Database | null = null;
    try {
      db = new Database(dbPath, { readonly: true, fileMustExist: true });
      return readGenericMemoryCandidates(db);
    } catch {
      return [];
    } finally {
      db?.close();
    }
  }
}

export function createContextStore(options: ContextStoreOptions): ContextStore {
  return new ContextStore(options);
}

function readKnowledgeFactCandidates(db: Database.Database): MemoryCandidate[] {
  if (!tableExists(db, "knowledge_facts")) return [];
  const rows = db.prepare(`
    SELECT facts.id, facts.predicate, facts.object_value_json, facts.confidence, facts.sensitivity,
           facts.source, facts.provenance_json, facts.updated_at, entities.label AS subject_label
    FROM knowledge_facts AS facts
    LEFT JOIN knowledge_entities AS entities ON entities.id = facts.subject_id
    WHERE facts.valid_to IS NULL
    ORDER BY facts.updated_at DESC
    LIMIT 500
  `).all() as Array<{
    id: string;
    predicate: string;
    object_value_json: string;
    confidence: number | null;
    sensitivity: string;
    source: string;
    provenance_json: string;
    updated_at: string;
    subject_label: string | null;
  }>;
  return rows.map((row) => {
    const objectValue = parseJson(row.object_value_json);
    const objectText = normalizeText(
      typeof objectValue === "string" || typeof objectValue === "number" || typeof objectValue === "boolean"
        ? objectValue
        : JSON.stringify(objectValue),
    );
    const subject = normalizeText(row.subject_label);
    const title = [subject, row.predicate].filter(Boolean).join(" ") || row.id;
    return {
      id: row.id,
      title,
      content: [subject, row.predicate, objectText].filter(Boolean).join(" "),
      confidence: typeof row.confidence === "number" ? clamp01(row.confidence) : 1,
      source: row.source,
      provenance: row.provenance_json,
      metadata: { sensitivity: row.sensitivity },
      updatedAt: row.updated_at,
    };
  }).filter((memory) => memory.content.trim());
}

function readGenericMemoryCandidates(db: Database.Database): MemoryCandidate[] {
  if (!tableExists(db, "records")) return [];
  const rows = db.prepare(`
    SELECT id, data_json, created_at, updated_at
    FROM records
    WHERE namespace_id = ? AND collection_name = ?
  `).all("main", "memory") as Array<{ id: string; data_json: string; created_at: string; updated_at: string }>;
  return rows.map((row) => {
    const data = parseJson(row.data_json) as Record<string, unknown>;
    const title = normalizeText(data.title) || normalizeText(data.label) || row.id;
    const content = normalizeText(data.content) || normalizeText(data.summary) || title;
    return {
      id: row.id,
      title,
      content,
      confidence: typeof data.confidence === "number" ? clamp01(data.confidence) : 1,
      ...(typeof data.source === "string" ? { source: data.source } : {}),
      ...(typeof data.provenance === "string" ? { provenance: data.provenance } : {}),
      ...(data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata) ? { metadata: data.metadata as Record<string, unknown> } : {}),
      updatedAt: row.updated_at,
    };
  }).filter((memory) => memory.content.trim());
}

function tableExists(db: Database.Database, table: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as { name: string } | undefined;
  return Boolean(row);
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function resolveMainDbPath(): string {
  const explicit = process.env.CLAW_DB_PATH ?? process.env.CLAWJS_MAIN_DB_PATH;
  if (explicit) return expandHome(explicit);
  return path.join(resolveDataRoot(), "core.sqlite");
}

function resolveDataRoot(): string {
  const explicit = process.env.CLAW_DATA_DIR ?? process.env.CLAWIX_CLAW_DATA_DIR ?? process.env.CLAWJS_MAIN_DATA_DIR ?? process.env.CLAWIX_CLAWJS_DATA_DIR;
  if (explicit) return expandHome(explicit);
  return path.join(expandHome(process.env.CLAW_HOME ?? path.join(os.homedir(), ".claw")), "data");
}

function expandHome(value: string): string {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}
