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
claw accounts upsert apple_app_main --provider apple --kind app --set bundle_id=com.example.app --set sku=SKU123 --json
claw accounts link-secret revenuecat_api_v2 --field api_key --secret-ref secret://revenuecat/v2 --json
claw accounts defaults set --context revenuecat_api_v2 --provider revenuecat --scope provider:revenuecat --json
claw accounts schema apple --json
claw accounts doctor --json
claw accounts explain apple --operation apple.upload --env production --json
claw accounts export --provider apple --mode redacted --json
claw accounts export --mode private-envelope --json
claw connectors context explain revenuecat --operation revenuecat.project_configuration.read --json
```

Local configuration commands persist governed non-secret context to
`core.sqlite`:

```bash
claw accounts pause apple_team_default --json
claw connectors context block revenuecat_api_v1 --provider revenuecat --json
```

These commands do not mutate real providers. They update local desired context,
defaults, state, guidance, policy, and `secret_ref` links. Live provider import
or mutation remains explicit-approval work through the connector control plane.

`accounts export` emits a portable governed-context envelope. The default mode
is `redacted`: private field values are replaced and no secret material is
included. `--mode private-envelope` includes private non-secret fields for
handoff/import workflows, marks the payload as protected handling, and still
omits plaintext secrets. Secret fields export only binding metadata, not the
secret reference value or resolved credential.

## Invariants

- Context fields are classified as `public`, `private`, or `secret_ref`.
- Secret material is represented only by secret references.
- Private values are redacted by default in CLI explanation output.
- Exports default to redacted envelopes; private envelopes must declare
  protected handling and must not contain plaintext secret values.
- Blocked, paused, retired, missing, and wrong-environment context fails closed.
- Defaults resolve by matching scope and priority across global, workspace,
  project, app, environment, provider, operation, agent, and role scopes.
- Object and field policies may be scoped to operations, agents, and roles;
  non-matching scoped policies do not block unrelated actors.
- Defaults and fallbacks are included in decision traces.
- Control-plane audit declarations preserve selected context refs, field refs,
  secret refs, default refs, fallback rule ids, approval grant id, and reason
  codes without private values or plaintext credentials.
- Provider schemas cite source documentation and are checked by the doctor
  report.
- Provider schemas include safe daily-use fixture examples for each declared
  context kind. The doctor fails when examples are missing, when an example
  lacks a required field, or when a default/fallback references a missing
  context example.
- `accounts` is the human surface; `connectors context` is the technical
  authority under the connector control plane; `acct` and `connectors ctx` are
  aliases only.
- Durable IDs for resources remain opaque `res_*` references when context needs
  to point at files, instructions, projects, or secret bindings.
- Governed context records are projected into the `resources` table as
  `connector_context` resources with opaque `res_*` ids. `accounts show res_*`
  resolves those refs back to redacted governed context without making
  `resources` the main account/context management UX.
- Stored context uses `connector_context_records`,
  `connector_context_defaults`, and `connector_context_audit_events` in
  `core.sqlite`. Credential material remains outside these tables.

## Provider Baseline

The V1 schema catalog covers Discord, GitLab, GitHub, Google, Airtable,
Salesforce, HubSpot, Stripe, Notion, Slack, Telegram Bot API, WhatsApp, Apple
App Store Connect, Amazon Appstore, and RevenueCat. Google Play is modeled as a
Google subprofile because it shares Google account and explicit project-scoped authority.

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
- `packages/clawjs/src/v1-connector-control-plane-storage.test.ts`
- `node ./scripts/docs-surface-check.mjs`
- `node ./scripts/code-hygiene-check.mjs`

See [ADR 0029](./adr/0029-connector-governed-context-v1.md),
[Connector Governed Context Source Decision Audit](./governance/connector-governed-context/source-audit.md),
and [Connector Governed Context Completion Audit](./governance/connector-governed-context/completion.md).
