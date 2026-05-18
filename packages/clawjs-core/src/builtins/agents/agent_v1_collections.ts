import type { BuiltinCollectionDefinition, BuiltinFieldDefinition } from "../_types.ts";

const governanceScopeFields: BuiltinFieldDefinition[] = [
  { name: "stewardKind", type: "select", options: ["principal", "entity"] },
  { name: "stewardId", type: "text" },
  { name: "scopeType", type: "text" },
  { name: "scopeId", type: "text" },
  { name: "workspaceId", type: "text" },
  { name: "projectId", type: "text" },
];

const commonJsonFields: BuiltinFieldDefinition[] = [
  { name: "source", type: "json" },
  { name: "links", type: "json" },
  { name: "metadata", type: "json" },
  { name: "archivedAt", type: "date" },
];

export const AGENTS: BuiltinCollectionDefinition = {
  name: "agents",
  displayName: "Agents",
  family: "agents",
  aliases: ["agent", "agents"],
  catalog: {
    purpose: "Durable digital employee definitions and resource-composition roots.",
    evidence: ["human_recognizable", "multi_domain_reuse", "agent_useful"],
    notes: "This is the canonical Agents V1 collection. Placement is modeled by agent_assignments, not deployments.",
  },
  fields: [
    { name: "name", type: "text", required: true },
    { name: "status", type: "select", required: true, options: ["draft", "active", "limited", "paused", "archived", "error"] },
    { name: "agencyMode", type: "select", required: true, options: ["assistant", "worker", "support", "receptionist", "operator", "automation", "workflow_agent", "subagent", "reviewer", "manager"] },
    { name: "role", type: "text", required: true },
    { name: "title", type: "text" },
    { name: "description", type: "text" },
    { name: "logoRef", type: "text" },
    { name: "managerAgentId", type: "relation", relation: { collectionName: "agents", kind: "dependency" } },
    { name: "teamId", type: "text" },
    ...governanceScopeFields,
    { name: "instructions", type: "markdown" },
    { name: "modelTier", type: "select", options: ["fast", "balanced", "smart", "max"] },
    { name: "speedTier", type: "select", options: ["background", "normal", "interactive", "realtime"] },
    { name: "autonomyProfile", type: "select", required: true, options: ["respond_only", "suggest", "act_limited", "act_full"] },
    { name: "defaultExecutionProfileId", type: "relation", relation: { collectionName: "agent_execution_profiles", kind: "dependency" } },
    { name: "defaultMemoryPolicyId", type: "relation", relation: { collectionName: "agent_memory_policies", kind: "dependency" } },
    { name: "defaultBudgetId", type: "relation", relation: { collectionName: "agent_budgets", kind: "dependency" } },
    { name: "schedule", type: "json" },
    { name: "capabilitySummary", type: "json" },
    { name: "favorite", type: "boolean" },
    { name: "retiredAt", type: "date" },
    { name: "retirementSnapshotRef", type: "text" },
    ...commonJsonFields,
  ],
  indexes: [
    { name: "agents_status_idx", fields: ["status"] },
    { name: "agents_mode_idx", fields: ["agencyMode"] },
    { name: "agents_steward_idx", fields: ["stewardKind", "stewardId"] },
    { name: "agents_scope_idx", fields: ["scopeType", "scopeId"] },
    { name: "agents_workspace_idx", fields: ["workspaceId"] },
  ],
};

