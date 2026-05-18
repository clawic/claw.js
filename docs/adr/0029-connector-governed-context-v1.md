# ADR 0029: Connector Governed Context V1

Status: Accepted

Date: 2026-05-18

## Context

Connector operations often need more than a provider capability. They need the
right account, app, environment, product, signing identity, endpoint, and
secret-reference binding. Without a governed context surface, agents can drift
into ambiguous provider selection or leak private setup details into logs.

Apple App Store Connect makes the risk obvious: a release can depend on a Team
ID, Bundle ID, SKU, product identifiers, entitlements, API key, and signing
identity. The same shape exists across Google Play, Amazon Appstore,
RevenueCat, Stripe, GitHub, Slack, Notion, and other connectors even when the
provider vocabulary differs.

## Decision

ClawJS adds connector governed context as a first-class local framework surface.
The core catalog defines provider schemas, context kinds, required fields,
defaults, fallbacks, redaction, doctor checks, and fail-closed explanation.

The public CLI exposes this through the human-facing `claw accounts ...` surface
and the technical authority `claw connectors context ...` / `claw connectors
ctx ...`. `claw acct ...` is a short alias for `accounts`.

Context records use common kinds: account, organization, workspace, project,
team, app, product, entitlement, key, webhook, endpoint, environment, and
signing identity. Fields are classified as `public`, `private`, or
`secret_ref`; plaintext secrets are never stored in governed context records.

Objects and fields may be active, paused, blocked, or retired. Policy can allow,
deny, or require authorization by operation, provider, agent, role, workspace,
project, app, or environment. Defaults and fallback rules are explicit and
included in explanation traces.

V1 ships a local catalog for Discord, GitLab, GitHub, Google with a Google Play
subprofile, Airtable, Salesforce, HubSpot, Stripe, Notion, Slack, Telegram Bot
API, WhatsApp, Apple App Store Connect, Amazon Appstore, and RevenueCat.

In this first implementation slice, read, schema, doctor, validate, and explain
commands are executable. Mutation-shaped commands such as activate, pause,
block, retire, edit, and set-policy return auditable no-write plans until the
durable local storage mutation path is wired.

## Consequences

- Agents can explain why a provider account, app, Team ID, Bundle ID, SKU,
  package name, signing identity, product, entitlement, API key version, or
  fallback was selected or rejected.
- Store/provider-specific identifiers are modeled as private context, not as
  public examples or plaintext secrets.
- Connector execution can require a governed context decision and fail closed
  before credentials, signing, publishing, or external mutation.
- RevenueCat API v2 can be the preferred default while API v1 remains a traced
  fallback for unsupported v2 use cases.
- Live provider import remains explicit approval work. If a provider cannot be
  physically or manually checked in a test environment, the validation status is
  `EXTERNAL PENDING`, not silently accepted.

## Validation

- `packages/clawjs-core/src/connector-governed-context.test.ts`
- `packages/clawjs-core/src/connector-control-plane.test.ts`
- `packages/clawjs/src/cli-connector-context.test.ts`
- `claw accounts doctor --json`
- `claw connectors context explain revenuecat --json`
- `node ./scripts/discoverability-check.mjs`
- `node ./scripts/verify-cli-registry-router-parity.mjs`
