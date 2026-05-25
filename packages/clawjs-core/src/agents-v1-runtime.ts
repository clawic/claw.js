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

import {
  AGENT_ACTION_SEVERITY_BY_RANK,
  AGENT_ACTION_SEVERITY_RANK,
  DEFAULT_AGENT_ALLOWED_JSON_FIELDS,
  DEFAULT_AGENT_AUDIT_COVERAGE_KINDS,
  LEGACY_AGENT_OVERLAP_COLLECTIONS,
  type PaperclipAgentDraft,
  REQUIRED_AGENT_STORAGE_COLLECTIONS,
  SUPERVISOR_RISK_RANK,
  activityItem,
  activityMetadata,
  activitySummary,
  activityTimestamp,
  activityTitle,
  agentBudgetControlSummary,
  agentControlPanelGaps,
  agentControlPanelRisks,
  agentControlPosture,
  agentControlUiVisibility,
  agentFieldLooksLikeRawSecret,
  agentMemoryControlSummary,
  agentPermissionControlSummary,
  agentPrivacyLifecycleAction,
  agentPrivacyLifecycleGaps,
  agentPrivacyLifecycleRecords,
  agentServiceApiError,
  agentSurfaceGaps,
  agentSurfaceRisks,
  assignmentKindAllowedForSurface,
  auditCoverageInvalidEvent,
  auditCoverageSensitiveFindings,
  autonomyDispatchMode,
  budgetLimitMatches,
  contextEntryId,
  contextPackGaps,
  contextPackItem,
  contextScopeMatches,
  contextViewRejectionReasons,
  countByKind,
  countByStatus,
  createAgentActivityFeed,
  createAgentAuditEvent,
  createAgentBlueprint,
  createAgentConfigRevision,
  createAgentEvaluation,
  createAgentIncident,
  createAgentPaperclipImportPlan,
  createAgentPrivacyLifecyclePlan,
  createAgentSafePackageExport,
  createAgentSafeSurfaceProjection,
  createAgentServiceApiHttpResponse,
  createAgentServiceApiResponse,
  creationReviewGaps,
  creationReviewRequiredApprovals,
  creationReviewRisks,
  dispatchDisposition,
  dispatchRunStatus,
  externalTelemetry,
  filterOperationalAudits,
  filterOperationalRecords,
  formatAgentSkillBindingRef,
  grantMatches,
  hasValidTelemetryRetention,
  isAgentServiceApiRequest,
  isExternalAssignmentKind,
  isExternalAssignmentRecord,
  isLocalPrivatePath,
  isRecord,
  isSecretResourceRequest,
  isSensitiveAgentKey,
  matches,
  matchesOptional,
  maxAutonomySeverity,
  memoryBoundaryAllowed,
  memoryScopeMatches,
  normalizeAgentSkillBindings,
  normalizePositiveInteger,
  normalizeTime,
  operationalRecordBelongsToAgent,
  operationalRecordTimestamp,
  operationalSinceMatches,
  operationalSnapshotGaps,
  operationalStatusMatches,
  paperclipAgencyMode,
  paperclipAgentFromRecord,
  paperclipAgentsFromMarkdown,
  paperclipModelTier,
  parseAgentServiceApiBody,
  parseAgentSkillRef,
  parseCsv,
  parsePaperclipFields,
  parsePaperclipGrantRefs,
  pickAgentSurfaceFields,
  pickAssignmentSurfaceFields,
  pickBudgetSurfaceFields,
  pickExecutionProfileSurfaceFields,
  pickMemoryPolicySurfaceFields,
  pickRedacted,
  pickResourceGrantSurfaceFields,
  privacyCollectionRecords,
  privacySubjectKeys,
  recordExpired,
  recordMatchesPrivacySubject,
  redactAgentBoundaryValue,
  redactArray,
  riskRank,
  severityRankForAction,
  splitPaperclipMarkdownAgents,
  stableHash,
  stringRecordValue,
  supervisorDefaultActions,
  supervisorMaxRisk,
  toolCatalogGaps,
  toolCatalogProjectionItem
} from "./agents-v1-lifecycle.ts";

export const PLANES = [
  ["agent", "agentGrants"],
  ["assignment", "assignmentGrants"],
  ["execution_profile", "executionProfileGrants"],
  ["connector", "connectorGrants"],
  ["host", "hostGrants"],
  ["run_scope", "runScopeGrants"],
] as const;

export function evaluateAgentEffectiveAccess(input: AgentEffectiveAccessInput): AgentEffectiveAccessResult {
  const now = normalizeTime(input.now);
  const reasons: string[] = [];
  const matchedGrantIds: string[] = [];

  if (isSecretResourceRequest(input.requested) && input.requested.action !== "lease_secret") {
    reasons.push("secret: direct access denied; use lease_secret broker flow");
  }

  const regulatedSafety = input.requested.regulatedSafety;
  if (regulatedSafety) {
    if (regulatedSafety.regulatedDomains.length === 0) {
      reasons.push("regulated_safety: missing regulated domain");
    }
    for (const regulatedDomain of regulatedSafety.regulatedDomains) {
      const decision = evaluateRegulatedAction({
        regulatedDomain,
        decisionEffect: regulatedSafety.decisionEffect,
        externalAction: regulatedSafety.externalAction,
        sensitiveExport: regulatedSafety.sensitiveExport,
        remoteOrProviderUse: regulatedSafety.remoteOrProviderUse,
      });
      if (!decision.allowed) {
        reasons.push(...decision.denialCodes.map((code) => `regulated_safety:${regulatedDomain}:${code}`));
      }
      if (regulatedSafety.outputLabelsRequired !== true) {
        reasons.push(`regulated_safety:${regulatedDomain}:output_labels_required`);
      }
    }
  }

  for (const [planeName, key] of PLANES) {
    const grants = input[key] ?? [];
    const activeMatches = grants.filter((grant) => grantMatches(input.requested, grant, now));
    const deny = activeMatches.find((grant) => (grant.effect ?? "allow") === "deny");
    if (deny) {
      reasons.push(`${planeName}: denied by ${deny.id ?? "grant"}`);
      if (deny.id) matchedGrantIds.push(deny.id);
      continue;
    }
    const allow = activeMatches.find((grant) => (grant.effect ?? "allow") === "allow");
    if (!allow) {
      reasons.push(`${planeName}: no active allow grant`);
      continue;
    }
    if (allow.id) matchedGrantIds.push(allow.id);
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    matchedGrantIds,
  };
}

