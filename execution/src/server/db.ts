// @clawjs-persistent-surface-ddl-source
import { createHash } from "node:crypto";
import Database from "better-sqlite3";

import type {
  ArtifactRecord,
  ChangeRequestRecord,
  ChangeRequestReviewRecord,
  CodeAssetRecord,
  DeploymentCertificateRecord,
  DeploymentDomainRecord,
  DeploymentRecord,
  DeploymentReleaseRecord,
  NotebookDocument,
  NotebookSnapshotRecord,
  ProjectRecord,
  RepositoryRecord,
  RevisionRecord,
  RunLogRecord,
  RunRecord,
  RuntimeLanguage,
  WorkerRecord,
  WorkflowRecord,
} from "../shared/types.ts";
import { generateOpaqueToken, parseOpaqueToken } from "../shared/protocol.ts";

interface MembershipRow {
  user_id: string;
  tenant_id: string;
  role: "admin" | "user";
  scopes_json: string;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
}

function now(): number {
  return Date.now();
}

function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

function parseJsonObject<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export class ExecutionPlaneDatabase {
  readonly sqlite: Database.Database;

  constructor(filename: string) {
    this.sqlite = new Database(filename);
    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.pragma("foreign_keys = ON");
    this.init();
    this.seed();
  }

  close(): void {
    this.sqlite.close();
  }

  private init(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS memberships (
        user_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        role TEXT NOT NULL,
        scopes_json TEXT NOT NULL,
        PRIMARY KEY (user_id, tenant_id)
      );
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        token_id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL,
        user_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        scopes_json TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        revoked_at INTEGER,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS workers (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        label TEXT NOT NULL,
        workspace_root TEXT NOT NULL,
        runtimes_json TEXT NOT NULL,
        deploy_kinds_json TEXT NOT NULL,
        online INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (tenant_id, id)
      );
      CREATE TABLE IF NOT EXISTS worker_sessions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        worker_id TEXT NOT NULL,
        connected_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        disconnected_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS worker_capabilities (
        worker_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        capability TEXT NOT NULL,
        PRIMARY KEY (tenant_id, worker_id, capability)
      );
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS repositories (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        remote_url TEXT NOT NULL,
        default_branch TEXT NOT NULL,
        secret_ref TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS code_assets (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        repository_id TEXT NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        path TEXT NOT NULL,
        runtime TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS asset_revisions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        repository_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        base_ref TEXT NOT NULL,
        git_commit TEXT,
        content TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS notebook_cells (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        revision_id TEXT NOT NULL,
        ord INTEGER NOT NULL,
        runtime TEXT NOT NULL,
        label TEXT NOT NULL,
        code TEXT NOT NULL,
        last_output TEXT NOT NULL,
        status TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS notebook_snapshots (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL,
        revision_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS change_requests (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        repository_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        revision_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        target_branch TEXT NOT NULL,
        status TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS change_request_reviews (
        id TEXT PRIMARY KEY,
        change_request_id TEXT NOT NULL,
        reviewer TEXT NOT NULL,
        status TEXT NOT NULL,
        notes TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS revision_checks (
        id TEXT PRIMARY KEY,
        change_request_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        cron TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        enabled INTEGER NOT NULL,
        inputs_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        repository_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        revision_id TEXT NOT NULL,
        workflow_id TEXT,
        status TEXT NOT NULL,
        worker_id TEXT,
        target_cell_id TEXT,
        inputs_json TEXT NOT NULL,
        started_at INTEGER,
        finished_at INTEGER,
        exit_code INTEGER,
        output_text TEXT NOT NULL,
        error_text TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS run_logs (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        stream TEXT NOT NULL,
        line TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS run_terminal_sessions (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        transcript TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS run_artifacts (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        deployable_kind TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS deployments (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        artifact_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        environment TEXT NOT NULL,
        status TEXT NOT NULL,
        release_path TEXT NOT NULL,
        preview_url TEXT NOT NULL,
        active_domain TEXT NOT NULL,
        certificate_status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS deployment_releases (
        id TEXT PRIMARY KEY,
        deployment_id TEXT NOT NULL,
        artifact_id TEXT NOT NULL,
        version_label TEXT NOT NULL,
        path TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS deployment_domains (
        id TEXT PRIMARY KEY,
        deployment_id TEXT NOT NULL,
        domain TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS deployment_certificates (
        id TEXT PRIMARY KEY,
        deployment_id TEXT NOT NULL,
        domain TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS secret_bindings (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        secret_ref TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS environment_bindings (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        environment TEXT NOT NULL,
        values_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  private seed(): void {
    const timestamp = now();
    this.sqlite.prepare("INSERT OR IGNORE INTO tenants (id, name, created_at) VALUES (?, ?, ?)").run("demo-tenant", "Demo Tenant", timestamp);

    const insertUser = this.sqlite.prepare("INSERT OR IGNORE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)");
    insertUser.run("admin-user", "admin@execution.local", "fd77c5ab0ec65b64a4f95c4788d1b51ae2aeadeeb98eb2fd113fd4f0d2b46f01", timestamp);
    insertUser.run("normal-user", "user@execution.local", "b65025abc417091528452b8088349bcc8bc36e32231981168e66482fc67a59c7", timestamp);

    const insertMembership = this.sqlite.prepare(`
      INSERT OR IGNORE INTO memberships (user_id, tenant_id, role, scopes_json)
      VALUES (?, ?, ?, ?)
    `);
    insertMembership.run("admin-user", "demo-tenant", "admin", JSON.stringify(["*"]));
    insertMembership.run("normal-user", "demo-tenant", "user", JSON.stringify(["projects:read", "projects:write", "runs:write", "deployments:write"]));
  }

  getUserByEmail(email: string): { id: string; email: string; passwordHash: string } | null {
    const row = this.sqlite.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").get(email) as UserRow | undefined;
    return row ? { id: row.id, email: row.email, passwordHash: row.password_hash } : null;
  }

  getMembership(userId: string, tenantId: string): { role: "admin" | "user"; scopes: string[] } | null {
    const row = this.sqlite.prepare("SELECT user_id, tenant_id, role, scopes_json FROM memberships WHERE user_id = ? AND tenant_id = ?").get(userId, tenantId) as MembershipRow | undefined;
    return row ? { role: row.role, scopes: parseJsonArray(row.scopes_json) } : null;
  }

  createRefreshToken(input: {
    userId: string;
    tenantId: string;
    scopes: string[];
    ttlSec: number;
  }): string {
    const generated = generateOpaqueToken("ep_refresh");
    this.sqlite.prepare(`
      INSERT INTO refresh_tokens (token_id, token_hash, user_id, tenant_id, scopes_json, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      generated.tokenId,
      hashSecret(generated.secret),
      input.userId,
      input.tenantId,
      JSON.stringify(input.scopes),
      now() + input.ttlSec * 1000,
      now(),
    );
    return generated.token;
  }

  consumeRefreshToken(token: string): { userId: string; tenantId: string; scopes: string[] } | null {
    const parsed = parseOpaqueToken("ep_refresh", token);
    if (!parsed) return null;
    const row = this.sqlite.prepare(`
      SELECT token_hash, user_id, tenant_id, scopes_json, expires_at, revoked_at
      FROM refresh_tokens
      WHERE token_id = ?
    `).get(parsed.tokenId) as {
      token_hash: string;
      user_id: string;
      tenant_id: string;
      scopes_json: string;
      expires_at: number;
      revoked_at: number | null;
    } | undefined;
    if (!row) return null;
    if (row.revoked_at || row.expires_at < now()) return null;
    if (row.token_hash !== hashSecret(parsed.secret)) return null;
    this.sqlite.prepare("UPDATE refresh_tokens SET revoked_at = ? WHERE token_id = ?").run(now(), parsed.tokenId);
    return {
      userId: row.user_id,
      tenantId: row.tenant_id,
      scopes: parseJsonArray(row.scopes_json),
    };
  }

  revokeRefreshToken(token: string): void {
    const parsed = parseOpaqueToken("ep_refresh", token);
    if (!parsed) return;
    this.sqlite.prepare("UPDATE refresh_tokens SET revoked_at = ? WHERE token_id = ?").run(now(), parsed.tokenId);
  }

  upsertWorker(input: {
    tenantId: string;
    workerId: string;
    label: string;
    workspaceRoot: string;
    runtimes: RuntimeLanguage[];
    deployKinds: string[];
  }): WorkerRecord {
    const timestamp = now();
    this.sqlite.prepare(`
      INSERT INTO workers (id, tenant_id, label, workspace_root, runtimes_json, deploy_kinds_json, online, last_seen_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      ON CONFLICT (tenant_id, id) DO UPDATE SET
        label = excluded.label,
        workspace_root = excluded.workspace_root,
        runtimes_json = excluded.runtimes_json,
        deploy_kinds_json = excluded.deploy_kinds_json,
        online = 1,
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at
    `).run(input.workerId, input.tenantId, input.label, input.workspaceRoot, JSON.stringify(input.runtimes), JSON.stringify(input.deployKinds), timestamp, timestamp, timestamp);
    return this.getWorker(input.tenantId, input.workerId)!;
  }

  markWorkerSeen(tenantId: string, workerId: string): void {
    this.sqlite.prepare("UPDATE workers SET online = 1, last_seen_at = ?, updated_at = ? WHERE tenant_id = ? AND id = ?").run(now(), now(), tenantId, workerId);
  }

  markWorkerOffline(tenantId: string, workerId: string): void {
    this.sqlite.prepare("UPDATE workers SET online = 0, updated_at = ? WHERE tenant_id = ? AND id = ?").run(now(), tenantId, workerId);
  }

  getWorker(tenantId: string, workerId: string): WorkerRecord | null {
    const row = this.sqlite.prepare(`
      SELECT id, tenant_id, label, workspace_root, runtimes_json, deploy_kinds_json, online, last_seen_at, created_at, updated_at
      FROM workers WHERE tenant_id = ? AND id = ?
    `).get(tenantId, workerId) as {
      id: string; tenant_id: string; label: string; workspace_root: string; runtimes_json: string; deploy_kinds_json: string;
      online: number; last_seen_at: number; created_at: number; updated_at: number;
    } | undefined;
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenant_id,
      label: row.label,
      workspaceRoot: row.workspace_root,
      runtimesJson: row.runtimes_json,
      deployKindsJson: row.deploy_kinds_json,
      online: row.online,
      lastSeenAt: row.last_seen_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listWorkers(tenantId: string): WorkerRecord[] {
    const rows = this.sqlite.prepare(`
      SELECT id, tenant_id, label, workspace_root, runtimes_json, deploy_kinds_json, online, last_seen_at, created_at, updated_at
      FROM workers WHERE tenant_id = ? ORDER BY created_at DESC
    `).all(tenantId) as Array<{
      id: string; tenant_id: string; label: string; workspace_root: string; runtimes_json: string; deploy_kinds_json: string;
      online: number; last_seen_at: number; created_at: number; updated_at: number;
    }>;
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      label: row.label,
      workspaceRoot: row.workspace_root,
      runtimesJson: row.runtimes_json,
      deployKindsJson: row.deploy_kinds_json,
      online: row.online,
      lastSeenAt: row.last_seen_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  createProject(input: { tenantId: string; name: string; description?: string }): ProjectRecord {
    const timestamp = now();
    const id = `proj_${Math.random().toString(36).slice(2, 10)}`;
    this.sqlite.prepare(`
      INSERT INTO projects (id, tenant_id, name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, input.tenantId, input.name, input.description ?? "", timestamp, timestamp);
    return this.getProject(input.tenantId, id)!;
  }

  listProjects(tenantId: string): ProjectRecord[] {
    const rows = this.sqlite.prepare("SELECT * FROM projects WHERE tenant_id = ? ORDER BY created_at DESC").all(tenantId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      tenantId: String(row.tenant_id),
      name: String(row.name),
      description: String(row.description),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    }));
  }

  getProject(tenantId: string, projectId: string): ProjectRecord | null {
    const row = this.sqlite.prepare("SELECT * FROM projects WHERE tenant_id = ? AND id = ?").get(tenantId, projectId) as Record<string, unknown> | undefined;
    return row ? {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      name: String(row.name),
      description: String(row.description),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    } : null;
  }

  createRepository(input: {
    tenantId: string;
    projectId: string;
    name: string;
    remoteUrl: string;
    defaultBranch?: string;
    secretRef?: string;
  }): RepositoryRecord {
    const timestamp = now();
    const id = `repo_${Math.random().toString(36).slice(2, 10)}`;
    this.sqlite.prepare(`
      INSERT INTO repositories (id, tenant_id, project_id, name, remote_url, default_branch, secret_ref, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.tenantId, input.projectId, input.name, input.remoteUrl, input.defaultBranch ?? "main", input.secretRef ?? "", timestamp, timestamp);
    return this.getRepository(input.tenantId, id)!;
  }

  listRepositories(tenantId: string, projectId?: string): RepositoryRecord[] {
    const rows = projectId
      ? this.sqlite.prepare("SELECT * FROM repositories WHERE tenant_id = ? AND project_id = ? ORDER BY created_at DESC").all(tenantId, projectId)
      : this.sqlite.prepare("SELECT * FROM repositories WHERE tenant_id = ? ORDER BY created_at DESC").all(tenantId);
    return (rows as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      tenantId: String(row.tenant_id),
      projectId: String(row.project_id),
      name: String(row.name),
      remoteUrl: String(row.remote_url),
      defaultBranch: String(row.default_branch),
      secretRef: String(row.secret_ref),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    }));
  }

  getRepository(tenantId: string, repositoryId: string): RepositoryRecord | null {
    const row = this.sqlite.prepare("SELECT * FROM repositories WHERE tenant_id = ? AND id = ?").get(tenantId, repositoryId) as Record<string, unknown> | undefined;
    return row ? {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      projectId: String(row.project_id),
      name: String(row.name),
      remoteUrl: String(row.remote_url),
      defaultBranch: String(row.default_branch),
      secretRef: String(row.secret_ref),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    } : null;
  }

  createAsset(input: {
    tenantId: string;
    projectId: string;
    repositoryId: string;
    name: string;
    kind: "script" | "notebook";
    path: string;
    runtime: RuntimeLanguage;
  }): CodeAssetRecord {
    const timestamp = now();
    const id = `asset_${Math.random().toString(36).slice(2, 10)}`;
    this.sqlite.prepare(`
      INSERT INTO code_assets (id, tenant_id, project_id, repository_id, name, kind, path, runtime, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.tenantId, input.projectId, input.repositoryId, input.name, input.kind, input.path, input.runtime, timestamp, timestamp);
    return this.getAsset(input.tenantId, id)!;
  }

  listAssets(tenantId: string, projectId?: string): CodeAssetRecord[] {
    const rows = projectId
      ? this.sqlite.prepare("SELECT * FROM code_assets WHERE tenant_id = ? AND project_id = ? ORDER BY created_at DESC").all(tenantId, projectId)
      : this.sqlite.prepare("SELECT * FROM code_assets WHERE tenant_id = ? ORDER BY created_at DESC").all(tenantId);
    return (rows as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      tenantId: String(row.tenant_id),
      projectId: String(row.project_id),
      repositoryId: String(row.repository_id),
      name: String(row.name),
      kind: row.kind as "script" | "notebook",
      path: String(row.path),
      runtime: row.runtime as RuntimeLanguage,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    }));
  }

  getAsset(tenantId: string, assetId: string): CodeAssetRecord | null {
    const row = this.sqlite.prepare("SELECT * FROM code_assets WHERE tenant_id = ? AND id = ?").get(tenantId, assetId) as Record<string, unknown> | undefined;
    return row ? {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      projectId: String(row.project_id),
      repositoryId: String(row.repository_id),
      name: String(row.name),
      kind: row.kind as "script" | "notebook",
      path: String(row.path),
      runtime: row.runtime as RuntimeLanguage,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    } : null;
  }

  createRevision(input: {
    tenantId: string;
    projectId: string;
    repositoryId: string;
    assetId: string;
    branchName: string;
    baseRef: string;
    gitCommit?: string | null;
    content: string;
    createdBy: string;
  }): RevisionRecord {
    const id = `rev_${Math.random().toString(36).slice(2, 10)}`;
    this.sqlite.prepare(`
      INSERT INTO asset_revisions (id, tenant_id, project_id, repository_id, asset_id, branch_name, base_ref, git_commit, content, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.tenantId, input.projectId, input.repositoryId, input.assetId, input.branchName, input.baseRef, input.gitCommit ?? null, input.content, input.createdBy, now());

    const asset = this.getAsset(input.tenantId, input.assetId);
    if (asset?.kind === "notebook") {
      const parsed = parseJsonObject<NotebookDocument>(input.content, { cells: [] });
      this.sqlite.prepare("DELETE FROM notebook_cells WHERE tenant_id = ? AND asset_id = ?").run(input.tenantId, input.assetId);
      const insertCell = this.sqlite.prepare(`
        INSERT INTO notebook_cells (id, tenant_id, asset_id, revision_id, ord, runtime, label, code, last_output, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      parsed.cells.forEach((cell, index) => {
        insertCell.run(cell.id, input.tenantId, input.assetId, id, index, cell.runtime, cell.label, cell.code, cell.lastOutput ?? "", cell.status ?? "idle");
      });
    }
    return this.getRevision(input.tenantId, id)!;
  }

  listRevisions(tenantId: string, assetId: string): RevisionRecord[] {
    const rows = this.sqlite.prepare("SELECT * FROM asset_revisions WHERE tenant_id = ? AND asset_id = ? ORDER BY created_at DESC").all(tenantId, assetId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      tenantId: String(row.tenant_id),
      projectId: String(row.project_id),
      repositoryId: String(row.repository_id),
      assetId: String(row.asset_id),
      branchName: String(row.branch_name),
      baseRef: String(row.base_ref),
      gitCommit: row.git_commit ? String(row.git_commit) : null,
      content: String(row.content),
      createdBy: String(row.created_by),
      createdAt: Number(row.created_at),
    }));
  }

  getRevision(tenantId: string, revisionId: string): RevisionRecord | null {
    const row = this.sqlite.prepare("SELECT * FROM asset_revisions WHERE tenant_id = ? AND id = ?").get(tenantId, revisionId) as Record<string, unknown> | undefined;
    return row ? {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      projectId: String(row.project_id),
      repositoryId: String(row.repository_id),
      assetId: String(row.asset_id),
      branchName: String(row.branch_name),
      baseRef: String(row.base_ref),
      gitCommit: row.git_commit ? String(row.git_commit) : null,
      content: String(row.content),
      createdBy: String(row.created_by),
      createdAt: Number(row.created_at),
    } : null;
  }

  createChangeRequest(input: {
    tenantId: string;
    projectId: string;
    repositoryId: string;
    assetId: string;
    revisionId: string;
    title: string;
    description?: string;
    targetBranch?: string;
    createdBy: string;
  }): ChangeRequestRecord {
    const timestamp = now();
    const id = `cr_${Math.random().toString(36).slice(2, 10)}`;
    this.sqlite.prepare(`
      INSERT INTO change_requests (id, tenant_id, project_id, repository_id, asset_id, revision_id, title, description, target_branch, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
    `).run(id, input.tenantId, input.projectId, input.repositoryId, input.assetId, input.revisionId, input.title, input.description ?? "", input.targetBranch ?? "main", input.createdBy, timestamp, timestamp);
    return this.getChangeRequest(input.tenantId, id)!;
  }

  listChangeRequests(tenantId: string, projectId?: string): ChangeRequestRecord[] {
    const rows = projectId
      ? this.sqlite.prepare("SELECT * FROM change_requests WHERE tenant_id = ? AND project_id = ? ORDER BY created_at DESC").all(tenantId, projectId)
      : this.sqlite.prepare("SELECT * FROM change_requests WHERE tenant_id = ? ORDER BY created_at DESC").all(tenantId);
    return (rows as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      tenantId: String(row.tenant_id),
      projectId: String(row.project_id),
      repositoryId: String(row.repository_id),
      assetId: String(row.asset_id),
      revisionId: String(row.revision_id),
      title: String(row.title),
      description: String(row.description),
      targetBranch: String(row.target_branch),
      status: row.status as ChangeRequestRecord["status"],
      createdBy: String(row.created_by),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    }));
  }

  getChangeRequest(tenantId: string, changeRequestId: string): ChangeRequestRecord | null {
    const row = this.sqlite.prepare("SELECT * FROM change_requests WHERE tenant_id = ? AND id = ?").get(tenantId, changeRequestId) as Record<string, unknown> | undefined;
    return row ? {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      projectId: String(row.project_id),
      repositoryId: String(row.repository_id),
      assetId: String(row.asset_id),
      revisionId: String(row.revision_id),
      title: String(row.title),
      description: String(row.description),
      targetBranch: String(row.target_branch),
      status: row.status as ChangeRequestRecord["status"],
      createdBy: String(row.created_by),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    } : null;
  }

  createChangeRequestReview(input: {
    changeRequestId: string;
    reviewer: string;
    status: "pending" | "approved" | "rejected";
    notes?: string;
  }): ChangeRequestReviewRecord {
    const timestamp = now();
    const id = `revw_${Math.random().toString(36).slice(2, 10)}`;
    this.sqlite.prepare(`
      INSERT INTO change_request_reviews (id, change_request_id, reviewer, status, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.changeRequestId, input.reviewer, input.status, input.notes ?? "", timestamp, timestamp);
    return {
      id,
      changeRequestId: input.changeRequestId,
      reviewer: input.reviewer,
      status: input.status,
      notes: input.notes ?? "",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  listChangeRequestReviews(changeRequestId: string): ChangeRequestReviewRecord[] {
    const rows = this.sqlite.prepare("SELECT * FROM change_request_reviews WHERE change_request_id = ? ORDER BY created_at ASC").all(changeRequestId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      changeRequestId: String(row.change_request_id),
      reviewer: String(row.reviewer),
      status: row.status as ChangeRequestReviewRecord["status"],
      notes: String(row.notes),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    }));
  }

  updateChangeRequestStatus(tenantId: string, changeRequestId: string, status: ChangeRequestRecord["status"]): void {
    this.sqlite.prepare("UPDATE change_requests SET status = ?, updated_at = ? WHERE tenant_id = ? AND id = ?").run(status, now(), tenantId, changeRequestId);
  }

  createWorkflow(input: {
    tenantId: string;
    projectId: string;
    name: string;
    cron?: string;
    assetId: string;
    enabled?: boolean;
    inputs?: Record<string, unknown>;
  }): WorkflowRecord {
    const timestamp = now();
    const id = `wf_${Math.random().toString(36).slice(2, 10)}`;
    this.sqlite.prepare(`
      INSERT INTO workflows (id, tenant_id, project_id, name, cron, asset_id, enabled, inputs_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.tenantId, input.projectId, input.name, input.cron ?? "", input.assetId, input.enabled === false ? 0 : 1, JSON.stringify(input.inputs ?? {}), timestamp, timestamp);
    return this.getWorkflow(input.tenantId, id)!;
  }

  listWorkflows(tenantId: string, projectId?: string): WorkflowRecord[] {
    const rows = projectId
      ? this.sqlite.prepare("SELECT * FROM workflows WHERE tenant_id = ? AND project_id = ? ORDER BY created_at DESC").all(tenantId, projectId)
      : this.sqlite.prepare("SELECT * FROM workflows WHERE tenant_id = ? ORDER BY created_at DESC").all(tenantId);
    return (rows as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      tenantId: String(row.tenant_id),
      projectId: String(row.project_id),
      name: String(row.name),
      cron: String(row.cron),
      assetId: String(row.asset_id),
      enabled: Number(row.enabled) === 1,
      inputsJson: String(row.inputs_json),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    }));
  }

  getWorkflow(tenantId: string, workflowId: string): WorkflowRecord | null {
    const row = this.sqlite.prepare("SELECT * FROM workflows WHERE tenant_id = ? AND id = ?").get(tenantId, workflowId) as Record<string, unknown> | undefined;
    return row ? {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      projectId: String(row.project_id),
      name: String(row.name),
      cron: String(row.cron),
      assetId: String(row.asset_id),
      enabled: Number(row.enabled) === 1,
      inputsJson: String(row.inputs_json),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    } : null;
  }

  createRun(input: {
    tenantId: string;
    projectId: string;
    repositoryId: string;
    assetId: string;
    revisionId: string;
    workflowId?: string | null;
    inputs?: Record<string, unknown>;
    targetCellId?: string | null;
  }): RunRecord {
    const timestamp = now();
    const id = `run_${Math.random().toString(36).slice(2, 10)}`;
    this.sqlite.prepare(`
      INSERT INTO runs (id, tenant_id, project_id, repository_id, asset_id, revision_id, workflow_id, status, worker_id, target_cell_id, inputs_json, started_at, finished_at, exit_code, output_text, error_text, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', NULL, ?, ?, NULL, NULL, NULL, '', '', ?, ?)
    `).run(id, input.tenantId, input.projectId, input.repositoryId, input.assetId, input.revisionId, input.workflowId ?? null, input.targetCellId ?? null, JSON.stringify(input.inputs ?? {}), timestamp, timestamp);
    return this.getRun(input.tenantId, id)!;
  }

  listRuns(tenantId: string, projectId?: string): RunRecord[] {
    const rows = projectId
      ? this.sqlite.prepare("SELECT * FROM runs WHERE tenant_id = ? AND project_id = ? ORDER BY created_at DESC").all(tenantId, projectId)
      : this.sqlite.prepare("SELECT * FROM runs WHERE tenant_id = ? ORDER BY created_at DESC").all(tenantId);
    return (rows as Array<Record<string, unknown>>).map((row) => this.toRunRecord(row));
  }

  getRun(tenantId: string, runId: string): RunRecord | null {
    const row = this.sqlite.prepare("SELECT * FROM runs WHERE tenant_id = ? AND id = ?").get(tenantId, runId) as Record<string, unknown> | undefined;
    return row ? this.toRunRecord(row) : null;
  }

  private toRunRecord(row: Record<string, unknown>): RunRecord {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      projectId: String(row.project_id),
      repositoryId: String(row.repository_id),
      assetId: String(row.asset_id),
      revisionId: String(row.revision_id),
      workflowId: row.workflow_id ? String(row.workflow_id) : null,
      status: row.status as RunRecord["status"],
      workerId: row.worker_id ? String(row.worker_id) : null,
      targetCellId: row.target_cell_id ? String(row.target_cell_id) : null,
      inputsJson: String(row.inputs_json),
      startedAt: row.started_at == null ? null : Number(row.started_at),
      finishedAt: row.finished_at == null ? null : Number(row.finished_at),
      exitCode: row.exit_code == null ? null : Number(row.exit_code),
      outputText: String(row.output_text),
      errorText: String(row.error_text),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }

  claimNextRun(tenantId: string, workerId: string, runtimes: RuntimeLanguage[]): RunRecord | null {
    const candidates = this.sqlite.prepare(`
      SELECT runs.* FROM runs
      JOIN code_assets ON code_assets.id = runs.asset_id
      WHERE runs.tenant_id = ? AND runs.status = 'queued'
      ORDER BY runs.created_at ASC
    `).all(tenantId) as Array<Record<string, unknown>>;
    for (const row of candidates) {
      if (!runtimes.includes(row.runtime as RuntimeLanguage) && !runtimes.includes(this.getAsset(tenantId, String(row.asset_id))?.runtime ?? "node")) continue;
      this.sqlite.prepare(`
        UPDATE runs
        SET status = 'claimed', worker_id = ?, started_at = ?, updated_at = ?
        WHERE id = ? AND status = 'queued'
      `).run(workerId, now(), now(), String(row.id));
      const claimed = this.getRun(tenantId, String(row.id));
      if (claimed) return claimed;
    }
    return null;
  }

  markRunRunning(tenantId: string, runId: string): void {
    this.sqlite.prepare("UPDATE runs SET status = 'running', updated_at = ? WHERE tenant_id = ? AND id = ?").run(now(), tenantId, runId);
  }

  appendRunLog(runId: string, stream: "stdout" | "stderr" | "system", line: string): RunLogRecord {
    const id = `log_${Math.random().toString(36).slice(2, 10)}`;
    const createdAt = now();
    this.sqlite.prepare("INSERT INTO run_logs (id, run_id, stream, line, created_at) VALUES (?, ?, ?, ?, ?)").run(id, runId, stream, line, createdAt);
    const session = this.sqlite.prepare("SELECT transcript FROM run_terminal_sessions WHERE run_id = ?").get(runId) as { transcript: string } | undefined;
    const transcript = `${session?.transcript ?? ""}${line}\n`;
    if (session) {
      this.sqlite.prepare("UPDATE run_terminal_sessions SET transcript = ?, updated_at = ? WHERE run_id = ?").run(transcript, now(), runId);
    } else {
      this.sqlite.prepare("INSERT INTO run_terminal_sessions (id, run_id, transcript, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(`term_${Math.random().toString(36).slice(2, 10)}`, runId, transcript, createdAt, createdAt);
    }
    return { id, runId, stream, line, createdAt };
  }

  listRunLogs(runId: string): RunLogRecord[] {
    const rows = this.sqlite.prepare("SELECT * FROM run_logs WHERE run_id = ? ORDER BY created_at ASC").all(runId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      runId: String(row.run_id),
      stream: row.stream as RunLogRecord["stream"],
      line: String(row.line),
      createdAt: Number(row.created_at),
    }));
  }

  getRunTranscript(runId: string): string {
    const row = this.sqlite.prepare("SELECT transcript FROM run_terminal_sessions WHERE run_id = ?").get(runId) as { transcript: string } | undefined;
    return row?.transcript ?? "";
  }

  completeRun(input: {
    tenantId: string;
    runId: string;
    status: RunRecord["status"];
    exitCode: number;
    outputText: string;
    errorText: string;
  }): void {
    this.sqlite.prepare(`
      UPDATE runs
      SET status = ?, exit_code = ?, output_text = ?, error_text = ?, finished_at = ?, updated_at = ?
      WHERE tenant_id = ? AND id = ?
    `).run(input.status, input.exitCode, input.outputText, input.errorText, now(), now(), input.tenantId, input.runId);
  }

  addArtifact(input: {
    runId: string;
    tenantId: string;
    projectId: string;
    kind: "file" | "directory";
    name: string;
    path: string;
    contentType: string;
    sizeBytes: number;
    deployableKind?: "static" | "node-web" | null;
  }): ArtifactRecord {
    const id = `art_${Math.random().toString(36).slice(2, 10)}`;
    const createdAt = now();
    this.sqlite.prepare(`
      INSERT INTO run_artifacts (id, run_id, tenant_id, project_id, kind, name, path, content_type, size_bytes, deployable_kind, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.runId, input.tenantId, input.projectId, input.kind, input.name, input.path, input.contentType, input.sizeBytes, input.deployableKind ?? null, createdAt);
    return {
      id,
      runId: input.runId,
      tenantId: input.tenantId,
      projectId: input.projectId,
      kind: input.kind,
      name: input.name,
      path: input.path,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      deployableKind: input.deployableKind ?? null,
      createdAt,
    };
  }

  listArtifacts(runId: string): ArtifactRecord[] {
    const rows = this.sqlite.prepare("SELECT * FROM run_artifacts WHERE run_id = ? ORDER BY created_at ASC").all(runId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      runId: String(row.run_id),
      tenantId: String(row.tenant_id),
      projectId: String(row.project_id),
      kind: row.kind as ArtifactRecord["kind"],
      name: String(row.name),
      path: String(row.path),
      contentType: String(row.content_type),
      sizeBytes: Number(row.size_bytes),
      deployableKind: row.deployable_kind ? row.deployable_kind as ArtifactRecord["deployableKind"] : null,
      createdAt: Number(row.created_at),
    }));
  }

  createNotebookSnapshot(input: {
    assetId: string;
    revisionId: string;
    runId: string;
    snapshotJson: string;
  }): NotebookSnapshotRecord {
    const id = `snap_${Math.random().toString(36).slice(2, 10)}`;
    const createdAt = now();
    this.sqlite.prepare(`
      INSERT INTO notebook_snapshots (id, asset_id, revision_id, run_id, snapshot_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, input.assetId, input.revisionId, input.runId, input.snapshotJson, createdAt);
    return { id, assetId: input.assetId, revisionId: input.revisionId, runId: input.runId, snapshotJson: input.snapshotJson, createdAt };
  }

  listNotebookSnapshots(assetId: string): NotebookSnapshotRecord[] {
    const rows = this.sqlite.prepare("SELECT * FROM notebook_snapshots WHERE asset_id = ? ORDER BY created_at DESC").all(assetId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      assetId: String(row.asset_id),
      revisionId: String(row.revision_id),
      runId: String(row.run_id),
      snapshotJson: String(row.snapshot_json),
      createdAt: Number(row.created_at),
    }));
  }

  createDeployment(input: {
    tenantId: string;
    projectId: string;
    artifactId: string;
    kind: "static" | "node-web";
    environment: "preview" | "staging" | "production";
    releasePath: string;
    previewUrl: string;
  }): DeploymentRecord {
    const id = `dep_${Math.random().toString(36).slice(2, 10)}`;
    const timestamp = now();
    this.sqlite.prepare(`
      INSERT INTO deployments (id, tenant_id, project_id, artifact_id, kind, environment, status, release_path, preview_url, active_domain, certificate_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'ready', ?, ?, '', 'none', ?, ?)
    `).run(id, input.tenantId, input.projectId, input.artifactId, input.kind, input.environment, input.releasePath, input.previewUrl, timestamp, timestamp);
    this.addDeploymentRelease({
      deploymentId: id,
      artifactId: input.artifactId,
      versionLabel: "v1",
      path: input.releasePath,
      status: "active",
    });
    return this.getDeployment(input.tenantId, id)!;
  }

  listDeployments(tenantId: string): DeploymentRecord[] {
    const rows = this.sqlite.prepare("SELECT * FROM deployments WHERE tenant_id = ? ORDER BY created_at DESC").all(tenantId) as Array<Record<string, unknown>>;
    return rows.map((row) => this.toDeploymentRecord(row));
  }

  getDeployment(tenantId: string, deploymentId: string): DeploymentRecord | null {
    const row = this.sqlite.prepare("SELECT * FROM deployments WHERE tenant_id = ? AND id = ?").get(tenantId, deploymentId) as Record<string, unknown> | undefined;
    return row ? this.toDeploymentRecord(row) : null;
  }

  private toDeploymentRecord(row: Record<string, unknown>): DeploymentRecord {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      projectId: String(row.project_id),
      artifactId: String(row.artifact_id),
      kind: row.kind as DeploymentRecord["kind"],
      environment: row.environment as DeploymentRecord["environment"],
      status: row.status as DeploymentRecord["status"],
      releasePath: String(row.release_path),
      previewUrl: String(row.preview_url),
      activeDomain: String(row.active_domain),
      certificateStatus: row.certificate_status as DeploymentRecord["certificateStatus"],
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }

  addDeploymentRelease(input: {
    deploymentId: string;
    artifactId: string;
    versionLabel: string;
    path: string;
    status: "active" | "inactive";
  }): DeploymentReleaseRecord {
    const id = `rel_${Math.random().toString(36).slice(2, 10)}`;
    const createdAt = now();
    this.sqlite.prepare(`
      INSERT INTO deployment_releases (id, deployment_id, artifact_id, version_label, path, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.deploymentId, input.artifactId, input.versionLabel, input.path, input.status, createdAt);
    return { id, deploymentId: input.deploymentId, artifactId: input.artifactId, versionLabel: input.versionLabel, path: input.path, status: input.status, createdAt };
  }

  listDeploymentReleases(deploymentId: string): DeploymentReleaseRecord[] {
    const rows = this.sqlite.prepare("SELECT * FROM deployment_releases WHERE deployment_id = ? ORDER BY created_at DESC").all(deploymentId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      deploymentId: String(row.deployment_id),
      artifactId: String(row.artifact_id),
      versionLabel: String(row.version_label),
      path: String(row.path),
      status: row.status as DeploymentReleaseRecord["status"],
      createdAt: Number(row.created_at),
    }));
  }

  attachDeploymentDomain(deploymentId: string, domain: string): DeploymentDomainRecord {
    const id = `dom_${Math.random().toString(36).slice(2, 10)}`;
    const createdAt = now();
    this.sqlite.prepare("INSERT INTO deployment_domains (id, deployment_id, domain, created_at) VALUES (?, ?, ?, ?)").run(id, deploymentId, domain, createdAt);
    this.sqlite.prepare("UPDATE deployments SET active_domain = ?, updated_at = ? WHERE id = ?").run(domain, now(), deploymentId);
    return { id, deploymentId, domain, createdAt };
  }

  issueDeploymentCertificate(deploymentId: string, domain: string, status: "pending" | "issued" | "failed"): DeploymentCertificateRecord {
    const id = `crt_${Math.random().toString(36).slice(2, 10)}`;
    const createdAt = now();
    const updatedAt = now();
    this.sqlite.prepare(`
      INSERT INTO deployment_certificates (id, deployment_id, domain, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, deploymentId, domain, status, createdAt, updatedAt);
    this.sqlite.prepare("UPDATE deployments SET certificate_status = ?, updated_at = ? WHERE id = ?").run(status, updatedAt, deploymentId);
    return { id, deploymentId, domain, status, createdAt, updatedAt };
  }

  updateDeploymentStatus(tenantId: string, deploymentId: string, status: DeploymentRecord["status"], previewUrl?: string): void {
    this.sqlite.prepare("UPDATE deployments SET status = ?, preview_url = COALESCE(?, preview_url), updated_at = ? WHERE tenant_id = ? AND id = ?").run(status, previewUrl ?? null, now(), tenantId, deploymentId);
  }

  listNotebookCells(assetId: string): Array<Record<string, unknown>> {
    return this.sqlite.prepare("SELECT * FROM notebook_cells WHERE asset_id = ? ORDER BY ord ASC").all(assetId) as Array<Record<string, unknown>>;
  }

  getRevisionBundle(tenantId: string, runId: string): {
    run: RunRecord;
    asset: CodeAssetRecord;
    revision: RevisionRecord;
    repository: RepositoryRecord;
  } | null {
    const run = this.getRun(tenantId, runId);
    if (!run) return null;
    const asset = this.getAsset(tenantId, run.assetId);
    const revision = this.getRevision(tenantId, run.revisionId);
    const repository = this.getRepository(tenantId, run.repositoryId);
    if (!asset || !revision || !repository) return null;
    return { run, asset, revision, repository };
  }
}
