# ADR 0044: Launch and idle contract

Status: Accepted

Date: 2026-05-21

## Context

ClawJS can host daemons, workers, local servers, indexes, model adapters,
connectors, watchers, and agents. Without a launch and idle contract, optional
capabilities drift into startup work and keep the user's machine awake after
useful work ends.

## Decision

Capabilities start lazily. A module, process, database, index, model, watcher,
poller, timer, connector, or local server starts only because a user, agent,
route, or explicit module demand requires it. When demand ends, the capability
must quiesce: no active polling, timers, GPU/model work, file watching, socket
fanout, or retained worker state beyond its declared active window.

`resourceContract.startup` records the demand trigger and non-startup behavior.
`resourceContract.idle` records how the surface sleeps, shuts down, or retains
only bounded passive state.

## Threat Model Impact

This decision does not grant new authority. Lazy launch reduces ambient attack
surface by avoiding unnecessary listeners, provider sessions, native prompts,
and background workers.

## Performance Impact

This ADR constrains startup latency, CPU wakeups, RAM footprint, network, disk,
battery, thermals, and idle behavior. Validation may be static for governance
and measured for critical routes such as startup, chat, search, sync, Relay,
and local models.

## Decision Tensions

- **Prioritized axes**: user-owned resources, predictable startup, idle
  quiescence, and zero accidental work.
- **Constrained axes**: eager warming and speculative background work are
  limited unless explicitly authorized and measured.
- **Tradeoffs accepted**: first-use latency can increase for optional heavy
  capabilities.
- **Debt or pending evidence**: inherited eager work must be guarded, tested,
  or tracked as expiring debt.

## Adoption And Canonicity

This ADR makes no adoption or canonicity promotion claim.

## Source Decision Audit

Conversation-derived 2026-05-21 resource-governance hardening. The public
record is this ADR, decision-map routing, performance governance, and
Problem-to-Guardrail closure.

## Surface Parity

- **Human surface**: `docs/decision-map.md` and performance governance docs.
- **Programmatic surface**: `scripts/performance-governance-check.mjs`,
  `scripts/surface-resource-contract-guard.mjs`, and startup/idle tests.
- **Persistence**: resource contracts and expiring baselines.
- **Gaps**: critical measured budgets remain progressive until baselines are
  approved.
- **Validation**: static governance checks plus route-specific startup/idle
  validation.

## Discovery Route

- **Canonical name**: `adr:launch-idle-contract`.
- **AGENTS/CLAUDE**: `AGENTS.md` -> `docs/decision-map.md`.
- **Skill**: `performance-investigation`.
- **Docs router**: `docs/decision-map.md`.
- **CLI**: `claw search "launch idle contract" --json`.
- **Registry**: `docs/discoverability.registry.json`.
- **Operational coverage**: `docs/adr-operational-coverage.manifest.json`.

## Consequences

New optional capability work must prove it does not start at install or base
startup, and must describe how it returns to idle.
