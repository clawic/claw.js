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

export interface AgentAccessRequest {
  resourceType: string;
  resourceId?: string;
  action: AgentResourceAction;
  scopeType?: string;
  scopeId?: string;
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
  externalDisclosure?: AgentExternalDisclosure;
  startsAt?: string;
  expiresAt?: string;
  scopeType?: string;
  scopeId?: string;
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

export type AgentAuditEventKind =
  | "config_revision"
  | "assignment_route"
  | "access_evaluation"
  | "memory_evaluation"
  | "budget_evaluation"
  | "safe_export"
  | "incident"
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

export interface AgentSafeExportInput {
  agent: Record<string, unknown>;
  assignments?: Array<Record<string, unknown>>;
  executionProfiles?: Array<Record<string, unknown>>;
  resourceGrants?: Array<Record<string, unknown>>;
  memoryPolicies?: Array<Record<string, unknown>>;
  budgets?: Array<Record<string, unknown>>;
  blueprints?: Array<Record<string, unknown>>;
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

function grantMatches(request: AgentAccessRequest, grant: AgentResourceGrant, now: Date): boolean {
  if (grant.expiresAt && new Date(grant.expiresAt).getTime() <= now.getTime()) return false;
  return matches(request.resourceType, grant.resourceType)
    && matches(request.action, grant.action)
    && matchesOptional(request.resourceId, grant.resourceId)
    && matchesOptional(request.scopeType, grant.scopeType)
    && matchesOptional(request.scopeId, grant.scopeId);
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
    "ownerId",
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
  if (surface !== "internal_ui" && budgets.length === 0) gaps.add("budget_policy_missing");
  return [...gaps];
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
