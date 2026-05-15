---
name: need-opportunity-triager
description: Dedupe, score, relate, and prioritize Need Route Lab opportunities before backlog or report promotion.
keywords: [needs, triage, dedupe, scoring, backlog]
---

# need-opportunity-triager

Use this skill when Need Route Lab opportunities need prioritization.

## Procedure

1. Read the local ledger with `claw needs opportunities list --json`.
2. Run `claw needs opportunities dedupe --json` before recommending new work.
3. Score by impact, frequency, risk reduction, leverage, and confidence.
4. Preserve graph relations such as depends_on, duplicates, blocks, extends,
   validates, and documents.
5. Keep noisy, unclear, or externally blocked opportunities in candidate,
   parked, or observed_gap until evidence improves.

## Output

Return a ranked list with canonical opportunity ids, duplicate ids, state
recommendations, and next validation steps.
