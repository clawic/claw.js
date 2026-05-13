# Testing Matrix

This matrix is the working checklist for completing the testing architecture in
ADR 0002. A row is complete only when the listed lanes have real coverage,
fixtures are synthetic, and any missing physical dependency is recorded in
`qa/scenarios`.
Coverage budgets live in `qa/coverage-budgets.json` and are enforced by
`npm run test:policy`.

| Boundary | Primary lane | Release lane | Evidence |
| --- | --- | --- | --- |
| Contracts and schemas | `test:fast` | `test:release` | Vitest tests under `packages/*/src`, type tests, generated fixtures |
| Storage and migrations | `test:fast`, `test:integration` | `test:release` | Storage Vitest tests, sqlite fixture tests, migration tests |
| CLI and public API | `test:fast`, `test:e2e` | `test:release` | CLI Vitest tests, Playwright E2E, package-surface checks |
| Daemon and bridge | `test:fast`, `test:integration` | `test:release` | Bridge Vitest tests, fake Codex runtime, local process fixtures |
| Browser UI | `test:e2e` | `test:release` | Playwright suites in `tests/e2e` and app-specific E2E roots |
| Host and permissions | `test:host` | `test:release` | Signed host command hook or `EXTERNAL PENDING` QA scenario |
| Device clients | `test:device` | `test:release` | Device hook or `EXTERNAL PENDING` QA scenario |
| Live integrations | `test:live` | opt-in only | Requires `CLAW_TEST_LIVE=1` and synthetic or approved external state |

## Completion Rules

- `changed` is the normal blocking gate for local work.
- `release` must include privacy, policy, fast, integration, build, docs, pack,
  E2E, and host/device state.
- `live` is never part of default CI or release unless explicitly requested.
- `QUARANTINED` entries must live in `qa/quarantine.json` with owner, reason,
  repair path, and expiry.
- Expired quarantines fail `test:policy`.
- Test artifacts must stay under ignored paths such as `test-results/`,
  `artifacts/`, `coverage/`, `.tmp/`, and lane-specific output folders.
