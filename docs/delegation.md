---
title: Delegation
description: Durable async control plane for scalable agent delegation trees, leases, retries, continuations, and operator workflows.
---

# Delegation

`delegation/` is a standalone control plane for durable agent delegation.
It stores delegation trees in SQLite, schedules executable nodes asynchronously,
and resumes parent work through continuation nodes after blocking children finish.

The goal is unbounded delegation depth with bounded live execution. Parent agents
do not stay alive while children run. The control plane persists the wait state,
worker leases, retry policy, run attempts, logs, and lifecycle events.

## What v1 includes

- persistent delegation graphs, nodes, dependency edges, workers, runs, logs, and events
- scheduler ticks that reclaim expired leases, apply retry policy, and create continuations
- worker registration, heartbeat, claim, complete, fail, block, and log endpoints
- structured agent-facing child delegation from a current run
- generic runtime adapter contract
- deterministic local adapter for hermetic tests
- command adapter for local process execution
- operator CLI for graph creation, inspection, retry, cancel, worker claim, and stuck-work views

## Runtime Semantics

Nodes start as `ready`. A worker claims one ready node through the HTTP API, which
creates a concrete run attempt and gives the node a lease. The worker must
heartbeat or finish before the lease expires.

When a node creates a blocking child delegation, the parent run is closed and the
parent node moves to `waiting`. Once all blocking children are terminal, the
scheduler creates a new continuation node. That continuation receives the child
results in its input payload and can be claimed like any other node.

Default policy:

- max attempts: `3`
- lease timeout: `2 minutes`
- run timeout: `15 minutes`
- global concurrency: `4`
- worker concurrency: `1`
- max depth warning: `1000`

Failed blocking children fail their waiting parent unless the dependency was
created as optional.

## Local Workflow

```bash
npm --prefix delegation install
npm --prefix delegation run build
npm --prefix delegation run start
```

Default local URL:

- [http://127.0.0.1:4520](http://127.0.0.1:4520)

The service is local-first and has no production auth surface in the MVP. Keep it
behind local or trusted-network boundaries until an auth layer is added.

## CLI

Create and inspect a graph:

```bash
npm --prefix delegation run cli -- graph create --objective "Ship the release plan"
npm --prefix delegation run cli -- graph list
npm --prefix delegation run cli -- graph inspect <graphId> --tree
```

Register a worker and claim work:

```bash
npm --prefix delegation run cli -- worker register --workerId local-1
npm --prefix delegation run cli -- worker claim local-1
```

Operate stuck work:

```bash
npm --prefix delegation run cli -- stuck
npm --prefix delegation run cli -- node retry <nodeId>
npm --prefix delegation run cli -- node cancel <nodeId>
```

Use `--url` or `DELEGATION_PLANE_URL` to point the CLI at another local service
instance.

## HTTP Surface

Core operator endpoints:

- `POST /v1/graphs`
- `GET /v1/graphs`
- `GET /v1/graphs/:graphId`
- `POST /v1/nodes/:nodeId/retry`
- `POST /v1/nodes/:nodeId/cancel`
- `POST /v1/scheduler/tick`

Core worker and agent endpoints:

- `POST /v1/workers/register`
- `POST /v1/workers/:workerId/claim`
- `POST /v1/workers/:workerId/heartbeat`
- `POST /v1/runs/:runId/children`
- `POST /v1/runs/:runId/heartbeat`
- `POST /v1/runs/:runId/logs`
- `POST /v1/runs/:runId/complete`
- `POST /v1/runs/:runId/fail`
- `POST /v1/runs/:runId/block`

## Adapter Contract

Adapters implement a narrow runtime interface:

- `canRun(node, worker)`
- `startRun(context)`
- `streamEvent(event)`
- `cancelRun(runId)`
- `summarizeChildResults(parentNode, childNodes)`

The scheduler is independent from OpenClaw, Codex, and any paid model provider.
Those runtimes should plug in as adapters without changing the durable scheduler
or graph model.
