import type { AgentToolDescriptor, AgentToolRiskLevel } from "./agent_tools.ts";
import type { BuiltinCollectionDefinition, BuiltinFieldDefinition } from "./builtins/_types.ts";
import type { RegulatedDecisionEffect, RegulatedDomain, SensitiveRecordClass } from "./regulated-domain-safety.ts";
import { evaluateRegulatedAction } from "./regulated-domain-safety.ts";
import { AGENTS_FAMILY } from "./builtins/agents/index.ts";


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
  sensitiveRecordClasses?: SensitiveRecordClass[];
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
