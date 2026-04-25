import test from "node:test";
import assert from "node:assert/strict";

import { DeterministicRuntimeAdapter } from "./runtime.ts";
import type { AgentWorker, DelegationNode } from "../shared/types.ts";

test("deterministic adapter executes without external services", async () => {
  const adapter = new DeterministicRuntimeAdapter();
  const node = {
    id: "node-1",
    graphId: "graph-1",
    parentNodeId: null,
    continuationOfNodeId: null,
    title: "Test node",
    objective: "Return deterministic output",
    agentType: "general",
    adapter: "deterministic",
    status: "ready",
    priority: 0,
    depth: 0,
    input: { deterministic: { result: { ok: true } } },
    result: null,
    errorMessage: null,
    maxAttempts: 3,
    attemptCount: 0,
    timeoutMs: 1000,
    leaseExpiresAt: null,
    leasedByWorkerId: null,
    nextRunAt: 0,
    createdAt: 0,
    updatedAt: 0,
  } satisfies DelegationNode;
  const worker = {
    id: "worker-1",
    adapter: "deterministic",
    label: "worker",
    capabilities: [],
    maxConcurrency: 1,
    online: true,
    lastSeenAt: 0,
    createdAt: 0,
    updatedAt: 0,
  } satisfies AgentWorker;

  assert.equal(adapter.canRun(node, worker), true);
  const result = await adapter.startRun({ node, worker });
  assert.equal(result.status, "succeeded");
  assert.deepEqual(result.output.result, { ok: true });
});
