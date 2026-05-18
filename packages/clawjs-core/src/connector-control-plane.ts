import type { RegulatedDecisionEffect, RegulatedDomain, SensitiveDataClass } from "./regulated-domain-safety.ts";

export const connectorControlPlaneVersion = 1;

export const connectorExecutionPipeline = [
  "capability_request",
  "selection",
  "execution_plan",
  "policy",
  "budget",
  "network",
  "approval_grant",
  "credential_broker_lease",
  "runtime",
  "redaction",
  "audit",
  "lease_release",
] as const;

export type ConnectorExecutionPipelineStage = typeof connectorExecutionPipeline[number];

export type ConnectorTrustTier =
  | "claw_internal"
  | "local"
  | "mesh"
  | "self_hosted"
  | "third_party"
  | "unknown";

export type ExternalPrincipalKind =
  | "account"
  | "workspace"
  | "organization"
  | "tenant"
  | "project"
  | "app"
  | "bot"
  | "user"
  | "endpoint";

export type ConnectorRuntimeKind =
  | "api"
  | "sdk"
  | "mcp"
  | "cli"
  | "webhook"
  | "oauth"
  | "browser";

export type ConnectorRiskTier = "read" | "write" | "destructive" | "cost" | "system";
export type ConnectorSupportState = "supported" | "unsupported" | "external_pending";
export type ConnectorPolicyEffect = "allow" | "deny";
export type ConnectorBudgetWindow = "run" | "hour" | "day" | "month";
export type ConnectorBudgetUnknownCostBehavior = "block" | "require_approval" | "allow";
export type ConnectorTraceMode = "redacted" | "raw_encrypted_opt_in";

export interface ConnectorProvider {
  id: string;
  displayName: string;
  trustTier: ConnectorTrustTier;
  enabled: boolean;
  principals?: ExternalPrincipal[];
  capabilities?: ConnectorCapability[];
  operations?: ConnectorOperation[];
}

export interface ExternalPrincipal {
  id: string;
  providerId: string;
  kind: ExternalPrincipalKind;
  displayName?: string;
  externalId?: string;
  parentPrincipalId?: string;
  metadata?: Record<string, unknown>;
}

export interface CredentialBinding {
  id: string;
  providerId: string;
  secretRef: string;
  principalId?: string;
  credentialKind: "api_key" | "bearer_token" | "oauth_token" | "basic_auth" | "session" | "custom";
  scopes?: string[];
  capabilityIds?: string[];
  operationIds?: string[];
  enabled: boolean;
}

export interface ConnectorCapability {
  id: string;
  domain: string;
  action: string;
  facet: string;
  summary?: string;
  riskTiers: ConnectorRiskTier[];
  dataClasses?: string[];
  regulatedDomains?: RegulatedDomain[];
  sensitiveDataClasses?: SensitiveDataClass[];
  decisionEffects?: RegulatedDecisionEffect[];
  requiresProfessionalReview?: boolean;
  requiresSensitiveExportReview?: boolean;
  thirdPartyDisclosure?: boolean;
  requiredScopes?: string[];
}

export interface ConnectorOperation {
  id: string;
  providerId: string;
  capabilityIds: string[];
  runtimeKind: ConnectorRuntimeKind;
  support: ConnectorSupportState;
  riskTiers: ConnectorRiskTier[];
  credentialRequired: boolean;
  costRisk?: boolean;
  requiresApproval?: boolean;
  regulatedDomains?: RegulatedDomain[];
  decisionEffects?: RegulatedDecisionEffect[];
  requiresProfessionalReview?: boolean;
  requiresSensitiveExportReview?: boolean;
  thirdPartyDisclosure?: boolean;
  networkPolicyId?: string;
}

export interface ConnectorPolicyRule {
  effect: ConnectorPolicyEffect;
  reason: string;
  providerIds?: string[];
  operationIds?: string[];
  capabilityIds?: string[];
  credentialBindingIds?: string[];
  trustTiers?: ConnectorTrustTier[];
  riskTiers?: ConnectorRiskTier[];
}

export interface ConnectorPolicy {
  id: string;
  enabled: boolean;
  defaultEffect: ConnectorPolicyEffect;
  requireContext: boolean;
  blockUnsupported: boolean;
  blockMissingCredentialBinding: boolean;
  rules: ConnectorPolicyRule[];
  traceMode: ConnectorTraceMode;
}

