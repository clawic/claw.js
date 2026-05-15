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

export interface ConnectorCommandAdapterDefinition {
  id: string;
  providerId: string;
  displayName: string;
  command: string;
  args: string[];
  capabilityIds: string[];
  support: "supported" | "unsupported" | "external_pending";
  riskTiers: ConnectorRiskTier[];
  credentialRequired: boolean;
  costRisk?: boolean;
  requiresApproval?: boolean;
  networkPolicyId?: string;
  evidence: string[];
}

export interface ConnectorCommandAdapterControlPlaneOptions {
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
}

export interface ConnectorCommandAdapterPlan {
  adapterId: string;
  providerId: string;
  command: string;
  args: string[];
  capabilityIds: string[];
  runtimeKind: "cli";
}

export function buildConnectorCommandAdapterPlan(adapter: ConnectorCommandAdapterDefinition): ConnectorCommandAdapterPlan {
  assertCommandAdapterRegistered(adapter);
  return {
    adapterId: adapter.id,
    providerId: adapter.providerId,
    command: adapter.command,
    args: [...adapter.args],
    capabilityIds: [...adapter.capabilityIds],
    runtimeKind: "cli",
  };
}

export function assertConnectorCommandAdapterControlPlane(input: {
  adapter: ConnectorCommandAdapterDefinition;
  controlPlane?: ConnectorCommandAdapterControlPlaneOptions;
}): ConnectorControlPlaneDecision {
  const { adapter, controlPlane } = input;
  assertCommandAdapterRegistered(adapter);
  if (!controlPlane) {
    throw new Error("External CLI adapter execution requires connector control plane approval.");
  }
  const capabilityId = controlPlane.capabilityId ?? adapter.capabilityIds[0]!;
  const decision = evaluateConnectorControlPlaneRequest({
    request: {
      provider: controlPlane.provider ?? {
        id: adapter.providerId,
        displayName: adapter.providerId,
        trustTier: "third_party",
        enabled: true,
      },
      operation: {
        id: adapter.id,
        providerId: adapter.providerId,
        capabilityIds: adapter.capabilityIds,
        runtimeKind: "cli",
        support: adapter.support,
        riskTiers: adapter.riskTiers,
        credentialRequired: adapter.credentialRequired,
        costRisk: adapter.costRisk,
        requiresApproval: adapter.requiresApproval,
        networkPolicyId: adapter.networkPolicyId,
      },
      capabilityId,
      context: controlPlane.context,
      credentialBinding: controlPlane.credentialBinding,
      expectedCost: controlPlane.expectedCost,
      requestedHost: controlPlane.requestedHost,
      now: controlPlane.now,
    },
    policy: controlPlane.policy,
    budgets: controlPlane.budgets,
    networkPolicies: controlPlane.networkPolicies,
    networkProof: controlPlane.networkProof,
    approvalGrant: controlPlane.approvalGrant,
  });
  if (!decision.allowed) {
    throw new Error(`External CLI connector control plane denied execution: ${decision.reasons.map((reason) => reason.code).join(", ")}`);
  }
  return decision;
}

function assertCommandAdapterRegistered(adapter: ConnectorCommandAdapterDefinition): void {
  if (!adapter.id || !adapter.providerId || !adapter.command) {
    throw new Error("External CLI adapter requires id, providerId, and command.");
  }
  if (adapter.capabilityIds.length === 0) {
    throw new Error(`External CLI adapter ${adapter.id} requires at least one capability.`);
  }
  if (adapter.evidence.length === 0) {
    throw new Error(`External CLI adapter ${adapter.id} requires local evidence.`);
  }
  if (adapter.support !== "supported") {
    throw new Error(`External CLI adapter ${adapter.id} is ${adapter.support}.`);
  }
}