export function evaluateAgentDelegationAccess(input: AgentDelegationAccessInput): AgentEffectiveAccessResult {
  const parent = evaluateAgentEffectiveAccess(input.parent);
  const child = evaluateAgentEffectiveAccess(input.child);
  const reasons = [...parent.reasons.map((reason) => `parent ${reason}`), ...child.reasons.map((reason) => `child ${reason}`)];
  return {
    allowed: parent.allowed && child.allowed,
    reasons,
    matchedGrantIds: [...parent.matchedGrantIds, ...child.matchedGrantIds],
  };
}

export function createAgentPermissionEscalationRequest(
  input: Omit<AgentPermissionEscalationRequest, "id"> & { id?: string },
): AgentPermissionEscalationRequest {
  const id = input.id ?? `agent_escalation_${stableHash([
    input.agentId,
    input.assignmentId ?? "",
    input.resourceType,
    input.action,
    input.scopeType ?? "",
    input.scopeId ?? "",
    input.duration,
    input.reason,
  ].join("|"))}`;
  return { ...input, id };
}

export function evaluateAgentSupervisorAuthority(input: AgentSupervisorAuthorityInput): AgentSupervisorAuthorityResult {
  const reasons: string[] = [];
  const authorityLevel = input.supervisor.authorityLevel ?? "observe";
  const maxRisk = supervisorMaxRisk(authorityLevel);
  const allowedActions = input.supervisor.allowedActions ?? supervisorDefaultActions(authorityLevel);
  if (input.targetAgent.managerAgentId !== input.supervisor.id) {
    reasons.push("supervisor: target agent does not report to supervisor");
  }
  if (!allowedActions.includes(input.request.action)) {
    reasons.push(`supervisor: action ${input.request.action} is not delegated`);
  }
  if (riskRank(input.request.risk) > riskRank(maxRisk)) {
    reasons.push(`supervisor: risk ${input.request.risk} exceeds ${maxRisk}`);
  }
  if (input.request.risk === "critical") {
    reasons.push("supervisor: critical risk requires owner or host approval");
  }
  if (input.supervisor.scopeType && input.request.scopeType && input.supervisor.scopeType !== input.request.scopeType) {
    reasons.push(`supervisor: scope type ${input.request.scopeType} is outside ${input.supervisor.scopeType}`);
  }
  if (input.supervisor.scopeId && input.request.scopeId && input.supervisor.scopeId !== input.request.scopeId) {
    reasons.push(`supervisor: scope ${input.request.scopeId} is outside ${input.supervisor.scopeId}`);
  }
  return {
    allowed: reasons.length === 0,
    reasons,
    maxRisk,
  };
}

export function createAgentRetirementPlan(input: AgentRetirementInput): AgentRetirementPlan {
  const redaction = input.redaction ?? "strict";
  const retiredAt = input.retiredAt ?? new Date().toISOString();
  const agentId = typeof input.agent.id === "string" ? input.agent.id : "agent.unknown";
  const snapshotRef = input.snapshotRef ?? `agent_retirement_snapshot_${stableHash([
    agentId,
    retiredAt,
    input.reason,
  ].join("|"))}`;
  const agentPatch = redactAgentBoundaryValue({
    id: agentId,
    status: "archived",
    retiredAt,
    archivedAt: retiredAt,
    retirementSnapshotRef: snapshotRef,
  }, redaction) as Record<string, unknown>;
  const assignmentPatches = (input.assignments ?? []).map((assignment) => redactAgentBoundaryValue({
    id: assignment.id,
    agentId: assignment.agentId ?? agentId,
    status: "revoked",
    archivedAt: retiredAt,
    revokedAt: retiredAt,
    revokeReason: input.reason,
  }, redaction) as Record<string, unknown>);
  const resourceGrantPatches = (input.resourceGrants ?? []).map((grant) => redactAgentBoundaryValue({
    id: grant.id,
    agentId: grant.agentId ?? agentId,
    effect: "deny",
    expiresAt: retiredAt,
    revokeReason: input.reason,
  }, redaction) as Record<string, unknown>);
  return {
    schemaVersion: 1,
    planKind: "claw_agent_retirement_plan",
    agentId,
    retiredAt,
    reason: input.reason,
    snapshotRef,
    agentPatch,
    assignmentPatches,
    resourceGrantPatches,
    recoverable: true,
    audit: createAgentAuditEvent({
      kind: "retirement",
      agentId,
      actorId: input.actorId,
      result: "recorded",
      reason: input.reason,
      redaction,
      createdAt: retiredAt,
      resourceType: "agent",
      resourceId: agentId,
      metadata: {
        snapshotRef,
        assignmentPatchCount: assignmentPatches.length,
        resourceGrantPatchCount: resourceGrantPatches.length,
      },
    }),
  };
}