export interface ConnectorBudget {
  id: string;
  unit: "requests" | "tokens" | "images" | "usd" | "credits" | string;
  window: ConnectorBudgetWindow;
  limit: number;
  used: number;
  providerId?: string;
  operationId?: string;
  capabilityId?: string;
  unknownCostBehavior: ConnectorBudgetUnknownCostBehavior;
}

export interface ConnectorNetworkPolicy {
  id: string;
  required: boolean;
  egressProfileId?: string;
  vpnProfileId?: string;
  proxyProfileId?: string;
  allowedHosts?: string[];
}

export interface ConnectorNetworkProof {
  policyId: string;
  egressProfileId?: string;
  vpnProfileId?: string;
  proxyProfileId?: string;
  host?: string;
}

export interface ConnectorApprovalGrant {
  id: string;
  expiresAt: string;
  providerIds?: string[];
  operationIds?: string[];
  capabilityIds?: string[];
  riskTiers?: ConnectorRiskTier[];
  allowsUnknownCost?: boolean;
  allowsNetworkPolicyBypass?: boolean;
}

export interface ConnectorExecutionRequest {
  provider: ConnectorProvider;
  operation: ConnectorOperation;
  capabilityId: string;
  context?: {
    actorId?: string;
    purpose?: string;
    workspaceId?: string;
    requestId?: string;
  };
  credentialBinding?: CredentialBinding;
  expectedCost?: number;
  requestedHost?: string;
  now?: string;
}

export interface ConnectorAuditDeclaration {
  traceMode: ConnectorTraceMode;
  fields: string[];
  rawTraceRequiresOptIn: boolean;
}

export interface ConnectorControlPlaneDecisionReason {
  code:
    | "missing_context"
    | "provider_disabled"
    | "operation_provider_mismatch"
    | "unsupported_operation"
    | "credential_binding_required"
    | "credential_binding_disabled"
    | "credential_binding_scope_mismatch"
    | "policy_denied"
    | "policy_default_denied"
    | "budget_required"
    | "budget_exceeded"
    | "unknown_cost_blocked"
    | "approval_required"
    | "approval_expired"
    | "network_proof_required"
    | "network_proof_mismatch"
    | "host_not_allowed";
  message: string;
}

export interface ConnectorControlPlaneDecision {
  allowed: boolean;
  pipeline: readonly ConnectorExecutionPipelineStage[];
  reasons: ConnectorControlPlaneDecisionReason[];
  audit: ConnectorAuditDeclaration;
}

export function isConnectorCapabilityId(value: string): boolean {
  return /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){2,}$/.test(value);
}

export function splitConnectorCapabilityId(value: string): Pick<ConnectorCapability, "domain" | "action" | "facet"> {
  const [domain = "", action = "", ...facetParts] = value.split(".");
  return { domain, action, facet: facetParts.join(".") };
}

export function createConnectorCapability(
  id: string,
  input: Omit<ConnectorCapability, "id" | "domain" | "action" | "facet">,
): ConnectorCapability {
  if (!isConnectorCapabilityId(id)) {
    throw new Error(`Invalid connector capability id: ${id}`);
  }
  return { id, ...splitConnectorCapabilityId(id), ...input };
}

export function connectorApprovalGrantMatches(
  grant: ConnectorApprovalGrant | undefined,
  request: ConnectorExecutionRequest,
): boolean {
  if (!grant) {
    return false;
  }
  const now = Date.parse(request.now ?? new Date().toISOString());
  const expiresAt = Date.parse(grant.expiresAt);
  if (Number.isNaN(expiresAt) || expiresAt <= now) {
    return false;
  }
  return matchesOptionalList(grant.providerIds, request.provider.id)
    && matchesOptionalList(grant.operationIds, request.operation.id)
    && matchesOptionalList(grant.capabilityIds, request.capabilityId)
    && matchesAnyOptionalList(grant.riskTiers, request.operation.riskTiers);
}

