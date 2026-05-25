import { test } from "vitest";
import assert from "node:assert/strict";

import {
  clawCliCommandRegistry,
  connectorExecutionPipeline,
  createConnectorCapability,
  evaluateNetworkPolicy,
  evaluateConnectorControlPlaneRequest,
  explainConnectorContextChoice,
  isConnectorCapabilityId,
  resolveClawCliCommand,
  splitConnectorCapabilityId,
  type ConnectorProvider,
  type ConnectorExecutionRequest,
  type ConnectorPolicy,
  type NetworkRule,
} from "./catalogs.ts";

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

test("connector control plane fails closed when the policy is disabled", () => {
  const decision = evaluateConnectorControlPlaneRequest({
    request: baseRequest,
    policy: {
      ...basePolicy,
      enabled: false,
    },
  });

  assert.equal(decision.allowed, false);
  assert.deepEqual(decision.reasons.map((reason) => reason.code), ["policy_disabled"]);
  assert.deepEqual(decision.audit.reasonCodes, ["policy_disabled"]);
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

test("connector network proof must derive from Network Control Plane evaluation", () => {
  const request: ConnectorExecutionRequest = {
    ...baseRequest,
    requestedHost: "api.github.com",
    operation: {
      ...baseRequest.operation,
      networkPolicyId: "provider-network",
    },
  };
  const networkPolicies = [{
    id: "provider-network",
    required: true,
    networkPolicyProfileId: "default",
    expectedMatchedRuleIds: ["network.rule.github-api"],
    allowedHosts: ["api.github.com"],
    egressProfileId: "legacy-office",
  }];

  const legacyProjectionOnly = evaluateConnectorControlPlaneRequest({
    request,
    policy: basePolicy,
    networkPolicies,
    networkProof: {
      policyId: "provider-network",
      host: "api.github.com",
      egressProfileId: "legacy-office",
    },
  });

  assert.equal(legacyProjectionOnly.allowed, false);
  assert.equal(legacyProjectionOnly.reasons.some((reason) => reason.code === "network_proof_mismatch"), true);

  const networkRules: NetworkRule[] = [{
    schemaVersion: 1,
    id: "network.rule.github-api",
    action: "allow",
    subject: { kind: "connector", id: "github" },
    endpoint: { kind: "provider_endpoint", value: "api.github.com", protocol: "https" },
    networkPolicyProfileId: "default",
    priority: 100,
    enabled: true,
    lifetime: "permanent",
    ruleSteward: { kind: "system", id: "claw.network" },
    source: "system_default",
    createdAt: "2026-05-21T00:00:00.000Z",
    updatedAt: "2026-05-21T00:00:00.000Z",
  }];
  const networkEvaluation = evaluateNetworkPolicy({
    subject: { kind: "connector", id: "github" },
    endpoint: { kind: "provider_endpoint", value: "api.github.com", protocol: "https" },
    rules: networkRules,
  });

  const allowed = evaluateConnectorControlPlaneRequest({
    request,
    policy: basePolicy,
    networkPolicies,
    networkProof: {
      policyId: "provider-network",
      host: "api.github.com",
      networkEvaluation,
    },
  });

  assert.equal(allowed.allowed, true);
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

test("unknown cost blocks unless a scoped connector grant allows it", () => {
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
    scopedGrant: {
      id: "grant",
      expiresAt: "2026-05-15T12:10:00.000Z",
      approvalEvidenceId: "approval-cost-review",
      providerIds: ["github"],
      capabilityIds: ["issues.create.record"],
      riskTiers: ["cost"],
      allowsUnknownCost: true,
    },
  });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.audit.scopedGrantId, "grant");
  assert.equal(allowed.audit.approvalEvidenceId, "approval-cost-review");
  assert.equal(allowed.audit.approvalGrantId, "grant");
});

test("connector control plane fails closed when governed context is required but not approved", () => {
  const operation: ConnectorExecutionRequest["operation"] = {
    ...baseRequest.operation,
    id: "apple.upload",
    providerId: "apple",
    contextRequirements: [
      { kind: "team", fields: ["team_id"] },
      { kind: "app", fields: ["bundle_id", "sku"] },
    ],
  };
  const request: ConnectorExecutionRequest = {
    ...baseRequest,
    provider: { id: "apple", displayName: "Apple App Store Connect", trustTier: "third_party", enabled: true },
    operation,
    governedContext: explainConnectorContextChoice({
      providerId: "apple",
      operationId: "apple.upload",
      requirements: operation.contextRequirements ?? [],
      candidates: [{
        id: "apple_team_wrong",
        providerId: "apple",
        kind: "team",
        displayName: "Wrong team",
        state: "blocked",
        fields: { team_id: { value: "TEAM-WRONG", sensitivity: "private" } },
      }],
    }),
  };

  const decision = evaluateConnectorControlPlaneRequest({
    request,
    policy: basePolicy,
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reasons.some((reason) => reason.code === "context_object_blocked"), true);
  assert.equal(decision.reasons.some((reason) => reason.code === "context_record_missing"), true);
  assert.equal(decision.audit.providerId, "apple");
  assert.equal(decision.audit.operationId, "apple.upload");
  assert.equal(decision.audit.reasonCodes?.includes("context_object_blocked"), true);
});

test("connector control plane rejects governed context decisions from a different provider operation", () => {
  const operation: ConnectorExecutionRequest["operation"] = {
    ...baseRequest.operation,
    id: "apple.upload",
    providerId: "apple",
    capabilityIds: ["app.upload.release"],
    contextRequirements: [
      { kind: "team", fields: ["team_id"] },
      { kind: "app", fields: ["bundle_id", "sku"] },
    ],
  };
  const request: ConnectorExecutionRequest = {
    ...baseRequest,
    provider: { id: "apple", displayName: "Apple App Store Connect", trustTier: "third_party", enabled: true },
    operation,
    capabilityId: "app.upload.release",
    credentialBinding: {
      id: "cred-apple",
      providerId: "apple",
      secretRef: "secret://apple/app-store-connect",
      credentialKind: "api_key",
      operationIds: ["apple.upload"],
      capabilityIds: ["app.upload.release"],
      enabled: true,
    },
    governedContext: explainConnectorContextChoice({
      providerId: "revenuecat",
      operationId: "revenuecat.project_configuration.read",
      requirements: [{ kind: "key", fields: ["api_version", "api_key"] }],
      candidates: [{
        id: "revenuecat_api_v2",
        providerId: "revenuecat",
        kind: "key",
        displayName: "RevenueCat API v2",
        state: "active",
        fields: {
          api_version: { value: "v2", sensitivity: "public" },
          api_key: { sensitivity: "secret_ref", secretRef: "secret://revenuecat/v2" },
        },
      }],
    }),
  };

  const decision = evaluateConnectorControlPlaneRequest({
    request,
    policy: basePolicy,
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reasons.some((reason) => reason.code === "context_decision_mismatch"), true);
  assert.equal(decision.audit.reasonCodes?.includes("context_decision_mismatch"), true);
});

test("connector control plane audit declares governed context refs, secret refs, defaults, fallback rules, and approvals", () => {
  const operation: ConnectorExecutionRequest["operation"] = {
    ...baseRequest.operation,
    id: "revenuecat.project_configuration.read",
    providerId: "revenuecat",
    credentialRequired: true,
    requiresApproval: true,
    contextRequirements: [{ kind: "key", fields: ["api_version", "api_key"] }],
  };
  const request: ConnectorExecutionRequest = {
    ...baseRequest,
    provider: { id: "revenuecat", displayName: "RevenueCat", trustTier: "third_party", enabled: true },
    operation,
    capabilityId: "project.read.configuration",
    now: "2026-05-18T10:00:00.000Z",
    credentialBinding: {
      id: "cred-revenuecat-v1",
      providerId: "revenuecat",
      secretRef: "secret://revenuecat/v1",
      credentialKind: "api_key",
      operationIds: ["revenuecat.project_configuration.read"],
      capabilityIds: ["project.read.configuration"],
      enabled: true,
    },
    governedContext: explainConnectorContextChoice({
      providerId: "revenuecat",
      operationId: "revenuecat.project_configuration.read",
      requirements: operation.contextRequirements ?? [],
      defaultRefs: ["revenuecat_api_v2"],
      fallbackRules: [{
        id: "revenuecat_v2_to_v1",
        fromRef: "revenuecat_api_v2",
        toRef: "revenuecat_api_v1",
        condition: "v2 paused",
        guidance: "Use v1 only while v2 is paused.",
      }],
      candidates: [
        {
          id: "revenuecat_api_v2",
          providerId: "revenuecat",
          kind: "key",
          displayName: "RevenueCat API v2",
          state: "paused",
          fields: {
            api_version: { value: "v2", sensitivity: "public" },
            api_key: { sensitivity: "secret_ref", secretRef: "secret://revenuecat/v2" },
          },
        },
        {
          id: "revenuecat_api_v1",
          providerId: "revenuecat",
          kind: "key",
          displayName: "RevenueCat API v1",
          state: "active",
          fields: {
            api_version: { value: "v1", sensitivity: "public" },
            api_key: { sensitivity: "secret_ref", secretRef: "secret://revenuecat/v1" },
          },
        },
      ],
    }),
  };

  const decision = evaluateConnectorControlPlaneRequest({
    request,
    policy: basePolicy,
    scopedGrant: {
      id: "grant-release-read",
      expiresAt: "2026-05-18T10:10:00.000Z",
      approvalEvidenceId: "approval-release-read",
      providerIds: ["revenuecat"],
      operationIds: ["revenuecat.project_configuration.read"],
      capabilityIds: ["project.read.configuration"],
      riskTiers: ["write"],
    },
  });

  assert.equal(decision.allowed, true);
  assert.deepEqual(decision.audit.contextRefs, ["revenuecat_api_v1"]);
  assert.deepEqual(decision.audit.contextFieldRefs, ["revenuecat_api_v1.api_version", "revenuecat_api_v1.api_key"]);
  assert.deepEqual(decision.audit.secretRefs, ["secret://revenuecat/v1"]);
  assert.deepEqual(decision.audit.defaultContextRefs, ["revenuecat_api_v2"]);
  assert.deepEqual(decision.audit.appliedRuleIds, ["revenuecat_v2_to_v1"]);
  assert.equal(decision.audit.scopedGrantId, "grant-release-read");
  assert.equal(decision.audit.approvalEvidenceId, "approval-release-read");
  assert.equal(decision.audit.approvalGrantId, "grant-release-read");
  assert.deepEqual(decision.audit.reasonCodes, []);
});

test("connector control plane blocks regulated external actions through connector metadata", () => {
  const operation: ConnectorExecutionRequest["operation"] = {
    ...baseRequest.operation,
    id: "health.records.export",
    providerId: "ehr",
    capabilityIds: ["health.export.records"],
    riskTiers: ["write"],
    regulatedDomains: ["health"],
    decisionEffects: ["external_action"],
    requiresSensitiveExportReview: true,
    thirdPartyDisclosure: true,
  };
  const request: ConnectorExecutionRequest = {
    ...baseRequest,
    provider: {
      id: "ehr",
      displayName: "Example EHR",
      trustTier: "third_party",
      enabled: true,
      capabilities: [
        createConnectorCapability("health.export.records", {
          riskTiers: ["write"],
          regulatedDomains: ["health"],
          decisionEffects: ["external_action"],
          requiresSensitiveExportReview: true,
          thirdPartyDisclosure: true,
        }),
      ],
    },
    operation,
    capabilityId: "health.export.records",
    now: "2026-05-18T10:00:00.000Z",
    credentialBinding: {
      id: "cred-ehr",
      providerId: "ehr",
      secretRef: "secret://ehr/token",
      credentialKind: "oauth_token",
      operationIds: ["health.records.export"],
      capabilityIds: ["health.export.records"],
      enabled: true,
    },
  };

  const decision = evaluateConnectorControlPlaneRequest({
    request,
    policy: basePolicy,
    approvalGrant: {
      id: "host-approval",
      expiresAt: "2026-05-18T10:10:00.000Z",
      providerIds: ["ehr"],
      operationIds: ["health.records.export"],
      capabilityIds: ["health.export.records"],
      riskTiers: ["write"],
      allowsUnknownCost: true,
      allowsNetworkPolicyBypass: true,
    },
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reasons.some((reason) => reason.code === "regulated_safety_blocked"), true);
  assert.equal(decision.reasons.some((reason) => reason.message.includes("external_review_required")), true);
  assert.equal(decision.reasons.some((reason) => reason.message.includes("sensitive_export_review_required")), true);
  assert.equal(decision.reasons.some((reason) => reason.message.includes("remote_or_provider_opt_in_required")), true);
  assert.equal(decision.audit.reasonCodes?.includes("regulated_safety_blocked"), true);
});
