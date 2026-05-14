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
- Package/live harness: install the candidate package in a temporary consumer
  project before invoking any live broker command or forwarding a lease.
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

`npm run test:package-live` is the package/live install check. It packs and
installs `@clawjs/integrations` into a temporary project, verifies the installed
public exports, and only then allows an approved broker command through
`CLAW_TEST_LIVE=1` and `CLAW_LIVE_BROKER_COMMAND`. Raw Telegram token
environment variables are rejected by the harness. When a broker command is
provided, the harness sets `CLAWJS_LIVE_REPORT_PATH` and requires the command
to write a Telegram live report with provider `telegram_bot_api`, at least one
`PASS` row, no `FAIL` or `QUARANTINED` rows, and
`credentialLeaseReleased=true`. Docker validation is opt-in through
`CLAWJS_PACKAGE_LIVE_DOCKER=1` and is reported as `EXTERNAL PENDING` when
Docker is unavailable or not requested.

Telegram's brokered smoke harness is exported as `runTelegramBrokeredLiveSmoke`.
It covers read-only `getMe` and `getUpdates`, disposable send/edit/delete,
synthetic photo send/delete, and explicit pending rows for webhook loopback,
admin authorization, payments, Passport, and managed-bot token flows.

`packages/clawjs-integrations/fixtures/telegram-official-api-10.0-surface.json`
is the official-surface fixture snapshot for rows that are not implemented yet.
`npm run test:qa-scenarios` compares it against the TypeScript matrix, so a new
official method or update field cannot be silently left without fixture
evidence.

## Telegram Pilot

Telegram is the reference pilot. Its official Bot API 10.0 method snapshot and
coverage matrix live in:

- `packages/clawjs-integrations/src/telegram-official-api-matrix.ts`
- `packages/clawjs-integrations/src/telegram-official-api-matrix.test.ts`
- `qa/scenarios/telegram-integration-qa-lab.md`

The current matrix intentionally distinguishes:

- implemented methods with offline request-plan tests and brokered live
  eligibility;
- official `Update` fields that are already extracted into source events from
  update fields that are only visible in the provider snapshot;
- official methods that are visible but not yet exposed by the connector;
- manual-only methods involving payments, webhooks, uploaded assets,
  destructive account/chat state, or physical/provider-side setup;
- policy-blocked managed-bot token methods that cannot run until the broker
  can mint auditable scoped leases.
