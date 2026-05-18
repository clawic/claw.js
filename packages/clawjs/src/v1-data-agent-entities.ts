import { AgentStoreFS, defaultAgent, type Agent, type Connection, type Personality, type SkillCollection } from "@clawjs/agents";
import {
  createAgentActivityFeed,
  createAgentAuditCoverageReport,
  createAgentBlueprint,
  createAgentConfigRevision,
  createAgentContextPack,
  createAgentControlPanel,
  createAgentCreationReview,
  createAgentDispatchPlan,
  createAgentEvaluation,
  createAgentIncident,
  createAgentOperationalSnapshot,
  createAgentPaperclipImportPlan,
  createAgentPrivacyLifecyclePlan,
  createAgentRetirementPlan,
  createAgentSupportInboxProjection,
  createAgentStorageAudit,
  createAgentToolCatalogProjection,
  evaluateAgentActionSeverity,
  evaluateAgentAutonomyPolicy,
  createAgentSafeSurfaceProjection,
  evaluateAgentAssignmentRoute,
  evaluateAgentBudget,
  evaluateAgentDelegationAccess,
  evaluateAgentEffectiveAccess,
  evaluateAgentMemoryAccess,
  evaluateAgentSupervisorAuthority,
  resolveAgentExternalIdentity,
  type AgentActivityFeedInput,
  type AgentActionSeverityRequest,
  type AgentAuditCoverageInput,
  type AgentAutonomyPolicyInput,
  type AgentBlueprintInput,
  type AgentAssignmentRouteRequest,
  type AgentBudgetPolicy,
  type AgentBudgetRequest,
  type AgentDelegationAccessInput,
  type AgentEffectiveAccessInput,
  type AgentEvaluationInput,
  type AgentExternalIdentityProfile,
  type AgentConfigRevisionInput,
  type AgentContextPackInput,
  type AgentControlPanelInput,
  type AgentCreationReviewInput,
  type AgentDispatchPlanInput,
  type AgentIncidentInput,
  type AgentMemoryAccessRequest,
  type AgentMemoryPolicy,
  type AgentOperationalSnapshotInput,
  type AgentPaperclipImportInput,
  type AgentPrivacyLifecycleInput,
  type AgentRetirementInput,
  type AgentSafeSurfaceProjectionInput,
  type AgentStorageAuditInput,
  type AgentSupervisorAuthorityInput,
  type AgentSupportInboxProjectionInput,
  type AgentToolCatalogProjectionInput,
} from "@clawjs/core";
import type { DatabaseServiceStore } from "@clawjs/database";

import {
  V1_DATA_EXIT_FAILURE,
  V1_DATA_EXIT_OK,
  nowIso,
  parseCsvOrJson,
  parseMaybeJson,
  resolveClawjsDataRoot,
  truthy,
  usage,
  usageError,
  writeUnredactedSuccess,
  writeSuccess,
} from "./v1-data-core.ts";
import type { JsonRecord, V1DataCliInput } from "./v1-data-core.ts";
import { scheduleAgentsCatalogSearchEvent } from "./cli-search-events.ts";

