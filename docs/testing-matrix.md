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
| Surface parity | `test:docs`, `test:policy`, relevant human/programmatic lane | `test:release` | Interface Matrix coverage, CLI registry/router parity guard, registry/inspect output, at least one human path and one SDK/CLI/API/MCP/Relay path |
| Live integrations | `test:live` | opt-in only | Requires `CLAW_TEST_LIVE=1`, brokered credential leases, disposable or approved external state, and an Integration QA Lab scenario |
| Package/live connector harness | `test:package-live` | opt-in only | Packs and installs the candidate connector package before any approved broker command can run; Docker check is opt-in |
| Integration QA scenarios | `test:qa-scenarios` | `test:release` | Builds integrations and validates Telegram matrix, live-smoke scenario coverage, report vocabulary, gates, and `EXTERNAL PENDING` docs |
| Connector official API coverage | `test:fast`, `test:policy` | `test:release` | Integration QA Lab coverage matrices such as Telegram Bot API 10.0 under `packages/clawjs-integrations/src/*official-api-matrix*` |

## Completion Rules

- `changed` is the normal blocking gate for local work.
- `release` must include privacy, policy, fast, integration, build, docs, pack,
  E2E, and host/device state.
- `live` is never part of default CI or release unless explicitly requested.
- Important capabilities require at least one human-path validation and one
  programmatic-path validation. Missing paths must be reported as `PARTIAL`,
  `EXTERNAL PENDING`, `blocked`, or `not applicable`.
- Connector completeness requires an official provider-surface matrix plus
  fixture, brokered-live, manual-only, and policy-blocked classifications.
- `QUARANTINED` entries must live in `qa/quarantine.json` with owner, reason,
  repair path, and expiry.
- Expired quarantines fail `test:policy`.
- Test artifacts must stay under ignored paths such as `test-results/`,
  `artifacts/`, `coverage/`, `.tmp/`, and lane-specific output folders.
