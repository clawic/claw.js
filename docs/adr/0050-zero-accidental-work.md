# ADR 0050: Zero Accidental Work

## Status

Accepted.

## Context

ADR 0031 made the base install and safe CLI paths zero-surprise. ADR 0041 made
adoption and canonicity claims evidence-gated. Those are not enough by
themselves: good capabilities can still become product bugs when imports,
constructors, app launch, daemon boot, or bridge transport start work before a
person or caller has asked for it.

The risky work is not only paid or remote work. Opening SQLite, spawning a
runtime, starting a scheduler, installing a watcher, prewarming a global index,
or loading dense optional modules can create latency, contention, permission
surprises, or persistent background state.

## Decision

- Imports, constructors, `createClaw()`, safe CLI paths, app launch, daemon
  boot, and bridge transport are inert unless a named contract explicitly
  authorizes work.
- Forbidden accidental work includes DB opens, process starts, schedulers,
  timers, watchers, indexers, global prefetch, network listeners or calls,
  sidecars, and dense/heavy module loading.
- Cheap static definitions, pure schemas, type exports, constant catalogs,
  UserDefaults reads, and bounded first-paint cache reads are allowed.
- Bridge transport and runtime startup are separate contracts. Starting a
  local bridge listener or connecting to an already-enabled bridge does not
  imply starting the runtime engine.
- `createClaw()` constructs an SDK facade. DB-backed stores, skills import or
  sync, runtime setup, search, connectors, and the time scheduler activate only
  through explicit methods or explicit options.
- `CreateClawOptions.time.mode = "scheduler"` is the scheduler contract.
  Omitted time remains unconfigured, and `embedded-on-demand` opens its DB only
  when a time method needs it.

## Consequences

- Guardrails must smoke-test `claw --help`, base CLI import, and `createClaw()`
  construction for accidental work.
- App and daemon launch code must name the startup contract for any allowed
  listener, timer, process, or DB work.
- New capabilities may be discoverable as metadata but must not prewarm
  runtimes, indexes, providers, sidecars, or dense catalogs on import.
- Existing launch work that is intentional must be moved behind explicit
  demand or documented as a narrow startup contract protected by tests.

## Validation

- `scripts/zero-accidental-work-guard.mjs`
- Sibling Clawix mirror guard: `scripts/zero_accidental_work_check.mjs`
- CLI base import guard: `scripts/verify-cli-base-imports.mjs`
- Progressive modularity guard: `scripts/progressive-modularity-guard.mjs`