export function runAgentsCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  const agentStore = new AgentStoreFS();
  if (command === "list") {
    const items = agentStore.listAgents();
    syncAgentsProjection(store, items);
    writeAgentEntitySuccess(input, { items });
    return V1_DATA_EXIT_OK;
  }
  if (command === "get") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, "Usage: claw agents get AGENT_ID [--json]");
    const agent = agentStore.readAgent(id);
    writeAgentEntitySuccess(input, agent);
    return agent ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  if (command === "upsert") {
    const agent = agentFromInput(input, agentStore);
    if (!agent) return usageError(input, "Usage: claw agents upsert ID --name NAME [--record JSON] [--json]");
    agentStore.writeAgent(agent);
    syncAgentProjection(store, agent);
    scheduleAgentsCatalogSearchEvent({ operation: "upsert", kind: "agent", id: agent.id, dataDir: resolveClawjsDataRoot(), flags: input.flags });
    writeAgentEntitySuccess(input, agent);
    return V1_DATA_EXIT_OK;
  }
  if (command === "delete") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, "Usage: claw agents delete AGENT_ID [--json]");
    agentStore.deleteAgent(id);
    const changes = store.sqlite.prepare("DELETE FROM agents WHERE id = ?").run(id).changes;
    if (changes > 0) scheduleAgentsCatalogSearchEvent({ operation: "delete", kind: "agent", id, dataDir: resolveClawjsDataRoot(), flags: input.flags });
    writeSuccess(input, { id, deleted: changes > 0 });
    return V1_DATA_EXIT_OK;
  }
  if (command === "schema") {
    writeSuccess(input, {
      model: "agents_v1",
      canonicalCollection: "agents",
      subentities: [
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
      ],
      rootConcept: "agent",
      placementConcept: "agent_assignment",
      defaultPosture: "empty_sandbox_respond_only",
      gates: ["evaluate-access", "delegation-check", "supervisor-check", "route-check", "resolve-external-identity", "project-support-inbox", "memory-check", "budget-check", "action-severity", "autonomy-check", "dispatch-plan", "context-pack", "tool-catalog", "creation-review", "storage-audit", "audit-coverage", "operational-snapshot", "control-panel", "privacy-plan", "paperclip-import", "surface-projection", "config-revision", "incident", "activity-feed", "blueprint", "evaluation", "retirement-plan"],
    });
    return V1_DATA_EXIT_OK;
  }
  if (command === "evaluate-access") {
    const record = recordFlag<AgentEffectiveAccessInput>(input);
    if (!record) return usageError(input, "Usage: claw agents evaluate-access --record JSON [--json]");
    writeSuccess(input, evaluateAgentEffectiveAccess(record));
    return V1_DATA_EXIT_OK;
  }
  if (command === "delegation-check") {
    const record = recordFlag<AgentDelegationAccessInput>(input);
    if (!record) return usageError(input, "Usage: claw agents delegation-check --record JSON [--json]");
    writeSuccess(input, evaluateAgentDelegationAccess(record));
    return V1_DATA_EXIT_OK;
  }
  if (command === "supervisor-check") {
    const record = recordFlag<AgentSupervisorAuthorityInput>(input);
    if (!record) return usageError(input, "Usage: claw agents supervisor-check --record JSON [--json]");
    writeSuccess(input, evaluateAgentSupervisorAuthority(record));
    return V1_DATA_EXIT_OK;
  }
  if (command === "route-check") {
    const record = recordFlag<AgentAssignmentRouteRequest>(input);
    if (!record) return usageError(input, "Usage: claw agents route-check --record JSON [--json]");
    writeSuccess(input, evaluateAgentAssignmentRoute(record));
    return V1_DATA_EXIT_OK;
  }
  if (command === "resolve-external-identity") {
    const record = recordFlag<AgentExternalIdentityProfile & { privacyPolicy?: "off" | "hashed" | "raw_with_retention" }>(input);
    if (!record) return usageError(input, "Usage: claw agents resolve-external-identity --record JSON [--json]");
    writeSuccess(input, resolveAgentExternalIdentity(record, record.privacyPolicy));
    return V1_DATA_EXIT_OK;
  }
  if (command === "project-support-inbox") {
    const record = recordFlag<AgentSupportInboxProjectionInput>(input);
    if (!record) return usageError(input, "Usage: claw agents project-support-inbox --record JSON [--json]");
    writeSuccess(input, createAgentSupportInboxProjection(record));
    return V1_DATA_EXIT_OK;
  }
  if (command === "memory-check") {
    const record = recordFlag<{ policy: AgentMemoryPolicy; request: AgentMemoryAccessRequest }>(input);
    if (!record) return usageError(input, "Usage: claw agents memory-check --record JSON [--json]");
    writeSuccess(input, evaluateAgentMemoryAccess(record.policy, record.request));
    return V1_DATA_EXIT_OK;
  }
  if (command === "budget-check") {
    const record = recordFlag<{ policy: AgentBudgetPolicy; request: AgentBudgetRequest }>(input);
    if (!record) return usageError(input, "Usage: claw agents budget-check --record JSON [--json]");
    writeSuccess(input, evaluateAgentBudget(record.policy, record.request));
    return V1_DATA_EXIT_OK;
  }
  if (command === "action-severity") {
    const record = recordFlag<AgentActionSeverityRequest>(input);
    if (!record) return usageError(input, "Usage: claw agents action-severity --record JSON [--json]");
    writeSuccess(input, evaluateAgentActionSeverity(record));
    return V1_DATA_EXIT_OK;
  }
  if (command === "autonomy-check") {
    const record = recordFlag<AgentAutonomyPolicyInput>(input);
    if (!record) return usageError(input, "Usage: claw agents autonomy-check --record JSON [--json]");
    writeSuccess(input, evaluateAgentAutonomyPolicy(record));
    return V1_DATA_EXIT_OK;
  }
  if (command === "dispatch-plan") {
    const record = recordFlag<AgentDispatchPlanInput>(input);
    if (!record) return usageError(input, "Usage: claw agents dispatch-plan --record JSON [--json]");
    writeSuccess(input, createAgentDispatchPlan(record));
    return V1_DATA_EXIT_OK;
  }
  if (command === "context-pack") {
    const record = recordFlag<AgentContextPackInput>(input);
    if (!record) return usageError(input, "Usage: claw agents context-pack --record JSON [--json]");
    writeSuccess(input, createAgentContextPack(record));
    return V1_DATA_EXIT_OK;
  }
  if (command === "tool-catalog") {
    const record = recordFlag<AgentToolCatalogProjectionInput>(input);
    if (!record) return usageError(input, "Usage: claw agents tool-catalog --record JSON [--json]");
    writeSuccess(input, createAgentToolCatalogProjection(record));
    return V1_DATA_EXIT_OK;
  }
  if (command === "creation-review") {
    const record = recordFlag<AgentCreationReviewInput>(input);
    if (!record) return usageError(input, "Usage: claw agents creation-review --record JSON [--json]");
    writeSuccess(input, createAgentCreationReview(record));
    return V1_DATA_EXIT_OK;
  }
  if (command === "storage-audit") {
    const record = recordFlag<AgentStorageAuditInput>(input) ?? {};
    writeSuccess(input, createAgentStorageAudit(record));
    return V1_DATA_EXIT_OK;
  }
  if (command === "audit-coverage") {
    const record = recordFlag<AgentAuditCoverageInput>(input) ?? {};
    writeSuccess(input, createAgentAuditCoverageReport(record));
    return V1_DATA_EXIT_OK;
  }
  if (command === "operational-snapshot") {
    const record = recordFlag<AgentOperationalSnapshotInput>(input);
    if (!record) return usageError(input, "Usage: claw agents operational-snapshot --record JSON [--json]");
    writeSuccess(input, createAgentOperationalSnapshot(record));
    return V1_DATA_EXIT_OK;
  }
  if (command === "control-panel") {
    const record = recordFlag<AgentControlPanelInput>(input);
    if (!record) return usageError(input, "Usage: claw agents control-panel --record JSON [--json]");
    writeSuccess(input, createAgentControlPanel(record));
    return V1_DATA_EXIT_OK;
  }
  if (command === "privacy-plan") {
    const record = recordFlag<AgentPrivacyLifecycleInput>(input);
    if (!record) return usageError(input, "Usage: claw agents privacy-plan --record JSON [--json]");
    writeSuccess(input, createAgentPrivacyLifecyclePlan(record));
    return V1_DATA_EXIT_OK;
  }
  if (command === "paperclip-import") {
    const record = recordFlag<AgentPaperclipImportInput>(input);
    if (!record) return usageError(input, "Usage: claw agents paperclip-import --record JSON [--json]");
    writeSuccess(input, createAgentPaperclipImportPlan(record));
    return V1_DATA_EXIT_OK;
  }
  if (command === "surface-projection") {
    const record = recordFlag<AgentSafeSurfaceProjectionInput>(input);
    if (!record) return usageError(input, "Usage: claw agents surface-projection --record JSON [--json]");
    writeSuccess(input, createAgentSafeSurfaceProjection(record));
    return V1_DATA_EXIT_OK;
  }
  if (command === "config-revision") {
    const record = recordFlag<AgentConfigRevisionInput>(input);
    if (!record) return usageError(input, "Usage: claw agents config-revision --record JSON [--json]");
    writeSuccess(input, createAgentConfigRevision(record));
    return V1_DATA_EXIT_OK;
  }
  if (command === "incident") {
    const record = recordFlag<AgentIncidentInput>(input);
    if (!record) return usageError(input, "Usage: claw agents incident --record JSON [--json]");
    writeSuccess(input, createAgentIncident(record));
    return V1_DATA_EXIT_OK;
  }
  if (command === "activity-feed") {
    const record = recordFlag<AgentActivityFeedInput>(input);
    if (!record) return usageError(input, "Usage: claw agents activity-feed --record JSON [--json]");
    writeSuccess(input, createAgentActivityFeed(record));
    return V1_DATA_EXIT_OK;
  }
  if (command === "blueprint") {
    const record = recordFlag<AgentBlueprintInput>(input);
    if (!record) return usageError(input, "Usage: claw agents blueprint --record JSON [--json]");
    writeSuccess(input, createAgentBlueprint(record));
    return V1_DATA_EXIT_OK;
  }
  if (command === "evaluation") {
    const record = recordFlag<AgentEvaluationInput>(input);
    if (!record) return usageError(input, "Usage: claw agents evaluation --record JSON [--json]");
    writeSuccess(input, createAgentEvaluation(record));
    return V1_DATA_EXIT_OK;
  }
  if (command === "retirement-plan") {
    const record = recordFlag<AgentRetirementInput>(input);
    if (!record) return usageError(input, "Usage: claw agents retirement-plan --record JSON [--json]");
    writeSuccess(input, createAgentRetirementPlan(record));
    return V1_DATA_EXIT_OK;
  }
  return usageError(input, usage(input.binName, "agents"));
}

