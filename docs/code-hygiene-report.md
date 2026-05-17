# Code Hygiene Report

Status: PARTIAL bootstrap.

- Blocking findings: 0 recorded in bootstrap report.
- Report-only findings: 349 in the latest local audit summary.
- Baselined findings: 3 baseline entries covering reviewed ClawJS built-in family barrel and dynamic-runtime findings.
- Full cleanup campaign: pending.
- Report-only audit command: `node scripts/code-hygiene-audit.mjs`.
- Report-only Knip command: `node scripts/code-hygiene-knip.mjs`.
- Report-only Periphery command: `node scripts/code-hygiene-periphery.mjs`.
- Latest audit summary: 10,020 files scanned; 222 TODO/FIXME/HACK/XXX findings; 39 duplicate asset groups covering 187 files; 88 unreferenced asset candidates.
- Latest Knip summary: 134 files with issues; 706 total findings after removing clear unused workspace dependencies, normalizing root VitePress/Vue/tsx ownership, calibrating entry/project ownership for templates/public CSS/website assets/generated fixtures, removing reviewed dead one-line stubs and retired CLI bin shims, reducing Discord test catalog, Secrets crypto/shared DTOs, secrets plugin helper types/session cache store, Bridge server/platform/job-handler helpers, Memory CLI/workspace/type helpers, ERP shared contract/db helper internals, provider-local integration runtime/source aliases, Publishing CLI/config/db/id/app helpers, Execution shared DTOs, IoT tool registry helpers, Publishing schema/channel helpers, Apps store helpers, private shared DTO aliases, integration runtime helper exports, CLI JSON helper wrappers, runtime plugin bridge helpers, CLI runtime metadata helpers, project scaffold helpers, chat CLI helpers, report-governance helpers, memory CLI helpers, references storage helpers, style/template surface/schema helpers, audio catalog legacy naming, database store-helper, v1 data wrapper/core, slides, database magic, style schema, agent plan, time logic, and Execution/Relay protocol helper exports to externally imported APIs only, reducing dependency/devDependency/file findings to zero, and keeping reviewed dynamic runtime findings baselined.
- Latest Periphery summary: external pending; 2 Swift packages discovered; Periphery 3.7.4 binary not installed on PATH.

This report is the human-readable pair for `docs/code-hygiene-report.json`.
