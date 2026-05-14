# Integration QA Lab

Integration QA Lab is the standard for proving connector quality across
hermetic tests, live smoke tests, manual provider scenarios, and policy-blocked
flows. It prevents a connector from silently meaning "a few actions we chose"
when the provider exposes a much larger official API.

## Required Profile

Each connector profile must include:

- Official provider surface snapshot: source URL, version/date, methods,
  events, sources, and provider-specific delivery modes.
- Coverage matrix: every official surface is classified as `implemented`,
  `fixture_only`, `live_smoke`, `manual_only`, `unsupported_by_policy`, or
  `deprecated`.
- Fixture harness: request plans, response parsing, source extraction,
  pagination, idempotency, error payloads, and rate-limit metadata.
- Live harness: opt-in only, brokered credential leases, disposable provider
  state, and no plaintext token exposure.
- Manual scenarios: phones, account roles, payments, destructive state,
  public webhooks, uploaded provider assets, or anything that cannot be safely
  automated.
- Validation report: every row ends as `PASS`, `PARTIAL`, `FAIL`,
  `EXTERNAL PENDING`, or policy-blocked.

## Default Safety Policy

Default CI and release lanes are hermetic. They must not inherit live
credentials from the shell, send real prompts, touch production data, consume
paid APIs, or mutate real external accounts. Live runs require explicit
operator approval and `CLAW_TEST_LIVE=1`.

Secrets are references. Live connector execution resolves them through a
capability broker and short-lived lease. Plaintext secret resolution inside an
ordinary connector runtime is a policy failure.

## Telegram Pilot

Telegram is the reference pilot. Its official Bot API 10.0 method snapshot and
coverage matrix live in:

- `packages/clawjs-integrations/src/telegram-official-api-matrix.ts`
- `packages/clawjs-integrations/src/telegram-official-api-matrix.test.ts`
- `qa/scenarios/telegram-integration-qa-lab.md`

The current matrix intentionally distinguishes:

- implemented methods with offline request-plan tests and brokered live
  eligibility;
- official methods that are visible but not yet exposed by the connector;
- manual-only methods involving payments, webhooks, uploaded assets,
  destructive account/chat state, or physical/provider-side setup;
- policy-blocked managed-bot token methods that cannot run until the broker
  can mint auditable scoped leases.
