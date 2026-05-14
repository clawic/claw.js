# Integration QA Reference Research

Date: 2026-05-14

Scope: OpenClaw, Hermes Agent, and Telegram as the pilot connector.

## Findings From Hermes Agent

Hermes keeps ordinary tests hermetic by default:

- Its pytest configuration marks external-service tests as `integration` and
  excludes them from the default lane.
- The test harness strips credential-shaped environment variables such as
  `_API_KEY`, `_TOKEN`, `_SECRET`, `_PASSWORD`, OAuth tokens, webhook secrets,
  private keys, and Telegram bot tokens.
- Test setup isolates runtime home directories and session variables so local
  machine state does not leak into tests.
- Messaging-platform guidance calls out self-message filtering, allowlists,
  sensitive identifier redaction, backoff/reconnect behavior, and message size
  constraints.
- The security model treats in-process redaction and allowlists as heuristics,
  not as hard isolation. Real trust boundaries come from OS/process isolation
  and credential scoping.

Implication for ClawJS: default connector tests must not inherit live tokens,
and live tests must be a separate, explicit lane.

## Findings From OpenClaw

OpenClaw's QA Lab pattern separates transport abstraction, credentials, and
runtime execution:

- QA transports expose readiness, delivery, waits, action handling, and report
  notes through a common adapter contract.
- Credential helpers normalize endpoints, parse opt-in booleans and numeric
  limits, and reject unsafe live endpoints unless explicitly allowed.
- Live package validation installs the candidate package before forwarding
  secrets, which avoids testing stale local code.
- Live state is copied into temporary state, not pointed at durable user state.

Implication for ClawJS: connector QA needs a provider-neutral harness and
provider-specific profiles. Telegram should be a proving ground, not a one-off.

## Telegram-Specific Conclusion

Telegram is not "complete" when only the currently exposed action list passes.
As of Bot API 10.0, the official surface includes:

- 176 Bot API methods.
- 25 optional `Update` fields that can become source events.
- Methods that are cheap and safe to test with a disposable bot.
- Methods that require a group admin role, webhook endpoint, phone/account
  state, payments, stars, paid media, uploaded sticker assets, games,
  Passport, or managed-bot token delegation.

The adopted ClawJS standard therefore requires:

- a versioned official API snapshot;
- a coverage matrix for every official method and update field;
- hermetic fixture tests for request/source planning;
- brokered credential leases for live checks;
- manual-only rows for payment, public-delivery, destructive, account-role, and
  physical/provider-side flows;
- `EXTERNAL PENDING` instead of false passing status when prerequisites are not
  present.
