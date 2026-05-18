export const GOVERNANCE_PRINCIPAL_KINDS = ["user", "agent", "service", "device", "external_account"] as const;
export const GOVERNANCE_ENTITY_KINDS = ["person", "organization", "family", "company", "brand", "department", "team", "customer", "workspace", "project", "custom"] as const;
export const GOVERNANCE_SCOPE_KINDS = ["global", "personal", "workspace", "project", "entity", "folder", "resource", "assignment", "run"] as const;
export const GOVERNANCE_CAPABILITIES = [
  "read",
  "write",
  "create",
  "update",
  "delete",
  "execute",
  "control",
  "admin",
  "delegate",
  "share",
  "memory_read",
  "memory_write",
  "secret_lease",
  "budget_control",
  "policy_manage",
  "audit_view",
] as const;

export type GovernancePrincipalKind = typeof GOVERNANCE_PRINCIPAL_KINDS[number];
export type GovernanceEntityKind = typeof GOVERNANCE_ENTITY_KINDS[number];
export type GovernanceScopeKind = typeof GOVERNANCE_SCOPE_KINDS[number];
export type GovernanceCapability = typeof GOVERNANCE_CAPABILITIES[number] | "*";

export interface GovernancePrincipal {
  id: string;
  kind: GovernancePrincipalKind;
  displayName?: string;
}

export interface GovernanceEntity {
  id: string;
  kind: GovernanceEntityKind;
  displayName?: string;
}

export interface GovernanceScopeRef {
  kind: GovernanceScopeKind | string;
  id?: string;
}

export interface GovernanceResourceRef {
  type: string;
  id?: string;
}

export interface GovernanceSubjectRef {
  kind: "principal" | "entity";
  id: string;
}

export interface GovernanceGrant {
  id: string;
  subject: GovernanceSubjectRef;
  capabilities: GovernanceCapability[];
  scope: GovernanceScopeRef;
  resource?: GovernanceResourceRef;
  effect?: "allow" | "deny";
  expiresAt?: string;
  reason?: string;
}

export interface GovernanceRestriction {
  id: string;
  subject?: GovernanceSubjectRef;
  capabilities: GovernanceCapability[];
  scope: GovernanceScopeRef;
  resource?: GovernanceResourceRef;
  inherited?: boolean;
  reason?: string;
}

export interface GovernanceAuthorityEdge {
  id: string;
  from: GovernanceSubjectRef;
  to: GovernanceSubjectRef;
  relation: "member" | "parent" | "manager" | "steward" | "grant_authority" | "custom";
  scope?: GovernanceScopeRef;
  grants?: GovernanceGrant[];
  restrictions?: GovernanceRestriction[];
}

export interface GovernanceBinding {
  id: string;
  resource: GovernanceResourceRef;
  scope: GovernanceScopeRef;
  steward?: GovernanceSubjectRef;
  dataClass?: "public" | "internal" | "private" | "sensitive" | "secret_ref";
}

export interface GovernanceResourceScopeBinding extends GovernanceBinding {
  state?: "active" | "detached" | "forked";
  sourceBindingId?: string;
  forkedResource?: GovernanceResourceRef;
}

export interface GovernanceResourceSharingSummary {
  resourceKey: string;
  sourceBindingId?: string;
  activeScopeKeys: string[];
  detachedScopeKeys: string[];
  forkedScopeKeys: string[];
  bindingIds: string[];
}

export interface GovernanceScopeHierarchyEdge {
  parent: GovernanceScopeRef;
  child: GovernanceScopeRef;
}

export interface GovernanceAccessRequest {
  principalId: string;
  capability: GovernanceCapability;
  scope: GovernanceScopeRef;
  resource?: GovernanceResourceRef;
}

export interface GovernanceAccessInput {
  request: GovernanceAccessRequest;
  grants?: GovernanceGrant[];
  restrictions?: GovernanceRestriction[];
  authorityEdges?: GovernanceAuthorityEdge[];
  scopeHierarchy?: GovernanceScopeHierarchyEdge[];
  now?: string | Date;
}

export interface GovernanceEffectiveAccess {
  allowed: boolean;
  reasons: string[];
  matchedGrantIds: string[];
  matchedRestrictionIds: string[];
  implicitLocal: boolean;
}

export interface GovernanceDelegationInput {
  delegator: GovernanceAccessInput;
  delegatee: GovernanceAccessInput;
}

function nowMs(now?: string | Date): number {
  if (!now) return Date.now();
  return typeof now === "string" ? Date.parse(now) : now.getTime();
}

function subjectKey(subject: GovernanceSubjectRef): string {
  return `${subject.kind}:${subject.id}`;
}

