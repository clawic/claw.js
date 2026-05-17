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

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
