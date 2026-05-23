import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";

import type { SessionsServiceStore } from "../store.ts";
import type {
  AppendSessionEventInput,
  CreateSessionInput,
  AppendMessageInput,
  MessageRole,
  SessionStructuredEventKind,
} from "../types.ts";

const NATIVE_FORMAT = "codex-rollout-jsonl-v1";
const DEFAULT_IMPORT_BATCH_SIZE = 500;

export interface CodexImportResult {
  filePath: string;
  sessionId: string | null;
  messagesImported: number;
  skipped: boolean;
  reason?: string;
}

export interface CodexScanResult {
  scanned: number;
  imported: CodexImportResult[];
  skipped: number;
  budgetExhausted: boolean;
  changedFiles: number;
}

interface RolloutLine {
  timestamp?: string;
  type?: string;
  payload?: Record<string, unknown>;
}

interface SessionMetaPayload {
  id?: string;
  timestamp?: string;
  cwd?: string;
  originator?: string;
  cli_version?: string;
  instructions?: string | null;
  git?: {
    commit_hash?: string;
    branch?: string;
    repository_url?: string;
  };
}

interface ResponseMessagePayload {
  type?: string;
  role?: string;
  content?: Array<{
    type?: string;
    text?: string;
  }>;
}

interface EventMsgPayload {
  type?: string;
  message?: string;
  text?: string;
  kind?: string;
}

function extractMessageText(content: ResponseMessagePayload["content"]): string {
  if (!content) return "";
  return content
    .map((block) => {
      if (typeof block?.text === "string") return block.text;
      return "";
    })
    .filter((text) => text.length > 0)
    .join("\n\n");
}

function isoToMillis(iso: string | undefined): number {
  if (!iso) return Date.now();
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : Date.now();
}

function rolloutBasename(filePath: string): string {
  return path.basename(filePath);
}

function rolloutSessionIdFromName(filePath: string): string | null {
  const match = rolloutBasename(filePath).match(/rollout-[\d-]+T[\d-]+-([0-9a-f-]{8,})\.jsonl$/i);
  return match ? match[1] : null;
}

function classifyResponseMessage(role: string | undefined): MessageRole | null {
  if (role === "user") return "user";
  if (role === "assistant") return "assistant";
  if (role === "system") return "system";
  if (role === "tool") return "tool";
  return null;
}

export interface ImportCodexFileOptions {
  forceReimport?: boolean;
  machine?: string;
  mode?: "incremental" | "full";
  batchSize?: number;
}

interface CodexFileFingerprint {
  sourceMtimeMs: number;
  sourceSize: number;
  sourceIno: number;
  sourceDev: number;
}

function fingerprintFromStat(stat: fs.Stats): CodexFileFingerprint {
  return {
    sourceMtimeMs: stat.mtimeMs,
    sourceSize: stat.size,
    sourceIno: stat.ino,
    sourceDev: stat.dev,
  };
}

function fingerprintsMatch(
  existing: ReturnType<SessionsServiceStore["findOriginByPath"]>,
  current: CodexFileFingerprint,
): boolean {
  return existing?.sourceMtimeMs === current.sourceMtimeMs
    && existing.sourceSize === current.sourceSize
    && existing.sourceIno === current.sourceIno
    && existing.sourceDev === current.sourceDev;
}

function updateNormalizedLineHash(hash: ReturnType<typeof createHash>, line: string): void {
  hash.update(line);
  hash.update("\n");
}

interface CodexImportBatch {
  sessions: CreateSessionInput[];
  messages: AppendMessageInput[];
  events: AppendSessionEventInput[];
}

interface StreamImportState {
  sessionId: string | null;
  sessionInitialized: boolean;
  messagesImported: number;
  logicalLine: number;
}

interface StreamImportOutcome {
  sessionId: string | null;
  messagesImported: number;
  mirrorHash: string;
  sourceCursorLine: number | null;
  sourceCursorHash: string | null;
  prefixMatched: boolean;
}

