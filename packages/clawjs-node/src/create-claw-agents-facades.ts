import {
  createAgentActivityFeed,
  createAgentAuditEvent,
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
  createAgentPermissionEscalationRequest,
  createAgentPrivacyLifecyclePlan,
  createAgentRetirementPlan,
  createAgentSafePackageExport,
  createAgentSafeSurfaceProjection,
  createAgentServiceApiResponse,
  createAgentServiceApiHttpResponse,
  createAgentStorageAudit,
  createAgentSupportInboxProjection,
  createAgentToolCatalogProjection,
  evaluateAgentAssignmentRoute,
  evaluateAgentActionSeverity,
  evaluateAgentAutonomyPolicy,
  evaluateAgentBudget,
  evaluateAgentDelegationAccess,
  evaluateAgentEffectiveAccess,
  evaluateAgentMemoryAccess,
  evaluateAgentSupervisorAuthority,
  redactAgentBoundaryValue,
  resolveAgentExternalIdentity,
  type AgentActivityFeed,
  type AgentActivityFeedInput,
  type AgentActionSeverityRequest,
  type AgentActionSeverityResult,
  type AgentAuditCoverageInput,
  type AgentAuditCoverageReport,
  type AgentAutonomyPolicyInput,
  type AgentAutonomyPolicyResult,
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
  type AgentContextPack,
  type AgentContextPackInput,
  type AgentControlPanel,
  type AgentControlPanelInput,
  type AgentCreationReview,
  type AgentCreationReviewInput,
  type AgentDispatchPlan,
  type AgentDispatchPlanInput,
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
  type AgentOperationalSnapshot,
  type AgentOperationalSnapshotInput,
  type AgentPaperclipImportInput,
  type AgentPaperclipImportPlan,
  type AgentPermissionEscalationRequest,
  type AgentPrivacyLifecycleInput,
  type AgentPrivacyLifecyclePlan,
  type AgentRetirementInput,
  type AgentRetirementPlan,
  type AgentResolvedExternalIdentity,
  type AgentSafeExportInput,
  type AgentSafePackageExport,
  type AgentServiceApiRequest,
  type AgentServiceApiResponse,
  type AgentServiceApiHttpRequest,
  type AgentServiceApiHttpResponse,
  type AgentSafeSurfaceProjection,
  type AgentSafeSurfaceProjectionInput,
  type AgentStorageAudit,
  type AgentStorageAuditInput,
  type AgentSupervisorAuthorityInput,
  type AgentSupervisorAuthorityResult,
  type AgentSupportInboxProjection,
  type AgentSupportInboxProjectionInput,
  type AgentToolCatalogProjection,
  type AgentToolCatalogProjectionInput,
} from "@clawjs/core";

