export type CodeChangeKind = "fix" | "feat" | "refactor" | "docs" | "test" | "chore";
export type CodeRisk = "low" | "medium" | "high";
export type CodeIntentStatus = "open" | "blocked" | "queued" | "integrated" | "cancelled";
export type CodeCheckStatus = "passed" | "failed";
export type CodeReviewDecision = "approved" | "rejected";
export type CodeHostProvider = "github" | "gitlab";
export type CodeProjectStatus = "active" | "missing" | "uninitialized";
export type CodeAgentStatus = "idle" | "working" | "blocked" | "reviewing" | "offline";
export type CodeGateStatus = "passed" | "failed";
export type CodePolicyMode = "strict";

export interface CodeRepositoryRecord {
  id: string;
  rootDir: string;
  originUrl: string | null;
  defaultBranch: string;
  currentHead: string;
  createdAt: string;
  updatedAt: string;
}

export interface CodeIntentRecord {
  id: string;
  repoId: string;
  kind: CodeChangeKind;
  scope: string;
  title: string;
  summary: string | null;
  status: CodeIntentStatus;
  risk: CodeRisk;
  agentId: string;
  branch: string;
  baseBranch: string;
  baseSha: string;
  worktreePath: string;
  createdAt: string;
  updatedAt: string;
  queuedAt: string | null;
  integratedAt: string | null;
  commitSha: string | null;
  integrationSha: string | null;
  hostUrl: string | null;
}

export interface CodeReservationRecord {
  id: string;
  intentId: string;
  repoId: string;
  kind: "scope" | "path";
  value: string;
  status: "active" | "released";
  createdAt: string;
  releasedAt: string | null;
}

