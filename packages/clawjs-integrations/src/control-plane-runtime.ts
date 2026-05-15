import {
  evaluateConnectorControlPlaneRequest,
  type ConnectorApprovalGrant,
  type ConnectorBudget,
  type ConnectorControlPlaneDecision,
  type ConnectorExecutionRequest,
  type ConnectorNetworkPolicy,
  type ConnectorNetworkProof,
  type ConnectorPolicy,
  type ConnectorProvider,
  type ConnectorRiskTier,
  type CredentialBinding,
} from "@clawjs/core";

import type {
  ConnectorAppDefinition,
  ConnectorOperationDefinition,
} from "./types.js";

export interface ConnectorRuntimeControlPlaneOptions {
  capabilityId?: string;
  context: NonNullable<ConnectorExecutionRequest["context"]>;
  policy: ConnectorPolicy;
  provider?: ConnectorProvider;
  credentialBinding?: CredentialBinding;
  budgets?: ConnectorBudget[];
  networkPolicies?: ConnectorNetworkPolicy[];
  networkProof?: ConnectorNetworkProof;
  approvalGrant?: ConnectorApprovalGrant;
  expectedCost?: number;
  requestedHost?: string;
  now?: string;
  networkPolicyId?: string;
}

export function assertConnectorRuntimeControlPlane(input: {
  app: ConnectorAppDefinition;
  operation: ConnectorOperationDefinition;
  controlPlane?: ConnectorRuntimeControlPlaneOptions;
}): ConnectorControlPlaneDecision {
  const { app, operation, controlPlane } = input;
  if (!controlPlane) {
    throw new Error("Connector runtime execution requires connector control plane approval.");
  }

  const readinessIssues = connectorRuntimeReadinessIssues(operation);
  if (readinessIssues.length > 0) {
    throw new Error(`Connector operation is not ready for control plane execution: ${readinessIssues.join(", ")}`);
  }

  const capabilityId = controlPlane.capabilityId ?? `connector.${operation.kind}.native`;
  const request: ConnectorExecutionRequest = {
    provider: controlPlane.provider ?? {
      id: app.id,
      displayName: app.name,
      trustTier: "third_party",
      enabled: true,
    },
    operation: {
      id: operation.id,
      providerId: app.id,
      capabilityIds: [capabilityId],
      runtimeKind: operation.kind === "source" ? "webhook" : "api",
      support: operation.support?.state === "supported" ? "supported" : "external_pending",
      riskTiers: riskTiersForOperation(operation),
      credentialRequired: operation.authFieldNames.length > 0 || operation.executionPolicy?.requiresAuth === true,
      costRisk: operation.executionPolicy?.costRisk === true,
      requiresApproval: operation.executionPolicy?.requiresHostApproval === true || operation.executionPolicy?.destructive === true,
      networkPolicyId: controlPlane.networkPolicyId,
    },
    capabilityId,
    context: controlPlane.context,
    credentialBinding: controlPlane.credentialBinding,
    expectedCost: controlPlane.expectedCost,
    requestedHost: controlPlane.requestedHost,
    now: controlPlane.now,
  };

  const decision = evaluateConnectorControlPlaneRequest({
    request,
    policy: controlPlane.policy,
    budgets: controlPlane.budgets,
    networkPolicies: controlPlane.networkPolicies,
    networkProof: controlPlane.networkProof,
    approvalGrant: controlPlane.approvalGrant,
  });
  if (!decision.allowed) {
    throw new Error(`Connector control plane denied execution: ${decision.reasons.map((reason) => reason.code).join(", ")}`);
  }
  return decision;
}

export function connectorRuntimeReadinessIssues(operation: ConnectorOperationDefinition): string[] {
  const issues: string[] = [];
  if (operation.support?.state !== "supported") {
    issues.push("unsupported_operation");
  }
  if (!operation.executionPolicy) {
    issues.push("missing_execution_policy");
  }
  if (operation.executionPolicy?.auditRequired !== true) {
    issues.push("missing_audit_policy");
  }
  if (operation.executionPolicy?.requiresAuth === true && operation.authFieldNames.length === 0) {
    issues.push("missing_credential_scope");
  }
  if (operation.runtime?.hasRun !== true && operation.runtime?.hasHooks !== true) {
    issues.push("missing_runtime_evidence");
  }
  return issues;
}

function riskTiersForOperation(operation: ConnectorOperationDefinition): ConnectorRiskTier[] {
  const tiers = new Set<ConnectorRiskTier>();
  if (operation.executionPolicy?.readOnly === true || operation.annotations?.readOnlyHint === true) {
    tiers.add("read");
  } else {
    tiers.add("write");
  }
  if (operation.executionPolicy?.destructive === true || operation.annotations?.destructiveHint === true) {
    tiers.add("destructive");
  }
  if (operation.executionPolicy?.costRisk === true) {
    tiers.add("cost");
  }
  if (operation.executionPolicy?.requiresHostApproval === true) {
    tiers.add("system");
  }
  return [...tiers];
}
