import { test } from "vitest";
import assert from "node:assert/strict";

import {
  clawCliCommandRegistry,
  connectorExecutionPipeline,
  createConnectorCapability,
  evaluateConnectorControlPlaneRequest,
  isConnectorCapabilityId,
  resolveClawCliCommand,
  splitConnectorCapabilityId,
  type ConnectorProvider,
  type ConnectorExecutionRequest,
  type ConnectorPolicy,
} from "./index.ts";

const basePolicy: ConnectorPolicy = {
  id: "default",
  enabled: true,
  defaultEffect: "allow",
  requireContext: true,
  blockUnsupported: true,
  blockMissingCredentialBinding: true,
  rules: [],
  traceMode: "redacted",
};

const baseRequest: ConnectorExecutionRequest = {
  provider: {
    id: "github",
    displayName: "GitHub",
    trustTier: "third_party",
    enabled: true,
  },
  operation: {
    id: "github.issues.create",
    providerId: "github",
    capabilityIds: ["issues.create.record"],
    runtimeKind: "api",
    support: "supported",
    riskTiers: ["write"],
    credentialRequired: true,
  },
  capabilityId: "issues.create.record",
  context: {
    actorId: "agent-1",
    purpose: "test",
    requestId: "req-1",
  },
  credentialBinding: {
    id: "cred-1",
    providerId: "github",
    secretRef: "secret://github/token",
    credentialKind: "oauth_token",
    operationIds: ["github.issues.create"],
    capabilityIds: ["issues.create.record"],
    enabled: true,
  },
};

test("connector control plane allows a scoped supported request", () => {
  const decision = evaluateConnectorControlPlaneRequest({
    request: baseRequest,
    policy: basePolicy,
  });

  assert.equal(decision.allowed, true);
  assert.deepEqual(decision.pipeline, connectorExecutionPipeline);
  assert.equal(decision.reasons.length, 0);
  assert.equal(decision.audit.traceMode, "redacted");
});

test("connector control plane blocks missing context, credentials, and unsupported operations", () => {
  const decision = evaluateConnectorControlPlaneRequest({
    request: {
      ...baseRequest,
      context: undefined,
      credentialBinding: undefined,
      operation: { ...baseRequest.operation, support: "external_pending" },
    },
    policy: basePolicy,
  });

  assert.equal(decision.allowed, false);
  assert.deepEqual(decision.reasons.map((reason) => reason.code).sort(), [
    "credential_binding_required",
    "missing_context",
    "unsupported_operation",
  ]);
});

test("connector control plane enforces budgets and network proof", () => {
  const decision = evaluateConnectorControlPlaneRequest({
    request: {
      ...baseRequest,
      expectedCost: 5,
      requestedHost: "api.github.com",
      operation: {
        ...baseRequest.operation,
        costRisk: true,
        networkPolicyId: "vpn",
      },
    },
    policy: basePolicy,
    budgets: [{
      id: "budget",
      unit: "usd",
      window: "day",
      limit: 4,
      used: 0,
      unknownCostBehavior: "block",
    }],
    networkPolicies: [{
      id: "vpn",
      required: true,
      egressProfileId: "office",
      allowedHosts: ["api.github.com"],
    }],
  });

  assert.equal(decision.allowed, false);
  assert.deepEqual(decision.reasons.map((reason) => reason.code).sort(), [
    "budget_exceeded",
    "network_proof_required",
  ]);
});

test("connector capability ids expose domain action and facet", () => {
  assert.equal(isConnectorCapabilityId("media.image.edit"), true);
  assert.equal(isConnectorCapabilityId("media.image.edit.transparent-background"), false);
  assert.equal(isConnectorCapabilityId("image.edit"), false);
  assert.deepEqual(splitConnectorCapabilityId("issues.create.record"), {
    domain: "issues",
    action: "create",
    facet: "record",
  });
  assert.equal(createConnectorCapability("issues.create.record", {
    summary: "Create an issue",
    riskTiers: ["write"],
  }).domain, "issues");
  assert.throws(() => createConnectorCapability("invalid", { riskTiers: ["read"] }));
});

test("connectors is the canonical public surface and integrations delegates to it", () => {
  const connectors = resolveClawCliCommand("connectors");
  const integrations = resolveClawCliCommand("integrations");

  assert.equal(connectors?.kind, "canonical");
  assert.equal(connectors?.securityPolicy, "signed_host_broker");
  assert.equal(connectors?.adrs.includes("docs/adr/0015-connector-control-plane-v1.md"), true);
  assert.equal(integrations?.kind, "alias");
  assert.equal(integrations?.target, "connectors");
  assert.equal(clawCliCommandRegistry.commands.filter((entry) => entry.name === "connectors").length, 1);
});

test("external principals are flexible and do not assume every provider is an account", () => {
  const principals: ConnectorProvider["principals"] = [
    { id: "openai_account_primary", providerId: "openai", kind: "account", displayName: "Primary" },
    { id: "revenuecat_project_main", providerId: "revenuecat", kind: "project", displayName: "Main Project" },
    { id: "telegram_bot_ops", providerId: "telegram_bot_api", kind: "bot", displayName: "Ops Bot" },
    { id: "self_hosted_endpoint", providerId: "internal_http", kind: "endpoint", displayName: "Internal endpoint" },
  ];

  assert.deepEqual(principals.map((principal) => principal.kind), ["account", "project", "bot", "endpoint"]);
});

test("deny rules win and raw trace mode remains explicit", () => {
  const decision = evaluateConnectorControlPlaneRequest({
    request: baseRequest,
    policy: {
      ...basePolicy,
      traceMode: "raw_encrypted_opt_in",
      rules: [{
        effect: "deny",
        providerIds: ["github"],
        riskTiers: ["write"],
        reason: "Write operations are paused.",
      }],
    },
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reasons.some((reason) => reason.code === "policy_denied"), true);
  assert.equal(decision.audit.rawTraceRequiresOptIn, true);
});

test("unknown cost blocks unless a scoped approval grant allows it", () => {
  const costRequest: ConnectorExecutionRequest = {
    ...baseRequest,
    expectedCost: undefined,
    now: "2026-05-15T12:00:00.000Z",
    operation: { ...baseRequest.operation, costRisk: true, riskTiers: ["write", "cost"] },
  };
  const budget = {
    id: "budget",
    unit: "requests",
    window: "day" as const,
    limit: 100,
    used: 0,
    providerId: "github",
    unknownCostBehavior: "block" as const,
  };

  const blocked = evaluateConnectorControlPlaneRequest({
    request: costRequest,
    policy: basePolicy,
    budgets: [budget],
  });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reasons.some((reason) => reason.code === "unknown_cost_blocked"), true);

  const allowed = evaluateConnectorControlPlaneRequest({
    request: costRequest,
    policy: basePolicy,
    budgets: [budget],
    approvalGrant: {
      id: "grant",
      expiresAt: "2026-05-15T12:10:00.000Z",
      providerIds: ["github"],
      capabilityIds: ["issues.create.record"],
      riskTiers: ["cost"],
      allowsUnknownCost: true,
    },
  });
  assert.equal(allowed.allowed, true);
});
