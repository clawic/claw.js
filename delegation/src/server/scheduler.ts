const STABLE_EVENT_TYPES = {
  nodeHeartbeat: "node.heartbeat",
  runLogged: "run.logged",
  nodeWaiting: "node.waiting",
  nodeSucceeded: "node.succeeded",
  nodeRetryScheduled: "node.retry_scheduled",
  nodeFailed: "node.failed",
  nodeBlocked: "node.blocked",
  nodeCancelled: "node.cancelled",
  nodeContinuationCreated: "node.continuation_created",
} as const;
import type {
  AgentRun,
  ClaimedRun,
  DelegationNode,
  DependencyKind,
  RunLog,
} from "../shared/types.ts";
import type { SemanticPlan } from "../../../packages/clawjs-core/src/semantic.ts";
import { DelegationPlaneDatabase } from "./db.ts";

function now(): number {
  return Date.now();
}

function isTerminal(status: DelegationNode["status"]): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

function backoffMs(attempt: number): number {
  return Math.min(30_000, 250 * 2 ** Math.max(0, attempt - 1));
}

export class DelegationScheduler {
  constructor(readonly db: DelegationPlaneDatabase) {
  }

  tick(): { expired: number; continuations: number; finalizedGraphs: number } {
    const expired = this.expireLeases();
    const continuations = this.createContinuations();
    const finalizedGraphs = this.finalizeGraphs();
    return { expired, continuations, finalizedGraphs };
  }

  claim(workerId: string): ClaimedRun | null {
    this.tick();
    return this.db.claimReadyNode(workerId);
  }

  heartbeatRun(runId: string): AgentRun {
    const run = this.requireRun(runId);
    const graph = this.db.getGraph(run.graphId);
    if (!graph) throw new Error(`Graph ${run.graphId} not found`);
    const leaseExpiresAt = now() + graph.policy.leaseTimeoutMs;
    const updated = this.db.updateRun(runId, {
      status: run.status === "claimed" ? "running" : run.status,
      leaseExpiresAt,
      startedAt: run.startedAt ?? now(),
    });
    this.db.updateNode(run.nodeId, {
      status: "running",
      leaseExpiresAt,
      leasedByWorkerId: run.workerId,
    });
    this.db.markWorkerSeen(run.workerId);
    this.db.appendEvent({
      graphId: run.graphId,
      nodeId: run.nodeId,
      runId,
      workerId: run.workerId,
      type: STABLE_EVENT_TYPES.nodeHeartbeat,
      message: "Run heartbeat received.",
      data: { leaseExpiresAt },
    });
    return updated;
  }

  appendLog(runId: string, stream: RunLog["stream"], line: string): RunLog {
    const run = this.requireRun(runId);
    const log = this.db.appendLog({ runId, stream, line });
    this.db.appendEvent({
      graphId: run.graphId,
      nodeId: run.nodeId,
      runId,
      workerId: run.workerId,
      type: STABLE_EVENT_TYPES.runLogged,
      message: line,
      data: { stream },
    });
    return log;
  }

  createChild(input: {
    runId: string;
    title: string;
    objective: string;
    agentType?: string;
    adapter?: string;
    dependencyKind?: DependencyKind;
    optional?: boolean;
    priority?: number;
    payload?: Record<string, unknown>;
    semanticPlan?: SemanticPlan | null;
  }): DelegationNode {
    const run = this.requireRun(input.runId);
    const parent = this.requireNode(run.nodeId);
    const graph = this.db.getGraph(run.graphId);
    if (!graph) throw new Error(`Graph ${run.graphId} not found`);
    const child = this.db.createNode({
      graphId: run.graphId,
      parentNodeId: parent.id,
      title: input.title,
      objective: input.objective,
      agentType: input.agentType ?? parent.agentType,
      adapter: input.adapter ?? parent.adapter,
      input: input.payload ?? {},
      semanticPlan: input.semanticPlan ?? null,
      priority: input.priority ?? parent.priority,
      depth: parent.depth + 1,
      maxAttempts: graph.policy.maxAttempts,
      timeoutMs: graph.policy.runTimeoutMs,
    });
    const kind = input.dependencyKind ?? "blocks_parent";
    this.db.createEdge({
      graphId: run.graphId,
      fromNodeId: parent.id,
      toNodeId: child.id,
      kind,
      optional: input.optional,
    });
    if (kind === "blocks_parent") {
      this.db.updateRun(run.id, {
        status: "succeeded",
        output: { delegated: true, childNodeId: child.id },
        finishedAt: now(),
      });
      this.db.updateNode(parent.id, {
        status: "waiting",
        result: null,
        leaseExpiresAt: null,
        leasedByWorkerId: null,
      });
      this.db.appendEvent({
        graphId: run.graphId,
        nodeId: parent.id,
        runId: run.id,
        workerId: run.workerId,
        type: STABLE_EVENT_TYPES.nodeWaiting,
        message: "Parent node is waiting for blocking children.",
        data: { childNodeId: child.id },
      });
    }
    return child;
  }