export function runPersonalitiesCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  const agentStore = new AgentStoreFS();
  if (command === "list") {
    const items = agentStore.listPersonalities();
    syncPersonalitiesProjection(store, items);
    writeAgentEntitySuccess(input, { items });
    return V1_DATA_EXIT_OK;
  }
  if (command === "get") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, "Usage: claw personalities get PERSONALITY_ID [--json]");
    const personality = agentStore.readPersonality(id);
    writeAgentEntitySuccess(input, personality);
    return personality ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  if (command === "upsert") {
    const personality = personalityFromInput(input);
    if (!personality) return usageError(input, "Usage: claw personalities upsert ID --name NAME [--prompt TEXT] [--json]");
    agentStore.writePersonality(personality);
    syncPersonalityProjection(store, personality);
    scheduleAgentsCatalogSearchEvent({ operation: "upsert", kind: "personality", id: personality.id, dataDir: resolveClawjsDataRoot(), flags: input.flags });
    writeAgentEntitySuccess(input, personality);
    return V1_DATA_EXIT_OK;
  }
  if (command === "delete") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, "Usage: claw personalities delete PERSONALITY_ID [--json]");
    agentStore.deletePersonality(id);
    const changes = store.sqlite.prepare("DELETE FROM personalities WHERE id = ?").run(id).changes;
    if (changes > 0) scheduleAgentsCatalogSearchEvent({ operation: "delete", kind: "personality", id, dataDir: resolveClawjsDataRoot(), flags: input.flags });
    writeSuccess(input, { id, deleted: changes > 0 });
    return V1_DATA_EXIT_OK;
  }
  return usageError(input, usage(input.binName, "personalities"));
}

