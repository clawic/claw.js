# Telegram Live Broker Runbook

Status: EXTERNAL PENDING

Boundary: approved live broker, Telegram Bot API, disposable provider state

## Purpose

Execute the real Telegram live lane only after a human operator provides
disposable Telegram state and an approved broker command. This runbook is the
manual bridge between hermetic evidence and a real provider `PASS`.

## Required External Inputs

- A broker command exposed through `CLAW_LIVE_BROKER_COMMAND`.
- A disposable Telegram bot token available only through the broker.
- A disposable private chat id for send/edit/delete and media smoke.
- A disposable group where the bot is administrator for manual admin checks.
- A provider-reachable HTTPS endpoint for webhook loopback checks.
- Explicit operator approval for payments, Passport, paid media, managed-bot
  token delegation, uploaded sticker assets, games, and destructive account or
  chat flows.

## Safety Rules

- Do not set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_TOKEN`, or `TELEGRAM_BOT_API` in
  the shell.
- Do not write raw tokens to files, logs, command history, npm scripts, Docker
  args, or JSON reports.
- Use disposable chats and delete test messages created by the smoke run.
- Keep cost policy `free_only` unless a separate approval explicitly allows a
  cost-bearing flow.
- Broker output must go to `CLAWJS_LIVE_REPORT_PATH`.

## Command Contract

The harness runs the broker command from a temporary installed-package
consumer with these environment variables:

- `CLAWJS_INTEGRATION_PACKAGE_READY=1`
- `CLAWJS_INTEGRATION_PACKAGE_DIR=<temporary installed consumer>`
- `CLAWJS_INTEGRATION_PACKAGE_TARBALL=<candidate integrations tarball>`
- `CLAWJS_LIVE_PROVIDER=telegram_bot_api`
- `CLAWJS_LIVE_REPORT_PATH=<required output JSON path>`

The broker command must write a JSON report to `CLAWJS_LIVE_REPORT_PATH` with:

- `provider: "telegram_bot_api"`
- `status: "PASS"` or `"PARTIAL"` when external manual rows remain
- `credentialLeaseReleased: true`
- `results[]` rows using only `PASS`, `PARTIAL`, or `EXTERNAL PENDING`
- at least one `PASS` row proving a real brokered provider call
- no `FAIL` or `QUARANTINED` rows

## Execution

1. Confirm the shell contains no raw Telegram token variables.
2. Confirm the broker command can acquire, heartbeat, audit, and release a
   short-lived Telegram credential lease.
3. Run:

   ```sh
   CLAW_TEST_LIVE=1 npm run test:live-brokered
   ```

4. Run Docker/package isolation when required:

   ```sh
   CLAWJS_PACKAGE_LIVE_DOCKER=1 npm run test:package-live
   ```

5. Review the generated broker report and move any missing physical provider
   setup into `EXTERNAL PENDING`.

## Completion Criteria

Telegram live validation can be upgraded from `PARTIAL` only when the report
contains brokered `PASS` rows for safe read/send/edit/delete/media/polling
checks and every remaining manual provider row is explicitly approved,
executed, policy-blocked, or recorded as `EXTERNAL PENDING`.
