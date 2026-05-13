import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { randomBytes } from "crypto";
import { spawnSync } from "child_process";

import Database from "better-sqlite3";

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

interface SqliteCodeIntentRow {
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

interface SqliteReservationRow {
  id: string;
  intent_id: string;
  repo_id: string;
  kind: "scope" | "path";
  value: string;
  status: "active" | "released";
  created_at: string;
  released_at: string | null;
}

interface SqliteEvidenceRow {
  id: string;
  intent_id: string;
  kind: string;
  label: string;
  path: string | null;
  url: string | null;
  metadata_json: string;
  created_at: string;
}

interface SqliteCheckRow {
  id: string;
  intent_id: string;
  name: string;
  status: CodeCheckStatus;
  command: string | null;
  exit_code: number | null;
  output: string | null;
  created_at: string;
}

interface SqliteReviewRow {
  id: string;
  intent_id: string;
  reviewer: string;
  decision: CodeReviewDecision;
  reason: string | null;
  created_at: string;
}

interface SqliteQueueRow {
  id: string;
  intent_id: string;
  status: "queued" | "integrated" | "failed";
  created_at: string;
  updated_at: string;
  error: string | null;
}

interface SqliteHostSyncRow {
  id: string;
  intent_id: string;
  provider: CodeHostProvider;
  status: "planned" | "synced" | "failed";
  remote_url: string | null;
  payload_json: string;
  created_at: string;
  updated_at: string;
}

interface SqliteCodePolicyRow {
  id: string;
  path: string;
  policy_json: string;
  updated_at: string;
}

interface SqliteGateRunRow {
  id: string;
  intent_id: string;
  status: CodeGateStatus;
  effective_risk: CodeRisk;
  reasons_json: string;
  diff_summary_json: string;
  policy_json: string;
  created_at: string;
}

interface SqliteCodeProjectRow {
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

interface SqliteCodeAgentRow {
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

const CHANGE_KINDS = new Set<CodeChangeKind>(["fix", "feat", "refactor", "docs", "test", "chore"]);
const RISKS = new Set<CodeRisk>(["low", "medium", "high"]);
const AGENT_STATUSES = new Set<CodeAgentStatus>(["idle", "working", "blocked", "reviewing", "offline"]);
const DEFAULT_CODE_POLICY_FILE = "claw.code.json";
const DEFAULT_CODE_POLICY: CodeIntegrationPolicy = {
  schemaVersion: 1,
  mode: "strict",
  merge: {
    requireFreshBase: true,
    requireCleanSimulation: true,
  },
  checks: {
    requireAtLeastOnePassed: true,
    requiredNames: ["e2e"],
  },
  evidence: {
    minimumByKind: {
      fix: 1,
      feat: 1,
      refactor: 1,
      docs: 0,
      test: 1,
      chore: 0,
    },
    highRiskMinimum: 2,
  },
  risk: {
    largeDiffThreshold: 500,
    criticalPaths: [
      ".github/",
      ".env",
      "package.json",
      "package-lock.json",
      "pnpm-lock.yaml",
      "yarn.lock",
      "security/",
      "secrets/",
    ],
    requireHumanReviewForHighRisk: true,
  },
  host: {
    requireSynced: false,
  },
};

function nowIso(): string {
  return new Date().toISOString();
}

function codeId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "change";
}

function assertChangeKind(kind: string): CodeChangeKind {
  if (CHANGE_KINDS.has(kind as CodeChangeKind)) return kind as CodeChangeKind;
  throw new Error(`Invalid code change kind: ${kind}`);
}

function assertRisk(risk: string | undefined): CodeRisk {
  if (!risk) return "medium";
  if (RISKS.has(risk as CodeRisk)) return risk as CodeRisk;
  throw new Error(`Invalid code risk: ${risk}`);
}

function runGit(cwd: string, args: string[], options: { allowFailure?: boolean } = {}): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(output || `git ${args.join(" ")} failed`);
  }
  return (result.stdout ?? "").trim();
}

function runShell(cwd: string, command: string): { status: CodeCheckStatus; exitCode: number; output: string } {
  const result = spawnSync(command, { cwd, shell: true, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  const exitCode = typeof result.status === "number" ? result.status : 1;
  return {
    status: exitCode === 0 ? "passed" : "failed",
    exitCode,
    output,
  };
}

function discoverGitRoot(cwd: string): string {
  const root = runGit(cwd, ["rev-parse", "--show-toplevel"]);
  return path.resolve(root);
}

function resolveRepoRoot(options: CreateCodeLedgerOptions): string {
  if (options.repoDir) return discoverGitRoot(path.resolve(options.repoDir));
  return discoverGitRoot(path.resolve(options.cwd ?? process.cwd()));
}

function resolveDatabasePath(repoRoot: string): string {
  return path.join(resolveClawjsDataRoot(), "runtime.sqlite");
}

function resolvePolicyPath(repoRoot: string): string {
  return path.join(repoRoot, DEFAULT_CODE_POLICY_FILE);
}

function resolveGlobalRootDir(rootDir?: string): string {
  return path.resolve(rootDir || process.env.CLAW_CODE_HOME || resolveClawjsDataRoot());
}

function resolveGlobalDatabasePath(rootDir?: string): string {
  return path.join(resolveGlobalRootDir(rootDir), "runtime.sqlite");
}

function resolveClawjsDataRoot(): string {
  const explicit = process.env.CLAW_DATA_DIR ?? process.env.CLAWIX_CLAW_DATA_DIR;
  if (explicit) return expandHome(explicit);
  return path.join(expandHome(process.env.CLAW_HOME ?? path.join(os.homedir(), ".claw")), "data");
}

function expandHome(value: string): string {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}

function normalizePathList(paths?: string[]): string[] {
  return [...new Set((paths ?? [])
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim().replace(/^\.\/+/, ""))
    .filter(Boolean))];
}

function reservationOverlaps(left: CodeReservationRecord, right: { kind: "scope" | "path"; value: string }): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "scope") return left.value === right.value;
  const a = left.value.replace(/\/+$/, "");
  const b = right.value.replace(/\/+$/, "");
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function mapIntent(row: SqliteCodeIntentRow): CodeIntentRecord {
  return {
    id: row.id,
    repoId: row.repo_id,
    kind: row.kind,
    scope: row.scope,
    title: row.title,
    summary: row.summary,
    status: row.status,
    risk: row.risk,
    agentId: row.agent_id,
    branch: row.branch,
    baseBranch: row.base_branch,
    baseSha: row.base_sha,
    worktreePath: row.worktree_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    queuedAt: row.queued_at,
    integratedAt: row.integrated_at,
    commitSha: row.commit_sha,
    integrationSha: row.integration_sha,
    hostUrl: row.host_url,
  };
}

function mapReservation(row: SqliteReservationRow): CodeReservationRecord {
  return {
    id: row.id,
    intentId: row.intent_id,
    repoId: row.repo_id,
    kind: row.kind,
    value: row.value,
    status: row.status,
    createdAt: row.created_at,
    releasedAt: row.released_at,
  };
}

