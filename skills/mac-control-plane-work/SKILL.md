---
name: mac-control-plane-work
description: Work on macOS control, permissions, native execution, audit, or Clawix host integration through the Mac Control Plane contracts.
keywords: [mac, macos, permissions, action-broker, permission-broker, clawix]
---

# mac-control-plane-work

Use this when a task touches macOS actions, native permissions, Wi-Fi,
windows, Shortcuts, AppleScript, Accessibility, screen capture, microphone,
speech, Bluetooth, VPN, system settings, native command wrappers, Clawix signed
host execution, Mac audit receipts, or Commander migration.

## Procedure

1. Start from the canon:
   - `docs/mac-control-plane.md`
   - `docs/adr/0023-mac-control-plane-v1.md`
   - `docs/adr/0024-mac-permission-broker-v1.md`
   - `docs/governance/mac-control-plane/source-audit.md`
   - `docs/governance/mac-control-plane/decision-matrix.md`
2. Inspect the registered routes before editing:
   - `claw inspect route mac.directCliAction --json`
   - `claw inspect route mac.permissionLifecycle --json`
   - `claw inspect show claw.mac.controlPlane --json`
   - `claw inspect show claw.mac.permissionBroker --json`
   - `claw inspect show claw.mac.actionBroker --json`
3. Keep ownership intact:
   - ClawJS owns contracts, atlas entries, schemas, CLI, MCP/API contracts,
     route graph, tests, docs, and static guardrails.
   - Clawix owns native UI, signed-host execution, host identity, TCC state,
     local prompt rendering, and host operational audit storage.
4. Add or change Mac capabilities only through
   `packages/clawjs-core/src/mac-control-plane.ts`. Every capability needs a
   stable `mac.<family>.<action>` id, permissions, risk tier, backend strategy,
   coverage state, CLI usage, related surfaces, docs, and validation evidence.
5. For real native execution, route through the signed-host Mac Action Broker.
   Do not call `networksetup`, `osascript`, AX, `shortcuts`, `screencapture`,
   TCC helpers, process killers, or sensitive native APIs directly from CLI,
   Node, feature services, or tests unless the use is in the versioned broker
   allowlist with owner, reason, expiry, and tests.
6. For permissions, route through the central Mac Permission Broker. Feature
   services such as dictation, screen tools, or voice must consume central
   permission state and request plans instead of owning prompts.
7. Preserve direct CLI semantics. Everyday roots are `wifi`, `window`,
   `shortcut`, `app`, `bluetooth`, `vpn`, and related nouns. `mac` is the
   control-plane portal; `permissions` is its own root. Collision help must
   show `Related surfaces`.
8. Treat executable V1 claims as host-dependent. Hermetic tests can prove
   schemas, plans, routing, and guardrails, but real execution needs signed
   Clawix embedded and Claw.app standalone validation. Mark physical gaps as
   `EXTERNAL PENDING` only for non-executable or explicitly external items.
9. Before claiming goal progress, run the focused gate:
   - `node scripts/verify-mac-control-plane-goal.mjs`
   - `node scripts/surface-route-graph-guard.mjs`
   - `node scripts/verify-host-permission-contract.mjs`
   - relevant Mac CLI/core tests

## Constraints

- Do not reintroduce Commander as a stable public surface.
- Do not require the `mac` prefix for ordinary local actions.
- Do not request all permissions at install; permission requests are
  just-in-time and plan-first.
- Do not store secrets, full paths, sensitive SSIDs, window titles, or native
  payloads in public docs, fixtures, or unredacted audit output.
- Do not mark a V1 executable Mac action complete while its real signed-host
  validation is still `EXTERNAL PENDING`.
