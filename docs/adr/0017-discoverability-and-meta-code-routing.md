# ADR 0017: Discoverability and meta-code routing

Status: Accepted

Date: 2026-05-17

## Context

ClawJS and Clawix now contain many agent-facing meta-code artifacts: ADRs,
decision maps, skills, docs, tests, harnesses, guardrails, generated manifests,
and route graph entries. These artifacts improve quality only when future
agents can find them before editing the relevant surface.

The existing routing shape is useful but incomplete. `AGENTS.md` and
`CLAUDE.md` route to canonical docs, skills hold task procedures, and
`claw inspect` exposes stable runtime surfaces. The missing contract is a
short, testable path from common agent entrypoints to each durable meta-code
artifact. A rule hidden three or four files deep is effectively optional.

## Decision

ClawJS owns the public discoverability contract for ClawJS/Clawix meta-code.
Important new ADRs, docs pages, skills, guardrails, test harnesses,
surface-route entries, UI governance artifacts, and durable instruction changes
must be registered in `docs/discoverability.registry.json`.

The registry records the artifact id, kind, owner, canonical source, required
entrypoints, optional semantic canonical name, discovery terms, required `claw search` queries, optional
`claw inspect` route, validating guard, status, and review date.
ADR numbers are repo-local; `adr:*` canonical names are cross-repository
semantic identifiers for shared decisions.

The maximum route distance is two hops. A registered artifact must be reachable
from its required entrypoints by direct mention/link or by one intermediate
router such as `docs/decision-map.md`, `docs/AGENTS.md`, a task skill, or
`claw inspect`.

Existing buried artifacts are recorded in
`docs/discoverability-baseline.json`. The baseline is debt, not permission for
new hidden work. Each baseline entry must have an owner, reason, review date,
and frozen artifact list.

Comments in source code are non-canonical. They may explain local intent, but
durable decisions and guardrails must point to an ADR, docs page, registry, or
test. Decision-like comment markers such as `CANON`, `DECISION`, or
`GUARDRAIL` must include a canonical reference.

## Surface Parity

- **Human surface**: `AGENTS.md`, `CLAUDE.md`, `docs/decision-map.md`, and
  public docs route humans and agents to the canonical source.
- **Programmatic surface**: `claw search`, `claw inspect`, and
  `scripts/discoverability-check.mjs` expose and validate the registered
  discovery routes. When invoked from a private Clawix overlay root that
  contains `clawix/` and has a sibling `clawjs` checkout, public CLI
  discovery federates only those public repository roots and excludes private
  overlay artifacts.
- **Persistence**: `docs/discoverability.registry.json` stores enforced
  routes; `docs/discoverability-baseline.json` stores expiring inherited debt.
- **Gaps**: existing meta-code not yet routed is `required` debt in the
  baseline until reviewed or promoted into the registry.
- **Validation**: `npm run test:docs` runs the discoverability guard and its
  self-test; CLI tests prove required discovery queries return the expected
  ADRs, docs, or skills.

## Discovery Route

- **AGENTS/CLAUDE**: root `AGENTS.md` routes to `docs/decision-map.md` and the
  required skills; `CLAUDE.md` routes back through `AGENTS.md`.
- **Skill**: `adr-to-guardrail`, `decision-map-maintenance`,
  `docs-alignment-update`, `surface-route-work`, and
  `cli-agent-surface-work` require registry updates for durable meta-code.
- **Docs router**: `docs/decision-map.md` contains the durable decision row for
  this contract.
- **CLI**: `claw search discoverability --json` and
  `claw search "meta-code routing" --json` must return this ADR or its
  registered docs from direct repo roots and from a composite Clawix overlay
  cwd. `claw inspect why search --json` exposes the CLI discovery surface that
  backs the query.

## Consequences

New meta-code additions have a small up-front cost: the author must decide how
future agents will find the artifact. In exchange, discovery failures become
test failures instead of relying on memory or long instruction chains.

The registry is intentionally compact. It does not replace ADRs, docs, skills,
or route graphs; it proves that the path to those sources is short enough to
use.