export function runSkillCollectionsCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  const agentStore = new AgentStoreFS();
  if (command === "list") {
    const items = agentStore.listCollections();
    syncCollectionsProjection(store, items);
    writeAgentEntitySuccess(input, { items });
    return V1_DATA_EXIT_OK;
  }
  if (command === "get") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, "Usage: claw skill-collections get COLLECTION_ID [--json]");
    const collection = agentStore.readCollection(id);
    writeAgentEntitySuccess(input, collection);
    return collection ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  if (command === "upsert") {
    const collection = collectionFromInput(input);
    if (!collection) return usageError(input, "Usage: claw skill-collections upsert ID --name NAME [--tags a,b] [--json]");
    agentStore.writeCollection(collection);
    syncCollectionProjection(store, collection);
    scheduleAgentsCatalogSearchEvent({ operation: "upsert", kind: "skill_collection", id: collection.id, dataDir: resolveClawjsDataRoot(), flags: input.flags });
    writeAgentEntitySuccess(input, collection);
    return V1_DATA_EXIT_OK;
  }
  if (command === "delete") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, "Usage: claw skill-collections delete COLLECTION_ID [--json]");
    agentStore.deleteCollection(id);
    const changes = store.sqlite.prepare("DELETE FROM skill_collections WHERE id = ?").run(id).changes;
    if (changes > 0) scheduleAgentsCatalogSearchEvent({ operation: "delete", kind: "skill_collection", id, dataDir: resolveClawjsDataRoot(), flags: input.flags });
    writeSuccess(input, { id, deleted: changes > 0 });
    return V1_DATA_EXIT_OK;
  }
  return usageError(input, usage(input.binName, "skill-collections"));
}

