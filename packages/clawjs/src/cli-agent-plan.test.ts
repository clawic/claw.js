import assert from "node:assert/strict";
import { test } from "vitest";

import { createDelegationGraphForPlan } from "./cli-agent-plan.ts";
import type { AgentPlanRecord } from "./cli-agent-plan.ts";

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
