import type { AgentToolDescriptor, AgentToolRiskLevel } from "./agent_tools.ts";
import type { BuiltinCollectionDefinition, BuiltinFieldDefinition } from "./builtins/_types.ts";
import type { RegulatedDecisionEffect, RegulatedDomain, SensitiveRecordClass } from "./regulated-domain-safety.ts";
import { evaluateRegulatedAction } from "./regulated-domain-safety.ts";
import { AGENTS_FAMILY } from "./builtins/agents/index.ts";


import {
  AGENCY_MODES,
  AGENT_ASSIGNMENT_KINDS,
  AGENT_ASSIGNMENT_STATUSES,
  AGENT_RESOURCE_ACTIONS,
  type AgencyMode,
  type AgentAccessRequest,
  type AgentActionSeverity,
  type AgentActionSeverityRequest,
  type AgentActionSeverityResult,
  type AgentActivityFeed,
  type AgentActivityFeedInput,
  type AgentActivityFeedItem,
  type AgentActivityFeedItemKind,
  type AgentAssignmentKind,
  type AgentAssignmentPrivacyPolicy,
  type AgentAssignmentRoute,
  type AgentAssignmentRouteRequest,
  type AgentAssignmentRouteResult,
  type AgentAssignmentStatus,
  type AgentAuditCoverageInput,
  type AgentAuditCoverageInvalidEvent,
  type AgentAuditCoverageReport,
  type AgentAuditEvent,
  type AgentAuditEventKind,
  type AgentAutonomyDispatchMode,
  type AgentAutonomyPolicyInput,
  type AgentAutonomyPolicyResult,
  type AgentAutonomyProfile,
  type AgentBlueprint,
  type AgentBlueprintInput,
  type AgentBlueprintStatus,
  type AgentBudgetDimension,
  type AgentBudgetEvaluationResult,
  type AgentBudgetExceededBehavior,
  type AgentBudgetLimit,
  type AgentBudgetPolicy,
  type AgentBudgetRequest,
  type AgentConfigRevision,
  type AgentConfigRevisionInput,
  type AgentConfigRevisionStatus,
  type AgentContextPack,
  type AgentContextPackDeniedItem,
  type AgentContextPackEntry,
  type AgentContextPackInput,
  type AgentContextPackItem,
  type AgentContextScope,
  type AgentContextViewPolicy,
  type AgentControlPanel,
  type AgentControlPanelInput,
  type AgentCreationReview,
  type AgentCreationReviewInput,
  type AgentDelegationAccessInput,
  type AgentDispatchDisposition,
  type AgentDispatchPlan,
  type AgentDispatchPlanInput,
  type AgentDispatchRunStatus,
  type AgentEffectiveAccessInput,
  type AgentEffectiveAccessResult,
  type AgentEvaluation,
  type AgentEvaluationInput,
  type AgentEvaluationStatus,
  type AgentExecutionMode,
  type AgentExecutionProfileDispatch,
  type AgentExternalDisclosure,
  type AgentExternalIdentityProfile,
  type AgentGrantEffect,
  type AgentIncident,
  type AgentIncidentInput,
  type AgentIncidentSeverity,
  type AgentIncidentStatus,
  type AgentMemoryAccessRequest,
  type AgentMemoryAccessResult,
  type AgentMemoryLayer,
  type AgentMemoryOperation,
  type AgentMemoryPolicy,
  type AgentMemoryScope,
  type AgentMemoryScopeAccess,
  type AgentMemoryWritePolicy,
  type AgentOperationalSnapshot,
  type AgentOperationalSnapshotInput,
  type AgentOperationalSnapshotSummary,
  type AgentPaperclipImportInput,
  type AgentPaperclipImportPlan,
  type AgentPermissionEscalationRequest,
  type AgentPrivacyLifecycleAction,
  type AgentPrivacyLifecycleDisposition,
  type AgentPrivacyLifecycleInput,
  type AgentPrivacyLifecycleOperation,
  type AgentPrivacyLifecyclePlan,
  type AgentPrivacyLifecycleSubject,
  type AgentRegulatedSafetyDeclaration,
  type AgentResolvedExternalIdentity,
  type AgentResourceAction,
  type AgentResourceGrant,
  type AgentRetirementInput,
  type AgentRetirementPlan,
  type AgentSafeExportInput,
  type AgentSafePackageExport,
  type AgentSafeSurfaceKind,
  type AgentSafeSurfaceProjection,
  type AgentSafeSurfaceProjectionInput,
  type AgentServiceApiHttpRequest,
  type AgentServiceApiHttpResponse,
  type AgentServiceApiOperation,
  type AgentServiceApiRequest,
  type AgentServiceApiResponse,
  type AgentSkillBinding,
  type AgentStorageAudit,
  type AgentStorageAuditInput,
  type AgentSupervisorAction,
  type AgentSupervisorAuthorityInput,
  type AgentSupervisorAuthorityLevel,
  type AgentSupervisorAuthorityResult,
  type AgentSupportInboxProjection,
  type AgentSupportInboxProjectionInput,
  type AgentToolCatalogBlockedItem,
  type AgentToolCatalogProjection,
  type AgentToolCatalogProjectionInput,
  type AgentToolCatalogProjectionItem
} from "./agents-v1-types.ts";

export function createAgentPrivacyLifecyclePlan(input: AgentPrivacyLifecycleInput): AgentPrivacyLifecyclePlan {
  const redaction = input.redaction ?? "strict";
  const requestedAt = input.requestedAt ?? new Date().toISOString();
  const agentId = typeof input.agent.id === "string" ? input.agent.id : "agent.unknown";
  const legalHoldRecordIds = new Set(input.legalHoldRecordIds ?? []);
  const matching = agentPrivacyLifecycleRecords(input, redaction);
  const actions = matching.map(({ collection, record }) => agentPrivacyLifecycleAction(
    collection,
    record,
    input.operation,
    input.subject,
    requestedAt,
    legalHoldRecordIds,
  ));
  const exportRecords = input.operation === "export"
    ? matching.map(({ collection, record }) => ({ collection, record: redactAgentBoundaryValue(record, redaction) as Record<string, unknown> }))
    : [];
  const exportPackage = input.operation === "export"
    ? createAgentSafePackageExport({
      agent: input.agent,
      assignments: matching.filter((entry) => entry.collection === "agent_assignments").map((entry) => entry.record),
      configRevisions: matching.filter((entry) => entry.collection === "agent_config_revisions").map((entry) => entry.record),
      exportedAt: requestedAt,
      redaction,
    })
    : undefined;
  const gaps = agentPrivacyLifecycleGaps(input, matching, actions);
  return {
    schemaVersion: 1,
    planKind: "claw_agent_privacy_lifecycle_plan",
    operation: input.operation,
    subject: input.subject,
    agentId,
    requestedAt,
    actions,
    ...(exportPackage ? { exportPackage } : {}),
    exportRecords,
    gaps,
    audit: createAgentAuditEvent({
      kind: "privacy_lifecycle",
      agentId,
      actorId: input.actorId,
      result: gaps.length === 0 ? "recorded" : "blocked",
      reason: `agent privacy lifecycle ${input.operation}`,
      redaction,
      createdAt: requestedAt,
      metadata: {
        operation: input.operation,
        subject: input.subject,
        actionCount: actions.length,
        legalHoldCount: actions.filter((action) => action.disposition === "retain").length,
        gaps,
      },
    }),
  };
}

export function createAgentPaperclipImportPlan(input: AgentPaperclipImportInput): AgentPaperclipImportPlan {
  const redaction = input.redaction ?? "strict";
  const importedAt = input.importedAt ?? new Date().toISOString();
  const packageId = input.packageId ?? `paperclip_import_${stableHash([
    input.package?.name ?? "",
    input.agentsMd ?? "",
    importedAt,
  ].join("|"))}`;
  const importedAgents = [
    ...paperclipAgentsFromMarkdown(input.agentsMd),
    ...((input.package?.agents ?? []).map((agent, index) => paperclipAgentFromRecord(agent, index))),
  ];
  const warnings = new Set<string>();
  const gaps = new Set<string>();
  if (!input.agentsMd && !input.package) gaps.add("paperclip_source_missing");
  if (input.package?.metadata) warnings.add("paperclip_metadata_imported_as_redacted_blueprint_context");
  if (input.package?.skills && input.package.skills.length > 0) warnings.add("paperclip_skills_mapped_to_claw_skill_bindings");
  if (importedAgents.length === 0) gaps.add("paperclip_agents_missing");
  const blueprints = importedAgents.map((agent, index) => createAgentBlueprint({
    id: agent.id ?? `paperclip_agent_${stableHash([packageId, agent.name, index].join("|"))}`,
    name: agent.name,
    description: agent.description,
    agencyMode: agent.agencyMode,
    modelTier: agent.modelTier,
    skillBindings: normalizeAgentSkillBindings(agent.skillRefs, [
      ...(input.package?.skills ?? []),
      ...(agent.skillBindings ?? []),
    ], redaction),
    requiredResourceGrants: agent.requiredResourceGrants,
    template: {
      sourceFormat: "paperclip",
      packageId,
      stewardId: input.defaultStewardId,
      role: agent.role,
      instructions: agent.instructions,
      metadata: input.package?.metadata,
    },
    status: "draft",
    createdAt: importedAt,
    redaction,
  }));
  const safePackages = blueprints.map((blueprint) => blueprint.safeExport);
  return {
    schemaVersion: 1,
    planKind: "claw_agent_paperclip_import_plan",
    packageId,
    importedAt,
    source: input.agentsMd && input.package ? "mixed" : input.agentsMd ? "agents_md" : "package",
    dependencyPolicy: "paperclip_not_required",
    blueprints,
    safePackages,
    warnings: [...warnings],
    gaps: [...gaps],
    audit: createAgentAuditEvent({
      kind: "paperclip_import",
      agentId: packageId,
      result: gaps.size === 0 ? "recorded" : "blocked",
      reason: "optional Paperclip-style agent import compatibility",
      redaction,
      createdAt: importedAt,
      metadata: {
        packageId,
        source: input.agentsMd && input.package ? "mixed" : input.agentsMd ? "agents_md" : "package",
        blueprintCount: blueprints.length,
        warnings: [...warnings],
        gaps: [...gaps],
      },
    }),
  };
}