export function runConnectionsCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  const agentStore = new AgentStoreFS();
  if (command === "list") {
    const items = agentStore.listConnections();
    syncConnectionsProjection(store, items);
    writeAgentEntitySuccess(input, { items });
    return V1_DATA_EXIT_OK;
  }
  if (command === "get") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, "Usage: claw connections get CONNECTION_ID [--json]");
    const connection = agentStore.readConnection(id);
    writeAgentEntitySuccess(input, connection);
    return connection ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  if (command === "upsert") {
    const connection = connectionFromInput(input);
    if (!connection) return usageError(input, "Usage: claw connections upsert ID --provider PROVIDER --label LABEL --secret-ref REF [--json]");
    agentStore.writeConnection(connection);
    syncConnectionProjection(store, connection);
    scheduleAgentsCatalogSearchEvent({ operation: "upsert", kind: "connection", id: connection.id, dataDir: resolveClawjsDataRoot(), flags: input.flags });
    writeAgentEntitySuccess(input, connection);
    return V1_DATA_EXIT_OK;
  }
  if (command === "delete") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, "Usage: claw connections delete CONNECTION_ID [--json]");
    agentStore.deleteConnection(id);
    const changes = store.sqlite.prepare("DELETE FROM connections WHERE id = ?").run(id).changes;
    if (changes > 0) scheduleAgentsCatalogSearchEvent({ operation: "delete", kind: "connection", id, dataDir: resolveClawjsDataRoot(), flags: input.flags });
    writeSuccess(input, { id, deleted: changes > 0 });
    return V1_DATA_EXIT_OK;
  }
  return usageError(input, usage(input.binName, "connections"));
}

function recordFlag<T>(input: V1DataCliInput): T | null {
  const raw = input.flags.record || input.flags.jsonRecord || input.flags["json-record"];
  if (!raw) return null;
  return parseMaybeJson(raw) as T;
}

function writeAgentEntitySuccess(input: V1DataCliInput, payload: unknown): void {
  if (input.flags["for-host"] === "true") {
    writeUnredactedSuccess(input, payload);
    return;
  }
  writeSuccess(input, payload);
}

function agentFromInput(input: V1DataCliInput, agentStore: AgentStoreFS): Agent | null {
  const record = recordFlag<Agent>(input);
  if (record) return { ...record, updatedAt: nowIso() };
  const id = input.flags.id || input.positionals[2];
  const existing = id ? agentStore.readAgent(id) : null;
  const name = input.flags.name || input.positionals.slice(3).join(" ") || existing?.name || id;
  if (!id || !name) return null;
  return defaultAgent({
    ...existing,
    id,
    name,
    role: input.flags.role ?? existing?.role,
    runtime: (input.flags.runtime ?? existing?.runtime) as Agent["runtime"] | undefined,
    model: input.flags.model ?? existing?.model,
    instructionsFreeText: input.flags.instructions ?? existing?.instructionsFreeText,
    personalityIds: parseCsvOrJson(input.flags.personalities) ?? existing?.personalityIds,
    skillAllowlist: parseCsvOrJson(input.flags.skills) ?? existing?.skillAllowlist,
    skillCollectionIds: parseCsvOrJson(input.flags.collections) ?? existing?.skillCollectionIds,
    secretAllowlist: parseCsvOrJson(input.flags["secret-refs"] || input.flags["secret-ref"]) ?? existing?.secretAllowlist,
    projectIds: parseCsvOrJson(input.flags.projects) ?? existing?.projectIds,
    isBuiltin: input.flags.builtin === undefined ? existing?.isBuiltin : truthy(input.flags.builtin),
    updatedAt: nowIso(),
  });
}