export const AGENT_ASSIGNMENTS: BuiltinCollectionDefinition = {
  name: "agent_assignments",
  displayName: "Agent Assignments",
  family: "agents",
  aliases: ["agent_assignment", "agent_assignments"],
  fields: [
    { name: "agentId", type: "relation", required: true, relation: { collectionName: "agents", kind: "ownership" } },
    { name: "kind", type: "select", required: true, options: ["internal_mac_chat", "external_web_chat", "external_telegram", "external_whatsapp", "external_email", "support_inbox", "workflow", "automation", "subagent_delegation", "mcp_api", "relay", "custom_channel"] },
    { name: "status", type: "select", required: true, options: ["draft", "pending_approval", "active", "paused", "expired", "revoked", "archived", "error"] },
    { name: "label", type: "text", required: true },
    { name: "channel", type: "text" },
    { name: "endpointRef", type: "text" },
    { name: "executionProfileId", type: "relation", relation: { collectionName: "agent_execution_profiles", kind: "dependency" } },
    { name: "memoryPolicyId", type: "relation", relation: { collectionName: "agent_memory_policies", kind: "dependency" } },
    { name: "budgetId", type: "relation", relation: { collectionName: "agent_budgets", kind: "dependency" } },
    { name: "privacyPolicy", type: "select", required: true, options: ["off", "hashed", "raw_with_retention"] },
    { name: "externalDisclosure", type: "select", required: true, options: ["transparent_agent", "custom_agent_wording"] },
    { name: "respondOnlyDefault", type: "boolean" },
    { name: "scopeJson", type: "json" },
    { name: "startsAt", type: "date" },
    { name: "expiresAt", type: "date" },
    ...commonJsonFields,
  ],
  indexes: [
    { name: "agent_assignments_agent_idx", fields: ["agentId"] },
    { name: "agent_assignments_kind_status_idx", fields: ["kind", "status"] },
  ],
};

export const AGENT_EXECUTION_PROFILES: BuiltinCollectionDefinition = {
  name: "agent_execution_profiles",
  displayName: "Agent Execution Profiles",
  family: "agents",
  aliases: ["agent_execution_profile", "agent_execution_profiles", "execution_profile"],
  fields: [
    { name: "agentId", type: "relation", relation: { collectionName: "agents", kind: "ownership" } },
    { name: "name", type: "text", required: true },
    { name: "runtime", type: "text", required: true },
    { name: "model", type: "text" },
    { name: "modelTier", type: "select", options: ["fast", "balanced", "smart", "max"] },
    { name: "executionMode", type: "select", required: true, options: ["sync", "async", "streaming", "scheduled"] },
    { name: "sandboxJson", type: "json" },
    { name: "hostAccess", type: "select", required: true, options: ["none", "brokered", "native_host"] },
    { name: "networkPolicy", type: "select", required: true, options: ["none", "connector_only", "allowed_hosts", "open"] },
    { name: "resourceGrantsJson", type: "json" },
    ...commonJsonFields,
  ],
  indexes: [
    { name: "agent_execution_profiles_agent_idx", fields: ["agentId"] },
    { name: "agent_execution_profiles_runtime_idx", fields: ["runtime"] },
  ],
};

export const AGENT_RESOURCE_GRANTS: BuiltinCollectionDefinition = {
  name: "agent_resource_grants",
  displayName: "Agent Resource Grants",
  family: "agents",
  aliases: ["agent_resource_grant", "agent_resource_grants", "resource_grant"],
  fields: [
    { name: "agentId", type: "relation", relation: { collectionName: "agents", kind: "ownership" } },
    { name: "assignmentId", type: "relation", relation: { collectionName: "agent_assignments", kind: "dependency" } },
    { name: "executionProfileId", type: "relation", relation: { collectionName: "agent_execution_profiles", kind: "dependency" } },
    { name: "effect", type: "select", required: true, options: ["allow", "deny"] },
    { name: "resourceType", type: "text", required: true },
    { name: "resourceId", type: "text" },
    { name: "action", type: "text", required: true },
    { name: "scopeType", type: "text" },
    { name: "scopeId", type: "text" },
    { name: "duration", type: "text" },
    { name: "expiresAt", type: "date" },
    { name: "approverActorId", type: "relation", relation: { collectionName: "actors", kind: "dependency" } },
    { name: "grantReason", type: "text" },
    ...commonJsonFields,
  ],
  indexes: [
    { name: "agent_resource_grants_agent_idx", fields: ["agentId"] },
    { name: "agent_resource_grants_assignment_idx", fields: ["assignmentId"] },
    { name: "agent_resource_grants_resource_idx", fields: ["resourceType", "resourceId"] },
  ],
};

