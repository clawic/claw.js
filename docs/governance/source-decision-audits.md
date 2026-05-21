# Source Decision Audit Governance

Source decision audits are the public-safe bridge between architectural choices
made in conversation and the repository evidence that closes them. They prevent
durable architecture from depending on session memory alone.

## Contract

Any future conversation decision that changes durable architecture,
governance, data, security, agents, interfaces, routes, storage, public
surfaces, or validation policy must be represented by a source decision row
until it reaches a closed state. Continuation-only messages do not need rows
unless they change scope, constraints, or closure criteria.

Rows use this state vocabulary:

- `implemented`: the decision is implemented and has public-safe evidence refs.
- `documented`: the decision is intentionally docs/process-only and has
  public-safe canon or process evidence refs.
- `blocked`: the decision cannot close yet and has a blocker reason, reentry
  condition, and remaining work.
- `superseded`: a later decision replaced it and the row names the replacement.

Every new row records a stable decision id, source conversation id,
public-safe source anchor, architecture impact, state, evidence refs, and a
review timestamp. Public artifacts may store conversation ids, aliases,
message or line anchors, hashes, and evidence refs; they must not publish
private session paths, local machine paths, secrets, credentials, or raw source
transcripts.

## Closure Rule

A goal or architecture change cannot be marked complete while a
conversation-made architecture decision is missing from its source decision
audit, while an `implemented` or `documented` row lacks evidence refs, while a
`blocked` row lacks remaining-work and reentry details, or while a `superseded`
row lacks the replacing decision or artifact reference.

## Selective Historical Backfill

The registry stays forward-only for normal future work. The explicit
`selectiveHistoricalBackfill` exception is for discovered historical P0/P1
decisions whose closure impact would otherwise depend on memory, private
sessions, or reinterpreted docs. Eligible backfills affect durable
architecture, security/privacy/legal, storage, permissions, release gates,
rescue/compatibility, native control, governance, or public activation.

Historical backfill seeds must name `historicalBackfill`, `backfillTier`,
`backfillReason`, and a stable public-safe `backfillArtifactRef`. This is not a
full historical audit. When old P0/P1 closure-impacting decisions are found,
they must either be added as selective backfill seeds or explicitly left out of
scope with a public-safe reason.

## Seed Precedents

`docs/governance/source-decision-audits.registry.json` records the initial
forward-only seed set. The first version does not backfill every historical
conversation. It registers existing source Q/A and source audit patterns as
precedents for future governance:

- Dense Data source audit.
- Remote Gateway Sync source review.
- System Telemetry source review.
- V1 Surface Closure decision review.
- Clawix UI Governance, System Telemetry, and V1 Surface Closure mirrors.

`scripts/source-decision-audit-check.mjs` validates this contract and the
registered seed artifacts. Clawix mirrors app/host-owned evidence with
`scripts/source_decision_audit_check.mjs`.
