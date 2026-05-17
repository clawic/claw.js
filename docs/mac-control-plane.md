# Mac Control Plane

The Mac Control Plane is the Claw surface for governing local macOS actions.
It exists so agents, MCP clients, automations, the CLI, and Clawix do not call
macOS commands or permissions directly. They resolve capabilities through the
same atlas, policy, permission, audit, and signed-host broker contracts.

The architecture decision is [ADR 0023: Mac Control Plane V1](./adr/0023-mac-control-plane-v1.md).
The permission decision is [ADR 0024: Mac Permission Broker V1](./adr/0024-mac-permission-broker-v1.md).
Source decisions are tracked in [Mac Control Plane Source Decision Audit](./mac-control-plane-source-decision-audit.md)
and [Mac Control Plane Decision Matrix](./mac-control-plane-decision-matrix.md).
Agents working on this surface should use
`skills/mac-control-plane-work/SKILL.md`.

## Public Shape

- Everyday actions use direct roots: `claw wifi`, `claw window`,
  `claw shortcut`, `claw app`, `claw bluetooth`, `claw vpn`, and related
  first-class roots.
- `claw mac` is the control-plane portal for atlas, coverage, doctor, audit,
  plan, permission overview, and revert.
- `claw permissions` is a root surface for central OS permission state,
  framework grants, request plans, audit, doctor, and coverage.
- Commands that collide with older or adjacent meanings show `Related
  surfaces` in normal help. For example, `app` points to `apps`, `audio` points
  to `media audio`, and `notification` points to `notify`.

## Governance Invariants

- All sensitive macOS actions are brokered by the active signed host.
- Node/CLI code must not directly request TCC permissions or execute sensitive
  macOS commands outside the Mac Action Broker allowlist.
- Temporary sensitive native usage is registered in
  `docs/mac-native-usage-allowlist.json` with owner, reason, expiry, and tests.
- Permission prompts are just-in-time. Missing permissions return a plan and
  guidance; they do not trigger surprise native prompts.
- The most restrictive policy wins across host, role, user, agent, assignment,
  run, capability, pack, and action.
- Agents, MCP clients, and automations are safe-read by default. Mutations need
  explicit grants or approvals.
- Every mutation creates a receipt and durable redacted audit event.
- Critical reversible actions use snapshot and rollback timers when possible.

## V1 Executable Slice

The first executable slice is Wi-Fi, windows, Shortcuts, and central
permissions:

- `claw wifi status|list|connect|disconnect|on|off`
- `claw window list|focus|move|resize|close|minimize`
- `claw shortcut list|show|run`
- `claw permissions list|show|check|request|audit|doctor|explain|coverage`

V1 executable means the action has complete CLI/API/UI route, permission
mapping, policy, audit, dry-run, snapshot/revert where applicable, and real
signed-host validation. Nothing marked executable in V1 may remain
`EXTERNAL PENDING`.

## Atlas Source

The canonical atlas lives in `packages/clawjs-core/src/mac-control-plane.ts`.
Each capability records its stable id, family, action, platforms, source,
confidence, backend, OS permissions, risk tier, coverage state, CLI usage,
related surfaces, UI pack, and validation references. The atlas starts
macOS 14+ and must be audited for each macOS major release.

## Programmatic Surfaces

MCP, HTTP API, and SDK callers use the same broker contracts as the CLI. V1
registers these names in `MAC_PROGRAMMATIC_SURFACES`:

- MCP tools: `mac.plan`, `mac.execute`, `mac.revert`, `mac.audit`,
  `mac.permissions`.
- HTTP routes: `/v1/mac/plan`, `/v1/mac/execute`, `/v1/mac/revert`,
  `/v1/mac/audit`, `/v1/mac/permissions`.
- SDK methods: `claw.mac.plan`, `claw.mac.execute`, `claw.mac.revert`,
  `claw.mac.audit`, `claw.mac.permissions`.

`plan` is non-mutating. `execute` and `revert` require signed-host routing and
approval evaluation before any native action can run.

## Route Graph

The stable surface graph registers the first Mac routes explicitly:

- `mac.directCliAction`: direct roots such as `claw wifi connect` resolve
  through `claw.mac.controlPlane`, `claw.mac.capabilityAtlas`,
  `claw.mac.permissionBroker`, `claw.mac.actionBroker`, `claw.host.signed`,
  and `claw.host.audit`.
- `mac.permissionLifecycle`: `claw permissions` resolves through
  `claw.mac.permissionBroker`, `claw.host.permissions`, and `claw.host.audit`.

These routes are inspectable through `claw inspect routes` and enforced by the
surface route graph guard.
