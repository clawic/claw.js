import type { AgentToolDescriptor, AgentToolRiskLevel } from "./agent_tools.ts";
import type { BuiltinCollectionDefinition, BuiltinFieldDefinition } from "./builtins/index.ts";
import type { RegulatedDecisionEffect, RegulatedDomain, SensitiveDataClass } from "./regulated-domain-safety.ts";
import { evaluateRegulatedAction } from "./regulated-domain-safety.ts";
import { AGENTS_FAMILY } from "./builtins/index.ts";

export const AGENT_ASSIGNMENT_STATUSES = [
  "draft",
  "pending_approval",
  "active",
  "paused",
  "expired",
  "revoked",
  "archived",
  "error",
] as const;

export type AgentAssignmentStatus = typeof AGENT_ASSIGNMENT_STATUSES[number];

export const AGENT_ASSIGNMENT_KINDS = [
  "internal_mac_chat",
  "external_web_chat",
  "external_telegram",
  "external_whatsapp",
  "external_email",
  "support_inbox",
  "workflow",
  "automation",
  "subagent_delegation",
  "mcp_api",
  "relay",
  "custom_channel",
] as const;

export type AgentAssignmentKind = typeof AGENT_ASSIGNMENT_KINDS[number];

export const AGENCY_MODES = [
  "assistant",
  "worker",
  "support",
  "receptionist",
  "operator",
  "automation",
  "workflow_agent",
  "subagent",
  "reviewer",
  "manager",
] as const;

export type AgencyMode = typeof AGENCY_MODES[number];

export const AGENT_RESOURCE_ACTIONS = [
  "read",
  "write",
  "create",
  "update",
  "delete",
  "execute",
  "invoke",
  "lease_secret",
  "approve",
] as const;

export type AgentResourceAction = typeof AGENT_RESOURCE_ACTIONS[number] | "*";

export type AgentGrantEffect = "allow" | "deny";

export interface AgentResourceGrant {
  id?: string;
  resourceType: string;
  resourceId?: string;
  action: AgentResourceAction;
  scopeType?: string;
  scopeId?: string;
  effect?: AgentGrantEffect;
  expiresAt?: string;
}

export interface AgentSkillBinding {
  ref: string;
  version?: string;
  requiredResourceGrants?: AgentResourceGrant[];
  requiredAssignmentKinds?: AgentAssignmentKind[];
  optional?: boolean;
  metadata?: Record<string, unknown>;
}

export interface AgentAccessRequest {
  resourceType: string;
  resourceId?: string;
  action: AgentResourceAction;
  scopeType?: string;
  scopeId?: string;
  regulatedSafety?: AgentRegulatedSafetyDeclaration;
}

export interface AgentRegulatedSafetyDeclaration {
  regulatedDomains: RegulatedDomain[];
  sensitiveDataClasses?: SensitiveDataClass[];
  decisionEffect: RegulatedDecisionEffect;
  professionalReviewRequired?: boolean;
  outputLabelsRequired?: boolean;
  externalAction?: boolean;
  sensitiveExport?: boolean;
  remoteOrProviderUse?: boolean;
}

export interface AgentEffectiveAccessInput {
  requested: AgentAccessRequest;
  agentGrants?: AgentResourceGrant[];
  assignmentGrants?: AgentResourceGrant[];
  executionProfileGrants?: AgentResourceGrant[];
  connectorGrants?: AgentResourceGrant[];
  hostGrants?: AgentResourceGrant[];
  runScopeGrants?: AgentResourceGrant[];
  now?: string | Date;
}

export interface AgentEffectiveAccessResult {
  allowed: boolean;
  reasons: string[];
  matchedGrantIds: string[];
}

export interface AgentDelegationAccessInput {
  parent: AgentEffectiveAccessInput;
  child: AgentEffectiveAccessInput;
}

export interface AgentPermissionEscalationRequest {
  id: string;
  agentId: string;
  assignmentId?: string;
  resourceType: string;
  action: AgentResourceAction;
  scopeType?: string;
  scopeId?: string;
  reason: string;
  duration: string;
  risk: "low" | "medium" | "high" | "critical";
  approverId?: string;
}

export type AgentSupervisorAction = "observe" | "suggest" | "approve_escalation" | "pause_assignment" | "edit_config" | "retire_agent";
export type AgentSupervisorAuthorityLevel = "observe" | "suggest" | "approve_low_risk" | "approve_medium_risk" | "approve_high_risk";

export interface AgentSupervisorAuthorityInput {
  supervisor: {
    id: string;
    authorityLevel?: AgentSupervisorAuthorityLevel;
    allowedActions?: AgentSupervisorAction[];
    scopeType?: string;
    scopeId?: string;
  };
  targetAgent: {
    id: string;
    managerAgentId?: string;
    teamId?: string;
    scopeType?: string;
    scopeId?: string;
  };
  request: {
    action: AgentSupervisorAction;
    risk: AgentPermissionEscalationRequest["risk"];
    scopeType?: string;
    scopeId?: string;
  };
}

export interface AgentSupervisorAuthorityResult {
  allowed: boolean;
  reasons: string[];
  maxRisk: AgentPermissionEscalationRequest["risk"];
}

export interface AgentRetirementInput {
  agent: Record<string, unknown>;
  assignments?: Array<Record<string, unknown>>;
  resourceGrants?: Array<Record<string, unknown>>;
  reason: string;
  actorId?: string;
  retiredAt?: string;
  snapshotRef?: string;
  redaction?: "default" | "strict" | "custom";
}

export interface AgentRetirementPlan {
  schemaVersion: 1;
  planKind: "claw_agent_retirement_plan";
  agentId: string;
  retiredAt: string;
  reason: string;
  snapshotRef: string;
  agentPatch: Record<string, unknown>;
  assignmentPatches: Array<Record<string, unknown>>;
  resourceGrantPatches: Array<Record<string, unknown>>;
  recoverable: boolean;
  audit: AgentAuditEvent;
}

export type AgentAssignmentPrivacyPolicy = "off" | "hashed" | "raw_with_retention";
export type AgentExternalDisclosure = "transparent_agent" | "custom_agent_wording";

export interface AgentAssignmentRoute {
  id: string;
  agentId: string;
  kind: AgentAssignmentKind;
  status: AgentAssignmentStatus;
  channel?: string;
  endpointRef?: string;
  privacyPolicy?: AgentAssignmentPrivacyPolicy;
  telemetryRetentionDays?: number;
  externalDisclosure?: AgentExternalDisclosure;
  startsAt?: string;
  expiresAt?: string;
  scopeType?: string;
  scopeId?: string;
  respondOnlyDefault?: boolean;
}

export interface AgentAssignmentRouteRequest {
  assignment?: AgentAssignmentRoute | null;
  kind: AgentAssignmentKind;
  channel?: string;
  endpointRef?: string;
  now?: string | Date;
}

export interface AgentAssignmentRouteResult {
  allowed: boolean;
  reasons: string[];
  disclosureRequired: boolean;
}

export interface AgentExternalIdentityProfile {
  provider: string;
  externalId?: string;
  visitorId?: string;
  email?: string;
  phone?: string;
  displayName?: string;
  customerId?: string;
  ip?: string;
  userAgent?: string;
}

