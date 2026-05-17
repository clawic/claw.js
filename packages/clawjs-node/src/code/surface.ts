import { clawPersistentSurface } from "@clawjs/core";

const source = { file: "packages/clawjs-node/src/code/surface.ts", language: "typescript" } as const;

const schemaSurfaceNodes = [
  clawPersistentSurface.table({ id: `claw.database.core.table.code_repositories`, name: "code_repositories", parentId: "claw.database.core", databaseId: "claw.database.core", source }),
  clawPersistentSurface.table({ id: `claw.database.core.table.code_intents`, name: "code_intents", parentId: "claw.database.core", databaseId: "claw.database.core", source }),
  clawPersistentSurface.table({ id: `claw.database.core.table.code_reservations`, name: "code_reservations", parentId: "claw.database.core", databaseId: "claw.database.core", source }),
  clawPersistentSurface.table({ id: `claw.database.core.table.code_evidence`, name: "code_evidence", parentId: "claw.database.core", databaseId: "claw.database.core", source }),
  clawPersistentSurface.table({ id: `claw.database.core.table.code_checks`, name: "code_checks", parentId: "claw.database.core", databaseId: "claw.database.core", source }),
  clawPersistentSurface.table({ id: `claw.database.core.table.code_reviews`, name: "code_reviews", parentId: "claw.database.core", databaseId: "claw.database.core", source }),
  clawPersistentSurface.table({ id: `claw.database.core.table.code_queue`, name: "code_queue", parentId: "claw.database.core", databaseId: "claw.database.core", source }),
  clawPersistentSurface.table({ id: `claw.database.core.table.code_host_syncs`, name: "code_host_syncs", parentId: "claw.database.core", databaseId: "claw.database.core", source }),
  clawPersistentSurface.table({ id: `claw.database.core.table.code_policies`, name: "code_policies", parentId: "claw.database.core", databaseId: "claw.database.core", source }),
  clawPersistentSurface.table({ id: `claw.database.core.table.code_gate_runs`, name: "code_gate_runs", parentId: "claw.database.core", databaseId: "claw.database.core", source }),
  clawPersistentSurface.table({ id: `claw.database.core.table.code_projects`, name: "code_projects", parentId: "claw.database.core", databaseId: "claw.database.core", source }),
  clawPersistentSurface.table({ id: `claw.database.core.table.code_agents`, name: "code_agents", parentId: "claw.database.core", databaseId: "claw.database.core", source }),
  clawPersistentSurface.index({ id: `claw.database.core.index.code_intents_repo_status_idx`, name: "code_intents_repo_status_idx", parentId: "claw.database.core", databaseId: "claw.database.core", source }),
  clawPersistentSurface.index({ id: `claw.database.core.index.code_reservations_active_idx`, name: "code_reservations_active_idx", parentId: "claw.database.core", databaseId: "claw.database.core", source }),
  clawPersistentSurface.index({ id: `claw.database.core.index.code_checks_intent_name_idx`, name: "code_checks_intent_name_idx", parentId: "claw.database.core", databaseId: "claw.database.core", source }),
  clawPersistentSurface.index({ id: `claw.database.core.index.code_reviews_intent_idx`, name: "code_reviews_intent_idx", parentId: "claw.database.core", databaseId: "claw.database.core", source }),
  clawPersistentSurface.index({ id: `claw.database.core.index.code_gate_runs_intent_idx`, name: "code_gate_runs_intent_idx", parentId: "claw.database.core", databaseId: "claw.database.core", source }),
  clawPersistentSurface.index({ id: `claw.database.core.index.code_projects_status_idx`, name: "code_projects_status_idx", parentId: "claw.database.core", databaseId: "claw.database.core", source }),
  clawPersistentSurface.index({ id: `claw.database.core.index.code_agents_project_idx`, name: "code_agents_project_idx", parentId: "claw.database.core", databaseId: "claw.database.core", source })
];

export const CODE_LEDGER_SCHEMA_SQL = String.raw`
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
    `;

export const CODE_GLOBAL_INDEX_SCHEMA_SQL = String.raw`
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
    `;
