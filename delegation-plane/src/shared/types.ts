import type { SemanticPlan } from "../../../packages/clawjs-core/src/semantic.ts";

export type GraphStatus = "active" | "succeeded" | "failed" | "cancelled";
export type NodeStatus = "ready" | "claimed" | "running" | "waiting" | "blocked" | "succeeded" | "failed" | "cancelled";
export type DependencyKind = "blocks_parent" | "informational" | "fan_in";
export type RunStatus = "claimed" | "running" | "succeeded" | "failed" | "cancelled";
export type EventType =
  | "graph.created"
  | "node.created"
  | "node.claimed"
  | "node.heartbeat"
  | "node.waiting"
  | "node.blocked"
  | "node.retry_scheduled"
  | "node.succeeded"
  | "node.failed"
  | "node.cancelled"
  | "node.continuation_created"
  | "run.logged"
  | "worker.registered"
  | "worker.heartbeat";

export interface DelegationPolicy {
  maxAttempts: number;
  leaseTimeoutMs: number;
  runTimeoutMs: number;
  globalConcurrency: number;
  workerConcurrency: number;
  maxDepthWarning: number;
}

export interface DelegationGraph {
  id: string;
  objective: string;
  creator: string;
  status: GraphStatus;
  rootNodeId: string | null;
  policy: DelegationPolicy;
  semanticPlan: SemanticPlan | null;
  createdAt: number;
  updatedAt: number;
}

export interface DelegationNode {
  id: string;
  graphId: string;
  parentNodeId: string | null;
  continuationOfNodeId: string | null;
  title: string;
  objective: string;
  agentType: string;
  adapter: string;
  status: NodeStatus;
  priority: number;
  depth: number;
  input: Record<string, unknown>;
  semanticPlan: SemanticPlan | null;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
  maxAttempts: number;
  attemptCount: number;
  timeoutMs: number;
  leaseExpiresAt: number | null;
  leasedByWorkerId: string | null;
  nextRunAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface DependencyEdge {
  id: string;
  graphId: string;
  fromNodeId: string;
  toNodeId: string;
  kind: DependencyKind;
  optional: boolean;
  createdAt: number;
}

export interface AgentWorker {
  id: string;
  adapter: string;
  label: string;
  capabilities: string[];
  maxConcurrency: number;
  online: boolean;
  lastSeenAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface AgentRun {
  id: string;
  graphId: string;
  nodeId: string;
  workerId: string;
  attempt: number;
  status: RunStatus;
  leaseExpiresAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  output: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface DelegationEvent {
  id: string;
  graphId: string;
  nodeId: string | null;
  runId: string | null;
  workerId: string | null;
  type: EventType;
  message: string;
  data: Record<string, unknown>;
  createdAt: number;
}

export interface RunLog {
  id: string;
  runId: string;
  stream: "stdout" | "stderr" | "system";
  line: string;
  createdAt: number;
}

export interface DelegationTree {
  graph: DelegationGraph;
  nodes: DelegationNode[];
  edges: DependencyEdge[];
  runs: AgentRun[];
  events: DelegationEvent[];
}

export interface ClaimedRun {
  run: AgentRun;
  node: DelegationNode;
  graph: DelegationGraph;
}

export const DEFAULT_POLICY: DelegationPolicy = {
  maxAttempts: 3,
  leaseTimeoutMs: 2 * 60 * 1000,
  runTimeoutMs: 15 * 60 * 1000,
  globalConcurrency: 4,
  workerConcurrency: 1,
  maxDepthWarning: 1000,
};