export function redactAgentBoundaryValue(value: unknown, redaction: "default" | "strict" | "custom" = "default"): unknown {
  if (Array.isArray(value)) return value.map((entry) => redactAgentBoundaryValue(entry, redaction));
  if (!value || typeof value !== "object") return typeof value === "string" && isLocalPrivatePath(value) ? "[REDACTED_LOCAL_PATH]" : value;
  const out: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveAgentKey(key)) {
      out[key] = "[REDACTED]";
    } else if (typeof nestedValue === "string" && (isLocalPrivatePath(nestedValue) || (redaction === "strict" && nestedValue.startsWith("vault://")))) {
      out[key] = nestedValue.startsWith("vault://") ? "[REDACTED_SECRET_REF]" : "[REDACTED_LOCAL_PATH]";
    } else {
      out[key] = redactAgentBoundaryValue(nestedValue, redaction);
    }
  }
  return out;
}

export function createAgentAuditEvent(input: Omit<AgentAuditEvent, "id" | "createdAt" | "metadata" | "redaction"> & {
  id?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
  redaction?: "default" | "strict" | "custom";
}): AgentAuditEvent {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const metadata = redactAgentBoundaryValue(input.metadata ?? {}, input.redaction ?? "default") as Record<string, unknown>;
  const id = input.id ?? `agent_audit_${stableHash([
    input.kind,
    input.agentId,
    input.assignmentId ?? "",
    input.actorId ?? "",
    input.result,
    createdAt,
  ].join("|"))}`;
  return {
    ...input,
    id,
    createdAt,
    redaction: input.redaction ?? "default",
    metadata,
  };
}

export function createAgentConfigRevision(input: AgentConfigRevisionInput): AgentConfigRevision {
  const redaction = input.redaction ?? "strict";
  const createdAt = input.createdAt ?? new Date().toISOString();
  const revision = String(input.revision ?? createdAt);
  const id = `agent_config_revision_${stableHash([
    input.agentId,
    revision,
    input.actorId ?? "",
    input.reason,
    createdAt,
  ].join("|"))}`;
  const configSnapshot = redactAgentBoundaryValue(input.configSnapshot, redaction) as Record<string, unknown>;
  const changedFields = redactArray(input.changedFields, redaction);
  const audit = createAgentAuditEvent({
    kind: "config_revision",
    agentId: input.agentId,
    actorId: input.actorId,
    result: "recorded",
    reason: input.reason,
    redaction,
    createdAt,
    resourceType: "agent_config_revision",
    resourceId: id,
    metadata: {
      revision,
      status: input.status ?? "active",
      previousRevisionId: input.previousRevisionId,
      changedFields,
    },
  });
  return {
    id,
    agentId: input.agentId,
    revision,
    status: input.status ?? "active",
    ...(input.actorId ? { actorId: input.actorId } : {}),
    reason: input.reason,
    ...(input.summary ? { summary: input.summary } : {}),
    ...(input.previousRevisionId ? { previousRevisionId: input.previousRevisionId } : {}),
    configSnapshot,
    changedFields,
    createdAt,
    audit,
  };
}

export function createAgentIncident(input: AgentIncidentInput): AgentIncident {
  const redaction = input.redaction ?? "strict";
  const detectedAt = input.detectedAt ?? new Date().toISOString();
  const status = input.status ?? "open";
  const id = `agent_incident_${stableHash([
    input.agentId,
    input.assignmentId ?? "",
    input.runId ?? "",
    input.sessionId ?? "",
    input.severity,
    input.summary,
    detectedAt,
  ].join("|"))}`;
  const metadata = redactAgentBoundaryValue(input.metadata ?? {}, redaction) as Record<string, unknown>;
  const audit = createAgentAuditEvent({
    kind: "incident",
    agentId: input.agentId,
    assignmentId: input.assignmentId,
    actorId: input.actorId,
    result: status === "resolved" || status === "archived" ? "recorded" : "blocked",
    reason: input.summary,
    redaction,
    createdAt: detectedAt,
    resourceType: "agent_incident",
    resourceId: id,
    metadata: {
      severity: input.severity,
      status,
      runId: input.runId,
      sessionId: input.sessionId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      metadata,
    },
  });
  return {
    id,
    agentId: input.agentId,
    ...(input.assignmentId ? { assignmentId: input.assignmentId } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.actorId ? { actorId: input.actorId } : {}),
    severity: input.severity,
    status,
    summary: input.summary,
    ...(input.description ? { description: input.description } : {}),
    ...(input.scopeType ? { scopeType: input.scopeType } : {}),
    ...(input.scopeId ? { scopeId: input.scopeId } : {}),
    detectedAt,
    ...(input.resolvedAt ? { resolvedAt: input.resolvedAt } : {}),
    metadata,
    audit,
  };
}

export function createAgentActivityFeed(input: AgentActivityFeedInput): AgentActivityFeed {
  const redaction = input.redaction ?? "strict";
  const items = [
    ...(input.assignments ?? []).map((record) => activityItem(input.agentId, "assignment", record, redaction)),
    ...(input.runs ?? []).map((record) => activityItem(input.agentId, "run", record, redaction)),
    ...(input.sessions ?? []).map((record) => activityItem(input.agentId, "session", record, redaction)),
    ...(input.evaluations ?? []).map((record) => activityItem(input.agentId, "evaluation", record, redaction)),
    ...(input.incidents ?? []).map((record) => activityItem(input.agentId, "incident", record, redaction)),
    ...(input.configRevisions ?? []).map((record) => activityItem(input.agentId, "config_revision", record, redaction)),
    ...(input.audits ?? []).map((record) => activityItem(input.agentId, "audit", record, redaction)),
  ].sort((a, b) => b.happenedAt.localeCompare(a.happenedAt));
  const requestedLimit = input.limit;
  const limit = typeof requestedLimit === "number" && Number.isInteger(requestedLimit) && requestedLimit > 0 ? requestedLimit : undefined;
  return {
    schemaVersion: 1,
    feedKind: "claw_agent_activity_feed",
    agentId: input.agentId,
    items: limit ? items.slice(0, limit) : items,
    redaction,
  };
}

export function createAgentBlueprint(input: AgentBlueprintInput): AgentBlueprint {
  const redaction = input.redaction ?? "strict";
  const createdAt = input.createdAt ?? new Date().toISOString();
  const version = String(input.version ?? 1);
  const id = input.id ?? `agent_blueprint_${stableHash([
    input.name,
    input.agencyMode,
    version,
    createdAt,
  ].join("|"))}`;
  const template = redactAgentBoundaryValue(input.template, redaction) as Record<string, unknown>;
  const requiredResourceGrants = (input.requiredResourceGrants ?? []).map((grant) => redactAgentBoundaryValue(grant, redaction) as AgentResourceGrant);
  const skillBindings = normalizeAgentSkillBindings(input.skillRefs, input.skillBindings, redaction);
  const skillRefs = skillBindings.map(formatAgentSkillBindingRef);
  const safeExport = createAgentSafePackageExport({
    exportedAt: createdAt,
    redaction,
    agent: {
      id,
      name: input.name,
      agencyMode: input.agencyMode,
      ...(input.description ? { description: input.description } : {}),
      ...(input.modelTier ? { modelTier: input.modelTier } : {}),
      blueprintVersion: version,
      template,
    },
    resourceGrants: requiredResourceGrants.map((grant) => ({ ...grant })),
    skillBindings,
    blueprints: [{ id, name: input.name, agencyMode: input.agencyMode, version, template, skillBindings }],
  });
  const audit = createAgentAuditEvent({
    kind: "blueprint",
    agentId: id,
    result: "recorded",
    reason: "agent blueprint created",
    redaction,
    createdAt,
    resourceType: "agent_blueprint",
    resourceId: id,
    metadata: {
      agencyMode: input.agencyMode,
      version,
      skillRefs,
      skillBindings,
      requiredResourceGrantCount: requiredResourceGrants.length,
    },
  });
  return {
    id,
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    agencyMode: input.agencyMode,
    version,
    template,
    requiredResourceGrants,
    skillRefs,
    skillBindings,
    ...(input.modelTier ? { modelTier: input.modelTier } : {}),
    status: input.status ?? "draft",
    createdAt,
    safeExport,
    audit,
  };
}

