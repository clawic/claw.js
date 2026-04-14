# Product Definition

## Position

The Agent Execution Plane is a standalone product that manages agent-authored code as an execution system, not as a chat wrapper.

It exists to unify four concerns that currently fragment across tools:

- code authoring for scripts, jobs, and notebooks
- distributed execution on local worker machines
- versioned agent changes and review flows
- deployable outputs with domains and certificates

## Product Decisions

- It is not an extension of `relay/`.
- It may reuse relay-style reverse worker connectivity, but it owns its own control plane.
- `relay/` stays focused on remote routing and access mediation.
- `vault/` is the secret-reference path for runs and deployments.
- ClawJS workspaces remain the local materialization unit on each worker.
- Git repositories remain the source of truth for shared code.
- The execution plane adds metadata for revisions, runs, change requests, artifacts, and deployments on top of Git.

## What V1 Must Solve

### 1. Organized code execution

Users and agents need one place to:

- write or update code assets
- execute them on remote local workers
- inspect logs, outputs, and artifacts
- rerun or debug failed work

### 2. Unified authoring model

V1 supports both:

- `script`: single-entrypoint runnable code
- `notebook`: multi-cell exploratory code

Both use the same substrate:

- one revisioned code asset
- one materialized workspace on a worker
- one run lifecycle
- one artifact model

### 3. Git-native agent versioning

The product does not replace Git.

Instead, every agent-authored change is represented as:

- a Git branch, commit, or patch
- plus execution-plane metadata for provenance, review, and merge state

### 4. Deploy as a product outcome

A successful run can produce an artifact that becomes deployable.

Deploy is therefore not a separate product. It is a downstream state transition from a run:

`Revision -> Run -> Artifact -> Deployment`

## Non-Goals For This Phase

- no server scaffold
- no UI scaffold
- no replacement for Git hosting
- no coupling to the existing `database/` service
- no attempt to make `relay/` absorb execution-plane semantics

## Primary User Journeys

1. A user creates a script, runs it on an available worker, inspects logs, and downloads artifacts.
2. A user iterates in a notebook, reruns selected cells, then promotes the notebook logic into a reusable job.
3. An agent edits repository code, opens a change request, and another agent or human reviews it before merge.
4. A build run emits a deployable artifact that is promoted to a live environment with domain and certificate attachment.
5. The control plane places different runs on different workers based on capability, load, and locality.
6. A run consumes named secrets without exposing literal secret values in model-visible context.
