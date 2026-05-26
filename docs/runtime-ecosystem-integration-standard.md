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

## Authority Model And Replication

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
| Pins/tags/settings/write-back | Official runtime API/CLI only; otherwise product-blocked local overlay. |

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

Domain-scoped reads are explicit:

```bash
claw runtime <runtime-id> domains --json
claw runtime <runtime-id> support --json
claw runtime <runtime-id> domain <domain> --json
claw runtime <runtime-id> resources <domain> --json
```

For Hermes, the current operable non-default runtime lens keeps the complete 44-command JSON portal set guarded while recommended and production ecosystem
claims remain lowered. The adapter support metadata may be production-grade
without making Hermes the recommended default runtime. That set includes
summary/status/commands/domains/support, domain and resource reads for every
manifest domain, session/workspace reads, and session list/preview/resolve/history/send/inject/abort/create/pin/unpin/conflicts
envelopes. Guarded command coverage is not a promotion signal by itself:
native write-back, production TUI Gateway transport, and approved live
channel/provider/auth/model evidence still gate recommended, production, and
native-parity ecosystem claims.

Hermes session reads have two valid fixture paths. A bounded local session
store can satisfy list/preview/resolve/history without transcript content by
default. When `--gateway-url` points at an explicit loopback TUI Gateway
fixture, list/preview/resolve/history may instead materialize through
`session.list`, `session.history`, and `session.status`; those reads must keep
`writesRuntime: false`, redact content before JSON output, and must not count
as production transport evidence.

`support` returns the runtime ecosystem support audit: all manifest domains
accounted for, current support stage, blocking reasons, blocker classes,
evidence requirements, session-action blockers, the exact promotion gate, and
`finalPromotionReview`, `finalSupportClaimDecision`, `closureChecklist`, and
`evidenceReentryPackets`. The review must
distinguish product-blocked requirements from external-pending evidence, so a
runtime can be visibly operable without being promoted as
recommended/production. The final support-claim decision states the effective
published support stage, claims that remain blocked, UI parity disposition,
safe default, and the exact reentry policy before any promotion can be
revisited. The closure checklist is one machine-readable row per manifest
domain, with the domain closure status, blocker classes, evidence ids, safe
default, and next action; it is the product answer to what is implemented,
product-blocked, external-pending, or still a direct blocker. Each row also
separates `readProjectionStatus`, `implementedFacets`, `blockingFacets`, and
`projectionDisposition` so read-only inventory, local overlays, and blocked
native write-back are visible as different facts instead of one ambiguous
blocked state. `projectionSummary` aggregates those row fields into counts for
read projection state, implemented facets, blocking facets, and domains that
are product-blocked for promotion while still usable as read projections.
Hermes reentry fixtures may close individual lanes only when the receipt is
explicit and redacted: `--approval-gate-fixture`, `--live-evidence-fixture`,
`--production-transport-fixture`, `--write-back-contract-fixture`, and
`--native-contract-fixture`. Those fixtures remove their matching audit
requirements, but they do not promote Hermes out of its manifest support stage;
production/recommended ecosystem claims still require an explicit ecosystem
support policy change.
When all evidence requirements are closed for a runtime whose manifest policy is
`supportStage: operable`, `recommended: false`, and `production: false`, the
support audit closes as `operable_non_default_complete`; it does not synthesize
a default-runtime or production ecosystem claim.
`evidenceReadinessSummary` aggregates the remaining evidence lanes into
approval-required, external-pending, upstream-contract-blocked,
product-blocked, and unresolved-native counts plus the exact requirement ids
and next required action classes. `syncPolicySummary` aggregates authority,
persistence, relation, write-back, loss, freshness, local-overlay, read-only
projection, and no-silent-overwrite policy so the runtime lens can show what is
indexed, what is projected, what is written back, and what is explicitly not
synced. Reentry packets group the exact command shape,
expected redacted
evidence, risk controls, and safe default for each remaining evidence lane. It
is read-only and cannot substitute for live evidence or official write-back
contracts.

`resources <domain>` must receive a valid manifest domain before the runtime
facade or inventories are prepared. A domain-scoped read must not scan unrelated
domains or attach session inventory unless the requested scope is `sessions` or
a full snapshot.

Under `--json`, missing or unknown domains return stable `ok:false` JSON error envelopes
with runtime id, operation, and domain metadata.

The portal is also discoverable through command-intent routes. `claw commands
resolve runtime domains --json`, `claw commands resolve runtime resources
--json`, `claw commands resolve runtime support --json`, `claw commands resolve
runtime domain --json`, and `claw inspect command-intents --json` must expose
the mapped portal commands without executing them.

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