export function createAgentEvaluation(input: AgentEvaluationInput): AgentEvaluation {
  const redaction = input.redaction ?? "strict";
  const evaluatedAt = input.evaluatedAt ?? new Date().toISOString();
  const criteria = redactAgentBoundaryValue(input.criteria, redaction) as Record<string, unknown>;
  const result = redactAgentBoundaryValue(input.result ?? {}, redaction) as Record<string, unknown>;
  const id = `agent_evaluation_${stableHash([
    input.agentId,
    input.assignmentId ?? "",
    input.runId ?? "",
    input.evaluatorId ?? "",
    input.status,
    evaluatedAt,
  ].join("|"))}`;
  const audit = createAgentAuditEvent({
    kind: "evaluation",
    agentId: input.agentId,
    assignmentId: input.assignmentId,
    actorId: input.evaluatorId,
    result: input.status === "passed" ? "allowed" : input.status === "failed" || input.status === "blocked" ? "blocked" : "recorded",
    reason: `agent evaluation ${input.status}`,
    redaction,
    createdAt: evaluatedAt,
    resourceType: "agent_evaluation",
    resourceId: id,
    metadata: {
      runId: input.runId,
      score: input.score,
      status: input.status,
      criteria,
      result,
    },
  });
  return {
    id,
    agentId: input.agentId,
    ...(input.assignmentId ? { assignmentId: input.assignmentId } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.evaluatorId ? { evaluatorId: input.evaluatorId } : {}),
    status: input.status,
    ...(input.score !== undefined ? { score: input.score } : {}),
    criteria,
    result,
    evaluatedAt,
    audit,
  };
}

export function createAgentSafePackageExport(input: AgentSafeExportInput): AgentSafePackageExport {
  const redaction = input.redaction ?? "strict";
  const exportedAt = input.exportedAt ?? new Date().toISOString();
  const agent = redactAgentBoundaryValue(input.agent, redaction) as Record<string, unknown>;
  const agentId = typeof input.agent.id === "string" ? input.agent.id : "agent.unknown";
  return {
    schemaVersion: 1,
    packageKind: "claw_agent_package",
    exportedAt,
    redaction,
    agent,
    assignments: redactArray(input.assignments, redaction),
    executionProfiles: redactArray(input.executionProfiles, redaction),
    resourceGrants: redactArray(input.resourceGrants, redaction),
    memoryPolicies: redactArray(input.memoryPolicies, redaction),
    budgets: redactArray(input.budgets, redaction),
    blueprints: redactArray(input.blueprints, redaction),
    skillBindings: normalizeAgentSkillBindings(undefined, input.skillBindings, redaction),
    configRevisions: redactArray(input.configRevisions, redaction),
    audit: createAgentAuditEvent({
      kind: "safe_export",
      agentId,
      result: "recorded",
      reason: "safe package export",
      redaction,
      createdAt: exportedAt,
      metadata: { packageKind: "claw_agent_package" },
    }),
  };
}

export function createAgentSafeSurfaceProjection(input: AgentSafeSurfaceProjectionInput): AgentSafeSurfaceProjection {
  const redaction = input.redaction ?? "strict";
  const projectedAt = input.projectedAt ?? new Date().toISOString();
  const agent = pickAgentSurfaceFields(input.agent, redaction);
  const assignments = (input.assignments ?? []).map((assignment) => pickAssignmentSurfaceFields(assignment, input.surface, redaction));
  const executionProfiles = (input.executionProfiles ?? []).map((profile) => pickExecutionProfileSurfaceFields(profile, redaction));
  const resourceGrants = (input.resourceGrants ?? []).map((grant) => pickResourceGrantSurfaceFields(grant, redaction));
  const memoryPolicies = (input.memoryPolicies ?? []).map((policy) => pickMemoryPolicySurfaceFields(policy, redaction));
  const budgets = (input.budgets ?? []).map((budget) => pickBudgetSurfaceFields(budget, redaction));
  const risks = agentSurfaceRisks(input.surface, assignments, resourceGrants, input.memoryPolicies ?? []);
  const gaps = agentSurfaceGaps(input.surface, assignments, budgets);
  const agentId = typeof input.agent.id === "string" ? input.agent.id : "agent.unknown";
  return {
    schemaVersion: 1,
    projectionKind: "claw_agent_safe_surface",
    surface: input.surface,
    projectedAt,
    agent,
    assignments,
    executionProfiles,
    resourceAccess: {
      grants: resourceGrants,
      brokeredLeaseAllowed: resourceGrants.some((grant) => grant.action === "lease_secret" || grant.action === "*"),
    },
    memory: {
      policies: memoryPolicies,
    },
    budgets,
    risks,
    gaps,
    audit: createAgentAuditEvent({
      kind: "safe_export",
      agentId,
      result: "recorded",
      reason: "safe surface projection",
      redaction,
      createdAt: projectedAt,
      metadata: {
        projectionKind: "claw_agent_safe_surface",
        surface: input.surface,
        assignmentCount: assignments.length,
      },
    }),
  };
}

export function createAgentServiceApiResponse(input: AgentServiceApiRequest): AgentServiceApiResponse {
  const requestedAt = input.requestedAt ?? new Date().toISOString();
  const projection = createAgentSafeSurfaceProjection({
    surface: "service_api",
    projectedAt: requestedAt,
    agent: input.agent,
    assignments: input.assignments,
    executionProfiles: input.executionProfiles,
    resourceGrants: input.resourceGrants,
    memoryPolicies: input.memoryPolicies,
    budgets: input.budgets,
    redaction: input.redaction,
  });
  const errors = projection.gaps.map((gap) => `service_api:${gap}`);
  const agentId = typeof input.agent.id === "string" ? input.agent.id : "agent.unknown";
  const requestId = input.requestId ?? `agent_service_api_${stableHash([
    agentId,
    input.operation,
    requestedAt,
  ].join("|"))}`;
  return {
    schemaVersion: 1,
    apiKind: "claw_agent_service_api",
    requestId,
    operation: input.operation,
    allowed: errors.length === 0,
    errors,
    projection,
    audit: createAgentAuditEvent({
      kind: "service_api",
      agentId,
      result: errors.length === 0 ? "allowed" : "blocked",
      reason: "service API safe projection",
      redaction: input.redaction ?? "strict",
      createdAt: requestedAt,
      metadata: {
        operation: input.operation,
        requestId,
        risks: projection.risks,
        gaps: projection.gaps,
      },
    }),
  };
}

export function createAgentServiceApiHttpResponse(input: AgentServiceApiHttpRequest): AgentServiceApiHttpResponse {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "x-claw-agents-api": "v1",
  };
  if (input.path !== "/v1/agents/service-api") {
    return agentServiceApiError(404, "not_found", "Agents service API route not found.", headers);
  }
  if (input.method.toUpperCase() !== "POST") {
    return agentServiceApiError(405, "method_not_allowed", "Agents service API only accepts POST.", {
      ...headers,
      allow: "POST",
    });
  }
  const body = parseAgentServiceApiBody(input.body);
  if (!body) return agentServiceApiError(400, "invalid_body", "Agents service API requires a JSON request body.", headers);
  const response = createAgentServiceApiResponse({
    ...body,
    requestedAt: body.requestedAt ?? input.receivedAt,
  });
  return {
    status: response.allowed ? 200 : 422,
    headers,
    body: response,
  };
}

export function grantMatches(request: AgentAccessRequest, grant: AgentResourceGrant, now: Date): boolean {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) return false;
  if (grant.expiresAt) {
    const expiresAtMs = new Date(grant.expiresAt).getTime();
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) return false;
  }
  return matches(request.resourceType, grant.resourceType)
    && matches(request.action, grant.action)
    && matchesOptional(request.resourceId, grant.resourceId)
    && matchesOptional(request.scopeType, grant.scopeType)
    && matchesOptional(request.scopeId, grant.scopeId);
}

export function isSecretResourceRequest(request: AgentAccessRequest): boolean {
  return /^(secret|secrets|credential|credentials|vault)$/i.test(request.resourceType);
}

export function matches(value: string | undefined, pattern: string | undefined): boolean {
  return pattern === "*" || value === pattern;
}

export function matchesOptional(value: string | undefined, pattern: string | undefined): boolean {
  if (!pattern || pattern === "*") return true;
  return value === pattern;
}

export function normalizeTime(value: string | Date | undefined): Date {
  if (!value) return new Date();
  return value instanceof Date ? value : new Date(value);
}

export function budgetLimitMatches(limit: AgentBudgetLimit, request: AgentBudgetRequest): boolean {
  return limit.dimension === request.dimension
    && matchesOptional(request.scopeType, limit.scopeType)
    && matchesOptional(request.scopeId, limit.scopeId);
}