function sessionMetaInput(meta: SessionMetaPayload, targetId: string, machine: string | undefined): CreateSessionInput {
  return {
    id: targetId,
    agent: "codex",
    runtime: meta.originator ?? meta.cli_version ?? "codex-cli",
    machine: machine ?? null,
    projectPath: meta.cwd ?? null,
    title: `Codex ${new Date(isoToMillis(meta.timestamp)).toISOString().slice(0, 16)}`,
    createdAt: isoToMillis(meta.timestamp),
    branch: meta.git?.branch ?? null,
    cwd: meta.cwd ?? null,
    status: "active",
    customMetadata: {
      codex: {
        originator: meta.originator ?? null,
        cliVersion: meta.cli_version ?? null,
        instructions: meta.instructions ?? null,
        repositoryUrl: meta.git?.repository_url ?? null,
        commitHash: meta.git?.commit_hash ?? null,
      },
    },
  };
}

function fallbackSessionInput(filePath: string, sessionId: string, timestamp: number, machine: string | undefined): CreateSessionInput {
  return {
    id: sessionId,
    agent: "codex",
    runtime: "codex-cli",
    machine: machine ?? null,
    title: `Codex ${rolloutBasename(filePath)}`,
    createdAt: timestamp,
    status: "active",
  };
}

