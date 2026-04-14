# Agent Execution Plane

`execution-plane/` defines a standalone product surface for agent-authored code execution, versioned changes, artifacts, and deployments.

It is intentionally separate from:

- `relay/`, which remains the narrow remote access and routing layer
- `vault/`, which remains the secret-reference and brokered execution path
- `database/`, which remains an independent data service
- `apps/` and `packages/`, which remain implementation surfaces

This phase is spec-only. It does not scaffold a server, UI, or package.

## Scope

The execution plane is the control plane for:

- scripts, jobs, and notebooks authored by humans or agents
- worker registration and distributed local execution
- versioned agent changes on top of Git repositories
- run logs, outputs, and artifacts
- deployment as a first-class outcome of successful runs

## Documents

- `docs/product.md`: product definition and non-goals
- `docs/domain-model.md`: canonical objects and required relationships
- `docs/architecture.md`: control-plane and worker-plane design
- `docs/api.md`: canonical v1 control-plane interfaces
- `docs/roadmap.md`: phased implementation path and acceptance checks

## Working Assumptions

- The product is execution-first.
- Deploy is part of the product, but not the first implementation milestone.
- Git remains the underlying version store.
- Local workers execute code inside materialized ClawJS workspaces.
- Secrets are referenced by name through Vault-compatible flows and never treated as model-visible plaintext.
