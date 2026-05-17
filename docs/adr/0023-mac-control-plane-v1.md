# ADR 0023: Mac Control Plane V1

## Status

Accepted.

## Context

Claw needs to let agents and users operate the local Mac without bypassing the
framework. Direct macOS commands are often easy wrappers, but they are hard to
audit, hard to govern, and unsafe when they can close windows, kill processes,
change networking, disable VPNs, or remove the agent's own connectivity.

Commander existed as an early prototype, but it is not a public compatibility
constraint. V1 can break and replace it.

## Decision

Create a Mac Control Plane with:

- an exhaustive typed Mac capability atlas;
- direct intuitive CLI roots for ordinary actions;
- `claw mac` as the atlas/coverage/doctor/audit/plan/revert portal;
- signed-host Mac Action Broker execution for all sensitive macOS actions;
- typed action request, plan, receipt, approval, policy, permission, and role
  schemas;
- high-privacy local audit and opaque `macact_...` receipts;
- conflict-aware CLI help with related surfaces.

V1 executable scope is Wi-Fi, windows, Shortcuts, and central permissions. All
other known Mac families may be atlas-only with explicit coverage states.

## Consequences

- New Mac actions must enter through the atlas and broker contracts.
- Direct native calls from feature code are blocked by static/build guardrails
  unless registered in a versioned allowlist.
- CLI roots may be visible before they execute; they must report coverage or
  dry-run information instead of behaving as unknown commands.
- The old Commander naming/surface is retired as stable architecture.