export interface AgentResolvedExternalIdentity {
  externalUserId: string;
  actorId: string;
  contactProjection: "none" | "create_or_update";
  customerId?: string;
  telemetry: Record<string, string>;
  boundary: {
    scopeType: "customer" | "external_user";
    scopeId: string;
  };
}

export interface AgentSupportInboxProjectionInput {
  sessionId: string;
  assignment: AgentAssignmentRoute;
  identity: AgentResolvedExternalIdentity;
  initialMessage: string;
  now?: string | Date;
}

export interface AgentSupportInboxProjection {
  conversation: {
    id: string;
    status: "open";
    externalUserId: string;
    contactProjection: "none" | "create_or_update";
    customerId?: string;
    assigneeActorId: string;
    source: Record<string, string>;
    metadata: Record<string, string>;
    lastMessageAt: string;
  };
  message: {
    id: string;
    conversationId: string;
    externalUserId: string;
    actorId: string;
    direction: "inbound";
    channel: string;
    body: string;
    source: Record<string, string>;
  };
}

export type AgentMemoryLayer = "agent_private" | "team" | "global" | "customer" | "project" | "session";
export type AgentMemoryOperation = "read" | "write";
export type AgentMemoryScopeAccess = AgentMemoryOperation | "read_write";
export type AgentMemoryWritePolicy = "none" | "private_only" | "scoped" | "shared_with_review" | "global_allowed";

export interface AgentMemoryScope {
  layer: AgentMemoryLayer;
  scopeId?: string;
  access: AgentMemoryScopeAccess;
}

export interface AgentMemoryPolicy {
  id?: string;
  readScopes?: AgentMemoryScope[];
  writeScopes?: AgentMemoryScope[];
  writePolicy: AgentMemoryWritePolicy;
  crossUserBoundary?: "tenant_context" | "explicit_grant_only";
}

export interface AgentMemoryAccessRequest {
  operation: AgentMemoryOperation;
  layer: AgentMemoryLayer;
  scopeId?: string;
  boundary?: {
    scopeType: "customer" | "external_user" | "project" | "workspace" | "team" | "agent";
    scopeId: string;
  };
  explicitGrant?: boolean;
}

export interface AgentMemoryAccessResult {
  allowed: boolean;
  reasons: string[];
  matchedScope?: AgentMemoryScope;
}

export type AgentBudgetDimension = "money" | "tokens" | "time_ms" | "runs" | "external_actions";
export type AgentBudgetExceededBehavior = "pause_affected_scope" | "pause_agent" | "require_approval" | "deny_action";

export interface AgentBudgetLimit {
  dimension: AgentBudgetDimension;
  limit: number;
  used?: number;
  scopeType?: string;
  scopeId?: string;
}

export interface AgentBudgetPolicy {
  id?: string;
  exceededBehavior: AgentBudgetExceededBehavior;
  limits: AgentBudgetLimit[];
}

export interface AgentBudgetRequest {
  dimension: AgentBudgetDimension;
  cost: number;
  scopeType?: string;
  scopeId?: string;
  externalPaidAction?: boolean;
  connectorGateAllowed?: boolean;
}

export interface AgentBudgetEvaluationResult {
  allowed: boolean;
  reasons: string[];
  exceededBehavior: AgentBudgetExceededBehavior;
  matchedLimit?: AgentBudgetLimit;
}

export type AgentActionSeverity = AgentIncidentSeverity;

export interface AgentActionSeverityRequest {
  action: AgentResourceAction | string;
  resourceType?: string;
  resourceId?: string;
  externalSideEffect?: boolean;
  paidAction?: boolean;
  rawPii?: boolean;
  productionMutation?: boolean;
  nativeHostAccess?: boolean;
  destructive?: boolean;
  irreversible?: boolean;
}

export interface AgentActionSeverityResult {
  severity: AgentActionSeverity;
  reasons: string[];
  approvalRequired: boolean;
  connectorGateRequired: boolean;
  budgetRequired: boolean;
  hostGateRequired: boolean;
}

export type AgentAutonomyProfile = "respond_only" | "suggest" | "act_limited" | "act_full";
export type AgentAutonomyDispatchMode = "respond_only" | "suggest_only" | "act";

export interface AgentAutonomyPolicyInput {
  profile: AgentAutonomyProfile;
  action: AgentActionSeverityRequest;
  approvalGranted?: boolean;
  connectorGateAllowed?: boolean;
  budgetAllowed?: boolean;
  hostGateAllowed?: boolean;
}

export interface AgentAutonomyPolicyResult {
  allowed: boolean;
  profile: AgentAutonomyProfile;
  dispatchMode: AgentAutonomyDispatchMode;
  severity: AgentActionSeverity;
  reasons: string[];
  requiredGates: string[];
}

export type AgentExecutionMode = "sync" | "async" | "streaming" | "scheduled";
export type AgentDispatchDisposition = "respond" | "suggest" | "invoke_sync" | "queue_async" | "stream" | "schedule" | "blocked";
export type AgentDispatchRunStatus = "ready" | "queued" | "running" | "awaiting_input" | "blocked";

export interface AgentExecutionProfileDispatch {
  id?: string;
  executionMode?: AgentExecutionMode;
  runtime?: string;
  status?: "active" | "paused" | "archived" | "error";
}

export interface AgentDispatchPlanInput {
  agentId: string;
  assignment?: AgentAssignmentRoute | null;
  assignmentRequest: Omit<AgentAssignmentRouteRequest, "assignment">;
  executionProfile?: AgentExecutionProfileDispatch | null;
  autonomy: Omit<AgentAutonomyPolicyInput, "action">;
  action: AgentActionSeverityRequest;
  scheduledAt?: string;
  externalActAllowed?: boolean;
  now?: string | Date;
}

export interface AgentDispatchPlan {
  schemaVersion: 1;
  planKind: "claw_agent_dispatch_plan";
  agentId: string;
  assignmentId?: string;
  executionProfileId?: string;
  allowed: boolean;
  disposition: AgentDispatchDisposition;
  runStatus: AgentDispatchRunStatus;
  executionMode?: AgentExecutionMode;
  autonomy: AgentAutonomyPolicyResult;
  route: AgentAssignmentRouteResult;
  reasons: string[];
  requiredGates: string[];
  audit: AgentAuditEvent;
}

export interface AgentContextScope {
  scopeType: string;
  scopeId?: string;
}

export interface AgentContextViewPolicy {
  id?: string;
  name?: string;
  allowedResourceTypes?: string[];
  allowedScopes?: AgentContextScope[];
  maxItems?: number;
  includeContent?: boolean;
}

export interface AgentContextPackEntry {
  id?: string;
  resourceType: string;
  resourceId?: string;
  action?: AgentResourceAction;
  scopeType?: string;
  scopeId?: string;
  title?: string;
  content?: unknown;
  metadata?: Record<string, unknown>;
  required?: boolean;
}

export interface AgentContextPackInput {
  agentId: string;
  assignmentId?: string;
  view: AgentContextViewPolicy;
  requested: AgentContextPackEntry[];
  agentGrants?: AgentResourceGrant[];
  assignmentGrants?: AgentResourceGrant[];
  executionProfileGrants?: AgentResourceGrant[];
  connectorGrants?: AgentResourceGrant[];
  hostGrants?: AgentResourceGrant[];
  runScopeGrants?: AgentResourceGrant[];
  now?: string | Date;
  redaction?: "default" | "strict" | "custom";
}

