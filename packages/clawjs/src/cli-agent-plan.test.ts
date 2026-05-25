import assert from "node:assert/strict";
import { test } from "vitest";

import { createDelegationGraphForPlan } from "./cli-agent-plan.ts";
import type { AgentPlanRecord } from "./cli-agent-plan.ts";
import { CliHandledError } from "./cli-errors.ts";

test("createDelegationGraphForPlan retries transient delegation plane failures", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = (async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("delegation plane not ready");
    return new Response(JSON.stringify({ graph: { id: "graph_retry_ok" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const graphId = await createDelegationGraphForPlan({
      schemaVersion: 1,
      id: "plan_retry",
      objective: "Retry graph creation",
      status: "approved",
      creatorAgentId: "planner",
      tags: [],
      semanticPlan: { version: 1, steps: [] },
      policyDecision: "auto_run",
      policyReason: "test",
      createdAt: "2026-05-14T00:00:00.000Z",
      updatedAt: "2026-05-14T00:00:00.000Z",
    } as AgentPlanRecord, { "delegation-url": "http://127.0.0.1:4520" });

    assert.equal(graphId, "graph_retry_ok");
    assert.equal(attempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createDelegationGraphForPlan rejects unsupported or credentialed delegation URLs before fetch", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    throw new Error("fetch should not be called");
  }) as typeof fetch;

  const plan = {
    schemaVersion: 1,
    id: "plan_invalid_url",
    objective: "Reject invalid delegation URL",
    status: "approved",
    creatorAgentId: "planner",
    tags: [],
    semanticPlan: { version: 1, steps: [] },
    policyDecision: "auto_run",
    policyReason: "test",
    createdAt: "2026-05-14T00:00:00.000Z",
    updatedAt: "2026-05-14T00:00:00.000Z",
  } as AgentPlanRecord;

  try {
    for (const delegationUrl of ["file:///tmp/delegation.sock", "http://user:pass@127.0.0.1:4520"]) {
      await assert.rejects(
        () => createDelegationGraphForPlan(plan, { "delegation-url": delegationUrl }),
        (error) => {
          assert.equal(error instanceof CliHandledError, true);
          assert.equal((error as CliHandledError).code, "invalid_delegation_url");
          return true;
        },
      );
    }
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
