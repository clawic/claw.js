import { createHash, randomUUID } from "crypto";

import type { Message } from "@clawjs/core";

import { NodeFileSystemHost, resolveFileLockPath } from "../host/filesystem.ts";
import type { SessionStore } from "../sessions/store.ts";
import { resolveClawWorkspaceSurfacePath } from "../surface-paths.ts";

export type ChannelRunStatus = "idle" | "running" | "queued" | "stopping" | "failed";
export type ChannelRunQueuePolicy = "coalesce";
export type ChannelRunDeliveryMode = "final";

export interface ChannelRunTarget {
  provider: string;
  accountId?: string;
  targetId: string;
  threadId?: string | number;
}

export interface ChannelRunMessage {
  id: string;
  content: string;
  providerMessageId?: string;
  senderId?: string;
  senderLabel?: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export interface ChannelRunRecord extends ChannelRunTarget {
  runKey: string;
  sessionId: string;
  status: ChannelRunStatus;
  queuePolicy: ChannelRunQueuePolicy;
  deliveryMode: ChannelRunDeliveryMode;
  queue: ChannelRunMessage[];
  coalescingWindowMs: number;
  compactionThresholdChars: number;
  maxRecentMessages: number;
  summary?: string;
  summaryMessageId?: string;
  activeRunId?: string;
  stopRequestedRunId?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

interface ChannelRunState {
  schemaVersion: 1;
  runs: Record<string, ChannelRunRecord>;
}

export interface ChannelRunOptions {
  queuePolicy?: ChannelRunQueuePolicy;
  deliveryMode?: ChannelRunDeliveryMode;
  coalescingWindowMs?: number;
  compactionThresholdChars?: number;
  maxRecentMessages?: number;
}

const DEFAULT_COALESCING_WINDOW_MS = 1_500;
const DEFAULT_COMPACTION_THRESHOLD_CHARS = 32_000;
const DEFAULT_MAX_RECENT_MESSAGES = 16;

function nowIso(): string {
  return new Date().toISOString();
}

function hashStableId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function normalizeAccountId(value: string | undefined): string {
  return value?.trim() || "default";
}

function positiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasErrorCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code;
}

function parseChannelRunState(value: unknown, statePath: string): ChannelRunState {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.runs)) {
    throw new Error(`Invalid channel run state at ${statePath}`);
  }
  return {
    schemaVersion: 1,
    runs: value.runs as Record<string, ChannelRunRecord>,
  };
}

export function resolveChannelRunKey(input: ChannelRunTarget): string {
  return [
    input.provider,
    normalizeAccountId(input.accountId),
    input.targetId,
    input.threadId === undefined ? "chat" : `topic:${String(input.threadId)}`,
  ].join(":");
}

function summarizeMessage(message: Message): string {
  const text = message.content.replace(/\s+/g, " ").trim();
  const clipped = text.length > 220 ? `${text.slice(0, 217).trim()}...` : text;
  return `${message.role}: ${clipped || "(empty)"}`;
}

function buildSummary(messages: Message[], maxChars: number): string {
  const lines = [
    "Earlier conversation summary:",
    ...messages.map(summarizeMessage),
  ];
  let summary = lines.join("\n");
  if (summary.length > maxChars) {
    summary = `${summary.slice(0, Math.max(0, maxChars - 18)).trim()}\n...(truncated)`;
  }
  return summary;
}

function uniqueQueuedMessages(messages: ChannelRunMessage[]): ChannelRunMessage[] {
  const seen = new Set<string>();
  const unique: ChannelRunMessage[] = [];
  for (const message of messages) {
    const key = message.providerMessageId || message.id;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(message);
  }
  return unique;
}

export class ChannelRunStore {
  private readonly workspaceDir: string;
  private readonly sessionStore: SessionStore;
  private readonly filesystem: NodeFileSystemHost;

  constructor(workspaceDir: string, sessionStore: SessionStore, options: { filesystem?: NodeFileSystemHost } = {}) {
    this.workspaceDir = workspaceDir;
    this.sessionStore = sessionStore;
    this.filesystem = options.filesystem ?? new NodeFileSystemHost();
  }

  private statePath(): string {
    return resolveClawWorkspaceSurfacePath("claw.workspace.channel_runs_state", this.workspaceDir);
  }

