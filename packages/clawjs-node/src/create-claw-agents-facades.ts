import {
  createAgentActivityFeed,
  createAgentAuditEvent,
  createAgentBlueprint,
  createAgentConfigRevision,
  createAgentEvaluation,
  createAgentIncident,
  createAgentPermissionEscalationRequest,
  createAgentSafePackageExport,
  createAgentSafeSurfaceProjection,
  createAgentSupportInboxProjection,
  evaluateAgentAssignmentRoute,
  evaluateAgentBudget,
  evaluateAgentDelegationAccess,
  evaluateAgentEffectiveAccess,
  evaluateAgentMemoryAccess,
  redactAgentBoundaryValue,
  resolveAgentExternalIdentity,
  type AgentActivityFeed,
  type AgentActivityFeedInput,
  type AgentAssignmentPrivacyPolicy,
  type AgentAssignmentRouteRequest,
  type AgentAssignmentRouteResult,
  type AgentAuditEvent,
  type AgentBlueprint,
  type AgentBlueprintInput,
  type AgentBudgetEvaluationResult,
  type AgentBudgetPolicy,
  type AgentBudgetRequest,
  type AgentConfigRevision,
  type AgentConfigRevisionInput,
  type AgentDelegationAccessInput,
  type AgentEffectiveAccessInput,
  type AgentEffectiveAccessResult,
  type AgentEvaluation,
  type AgentEvaluationInput,
  type AgentExternalIdentityProfile,
  type AgentIncident,
  type AgentIncidentInput,
  type AgentMemoryAccessRequest,
  type AgentMemoryAccessResult,
  type AgentMemoryPolicy,
  type AgentPermissionEscalationRequest,
  type AgentResolvedExternalIdentity,
  type AgentSafeExportInput,
  type AgentSafePackageExport,
  type AgentSafeSurfaceProjection,
  type AgentSafeSurfaceProjectionInput,
  type AgentSupportInboxProjection,
  type AgentSupportInboxProjectionInput,
} from "@clawjs/core";

export interface ClawAgentsFacade {
  evaluateAccess: (input: AgentEffectiveAccessInput) => AgentEffectiveAccessResult;
  delegationCheck: (input: AgentDelegationAccessInput) => AgentEffectiveAccessResult;
  routeCheck: (input: AgentAssignmentRouteRequest) => AgentAssignmentRouteResult;
  resolveExternalIdentity: (profile: AgentExternalIdentityProfile, privacyPolicy?: AgentAssignmentPrivacyPolicy) => AgentResolvedExternalIdentity;
  projectSupportInbox: (input: AgentSupportInboxProjectionInput) => AgentSupportInboxProjection;
  memoryCheck: (policy: AgentMemoryPolicy, request: AgentMemoryAccessRequest) => AgentMemoryAccessResult;
  budgetCheck: (policy: AgentBudgetPolicy, request: AgentBudgetRequest) => AgentBudgetEvaluationResult;
  surfaceProjection: (input: AgentSafeSurfaceProjectionInput) => AgentSafeSurfaceProjection;
  configRevision: (input: AgentConfigRevisionInput) => AgentConfigRevision;
  incident: (input: AgentIncidentInput) => AgentIncident;
  activityFeed: (input: AgentActivityFeedInput) => AgentActivityFeed;
  blueprint: (input: AgentBlueprintInput) => AgentBlueprint;
  evaluation: (input: AgentEvaluationInput) => AgentEvaluation;
  safePackageExport: (input: AgentSafeExportInput) => AgentSafePackageExport;
  permissionEscalation: (input: Omit<AgentPermissionEscalationRequest, "id"> & { id?: string }) => AgentPermissionEscalationRequest;
  auditEvent: (input: Parameters<typeof createAgentAuditEvent>[0]) => AgentAuditEvent;
  redactBoundaryValue: typeof redactAgentBoundaryValue;
}

export function createClawAgentsFacades(): { agents: ClawAgentsFacade } {
  return {
    agents: {
      evaluateAccess: evaluateAgentEffectiveAccess,
      delegationCheck: evaluateAgentDelegationAccess,
      routeCheck: evaluateAgentAssignmentRoute,
      resolveExternalIdentity: resolveAgentExternalIdentity,
      projectSupportInbox: createAgentSupportInboxProjection,
      memoryCheck: evaluateAgentMemoryAccess,
      budgetCheck: evaluateAgentBudget,
      surfaceProjection: createAgentSafeSurfaceProjection,
      configRevision: createAgentConfigRevision,
      incident: createAgentIncident,
      activityFeed: createAgentActivityFeed,
      blueprint: createAgentBlueprint,
      evaluation: createAgentEvaluation,
      safePackageExport: createAgentSafePackageExport,
      permissionEscalation: createAgentPermissionEscalationRequest,
      auditEvent: createAgentAuditEvent,
      redactBoundaryValue: redactAgentBoundaryValue,
    },
  };
}