function personalityFromInput(input: V1DataCliInput): Personality | null {
  const record = recordFlag<Personality>(input);
  if (record) return { ...record, updatedAt: nowIso() };
  const id = input.flags.id || input.positionals[2];
  const name = input.flags.name || input.positionals.slice(3).join(" ") || id;
  if (!id || !name) return null;
  const now = nowIso();
  return {
    id,
    name,
    description: input.flags.description || "",
    promptMarkdown: input.flags.prompt || input.flags.body || "",
    version: Number(input.flags.version ?? 1),
    createdAt: input.flags["created-at"] || now,
    updatedAt: now,
  };
}

function collectionFromInput(input: V1DataCliInput): SkillCollection | null {
  const record = recordFlag<SkillCollection>(input);
  if (record) return { ...record, updatedAt: nowIso() };
  const id = input.flags.id || input.positionals[2];
  const name = input.flags.name || input.positionals.slice(3).join(" ") || id;
  if (!id || !name) return null;
  const now = nowIso();
  return {
    id,
    name,
    description: input.flags.description || "",
    includedTags: parseCsvOrJson(input.flags.tags) ?? [],
    createdAt: input.flags["created-at"] || now,
    updatedAt: now,
  };
}

function connectionFromInput(input: V1DataCliInput): Connection | null {
  const record = recordFlag<Connection>(input);
  if (record) return { ...record, updatedAt: nowIso() };
  const id = input.flags.id || input.positionals[2];
  const provider = input.flags.provider || input.flags.service || input.positionals[3];
  const label = input.flags.label || id;
  if (!id || !provider || !label) return null;
  const now = nowIso();
  return {
    id,
    service: provider as Connection["service"],
    label,
    scopes: parseCsvOrJson(input.flags.scopes) ?? [],
    secretRef: input.flags["secret-ref"] || undefined,
    lastSyncAt: input.flags["last-sync-at"] || undefined,
    createdAt: input.flags["created-at"] || now,
    updatedAt: now,
  };
}

function syncAgentsProjection(store: DatabaseServiceStore, agents: Agent[]) {
  for (const agent of agents) syncAgentProjection(store, agent);
}