export interface CodeEvidenceRecord {
  id: string;
  intentId: string;
  kind: string;
  label: string;
  path: string | null;
  url: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CodeCheckRecord {
  id: string;
  intentId: string;
  name: string;
  status: CodeCheckStatus;
  command: string | null;
  exitCode: number | null;
  output: string | null;
  createdAt: string;
}

export interface CodeReviewRecord {
  id: string;
  intentId: string;
  reviewer: string;
  decision: CodeReviewDecision;
  reason: string | null;
  createdAt: string;
}

export interface CodeQueueRecord {
  id: string;
  intentId: string;
  status: "queued" | "integrated" | "failed";
  createdAt: string;
  updatedAt: string;
  error: string | null;
}

export interface CodeHostSyncRecord {
  id: string;
  intentId: string;
  provider: CodeHostProvider;
  status: "planned" | "synced" | "failed";
  remoteUrl: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CodeIntegrationPolicy {
  schemaVersion: 1;
  mode: CodePolicyMode;
  merge: {
    requireFreshBase: boolean;
    requireCleanSimulation: boolean;
  };
  checks: {
    requireAtLeastOnePassed: boolean;
    requiredNames: string[];
  };
  evidence: {
    minimumByKind: Record<CodeChangeKind, number>;
    highRiskMinimum: number;
  };
  risk: {
    largeDiffThreshold: number;
    criticalPaths: string[];
    requireHumanReviewForHighRisk: boolean;
  };
  host: {
    requireSynced: boolean;
  };
}

export interface CodePolicyRecord {
  path: string;
  policy: CodeIntegrationPolicy;
  updatedAt: string;
}

export interface CodeDiffSummary {
  filesChanged: number;
  additions: number;
  deletions: number;
  deletedFiles: string[];
  changedFiles: string[];
}

export interface CodeGateRunRecord {
  id: string;
  intentId: string;
  status: CodeGateStatus;
  effectiveRisk: CodeRisk;
  reasons: string[];
  diffSummary: CodeDiffSummary;
  policy: CodeIntegrationPolicy;
  createdAt: string;
}

export interface CodeIntentDetail {
  intent: CodeIntentRecord;
  reservations: CodeReservationRecord[];
  evidence: CodeEvidenceRecord[];
  checks: CodeCheckRecord[];
  reviews: CodeReviewRecord[];
  queue: CodeQueueRecord | null;
  hostSyncs: CodeHostSyncRecord[];
  gateRuns: CodeGateRunRecord[];
  latestGate: CodeGateRunRecord | null;
}

export interface CreateCodeLedgerOptions {
  cwd?: string;
  repoDir?: string;
}

export interface CodeStartInput {
  kind: CodeChangeKind;
  scope: string;
  title: string;
  summary?: string;
  risk?: CodeRisk;
  agentId?: string;
  baseBranch?: string;
  paths?: string[];
}

export interface CodeReserveInput {
  intentId: string;
  scopes?: string[];
  paths?: string[];
}

export interface CodeEvidenceInput {
  intentId: string;
  kind?: string;
  label: string;
  path?: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

export interface CodeCheckRecordInput {
  intentId: string;
  name: string;
  status: CodeCheckStatus;
  command?: string;
  exitCode?: number;
  output?: string;
}

export interface CodeCheckRunInput {
  intentId: string;
  name: string;
  command: string;
}

export interface CodeReviewInput {
  intentId: string;
  reviewer: string;
  decision: CodeReviewDecision;
  reason?: string;
}

export interface CodeCommitResult {
  intent: CodeIntentRecord;
  commitSha: string;
  message: string;
}

export interface CodeIntegrateResult {
  intent: CodeIntentRecord;
  queue: CodeQueueRecord;
  integrationSha: string;
}

export interface CodeSyncGithubInput {
  intentId: string;
  dryRun?: boolean;
  repo?: string;
  base?: string;
}

export interface CodeProjectRecord {
  id: string;
  name: string;
  rootDir: string;
  status: CodeProjectStatus;
  originUrl: string | null;
  defaultBranch: string | null;
  currentHead: string | null;
  createdAt: string;
  updatedAt: string;
  lastSyncAt: string | null;
}

export interface CodeAgentRecord {
  id: string;
  label: string;
  status: CodeAgentStatus;
  projectId: string | null;
  intentId: string | null;
  worktreePath: string | null;
  heartbeatAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CodeGlobalIntentRecord extends CodeIntentRecord {
  projectId: string;
  projectName: string;
  projectRootDir: string;
  latestGate: CodeGateRunRecord | null;
}

export interface CodeGlobalQueueRecord extends CodeQueueRecord {
  projectId: string;
  projectName: string;
  intent: CodeIntentRecord | null;
  latestGate: CodeGateRunRecord | null;
}

export interface CodeGlobalReservationRecord extends CodeReservationRecord {
  projectId: string;
  projectName: string;
}

export interface CodeGlobalStatus {
  projects: CodeProjectRecord[];
  agents: CodeAgentRecord[];
  intents: CodeGlobalIntentRecord[];
  queued: CodeGlobalQueueRecord[];
}

export interface CreateCodeGlobalIndexOptions {
  rootDir?: string;
}

export interface AddCodeProjectInput {
  rootDir: string;
  id?: string;
  name?: string;
}

export interface DiscoverCodeProjectsInput {
  rootDir: string;
  maxDepth?: number;
}

export interface RegisterCodeAgentInput {
  id: string;
  label?: string;
  status?: CodeAgentStatus;
  projectId?: string | null;
  intentId?: string | null;
  worktreePath?: string | null;
}

export interface HeartbeatCodeAgentInput {
  id: string;
  status?: CodeAgentStatus;
  projectId?: string | null;
  intentId?: string | null;
  worktreePath?: string | null;
}

export interface CodeServeOptions {
  host?: string;
  port?: number;
}

export interface CodeServerHandle {
  url: string;
  close: () => Promise<void>;
}

export interface SqliteCodeIntentRow {
  id: string;
  repo_id: string;
  kind: CodeChangeKind;
  scope: string;
  title: string;
  summary: string | null;
  status: CodeIntentStatus;
  risk: CodeRisk;
  agent_id: string;
  branch: string;
  base_branch: string;
  base_sha: string;
  worktree_path: string;
  created_at: string;
  updated_at: string;
  queued_at: string | null;
  integrated_at: string | null;
  commit_sha: string | null;
  integration_sha: string | null;
  host_url: string | null;
}

export interface SqliteReservationRow {
  id: string;
  intent_id: string;
  repo_id: string;
  kind: "scope" | "path";
  value: string;
  status: "active" | "released";
  created_at: string;
  released_at: string | null;
}

export interface SqliteEvidenceRow {
  id: string;
  intent_id: string;
  kind: string;
  label: string;
  path: string | null;
  url: string | null;
  metadata_json: string;
  created_at: string;
}

export interface SqliteCheckRow {
  id: string;
  intent_id: string;
  name: string;
  status: CodeCheckStatus;
  command: string | null;
  exit_code: number | null;
  output: string | null;
  created_at: string;
}

export interface SqliteReviewRow {
  id: string;
  intent_id: string;
  reviewer: string;
  decision: CodeReviewDecision;
  reason: string | null;
  created_at: string;
}

export interface SqliteQueueRow {
  id: string;
  intent_id: string;
  status: "queued" | "integrated" | "failed";
  created_at: string;
  updated_at: string;
  error: string | null;
}

export interface SqliteHostSyncRow {
  id: string;
  intent_id: string;
  provider: CodeHostProvider;
  status: "planned" | "synced" | "failed";
  remote_url: string | null;
  payload_json: string;
  created_at: string;
  updated_at: string;
}

export interface SqliteCodePolicyRow {
  id: string;
  path: string;
  policy_json: string;
  updated_at: string;
}

export interface SqliteGateRunRow {
  id: string;
  intent_id: string;
  status: CodeGateStatus;
  effective_risk: CodeRisk;
  reasons_json: string;
  diff_summary_json: string;
  policy_json: string;
  created_at: string;
}

export interface SqliteCodeProjectRow {
  id: string;
  name: string;
  root_dir: string;
  status: CodeProjectStatus;
  origin_url: string | null;
  default_branch: string | null;
  current_head: string | null;
  created_at: string;
  updated_at: string;
  last_sync_at: string | null;
}

export interface SqliteCodeAgentRow {
  id: string;
  label: string;
  status: CodeAgentStatus;
  project_id: string | null;
  intent_id: string | null;
  worktree_path: string | null;
  heartbeat_at: string;
  created_at: string;
  updated_at: string;
}
