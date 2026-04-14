# Canonical V1 Interfaces

This document defines the future control-plane contract. The names below are part of the intended v1 surface.

## Worker Lifecycle

### `registerWorker`

Registers a worker with:

- worker identity
- workspace root
- runtime inventory
- isolation capabilities
- deployment capabilities

### `heartbeat`

Refreshes worker liveness, queue load, and capacity state.

### `advertiseCapabilities`

Publishes the worker's current execution capabilities, including language runtimes, notebook support, sandbox features, and deploy support.

### `claimRun`

Allows a worker to claim an eligible queued run for execution.

### `streamLogs`

Streams structured log events, progress updates, and execution markers from the worker to the control plane.

### `completeRun`

Finalizes a run with terminal status, output summary, artifact handles, and optional debug metadata.

## Run Lifecycle

### `createRun`

Creates a queued run bound to:

- project
- code asset
- revision
- input payload
- execution policy

### `cancelRun`

Requests cancellation of an in-flight or queued run.

### `rerun`

Creates a new run from a prior run's revision and inputs, optionally with overrides.

### `attachDebugSession`

Attaches an interactive debug session to a running or failed run when the worker supports it.

### `listArtifacts`

Lists the artifacts emitted by a run, including metadata, retention, and download or promotion handles.

## Versioning Lifecycle

### `createRevision`

Creates execution-plane revision metadata over a Git commit, branch head, or tracked patch set.

### `openChangeRequest`

Opens a reviewable change unit targeting a merge branch.

### `applyPatch`

Appends or replaces a tracked patch set associated with a revision or change request.

### `requestReview`

Requests review from humans or agents and records the review policy.

### `mergeChange`

Completes the change request merge when checks and review requirements are satisfied.

## Deployment Lifecycle

### `createDeployment`

Creates a deployment from a deployable artifact.

### `promoteDeployment`

Promotes a deployment to a target environment such as preview, staging, or production.

### `attachDomain`

Associates a deployment with a domain binding.

### `issueCertificate`

Requests and records certificate issuance for an attached domain.

### `rollbackDeployment`

Rolls a deployment back to a prior artifact-backed release.

## State Invariants

- every `Run` points to a `Revision`
- every `Artifact` comes from one `Run`
- every `Deployment` points to one `Artifact`
- every agent-authored change becomes a Git branch or patch plus execution-plane metadata
- every worker run is tied to one materialized local workspace

## Reference Scenarios

### Script execution

A user creates a script revision, submits `createRun`, a worker claims it, streams logs, completes the run, and exposes artifacts through `listArtifacts`.

### Notebook promotion

A notebook revision is executed iteratively, selected cells are rerun, and the resulting code path is promoted into a reusable workflow or script-backed job.

### Versioned agent work

An agent creates a revision, opens a change request, requests review, and merges the change only after linked runs succeed.

### Deployable output

A successful run produces an artifact that becomes a deployment with domain attachment and certificate issuance.
