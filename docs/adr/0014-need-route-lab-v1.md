# ADR 0014: Need Route Lab V1

## Status

Accepted.

## Context

Claw must support a very large space of human digital needs: personal,
business, low-agency, high-agency, single-agent, multi-agent, UI-heavy,
infrastructure-heavy, local, remote, and physical-device workflows. Enumerating
every case as a separate artifact would not scale. The framework needs a way to
compose dimensions, generate representative routes, evaluate gaps safely, and
turn discoveries into reviewable product opportunities.

The lab must help agents evolve the framework itself. A person or agent should
be able to ask for new simulated cases in a domain, see where CLI, data, UI,
validation, permissions, docs, or tests are missing, and promote useful findings
without creating backlog noise or touching real services.

## Decision

Claw exposes `claw needs` as the canonical Need Route Lab V1. The source of
truth is versioned TypeScript registry data in `@clawjs/core`, not ad hoc
prompt text. V1 models routes through composable dimensions:

- human intent
- autonomy preference
- domain
- target surface
- agent topology
- infrastructure
- data state
- permission risk
- deliverable
- validation mode

The initial pilot pack is intentionally small and high-leverage: agent
workflow, app-building/deploy, remote infrastructure, and IoT/home. These pilots
exercise the main classes of expected growth without pretending to enumerate the
whole space.

Route generation is deterministic by default. V1 also exposes an
`llm_lateral_dry_run` generation mode for lateral exploration, but that mode
only returns normalized expansion metadata; it does not send prompts, call
model providers, read secrets, spend money, or touch production data.

Route evaluation is deterministic and local in V1. It produces scored
opportunities with explicit kind, state, affected surfaces, evidence, external
pending markers, relations, and stable fingerprints. Scoring is composite:
severity, human scope, frequency, route blocker, constitutional risk, effort,
reuse/leverage, and confidence. The maturity model is the full funnel: `idea`,
`observed_gap`, `candidate`, `accepted`, `planned`, `active`, `validating`,
`shipped`, `parked`, and `rejected`. Evaluations carry a capability graph so
feature hierarchy is represented as relationships between dimensions, routes,
validation, opportunities, storage, skills, UI contracts, and promotion packets.

Opportunities are stored in the canonical workspace ledger
`.claw/need-routes/need-route-lab.json`. Promotion is two-step:

1. draft and dedupe locally;
2. publish a promotion packet, currently a `claw report` draft plan, only after
   human review.

Agents may use role skills for scenario generation, coverage auditing,
opportunity triage, and publication preparation. They must keep external or
physical validation as `EXTERNAL PENDING` instead of confusing it with local
pass/fail.

## Consequences

The framework gains a scalable way to reason about infinite human needs without
creating infinite one-off files. Product growth becomes a graph of capabilities,
routes, opportunities, states, and evidence. The CLI stays inspectable and
machine-readable, while real deploys, provider calls, native permissions, and
publication remain outside V1 execution unless an approved host-owned path is
added later.
