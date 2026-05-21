# ADR 0052: ADR number reservation governance

Status: Accepted

Date: 2026-05-21

## Context

ADR numbers are stable public references used by docs, checks, discovery,
surface registries, and Clawix mirrors. Historical docs allowed two ADRs to
claim the same number when their paths differed, which made CLI discovery,
decision-map rows, and cross-repository references ambiguous.

## Decision

Every ADR number is reserved before an ADR is written. The reservation is a
repo-local file at `docs/adr/reservations/NNNN.json`, created by
`scripts/adr-reserve.mjs` with exclusive file creation. ADR acceptance is
blocked unless the number is unique, the path slug is valid, the heading matches
the reserved number, the reservation points back to the ADR path, and accepted
ADR references are coherent across the decision map, discoverability registry,
and operational coverage manifest.

Historical duplicate numbers are renumbered once at the end of the sequence so
old ambiguity does not become a permanent exception. Future ADRs must use the
reservation script rather than manually choosing the next number.

## Threat Model Impact

This is governance metadata, not a runtime security boundary. It reduces
supply-chain and agent-routing risk by making durable decisions unambiguous and
machine-checkable. It does not expose secrets, credentials, host permissions, or
provider data.

## Performance Impact

The guard runs over local docs and JSON files during documentation validation.
It is bounded by the number of ADR files and reservation files, does no network
work by default, and adds no product runtime cost.

## Decision Tensions

- **Prioritized axes**: deterministic governance, traceable decision routing,
  cross-repo Clawix mirror alignment, and agent-safe automation.
- **Constrained axes**: manual convenience is constrained; authors must reserve
  before drafting accepted ADRs.
- **Tradeoffs accepted**: historical ADR references must be renumbered once,
  which creates mechanical churn, but removes permanent duplicate-number debt.
- **Debt or pending evidence**: no historical duplicate-number baseline remains;
  future improvements may expose a public `claw adr reserve` command.

## Adoption And Canonicity

This ADR does not claim broad user adoption or stable product capability. It is
canonical repository governance for ADR numbering.

## Source Decision Audit

This records the 2026-05-21 conversation-derived decision to reserve ADR
numbers atomically and fail checks by duplicate number, invalid slug, missing
decision-map routing, and broken cross references. The public artifacts are this
ADR, the reservation script, reservation files, decision-map rows, registry
entries, and checker self-tests.

## Surface Parity

- **Human surface**: `docs/decision-map.md`, this ADR, `docs/adr/TEMPLATE.md`,
  and the ADR maintenance skills tell authors to reserve before drafting.
- **Programmatic surface**: `scripts/adr-reserve.mjs` creates reservations, and
  `scripts/adr-operational-coverage-check.mjs` validates reservations and
  accepted ADR routing.
- **Persistence**: `docs/adr/reservations/NNNN.json` stores the reservation
  contract beside ADR docs.
- **Gaps**: a first-class `claw adr reserve` command is optional future work,
  not required for this decision.
- **Validation**: checker self-tests cover duplicate numbers, invalid slugs,
  missing reservations, orphan reservations, heading/path mismatch, and accepted
  ADR routing failures.

## Discovery Route

- **Canonical name**: `adr:adr-number-reservation-governance`.
- **AGENTS/CLAUDE**: `AGENTS.md` routes durable decisions to
  `docs/decision-map.md`, which routes accepted ADR governance here.
- **Skill**: `adr-to-guardrail` and `decision-map-maintenance`.
- **Docs router**: `docs/decision-map.md`.
- **CLI/check**: `scripts/adr-reserve.mjs` and
  `scripts/adr-operational-coverage-check.mjs`.
- **Registry**: `docs/discoverability.registry.json`.
- **Operational coverage**: `docs/adr-operational-coverage.manifest.json`.

## Consequences

ADR creation becomes a two-step transaction: reserve the number, then write the
ADR and routing metadata. The operational coverage check fails on ambiguous ADR
identity before agents or humans rely on an unstable reference.
