import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildDelegationPlaneApp } from "../../src/server/app.ts";
import type { ClaimedRun, DelegationGraph, DelegationNode, DelegationTree } from "../../src/shared/types.ts";
import type { SemanticPlan } from "../../../packages/clawjs-core/src/semantic.ts";

const state: {
  tmpDir: string;
  baseUrl: string;
  stop?: () => Promise<void>;
} = {
  tmpDir: "",
  baseUrl: "",
};

async function json<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};
  assert.equal(response.ok, true, text);
  return parsed as T;
}

async function rawJson(url: string, method = "GET", body?: unknown): Promise<{ status: number; parsed: Record<string, unknown> }> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, parsed: text ? JSON.parse(text) as Record<string, unknown> : {} };
}

const codeChangeSemanticPlan: SemanticPlan = {
  schemaVersion: 1,
  intent: {
    id: "intent-code-change",
    summary: "Prepare a code change",
    requestedBy: "operator",
    constraints: ["do not publish without human approval"],
  },
  objects: [
    { id: "repo", kind: "repository", label: "Local repository", ref: "example.local/repo", metadata: {} },
    { id: "task", kind: "task", label: "Implementation task", metadata: {} },
    { id: "change", kind: "artifact", label: "Proposed code change", metadata: {} },
    { id: "result", kind: "run", label: "Validation result", metadata: {} },
  ],
  actions: [
    {
      id: "inspect",
      type: "inspect",
      label: "Inspect repository",
      objectIds: ["repo"],
      effectIds: ["read-local-files"],
      permissionIds: ["read-workspace"],
      risk: "low",
      requiresHumanApproval: false,
    },
    {
      id: "modify",
      type: "modify",
      label: "Prepare local code change",
      objectIds: ["change"],
      effectIds: ["write-local-files"],
      permissionIds: ["write-workspace"],
      risk: "medium",
      requiresHumanApproval: false,
    },
    {
      id: "validate",
      type: "validate",
      label: "Run tests",
      objectIds: ["result"],
      effectIds: ["execute-tests"],
      permissionIds: ["execute-local-command"],
      risk: "medium",
      requiresHumanApproval: false,
    },
    {
      id: "publish",
      type: "publish",
      label: "Publish changes",
      objectIds: ["repo"],
      effectIds: ["push-remote"],
      permissionIds: ["publish-approval"],
      risk: "high",
      requiresHumanApproval: true,
    },
  ],
  effects: [
    {
      id: "read-local-files",
      kind: "read",
      description: "Read local repository files for context",
      objectIds: ["repo"],
      reversible: true,
      risk: "low",
    },
    {
      id: "write-local-files",
      kind: "write",
      description: "Modify local files in the workspace",
      objectIds: ["change"],
      reversible: true,
      risk: "medium",
    },
    {
      id: "execute-tests",
      kind: "execute",
      description: "Execute local validation commands",
      objectIds: ["result"],
      reversible: false,
      risk: "medium",
    },
    {
      id: "push-remote",
      kind: "publication",
      description: "Publish committed changes to a remote repository",
      objectIds: ["repo"],
      reversible: false,
      risk: "high",
    },
  ],
  permissions: [
    {
      id: "read-workspace",
      capability: "workspace.read",
      scope: "local repository",
      duration: "single run",
      risk: "low",
      requiresHumanApproval: false,
    },
    {
      id: "write-workspace",
      capability: "workspace.write",
      scope: "local repository",
      duration: "single run",
      risk: "medium",
      requiresHumanApproval: false,
    },
    {
      id: "execute-local-command",
      capability: "command.execute",
      scope: "local validation",
      duration: "single run",
      costLimit: "no paid services",
      risk: "medium",
      requiresHumanApproval: false,
    },
    {
      id: "publish-approval",
      capability: "repository.publish",
      scope: "remote repository",
      duration: "one approval",
      risk: "high",
      requiresHumanApproval: true,
    },
  ],
  receipts: [],
  provenance: ["operator request", "simulated plan"],
};

async function createGraph(policy: Record<string, unknown> = {}) {
  const response = await json<{ graph: DelegationGraph; root: DelegationNode }>(`${state.baseUrl}/v1/graphs`, "POST", {
    objective: "Coordinate a durable delegation tree",
    creator: "e2e",
    policy: {
      leaseTimeoutMs: 30,
      runTimeoutMs: 200,
      globalConcurrency: 4,
      workerConcurrency: 1,
      maxAttempts: 3,
      ...policy,
    },
  });
  return response;
}

