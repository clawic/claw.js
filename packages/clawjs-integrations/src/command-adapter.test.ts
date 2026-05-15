import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  assertConnectorCommandAdapterControlPlane,
  buildConnectorCommandAdapterPlan,
  type ConnectorCommandAdapterDefinition,
} from "./command-adapter.ts";

describe("external CLI command adapters", () => {
  it("builds a declarative cli runtime plan for registered adapters", () => {
    assert.deepEqual(buildConnectorCommandAdapterPlan(fixtureAdapter()), {
      adapterId: "github.cli.issue-create",
      providerId: "github",
      command: "gh",
      args: ["issue", "create"],
      capabilityIds: ["issues.create.record"],
      runtimeKind: "cli",
    });
  });

  it("blocks unregistered, unsupported, or evidence-free command adapters", () => {
    assert.throws(
      () => buildConnectorCommandAdapterPlan({ ...fixtureAdapter(), support: "external_pending" }),
      /external_pending/,
    );
    assert.throws(
      () => buildConnectorCommandAdapterPlan({ ...fixtureAdapter(), evidence: [] }),
      /requires local evidence/,
    );
  });

  it("requires connector control plane approval before an external CLI can execute", () => {
    assert.throws(
      () => assertConnectorCommandAdapterControlPlane({ adapter: fixtureAdapter() }),
      /requires connector control plane approval/,
    );
  });

  it("honors deny-wins policy for external CLI adapters", () => {
    assert.throws(
      () => assertConnectorCommandAdapterControlPlane({
        adapter: fixtureAdapter(),
        controlPlane: {
          ...fixtureControlPlane(),
          policy: {
            ...fixtureControlPlane().policy,
            rules: [{
              effect: "deny",
              providerIds: ["github"],
              capabilityIds: ["issues.create.record"],
              reason: "GitHub CLI writes are paused.",
            }],
          },
        },
      }),
      /policy_denied/,
    );
  });

  it("allows an external CLI adapter only with matching policy, grant, and credential binding", () => {
    const decision = assertConnectorCommandAdapterControlPlane({
      adapter: fixtureAdapter(),
      controlPlane: fixtureControlPlane(),
    });

    assert.equal(decision.allowed, true);
    assert.equal(decision.pipeline.includes("runtime"), true);
  });
});

function fixtureAdapter(): ConnectorCommandAdapterDefinition {
  return {
    id: "github.cli.issue-create",
    providerId: "github",
    displayName: "GitHub CLI issue create",
    command: "gh",
    args: ["issue", "create"],
    capabilityIds: ["issues.create.record"],
    support: "supported",
    riskTiers: ["write"],
    credentialRequired: true,
    requiresApproval: true,
    evidence: ["packages/clawjs-integrations/src/command-adapter.test.ts"],
  };
}

function fixtureControlPlane() {
  return {
    capabilityId: "issues.create.record",
    now: "2026-05-15T12:00:00.000Z",
    context: {
      actorId: "agent_test",
      purpose: "fixture cli adapter",
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
    credentialBinding: {
      id: "binding_github_cli",
      providerId: "github",
      secretRef: "secret://github/cli",
      credentialKind: "oauth_token" as const,
      capabilityIds: ["issues.create.record"],
      enabled: true,
    },
    approvalGrant: {
      id: "grant_cli",
      expiresAt: "2026-05-15T12:10:00.000Z",
      providerIds: ["github"],
      capabilityIds: ["issues.create.record"],
      riskTiers: ["write"],
    },
  };
}