export function evaluateAgentAssignmentRoute(input: AgentAssignmentRouteRequest): AgentAssignmentRouteResult {
  const reasons: string[] = [];
  const now = normalizeTime(input.now);
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) reasons.push("route: invalid now");
  const assignment = input.assignment;
  if (!assignment) {
    reasons.push("assignment: missing");
  } else {
    if (assignment.status !== "active") reasons.push(`assignment: status ${assignment.status}`);
    if (assignment.kind !== input.kind) reasons.push(`assignment: kind ${assignment.kind} does not match ${input.kind}`);
    if (input.channel && assignment.channel && assignment.channel !== input.channel) reasons.push(`assignment: channel ${assignment.channel} does not match ${input.channel}`);
    if (input.endpointRef && assignment.endpointRef && assignment.endpointRef !== input.endpointRef) reasons.push("assignment: endpoint mismatch");
    if (assignment.privacyPolicy === "raw_with_retention" && !hasValidTelemetryRetention(assignment)) {
      reasons.push("assignment: raw telemetry retention requires telemetryRetentionDays");
    }
    if (assignment.startsAt) {
      const startsAtMs = new Date(assignment.startsAt).getTime();
      if (!Number.isFinite(startsAtMs)) reasons.push("assignment: invalid startsAt");
      else if (Number.isFinite(nowMs) && startsAtMs > nowMs) reasons.push("assignment: not started");
    }
    if (assignment.expiresAt) {
      const expiresAtMs = new Date(assignment.expiresAt).getTime();
      if (!Number.isFinite(expiresAtMs)) reasons.push("assignment: invalid expiresAt");
      else if (Number.isFinite(nowMs) && expiresAtMs <= nowMs) reasons.push("assignment: expired");
    }
  }
  const disclosureRequired = !assignment || assignment.externalDisclosure !== "custom_agent_wording";
  return {
    allowed: reasons.length === 0,
    reasons,
    disclosureRequired,
  };
}

export function resolveAgentExternalIdentity(
  profile: AgentExternalIdentityProfile,
  privacyPolicy: AgentAssignmentPrivacyPolicy = "hashed",
): AgentResolvedExternalIdentity {
  const provider = profile.provider || "other";
  const strongIdentifier = profile.email ?? profile.phone ?? profile.externalId;
  const baseIdentifier = strongIdentifier ?? profile.visitorId ?? `${profile.ip ?? "unknown"}:${profile.userAgent ?? "unknown"}`;
  const suffix = stableHash([provider, baseIdentifier].join("|"));
  const externalUserId = `external_user_${suffix}`;
  const actorId = `actor_external_${suffix}`;
  const customerId = profile.customerId;
  const boundaryScopeId = customerId ?? externalUserId;
  return {
    externalUserId,
    actorId,
    contactProjection: strongIdentifier ? "create_or_update" : "none",
    ...(customerId ? { customerId } : {}),
    telemetry: externalTelemetry(profile, privacyPolicy),
    boundary: {
      scopeType: customerId ? "customer" : "external_user",
      scopeId: boundaryScopeId,
    },
  };
}

export function createAgentSupportInboxProjection(input: AgentSupportInboxProjectionInput): AgentSupportInboxProjection {
  const now = normalizeTime(input.now).toISOString();
  const source = {
    assignmentId: input.assignment.id,
    assignmentKind: input.assignment.kind,
    channel: input.assignment.channel ?? input.assignment.kind,
  };
  const conversationId = `support_conversation_${stableHash([input.assignment.id, input.sessionId, input.identity.boundary.scopeId].join("|"))}`;
  return {
    conversation: {
      id: conversationId,
      status: "open",
      externalUserId: input.identity.externalUserId,
      contactProjection: input.identity.contactProjection,
      ...(input.identity.customerId ? { customerId: input.identity.customerId } : {}),
      assigneeActorId: `actor_agent_${input.assignment.agentId}`,
      source,
      metadata: {
        sessionId: input.sessionId,
        boundaryScopeType: input.identity.boundary.scopeType,
        boundaryScopeId: input.identity.boundary.scopeId,
      },
      lastMessageAt: now,
    },
    message: {
      id: `support_message_${stableHash([conversationId, now, input.initialMessage].join("|"))}`,
      conversationId,
      externalUserId: input.identity.externalUserId,
      actorId: input.identity.actorId,
      direction: "inbound",
      channel: input.assignment.channel ?? input.assignment.kind,
      body: input.initialMessage,
      source,
    },
  };
}

export function evaluateAgentMemoryAccess(policy: AgentMemoryPolicy, request: AgentMemoryAccessRequest): AgentMemoryAccessResult {
  const reasons: string[] = [];
  const scopes = request.operation === "read" ? policy.readScopes ?? [] : policy.writeScopes ?? [];
  const matchedScope = scopes.find((scope) => memoryScopeMatches(scope, request));
  if (!matchedScope) reasons.push(`memory: no ${request.operation} scope`);
  if (request.operation === "write") {
    if (policy.writePolicy === "none") reasons.push("memory: writes disabled");
    if (policy.writePolicy === "private_only" && request.layer !== "agent_private" && request.layer !== "session") {
      reasons.push(`memory: write policy private_only blocks ${request.layer}`);
    }
    if (policy.writePolicy === "shared_with_review" && request.layer !== "agent_private" && request.layer !== "session" && !request.explicitGrant) {
      reasons.push("memory: shared writes require explicit grant or review");
    }
  }
  if (!memoryBoundaryAllowed(policy, request)) reasons.push("memory: cross-boundary access requires explicit grant");
  return {
    allowed: reasons.length === 0,
    reasons,
    ...(matchedScope ? { matchedScope } : {}),
  };
}