  completeRun(runId: string, output: Record<string, unknown> = {}): AgentRun {
    const run = this.requireRun(runId);
    const timestamp = now();
    const updated = this.db.updateRun(runId, {
      status: "succeeded",
      output,
      startedAt: run.startedAt ?? run.createdAt,
      finishedAt: timestamp,
    });
    this.db.updateNode(run.nodeId, {
      status: "succeeded",
      result: output,
      errorMessage: null,
      leaseExpiresAt: null,
      leasedByWorkerId: null,
    });
    this.db.appendEvent({
      graphId: run.graphId,
      nodeId: run.nodeId,
      runId,
      workerId: run.workerId,
      type: STABLE_EVENT_TYPES.nodeSucceeded,
      message: "Node completed successfully.",
      data: output,
    });
    this.tick();
    return updated;
  }

  failRun(runId: string, input: { errorMessage: string; retryable?: boolean }): AgentRun {
    const run = this.requireRun(runId);
    const node = this.requireNode(run.nodeId);
    const timestamp = now();
    const retryable = input.retryable !== false;
    const canRetry = retryable && node.attemptCount < node.maxAttempts;
    const updated = this.db.updateRun(runId, {
      status: "failed",
      errorMessage: input.errorMessage,
      startedAt: run.startedAt ?? run.createdAt,
      finishedAt: timestamp,
    });
    if (canRetry) {
      const nextRunAt = timestamp + backoffMs(node.attemptCount);
      this.db.updateNode(node.id, {
        status: "ready",
        errorMessage: input.errorMessage,
        leaseExpiresAt: null,
        leasedByWorkerId: null,
        nextRunAt,
      });
      this.db.appendEvent({
        graphId: run.graphId,
        nodeId: node.id,
        runId,
        workerId: run.workerId,
        type: STABLE_EVENT_TYPES.nodeRetryScheduled,
        message: "Node failed and was scheduled for retry.",
        data: { nextRunAt, errorMessage: input.errorMessage },
      });
    } else {
      this.db.updateNode(node.id, {
        status: "failed",
        errorMessage: input.errorMessage,
        leaseExpiresAt: null,
        leasedByWorkerId: null,
      });
      this.db.appendEvent({
        graphId: run.graphId,
        nodeId: node.id,
        runId,
        workerId: run.workerId,
        type: STABLE_EVENT_TYPES.nodeFailed,
        message: "Node failed terminally.",
        data: { retryable, errorMessage: input.errorMessage },
      });
    }
    this.tick();
    return updated;
  }

  blockRun(runId: string, reason: string): AgentRun {
    const run = this.requireRun(runId);
    const updated = this.db.updateRun(runId, {
      status: "failed",
      errorMessage: reason,
      finishedAt: now(),
    });
    this.db.updateNode(run.nodeId, {
      status: "blocked",
      errorMessage: reason,
      leaseExpiresAt: null,
      leasedByWorkerId: null,
    });
    this.db.appendEvent({
      graphId: run.graphId,
      nodeId: run.nodeId,
      runId,
      workerId: run.workerId,
      type: STABLE_EVENT_TYPES.nodeBlocked,
      message: "Node blocked by worker.",
      data: { reason },
    });
    return updated;
  }

  retryNode(nodeId: string): DelegationNode {
    const node = this.requireNode(nodeId);
    const updated = this.db.updateNode(nodeId, {
      status: "ready",
      errorMessage: null,
      leaseExpiresAt: null,
      leasedByWorkerId: null,
      nextRunAt: now(),
      maxAttempts: Math.max(node.maxAttempts, node.attemptCount + 1),
    });
    this.db.appendEvent({
      graphId: node.graphId,
      nodeId,
      type: STABLE_EVENT_TYPES.nodeRetryScheduled,
      message: "Node was manually retried.",
      data: {},
    });
    return updated;
  }

  cancelNode(nodeId: string): DelegationNode {
    const node = this.requireNode(nodeId);
    const updated = this.db.updateNode(nodeId, {
      status: "cancelled",
      leaseExpiresAt: null,
      leasedByWorkerId: null,
    });
    this.db.appendEvent({
      graphId: node.graphId,
      nodeId,
      type: STABLE_EVENT_TYPES.nodeCancelled,
      message: "Node was cancelled.",
      data: {},
    });
    this.tick();
    return updated;
  }

