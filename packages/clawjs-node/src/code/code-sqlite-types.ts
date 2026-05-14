import type {
  CodeAgentStatus,
  CodeChangeKind,
  CodeCheckStatus,
  CodeGateStatus,
  CodeHostProvider,
  CodeIntentStatus,
  CodeProjectStatus,
  CodeReviewDecision,
  CodeRisk,
} from "./code-types.ts";

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
