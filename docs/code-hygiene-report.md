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
- Latest Knip summary: 383 files with issues; 1,343 total findings after removing clear unused workspace dependencies, normalizing root VitePress/Vue/tsx ownership, calibrating the Vitest coverage provider, mapping top-level app/module workspaces to their own package manifests with explicit entry/project shapes, dropping reviewed direct app/database dependencies now provided by actual imports, expanding memory/modules service entry ownership, updating package locks, reducing dependency/devDependency findings to zero, and keeping two reviewed dynamic runtime findings baselined.
- Latest Periphery summary: external pending; 2 Swift packages discovered; Periphery 3.7.4 binary not installed on PATH.

This report is the human-readable pair for `docs/code-hygiene-report.json`.
