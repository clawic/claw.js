import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type SqliteDatabase = {
  exec(sql: string): void;
  pragma(sql: string): unknown;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): { changes: number };
  };
  transaction<TArgs extends unknown[], TResult>(fn: (...args: TArgs) => TResult): (...args: TArgs) => TResult;
};

export type AgentResourceLeaseMode = "read" | "write" | "exclusive";
export type AgentResourceLeaseStatus = "running" | "repairing" | "blocked" | "releasing" | "released" | "stale";
export type AgentIntentStatus = "planned" | "running" | "blocked" | "completed" | "abandoned";
export type AgentWorkResultStatus = "passed" | "failed" | "partial" | "external_pending" | "blocked" | "abandoned";

export interface AgentCoordinationPaths {
  stateDir: string;
  runDir: string;
  databasePath: string;
}

export interface AgentIntentRow {
  id: string;
  repo: string | null;
  workspace_root: string | null;
  agent_id: string;
  session_id: string | null;
  purpose: string;
  created_at: string;
  updated_at: string;
  status: AgentIntentStatus;
  metadata_json: string;
}

export interface AgentResourceLeaseRow {
  id: string;
  resource_id: string;
  resource_kind: string | null;
  mode: AgentResourceLeaseMode;
  intent_id: string;
  agent_id: string;
  session_id: string | null;
  pid: number;
  hostname: string;
  started_at: string;
  heartbeat_at: string;
  expires_at: string;
  status: AgentResourceLeaseStatus;
  cleanup_command_json: string;
  metadata_json: string;
}

export interface AgentResourceDemandRow {
  id: string;
  resource_id: string;
  intent_id: string;
  agent_id: string;
  reason: string;
  required_by: string | null;
  created_at: string;
  status: "pending" | "satisfied" | "cancelled" | "stale";
  metadata_json: string;
}

export interface AgentWorkResultRow {
  id: string;
  intent_id: string;
  check_id: string | null;
  repo: string | null;
  lane: string | null;
  fingerprint: string | null;
  status: AgentWorkResultStatus;
  started_at: string | null;
  finished_at: string;
  duration_ms: number | null;
  stdout_tail: string | null;
  stderr_tail: string | null;
  artifact_refs_json: string;
  failure_action: string | null;
  metadata_json: string;
}

export interface AgentRepairOwnershipRow {
  id: string;
  check_id: string;
  fingerprint: string;
  owner_intent_id: string;
  owner_agent_id: string;
  started_at: string;
  heartbeat_at: string;
  expires_at: string;
  status: "repairing" | "released" | "stale";
}

export interface AgentCoordinationAuditRow {
  id: string;
  event_type: string;
  created_at: string;
  agent_id: string | null;
  intent_id: string | null;
  resource_id: string | null;
  lease_id: string | null;
  payload_json: string;
}

export interface AgentCoordinationAcquireInput {
  resourceId: string;
  mode: AgentResourceLeaseMode;
  intentId: string;
  agentId?: string;
  sessionId?: string | null;
  pid?: number;
  ttlSeconds?: number;
  resourceKind?: string | null;
  reason?: string;
  cleanupCommand?: unknown;
  metadata?: Record<string, unknown>;
}

export interface AgentCoordinationAcquireResult {
  status: "acquired" | "pending";
  lease?: AgentResourceLeaseRow;
  demand?: AgentResourceDemandRow;
  conflicts: AgentResourceLeaseRow[];
}

const ACTIVE_LEASE_STATUSES = new Set<AgentResourceLeaseStatus>(["running", "repairing", "blocked", "releasing"]);
const VALID_LEASE_MODES = new Set<AgentResourceLeaseMode>(["read", "write", "exclusive"]);
const VALID_HEARTBEAT_STATUSES = new Set<AgentResourceLeaseStatus>(["running", "repairing", "blocked"]);
const VALID_RELEASE_STATUSES = new Set<AgentWorkResultStatus>(["passed", "failed", "partial", "external_pending", "blocked", "abandoned"]);

