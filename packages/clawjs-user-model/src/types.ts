export type UserModelSection =
  | "communication_style"
  | "expertise"
  | "project"
  | "edge_case"
  | "preference"
  | "goal"
  | "blocker";

export const USER_MODEL_SECTIONS: readonly UserModelSection[] = [
  "communication_style",
  "expertise",
  "project",
  "edge_case",
  "preference",
  "goal",
  "blocker",
];

export interface UserProfileItem {
  id: string;
  section: UserModelSection;
  contentText: string;
  confidence: number | null;
  source: string;
  topic: string | null;
  createdAt: number;
  updatedAt: number;
  metadata: Record<string, unknown> | null;
}

export interface UserProfileSnapshot {
  items: UserProfileItem[];
  capturedAt: number;
  lastRefreshAt: number | null;
}

export interface UserProfileBySection {
  communication_style: UserProfileItem[];
  expertise: UserProfileItem[];
  project: UserProfileItem[];
  edge_case: UserProfileItem[];
  preference: UserProfileItem[];
  goal: UserProfileItem[];
  blocker: UserProfileItem[];
}

export interface UpsertItemInput {
  id?: string;
  section: UserModelSection;
  contentText: string;
  confidence?: number | null;
  source?: string;
  topic?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface UpdateItemInput {
  contentText?: string;
  confidence?: number | null;
  topic?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ForgetInput {
  about?: string;
  section?: UserModelSection;
  topic?: string;
  ids?: string[];
}

export interface ForgetResult {
  forgottenCount: number;
  forgottenIds: string[];
}

export interface UserProfileHistoryRecord {
  id: number;
  snapshot: UserProfileSnapshot;
  snapshotAt: number;
  reason: string | null;
}

export interface CommitSnapshotInput {
  reason?: string | null;
}
