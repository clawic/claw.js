# Mac Native Legacy Audit

This audit records native macOS usage that exists outside the Mac Control Plane
broker path. It is binding debt for Mac Control V1: no row here may be treated
as a public stable Commander surface, and no new Mac Control capability may be
implemented in these legacy paths.

## Closure Rule

- V1 executable Mac Control actions must run through `ClawHostKit`
  `MacControlActionBroker`, `MacControlPermissionBroker`, `MacControlWire`, and
  the signed-host handoff.
- Legacy native usage outside that broker must be listed here or in
  `docs/mac-native-usage-allowlist.json` with owner, reason, expiry, and tests.
- `Commander*` names that remain in Swift are private implementation names only.
  They do not define public CLI/API/MCP compatibility and must not constrain
  Mac Control semantics.
- Before final goal closure, every row must be either migrated into a brokered
  surface, retired, or kept behind an explicit non-Mac-Control ownership entry.

## Broker-Owned Native Paths

| Path | Status | Reason |
| --- | --- | --- |
| `apps/host/Sources/ClawHostKit/MacControl.swift` | allowed broker owner | Central Mac Action Broker and Mac Permission Broker for Wi-Fi, windows, Shortcuts, permissions, policy, audit, and wire contracts. |
| `apps/host/Sources/ClawHostKit/MacControlHostBridge.swift` | allowed broker owner | Signed-host programmatic handoff for `system mac plan|execute|permissions|audit|revert`. |
| `clawix/macos/Sources/Clawix/HostActions/MacControlCenter.swift` | allowed embedded host entry | Clawix UI bridge that calls shared `MacControlWire`; it must not call native macOS APIs directly. |

## Legacy / Migration Rows

| ID | Path | Native surface | Current status | Required outcome |
| --- | --- | --- | --- | --- |
| MNL-001 | `apps/host/Sources/CommanderCore/AutomationSupport.swift` | `osascript` helper and Apple Events process execution for older app adapters. | private legacy implementation | Keep out of public Mac Control semantics; migrate any Mac Control-like action into `MacControlActionBroker` before marking executable. |
| MNL-002 | `apps/host/Sources/CommanderAdapters/SystemUtilityAdapters.swift` | App control, process listing, screenshot capture, `osascript`, and `Process`. | private legacy implementation | Split general app/process/screenshot control into brokered capability families or register explicit non-Mac-Control ownership. |
| MNL-003 | `apps/host/Sources/CommanderAdapters/CalendarAdapter.swift` | EventKit permissions and Calendar native data access. | private legacy implementation | Route permission state through the central permission broker before public stable use. |
| MNL-004 | `apps/host/Sources/CommanderAdapters/ProductivityAdapters.swift` | Reminders/Contacts native permission and data access. | private legacy implementation | Route TCC state through the central permission broker before public stable use. |
| MNL-005 | `apps/host/Sources/CommanderAdapters/RemainingAppAdapters.swift` | AppleScript automation for Mail, Notes, Messages, Safari, and related app state. | private legacy implementation | Migrate each public app-control capability into a typed brokered family or leave as explicitly unsupported/legacy. |
| MNL-006 | `packages/clawjs/src/cli-domains-privileges.ts` | `sudo`/`osascript` administrator prompt for local domains install. | privileged installer debt | Move privileged installation into a signed-host installer/approval flow before it becomes a general Mac Control action. |
| MNL-007 | `packages/clawjs-node/src/host/process.ts` | macOS Terminal `osascript` detached PTY helper. | non-Mac-Control process helper | Keep separate from Mac Control; any agent-visible native UI/process control must go through a signed-host broker. |
| MNL-008 | `bridge/src/computer-use.ts`, `bridge/src/server.ts`, `bridge/src/tcc-job-handler.ts` | computer-use screenshot/input/TCC bridge. | registered allowlist | Keep covered by `docs/mac-native-usage-allowlist.json` and `scripts/verify-host-permission-contract.mjs` until unified with Mac Permission Broker policy. |

## Verified Guardrails

- `scripts/verify-host-permission-contract.mjs` blocks unregistered sensitive
  Node-side permission/computer-use patterns.
- `scripts/verify-mac-control-plane-goal.mjs` requires this audit, the native
  usage allowlist, and the Mac Control decision rows.
- Mac Control tests verify that V1 executable actions use `ClawHostKit`
  broker/wire paths rather than the legacy Commander adapters.
