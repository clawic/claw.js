import {
  evaluateRegulatedAction,
  type RegulatedDecisionEffect,
  type RegulatedDomain,
  type SensitiveRecordClass,
} from "./regulated-domain-safety.ts";
import {
  explainConnectorContextChoice,
  type ConnectorContextChoice,
  type ConnectorContextDecisionReasonCode,
  type ConnectorContextRequirement,
} from "./connector-governed-context.ts";
import type { NetworkPolicyEvaluation } from "./network-control-plane.ts";

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
  | "team"
  | "product"
  | "entitlement"
  | "bot"
  | "user"
  | "endpoint"
  | "environment"
  | "signing_identity";

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
  sensitiveRecordClasses?: SensitiveRecordClass[];
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
  contextRequirements?: ConnectorContextRequirement[];
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
  networkPolicyProfileId?: string;
  allowedDecisions?: ConnectorNetworkAllowedDecision[];
  expectedAdapterId?: string;
  expectedMatchedRuleIds?: string[];
  /**
   * Deprecated projection fields retained for stored catalog compatibility.
   * They are not an independent authority; connector execution must present a
   * Network Control Plane evaluation in ConnectorNetworkProof.
   */
  egressProfileId?: string;
  vpnProfileId?: string;
  proxyProfileId?: string;
  allowedHosts?: string[];
}

export type ConnectorNetworkAllowedDecision = Extract<
  NetworkPolicyEvaluation["decision"],
  "allow" | "notify" | "routeVia" | "requireVpn"
>;

export interface ConnectorNetworkProof {
  policyId: string;
  networkEvaluation?: NetworkPolicyEvaluation;
  /**
   * Deprecated projection fields retained so old callers fail closed with a
   * mismatch instead of silently authorizing network access.
   */
  egressProfileId?: string;
  vpnProfileId?: string;
  proxyProfileId?: string;
  host?: string;
}

export interface ConnectorScopedGrant {
  id: string;
  expiresAt: string;
  approvalEvidenceId?: string;
  providerIds?: string[];
  operationIds?: string[];
  capabilityIds?: string[];
  riskTiers?: ConnectorRiskTier[];
  allowsUnknownCost?: boolean;
  allowsNetworkPolicyBypass?: boolean;
}

/**
 * @deprecated Use ConnectorScopedGrant. This compatibility alias names the
 * legacy approval-bound connector grant projection; approval evidence remains
 * review metadata, while the grant is the scoped capability edge.
 */
export type ConnectorApprovalGrant = ConnectorScopedGrant;

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
  governedContext?: ConnectorContextChoice;
  credentialBinding?: CredentialBinding;
  expectedCost?: number;
  requestedHost?: string;
  now?: string;
}

