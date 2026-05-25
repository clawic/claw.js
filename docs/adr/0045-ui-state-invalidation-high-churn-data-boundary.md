# ADR 0045: UI state invalidation and high-churn data boundary

Status: Accepted

Date: 2026-05-21

## Context

High-churn data such as streaming tokens, reasoning deltas, timelines, live
jobs, search/index progress, and sync status can update many times per second.
If those updates publish through broad UI state, unrelated surfaces recompute,
scroll, sort, and render while the actual user-visible change is small.

## Decision

High-churn data must stay behind a local, bounded state boundary keyed by
route, item, message, job, stream, or visible window. Global UI state may hold
compact summaries, navigation, preferences, and low-rate status snapshots, but
not token-level transcripts, live timeline append streams, or full high-churn
payload mirrors.

UI surfaces that consume high-churn data must use windowing, virtualization,
batching, snapshot throttling, or explicit local stores. Summary surfaces such
as sidebars, chrome, search route lists, and navigation do not observe live
payload deltas unless the summary itself changes.

## Threat Model Impact

This decision is primarily performance governance. It also reduces incidental
data exposure between UI surfaces by keeping full high-churn payloads away from
summary-only observers.

## Performance Impact

This ADR constrains UI CPU, RAM growth, GPU/render pressure, battery, thermals,
and idle behavior during long streams. Resource contracts for affected surfaces
must name hot-path behavior, active window size, summary publication policy,
and validation evidence.

## Decision Tensions

- **Prioritized axes**: perceived lightness, state locality, bounded UI
  invalidation, and measurable streaming behavior.
- **Constrained axes**: universal app-state stores and broad observers are
  constrained for live payloads.
- **Tradeoffs accepted**: implementers may need explicit summary update paths
  after structural changes.
- **Debt or pending evidence**: platform-specific UI enforcement may land in
  slices, but new high-churn surfaces must carry the boundary now.

## Adoption And Canonicity

This ADR makes no adoption or canonicity promotion claim.

## Source Decision Audit

Conversation-derived 2026-05-21 resource-governance hardening. Sibling Clawix
`docs/adr/0036-ui-state-invalidation-boundary.md` is the first concrete app
slice.

## Surface Parity

- **Human surface**: `docs/decision-map.md`, performance governance docs, and
  Clawix UI performance playbooks.
- **Programmatic surface**: `scripts/surface-resource-contract-guard.mjs`,
  Clawix UI state invalidation checks, and affected UI tests.
- **Persistence**: no user schema change; resource contracts and ADR
  operational coverage carry the durable policy.
- **Gaps**: non-Clawix UI hosts add platform-native checks when they introduce
  high-churn state.
- **Validation**: static governance checks plus route/UI-specific invalidation
  tests.

## Discovery Route

- **Canonical name**: `adr:ui-state-invalidation-high-churn-boundary`.
- **AGENTS/CLAUDE**: `AGENTS.md` -> `docs/decision-map.md`.
- **Skill**: `performance-investigation` and Clawix `ui-performance-budget`.
- **Docs router**: `docs/decision-map.md`.
- **CLI**: `claw search "ui state invalidation high churn" --json`.
- **Registry**: `docs/discoverability.registry.json`.
- **Operational coverage**: `docs/adr-operational-coverage.manifest.json`.

## Consequences

High-churn payloads do not belong in global app state. Reviewers should ask
which store owns the active window, which summaries update globally, and what
test proves unrelated UI does not recompute.
