# ADR 0036: Performance governance for user computer resources

Status: Accepted

Date: 2026-05-20

## Context

ClawJS and Clawix deliberately combine many heavy capabilities: local-first
storage, search, sync, agents, audit, custom surfaces, bridge/daemon work,
local models, media, connectors, and native host integration. Left alone, that
shape tends to consume more CPU, RAM, GPU, disk, network, battery, and thermal
headroom over time.

Existing performance policy is mostly diagnostic: measure before optimizing,
capture traces for symptoms, and keep UI budgets for approved critical flows.
That is necessary, but incomplete. The project also needs a durable design
pressure that makes new architecture, storage, runtime, UI, and agent decisions
choose bounded, lazy, cancellable, observable behavior by default.

## Decision

ClawJS owns a canonical Performance Governance policy at
`docs/governance/performance-governance.md`. Clawix mirrors it for app, host,
macOS, UI, launcher, and local validation concerns.

Performance means whole-computer resource behavior, not only perceived speed.
CPU, RAM, GPU or Neural Engine, disk, network, battery, thermals, timers, logs,
indexes, caches, processes, background work, and model inference are product
budgets owned by the user.

Durable ADRs and governance changes must include a `Performance Impact` section
when they add or change resource-sensitive surfaces: UI rendering, daemon or
bridge work, storage, search, sync, logs, caches, models, IPC, streaming,
timers, background loops, local servers, workers, or long-running agents. If
the section is not relevant, the ADR states why.

The default design stance is lazy startup, opt-in modules, bounded caches,
explicit retention, backpressure, cancellation, batching, pagination or
windowing, incremental indexing, idle quiescence, and no unproven heavy work on
main/UI hot paths. The Idle Quiescence Contract P1 requires timers, pollers,
schedulers, watchers, health loops, reconnect loops, refresh loops, telemetry
loops, and diagnostic probes to be registered in
`docs/idle-quiescence.manifest.json` with visible-only UI behavior, opt-in
diagnostics, backoff or leases, shared-timer rationale, and inactivity
shutdown.

Windowing/Pagination by Default makes broad reads a P0/P1 closure blocker. Any
list, transcript, timeline, sidebar, database-admin view, search indexer,
rollout JSONL reader, embedding job, table, or import must use a
cursor/window/batch/limit contract before touching large data. The pattern
`load all -> filter/sort/render` is forbidden unless the dataset has a
documented maximum count or byte size. Pre-existing exceptions must live in
`docs/boundedness-baseline.json` with owner, reason, current limit, cleanup
policy, reference, expiration, and release-blocking status.

Resource Contract is required for implementation closure. New registered
runtime, UI, storage, stream, cache, queue, IPC, daemon, worker, or long-running
agent surfaces must carry `resourceContract` metadata before they are complete.
That contract names startup behavior, idle quiescence, memory bounds,
streaming/backpressure behavior, storage retention, hot-path constraints,
scale/windowing expectations, and validation evidence. Historical missing
contracts are allowed only through `docs/surface-resource-contract-baseline.json`
with owner, reason, expiry, and reentry condition.

Equivalent behavior with lower computer-resource cost is a preferred refactor
class when tests and measurements prove compatibility. Performance debt is
formal debt with surface, resource dimension, evidence, target, owner, review
date, and release-blocking status.

Enforcement is progressive:

1. Block missing governance routes, missing performance impact classification
   for obviously resource-sensitive durable decisions, and regressions against
   already approved budgets.
2. Add resource budgets for critical routes such as idle CPU, long-session RAM,
   disk/cache growth, startup, chat scroll, streaming, search, sync, and local
   models.
3. Turn expired debt, repeated regressions, or approved-budget violations into
   release blockers.

Performance governance does not authorize visual changes. Visible layout,
animation, timing, copy, style, or interaction changes still follow Clawix UI
governance and visual authorization.

## Performance Impact

This ADR is itself the performance-governance source. It broadens performance
review from latency-only to whole-computer resource pressure: speed, CPU, RAM,
GPU/Neural Engine, disk, network, battery, thermals, idle behavior, and
perceived lightness.

The initial implementation is docs and guardrails only. It does not add
runtime work, background processes, telemetry, new storage, or real machine
capture. Future budgets require measured evidence before enforcement.

## Decision Tensions

- **Prioritized axes**: performance and nonblocking behavior; reliability and
  evidence; evolution and debt; human and agent experience; simplicity and
  earned abstraction.
- **Constrained axes**: controlled automation keeps early enforcement focused
  on routing, classification, and approved baselines; strategic adaptability
  keeps budgets progressive instead of freezing pre-V1 experimentation.
- **Tradeoffs accepted**: durable decisions become slightly heavier to write,
  but future agents get an explicit resource-cost lens before adding
  persistent work.
- **Debt or pending evidence**: resource budgets beyond existing UI flows are
  future work. Existing historical ADRs are not retrofitted in this slice.

## Surface Parity

- **Human surface**: `docs/governance/performance-governance.md`,
  `docs/decision-map.md`, `docs/constitution-map.md`, and
  `docs/agent-rules/index.md` route contributors and agents to the policy.
- **Programmatic surface**: `scripts/performance-governance-check.mjs`, docs
  alignment checks, `scripts/boundedness-guard.mjs`,
  `scripts/idle-quiescence-check.mjs`, discoverability checks, and `claw
  search "performance governance" --json` expose and validate the route.
- **Persistence**: this ADR, the governance doc, the ADR template, decision-map
  routing, `docs/boundedness-baseline.json`,
  `docs/idle-quiescence.manifest.json`, discoverability records, and the
  performance-governance check carry the durable contract.
- **Gaps**: automatic historical ADR remediation and non-UI resource budgets
  are planned progressive enforcement, not complete in this slice.
- **Validation**: `npm run test:docs`, `node scripts/performance-governance-check.mjs`,
  `node scripts/boundedness-guard.mjs`, `node
  scripts/idle-quiescence-check.mjs`, discoverability generation/audit, and
  Clawix mirror checks protect the route.

## Discovery Route

- **Canonical name**: `adr:performance-governance`.
- **AGENTS/CLAUDE**: `AGENTS.md` routes to `docs/decision-map.md`, which routes
  durable governance and performance work to this ADR and policy.
- **Skill**: `performance-investigation` remains the measurement workflow;
  `decision-map-maintenance` and `docs-alignment-update` route governance edits.
- **Docs router**: `docs/decision-map.md`, `docs/constitution-map.md`,
  `docs/governance/README.md`, and `docs/agent-rules/index.md`.
- **CLI**: `claw search performance --json` and `claw search "performance
  governance" --json`.
- **Registry**: `docs/discoverability.registry.json` records this ADR, the
  governance doc, and the guardrail script.

## Consequences

Performance becomes a design constraint, not only an after-the-fact debugging
topic. New heavy surfaces must explain their resource behavior, and future
refactors have a clear mandate to preserve behavior while reducing computer
pressure where evidence supports it.
