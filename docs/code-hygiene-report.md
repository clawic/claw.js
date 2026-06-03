# Code Hygiene Report

Status: active.

JSON pair: `docs/code-hygiene-report.json`.

- Blocking findings: 0
- Report-only findings: 24
- Baselined findings: 5
- Scanned files: 7742
- TODO/FIXME/HACK/XXX findings: 0
- Duplicate asset groups: 24
- Duplicate asset files: 65
- Unreferenced asset candidates: 0

Knip and Periphery remain report-only; see the JSON pair for current summaries and external-pending tool state.

Notes:
- Initial cleanup completed: blocking findings are zero, actionable TODO/FIXME/HACK/XXX findings are zero, and unreferenced asset candidates are zero after worktree/generated/public asset calibration and removal of the iOS all-projects placeholder.
- Use scripts/code-hygiene-audit.mjs for report-only TODO, duplicate asset, and unreferenced asset candidate findings.
- Use scripts/code-hygiene-periphery.mjs for report-only Swift package calibration once the pinned binary is available.
