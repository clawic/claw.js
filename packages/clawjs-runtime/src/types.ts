import type { SessionMessageRecord, SessionRecord, SessionsApiClient } from "@clawjs/sessions";
import type { UserModelApiClient, UserProfileItem } from "@clawjs/user-model";

export type RuntimeJobKind = "distill" | "nudge" | "user_model_refresh";
export type RuntimeJobStatus = "pending" | "running" | "completed" | "failed";

export interface RuntimeJobRecord {
  id: string;
  kind: RuntimeJobKind;
  status: RuntimeJobStatus;
  startedAt: number;
  completedAt: number | null;
  error: string | null;
  payload: Record<string, unknown> | null;
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
