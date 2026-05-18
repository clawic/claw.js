import {
  evaluateAgentAssignmentRoute,
  evaluateAgentEffectiveAccess,
  evaluateConnectorControlPlaneRequest,
  type AgentEffectiveAccessResult,
  type AgentAssignmentRouteResult,
  type ConnectorApprovalGrant,
  type ConnectorBudget,
  type ConnectorControlPlaneDecision,
  type ConnectorExecutionRequest,
  type ConnectorNetworkPolicy,
  type ConnectorNetworkProof,
  type ConnectorPolicy,
  type ConnectorProvider,
  type RegulatedDecisionEffect,
  type RegulatedDomain,
} from "@clawjs/core";

import type { MCPAgentAssignmentPolicyInput, MCPServerRecord, MCPToolRecord } from "./types.ts";

export interface MCPConnectorControlPlaneInput {
  capabilityId?: string;
  context: NonNullable<ConnectorExecutionRequest["context"]>;
  policy: ConnectorPolicy;
  provider?: ConnectorProvider;
  budgets?: ConnectorBudget[];
  networkPolicies?: ConnectorNetworkPolicy[];
  networkProof?: ConnectorNetworkProof;
  approvalGrant?: ConnectorApprovalGrant;
  regulatedDomains?: RegulatedDomain[];
  decisionEffects?: RegulatedDecisionEffect[];
  requiresSensitiveExportReview?: boolean;
  thirdPartyDisclosure?: boolean;
  expectedCost?: number;
  requestedHost?: string;
  now?: string;
  networkPolicyId?: string;
}

export interface MCPAgentAssignmentPolicyDecision {
  route: AgentAssignmentRouteResult;
  access: AgentEffectiveAccessResult;
}

export function assertMCPAgentAssignmentPolicy(input?: MCPAgentAssignmentPolicyInput): MCPAgentAssignmentPolicyDecision {
  if (!input) {
    throw new Error("MCP tool execution requires Agents V1 assignment policy.");
  }
  const route = evaluateAgentAssignmentRoute(input.route);
  if (!route.allowed) {
    throw new Error(`MCP Agents V1 assignment route denied execution: ${route.reasons.join(", ")}`);
  }
  const access = evaluateAgentEffectiveAccess(input.access);
  if (!access.allowed) {
    throw new Error(`MCP Agents V1 effective access denied execution: ${access.reasons.join(", ")}`);
  }
  return { route, access };
}

export function assertMCPToolControlPlane(input: {
  server: MCPServerRecord;
  tool: MCPToolRecord;
  controlPlane?: MCPConnectorControlPlaneInput;
  agentPolicy?: MCPAgentAssignmentPolicyInput;
}): ConnectorControlPlaneDecision {
  const { server, tool, controlPlane, agentPolicy } = input;
  if (!controlPlane) {
    throw new Error("MCP tool execution requires connector control plane approval.");
  }
  assertMCPAgentAssignmentPolicy(agentPolicy);
  if (!server.enabled) {
    throw new Error(`MCP server ${server.id} is disabled.`);
  }
  if (!tool.inputSchema) {
    throw new Error(`MCP tool ${tool.prefixedName} is missing schema evidence.`);
  }

  const capabilityId = controlPlane.capabilityId ?? "mcp.tool.call";
  const providerId = `mcp:${server.id}`;
  const decision = evaluateConnectorControlPlaneRequest({
    request: {
      provider: controlPlane.provider ?? {
        id: providerId,
        displayName: server.name,
        trustTier: "third_party",
        enabled: server.enabled,
      },
      operation: {
        id: `mcp.${server.name}.${tool.toolName}`,
        providerId,
        capabilityIds: [capabilityId],
        runtimeKind: "mcp",
        support: "supported",
        riskTiers: ["system"],
        credentialRequired: Boolean(server.envJson && Object.keys(server.envJson).length > 0),
        requiresApproval: true,
        regulatedDomains: controlPlane.regulatedDomains,
        decisionEffects: controlPlane.decisionEffects,
        requiresSensitiveExportReview: controlPlane.requiresSensitiveExportReview,
        thirdPartyDisclosure: controlPlane.thirdPartyDisclosure,
        networkPolicyId: controlPlane.networkPolicyId,
      },
      capabilityId,
      context: controlPlane.context,
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
    throw new Error(`MCP connector control plane denied execution: ${decision.reasons.map((reason) => reason.code).join(", ")}`);
  }
  return decision;
}
