# ADR 0037: Capability maturity and activation governance

Status: Accepted

Date: 2026-05-21

## Context

ClawJS has many framework, runtime, CLI, storage, inspection, telemetry,
connector, and host-facing capabilities. Clawix adds native routes, app
capabilities, widgets, sidecar service demand, and bridge execution paths. Some
of those surfaces are intentionally incomplete, experimental, or beta, but the
old governance model did not make that state a first-class activation contract.

That gap creates two failure modes: new work can become visible or executable
without a maturity decision, and a capability can be labelled experimental in
one table while another route, widget, service, or release path still starts it.
System telemetry and CPU monitoring exposed the shape of the problem because a
stable user must not accidentally start resource monitoring that was intended
to remain experimental.

## Decision

ClawJS owns the canonical capability maturity ladder:

`incomplete -> experimental -> beta -> stable`

`retired` is a terminal state for removed or unsupported capabilities.
`external_pending` is evidence state, not a maturity level.

New capabilities and subcapabilities default to `incomplete` until a central
registry entry says otherwise. Stable is never a fallback value. Promotion to
`beta` or `stable` requires an ADR, source decision audit row, or other explicit
decision reference. Incomplete work may live on main only when it is registered,
owned, off by default, and blocked from ordinary activation.

Activation is evaluated as a profile ceiling plus capability opt-in policy:
`stable`, `beta`, `experimental`, and `dev` profiles may see only capabilities
at or below their allowed maturity, unless the capability also requires an
explicit opt-in. Blocked activation returns structured `maturity_blocked`
behavior and must not execute the underlying work.

The framework and app must enforce maturity at both declaration time and
activation time:

- Framework registry, inspect, and release gates classify every canonical
  capability and reject unclassified or stable-by-default growth.
- Clawix consumes the same policy through its overlay tables for app features,
  app capabilities, bridge handlers, route demand, menu/status behavior, and
  sidecar service startup.
- System telemetry, CPU sampling, and related monitoring remain
  `experimental` and opt-in until an explicit promotion decision splits any
  stable subcapabilities from the rest.
- Release, fast, and focused maturity checks must run the maturity guard before
  artifacts are treated as releasable.

This ADR does not require a full historical backfill in one transaction. It
does require a central guard path so any remaining historical debt is explicit
baseline debt rather than silent default-stable behavior.

## Performance Impact

The decision reduces accidental resource use by making CPU telemetry,
monitoring, indexing, sidecar startup, and other background-capable work hidden
and inactive unless the active profile and opt-in policy allow it.

The guardrails add lightweight static and focused test work to fast/release
lanes. They do not add runtime background work. Future promotions from
experimental to beta or stable must re-evaluate CPU, RAM, disk, network,
battery, thermals, and idle behavior when the promoted capability can start
persistent work or collect telemetry.

## Decision Tensions

- **Prioritized axes**: user control, no-surprise activation, release safety,
  inspection, auditability, and progressive product evolution.
- **Constrained axes**: velocity remains possible because incomplete work may
  stay on main, but only when it is centrally registered and inert for ordinary
  profiles.
- **Tradeoffs accepted**: contributors must classify new capabilities up front
  and write promotion evidence before changing maturity, but future agents get
  a single route for visibility and activation decisions.
- **Debt or pending evidence**: full historical surface backfill is staged
  follow-up work. The first enforcement slice covers the canonical model,
  release gates, representative runtime paths, and explicit baseline debt.

## Surface Parity

- **Human surface**: `docs/decision-map.md`, this ADR, sibling Clawix mirror
  `docs/adr/0023-capability-maturity-activation-governance-mirror.md`, and
  maturity entries in source decision or goal audits explain the policy.
- **Programmatic surface**: `packages/clawjs-core/src/capability-maturity.ts`,
  `claw inspect maturity`, `claw maturity`, `scripts/capability-maturity-guard.mjs`,
  sibling Clawix `scripts/interface_surface_guard.mjs`, and the Clawix app
  overlay enforce classification and activation.
- **Persistence**: capability registries, Clawix interface/app capability
  registries, decision-map routing, discoverability records, and ADR
  operational coverage carry the durable contract.
- **Gaps**: complete historical backfill, a Clawix Settings audit UI, and live
  provider or physical-device evidence remain outside this ADR slice.
- **Validation**: `npm run test:capability-maturity`, ClawJS release
  `version-governance-check --release-gate`, sibling Clawix
  `scripts/interface_surface_guard.mjs`, Clawix fast/release scripts, and
  focused Swift bridge/route/service tests protect the initial enforcement.

## Discovery Route

- **Canonical name**: `adr:capability-maturity-activation-governance`.
- **AGENTS/CLAUDE**: root instructions route architecture and release work to
  `docs/decision-map.md`, which routes to this ADR.
- **Skill**: governance, release, surface, and route work should begin from
  the decision map and maturity inspect surfaces before adding activation.
- **Docs router**: `docs/decision-map.md` and `docs/discoverability.md`.
- **CLI/check**: `claw inspect maturity --json`, `claw maturity audit --json`,
  `npm run test:capability-maturity`, and release
  `scripts/version-governance-check.mjs --release-gate`.
- **Registry**: `docs/discoverability.registry.json` records this ADR and the
  capability maturity guard route.

## Consequences

Capability maturity becomes a release and runtime invariant. A feature may be
incomplete, experimental, beta, stable, or retired, but it cannot be invisible
to governance. Stable users and stable release checks must not see, start,
route to, or execute beta, experimental, or incomplete work unless a central
decision explicitly promotes and activates that capability.