function stringField(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function eventTypeFor(topLevelType: string, payload: Record<string, unknown>): string {
  const payloadType = typeof payload.type === "string" && payload.type.length > 0 ? payload.type : null;
  if (topLevelType === "response_item" && payloadType) return `response_item.${payloadType}`;
  if (topLevelType === "event_msg" && payloadType) return `event_msg.${payloadType}`;
  return topLevelType;
}

function eventKindFor(topLevelType: string, payload: Record<string, unknown>, eventType: string): SessionStructuredEventKind {
  const name = stringField(payload, ["name"]);
  if (eventType === "response_item.message" || eventType === "event_msg.user_message" || eventType === "event_msg.agent_message") return "message";
  if (eventType === "response_item.reasoning" || eventType === "event_msg.agent_reasoning") return "lifecycle";
  if (eventType === "response_item.function_call") {
    if (name === "request_user_input") return "question";
    if (name === "spawn_agent" || name === "wait_agent" || name === "close_agent" || name === "send_input") return "subagent";
    return "tool_call";
  }
  if (eventType === "response_item.function_call_output") return "tool_output";
  if (eventType === "response_item.custom_tool_call" || eventType === "response_item.custom_tool_call_output" || eventType === "event_msg.patch_apply_end") return "patch";
  if (eventType === "response_item.web_search_call" || eventType === "event_msg.web_search_end") return "search";
  if (eventType === "event_msg.token_count") return "usage";
  if (eventType === "event_msg.thread_goal_updated") return "goal";
  if (eventType === "event_msg.context_compacted" || topLevelType === "compacted" || topLevelType === "context_compacted") return "compaction";
  if (eventType === "event_msg.thread_rolled_back") return "rollback";
  if (eventType === "event_msg.mcp_tool_call_end") return "mcp";
  if (eventType.startsWith("event_msg.task_") || eventType === "event_msg.item_completed" || eventType === "event_msg.turn_aborted" || topLevelType === "turn_context" || topLevelType === "session_meta") return "lifecycle";
  return "unknown";
}

function collectContentText(payload: Record<string, unknown>): string | null {
  const content = payload.content;
  if (!Array.isArray(content)) return null;
  const text = content
    .map((block) => {
      if (typeof block !== "object" || block === null) return "";
      const value = (block as Record<string, unknown>).text;
      return typeof value === "string" ? value : "";
    })
    .filter(Boolean)
    .join("\n\n");
  return text.trim() ? text : null;
}

function summarizePayload(payload: Record<string, unknown>, eventType: string): string | null {
  const contentText = collectContentText(payload);
  if (contentText) return contentText;
  const direct = stringField(payload, ["message", "text", "summary", "last_agent_message", "output", "error"]);
  if (direct) return direct;
  const name = stringField(payload, ["name"]);
  if (name) return `${eventType} ${name}`;
  return eventType;
}

function truncateSearchableText(text: string | null): string | null {
  if (!text) return null;
  const max = 8192;
  return text.length > max ? text.slice(0, max) : text;
}

function appendStructuredEvent(
  batch: CodexImportBatch,
  input: {
    filePath: string;
    lineIndex: number;
    sourceNativeId: string;
    sessionId: string;
    timestamp: number;
    topLevelType: string;
    payload: Record<string, unknown>;
  },
): void {
  const eventType = eventTypeFor(input.topLevelType, input.payload);
  const summary = summarizePayload(input.payload, eventType);
  batch.events.push({
    sessionId: input.sessionId,
    turnId: stringField(input.payload, ["turn_id", "turnId"]),
    itemId: stringField(input.payload, ["item_id", "itemId", "id"]),
    callId: stringField(input.payload, ["call_id", "callId"]),
    eventKind: eventKindFor(input.topLevelType, input.payload, eventType),
    eventType,
    role: stringField(input.payload, ["role"]),
    timestamp: input.timestamp,
    sourceNativeId: input.sourceNativeId,
    sourceLine: input.lineIndex,
    payloadJson: input.payload,
    renderedSummary: summary,
    searchableText: truncateSearchableText(summary),
  });
}

function parseRolloutLineToBatch(
  filePath: string,
  line: string,
  lineIndex: number,
  state: StreamImportState,
  batch: CodexImportBatch,
  options: ImportCodexFileOptions,
): void {
  let parsed: RolloutLine;
  try {
    parsed = JSON.parse(line) as RolloutLine;
  } catch {
    return;
  }
  const type = parsed.type;
  const payload = parsed.payload ?? {};
  const lineTimestamp = isoToMillis(parsed.timestamp);
  const sourceNativeId = `${rolloutBasename(filePath)}::line:${lineIndex}`;

  if (type === "session_meta") {
    const meta = payload as SessionMetaPayload;
    const targetId = meta.id ?? state.sessionId;
    if (!targetId) return;
    state.sessionId = targetId;
    batch.sessions.push(sessionMetaInput(meta, targetId, options.machine));
    state.sessionInitialized = true;
    appendStructuredEvent(batch, {
      filePath,
      lineIndex,
      sourceNativeId,
      sessionId: targetId,
      timestamp: lineTimestamp,
      topLevelType: type,
      payload,
    });
    return;
  }

  if (!state.sessionId) return;

  if (!state.sessionInitialized) {
    batch.sessions.push(fallbackSessionInput(filePath, state.sessionId, lineTimestamp, options.machine));
    state.sessionInitialized = true;
  }

  appendStructuredEvent(batch, {
    filePath,
    lineIndex,
    sourceNativeId,
    sessionId: state.sessionId,
    timestamp: lineTimestamp,
    topLevelType: type ?? "unknown",
    payload,
  });

  if (type === "response_item") {
    const item = payload as ResponseMessagePayload;
    if (item.type !== "message") return;
    const role = classifyResponseMessage(item.role);
    if (!role) return;
    const bodyText = extractMessageText(item.content);
    if (!bodyText.trim()) return;
    batch.messages.push({
      sessionId: state.sessionId,
      role,
      contentText: bodyText,
      contentBlocks: Array.isArray(item.content) ? (item.content as unknown[]) : null,
      timestamp: lineTimestamp,
      sourceNativeId,
    });
    return;
  }

  if (type === "event_msg") {
    const ev = payload as EventMsgPayload;
    if (ev.type === "user_message" && typeof ev.message === "string" && ev.message.trim()) {
      batch.messages.push({
        sessionId: state.sessionId,
        role: "user",
        contentText: ev.message,
        timestamp: lineTimestamp,
        sourceNativeId,
      });
    }
  }
}

function shouldFlush(batch: CodexImportBatch, batchSize: number): boolean {
  return batch.messages.length >= batchSize || batch.sessions.length >= batchSize || batch.events.length >= batchSize;
}

function flushBatch(store: SessionsServiceStore, batch: CodexImportBatch): number {
  if (batch.sessions.length === 0 && batch.messages.length === 0 && batch.events.length === 0) return 0;
  const result = store.importSessionBatch({
    sessions: batch.sessions.splice(0),
    messages: batch.messages.splice(0),
    events: batch.events.splice(0),
  });
  return result.messagesInserted;
}

async function streamCodexRolloutFile(
  store: SessionsServiceStore,
  filePath: string,
  options: ImportCodexFileOptions,
  cursor?: { line: number; hash: string },
): Promise<StreamImportOutcome> {
  const input = fs.createReadStream(filePath, { encoding: "utf8" });
  const reader = createInterface({ input, crlfDelay: Infinity });
  const hash = createHash("sha1");
  const prefixHash = cursor ? createHash("sha1") : null;
  const batchSize = Math.max(1, Math.floor(options.batchSize ?? DEFAULT_IMPORT_BATCH_SIZE));
  const batch: CodexImportBatch = { sessions: [], messages: [], events: [] };
  const state: StreamImportState = {
    sessionId: cursor ? store.findOriginByPath(filePath)?.sessionId ?? rolloutSessionIdFromName(filePath) : rolloutSessionIdFromName(filePath),
    sessionInitialized: cursor ? true : false,
    messagesImported: 0,
    logicalLine: -1,
  };
  let prefixMatched = cursor ? false : true;
  let sourceCursorHash: string | null = null;

  for await (const rawLine of reader) {
    const line = rawLine.trim();
    if (!line) continue;
    state.logicalLine += 1;
    updateNormalizedLineHash(hash, line);

    if (cursor && state.logicalLine <= cursor.line) {
      if (prefixHash) updateNormalizedLineHash(prefixHash, line);
      if (state.logicalLine === cursor.line) {
        sourceCursorHash = prefixHash?.digest("hex") ?? null;
        prefixMatched = sourceCursorHash === cursor.hash;
        if (!prefixMatched) {
          reader.close();
          input.destroy();
          break;
        }
      }
      continue;
    }

    parseRolloutLineToBatch(filePath, line, state.logicalLine, state, batch, options);
    if (shouldFlush(batch, batchSize)) state.messagesImported += flushBatch(store, batch);
  }

  state.messagesImported += flushBatch(store, batch);
  const sourceCursorLine = state.logicalLine >= 0 ? state.logicalLine : null;
  const mirrorHash = hash.digest("hex");
  return {
    sessionId: state.sessionId,
    messagesImported: state.messagesImported,
    mirrorHash,
    sourceCursorLine,
    sourceCursorHash: sourceCursorLine === null ? null : mirrorHash,
    prefixMatched: cursor ? prefixMatched && state.logicalLine >= cursor.line : true,
  };
}

export async function importCodexRolloutFile(
  store: SessionsServiceStore,
  filePath: string,
  options: ImportCodexFileOptions = {},
): Promise<CodexImportResult> {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return { filePath, sessionId: null, messagesImported: 0, skipped: true, reason: "file_not_found" };
  }
  if (!stat.isFile()) {
    return { filePath, sessionId: null, messagesImported: 0, skipped: true, reason: "not_file" };
  }

  const fingerprint = fingerprintFromStat(stat);
  const existingOrigin = store.findOriginByPath(filePath);
  if (!options.forceReimport && (options.mode ?? "incremental") === "incremental" && fingerprintsMatch(existingOrigin, fingerprint)) {
    return { filePath, sessionId: existingOrigin?.sessionId ?? null, messagesImported: 0, skipped: true, reason: "unchanged_fingerprint" };
  }

  const cursor = !options.forceReimport
    && (options.mode ?? "incremental") === "incremental"
    && existingOrigin?.sourceCursorLine != null
    && existingOrigin.sourceCursorHash
    ? { line: existingOrigin.sourceCursorLine, hash: existingOrigin.sourceCursorHash }
    : undefined;
  let outcome = await streamCodexRolloutFile(store, filePath, options, cursor);
  if (cursor && !outcome.prefixMatched) {
    outcome = await streamCodexRolloutFile(store, filePath, options);
  }

  const sessionId = outcome.sessionId ?? existingOrigin?.sessionId ?? null;
  if (!sessionId) {
    return { filePath, sessionId: null, messagesImported: outcome.messagesImported, skipped: false };
  }

  if (!options.forceReimport && existingOrigin && existingOrigin.mirrorHash === outcome.mirrorHash) {
    store.upsertOrigin({
      sessionId: existingOrigin.sessionId,
      nativePath: filePath,
      nativeFormat: NATIVE_FORMAT,
      mirrorHash: outcome.mirrorHash,
      sourceCursorLine: outcome.sourceCursorLine,
      sourceCursorHash: outcome.sourceCursorHash,
      ...fingerprint,
    });
    return { filePath, sessionId: existingOrigin.sessionId, messagesImported: 0, skipped: true, reason: "unchanged" };
  }

  store.importSessionBatch({
    origin: {
      sessionId,
      nativePath: filePath,
      nativeFormat: NATIVE_FORMAT,
      mirrorHash: outcome.mirrorHash,
      sourceCursorLine: outcome.sourceCursorLine,
      sourceCursorHash: outcome.sourceCursorHash,
      ...fingerprint,
    },
  });

  return {
    filePath,
    sessionId,
    messagesImported: outcome.messagesImported,
    skipped: false,
  };
}

