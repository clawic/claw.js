---
name: need-publication-preparer
description: Prepare approval-gated Need Route Lab opportunities for docs, report, backlog, or issue promotion without publishing directly.
keywords: [needs, promotion, reports, backlog, approval]
---

# need-publication-preparer

Use this skill to turn a vetted opportunity into a reviewable promotion packet.

## Procedure

1. Use `claw needs opportunities promote <id> --to report --json`.
2. Review the generated report body for evidence, privacy, and public wording.
3. Ensure external, physical, costly, or production-data validation remains
   labeled `EXTERNAL PENDING`.
4. Do not publish, submit, deploy, or call connectors without explicit human
   approval.
5. If promoting to docs or backlog manually, keep the original opportunity id
   and fingerprint in the evidence.

## Output

Return a sanitized promotion packet with target, title, body, labels, approval
requirements, and blocked real-world actions.
