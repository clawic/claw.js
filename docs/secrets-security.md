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

Any current direct connector secret resolver that turns `secretRefs` into a
plaintext object for executor code is transitional and must be replaced or
wrapped by broker-only execution before being treated as production-safe.

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

## Current Implementation Gaps

The existing codebase contains useful building blocks, but the following
patterns must be treated as transitional until hardened:

- routes or helpers that reveal all fields internally for executor code;
- governance paths that allow execution when host, placement, risk, or actor
  context is missing;
- connector runners that resolve `secretRefs` into plaintext maps;
- compatibility sidecar flows that can look like generic process or browser
  injection without signed-host policy;
- audit payloads that include field names, internal labels, request details, or
  other user-controlled strings without a minimal schema review;
- dev-only seeded credentials or local defaults being mistaken for production
  authentication.

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