export interface AgentContextPackItem {
  id: string;
  resourceType: string;
  resourceId?: string;
  action: AgentResourceAction;
  scopeType?: string;
  scopeId?: string;
  title?: string;
  hasContent: boolean;
  content?: unknown;
  metadata: Record<string, unknown>;
  matchedGrantIds: string[];
}

export interface AgentContextPackDeniedItem {
  id: string;
  resourceType: string;
  resourceId?: string;
  reasons: string[];
}

export interface AgentContextPack {
  schemaVersion: 1;
  packKind: "claw_agent_context_pack";
  agentId: string;
  assignmentId?: string;
  view: AgentContextViewPolicy;
  items: AgentContextPackItem[];
  denied: AgentContextPackDeniedItem[];
  gaps: string[];
  audit: AgentAuditEvent;
}

export interface AgentToolCatalogProjectionInput {
  agentId: string;
  assignmentId?: string;
  tools: AgentToolDescriptor[];
  allowedToolIds?: string[];
  allowedDomains?: string[];
  approvalGrantedToolIds?: string[];
  agentGrants?: AgentResourceGrant[];
  assignmentGrants?: AgentResourceGrant[];
  executionProfileGrants?: AgentResourceGrant[];
  connectorGrants?: AgentResourceGrant[];
  hostGrants?: AgentResourceGrant[];
  runScopeGrants?: AgentResourceGrant[];
  now?: string | Date;
  redaction?: "default" | "strict" | "custom";
}

export interface AgentToolCatalogProjectionItem {
  id: string;
  title: string;
  description: string;
  domain: string;
  sourceFeature: string;
  parameters: AgentToolDescriptor["parameters"];
  riskLevel: AgentToolRiskLevel;
  version?: string;
  requiresApproval: boolean;
  matchedGrantIds: string[];
}

export interface AgentToolCatalogBlockedItem {
  id: string;
  domain: string;
  riskLevel: AgentToolRiskLevel;
  reasons: string[];
}

export interface AgentToolCatalogProjection {
  schemaVersion: 1;
  catalogKind: "claw_agent_tool_catalog";
  agentId: string;
  assignmentId?: string;
  tools: AgentToolCatalogProjectionItem[];
  blocked: AgentToolCatalogBlockedItem[];
  gaps: string[];
  audit: AgentAuditEvent;
}

export interface AgentCreationReviewInput {
  agent: Record<string, unknown>;
  assignments?: Array<Record<string, unknown>>;
  executionProfiles?: Array<Record<string, unknown>>;
  resourceGrants?: Array<Record<string, unknown>>;
  memoryPolicies?: Array<Record<string, unknown>>;
  budgets?: Array<Record<string, unknown>>;
  skillBindings?: AgentSkillBinding[];
  surface?: AgentSafeSurfaceKind;
  actorId?: string;
  reviewedAt?: string;
  redaction?: "default" | "strict" | "custom";
}

export interface AgentCreationReview {
  schemaVersion: 1;
  reviewKind: "claw_agent_creation_review";
  agentId: string;
  reviewedAt: string;
  ready: boolean;
  requiredApprovals: string[];
  gaps: string[];
  risks: string[];
  safePackage: AgentSafePackageExport;
  surfaceProjection: AgentSafeSurfaceProjection;
  audit: AgentAuditEvent;
}

export interface AgentStorageAuditInput {
  collections?: BuiltinCollectionDefinition[];
  observedTables?: string[];
  legacyCollections?: string[];
  allowedJsonFields?: string[];
  auditedAt?: string;
}

export interface AgentStorageAudit {
  schemaVersion: 1;
  auditKind: "claw_agent_storage_audit";
  ready: boolean;
  canonicalCollections: string[];
  missingCollections: string[];
  missingRequiredFields: Array<{ collection: string; field: string }>;
  jsonFields: Array<{ collection: string; field: string; allowed: boolean }>;
  unexpectedJsonFields: Array<{ collection: string; field: string }>;
  legacyOverlaps: string[];
  secretPolicyFindings: string[];
  gaps: string[];
  audit: AgentAuditEvent;
}

export interface AgentAuditCoverageInput {
  events?: AgentAuditEvent[];
  expectedKinds?: AgentAuditEventKind[];
  auditedAt?: string;
}

export interface AgentAuditCoverageInvalidEvent {
  id?: string;
  kind?: string;
  reasons: string[];
}

export interface AgentAuditCoverageReport {
  schemaVersion: 1;
  reportKind: "claw_agent_audit_coverage";
  ready: boolean;
  expectedKinds: AgentAuditEventKind[];
  coveredKinds: AgentAuditEventKind[];
  missingKinds: AgentAuditEventKind[];
  invalidEvents: AgentAuditCoverageInvalidEvent[];
  sensitiveFindings: string[];
  gaps: string[];
  audit: AgentAuditEvent;
}

export interface AgentOperationalSnapshotInput {
  agentId: string;
  assignments?: Array<Record<string, unknown>>;
  runs?: Array<Record<string, unknown>>;
  sessions?: Array<Record<string, unknown>>;
  evaluations?: Array<Record<string, unknown>>;
  incidents?: Array<Record<string, unknown>>;
  configRevisions?: Array<Record<string, unknown>>;
  audits?: AgentAuditEvent[];
  statuses?: string[];
  since?: string;
  limit?: number;
  capturedAt?: string;
  redaction?: "default" | "strict" | "custom";
}

export interface AgentOperationalSnapshotSummary {
  assignments: Record<string, number>;
  runs: Record<string, number>;
  sessions: Record<string, number>;
  evaluations: Record<string, number>;
  incidents: Record<string, number>;
  configRevisions: number;
  audits: Record<string, number>;
}

export interface AgentOperationalSnapshot {
  schemaVersion: 1;
  snapshotKind: "claw_agent_operational_snapshot";
  agentId: string;
  capturedAt: string;
  filters: {
    statuses: string[];
    since?: string;
    limit?: number;
  };
  summary: AgentOperationalSnapshotSummary;
  assignments: Array<Record<string, unknown>>;
  runs: Array<Record<string, unknown>>;
  sessions: Array<Record<string, unknown>>;
  evaluations: Array<Record<string, unknown>>;
  incidents: Array<Record<string, unknown>>;
  configRevisions: Array<Record<string, unknown>>;
  audits: AgentAuditEvent[];
  gaps: string[];
  audit: AgentAuditEvent;
}

export interface AgentControlPanelInput {
  agent: Record<string, unknown>;
  assignments?: Array<Record<string, unknown>>;
  executionProfiles?: Array<Record<string, unknown>>;
  resourceGrants?: Array<Record<string, unknown>>;
  memoryPolicies?: Array<Record<string, unknown>>;
  budgets?: Array<Record<string, unknown>>;
  runs?: Array<Record<string, unknown>>;
  sessions?: Array<Record<string, unknown>>;
  evaluations?: Array<Record<string, unknown>>;
  incidents?: Array<Record<string, unknown>>;
  configRevisions?: Array<Record<string, unknown>>;
  audits?: AgentAuditEvent[];
  surface?: AgentSafeSurfaceKind;
  actorId?: string;
  generatedAt?: string;
  redaction?: "default" | "strict" | "custom";
}