function authoritySubjectsFor(input: GovernanceAccessInput): Set<string> {
  const subjects = new Set<string>([subjectKey({ kind: "principal", id: input.request.principalId })]);
  for (const edge of input.authorityEdges ?? []) {
    if (edge.scope && !scopeApplies(edge.scope, input.request.scope, input.scopeHierarchy)) continue;
    if (edge.from.kind === "principal" && edge.from.id === input.request.principalId) subjects.add(subjectKey(edge.to));
    if (edge.to.kind === "principal" && edge.to.id === input.request.principalId) subjects.add(subjectKey(edge.from));
  }
  return subjects;
}

function subjectMatches(subject: GovernanceSubjectRef | undefined, subjects: Set<string>): boolean {
  return !subject || subjects.has(subjectKey(subject));
}

function capabilityMatches(ruleCapabilities: GovernanceCapability[], requested: GovernanceCapability): boolean {
  if (ruleCapabilities.includes("*")) return true;
  if (ruleCapabilities.includes(requested)) return true;
  if (ruleCapabilities.includes("admin")) return true;
  if (requested === "budget_control" || requested === "policy_manage" || requested === "audit_view") return ruleCapabilities.includes("control");
  return false;
}

function resourceMatches(rule: GovernanceResourceRef | undefined, requested: GovernanceResourceRef | undefined): boolean {
  if (!rule) return true;
  if (!requested) return false;
  if (rule.type !== "*" && rule.type !== requested.type) return false;
  if (rule.id && rule.id !== "*" && rule.id !== requested.id) return false;
  return true;
}

function sameScope(left: GovernanceScopeRef, right: GovernanceScopeRef): boolean {
  return left.kind === right.kind && (left.id ?? "*") === (right.id ?? "*");
}

function scopeKey(scope: GovernanceScopeRef): string {
  return `${scope.kind}:${scope.id ?? "*"}`;
}

function resourceKey(resource: GovernanceResourceRef): string {
  return `${resource.type}:${resource.id ?? "*"}`;
}

function scopeApplies(ruleScope: GovernanceScopeRef, requestedScope: GovernanceScopeRef, hierarchy: GovernanceScopeHierarchyEdge[] = []): boolean {
  if (ruleScope.kind === "global" && !ruleScope.id) return true;
  if (ruleScope.kind === requestedScope.kind && (!ruleScope.id || ruleScope.id === "*" || ruleScope.id === requestedScope.id)) return true;
  const visited = new Set<string>();
  const stack = [requestedScope];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const key = scopeKey(current);
    if (visited.has(key)) continue;
    visited.add(key);
    if (sameScope(ruleScope, current)) return true;
    for (const edge of hierarchy) {
      if (sameScope(edge.child, current)) stack.push(edge.parent);
    }
  }
  return false;
}

function grantActive(grant: GovernanceGrant, now: number): boolean {
  return !grant.expiresAt || Date.parse(grant.expiresAt) > now;
}

function grantAllows(grant: GovernanceGrant, input: GovernanceAccessInput, subjects: Set<string>): boolean {
  return (grant.effect ?? "allow") === "allow"
    && grantActive(grant, nowMs(input.now))
    && subjectMatches(grant.subject, subjects)
    && capabilityMatches(grant.capabilities, input.request.capability)
    && scopeApplies(grant.scope, input.request.scope, input.scopeHierarchy)
    && resourceMatches(grant.resource, input.request.resource);
}

function restrictionBlocks(restriction: GovernanceRestriction, input: GovernanceAccessInput, subjects: Set<string>): boolean {
  return subjectMatches(restriction.subject, subjects)
    && capabilityMatches(restriction.capabilities, input.request.capability)
    && scopeApplies(restriction.scope, input.request.scope, input.scopeHierarchy)
    && resourceMatches(restriction.resource, input.request.resource);
}