export function redactArray(records: Array<Record<string, unknown>> | undefined, redaction: "default" | "strict" | "custom"): Array<Record<string, unknown>> {
  return (records ?? []).map((record) => redactAgentBoundaryValue(record, redaction) as Record<string, unknown>);
}

export function normalizeAgentSkillBindings(
  skillRefs: string[] | undefined,
  skillBindings: AgentSkillBinding[] | undefined,
  redaction: "default" | "strict" | "custom",
): AgentSkillBinding[] {
  const normalized = new Map<string, AgentSkillBinding>();
  for (const skillRef of skillRefs ?? []) {
    const parsed = parseAgentSkillRef(skillRef);
    if (!parsed) continue;
    normalized.set(formatAgentSkillBindingRef(parsed), parsed);
  }
  for (const binding of skillBindings ?? []) {
    const ref = typeof binding.ref === "string" ? binding.ref.trim() : "";
    if (!ref) continue;
    const normalizedBinding: AgentSkillBinding = {
      ref,
      ...(binding.version !== undefined && String(binding.version).trim() ? { version: String(binding.version).trim() } : {}),
      ...(binding.requiredResourceGrants ? {
        requiredResourceGrants: binding.requiredResourceGrants.map((grant) => redactAgentBoundaryValue(grant, redaction) as AgentResourceGrant),
      } : {}),
      ...(binding.requiredAssignmentKinds ? { requiredAssignmentKinds: [...binding.requiredAssignmentKinds] } : {}),
      ...(binding.optional !== undefined ? { optional: Boolean(binding.optional) } : {}),
      ...(binding.metadata ? { metadata: redactAgentBoundaryValue(binding.metadata, redaction) as Record<string, unknown> } : {}),
    };
    normalized.set(formatAgentSkillBindingRef(normalizedBinding), normalizedBinding);
  }
  return [...normalized.values()];
}

export function parseAgentSkillRef(skillRef: string): AgentSkillBinding | undefined {
  const trimmed = skillRef.trim();
  if (!trimmed) return undefined;
  const versionSeparator = trimmed.lastIndexOf("@");
  if (versionSeparator > 0 && versionSeparator < trimmed.length - 1) {
    return {
      ref: trimmed.slice(0, versionSeparator),
      version: trimmed.slice(versionSeparator + 1),
    };
  }
  return { ref: trimmed };
}

export function parseAgentServiceApiBody(body: AgentServiceApiHttpRequest["body"]): AgentServiceApiRequest | null {
  if (!body) return null;
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body) as unknown;
      return isAgentServiceApiRequest(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return isAgentServiceApiRequest(body) ? body : null;
}

export function isAgentServiceApiRequest(value: unknown): value is AgentServiceApiRequest {
  return Boolean(value)
    && typeof value === "object"
    && typeof (value as AgentServiceApiRequest).operation === "string"
    && Boolean((value as AgentServiceApiRequest).agent)
    && typeof (value as AgentServiceApiRequest).agent === "object";
}

export function agentServiceApiError(
  status: number,
  error: string,
  message: string,
  headers: Record<string, string>,
): AgentServiceApiHttpResponse {
  return {
    status,
    headers,
    body: {
      schemaVersion: 1,
      apiKind: "claw_agent_service_api_error",
      error,
      message,
    },
  };
}

export function formatAgentSkillBindingRef(binding: Pick<AgentSkillBinding, "ref" | "version">): string {
  return binding.version ? `${binding.ref}@${binding.version}` : binding.ref;
}

export function activityItem(agentId: string, kind: AgentActivityFeedItemKind, record: Record<string, unknown>, redaction: "default" | "strict" | "custom"): AgentActivityFeedItem {
  const sourceId = stringRecordValue(record, "id") ?? `${kind}_${stableHash(JSON.stringify(redactAgentBoundaryValue(record, redaction)))}`;
  const happenedAt = activityTimestamp(record);
  const assignmentId = stringRecordValue(record, "assignmentId", "assignment_id");
  const runId = kind === "run" ? sourceId : stringRecordValue(record, "runId", "run_id");
  const sessionId = kind === "session" ? sourceId : stringRecordValue(record, "sessionId", "session_id");
  return {
    id: `agent_activity_${stableHash([agentId, kind, sourceId, happenedAt].join("|"))}`,
    agentId,
    kind,
    sourceId,
    happenedAt,
    title: activityTitle(kind, record),
    ...(activitySummary(record) ? { summary: activitySummary(record) } : {}),
    ...(stringRecordValue(record, "status") ? { status: stringRecordValue(record, "status") } : {}),
    ...(stringRecordValue(record, "severity") ? { severity: stringRecordValue(record, "severity") } : {}),
    ...(assignmentId ? { assignmentId } : {}),
    ...(runId ? { runId } : {}),
    ...(sessionId ? { sessionId } : {}),
    metadata: activityMetadata(record, redaction),
  };
}

export function activityTitle(kind: AgentActivityFeedItemKind, record: Record<string, unknown>): string {
  const direct = stringRecordValue(record, "title", "summary", "reason", "name");
  if (direct) return direct;
  if (kind === "config_revision") return `Config revision ${stringRecordValue(record, "revision") ?? "recorded"}`;
  return kind.replace("_", " ");
}

export function activitySummary(record: Record<string, unknown>): string | undefined {
  return stringRecordValue(record, "summary", "description", "reason");
}

export function activityTimestamp(record: Record<string, unknown>): string {
  return stringRecordValue(record, "happenedAt", "detectedAt", "evaluatedAt", "startedAt", "endedAt", "createdAt", "updatedAt", "created_at", "updated_at") ?? new Date(0).toISOString();
}

export function activityMetadata(record: Record<string, unknown>, redaction: "default" | "strict" | "custom"): Record<string, unknown> {
  const metadata = {
    ...(isRecord(record.metadata) ? record.metadata : {}),
    ...(isRecord(record.metadata_json) ? record.metadata_json : {}),
    ...(isRecord(record.costJson) ? { cost: record.costJson } : {}),
    ...(isRecord(record.outcomeJson) ? { outcome: record.outcomeJson } : {}),
    ...(isRecord(record.resultJson) ? { result: record.resultJson } : {}),
    ...(isRecord(record.configSnapshot) ? { configSnapshot: record.configSnapshot } : {}),
  };
  return redactAgentBoundaryValue(metadata, redaction) as Record<string, unknown>;
}