export function evaluateAgentBudget(policy: AgentBudgetPolicy, request: AgentBudgetRequest): AgentBudgetEvaluationResult {
  const reasons: string[] = [];
  if (!Number.isFinite(request.cost) || request.cost < 0) reasons.push("budget: invalid cost");
  if (request.externalPaidAction && request.connectorGateAllowed !== true) reasons.push("budget: external paid action requires connector gate");
  const matchedLimit = policy.limits.find((limit) => budgetLimitMatches(limit, request));
  if (!matchedLimit) {
    reasons.push(`budget: no ${request.dimension} limit`);
  } else if ((matchedLimit.used ?? 0) + request.cost > matchedLimit.limit) {
    reasons.push(`budget: ${request.dimension} limit exceeded`);
  }
  return {
    allowed: reasons.length === 0,
    reasons,
    exceededBehavior: policy.exceededBehavior,
    ...(matchedLimit ? { matchedLimit } : {}),
  };
}

export function evaluateAgentActionSeverity(request: AgentActionSeverityRequest): AgentActionSeverityResult {
  const reasons: string[] = [];
  let severityRank = severityRankForAction(request.action);
  const raise = (severity: AgentActionSeverity, reason: string) => {
    severityRank = Math.max(severityRank, AGENT_ACTION_SEVERITY_RANK[severity]);
    reasons.push(reason);
  };
  const resourceType = request.resourceType?.toLowerCase() ?? "";
  if (request.action === "*") raise("critical", "action wildcard can cover destructive authority");
  if (resourceType === "secret" || resourceType === "vault" || resourceType === "credential") raise("high", "secret resource requires brokered review");
  if (request.rawPii) raise("high", "raw PII requires privacy review");
  if (request.externalSideEffect) raise("high", "external side effect requires connector gate");
  if (request.paidAction) raise("high", "paid action requires budget gate");
  if (request.productionMutation) raise("high", "production mutation requires approval");
  if (request.nativeHostAccess) raise("critical", "native host access requires host gate");
  if (request.destructive) raise("critical", "destructive action requires approval");
  if (request.irreversible) raise("critical", "irreversible action requires approval");
  const severity = AGENT_ACTION_SEVERITY_BY_RANK[severityRank];
  return {
    severity,
    reasons: reasons.length > 0 ? reasons : [`action ${request.action} classified as ${severity}`],
    approvalRequired: severity === "high" || severity === "critical" || request.productionMutation === true || request.destructive === true || request.irreversible === true,
    connectorGateRequired: request.externalSideEffect === true || request.paidAction === true,
    budgetRequired: request.paidAction === true,
    hostGateRequired: request.nativeHostAccess === true,
  };
}

export function evaluateAgentAutonomyPolicy(input: AgentAutonomyPolicyInput): AgentAutonomyPolicyResult {
  const actionSeverity = evaluateAgentActionSeverity(input.action);
  const reasons: string[] = [];
  const requiredGates = new Set<string>();
  const dispatchMode = autonomyDispatchMode(input.profile);
  if (input.profile === "respond_only" && input.action.action !== "read") {
    reasons.push(`autonomy: respond_only cannot dispatch ${input.action.action}`);
  }
  if (input.profile === "suggest" && input.action.action !== "read") {
    reasons.push(`autonomy: suggest requires human approval before dispatching ${input.action.action}`);
    requiredGates.add("human_approval");
  }
  const maxSeverity = maxAutonomySeverity(input.profile);
  if (AGENT_ACTION_SEVERITY_RANK[actionSeverity.severity] > AGENT_ACTION_SEVERITY_RANK[maxSeverity]) {
    reasons.push(`autonomy: ${actionSeverity.severity} exceeds ${input.profile} limit ${maxSeverity}`);
  }
  if (actionSeverity.approvalRequired && input.approvalGranted !== true) {
    reasons.push("autonomy: approval required");
    requiredGates.add("approval");
  }
  if (actionSeverity.connectorGateRequired && input.connectorGateAllowed !== true) {
    reasons.push("autonomy: connector gate required");
    requiredGates.add("connector");
  }
  if (actionSeverity.budgetRequired && input.budgetAllowed !== true) {
    reasons.push("autonomy: budget gate required");
    requiredGates.add("budget");
  }
  if (actionSeverity.hostGateRequired && input.hostGateAllowed !== true) {
    reasons.push("autonomy: host gate required");
    requiredGates.add("host");
  }
  return {
    allowed: reasons.length === 0,
    profile: input.profile,
    dispatchMode,
    severity: actionSeverity.severity,
    reasons,
    requiredGates: [...requiredGates],
  };
}

