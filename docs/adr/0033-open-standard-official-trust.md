# ADR 0033: Open standard and official trust

Status: Accepted

Date: 2026-05-19

## Context

ClawJS is MIT-licensed and intentionally buildable, forkable, and extensible.
That openness is part of the product promise, not a temporary adoption tactic.
At the same time, users, agents, package consumers, and host applications need
to tell the difference between an upstream-maintained artifact, a source build,
a community distribution, and a third-party compatible implementation.

The project already separates framework and host ownership, publishes open
interfaces, protects local-first sovereignty, and reserves Clawix app marks in
the app repository. This ADR records the framework-level public rule: open
compatibility stays broad, while official trust must be explicit and
verifiable.

## Decision

- The MIT license remains the code and documentation license. This ADR does not
  add field-of-use, commercial-use, hosted-use, fork, or resale restrictions.
- Forks, modified distributions, commercial products, and compatible
  implementations are legitimate when they use distinct identity and do not
  imply upstream endorsement or official status.
- `official` is reserved for upstream-maintained builds, packages, registries,
  docs, channels, marks, and release artifacts.
- `compatible` means a third party truthfully claims or demonstrates support
  for a ClawJS/Claw contract. Compatibility never implies official status.
- Build taxonomy uses these public labels:
  - `official`: produced or distributed by upstream.
  - `source`: built by a user or organization directly from source.
  - `community`: distributed by a third party.
  - `compatible`: implements a stated Claw contract without being upstream.
- Compatibility levels are named independently so partial compatibility can be
  truthful:
  - `Core-compatible`: CLI, schemas, storage basics, and core contracts.
  - `Host-compatible`: host registry, permissions, approvals, and host behavior.
  - `Remote-compatible`: Relay, sync, remote-safe routes, and remote policy.
  - `Plugin-compatible`: plugin manifest, package, lifecycle, and safety rules.
- Registry tiers use neutral names: `community`, `verified`, `official`, and
  `deprecated` or `unsafe` when needed for user protection.
- A lightweight DCO flow is the contribution default. Contributors certify that
  they have the right to submit their contribution by adding a `Signed-off-by`
  line, without turning ordinary contribution into a broad private agreement.
- `claw verify` is reserved as a future public CLI surface for artifacts,
  checksums, signatures, provenance, and host/build identity. This ADR does not
  implement that command.

## Surface Parity

- **Human surface**: public docs explain official/source/community/compatible
  labels, fork/rebrand expectations, and release-channel trust.
- **Programmatic surface**: future `claw verify` and registry metadata will make
  artifact and compatibility verification scriptable. Until then, docs and
  release artifacts are the public contract.
- **Persistence**: official trust and compatibility metadata must live in
  documented registries or release manifests when implemented; private channel
  records are not public canon.
- **Gaps**: `claw verify`, host/build trust metadata, and registry-backed
  compatibility verification are `required` future surfaces, not part of this
  ADR's implementation slice.
- **Validation**: `scripts/open-source-canonicity-check.mjs` verifies the public
  docs, ADR, contribution, release, trademark, and decision-map routing.

## Discovery Route

- **AGENTS/CLAUDE**: `AGENTS.md` routes official trust and compatibility work
  through this ADR and `docs/official-trust-and-compatibility.md`; `CLAUDE.md`
  routes back through `AGENTS.md`.
- **Skill**: `docs-alignment-update`, `adr-to-guardrail`,
  `public-hygiene-review`, and `surface-registry-alignment` apply when changing
  the canon, guardrail, or future verification surfaces.
- **Docs router**: `docs/decision-map.md` points official trust and open
  compatibility decisions here.
- **CLI**: `claw search "official trust compatibility" --json` must surface
  this ADR after discoverability regeneration.
- **Registry**: `docs/discoverability.registry.json` records this ADR, the
  public docs page, and the guardrail.

## Consequences

Public communication must be careful: it may protect official identity and
prevent confusion, but it must not imply that forks, resale, commercial use,
source builds, or compatible implementations are disallowed. Future CLI,
registry, package, host, and release work should make trust easier to verify
without making upstream a technical gatekeeper.