export function stringRecordValue(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function pickAgentSurfaceFields(agent: Record<string, unknown>, redaction: "default" | "strict" | "custom"): Record<string, unknown> {
  return pickRedacted(agent, redaction, [
    "id",
    "name",
    "displayName",
    "logo",
    "avatar",
    "description",
    "role",
    "agencyMode",
    "status",
    "stewardId",
    "stewardKind",
    "scopeType",
    "scopeId",
    "teamId",
    "workspaceId",
    "version",
  ]);
}

export function pickAssignmentSurfaceFields(assignment: Record<string, unknown>, surface: AgentSafeSurfaceKind, redaction: "default" | "strict" | "custom"): Record<string, unknown> {
  const out = pickRedacted(assignment, redaction, [
    "id",
    "agentId",
    "kind",
    "status",
    "channel",
    "privacyPolicy",
    "telemetryRetentionDays",
    "externalDisclosure",
    "scopeType",
    "scopeId",
    "startsAt",
    "expiresAt",
  ]);
  if (surface === "internal_ui" && typeof assignment.endpointRef === "string") out.hasEndpointRef = true;
  return out;
}

export function pickExecutionProfileSurfaceFields(profile: Record<string, unknown>, redaction: "default" | "strict" | "custom"): Record<string, unknown> {
  return pickRedacted(profile, redaction, [
    "id",
    "agentId",
    "assignmentId",
    "runtimeKind",
    "runtimeAdapter",
    "modelTier",
    "speedTier",
    "sandboxProfile",
    "networkPolicy",
    "maxConcurrency",
    "status",
  ]);
}

export function pickResourceGrantSurfaceFields(grant: Record<string, unknown>, redaction: "default" | "strict" | "custom"): Record<string, unknown> {
  return pickRedacted(grant, redaction, [
    "id",
    "agentId",
    "assignmentId",
    "resourceType",
    "resourceId",
    "action",
    "scopeType",
    "scopeId",
    "effect",
    "expiresAt",
  ]);
}

export function pickMemoryPolicySurfaceFields(policy: Record<string, unknown>, redaction: "default" | "strict" | "custom"): Record<string, unknown> {
  return pickRedacted(policy, redaction, [
    "id",
    "agentId",
    "assignmentId",
    "readScopes",
    "writeScopes",
    "writePolicy",
    "crossUserBoundary",
    "retentionPolicy",
  ]);
}

export function pickBudgetSurfaceFields(budget: Record<string, unknown>, redaction: "default" | "strict" | "custom"): Record<string, unknown> {
  return pickRedacted(budget, redaction, [
    "id",
    "agentId",
    "assignmentId",
    "exceededBehavior",
    "limits",
    "status",
  ]);
}

export function contextViewRejectionReasons(view: AgentContextViewPolicy, entry: AgentContextPackEntry): string[] {
  const reasons: string[] = [];
  if (view.allowedResourceTypes && view.allowedResourceTypes.length > 0 && !view.allowedResourceTypes.includes(entry.resourceType)) {
    reasons.push(`context: resource type ${entry.resourceType} outside view`);
  }
  if (view.allowedScopes && view.allowedScopes.length > 0 && !view.allowedScopes.some((scope) => contextScopeMatches(scope, entry))) {
    reasons.push("context: scope outside view");
  }
  return reasons;
}

export function contextScopeMatches(scope: AgentContextScope, entry: AgentContextPackEntry): boolean {
  return scope.scopeType === entry.scopeType && matchesOptional(entry.scopeId, scope.scopeId);
}

export function contextPackItem(
  id: string,
  entry: AgentContextPackEntry,
  action: AgentResourceAction,
  matchedGrantIds: string[],
  includeContent: boolean,
  redaction: "default" | "strict" | "custom",
): AgentContextPackItem {
  const content = redactAgentBoundaryValue(entry.content, redaction);
  const metadata = redactAgentBoundaryValue(entry.metadata ?? {}, redaction) as Record<string, unknown>;
  return {
    id,
    resourceType: entry.resourceType,
    ...(entry.resourceId ? { resourceId: entry.resourceId } : {}),
    action,
    ...(entry.scopeType ? { scopeType: entry.scopeType } : {}),
    ...(entry.scopeId ? { scopeId: entry.scopeId } : {}),
    ...(entry.title ? { title: entry.title } : {}),
    hasContent: entry.content !== undefined,
    ...(includeContent && entry.content !== undefined ? { content } : {}),
    metadata,
    matchedGrantIds,
  };
}

export function contextEntryId(entry: AgentContextPackEntry): string {
  return entry.id ?? `agent_context_${stableHash([
    entry.resourceType,
    entry.resourceId ?? "",
    entry.scopeType ?? "",
    entry.scopeId ?? "",
    entry.title ?? "",
  ].join("|"))}`;
}

export function contextPackGaps(
  requested: AgentContextPackEntry[],
  accepted: AgentContextPackItem[],
  denied: AgentContextPackDeniedItem[],
  limitApplied: boolean,
): string[] {
  const gaps = new Set<string>();
  if (requested.length === 0) gaps.add("context_requested_empty");
  if (requested.length > 0 && accepted.length === 0) gaps.add("context_pack_empty");
  if (limitApplied) gaps.add("context_item_limit_applied");
  const deniedIds = new Set(denied.map((entry) => entry.id));
  if (requested.some((entry) => entry.required === true && deniedIds.has(contextEntryId(entry)))) gaps.add("required_context_denied");
  return [...gaps];
}

export function normalizePositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

export function toolCatalogProjectionItem(
  tool: AgentToolDescriptor,
  matchedGrantIds: string[],
  redaction: "default" | "strict" | "custom",
): AgentToolCatalogProjectionItem {
  return {
    id: tool.id,
    title: tool.title,
    description: tool.description,
    domain: tool.domain,
    sourceFeature: tool.sourceFeature,
    parameters: redactAgentBoundaryValue(tool.parameters, redaction) as AgentToolDescriptor["parameters"],
    riskLevel: tool.riskLevel,
    ...(tool.version ? { version: tool.version } : {}),
    requiresApproval: tool.requiresApproval === true,
    matchedGrantIds,
  };
}

export function toolCatalogGaps(
  requestedTools: AgentToolDescriptor[],
  allowedTools: AgentToolCatalogProjectionItem[],
  blockedTools: AgentToolCatalogBlockedItem[],
): string[] {
  const gaps = new Set<string>();
  if (requestedTools.length === 0) gaps.add("tool_catalog_empty");
  if (requestedTools.length > 0 && allowedTools.length === 0) gaps.add("tool_catalog_all_blocked");
  if (blockedTools.length > 0) gaps.add("tool_catalog_has_blocked_tools");
  return [...gaps];
}

export function creationReviewRequiredApprovals(
  resourceGrants: Array<Record<string, unknown>>,
  executionProfiles: Array<Record<string, unknown>>,
  risks: string[],
): string[] {
  const approvals = new Set<string>();
  if (resourceGrants.some((grant) => grant.action === "*" || grant.action === "lease_secret" || grant.resourceType === "secret")) approvals.add("resource_owner");
  if (executionProfiles.some((profile) => profile.hostAccess === "native_host")) approvals.add("host");
  if (executionProfiles.some((profile) => profile.networkPolicy === "open")) approvals.add("network");
  if (risks.length > 0) approvals.add("risk_review");
  return [...approvals];
}

export function creationReviewGaps(input: AgentCreationReviewInput): string[] {
  const gaps = new Set<string>();
  if (typeof input.agent.id !== "string") gaps.add("agent_id_missing");
  if (typeof input.agent.name !== "string" && typeof input.agent.displayName !== "string") gaps.add("agent_name_missing");
  if ((input.assignments ?? []).length === 0) gaps.add("assignment_missing");
  if ((input.executionProfiles ?? []).length === 0) gaps.add("execution_profile_missing");
  if ((input.budgets ?? []).length === 0 && input.surface !== "internal_ui") gaps.add("budget_policy_missing");
  return [...gaps];
}

export function creationReviewRisks(input: AgentCreationReviewInput): string[] {
  const risks = new Set<string>();
  if ((input.resourceGrants ?? []).some((grant) => grant.action === "*")) risks.add("wildcard_resource_grant");
  if ((input.executionProfiles ?? []).some((profile) => profile.hostAccess === "native_host")) risks.add("native_host_access");
  if ((input.executionProfiles ?? []).some((profile) => profile.networkPolicy === "open")) risks.add("open_network_policy");
  return [...risks];
}

export const REQUIRED_AGENT_STORAGE_COLLECTIONS = [
  "agents",
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
] as const;

export const LEGACY_AGENT_OVERLAP_COLLECTIONS = [
  "company_agents",
  "deployments",
  "agent_deployments",
  "legacy_agents",
] as const;

export const DEFAULT_AGENT_ALLOWED_JSON_FIELDS = [
  "source",
  "links",
  "metadata",
  "agents.schedule",
  "agents.capabilitySummary",
  "agent_assignments.scopeJson",
  "agent_execution_profiles.sandboxJson",
  "agent_execution_profiles.resourceGrantsJson",
  "agent_memory_policies.readScopesJson",
  "agent_memory_policies.writeScopesJson",
  "agent_memory_policies.retentionJson",
  "agent_budgets.limitJson",
  "agent_budgets.usageJson",
  "agent_config_revisions.snapshotJson",
  "agent_evaluations.criteriaJson",
  "agent_evaluations.resultJson",
  "agent_incidents.redactionJson",
  "agent_blueprints.templateJson",
  "agent_blueprints.skillRefsJson",
  "agent_blueprints.skillBindingsJson",
  "agent_blueprints.safeExportJson",
  "agent_runs.sandboxJson",
  "agent_runs.costJson",
  "agent_runs.outcomeJson",
  "agent_sessions.context",
] as const;

export const DEFAULT_AGENT_AUDIT_COVERAGE_KINDS: AgentAuditEventKind[] = [
  "blueprint",
  "evaluation",
  "config_revision",
  "retirement",
  "service_api",
  "safe_export",
  "incident",
  "context_pack",
  "tool_catalog",
  "dispatch_plan",
  "creation_review",
  "storage_audit",
  "control_panel",
  "privacy_lifecycle",
  "paperclip_import",
  "permission_escalation",
];

export function agentFieldLooksLikeRawSecret(field: BuiltinFieldDefinition): boolean {
  return /(secret|password|token|credential|privateKey|apiKey)/i.test(field.name)
    && !/(Ref|Refs|reference)$/i.test(field.name);
}

export function auditCoverageInvalidEvent(event: AgentAuditEvent): AgentAuditCoverageInvalidEvent | undefined {
  const reasons: string[] = [];
  if (!event.id) reasons.push("audit: id missing");
  if (!event.kind) reasons.push("audit: kind missing");
  if (!event.agentId) reasons.push("audit: agentId missing");
  if (!["allowed", "denied", "blocked", "recorded"].includes(event.result)) reasons.push("audit: invalid result");
  if (!["default", "strict", "custom"].includes(event.redaction)) reasons.push("audit: invalid redaction");
  if (!event.createdAt || Number.isNaN(new Date(event.createdAt).getTime())) reasons.push("audit: invalid createdAt");
  if (!event.metadata || typeof event.metadata !== "object" || Array.isArray(event.metadata)) reasons.push("audit: metadata must be an object");
  if (reasons.length === 0) return undefined;
  return {
    ...(event.id ? { id: event.id } : {}),
    ...(event.kind ? { kind: event.kind } : {}),
    reasons,
  };
}

export function auditCoverageSensitiveFindings(event: AgentAuditEvent): string[] {
  const serialized = JSON.stringify(event.metadata ?? {});
  const findings: string[] = [];
  if (/vault:\/\//i.test(serialized)) findings.push(`${event.id}:raw_vault_ref`);
  if (/\/Users\//.test(serialized) || /~\//.test(serialized)) findings.push(`${event.id}:local_path`);
  if (/(Bearer\s+|api[_-]?key|password|secret|token)/i.test(serialized) && !serialized.includes("[REDACTED")) {
    findings.push(`${event.id}:raw_secret_token`);
  }
  return findings;
}

export function filterOperationalRecords(
  records: Array<Record<string, unknown>>,
  input: Pick<AgentOperationalSnapshotInput, "agentId" | "statuses" | "since" | "redaction">,
  redaction: "default" | "strict" | "custom",
): Array<Record<string, unknown>> {
  return records
    .filter((record) => operationalRecordBelongsToAgent(record, input.agentId))
    .filter((record) => operationalStatusMatches(record, input.statuses))
    .filter((record) => operationalSinceMatches(record, input.since))
    .sort((a, b) => operationalRecordTimestamp(b).localeCompare(operationalRecordTimestamp(a)))
    .map((record) => redactAgentBoundaryValue(record, redaction) as Record<string, unknown>);
}

export function filterOperationalAudits(
  audits: AgentAuditEvent[],
  input: Pick<AgentOperationalSnapshotInput, "agentId" | "statuses" | "since" | "redaction">,
  redaction: "default" | "strict" | "custom",
): AgentAuditEvent[] {
  return audits
    .filter((event) => event.agentId === input.agentId)
    .filter((event) => !input.statuses || input.statuses.length === 0 || input.statuses.includes(event.result))
    .filter((event) => !input.since || event.createdAt >= input.since)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((event) => redactAgentBoundaryValue(event, redaction) as AgentAuditEvent);
}

export function operationalRecordBelongsToAgent(record: Record<string, unknown>, agentId: string): boolean {
  const recordAgentId = stringRecordValue(record, "agentId", "agent_id");
  return !recordAgentId || recordAgentId === agentId;
}

export function operationalStatusMatches(record: Record<string, unknown>, statuses: string[] | undefined): boolean {
  if (!statuses || statuses.length === 0) return true;
  const status = stringRecordValue(record, "status", "result");
  return status ? statuses.includes(status) : false;
}

export function operationalSinceMatches(record: Record<string, unknown>, since: string | undefined): boolean {
  if (!since) return true;
  return operationalRecordTimestamp(record) >= since;
}

export function operationalRecordTimestamp(record: Record<string, unknown>): string {
  return stringRecordValue(record, "updatedAt", "updated_at", "createdAt", "created_at", "startedAt", "started_at", "detectedAt", "detected_at", "evaluatedAt", "evaluated_at", "endedAt", "ended_at") ?? "";
}

export function countByStatus(records: Array<Record<string, unknown>>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of records) {
    const status = stringRecordValue(record, "status", "result") ?? "unknown";
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

export function countByKind(events: AgentAuditEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) counts[event.kind] = (counts[event.kind] ?? 0) + 1;
  return counts;
}

export function operationalSnapshotGaps(
  assignments: Array<Record<string, unknown>>,
  runs: Array<Record<string, unknown>>,
  sessions: Array<Record<string, unknown>>,
  audits: AgentAuditEvent[],
): string[] {
  const gaps = new Set<string>();
  if (assignments.length === 0) gaps.add("assignments_missing");
  if (runs.length === 0) gaps.add("runs_missing");
  if (sessions.length === 0) gaps.add("sessions_missing");
  if (audits.length === 0) gaps.add("audits_missing");
  return [...gaps];
}

export function agentPermissionControlSummary(resourceGrants: Array<Record<string, unknown>>, now: string): AgentControlPanel["permissions"] {
  const activeGrants = resourceGrants.filter((grant) => !recordExpired(grant, now));
  const requiredApprovals = new Set<string>();
  if (activeGrants.some((grant) => grant.action === "*" || grant.resourceType === "secret" || grant.action === "lease_secret")) {
    requiredApprovals.add("resource_owner");
  }
  if (activeGrants.some((grant) => grant.action === "delete" || grant.action === "*")) requiredApprovals.add("destructive_action");
  return {
    allowGrants: activeGrants.filter((grant) => grant.effect === undefined || grant.effect === "allow").length,
    denyGrants: activeGrants.filter((grant) => grant.effect === "deny").length,
    wildcardGrants: activeGrants.filter((grant) => grant.action === "*" || grant.resourceType === "*" || grant.resourceId === "*").length,
    secretLeaseGrants: activeGrants.filter((grant) => grant.action === "lease_secret" || grant.resourceType === "secret").length,
    expiredGrants: resourceGrants.length - activeGrants.length,
    requiredApprovals: [...requiredApprovals],
  };
}

export function agentControlPosture(
  agent: Record<string, unknown>,
  assignments: Array<Record<string, unknown>>,
  incidents: Array<Record<string, unknown>>,
  permissions: AgentControlPanel["permissions"],
): AgentControlPanel["posture"] {
  const activeAssignments = assignments.filter((assignment) => assignment.status === "active");
  const openIncidents = incidents.filter((incident) => ["open", "mitigating"].includes(String(incident.status ?? "")));
  return {
    status: stringRecordValue(agent, "status") ?? "active",
    ...(stringRecordValue(agent, "autonomyProfile", "autonomy_profile") ? { autonomyProfile: stringRecordValue(agent, "autonomyProfile", "autonomy_profile") } : {}),
    activeAssignments: activeAssignments.length,
    externalAssignments: activeAssignments.filter((assignment) => isExternalAssignmentRecord(assignment)).length,
    openIncidents: openIncidents.length,
    failClosed: activeAssignments.length === 0 || permissions.allowGrants === 0,
  };
}

export function agentMemoryControlSummary(memoryPolicies: Array<Record<string, unknown>>): AgentControlPanel["memory"] {
  return {
    policyCount: memoryPolicies.length,
    crossUserBoundary: [...new Set(memoryPolicies.map((policy) => stringRecordValue(policy, "crossUserBoundary", "cross_user_boundary")).filter((value): value is string => Boolean(value)))],
    writePolicies: [...new Set(memoryPolicies.map((policy) => stringRecordValue(policy, "writePolicy", "write_policy")).filter((value): value is string => Boolean(value)))],
  };
}

export function agentBudgetControlSummary(budgets: Array<Record<string, unknown>>): AgentControlPanel["budgets"] {
  return {
    policyCount: budgets.length,
    exceededBehaviors: [...new Set(budgets.map((budget) => stringRecordValue(budget, "exceededBehavior", "exceeded_behavior")).filter((value): value is string => Boolean(value)))],
  };
}

export function agentControlUiVisibility(assignments: Array<Record<string, unknown>>, surface: AgentSafeSurfaceKind): AgentControlPanel["uiVisibility"] {
  const activeAssignments = assignments.filter((assignment) => assignment.status === "active");
  const surfaces = new Set<string>([surface]);
  for (const assignment of activeAssignments) {
    const kind = stringRecordValue(assignment, "kind");
    if (!kind) continue;
    if (kind === "internal_mac_chat") surfaces.add("mac");
    else if (kind === "mcp_api") surfaces.add("mcp_api");
    else if (kind === "relay") surfaces.add("relay");
    else if (isExternalAssignmentRecord(assignment)) surfaces.add("external_channel");
  }
  return {
    macVisible: activeAssignments.some((assignment) => assignment.kind === "internal_mac_chat"),
    surfaces: [...surfaces],
  };
}

export function agentControlPanelRisks(input: AgentControlPanelInput): string[] {
  const risks = new Set<string>();
  if ((input.resourceGrants ?? []).some((grant) => grant.action === "*")) risks.add("wildcard_resource_grant");
  if ((input.incidents ?? []).some((incident) => ["open", "mitigating"].includes(String(incident.status ?? "")))) risks.add("open_incidents");
  if ((input.assignments ?? []).some((assignment) => isExternalAssignmentRecord(assignment) && assignment.status === "active" && assignment.privacyPolicy === "raw_with_retention")) {
    risks.add("external_assignment_raw_telemetry");
  }
  return [...risks];
}

export function agentControlPanelGaps(
  input: AgentControlPanelInput,
  posture: AgentControlPanel["posture"],
  permissions: AgentControlPanel["permissions"],
): string[] {
  const gaps = new Set<string>();
  if (typeof input.agent.id !== "string") gaps.add("agent_id_missing");
  if (posture.activeAssignments === 0) gaps.add("active_assignment_missing");
  if (permissions.allowGrants === 0) gaps.add("allow_grants_missing");
  if ((input.memoryPolicies ?? []).length === 0) gaps.add("memory_policy_missing");
  if ((input.executionProfiles ?? []).length === 0) gaps.add("execution_profile_missing");
  if ((input.budgets ?? []).length === 0) gaps.add("budget_policy_missing");
  return [...gaps];
}

export function recordExpired(record: Record<string, unknown>, now: string): boolean {
  const expiresAt = stringRecordValue(record, "expiresAt", "expires_at");
  return Boolean(expiresAt && expiresAt <= now);
}

export function isExternalAssignmentRecord(record: Record<string, unknown>): boolean {
  const kind = stringRecordValue(record, "kind") ?? "";
  return isExternalAssignmentKind(kind as AgentAssignmentKind);
}

export function agentPrivacyLifecycleRecords(
  input: AgentPrivacyLifecycleInput,
  redaction: "default" | "strict" | "custom",
): Array<{ collection: string; record: Record<string, unknown> }> {
  const records: Array<{ collection: string; record: Record<string, unknown> }> = [
    ...privacyCollectionRecords("agents", [input.agent]),
    ...privacyCollectionRecords("agent_assignments", input.assignments),
    ...privacyCollectionRecords("agent_runs", input.runs),
    ...privacyCollectionRecords("agent_sessions", input.sessions),
    ...privacyCollectionRecords("agent_evaluations", input.evaluations),
    ...privacyCollectionRecords("agent_incidents", input.incidents),
    ...privacyCollectionRecords("agent_config_revisions", input.configRevisions),
    ...privacyCollectionRecords("support_conversations", input.supportConversations),
    ...privacyCollectionRecords("support_messages", input.supportMessages),
    ...privacyCollectionRecords("agent_audit_events", input.audits as unknown as Array<Record<string, unknown>> | undefined),
  ];
  return records
    .filter((entry) => recordMatchesPrivacySubject(entry.record, input.subject, input.agent))
    .map((entry) => ({ collection: entry.collection, record: redactAgentBoundaryValue(entry.record, redaction) as Record<string, unknown> }));
}

export function privacyCollectionRecords(collection: string, records: Array<Record<string, unknown>> | undefined): Array<{ collection: string; record: Record<string, unknown> }> {
  return (records ?? []).map((record) => ({ collection, record }));
}

export function recordMatchesPrivacySubject(record: Record<string, unknown>, subject: AgentPrivacyLifecycleSubject, rootAgent: Record<string, unknown>): boolean {
  if (subject.scopeType === "agent") {
    return stringRecordValue(record, "id", "agentId", "agent_id") === subject.scopeId
      || stringRecordValue(rootAgent, "id") === subject.scopeId;
  }
  const candidateKeys = privacySubjectKeys(subject.scopeType);
  if (candidateKeys.some((key) => stringRecordValue(record, key) === subject.scopeId)) return true;
  return JSON.stringify(record).includes(JSON.stringify(subject.scopeId));
}

export function privacySubjectKeys(scopeType: AgentPrivacyLifecycleSubject["scopeType"]): string[] {
  if (scopeType === "customer") return ["customerId", "customer_id", "scopeId", "scope_id", "boundaryScopeId"];
  if (scopeType === "external_user") return ["externalUserId", "external_user_id", "scopeId", "scope_id", "boundaryScopeId"];
  if (scopeType === "actor") return ["actorId", "actor_id", "assigneeActorId"];
  if (scopeType === "workspace") return ["workspaceId", "workspace_id", "scopeId", "scope_id"];
  if (scopeType === "project") return ["projectId", "project_id", "scopeId", "scope_id"];
  return ["teamId", "team_id", "scopeId", "scope_id"];
}

export function agentPrivacyLifecycleAction(
  collection: string,
  record: Record<string, unknown>,
  operation: AgentPrivacyLifecycleOperation,
  subject: AgentPrivacyLifecycleSubject,
  requestedAt: string,
  legalHoldRecordIds: Set<string>,
): AgentPrivacyLifecycleAction {
  const recordId = stringRecordValue(record, "id") ?? `${collection}_${stableHash(JSON.stringify(record))}`;
  if (legalHoldRecordIds.has(recordId)) {
    return {
      collection,
      recordId,
      disposition: "retain",
      reason: "record under legal hold",
    };
  }
  if (operation === "export") {
    return {
      collection,
      recordId,
      disposition: "include_export",
      reason: "record matches privacy subject export scope",
    };
  }
  if (operation === "delete") {
    return {
      collection,
      recordId,
      disposition: "delete",
      reason: "record matches privacy subject delete scope",
      patch: {
        id: recordId,
        deletedAt: requestedAt,
        privacySubject: subject,
      },
    };
  }
  return {
    collection,
    recordId,
    disposition: "anonymize",
    reason: "record matches privacy subject anonymization scope",
    patch: {
      id: recordId,
      anonymizedAt: requestedAt,
      privacySubject: subject,
      subjectId: "[REDACTED_SUBJECT]",
    },
  };
}

export function agentPrivacyLifecycleGaps(
  input: AgentPrivacyLifecycleInput,
  records: Array<{ collection: string; record: Record<string, unknown> }>,
  actions: AgentPrivacyLifecycleAction[],
): string[] {
  const gaps = new Set<string>();
  if (!input.subject.scopeId) gaps.add("privacy_subject_missing");
  if (records.length === 0) gaps.add("privacy_subject_records_missing");
  if (input.operation !== "export" && actions.some((action) => action.disposition === "retain")) gaps.add("legal_hold_records_retained");
  return [...gaps];
}

export interface PaperclipAgentDraft {
  id?: string;
  name: string;
  role?: string;
  description?: string;
  instructions?: string;
  agencyMode: AgencyMode;
  modelTier?: AgentBlueprint["modelTier"];
  skillRefs?: string[];
  skillBindings?: AgentSkillBinding[];
  requiredResourceGrants?: AgentResourceGrant[];
}

export function paperclipAgentsFromMarkdown(agentsMd: string | undefined): PaperclipAgentDraft[] {
  if (!agentsMd || !agentsMd.trim()) return [];
  const sections = splitPaperclipMarkdownAgents(agentsMd);
  return sections.map((section, index) => {
    const fields = parsePaperclipFields(section.body);
    const name = fields.name ?? section.title ?? `Paperclip Agent ${index + 1}`;
    return {
      id: fields.id,
      name,
      role: fields.role,
      description: fields.description,
      instructions: fields.instructions ?? section.body.trim(),
      agencyMode: paperclipAgencyMode(fields.mode ?? fields.role ?? name),
      modelTier: paperclipModelTier(fields.modelTier ?? fields.model),
      skillRefs: parseCsv(fields.skills),
      requiredResourceGrants: parsePaperclipGrantRefs(fields.grants),
    };
  });
}

export function paperclipAgentFromRecord(record: Record<string, unknown>, index: number): PaperclipAgentDraft {
  const name = stringRecordValue(record, "name", "title") ?? `Paperclip Agent ${index + 1}`;
  return {
    id: stringRecordValue(record, "id"),
    name,
    role: stringRecordValue(record, "role"),
    description: stringRecordValue(record, "description"),
    instructions: stringRecordValue(record, "instructions", "prompt", "systemPrompt"),
    agencyMode: paperclipAgencyMode(stringRecordValue(record, "agencyMode", "mode", "role", "kind") ?? name),
    modelTier: paperclipModelTier(stringRecordValue(record, "modelTier", "model")),
    skillRefs: Array.isArray(record.skillRefs) ? record.skillRefs.map(String) : parseCsv(stringRecordValue(record, "skills")),
    skillBindings: Array.isArray(record.skillBindings) ? record.skillBindings as AgentSkillBinding[] : undefined,
    requiredResourceGrants: Array.isArray(record.requiredResourceGrants) ? record.requiredResourceGrants as AgentResourceGrant[] : undefined,
  };
}

export function splitPaperclipMarkdownAgents(markdown: string): Array<{ title?: string; body: string }> {
  const matches = [...markdown.matchAll(/^#{1,3}\s+(.+)$/gm)];
  if (matches.length === 0) return [{ body: markdown }];
  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? markdown.length;
    return {
      title: match[1]?.trim(),
      body: markdown.slice(start, end).trim(),
    };
  });
}

export function parsePaperclipFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of body.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:[-*]\s*)?([A-Za-z][A-Za-z0-9 _-]{1,32})\s*:\s*(.+?)\s*$/);
    if (!match) continue;
    const key = match[1]?.trim().toLowerCase().replace(/[\s-]+/g, "");
    const value = match[2]?.trim();
    if (key && value) fields[key] = value;
  }
  return {
    id: fields.id,
    name: fields.name,
    role: fields.role,
    description: fields.description,
    instructions: fields.instructions,
    mode: fields.mode,
    model: fields.model,
    modelTier: fields.modeltier,
    skills: fields.skills,
    grants: fields.grants,
  };
}