export interface ConnectorAuditDeclaration {
  traceMode: ConnectorTraceMode;
  fields: string[];
  rawTraceRequiresOptIn: boolean;
  providerId?: string;
  operationId?: string;
  capabilityId?: string;
  actorId?: string;
  requestId?: string;
  contextRefs?: string[];
  contextFieldRefs?: string[];
  secretRefs?: string[];
  defaultContextRefs?: string[];
  appliedRuleIds?: string[];
  scopedGrantId?: string;
  approvalEvidenceId?: string;
  /**
   * @deprecated Use scopedGrantId. Kept for existing audit consumers.
   */
  approvalGrantId?: string;
  reasonCodes?: ConnectorControlPlaneDecisionReason["code"][];
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
    | "policy_disabled"
    | "policy_denied"
    | "policy_default_denied"
    | "budget_required"
    | "budget_exceeded"
    | "unknown_cost_blocked"
    | "approval_required"
    | "approval_expired"
    | "network_proof_required"
    | "network_proof_mismatch"
    | "host_not_allowed"
    | "regulated_safety_blocked"
    | ConnectorContextDecisionReasonCode;
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
  grant: ConnectorScopedGrant | undefined,
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
  scopedGrant?: ConnectorScopedGrant;
  /**
   * @deprecated Use scopedGrant. Retained so existing callers keep failing
   * closed under the same scoped grant checks until they migrate.
   */
  approvalGrant?: ConnectorApprovalGrant;
}): ConnectorControlPlaneDecision {
  const { request, policy, budgets = [], networkPolicies = [], networkProof } = input;
  const scopedGrant = input.scopedGrant ?? input.approvalGrant;
  const reasons: ConnectorControlPlaneDecisionReason[] = [];
  const matchingGrant = connectorApprovalGrantMatches(scopedGrant, request) ? scopedGrant : undefined;

  if (!policy.enabled) {
    reasons.push({
      code: "policy_disabled",
      message: `Connector policy ${policy.id} is disabled.`,
    });
  }

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
  evaluateGovernedContext(request, reasons);
  evaluatePolicyRules(request, policy, reasons);
  evaluateBudgets(request, budgets, matchingGrant, reasons);
  evaluateNetworkPolicy(request, networkPolicies, networkProof, matchingGrant, reasons);
  evaluateRegulatedConnectorSafety(request, reasons);

  if (request.operation.requiresApproval && !matchingGrant) {
    reasons.push({
      code: "approval_required",
      message: `Operation ${request.operation.id} requires a scoped connector grant tied to approval evidence.`,
    });
  }

  if (scopedGrant && !matchingGrant) {
    reasons.push({
      code: "approval_expired",
      message: `Scoped connector grant ${scopedGrant.id} is expired or outside the requested scope.`,
    });
  }

  return {
    allowed: reasons.length === 0,
    pipeline: connectorExecutionPipeline,
    reasons,
    audit: {
      traceMode: policy.traceMode,
      fields: ["requestId", "actorId", "purpose", "providerId", "operationId", "capabilityId", "credentialBindingId", "governedContext", "decision"],
      rawTraceRequiresOptIn: policy.traceMode === "raw_encrypted_opt_in",
      providerId: request.provider.id,
      operationId: request.operation.id,
      capabilityId: request.capabilityId,
      ...(request.context?.actorId ? { actorId: request.context.actorId } : {}),
      ...(request.context?.requestId ? { requestId: request.context.requestId } : {}),
      ...auditGovernedContext(request),
      ...(matchingGrant ? {
        scopedGrantId: matchingGrant.id,
        approvalGrantId: matchingGrant.id,
        ...(matchingGrant.approvalEvidenceId ? { approvalEvidenceId: matchingGrant.approvalEvidenceId } : {}),
      } : {}),
      reasonCodes: reasons.map((reason) => reason.code),
    },
  };
}

function evaluateRegulatedConnectorSafety(
  request: ConnectorExecutionRequest,
  reasons: ConnectorControlPlaneDecisionReason[],
): void {
  const capability = request.provider.capabilities?.find((candidate) => candidate.id === request.capabilityId);
  const regulatedDomains = uniqueValues([
    ...(request.operation.regulatedDomains ?? []),
    ...(capability?.regulatedDomains ?? []),
  ]);
  if (regulatedDomains.length === 0) {
    return;
  }
  const decisionEffects = uniqueValues([
    ...(request.operation.decisionEffects ?? []),
    ...(capability?.decisionEffects ?? []),
  ]);
  const fallbackDecisionEffect: RegulatedDecisionEffect = request.operation.riskTiers.some((tier) => tier === "write" || tier === "destructive" || tier === "cost" || tier === "system")
    ? "external_action"
    : "recordkeeping";
  const sensitiveExport = request.operation.requiresSensitiveExportReview === true || capability?.requiresSensitiveExportReview === true;
  const remoteOrProviderUse = request.provider.trustTier === "third_party"
    || request.provider.trustTier === "mesh"
    || request.provider.trustTier === "self_hosted"
    || request.operation.thirdPartyDisclosure === true
    || capability?.thirdPartyDisclosure === true;

  for (const regulatedDomain of regulatedDomains) {
    const decision = evaluateRegulatedAction({
      regulatedDomain,
      decisionEffect: decisionEffects[0] ?? fallbackDecisionEffect,
      externalAction: fallbackDecisionEffect === "external_action" || decisionEffects.includes("external_action"),
      sensitiveExport,
      remoteOrProviderUse,
    });
    if (!decision.allowed) {
      reasons.push({
        code: "regulated_safety_blocked",
        message: `Connector operation ${request.operation.id} is blocked by regulated safety for ${regulatedDomain}: ${decision.denialCodes.join(", ")}`,
      });
    }
  }
}

function auditGovernedContext(request: ConnectorExecutionRequest): Pick<ConnectorAuditDeclaration, "contextRefs" | "contextFieldRefs" | "secretRefs" | "defaultContextRefs" | "appliedRuleIds"> {
  const selected = request.governedContext?.selected ?? [];
  const contextRefs = selected.map((record) => record.id);
  const contextFieldRefs = selected.flatMap((record) => Object.keys(record.fields).map((fieldName) => `${record.id}.${fieldName}`));
  const secretRefs = selected.flatMap((record) => Object.values(record.fields).flatMap((field) => field.secretRef ? [field.secretRef] : []));
  const defaultContextRefs = request.governedContext?.trace.defaultRefs ?? [];
  const appliedRuleIds = request.governedContext?.trace.fallbackRuleIds ?? [];
  return {
    ...(contextRefs.length > 0 ? { contextRefs } : {}),
    ...(contextFieldRefs.length > 0 ? { contextFieldRefs } : {}),
    ...(secretRefs.length > 0 ? { secretRefs } : {}),
    ...(defaultContextRefs.length > 0 ? { defaultContextRefs } : {}),
    ...(appliedRuleIds.length > 0 ? { appliedRuleIds } : {}),
  };
}

