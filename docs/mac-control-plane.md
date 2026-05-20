# Mac Control Plane

The Mac Control Plane is the Claw surface for governing local macOS actions.
It exists so agents, MCP clients, automations, the CLI, and Clawix do not call
macOS commands or permissions directly. They resolve capabilities through the
same atlas, policy, permission, audit, and signed-host broker contracts.

The architecture decision is [ADR 0023: Mac Control Plane V1](./adr/0023-mac-control-plane-v1.md).
The permission decision is [ADR 0024: Mac Permission Broker V1](./adr/0024-mac-permission-broker-v1.md).
Source decisions are tracked in [Mac Control Plane Source Decision Audit](./governance/mac-control-plane/source-audit.md)
and [Mac Control Plane Decision Matrix](./governance/mac-control-plane/decision-matrix.md).
Verb choices for executable and atlas-only capabilities are reviewed in
[Mac Control Plane Verb Audit](./governance/mac-control-plane/verb-audit.md).
Version drift for macOS 14+ is tracked in
[Mac Control Plane Version Drift Audit](./governance/mac-control-plane/version-drift-audit.md).
Agents working on this surface should use
`skills/mac-control-plane-work/SKILL.md`.
Native legacy debt is tracked in
[Mac Native Legacy Audit](./mac-native-legacy-audit.md).

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
  to Mac system-audio coverage, `notification` points to `notify`, data roots
  such as `calendar`, `contacts`, `reminders`, `files`, and `location` point
  to central TCC permission help, and `stt`/`tts`/`voice-notes` point back to
  Mac speech and microphone control.

## Governance Invariants

- All sensitive macOS actions are brokered by the active signed host.
- Node/CLI code must not directly request TCC permissions or execute sensitive
  macOS commands outside the Mac Action Broker allowlist.
- Temporary sensitive native usage is registered in
  `docs/mac-native-usage-allowlist.json` with owner, reason, expiry, and tests.
- Legacy native host paths are tracked in `docs/mac-native-legacy-audit.md`.
- Permission prompts are just-in-time. Missing permissions return a plan and
  guidance; they do not trigger surprise native prompts.
- The most restrictive policy wins across host, role, user, agent, assignment,
  run, capability, pack, and action.
- Agents, MCP clients, and automations are safe-read by default. Mutations need
  explicit grants or approvals.
- Every mutation creates a receipt and durable redacted audit event.
- Critical reversible actions use snapshot and rollback timers when possible.
- Connectivity-changing Wi-Fi actions capture a signed-host continuity snapshot
  before mutation and can be reverted only through the broker-owned revert
  path with explicit confirmation.

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

The public CLI uses the same boundary. When `CLAW_LIVE_BROKER_COMMAND` is
configured, direct roots (`claw wifi ...`, `claw window ...`, `claw shortcut
...`) build the typed `MacActionRequest` and hand executable actions to the
signed host as `system mac execute --request-json ...`. Portal operations such
as `claw mac audit`, `claw mac revert`, and `claw permissions request` also use
the signed-host bridge. If no signed host is configured, the CLI remains
fail-closed and returns a dry-run plan or `signed_host_required` response.

## Permission Lifecycle

The signed host owns durable permission lifecycle state in
`mac-permission-lifecycle.json` under the host state directory. Permission
checks update `lastCheckedAt`, `canRequest`, and restart guidance without
triggering prompts. Native request execution records `requestedBefore`,
`lastRequestedAt`, and `lastRequestResult`. When a permission previously known
as granted is later observed as denied or not determined, the broker records
`revocationDetectedAt` so CLI, API, MCP, and Clawix surfaces can explain the
state change instead of treating it as a fresh unknown permission.

Permission requests are plan-first and just-in-time. `system mac permissions
--command request --permission-id mac.permission...` returns
`confirmation_required`, `nativePrompt: just_in_time_only`, and
`surprisePrompt: false` without invoking a native prompt. With `--confirm true`,
the async signed-host path calls the Mac Permission Broker request API and
persists the result in `mac-permission-lifecycle.json`. MCP/API callers use the
same signed-host handoff through `mac.permissions` and
`/v1/mac/permissions/request`.

## Policy Grants

The signed host owns granular allow/block policy grants in
`mac-control-policy-grants.json` under the host state directory. Grants target
the V1 subject scopes `role`, `user`, `agent`, `assignment`, `run`,
`mcp_client`, and `automation`; each grant can scope to capability ids,
permission ids, and a risk ceiling. Block grants override allow grants and
explicit approvals, preserving the most-restrictive-wins rule. The host bridge
exposes policy `list`, `upsert`, and `revoke` actions so persisted edits are
made through the broker-owned host path rather than through ad hoc Node state.

## Continuity And Revert

The signed host owns Wi-Fi continuity snapshots in
`mac-control-continuity.json` under the host state directory. For continuity
breaker actions such as Wi-Fi disconnect, connect, and power-off, the Mac
Action Broker reads the current Wi-Fi power and network state before executing
the mutation and stores a `macsnap_...` reference on the resulting `macact_...`
receipt. `system mac revert --receipt-id macact_...` first returns the planned
revert steps and `confirmation_required`; execution requires
`--confirm true`. Revert steps are best-effort and broker-owned, using
`networksetup` to restore Wi-Fi power and reconnect to the previous saved
network when the snapshot contains one.

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
