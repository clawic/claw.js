import { clawPersistentSurface } from "@clawjs/core";

const v1MainDatabaseId = "claw.database.core";
const v1AgentDataSchemaSource = {
  file: "packages/clawjs/src/v1-data-agent-surfaces.ts",
  language: "typescript",
} as const;

export const v1AgentDataSurfaceNodes = [
  "personalities",
  "agent_assignments",
  "agent_execution_profiles",
  "agent_resource_grants",
  "agent_memory_policies",
  "agent_budgets",
  "agent_config_revisions",
  "agent_evaluations",
  "agent_incidents",
  "agent_blueprints",
  "agent_runs",
  "agent_sessions",
  "agent_session_activities",
  "provider_routing",
  "provider_settings",
  "snippets",
].map((name) =>
  clawPersistentSurface.table({
    id: `claw.database.core.table.${name}`,
    name,
    parentId: v1MainDatabaseId,
    databaseId: v1MainDatabaseId,
    source: v1AgentDataSchemaSource,
  }),
);

export const V1_AGENT_DATA_SCHEMA_SQL = String.raw`
    CREATE TABLE IF NOT EXISTS personalities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      prompt TEXT NOT NULL DEFAULT '',
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agent_assignments (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      label TEXT NOT NULL,
      channel TEXT,
      endpoint_ref TEXT,
      execution_profile_id TEXT,
      memory_policy_id TEXT,
      budget_id TEXT,
      privacy_policy TEXT NOT NULL DEFAULT 'hashed',
      external_disclosure TEXT NOT NULL DEFAULT 'transparent_agent',
      respond_only_default INTEGER NOT NULL DEFAULT 1,
      scope_json TEXT NOT NULL DEFAULT '{}',
      starts_at TEXT,
      expires_at TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS agent_assignments_agent_idx ON agent_assignments(agent_id);
    CREATE INDEX IF NOT EXISTS agent_assignments_kind_status_idx ON agent_assignments(kind, status);
    CREATE TABLE IF NOT EXISTS agent_execution_profiles (
      id TEXT PRIMARY KEY,
      agent_id TEXT,
      name TEXT NOT NULL,
      runtime TEXT NOT NULL,
      model TEXT,
      model_tier TEXT,
      execution_mode TEXT NOT NULL DEFAULT 'async',
      sandbox_json TEXT NOT NULL DEFAULT '{}',
      host_access TEXT NOT NULL DEFAULT 'none',
      network_policy TEXT NOT NULL DEFAULT 'none',
      resource_grants_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS agent_execution_profiles_agent_idx ON agent_execution_profiles(agent_id);
    CREATE TABLE IF NOT EXISTS agent_resource_grants (
      id TEXT PRIMARY KEY,
      agent_id TEXT,
      assignment_id TEXT,
      execution_profile_id TEXT,
      effect TEXT NOT NULL DEFAULT 'allow',
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      action TEXT NOT NULL,
      scope_type TEXT,
      scope_id TEXT,
      duration TEXT,
      expires_at TEXT,
      approver_actor_id TEXT,
      grant_reason TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
      FOREIGN KEY (assignment_id) REFERENCES agent_assignments(id) ON DELETE CASCADE,
      FOREIGN KEY (execution_profile_id) REFERENCES agent_execution_profiles(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS agent_resource_grants_agent_idx ON agent_resource_grants(agent_id);
    CREATE INDEX IF NOT EXISTS agent_resource_grants_assignment_idx ON agent_resource_grants(assignment_id);
    CREATE TABLE IF NOT EXISTS agent_memory_policies (
      id TEXT PRIMARY KEY,
      agent_id TEXT,
      name TEXT NOT NULL,
      read_scopes_json TEXT NOT NULL DEFAULT '[]',
      write_scopes_json TEXT NOT NULL DEFAULT '[]',
      write_policy TEXT NOT NULL DEFAULT 'private_only',
      cross_user_boundary TEXT NOT NULL DEFAULT 'tenant_context',
      retention_json TEXT NOT NULL DEFAULT '{}',
      redaction_policy TEXT NOT NULL DEFAULT 'default',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS agent_memory_policies_agent_idx ON agent_memory_policies(agent_id);
    CREATE TABLE IF NOT EXISTS agent_budgets (
      id TEXT PRIMARY KEY,
      agent_id TEXT,
      assignment_id TEXT,
      name TEXT NOT NULL,
      currency TEXT,
      limit_json TEXT NOT NULL DEFAULT '{}',
      usage_json TEXT NOT NULL DEFAULT '{}',
      exceeded_behavior TEXT NOT NULL DEFAULT 'pause_affected_scope',
      resets_at TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
      FOREIGN KEY (assignment_id) REFERENCES agent_assignments(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS agent_budgets_agent_idx ON agent_budgets(agent_id);
    CREATE TABLE IF NOT EXISTS agent_config_revisions (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL DEFAULT '{}',
      changed_by_actor_id TEXT,
      change_reason TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      UNIQUE(agent_id, revision),
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS agent_evaluations (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      assignment_id TEXT,
      status TEXT NOT NULL DEFAULT 'planned',
      score REAL,
      criteria_json TEXT NOT NULL DEFAULT '{}',
      result_json TEXT NOT NULL DEFAULT '{}',
      evaluated_at TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
      FOREIGN KEY (assignment_id) REFERENCES agent_assignments(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS agent_evaluations_agent_idx ON agent_evaluations(agent_id);
    CREATE TABLE IF NOT EXISTS agent_incidents (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      assignment_id TEXT,
      run_id TEXT,
      session_id TEXT,
      actor_id TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      severity TEXT NOT NULL DEFAULT 'low',
      summary TEXT NOT NULL,
      description TEXT,
      scope_type TEXT,
      scope_id TEXT,
      redaction_json TEXT NOT NULL DEFAULT '{}',
      detected_at TEXT,
      resolved_at TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
      FOREIGN KEY (assignment_id) REFERENCES agent_assignments(id) ON DELETE SET NULL,
      FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS agent_incidents_agent_idx ON agent_incidents(agent_id);
    CREATE TABLE IF NOT EXISTS agent_blueprints (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      agency_mode TEXT NOT NULL,
      template_json TEXT NOT NULL DEFAULT '{}',
      safe_export_json TEXT NOT NULL DEFAULT '{}',
      version INTEGER NOT NULL DEFAULT 1,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS agent_blueprints_mode_idx ON agent_blueprints(agency_mode);
    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      assignment_id TEXT,
      session_id TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      execution_profile_id TEXT,
      runtime TEXT,
      sandbox_json TEXT NOT NULL DEFAULT '{}',
      cost_json TEXT NOT NULL DEFAULT '{}',
      outcome_json TEXT NOT NULL DEFAULT '{}',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      started_at TEXT,
      ended_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
      FOREIGN KEY (assignment_id) REFERENCES agent_assignments(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS agent_runs_agent_idx ON agent_runs(agent_id);
    CREATE INDEX IF NOT EXISTS agent_runs_assignment_idx ON agent_runs(assignment_id);
    CREATE TABLE IF NOT EXISTS agent_sessions (
      id TEXT PRIMARY KEY,
      company_id TEXT,
      agent_id TEXT,
      assignment_id TEXT,
      external_actor_id TEXT,
      contact_id TEXT,
      customer_id TEXT,
      initiator_actor_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      initial_source TEXT,
      conversation_kind TEXT,
      support_thread_id TEXT,
      context_json TEXT NOT NULL DEFAULT '{}',
      summary TEXT,
      read_at TEXT,
      linked_issue_id TEXT,
      linked_task_id TEXT,
      source_json TEXT NOT NULL DEFAULT '{}',
      links_json TEXT NOT NULL DEFAULT '{}',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL,
      FOREIGN KEY (assignment_id) REFERENCES agent_assignments(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS agent_sessions_company_idx ON agent_sessions(company_id);
    CREATE INDEX IF NOT EXISTS agent_sessions_status_idx ON agent_sessions(status);
    CREATE INDEX IF NOT EXISTS agent_sessions_agent_idx ON agent_sessions(agent_id);
    CREATE INDEX IF NOT EXISTS agent_sessions_assignment_idx ON agent_sessions(assignment_id);
    CREATE TABLE IF NOT EXISTS agent_session_activities (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      actor_id TEXT,
      body TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS agent_session_activities_session_idx ON agent_session_activities(session_id);
    CREATE TABLE IF NOT EXISTS provider_routing (
      id TEXT PRIMARY KEY,
      feature TEXT NOT NULL,
      capability TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT,
      account_ref TEXT,
      policy_json TEXT NOT NULL DEFAULT '{}',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(feature, capability)
    );
    CREATE TABLE IF NOT EXISTS provider_settings (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL UNIQUE,
      enabled INTEGER NOT NULL DEFAULT 1,
      policy_json TEXT NOT NULL DEFAULT '{}',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS snippets (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      shortcut TEXT,
      scope_json TEXT NOT NULL DEFAULT '{}',
      skill_refs_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
`;