function syncAgentProjection(store: DatabaseServiceStore, agent: Agent) {
  const metadata = agent as Agent & Record<string, unknown>;
  const workspaceId = firstString(metadata.workspaceId, agent.projectIds[0]);
  const projectId = firstString(metadata.projectId, agent.projectIds[0]);
  const scopeType = firstString(metadata.scopeType, projectId ? "project" : workspaceId ? "workspace" : null);
  const scopeId = firstString(metadata.scopeId, projectId, workspaceId);
  const legacyOwnerKind = metadata[["owner", "Kind"].join("")];
  const legacyOwnerId = metadata[["owner", "Id"].join("")];
  store.sqlite.prepare(`
    INSERT INTO agents (
      id, kind, name, status, agency_mode, role, title, description, steward_kind,
      steward_id, scope_type, scope_id, owner_kind, owner_id, workspace_id,
      project_id, runtime, model, autonomy_profile,
      default_execution_profile_id, default_memory_policy_id, default_budget_id,
      builtin, secret_ref, config_json, export_path, retired_at,
      retirement_snapshot_ref, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, name = excluded.name,
      status = excluded.status, agency_mode = excluded.agency_mode, role = excluded.role,
      title = excluded.title, description = excluded.description,
      steward_kind = excluded.steward_kind, steward_id = excluded.steward_id,
      scope_type = excluded.scope_type, scope_id = excluded.scope_id, owner_kind = excluded.owner_kind,
      owner_id = excluded.owner_id, workspace_id = excluded.workspace_id, project_id = excluded.project_id,
      runtime = excluded.runtime, model = excluded.model, autonomy_profile = excluded.autonomy_profile,
      default_execution_profile_id = excluded.default_execution_profile_id,
      default_memory_policy_id = excluded.default_memory_policy_id,
      default_budget_id = excluded.default_budget_id, builtin = excluded.builtin,
      secret_ref = excluded.secret_ref, config_json = excluded.config_json,
      export_path = excluded.export_path, retired_at = excluded.retired_at,
      retirement_snapshot_ref = excluded.retirement_snapshot_ref, updated_at = excluded.updated_at
  `).run(
    agent.id,
    "agent",
    agent.name,
    stringValue(metadata.status, "active"),
    stringValue(metadata.agencyMode, "assistant"),
    agent.role,
    stringValue(metadata.title),
    stringValue(metadata.description),
    stringValue(metadata.stewardKind, legacyOwnerKind ? "entity" : null),
    stringValue(metadata.stewardId, stringValue(legacyOwnerId)),
    scopeType,
    scopeId,
    stringValue(legacyOwnerKind),
    stringValue(legacyOwnerId),
    workspaceId,
    projectId,
    agent.runtime,
    agent.model,
    agent.autonomyLevel === "observe" ? "respond_only" : agent.autonomyLevel,
    stringValue(metadata.defaultExecutionProfileId),
    stringValue(metadata.defaultMemoryPolicyId),
    stringValue(metadata.defaultBudgetId),
    agent.isBuiltin ? 1 : 0,
    agent.secretAllowlist[0] ?? null,
    JSON.stringify(agent),
    `agents/${agent.id}`,
    stringValue(metadata.retiredAt),
    stringValue(metadata.retirementSnapshotRef),
    agent.createdAt,
    agent.updatedAt,
  );
}

function stringValue(value: unknown, fallback: string | null = null): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = stringValue(value);
    if (normalized) return normalized;
  }
  return null;
}

function syncPersonalitiesProjection(store: DatabaseServiceStore, personalities: Personality[]) {
  for (const personality of personalities) syncPersonalityProjection(store, personality);
}

function syncPersonalityProjection(store: DatabaseServiceStore, personality: Personality) {
  store.sqlite.prepare(`
    INSERT INTO personalities (id, name, description, prompt, version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description,
      prompt = excluded.prompt, version = excluded.version, updated_at = excluded.updated_at
  `).run(personality.id, personality.name, personality.description, personality.promptMarkdown, personality.version, personality.createdAt, personality.updatedAt);
}

function syncCollectionsProjection(store: DatabaseServiceStore, collections: SkillCollection[]) {
  for (const collection of collections) syncCollectionProjection(store, collection);
}

function syncCollectionProjection(store: DatabaseServiceStore, collection: SkillCollection) {
  store.sqlite.prepare(`
    INSERT INTO skill_collections (id, name, description, skills_json, metadata_json, export_path, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description,
      skills_json = excluded.skills_json, metadata_json = excluded.metadata_json,
      export_path = excluded.export_path, updated_at = excluded.updated_at
  `).run(
    collection.id,
    collection.name,
    collection.description,
    JSON.stringify([]),
    JSON.stringify({ includedTags: collection.includedTags }),
    `skill-collections/${collection.id}`,
    collection.createdAt,
    collection.updatedAt,
  );
}

function syncConnectionsProjection(store: DatabaseServiceStore, connections: Connection[]) {
  for (const connection of connections) syncConnectionProjection(store, connection);
}

function syncConnectionProjection(store: DatabaseServiceStore, connection: Connection) {
  const metadata: JsonRecord = {
    scopes: connection.scopes,
    ...(connection.lastSyncAt ? { lastSyncAt: connection.lastSyncAt } : {}),
  };
  store.sqlite.prepare(`
    INSERT INTO connections (id, provider, label, secret_ref, config_json, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET provider = excluded.provider, label = excluded.label,
      secret_ref = excluded.secret_ref, config_json = excluded.config_json,
      metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
  `).run(connection.id, connection.service, connection.label, connection.secretRef ?? null, JSON.stringify(connection), JSON.stringify(metadata), connection.createdAt, connection.updatedAt);
}