export interface AgentControlPanel {
  schemaVersion: 1;
  panelKind: "claw_agent_control_panel";
  agentId: string;
  generatedAt: string;
  identity: Record<string, unknown>;
  posture: {
    status: string;
    autonomyProfile?: string;
    activeAssignments: number;
    externalAssignments: number;
    openIncidents: number;
    failClosed: boolean;
  };
  uiVisibility: {
    macVisible: boolean;
    surfaces: string[];
  };
  permissions: {
    allowGrants: number;
    denyGrants: number;
    wildcardGrants: number;
    secretLeaseGrants: number;
    expiredGrants: number;
    requiredApprovals: string[];
  };
  memory: {
    policyCount: number;
    crossUserBoundary: string[];
    writePolicies: string[];
  };
  budgets: {
    policyCount: number;
    exceededBehaviors: string[];
  };
  creationReview: AgentCreationReview;
  surfaceProjection: AgentSafeSurfaceProjection;
  operationalSnapshot: AgentOperationalSnapshot;
  activityFeed: AgentActivityFeed;
  risks: string[];
  gaps: string[];
  audit: AgentAuditEvent;
}

export type AgentPrivacyLifecycleOperation = "export" | "delete" | "anonymize";
export type AgentPrivacyLifecycleDisposition = "include_export" | "delete" | "anonymize" | "retain";

export interface AgentPrivacyLifecycleSubject {
  scopeType: "agent" | "customer" | "external_user" | "actor" | "workspace" | "project" | "team";
  scopeId: string;
}

export interface AgentPrivacyLifecycleInput {
  operation: AgentPrivacyLifecycleOperation;
  subject: AgentPrivacyLifecycleSubject;
  agent: Record<string, unknown>;
  assignments?: Array<Record<string, unknown>>;
  runs?: Array<Record<string, unknown>>;
  sessions?: Array<Record<string, unknown>>;
  evaluations?: Array<Record<string, unknown>>;
  incidents?: Array<Record<string, unknown>>;
  configRevisions?: Array<Record<string, unknown>>;
  audits?: AgentAuditEvent[];
  supportConversations?: Array<Record<string, unknown>>;
  supportMessages?: Array<Record<string, unknown>>;
  actorId?: string;
  requestedAt?: string;
  legalHoldRecordIds?: string[];
  redaction?: "default" | "strict" | "custom";
}

export interface AgentPrivacyLifecycleAction {
  collection: string;
  recordId: string;
  disposition: AgentPrivacyLifecycleDisposition;
  reason: string;
  patch?: Record<string, unknown>;
}

export interface AgentPrivacyLifecyclePlan {
  schemaVersion: 1;
  planKind: "claw_agent_privacy_lifecycle_plan";
  operation: AgentPrivacyLifecycleOperation;
  subject: AgentPrivacyLifecycleSubject;
  agentId: string;
  requestedAt: string;
  actions: AgentPrivacyLifecycleAction[];
  exportPackage?: AgentSafePackageExport;
  exportRecords: Array<{ collection: string; record: Record<string, unknown> }>;
  gaps: string[];
  audit: AgentAuditEvent;
}

export interface AgentPaperclipImportInput {
  packageId?: string;
  agentsMd?: string;
  package?: {
    name?: string;
    description?: string;
    agents?: Array<Record<string, unknown>>;
    skills?: AgentSkillBinding[];
    metadata?: Record<string, unknown>;
  };
  defaultStewardId?: string;
  importedAt?: string;
  redaction?: "default" | "strict" | "custom";
}

export interface AgentPaperclipImportPlan {
  schemaVersion: 1;
  planKind: "claw_agent_paperclip_import_plan";
  packageId: string;
  importedAt: string;
  source: "agents_md" | "package" | "mixed";
  dependencyPolicy: "paperclip_not_required";
  blueprints: AgentBlueprint[];
  safePackages: AgentSafePackageExport[];
  warnings: string[];
  gaps: string[];
  audit: AgentAuditEvent;
}

export type AgentAuditEventKind =
  | "blueprint"
  | "evaluation"
  | "config_revision"
  | "retirement"
  | "service_api"
  | "assignment_route"
  | "access_evaluation"
  | "memory_evaluation"
  | "budget_evaluation"
  | "safe_export"
  | "incident"
  | "context_pack"
  | "tool_catalog"
  | "dispatch_plan"
  | "creation_review"
  | "storage_audit"
  | "audit_coverage"
  | "operational_snapshot"
  | "control_panel"
  | "privacy_lifecycle"
  | "paperclip_import"
  | "permission_escalation";

export interface AgentAuditEvent {
  id: string;
  kind: AgentAuditEventKind;
  agentId: string;
  assignmentId?: string;
  actorId?: string;
  result: "allowed" | "denied" | "blocked" | "recorded";
  reason?: string;
  resourceType?: string;
  resourceId?: string;
  redaction: "default" | "strict" | "custom";
  createdAt: string;
  metadata: Record<string, unknown>;
}

export type AgentConfigRevisionStatus = "draft" | "active" | "superseded" | "rolled_back";

export interface AgentConfigRevisionInput {
  agentId: string;
  revision?: string | number;
  status?: AgentConfigRevisionStatus;
  actorId?: string;
  reason: string;
  summary?: string;
  previousRevisionId?: string;
  configSnapshot: Record<string, unknown>;
  changedFields?: Array<Record<string, unknown>>;
  createdAt?: string;
  redaction?: "default" | "strict" | "custom";
}

export interface AgentConfigRevision {
  id: string;
  agentId: string;
  revision: string;
  status: AgentConfigRevisionStatus;
  actorId?: string;
  reason: string;
  summary?: string;
  previousRevisionId?: string;
  configSnapshot: Record<string, unknown>;
  changedFields: Array<Record<string, unknown>>;
  createdAt: string;
  audit: AgentAuditEvent;
}

export type AgentIncidentSeverity = "info" | "low" | "medium" | "high" | "critical";
export type AgentIncidentStatus = "open" | "mitigating" | "resolved" | "archived";

export interface AgentIncidentInput {
  agentId: string;
  assignmentId?: string;
  runId?: string;
  sessionId?: string;
  actorId?: string;
  severity: AgentIncidentSeverity;
  status?: AgentIncidentStatus;
  summary: string;
  description?: string;
  scopeType?: string;
  scopeId?: string;
  detectedAt?: string;
  resolvedAt?: string;
  metadata?: Record<string, unknown>;
  redaction?: "default" | "strict" | "custom";
}

export interface AgentIncident {
  id: string;
  agentId: string;
  assignmentId?: string;
  runId?: string;
  sessionId?: string;
  actorId?: string;
  severity: AgentIncidentSeverity;
  status: AgentIncidentStatus;
  summary: string;
  description?: string;
  scopeType?: string;
  scopeId?: string;
  detectedAt: string;
  resolvedAt?: string;
  metadata: Record<string, unknown>;
  audit: AgentAuditEvent;
}