export function createAgentDispatchPlan(input: AgentDispatchPlanInput): AgentDispatchPlan {
  const now = normalizeTime(input.now);
  const route = evaluateAgentAssignmentRoute({
    assignment: input.assignment,
    kind: input.assignmentRequest.kind,
    channel: input.assignmentRequest.channel,
    endpointRef: input.assignmentRequest.endpointRef,
    now,
  });
  const autonomy = evaluateAgentAutonomyPolicy({
    ...input.autonomy,
    action: input.action,
  });
  const reasons = [...route.reasons, ...autonomy.reasons];
  const requiredGates = new Set(autonomy.requiredGates);
  const executionMode = input.executionProfile?.executionMode;

  if (!input.assignment) {
    requiredGates.add("assignment");
  } else if (input.assignment.agentId !== input.agentId) {
    reasons.push("dispatch: assignment belongs to a different agent");
  }

  if (!input.executionProfile) {
    reasons.push("execution: profile missing");
    requiredGates.add("execution_profile");
  } else {
    if (input.executionProfile.status && input.executionProfile.status !== "active") {
      reasons.push(`execution: profile status ${input.executionProfile.status}`);
    }
    if (!executionMode) {
      reasons.push("execution: mode missing");
    }
  }

  if (isExternalAssignmentKind(input.assignmentRequest.kind) && input.action.action !== "read") {
    const respondOnlyDefault = input.assignment?.respondOnlyDefault !== false;
    if (respondOnlyDefault && input.externalActAllowed !== true) {
      reasons.push("dispatch: external assignment defaults to respond_only");
      requiredGates.add("external_act");
    }
  }

  if (executionMode === "scheduled" && !input.scheduledAt) {
    reasons.push("execution: scheduled mode requires scheduledAt");
    requiredGates.add("schedule");
  }

  const preliminaryDisposition = dispatchDisposition(autonomy.dispatchMode, executionMode);
  const allowed = route.allowed && autonomy.allowed && reasons.length === 0 && preliminaryDisposition !== "blocked";
  const disposition = allowed ? preliminaryDisposition : "blocked";
  const runStatus = dispatchRunStatus(disposition);
  const createdAt = now.toISOString();
  return {
    schemaVersion: 1,
    planKind: "claw_agent_dispatch_plan",
    agentId: input.agentId,
    ...(input.assignment?.id ? { assignmentId: input.assignment.id } : {}),
    ...(input.executionProfile?.id ? { executionProfileId: input.executionProfile.id } : {}),
    allowed,
    disposition,
    runStatus,
    ...(executionMode ? { executionMode } : {}),
    autonomy,
    route,
    reasons,
    requiredGates: [...requiredGates],
    audit: createAgentAuditEvent({
      kind: "dispatch_plan",
      agentId: input.agentId,
      assignmentId: input.assignment?.id,
      result: allowed ? "allowed" : "blocked",
      reason: "agent dispatch plan",
      redaction: "strict",
      createdAt,
      metadata: {
        disposition,
        runStatus,
        executionMode,
        assignmentKind: input.assignmentRequest.kind,
        requiredGates: [...requiredGates],
      },
    }),
  };
}

export function createAgentContextPack(input: AgentContextPackInput): AgentContextPack {
  const redaction = input.redaction ?? "strict";
  const now = normalizeTime(input.now);
  const maxItems = normalizePositiveInteger(input.view.maxItems);
  const denied: AgentContextPackDeniedItem[] = [];
  const accepted: AgentContextPackItem[] = [];
  let limitApplied = false;

  for (const entry of input.requested) {
    const entryId = contextEntryId(entry);
    const reasons = contextViewRejectionReasons(input.view, entry);
    const action = entry.action ?? "read";
    if (reasons.length === 0) {
      const access = evaluateAgentEffectiveAccess({
        requested: {
          resourceType: entry.resourceType,
          resourceId: entry.resourceId,
          action,
          scopeType: entry.scopeType,
          scopeId: entry.scopeId,
        },
        agentGrants: input.agentGrants,
        assignmentGrants: input.assignmentGrants,
        executionProfileGrants: input.executionProfileGrants,
        connectorGrants: input.connectorGrants,
        hostGrants: input.hostGrants,
        runScopeGrants: input.runScopeGrants,
        now,
      });
      if (access.allowed) {
        if (!maxItems || accepted.length < maxItems) {
          accepted.push(contextPackItem(entryId, entry, action, access.matchedGrantIds, input.view.includeContent === true, redaction));
        } else {
          limitApplied = true;
        }
      } else {
        reasons.push(...access.reasons);
      }
    }
    if (reasons.length > 0) {
      denied.push({
        id: entryId,
        resourceType: entry.resourceType,
        ...(entry.resourceId ? { resourceId: entry.resourceId } : {}),
        reasons,
      });
    }
  }

  const gaps = contextPackGaps(input.requested, accepted, denied, limitApplied);
  const createdAt = now.toISOString();
  return {
    schemaVersion: 1,
    packKind: "claw_agent_context_pack",
    agentId: input.agentId,
    ...(input.assignmentId ? { assignmentId: input.assignmentId } : {}),
    view: redactAgentBoundaryValue(input.view, redaction) as AgentContextViewPolicy,
    items: accepted,
    denied,
    gaps,
    audit: createAgentAuditEvent({
      kind: "context_pack",
      agentId: input.agentId,
      assignmentId: input.assignmentId,
      result: gaps.includes("required_context_denied") ? "blocked" : "recorded",
      reason: "agent context pack projection",
      redaction,
      createdAt,
      metadata: {
        viewId: input.view.id,
        viewName: input.view.name,
        requestedCount: input.requested.length,
        itemCount: accepted.length,
        deniedCount: denied.length,
        gaps,
      },
    }),
  };
}