export interface ImportCodexDirOptions extends ImportCodexFileOptions {
  pattern?: RegExp;
  budgetMs?: number;
  maxFiles?: number;
}

export async function importCodexSessionsDir(
  store: SessionsServiceStore,
  rootDir: string,
  options: ImportCodexDirOptions = {},
): Promise<CodexScanResult> {
  if (!fs.existsSync(rootDir)) {
    return { scanned: 0, imported: [], skipped: 0, budgetExhausted: false, changedFiles: 0 };
  }
  const pattern = options.pattern ?? /^rollout-.*\.jsonl$/;
  const start = performance.now();
  const budgetMs = options.budgetMs && options.budgetMs > 0 ? options.budgetMs : null;
  const maxFiles = options.maxFiles && options.maxFiles > 0 ? Math.floor(options.maxFiles) : null;
  const stack: string[] = [rootDir];
  const imported: CodexImportResult[] = [];
  let scanned = 0;
  let budgetExhausted = false;
  while (stack.length > 0) {
    if (maxFiles !== null && imported.length >= maxFiles) {
      budgetExhausted = true;
      break;
    }
    if (budgetMs !== null && performance.now() - start >= budgetMs) {
      budgetExhausted = true;
      break;
    }
    const dir = stack.pop();
    if (!dir) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    const dirs = entries.filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
    const files = entries.filter((entry) => entry.isFile()).sort((a, b) => b.name.localeCompare(a.name));
    for (const entry of dirs) {
      stack.push(path.join(dir, entry.name));
    }
    for (const entry of files) {
      if (maxFiles !== null && imported.length >= maxFiles) {
        budgetExhausted = true;
        break;
      }
      if (budgetMs !== null && performance.now() - start >= budgetMs) {
        budgetExhausted = true;
        break;
      }
      const full = path.join(dir, entry.name);
      if (pattern.test(entry.name)) {
        scanned += 1;
        imported.push(await importCodexRolloutFile(store, full, {
          forceReimport: options.forceReimport,
          machine: options.machine,
          mode: options.mode,
          batchSize: options.batchSize,
        }));
      }
    }
  }
  return {
    scanned,
    imported,
    skipped: imported.filter((item) => item.skipped).length,
    budgetExhausted,
    changedFiles: imported.filter((item) => !item.skipped).length,
  };
}