function safeJsonParse(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function safeJsonArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readJsonObjectFile(filePath: string): Record<string, unknown> {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid JSON object in ${filePath}`);
  }
  return parsed as Record<string, unknown>;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean))]
    : [];
}

function normalizeMinimumByKind(value: unknown): Record<CodeChangeKind, number> {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    fix: Math.max(0, Number(source.fix ?? DEFAULT_CODE_POLICY.evidence.minimumByKind.fix) || 0),
    feat: Math.max(0, Number(source.feat ?? DEFAULT_CODE_POLICY.evidence.minimumByKind.feat) || 0),
    refactor: Math.max(0, Number(source.refactor ?? DEFAULT_CODE_POLICY.evidence.minimumByKind.refactor) || 0),
    docs: Math.max(0, Number(source.docs ?? DEFAULT_CODE_POLICY.evidence.minimumByKind.docs) || 0),
    test: Math.max(0, Number(source.test ?? DEFAULT_CODE_POLICY.evidence.minimumByKind.test) || 0),
    chore: Math.max(0, Number(source.chore ?? DEFAULT_CODE_POLICY.evidence.minimumByKind.chore) || 0),
  };
}

function normalizePolicy(raw: unknown): CodeIntegrationPolicy {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Code policy must be an object");
  const input = raw as Record<string, unknown>;
  const merge = input.merge && typeof input.merge === "object" && !Array.isArray(input.merge) ? input.merge as Record<string, unknown> : {};
  const checks = input.checks && typeof input.checks === "object" && !Array.isArray(input.checks) ? input.checks as Record<string, unknown> : {};
  const evidence = input.evidence && typeof input.evidence === "object" && !Array.isArray(input.evidence) ? input.evidence as Record<string, unknown> : {};
  const risk = input.risk && typeof input.risk === "object" && !Array.isArray(input.risk) ? input.risk as Record<string, unknown> : {};
  const host = input.host && typeof input.host === "object" && !Array.isArray(input.host) ? input.host as Record<string, unknown> : {};
  const policy: CodeIntegrationPolicy = {
    schemaVersion: 1,
    mode: "strict",
    merge: {
      requireFreshBase: typeof merge.requireFreshBase === "boolean" ? merge.requireFreshBase : DEFAULT_CODE_POLICY.merge.requireFreshBase,
      requireCleanSimulation: typeof merge.requireCleanSimulation === "boolean" ? merge.requireCleanSimulation : DEFAULT_CODE_POLICY.merge.requireCleanSimulation,
    },
    checks: {
      requireAtLeastOnePassed: typeof checks.requireAtLeastOnePassed === "boolean" ? checks.requireAtLeastOnePassed : DEFAULT_CODE_POLICY.checks.requireAtLeastOnePassed,
      requiredNames: normalizeStringArray(checks.requiredNames).length > 0 ? normalizeStringArray(checks.requiredNames) : DEFAULT_CODE_POLICY.checks.requiredNames,
    },
    evidence: {
      minimumByKind: normalizeMinimumByKind(evidence.minimumByKind),
      highRiskMinimum: Math.max(0, Number(evidence.highRiskMinimum ?? DEFAULT_CODE_POLICY.evidence.highRiskMinimum) || 0),
    },
    risk: {
      largeDiffThreshold: Math.max(1, Number(risk.largeDiffThreshold ?? DEFAULT_CODE_POLICY.risk.largeDiffThreshold) || DEFAULT_CODE_POLICY.risk.largeDiffThreshold),
      criticalPaths: normalizeStringArray(risk.criticalPaths).length > 0 ? normalizeStringArray(risk.criticalPaths) : DEFAULT_CODE_POLICY.risk.criticalPaths,
      requireHumanReviewForHighRisk: typeof risk.requireHumanReviewForHighRisk === "boolean" ? risk.requireHumanReviewForHighRisk : DEFAULT_CODE_POLICY.risk.requireHumanReviewForHighRisk,
    },
    host: {
      requireSynced: typeof host.requireSynced === "boolean" ? host.requireSynced : DEFAULT_CODE_POLICY.host.requireSynced,
    },
  };
  return policy;
}

function riskRank(risk: CodeRisk): number {
  return risk === "high" ? 2 : risk === "medium" ? 1 : 0;
}

function riskFromRank(rank: number): CodeRisk {
  return rank >= 2 ? "high" : rank === 1 ? "medium" : "low";
}

function isHumanReviewer(review: CodeReviewRecord, intent: CodeIntentRecord): boolean {
  const reviewer = review.reviewer.trim().toLowerCase();
  if (!reviewer || reviewer === intent.agentId.trim().toLowerCase()) return false;
  if (reviewer === "operator") return false;
  return !reviewer.startsWith("agent");
}

function pathMatchesPolicy(filePath: string, policyPath: string): boolean {
  const file = filePath.replace(/^\.\/+/, "").replace(/\\/g, "/");
  const pattern = policyPath.replace(/^\.\/+/, "").replace(/\\/g, "/");
  if (!pattern) return false;
  if (pattern.endsWith("/")) return file.startsWith(pattern);
  return file === pattern || file.startsWith(`${pattern}/`) || file.includes(`/${pattern}/`) || file.includes(`/${pattern}`);
}

function mapEvidence(row: SqliteEvidenceRow): CodeEvidenceRecord {
  return {
    id: row.id,
    intentId: row.intent_id,
    kind: row.kind,
    label: row.label,
    path: row.path,
    url: row.url,
    metadata: safeJsonParse(row.metadata_json),
    createdAt: row.created_at,
  };
}

function mapCheck(row: SqliteCheckRow): CodeCheckRecord {
  return {
    id: row.id,
    intentId: row.intent_id,
    name: row.name,
    status: row.status,
    command: row.command,
    exitCode: row.exit_code,
    output: row.output,
    createdAt: row.created_at,
  };
}

function mapReview(row: SqliteReviewRow): CodeReviewRecord {
  return {
    id: row.id,
    intentId: row.intent_id,
    reviewer: row.reviewer,
    decision: row.decision,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

function mapQueue(row: SqliteQueueRow): CodeQueueRecord {
  return {
    id: row.id,
    intentId: row.intent_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    error: row.error,
  };
}

function mapHostSync(row: SqliteHostSyncRow): CodeHostSyncRecord {
  return {
    id: row.id,
    intentId: row.intent_id,
    provider: row.provider,
    status: row.status,
    remoteUrl: row.remote_url,
    payload: safeJsonParse(row.payload_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapGateRun(row: SqliteGateRunRow): CodeGateRunRecord {
  return {
    id: row.id,
    intentId: row.intent_id,
    status: row.status,
    effectiveRisk: row.effective_risk,
    reasons: safeJsonArray(row.reasons_json).filter((entry): entry is string => typeof entry === "string"),
    diffSummary: {
      filesChanged: Number((safeJsonParse(row.diff_summary_json).filesChanged)) || 0,
      additions: Number((safeJsonParse(row.diff_summary_json).additions)) || 0,
      deletions: Number((safeJsonParse(row.diff_summary_json).deletions)) || 0,
      deletedFiles: normalizeStringArray(safeJsonParse(row.diff_summary_json).deletedFiles),
      changedFiles: normalizeStringArray(safeJsonParse(row.diff_summary_json).changedFiles),
    },
    policy: normalizePolicy(safeJsonParse(row.policy_json)),
    createdAt: row.created_at,
  };
}

function mapProject(row: SqliteCodeProjectRow): CodeProjectRecord {
  return {
    id: row.id,
    name: row.name,
    rootDir: row.root_dir,
    status: row.status,
    originUrl: row.origin_url,
    defaultBranch: row.default_branch,
    currentHead: row.current_head,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSyncAt: row.last_sync_at,
  };
}

function mapAgent(row: SqliteCodeAgentRow): CodeAgentRecord {
  return {
    id: row.id,
    label: row.label,
    status: row.status,
    projectId: row.project_id,
    intentId: row.intent_id,
    worktreePath: row.worktree_path,
    heartbeatAt: row.heartbeat_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assertAgentStatus(status: string | undefined): CodeAgentStatus {
  if (!status) return "idle";
  if (AGENT_STATUSES.has(status as CodeAgentStatus)) return status as CodeAgentStatus;
  throw new Error(`Invalid code agent status: ${status}`);
}

function parseRequestJson(request: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    request.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > 512 * 1024) {
        reject(new Error("request body is too large"));
        request.destroy();
        return;
      }
      chunks.push(buffer);
    });
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8").trim();
      if (!body) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(body) as unknown;
        resolve(parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendCodeJson(response: http.ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

function stringInput(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function boolInput(payload: Record<string, unknown>, key: string): boolean | undefined {
  const value = payload[key];
  return typeof value === "boolean" ? value : undefined;
}

function listInput(payload: Record<string, unknown>, key: string): string[] | undefined {
  const value = payload[key];
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string");
  if (typeof value === "string") return [value];
  return undefined;
}

export class CodeLedger {
  readonly repoRoot: string;
  readonly databasePath: string;
  private readonly db: Database.Database;

  constructor(options: CreateCodeLedgerOptions = {}) {
    this.repoRoot = resolveRepoRoot(options);
    this.databasePath = resolveDatabasePath(this.repoRoot);
    fs.mkdirSync(path.dirname(this.databasePath), { recursive: true });
    this.db = new Database(this.databasePath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS code_repositories (
        id TEXT PRIMARY KEY,
        root_dir TEXT NOT NULL UNIQUE,
        origin_url TEXT,
        default_branch TEXT NOT NULL,
        current_head TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS code_intents (
        id TEXT PRIMARY KEY,
        repo_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        scope TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT,
        status TEXT NOT NULL,
        risk TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        branch TEXT NOT NULL UNIQUE,
        base_branch TEXT NOT NULL,
        base_sha TEXT NOT NULL,
        worktree_path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        queued_at TEXT,
        integrated_at TEXT,
        commit_sha TEXT,
        integration_sha TEXT,
        host_url TEXT
      );
      CREATE INDEX IF NOT EXISTS code_intents_repo_status_idx ON code_intents(repo_id, status, updated_at DESC);
      CREATE TABLE IF NOT EXISTS code_reservations (
        id TEXT PRIMARY KEY,
        intent_id TEXT NOT NULL,
        repo_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        value TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        released_at TEXT
      );
      CREATE INDEX IF NOT EXISTS code_reservations_active_idx ON code_reservations(repo_id, status, kind, value);
      CREATE TABLE IF NOT EXISTS code_evidence (
        id TEXT PRIMARY KEY,
        intent_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        label TEXT NOT NULL,
        path TEXT,
        url TEXT,
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS code_checks (
        id TEXT PRIMARY KEY,
        intent_id TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        command TEXT,
        exit_code INTEGER,
        output TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS code_checks_intent_name_idx ON code_checks(intent_id, name, created_at DESC);
      CREATE TABLE IF NOT EXISTS code_reviews (
        id TEXT PRIMARY KEY,
        intent_id TEXT NOT NULL,
        reviewer TEXT NOT NULL,
        decision TEXT NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS code_reviews_intent_idx ON code_reviews(intent_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS code_queue (
        id TEXT PRIMARY KEY,
        intent_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        error TEXT
      );
      CREATE TABLE IF NOT EXISTS code_host_syncs (
        id TEXT PRIMARY KEY,
        intent_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        status TEXT NOT NULL,
        remote_url TEXT,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS code_policies (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        policy_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS code_gate_runs (
        id TEXT PRIMARY KEY,
        intent_id TEXT NOT NULL,
        status TEXT NOT NULL,
        effective_risk TEXT NOT NULL,
        reasons_json TEXT NOT NULL,
        diff_summary_json TEXT NOT NULL,
        policy_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS code_gate_runs_intent_idx ON code_gate_runs(intent_id, created_at DESC);
    `);
  }

  init(): CodeRepositoryRecord {
    this.ensureLocalGitExcludes();
    this.ensurePolicy();
    const createdAt = nowIso();
    const originUrl = runGit(this.repoRoot, ["config", "--get", "remote.origin.url"], { allowFailure: true }) || null;
    const defaultBranch = runGit(this.repoRoot, ["branch", "--show-current"], { allowFailure: true }) || "main";
    const currentHead = runGit(this.repoRoot, ["rev-parse", "HEAD"]);
    const existing = this.db.prepare("SELECT * FROM code_repositories WHERE root_dir = ?").get(this.repoRoot) as CodeRepositoryRecord | undefined;
    const repo: CodeRepositoryRecord = {
      id: existing?.id ?? codeId("repo"),
      rootDir: this.repoRoot,
      originUrl,
      defaultBranch,
      currentHead,
      createdAt: existing?.createdAt ?? createdAt,
      updatedAt: createdAt,
    };
    this.db.prepare(`
      INSERT INTO code_repositories (id, root_dir, origin_url, default_branch, current_head, created_at, updated_at)
      VALUES (@id, @rootDir, @originUrl, @defaultBranch, @currentHead, @createdAt, @updatedAt)
      ON CONFLICT(root_dir) DO UPDATE SET
        origin_url = excluded.origin_url,
        default_branch = excluded.default_branch,
        current_head = excluded.current_head,
        updated_at = excluded.updated_at
    `).run(repo);
    return repo;
  }

  repository(): CodeRepositoryRecord {
    return this.init();
  }

  listIntents(options: { status?: CodeIntentStatus } = {}): CodeIntentRecord[] {
    const repo = this.repository();
    const rows = options.status
      ? this.db.prepare("SELECT * FROM code_intents WHERE repo_id = ? AND status = ? ORDER BY created_at DESC").all(repo.id, options.status)
      : this.db.prepare("SELECT * FROM code_intents WHERE repo_id = ? ORDER BY created_at DESC").all(repo.id);
    return (rows as SqliteCodeIntentRow[]).map(mapIntent);
  }

  getIntent(intentId: string): CodeIntentRecord | null {
    const row = this.db.prepare("SELECT * FROM code_intents WHERE id = ?").get(intentId) as SqliteCodeIntentRow | undefined;
    return row ? mapIntent(row) : null;
  }

  showIntent(intentId: string): CodeIntentDetail {
    const intent = this.requireIntent(intentId);
    return {
      intent,
      reservations: this.listReservations(intent.id),
      evidence: this.listEvidence(intent.id),
      checks: this.listChecks(intent.id),
      reviews: this.listReviews(intent.id),
      queue: this.getQueue(intent.id),
      hostSyncs: this.listHostSyncs(intent.id),
      gateRuns: this.listGateRuns(intent.id),
      latestGate: this.latestGate(intent.id),
    };
  }

  status(): { repository: CodeRepositoryRecord; intents: CodeIntentRecord[]; blocked: CodeIntentRecord[]; queued: CodeQueueRecord[]; gates: Record<string, CodeGateRunRecord | null> } {
    const repository = this.repository();
    const intents = this.listIntents();
    return {
      repository,
      intents,
      blocked: this.listIntents({ status: "blocked" }),
      queued: (this.db.prepare("SELECT * FROM code_queue WHERE status = 'queued' ORDER BY created_at ASC").all() as SqliteQueueRow[]).map(mapQueue),
      gates: Object.fromEntries(intents.map((intent) => [intent.id, this.latestGate(intent.id)])),
    };
  }

  policy(): CodePolicyRecord {
    return this.readPolicy();
  }

  validatePolicy(): CodePolicyRecord {
    return this.readPolicy();
  }

  setPolicy(input: CodeIntegrationPolicy | Record<string, unknown>): CodePolicyRecord {
    const policy = normalizePolicy(input);
    const policyPath = resolvePolicyPath(this.repoRoot);
    fs.writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`);
    return this.cachePolicy(policy, policyPath);
  }

  start(input: CodeStartInput): CodeIntentDetail {
    const repo = this.repository();
    const kind = assertChangeKind(input.kind);
    const scope = input.scope.trim();
    const title = input.title.trim();
    if (!scope) throw new Error("scope is required");
    if (!title) throw new Error("title is required");

    const baseBranch = input.baseBranch?.trim() || runGit(this.repoRoot, ["branch", "--show-current"], { allowFailure: true }) || repo.defaultBranch;
    const baseSha = runGit(this.repoRoot, ["rev-parse", baseBranch]);
    const id = codeId("intent");
    const branch = `code/${kind}/${slugify(scope)}/${slugify(title)}`;
    const worktreeRoot = path.join(path.dirname(this.repoRoot), `${path.basename(this.repoRoot)}.code-worktrees`);
    const worktreePath = path.join(worktreeRoot, id);
    const timestamp = nowIso();

    const reservations = [
      { kind: "scope" as const, value: scope },
      ...normalizePathList(input.paths).map((value) => ({ kind: "path" as const, value })),
    ];
    this.assertNoReservationConflict(repo.id, id, reservations);

    runGit(this.repoRoot, ["worktree", "add", "-b", branch, worktreePath, baseSha]);

    const intent: CodeIntentRecord = {
      id,
      repoId: repo.id,
      kind,
      scope,
      title,
      summary: input.summary?.trim() || null,
      status: "open",
      risk: assertRisk(input.risk),
      agentId: input.agentId?.trim() || "operator",
      branch,
      baseBranch,
      baseSha,
      worktreePath,
      createdAt: timestamp,
      updatedAt: timestamp,
      queuedAt: null,
      integratedAt: null,
      commitSha: null,
      integrationSha: null,
      hostUrl: null,
    };

    this.db.prepare(`
      INSERT INTO code_intents (
        id, repo_id, kind, scope, title, summary, status, risk, agent_id, branch, base_branch, base_sha,
        worktree_path, created_at, updated_at, queued_at, integrated_at, commit_sha, integration_sha, host_url
      ) VALUES (
        @id, @repoId, @kind, @scope, @title, @summary, @status, @risk, @agentId, @branch, @baseBranch, @baseSha,
        @worktreePath, @createdAt, @updatedAt, @queuedAt, @integratedAt, @commitSha, @integrationSha, @hostUrl
      )
    `).run(intent);
    this.reserve({ intentId: id, scopes: [scope], paths: input.paths });
    return this.showIntent(id);
  }

  reserve(input: CodeReserveInput): CodeReservationRecord[] {
    const intent = this.requireIntent(input.intentId);
    const requested = [
      ...(input.scopes ?? []).map((value) => ({ kind: "scope" as const, value: value.trim() })),
      ...normalizePathList(input.paths).map((value) => ({ kind: "path" as const, value })),
    ].filter((entry) => entry.value);
    this.assertNoReservationConflict(intent.repoId, intent.id, requested);

    const timestamp = nowIso();
    const insert = this.db.prepare(`
      INSERT INTO code_reservations (id, intent_id, repo_id, kind, value, status, created_at, released_at)
      VALUES (@id, @intentId, @repoId, @kind, @value, 'active', @createdAt, NULL)
    `);
    for (const reservation of requested) {
      const existing = this.db.prepare(`
        SELECT * FROM code_reservations
        WHERE intent_id = ? AND kind = ? AND value = ? AND status = 'active'
      `).get(intent.id, reservation.kind, reservation.value);
      if (existing) continue;
      insert.run({
        id: codeId("res"),
        intentId: intent.id,
        repoId: intent.repoId,
        kind: reservation.kind,
        value: reservation.value,
        createdAt: timestamp,
      });
    }
    return this.listReservations(intent.id);
  }

  addEvidence(input: CodeEvidenceInput): CodeEvidenceRecord {
    const intent = this.requireIntent(input.intentId);
    const label = input.label.trim();
    if (!label) throw new Error("evidence label is required");
    const record = {
      id: codeId("evidence"),
      intentId: intent.id,
      kind: input.kind?.trim() || "artifact",
      label,
      path: input.path?.trim() || null,
      url: input.url?.trim() || null,
      metadataJson: JSON.stringify(input.metadata ?? {}),
      createdAt: nowIso(),
    };
    this.db.prepare(`
      INSERT INTO code_evidence (id, intent_id, kind, label, path, url, metadata_json, created_at)
      VALUES (@id, @intentId, @kind, @label, @path, @url, @metadataJson, @createdAt)
    `).run(record);
    return this.listEvidence(intent.id).find((item) => item.id === record.id)!;
  }

  recordCheck(input: CodeCheckRecordInput): CodeCheckRecord {
    const intent = this.requireIntent(input.intentId);
    if (input.status !== "passed" && input.status !== "failed") throw new Error("check status must be passed or failed");
    const name = input.name.trim();
    if (!name) throw new Error("check name is required");
    const record = {
      id: codeId("check"),
      intentId: intent.id,
      name,
      status: input.status,
      command: input.command?.trim() || null,
      exitCode: input.exitCode ?? null,
      output: input.output ?? null,
      createdAt: nowIso(),
    };
    this.db.prepare(`
      INSERT INTO code_checks (id, intent_id, name, status, command, exit_code, output, created_at)
      VALUES (@id, @intentId, @name, @status, @command, @exitCode, @output, @createdAt)
    `).run(record);
    return this.listChecks(intent.id).find((item) => item.id === record.id)!;
  }

  runCheck(input: CodeCheckRunInput): CodeCheckRecord {
    const intent = this.requireIntent(input.intentId);
    const result = runShell(intent.worktreePath, input.command);
    return this.recordCheck({
      intentId: intent.id,
      name: input.name,
      status: result.status,
      command: input.command,
      exitCode: result.exitCode,
      output: result.output,
    });
  }

  gate(intentId: string): CodeGateRunRecord {
    const intent = this.requireIntent(intentId);
    const policy = this.readPolicy().policy;
    const checks = this.listChecks(intent.id);
    const evidence = this.listEvidence(intent.id);
    const reviews = this.listReviews(intent.id);
    const hostSyncs = this.listHostSyncs(intent.id);
    const diffSummary = this.diffSummary(intent);
    const reasons: string[] = [];
    let effectiveRisk = riskRank(intent.risk);

    if (!intent.commitSha) reasons.push("Integration requires a committed intent");

    const currentBaseSha = runGit(this.repoRoot, ["rev-parse", intent.baseBranch], { allowFailure: true });
    if (policy.merge.requireFreshBase && currentBaseSha && currentBaseSha !== intent.baseSha) {
      reasons.push(`Base branch is stale: ${intent.baseBranch}`);
      effectiveRisk = Math.max(effectiveRisk, 1);
    }
    if (policy.merge.requireCleanSimulation && intent.commitSha && !this.mergeSimulationPasses(intent)) {
      reasons.push("Merge simulation failed");
      effectiveRisk = Math.max(effectiveRisk, 2);
    }

    const latestByName = new Map<string, CodeCheckRecord>();
    for (const check of checks) latestByName.set(check.name, check);
    const latestChecks = [...latestByName.values()];
    if (policy.checks.requireAtLeastOnePassed && !latestChecks.some((check) => check.status === "passed")) {
      reasons.push("Integration requires at least one passed check");
    }
    for (const name of policy.checks.requiredNames) {
      const check = latestByName.get(name);
      if (!check) reasons.push(`Missing required check: ${name}`);
      else if (check.status !== "passed") reasons.push(`Integration blocked by failed checks: ${name}`);
    }
    const failedChecks = checks.filter((check) => check.status === "failed");
    if (failedChecks.length > 0) effectiveRisk = Math.max(effectiveRisk, 1);

    const criticalPaths = diffSummary.changedFiles.filter((file) => policy.risk.criticalPaths.some((critical) => pathMatchesPolicy(file, critical)));
    if (criticalPaths.length > 0) effectiveRisk = Math.max(effectiveRisk, 2);
    if (diffSummary.additions + diffSummary.deletions >= policy.risk.largeDiffThreshold) effectiveRisk = Math.max(effectiveRisk, 2);
    if (diffSummary.deletedFiles.length > 0) effectiveRisk = Math.max(effectiveRisk, 1);
    if (hostSyncs.some((sync) => sync.status === "failed")) effectiveRisk = Math.max(effectiveRisk, 1);

    const effectiveRiskValue = riskFromRank(effectiveRisk);
    const minimumEvidence = Math.max(
      policy.evidence.minimumByKind[intent.kind] ?? 0,
      effectiveRiskValue === "high" ? policy.evidence.highRiskMinimum : 0,
    );
    if (evidence.length < minimumEvidence) reasons.push(`Integration requires at least ${minimumEvidence} evidence item(s)`);

    const latestFailureAt = failedChecks.reduce<string | null>((latest, check) => latest && latest > check.createdAt ? latest : check.createdAt, null);
    const latestReview = reviews[reviews.length - 1];
    if (!latestReview || latestReview.decision !== "approved") {
      reasons.push("Integration requires an approved review");
    } else if (latestFailureAt && latestReview.createdAt <= latestFailureAt) {
      reasons.push("Integration requires a review after the latest failed check");
    }
    if (policy.risk.requireHumanReviewForHighRisk && effectiveRiskValue === "high" && !reviews.some((review) => review.decision === "approved" && isHumanReviewer(review, intent))) {
      reasons.push("High risk integration requires human review");
    }

    if (policy.host.requireSynced && !hostSyncs.some((sync) => sync.status === "synced")) {
      reasons.push("Integration requires host sync");
    }

    return this.insertGateRun({
      intentId: intent.id,
      status: reasons.length === 0 ? "passed" : "failed",
      effectiveRisk: effectiveRiskValue,
      reasons,
      diffSummary,
      policy,
    });
  }

  review(input: CodeReviewInput): CodeReviewRecord {
    const intent = this.requireIntent(input.intentId);
    const reviewer = input.reviewer.trim();
    if (!reviewer) throw new Error("reviewer is required");
    const record = {
      id: codeId("review"),
      intentId: intent.id,
      reviewer,
      decision: input.decision,
      reason: input.reason?.trim() || null,
      createdAt: nowIso(),
    };
    if (record.decision !== "approved" && record.decision !== "rejected") {
      throw new Error("review decision must be approved or rejected");
    }
    this.db.prepare(`
      INSERT INTO code_reviews (id, intent_id, reviewer, decision, reason, created_at)
      VALUES (@id, @intentId, @reviewer, @decision, @reason, @createdAt)
    `).run(record);
    return this.listReviews(intent.id).find((item) => item.id === record.id)!;
  }

  commit(intentId: string): CodeCommitResult {
    const intent = this.requireIntent(intentId);
    if (intent.status === "integrated" || intent.status === "cancelled") {
      throw new Error(`Cannot commit intent with status ${intent.status}`);
    }
    const checks = this.listChecks(intent.id);
    const evidence = this.listEvidence(intent.id);
    const reviews = this.listReviews(intent.id).filter((review) => review.decision === "approved");
    const message = this.buildCommitMessage(intent, checks, evidence, reviews[0]);
    runGit(intent.worktreePath, ["add", "-A"]);
    const staged = runGit(intent.worktreePath, ["diff", "--cached", "--name-only"]);
    if (!staged) throw new Error("No staged changes to commit");
    runGit(intent.worktreePath, [
      "-c", "user.name=ClawJS Code",
      "-c", "user.email=code@clawjs.local",
      "commit",
      "-m", message,
    ]);
    const commitSha = runGit(intent.worktreePath, ["rev-parse", "HEAD"]);
    const updated = this.updateIntent(intent.id, { commit_sha: commitSha, updated_at: nowIso() });
    return { intent: updated, commitSha, message };
  }

  queue(intentId: string): CodeQueueRecord {
    const intent = this.requireIntent(intentId);
    this.assertGatePassed(intent);
    const timestamp = nowIso();
    const existing = this.getQueue(intent.id);
    if (existing) {
      this.db.prepare("UPDATE code_queue SET status = 'queued', updated_at = ?, error = NULL WHERE intent_id = ?").run(timestamp, intent.id);
    } else {
      this.db.prepare(`
        INSERT INTO code_queue (id, intent_id, status, created_at, updated_at, error)
        VALUES (?, ?, 'queued', ?, ?, NULL)
      `).run(codeId("queue"), intent.id, timestamp, timestamp);
    }
    this.updateIntent(intent.id, { status: "queued", queued_at: timestamp, updated_at: timestamp });
    return this.getQueue(intent.id)!;
  }

  integrate(intentId: string): CodeIntegrateResult {
    const intent = this.requireIntent(intentId);
    const queue = this.getQueue(intent.id) ?? this.queue(intent.id);
    this.assertGatePassed(intent);
    this.assertRepoClean();
    const timestamp = nowIso();
    try {
      runGit(this.repoRoot, ["checkout", intent.baseBranch]);
      runGit(this.repoRoot, ["merge", "--ff-only", intent.branch]);
      const integrationSha = runGit(this.repoRoot, ["rev-parse", "HEAD"]);
      this.db.prepare("UPDATE code_queue SET status = 'integrated', updated_at = ?, error = NULL WHERE intent_id = ?").run(timestamp, intent.id);
      const updated = this.updateIntent(intent.id, {
        status: "integrated",
        integrated_at: timestamp,
        integration_sha: integrationSha,
        updated_at: timestamp,
      });
      this.releaseReservations(intent.id);
      return { intent: updated, queue: { ...queue, status: "integrated", updatedAt: timestamp, error: null }, integrationSha };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.db.prepare("UPDATE code_queue SET status = 'failed', updated_at = ?, error = ? WHERE intent_id = ?").run(timestamp, message, intent.id);
      throw error;
    }
  }

  syncGithub(input: CodeSyncGithubInput): CodeHostSyncRecord {
    const intent = this.requireIntent(input.intentId);
    const payload = {
      provider: "github",
      title: `${intent.kind}(${intent.scope}): ${intent.title}`,
      head: intent.branch,
      base: input.base ?? intent.baseBranch,
      body: this.buildHostBody(intent),
      repo: input.repo ?? null,
    };
    const timestamp = nowIso();
    if (input.dryRun) {
      return this.insertHostSync(intent.id, "github", "planned", null, payload, timestamp);
    }
    const args = [
      "pr", "create",
      "--draft",
      "--title", payload.title,
      "--body", payload.body,
      "--base", payload.base,
      "--head", payload.head,
    ];
    if (payload.repo) args.push("--repo", payload.repo);
    const result = spawnSync("gh", args, { cwd: this.repoRoot, encoding: "utf8" });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    if (result.status !== 0) {
      return this.insertHostSync(intent.id, "github", "failed", null, { ...payload, error: output }, timestamp);
    }
    const remoteUrl = output.split(/\s+/).find((part) => part.startsWith("http")) ?? output;
    this.updateIntent(intent.id, { host_url: remoteUrl, updated_at: timestamp });
    return this.insertHostSync(intent.id, "github", "synced", remoteUrl, payload, timestamp);
  }

  private requireIntent(intentId: string): CodeIntentRecord {
    const intent = this.getIntent(intentId);
    if (!intent) throw new Error(`Code intent not found: ${intentId}`);
    return intent;
  }

  private ensureLocalGitExcludes(): void {
    const excludePath = path.join(this.repoRoot, ".git", "info", "exclude");
    try {
      const current = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, "utf8") : "";
      const lines = current.split(/\r?\n/);
      if (lines.includes(".claw/")) return;
      fs.mkdirSync(path.dirname(excludePath), { recursive: true });
      fs.writeFileSync(excludePath, `${current.replace(/\s*$/, "")}\n.claw/\n`);
    } catch {
      // A missing local exclude should not block use in unusual Git layouts.
    }
  }

  private listReservations(intentId: string): CodeReservationRecord[] {
    return (this.db.prepare("SELECT * FROM code_reservations WHERE intent_id = ? ORDER BY created_at ASC").all(intentId) as SqliteReservationRow[]).map(mapReservation);
  }

  private listEvidence(intentId: string): CodeEvidenceRecord[] {
    return (this.db.prepare("SELECT * FROM code_evidence WHERE intent_id = ? ORDER BY created_at ASC").all(intentId) as SqliteEvidenceRow[]).map(mapEvidence);
  }

  private listChecks(intentId: string): CodeCheckRecord[] {
    return (this.db.prepare("SELECT * FROM code_checks WHERE intent_id = ? ORDER BY created_at ASC").all(intentId) as SqliteCheckRow[]).map(mapCheck);
  }

  private listReviews(intentId: string): CodeReviewRecord[] {
    return (this.db.prepare("SELECT * FROM code_reviews WHERE intent_id = ? ORDER BY created_at ASC").all(intentId) as SqliteReviewRow[]).map(mapReview);
  }

  private getQueue(intentId: string): CodeQueueRecord | null {
    const row = this.db.prepare("SELECT * FROM code_queue WHERE intent_id = ?").get(intentId) as SqliteQueueRow | undefined;
    return row ? mapQueue(row) : null;
  }

  private listHostSyncs(intentId: string): CodeHostSyncRecord[] {
    return (this.db.prepare("SELECT * FROM code_host_syncs WHERE intent_id = ? ORDER BY created_at ASC").all(intentId) as SqliteHostSyncRow[]).map(mapHostSync);
  }

  private listGateRuns(intentId: string): CodeGateRunRecord[] {
    return (this.db.prepare("SELECT * FROM code_gate_runs WHERE intent_id = ? ORDER BY created_at ASC").all(intentId) as SqliteGateRunRow[]).map(mapGateRun);
  }

  private latestGate(intentId: string): CodeGateRunRecord | null {
    const row = this.db.prepare("SELECT * FROM code_gate_runs WHERE intent_id = ? ORDER BY created_at DESC LIMIT 1").get(intentId) as SqliteGateRunRow | undefined;
    return row ? mapGateRun(row) : null;
  }

  private ensurePolicy(): CodePolicyRecord {
    const policyPath = resolvePolicyPath(this.repoRoot);
    if (!fs.existsSync(policyPath)) {
      fs.writeFileSync(policyPath, `${JSON.stringify(DEFAULT_CODE_POLICY, null, 2)}\n`);
    }
    return this.readPolicy();
  }

  private readPolicy(): CodePolicyRecord {
    const policyPath = resolvePolicyPath(this.repoRoot);
    const policy = fs.existsSync(policyPath) ? normalizePolicy(readJsonObjectFile(policyPath)) : DEFAULT_CODE_POLICY;
    return this.cachePolicy(policy, policyPath);
  }

  private cachePolicy(policy: CodeIntegrationPolicy, policyPath: string): CodePolicyRecord {
    const timestamp = nowIso();
    this.db.prepare(`
      INSERT INTO code_policies (id, path, policy_json, updated_at)
      VALUES ('default', ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        path = excluded.path,
        policy_json = excluded.policy_json,
        updated_at = excluded.updated_at
    `).run(policyPath, JSON.stringify(policy), timestamp);
    const row = this.db.prepare("SELECT * FROM code_policies WHERE id = 'default'").get() as SqliteCodePolicyRow;
    return { path: row.path, policy: normalizePolicy(safeJsonParse(row.policy_json)), updatedAt: row.updated_at };
  }

  private diffSummary(intent: CodeIntentRecord): CodeDiffSummary {
    if (!intent.commitSha) return { filesChanged: 0, additions: 0, deletions: 0, deletedFiles: [], changedFiles: [] };
    const numstat = runGit(this.repoRoot, ["diff", "--numstat", `${intent.baseSha}..${intent.commitSha}`], { allowFailure: true });
    const nameStatus = runGit(this.repoRoot, ["diff", "--name-status", `${intent.baseSha}..${intent.commitSha}`], { allowFailure: true });
    let additions = 0;
    let deletions = 0;
    const changedFiles = new Set<string>();
    for (const line of numstat.split(/\r?\n/).filter(Boolean)) {
      const [added, deleted, file] = line.split(/\t/);
      additions += Number(added) || 0;
      deletions += Number(deleted) || 0;
      if (file) changedFiles.add(file);
    }
    const deletedFiles: string[] = [];
    for (const line of nameStatus.split(/\r?\n/).filter(Boolean)) {
      const [status, file] = line.split(/\t/);
      if (file) changedFiles.add(file);
      if (status === "D" && file) deletedFiles.push(file);
    }
    return {
      filesChanged: changedFiles.size,
      additions,
      deletions,
      deletedFiles,
      changedFiles: [...changedFiles].sort((left, right) => left.localeCompare(right)),
    };
  }

  private mergeSimulationPasses(intent: CodeIntentRecord): boolean {
    const head = intent.commitSha ?? intent.branch;
    const result = spawnSync("git", ["merge-tree", "--write-tree", intent.baseBranch, head], { cwd: this.repoRoot, encoding: "utf8" });
    if (result.status === 0) return true;
    const fallback = spawnSync("git", ["merge-tree", intent.baseSha, intent.baseBranch, head], { cwd: this.repoRoot, encoding: "utf8" });
    const output = `${fallback.stdout ?? ""}${fallback.stderr ?? ""}`;
    return fallback.status === 0 && !output.includes("<<<<<<<") && !output.includes("changed in both");
  }

  private insertGateRun(input: {
    intentId: string;
    status: CodeGateStatus;
    effectiveRisk: CodeRisk;
    reasons: string[];
    diffSummary: CodeDiffSummary;
    policy: CodeIntegrationPolicy;
  }): CodeGateRunRecord {
    const id = codeId("gate");
    const timestamp = nowIso();
    this.db.prepare(`
      INSERT INTO code_gate_runs (id, intent_id, status, effective_risk, reasons_json, diff_summary_json, policy_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.intentId, input.status, input.effectiveRisk, JSON.stringify(input.reasons), JSON.stringify(input.diffSummary), JSON.stringify(input.policy), timestamp);
    return this.latestGate(input.intentId)!;
  }

  private assertNoReservationConflict(repoId: string, intentId: string, requested: Array<{ kind: "scope" | "path"; value: string }>): void {
    const active = (this.db.prepare(`
      SELECT * FROM code_reservations
      WHERE repo_id = ? AND status = 'active' AND intent_id != ?
    `).all(repoId, intentId) as SqliteReservationRow[]).map(mapReservation);
    const conflicts = active.filter((reservation) => requested.some((candidate) => reservationOverlaps(reservation, candidate)));
    if (conflicts.length > 0) {
      const summary = conflicts.map((conflict) => `${conflict.kind}:${conflict.value}`).join(", ");
      throw new Error(`Code reservation conflict: ${summary}`);
    }
  }

  private updateIntent(intentId: string, patch: Record<string, string | null>): CodeIntentRecord {
    const entries = Object.entries(patch);
    if (entries.length === 0) return this.requireIntent(intentId);
    const assignments = entries.map(([key]) => `${key} = ?`).join(", ");
    this.db.prepare(`UPDATE code_intents SET ${assignments} WHERE id = ?`).run(...entries.map(([, value]) => value), intentId);
    return this.requireIntent(intentId);
  }

  private releaseReservations(intentId: string): void {
    const timestamp = nowIso();
    this.db.prepare("UPDATE code_reservations SET status = 'released', released_at = ? WHERE intent_id = ? AND status = 'active'").run(timestamp, intentId);
  }

  private assertRepoClean(): void {
    const porcelain = runGit(this.repoRoot, ["status", "--porcelain"]);
    const dirty = porcelain.split(/\r?\n/).filter((line) => line.trim() && line.trim() !== `?? ${DEFAULT_CODE_POLICY_FILE}`);
    if (dirty.length > 0) throw new Error("Repository root has uncommitted changes; integration requires a clean root worktree");
  }

  private assertGatePassed(intent: CodeIntentRecord): void {
    const gate = this.gate(intent.id);
    if (gate.status !== "passed") {
      throw new Error(gate.reasons.join("; ") || "Integration gate failed");
    }
  }

  private buildCommitMessage(
    intent: CodeIntentRecord,
    checks: CodeCheckRecord[],
    evidence: CodeEvidenceRecord[],
    review?: CodeReviewRecord,
  ): string {
    const lines = [
      `${intent.kind}(${intent.scope}): ${intent.title}`,
      "",
      `Change-Intent: ${intent.id}`,
      `Agent: ${intent.agentId}`,
      `Risk: ${intent.risk}`,
      `Checks: ${checks.length > 0 ? checks.map((check) => `${check.name}:${check.status}`).join(", ") : "none"}`,
      `Evidence: ${evidence.length > 0 ? evidence.map((item) => item.id).join(", ") : "none"}`,
      `Review: ${review?.id ?? "none"}`,
    ];
    return lines.join("\n");
  }

  private buildHostBody(intent: CodeIntentRecord): string {
    const detail = this.showIntent(intent.id);
    return [
      `Change intent: ${intent.id}`,
      `Kind: ${intent.kind}`,
      `Scope: ${intent.scope}`,
      `Risk: ${intent.risk}`,
      "",
      "Checks:",
      ...(detail.checks.length > 0 ? detail.checks.map((check) => `- ${check.name}: ${check.status}`) : ["- none"]),
      "",
      "Evidence:",
      ...(detail.evidence.length > 0 ? detail.evidence.map((item) => `- ${item.label}`) : ["- none"]),
    ].join("\n");
  }

  private insertHostSync(
    intentId: string,
    provider: CodeHostProvider,
    status: CodeHostSyncRecord["status"],
    remoteUrl: string | null,
    payload: Record<string, unknown>,
    timestamp: string,
  ): CodeHostSyncRecord {
    const id = codeId("sync");
    this.db.prepare(`
      INSERT INTO code_host_syncs (id, intent_id, provider, status, remote_url, payload_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, intentId, provider, status, remoteUrl, JSON.stringify(payload), timestamp, timestamp);
    return this.listHostSyncs(intentId).find((sync) => sync.id === id)!;
  }
}

export class CodeGlobalIndex {
  readonly rootDir: string;
  readonly databasePath: string;
  private readonly db: Database.Database;

  constructor(options: CreateCodeGlobalIndexOptions = {}) {
    this.rootDir = resolveGlobalRootDir(options.rootDir);
    this.databasePath = resolveGlobalDatabasePath(options.rootDir);
    fs.mkdirSync(path.dirname(this.databasePath), { recursive: true });
    this.db = new Database(this.databasePath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS code_projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_dir TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        origin_url TEXT,
        default_branch TEXT,
        current_head TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_sync_at TEXT
      );
      CREATE INDEX IF NOT EXISTS code_projects_status_idx ON code_projects(status, updated_at DESC);
      CREATE TABLE IF NOT EXISTS code_agents (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        status TEXT NOT NULL,
        project_id TEXT,
        intent_id TEXT,
        worktree_path TEXT,
        heartbeat_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS code_agents_project_idx ON code_agents(project_id, status);
    `);
  }

  addProject(input: AddCodeProjectInput): CodeProjectRecord {
    const rootDir = discoverGitRoot(path.resolve(input.rootDir));
    const timestamp = nowIso();
    const existingByRoot = this.db.prepare("SELECT * FROM code_projects WHERE root_dir = ?").get(rootDir) as SqliteCodeProjectRow | undefined;
    const id = input.id?.trim() || existingByRoot?.id || this.uniqueProjectId(slugify(input.name || path.basename(rootDir)));
    const metadata = this.readProjectMetadata(rootDir);
    const status = fs.existsSync(resolveDatabasePath(rootDir)) ? "active" : "uninitialized";
    const record = {
      id,
      name: input.name?.trim() || existingByRoot?.name || path.basename(rootDir),
      rootDir,
      status,
      originUrl: metadata.originUrl,
      defaultBranch: metadata.defaultBranch,
      currentHead: metadata.currentHead,
      createdAt: existingByRoot?.created_at ?? timestamp,
      updatedAt: timestamp,
      lastSyncAt: timestamp,
    };
    this.db.prepare(`
      INSERT INTO code_projects (id, name, root_dir, status, origin_url, default_branch, current_head, created_at, updated_at, last_sync_at)
      VALUES (@id, @name, @rootDir, @status, @originUrl, @defaultBranch, @currentHead, @createdAt, @updatedAt, @lastSyncAt)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        root_dir = excluded.root_dir,
        status = excluded.status,
        origin_url = excluded.origin_url,
        default_branch = excluded.default_branch,
        current_head = excluded.current_head,
        updated_at = excluded.updated_at,
        last_sync_at = excluded.last_sync_at
    `).run(record);
    return this.requireProject(id);
  }

  discoverProjects(input: DiscoverCodeProjectsInput): CodeProjectRecord[] {
    const rootDir = path.resolve(input.rootDir);
    const maxDepth = Math.max(0, input.maxDepth ?? 3);
    const roots: string[] = [];
    const visit = (dir: string, depth: number) => {
      if (depth > maxDepth) return;
      if (fs.existsSync(path.join(dir, ".git"))) {
        roots.push(dir);
        return;
      }
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        visit(path.join(dir, entry.name), depth + 1);
      }
    };
    visit(rootDir, 0);
    return roots.sort((left, right) => left.localeCompare(right)).map((repoRoot) => this.addProject({ rootDir: repoRoot }));
  }

  listProjects(): CodeProjectRecord[] {
    return (this.db.prepare("SELECT * FROM code_projects ORDER BY name ASC, id ASC").all() as SqliteCodeProjectRow[]).map(mapProject);
  }

  getProject(projectId: string): CodeProjectRecord | null {
    const row = this.db.prepare("SELECT * FROM code_projects WHERE id = ?").get(projectId) as SqliteCodeProjectRow | undefined;
    return row ? mapProject(row) : null;
  }

  requireProject(projectId: string): CodeProjectRecord {
    const project = this.getProject(projectId);
    if (!project) throw new Error(`Code project not found: ${projectId}`);
    return project;
  }

  removeProject(projectId: string): boolean {
    const result = this.db.prepare("DELETE FROM code_projects WHERE id = ?").run(projectId);
    return result.changes > 0;
  }

  syncProject(projectId: string): CodeProjectRecord {
    const project = this.requireProject(projectId);
    const timestamp = nowIso();
    if (!fs.existsSync(project.rootDir)) {
      this.db.prepare("UPDATE code_projects SET status = 'missing', updated_at = ?, last_sync_at = ? WHERE id = ?").run(timestamp, timestamp, project.id);
      return this.requireProject(project.id);
    }
    const metadata = this.readProjectMetadata(project.rootDir);
    const status: CodeProjectStatus = fs.existsSync(resolveDatabasePath(project.rootDir)) ? "active" : "uninitialized";
    if (status === "active") {
      const ledger = createCodeLedger({ repoDir: project.rootDir });
      ledger.status();
    }
    this.db.prepare(`
      UPDATE code_projects
      SET status = ?, origin_url = ?, default_branch = ?, current_head = ?, updated_at = ?, last_sync_at = ?
      WHERE id = ?
    `).run(status, metadata.originUrl, metadata.defaultBranch, metadata.currentHead, timestamp, timestamp, project.id);
    return this.requireProject(project.id);
  }

  syncAllProjects(): CodeProjectRecord[] {
    return this.listProjects().map((project) => this.syncProject(project.id));
  }

  projectLedger(projectId: string): CodeLedger {
    const project = this.requireProject(projectId);
    if (!fs.existsSync(project.rootDir)) throw new Error(`Code project is missing: ${projectId}`);
    return createCodeLedger({ repoDir: project.rootDir });
  }

  startIntent(projectId: string, input: CodeStartInput): CodeIntentDetail {
    const project = this.syncProject(projectId);
    const ledger = this.projectLedger(project.id);
    const detail = ledger.start(input);
    this.registerAgent({
      id: detail.intent.agentId,
      status: "working",
      projectId: project.id,
      intentId: detail.intent.id,
      worktreePath: detail.intent.worktreePath,
    });
    this.syncProject(project.id);
    return detail;
  }

  listIntents(options: { projectId?: string; agentId?: string; status?: CodeIntentStatus } = {}): CodeGlobalIntentRecord[] {
    const projects = options.projectId ? [this.syncProject(options.projectId)] : this.syncAllProjects();
    const intents: CodeGlobalIntentRecord[] = [];
    for (const project of projects) {
      if (project.status !== "active") continue;
      const ledger = createCodeLedger({ repoDir: project.rootDir });
      for (const intent of ledger.listIntents({ ...(options.status ? { status: options.status } : {}) })) {
        if (options.agentId && intent.agentId !== options.agentId) continue;
        const detail = ledger.showIntent(intent.id);
        intents.push({
          ...intent,
          projectId: project.id,
          projectName: project.name,
          projectRootDir: project.rootDir,
          latestGate: detail.latestGate,
        });
      }
    }
    return intents.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  showIntent(projectId: string, intentId: string): CodeIntentDetail & { project: CodeProjectRecord } {
    const project = this.syncProject(projectId);
    const detail = this.projectLedger(project.id).showIntent(intentId);
    return { ...detail, project };
  }

  listReservations(projectId?: string): CodeGlobalReservationRecord[] {
    const projects = projectId ? [this.syncProject(projectId)] : this.syncAllProjects();
    const reservations: CodeGlobalReservationRecord[] = [];
    for (const project of projects) {
      if (project.status !== "active") continue;
      const ledger = createCodeLedger({ repoDir: project.rootDir });
      for (const intent of ledger.listIntents()) {
        const detail = ledger.showIntent(intent.id);
        reservations.push(...detail.reservations.map((reservation) => ({
          ...reservation,
          projectId: project.id,
          projectName: project.name,
        })));
      }
    }
    return reservations;
  }

  listQueue(projectId?: string): CodeGlobalQueueRecord[] {
    const projects = projectId ? [this.syncProject(projectId)] : this.syncAllProjects();
    const queue: CodeGlobalQueueRecord[] = [];
    for (const project of projects) {
      if (project.status !== "active") continue;
      const ledger = createCodeLedger({ repoDir: project.rootDir });
      const status = ledger.status();
      queue.push(...status.queued.map((entry) => ({
        ...entry,
        projectId: project.id,
        projectName: project.name,
        intent: status.intents.find((intent) => intent.id === entry.intentId) ?? null,
        latestGate: status.gates[entry.intentId] ?? null,
      })));
    }
    return queue.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  queueIntent(projectId: string, intentId: string): CodeQueueRecord {
    const queue = this.projectLedger(projectId).queue(intentId);
    this.syncProject(projectId);
    return queue;
  }

  integrateIntent(projectId: string, intentId: string): CodeIntegrateResult {
    const result = this.projectLedger(projectId).integrate(intentId);
    this.syncProject(projectId);
    return result;
  }

  policy(projectId: string): CodePolicyRecord {
    return this.projectLedger(projectId).policy();
  }

  validatePolicy(projectId: string): CodePolicyRecord {
    return this.projectLedger(projectId).validatePolicy();
  }

  setPolicy(projectId: string, input: CodeIntegrationPolicy | Record<string, unknown>): CodePolicyRecord {
    const policy = this.projectLedger(projectId).setPolicy(input);
    this.syncProject(projectId);
    return policy;
  }

  gate(projectId: string, intentId: string): CodeGateRunRecord {
    const gate = this.projectLedger(projectId).gate(intentId);
    this.syncProject(projectId);
    return gate;
  }

  listGateRuns(projectId: string, intentId: string): CodeGateRunRecord[] {
    return this.projectLedger(projectId).showIntent(intentId).gateRuns;
  }

  addEvidence(projectId: string, input: CodeEvidenceInput): CodeEvidenceRecord {
    const evidence = this.projectLedger(projectId).addEvidence(input);
    this.syncProject(projectId);
    return evidence;
  }

  recordCheck(projectId: string, input: CodeCheckRecordInput): CodeCheckRecord {
    const check = this.projectLedger(projectId).recordCheck(input);
    this.syncProject(projectId);
    return check;
  }

  runCheck(projectId: string, input: CodeCheckRunInput): CodeCheckRecord {
    const check = this.projectLedger(projectId).runCheck(input);
    this.syncProject(projectId);
    return check;
  }

  review(projectId: string, input: CodeReviewInput): CodeReviewRecord {
    const review = this.projectLedger(projectId).review(input);
    this.syncProject(projectId);
    return review;
  }

  commit(projectId: string, intentId: string): CodeCommitResult {
    const result = this.projectLedger(projectId).commit(intentId);
    this.syncProject(projectId);
    return result;
  }

  syncGithub(projectId: string, input: CodeSyncGithubInput): CodeHostSyncRecord {
    const sync = this.projectLedger(projectId).syncGithub(input);
    this.syncProject(projectId);
    return sync;
  }

  registerAgent(input: RegisterCodeAgentInput): CodeAgentRecord {
    const id = input.id.trim();
    if (!id) throw new Error("agent id is required");
    const timestamp = nowIso();
    const existing = this.db.prepare("SELECT * FROM code_agents WHERE id = ?").get(id) as SqliteCodeAgentRow | undefined;
    const record = {
      id,
      label: input.label?.trim() || existing?.label || id,
      status: assertAgentStatus(input.status),
      projectId: input.projectId ?? existing?.project_id ?? null,
      intentId: input.intentId ?? existing?.intent_id ?? null,
      worktreePath: input.worktreePath ?? existing?.worktree_path ?? null,
      heartbeatAt: timestamp,
      createdAt: existing?.created_at ?? timestamp,
      updatedAt: timestamp,
    };
    this.db.prepare(`
      INSERT INTO code_agents (id, label, status, project_id, intent_id, worktree_path, heartbeat_at, created_at, updated_at)
      VALUES (@id, @label, @status, @projectId, @intentId, @worktreePath, @heartbeatAt, @createdAt, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        label = excluded.label,
        status = excluded.status,
        project_id = excluded.project_id,
        intent_id = excluded.intent_id,
        worktree_path = excluded.worktree_path,
        heartbeat_at = excluded.heartbeat_at,
        updated_at = excluded.updated_at
    `).run(record);
    return this.requireAgent(id);
  }

  heartbeatAgent(input: HeartbeatCodeAgentInput): CodeAgentRecord {
    const existing = this.getAgent(input.id);
    return this.registerAgent({
      id: input.id,
      label: existing?.label ?? input.id,
      status: input.status ?? existing?.status ?? "idle",
      projectId: input.projectId ?? existing?.projectId ?? null,
      intentId: input.intentId ?? existing?.intentId ?? null,
      worktreePath: input.worktreePath ?? existing?.worktreePath ?? null,
    });
  }

  listAgents(options: { offlineAfterMs?: number } = {}): CodeAgentRecord[] {
    const offlineAfterMs = options.offlineAfterMs ?? 60_000;
    return (this.db.prepare("SELECT * FROM code_agents ORDER BY updated_at DESC, id ASC").all() as SqliteCodeAgentRow[])
      .map(mapAgent)
      .map((agent) => {
        if (Date.now() - new Date(agent.heartbeatAt).getTime() > offlineAfterMs) {
          return { ...agent, status: "offline" };
        }
        return agent;
      });
  }

  getAgent(agentId: string): CodeAgentRecord | null {
    const row = this.db.prepare("SELECT * FROM code_agents WHERE id = ?").get(agentId) as SqliteCodeAgentRow | undefined;
    return row ? mapAgent(row) : null;
  }

  requireAgent(agentId: string): CodeAgentRecord {
    const agent = this.getAgent(agentId);
    if (!agent) throw new Error(`Code agent not found: ${agentId}`);
    return agent;
  }

  status(): CodeGlobalStatus {
    return {
      projects: this.syncAllProjects(),
      agents: this.listAgents(),
      intents: this.listIntents(),
      queued: this.listQueue(),
    };
  }

  private readProjectMetadata(rootDir: string): Pick<CodeProjectRecord, "originUrl" | "defaultBranch" | "currentHead"> {
    return {
      originUrl: runGit(rootDir, ["config", "--get", "remote.origin.url"], { allowFailure: true }) || null,
      defaultBranch: runGit(rootDir, ["branch", "--show-current"], { allowFailure: true }) || null,
      currentHead: runGit(rootDir, ["rev-parse", "HEAD"], { allowFailure: true }) || null,
    };
  }

  private uniqueProjectId(base: string): string {
    let candidate = base || "project";
    let index = 2;
    while (this.getProject(candidate)) {
      candidate = `${base}-${index}`;
      index += 1;
    }
    return candidate;
  }
}

export function createCodeGlobalIndex(options: CreateCodeGlobalIndexOptions = {}): CodeGlobalIndex {
  return new CodeGlobalIndex(options);
}

export async function startCodeServer(index: CodeGlobalIndex, options: CodeServeOptions = {}): Promise<CodeServerHandle> {
  const host = options.host || "127.0.0.1";
  const port = options.port ?? 0;
  const server = http.createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url || "/", `http://${request.headers.host || `${host}:${port}`}`);
      const parts = url.pathname.split("/").filter(Boolean);
      try {
        if (request.method === "GET" && url.pathname === "/v1/projects") {
          sendCodeJson(response, 200, { projects: index.listProjects() });
          return;
        }
        if (request.method === "POST" && url.pathname === "/v1/projects") {
          const body = await parseRequestJson(request);
          sendCodeJson(response, 200, { project: index.addProject({
            rootDir: stringInput(body, "rootDir") || stringInput(body, "path") || "",
            id: stringInput(body, "id"),
            name: stringInput(body, "name"),
          }) });
          return;
        }
        if (request.method === "POST" && url.pathname === "/v1/projects/discover") {
          const body = await parseRequestJson(request);
          sendCodeJson(response, 200, { projects: index.discoverProjects({
            rootDir: stringInput(body, "rootDir") || stringInput(body, "path") || "",
            maxDepth: typeof body.maxDepth === "number" ? body.maxDepth : undefined,
          }) });
          return;
        }
        if (request.method === "GET" && parts[0] === "v1" && parts[1] === "projects" && parts[2]) {
          sendCodeJson(response, 200, { project: index.requireProject(parts[2]) });
          return;
        }
        if (request.method === "GET" && url.pathname === "/v1/agents") {
          const offlineAfterMs = url.searchParams.get("offlineAfterMs");
          sendCodeJson(response, 200, { agents: index.listAgents({ ...(offlineAfterMs ? { offlineAfterMs: Number(offlineAfterMs) } : {}) }) });
          return;
        }
        if (request.method === "POST" && url.pathname === "/v1/agents/register") {
          const body = await parseRequestJson(request);
          sendCodeJson(response, 200, { agent: index.registerAgent({
            id: stringInput(body, "id") || "",
            label: stringInput(body, "label"),
            status: stringInput(body, "status") as CodeAgentStatus | undefined,
            projectId: stringInput(body, "projectId") ?? null,
            intentId: stringInput(body, "intentId") ?? null,
            worktreePath: stringInput(body, "worktreePath") ?? null,
          }) });
          return;
        }
        if (request.method === "POST" && url.pathname === "/v1/agents/heartbeat") {
          const body = await parseRequestJson(request);
          sendCodeJson(response, 200, { agent: index.heartbeatAgent({
            id: stringInput(body, "id") || "",
            status: stringInput(body, "status") as CodeAgentStatus | undefined,
            projectId: stringInput(body, "projectId") ?? null,
            intentId: stringInput(body, "intentId") ?? null,
            worktreePath: stringInput(body, "worktreePath") ?? null,
          }) });
          return;
        }
        if (request.method === "GET" && url.pathname === "/v1/intents") {
          sendCodeJson(response, 200, { intents: index.listIntents({
            projectId: url.searchParams.get("projectId") || undefined,
            agentId: url.searchParams.get("agentId") || undefined,
            status: (url.searchParams.get("status") || undefined) as CodeIntentStatus | undefined,
          }) });
          return;
        }
        if (request.method === "POST" && url.pathname === "/v1/intents") {
          const body = await parseRequestJson(request);
          const detail = index.startIntent(stringInput(body, "projectId") || "", {
            kind: stringInput(body, "kind") as CodeChangeKind,
            scope: stringInput(body, "scope") || "",
            title: stringInput(body, "title") || "",
            summary: stringInput(body, "summary"),
            risk: stringInput(body, "risk") as CodeRisk | undefined,
            agentId: stringInput(body, "agentId"),
            paths: listInput(body, "paths"),
          });
          sendCodeJson(response, 200, detail);
          return;
        }
        if (request.method === "GET" && url.pathname === "/v1/reservations") {
          sendCodeJson(response, 200, { reservations: index.listReservations(url.searchParams.get("projectId") || undefined) });
          return;
        }
        if (request.method === "GET" && url.pathname === "/v1/policy") {
          sendCodeJson(response, 200, { policy: index.policy(url.searchParams.get("projectId") || "") });
          return;
        }
        if (request.method === "PUT" && url.pathname === "/v1/policy") {
          const body = await parseRequestJson(request);
          const projectId = stringInput(body, "projectId") || "";
          const policyInput = body.policy && typeof body.policy === "object" && !Array.isArray(body.policy) ? body.policy as Record<string, unknown> : body;
          sendCodeJson(response, 200, { policy: index.setPolicy(projectId, policyInput) });
          return;
        }
        if (request.method === "POST" && url.pathname === "/v1/gate") {
          const body = await parseRequestJson(request);
          sendCodeJson(response, 200, { gate: index.gate(stringInput(body, "projectId") || "", stringInput(body, "intentId") || "") });
          return;
        }
        if (request.method === "GET" && url.pathname === "/v1/gates") {
          sendCodeJson(response, 200, { gates: index.listGateRuns(url.searchParams.get("projectId") || "", url.searchParams.get("intentId") || "") });
          return;
        }
        if (request.method === "GET" && url.pathname === "/v1/queue") {
          sendCodeJson(response, 200, { queue: index.listQueue(url.searchParams.get("projectId") || undefined) });
          return;
        }
        if (request.method === "POST" && url.pathname === "/v1/evidence") {
          const body = await parseRequestJson(request);
          sendCodeJson(response, 200, { evidence: index.addEvidence(stringInput(body, "projectId") || "", {
            intentId: stringInput(body, "intentId") || "",
            kind: stringInput(body, "kind"),
            label: stringInput(body, "label") || "",
            path: stringInput(body, "path"),
            url: stringInput(body, "url"),
          }) });
          return;
        }
        if (request.method === "POST" && url.pathname === "/v1/checks") {
          const body = await parseRequestJson(request);
          const projectId = stringInput(body, "projectId") || "";
          const command = stringInput(body, "command");
          const check = command
            ? index.runCheck(projectId, { intentId: stringInput(body, "intentId") || "", name: stringInput(body, "name") || "check", command })
            : index.recordCheck(projectId, {
              intentId: stringInput(body, "intentId") || "",
              name: stringInput(body, "name") || "check",
              status: stringInput(body, "status") as CodeCheckStatus,
            });
          sendCodeJson(response, 200, { check });
          return;
        }
        if (request.method === "POST" && url.pathname === "/v1/reviews") {
          const body = await parseRequestJson(request);
          sendCodeJson(response, 200, { review: index.review(stringInput(body, "projectId") || "", {
            intentId: stringInput(body, "intentId") || "",
            reviewer: stringInput(body, "reviewer") || "operator",
            decision: stringInput(body, "decision") as CodeReviewDecision,
            reason: stringInput(body, "reason"),
          }) });
          return;
        }
        if (request.method === "GET" && url.pathname === "/v1/status") {
          sendCodeJson(response, 200, index.status());
          return;
        }
        if (request.method === "POST" && url.pathname === "/v1/sync/github") {
          const body = await parseRequestJson(request);
          sendCodeJson(response, 200, { sync: index.syncGithub(stringInput(body, "projectId") || "", {
            intentId: stringInput(body, "intentId") || "",
            dryRun: boolInput(body, "dryRun") ?? true,
            repo: stringInput(body, "repo"),
            base: stringInput(body, "base"),
          }) });
          return;
        }
        sendCodeJson(response, 404, { error: "not_found" });
      } catch (error) {
        sendCodeJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
      }
    })();
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  return {
    url: `http://${host}:${actualPort}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

export function createCodeLedger(options: CreateCodeLedgerOptions = {}): CodeLedger {
  return new CodeLedger(options);
}

export function defaultCodeWorktreeParent(repoRoot: string): string {
  return path.join(path.dirname(repoRoot), `${path.basename(repoRoot)}.code-worktrees`);
}

export function createTemporaryCodeRepository(prefix = "clawjs-code-"): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  runGit(root, ["init"]);
  runGit(root, ["-c", "user.name=ClawJS Code", "-c", "user.email=code@clawjs.local", "commit", "--allow-empty", "-m", "chore(repo): initialize"]);
  return root;
}
