import type {
  ListSessionsResult,
  SessionMessageRecord,
  SessionRecord,
  SessionStructuredEventRecord,
} from "./types.ts";
import type { SessionsServiceStore } from "./store.ts";

export const SESSIONS_CHATS_SEARCH_SOURCE = "sessions.chats";
export const SESSIONS_EVENTS_SEARCH_SOURCE = "sessions.events";

export interface SessionSearchDocumentInput {
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
  permissions?: {
    canOpen?: boolean;
    canPreview?: boolean;
    redacted?: boolean;
  };
  rankingHints?: Record<string, number>;
}

export interface SessionSearchWritableStore {
  upsertDocuments(documents: SessionSearchDocumentInput[]): number;
}

export interface IndexSessionsForSearchInput {
  sessionsStore: Pick<SessionsServiceStore, "getSession" | "listSessions" | "listMessages" | "listSessionEvents">;
  searchStore: SessionSearchWritableStore;
  sessionId?: string;
  includeChats?: boolean;
  includeEvents?: boolean;
  batchSize?: number;
}

export interface IndexSessionsForSearchResult {
  sessionsIndexed: number;
  messagesIndexed: number;
  eventsIndexed: number;
  documentsIndexed: number;
}

export function indexSessionsForSearch(input: IndexSessionsForSearchInput): IndexSessionsForSearchResult {
  const includeChats = input.includeChats !== false;
  const includeEvents = input.includeEvents !== false;
  const batchSize = clampBatchSize(input.batchSize);
  const sessions = input.sessionId
    ? [input.sessionsStore.getSession(input.sessionId)].filter((session): session is SessionRecord => Boolean(session))
    : listAllSessions(input.sessionsStore, batchSize);
  let messagesIndexed = 0;
  let eventsIndexed = 0;
  let documentsIndexed = 0;

  for (const session of sessions) {
    if (includeChats) {
      for (const batch of listMessageDocumentBatches(input.sessionsStore, session, batchSize)) {
        documentsIndexed += input.searchStore.upsertDocuments(batch);
        messagesIndexed += batch.length;
      }
    }
    if (includeEvents) {
      for (const batch of listEventDocumentBatches(input.sessionsStore, session, batchSize)) {
        documentsIndexed += input.searchStore.upsertDocuments(batch);
        eventsIndexed += batch.length;
      }
    }
  }
  return {
    sessionsIndexed: sessions.length,
    messagesIndexed,
    eventsIndexed,
    documentsIndexed,
  };
}

function listAllSessions(
  sessionsStore: Pick<SessionsServiceStore, "listSessions">,
  batchSize: number,
): SessionRecord[] {
  const sessions: SessionRecord[] = [];
  for (let offset = 0; ; offset += batchSize) {
    const page: ListSessionsResult = sessionsStore.listSessions({ limit: batchSize, offset });
    sessions.push(...page.items);
    if (offset + page.items.length >= page.total || page.items.length === 0) break;
  }
  return sessions;
}

function *listMessageDocumentBatches(
  sessionsStore: Pick<SessionsServiceStore, "listMessages">,
  session: SessionRecord,
  batchSize: number,
): Generator<SessionSearchDocumentInput[]> {
  for (let offset = 0; ; offset += batchSize) {
    const messages = sessionsStore.listMessages(session.id, batchSize, offset);
    if (!messages.length) break;
    yield messages.map((message) => messageSearchDocument(session, message));
    if (messages.length < batchSize) break;
  }
}

function *listEventDocumentBatches(
  sessionsStore: Pick<SessionsServiceStore, "listSessionEvents">,
  session: SessionRecord,
  batchSize: number,
): Generator<SessionSearchDocumentInput[]> {
  for (let offset = 0; ; offset += batchSize) {
    const events = sessionsStore.listSessionEvents({ sessionId: session.id, limit: batchSize, offset });
    if (!events.length) break;
    yield events.map((event) => eventSearchDocument(session, event));
    if (events.length < batchSize) break;
  }
}

function messageSearchDocument(session: SessionRecord, message: SessionMessageRecord): SessionSearchDocumentInput {
  return {
    id: `${SESSIONS_CHATS_SEARCH_SOURCE}:${message.id}`,
    source: SESSIONS_CHATS_SEARCH_SOURCE,
    shard: session.projectId ?? session.projectPath ?? "default",
    domain: "sessions",
    type: "message",
    resourceId: session.id,
    title: session.title,
    subtitle: message.role,
    snippet: message.contentText,
    body: message.contentText,
    path: `session:${session.id}`,
    updatedAt: new Date(message.timestamp).toISOString(),
    metadata: {
      sessionId: session.id,
      messageId: message.id,
      projectId: session.projectId,
      projectPath: session.projectPath,
      agent: session.agent,
      runtime: session.runtime,
      role: message.role,
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
  };
}

function eventSearchDocument(session: SessionRecord, event: SessionStructuredEventRecord): SessionSearchDocumentInput {
  const payload = payloadObject(event);
  const toolName = typeof payload.name === "string" && payload.name ? payload.name : null;
  const status = typeof payload.status === "string" && payload.status ? payload.status : null;
  const hasFailedTool = event.eventKind === "tool_output" && looksLikeFailedTool(event, status);
  const title = [event.eventKind, event.eventType].filter(Boolean).join(" ");
  const body = [event.renderedSummary, event.searchableText].filter(Boolean).join("\n");
  return {
    id: `${SESSIONS_EVENTS_SEARCH_SOURCE}:${event.id}`,
    source: SESSIONS_EVENTS_SEARCH_SOURCE,
    shard: session.projectId ?? session.projectPath ?? "default",
    domain: "sessions",
    type: event.eventKind,
    resourceId: session.id,
    title: title || "session event",
    subtitle: session.title,
    snippet: event.renderedSummary ?? event.searchableText ?? undefined,
    body,
    path: `session:${session.id}`,
    updatedAt: new Date(event.timestamp).toISOString(),
    metadata: {
      sessionId: session.id,
      eventId: event.id,
      turnId: event.turnId,
      itemId: event.itemId,
      callId: event.callId,
      projectId: session.projectId,
      projectPath: session.projectPath,
      agent: session.agent,
      runtime: session.runtime,
      eventKind: event.eventKind,
      eventType: event.eventType,
      toolName,
      status,
      hasDiff: event.eventKind === "patch",
      hasFailedTool,
      hasWebSearch: event.eventKind === "search",
      hasCompaction: event.eventKind === "compaction",
      hasGoal: event.eventKind === "goal",
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: hasFailedTool ? { importance: 2 } : undefined,
  };
}

function payloadObject(event: SessionStructuredEventRecord): Record<string, unknown> {
  return typeof event.payloadJson === "object" && event.payloadJson !== null && !Array.isArray(event.payloadJson)
    ? event.payloadJson as Record<string, unknown>
    : {};
}

function looksLikeFailedTool(event: SessionStructuredEventRecord, status: string | null): boolean {
  if (status === "failed" || status === "error") return true;
  const payload = payloadObject(event);
  if (typeof payload.error === "string" && payload.error.trim()) return true;
  const text = `${event.renderedSummary ?? ""}\n${event.searchableText ?? ""}`.toLowerCase();
  return /\b(exit code|code)\s+([1-9]\d*)\b/.test(text) || /\b(error|failed|failure|traceback)\b/.test(text);
}

function clampBatchSize(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 500;
  return Math.min(1000, Math.max(1, Math.floor(n)));
}
