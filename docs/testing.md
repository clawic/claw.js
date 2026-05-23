# Testing

ClawJS uses boundary-based test lanes. The canonical policy is
[ADR 0002](adr/0002-testing-architecture.md).

## Lanes

- `npm run test:fast`: hermetic TypeScript unit/integration checks that should
  be safe during normal development.
- `npm run test:changed`: the normal blocking gate for a focused change.
- `npm run test:integration`: package and service integration tests that do not
  require real external services.
- `npm run test:e2e`: local end-to-end checks, including Playwright browser
  coverage where applicable.
- `npm run test:host`: signed-host checks through `CLAW_HOST_TEST_COMMAND`, or
  `EXTERNAL PENDING` when no physical host hook is configured.
- `npm run test:device`: device checks through `CLAW_DEVICE_TEST_COMMAND`, or
  `EXTERNAL PENDING` when no device hook is configured.
- `npm run test:live`: opt-in live checks. Requires `CLAW_TEST_LIVE=1`.
- `npm run test:policy`: policy guard for matrix/scenarios, quarantine expiry,
  and ignored artifact paths.
- `npm run test:release`: privacy, fast, integration, build, docs, pack, and
  E2E release gate.

Canonical `npm run test:<lane>` commands enter through the agent coordination
ledger before running. A busy lane returns `PENDING` quickly and records demand
instead of running a duplicate suite or waiting in a spin loop. Use
`claw test plan --lane <lane> --json` to inspect the declared checks and
`claw test status --json` to inspect active leases.

The ClawJS public coordination manifest is
`qa/agent-coordination.manifest.json`. Each check declares its lane command,
cost class, real-service risk, path/fingerprint inputs, required resources,
reuse policy, external-pending policy, failure action, and repair policy.

## Boundaries

Prefer the narrowest real boundary that proves behavior:

- pure framework logic: Vitest near source;
- CLI and storage contracts: Vitest or local process tests with synthetic
  fixtures;
- browser workflows: Playwright;
- external integrations: hermetic fixtures by default, live tests only by
  explicit opt-in;
- host behavior: Clawix/Claw host scenarios, not framework-only tests.

## Status Labels

Use `PASS`, `FAIL`, `PARTIAL`, `EXTERNAL PENDING`, and `QUARANTINED` when
recording validation. `EXTERNAL PENDING` is valid only when the missing piece is
physical or external and the local contract is still covered by tests.

## Quarantine

Quarantines live in `qa/quarantine.json`. Each entry needs `id`, `owner`,
`reason`, `repair`, and `expires`. Expired entries fail `npm run test:policy`.
