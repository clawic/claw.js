---
title: Debt Ledger
description: Federated report-only debt and pending ledger for ClawJS and Clawix public artifacts.
---

# Debt Ledger

The debt ledger is a federated index for debt, pending work, external validation
lanes, baselines, and goal blockers. It is not a replacement source of truth:
entries point back to the canonical artifact that owns the decision.

Use:

```bash
claw debt list --json
claw debt list --needs-action --json
claw debt list --severity P1 --release-effect blocks_release --json
claw debt audit --json
claw debt audit --strict --json
claw debt sources --json
claw inspect debt-ledger --json
claw search "debt pending ledger external pending lateral_debt" --json
```

The ledger is report-only by default. It returns warnings, missing-actionability
rows, alias hits, unindexed candidates, expired entries, duplicate fingerprints,
strict debt-control failures, and a private summary hint, but it does not block
CI by itself. `claw debt audit --strict --json` keeps the same payload shape and
returns a failing exit code when strict debt-control failures are present.

Public mode reads only redacted repository artifacts. Private `.codex` goals,
sessions, inbox directives, dirty work, and automation memory are intentionally
excluded from public output and must be aggregated by the private Clawix overlay
runner.

Normalized classifications are `direct_blocker`, `lateral_debt`,
`external_pending`, `baseline_exception`, `pre_existing_dirty`,
`inbox_followup`, and `goal_blocker`.

Actionable entries must expose `debtControl`: `ownerArea`, `expiresAt`,
`severity`, a numeric budget, and a release effect. Budgets declare `metric`,
`unit`, `current`, `maxAllowed`, `nextMaxAllowed`, `target`, and `cadence`; the
strict contract requires `nextMaxAllowed` to be lower than `maxAllowed`.
Release effects declare `mode`, `targets`, `gate`, and `reason`; P0/P1 entries
must use `blocks_release` or `blocks_growth`, so merely recording high-severity
debt cannot count as closure.

The ledger still normalizes older owner/review/expiry fields for report-only
visibility, but strict audit fails sources that do not declare `debtControl`
explicitly. Missing actionability stays visible in `claw debt audit --json` and
`claw debt list --needs-action --json`; warn-first output is a risk control, not
closure proof.

Alias terms such as `EXTERNAL PENDING`, `blocked-external-pending`,
`lateral_debt`, `pre_existing_dirty`, `goal sigue activo`, `deuda lateral`, and
`pendiente` are reported as normalized alias hits when they appear in indexed
governance sources. Historical prose does not need to be rewritten before the
ledger can report the canonical classification and status.