export type AgentActivityFeedItemKind =
  | "assignment"
  | "run"
  | "session"
  | "evaluation"
  | "incident"
  | "config_revision"
  | "audit";

export interface AgentActivityFeedInput {
  agentId: string;
  assignments?: Array<Record<string, unknown>>;
  runs?: Array<Record<string, unknown>>;
  sessions?: Array<Record<string, unknown>>;
  evaluations?: Array<Record<string, unknown>>;
  incidents?: Array<Record<string, unknown>>;
  configRevisions?: Array<Record<string, unknown>>;
  audits?: Array<Record<string, unknown>>;
  limit?: number;
  redaction?: "default" | "strict" | "custom";
}

export interface AgentActivityFeedItem {
  id: string;
  agentId: string;
  kind: AgentActivityFeedItemKind;
  sourceId: string;
  happenedAt: string;
  title: string;
  summary?: string;
  status?: string;
  severity?: string;
  assignmentId?: string;
  runId?: string;
  sessionId?: string;
  metadata: Record<string, unknown>;
}

export interface AgentActivityFeed {
  schemaVersion: 1;
  feedKind: "claw_agent_activity_feed";
  agentId: string;
  items: AgentActivityFeedItem[];
  redaction: "default" | "strict" | "custom";
}

export type AgentBlueprintStatus = "draft" | "active" | "archived";

export interface AgentBlueprintInput {
  id?: string;
  name: string;
  description?: string;
  agencyMode: AgencyMode;
  version?: string | number;
  template: Record<string, unknown>;
  requiredResourceGrants?: AgentResourceGrant[];
  skillRefs?: string[];
  skillBindings?: AgentSkillBinding[];
  modelTier?: "fast" | "balanced" | "smart" | "max";
  status?: AgentBlueprintStatus;
  createdAt?: string;
  redaction?: "default" | "strict" | "custom";
}

export interface AgentBlueprint {
  id: string;
  name: string;
  description?: string;
  agencyMode: AgencyMode;
  version: string;
  template: Record<string, unknown>;
  requiredResourceGrants: AgentResourceGrant[];
  skillRefs: string[];
  skillBindings: AgentSkillBinding[];
  modelTier?: "fast" | "balanced" | "smart" | "max";
  status: AgentBlueprintStatus;
  createdAt: string;
  safeExport: AgentSafePackageExport;
  audit: AgentAuditEvent;
}

export type AgentEvaluationStatus = "planned" | "running" | "passed" | "failed" | "blocked";

export interface AgentEvaluationInput {
  agentId: string;
  assignmentId?: string;
  runId?: string;
  evaluatorId?: string;
  status: AgentEvaluationStatus;
  score?: number;
  criteria: Record<string, unknown>;
  result?: Record<string, unknown>;
  evaluatedAt?: string;
  redaction?: "default" | "strict" | "custom";
}

export interface AgentEvaluation {
  id: string;
  agentId: string;
  assignmentId?: string;
  runId?: string;
  evaluatorId?: string;
  status: AgentEvaluationStatus;
  score?: number;
  criteria: Record<string, unknown>;
  result: Record<string, unknown>;
  evaluatedAt: string;
  audit: AgentAuditEvent;
}

export interface AgentSafeExportInput {
  agent: Record<string, unknown>;
  assignments?: Array<Record<string, unknown>>;
  executionProfiles?: Array<Record<string, unknown>>;
  resourceGrants?: Array<Record<string, unknown>>;
  memoryPolicies?: Array<Record<string, unknown>>;
  budgets?: Array<Record<string, unknown>>;
  blueprints?: Array<Record<string, unknown>>;
  skillBindings?: AgentSkillBinding[];
  configRevisions?: Array<Record<string, unknown>>;
  redaction?: "default" | "strict" | "custom";
  exportedAt?: string;
}

export interface AgentSafePackageExport {
  schemaVersion: 1;
  packageKind: "claw_agent_package";
  exportedAt: string;
  redaction: "default" | "strict" | "custom";
  agent: Record<string, unknown>;
  assignments: Array<Record<string, unknown>>;
  executionProfiles: Array<Record<string, unknown>>;
  resourceGrants: Array<Record<string, unknown>>;
  memoryPolicies: Array<Record<string, unknown>>;
  budgets: Array<Record<string, unknown>>;
  blueprints: Array<Record<string, unknown>>;
  skillBindings: AgentSkillBinding[];
  configRevisions: Array<Record<string, unknown>>;
  audit: AgentAuditEvent;
}

export type AgentSafeSurfaceKind = "internal_ui" | "external_channel" | "mcp_api" | "relay" | "service_api";

export interface AgentSafeSurfaceProjectionInput {
  surface: AgentSafeSurfaceKind;
  agent: Record<string, unknown>;
  assignments?: Array<Record<string, unknown>>;
  executionProfiles?: Array<Record<string, unknown>>;
  resourceGrants?: Array<Record<string, unknown>>;
  memoryPolicies?: Array<Record<string, unknown>>;
  budgets?: Array<Record<string, unknown>>;
  redaction?: "default" | "strict" | "custom";
  projectedAt?: string;
}

export interface AgentSafeSurfaceProjection {
  schemaVersion: 1;
  projectionKind: "claw_agent_safe_surface";
  surface: AgentSafeSurfaceKind;
  projectedAt: string;
  agent: Record<string, unknown>;
  assignments: Array<Record<string, unknown>>;
  executionProfiles: Array<Record<string, unknown>>;
  resourceAccess: {
    grants: Array<Record<string, unknown>>;
    brokeredLeaseAllowed: boolean;
  };
  memory: {
    policies: Array<Record<string, unknown>>;
  };
  budgets: Array<Record<string, unknown>>;
  risks: string[];
  gaps: string[];
  audit: AgentAuditEvent;
}

export type AgentServiceApiOperation =
  | "describe_agent"
  | "route_check"
  | "surface_projection"
  | "support_projection"
  | "activity_feed";

export interface AgentServiceApiRequest {
  requestId?: string;
  operation: AgentServiceApiOperation;
  agent: Record<string, unknown>;
  assignments?: Array<Record<string, unknown>>;
  executionProfiles?: Array<Record<string, unknown>>;
  resourceGrants?: Array<Record<string, unknown>>;
  memoryPolicies?: Array<Record<string, unknown>>;
  budgets?: Array<Record<string, unknown>>;
  redaction?: "default" | "strict" | "custom";
  requestedAt?: string;
}

export interface AgentServiceApiResponse {
  schemaVersion: 1;
  apiKind: "claw_agent_service_api";
  requestId: string;
  operation: AgentServiceApiOperation;
  allowed: boolean;
  errors: string[];
  projection: AgentSafeSurfaceProjection;
  audit: AgentAuditEvent;
}

export interface AgentServiceApiHttpRequest {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: AgentServiceApiRequest | string | null;
  receivedAt?: string;
}

export interface AgentServiceApiHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: AgentServiceApiResponse | {
    schemaVersion: 1;
    apiKind: "claw_agent_service_api_error";
    error: string;
    message: string;
  };
}

