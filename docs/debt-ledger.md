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
claw debt audit --json
claw debt sources --json
claw inspect debt-ledger --json
claw search "debt pending ledger external pending lateral_debt" --json
```

The first version is report-only. It returns warnings, unindexed candidates,
expired entries, duplicate fingerprints, and a private summary hint, but it does
not block CI by itself.

Public mode reads only redacted repository artifacts. Private `.codex` goals,
sessions, inbox directives, dirty work, and automation memory are intentionally
excluded from public output and must be aggregated by the private Clawix overlay
runner.

Normalized classifications are `direct_blocker`, `lateral_debt`,
`external_pending`, `baseline_exception`, `pre_existing_dirty`,
`inbox_followup`, and `goal_blocker`.
