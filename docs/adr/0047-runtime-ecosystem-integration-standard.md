# ADR 0047: Runtime ecosystem integration standard

Status: Accepted

Date: 2026-05-21

## Context

Claw already has runtime adapters, support tiers, session transports, connector
governance, and Integration QA Lab patterns. The missing standard is how to
integrate runtimes that are themselves agent ecosystems: OpenClaw, Codex,
Hermes Agent, and future systems can include CLIs, apps, sessions, skills,
memory, providers, channels, schedulers, permissions, plugins, gateways, and
their own stores.

Without a standard, Clawix could accidentally show a runtime lens that feels
native while silently duplicating state, hiding drift, overwriting runtime-owned
fields, or claiming support that only covers a narrow adapter path.

## Decision

Runtime ecosystems are integrated by declared authority and evidence. ClawJS
owns the framework contract and Clawix mirrors it as a UX/runtime-lens contract.
The canonical human-readable standard is
`docs/runtime-ecosystem-integration-standard.md`; the canonical machine-readable
contract is `docs/runtime-ecosystem-integration.manifest.json`.

Every promoted runtime needs a triple matrix:

- native surface matrix
- Claw domain surface matrix
- link matrix

Support claims use an escalation ladder, not a boolean. Drift in official
runtime snapshots degrades affected claims. Native writes must go through
official runtime APIs or CLIs with audit and dry-run policy where available.
Local overlays remain visibly local.

The public CLI portal shape is `claw runtime <runtime-id> ... --json`. Existing
generic lifecycle commands remain valid; runtime-id subcommands are the native
ecosystem portal and must return Claw JSON envelopes with provenance and
unsupported/blocked states instead of executing unknown behavior.

## Threat Model Impact

This decision is security-sensitive because runtime ecosystems can touch
secrets, provider accounts, external messaging channels, local files, memory,
skills, shell tools, schedulers, and native app state. The protected assets are
user data, runtime stores, Claw state, secret references, audit receipts,
provider accounts, and external service bindings. The adversaries include
malicious local processes, confused agents, compromised runtimes, stale
adapters, hostile plugins, and prompt/tool exfiltration.

Controls are per-field authority, official-surface snapshots, brokered
credentials, explicit write-back policy, no silent overwrite, local-overlay
labels, hermetic fixtures by default, opt-in live lanes, and drift degradation.
The global threat model remains the security router; this ADR adds the runtime
ecosystem contract that future threat-model coverage must reference.

## Performance Impact

The standard prevents runtime lenses from becoming unbounded live CLI polling.
Runtime projections use snapshots with freshness metadata, watchers/events when
available, adaptive polling only under a declared resource contract, and user
initiated refresh. Large session lists, memories, skills, logs, and channel
events must be windowed or summarized before entering UI/global state.

Resource contract coverage:

- startup: no runtime ecosystem scan at import or shell startup
- idle: no long-running watcher unless a runtime lens or sync contract demands it
- memory: transcripts and memories use summaries, windows, or sidecars
- streaming: runtime streams obey cancellation, backpressure, and bounded queues
- storage: external stores are referenced/indexed/shadowed by policy
- hot path: runtime filters read indexed metadata, not full native stores
- scale: all list surfaces need pagination, cursors, or explicit limits
- validation: `scripts/verify-runtime-ecosystem-integration.mjs`

## Decision Tensions

- **Prioritized axes**: native runtime usefulness, data sovereignty,
  support-claim honesty, and future adapter auditability.
- **Constrained axes**: visual cloning and broad write-back are constrained
  until official surface evidence exists.
- **Tradeoffs accepted**: initial runtime matrices are stricter and slower to
  maintain, but they prevent false support claims and data confusion.
- **Debt or pending evidence**: deep Clawix runtime-lens UI, live runtime
  proof, Codex/Hermes parity, and destructive write-back remain later bounded
  slices or `EXTERNAL PENDING` lanes.

## Adoption And Canonicity

This ADR adds a local standard and guardrail. It does not claim broad adoption,
PMF, or external ecosystem canonicity.

## Source Decision Audit

Conversation-derived decision from private source audit
`/Users/trabajo/.codex/goals/clawix-clawjs-runtime-ecosystem-integration-standard-source-audit-2026-05-21.md`.
Public-safe implemented rows are represented by this ADR, the standard doc, the
runtime ecosystem manifest, decision-map routing, Clawix mirror ADR, and the
validator script.

## Surface Parity

- **Human surface**: Clawix runtime lens contract, decision map, runtime
  standard doc, and support matrix routing.
- **Programmatic surface**: `claw runtime <runtime-id> ... --json` portal
  contract, manifest JSON, and validator.
- **Persistence**: runtime ecosystem manifest, support matrix, discoverability
  registry, ADR operational coverage manifest, and future runtime snapshots.
- **Gaps**: full runtime-lens UI and live validation are `EXTERNAL PENDING` or
  later implementation slices; visual cloning is not applicable.
- **Validation**: `npm run test:runtime-ecosystem` validates the local nucleus;
  live provider/runtime checks require explicit approval.

## Discovery Route

- **Canonical name**: `adr:runtime-ecosystem-integration-standard`.
- **AGENTS/CLAUDE**: `AGENTS.md` -> `docs/decision-map.md`.
- **Skill**: no dedicated skill yet; runtime work starts with `claw search` and
  this standard.
- **Docs router**: `docs/decision-map.md`.
- **CLI**: `claw search "runtime ecosystem integration" --json`.
- **Registry**: `docs/discoverability.registry.json`.
- **Operational coverage**: `docs/adr-operational-coverage.manifest.json`.

## Consequences

Runtime support can no longer be promoted by adapter existence alone. A runtime
can be useful while still being partial, stale, read-only, local-overlay-only,
or external-pending. Future runtime work must update the manifest first, then
the implementation and tests that satisfy the declared claim.
