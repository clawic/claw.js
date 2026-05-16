# Code Hygiene Ledger

This ledger records code hygiene campaigns, exceptions, and validation evidence.

Source conversation: `019e2bee-b635-7c51-b569-bd31b3cca875`
Source session: private session, not published

## 2026-05-17 - Program bootstrap

- Status: PARTIAL
- Scope: Clawix + ClawJS.
- Work recorded: policy, baseline, report format, decision checklist, and skills/check scaffolding.
- Cleanup campaign: pending.
- Blocking gate activation: pending until existing blocking debt is cleaned.
- Validation evidence: `npm run test:docs` passed with code hygiene check/self-test and audit self-test.

## 2026-05-17 - Report-only audit expansion

- Status: PARTIAL
- Scope: TODO/FIXME/HACK/XXX, byte-identical duplicate assets, and unreferenced asset candidates.
- Mode: report-only; no automatic removal and no blocking gate yet.
- Latest summary: 10,020 files scanned; 222 TODO/FIXME/HACK/XXX findings; 39 duplicate asset groups covering 187 files; 88 unreferenced asset candidates.
- Cleanup campaign: pending classification/removal by repo and category.

## 2026-05-17 - Knip report-only calibration

- Status: PARTIAL
- Tool: Knip 6.14.0 through `scripts/code-hygiene-knip.mjs`.
- Config: `knip.json`.
- Latest summary: 2,982 files with issues; 4,193 total findings across files, dependencies, devDependencies, binaries, unlisted, unresolved, exports, types, duplicates, and ownership metadata.
- Mode: report-only; cleanup and baselining pending before blocking gate activation.