export const AGENT_MEMORY_POLICIES: BuiltinCollectionDefinition = {
  name: "agent_memory_policies",
  displayName: "Agent Memory Policies",
  family: "agents",
  aliases: ["agent_memory_policy", "agent_memory_policies", "memory_policy"],
  fields: [
    { name: "agentId", type: "relation", relation: { collectionName: "agents", kind: "ownership" } },
    { name: "name", type: "text", required: true },
    { name: "readScopesJson", type: "json" },
    { name: "writeScopesJson", type: "json" },
    { name: "writePolicy", type: "select", required: true, options: ["none", "private_only", "scoped", "shared_with_review", "global_allowed"] },
    { name: "crossUserBoundary", type: "select", required: true, options: ["tenant_context", "explicit_grant_only"] },
    { name: "retentionJson", type: "json" },
    { name: "redactionPolicy", type: "select", required: true, options: ["default", "strict", "custom"] },
    ...commonJsonFields,
  ],
  indexes: [
    { name: "agent_memory_policies_agent_idx", fields: ["agentId"] },
  ],
};

export const AGENT_BUDGETS: BuiltinCollectionDefinition = {
  name: "agent_budgets",
  displayName: "Agent Budgets",
  family: "agents",
  aliases: ["agent_budget", "agent_budgets"],
  fields: [
    { name: "agentId", type: "relation", relation: { collectionName: "agents", kind: "ownership" } },
    { name: "assignmentId", type: "relation", relation: { collectionName: "agent_assignments", kind: "dependency" } },
    { name: "name", type: "text", required: true },
    { name: "currency", type: "currency" },
    { name: "limitJson", type: "json" },
    { name: "usageJson", type: "json" },
    { name: "exceededBehavior", type: "select", required: true, options: ["pause_affected_scope", "pause_agent", "require_approval", "deny_action"] },
    { name: "resetsAt", type: "date" },
    ...commonJsonFields,
  ],
  indexes: [
    { name: "agent_budgets_agent_idx", fields: ["agentId"] },
    { name: "agent_budgets_assignment_idx", fields: ["assignmentId"] },
  ],
};

export const AGENT_CONFIG_REVISIONS: BuiltinCollectionDefinition = {
  name: "agent_config_revisions",
  displayName: "Agent Config Revisions",
  family: "agents",
  aliases: ["agent_config_revision", "agent_config_revisions", "config_revision"],
  fields: [
    { name: "agentId", type: "relation", required: true, relation: { collectionName: "agents", kind: "ownership" } },
    { name: "revision", type: "number", required: true },
    { name: "snapshotJson", type: "json" },
    { name: "changedByActorId", type: "relation", relation: { collectionName: "actors", kind: "dependency" } },
    { name: "changeReason", type: "text" },
    ...commonJsonFields,
  ],
  indexes: [
    { name: "agent_config_revisions_agent_idx", fields: ["agentId", "revision"], unique: true },
  ],
};

export const AGENT_EVALUATIONS: BuiltinCollectionDefinition = {
  name: "agent_evaluations",
  displayName: "Agent Evaluations",
  family: "agents",
  aliases: ["agent_evaluation", "agent_evaluations"],
  fields: [
    { name: "agentId", type: "relation", required: true, relation: { collectionName: "agents", kind: "ownership" } },
    { name: "assignmentId", type: "relation", relation: { collectionName: "agent_assignments", kind: "dependency" } },
    { name: "status", type: "select", required: true, options: ["planned", "running", "passed", "failed", "blocked"] },
    { name: "score", type: "number" },
    { name: "criteriaJson", type: "json" },
    { name: "resultJson", type: "json" },
    { name: "evaluatedAt", type: "date" },
    ...commonJsonFields,
  ],
  indexes: [
    { name: "agent_evaluations_agent_idx", fields: ["agentId"] },
    { name: "agent_evaluations_status_idx", fields: ["status"] },
  ],
};

