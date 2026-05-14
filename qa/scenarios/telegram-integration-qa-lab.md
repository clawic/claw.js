# Telegram Integration QA Lab Scenario

Status: ACTIVE

Boundary: Telegram Bot API, connector runtime, live credentials

## Purpose

Verify Telegram as the pilot for complete connector coverage: official API
method and update-field mapping, hermetic request/source fixtures, brokered
live smoke checks, manual provider flows, and explicit `EXTERNAL PENDING`
reporting.

## Hermetic Evidence

- `packages/clawjs-integrations/src/telegram-official-api-matrix.test.ts`
- `packages/clawjs-integrations/src/telegram-operation-executor.test.ts`
- `packages/clawjs-integrations/src/telegram-source.test.ts`
- `packages/clawjs-integrations/src/runtime-coverage.test.ts`
- `packages/clawjs-integrations/fixtures/telegram-official-api-10.0-surface.json`

## Live Prerequisites

- `CLAW_TEST_LIVE=1`.
- A disposable Telegram bot token supplied through the capability broker, not
  through plaintext runtime input.
- A disposable private chat and, for admin methods, a disposable group where
  the bot is administrator.
- Explicit operator approval before payments, paid media, public webhook
  delivery, destructive account/chat changes, uploaded sticker assets, games,
  Passport flows, or managed-bot token flows.

## Steps

1. Run the hermetic package tests and confirm the official Bot API matrix has
   no missing or duplicate entries.
2. Run offline request/source fixture checks for implemented Telegram actions
   and sources.
3. Run `npm run test:qa-scenarios` to validate the official-surface fixture
   snapshot, live-smoke scenario list, report vocabulary, and sensitive gates.
4. Run `npm run test:package-live` to prove the candidate package installs in
   a temporary consumer before any broker command can receive live context.
5. If live prerequisites are available, request a brokered credential lease and
   run only disposable read/send/edit/delete smoke checks.
6. Mark manual-only and policy-blocked rows as `EXTERNAL PENDING` unless the
   exact physical/provider prerequisite is present and approved.
7. Confirm that no real prompts, paid APIs, production chats, private tokens,
   public posts, or unapproved destructive provider state were used.

## Expected Result

Hermetic checks can pass without Telegram credentials. Live rows become `PASS`
only after an approved brokered run against disposable Telegram state.
Unavailable phones, admin roles, payments, webhooks, uploaded assets, account
roles, or managed-bot token capabilities are recorded as `EXTERNAL PENDING`,
not hidden inside a passing release lane.