export function resolveAgentCoordinationPaths(input: { stateDir?: string; runDir?: string; clawHome?: string; dataDir?: string; homeDir?: string } = {}): AgentCoordinationPaths {
  const homeDir = input.homeDir ?? os.homedir();
  const clawHome = input.clawHome ?? process.env.CLAW_HOME ?? path.join(homeDir, ".claw");
  const stateDir = path.resolve(input.stateDir ?? process.env.CLAW_AGENT_COORDINATION_STATE_DIR ?? path.join(clawHome, "state"));
  const defaultRunDir = input.stateDir && !input.clawHome
    ? path.join(stateDir, "run")
    : path.join(clawHome, "run", "agent-coordination");
  const runDir = path.resolve(input.runDir ?? process.env.CLAW_AGENT_COORDINATION_RUN_DIR ?? defaultRunDir);
  return {
    stateDir,
    runDir,
    databasePath: path.join(stateDir, "agent-coordination.sqlite"),
  };
}

export function leasesConflict(existing: AgentResourceLeaseMode, requested: AgentResourceLeaseMode): boolean {
  return !(existing === "read" && requested === "read");
}

export async function openAgentCoordinationStore(paths: AgentCoordinationPaths): Promise<AgentCoordinationStore> {
  fs.mkdirSync(paths.stateDir, { recursive: true });
  fs.mkdirSync(paths.runDir, { recursive: true });
  const imported = await import("better-sqlite3");
  const Database = imported.default as new (filename: string) => SqliteDatabase;
  const sqlite = new Database(paths.databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const store = new AgentCoordinationStore(sqlite, paths);
  store.ensureSchema();
  return store;
}

export class AgentCoordinationStore {
  constructor(
    private readonly sqlite: SqliteDatabase,
    readonly paths: AgentCoordinationPaths,
  ) {}

  ensureSchema(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS agent_intents (
        id TEXT PRIMARY KEY,
        repo TEXT,
        workspace_root TEXT,
        agent_id TEXT NOT NULL,
        session_id TEXT,
        purpose TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        status TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE TABLE IF NOT EXISTS resource_leases (
        id TEXT PRIMARY KEY,
        resource_id TEXT NOT NULL,
        resource_kind TEXT,
        mode TEXT NOT NULL,
        intent_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        session_id TEXT,
        pid INTEGER NOT NULL,
        hostname TEXT NOT NULL,
        started_at TEXT NOT NULL,
        heartbeat_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        status TEXT NOT NULL,
        cleanup_command_json TEXT NOT NULL DEFAULT 'null',
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS resource_leases_active_idx ON resource_leases(resource_id, status, expires_at);
      CREATE TABLE IF NOT EXISTS resource_demands (
        id TEXT PRIMARY KEY,
        resource_id TEXT NOT NULL,
        intent_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        required_by TEXT,
        created_at TEXT NOT NULL,
        status TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS resource_demands_pending_idx ON resource_demands(resource_id, status, created_at);
      CREATE TABLE IF NOT EXISTS work_results (
        id TEXT PRIMARY KEY,
        intent_id TEXT NOT NULL,
        check_id TEXT,
        repo TEXT,
        lane TEXT,
        fingerprint TEXT,
        status TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT NOT NULL,
        duration_ms INTEGER,
        stdout_tail TEXT,
        stderr_tail TEXT,
        artifact_refs_json TEXT NOT NULL DEFAULT '[]',
        failure_action TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS work_results_fingerprint_idx ON work_results(repo, check_id, fingerprint, finished_at);
      CREATE TABLE IF NOT EXISTS repair_ownership (
        id TEXT PRIMARY KEY,
        check_id TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        owner_intent_id TEXT NOT NULL,
        owner_agent_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        heartbeat_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        status TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS repair_ownership_active_idx ON repair_ownership(check_id, fingerprint, status, expires_at);
      CREATE TABLE IF NOT EXISTS coordination_audit (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        agent_id TEXT,
        intent_id TEXT,
        resource_id TEXT,
        lease_id TEXT,
        payload_json TEXT NOT NULL DEFAULT '{}'
      );
    `);
  }

  createIntent(input: {
    id?: string;
    repo?: string | null;
    workspaceRoot?: string | null;
    agentId?: string;
    sessionId?: string | null;
    purpose?: string;
    metadata?: Record<string, unknown>;
  }): AgentIntentRow {
    const now = nowIso();
    const row: AgentIntentRow = {
      id: input.id || `intent-${randomUUID()}`,
      repo: input.repo ?? null,
      workspace_root: input.workspaceRoot ?? null,
      agent_id: input.agentId || defaultAgentId(),
      session_id: input.sessionId ?? process.env.CLAW_AGENT_SESSION_ID ?? null,
      purpose: input.purpose || "agent resource coordination",
      created_at: now,
      updated_at: now,
      status: "planned",
      metadata_json: JSON.stringify(input.metadata ?? {}),
    };
    this.sqlite.prepare(`
      INSERT INTO agent_intents (id, repo, workspace_root, agent_id, session_id, purpose, created_at, updated_at, status, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        repo = excluded.repo,
        workspace_root = excluded.workspace_root,
        agent_id = excluded.agent_id,
        session_id = excluded.session_id,
        purpose = excluded.purpose,
        updated_at = excluded.updated_at,
        status = excluded.status,
        metadata_json = excluded.metadata_json
    `).run(row.id, row.repo, row.workspace_root, row.agent_id, row.session_id, row.purpose, row.created_at, row.updated_at, row.status, row.metadata_json);
    this.audit("intent.created", { agentId: row.agent_id, intentId: row.id, payload: { repo: row.repo, purpose: row.purpose } });
    writeHeartbeatFile(this.paths.runDir, `${row.id}.intent.json`, {
      id: row.id,
      kind: "intent",
      agentId: row.agent_id,
      sessionId: row.session_id,
      purpose: row.purpose,
      status: row.status,
      updatedAt: row.updated_at,
    });
    return row;
  }

  acquire(input: AgentCoordinationAcquireInput): AgentCoordinationAcquireResult {
    if (!VALID_LEASE_MODES.has(input.mode)) throw new Error(`Invalid lease mode: ${input.mode}`);
    const run = this.sqlite.transaction(() => {
      const now = nowIso();
      const agentId = input.agentId || defaultAgentId();
      const ttlSeconds = input.ttlSeconds && input.ttlSeconds > 0 ? input.ttlSeconds : 600;
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
      const conflicts = this.activeConflicts(input.resourceId, input.mode, now);
      if (conflicts.length > 0) {
        const demand: AgentResourceDemandRow = {
          id: `demand-${randomUUID()}`,
          resource_id: input.resourceId,
          intent_id: input.intentId,
          agent_id: agentId,
          reason: input.reason || "resource is already leased",
          required_by: expiresAt,
          created_at: now,
          status: "pending",
          metadata_json: JSON.stringify({ requestedMode: input.mode, conflicts: conflicts.map((conflict) => conflict.id), ...(input.metadata ?? {}) }),
        };
        this.sqlite.prepare(`
          INSERT INTO resource_demands (id, resource_id, intent_id, agent_id, reason, required_by, created_at, status, metadata_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(demand.id, demand.resource_id, demand.intent_id, demand.agent_id, demand.reason, demand.required_by, demand.created_at, demand.status, demand.metadata_json);
        this.audit("resource.pending", { agentId, intentId: input.intentId, resourceId: input.resourceId, payload: { demandId: demand.id, requestedMode: input.mode, conflicts: conflicts.map(publicLease) } });
        return { status: "pending" as const, demand, conflicts };
      }

      const lease: AgentResourceLeaseRow = {
        id: `lease-${randomUUID()}`,
        resource_id: input.resourceId,
        resource_kind: input.resourceKind ?? null,
        mode: input.mode,
        intent_id: input.intentId,
        agent_id: agentId,
        session_id: input.sessionId ?? process.env.CLAW_AGENT_SESSION_ID ?? null,
        pid: input.pid && input.pid > 0 ? input.pid : process.pid,
        hostname: os.hostname(),
        started_at: now,
        heartbeat_at: now,
        expires_at: expiresAt,
        status: "running",
        cleanup_command_json: JSON.stringify(input.cleanupCommand ?? null),
        metadata_json: JSON.stringify(input.metadata ?? {}),
      };
      this.sqlite.prepare(`
        INSERT INTO resource_leases (id, resource_id, resource_kind, mode, intent_id, agent_id, session_id, pid, hostname, started_at, heartbeat_at, expires_at, status, cleanup_command_json, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(lease.id, lease.resource_id, lease.resource_kind, lease.mode, lease.intent_id, lease.agent_id, lease.session_id, lease.pid, lease.hostname, lease.started_at, lease.heartbeat_at, lease.expires_at, lease.status, lease.cleanup_command_json, lease.metadata_json);
      this.audit("resource.acquired", { agentId, intentId: input.intentId, resourceId: input.resourceId, leaseId: lease.id, payload: publicLease(lease) });
      writeLeaseHeartbeat(this.paths.runDir, lease);
      return { status: "acquired" as const, lease, conflicts: [] };
    });
    return run();
  }

  heartbeat(input: { leaseId: string; status?: "running" | "repairing" | "blocked"; ttlSeconds?: number; metadata?: Record<string, unknown> }): AgentResourceLeaseRow | null {
    if (input.status && !VALID_HEARTBEAT_STATUSES.has(input.status)) throw new Error(`Invalid heartbeat status: ${input.status}`);
    const existing = this.lease(input.leaseId);
    if (!existing) return null;
    const now = nowIso();
    const expiresAt = input.ttlSeconds && input.ttlSeconds > 0 ? new Date(Date.now() + input.ttlSeconds * 1000).toISOString() : existing.expires_at;
    const metadata = input.metadata ? JSON.stringify({ ...parseJsonObject(existing.metadata_json), ...input.metadata }) : existing.metadata_json;
    this.sqlite.prepare(`
      UPDATE resource_leases
      SET heartbeat_at = ?, expires_at = ?, status = ?, metadata_json = ?
      WHERE id = ?
    `).run(now, expiresAt, input.status ?? existing.status, metadata, input.leaseId);
    const updated = this.lease(input.leaseId);
    if (updated) {
      this.audit("resource.heartbeat", { agentId: updated.agent_id, intentId: updated.intent_id, resourceId: updated.resource_id, leaseId: updated.id, payload: publicLease(updated) });
      writeLeaseHeartbeat(this.paths.runDir, updated);
    }
    return updated;
  }

  release(input: {
    leaseId: string;
    status: AgentWorkResultStatus;
    checkId?: string | null;
    repo?: string | null;
    lane?: string | null;
    fingerprint?: string | null;
    startedAt?: string | null;
    durationMs?: number | null;
    stdoutTail?: string | null;
    stderrTail?: string | null;
    failureAction?: string | null;
    artifacts?: unknown[];
    metadata?: Record<string, unknown>;
  }): AgentResourceLeaseRow | null {
    if (!VALID_RELEASE_STATUSES.has(input.status)) throw new Error(`Invalid release status: ${input.status}`);
    const existing = this.lease(input.leaseId);
    if (!existing) return null;
    const now = nowIso();
    this.sqlite.prepare("UPDATE resource_leases SET status = ?, heartbeat_at = ? WHERE id = ?").run("released", now, input.leaseId);
    this.sqlite.prepare(`
      INSERT INTO work_results (id, intent_id, check_id, repo, lane, fingerprint, status, started_at, finished_at, duration_ms, stdout_tail, stderr_tail, artifact_refs_json, failure_action, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `result-${randomUUID()}`,
      existing.intent_id,
      input.checkId ?? null,
      input.repo ?? null,
      input.lane ?? null,
      input.fingerprint ?? null,
      input.status,
      input.startedAt ?? existing.started_at,
      now,
      input.durationMs ?? null,
      tail(input.stdoutTail),
      tail(input.stderrTail),
      JSON.stringify(input.artifacts ?? []),
      input.failureAction ?? null,
      JSON.stringify(input.metadata ?? {}),
    );
    this.audit("resource.released", { agentId: existing.agent_id, intentId: existing.intent_id, resourceId: existing.resource_id, leaseId: existing.id, payload: { status: input.status } });
    removeHeartbeatFile(this.paths.runDir, `${existing.id}.heartbeat.json`);
    return this.lease(input.leaseId);
  }

  waitlist(input: { resourceId: string; intentId: string; agentId?: string; reason?: string; requiredBy?: string | null; metadata?: Record<string, unknown> }): AgentResourceDemandRow {
    const now = nowIso();
    const demand: AgentResourceDemandRow = {
      id: `demand-${randomUUID()}`,
      resource_id: input.resourceId,
      intent_id: input.intentId,
      agent_id: input.agentId || defaultAgentId(),
      reason: input.reason || "resource demand recorded",
      required_by: input.requiredBy ?? null,
      created_at: now,
      status: "pending",
      metadata_json: JSON.stringify(input.metadata ?? {}),
    };
    this.sqlite.prepare(`
      INSERT INTO resource_demands (id, resource_id, intent_id, agent_id, reason, required_by, created_at, status, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(demand.id, demand.resource_id, demand.intent_id, demand.agent_id, demand.reason, demand.required_by, demand.created_at, demand.status, demand.metadata_json);
    this.audit("resource.waitlisted", { agentId: demand.agent_id, intentId: demand.intent_id, resourceId: demand.resource_id, payload: { demandId: demand.id } });
    return demand;
  }

  reap(now = nowIso()): { reaped: AgentResourceLeaseRow[] } {
    const active = this.activeLeases();
    const reaped = active.filter((lease) => lease.expires_at <= now || this.isDeadLocalProcess(lease));
    const mark = this.sqlite.prepare("UPDATE resource_leases SET status = ?, heartbeat_at = ? WHERE id = ?");
    for (const lease of reaped) {
      mark.run("stale", now, lease.id);
      removeHeartbeatFile(this.paths.runDir, `${lease.id}.heartbeat.json`);
      this.audit("resource.reaped", { agentId: lease.agent_id, intentId: lease.intent_id, resourceId: lease.resource_id, leaseId: lease.id, payload: publicLease(lease) });
    }
    const staleRepairs = this.sqlite.prepare("SELECT * FROM repair_ownership WHERE status = 'repairing' AND expires_at <= ?").all(now) as AgentRepairOwnershipRow[];
    for (const repair of staleRepairs) {
      this.sqlite.prepare("UPDATE repair_ownership SET status = 'stale', heartbeat_at = ? WHERE id = ?").run(now, repair.id);
      this.audit("repair.reaped", { agentId: repair.owner_agent_id, intentId: repair.owner_intent_id, payload: publicRepairOwnership(repair) });
    }
    return { reaped };
  }

  status(): { activeLeases: AgentResourceLeaseRow[]; pendingDemands: AgentResourceDemandRow[]; recentResults: AgentWorkResultRow[]; paths: AgentCoordinationPaths } {
    return {
      activeLeases: this.activeLeases(),
      pendingDemands: this.sqlite.prepare("SELECT * FROM resource_demands WHERE status = 'pending' ORDER BY created_at ASC LIMIT 100").all() as AgentResourceDemandRow[],
      recentResults: this.sqlite.prepare("SELECT * FROM work_results ORDER BY finished_at DESC LIMIT 50").all() as AgentWorkResultRow[],
      paths: this.paths,
    };
  }

  lease(id: string): AgentResourceLeaseRow | null {
    return (this.sqlite.prepare("SELECT * FROM resource_leases WHERE id = ?").get(id) as AgentResourceLeaseRow | undefined) ?? null;
  }

  latestResult(input: { repo: string; checkId: string; fingerprint: string; maxAgeSeconds?: number }): AgentWorkResultRow | null {
    const row = this.sqlite.prepare(`
      SELECT * FROM work_results
      WHERE repo = ? AND check_id = ? AND fingerprint = ?
      ORDER BY finished_at DESC
      LIMIT 1
    `).get(input.repo, input.checkId, input.fingerprint) as AgentWorkResultRow | undefined;
    if (!row) return null;
    if (input.maxAgeSeconds !== undefined && input.maxAgeSeconds >= 0) {
      const finishedAt = Date.parse(row.finished_at);
      if (!Number.isFinite(finishedAt)) return null;
      if (Date.now() - finishedAt > input.maxAgeSeconds * 1000) return null;
    }
    return row;
  }

  activeRepairOwnership(input: { checkId: string; fingerprint: string; now?: string }): AgentRepairOwnershipRow | null {
    const now = input.now ?? nowIso();
    return (this.sqlite.prepare(`
      SELECT * FROM repair_ownership
      WHERE check_id = ? AND fingerprint = ? AND status = 'repairing' AND expires_at > ?
      ORDER BY started_at ASC
      LIMIT 1
    `).get(input.checkId, input.fingerprint, now) as AgentRepairOwnershipRow | undefined) ?? null;
  }

  claimRepairOwnership(input: { checkId: string; fingerprint: string; ownerIntentId: string; ownerAgentId: string; ttlSeconds?: number }): AgentRepairOwnershipRow {
    const now = nowIso();
    const existing = this.activeRepairOwnership({ checkId: input.checkId, fingerprint: input.fingerprint, now });
    if (existing) return existing;
    const expiresAt = new Date(Date.now() + (input.ttlSeconds && input.ttlSeconds > 0 ? input.ttlSeconds : 1800) * 1000).toISOString();
    const row: AgentRepairOwnershipRow = {
      id: `repair-${randomUUID()}`,
      check_id: input.checkId,
      fingerprint: input.fingerprint,
      owner_intent_id: input.ownerIntentId,
      owner_agent_id: input.ownerAgentId,
      started_at: now,
      heartbeat_at: now,
      expires_at: expiresAt,
      status: "repairing",
    };
    this.sqlite.prepare(`
      INSERT INTO repair_ownership (id, check_id, fingerprint, owner_intent_id, owner_agent_id, started_at, heartbeat_at, expires_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(row.id, row.check_id, row.fingerprint, row.owner_intent_id, row.owner_agent_id, row.started_at, row.heartbeat_at, row.expires_at, row.status);
    this.audit("repair.claimed", { agentId: row.owner_agent_id, intentId: row.owner_intent_id, payload: publicRepairOwnership(row) });
    return row;
  }

  releaseRepairOwnership(input: { checkId: string; fingerprint: string; ownerIntentId?: string | null }): number {
    const now = nowIso();
    const result = this.sqlite.prepare(`
      UPDATE repair_ownership
      SET status = 'released', heartbeat_at = ?
      WHERE check_id = ? AND fingerprint = ? AND status = 'repairing' AND (? IS NULL OR owner_intent_id = ?)
    `).run(now, input.checkId, input.fingerprint, input.ownerIntentId ?? null, input.ownerIntentId ?? null);
    if (result.changes > 0) this.audit("repair.released", { intentId: input.ownerIntentId ?? null, payload: { checkId: input.checkId, fingerprint: input.fingerprint, count: result.changes } });
    return result.changes;
  }

  recordBypass(input: { intentId: string; agentId?: string | null; resourceId?: string | null; reason: string; metadata?: Record<string, unknown> }): AgentCoordinationAuditRow {
    return this.audit("coordination.bypassed", {
      agentId: input.agentId || defaultAgentId(),
      intentId: input.intentId,
      resourceId: input.resourceId ?? null,
      payload: { reason: input.reason, cleanValidation: false, ...(input.metadata ?? {}) },
    });
  }

  private activeLeases(): AgentResourceLeaseRow[] {
    return (this.sqlite.prepare(`
      SELECT * FROM resource_leases
      WHERE status IN ('running', 'repairing', 'blocked', 'releasing')
      ORDER BY started_at ASC
    `).all() as AgentResourceLeaseRow[]);
  }

  private activeConflicts(resourceId: string, requested: AgentResourceLeaseMode, now: string): AgentResourceLeaseRow[] {
    return (this.sqlite.prepare(`
      SELECT * FROM resource_leases
      WHERE resource_id = ?
        AND status IN ('running', 'repairing', 'blocked', 'releasing')
        AND expires_at > ?
      ORDER BY started_at ASC
    `).all(resourceId, now) as AgentResourceLeaseRow[])
      .filter((lease) => ACTIVE_LEASE_STATUSES.has(lease.status) && leasesConflict(lease.mode, requested));
  }

  private audit(eventType: string, input: { agentId?: string | null; intentId?: string | null; resourceId?: string | null; leaseId?: string | null; payload?: unknown }): AgentCoordinationAuditRow {
    const row: AgentCoordinationAuditRow = {
      id: `audit-${randomUUID()}`,
      event_type: eventType,
      created_at: nowIso(),
      agent_id: input.agentId ?? null,
      intent_id: input.intentId ?? null,
      resource_id: input.resourceId ?? null,
      lease_id: input.leaseId ?? null,
      payload_json: JSON.stringify(input.payload ?? {}),
    };
    this.sqlite.prepare(`
      INSERT INTO coordination_audit (id, event_type, created_at, agent_id, intent_id, resource_id, lease_id, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(row.id, row.event_type, row.created_at, row.agent_id, row.intent_id, row.resource_id, row.lease_id, row.payload_json);
    return row;
  }

  private isDeadLocalProcess(lease: AgentResourceLeaseRow): boolean {
    if (lease.hostname !== os.hostname()) return false;
    try {
      process.kill(lease.pid, 0);
      return false;
    } catch {
      return true;
    }
  }
}

export function publicLease(lease: AgentResourceLeaseRow): Record<string, unknown> {
  return {
    id: lease.id,
    resourceId: lease.resource_id,
    resourceKind: lease.resource_kind,
    mode: lease.mode,
    intentId: lease.intent_id,
    agentId: lease.agent_id,
    sessionId: lease.session_id,
    pid: lease.pid,
    hostname: lease.hostname,
    startedAt: lease.started_at,
    heartbeatAt: lease.heartbeat_at,
    expiresAt: lease.expires_at,
    status: lease.status,
    metadata: parseJsonObject(lease.metadata_json),
  };
}

export function publicDemand(demand: AgentResourceDemandRow): Record<string, unknown> {
  return {
    id: demand.id,
    resourceId: demand.resource_id,
    intentId: demand.intent_id,
    agentId: demand.agent_id,
    reason: demand.reason,
    requiredBy: demand.required_by,
    createdAt: demand.created_at,
    status: demand.status,
    metadata: parseJsonObject(demand.metadata_json),
  };
}

export function publicWorkResult(result: AgentWorkResultRow): Record<string, unknown> {
  return {
    id: result.id,
    intentId: result.intent_id,
    checkId: result.check_id,
    repo: result.repo,
    lane: result.lane,
    fingerprint: result.fingerprint,
    status: result.status,
    startedAt: result.started_at,
    finishedAt: result.finished_at,
    durationMs: result.duration_ms,
    failureAction: result.failure_action,
    metadata: parseJsonObject(result.metadata_json),
  };
}

export function publicRepairOwnership(repair: AgentRepairOwnershipRow): Record<string, unknown> {
  return {
    id: repair.id,
    checkId: repair.check_id,
    fingerprint: repair.fingerprint,
    ownerIntentId: repair.owner_intent_id,
    ownerAgentId: repair.owner_agent_id,
    startedAt: repair.started_at,
    heartbeatAt: repair.heartbeat_at,
    expiresAt: repair.expires_at,
    status: repair.status,
  };
}

export function publicAuditEvent(audit: AgentCoordinationAuditRow): Record<string, unknown> {
  return {
    id: audit.id,
    eventType: audit.event_type,
    createdAt: audit.created_at,
    agentId: audit.agent_id,
    intentId: audit.intent_id,
    resourceId: audit.resource_id,
    leaseId: audit.lease_id,
    payload: parseJsonObject(audit.payload_json),
  };
}

function writeLeaseHeartbeat(runDir: string, lease: AgentResourceLeaseRow): void {
  writeHeartbeatFile(runDir, `${lease.id}.heartbeat.json`, {
    id: lease.id,
    kind: "lease",
    resourceId: lease.resource_id,
    mode: lease.mode,
    intentId: lease.intent_id,
    agentId: lease.agent_id,
    sessionId: lease.session_id,
    pid: lease.pid,
    hostname: lease.hostname,
    status: lease.status,
    heartbeatAt: lease.heartbeat_at,
    expiresAt: lease.expires_at,
  });
}

function writeHeartbeatFile(runDir: string, filename: string, payload: unknown): void {
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, filename), `${JSON.stringify(payload, null, 2)}\n`);
}

function removeHeartbeatFile(runDir: string, filename: string): void {
  fs.rmSync(path.join(runDir, filename), { force: true });
}

function nowIso(): string {
  return new Date().toISOString();
}

function defaultAgentId(): string {
  return process.env.CLAW_AGENT_ID || process.env.USER || "agent";
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function tail(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length > 4000 ? value.slice(-4000) : value;
}
