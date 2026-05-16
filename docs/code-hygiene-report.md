# Code Hygiene Report

Status: PARTIAL bootstrap.

- Blocking findings: 0 recorded in bootstrap report.
- Report-only findings: 349 in the latest local audit summary.
- Baselined findings: 0.
- Full cleanup campaign: pending.
- Report-only audit command: `node scripts/code-hygiene-audit.mjs`.
- Report-only Knip command: `node scripts/code-hygiene-knip.mjs`.
- Report-only Periphery command: `node scripts/code-hygiene-periphery.mjs`.
- Latest audit summary: 10,020 files scanned; 222 TODO/FIXME/HACK/XXX findings; 39 duplicate asset groups covering 187 files; 88 unreferenced asset candidates.
- Latest Knip summary: 2,981 files with issues; 4,190 total findings after removing two clear unused workspace dependencies.
- Latest Periphery summary: external pending; 2 Swift packages discovered; Periphery 3.7.4 binary not installed on PATH.

This report is the human-readable pair for `docs/code-hygiene-report.json`.
