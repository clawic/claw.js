import fs from "fs";
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

export interface CodeIntentDetail {
  intent: CodeIntentRecord;
  reservations: CodeReservationRecord[];
  evidence: CodeEvidenceRecord[];
  checks: CodeCheckRecord[];
  reviews: CodeReviewRecord[];
  queue: CodeQueueRecord | null;
  hostSyncs: CodeHostSyncRecord[];
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

const CHANGE_KINDS = new Set<CodeChangeKind>(["fix", "feat", "refactor", "docs", "test", "chore"]);
const RISKS = new Set<CodeRisk>(["low", "medium", "high"]);

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
  return path.join(repoRoot, ".clawjs", "code", "code.sqlite");
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
    `);
  }

  init(): CodeRepositoryRecord {
    this.ensureLocalGitExcludes();
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
    };
  }

  status(): { repository: CodeRepositoryRecord; intents: CodeIntentRecord[]; blocked: CodeIntentRecord[]; queued: CodeQueueRecord[] } {
    const repository = this.repository();
    return {
      repository,
      intents: this.listIntents(),
      blocked: this.listIntents({ status: "blocked" }),
      queued: (this.db.prepare("SELECT * FROM code_queue WHERE status = 'queued' ORDER BY created_at ASC").all() as SqliteQueueRow[]).map(mapQueue),
    };
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
    this.assertIntegrationReady(intent);
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
    this.assertIntegrationReady(intent);
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
      if (lines.includes(".clawjs/")) return;
      fs.mkdirSync(path.dirname(excludePath), { recursive: true });
      fs.writeFileSync(excludePath, `${current.replace(/\s*$/, "")}\n.clawjs/\n`);
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
    if (porcelain) throw new Error("Repository root has uncommitted changes; integration requires a clean root worktree");
  }

  private assertIntegrationReady(intent: CodeIntentRecord): void {
    if (!intent.commitSha) throw new Error("Integration requires a committed intent");
    const checks = this.listChecks(intent.id);
    if (checks.length === 0) throw new Error("Integration requires at least one recorded check");
    const latestByName = new Map<string, CodeCheckRecord>();
    for (const check of checks) latestByName.set(check.name, check);
    const failed = [...latestByName.values()].filter((check) => check.status !== "passed");
    if (failed.length > 0) throw new Error(`Integration blocked by failed checks: ${failed.map((check) => check.name).join(", ")}`);
    const reviews = this.listReviews(intent.id);
    const latestReview = reviews[reviews.length - 1];
    if (!latestReview || latestReview.decision !== "approved") {
      throw new Error("Integration requires an approved review");
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
