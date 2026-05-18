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
defaults, fallbacks, safe daily-use examples, redaction, doctor checks, and
fail-closed explanation.

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
included in explanation traces. Defaults resolve by matching scope and priority;
object and field policies scoped to agents, roles, or operations apply only
when that actor, role, or operation is in the request.

V1 ships a local catalog for Discord, GitLab, GitHub, Google with a Google Play
subprofile, Airtable, Salesforce, HubSpot, Stripe, Notion, Slack, Telegram Bot
API, WhatsApp, Apple App Store Connect, Amazon Appstore, and RevenueCat.
Every provider schema must include agent-facing guidance, at least one
`secret_ref` field, and safe fixture examples for each declared context kind.
The doctor fails when required fields, examples, default refs, fallback refs, or
source docs are missing.

V1 persists local governed context in `core.sqlite` tables for records,
defaults, and context audit events. Read, schema, doctor, validate, explain,
upsert, edit, link-secret, defaults, activate, pause, block, and retire commands
are executable against local framework state. These commands do not mutate real
providers.

Governed context records also project an opaque `res_*` id into the framework
`resources` table. The resource projection is a stable reference layer for
agents and guidance; it is not the primary human UX. `accounts show res_*`
resolves the reference back to redacted governed context.

Control-plane audit declarations include the joined governed-context and
Secrets decision surface: provider, operation, actor/request ids when
available, selected context refs, selected field refs, secret refs, default
context refs, applied fallback rule ids, approval grant id, and redacted reason
codes. The audit declaration is metadata only; it does not include private
field values or plaintext credentials.

## Consequences

- Agents can explain why a provider account, app, Team ID, Bundle ID, SKU,
  package name, signing identity, product, entitlement, API key version, or
  fallback was selected or rejected.
- Store/provider-specific identifiers are modeled as private context, not as
  public examples or plaintext secrets.
- Connector execution can require a governed context decision and fail closed
  before credentials, signing, publishing, or external mutation.
- Field-level denials, approval-required context, wrong environments, missing
  secret bindings, and blocked records all produce explicit fail-closed reasons
  with remediation.
- RevenueCat API v2 can be the preferred default while API v1 remains a traced
  fallback for unsupported v2 use cases.
- `secret_ref` fields can be linked locally, but plaintext secret values are
  rejected from governed context records.
- Live provider import remains explicit approval work. If a provider cannot be
  physically or manually checked in a test environment, the validation status is
  `EXTERNAL PENDING`, not silently accepted.

## Validation

- `packages/clawjs-core/src/connector-governed-context.test.ts`
- `packages/clawjs-core/src/connector-control-plane.test.ts`
- `packages/clawjs/src/cli-connector-context.test.ts`
- `packages/clawjs/src/v1-connector-control-plane-storage.test.ts`
- `claw accounts doctor --json`
- `claw connectors context explain revenuecat --json`
- `node ./scripts/discoverability-check.mjs`
- `node ./scripts/verify-cli-registry-router-parity.mjs`
