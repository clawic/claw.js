---
name: need-coverage-auditor
description: Evaluate Need Route Lab routes against CLI, framework, storage, UI, docs, tests, validation, permission, and data coverage.
keywords: [needs, coverage, audit, gaps, validation]
---

# need-coverage-auditor

Use this skill to turn generated routes into evidence-backed gaps.

## Procedure

1. Run `claw needs evaluate --dry-run --json` for the relevant pilot or route.
2. Check related public surfaces with `claw inspect`, `claw search`, and
   collection/schema discovery before reading source directly.
3. Classify each gap as feature, subfeature, bug, refactor, test, docs, data,
   surface, validation, security, perf, or research.
4. Separate reproducible defects from `EXTERNAL PENDING` physical or external
   validation.
5. Add precise affected surfaces and acceptance evidence.

## Output

Return a deduped opportunity list with state, score, evidence, and validation
status.
