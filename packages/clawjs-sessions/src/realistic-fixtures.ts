import type {
  AppendMessageInput,
  AppendSessionEventInput,
  CreateProjectInput,
  CreateSessionInput,
  MessageRole,
  MessageStreamingState,
  SessionStatus,
} from "./types.ts";
import type { SessionsServiceStore } from "./store.ts";

export type RealisticSessionsFixtureProfile = "smoke" | "large";

export interface RealisticSessionsFixtureOptions {
  profile?: RealisticSessionsFixtureProfile;
  projectCount?: number;
  sessionCount?: number;
  longSessionMessageCount?: number;
  baseTimestamp?: number;
  workspaceRoot?: string;
  rebuildProjections?: boolean;
}

export interface RealisticSessionsFixtureCorpus {
  schemaVersion: 1;
  fixtureSetId: "realistic-sessions-v1";
  profile: RealisticSessionsFixtureProfile;
  projects: CreateProjectInput[];
  sessions: CreateSessionInput[];
  messages: AppendMessageInput[];
  events: AppendSessionEventInput[];
  staleProjectionSessionIds: string[];
  coverage: {
    longChats: number;
    conversationsWithAttachments: number;
    markdownHeavyMessages: number;
    providerErrors: number;
    recoverableCorruptions: number;
  };
}

