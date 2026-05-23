import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { runConnectorOperation } from "./operation-runner.ts";
import type { ConnectorCatalog } from "./types.ts";

describe("connector runtime control plane", () => {
  it("fails closed before runtime execution when control plane approval is missing", async () => {
    let executed = false;
    await assert.rejects(
      runConnectorOperation({
        catalog: fixtureCatalog({ costRisk: false }),
        operationId: "image_service.action.edit-image",
        dryRun: false,
        input: { values: { imageId: "img_1" } },
        executor: {
          async execute() {
            executed = true;
            return { ok: true };
          },
        },
      }),
      /requires connector control plane approval/,
    );
    assert.equal(executed, false);
  });

  it("fails closed when a deny rule matches", async () => {
    await assert.rejects(
      runConnectorOperation({
        catalog: fixtureCatalog({ costRisk: false }),
        operationId: "image_service.action.edit-image",
        dryRun: false,
        input: { values: { imageId: "img_1" } },
        controlPlane: {
          ...fixtureControlPlane(),
          policy: {
            ...fixtureControlPlane().policy,
            rules: [{
              effect: "deny",
              providerIds: ["image_service"],
              capabilityIds: ["media.image.edit"],
              reason: "Image editing is paused.",
            }],
          },
        },
        executor: {
          async execute() {
            throw new Error("executor must not start");
          },
        },
      }),
      /policy_denied/,
    );
  });

  it("blocks unknown cost until a scoped grant allows it", async () => {
    await assert.rejects(
      runConnectorOperation({
        catalog: fixtureCatalog({ costRisk: true }),
        operationId: "image_service.action.edit-image",
        dryRun: false,
        input: { values: { imageId: "img_1" } },
        controlPlane: {
          ...fixtureControlPlane(),
          budgets: [{
            id: "daily_images",
            providerId: "image_service",
            capabilityId: "media.image.edit",
            unit: "images",
            window: "day",
            limit: 10,
            used: 1,
            unknownCostBehavior: "block",
          }],
        },
        executor: {
          async execute() {
            throw new Error("executor must not start");
          },
        },
      }),
      /unknown_cost_blocked/,
    );

    const result = await runConnectorOperation({
      catalog: fixtureCatalog({ costRisk: true }),
      operationId: "image_service.action.edit-image",
      dryRun: false,
      input: { values: { imageId: "img_1" } },
      controlPlane: {
        ...fixtureControlPlane(),
        budgets: [{
          id: "daily_images",
          providerId: "image_service",
          capabilityId: "media.image.edit",
          unit: "images",
          window: "day",
          limit: 10,
          used: 1,
          unknownCostBehavior: "block",
        }],
        approvalGrant: {
          id: "grant_unknown_cost",
          expiresAt: "2026-05-15T12:10:00.000Z",
          providerIds: ["image_service"],
          capabilityIds: ["media.image.edit"],
          riskTiers: ["cost"],
          allowsUnknownCost: true,
        },
      },
      executor: {
        async execute() {
          return { ok: true };
        },
      },
    });

    assert.equal(result.status, "executed");
    assert.deepEqual(result.controlPlaneDecision, {
      allowed: true,
      auditTraceMode: "redacted",
    });
  });

  it("requires matching network proof for declared egress policy", async () => {
    await assert.rejects(
      runConnectorOperation({
        catalog: fixtureCatalog({ costRisk: false }),
        operationId: "image_service.action.edit-image",
        dryRun: false,
        input: { values: { imageId: "img_1" } },
        controlPlane: {
          ...fixtureControlPlane(),
          networkPolicyId: "paid-ai-egress",
          requestedHost: "api.image.example",
          networkPolicies: [{
            id: "paid-ai-egress",
            required: true,
            egressProfileId: "egress_paid_ai",
            vpnProfileId: "vpn_paid_ai",
            allowedHosts: ["api.image.example"],
          }],
        },
        executor: {
          async execute() {
            throw new Error("executor must not start");
          },
        },
      }),
      /network_proof_required/,
    );

    const result = await runConnectorOperation({
      catalog: fixtureCatalog({ costRisk: false }),
      operationId: "image_service.action.edit-image",
      dryRun: false,
      input: { values: { imageId: "img_1" } },
      controlPlane: {
        ...fixtureControlPlane(),
        networkPolicyId: "paid-ai-egress",
        requestedHost: "api.image.example",
        networkPolicies: [{
          id: "paid-ai-egress",
          required: true,
          egressProfileId: "egress_paid_ai",
          vpnProfileId: "vpn_paid_ai",
          allowedHosts: ["api.image.example"],
        }],
        networkProof: {
          policyId: "paid-ai-egress",
          egressProfileId: "egress_paid_ai",
          vpnProfileId: "vpn_paid_ai",
          networkEvaluation: {
            decision: "allow",
            matchedRuleIds: [],
          },
        },
      },
      executor: {
        async execute() {
          return { ok: true };
        },
      },
    });

    assert.equal(result.status, "executed");
  });
});

function fixtureCatalog(options: { costRisk: boolean }): ConnectorCatalog {
  return {
    version: 1,
    apps: [{
      id: "image_service",
      name: "Image Service",
      authFieldNames: [],
      fields: [],
      operations: [{
        id: "image_service.action.edit-image",
        appId: "image_service",
        kind: "action",
        name: "Edit Image",
        fields: [{ name: "imageId", type: "string", optional: false }],
        authFieldNames: [],
        support: {
          state: "supported",
          reason: "Covered by control-plane fixture tests.",
        },
        executionPolicy: {
          readOnly: false,
          requiresAuth: false,
          requiresHostApproval: false,
          destructive: false,
          costRisk: options.costRisk,
          dryRunSupported: true,
          auditRequired: true,
        },
        runtime: {
          hasRun: true,
          hasHooks: false,
          hasAdditionalProps: false,
          hasMethods: false,
        },
      }],
    }],
  };
}

function fixtureControlPlane() {
  return {
    capabilityId: "media.image.edit",
    now: "2026-05-15T12:00:00.000Z",
    context: {
      actorId: "agent_test",
      purpose: "fixture image edit",
      requestId: "req_test",
    },
    policy: {
      id: "fixture_policy",
      enabled: true,
      defaultEffect: "allow" as const,
      requireContext: true,
      blockUnsupported: true,
      blockMissingCredentialBinding: true,
      rules: [],
      traceMode: "redacted" as const,
    },
  };
}
