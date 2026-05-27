# Test Docs Report

`npm run test:docs -- --report-all` runs the docs guard lane in enumeration
mode. The normal `npm run test:docs` path remains fail-fast.

Enumeration mode writes `.test-docs-report.json` at the repository root and
exits with status 0 even when guards fail. This lets agents capture inherited
docs-lane failures before starting cleanup work.

The report is a JSON array:

```json
[
  {
    "guard": "source-size-check",
    "target": "scripts/source-size-check.mjs",
    "signature": "exit=1 command=node ./scripts/source-size-check.mjs :: Source size baseline drift",
    "ts": "2026-05-27T00:00:00.000Z"
  }
]
```

Fields:

- `guard`: stable guard name derived from the script or npm script.
- `target`: script, package script, or command target that failed.
- `signature`: normalized exit status plus diagnostic output, with timestamps,
  local repo paths, temporary paths, and line-column spans normalized.
- `ts`: ISO timestamp for the report run.

Report mode is observational. It records failures; it does not update
baselines or fix the failed guards.