export interface SeedRealisticSessionsFixtureResult {
  fixtureSetId: "realistic-sessions-v1";
  profile: RealisticSessionsFixtureProfile;
  projectsSeeded: number;
  sessionsSeeded: number;
  messagesSeeded: number;
  eventsSeeded: number;
  staleProjectionSessionIds: string[];
  coverage: RealisticSessionsFixtureCorpus["coverage"];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const DEFAULT_BASE_TIMESTAMP = Date.parse("2026-05-17T09:00:00.000Z");

const DOMAINS = [
  "desktop-chat",
  "provider-recovery",
  "project-planning",
  "attachments",
  "markdown-rendering",
  "search-regression",
  "e2e-screenshots",
  "performance-lab",
  "mobile-companion",
  "bridge-diagnostics",
  "release-checks",
  "data-repair",
] as const;

const MARKDOWN_BLOCK = [
  "# Regression Packet",
  "",
  "## Decision Table",
  "",
  "| Surface | Expected | Evidence |",
  "| --- | --- | --- |",
  "| Sidebar | stays responsive | fixture-window-001 |",
  "| Composer | keeps attachments | fixture-attachment-003 |",
  "| Markdown | renders nested blocks | fixture-markdown-007 |",
  "",
  "```ts",
  "export const fixture = {",
  "  route: \"sessions.realistic\",",
  "  safe: true,",
  "};",
  "```",
  "",
  "> Quoted operator note with enough length to exercise wrapping, selection,",
  "> copy, and preview extraction without relying on real private content.",
  "",
  "1. Verify bounded hydration.",
  "2. Verify event projection.",
  "3. Verify search snippets.",
  "",
  "- [x] Synthetic data only",
  "- [ ] External provider remains mocked",
].join("\n");

const RECOVERABLE_CORRUPTION_TEXT = [
  "Recovered import warning:",
  "",
  "- one source line had invalid JSON and was preserved as a recoverable parser event",
  "- one attachment referenced a missing local blob and kept metadata only",
  "- one provider delta was truncated after a tool-call boundary",
  "",
  "The session should remain readable, searchable, and projectable.",
].join("\n");

export function buildRealisticSessionsFixtureCorpus(options: RealisticSessionsFixtureOptions = {}): RealisticSessionsFixtureCorpus {
  const profile = options.profile ?? "large";
  const projectCount = clampInt(options.projectCount, 1, 200, profile === "smoke" ? 4 : 24);
  const sessionCount = clampInt(options.sessionCount, 1, 1_000, profile === "smoke" ? 12 : 96);
  const longSessionMessageCount = clampInt(options.longSessionMessageCount, 20, 5_000, profile === "smoke" ? 42 : 240);
  const baseTimestamp = options.baseTimestamp ?? DEFAULT_BASE_TIMESTAMP;
  const workspaceRoot = options.workspaceRoot ?? "/tmp/claw-realistic-session-fixtures";

  const projects = Array.from({ length: projectCount }, (_, index): CreateProjectInput => {
    const domain = DOMAINS[index % DOMAINS.length];
    return {
      id: `fixture_project_${index + 1}`,
      resourceId: `fixture:project:${domain}:${index + 1}`,
      displayName: titleCase(domain),
      path: `${workspaceRoot}/project-${String(index + 1).padStart(2, "0")}-${domain}`,
      sortRank: index,
      createdAt: baseTimestamp - (projectCount - index) * DAY_MS,
    };
  });

  const sessions: CreateSessionInput[] = [];
  const messages: AppendMessageInput[] = [];
  const events: AppendSessionEventInput[] = [];
  const staleProjectionSessionIds: string[] = [];
  const coverage = {
    longChats: 0,
    conversationsWithAttachments: 0,
    markdownHeavyMessages: 0,
    providerErrors: 0,
    recoverableCorruptions: 0,
  };

  for (let sessionIndex = 0; sessionIndex < sessionCount; sessionIndex += 1) {
    const project = projects[sessionIndex % projects.length]!;
    const kind = sessionKind(sessionIndex);
    const sessionId = `fixture_session_${String(sessionIndex + 1).padStart(4, "0")}`;
    const createdAt = baseTimestamp + sessionIndex * 45 * MINUTE_MS;
    const messageCount = kind === "long_chat"
      ? longSessionMessageCount
      : kind === "markdown_heavy"
        ? 28
        : kind === "provider_error"
          ? 18
          : kind === "recoverable_corruption"
            ? 16
            : 12 + (sessionIndex % 7);
    const status: SessionStatus = kind === "provider_error"
      ? "interrupted"
      : sessionIndex % 17 === 0
        ? "active"
        : "completed";

    sessions.push({
      id: sessionId,
      agent: sessionIndex % 5 === 0 ? "planner" : "codex",
      runtime: sessionIndex % 4 === 0 ? "openclaw" : "codex",
      runtimeAdapter: sessionIndex % 4 === 0 ? "openclaw" : "codex",
      runtimeSessionId: `runtime-fixture-${sessionIndex + 1}`,
      machine: `fixture-host-${(sessionIndex % 4) + 1}`,
      workspaceId: "fixture-workspace",
      projectId: project.id,
      projectPath: project.path,
      title: sessionTitle(kind, sessionIndex),
      createdAt,
      branch: sessionIndex % 3 === 0 ? "main" : `fixture/topic-${sessionIndex + 1}`,
      cwd: project.path,
      status,
      customMetadata: {
        fixtureSetId: "realistic-sessions-v1",
        fixtureKind: kind,
        synthetic: true,
        expectedUse: ["performance", "e2e", "screenshots", "regression"],
      },
    });

    if (kind === "long_chat") coverage.longChats += 1;
    if (kind === "attachments") coverage.conversationsWithAttachments += 1;
    if (kind === "markdown_heavy") coverage.markdownHeavyMessages += Math.floor(messageCount / 2);
    if (kind === "provider_error") coverage.providerErrors += 1;
    if (kind === "recoverable_corruption") {
      coverage.recoverableCorruptions += 1;
      staleProjectionSessionIds.push(sessionId);
    }

    for (let messageIndex = 0; messageIndex < messageCount; messageIndex += 1) {
      const role = roleForMessage(messageIndex);
      const timestamp = createdAt + messageIndex * 90_000;
      const messageId = `${sessionId}_message_${String(messageIndex + 1).padStart(4, "0")}`;
      const turnId = `${sessionId}_turn_${String(Math.floor(messageIndex / 2) + 1).padStart(4, "0")}`;
      const contentText = messageText(kind, sessionIndex, messageIndex, role);
      const streamingState = streamingStateFor(kind, messageIndex, messageCount, role);
      const attachments = attachmentsFor(kind, sessionIndex, messageIndex);

      messages.push({
        id: messageId,
        sessionId,
        role,
        contentText,
        contentBlocks: role === "assistant" && kind === "markdown_heavy" ? markdownContentBlocks(messageId) : null,
        timestamp,
        toolCalls: toolCallsFor(kind, messageIndex),
        timeline: timelineFor(kind, timestamp, streamingState),
        workSummary: workSummaryFor(kind, streamingState),
        streamingState,
        audioRef: kind === "attachments" && messageIndex === 2 ? { id: `audio_${sessionIndex + 1}`, mimeType: "audio/wav", durationMs: 42_000 } : null,
        attachments,
        sourceNativeId: `${sessionId}:line:${messageIndex + 1}`,
      });

      events.push({
        sessionId,
        turnId,
        itemId: messageId,
        eventKind: "message",
        eventType: role === "assistant" ? "response_item.message" : "event_msg.user_message",
        role,
        timestamp,
        sourceNativeId: `${sessionId}:event:message:${messageIndex + 1}`,
        sourceLine: messageIndex + 1,
        payloadJson: { type: "message", role, fixtureKind: kind },
        renderedSummary: contentText.slice(0, 280),
        searchableText: contentText,
      });

      if (role === "assistant" && messageIndex % 6 === 3) {
        events.push(toolEvent(sessionId, turnId, messageIndex, timestamp + 20_000, kind));
      }
      if (role === "assistant" && messageIndex % 10 === 5) {
        events.push(usageEvent(sessionId, turnId, messageIndex, timestamp + 40_000, messageCount));
      }
    }

    if (kind === "recoverable_corruption") {
      events.push(recoverableCorruptionEvent(sessionId, createdAt + messageCount * 90_000 + 1));
    }
    if (kind === "provider_error") {
      events.push(providerErrorEvent(sessionId, createdAt + messageCount * 90_000 + 1));
    }
  }

  return {
    schemaVersion: 1,
    fixtureSetId: "realistic-sessions-v1",
    profile,
    projects,
    sessions,
    messages,
    events,
    staleProjectionSessionIds,
    coverage,
  };
}

export function seedRealisticSessionsFixture(
  store: SessionsServiceStore,
  options: RealisticSessionsFixtureOptions = {},
): SeedRealisticSessionsFixtureResult {
  const corpus = buildRealisticSessionsFixtureCorpus(options);
  for (const project of corpus.projects) store.createProject(project);
  const result = store.importSessionBatch({
    sessions: corpus.sessions,
    messages: corpus.messages,
    events: corpus.events,
  });

  for (const session of corpus.sessions) {
    if (options.rebuildProjections !== false && !corpus.staleProjectionSessionIds.includes(session.id ?? "")) {
      store.rebuildSessionProjection(session.id ?? "");
    }
  }
  for (const sessionId of corpus.staleProjectionSessionIds) {
    store.markSessionProjectionStale(sessionId, "recoverable fixture corruption awaiting source re-read");
  }
  for (const session of corpus.sessions) {
    if (session.id?.endsWith("0001") || session.id?.endsWith("0007")) {
      store.setPinned(session.id, true);
    }
  }

  return {
    fixtureSetId: corpus.fixtureSetId,
    profile: corpus.profile,
    projectsSeeded: corpus.projects.length,
    sessionsSeeded: corpus.sessions.length,
    messagesSeeded: result.messagesInserted,
    eventsSeeded: corpus.events.length,
    staleProjectionSessionIds: corpus.staleProjectionSessionIds,
    coverage: corpus.coverage,
  };
}

function sessionKind(index: number): "long_chat" | "attachments" | "markdown_heavy" | "provider_error" | "recoverable_corruption" | "project_dense" {
  if (index % 19 === 0) return "recoverable_corruption";
  if (index % 11 === 0) return "provider_error";
  if (index % 7 === 0) return "long_chat";
  if (index % 5 === 0) return "attachments";
  if (index % 3 === 0) return "markdown_heavy";
  return "project_dense";
}

function roleForMessage(index: number): MessageRole {
  if (index === 0) return "system";
  if (index % 9 === 0) return "tool";
  return index % 2 === 0 ? "user" : "assistant";
}

function sessionTitle(kind: ReturnType<typeof sessionKind>, index: number): string {
  const ordinal = String(index + 1).padStart(3, "0");
  if (kind === "long_chat") return `Long agent run ${ordinal}`;
  if (kind === "attachments") return `Attachment review ${ordinal}`;
  if (kind === "markdown_heavy") return `Markdown rendering packet ${ordinal}`;
  if (kind === "provider_error") return `Provider recovery ${ordinal}`;
  if (kind === "recoverable_corruption") return `Recoverable import repair ${ordinal}`;
  return `Project backlog grooming ${ordinal}`;
}

function messageText(kind: ReturnType<typeof sessionKind>, sessionIndex: number, messageIndex: number, role: MessageRole): string {
  if (role === "system") return "Synthetic fixture session. Do not call providers, reveal secrets, or mutate real services.";
  if (kind === "markdown_heavy" && role === "assistant") return `${MARKDOWN_BLOCK}\n\nFixture row: ${sessionIndex}.${messageIndex}`;
  if (kind === "recoverable_corruption" && messageIndex > 3) return `${RECOVERABLE_CORRUPTION_TEXT}\n\nRepair step ${messageIndex}: keep the readable rows and quarantine only the malformed payload.`;
  if (kind === "provider_error" && role === "assistant") return "The mocked provider returned a retryable 429. I preserved the prompt, stored the redacted error, and left the turn interrupted for UI recovery.";
  if (kind === "attachments" && role === "user") return "Please inspect the attached screenshot, audio note, and CSV preview. Use metadata only; the fixture does not require local files.";
  if (role === "tool") return `Tool output fixture ${sessionIndex}-${messageIndex}: indexed ${12 + messageIndex} rows and skipped 1 duplicate.`;
  if (role === "user") return `User asks for step ${messageIndex} in project ${sessionIndex}: compare recent evidence, update the plan, and call out blocked provider work.`;
  return `Assistant response ${messageIndex}: summarized evidence, kept bounded state, and produced a follow-up checklist for regression coverage.`;
}

function streamingStateFor(kind: ReturnType<typeof sessionKind>, messageIndex: number, messageCount: number, role: MessageRole): MessageStreamingState | null {
  if (role !== "assistant") return "complete";
  if (kind === "provider_error" && messageIndex >= messageCount - 2) return "error";
  if (kind === "long_chat" && messageIndex === messageCount - 1) return "interrupted";
  return "complete";
}

function attachmentsFor(kind: ReturnType<typeof sessionKind>, sessionIndex: number, messageIndex: number): unknown[] | null {
  if (kind !== "attachments" || messageIndex > 3) return null;
  const base = `fixture-${sessionIndex + 1}-${messageIndex + 1}`;
  return [
    { id: `${base}-image`, kind: "image", name: "screenshot.png", mimeType: "image/png", sizeBytes: 184_220, sha256: `fixture_sha_${base}_image`, status: "available" },
    { id: `${base}-audio`, kind: "audio", name: "voice-note.wav", mimeType: "audio/wav", sizeBytes: 512_000, sha256: `fixture_sha_${base}_audio`, status: "transcribed" },
    { id: `${base}-csv`, kind: "file", name: "provider-export.csv", mimeType: "text/csv", sizeBytes: 12_880, sha256: `fixture_sha_${base}_csv`, status: messageIndex === 3 ? "missing_blob_recoverable" : "available" },
  ];
}

function markdownContentBlocks(messageId: string): unknown[] {
  return [
    { type: "heading", level: 1, text: "Regression Packet", sourceMessageId: messageId },
    { type: "table", rows: 3, columns: 3 },
    { type: "code", language: "ts", lineCount: 4 },
    { type: "taskList", total: 2, checked: 1 },
  ];
}

function toolCallsFor(kind: ReturnType<typeof sessionKind>, messageIndex: number): unknown[] | null {
  if (messageIndex % 6 !== 3) return null;
  return [{
    id: `tool_call_${messageIndex}`,
    name: kind === "provider_error" ? "provider.fetch" : "fixture.query",
    status: kind === "provider_error" ? "error" : "complete",
  }];
}

function timelineFor(kind: ReturnType<typeof sessionKind>, timestamp: number, streamingState: MessageStreamingState | null): unknown[] | null {
  if (!streamingState || streamingState === "complete") return null;
  return [
    { kind: "tool", title: kind === "provider_error" ? "Mock provider" : "Fixture worker", status: streamingState, at: timestamp },
  ];
}

function workSummaryFor(kind: ReturnType<typeof sessionKind>, streamingState: MessageStreamingState | null): unknown | null {
  if (streamingState === "error") return { status: "error", text: "Mock provider error preserved for retry UI." };
  if (streamingState === "interrupted") return { status: "interrupted", text: "Long fixture interrupted after bounded window." };
  if (kind === "recoverable_corruption") return { status: "partial", text: "Recoverable malformed source row quarantined." };
  return null;
}

function toolEvent(sessionId: string, turnId: string, messageIndex: number, timestamp: number, kind: ReturnType<typeof sessionKind>): AppendSessionEventInput {
  const failed = kind === "provider_error";
  return {
    sessionId,
    turnId,
    callId: `${turnId}_tool_${messageIndex}`,
    eventKind: "tool_output",
    eventType: "response_item.function_call_output",
    timestamp,
    sourceNativeId: `${sessionId}:event:tool:${messageIndex}`,
    sourceLine: 10_000 + messageIndex,
    payloadJson: failed ? { status: "error", error: "mock_provider_rate_limited", retryAfterMs: 30_000 } : { status: "ok", rows: 12 + messageIndex },
    renderedSummary: failed ? "provider error: mock_provider_rate_limited" : "fixture query completed",
    searchableText: failed ? "provider error retryable rate limit" : "fixture query completed indexed rows",
  };
}

function usageEvent(sessionId: string, turnId: string, messageIndex: number, timestamp: number, messageCount: number): AppendSessionEventInput {
  return {
    sessionId,
    turnId,
    eventKind: "usage",
    eventType: "event_msg.usage",
    timestamp,
    sourceNativeId: `${sessionId}:event:usage:${messageIndex}`,
    sourceLine: 20_000 + messageIndex,
    payloadJson: { usage: { input_tokens: 400 + messageIndex * 3, output_tokens: 220 + Math.floor(messageCount / 2) } },
    renderedSummary: "token usage fixture",
    searchableText: "token usage fixture",
  };
}

function recoverableCorruptionEvent(sessionId: string, timestamp: number): AppendSessionEventInput {
  return {
    sessionId,
    turnId: `${sessionId}_turn_repair`,
    eventKind: "unknown",
    eventType: "fixture.recoverable_corruption",
    timestamp,
    sourceNativeId: `${sessionId}:event:recoverable-corruption`,
    sourceLine: 99_001,
    payloadJson: {
      status: "recoverable",
      parserError: "Unexpected end of JSON input",
      action: "quarantined_source_line",
      retainedReadableRows: true,
    },
    renderedSummary: "recoverable corrupt source row quarantined",
    searchableText: "recoverable corrupt source row quarantined invalid json retained readable rows",
  };
}

function providerErrorEvent(sessionId: string, timestamp: number): AppendSessionEventInput {
  return {
    sessionId,
    turnId: `${sessionId}_turn_provider_error`,
    eventKind: "tool_output",
    eventType: "response_item.function_call_output",
    timestamp,
    sourceNativeId: `${sessionId}:event:provider-error`,
    sourceLine: 88_001,
    payloadJson: { status: "error", error: "mock_provider_503", retryable: true },
    renderedSummary: "provider failed with code 503 in mocked fixture",
    searchableText: "mock provider error 503 retryable external pending",
  };
}

function titleCase(value: string): string {
  return value.split("-").map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(numberValue)));
}