async function registerWorker(workerId: string) {
  return await json(`${state.baseUrl}/v1/workers/register`, "POST", {
    workerId,
    adapter: "deterministic",
    maxConcurrency: 1,
  });
}

async function claim(workerId: string): Promise<ClaimedRun | null> {
  const response = await json<{ claimed: ClaimedRun | null }>(`${state.baseUrl}/v1/workers/${workerId}/claim`, "POST", {});
  return response.claimed;
}

async function complete(runId: string, output: Record<string, unknown> = {}) {
  return await json(`${state.baseUrl}/v1/runs/${runId}/complete`, "POST", { output });
}

async function child(runId: string, title: string) {
  const response = await json<{ node: DelegationNode }>(`${state.baseUrl}/v1/runs/${runId}/children`, "POST", {
    title,
    objective: `Do ${title}`,
    payload: { deterministic: { result: title } },
  });
  return response.node;
}

async function tick() {
  return await json(`${state.baseUrl}/v1/scheduler/tick`, "POST", {});
}

async function tree(graphId: string): Promise<DelegationTree> {
  return await json(`${state.baseUrl}/v1/graphs/${graphId}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("delegation-plane backend e2e", () => {
  beforeEach(async () => {
    state.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "delegation-plane-e2e-"));
    const built = await buildDelegationPlaneApp({
      config: {
        host: "127.0.0.1",
        port: 0,
        dataDir: path.join(state.tmpDir, "data"),
        databaseFile: path.join(state.tmpDir, "data", "runtime.sqlite"),
        startScheduler: false,
      },
    });
    const address = await built.app.listen({ host: "127.0.0.1", port: 0 });
    state.baseUrl = address.replace(/\/$/, "");
    state.stop = async () => {
      await built.app.close();
    };
  });

  afterEach(async () => {
    await state.stop?.();
  });

  test("fan-out children unblock a durable continuation", async () => {
    const { graph } = await createGraph();
    await registerWorker("worker-a");
    const root = await claim("worker-a");
    assert.ok(root);
    await child(root.run.id, "research");
    await child(root.run.id, "implementation");

    let snapshot = await tree(graph.id);
    assert.equal(snapshot.nodes.find((node) => node.id === graph.rootNodeId)?.status, "waiting");
    assert.equal(snapshot.nodes.filter((node) => node.parentNodeId === graph.rootNodeId).length, 2);

    const first = await claim("worker-a");
    assert.ok(first);
    await complete(first.run.id, { result: first.node.title });
    const second = await claim("worker-a");
    assert.ok(second);
    await complete(second.run.id, { result: second.node.title });
    await tick();

    snapshot = await tree(graph.id);
    const continuation = snapshot.nodes.find((node) => node.continuationOfNodeId === graph.rootNodeId);
    assert.ok(continuation);
    assert.equal(continuation.status, "ready");

    const continued = await claim("worker-a");
    assert.equal(continued?.node.id, continuation.id);
    await complete(continued.run.id, { final: true });
    snapshot = await tree(graph.id);
    assert.equal(snapshot.graph.status, "succeeded");
  });

  test("semantic plans persist on delegation graphs and root nodes", async () => {
    const created = await json<{ graph: DelegationGraph; root: DelegationNode }>(`${state.baseUrl}/v1/graphs`, "POST", {
      objective: "Prepare a code change",
      creator: "e2e",
      semanticPlan: codeChangeSemanticPlan,
      policy: {
        leaseTimeoutMs: 30,
        runTimeoutMs: 200,
      },
    });

    assert.equal(created.graph.semanticPlan?.intent.summary, "Prepare a code change");
    assert.equal(created.root.semanticPlan?.actions.find((action) => action.id === "publish")?.requiresHumanApproval, true);

    const snapshot = await tree(created.graph.id);
    const root = snapshot.nodes.find((node) => node.id === snapshot.graph.rootNodeId);
    assert.equal(snapshot.graph.semanticPlan?.effects.find((effect) => effect.id === "write-local-files")?.description, "Modify local files in the workspace");
    assert.equal(root?.semanticPlan?.permissions.find((permission) => permission.id === "execute-local-command")?.risk, "medium");
  });

  test("legacy graphs without semantic plans remain claimable and completable", async () => {
    const { graph, root } = await createGraph();
    assert.equal(graph.semanticPlan, null);
    assert.equal(root.semanticPlan, null);

    await registerWorker("worker-a");
    const claimed = await claim("worker-a");
    assert.ok(claimed);
    assert.equal(claimed.node.semanticPlan, null);
    await complete(claimed.run.id, { ok: true });

    const snapshot = await tree(graph.id);
    assert.equal(snapshot.graph.status, "succeeded");
  });

  test("invalid semantic plans are rejected before persistence", async () => {
    const missingActionType = structuredClone(codeChangeSemanticPlan) as Record<string, unknown>;
    missingActionType.actions = [{ id: "bad-action", label: "Missing type", risk: "low" }];
    const actionResponse = await rawJson(`${state.baseUrl}/v1/graphs`, "POST", {
      objective: "Prepare a code change",
      semanticPlan: missingActionType,
    });
    assert.equal(actionResponse.status, 400);

    const missingEffectDescription = structuredClone(codeChangeSemanticPlan) as Record<string, unknown>;
    missingEffectDescription.effects = [{ id: "bad-effect", kind: "read", risk: "low" }];
    const effectResponse = await rawJson(`${state.baseUrl}/v1/graphs`, "POST", {
      objective: "Prepare a code change",
      semanticPlan: missingEffectDescription,
    });
    assert.equal(effectResponse.status, 400);

    const malformedPermission = structuredClone(codeChangeSemanticPlan) as Record<string, unknown>;
    malformedPermission.permissions = [{ id: "bad-permission", capability: "workspace.read", risk: "not-a-risk" }];
    const permissionResponse = await rawJson(`${state.baseUrl}/v1/graphs`, "POST", {
      objective: "Prepare a code change",
      semanticPlan: malformedPermission,
    });
    assert.equal(permissionResponse.status, 400);
  });

  test("expired leases return work to the queue for another worker", async () => {
    const { graph } = await createGraph();
    await registerWorker("worker-a");
    await registerWorker("worker-b");
    const claimed = await claim("worker-a");
    assert.ok(claimed);
    await sleep(320);
    await tick();
    await sleep(300);
    const reclaimed = await claim("worker-b");
    assert.ok(reclaimed);
    assert.equal(reclaimed.node.id, graph.rootNodeId);
    assert.equal(reclaimed.run.attempt, 2);
  });

  test("retryable and non-retryable failures follow policy", async () => {
    await createGraph({ maxAttempts: 2 });
    await registerWorker("worker-a");
    const first = await claim("worker-a");
    assert.ok(first);
    await json(`${state.baseUrl}/v1/runs/${first.run.id}/fail`, "POST", { errorMessage: "retry me", retryable: true });
    await sleep(300);
    const second = await claim("worker-a");
    assert.ok(second);
    assert.equal(second.run.attempt, 2);
    await json(`${state.baseUrl}/v1/runs/${second.run.id}/fail`, "POST", { errorMessage: "stop", retryable: false });
    const snapshot = await tree(second.graph.id);
    assert.equal(snapshot.graph.status, "failed");
    assert.equal(snapshot.nodes[0]?.status, "failed");
  });

  test("deep delegation chain persists without live parent waits", async () => {
    const { graph } = await createGraph({ maxDepthWarning: 100 });
    await registerWorker("worker-a");

    for (let index = 0; index < 12; index += 1) {
      const current = await claim("worker-a");
      assert.ok(current);
      await child(current.run.id, `level-${index}`);
      const after = await tree(graph.id);
      assert.equal(after.runs.filter((run) => run.status === "claimed" || run.status === "running").length, 0);
    }

    const leaf = await claim("worker-a");
    assert.ok(leaf);
    await complete(leaf.run.id, { leaf: true });

    for (let index = 0; index < 20; index += 1) {
      await tick();
      const next = await claim("worker-a");
      if (!next) break;
      await complete(next.run.id, { continued: next.node.continuationOfNodeId });
    }

    const snapshot = await tree(graph.id);
    assert.equal(snapshot.graph.status, "succeeded");
    assert.equal(snapshot.nodes.length >= 25, true);
    assert.equal(snapshot.runs.some((run) => run.status === "claimed" || run.status === "running"), false);
  });
});
