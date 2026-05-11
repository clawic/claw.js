export type SessionAgent = string;
export type SessionRuntime = string;

export type SessionStatus = "active" | "completed" | "interrupted" | "archived";

export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface SessionRecord {
  id: string;
  agent: SessionAgent;
  runtime: SessionRuntime | null;
  machine: string | null;
  workspaceId: string | null;
  projectPath: string | null;
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
  workSummary: unknown | null;
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
}

export interface ListSessionsFilter {
  agent?: SessionAgent;
  runtime?: SessionRuntime;
  machine?: string;
  workspaceId?: string;
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

export interface SearchSessionsInput {
  query: string;
  agent?: SessionAgent;
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
  projectPath?: string | null;
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
  workSummary?: unknown | null;
  audioRef?: { id: string; mimeType: string; durationMs: number } | null;
  attachments?: unknown[] | null;
  sourceNativeId?: string | null;
}

export interface UpsertOriginInput {
  sessionId: string;
  nativePath: string;
  nativeFormat: string;
  mirrorHash?: string | null;
}

export interface SessionWithMessages {
  session: SessionRecord;
  messages: SessionMessageRecord[];
}

export interface ExportTrajectoryOptions {
  agent?: SessionAgent;
  since?: number;
  includeFailed?: boolean;
  tag?: string;
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
