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
- Latest summary: 168 files with issues; 773 total findings across owners, unlisted, types, exports, and duplicates after removing clear unused workspace dependencies, moving root VitePress/Vue ownership to `website`, declaring direct root `tsx` usage, calibrating the Vitest coverage provider, mapping top-level app/module workspaces to their own package manifests with explicit entry/project shapes, reducing Discord test catalog, Secrets crypto/shared DTOs, secrets plugin helper types, bridge server/platform/job-handler helpers, Execution shared DTOs, IoT tool registry helpers, Publishing schema/channel helpers, Apps store helpers, private shared DTO aliases, integration runtime helper exports, CLI JSON helper wrappers, runtime plugin bridge helpers, CLI runtime metadata helpers, project scaffold helpers, scaffold execution helpers, chat CLI helpers, report-governance helpers, memory CLI helpers, references storage helpers, style/template surface/schema helpers, database store-helper, v1 data wrapper/core, slides, database magic, style schema, agent plan, time logic, and Execution/Relay protocol helper exports to externally imported APIs only, expanding memory/modules service entry ownership, calibrating tool/config/script/public asset entrypoints, and deleting reviewed unused files. Dependency, devDependency, unresolved, and file findings are currently zero; the two remaining unlisted findings are reviewed dynamic runtime cases.
- Baseline: `clawjs-core-builtin-family-barrels-2026-05-17`, `clawjs-relay-browser-host-playwright-2026-05-17`, and `clawjs-bridge-optional-iroh-runtime-2026-05-17` cover reviewed public API and dynamic-runtime findings until 2026-08-15.
- Mode: report-only; cleanup and baselining pending before blocking gate activation.

## 2026-05-17 - Periphery report-only setup

- Status: EXTERNAL PENDING
- Tool: Periphery 3.7.4 through `scripts/code-hygiene-periphery.mjs`.
- Latest summary: 2 Swift packages discovered; local Periphery binary not installed on PATH, so no Swift findings have been calibrated yet.
- Retention rules: public API, SwiftUI previews, Objective-C-accessible declarations, and Codable properties retained by default.
- Mode: report-only; no automatic removal and no blocking gate yet.

## 2026-05-17 - ClawJS release gate wiring

- Status: PARTIAL
- Scope: ClawJS CI/release gate.
- Work recorded: GitHub release workflow runs the canonical `test:release` lane and package publish dry-run on pull requests to `main`, `next`, and `release/**`, plus manual dispatch.
- Remaining: Clawix release proof remains pending before `ci_gate` can be marked fully implemented across the agreed Clawix + ClawJS scope.
