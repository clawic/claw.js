export type SessionAgent = string;
export type SessionRuntime = string;

export type SessionStatus = "active" | "completed" | "interrupted" | "archived";

export type MessageRole = "user" | "assistant" | "system" | "tool";

export type MessageStreamingState = "pending" | "streaming" | "complete" | "interrupted" | "error";

export interface ProjectRecord {
  id: string;
  resourceId: string | null;
  displayName: string;
  path: string;
  hidden: boolean;
  archived: boolean;
  sortRank: number;
  createdAt: number;
  updatedAt: number;
}

export interface SessionRecord {
  id: string;
  agent: SessionAgent;
  runtime: SessionRuntime | null;
  machine: string | null;
  workspaceId: string | null;
  projectId: string | null;
  projectPath: string | null;
  runtimeAdapter: string | null;
  runtimeSessionId: string | null;
  title: string;
  createdAt: number;
  lastMessageAt: number | null;
  messageCount: number;
  pinned: boolean;
  archived: boolean;
  sidebarVisible: boolean;
  branch: string | null;
  cwd: string | null;
  status: SessionStatus;
  customMetadata: Record<string, unknown> | null;
}

export interface SessionMessageRecord {
  id: string;
  sessionId: string;
  role: MessageRole;
  contentText: string;
  contentBlocks: unknown[] | null;
  timestamp: number;
  toolCalls: unknown[] | null;
  timeline: unknown[] | null;
  workSummary: unknown | null;
  streamingState: MessageStreamingState | null;
  audioRef: { id: string; mimeType: string; durationMs: number } | null;
  attachments: unknown[] | null;
  sourceNativeId: string | null;
}

export interface SessionOriginRecord {
  sessionId: string;
  nativePath: string;
  nativeFormat: string;
  lastSyncedAt: number;
  mirrorHash: string | null;
  sourceMtimeMs: number | null;
  sourceSize: number | null;
  sourceIno: number | null;
  sourceDev: number | null;
  sourceCursorLine: number | null;
  sourceCursorHash: string | null;
}

export type SessionStructuredEventKind =
  | "message"
  | "tool_call"
  | "tool_output"
  | "patch"
  | "lifecycle"
  | "usage"
  | "goal"
  | "search"
  | "subagent"
  | "question"
  | "mcp"
  | "compaction"
  | "rollback"
  | "unknown";

export interface SessionStructuredEventRecord {
  id: string;
  sessionId: string;
  turnId: string | null;
  itemId: string | null;
  callId: string | null;
  eventKind: SessionStructuredEventKind;
  eventType: string | null;
  role: string | null;
  timestamp: number;
  sourceNativeId: string;
  sourceLine: number | null;
  payloadJson: unknown;
  renderedSummary: string | null;
  searchableText: string | null;
  createdAt: number;
}

export interface AppendSessionEventInput {
  id?: string;
  sessionId: string;
  turnId?: string | null;
  itemId?: string | null;
  callId?: string | null;
  eventKind: SessionStructuredEventKind;
  eventType?: string | null;
  role?: string | null;
  timestamp?: number;
  sourceNativeId: string;
  sourceLine?: number | null;
  payloadJson: unknown;
  renderedSummary?: string | null;
  searchableText?: string | null;
  createdAt?: number;
}

export interface ListSessionEventsFilter {
  sessionId: string;
  eventKind?: SessionStructuredEventKind;
  eventType?: string;
  turnId?: string;
  callId?: string;
  limit?: number;
  offset?: number;
}

export interface SearchSessionEventsInput {
  query: string;
  sessionId?: string;
  eventKind?: SessionStructuredEventKind;
  eventType?: string;
  toolName?: string;
  status?: string;
  hasDiff?: boolean;
  hasFailedTool?: boolean;
  hasWebSearch?: boolean;
  hasCompaction?: boolean;
  hasGoal?: boolean;
  fromTimestamp?: number;
  toTimestamp?: number;
  limit?: number;
}

export interface SessionEventSearchHit {
  event: SessionStructuredEventRecord;
  snippet: string;
  rank: number;
}

export type SessionProjectionStatus = "current" | "stale" | "failed" | "partial";
export type SessionTurnStatus = "running" | "completed" | "aborted" | "interrupted" | "failed" | "unknown";