export function evaluateGovernanceAccess(input: GovernanceAccessInput): GovernanceEffectiveAccess {
  const subjects = authoritySubjectsFor(input);
  const grants = [
    ...(input.grants ?? []),
    ...(input.authorityEdges ?? []).flatMap((edge) => edge.grants ?? []),
  ];
  const restrictions = [
    ...(input.restrictions ?? []),
    ...(input.authorityEdges ?? []).flatMap((edge) => edge.restrictions ?? []),
  ];
  const matchedRestrictions = restrictions.filter((restriction) => restrictionBlocks(restriction, input, subjects));
  if (matchedRestrictions.length > 0) {
    return {
      allowed: false,
      reasons: matchedRestrictions.map((restriction) => `restricted:${restriction.id}`),
      matchedGrantIds: [],
      matchedRestrictionIds: matchedRestrictions.map((restriction) => restriction.id),
      implicitLocal: false,
    };
  }

  const matchedGrants = grants.filter((grant) => grantAllows(grant, input, subjects));
  if (matchedGrants.length > 0) {
    return {
      allowed: true,
      reasons: [],
      matchedGrantIds: matchedGrants.map((grant) => grant.id),
      matchedRestrictionIds: [],
      implicitLocal: false,
    };
  }

  const implicitLocal = input.request.scope.kind === "personal" && input.request.scope.id === input.request.principalId && (input.request.capability === "read" || input.request.capability === "write");
  return {
    allowed: implicitLocal,
    reasons: implicitLocal ? ["implicit_local_personal_scope"] : ["no_explicit_grant"],
    matchedGrantIds: [],
    matchedRestrictionIds: [],
    implicitLocal,
  };
}

export function evaluateGovernanceDelegation(input: GovernanceDelegationInput): GovernanceEffectiveAccess {
  const delegator = evaluateGovernanceAccess(input.delegator);
  const delegatee = evaluateGovernanceAccess(input.delegatee);
  if (!delegator.allowed || !delegatee.allowed) {
    return {
      allowed: false,
      reasons: [
        ...delegator.reasons.map((reason) => `delegator:${reason}`),
        ...delegatee.reasons.map((reason) => `delegatee:${reason}`),
      ],
      matchedGrantIds: [...delegator.matchedGrantIds, ...delegatee.matchedGrantIds],
      matchedRestrictionIds: [...delegator.matchedRestrictionIds, ...delegatee.matchedRestrictionIds],
      implicitLocal: false,
    };
  }
  return {
    allowed: true,
    reasons: [],
    matchedGrantIds: [...delegator.matchedGrantIds, ...delegatee.matchedGrantIds],
    matchedRestrictionIds: [],
    implicitLocal: delegator.implicitLocal && delegatee.implicitLocal,
  };
}

export function summarizeGovernanceBindings(bindings: GovernanceBinding[]): {
  resources: number;
  scoped: number;
  stewarded: number;
  dataClasses: Record<string, number>;
} {
  const dataClasses: Record<string, number> = {};
  for (const binding of bindings) {
    const key = binding.dataClass ?? "unspecified";
    dataClasses[key] = (dataClasses[key] ?? 0) + 1;
  }
  return {
    resources: bindings.length,
    scoped: bindings.filter((binding) => binding.scope.kind !== "global").length,
    stewarded: bindings.filter((binding) => Boolean(binding.steward)).length,
    dataClasses,
  };
}

export function summarizeGovernanceResourceSharing(bindings: GovernanceResourceScopeBinding[]): GovernanceResourceSharingSummary[] {
  const byResource = new Map<string, GovernanceResourceScopeBinding[]>();
  for (const binding of bindings) {
    const key = resourceKey(binding.resource);
    byResource.set(key, [...(byResource.get(key) ?? []), binding]);
  }
  return [...byResource.entries()].map(([key, resourceBindings]) => {
    const source = resourceBindings.find((binding) => !binding.sourceBindingId && (binding.state ?? "active") === "active")
      ?? resourceBindings.find((binding) => (binding.state ?? "active") === "active");
    const sourceBindingId = source?.id ?? resourceBindings.find((binding) => binding.sourceBindingId)?.sourceBindingId;
    return {
      resourceKey: key,
      sourceBindingId,
      activeScopeKeys: resourceBindings
        .filter((binding) => (binding.state ?? "active") === "active")
        .map((binding) => scopeKey(binding.scope)),
      detachedScopeKeys: resourceBindings
        .filter((binding) => binding.state === "detached")
        .map((binding) => scopeKey(binding.scope)),
      forkedScopeKeys: resourceBindings
        .filter((binding) => binding.state === "forked")
        .map((binding) => scopeKey(binding.scope)),
      bindingIds: resourceBindings.map((binding) => binding.id),
    };
  });
}

export function detachGovernanceResourceScopeBinding(binding: GovernanceResourceScopeBinding): GovernanceResourceScopeBinding {
  return {
    ...binding,
    state: "detached",
    sourceBindingId: binding.sourceBindingId ?? binding.id,
  };
}

export function forkGovernanceResourceScopeBinding(binding: GovernanceResourceScopeBinding, forkedResource: GovernanceResourceRef): GovernanceResourceScopeBinding {
  return {
    ...binding,
    resource: forkedResource,
    state: "forked",
    forkedResource,
    sourceBindingId: binding.sourceBindingId ?? binding.id,
  };
}