export interface ClawAgentsFacade {
  evaluateAccess: (input: AgentEffectiveAccessInput) => AgentEffectiveAccessResult;
  delegationCheck: (input: AgentDelegationAccessInput) => AgentEffectiveAccessResult;
  supervisorCheck: (input: AgentSupervisorAuthorityInput) => AgentSupervisorAuthorityResult;
  routeCheck: (input: AgentAssignmentRouteRequest) => AgentAssignmentRouteResult;
  resolveExternalIdentity: (profile: AgentExternalIdentityProfile, privacyPolicy?: AgentAssignmentPrivacyPolicy) => AgentResolvedExternalIdentity;
  projectSupportInbox: (input: AgentSupportInboxProjectionInput) => AgentSupportInboxProjection;
  memoryCheck: (policy: AgentMemoryPolicy, request: AgentMemoryAccessRequest) => AgentMemoryAccessResult;
  budgetCheck: (policy: AgentBudgetPolicy, request: AgentBudgetRequest) => AgentBudgetEvaluationResult;
  actionSeverity: (input: AgentActionSeverityRequest) => AgentActionSeverityResult;
  autonomyCheck: (input: AgentAutonomyPolicyInput) => AgentAutonomyPolicyResult;
  dispatchPlan: (input: AgentDispatchPlanInput) => AgentDispatchPlan;
  contextPack: (input: AgentContextPackInput) => AgentContextPack;
  controlPanel: (input: AgentControlPanelInput) => AgentControlPanel;
  toolCatalog: (input: AgentToolCatalogProjectionInput) => AgentToolCatalogProjection;
  creationReview: (input: AgentCreationReviewInput) => AgentCreationReview;
  storageAudit: (input?: AgentStorageAuditInput) => AgentStorageAudit;
  surfaceProjection: (input: AgentSafeSurfaceProjectionInput) => AgentSafeSurfaceProjection;
  configRevision: (input: AgentConfigRevisionInput) => AgentConfigRevision;
  incident: (input: AgentIncidentInput) => AgentIncident;
  activityFeed: (input: AgentActivityFeedInput) => AgentActivityFeed;
  blueprint: (input: AgentBlueprintInput) => AgentBlueprint;
  evaluation: (input: AgentEvaluationInput) => AgentEvaluation;
  safePackageExport: (input: AgentSafeExportInput) => AgentSafePackageExport;
  serviceApi: (input: AgentServiceApiRequest) => AgentServiceApiResponse;
  serviceApiHttp: (input: AgentServiceApiHttpRequest) => AgentServiceApiHttpResponse;
  retirementPlan: (input: AgentRetirementInput) => AgentRetirementPlan;
  auditCoverage: (input?: AgentAuditCoverageInput) => AgentAuditCoverageReport;
  operationalSnapshot: (input: AgentOperationalSnapshotInput) => AgentOperationalSnapshot;
  paperclipImport: (input: AgentPaperclipImportInput) => AgentPaperclipImportPlan;
  privacyPlan: (input: AgentPrivacyLifecycleInput) => AgentPrivacyLifecyclePlan;
  permissionEscalation: (input: Omit<AgentPermissionEscalationRequest, "id"> & { id?: string }) => AgentPermissionEscalationRequest;
  auditEvent: (input: Parameters<typeof createAgentAuditEvent>[0]) => AgentAuditEvent;
  redactBoundaryValue: typeof redactAgentBoundaryValue;
}

export function createClawAgentsFacades(): { agents: ClawAgentsFacade } {
  return {
    agents: {
      evaluateAccess: evaluateAgentEffectiveAccess,
      delegationCheck: evaluateAgentDelegationAccess,
      supervisorCheck: evaluateAgentSupervisorAuthority,
      routeCheck: evaluateAgentAssignmentRoute,
      resolveExternalIdentity: resolveAgentExternalIdentity,
      projectSupportInbox: createAgentSupportInboxProjection,
      memoryCheck: evaluateAgentMemoryAccess,
      budgetCheck: evaluateAgentBudget,
      actionSeverity: evaluateAgentActionSeverity,
      autonomyCheck: evaluateAgentAutonomyPolicy,
      dispatchPlan: createAgentDispatchPlan,
      contextPack: createAgentContextPack,
      controlPanel: createAgentControlPanel,
      toolCatalog: createAgentToolCatalogProjection,
      creationReview: createAgentCreationReview,
      storageAudit: createAgentStorageAudit,
      surfaceProjection: createAgentSafeSurfaceProjection,
      configRevision: createAgentConfigRevision,
      incident: createAgentIncident,
      activityFeed: createAgentActivityFeed,
      blueprint: createAgentBlueprint,
      evaluation: createAgentEvaluation,
      safePackageExport: createAgentSafePackageExport,
      serviceApi: createAgentServiceApiResponse,
      serviceApiHttp: createAgentServiceApiHttpResponse,
      retirementPlan: createAgentRetirementPlan,
      auditCoverage: createAgentAuditCoverageReport,
      operationalSnapshot: createAgentOperationalSnapshot,
      paperclipImport: createAgentPaperclipImportPlan,
      privacyPlan: createAgentPrivacyLifecyclePlan,
      permissionEscalation: createAgentPermissionEscalationRequest,
      auditEvent: createAgentAuditEvent,
      redactBoundaryValue: redactAgentBoundaryValue,
    },
  };
}
