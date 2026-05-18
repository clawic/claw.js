# Connector Governed Context

Connector governed context is the local authority for provider accounts,
workspaces, apps, products, signing identities, API-key bindings, defaults, and
fallbacks. It keeps provider setup explicit without storing plaintext secrets.

Use it when an operation depends on the right provider object rather than just a
provider name. Examples include Apple Team ID plus Bundle ID plus signing
identity, Google Play package plus signing certificate, and RevenueCat API v2
with a traced API v1 fallback.

## CLI

```bash
claw accounts list --json
claw accounts schema apple --json
claw accounts doctor --json
claw accounts explain apple --operation apple.upload --env production --json
claw connectors context explain revenuecat --operation revenuecat.project_configuration.read --json
```

Mutation-shaped commands are plan-only in this first slice:

```bash
claw accounts pause apple_team_default --dry-run --json
claw connectors context block revenuecat_api_v1 --provider revenuecat --dry-run --json
```

## Invariants

- Context fields are classified as `public`, `private`, or `secret_ref`.
- Secret material is represented only by secret references.
- Private values are redacted by default in CLI explanation output.
- Blocked, paused, retired, missing, and wrong-environment context fails closed.
- Defaults and fallbacks are included in decision traces.
- Provider schemas cite source documentation and are checked by the doctor
  report.
- `accounts` is the human surface; `connectors context` is the technical
  authority under the connector control plane; `acct` and `connectors ctx` are
  aliases only.
- Durable IDs for resources remain opaque `res_*` references when context needs
  to point at files, instructions, projects, or secret bindings.

## Provider Baseline

The V1 schema catalog covers Discord, GitLab, GitHub, Google, Airtable,
Salesforce, HubSpot, Stripe, Notion, Slack, Telegram Bot API, WhatsApp, Apple
App Store Connect, Amazon Appstore, and RevenueCat. Google Play is modeled as a
Google subprofile because it shares Google account and project authority.

The store-oriented source references are official provider documentation:

- Apple App Store Connect app information and in-app purchase information.
- Google Play Developer Publishing API and Play App Signing documentation.
- Amazon Appstore app submission documentation.
- RevenueCat REST API v2 documentation.

Live import from provider accounts is not automatic. It requires explicit
approval, brokered credentials, and an `EXTERNAL PENDING` status when a real
account, signing identity, store console, or manual provider check is not
available.

## Validation

The protected surface is:

- `packages/clawjs-core/src/connector-governed-context.test.ts`
- `packages/clawjs-core/src/connector-control-plane.test.ts`
- `packages/clawjs/src/cli-connector-context.test.ts`
- `node ./scripts/docs-surface-check.mjs`
- `node ./scripts/code-hygiene-check.mjs`

See [ADR 0029](./adr/0029-connector-governed-context-v1.md).
