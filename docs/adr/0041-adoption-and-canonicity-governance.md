---
title: "ADR 0041: Adoption and canonicity governance"
description: Promotion governance for stable, canonical, any-human, and adoption claims.
---

# ADR 0041: Adoption and canonicity governance

Status: Accepted

Date: 2026-05-21

## Context

The Constitution defines canonicity as standards plus adoption and defines the
Clawix app target as any human who uses AI. Before this ADR, those principles
were routed through interface and surface governance, but no operational gate
required adoption metrics, comprehension evidence, feedback loops, user
research, PMF criteria, or a decision point for when an experience is
sufficiently understandable.

This made it possible for agents to treat `canonical`, `stable`, or
"any-human" language as aspirational prose instead of a governed promotion
state.

## Decision

ClawJS owns the shared adoption and canonicity governance standard. Clawix
mirrors it for the human app and UI promotion gates.

Stable, canonical, any-human, PMF, and broad-adoption claims require a public
safe adoption/canonicity packet before promotion. Experiments and beta work may
continue without a packet as long as they do not claim stable or canonical
status.

The working standard lives in
`docs/governance/adoption-canonicity.md`. The machine-readable packet inventory
lives in `docs/governance/adoption-canonicity.manifest.json` and is validated
by `scripts/adoption-canonicity-check.mjs`.

The allowed evidence model is privacy-first hybrid evidence: manual research,
dogfooding, public/community signals, issue/support feedback, and explicit
opt-in feedback packets. Telemetry remains disabled by default. Private
research artifacts stay outside public repositories; public manifests may store
only aliases, hashes, dates, summaries, and approval metadata.

Capability maturity promotion now requires packet evidence for `beta` and
`stable` entries. Programmatic inspection is available through
`claw inspect canonicity --json`.

## Performance Impact

This decision adds static manifest validation and read-only CLI inspection. It
does not add runtime telemetry, background loops, network calls, persistent
processes, or user-device measurement. CPU, RAM, disk, network, battery, and
idle impact are bounded to local documentation checks and small JSON reads.

## Decision Tensions

- **Prioritized axes**: constitutional honesty, privacy, user comprehension,
  durable governance, and promotion correctness.
- **Constrained axes**: speed of declaring features stable or canonical is
  intentionally limited only at promotion boundaries.
- **Tradeoffs accepted**: teams must maintain evidence packets; this is
  acceptable because unearned canonicity claims are a product correctness bug.
- **Debt or pending evidence**: existing mass adoption is not claimed. Current
  seed evidence proves stable-shell understandability governance, not full I.1
  market canonicity.

## Source Decision Audit

Recorded in `docs/governance/source-decision-audits.registry.json` as
`adoption-canonicity-governance-p0` with state `implemented`.

## Surface Parity

- **Human surface**: `docs/governance/adoption-canonicity.md`, this ADR,
  decision-map routing, and future Clawix UI promotion reviews.
- **Programmatic surface**: `claw inspect canonicity --json`,
  `scripts/adoption-canonicity-check.mjs`, and capability maturity audit
  failures.

## Discovery Route

- **Canonical name**: `adr:adoption-canonicity-governance`.
- **AGENTS/CLAUDE**: `AGENTS.md` -> `docs/decision-map.md`.
- **Skill**: `adoption-canonicity-review`.
- **Search terms**: adoption canonicity, stable promotion packet, any-human
  evidence, PMF adoption governance, `claw inspect canonicity`.
- **Persistence**: `docs/governance/adoption-canonicity.manifest.json`, schema,
  fixtures, and adoption packet ids referenced from promotion decisions.
- **Gaps**: opt-in metric ingestion is optional future work; no telemetry is
  added by this ADR.
- **Validation**: `scripts/adoption-canonicity-check.mjs --self-test`, CLI
  inspect tests, capability maturity tests, and discoverability/docs checks.

## Adoption And Canonicity

This ADR is the authorizing governance decision. It does not claim that Clawix
already has mass adoption. Future stable/canonical/any-human/PMF claims must
reference an adoption/canonicity packet.

## Discovery Route

- **Canonical name**: `adr:adoption-canonicity-governance`.
- **AGENTS/CLAUDE**: root agent entrypoints route major product and UX
  governance through the Constitution, decision map, and governance doctor.
- **Skill**: `adoption-canonicity-review`.
- **Docs router**: `docs/decision-map.md` and `docs/constitution-map.md`.
- **CLI/check**: `claw inspect canonicity --json`,
  `claw search "adoption canonicity" --json`, and
  `scripts/adoption-canonicity-check.mjs`.
- **Registry**: `docs/discoverability.registry.json`.
- **Operational coverage**: `docs/adr-operational-coverage.manifest.json`
  defaults plus the adoption/canonicity validator.

## Consequences

Future promotion work must choose conservative maturity labels until evidence
exists. `canonical` remains a high bar: adoption plus standardization. The
project can still experiment quickly, but it can no longer convert aspiration
into canonicity without a feedback loop and reviewable evidence.