export interface SessionTurnSummaryRecord {
  sessionId: string;
  turnId: string;
  startedAt: number;
  completedAt: number | null;
  endedAt: number | null;
  durationMs: number | null;
  status: SessionTurnStatus;
  assistantMessageId: string | null;
  userMessageId: string | null;
  title: string | null;
  promptPreview: string | null;
  responsePreview: string | null;
  toolCallCount: number;
  failedToolCallCount: number;
  diffFileCount: number;
  webSearchCount: number;
  subagentCount: number;
  compacted: boolean;
  tokenInput: number | null;
  tokenOutput: number | null;
  tokenUsage: unknown | null;
  summary: unknown | null;
  hasCompaction: boolean;
  aborted: boolean;
  interrupted: boolean;
  eventCount: number;
  updatedAt: number;
}

export interface SessionProjectionMetaRecord {
  sessionId: string;
  sourceNativePath: string | null;
  sourceNativeFormat: string | null;
  sourceMtimeMs: number | null;
  sourceSize: number | null;
  sourceIno: number | null;
  sourceDev: number | null;
  sourceCursorLine: number | null;
  sourceCursorHash: string | null;
  mirrorHash: string | null;
  lastImportedAt: number | null;
  lastProjectedAt: number | null;
  projectionVersion: number;
  schemaVersion: number;
  parserVersion: string;
  projectionStatus: SessionProjectionStatus;
  eventCount: number;
  summaryCount: number;
  projectedAt: number | null;
  staleReason: string | null;
  error: string | null;
  lastError: string | null;
  updatedAt: number;
}

export interface RebuildSessionProjectionResult {
  meta: SessionProjectionMetaRecord;
  summaries: SessionTurnSummaryRecord[];
}

export interface RebuildSessionProjectionsInput {
  projectId?: string;
  projectPath?: string;
  offset?: number;
  maxSessions?: number;
  budgetMs?: number;
  batchSize?: number;
}

export interface RebuildSessionProjectionsResult {
  sessionsProcessed: number;
  sessionIds: string[];
  totalMatched: number;
  budgetExhausted: boolean;
  stopReason: "drained" | "max_sessions" | "budget_ms";
  nextOffset: number | null;
}

export type SessionMemoryExtractStatus = "current" | "stale" | "failed";

export interface SessionMemoryExtractRecord {
  sessionId: string;
  summaryVersion: number;
  status: SessionMemoryExtractStatus;
  lastExtractedAt: number | null;
  lastExtractedEventCount: number;
  lastProjectedAt: number | null;
  summaryJson: unknown | null;
  lastError: string | null;
  updatedAt: number;
}

export interface PendingSessionMemoryExtractionRecord {
  session: SessionRecord;
  projectionMeta: SessionProjectionMetaRecord;
  extract: SessionMemoryExtractRecord | null;
  reason: "never_extracted" | "event_count_changed" | "projection_newer";
}

export interface ListPendingSessionMemoryExtractionsInput {
  projectId?: string;
  projectPath?: string;
  limit?: number;
  offset?: number;
}

export interface RebuildSessionMemoryExtractsInput {
  projectId?: string;
  projectPath?: string;
  offset?: number;
  maxSessions?: number;
  budgetMs?: number;
}

export interface RebuildSessionMemoryExtractsResult {
  sessionsProcessed: number;
  sessionIds: string[];
  totalPending: number;
  budgetExhausted: boolean;
  stopReason: "drained" | "max_sessions" | "budget_ms";
  nextOffset: number | null;
}