const PLANES = [
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
    if (assignment.startsAt && new Date(assignment.startsAt).getTime() > now.getTime()) reasons.push("assignment: not started");
    if (assignment.expiresAt && new Date(assignment.expiresAt).getTime() <= now.getTime()) reasons.push("assignment: expired");
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

function grantMatches(request: AgentAccessRequest, grant: AgentResourceGrant, now: Date): boolean {
  if (grant.expiresAt && new Date(grant.expiresAt).getTime() <= now.getTime()) return false;
  return matches(request.resourceType, grant.resourceType)
    && matches(request.action, grant.action)
    && matchesOptional(request.resourceId, grant.resourceId)
    && matchesOptional(request.scopeType, grant.scopeType)
    && matchesOptional(request.scopeId, grant.scopeId);
}

function isSecretResourceRequest(request: AgentAccessRequest): boolean {
  return /^(secret|secrets|credential|credentials|vault)$/i.test(request.resourceType);
}

function matches(value: string | undefined, pattern: string | undefined): boolean {
  return pattern === "*" || value === pattern;
}

function matchesOptional(value: string | undefined, pattern: string | undefined): boolean {
  if (!pattern || pattern === "*") return true;
  return value === pattern;
}

function normalizeTime(value: string | Date | undefined): Date {
  if (!value) return new Date();
  return value instanceof Date ? value : new Date(value);
}

function budgetLimitMatches(limit: AgentBudgetLimit, request: AgentBudgetRequest): boolean {
  return limit.dimension === request.dimension
    && matchesOptional(request.scopeType, limit.scopeType)
    && matchesOptional(request.scopeId, limit.scopeId);
}

function redactArray(records: Array<Record<string, unknown>> | undefined, redaction: "default" | "strict" | "custom"): Array<Record<string, unknown>> {
  return (records ?? []).map((record) => redactAgentBoundaryValue(record, redaction) as Record<string, unknown>);
}

function normalizeAgentSkillBindings(
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

function parseAgentSkillRef(skillRef: string): AgentSkillBinding | undefined {
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

function parseAgentServiceApiBody(body: AgentServiceApiHttpRequest["body"]): AgentServiceApiRequest | null {
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

function isAgentServiceApiRequest(value: unknown): value is AgentServiceApiRequest {
  return Boolean(value)
    && typeof value === "object"
    && typeof (value as AgentServiceApiRequest).operation === "string"
    && Boolean((value as AgentServiceApiRequest).agent)
    && typeof (value as AgentServiceApiRequest).agent === "object";
}

function agentServiceApiError(
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

function formatAgentSkillBindingRef(binding: Pick<AgentSkillBinding, "ref" | "version">): string {
  return binding.version ? `${binding.ref}@${binding.version}` : binding.ref;
}

function activityItem(agentId: string, kind: AgentActivityFeedItemKind, record: Record<string, unknown>, redaction: "default" | "strict" | "custom"): AgentActivityFeedItem {
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

function activityTitle(kind: AgentActivityFeedItemKind, record: Record<string, unknown>): string {
  const direct = stringRecordValue(record, "title", "summary", "reason", "name");
  if (direct) return direct;
  if (kind === "config_revision") return `Config revision ${stringRecordValue(record, "revision") ?? "recorded"}`;
  return kind.replace("_", " ");
}

function activitySummary(record: Record<string, unknown>): string | undefined {
  return stringRecordValue(record, "summary", "description", "reason");
}

function activityTimestamp(record: Record<string, unknown>): string {
  return stringRecordValue(record, "happenedAt", "detectedAt", "evaluatedAt", "startedAt", "endedAt", "createdAt", "updatedAt", "created_at", "updated_at") ?? new Date(0).toISOString();
}

function activityMetadata(record: Record<string, unknown>, redaction: "default" | "strict" | "custom"): Record<string, unknown> {
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

function stringRecordValue(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pickAgentSurfaceFields(agent: Record<string, unknown>, redaction: "default" | "strict" | "custom"): Record<string, unknown> {
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

function pickAssignmentSurfaceFields(assignment: Record<string, unknown>, surface: AgentSafeSurfaceKind, redaction: "default" | "strict" | "custom"): Record<string, unknown> {
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

function pickExecutionProfileSurfaceFields(profile: Record<string, unknown>, redaction: "default" | "strict" | "custom"): Record<string, unknown> {
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

function pickResourceGrantSurfaceFields(grant: Record<string, unknown>, redaction: "default" | "strict" | "custom"): Record<string, unknown> {
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

function pickMemoryPolicySurfaceFields(policy: Record<string, unknown>, redaction: "default" | "strict" | "custom"): Record<string, unknown> {
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

function pickBudgetSurfaceFields(budget: Record<string, unknown>, redaction: "default" | "strict" | "custom"): Record<string, unknown> {
  return pickRedacted(budget, redaction, [
    "id",
    "agentId",
    "assignmentId",
    "exceededBehavior",
    "limits",
    "status",
  ]);
}

function contextViewRejectionReasons(view: AgentContextViewPolicy, entry: AgentContextPackEntry): string[] {
  const reasons: string[] = [];
  if (view.allowedResourceTypes && view.allowedResourceTypes.length > 0 && !view.allowedResourceTypes.includes(entry.resourceType)) {
    reasons.push(`context: resource type ${entry.resourceType} outside view`);
  }
  if (view.allowedScopes && view.allowedScopes.length > 0 && !view.allowedScopes.some((scope) => contextScopeMatches(scope, entry))) {
    reasons.push("context: scope outside view");
  }
  return reasons;
}

function contextScopeMatches(scope: AgentContextScope, entry: AgentContextPackEntry): boolean {
  return scope.scopeType === entry.scopeType && matchesOptional(entry.scopeId, scope.scopeId);
}

function contextPackItem(
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

function contextEntryId(entry: AgentContextPackEntry): string {
  return entry.id ?? `agent_context_${stableHash([
    entry.resourceType,
    entry.resourceId ?? "",
    entry.scopeType ?? "",
    entry.scopeId ?? "",
    entry.title ?? "",
  ].join("|"))}`;
}

function contextPackGaps(
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

function normalizePositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function toolCatalogProjectionItem(
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

function toolCatalogGaps(
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

function creationReviewRequiredApprovals(
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

function creationReviewGaps(input: AgentCreationReviewInput): string[] {
  const gaps = new Set<string>();
  if (typeof input.agent.id !== "string") gaps.add("agent_id_missing");
  if (typeof input.agent.name !== "string" && typeof input.agent.displayName !== "string") gaps.add("agent_name_missing");
  if ((input.assignments ?? []).length === 0) gaps.add("assignment_missing");
  if ((input.executionProfiles ?? []).length === 0) gaps.add("execution_profile_missing");
  if ((input.budgets ?? []).length === 0 && input.surface !== "internal_ui") gaps.add("budget_policy_missing");
  return [...gaps];
}

function creationReviewRisks(input: AgentCreationReviewInput): string[] {
  const risks = new Set<string>();
  if ((input.resourceGrants ?? []).some((grant) => grant.action === "*")) risks.add("wildcard_resource_grant");
  if ((input.executionProfiles ?? []).some((profile) => profile.hostAccess === "native_host")) risks.add("native_host_access");
  if ((input.executionProfiles ?? []).some((profile) => profile.networkPolicy === "open")) risks.add("open_network_policy");
  return [...risks];
}

const REQUIRED_AGENT_STORAGE_COLLECTIONS = [
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

const LEGACY_AGENT_OVERLAP_COLLECTIONS = [
  "company_agents",
  "deployments",
  "agent_deployments",
  "legacy_agents",
] as const;

const DEFAULT_AGENT_ALLOWED_JSON_FIELDS = [
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

const DEFAULT_AGENT_AUDIT_COVERAGE_KINDS: AgentAuditEventKind[] = [
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

function agentFieldLooksLikeRawSecret(field: BuiltinFieldDefinition): boolean {
  return /(secret|password|token|credential|privateKey|apiKey)/i.test(field.name)
    && !/(Ref|Refs|reference)$/i.test(field.name);
}

function auditCoverageInvalidEvent(event: AgentAuditEvent): AgentAuditCoverageInvalidEvent | undefined {
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

function auditCoverageSensitiveFindings(event: AgentAuditEvent): string[] {
  const serialized = JSON.stringify(event.metadata ?? {});
  const findings: string[] = [];
  if (/vault:\/\//i.test(serialized)) findings.push(`${event.id}:raw_vault_ref`);
  if (/\/Users\//.test(serialized) || /~\//.test(serialized)) findings.push(`${event.id}:local_path`);
  if (/(Bearer\s+|api[_-]?key|password|secret|token)/i.test(serialized) && !serialized.includes("[REDACTED")) {
    findings.push(`${event.id}:raw_secret_token`);
  }
  return findings;
}

function filterOperationalRecords(
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

function filterOperationalAudits(
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

function operationalRecordBelongsToAgent(record: Record<string, unknown>, agentId: string): boolean {
  const recordAgentId = stringRecordValue(record, "agentId", "agent_id");
  return !recordAgentId || recordAgentId === agentId;
}

function operationalStatusMatches(record: Record<string, unknown>, statuses: string[] | undefined): boolean {
  if (!statuses || statuses.length === 0) return true;
  const status = stringRecordValue(record, "status", "result");
  return status ? statuses.includes(status) : false;
}

function operationalSinceMatches(record: Record<string, unknown>, since: string | undefined): boolean {
  if (!since) return true;
  return operationalRecordTimestamp(record) >= since;
}

function operationalRecordTimestamp(record: Record<string, unknown>): string {
  return stringRecordValue(record, "updatedAt", "updated_at", "createdAt", "created_at", "startedAt", "started_at", "detectedAt", "detected_at", "evaluatedAt", "evaluated_at", "endedAt", "ended_at") ?? "";
}

function countByStatus(records: Array<Record<string, unknown>>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of records) {
    const status = stringRecordValue(record, "status", "result") ?? "unknown";
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

function countByKind(events: AgentAuditEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) counts[event.kind] = (counts[event.kind] ?? 0) + 1;
  return counts;
}

function operationalSnapshotGaps(
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

function agentPermissionControlSummary(resourceGrants: Array<Record<string, unknown>>, now: string): AgentControlPanel["permissions"] {
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

function agentControlPosture(
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

function agentMemoryControlSummary(memoryPolicies: Array<Record<string, unknown>>): AgentControlPanel["memory"] {
  return {
    policyCount: memoryPolicies.length,
    crossUserBoundary: [...new Set(memoryPolicies.map((policy) => stringRecordValue(policy, "crossUserBoundary", "cross_user_boundary")).filter((value): value is string => Boolean(value)))],
    writePolicies: [...new Set(memoryPolicies.map((policy) => stringRecordValue(policy, "writePolicy", "write_policy")).filter((value): value is string => Boolean(value)))],
  };
}

function agentBudgetControlSummary(budgets: Array<Record<string, unknown>>): AgentControlPanel["budgets"] {
  return {
    policyCount: budgets.length,
    exceededBehaviors: [...new Set(budgets.map((budget) => stringRecordValue(budget, "exceededBehavior", "exceeded_behavior")).filter((value): value is string => Boolean(value)))],
  };
}

function agentControlUiVisibility(assignments: Array<Record<string, unknown>>, surface: AgentSafeSurfaceKind): AgentControlPanel["uiVisibility"] {
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

function agentControlPanelRisks(input: AgentControlPanelInput): string[] {
  const risks = new Set<string>();
  if ((input.resourceGrants ?? []).some((grant) => grant.action === "*")) risks.add("wildcard_resource_grant");
  if ((input.incidents ?? []).some((incident) => ["open", "mitigating"].includes(String(incident.status ?? "")))) risks.add("open_incidents");
  if ((input.assignments ?? []).some((assignment) => isExternalAssignmentRecord(assignment) && assignment.status === "active" && assignment.privacyPolicy === "raw_with_retention")) {
    risks.add("external_assignment_raw_telemetry");
  }
  return [...risks];
}

function agentControlPanelGaps(
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

function recordExpired(record: Record<string, unknown>, now: string): boolean {
  const expiresAt = stringRecordValue(record, "expiresAt", "expires_at");
  return Boolean(expiresAt && expiresAt <= now);
}

function isExternalAssignmentRecord(record: Record<string, unknown>): boolean {
  const kind = stringRecordValue(record, "kind") ?? "";
  return isExternalAssignmentKind(kind as AgentAssignmentKind);
}

function agentPrivacyLifecycleRecords(
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

function privacyCollectionRecords(collection: string, records: Array<Record<string, unknown>> | undefined): Array<{ collection: string; record: Record<string, unknown> }> {
  return (records ?? []).map((record) => ({ collection, record }));
}

function recordMatchesPrivacySubject(record: Record<string, unknown>, subject: AgentPrivacyLifecycleSubject, rootAgent: Record<string, unknown>): boolean {
  if (subject.scopeType === "agent") {
    return stringRecordValue(record, "id", "agentId", "agent_id") === subject.scopeId
      || stringRecordValue(rootAgent, "id") === subject.scopeId;
  }
  const candidateKeys = privacySubjectKeys(subject.scopeType);
  if (candidateKeys.some((key) => stringRecordValue(record, key) === subject.scopeId)) return true;
  return JSON.stringify(record).includes(JSON.stringify(subject.scopeId));
}

function privacySubjectKeys(scopeType: AgentPrivacyLifecycleSubject["scopeType"]): string[] {
  if (scopeType === "customer") return ["customerId", "customer_id", "scopeId", "scope_id", "boundaryScopeId"];
  if (scopeType === "external_user") return ["externalUserId", "external_user_id", "scopeId", "scope_id", "boundaryScopeId"];
  if (scopeType === "actor") return ["actorId", "actor_id", "assigneeActorId"];
  if (scopeType === "workspace") return ["workspaceId", "workspace_id", "scopeId", "scope_id"];
  if (scopeType === "project") return ["projectId", "project_id", "scopeId", "scope_id"];
  return ["teamId", "team_id", "scopeId", "scope_id"];
}

function agentPrivacyLifecycleAction(
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

function agentPrivacyLifecycleGaps(
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

interface PaperclipAgentDraft {
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

function paperclipAgentsFromMarkdown(agentsMd: string | undefined): PaperclipAgentDraft[] {
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

function paperclipAgentFromRecord(record: Record<string, unknown>, index: number): PaperclipAgentDraft {
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

function splitPaperclipMarkdownAgents(markdown: string): Array<{ title?: string; body: string }> {
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

function parsePaperclipFields(body: string): Record<string, string> {
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

function paperclipAgencyMode(value: string): AgencyMode {
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

function paperclipModelTier(value: string | undefined): AgentBlueprint["modelTier"] | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized.includes("fast")) return "fast";
  if (normalized.includes("smart")) return "smart";
  if (normalized.includes("max")) return "max";
  if (normalized.includes("balanced")) return "balanced";
  return undefined;
}

function parseCsv(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const entries = value.split(",").map((entry) => entry.trim()).filter(Boolean);
  return entries.length > 0 ? entries : undefined;
}

function parsePaperclipGrantRefs(value: string | undefined): AgentResourceGrant[] | undefined {
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

function pickRedacted(record: Record<string, unknown>, redaction: "default" | "strict" | "custom", keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (record[key] !== undefined) out[key] = redactAgentBoundaryValue(record[key], redaction);
  }
  return out;
}

function agentSurfaceRisks(
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

function agentSurfaceGaps(surface: AgentSafeSurfaceKind, assignments: Array<Record<string, unknown>>, budgets: Array<Record<string, unknown>>): string[] {
  const gaps = new Set<string>();
  if (assignments.length === 0) gaps.add("assignment_missing");
  if (surface !== "internal_ui" && !assignments.some((assignment) => assignment.status === "active")) gaps.add("active_assignment_missing");
  if (!assignments.some((assignment) => assignmentKindAllowedForSurface(surface, assignment.kind))) gaps.add("surface_assignment_kind_missing");
  if (assignments.some((assignment) => assignment.privacyPolicy === "raw_with_retention" && !hasValidTelemetryRetention(assignment))) gaps.add("raw_telemetry_retention_policy_missing");
  if (surface !== "internal_ui" && budgets.length === 0) gaps.add("budget_policy_missing");
  return [...gaps];
}

function hasValidTelemetryRetention(assignment: { telemetryRetentionDays?: unknown }): boolean {
  return typeof assignment.telemetryRetentionDays === "number"
    && Number.isFinite(assignment.telemetryRetentionDays)
    && assignment.telemetryRetentionDays > 0;
}

function assignmentKindAllowedForSurface(surface: AgentSafeSurfaceKind, kind: unknown): boolean {
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

const AGENT_ACTION_SEVERITY_BY_RANK = ["info", "low", "medium", "high", "critical"] as const satisfies readonly AgentActionSeverity[];
const AGENT_ACTION_SEVERITY_RANK: Record<AgentActionSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function severityRankForAction(action: AgentResourceAction | string): number {
  if (action === "read") return AGENT_ACTION_SEVERITY_RANK.low;
  if (action === "create" || action === "update" || action === "write") return AGENT_ACTION_SEVERITY_RANK.medium;
  if (action === "invoke" || action === "execute" || action === "lease_secret" || action === "approve") return AGENT_ACTION_SEVERITY_RANK.high;
  if (action === "delete" || action === "*") return AGENT_ACTION_SEVERITY_RANK.critical;
  return AGENT_ACTION_SEVERITY_RANK.medium;
}

function autonomyDispatchMode(profile: AgentAutonomyProfile): AgentAutonomyDispatchMode {
  if (profile === "respond_only") return "respond_only";
  if (profile === "suggest") return "suggest_only";
  return "act";
}

function maxAutonomySeverity(profile: AgentAutonomyProfile): AgentActionSeverity {
  if (profile === "respond_only") return "low";
  if (profile === "suggest") return "medium";
  if (profile === "act_limited") return "medium";
  return "high";
}

function dispatchDisposition(dispatchMode: AgentAutonomyDispatchMode, executionMode: AgentExecutionMode | undefined): AgentDispatchDisposition {
  if (dispatchMode === "respond_only") return "respond";
  if (dispatchMode === "suggest_only") return "suggest";
  if (executionMode === "sync") return "invoke_sync";
  if (executionMode === "async") return "queue_async";
  if (executionMode === "streaming") return "stream";
  if (executionMode === "scheduled") return "schedule";
  return "blocked";
}

function dispatchRunStatus(disposition: AgentDispatchDisposition): AgentDispatchRunStatus {
  if (disposition === "respond") return "ready";
  if (disposition === "suggest") return "awaiting_input";
  if (disposition === "invoke_sync" || disposition === "stream") return "running";
  if (disposition === "queue_async" || disposition === "schedule") return "queued";
  return "blocked";
}

function isExternalAssignmentKind(kind: AgentAssignmentKind): boolean {
  return kind === "external_web_chat"
    || kind === "external_telegram"
    || kind === "external_whatsapp"
    || kind === "external_email"
    || kind === "support_inbox"
    || kind === "custom_channel";
}

const SUPERVISOR_RISK_RANK: Record<AgentPermissionEscalationRequest["risk"], number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function riskRank(risk: AgentPermissionEscalationRequest["risk"]): number {
  return SUPERVISOR_RISK_RANK[risk];
}

function supervisorMaxRisk(level: AgentSupervisorAuthorityLevel): AgentPermissionEscalationRequest["risk"] {
  if (level === "approve_high_risk") return "high";
  if (level === "approve_medium_risk") return "medium";
  return "low";
}

function supervisorDefaultActions(level: AgentSupervisorAuthorityLevel): AgentSupervisorAction[] {
  if (level === "observe") return ["observe"];
  if (level === "suggest") return ["observe", "suggest"];
  if (level === "approve_low_risk") return ["observe", "suggest", "approve_escalation", "pause_assignment"];
  if (level === "approve_medium_risk") return ["observe", "suggest", "approve_escalation", "pause_assignment", "edit_config"];
  return ["observe", "suggest", "approve_escalation", "pause_assignment", "edit_config", "retire_agent"];
}

function isSensitiveAgentKey(key: string): boolean {
  return /(secret|password|token|credential|privateKey|apiKey|rawTrace|authorization)/i.test(key);
}

function isLocalPrivatePath(value: string): boolean {
  return value.startsWith("/") || value.startsWith("~/") || value.includes("/Users/") || value.includes("\\Users\\");
}

function memoryScopeMatches(scope: AgentMemoryScope, request: AgentMemoryAccessRequest): boolean {
  const accessMatches = scope.access === request.operation || scope.access === "read_write";
  const layerMatches = scope.layer === request.layer;
  const scopeMatches = !scope.scopeId || scope.scopeId === request.scopeId;
  return accessMatches && layerMatches && scopeMatches;
}

function memoryBoundaryAllowed(policy: AgentMemoryPolicy, request: AgentMemoryAccessRequest): boolean {
  if (policy.crossUserBoundary !== "explicit_grant_only") return true;
  if (!request.boundary) return true;
  if (request.layer !== "customer" && request.layer !== "session") return true;
  if (!request.scopeId || request.scopeId === request.boundary.scopeId) return true;
  return request.explicitGrant === true;
}

function externalTelemetry(profile: AgentExternalIdentityProfile, policy: AgentAssignmentPrivacyPolicy): Record<string, string> {
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

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
