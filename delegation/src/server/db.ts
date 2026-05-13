import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";

import {
  DEFAULT_POLICY,
  type AgentRun,
  type AgentWorker,
  type ClaimedRun,
  type DelegationEvent,
  type DelegationGraph,
  type DelegationNode,
  type DelegationPolicy,
  type DelegationTree,
  type DependencyEdge,
  type DependencyKind,
  type EventType,
  type GraphStatus,
  type NodeStatus,
  type RunLog,
  type RunStatus,
} from "../shared/types.ts";
import type { SemanticPlan } from "../../../packages/clawjs-core/src/semantic.ts";

function now(): number {
  return Date.now();
}

function id(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function policyFrom(value: Partial<DelegationPolicy> | undefined): DelegationPolicy {
  return { ...DEFAULT_POLICY, ...(value ?? {}) };
}

function graphFromRow(row: Record<string, unknown>): DelegationGraph {
  return {
    id: String(row.id),
    objective: String(row.objective),
    creator: String(row.creator),
    status: row.status as GraphStatus,
    rootNodeId: row.root_node_id ? String(row.root_node_id) : null,
    policy: parseJson(String(row.policy_json), DEFAULT_POLICY),
    semanticPlan: row.semantic_plan_json ? parseJson(String(row.semantic_plan_json), null as SemanticPlan | null) : null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function nodeFromRow(row: Record<string, unknown>): DelegationNode {
  return {
    id: String(row.id),
    graphId: String(row.graph_id),
    parentNodeId: row.parent_node_id ? String(row.parent_node_id) : null,
    continuationOfNodeId: row.continuation_of_node_id ? String(row.continuation_of_node_id) : null,
    title: String(row.title),
    objective: String(row.objective),
    agentType: String(row.agent_type),
    adapter: String(row.adapter),
    status: row.status as NodeStatus,
    priority: Number(row.priority),
    depth: Number(row.depth),
    input: parseJson(String(row.input_json), {}),
    semanticPlan: row.semantic_plan_json ? parseJson(String(row.semantic_plan_json), null as SemanticPlan | null) : null,
    result: row.result_json ? parseJson(String(row.result_json), {}) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    maxAttempts: Number(row.max_attempts),
    attemptCount: Number(row.attempt_count),
    timeoutMs: Number(row.timeout_ms),
    leaseExpiresAt: row.lease_expires_at ? Number(row.lease_expires_at) : null,
    leasedByWorkerId: row.leased_by_worker_id ? String(row.leased_by_worker_id) : null,
    nextRunAt: Number(row.next_run_at),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function edgeFromRow(row: Record<string, unknown>): DependencyEdge {
  return {
    id: String(row.id),
    graphId: String(row.graph_id),
    fromNodeId: String(row.from_node_id),
    toNodeId: String(row.to_node_id),
    kind: row.kind as DependencyKind,
    optional: Number(row.optional) === 1,
    createdAt: Number(row.created_at),
  };
}

function workerFromRow(row: Record<string, unknown>): AgentWorker {
  return {
    id: String(row.id),
    adapter: String(row.adapter),
    label: String(row.label),
    capabilities: parseJson(String(row.capabilities_json), []),
    maxConcurrency: Number(row.max_concurrency),
    online: Number(row.online) === 1,
    lastSeenAt: Number(row.last_seen_at),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function runFromRow(row: Record<string, unknown>): AgentRun {
  return {
    id: String(row.id),
    graphId: String(row.graph_id),
    nodeId: String(row.node_id),
    workerId: String(row.worker_id),
    attempt: Number(row.attempt),
    status: row.status as RunStatus,
    leaseExpiresAt: Number(row.lease_expires_at),
    startedAt: row.started_at ? Number(row.started_at) : null,
    finishedAt: row.finished_at ? Number(row.finished_at) : null,
    output: row.output_json ? parseJson(String(row.output_json), {}) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function eventFromRow(row: Record<string, unknown>): DelegationEvent {
  return {
    id: String(row.id),
    graphId: String(row.graph_id),
    nodeId: row.node_id ? String(row.node_id) : null,
    runId: row.run_id ? String(row.run_id) : null,
    workerId: row.worker_id ? String(row.worker_id) : null,
    type: row.type as EventType,
    message: String(row.message),
    data: parseJson(String(row.data_json), {}),
    createdAt: Number(row.created_at),
  };
}

function logFromRow(row: Record<string, unknown>): RunLog {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    stream: row.stream as RunLog["stream"],
    line: String(row.line),
    createdAt: Number(row.created_at),
  };
}

export class DelegationPlaneDatabase {
  readonly sqlite: Database.Database;

  constructor(filename: string) {
    this.sqlite = new Database(filename);
    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.pragma("foreign_keys = ON");
    this.init();
  }

  close(): void {
    this.sqlite.close();
  }

  private init(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS delegation_graphs (
        id TEXT PRIMARY KEY,
        objective TEXT NOT NULL,
        creator TEXT NOT NULL,
        status TEXT NOT NULL,
        root_node_id TEXT,
        policy_json TEXT NOT NULL,
        semantic_plan_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS delegation_nodes (
        id TEXT PRIMARY KEY,
        graph_id TEXT NOT NULL,
        parent_node_id TEXT,
        continuation_of_node_id TEXT,
        title TEXT NOT NULL,
        objective TEXT NOT NULL,
        agent_type TEXT NOT NULL,
        adapter TEXT NOT NULL,
        status TEXT NOT NULL,
        priority INTEGER NOT NULL,
        depth INTEGER NOT NULL,
        input_json TEXT NOT NULL,
        semantic_plan_json TEXT,
        result_json TEXT,
        error_message TEXT,
        max_attempts INTEGER NOT NULL,
        attempt_count INTEGER NOT NULL,
        timeout_ms INTEGER NOT NULL,
        lease_expires_at INTEGER,
        leased_by_worker_id TEXT,
        next_run_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS delegation_nodes_ready_idx ON delegation_nodes(status, next_run_at, priority);
      CREATE INDEX IF NOT EXISTS delegation_nodes_graph_idx ON delegation_nodes(graph_id);
      CREATE INDEX IF NOT EXISTS delegation_nodes_parent_idx ON delegation_nodes(parent_node_id);
      CREATE INDEX IF NOT EXISTS delegation_nodes_continuation_idx ON delegation_nodes(continuation_of_node_id);

      CREATE TABLE IF NOT EXISTS dependency_edges (
        id TEXT PRIMARY KEY,
        graph_id TEXT NOT NULL,
        from_node_id TEXT NOT NULL,
        to_node_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        optional INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS dependency_edges_from_idx ON dependency_edges(from_node_id);
      CREATE INDEX IF NOT EXISTS dependency_edges_to_idx ON dependency_edges(to_node_id);

      CREATE TABLE IF NOT EXISTS agent_workers (
        id TEXT PRIMARY KEY,
        adapter TEXT NOT NULL,
        label TEXT NOT NULL,
        capabilities_json TEXT NOT NULL,
        max_concurrency INTEGER NOT NULL,
        online INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY,
        graph_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        worker_id TEXT NOT NULL,
        attempt INTEGER NOT NULL,
        status TEXT NOT NULL,
        lease_expires_at INTEGER NOT NULL,
        started_at INTEGER,
        finished_at INTEGER,
        output_json TEXT,
        error_message TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS agent_runs_node_idx ON agent_runs(node_id);
      CREATE INDEX IF NOT EXISTS agent_runs_worker_idx ON agent_runs(worker_id, status);

      CREATE TABLE IF NOT EXISTS delegation_events (
        id TEXT PRIMARY KEY,
        graph_id TEXT NOT NULL,
        node_id TEXT,
        run_id TEXT,
        worker_id TEXT,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        data_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS delegation_events_graph_idx ON delegation_events(graph_id, created_at);

      CREATE TABLE IF NOT EXISTS run_logs (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        stream TEXT NOT NULL,
        line TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
    this.ensureColumn("delegation_graphs", "semantic_plan_json", "TEXT");
    this.ensureColumn("delegation_nodes", "semantic_plan_json", "TEXT");
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const rows = this.sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (rows.some((row) => row.name === column)) return;
    this.sqlite.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }

  appendEvent(input: {
    graphId: string;
    nodeId?: string | null;
    runId?: string | null;
    workerId?: string | null;
    type: EventType;
    message: string;
    data?: Record<string, unknown>;
  }): DelegationEvent {
    const timestamp = now();
    const eventId = id("evt");
    this.sqlite.prepare(`
      INSERT INTO delegation_events (id, graph_id, node_id, run_id, worker_id, type, message, data_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(eventId, input.graphId, input.nodeId ?? null, input.runId ?? null, input.workerId ?? null, input.type, input.message, JSON.stringify(input.data ?? {}), timestamp);
    return this.getEvent(eventId)!;
  }

  getEvent(eventId: string): DelegationEvent | null {
    const row = this.sqlite.prepare("SELECT * FROM delegation_events WHERE id = ?").get(eventId) as Record<string, unknown> | undefined;
    return row ? eventFromRow(row) : null;
  }

  createGraph(input: {
    objective: string;
    creator?: string;
    root?: Partial<Pick<DelegationNode, "title" | "agentType" | "adapter" | "input" | "priority" | "semanticPlan">>;
    policy?: Partial<DelegationPolicy>;
    semanticPlan?: SemanticPlan | null;
  }): DelegationGraph {
    const timestamp = now();
    const graphId = id("graph");
    const policy = policyFrom(input.policy);
    const graph = this.sqlite.transaction(() => {
      this.sqlite.prepare(`
        INSERT INTO delegation_graphs (id, objective, creator, status, root_node_id, policy_json, semantic_plan_json, created_at, updated_at)
        VALUES (?, ?, ?, 'active', NULL, ?, ?, ?, ?)
      `).run(graphId, input.objective, input.creator ?? "operator", JSON.stringify(policy), input.semanticPlan ? JSON.stringify(input.semanticPlan) : null, timestamp, timestamp);
      const root = this.createNode({
        graphId,
        parentNodeId: null,
        title: input.root?.title ?? "Root delegation",
        objective: input.objective,
        agentType: input.root?.agentType ?? "general",
        adapter: input.root?.adapter ?? "deterministic",
        input: input.root?.input ?? {},
        semanticPlan: input.root?.semanticPlan ?? input.semanticPlan ?? null,
        priority: input.root?.priority ?? 0,
        depth: 0,
        maxAttempts: policy.maxAttempts,
        timeoutMs: policy.runTimeoutMs,
      });
      this.sqlite.prepare("UPDATE delegation_graphs SET root_node_id = ?, updated_at = ? WHERE id = ?").run(root.id, timestamp, graphId);
      this.appendEvent({ graphId, nodeId: root.id, type: "graph.created", message: "Delegation graph created.", data: { objective: input.objective } });
      return this.getGraph(graphId)!;
    })();
    return graph;
  }

  listGraphs(): DelegationGraph[] {
    const rows = this.sqlite.prepare("SELECT * FROM delegation_graphs ORDER BY created_at DESC").all() as Array<Record<string, unknown>>;
    return rows.map(graphFromRow);
  }

  getGraph(graphId: string): DelegationGraph | null {
    const row = this.sqlite.prepare("SELECT * FROM delegation_graphs WHERE id = ?").get(graphId) as Record<string, unknown> | undefined;
    return row ? graphFromRow(row) : null;
  }

  updateGraphStatus(graphId: string, status: GraphStatus): DelegationGraph {
    this.sqlite.prepare("UPDATE delegation_graphs SET status = ?, updated_at = ? WHERE id = ?").run(status, now(), graphId);
    return this.getGraph(graphId)!;
  }

  createNode(input: {
    graphId: string;
    parentNodeId?: string | null;
    continuationOfNodeId?: string | null;
    title: string;
    objective: string;
    agentType?: string;
    adapter?: string;
    input?: Record<string, unknown>;
    semanticPlan?: SemanticPlan | null;
    priority?: number;
    depth?: number;
    maxAttempts?: number;
    timeoutMs?: number;
    status?: NodeStatus;
  }): DelegationNode {
    const timestamp = now();
    const nodeId = id("node");
    const graph = this.getGraph(input.graphId);
    const policy = graph?.policy ?? DEFAULT_POLICY;
    this.sqlite.prepare(`
      INSERT INTO delegation_nodes (
        id, graph_id, parent_node_id, continuation_of_node_id, title, objective, agent_type, adapter, status,
        priority, depth, input_json, semantic_plan_json, result_json, error_message, max_attempts, attempt_count, timeout_ms,
        lease_expires_at, leased_by_worker_id, next_run_at, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, 0, ?, NULL, NULL, ?, ?, ?)
    `).run(
      nodeId,
      input.graphId,
      input.parentNodeId ?? null,
      input.continuationOfNodeId ?? null,
      input.title,
      input.objective,
      input.agentType ?? "general",
      input.adapter ?? "deterministic",
      input.status ?? "ready",
      input.priority ?? 0,
      input.depth ?? 0,
      JSON.stringify(input.input ?? {}),
      input.semanticPlan ? JSON.stringify(input.semanticPlan) : null,
      input.maxAttempts ?? policy.maxAttempts,
      input.timeoutMs ?? policy.runTimeoutMs,
      timestamp,
      timestamp,
      timestamp,
    );
    const node = this.getNode(nodeId)!;
    this.appendEvent({ graphId: input.graphId, nodeId, type: "node.created", message: "Delegation node created.", data: { title: node.title, parentNodeId: node.parentNodeId } });
    return node;
  }

  getNode(nodeId: string): DelegationNode | null {
    const row = this.sqlite.prepare("SELECT * FROM delegation_nodes WHERE id = ?").get(nodeId) as Record<string, unknown> | undefined;
    return row ? nodeFromRow(row) : null;
  }

  listNodes(graphId?: string): DelegationNode[] {
    const rows = graphId
      ? this.sqlite.prepare("SELECT * FROM delegation_nodes WHERE graph_id = ? ORDER BY depth ASC, created_at ASC").all(graphId)
      : this.sqlite.prepare("SELECT * FROM delegation_nodes ORDER BY created_at DESC").all();
    return (rows as Array<Record<string, unknown>>).map(nodeFromRow);
  }

  listChildren(nodeId: string, kind?: DependencyKind): DelegationNode[] {
    const rows = kind
      ? this.sqlite.prepare(`
          SELECT n.* FROM delegation_nodes n
          JOIN dependency_edges e ON e.to_node_id = n.id
          WHERE e.from_node_id = ? AND e.kind = ?
          ORDER BY n.created_at ASC
        `).all(nodeId, kind)
      : this.sqlite.prepare(`
          SELECT n.* FROM delegation_nodes n
          JOIN dependency_edges e ON e.to_node_id = n.id
          WHERE e.from_node_id = ?
          ORDER BY n.created_at ASC
        `).all(nodeId);
    return (rows as Array<Record<string, unknown>>).map(nodeFromRow);
  }

  updateNode(nodeId: string, patch: Partial<{
    status: NodeStatus;
    result: Record<string, unknown> | null;
    errorMessage: string | null;
    attemptCount: number;
    leaseExpiresAt: number | null;
    leasedByWorkerId: string | null;
    nextRunAt: number;
    maxAttempts: number;
  }>): DelegationNode {
    const current = this.getNode(nodeId);
    if (!current) throw new Error(`Node ${nodeId} not found`);
    const next = {
      status: patch.status ?? current.status,
      resultJson: patch.result === undefined ? (current.result ? JSON.stringify(current.result) : null) : (patch.result ? JSON.stringify(patch.result) : null),
      errorMessage: patch.errorMessage === undefined ? current.errorMessage : patch.errorMessage,
      attemptCount: patch.attemptCount ?? current.attemptCount,
      leaseExpiresAt: patch.leaseExpiresAt === undefined ? current.leaseExpiresAt : patch.leaseExpiresAt,
      leasedByWorkerId: patch.leasedByWorkerId === undefined ? current.leasedByWorkerId : patch.leasedByWorkerId,
      nextRunAt: patch.nextRunAt ?? current.nextRunAt,
      maxAttempts: patch.maxAttempts ?? current.maxAttempts,
    };
    this.sqlite.prepare(`
      UPDATE delegation_nodes
      SET status = ?, result_json = ?, error_message = ?, attempt_count = ?, lease_expires_at = ?,
        leased_by_worker_id = ?, next_run_at = ?, max_attempts = ?, updated_at = ?
      WHERE id = ?
    `).run(next.status, next.resultJson, next.errorMessage, next.attemptCount, next.leaseExpiresAt, next.leasedByWorkerId, next.nextRunAt, next.maxAttempts, now(), nodeId);
    return this.getNode(nodeId)!;
  }

  createEdge(input: {
    graphId: string;
    fromNodeId: string;
    toNodeId: string;
    kind: DependencyKind;
    optional?: boolean;
  }): DependencyEdge {
    const edgeId = id("edge");
    this.sqlite.prepare(`
      INSERT INTO dependency_edges (id, graph_id, from_node_id, to_node_id, kind, optional, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(edgeId, input.graphId, input.fromNodeId, input.toNodeId, input.kind, input.optional ? 1 : 0, now());
    return this.getEdge(edgeId)!;
  }

  getEdge(edgeId: string): DependencyEdge | null {
    const row = this.sqlite.prepare("SELECT * FROM dependency_edges WHERE id = ?").get(edgeId) as Record<string, unknown> | undefined;
    return row ? edgeFromRow(row) : null;
  }

  listEdges(graphId?: string): DependencyEdge[] {
    const rows = graphId
      ? this.sqlite.prepare("SELECT * FROM dependency_edges WHERE graph_id = ? ORDER BY created_at ASC").all(graphId)
      : this.sqlite.prepare("SELECT * FROM dependency_edges ORDER BY created_at ASC").all();
    return (rows as Array<Record<string, unknown>>).map(edgeFromRow);
  }

  registerWorker(input: {
    workerId?: string;
    adapter?: string;
    label?: string;
    capabilities?: string[];
    maxConcurrency?: number;
  }): AgentWorker {
    const timestamp = now();
    const workerId = input.workerId ?? id("worker");
    this.sqlite.prepare(`
      INSERT INTO agent_workers (id, adapter, label, capabilities_json, max_concurrency, online, last_seen_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        adapter = excluded.adapter,
        label = excluded.label,
        capabilities_json = excluded.capabilities_json,
        max_concurrency = excluded.max_concurrency,
        online = 1,
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at
    `).run(
      workerId,
      input.adapter ?? "deterministic",
      input.label ?? workerId,
      JSON.stringify(input.capabilities ?? []),
      input.maxConcurrency ?? DEFAULT_POLICY.workerConcurrency,
      timestamp,
      timestamp,
      timestamp,
    );
    const worker = this.getWorker(workerId)!;
    this.appendEvent({ graphId: "system", workerId, type: "worker.registered", message: "Worker registered.", data: { adapter: worker.adapter } });
    return worker;
  }

  getWorker(workerId: string): AgentWorker | null {
    const row = this.sqlite.prepare("SELECT * FROM agent_workers WHERE id = ?").get(workerId) as Record<string, unknown> | undefined;
    return row ? workerFromRow(row) : null;
  }

  listWorkers(): AgentWorker[] {
    const rows = this.sqlite.prepare("SELECT * FROM agent_workers ORDER BY created_at DESC").all() as Array<Record<string, unknown>>;
    return rows.map(workerFromRow);
  }

  markWorkerSeen(workerId: string): AgentWorker {
    this.sqlite.prepare("UPDATE agent_workers SET online = 1, last_seen_at = ?, updated_at = ? WHERE id = ?").run(now(), now(), workerId);
    return this.getWorker(workerId)!;
  }

  createRun(input: {
    graphId: string;
    nodeId: string;
    workerId: string;
    attempt: number;
    leaseExpiresAt: number;
  }): AgentRun {
    const timestamp = now();
    const runId = id("run");
    this.sqlite.prepare(`
      INSERT INTO agent_runs (id, graph_id, node_id, worker_id, attempt, status, lease_expires_at, started_at, finished_at, output_json, error_message, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'claimed', ?, ?, NULL, NULL, NULL, ?, ?)
    `).run(runId, input.graphId, input.nodeId, input.workerId, input.attempt, input.leaseExpiresAt, timestamp, timestamp, timestamp);
    return this.getRun(runId)!;
  }

  getRun(runId: string): AgentRun | null {
    const row = this.sqlite.prepare("SELECT * FROM agent_runs WHERE id = ?").get(runId) as Record<string, unknown> | undefined;
    return row ? runFromRow(row) : null;
  }

  listRuns(graphId?: string): AgentRun[] {
    const rows = graphId
      ? this.sqlite.prepare("SELECT * FROM agent_runs WHERE graph_id = ? ORDER BY created_at DESC").all(graphId)
      : this.sqlite.prepare("SELECT * FROM agent_runs ORDER BY created_at DESC").all();
    return (rows as Array<Record<string, unknown>>).map(runFromRow);
  }

  listActiveRuns(workerId?: string): AgentRun[] {
    const rows = workerId
      ? this.sqlite.prepare("SELECT * FROM agent_runs WHERE worker_id = ? AND status IN ('claimed', 'running')").all(workerId)
      : this.sqlite.prepare("SELECT * FROM agent_runs WHERE status IN ('claimed', 'running')").all();
    return (rows as Array<Record<string, unknown>>).map(runFromRow);
  }

  updateRun(runId: string, patch: Partial<{
    status: RunStatus;
    leaseExpiresAt: number;
    output: Record<string, unknown> | null;
    errorMessage: string | null;
    startedAt: number | null;
    finishedAt: number | null;
  }>): AgentRun {
    const current = this.getRun(runId);
    if (!current) throw new Error(`Run ${runId} not found`);
    const next = {
      status: patch.status ?? current.status,
      leaseExpiresAt: patch.leaseExpiresAt ?? current.leaseExpiresAt,
      outputJson: patch.output === undefined ? (current.output ? JSON.stringify(current.output) : null) : (patch.output ? JSON.stringify(patch.output) : null),
      errorMessage: patch.errorMessage === undefined ? current.errorMessage : patch.errorMessage,
      startedAt: patch.startedAt === undefined ? current.startedAt : patch.startedAt,
      finishedAt: patch.finishedAt === undefined ? current.finishedAt : patch.finishedAt,
    };
    this.sqlite.prepare(`
      UPDATE agent_runs
      SET status = ?, lease_expires_at = ?, output_json = ?, error_message = ?, started_at = ?, finished_at = ?, updated_at = ?
      WHERE id = ?
    `).run(next.status, next.leaseExpiresAt, next.outputJson, next.errorMessage, next.startedAt, next.finishedAt, now(), runId);
    return this.getRun(runId)!;
  }

  appendLog(input: { runId: string; stream?: RunLog["stream"]; line: string }): RunLog {
    const logId = id("log");
    this.sqlite.prepare("INSERT INTO run_logs (id, run_id, stream, line, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(logId, input.runId, input.stream ?? "system", input.line, now());
    return this.getLog(logId)!;
  }

  getLog(logId: string): RunLog | null {
    const row = this.sqlite.prepare("SELECT * FROM run_logs WHERE id = ?").get(logId) as Record<string, unknown> | undefined;
    return row ? logFromRow(row) : null;
  }

  listLogs(runId: string): RunLog[] {
    const rows = this.sqlite.prepare("SELECT * FROM run_logs WHERE run_id = ? ORDER BY created_at ASC").all(runId) as Array<Record<string, unknown>>;
    return rows.map(logFromRow);
  }

  listEvents(graphId: string): DelegationEvent[] {
    const rows = this.sqlite.prepare("SELECT * FROM delegation_events WHERE graph_id = ? ORDER BY created_at ASC").all(graphId) as Array<Record<string, unknown>>;
    return rows.map(eventFromRow);
  }

  getTree(graphId: string): DelegationTree {
    const graph = this.getGraph(graphId);
    if (!graph) throw new Error(`Graph ${graphId} not found`);
    return {
      graph,
      nodes: this.listNodes(graphId),
      edges: this.listEdges(graphId),
      runs: this.listRuns(graphId),
      events: this.listEvents(graphId),
    };
  }

  claimReadyNode(workerId: string): ClaimedRun | null {
    const worker = this.getWorker(workerId);
    if (!worker || !worker.online) return null;
    const activeForWorker = this.listActiveRuns(workerId).length;
    if (activeForWorker >= worker.maxConcurrency) return null;
    const globalActive = this.listActiveRuns().length;
    const activeGraphs = this.listGraphs().filter((graph) => graph.status === "active");
    const globalLimit = Math.max(1, ...activeGraphs.map((graph) => graph.policy.globalConcurrency));
    if (globalActive >= globalLimit) return null;

    const timestamp = now();
    const row = this.sqlite.prepare(`
      SELECT n.* FROM delegation_nodes n
      JOIN delegation_graphs g ON g.id = n.graph_id
      WHERE n.status = 'ready'
        AND n.next_run_at <= ?
        AND n.adapter = ?
        AND g.status = 'active'
      ORDER BY n.priority DESC, n.created_at ASC
      LIMIT 1
    `).get(timestamp, worker.adapter) as Record<string, unknown> | undefined;
    if (!row) return null;
    const node = nodeFromRow(row);
    const graph = this.getGraph(node.graphId)!;
    const leaseExpiresAt = timestamp + graph.policy.leaseTimeoutMs;
    const attempt = node.attemptCount + 1;
    return this.sqlite.transaction(() => {
      this.updateNode(node.id, {
        status: "claimed",
        attemptCount: attempt,
        leaseExpiresAt,
        leasedByWorkerId: worker.id,
        errorMessage: null,
      });
      const run = this.createRun({ graphId: graph.id, nodeId: node.id, workerId: worker.id, attempt, leaseExpiresAt });
      this.appendEvent({ graphId: graph.id, nodeId: node.id, runId: run.id, workerId: worker.id, type: "node.claimed", message: "Node claimed by worker.", data: { attempt } });
      return { graph, node: this.getNode(node.id)!, run };
    })();
  }
}
