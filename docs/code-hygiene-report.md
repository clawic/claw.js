# Code Hygiene Report

Status: PARTIAL bootstrap.

- Blocking findings: 0 recorded in bootstrap report.
- Report-only findings: 349 in the latest local audit summary.
- Baselined findings: 1 baseline entry covering 562 ClawJS built-in family barrel findings.
- Full cleanup campaign: pending.
- Report-only audit command: `node scripts/code-hygiene-audit.mjs`.
- Report-only Knip command: `node scripts/code-hygiene-knip.mjs`.
- Report-only Periphery command: `node scripts/code-hygiene-periphery.mjs`.
- Latest audit summary: 10,020 files scanned; 222 TODO/FIXME/HACK/XXX findings; 39 duplicate asset groups covering 187 files; 88 unreferenced asset candidates.
- Latest Knip summary: 528 files with issues; 1,629 total findings after removing two clear unused workspace dependencies, normalizing root VitePress/Vue/tsx ownership, calibrating the Vitest coverage provider, mapping top-level app/module workspaces to their own package manifests, and removing generated Secrets UI source outputs.
- Latest Periphery summary: external pending; 2 Swift packages discovered; Periphery 3.7.4 binary not installed on PATH.

This report is the human-readable pair for `docs/code-hygiene-report.json`.
