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
}

export interface SessionWithMessages {
  session: SessionRecord;
  messages: SessionMessageRecord[];
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
