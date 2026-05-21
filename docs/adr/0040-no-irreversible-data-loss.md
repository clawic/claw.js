# ADR 0040: No irreversible data loss guardrail

Status: Accepted

Date: 2026-05-21

## Context

The Constitution already makes irreversible data loss a red line. The project
also has strong but separate programs for secrets, external validation, UI,
storage, and post-V1 evolution. What was missing was a single operational
program that every delete, purge, migration, import, export, sync, agent action,
and provider mutation had to satisfy.

Distributed mentions of trash, archive, rollback, snapshots, and migration are
not enough. Agents and contributors need a checkable contract that says whether
an operation is recoverable, how recovery is proven, when exact human approval
is required, and which existing gaps are baseline debt rather than silent
permission.

## Decision

ClawJS owns the canonical no-irreversible-data-loss program. Clawix mirrors the
program for host, UI, native approval, signed-host receipts, and recovery
surfaces.

Every destructive or data-moving stable surface must declare one recovery class:

- `recoverable`
- `snapshot_recoverable`
- `rebuildable`
- `external_recoverable`
- `irreversible_external_requires_exact_human_approval`
- `forbidden_for_agents`

Default deletion is recoverable trash or archive. Hard purge is a separate
operation that requires exact human approval, an audit receipt, a recovery-window
expiry, and snapshot or export evidence when the data is locally recoverable.
Agents cannot perform irreversible purge. Agent-created material may be deleted
only under scoped policy, while human-created or other-agent-created material
requires stronger approval.

Migrations must declare pre-migration snapshots, dry-run planning, redacted
receipts, repair paths, and rollback or forward-repair classification. Imports
must stage or merge by default; overwrite requires a snapshot and conflict
report. Exports remain comprehensive, versioned, reproducible, and readable
without the framework.

External provider actions are classified honestly. Provider trash, archive, or
restore paths use `external_recoverable`. Provider hard deletes use
`irreversible_external_requires_exact_human_approval`, require a provider receipt
and local recoverability evidence where possible, and remain live-validation
`EXTERNAL PENDING` until approved provider evidence exists.

This ADR uses baseline rollout. Existing gaps are listed in
`docs/governance/no-irreversible-data-loss/baseline.json` with owner, reason,
expiry, severity, and monitored file counts. New or touched destructive surfaces
must add policy evidence instead of growing the baseline silently.

## Performance Impact

The guard is static and reads small governance manifests plus monitored registry
files. Runtime behavior changes are policy requirements only: future recovery,
snapshot, trash, and receipt implementations must budget disk, retention, and
cleanup through the performance governance program.

## Decision Tensions

- **Prioritized axes**: sovereignty, user trust, auditability, recoverability,
  and agent containment.
- **Constrained axes**: rollout velocity remains possible through an expiring
  baseline, but new destructive growth must be classified.
- **Tradeoffs accepted**: some existing provider and registry gaps are not
  closed in this slice; they become visible debt with expiry.
- **Debt or pending evidence**: full per-provider hard-delete classification,
  live provider receipts, and complete historical source scanning remain staged
  follow-up work.

## Surface Parity

- **Human surface**: `docs/decision-map.md`, `docs/constitution-map.md`, this
  ADR, and `docs/governance/no-irreversible-data-loss/README.md`.
- **Programmatic surface**: `scripts/no-irreversible-data-loss-check.mjs`
  validates the manifest, fixtures, baseline, constitutional assertions, and
  monitored destructive-surface counts.
- **Persistence**:
  `docs/governance/no-irreversible-data-loss/manifest.json`,
  `baseline.json`, `fixtures.json`, discoverability records, and ADR
  operational coverage carry the durable contract.
- **Gaps**: complete historical operation backfill, exact provider restore
  receipts, and Clawix-native recovery UI evidence remain outside this initial
  enforcement slice and must stay in baseline or external-pending lanes.
- **Validation**: `node scripts/no-irreversible-data-loss-check.mjs`,
  `node scripts/no-irreversible-data-loss-check.mjs --self-test`,
  `npm run test:docs`, `claw evolution verify --json`, connector control-plane
  tests, storage boundary tests, and constitution assertions protect the route.

## Discovery Route

- **Canonical name**: `adr:no-irreversible-data-loss`.
- **AGENTS/CLAUDE**: root instructions route constitutional and data work
  through `docs/decision-map.md`, which points to this ADR and guardrail.
- **Skill**: destructive, migration, import/export, sync, agent-action,
  connector, and provider work should begin from the decision map and this
  governance manifest.
- **Docs router**: `docs/decision-map.md`, `docs/constitution-map.md`, and
  `docs/discoverability.md`.
- **CLI/check**: `node scripts/no-irreversible-data-loss-check.mjs` and
  `claw search "no irreversible data loss" --json`.
- **Registry**: `docs/discoverability.registry.json` records this ADR, the
  governance manifest, and the guard route.

## Consequences

Irreversible data loss is no longer protected only by broad principle or
scattered storage/evolution language. A future delete, purge, import overwrite,
migration, sync apply, agent self-modification, or provider mutation must state
how the user recovers, which actor may perform it, what evidence exists, and
which guard blocks regression.
