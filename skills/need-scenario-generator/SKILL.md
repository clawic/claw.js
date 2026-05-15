---
name: need-scenario-generator
description: Generate composable Need Route Lab scenarios from human needs, domains, target surfaces, autonomy preferences, and validation constraints.
keywords: [needs, scenarios, routes, coverage, product]
---

# need-scenario-generator

Use this skill to expand a broad human need into Need Route Lab routes.

## Procedure

1. Start from `claw needs dimensions --json` and `claw needs pilots --json`.
2. Choose dimensions explicitly; do not encode a whole workflow as prose only.
3. Prefer dry-run or fixture validation unless the user approved real services.
4. Include acceptance signals that an agent can verify later.
5. Mark hardware, remote providers, paid APIs, production data, or native
   permissions as `EXTERNAL PENDING` unless a safe host-owned path exists.

## Output

Return route candidates with the selected dimension values, expected outcome,
acceptance signals, and validation mode.
