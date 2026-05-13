# Roadmap

## Phase 0: Spec Baseline

Deliverables:

- product definition
- domain model
- architecture
- canonical control-plane interfaces
- implementation sequencing

Acceptance:

- the top-level execution surface exists in the repo
- the spec covers scripts, notebooks, workers, revisions, artifacts, and deployments
- the spec explicitly defines the Git-native and Vault-compatible boundaries

## Phase 1: Execution Core

Build first:

- worker registration and heartbeat
- queued runs
- workspace materialization from repository revisions
- structured logs
- artifact publishing
- debug-session attachment hooks

Do not build yet:

- full deployment product
- advanced review policy
- hosted notebook UX

## Phase 2: Versioned Agent Changes

Add:

- revision registry
- tracked patch sets
- change requests
- review requests
- merge gating on run results

Exit criteria:

- agent-authored changes are reviewable
- runs and artifacts are linked to revision provenance

## Phase 3: Notebook And Workflow Maturity

Add:

- notebook-aware execution metadata
- selective rerun semantics
- promotion from notebook logic into reusable jobs
- workflow templates over code assets

Exit criteria:

- notebooks and scripts share one execution substrate while preserving distinct authoring semantics

## Phase 4: Deployment Plane

Add:

- artifact promotion
- environment targets
- domain attachment
- certificate issuance
- rollback lineage

Exit criteria:

- a successful run can flow into a live deployment with tracked rollback points

## Acceptance Scenarios

The implementation must preserve these scenarios end to end:

1. A user writes a script, runs it on a remote local worker, and inspects logs and artifacts.
2. A user iterates in a notebook, reruns selected cells, and promotes the result into a reusable job.
3. An agent edits project code, opens a versioned change, and another agent or human reviews it.
4. A successful run produces a deployable artifact, which is published with domain and SSL.
5. The control plane routes different runs to different workers based on capability and availability.
6. Secrets are referenced by name and never injected into model-visible plaintext.
