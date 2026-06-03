# Nodes, Cluster, And Local Forge Closure

Source conversation: `source:nodes-cluster-local-forge`

Closure state: `partial_local_contracts_with_blocked_and_external_pending_rows`

This folder is the public-safe execution entrypoint for the node/cluster
control-plane, durable node identity, and local forge/worktree review program.
It replaces temporary working notes with accepted ADRs, source-decision audit
rows, and checklists that can drive implementation without relying on private
conversation memory.

Do not publish source transcripts, local goal files, maintainer-private paths,
credentials, signing identifiers, private runtime state, screenshots, caches,
or raw provider evidence here.

## Execution Order

1. Read [ADR 0053](../../adr/0053-nodes-and-cluster-control-plane.md) and
   [ADR 0054](../../adr/0054-local-forge-worktree-review.md).
2. Review [Source Audit](source-audit.md) and confirm every `NCLF-*` row is
   represented in the [Decision Matrix](decision-matrix.md).
3. Execute [Cluster Control Plane Checklist](cluster-control-plane-checklist.md),
   including durable node identity, mutable locators, key rotation, and
   identity-verifying handshakes.
4. Execute [Local Forge Checklist](local-forge-checklist.md).
5. Execute [Surfaces And Contracts Checklist](surfaces-and-contracts-checklist.md).
6. Execute [Security And Privacy Checklist](security-privacy-checklist.md).
7. Execute [Testing And Closure Checklist](testing-and-closure-checklist.md).
8. Review [Redacted Physical Validation Evidence](physical-validation-redacted.md)
   for approved isolated physical runs that are safe to publish.
9. Use [Agent Runbook](agent-runbook.md) for long-running agent handoff.

## Closure Rule

The program closes only when every checklist item is checked with public-safe
evidence, marked `EXTERNAL PENDING` with blocker and reentry details, or
superseded by a later accepted decision. Local validation cannot clear
physical multi-node, provider, signed-host, or live external rows.
