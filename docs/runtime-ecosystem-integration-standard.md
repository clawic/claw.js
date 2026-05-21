---
title: Runtime Ecosystem Integration Standard
description: How ClawJS and Clawix integrate external agent runtimes without false parity, unsafe duplication, or unsupported write-back.
---

# Runtime Ecosystem Integration Standard

Runtime ecosystems are external agent systems that may ship their own CLI, app,
sessions, skills, memory, providers, channels, scheduler, permissions, plugins,
gateway, storage, and diagnostics. Examples in the current nucleus are
OpenClaw, Codex, and Hermes Agent.

Claw does not treat these systems as only model providers. It treats them as
native ecosystems that can be projected into Claw and Clawix with declared
authority, provenance, freshness, and support claims.

## Product Contract

Clawix may offer a runtime lens: when a user filters to one runtime, the app
shows that runtime's native concepts and state with Clawix components and Claw
governance. The lens aims for semantic native parity, not a pixel clone. It
must show official runtime objects, native names, native states, freshness,
provenance, and local-only differences.

Global Claw views keep Claw terminology and portable state. Runtime lenses keep
native terminology. Cross-runtime aggregation must preserve provenance and must
not hide which runtime owns a field or action.

## Triple Matrix

Every runtime support claim is backed by the machine-readable manifest at
[`docs/runtime-ecosystem-integration.manifest.json`](runtime-ecosystem-integration.manifest.json).
For each runtime promoted beyond a baseline inventory, the manifest contains:

- `nativeSurface`: official runtime commands, files, UI concepts, APIs, or docs.
- `clawDomainSurface`: the Claw domain that consumes or projects the native
  surface.
- `linkMatrix`: equivalence, loss, conflict, write-back, freshness, and test
  policy for each domain.

All official surface that is visible in the snapshot must be classified. A
domain can be unsupported, read-only, local-overlay-only, external-pending, or
blocked, but it cannot be omitted when the runtime exposes it.

## Authority And Sync

Authority is per field and per action:

- `runtime`: the runtime is the source of truth.
- `claw`: Claw is the source of truth.
- `both-with-resolver`: both can mutate and a resolver is declared.
- `local-overlay`: Clawix or Claw state is intentionally local and must not
  pretend to sync.
- `blocked`: no safe action exists yet.

Defaults by domain:

| Domain | Default |
| --- | --- |
| Sessions | Index plus portable shadow when safe. |
| Skills | Index native inventory; explicit promotion before becoming Claw skills. |
| Memory | Sensitive index by default; content preservation requires policy or authorization. |
| Channels/connectors | Claw registry owns principals, accounts, and secret refs; runtimes receive brokered bindings. |
| Providers/models/auth | Governed context and secret refs; no guessed provider/account identifiers. |
| Pins/tags/settings/write-back | Official runtime API/CLI only; otherwise local overlay. |

The default conflict rule is no silent overwrite. Authoritative fields win;
local overlays remain separate; visible divergence is preferred over hidden
duplication.

## CLI Portal

The public framework portal for native runtime operations is:

```bash
claw runtime <runtime-id> <domain-or-command> ... --json
```

The portal does not create top-level command sprawl. It wraps official runtime
commands or APIs with Claw JSON envelopes, provenance, dry-run support where
available, brokered credentials, audit receipts for writes, and explicit
unsupported/blocked states. Lifecycle commands such as `claw runtime status`
remain generic adapter lifecycle commands; runtime-id subcommands are the
native ecosystem portal.

## Support Claims

Support is not boolean. The allowed claim ladder is:

- `inventoried`
- `projected`
- `operable`
- `write_back`
- `preserved`
- `native_parity`
- `recommended`
- `production`

`recommended`, `production`, and UI parity claims are blocked unless the runtime
has a current official snapshot, a complete triple matrix for required domains,
evidence for every write-back claim, and passing guardrails. Drift in the
official snapshot degrades affected domains to partial or stale until the
matrix and tests are updated.

## Validation Lanes

Hermetic fixtures are the default. Live runtime, account, provider, messaging,
or paid/service validation is strict opt-in and must be recorded as
`EXTERNAL PENDING` until the user authorizes the exact run and evidence can be
redacted safely.

Use:

```bash
npm run test:runtime-ecosystem
```

to validate the manifest, ADR routing, support-claim guardrails, and initial
OpenClaw/Codex/Hermes matrices.