export function createAgentToolCatalogProjection(input: AgentToolCatalogProjectionInput): AgentToolCatalogProjection {
  const redaction = input.redaction ?? "strict";
  const now = normalizeTime(input.now);
  const allowedToolIds = new Set(input.allowedToolIds ?? []);
  const allowedDomains = new Set(input.allowedDomains ?? []);
  const approvedToolIds = new Set(input.approvalGrantedToolIds ?? []);
  const tools: AgentToolCatalogProjectionItem[] = [];
  const blocked: AgentToolCatalogBlockedItem[] = [];

  for (const tool of input.tools) {
    const reasons: string[] = [];
    if (allowedToolIds.size > 0 && !allowedToolIds.has(tool.id)) reasons.push("tool: not in allowed tool ids");
    if (allowedDomains.size > 0 && !allowedDomains.has(tool.domain)) reasons.push(`tool: domain ${tool.domain} outside allowed domains`);
    const access = evaluateAgentEffectiveAccess({
      requested: {
        resourceType: "tool",
        resourceId: tool.id,
        action: "invoke",
        scopeType: "domain",
        scopeId: tool.domain,
      },
      agentGrants: input.agentGrants,
      assignmentGrants: input.assignmentGrants,
      executionProfileGrants: input.executionProfileGrants,
      connectorGrants: input.connectorGrants,
      hostGrants: input.hostGrants,
      runScopeGrants: input.runScopeGrants,
      now,
    });
    if (!access.allowed) reasons.push(...access.reasons);
    if (tool.requiresApproval === true && !approvedToolIds.has(tool.id)) reasons.push("tool: approval required");
    if (tool.riskLevel === "catastrophic") reasons.push("tool: catastrophic risk requires host approval flow");

    if (reasons.length === 0) {
      tools.push(toolCatalogProjectionItem(tool, access.matchedGrantIds, redaction));
    } else {
      blocked.push({
        id: tool.id,
        domain: tool.domain,
        riskLevel: tool.riskLevel,
        reasons,
      });
    }
  }

  const gaps = toolCatalogGaps(input.tools, tools, blocked);
  const createdAt = now.toISOString();
  return {
    schemaVersion: 1,
    catalogKind: "claw_agent_tool_catalog",
    agentId: input.agentId,
    ...(input.assignmentId ? { assignmentId: input.assignmentId } : {}),
    tools,
    blocked,
    gaps,
    audit: createAgentAuditEvent({
      kind: "tool_catalog",
      agentId: input.agentId,
      assignmentId: input.assignmentId,
      result: tools.length > 0 ? "recorded" : "blocked",
      reason: "agent tool catalog projection",
      redaction,
      createdAt,
      metadata: {
        toolCount: tools.length,
        blockedCount: blocked.length,
        gaps,
      },
    }),
  };
}

export function createAgentCreationReview(input: AgentCreationReviewInput): AgentCreationReview {
  const redaction = input.redaction ?? "strict";
  const reviewedAt = input.reviewedAt ?? new Date().toISOString();
  const agentId = typeof input.agent.id === "string" ? input.agent.id : "agent.unknown";
  const safePackage = createAgentSafePackageExport({
    agent: input.agent,
    assignments: input.assignments,
    executionProfiles: input.executionProfiles,
    resourceGrants: input.resourceGrants,
    memoryPolicies: input.memoryPolicies,
    budgets: input.budgets,
    skillBindings: input.skillBindings,
    exportedAt: reviewedAt,
    redaction,
  });
  const surfaceProjection = createAgentSafeSurfaceProjection({
    surface: input.surface ?? "internal_ui",
    agent: input.agent,
    assignments: input.assignments,
    executionProfiles: input.executionProfiles,
    resourceGrants: input.resourceGrants,
    memoryPolicies: input.memoryPolicies,
    budgets: input.budgets,
    projectedAt: reviewedAt,
    redaction,
  });
  const requiredApprovals = creationReviewRequiredApprovals(input.resourceGrants ?? [], input.executionProfiles ?? [], surfaceProjection.risks);
  const gaps = [...new Set([...surfaceProjection.gaps, ...creationReviewGaps(input)])];
  const risks = [...new Set([...surfaceProjection.risks, ...creationReviewRisks(input)])];
  const ready = gaps.length === 0 && requiredApprovals.length === 0;
  return {
    schemaVersion: 1,
    reviewKind: "claw_agent_creation_review",
    agentId,
    reviewedAt,
    ready,
    requiredApprovals,
    gaps,
    risks,
    safePackage,
    surfaceProjection,
    audit: createAgentAuditEvent({
      kind: "creation_review",
      agentId,
      actorId: input.actorId,
      result: ready ? "allowed" : "blocked",
      reason: "agent creation review",
      redaction,
      createdAt: reviewedAt,
      metadata: {
        surface: input.surface ?? "internal_ui",
        requiredApprovals,
        gaps,
        risks,
      },
    }),
  };
}