export function evaluateConnectorControlPlaneRequest(input: {
  request: ConnectorExecutionRequest;
  policy: ConnectorPolicy;
  budgets?: ConnectorBudget[];
  networkPolicies?: ConnectorNetworkPolicy[];
  networkProof?: ConnectorNetworkProof;
  approvalGrant?: ConnectorApprovalGrant;
}): ConnectorControlPlaneDecision {
  const { request, policy, budgets = [], networkPolicies = [], networkProof, approvalGrant } = input;
  const reasons: ConnectorControlPlaneDecisionReason[] = [];
  const matchingGrant = connectorApprovalGrantMatches(approvalGrant, request) ? approvalGrant : undefined;

  if (policy.requireContext && (!request.context?.actorId || !request.context?.purpose || !request.context?.requestId)) {
    reasons.push({
      code: "missing_context",
      message: "Connector execution requires actor, purpose, and request context.",
    });
  }

  if (!request.provider.enabled) {
    reasons.push({ code: "provider_disabled", message: `Provider ${request.provider.id} is disabled.` });
  }

  if (request.operation.providerId !== request.provider.id) {
    reasons.push({
      code: "operation_provider_mismatch",
      message: `Operation ${request.operation.id} does not belong to provider ${request.provider.id}.`,
    });
  }

  if (policy.blockUnsupported && request.operation.support !== "supported") {
    reasons.push({
      code: "unsupported_operation",
      message: `Operation ${request.operation.id} is ${request.operation.support}.`,
    });
  }

  evaluateCredentialBinding(request, policy, reasons);
  evaluatePolicyRules(request, policy, reasons);
  evaluateBudgets(request, budgets, matchingGrant, reasons);
  evaluateNetworkPolicy(request, networkPolicies, networkProof, matchingGrant, reasons);

  if (request.operation.requiresApproval && !matchingGrant) {
    reasons.push({
      code: "approval_required",
      message: `Operation ${request.operation.id} requires a scoped approval grant.`,
    });
  }

  if (approvalGrant && !matchingGrant) {
    reasons.push({
      code: "approval_expired",
      message: `Approval grant ${approvalGrant.id} is expired or outside the requested scope.`,
    });
  }

  return {
    allowed: reasons.length === 0,
    pipeline: connectorExecutionPipeline,
    reasons,
    audit: {
      traceMode: policy.traceMode,
      fields: ["requestId", "actorId", "purpose", "providerId", "operationId", "capabilityId", "credentialBindingId", "decision"],
      rawTraceRequiresOptIn: policy.traceMode === "raw_encrypted_opt_in",
    },
  };
}

function evaluateCredentialBinding(
  request: ConnectorExecutionRequest,
  policy: ConnectorPolicy,
  reasons: ConnectorControlPlaneDecisionReason[],
): void {
  if (!request.operation.credentialRequired) {
    return;
  }
  if (!request.credentialBinding) {
    if (policy.blockMissingCredentialBinding) {
      reasons.push({
        code: "credential_binding_required",
        message: `Operation ${request.operation.id} requires a registered credential binding.`,
      });
    }
    return;
  }
  if (!request.credentialBinding.enabled) {
    reasons.push({
      code: "credential_binding_disabled",
      message: `Credential binding ${request.credentialBinding.id} is disabled.`,
    });
  }
  if (
    request.credentialBinding.providerId !== request.provider.id
    || !matchesOptionalList(request.credentialBinding.operationIds, request.operation.id)
    || !matchesOptionalList(request.credentialBinding.capabilityIds, request.capabilityId)
  ) {
    reasons.push({
      code: "credential_binding_scope_mismatch",
      message: `Credential binding ${request.credentialBinding.id} is outside the requested connector scope.`,
    });
  }
}

function evaluatePolicyRules(
  request: ConnectorExecutionRequest,
  policy: ConnectorPolicy,
  reasons: ConnectorControlPlaneDecisionReason[],
): void {
  const matchingRules = policy.rules.filter((rule) => connectorPolicyRuleMatches(rule, request));
  const denyRule = matchingRules.find((rule) => rule.effect === "deny");
  if (denyRule) {
    reasons.push({ code: "policy_denied", message: denyRule.reason });
    return;
  }
  const allowRule = matchingRules.find((rule) => rule.effect === "allow");
  if (!allowRule && policy.defaultEffect === "deny") {
    reasons.push({
      code: "policy_default_denied",
      message: `No allow rule matched connector operation ${request.operation.id}.`,
    });
  }
}

