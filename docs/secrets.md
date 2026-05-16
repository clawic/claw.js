---
title: Secrets
description: Standalone multitenant secret broker with brokered HTTP execution and local leases.
---

# Secrets

`secrets/` is the canonical secrets system for ClawJS. It is a standalone
Fastify service designed for the case where agents should work with
secret references and brokered actions instead of reading plaintext
credentials into the model context.

The canonical security policy is [Secrets Security Model](./secrets-security.md).
If this page or the current implementation suggests a broader plaintext reveal,
connector resolver, sidecar, CLI, audit, backup, or approval behavior, the
security model wins and the broader behavior is transitional.

Secrets v1 focuses on three paths:

- brokered HTTP execution on the server
- short-lived `process` leases through a trusted local sidecar
- short-lived `browser` leases through the same sidecar for login flows

## What v1 includes

- multitenant storage with seeded local tenant and operator accounts
- envelope encryption per secret version
- typed secret templates with structured fields, host/header defaults, lease-mode defaults, and typed actions
- policy records with deny precedence
- typed principals for `service_principal` and `sidecar_principal`
- explicit capability and action discovery per secret
- audit events for secret mutation, broker execution, and lease lifecycle
- a compatibility sidecar that preserves the existing `{{secretName}}` pattern
- a built-in admin console served from the same process
- a native macOS admin app under `apps/secrets-macos/`

The initial typed catalog includes:

- `generic.api_key`
- `generic.bearer_token`
- `generic.basic_auth`
- `generic.oauth_client`
- `npm.token`
- `telegram.bot_token`
- `slack.bot_token`
- `revenuecat.api_key`

## Local workflow

```bash
npm --prefix secrets install
npm --prefix secrets/ui install
npm --prefix secrets run build
npm --prefix secrets run start
```

Default local URL:

- [http://127.0.0.1:24103](http://127.0.0.1:24103)

Default local credentials:

- admin: `admin@secrets.local` / `secrets-admin`
- operator: `operator@secrets.local` / `secrets-operator`

These credentials and the default URL are disposable local-development
defaults. Real secrets should only be configured in an isolated Secrets
tenant with explicit host, header, lease, and action policies.

The native macOS operator app lives in `apps/secrets-macos/`:

```bash
swift build --package-path apps/secrets-macos
swift run --package-path apps/secrets-macos
```

The app logs into Secrets directly and covers tenant selection, secret
creation and rotation, secret-type search, policy management, principal
issuance, active leases, and audit review.

## SDK and CLI

When `CLAW_SECRETS_BASE_URL`, `CLAW_SECRETS_TOKEN`, and `CLAW_SECRETS_TENANT_ID` are set,
`claw.secrets` and `claw secrets ...` default to Secrets instead of the
local development fallback.

Secrets-backed surfaces include:

- `claw.secrets.types()`
- `claw.secrets.capabilities(secretName)`
- `claw.secrets.actions(secretName)`
- `claw.secrets.brokerHttp(...)`
- `claw.secrets.leases()`

Typed action metadata may be listed, but generic typed action execution is
disabled. Use `brokerHttp(...)` with explicit declared fields, risk tier, and
placement instead of `runAction(...)`.

## Sidecar compatibility

The local sidecar preserves the current proxy-style workflow:

```bash
CLAW_SECRETS_BASE_URL=http://127.0.0.1:24103 \
CLAW_SECRETS_TOKEN=<sidecar-principal-token> \
CLAW_SECRETS_TENANT_ID=demo-tenant \
node secrets/dist/sidecar.js list-secrets
```

The same sidecar can execute brokered HTTP requests:

```bash
CLAW_SECRETS_BASE_URL=http://127.0.0.1:24103 \
CLAW_SECRETS_TOKEN=<sidecar-principal-token> \
CLAW_SECRETS_TENANT_ID=demo-tenant \
node secrets/dist/sidecar.js request \
  --method POST \
  --url https://slack.com/api/auth.test \
  --risk-tier read \
  --header "Authorization: Bearer {{slack_bot_token.token}}"
```

And it can request host-bound leases:

```bash
CLAW_SECRETS_BASE_URL=http://127.0.0.1:24103 \
CLAW_SECRETS_TOKEN=<sidecar-principal-token> \
CLAW_SECRETS_TENANT_ID=demo-tenant \
node secrets/dist/sidecar.js spawn-process \
  --secret-name my_login_password \
  --command node \
  --arg scripts/login.mjs
```

## Current limits

- Secrets does not expose a generic “read secret” endpoint.
- The public CLI must not print or return plaintext secret values; it can list
  safe metadata, request brokered actions, open the signed host UI, and run
  diagnostics.
- Master password, Secret Key, Emergency Kit, unlock, recovery phrase, and
  password rotation operations are signed-host UI flows, not public CLI flows.
- Host-bound `process` and `browser` flows require the local sidecar.
- Host-bound sidecar flows are compatibility surfaces, not a bypass around
  broker policy, signed-host approval, host allowlists, or risk tiers.
- Secret deletion is not part of the current public API.
- The current dev build seeds plaintext local users for operator login; the
  production boundary is the per-version secret encryption and the lack of
  plaintext secret reads over the public API.