  private readState(): ChannelRunState {
    const statePath = this.statePath();
    try {
      return parseChannelRunState(JSON.parse(this.filesystem.readText(statePath)), statePath);
    } catch (error) {
      if (hasErrorCode(error, "ENOENT")) return { schemaVersion: 1, runs: {} };
      throw error;
    }
  }

  private writeState(state: ChannelRunState): void {
    this.filesystem.writeTextAtomic(this.statePath(), `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  }

  private mutate<T>(fn: (state: ChannelRunState) => T): T {
    return this.filesystem.withLockRetry(resolveFileLockPath(this.statePath()), () => {
      const state = this.readState();
      const result = fn(state);
      this.writeState(state);
      return result;
    }, { timeoutMs: 5_000 });
  }

  resolveOrCreateChannelRun(input: ChannelRunTarget & { sessionId: string; options?: ChannelRunOptions }): ChannelRunRecord {
    const runKey = resolveChannelRunKey(input);
    return this.mutate((state) => {
      const existing = state.runs[runKey];
      const timestamp = nowIso();
      if (existing) {
        const next: ChannelRunRecord = {
          ...existing,
          sessionId: input.sessionId,
          queuePolicy: input.options?.queuePolicy ?? existing.queuePolicy ?? "coalesce",
          deliveryMode: input.options?.deliveryMode ?? existing.deliveryMode ?? "final",
          coalescingWindowMs: positiveInteger(input.options?.coalescingWindowMs, positiveInteger(existing.coalescingWindowMs, DEFAULT_COALESCING_WINDOW_MS)),
          compactionThresholdChars: positiveInteger(input.options?.compactionThresholdChars, positiveInteger(existing.compactionThresholdChars, DEFAULT_COMPACTION_THRESHOLD_CHARS)),
          maxRecentMessages: positiveInteger(input.options?.maxRecentMessages, positiveInteger(existing.maxRecentMessages, DEFAULT_MAX_RECENT_MESSAGES)),
          updatedAt: timestamp,
        };
        state.runs[runKey] = next;
        return next;
      }
      const created: ChannelRunRecord = {
        provider: input.provider,
        accountId: normalizeAccountId(input.accountId),
        targetId: input.targetId,
        ...(input.threadId !== undefined ? { threadId: input.threadId } : {}),
        runKey,
        sessionId: input.sessionId,
        status: "idle",
        queuePolicy: input.options?.queuePolicy ?? "coalesce",
        deliveryMode: input.options?.deliveryMode ?? "final",
        queue: [],
        coalescingWindowMs: positiveInteger(input.options?.coalescingWindowMs, DEFAULT_COALESCING_WINDOW_MS),
        compactionThresholdChars: positiveInteger(input.options?.compactionThresholdChars, DEFAULT_COMPACTION_THRESHOLD_CHARS),
        maxRecentMessages: positiveInteger(input.options?.maxRecentMessages, DEFAULT_MAX_RECENT_MESSAGES),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      state.runs[runKey] = created;
      return created;
    });
  }

  enqueueChannelMessage(runKey: string, message: Omit<ChannelRunMessage, "id" | "createdAt"> & { id?: string; createdAt?: number }): ChannelRunRecord | null {
    return this.mutate((state) => {
      const run = state.runs[runKey];
      if (!run) return null;
      const queued = uniqueQueuedMessages([
        ...run.queue,
        {
          id: message.id || `queued-${randomUUID()}`,
          content: message.content,
          ...(message.providerMessageId ? { providerMessageId: message.providerMessageId } : {}),
          ...(message.senderId ? { senderId: message.senderId } : {}),
          ...(message.senderLabel ? { senderLabel: message.senderLabel } : {}),
          createdAt: message.createdAt ?? Date.now(),
          ...(message.metadata ? { metadata: message.metadata } : {}),
        },
      ]);
      run.queue = queued;
      run.status = run.status === "running" || run.status === "stopping" ? run.status : "queued";
      run.updatedAt = nowIso();
      state.runs[runKey] = run;
      return run;
    });
  }

  drainQueuedChannelMessages(runKey: string): ChannelRunMessage[] {
    return this.mutate((state) => {
      const run = state.runs[runKey];
      if (!run) return [];
      const queued = uniqueQueuedMessages(run.queue).sort((a, b) => a.createdAt - b.createdAt);
      run.queue = [];
      run.status = run.status === "queued" ? "idle" : run.status;
      run.updatedAt = nowIso();
      state.runs[runKey] = run;
      return queued;
    });
  }

  processChannelRun(input: { runKey: string; sessionId?: string; phase: "start" | "succeed" | "fail"; runId?: string; error?: string }): ChannelRunRecord | null {
    return this.mutate((state) => {
      const run = state.runs[input.runKey];
      if (!run) return null;
      if (input.sessionId) run.sessionId = input.sessionId;
      if (input.phase === "start") {
        run.status = "running";
        run.activeRunId = input.runId || `run-${randomUUID()}`;
        delete run.lastError;
      } else if (input.phase === "succeed") {
        run.status = run.queue.length > 0 ? "queued" : "idle";
        delete run.activeRunId;
        delete run.stopRequestedRunId;
      } else {
        run.status = "failed";
        run.lastError = input.error || "run failed";
        delete run.activeRunId;
      }
      run.updatedAt = nowIso();
      state.runs[input.runKey] = run;
      return run;
    });
  }

  getChannelRunStatus(runKey: string): ChannelRunRecord | null {
    return this.readState().runs[runKey] ?? null;
  }

  requestChannelRunStop(runKey: string): ChannelRunRecord | null {
    return this.mutate((state) => {
      const run = state.runs[runKey];
      if (!run) return null;
      run.status = "stopping";
      if (run.activeRunId) run.stopRequestedRunId = run.activeRunId;
      run.updatedAt = nowIso();
      state.runs[runKey] = run;
      return run;
    });
  }

  resetChannelRun(input: ChannelRunTarget & { sessionId: string; options?: ChannelRunOptions }): ChannelRunRecord {
    const runKey = resolveChannelRunKey(input);
    return this.mutate((state) => {
      const timestamp = nowIso();
      const next: ChannelRunRecord = {
        provider: input.provider,
        accountId: normalizeAccountId(input.accountId),
        targetId: input.targetId,
        ...(input.threadId !== undefined ? { threadId: input.threadId } : {}),
        runKey,
        sessionId: input.sessionId,
        status: "idle",
        queuePolicy: input.options?.queuePolicy ?? "coalesce",
        deliveryMode: input.options?.deliveryMode ?? "final",
        queue: [],
        coalescingWindowMs: positiveInteger(input.options?.coalescingWindowMs, DEFAULT_COALESCING_WINDOW_MS),
        compactionThresholdChars: positiveInteger(input.options?.compactionThresholdChars, DEFAULT_COMPACTION_THRESHOLD_CHARS),
        maxRecentMessages: positiveInteger(input.options?.maxRecentMessages, DEFAULT_MAX_RECENT_MESSAGES),
        createdAt: state.runs[runKey]?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      state.runs[runKey] = next;
      return next;
    });
  }

  compactChannelSession(input: { runKey: string; sessionId?: string; maxRecentMessages?: number; maxSummaryChars?: number; force?: boolean }): { run: ChannelRunRecord | null; summary: string; compacted: boolean } {
    const run = this.getChannelRunStatus(input.runKey);
    const sessionId = input.sessionId ?? run?.sessionId;
    if (!sessionId) return { run, summary: "", compacted: false };
    const session = this.sessionStore.getSession(sessionId);
    if (!session) return { run, summary: "", compacted: false };
    const maxRecentMessages = positiveInteger(input.maxRecentMessages, positiveInteger(run?.maxRecentMessages, DEFAULT_MAX_RECENT_MESSAGES));
    const olderMessages = session.messages.filter((message) => message.metadata?.source !== "channel-run-compaction").slice(0, Math.max(0, session.messages.length - maxRecentMessages));
    if (!input.force && olderMessages.length === 0) {
      return { run, summary: run?.summary ?? "", compacted: false };
    }
    const summary = buildSummary(olderMessages.length > 0 ? olderMessages : session.messages, positiveInteger(input.maxSummaryChars, 2_400));
    const summaryMessageId = `channel-compact-${hashStableId(`${sessionId}:${summary}`)}`;
    this.sessionStore.appendMessageOnce(sessionId, {
      id: summaryMessageId,
      role: "system",
      content: summary,
      metadata: {
        source: "channel-run-compaction",
        compactedMessageCount: olderMessages.length || session.messages.length,
      },
    });
    const updated = this.mutate((state) => {
      const current = state.runs[input.runKey] ?? run;
      if (!current) return null;
      current.summary = summary;
      current.summaryMessageId = summaryMessageId;
      current.updatedAt = nowIso();
      state.runs[input.runKey] = current;
      return current;
    });
    return { run: updated, summary, compacted: true };
  }
}
