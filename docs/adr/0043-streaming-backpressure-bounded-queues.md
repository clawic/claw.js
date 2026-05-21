# ADR 0043: Streaming, backpressure, and bounded queues

Status: Accepted

Date: 2026-05-21

## Context

ClawJS routes increasingly use streams: chat responses, runtime job events,
Relay/WebSocket/SSE fanout, sync, indexing, connector ingest, monitor events,
and long-running agents. Streams without producer throttling, cancellation, and
bounded queues become hidden memory growth and UI pressure even when functional
tests pass.

## Decision

Every stream or queue must declare one of these behaviors before closure:
bounded buffer with overflow policy, cancellable pull/windowing, durable
checkpoint with compaction, or explicit expiring debt. Producers must be able to
slow, pause, drop according to policy, or fail closed when consumers cannot keep
up. Unbounded in-memory fanout is not an implementation detail; it is a product
correctness defect.

The `resourceContract.streaming` field records cancellation, backpressure,
queue limit, overflow policy, batching/windowing, and validation. Streams that
also retain state must satisfy Boundedness Guard P0.

## Threat Model Impact

This decision does not add a new trust boundary. It reduces denial-of-service
and resource exhaustion risk for local services, Relay, plugins, connectors,
and agent workflows by requiring bounded queue behavior and fail-closed
pressure handling.

## Performance Impact

This ADR is performance governance. It constrains RAM, CPU, disk, network,
battery, thermals, idle behavior, and growth for streams and queues. The rule
is bytes/count/age/active-window boundedness plus cancellation and
backpressure evidence before closure.

## Decision Tensions

- **Prioritized axes**: reliability, bounded resource use, nonblocking UI, and
  route observability.
- **Constrained axes**: simplest fire-and-forget stream implementations are
  constrained when they hide unbounded buffers.
- **Tradeoffs accepted**: some APIs need explicit window/cursor contracts or
  overflow policy earlier than before.
- **Debt or pending evidence**: inherited stream gaps remain only in expiring
  boundedness or resource-contract baselines.

## Adoption And Canonicity

This ADR makes no adoption or canonicity promotion claim.

## Source Decision Audit

Conversation-derived 2026-05-21 resource-governance hardening. The public
record is this ADR, decision-map routing, resource-contract guard coverage, and
Problem-to-Guardrail closure.

## Surface Parity

- **Human surface**: `docs/decision-map.md` and
  `docs/governance/performance-governance.md`.
- **Programmatic surface**: `scripts/boundedness-guard.mjs`,
  `scripts/surface-resource-contract-guard.mjs`, and tests for affected stream
  routes.
- **Persistence**: stream debts live in `docs/boundedness-baseline.json` or
  `docs/surface-resource-contract-baseline.json`.
- **Gaps**: existing stream surfaces may remain baselined until expiry.
- **Validation**: docs checks, boundedness guard, surface resource contract
  guard, and focused stream tests.

## Discovery Route

- **Canonical name**: `adr:streaming-backpressure-bounded-queues`.
- **AGENTS/CLAUDE**: `AGENTS.md` -> `docs/decision-map.md`.
- **Skill**: `performance-investigation` for measurement, `adr-to-guardrail`
  for policy changes.
- **Docs router**: `docs/decision-map.md`.
- **CLI**: `claw search "streaming backpressure bounded queues" --json`.
- **Registry**: `docs/discoverability.registry.json`.
- **Operational coverage**: `docs/adr-operational-coverage.manifest.json`.

## Consequences

New stream work must name the queue limit, cancellation path, producer pressure
behavior, and validation. Missing automation closes as guard/test added,
ADR/rule added, or explicit debt with expiry.
