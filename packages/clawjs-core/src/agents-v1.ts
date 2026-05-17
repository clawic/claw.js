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
