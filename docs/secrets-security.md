---
title: Secrets Security Model
description: Canonical security decisions for Claw secrets, vaults, brokers, connectors, plugins, CLI, audit, and backups.
---

# Secrets Security Model

This document is the canonical security policy for Claw secrets. If another
Secrets, connector, plugin, CLI, or automation document describes a weaker
behavior, this document wins and the weaker behavior is transitional or wrong.

The design goal is a 1Password-like vault for humans and a brokered execution
system for agents. A human may unlock the vault and explicitly reveal or copy a
secret through the signed host UI. Agents, plugins, connectors, CLIs, and
ordinary local processes must work with references and brokered actions instead
of receiving plaintext secret values.

## Threat Model

Claw must assume that the local machine can contain hostile or buggy processes
running under the same user account. A process may try to read files, call
loopback services, abuse plugins, request connector execution, replay tokens,
or use broad host grants to exfiltrate secrets. Filesystem permissions and
localhost binding are useful layers, but they are not the security boundary by
themselves.

The signed active host is the trust boundary for native identity, approvals,
reauthentication, and user-facing reveal. ClawJS owns the framework contracts,
reference model, storage layout, tests, and broker protocol. Claw.app and
embedded hosts such as Clawix own native key access, prompt/approval UI, host
audit identity, and physical validation.

The system must fail closed. Missing principal identity, host, placement, risk,
capability, policy, approval context, or signed-host context blocks the action
until an explicit, auditable request supplies it.

## Ownership And Storage

The canonical framework vault lives under the framework global root, currently
`~/.claw`, with encrypted vault state in the canonical vault sidecar. Framework
records may store opaque references such as `secret_ref`; they must not store
plaintext tokens, API keys, private keys, recovery phrases, or secret field
values in `core.sqlite` or other non-vault data stores.

Clawix and other hosts may store host UI state, approval state, and native
protected-key handles under their own host roots. They must not become a second
canonical plaintext or encrypted secret database. If a host needs a projection,
it stores metadata or references, not duplicate secret material.

Remote or synced vaults are optional future work and must be end-to-end
encrypted. A coordinator or server may sync encrypted envelopes and metadata
required for routing, but it must not see plaintext secret values or master
keys.

## Cryptography Baseline

The current Secrets implementation already establishes the intended
cryptographic baseline:

- a master password unlocks a random vault master key instead of directly
  encrypting every field;
- password and recovery roots are derived with memory-hard KDF parameters;
- per-secret item keys encrypt fields, notes, and attachments with AEAD;
- associated data binds ciphertext to the expected item, field, notes,
  attachment, audit, or wrapping context;
- audit integrity uses keyed chaining so deletion or reordering is detectable;
- grants and leases are short-lived and stored as hashes rather than reusable
  plaintext tokens.

This baseline is necessary but not sufficient. Encryption protects stored data,
but broker policy, host identity, capability checks, audit minimization, and
approval windows decide whether plaintext is ever produced for the wrong
caller.

Master password support is required as the portable root of trust. Platform
features such as Keychain, Secure Enclave, and biometrics may speed local unlock
or reauthentication, but they must wrap or release access to the vault root
without replacing the portable password/recovery model.

## Human Reveal

Human reveal is allowed only through the signed active host UI after unlock and
the required reauthentication. Unlock may allow listing safe metadata. Reveal,
copy, export, or other high-risk operations may require a fresh password,
biometric check, or short reauth window depending on sensitivity.

Reveal and copy are human UI operations. They are not agent APIs. A public CLI,
connector executor, plugin, model context, script, or automation must not gain a
general "print secret", "read secret", "reveal all fields", or equivalent
surface.

Safe metadata must remain conservative. Labels, public values, field names,
headers, URLs, notes titles, and user-entered "non-secret" fields can still
contain secrets accidentally, so logs and public outputs must avoid copying
them unless the field is explicitly classified as safe for that surface.
ClawJS metadata DTOs therefore omit `publicValue` by default. The active signed
host may opt in with `includePublicValues=true` for human UI rendering; agents,
CLIs, connectors, plugins, and sibling local processes must treat public values
as unavailable unless they go through that signed-host path.

## Agents, Automation, Connectors, And Plugins

Agents and automation use secrets by asking the broker to perform a concrete
action. The broker validates the principal, capability, placement, destination,
risk tier, approval state, use limits, and host allowlist. It then injects only
the required field into the required protocol element inside the brokered
operation.