export function createAgentStorageAudit(input: AgentStorageAuditInput = {}): AgentStorageAudit {
  const auditedAt = input.auditedAt ?? new Date().toISOString();
  const collections = input.collections ?? AGENTS_FAMILY.collections;
  const collectionNames = new Set(collections.map((collection) => collection.name));
  const observedTables = new Set(input.observedTables ?? [...collectionNames]);
  const allowedJsonFields = new Set(input.allowedJsonFields ?? DEFAULT_AGENT_ALLOWED_JSON_FIELDS);
  const requiredCollectionNames = new Set<string>(REQUIRED_AGENT_STORAGE_COLLECTIONS);
  const legacyOverlapNames = new Set<string>(LEGACY_AGENT_OVERLAP_COLLECTIONS);
  const missingCollections = REQUIRED_AGENT_STORAGE_COLLECTIONS.filter((name) => !collectionNames.has(name) || !observedTables.has(name));
  const missingRequiredFields: Array<{ collection: string; field: string }> = [];
  const jsonFields: Array<{ collection: string; field: string; allowed: boolean }> = [];
  const unexpectedJsonFields: Array<{ collection: string; field: string }> = [];
  const secretPolicyFindings: string[] = [];

  for (const collection of collections.filter((entry) => requiredCollectionNames.has(entry.name))) {
    for (const field of collection.fields) {
      if (field.required === true && !field.name) missingRequiredFields.push({ collection: collection.name, field: field.name });
      if (field.type === "json") {
        const allowed = allowedJsonFields.has(`${collection.name}.${field.name}`) || allowedJsonFields.has(field.name);
        jsonFields.push({ collection: collection.name, field: field.name, allowed });
        if (!allowed) unexpectedJsonFields.push({ collection: collection.name, field: field.name });
      }
      if (agentFieldLooksLikeRawSecret(field) && field.type !== "relation") {
        secretPolicyFindings.push(`${collection.name}.${field.name}: raw secret-shaped field must be a brokered ref or redacted metadata`);
      }
    }
  }

  const legacyOverlaps = (input.legacyCollections ?? []).filter((name) => legacyOverlapNames.has(name));
  const gaps = [
    ...missingCollections.map((name) => `missing_collection:${name}`),
    ...missingRequiredFields.map((item) => `missing_required_field:${item.collection}.${item.field}`),
    ...unexpectedJsonFields.map((item) => `unexpected_json_field:${item.collection}.${item.field}`),
    ...legacyOverlaps.map((name) => `legacy_overlap:${name}`),
    ...secretPolicyFindings.map((finding) => `secret_policy:${finding}`),
  ];
  const ready = gaps.length === 0;

  return {
    schemaVersion: 1,
    auditKind: "claw_agent_storage_audit",
    ready,
    canonicalCollections: [...REQUIRED_AGENT_STORAGE_COLLECTIONS],
    missingCollections,
    missingRequiredFields,
    jsonFields,
    unexpectedJsonFields,
    legacyOverlaps,
    secretPolicyFindings,
    gaps,
    audit: createAgentAuditEvent({
      kind: "storage_audit",
      agentId: "agents.storage",
      result: ready ? "allowed" : "blocked",
      reason: "agents storage and JSON policy audit",
      redaction: "strict",
      createdAt: auditedAt,
      metadata: {
        canonicalCollectionCount: REQUIRED_AGENT_STORAGE_COLLECTIONS.length,
        missingCollections,
        legacyOverlaps,
        unexpectedJsonFields,
      },
    }),
  };
}

export function createAgentAuditCoverageReport(input: AgentAuditCoverageInput = {}): AgentAuditCoverageReport {
  const auditedAt = input.auditedAt ?? new Date().toISOString();
  const expectedKinds = input.expectedKinds ?? [...DEFAULT_AGENT_AUDIT_COVERAGE_KINDS];
  const expectedKindSet = new Set<AgentAuditEventKind>(expectedKinds);
  const events = input.events ?? [];
  const coveredKinds = [...new Set(events.map((event) => event.kind).filter((kind) => expectedKindSet.has(kind)))];
  const missingKinds = expectedKinds.filter((kind) => !coveredKinds.includes(kind));
  const invalidEvents = events
    .map((event) => auditCoverageInvalidEvent(event))
    .filter((entry): entry is AgentAuditCoverageInvalidEvent => Boolean(entry));
  const sensitiveFindings = events.flatMap((event) => auditCoverageSensitiveFindings(event));
  const gaps = [
    ...missingKinds.map((kind) => `missing_audit_kind:${kind}`),
    ...invalidEvents.map((event) => `invalid_audit_event:${event.id ?? event.kind ?? "unknown"}`),
    ...sensitiveFindings.map((finding) => `sensitive_audit_metadata:${finding}`),
  ];
  const ready = gaps.length === 0;
  return {
    schemaVersion: 1,
    reportKind: "claw_agent_audit_coverage",
    ready,
    expectedKinds,
    coveredKinds,
    missingKinds,
    invalidEvents,
    sensitiveFindings,
    gaps,
    audit: createAgentAuditEvent({
      kind: "audit_coverage",
      agentId: "agents.audit",
      result: ready ? "allowed" : "blocked",
      reason: "agents audit coverage report",
      redaction: "strict",
      createdAt: auditedAt,
      metadata: {
        expectedKinds,
        coveredKinds,
        missingKinds,
        invalidEventCount: invalidEvents.length,
        sensitiveFindingCount: sensitiveFindings.length,
      },
    }),
  };
}