export function paperclipAgencyMode(value: string): AgencyMode {
  const normalized = value.toLowerCase();
  if (normalized.includes("support")) return "support";
  if (normalized.includes("reception")) return "receptionist";
  if (normalized.includes("operator")) return "operator";
  if (normalized.includes("automation")) return "automation";
  if (normalized.includes("workflow")) return "workflow_agent";
  if (normalized.includes("review")) return "reviewer";
  if (normalized.includes("manager") || normalized.includes("lead") || normalized.includes("ceo")) return "manager";
  if (normalized.includes("subagent")) return "subagent";
  if (normalized.includes("worker")) return "worker";
  return "assistant";
}

export function paperclipModelTier(value: string | undefined): AgentBlueprint["modelTier"] | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized.includes("fast")) return "fast";
  if (normalized.includes("smart")) return "smart";
  if (normalized.includes("max")) return "max";
  if (normalized.includes("balanced")) return "balanced";
  return undefined;
}

export function parseCsv(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const entries = value.split(",").map((entry) => entry.trim()).filter(Boolean);
  return entries.length > 0 ? entries : undefined;
}

export function parsePaperclipGrantRefs(value: string | undefined): AgentResourceGrant[] | undefined {
  const refs = parseCsv(value);
  if (!refs) return undefined;
  return refs.map((ref) => {
    const [resourceType = "resource", resourceId = "*", action = "read"] = ref.split(":");
    return {
      resourceType,
      resourceId,
      action: action as AgentResourceAction,
    };
  });
}

