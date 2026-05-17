# Code Hygiene Ledger

This ledger records code hygiene campaigns, exceptions, and validation evidence.

Source conversation: `019e2bee-b635-7c51-b569-bd31b3cca875`
Source session: private session, not published

## 2026-05-17 - Program bootstrap

- Status: ACTIVE
- Scope: Clawix + ClawJS.
- Work recorded: policy, baseline, report format, decision checklist, and skills/check scaffolding.
- Initial cleanup completed: zero blocking findings, zero actionable TODO/FIXME/HACK/XXX findings, and zero unreferenced asset candidates.
- Blocking gate activation: active for clear mechanical debt through changed/release hygiene checks; semantic duplicates and external Swift calibration remain report-only or external pending.
- Validation evidence: `npm run test:docs` passed with code hygiene check/self-test and audit self-test.

## 2026-05-17 - Report-only audit expansion

- Status: ACTIVE
- Scope: TODO/FIXME/HACK/XXX, byte-identical duplicate assets, and unreferenced asset candidates.
- Mode: report-only for duplicate assets; actionable TODO/FIXME/HACK/XXX and unreferenced asset candidates are kept at zero by the hygiene check.
- Latest summary: 6,926 files scanned; 0 TODO/FIXME/HACK/XXX findings; 24 duplicate asset groups covering 65 files; 0 unreferenced asset candidates.
- Calibration: local worktrees, generated bundles, and public/platform asset surfaces are excluded from actionable cleanup candidates.

## 2026-05-17 - Knip report-only calibration

- Status: PARTIAL
- Tool: Knip 6.14.0 through `scripts/code-hygiene-knip.mjs`.
- Config: `knip.json`.
- Latest summary: 58 files with issues; 567 total findings across owners, unlisted, exports, and duplicates after removing clear unused workspace dependencies, moving root VitePress/Vue ownership to `website`, declaring direct root `tsx` usage, calibrating the Vitest coverage provider, mapping top-level app/module workspaces to their own package manifests with explicit entry/project shapes, reducing Discord test catalog, Secrets crypto/shared DTOs, secrets plugin helper types/session cache store/server helpers, Notify auth/subscription/surface helpers, Wiki auth/access-policy helpers, bridge server/platform/job-handler helpers, Bridge Iroh remote endpoint type exposure, ClawJS node Telegram state filename alias, built-in catalog helper type aliases, session title alias duplication, package default-export aliases, session stream compatibility aliases, Memory CLI/workspace/type helpers, ERP shared contract/db helper internals, provider-local integration runtime/source aliases, Publishing CLI/config/db/id/app helpers, Execution shared DTOs/security/worker helpers, IoT tool registry/adapter helpers, Monitor config/schema helpers, Drive CLI/auth/realtime helpers, Feed auth helpers, Content form helper types, ClawJS node runtime/OpenClaw/secrets/Telegram/rules/schema helpers, Claw CLI/domain/open/reference/style/template/data helpers, Workspace/delegation/runtime helper internals, Drive/browser/relay/plugin helpers, Bridge/Relay shutdown and pairing follow-up, Publishing schema/channel helpers, Apps store helpers, private shared DTO aliases, integration runtime helper exports, CLI JSON helper wrappers, runtime plugin bridge helpers, CLI runtime metadata helpers, project scaffold helpers, scaffold execution helpers, chat CLI helpers, report-governance helpers, memory CLI helpers, audio catalog legacy naming, database CLI/store-helper, v1 data wrapper/core, slides, database magic, style schema, agent plan, time logic, and Relay protocol helper exports to externally imported APIs only, expanding memory/modules service entry ownership, calibrating tool/config/script/public asset entrypoints, and deleting reviewed unused files. Dependency, devDependency, unresolved, and file findings are currently zero; the two remaining unlisted findings are reviewed dynamic runtime cases.
- Baseline: `clawjs-core-builtin-family-barrels-2026-05-17`, `clawjs-core-stable-surface-alias-2026-05-17`, `clawjs-relay-browser-host-playwright-2026-05-17`, `clawjs-bridge-optional-iroh-runtime-2026-05-17`, and `clawjs-memory-server-dynamic-entrypoint-2026-05-17` cover reviewed public API, stable surface alias, dynamic-runtime, and memory launcher entrypoint findings until 2026-08-15.
- Mode: report-only for semantic export/API findings; clear dependency, devDependency, unresolved, and file findings are kept at zero.

## 2026-05-17 - Periphery report-only setup

- Status: EXTERNAL PENDING
- Tool: Periphery 3.7.4 through `scripts/code-hygiene-periphery.mjs`.
- Latest summary: 2 Swift packages discovered; local Periphery binary not installed on PATH, so no Swift findings have been calibrated yet.
- Retention rules: public API, SwiftUI previews, Objective-C-accessible declarations, and Codable properties retained by default.
- Mode: report-only until the pinned external binary is installed.

## 2026-05-17 - ClawJS release gate wiring

- Status: ACTIVE
- Scope: ClawJS CI/release gate.
- Work recorded: GitHub release workflow runs the canonical `test:release` lane and package publish dry-run on pull requests to `main`, `next`, and `release/**`, plus manual dispatch.
- Remaining: external lanes may still record `EXTERNAL PENDING`, but the code hygiene check is wired into changed/release validation.