function evaluateBudgets(
  request: ConnectorExecutionRequest,
  budgets: ConnectorBudget[],
  grant: ConnectorApprovalGrant | undefined,
  reasons: ConnectorControlPlaneDecisionReason[],
): void {
  if (!request.operation.costRisk) {
    return;
  }
  const matchingBudgets = budgets.filter((budget) =>
    matchesOptionalList(budget.providerId ? [budget.providerId] : undefined, request.provider.id)
    && matchesOptionalList(budget.operationId ? [budget.operationId] : undefined, request.operation.id)
    && matchesOptionalList(budget.capabilityId ? [budget.capabilityId] : undefined, request.capabilityId)
  );
  if (matchingBudgets.length === 0) {
    reasons.push({
      code: "budget_required",
      message: `Cost-risk operation ${request.operation.id} requires a connector budget.`,
    });
    return;
  }
  if (request.expectedCost === undefined) {
    const blocksUnknownCost = matchingBudgets.some((budget) => budget.unknownCostBehavior === "block");
    const requiresApproval = matchingBudgets.some((budget) => budget.unknownCostBehavior === "require_approval");
    if (blocksUnknownCost && !grant?.allowsUnknownCost) {
      reasons.push({
        code: "unknown_cost_blocked",
        message: `Operation ${request.operation.id} has unknown cost and the matching budget blocks unknown cost.`,
      });
    }
    if (requiresApproval && !grant?.allowsUnknownCost) {
      reasons.push({
        code: "approval_required",
        message: `Operation ${request.operation.id} has unknown cost and requires approval.`,
      });
    }
    return;
  }
  const exceeded = matchingBudgets.find((budget) => budget.used + request.expectedCost! > budget.limit);
  if (exceeded) {
    reasons.push({
      code: "budget_exceeded",
      message: `Budget ${exceeded.id} would exceed ${exceeded.limit} ${exceeded.unit}.`,
    });
  }
}

function evaluateNetworkPolicy(
  request: ConnectorExecutionRequest,
  networkPolicies: ConnectorNetworkPolicy[],
  networkProof: ConnectorNetworkProof | undefined,
  grant: ConnectorApprovalGrant | undefined,
  reasons: ConnectorControlPlaneDecisionReason[],
): void {
  const policy = networkPolicies.find((candidate) => candidate.id === request.operation.networkPolicyId);
  if (!policy?.required) {
    return;
  }
  if (!networkProof) {
    if (!grant?.allowsNetworkPolicyBypass) {
      reasons.push({
        code: "network_proof_required",
        message: `Operation ${request.operation.id} requires egress proof for network policy ${policy.id}.`,
      });
    }
    return;
  }
  if (
    networkProof.policyId !== policy.id
    || networkProof.egressProfileId !== policy.egressProfileId
    || networkProof.vpnProfileId !== policy.vpnProfileId
    || networkProof.proxyProfileId !== policy.proxyProfileId
  ) {
    reasons.push({
      code: "network_proof_mismatch",
      message: `Network proof does not match connector network policy ${policy.id}.`,
    });
  }
  if (policy.allowedHosts?.length && request.requestedHost && !policy.allowedHosts.includes(request.requestedHost)) {
    reasons.push({
      code: "host_not_allowed",
      message: `Host ${request.requestedHost} is not allowed by connector network policy ${policy.id}.`,
    });
  }
}

function connectorPolicyRuleMatches(rule: ConnectorPolicyRule, request: ConnectorExecutionRequest): boolean {
  return matchesOptionalList(rule.providerIds, request.provider.id)
    && matchesOptionalList(rule.operationIds, request.operation.id)
    && matchesOptionalList(rule.capabilityIds, request.capabilityId)
    && matchesOptionalList(rule.credentialBindingIds, request.credentialBinding?.id)
    && matchesOptionalList(rule.trustTiers, request.provider.trustTier)
    && matchesAnyOptionalList(rule.riskTiers, request.operation.riskTiers);
}

function matchesOptionalList<T extends string>(allowed: readonly T[] | undefined, value: string | undefined): boolean {
  return !allowed?.length || (value !== undefined && allowed.includes(value as T));
}

function matchesAnyOptionalList<T extends string>(allowed: readonly T[] | undefined, values: readonly T[]): boolean {
  return !allowed?.length || values.some((value) => allowed.includes(value));
}