export function createAgentOperationalSnapshot(input: AgentOperationalSnapshotInput): AgentOperationalSnapshot {
  const redaction = input.redaction ?? "strict";
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const limit = normalizePositiveInteger(input.limit);
  const statuses = input.statuses ?? [];
  const assignments = filterOperationalRecords(input.assignments ?? [], input, redaction);
  const runs = filterOperationalRecords(input.runs ?? [], input, redaction);
  const sessions = filterOperationalRecords(input.sessions ?? [], input, redaction);
  const evaluations = filterOperationalRecords(input.evaluations ?? [], input, redaction);
  const incidents = filterOperationalRecords(input.incidents ?? [], input, redaction);
  const configRevisions = filterOperationalRecords(input.configRevisions ?? [], input, redaction);
  const audits = filterOperationalAudits(input.audits ?? [], input, redaction);
  const limitedAssignments = limit ? assignments.slice(0, limit) : assignments;
  const limitedRuns = limit ? runs.slice(0, limit) : runs;
  const limitedSessions = limit ? sessions.slice(0, limit) : sessions;
  const limitedEvaluations = limit ? evaluations.slice(0, limit) : evaluations;
  const limitedIncidents = limit ? incidents.slice(0, limit) : incidents;
  const limitedConfigRevisions = limit ? configRevisions.slice(0, limit) : configRevisions;
  const limitedAudits = limit ? audits.slice(0, limit) : audits;
  const gaps = operationalSnapshotGaps(limitedAssignments, limitedRuns, limitedSessions, limitedAudits);
  return {
    schemaVersion: 1,
    snapshotKind: "claw_agent_operational_snapshot",
    agentId: input.agentId,
    capturedAt,
    filters: {
      statuses,
      ...(input.since ? { since: input.since } : {}),
      ...(limit ? { limit } : {}),
    },
    summary: {
      assignments: countByStatus(limitedAssignments),
      runs: countByStatus(limitedRuns),
      sessions: countByStatus(limitedSessions),
      evaluations: countByStatus(limitedEvaluations),
      incidents: countByStatus(limitedIncidents),
      configRevisions: limitedConfigRevisions.length,
      audits: countByKind(limitedAudits),
    },
    assignments: limitedAssignments,
    runs: limitedRuns,
    sessions: limitedSessions,
    evaluations: limitedEvaluations,
    incidents: limitedIncidents,
    configRevisions: limitedConfigRevisions,
    audits: limitedAudits,
    gaps,
    audit: createAgentAuditEvent({
      kind: "operational_snapshot",
      agentId: input.agentId,
      result: gaps.length === 0 ? "recorded" : "blocked",
      reason: "agent operational query snapshot",
      redaction,
      createdAt: capturedAt,
      metadata: {
        filters: { statuses, since: input.since, limit },
        summary: {
          assignments: limitedAssignments.length,
          runs: limitedRuns.length,
          sessions: limitedSessions.length,
          evaluations: limitedEvaluations.length,
          incidents: limitedIncidents.length,
          configRevisions: limitedConfigRevisions.length,
          audits: limitedAudits.length,
        },
        gaps,
      },
    }),
  };
}

export function createAgentControlPanel(input: AgentControlPanelInput): AgentControlPanel {
  const redaction = input.redaction ?? "strict";
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const agentId = typeof input.agent.id === "string" ? input.agent.id : "agent.unknown";
  const surface = input.surface ?? "internal_ui";
  const surfaceProjection = createAgentSafeSurfaceProjection({
    surface,
    agent: input.agent,
    assignments: input.assignments,
    executionProfiles: input.executionProfiles,
    resourceGrants: input.resourceGrants,
    memoryPolicies: input.memoryPolicies,
    budgets: input.budgets,
    projectedAt: generatedAt,
    redaction,
  });
  const creationReview = createAgentCreationReview({
    agent: input.agent,
    assignments: input.assignments,
    executionProfiles: input.executionProfiles,
    resourceGrants: input.resourceGrants,
    memoryPolicies: input.memoryPolicies,
    budgets: input.budgets,
    surface,
    actorId: input.actorId,
    reviewedAt: generatedAt,
    redaction,
  });
  const operationalSnapshot = createAgentOperationalSnapshot({
    agentId,
    assignments: input.assignments,
    runs: input.runs,
    sessions: input.sessions,
    evaluations: input.evaluations,
    incidents: input.incidents,
    configRevisions: input.configRevisions,
    audits: input.audits,
    capturedAt: generatedAt,
    redaction,
  });
  const activityFeed = createAgentActivityFeed({
    agentId,
    assignments: input.assignments,
    runs: input.runs,
    sessions: input.sessions,
    evaluations: input.evaluations,
    incidents: input.incidents,
    configRevisions: input.configRevisions,
    audits: input.audits as unknown as Array<Record<string, unknown>> | undefined,
    limit: 25,
    redaction,
  });
  const permissionSummary = agentPermissionControlSummary(input.resourceGrants ?? [], generatedAt);
  const posture = agentControlPosture(input.agent, input.assignments ?? [], input.incidents ?? [], permissionSummary);
  const memory = agentMemoryControlSummary(input.memoryPolicies ?? []);
  const budgets = agentBudgetControlSummary(input.budgets ?? []);
  const uiVisibility = agentControlUiVisibility(input.assignments ?? [], surface);
  const risks = [...new Set([
    ...surfaceProjection.risks,
    ...creationReview.risks,
    ...agentControlPanelRisks(input),
  ])];
  const gaps = [...new Set([
    ...surfaceProjection.gaps,
    ...creationReview.gaps,
    ...operationalSnapshot.gaps,
    ...agentControlPanelGaps(input, posture, permissionSummary),
  ])];
  return {
    schemaVersion: 1,
    panelKind: "claw_agent_control_panel",
    agentId,
    generatedAt,
    identity: surfaceProjection.agent,
    posture,
    uiVisibility,
    permissions: permissionSummary,
    memory,
    budgets,
    creationReview,
    surfaceProjection,
    operationalSnapshot,
    activityFeed,
    risks,
    gaps,
    audit: createAgentAuditEvent({
      kind: "control_panel",
      agentId,
      actorId: input.actorId,
      result: gaps.length === 0 ? "recorded" : "blocked",
      reason: "agent human control panel projection",
      redaction,
      createdAt: generatedAt,
      metadata: {
        surface,
        posture,
        permissionSummary,
        gaps,
        risks,
      },
    }),
  };
}
