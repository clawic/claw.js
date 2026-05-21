# ADR 0039: Global threat modeling governance

Status: Accepted

Date: 2026-05-21

## Context

Constitution IV.1 already says security is a positive guarantee and names
malicious sub-apps, compromised runtimes, supply-chain attacks, hostile network
peers, and exfiltration through agent actions as part of the threat model.
Existing security canon is strong for secrets, native permissions, regulated
domains, connector control, remote access, and official trust, but those
decisions were not joined by one global model across layers.

That gap makes security review too dependent on memory. A new agent, route,
plugin, marketplace surface, Relay path, update channel, or package boundary
could be added with local controls while missing a cross-layer threat such as
prompt/tool exfiltration, hostile local process abuse, malicious plugin code,
or supply-chain compromise.

## Decision

ClawJS owns the global threat model for framework contracts, routes, agents,
plugins, marketplace packages, Relay/Gateway/Connector/Sync, storage, supply
chain, update channels, and CLI discovery. Clawix and other hosts consume the
model and own host-specific consequences such as signed-app identity, native
permission UX, approval surfaces, release channels, and visible review.

The canonical model lives in `docs/security-threat-model.md`, with executable
coverage in `docs/security-threat-model.coverage.json`. The coverage file
declares required layers, critical surfaces, critical routes, security-sensitive
ADRs, and coverage rows. Each row names assets, adversaries, trust boundary,
STRIDE-style threat categories, controls, validation evidence, status, steward,
and review date.

Every durable change that touches security, agents, delegation, sub-apps,
custom surfaces, plugins, marketplace, Relay, mesh, storage, connectors, native
permissions, package/update/release channels, external execution, or prompt/tool
boundaries must answer the ADR template's `Threat Model Impact` section or cite
an existing coverage row. Silent "not applicable" claims are invalid for those
categories.

The guardrail is `scripts/security-threat-model-check.mjs`. It fails when:

- a mandatory layer is missing or expired;
- a coverage row omits required fields;
- a security-sensitive ADR is not covered by at least one row;
- a registered critical surface or route declared in the coverage contract is
  not covered;
- the ADR template, decision map, discoverability registry, package docs lane,
  or canonical docs route omits the threat model.

Specialized documents such as Secrets Security, Connector Control Plane, Remote
Gateway and Sync, Mac Permission Broker, Network Control Plane, and Official
Trust remain authoritative for their own controls. The global model references
them as controls and checks; it does not duplicate their detailed policies.

## Threat Model Impact

This ADR creates the threat modeling gate. The protected assets are user data,
agent authority, secrets, signed host authority, remote route authority, local
storage, package/update trust, approvals, audit logs, and external side effects.
The assumed adversaries are malicious local processes, malicious or buggy
plugins and sub-apps, compromised runtimes, hostile network peers, compromised
packages or release artifacts, prompt/tool exfiltration attempts, and social
engineering through approval flows.

The trust boundaries are explicit: user-owned local state, signed host
authority, framework policy evaluators, brokered secret/native operations,
remote Gateway/Connector/Sync transport, package/update provenance, and external
provider calls. The default posture is fail closed, reference over plaintext,
route projection over parallel APIs, signed/audited authority, and local
pull-only security data flows.

## Performance Impact

The guard is static documentation and JSON validation. Runtime CPU, RAM, GPU,
disk, network, battery, thermals, and idle impact are not material. Docs checks
read bounded files and run in the existing docs lane.

## Decision Tensions

- **Prioritized axes**: user control, security as an engineered guarantee,
  agent inspectability, route discoverability, and future regression prevention.
- **Constrained axes**: the model stays a governance layer and does not rewrite
  every specialized security document.
- **Tradeoffs accepted**: adding a new durable surface now requires threat model
  classification, which increases review work but prevents hidden P0 gaps.
- **Debt or pending evidence**: live provider, native host, physical mesh, and
  package signing checks remain governed by their existing `EXTERNAL PENDING`
  lanes until approved real evidence exists.

## Source Decision Audit

This ADR implements the conversation request to close P0 missing global threat
modeling. No existing source decision audit row was present for this exact
request; the durable decision is recorded here and enforced through the new
coverage guard.

## Surface Parity

- **Human surface**: `docs/security-threat-model.md` explains the global model
  and layer coverage in reviewable prose; Clawix mirrors host/UI consequences.
- **Programmatic surface**: `scripts/security-threat-model-check.mjs` validates
  coverage and runs in `npm run test:docs`; `claw search "threat model" --json`
  exposes the canon through discoverability.
- **Persistence**: `docs/security-threat-model.coverage.json` is the durable
  machine-readable contract for required layers, rows, critical surfaces,
  critical routes, and covered ADRs.
- **Gaps**: physical/provider/native/package-signing evidence remains
  `EXTERNAL PENDING` where the specialized control documents already require
  approved live or host validation.
- **Validation**: `node scripts/security-threat-model-check.mjs`,
  `node scripts/security-threat-model-check.mjs --self-test`, `npm run
  test:docs`, `npm test`, and Clawix `bash scripts/test.sh fast`.

## Discovery Route

- **Canonical name**: `adr:global-threat-modeling-governance`.
- **AGENTS/CLAUDE**: root agent instructions route major security and
  integration decisions through `CONSTITUTION.md` and `docs/decision-map.md`,
  which now point to this ADR and the threat model.
- **Skill**: `docs-alignment-update`, `adr-to-guardrail`,
  `secrets-boundary-review`, `host-boundary-review`, `surface-route-work`,
  `integration-qa-lab`, and `public-hygiene-review` apply depending on the
  touched surface.
- **Docs router**: `docs/decision-map.md` contains the global threat modeling
  row.
- **CLI**: `claw search "threat model" --json`, `claw search "prompt
  exfiltration" --json`, and `claw search "supply chain update channel" --json`
  must surface this canon.
- **Registry**: `docs/discoverability.registry.json` records the ADR, docs page,
  coverage file, and guardrail.
- **Operational coverage**: `docs/adr-operational-coverage.manifest.json`
  inherits default ADR coverage, with this ADR routed by the decision map,
  discoverability, the guardrail, and the coverage JSON.

## Consequences

Security-sensitive growth is no longer complete with local prose alone. New
critical layers, surfaces, routes, or accepted security ADRs need threat model
coverage or a bounded explicit exception. The guard catches recurrence before a
P0 omission reaches release review.
