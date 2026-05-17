# ADR 0007: CLI agent interface

## Status

Accepted.

## Context

The ClawJS framework exists so agents can generate value for humans through
typed data, programmable actions, local storage, open APIs, and signed-host
brokers. The public `claw` CLI is the default interface agents can use without
embedding framework internals. Before V1, parts of the CLI surface were still
manual: help text, routing, aliases, inspection, connector coverage, and tests
could drift from the framework contracts they were meant to expose.

The decision thread `019e26ab-3d52-72b2-8653-08569db30681` and active goal
`019e26b6-1bbd-7d10-b68c-84d815b655e2` require the CLI to become complete,
discoverable, registry-driven, and guarded. This ADR records that standard so
future agents do not treat CLI behavior as a secondary convenience layer.

## Decision

`claw` is the canonical agent interface to ClawJS. Every stable framework
contract that an agent could need must have CLI representation through a typed
registry, generated or registry-backed help, deterministic inspection/search,
and tests or guardrails.

The CLI command registry is a public framework contract. Each stable command or
portal declares its command name, kind (`canonical`, `portal`, or `alias`),
summary, usage, aliases, support state, security policy, schema version,
documentation, ADRs, tests, and implementation source. Router behavior, help,
aliases, inspection, public docs, JSON schemas, and parity tests must derive
from that registry rather than independent manual lists.

Stable JSON output uses a common envelope:

```json
{ "ok": true, "data": {}, "meta": {} }
```

Failures use:

```json
{ "ok": false, "error": { "code": "...", "message": "..." }, "meta": {} }
```

Command `meta` includes the command schema version and canonical command when
aliases are involved. Existing pre-V1 raw JSON responses are migration debt
until the registry migration reaches that command; new stable CLI JSON must use
the envelope.

Aliases execute only when resolution is unique. If a collection alias collides
with a stable command, the stable command wins and the alias collision remains
discoverable through `claw inspect aliases` and `claw search`. Unknown commands
return structured related matches in JSON mode and related textual suggestions
in human mode.

`claw inspect` is the exact inspection surface. It covers commands, aliases,
schemas, storage, APIs, protocols, events, IDs, external dependencies, docs,
ADRs, tests, source, support states, and `why`. `claw search` is the
deterministic local discovery surface for questions and ranked lookup across
the same registry/docs/index data. Neither requires an LLM or network access
for registry-backed answers.

Stable collections expose CRUD plus `schema` and `query`. Create and update use
the universal `--set field=value` shape validated by schema, types, enums, and
relations. `database` is the technical database surface; `db`, `collections`,
`records`, and natural collection aliases are agent ergonomics over the same
canonical catalog.

The database-to-CLI route is guarded by the domain surface registry. Any stable
collection, signal vertical, aggregate, system, runtime service, package API,
module manifest, portal, alias, storage object, or host boundary that agents can
discover must have an entry in `clawDomainSurfaceRegistry`. Conceptual
families are discovery surfaces; they are not package or service boundaries
unless the registry marks them as systems or runtime modules.

Stable connectors expose an operational catalog, official external schema
coverage, support state, auth requirements, risk flags, input/output schemas,
fixtures, and execution policy. A provider without complete external schema
coverage cannot be marked stable. Destructive, write, native-permission,
secret-bearing, or cost-bearing actions require the signed host broker,
approval/grant policy, dry-run where appropriate, and audit.

Codebase inspection is part of the CLI contract. Generated manifests cover the
whole workspace by default and can be summarized or filtered by path prefix,
symbol, language, test status, and limit. V1 deep AST coverage includes
TypeScript, JavaScript, and Swift. Other languages start with file,
entrypoint, package, module, and test inventory. Build outputs, caches,
dependencies, private user data, secrets, artifacts, and external read-only
sources are excluded from deep indexing. Manifests are stale-checked by
relevant gates.

Agent discovery protocol: for non-trivial project questions or implementation
plans, agents first ask `claw` for the map, then read source as evidence. The
default sequence is `claw search <topic> --json`, `claw inspect why <command>
--json` or the relevant `inspect` category, and for data work `claw
collections list --json`, `claw collections <collection> schema --json`, and
`claw db <collection> list|query --json`. The low-level `claw database ...`
admin surface is for service-backed database administration; it is not the
local collection catalog.

## Rules

- Any stable CLI change requires registry, docs, and tests in the same change.
- Any stable framework collection, connector, schema, route, event, output
  field, flag, command, alias, storage fact, or codebase fact that agents need
  must be inspectable through CLI.
- Agents use the CLI discovery protocol before treating direct source reads as
  the primary map, except for trivial tasks, unavailable CLI, or facts
  explicitly outside the framework contract.
- Manual CLI inventories are allowed only as generated output or test fixtures
  that assert registry parity.
- Pre-v1 accidental command aliases are removed cleanly unless a successor ADR
  grants a bounded exception.
- Post-V1 breaking CLI behavior is versioned per command schema/version, not
  only through package semver.
- Physical integrations that cannot be validated locally are recorded as
  `EXTERNAL PENDING`, separate from reproducible bugs.

## Consequences

The CLI is no longer a thin wrapper around ad hoc commands. It is the public
operating surface for agents and the compatibility layer that keeps framework
contracts discoverable. Adding framework power without CLI parity is incomplete
work. Adding CLI behavior without registry, docs, and tests is rejected drift.