function evaluateGovernedContext(
  request: ConnectorExecutionRequest,
  reasons: ConnectorControlPlaneDecisionReason[],
): void {
  if (!request.operation.contextRequirements?.length) {
    return;
  }
  if (!request.governedContext) {
    reasons.push({
      code: "context_required",
      message: `Operation ${request.operation.id} requires governed connector context.`,
    });
    return;
  }
  if (
    request.governedContext.trace.providerId !== request.provider.id
    || request.governedContext.trace.operationId !== request.operation.id
  ) {
    reasons.push({
      code: "context_decision_mismatch",
      message: `Governed context decision must match provider ${request.provider.id} and operation ${request.operation.id}.`,
    });
    return;
  }
  if (!request.governedContext.allowed) {
    for (const reason of request.governedContext.reasons) {
      reasons.push({
        code: reason.code,
        message: reason.message,
      });
    }
    return;
  }

  const rechecked = explainConnectorContextChoice({
    providerId: request.provider.id,
    operationId: request.operation.id,
    environment: request.governedContext.trace.environment,
    actorId: request.context?.actorId,
    requirements: request.operation.contextRequirements,
    defaultRefs: request.governedContext.trace.defaultRefs,
    candidates: request.governedContext.selected,
  });
  for (const reason of rechecked.reasons) {
    reasons.push({
      code: reason.code,
      message: reason.message,
    });
  }
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
  grant: ConnectorScopedGrant | undefined,
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
  grant: ConnectorScopedGrant | undefined,
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
        message: `Operation ${request.operation.id} requires Network Control Plane proof for connector network policy ${policy.id}.`,
      });
    }
    return;
  }
  if (networkProof.policyId !== policy.id || !networkProof.networkEvaluation) {
    reasons.push({
      code: "network_proof_mismatch",
      message: `Network proof must match connector policy ${policy.id} and include a Network Control Plane evaluation.`,
    });
    return;
  }
  const evaluation = networkProof.networkEvaluation;
  const allowedDecisions = policy.allowedDecisions ?? ["allow", "notify", "routeVia", "requireVpn"];
  if (!allowedDecisions.includes(evaluation.decision as ConnectorNetworkAllowedDecision)) {
    reasons.push({
      code: evaluation.decision === "ask" ? "network_proof_required" : "network_proof_mismatch",
      message: `Network Control Plane decision ${evaluation.decision} is not sufficient for connector policy ${policy.id}.`,
    });
  }
  if (policy.expectedAdapterId && evaluation.adapterId !== policy.expectedAdapterId) {
    reasons.push({
      code: "network_proof_mismatch",
      message: `Network Control Plane adapter ${evaluation.adapterId} does not match connector policy ${policy.id}.`,
    });
  }
  if (policy.expectedMatchedRuleIds?.length) {
    const missingRuleIds = policy.expectedMatchedRuleIds.filter((ruleId) => !evaluation.matchedRuleIds.includes(ruleId));
    if (missingRuleIds.length > 0) {
      reasons.push({
        code: "network_proof_mismatch",
        message: `Network Control Plane evaluation is missing required rule ids for connector policy ${policy.id}: ${missingRuleIds.join(", ")}.`,
      });
    }
  }
  if (
    policy.networkPolicyProfileId
    && evaluation.matchedRule
    && evaluation.matchedRule.networkPolicyProfileId !== policy.networkPolicyProfileId
  ) {
    reasons.push({
      code: "network_proof_mismatch",
      message: `Network Control Plane profile ${evaluation.matchedRule.networkPolicyProfileId} does not match connector policy ${policy.id}.`,
    });
  }
  if (request.requestedHost && request.requestedHost !== networkProof.host) {
    reasons.push({
      code: "host_not_allowed",
      message: networkProof.host
        ? `Network proof host ${networkProof.host} does not match requested host ${request.requestedHost}.`
        : `Network proof must include requested host ${request.requestedHost}.`,
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

function uniqueValues<T extends string>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}