export interface SessionDynamicToolRecord {
  sessionId: string;
  position: number;
  name: string;
  namespace: string | null;
  description: string;
  inputSchemaJson: unknown | null;
  schemaHash: string;
  deferLoading: boolean;
  source: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface UpsertSessionDynamicToolInput {
  sessionId: string;
  position: number;
  name: string;
  namespace?: string | null;
  description?: string;
  inputSchemaJson: unknown;
  schemaHash?: string;
  deferLoading?: boolean;
  source?: string | null;
  createdAt?: number;
  updatedAt?: number;
}

export interface ListSessionDynamicToolsOptions {
  includeDeferredSchemas?: boolean;
}

export interface ListSessionsFilter {
  agent?: SessionAgent;
  runtime?: SessionRuntime;
  machine?: string;
  workspaceId?: string;
  projectId?: string;
  projectPath?: string;
  pinned?: boolean;
  archived?: boolean;
  sidebarVisible?: boolean;
  status?: SessionStatus;
  fromCreatedAt?: number;
  toCreatedAt?: number;
  limit?: number;
  offset?: number;
}

export interface ListSessionsResult {
  items: SessionRecord[];
  total: number;
}

export interface SidebarBootstrapResult {
  projects: ProjectRecord[];
  pinned: SessionRecord[];
  recent: SessionRecord[];
  totalActiveVisible: number;
}

export interface SearchSessionsInput {
  query: string;
  agent?: SessionAgent;
  projectId?: string;
  projectPath?: string;
  fromTimestamp?: number;
  toTimestamp?: number;
  limit?: number;
}

export interface SessionSearchHit {
  session: SessionRecord;
  message: SessionMessageRecord;
  snippet: string;
  rank: number;
}

export interface CreateSessionInput {
  id?: string;
  agent: SessionAgent;
  runtime?: SessionRuntime | null;
  machine?: string | null;
  workspaceId?: string | null;
  projectId?: string | null;
  projectPath?: string | null;
  runtimeAdapter?: string | null;
  runtimeSessionId?: string | null;
  title?: string;
  createdAt?: number;
  branch?: string | null;
  cwd?: string | null;
  status?: SessionStatus;
  customMetadata?: Record<string, unknown> | null;
}

export interface AppendMessageInput {
  id?: string;
  sessionId: string;
  role: MessageRole;
  contentText: string;
  contentBlocks?: unknown[] | null;
  timestamp?: number;
  toolCalls?: unknown[] | null;
  timeline?: unknown[] | null;
  workSummary?: unknown | null;
  streamingState?: MessageStreamingState | null;
  audioRef?: { id: string; mimeType: string; durationMs: number } | null;
  attachments?: unknown[] | null;
  sourceNativeId?: string | null;
}

export interface CreateProjectInput {
  id?: string;
  resourceId?: string | null;
  displayName?: string;
  path: string;
  hidden?: boolean;
  archived?: boolean;
  sortRank?: number;
  createdAt?: number;
}

export interface UpdateProjectInput {
  resourceId?: string | null;
  displayName?: string;
  path?: string;
  hidden?: boolean;
  archived?: boolean;
  sortRank?: number;
}

export interface ListProjectsFilter {
  hidden?: boolean;
  archived?: boolean;
  limit?: number;
  offset?: number;
}

export interface ListProjectsResult {
  items: ProjectRecord[];
  total: number;
}

export interface StartTurnInput {
  prompt: string;
  sessionId?: string;
  projectId?: string | null;
  projectPath?: string | null;
  cwd?: string | null;
  title?: string;
  attachments?: unknown[] | null;
  audioRef?: AppendMessageInput["audioRef"];
  fixtureReply?: string;
}

export type SessionEventType =
  | "message.appended"
  | "message.updated"
  | "turn.finished"
  | "session.updated"
  | "project.updated"
  | "error";

export type SessionMessageUpdatedDelta = Partial<Pick<SessionMessageRecord,
  | "contentText"
  | "contentBlocks"
  | "toolCalls"
  | "timeline"
  | "workSummary"
  | "streamingState"
  | "attachments"
>>;

export interface SessionMessageUpdatedPayload {
  id: string;
  sessionId: string;
  messageId: string;
  delta: SessionMessageUpdatedDelta;
  full: false;
}

export interface SessionEvent {
  schemaVersion?: 1;
  type: SessionEventType;
  sessionId?: string;
  projectId?: string;
  messageId?: string;
  at: number;
  payload: unknown;
}

export interface UpsertOriginInput {
  sessionId: string;
  nativePath: string;
  nativeFormat: string;
  mirrorHash?: string | null;
  sourceMtimeMs?: number | null;
  sourceSize?: number | null;
  sourceIno?: number | null;
  sourceDev?: number | null;
  sourceCursorLine?: number | null;
  sourceCursorHash?: string | null;
}

export interface ImportSessionBatchInput {
  sessions?: CreateSessionInput[];
  messages?: AppendMessageInput[];
  events?: AppendSessionEventInput[];
  origin?: UpsertOriginInput | null;
}

export interface SessionWithMessages {
  session: SessionRecord;
  messages: SessionMessageRecord[];
}

export interface HydrateSessionInput {
  sessionId: string;
  messageLimit?: number;
  messageOffset?: number;
  recent?: boolean;
  summaryLimit?: number;
  includeEvents?: boolean;
  eventLimit?: number;
  eventOffset?: number;
  eventTurnId?: string;
}

export interface HydratedSessionResult {
  session: SessionRecord;
  messages: SessionMessageRecord[];
  messageOffset: number;
  messageLimit: number;
  hasOlderMessages: boolean;
  hasNewerMessages: boolean;
  turnSummaries: SessionTurnSummaryRecord[];
  projectionMeta: SessionProjectionMetaRecord | null;
  dynamicTools: SessionDynamicToolRecord[];
  events: SessionStructuredEventRecord[] | null;
  eventsLoaded: boolean;
  fallbackRequired: boolean;
}

export type SessionsRuntimeJobStatus = "queued" | "leased" | "done" | "failed" | "cancelled";

export interface SessionsRuntimeJobRecord {
  id: string;
  kind: string;
  title: string;
  resourceId: string | null;
  status: SessionsRuntimeJobStatus;
  priority: number;
  runAt: string | null;
  scheduledAt: string;
  claimOwner: string | null;
  leasedUntil: string | null;
  attempts: number;
  maxAttempts: number;
  payloadJson: unknown;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EnqueueSessionsRuntimeJobInput {
  id?: string;
  kind: "sessions.import_codex" | "sessions.rebuild_projection" | "sessions.rebuild_projections" | "sessions.extract_memory_base" | string;
  title?: string;
  resourceId?: string | null;
  priority?: number;
  scheduledAt?: string;
  runAt?: string;
  maxAttempts?: number;
  payload?: Record<string, unknown>;
}

export interface ClaimSessionsRuntimeJobsInput {
  limit?: number;
  now?: string;
  leaseMs?: number;
  owner?: string;
  kinds?: string[];
}

export interface RunSessionsRuntimeJobsInput {
  runtimeDbPath: string;
  sessionsDbPath: string;
  codexSessionsDir?: string;
  owner?: string;
  maxJobs?: number;
  maxRuntimeMs?: number;
  maxFailures?: number;
  leaseMs?: number;
  now?: string;
  onSessionChanged?: (event: SessionsRuntimeSessionChangedEvent) => void | Promise<void>;
}

export interface SessionsRuntimeSessionChangedEvent {
  sessionId: string;
  jobId: string;
  jobKind: string;
  reason: "import_codex" | "rebuild_projection" | "memory_extract";
}

export interface RunSessionsRuntimeJobsResult {
  claimed: number;
  completed: number;
  failed: number;
  stopReason: "drained" | "max_jobs" | "max_runtime_ms" | "max_failures";
  items: Array<{
    id: string;
    kind: string;
    status: SessionsRuntimeJobStatus;
    result?: unknown;
    error?: string;
  }>;
}

export interface SessionsRuntimeEventRecord {
  id: string;
  jobId: string | null;
  sessionId: string | null;
  kind: string;
  level: string;
  target: string | null;
  subsystem: string | null;
  message: string;
  createdAt: string;
  metadataJson: unknown;
  pinned: boolean;
  diagnosticBundleId: string | null;
  redacted: boolean;
}

export interface SessionsRuntimeLogRecord {
  id: string;
  jobId: string | null;
  sessionId: string | null;
  level: string;
  target: string | null;
  subsystem: string | null;
  message: string;
  createdAt: string;
  metadataJson: unknown;
  pinned: boolean;
  diagnosticBundleId: string | null;
  redacted: boolean;
}

export interface SessionsRuntimeDiagnosticBundleRecord {
  id: string;
  title: string;
  status: "open" | "sealed";
  sessionId: string | null;
  target: string | null;
  metadataJson: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface ApplySessionsRuntimeRetentionInput {
  now?: string;
  maxAgeDays?: number;
  maxEvents?: number;
  maxLogs?: number;
  maxEventBytes?: number;
  maxLogBytes?: number;
  dryRun?: boolean;
}

export interface ApplySessionsRuntimeRetentionResult {
  cutoff: string;
  dryRun: boolean;
  deleted: {
    events: number;
    logs: number;
    jobs: number;
  };
  retained: {
    events: number;
    logs: number;
    jobs: number;
  };
}

export interface ExportTrajectoryOptions {
  agent?: SessionAgent;
  since?: number;
  sinceCreatedAt?: number;
  includeFailed?: boolean;
  tag?: string;
  limit?: number;
  offset?: number;
  messageLimit?: number;
}

export interface TrajectoryRecord {
  sessionId: string;
  agent: SessionAgent;
  runtime: SessionRuntime | null;
  createdAt: number;
  outcome: "success" | "failure" | "partial" | "unknown";
  outcomeReason: string | null;
  durationMs: number | null;
  messages: SessionMessageRecord[];
  metadata: Record<string, unknown> | null;
}

export interface SessionStorageOperationMetric {
  count: number;
  errors: number;
  slowCount: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  lastMs: number;
}

export interface SessionStorageMetrics {
  queueDepth: number;
  operations: Record<string, SessionStorageOperationMetric>;
}
