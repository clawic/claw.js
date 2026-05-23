# ADR 0030: Post-V1 evolution and rescue backbone

## Status

Accepted. Source conversation:
`source:evolution-rescue-backbone`.

## Context

ClawJS and Clawix are stateful. After public release, users may update across
many versions while holding local databases, workspace files, global state,
agent instructions, bridge contracts, routes, sidecars, indexes, receipts, and
host operational data. The highest product risk is silent drift: a later build
appears to run but older user state, routes, agents, or contracts no longer
map cleanly to the current model.

The project also has a second risk: compatibility code can pollute the current
implementation. The product should evolve toward the best current design, not
be shaped by poor early choices. Legacy behavior must be explicit and testable
without becoming branching logic throughout the main code path.

The binding user decision is that the app must not punish the user for an
update. Even when migration or host state fails, Clawix must make a best effort
to launch, keep chat available, and provide an agent-readable repair trail.

## Decision

ClawJS owns the canonical evolution policy. Clawix mirrors and consumes the
policy for app, host, bridge, UI, and rescue consequences.

Before V1, the active `pre_v1_mutable` policy still allows clean cuts when the
user approves them. After V1, every public version must migrate forward toward
the latest model through explicit steps. User-facing public data migrators are
never removed. Runtime adapters may retire only through a documented policy and
only when they do not strand public user data.

The current implementation stays clean:

- main code handles the current model only;
- legacy support lives in boundary migrators, adapters, receipts, and repair
  tooling;
- stable surface changes require an evolution record;
- breaking public changes require an ADR;
- unrecorded stable drift fails closed in validation.

Evolution records live in `docs/evolution/`. They classify changes as:
`additive`, `compatible`, `migration_required`, `adapter_required`, or
`breaking_requires_adr`. Records move through `draft`, `active`,
`superseded`, `blocked`, and `retired_runtime_adapter`.

The public operator surface is `claw evolution`. It exposes list, show, diff,
plan, dry-run, apply, verify, doctor, repair, rollback, backup, receipt, and
report. Mutating or risky repair work must stay approval-gated.

Backups are scoped by surface. Databases and sidecars use snapshots. Workspace
and host state back up only touched objects plus metadata. Rebuildable caches
and indexes are not canonical backups. External sources are never mutated or
copied wholesale. The default large-state threshold is 1 GB or 10k files with
explicit override; default retention is 30 days in the owning root.

Receipts and reports are redacted by default. They may contain ids, versions,
counts, hashes, surfaces, results, errors, and timestamps. They must not contain
prompts, secrets, sensitive payloads, or full local paths. External submission
requires explicit approval.

Rescue is constitutional product behavior. Clawix must try to keep launch,
chat, and repair available even when storage, history, projects, migration,
bridge, runtime, or non-critical subsystems fail. If persistent chat state
cannot load, the app opens an ephemeral session. If one runtime path fails, it
uses the first available runtime. If runtime is unavailable, it shows local
diagnostics and export/repair options. The app exposes repair state discreetly
in the sidebar and provides an independent rescue window from the launcher.

Startup must use circuit breakers for migration failure, recent crash loops,
bridge/runtime down states, startup hangs, and CPU/RAM runaway. Non-critical
subsystems are cut before chat/rescue are lost.

## Enforcement

The first guard is `scripts/evolution-governance-check.mjs`. It verifies the
policy, ledger schema, CLI registry, skill, ADR, decision-map routing, and test
integration. Later phases extend the same guard into registry/baseline diffs
and fixture migration labs.

The core SDK exports typed evolution policy and record schemas. `claw
evolution verify --json` is the CLI smoke surface for agents and release gates.

## Consequences

Agents no longer need architectural memory to know how updates survive. They
must inspect the evolution ledger and run the evolution guard before changing a
stable public surface.

Clawix treats chat and repair as the survival core. UI subsystems may degrade,
but a user should not be trapped in an unusable app after an update.