export function pickRedacted(record: Record<string, unknown>, redaction: "default" | "strict" | "custom", keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (record[key] !== undefined) out[key] = redactAgentBoundaryValue(record[key], redaction);
  }
  return out;
}

export function agentSurfaceRisks(
  surface: AgentSafeSurfaceKind,
  assignments: Array<Record<string, unknown>>,
  resourceGrants: Array<Record<string, unknown>>,
  rawMemoryPolicies: Array<Record<string, unknown>>,
): string[] {
  const risks = new Set<string>();
  if (surface !== "internal_ui" && resourceGrants.some((grant) => grant.action === "lease_secret" || grant.action === "*")) {
    risks.add("secret_lease_requires_brokered_runtime_only");
  }
  if (assignments.some((assignment) => assignment.privacyPolicy === "raw_with_retention")) {
    risks.add("raw_telemetry_retention_requires_policy_review");
  }
  if (assignments.some((assignment) => assignment.externalDisclosure !== undefined && assignment.externalDisclosure !== "transparent_agent")) {
    risks.add("external_disclosure_uses_custom_wording");
  }
  if (rawMemoryPolicies.some((policy) => policy.crossUserBoundary !== undefined && policy.crossUserBoundary !== "explicit_grant_only")) {
    risks.add("memory_cross_user_boundary_not_explicit_grant_only");
  }
  return [...risks];
}

