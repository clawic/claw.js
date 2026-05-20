import type { SessionMessageRecord, SessionRecord, SessionsApiClient } from "@clawjs/sessions";
import type { UserModelApiClient, UserProfileItem } from "@clawjs/user-model";

export type RuntimeJobKind = "distill" | "nudge" | "user_model_refresh";
export type RuntimeJobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export type RuntimeJobEventKind = "job.started" | "job.completed" | "job.failed" | "job.cancelled";
export type RuntimeJobEventLevel = "info" | "warning" | "error";

export interface RuntimeJobRecord {
  id: string;
  kind: RuntimeJobKind;
  status: RuntimeJobStatus;
  startedAt: number;
  completedAt: number | null;
  error: string | null;
  payload: Record<string, unknown> | null;
}

export interface RuntimeJobEventRecord {
  id: number;
  jobId: string;
  kind: RuntimeJobEventKind;
  level: RuntimeJobEventLevel;
  message: string;
  recordedAt: number;
  payload: Record<string, unknown> | null;
}

export interface RuntimeJobStartInput {
  kind: RuntimeJobKind;
  input: Record<string, unknown>;
  reason?: string;
}

export interface RuntimeJobStartResult {
  job: RuntimeJobRecord;
  result: unknown;
  source: "runtime.jobs.start";
}

export interface RuntimeJobCancelResult {
  job: RuntimeJobRecord;
  cancelled: boolean;
  source: "runtime.jobs.cancel";
}

export interface DistillationRecord {
  id: string;
  sessionId: string;
  skillSlug: string;
  skillMarkdownPath: string | null;
  provenance: "distilled";
  confidence: number;
  toolCallCount: number;
  messageCount: number;
  distilledAt: number;
  status: "completed" | "skipped" | "failed";
  reason: string | null;
}

export interface NudgeRecord {
  id: string;
  sessionId: string;
  triggerMessageId: string | null;
  observation: string;
  classification: string;
  recordedAt: number;
  propagatedToMemory: boolean;
}

export interface UserModelRefreshRecord {
  id: string;
  reason: string | null;
  itemsAdded: number;
  itemsUpdated: number;
  itemsRemoved: number;
  durationMs: number;
  refreshedAt: number;
  status: "completed" | "failed";
  error: string | null;
}

export interface DistillInput {
  sessionId: string;
  taskId?: string | null;
  minToolCalls?: number;
  forceRedistill?: boolean;
  reason?: string;
}

export interface NudgeInput {
  sessionId: string;
  sinceMessageId?: string | null;
  lookbackMinutes?: number;
  maxMessages?: number;
}

export interface UserModelRefreshInput {
  reason?: string;
  agent?: string;
  sinceCreatedAt?: number;
  maxSessions?: number;
}

export interface DistillerSynthesizerInput {
  session: SessionRecord;
  messages: SessionMessageRecord[];
}

export interface DistillerSynthesizerOutput {
  slug: string;
  name: string;
  description: string;
  body: string;
  confidence: number;
  tags?: string[];
}

export type DistillerSynthesizer = (input: DistillerSynthesizerInput) => Promise<DistillerSynthesizerOutput | null>;

export interface NudgeSynthesizerInput {
  session: SessionRecord;
  messages: SessionMessageRecord[];
}

export interface NudgeSynthesizerOutputItem {
  triggerMessageId: string | null;
  observation: string;
  classification: string;
}

export type NudgeSynthesizer = (input: NudgeSynthesizerInput) => Promise<NudgeSynthesizerOutputItem[]>;

export interface UserModelSynthesizerInput {
  sessions: Array<{ session: SessionRecord; messages: SessionMessageRecord[] }>;
  existingItems: UserProfileItem[];
}

export type UserModelSynthesizerAction =
  | {
      kind: "upsert";
      section:
        | "communication_style"
        | "expertise"
        | "project"
        | "edge_case"
        | "preference"
        | "goal"
        | "blocker";
      contentText: string;
      topic?: string | null;
      confidence?: number | null;
      sourceSessionId?: string;
    }
  | {
      kind: "forget";
      id: string;
    };

export type UserModelSynthesizer = (input: UserModelSynthesizerInput) => Promise<UserModelSynthesizerAction[]>;

export interface RuntimeServicesContext {
  sessionsClient: SessionsApiClient;
  userModelClient: UserModelApiClient;
  skillsOutputDir: string;
  distillerSynthesizer: DistillerSynthesizer;
  nudgeSynthesizer: NudgeSynthesizer;
  userModelSynthesizer: UserModelSynthesizer;
}

export type KanbanStatus =
  | "triage"
  | "todo"
  | "ready"
  | "in_progress"
  | "blocked"
  | "done"
  | "cancelled";

export type KanbanPriority = "low" | "medium" | "high" | "urgent";

export interface KanbanTaskRecord {
  id: string;
  title: string;
  description: string | null;
  status: KanbanStatus;
  priority: KanbanPriority;
  agentAssigned: string | null;
  claimedBy: string | null;
  claimedAt: number | null;
  claimExpiresAt: number | null;
  failureCount: number;
  lastFailureAt: number | null;
  failureReason: string | null;
  blockReason: string | null;
  dependsOnIds: string[];
  boardOrder: number;
  projectPath: string | null;
  sessionId: string | null;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
  metadata: Record<string, unknown> | null;
}

export interface KanbanCommentRecord {
  id: string;
  taskId: string;
  author: string;
  body: string;
  createdAt: number;
}

export interface KanbanEventRecord {
  id: number;
  taskId: string;
  kind: string;
  fromStatus: KanbanStatus | null;
  toStatus: KanbanStatus | null;
  actor: string | null;
  payload: Record<string, unknown> | null;
  recordedAt: number;
}

export interface CreateKanbanTaskInput {
  id?: string;
  title: string;
  description?: string | null;
  status?: KanbanStatus;
  priority?: KanbanPriority;
  agentAssigned?: string | null;
  dependsOnIds?: string[];
  projectPath?: string | null;
  sessionId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface UpdateKanbanTaskInput {
  title?: string;
  description?: string | null;
  priority?: KanbanPriority;
  agentAssigned?: string | null;
  dependsOnIds?: string[];
  projectPath?: string | null;
  metadata?: Record<string, unknown> | null;
  boardOrder?: number;
}

export interface ListKanbanFilter {
  status?: KanbanStatus;
  agentAssigned?: string;
  claimedBy?: string;
  projectPath?: string;
  limit?: number;
  offset?: number;
}

export interface KanbanBoard {
  triage: KanbanTaskRecord[];
  todo: KanbanTaskRecord[];
  ready: KanbanTaskRecord[];
  in_progress: KanbanTaskRecord[];
  blocked: KanbanTaskRecord[];
  done: KanbanTaskRecord[];
  cancelled: KanbanTaskRecord[];
}

export interface ClaimResult {
  claimed: boolean;
  task: KanbanTaskRecord | null;
  reason?: string;
}

export interface DispatcherTickResult {
  reclaimedIds: string[];
  promotedIds: string[];
  autoBlockedIds: string[];
  ranAt: number;
}

export interface KanbanDispatcherOptions {
  claimTtlMs?: number;
  autoBlockThreshold?: number;
}

export interface DistillerOptions {
  minToolCalls?: number;
  minMessageCount?: number;
  forceRedistill?: boolean;
}

export interface NudgeOptions {
  lookbackMinutes?: number;
  maxMessages?: number;
}

export interface UserModelRefreshOptions {
  maxSessions?: number;
  sinceCreatedAt?: number;
  agent?: string;
}
