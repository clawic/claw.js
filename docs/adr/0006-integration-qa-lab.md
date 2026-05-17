# ADR 0006: Integration QA Lab

Status: Accepted

Date: 2026-05-14

## Context

Connector completeness is not the same as "we implemented the few actions we
needed first." Providers such as Telegram, Stripe, Slack, and Gmail expose
large official APIs, mixed delivery modes, credential-sensitive flows, paid
actions, destructive actions, mobile or human approval requirements, and
provider-specific quirks. Default tests must stay hermetic, but a connector
cannot be called complete unless the real provider surface and live-validation
limits are explicit.

The reference pattern is:

- Hermetic tests are the default and strip credential-shaped environment
  variables.
- Live tests require explicit opt-in and must use disposable state where
  possible.
- Raw secrets do not flow through ordinary Node runtimes; live execution uses
  brokered leases and host-owned approvals.
- Paid, destructive, account-mutating, public-delivery, or physical-device
  flows are manual scenarios until a broker can prove they are isolated.
- Missing live prerequisites are recorded as `EXTERNAL PENDING`, not as `PASS`.

## Decision

Every external integration must have an Integration QA Lab profile before it
can be described as complete. The profile is framework-owned and contains:

1. An official provider surface snapshot with source URL, provider version or
   date, and every official method/event/source that is relevant to the
   connector.
2. A coverage matrix that classifies each official surface as `implemented`,
   `fixture_only`, `live_smoke`, `manual_only`, or `unsupported_by_policy`.
3. Hermetic fixture tests for request planning, response parsing, event/source
   extraction, error handling, pagination, idempotency, and rate-limit metadata.
4. A live lane that is disabled by default and can only run with an explicit
   `CLAW_TEST_LIVE=1` opt-in plus brokered credential leases.
5. Manual scenarios for flows that need phones, account roles, public webhooks,
   payments, destructive admin state, uploaded provider assets, or other
   physical/provider-side setup.
6. A documented failure vocabulary: `PASS`, `PARTIAL`, `FAIL`,
   `EXTERNAL PENDING`, and policy-blocked.

Telegram is the pilot integration. Its Bot API matrix lives in
`packages/clawjs-integrations/src/telegram-official-api-matrix.ts` and is
protected by Vitest coverage. The matrix starts from the official Bot API 10.0
surface published on 2026-05-08 and must be updated whenever Telegram ships a
new official method or delivery surface.

## Consequences

- Connector reviews start by comparing against the provider's official API, not
  the existing local action list.
- Adding a local action without updating the provider matrix is incomplete.
- Adding a provider method to the matrix without fixtures is allowed only as a
  visible `fixture_only`, `manual_only`, or `unsupported_by_policy` row.
- Live validation never prints or stores raw tokens and never uses production
  data, paid APIs, destructive admin flows, or public posts without explicit
  operator approval.
- Hosts such as Clawix can display QA status and request approvals, but the
  canonical provider surface and harness policy remain framework-owned.