export function agentSurfaceGaps(surface: AgentSafeSurfaceKind, assignments: Array<Record<string, unknown>>, budgets: Array<Record<string, unknown>>): string[] {
  const gaps = new Set<string>();
  if (assignments.length === 0) gaps.add("assignment_missing");
  if (surface !== "internal_ui" && !assignments.some((assignment) => assignment.status === "active")) gaps.add("active_assignment_missing");
  if (!assignments.some((assignment) => assignmentKindAllowedForSurface(surface, assignment.kind))) gaps.add("surface_assignment_kind_missing");
  if (assignments.some((assignment) => assignment.privacyPolicy === "raw_with_retention" && !hasValidTelemetryRetention(assignment))) gaps.add("raw_telemetry_retention_policy_missing");
  if (surface !== "internal_ui" && budgets.length === 0) gaps.add("budget_policy_missing");
  return [...gaps];
}

export function hasValidTelemetryRetention(assignment: { telemetryRetentionDays?: unknown }): boolean {
  return typeof assignment.telemetryRetentionDays === "number"
    && Number.isFinite(assignment.telemetryRetentionDays)
    && assignment.telemetryRetentionDays > 0;
}

export function assignmentKindAllowedForSurface(surface: AgentSafeSurfaceKind, kind: unknown): boolean {
  if (typeof kind !== "string") return false;
  if (surface === "internal_ui") return kind === "internal_mac_chat";
  if (surface === "mcp_api") return kind === "mcp_api";
  if (surface === "service_api") return kind === "mcp_api";
  if (surface === "relay") return kind === "relay";
  return kind === "external_web_chat"
    || kind === "external_telegram"
    || kind === "external_whatsapp"
    || kind === "external_email"
    || kind === "support_inbox"
    || kind === "custom_channel";
}

export const AGENT_ACTION_SEVERITY_BY_RANK = ["info", "low", "medium", "high", "critical"] as const satisfies readonly AgentActionSeverity[];
export const AGENT_ACTION_SEVERITY_RANK: Record<AgentActionSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function severityRankForAction(action: AgentResourceAction | string): number {
  if (action === "read") return AGENT_ACTION_SEVERITY_RANK.low;
  if (action === "create" || action === "update" || action === "write") return AGENT_ACTION_SEVERITY_RANK.medium;
  if (action === "invoke" || action === "execute" || action === "lease_secret" || action === "approve") return AGENT_ACTION_SEVERITY_RANK.high;
  if (action === "delete" || action === "*") return AGENT_ACTION_SEVERITY_RANK.critical;
  return AGENT_ACTION_SEVERITY_RANK.medium;
}

export function autonomyDispatchMode(profile: AgentAutonomyProfile): AgentAutonomyDispatchMode {
  if (profile === "respond_only") return "respond_only";
  if (profile === "suggest") return "suggest_only";
  return "act";
}

export function maxAutonomySeverity(profile: AgentAutonomyProfile): AgentActionSeverity {
  if (profile === "respond_only") return "low";
  if (profile === "suggest") return "medium";
  if (profile === "act_limited") return "medium";
  return "high";
}

export function dispatchDisposition(dispatchMode: AgentAutonomyDispatchMode, executionMode: AgentExecutionMode | undefined): AgentDispatchDisposition {
  if (dispatchMode === "respond_only") return "respond";
  if (dispatchMode === "suggest_only") return "suggest";
  if (executionMode === "sync") return "invoke_sync";
  if (executionMode === "async") return "queue_async";
  if (executionMode === "streaming") return "stream";
  if (executionMode === "scheduled") return "schedule";
  return "blocked";
}

export function dispatchRunStatus(disposition: AgentDispatchDisposition): AgentDispatchRunStatus {
  if (disposition === "respond") return "ready";
  if (disposition === "suggest") return "awaiting_input";
  if (disposition === "invoke_sync" || disposition === "stream") return "running";
  if (disposition === "queue_async" || disposition === "schedule") return "queued";
  return "blocked";
}

export function isExternalAssignmentKind(kind: AgentAssignmentKind): boolean {
  return kind === "external_web_chat"
    || kind === "external_telegram"
    || kind === "external_whatsapp"
    || kind === "external_email"
    || kind === "support_inbox"
    || kind === "custom_channel";
}

export const SUPERVISOR_RISK_RANK: Record<AgentPermissionEscalationRequest["risk"], number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export function riskRank(risk: AgentPermissionEscalationRequest["risk"]): number {
  return SUPERVISOR_RISK_RANK[risk];
}

export function supervisorMaxRisk(level: AgentSupervisorAuthorityLevel): AgentPermissionEscalationRequest["risk"] {
  if (level === "approve_high_risk") return "high";
  if (level === "approve_medium_risk") return "medium";
  return "low";
}

export function supervisorDefaultActions(level: AgentSupervisorAuthorityLevel): AgentSupervisorAction[] {
  if (level === "observe") return ["observe"];
  if (level === "suggest") return ["observe", "suggest"];
  if (level === "approve_low_risk") return ["observe", "suggest", "approve_escalation", "pause_assignment"];
  if (level === "approve_medium_risk") return ["observe", "suggest", "approve_escalation", "pause_assignment", "edit_config"];
  return ["observe", "suggest", "approve_escalation", "pause_assignment", "edit_config", "retire_agent"];
}

export function isSensitiveAgentKey(key: string): boolean {
  return /(secret|password|token|credential|privateKey|apiKey|rawTrace|authorization)/i.test(key);
}

export function isLocalPrivatePath(value: string): boolean {
  return value.startsWith("/") || value.startsWith("~/") || value.includes("/Users/") || value.includes("\\Users\\");
}

export function memoryScopeMatches(scope: AgentMemoryScope, request: AgentMemoryAccessRequest): boolean {
  const accessMatches = scope.access === request.operation || scope.access === "read_write";
  const layerMatches = scope.layer === request.layer;
  const scopeMatches = !scope.scopeId || scope.scopeId === request.scopeId;
  return accessMatches && layerMatches && scopeMatches;
}

export function memoryBoundaryAllowed(policy: AgentMemoryPolicy, request: AgentMemoryAccessRequest): boolean {
  if (policy.crossUserBoundary !== "explicit_grant_only") return true;
  if (!request.boundary) return true;
  if (request.layer !== "customer" && request.layer !== "session") return true;
  if (!request.scopeId || request.scopeId === request.boundary.scopeId) return true;
  return request.explicitGrant === true;
}

export function externalTelemetry(profile: AgentExternalIdentityProfile, policy: AgentAssignmentPrivacyPolicy): Record<string, string> {
  if (policy === "off") return {};
  if (policy === "raw_with_retention") {
    return {
      ...(profile.ip ? { ip: profile.ip } : {}),
      ...(profile.userAgent ? { userAgent: profile.userAgent } : {}),
    };
  }
  return {
    ...(profile.ip ? { ipHash: stableHash(profile.ip) } : {}),
    ...(profile.userAgent ? { userAgentHash: stableHash(profile.userAgent) } : {}),
  };
}

export function stableHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
