# ADR 0018: CLI action intent registry

Status: Accepted

Date: 2026-05-17

## Context

`claw` is the primary way agents discover and act through the framework. The
registered command surface covers known commands, aliases, portals, docs, ADRs,
tests, and source links, but agents can still try arbitrary action words. A
plain unknown-command response loses useful signal: the phrase may be a typo, a
candidate alias, an uncovered need, a future product direction, a blocked
request, or an external/physical prerequisite.

The framework already has `claw needs` for human-need routes and `claw report`
for reviewed GitHub promotion. Command vocabulary demand needs a parallel,
smaller layer tied to those systems without becoming a semantic router that
executes guessed actions.

## Decision

Claw exposes `claw commands` as the V1 command action-intent surface. The unit
is an actionable CLI intent: a phrase plus the purpose a user or agent would use
it for. The canonical registry is versioned TypeScript data in `@clawjs/core`;
explicit workspace additions live in `.claw/command-intents/command-intents.json`.

V1 statuses are compact and stable: `covered`, `candidate_alias`, `gap`,
`future`, `blocked`, and `external_pending`. Resolution is deterministic,
local-only, and non-executing. It may map a phrase to a covered command or
nearby registry result, but candidate aliases are not activated automatically.
Unknown command JSON includes `meta.commandIntent` so automation can see the
resolution result and exact next steps without scraping human help text.

The public command shape is:

- `claw commands resolve <phrase>`
- `claw commands record --phrase <phrase> --purpose <purpose>`
- `claw commands list`
- `claw commands opportunities`
- `claw commands promote <id> --to report`

`phrase` and `purpose` are required for explicit records. Raw local phrases may
stay in the workspace ledger; promotion goes through `claw report` redaction and
approval gates. `commands opportunities` emits Need-compatible opportunities so
repeatable vocabulary demand can be deduped and triaged with `claw needs`.

The initial seed is intentionally focused: registered commands, obvious natural
aliases, retired/broad unsafe requests, and representative futures such as
`house buy`. Futures, blocked requests, and external-pending intents must state
that they are not executable plans.

The surface is inspectable through `claw inspect command-intents` and the route
graph route `cli.commandIntentResolution`.

## Consequences

The CLI gets closer to the agent ideal where arbitrary action attempts produce
useful related guidance, while preserving safety: unknown phrases do not run,
aliases do not silently appear, and cost-bearing, destructive, native,
secret-bearing, or physical-world requests remain explicit as blocked, future,
or `EXTERNAL PENDING`.

Adding command vocabulary now requires code, docs, registry, graph, and tests in
one change. That overhead is deliberate; command words become public agent
affordances only after review.