Connectors and plugins are untrusted by default. They declare the action they
want to perform, the target host, the requested secret reference, placement,
risk tier, cost profile, and the exact fields required. The broker may approve
that specific action. It must not hand the connector a general map of plaintext
secret fields.

Automation may run without a human watching only when an existing policy
authorizes the exact action. The agent still receives references, status, and
redacted results, not secret values. Costly, destructive, external, or
system-level actions require fresh approval or a short bounded approval window.

Direct connector secret resolvers must reject `secretRefs` that would require
plaintext execution outside the broker. Legacy plugin interfaces that still
mention `resolvedFields` are compatibility declarations only; they must not be
exposed as a public production execution path.

External plugin loading is disabled by default. Loading a plugin from a local
`.js` file executes code at import time, so it is not an acceptable trust
boundary for untrusted plugins. Development-only external loading requires an
explicit unsafe opt-in and still must not be treated as a production secret
execution path.

Connection credentials follow the same rule. Framework connection records may
store opaque `secretRef` values, but they must not store reversible local auth
files. Legacy `auth.encrypted` files are treated as unsafe compatibility
artifacts: readers ignore/remove them, and writers fail closed instead of
creating new plaintext-equivalent storage.

Hosts that previously owned legacy connection auth must migrate it one way
into the encrypted Secrets vault. A compatibility reader may decrypt
`auth.encrypted` only inside that migration path and must remove the legacy
file after a successful write. It must not return the plaintext token to UI,
agents, connectors, logs, or general runtime code.

## Broker Request Contract

Brokered secret use must be explicit. A request needs at least:

- principal identity and grant identity;
- secret reference and required field or typed capability;
- action id or protocol operation;
- target host and URL after redirects are resolved;
- placement such as header, body, query, environment, process, or browser;
- risk tier: `read`, `write`, `destructive`, `cost`, or `system`;
- use count, TTL, budget, and approval window where relevant;
- expected redaction policy for responses and errors.

Text responses may be returned only after broker-side redaction. Binary
responses require an explicit binary-response opt-in from the caller and must
be omitted if the byte stream contains any resolved secret value, because
generic redaction cannot safely rewrite opaque bytes.

Host allowlists are exact by default. Limited wildcard entries such as
`*.example.com` may be allowed only when the policy records the reason and the
matching code prevents ambiguous root-domain, suffix, redirect, or homograph
abuse. Secrets must not be sent across redirects unless the final destination
is independently allowed.

Policy denial takes precedence over allow rules. Marking a secret compromised,
archived, read-only for the requested action, over its use limit, outside its
approval window, or outside its allowed placement blocks new use and revokes
active grants or leases where applicable.

## Risk Tiers And Approval Defaults

The default is deny. A secret is usable only through an explicit allowlist,
capability, grant, or policy.

The mandatory risk tiers are:

- `read`: metadata or brokered request that should not mutate remote state;
- `write`: creates or changes remote or local state;
- `destructive`: deletes, revokes, rotates, overwrites, or performs irreversible
  state changes;
- `cost`: can spend money, consume paid quota, publish, send messages, or call a
  metered API;
- `system`: changes machine, host, keychain, permissions, signing, daemon,
  browser profile, filesystem, or runtime security state.

Higher risk tiers require stronger approval, shorter windows, tighter limits,
and better audit evidence. A lower-tier grant must never be silently upgraded to
a higher-tier action because a connector or plugin asks for it.

## CLI And Public API Surface

The public CLI may list safe metadata, describe capabilities, request brokered
actions, open the signed host UI, and run diagnostics. It must not print or
return plaintext secret values. There is no public `reveal`, `cat`, `print`,
`dump`, `export plaintext`, or "show all fields" CLI surface.

Master password, unlock, recovery phrase, and password rotation flows are
signed-host UI flows. Public CLI commands must not prompt for those values or
print recovery material.

Encrypted backup export/import is also a signed-host UI flow because it
requires fresh native reauthentication. The public CLI must not prompt for the
backup passphrase and call backup endpoints directly; it may only point the
user at the signed host flow or fail closed.

SDK and API helpers must follow the same rule. They may expose reference
creation, metadata, policy setup, typed brokered actions, redacted results,
doctor checks, encrypted import/export, and grant lifecycle. They must not
become a generic secret read API for agents.

## Audit And Logs

Audit must prove that a sensitive operation happened without becoming another
secret store. Store the minimum metadata required for accountability:
operation kind, principal id, secret id or stable opaque reference, policy id,
risk tier, target classification, result status, timestamps, and redacted error
classes.