export const AGENT_INCIDENTS: BuiltinCollectionDefinition = {
  name: "agent_incidents",
  displayName: "Agent Incidents",
  family: "agents",
  aliases: ["agent_incident", "agent_incidents"],
  fields: [
    { name: "agentId", type: "relation", required: true, relation: { collectionName: "agents", kind: "ownership" } },
    { name: "assignmentId", type: "relation", relation: { collectionName: "agent_assignments", kind: "dependency" } },
    { name: "runId", type: "relation", relation: { collectionName: "agent_runs", kind: "dependency" } },
    { name: "sessionId", type: "relation", relation: { collectionName: "agent_sessions", kind: "dependency" } },
    { name: "actorId", type: "relation", relation: { collectionName: "actors", kind: "dependency" } },
    { name: "status", type: "select", required: true, options: ["open", "mitigating", "resolved", "archived"] },
    { name: "severity", type: "select", required: true, options: ["info", "low", "medium", "high", "critical"] },
    { name: "summary", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "scopeType", type: "text" },
    { name: "scopeId", type: "text" },
    { name: "redactionJson", type: "json" },
    { name: "detectedAt", type: "date" },
    { name: "resolvedAt", type: "date" },
    ...commonJsonFields,
  ],
  indexes: [
    { name: "agent_incidents_agent_idx", fields: ["agentId"] },
    { name: "agent_incidents_status_idx", fields: ["status", "severity"] },
  ],
};

export const AGENT_BLUEPRINTS: BuiltinCollectionDefinition = {
  name: "agent_blueprints",
  displayName: "Agent Blueprints",
  family: "agents",
  aliases: ["agent_blueprint", "agent_blueprints", "agent_template"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "agencyMode", type: "select", required: true, options: ["assistant", "worker", "support", "receptionist", "operator", "automation", "workflow_agent", "subagent", "reviewer", "manager"] },
    { name: "templateJson", type: "json" },
    { name: "skillRefsJson", type: "json" },
    { name: "skillBindingsJson", type: "json" },
    { name: "safeExportJson", type: "json" },
    { name: "version", type: "number" },
    ...commonJsonFields,
  ],
  indexes: [
    { name: "agent_blueprints_mode_idx", fields: ["agencyMode"] },
  ],
};

export const AGENT_RUNS: BuiltinCollectionDefinition = {
  name: "agent_runs",
  displayName: "Agent Runs",
  family: "agents",
  aliases: ["agent_run", "agent_runs", "run"],
  fields: [
    { name: "agentId", type: "relation", required: true, relation: { collectionName: "agents", kind: "ownership" } },
    { name: "assignmentId", type: "relation", relation: { collectionName: "agent_assignments", kind: "dependency" } },
    { name: "sessionId", type: "relation", relation: { collectionName: "agent_sessions", kind: "dependency" } },
    { name: "status", type: "select", required: true, options: ["queued", "running", "awaiting_input", "succeeded", "failed", "cancelled", "paused"] },
    { name: "executionProfileId", type: "relation", relation: { collectionName: "agent_execution_profiles", kind: "dependency" } },
    { name: "runtime", type: "text" },
    { name: "sandboxJson", type: "json" },
    { name: "costJson", type: "json" },
    { name: "outcomeJson", type: "json" },
    { name: "startedAt", type: "date" },
    { name: "endedAt", type: "date" },
    ...commonJsonFields,
  ],
  indexes: [
    { name: "agent_runs_agent_idx", fields: ["agentId"] },
    { name: "agent_runs_assignment_idx", fields: ["assignmentId"] },
    { name: "agent_runs_status_idx", fields: ["status"] },
  ],
};

export const AGENTS_V1_COLLECTIONS: BuiltinCollectionDefinition[] = [
  AGENTS,
  AGENT_ASSIGNMENTS,
  AGENT_EXECUTION_PROFILES,
  AGENT_RESOURCE_GRANTS,
  AGENT_MEMORY_POLICIES,
  AGENT_BUDGETS,
  AGENT_CONFIG_REVISIONS,
  AGENT_EVALUATIONS,
  AGENT_INCIDENTS,
  AGENT_BLUEPRINTS,
  AGENT_RUNS,
];