  private expireLeases(): number {
    let expired = 0;
    const timestamp = now();
    for (const run of this.db.listActiveRuns()) {
      if (run.leaseExpiresAt > timestamp) continue;
      const node = this.db.getNode(run.nodeId);
      if (!node || isTerminal(node.status)) continue;
      expired += 1;
      this.db.updateRun(run.id, {
        status: "failed",
        errorMessage: "Lease expired.",
        finishedAt: timestamp,
      });
      if (node.attemptCount < node.maxAttempts) {
        const nextRunAt = timestamp + backoffMs(node.attemptCount);
        this.db.updateNode(node.id, {
          status: "ready",
          errorMessage: "Lease expired.",
          leaseExpiresAt: null,
          leasedByWorkerId: null,
          nextRunAt,
        });
        this.db.appendEvent({
          graphId: run.graphId,
          nodeId: node.id,
          runId: run.id,
          workerId: run.workerId,
          type: STABLE_EVENT_TYPES.nodeRetryScheduled,
          message: "Node lease expired and was scheduled for retry.",
          data: { nextRunAt },
        });
      } else {
        this.db.updateNode(node.id, {
          status: "failed",
          errorMessage: "Lease expired.",
          leaseExpiresAt: null,
          leasedByWorkerId: null,
        });
        this.db.appendEvent({
          graphId: run.graphId,
          nodeId: node.id,
          runId: run.id,
          workerId: run.workerId,
          type: STABLE_EVENT_TYPES.nodeFailed,
          message: "Node lease expired terminally.",
          data: {},
        });
      }
    }
    return expired;
  }

  private createContinuations(): number {
    let created = 0;
    for (const parent of this.db.listNodes().filter((node) => node.status === "waiting")) {
      const edges = this.db.listEdges(parent.graphId).filter((edge) => edge.fromNodeId === parent.id && edge.kind === "blocks_parent");
      if (edges.length === 0) continue;
      const children = edges.map((edge) => this.db.getNode(edge.toNodeId)).filter((node): node is DelegationNode => Boolean(node));
      if (children.some((node) => !isTerminal(node.status))) continue;
      const failed = edges.some((edge) => {
        if (edge.optional) return false;
        const child = children.find((candidate) => candidate.id === edge.toNodeId);
        return child?.status === "failed" || child?.status === "cancelled";
      });
      if (failed) {
        this.db.updateNode(parent.id, {
          status: "failed",
          errorMessage: "A blocking child failed.",
          leaseExpiresAt: null,
          leasedByWorkerId: null,
        });
        this.db.appendEvent({
          graphId: parent.graphId,
          nodeId: parent.id,
          type: STABLE_EVENT_TYPES.nodeFailed,
          message: "Parent failed because a blocking child failed.",
          data: {},
        });
        continue;
      }
      const existing = this.db.listNodes(parent.graphId).find((node) => node.continuationOfNodeId === parent.id);
      if (existing) continue;
      const childResults = children.map((node) => ({
        id: node.id,
        title: node.title,
        status: node.status,
        result: node.result,
      }));
      const continuation = this.db.createNode({
        graphId: parent.graphId,
        parentNodeId: parent.id,
        continuationOfNodeId: parent.id,
        title: `Continue: ${parent.title}`,
        objective: `Continue after delegated children finish: ${parent.objective}`,
        agentType: parent.agentType,
        adapter: parent.adapter,
        priority: parent.priority,
        depth: parent.depth + 1,
        input: { continuationOf: parent.id, childResults },
        maxAttempts: parent.maxAttempts,
        timeoutMs: parent.timeoutMs,
      });
      this.db.createEdge({
        graphId: parent.graphId,
        fromNodeId: parent.id,
        toNodeId: continuation.id,
        kind: "fan_in",
      });
      this.db.updateNode(parent.id, {
        status: "succeeded",
        result: { continuedByNodeId: continuation.id, childResults },
        leaseExpiresAt: null,
        leasedByWorkerId: null,
      });
      this.db.appendEvent({
        graphId: parent.graphId,
        nodeId: continuation.id,
        type: STABLE_EVENT_TYPES.nodeContinuationCreated,
        message: "Continuation node created after blocking children finished.",
        data: { continuationOfNodeId: parent.id },
      });
      created += 1;
    }
    return created;
  }

  private finalizeGraphs(): number {
    let finalized = 0;
    for (const graph of this.db.listGraphs().filter((candidate) => candidate.status === "active")) {
      const nodes = this.db.listNodes(graph.id);
      if (nodes.length === 0) continue;
      if (nodes.some((node) => !isTerminal(node.status))) continue;
      const nextStatus = nodes.some((node) => node.status === "failed") ? "failed"
        : nodes.some((node) => node.status === "cancelled") ? "cancelled"
          : "succeeded";
      this.db.updateGraphStatus(graph.id, nextStatus);
      finalized += 1;
    }
    return finalized;
  }

  private requireRun(runId: string): AgentRun {
    const run = this.db.getRun(runId);
    if (!run) throw new Error(`Run ${runId} not found`);
    return run;
  }

  private requireNode(nodeId: string): DelegationNode {
    const node = this.db.getNode(nodeId);
    if (!node) throw new Error(`Node ${nodeId} not found`);
    return node;
  }
}