Do not log plaintext values, full headers, full request or response bodies,
complete URLs with secret-bearing query strings, arbitrary connector payloads,
public values, user notes, raw field names when not needed, or model-visible
copies of inputs that may contain secrets. A field named "public", "label", or
"description" is not automatically safe.

Encrypted audit storage and hash chaining are required, but they do not justify
logging sensitive payloads. Audit minimization remains mandatory even when the
audit database is encrypted.

## Backup, Export, Import, And Recovery

Backups and exports must be encrypted. V1 does not provide plaintext export.
Creating, importing, or restoring a backup requires strong reauthentication and
must be audited with minimal metadata.

Backup encryption uses a passphrase or key independent from ordinary unlock
state. Export files must not contain plaintext secret values, master keys,
unwrapped item keys, active bearer tokens, active grant tokens, or reusable
session material.

Recovery material is secret material. It follows the same rules as vault
passwords and private keys: never log it, never store it in non-vault records,
and never expose it to agents or connectors.

## Rotation And Compromise

Rotation support must include reminders and revocation. Marking a secret as
compromised blocks new broker use, revokes or expires grants and leases, and
requires explicit user action before future use. Provider-side automatic
rotation is useful but not required for the baseline; local policy revocation is
required.

Changing a secret value creates a new encrypted version and invalidates policy
state that depends on the old value when that dependency matters. Historical
versions stay encrypted and must not be exposed through broad reads.

## Current Implementation Status And Gaps

The current ClawJS baseline implements the required safe public path:

- generic action execution routes return `410 Gone`;
- public CLI setup, unlock, recovery, and password rotation commands are
  signed-host only and do not prompt for master passwords or recovery phrases;
- public CLI backup export/import is not advertised and fails closed because
  backup flows require signed-host UI reauthentication;
- reveal-field API calls require a signed-host token, a human user principal,
  and fresh reauthentication;
- describe/list metadata omit `publicValue` by default; only signed-host
  requests may opt in to public values for human UI rendering;
- Clawix keeps Secrets admin and signed-host tokens in memory only, removes
  stale Secrets `.admin-token` files before launch, and does not adopt an
  existing Secrets sidecar through a disk bearer token;
- Clawix bootstraps Secrets admin and signed-host tokens over an anonymous
  stdin channel instead of environment variables, so process environment
  inspection does not expose bearer material;
- loopback callers without bearer credentials cannot list secrets, and callers
  with only signed-host evidence but no bearer principal cannot reveal or
  export backups;
- Clawix migrates legacy connection `auth.encrypted` files into the encrypted
  Secrets vault during unlock/mount and treats the old plaintext-equivalent
  reader as migration-only;
- broker HTTP calls require capability, risk tier, agent identity, declared
  fields, host, placement, approval/VPN context, and strict governance;
- connector runners reject `secretRefs` execution outside brokered flows;
- external `.js` plugin loading is disabled by default and requires an
  explicit unsafe development opt-in;
- the agents connection store keeps only opaque `secretRef` values and disables
  legacy `auth.encrypted` plaintext-equivalent helpers;
- broker and lease issuance increment usage, enforce max uses, and block
  compromised, locked, trashed, expired, or policy-denied secrets;
- audit events use minimal payloads and broker results are redacted;
- backup export/import is encrypted-only, requires a separate backup
  passphrase, and requires signed-host fresh reauthentication before the
  backend will export or restore.

The following patterns remain transitional and must not be expanded:

- legacy plugin executor/session/brand-sync TypeScript interfaces still carry
  `resolvedFields` for compatibility; they are not a production-safe execution
  boundary and new integrations must use broker handles;
- compatibility sidecar process/browser flows require final native IPC or
  code-signing validation before they count as complete hostile-local-process
  proof;
- signed-host authorization currently uses a configured host token in ClawJS
  tests and an in-memory host token in Clawix local server flows; native
  Claw.app/Clawix identity, XPC/signature, Keychain/Secure Enclave, and
  biometric validation remain host integration obligations;
- dev-only seeded credentials or local defaults must never be mistaken for
  production authentication.

Do not build new features on those patterns. Either replace them with the
broker contract in this document or mark the route as compatibility-only,
hidden, and blocked from production-sensitive use.

## Decision Checklist For Future Changes

Before changing Secrets, vault storage, connectors, plugins, approvals, grants,
leases, CLI, audit, backups, or host integration, verify every item below:

