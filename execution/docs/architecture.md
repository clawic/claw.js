# Architecture

## High-Level Shape

The execution plane uses a split architecture:

- control plane: owns metadata, scheduling, versioning state, run orchestration, and deployment state
- worker plane: local machines that materialize workspaces and execute runs

This keeps Codex-like local execution semantics while allowing central routing across many machines.

## Control Plane Responsibilities

The control plane owns:

- projects and repositories
- code asset registry
- revision and change-request metadata
- run queueing and placement
- artifact catalog
- deployment metadata
- worker inventory and capability matching

It does not execute user code directly.

## Worker Plane Responsibilities

Each worker:

- connects outbound to the control plane
- advertises runtime and sandbox capabilities
- materializes local workspaces from a repository revision plus product metadata
- executes runs
- streams logs and status
- publishes artifact metadata and upload handles

The worker is the execution boundary. The control plane is the coordination boundary.

## Workspace Materialization

Workers materialize runs into local ClawJS workspaces.

The materialization inputs are:

- repository identity
- target revision
- code asset descriptor
- run inputs
- secret references
- execution policy

The workspace stays local to the worker machine. Only metadata, logs, and explicitly published artifacts cross back to the control plane.

## Versioning Model

Git remains the underlying version store.

The execution plane layers these product concepts on top:

- revision provenance
- change requests
- linked runs
- required checks
- review decisions
- merge state

This gives agent-aware change control without inventing a separate Git replacement.

## Execution Model

Scripts, notebooks, scheduled jobs, and interactive debug runs share one lifecycle:

1. resolve revision
2. choose worker
3. materialize workspace
4. attach secret references
5. execute run
6. stream logs and status
7. persist artifacts
8. optionally expose a debug session
9. optionally promote an artifact into deployment

## Secret Handling

Secrets are never injected into model-visible plaintext context.

Required flow:

- the control plane stores only secret references or policy bindings
- the worker resolves secret access through Vault-compatible brokered flows
- logs and model prompts carry secret names or handles, never literal values

## Deployment Model

Deployment is downstream from successful execution.

Minimal deployment flow:

1. a run emits a deployable artifact
2. the artifact is promoted into a deployment target
3. a domain is attached
4. a certificate is issued
5. rollback points remain tied to prior artifacts

## Placement Rules

Run placement uses worker metadata such as:

- supported runtimes
- notebook support
- sandbox mode
- network policy
- available capacity
- locality constraints
- deploy capabilities

Different runs may land on different workers even within the same project.