- The local threat model includes hostile same-user processes.
- Plaintext is available to humans only through signed-host reveal and reauth.
- Agents, connectors, plugins, automation, and CLI receive references and
  redacted results, not secret values.
- The broker request has principal, capability, host, placement, risk,
  approval, use limits, and redaction policy.
- Missing context fails closed.
- Exact host allowlists are the default; wildcards are limited and audited.
- Risk tiers are enforced and never silently upgraded.
- Secret sync is end-to-end encrypted if it exists.
- The canonical vault remains under the framework global root; hosts do not
  duplicate canonical secret storage.
- Audit is encrypted, chained, and minimal.
- Backups and exports are encrypted only.
- Rotation or compromise blocks new use and revokes active grants/leases.
- Current transitional reveal, resolver, sidecar, or dev-auth paths are not
  expanded as if they were the final model.

## Binding Decision Matrix

This matrix records the decisions from the source audit conversation so future
agents can verify changes without re-deriving the policy.

| Decision | Requirement | Current status |
| --- | --- | --- |
| `local_threat_model` | Same-user local processes are hostile. | Implemented in policy, loopback auth tests, no Secrets disk tokens, and no token-bearing Secrets environment; native XPC/code-signing validation remains `EXTERNAL PENDING`. |
| `audit_output` | Produce and implement hardening, not only a report. | Implemented through broker, CLI, audit, lifecycle, and docs hardening. |
| `audit_scope` | Cover Clawix, ClawJS, remote hosts, vault, broker, connectors, daemon, and third parties. | Partially implemented; ClawJS paths are covered, native host/remotes need physical validation. |
| `secret_material_policy` | Human UI may reveal; agents/processes/plugins/connectors do not view plaintext. | Implemented for public CLI, broker, SDK tests, and connector runners; legacy plugin interfaces are compatibility-only. |
| `approval_defaults` | Deny by default; risky actions need explicit approval or short windows. | Implemented in governance and broker risk handling. |
| `connector_execution_model` | Connectors declare plan, host, placement, action, and risk; broker injects fields. | Implemented for broker requests and connector runner rejection outside broker. |
| `plaintext_rule` | Plaintext exists only in human reveal UI or internal broker path. | Implemented for public surfaces; host-native reveal validation remains pending. |
| `human_reveal_policy` | Sensitive reveal/copy requires fresh reauthentication. | ClawJS reveal API requires signed host and `reauthSatisfied`; native biometric/password proof is host-owned. |
| `automation_secret_use` | Automation executes brokered actions without seeing values. | Implemented through `broker.http` with redacted result contract. |
| `master_key_protection` | Portable password root plus Keychain/Secure Enclave/biometrics locally. | Password/recovery crypto exists; platform protection is host integration `EXTERNAL PENDING`. |
| `secret_sync_model` | Future sync must be end-to-end encrypted. | Policy documented; no plaintext sync surface exists in V1. |
| `plugin_trust_model` | Plugins/connectors are untrusted, declarative, scoped, and not all-fields plaintext. | Public execution and external plugin loading are disabled by default; legacy `resolvedFields` interfaces are deprecated compatibility declarations. |
| `host_allowlist_policy` | Exact hosts by default; limited safe wildcards only. | Implemented in strict governance and tests. |
| `risk_approval_policy` | Mandatory `read`, `write`, `destructive`, `cost`, `system` risk tiers. | Broker request requires `riskTier`; non-read tiers require approval. |
| `rotation_policy` | Rotation/compromise revokes grants and leases and blocks new use. | Implemented for archive/compromise and governance blocks. |
| `canonical_storage` | Canonical vault belongs to framework global `~/.claw`; hosts keep only host state. | Implemented for Clawix Secrets service data; connection credentials migrate into the encrypted Secrets vault and legacy readers no longer return plaintext. |
| `audit_visibility` | Minimal audit; no fields, bodies, headers, public values, arbitrary payloads. | Implemented for current ClawJS audit events and smoke tests. |
| `migration_priority` | V1 may break unsafe legacy compatibility. | Applied by disabling generic action execution and direct public CLI flows. |
| `export_backup_policy` | Encrypted backup/export only with separate passphrase and strong reauth. | Implemented and tested: backend requires signed-host fresh reauth, Clawix export/import calls native reauth first, public CLI backup fails closed, and smoke tests verify encrypted-only backup behavior. |
| `cli_secret_surface` | No CLI reveal or print-secret surface. | Implemented and tested. |
| `failure_policy` | Missing host, placement, risk, agent, capability, or policy fails closed. | Implemented in strict broker/governance tests. |
