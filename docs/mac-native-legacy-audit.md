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
  Rows marked `retained-non-mac-control` are not public Mac Control surfaces
  and must not be used as executable V1 capability evidence.

## Broker-Owned Native Paths

| Path | Status | Reason |
| --- | --- | --- |
| `apps/host/Sources/ClawHostKit/MacControl.swift` | allowed broker owner | Central Mac Action Broker and Mac Permission Broker for Wi-Fi, windows, Shortcuts, permissions, policy, audit, and wire contracts. |
| `apps/host/Sources/ClawHostKit/MacControlHostBridge.swift` | allowed broker owner | Signed-host programmatic handoff for `system mac plan|execute|permissions|audit|revert`. |
| `clawix/macos/Sources/Clawix/HostActions/MacControlCenter.swift` | allowed embedded host entry | Clawix UI bridge that calls shared `MacControlWire`; it must not call native macOS APIs directly. |

## Legacy / Migration Rows

| ID | Path | Native surface | Current status | Required outcome |
| --- | --- | --- | --- | --- |
| MNL-001 | `apps/host/Sources/CommanderCore/AutomationSupport.swift` | `osascript` helper and Apple Events process execution for older app adapters. | retained-non-mac-control | Retained only as private adapter support. Any public Apple Events or app automation capability must be implemented through `MacControlActionBroker` before it can be executable. |
| MNL-002 | `apps/host/Sources/CommanderAdapters/SystemUtilityAdapters.swift` | App control, process listing, screenshot capture, `osascript`, and `Process`. | retained-non-mac-control | App/process/screenshot adapters are not Mac Control V1 evidence. Public app/window/screen control must use typed broker families; screenshot/input remains computer-use owned until separately brokered. |
| MNL-003 | `apps/host/Sources/CommanderAdapters/CalendarAdapter.swift` | EventKit permissions and Calendar native data access. | permission-broker-covered | Calendar data access remains a private adapter, but Calendar permission state is now represented by `mac.permission.calendar` in `MacControlPermissionBroker`. |
| MNL-004 | `apps/host/Sources/CommanderAdapters/ProductivityAdapters.swift` | Reminders/Contacts native permission and data access. | permission-broker-covered | Reminders/Contacts data access remains private adapter code, but TCC state is now represented by `mac.permission.reminders` and `mac.permission.contacts` in `MacControlPermissionBroker`. |
| MNL-005 | `apps/host/Sources/CommanderAdapters/RemainingAppAdapters.swift` | AppleScript automation for Mail, Notes, Messages, Safari, and related app state. | retained-non-mac-control | Retained only as private app-adapter implementation. Public app-control semantics remain unsupported here until each family is typed and broker-owned. |
| MNL-006 | `packages/clawjs/src/cli-domains-privileges.ts` | `sudo`/`osascript` administrator prompt for local domains install. | retained-installer-only | Retained as installer-specific debt, not a general Mac Control action. It must move to signed-host installer approval before exposure as a Mac capability. |
| MNL-007 | `packages/clawjs-node/src/host/process.ts` | macOS Terminal `osascript` detached PTY helper. | retained-process-helper | Retained as non-Mac-Control terminal/process launch infrastructure. Agent-visible native UI/process control still requires a signed-host broker path. |
| MNL-008 | `bridge/src/computer-use.ts`, `bridge/src/server.ts`, `bridge/src/tcc-job-handler.ts` | computer-use screenshot/input/TCC bridge. | allowlisted-computer-use | Retained under `docs/mac-native-usage-allowlist.json` and `scripts/verify-host-permission-contract.mjs`; not Mac Control executable evidence until unified with broker policy. |

## Disposition Evidence

| ID | Disposition | Evidence |
| --- | --- | --- |
| MNL-001 | retained-non-mac-control | `docs/adr/0023-mac-control-plane-v1.md` retires Commander as public architecture; `MacControlActionBroker` owns executable V1 actions. |
| MNL-002 | retained-non-mac-control | Window V1 actions are brokered in `apps/host/Sources/ClawHostKit/MacControl.swift`; screen/computer-use is separately allowlisted. |
| MNL-003 | permission-broker-covered | `MacControlPermissionID.calendar` and `MacControlPermissionBroker.status/request/openSettings` cover Calendar TCC state. |
| MNL-004 | permission-broker-covered | `MacControlPermissionID.contacts` and `MacControlPermissionID.reminders` cover Contacts and Reminders TCC state. |
| MNL-005 | retained-non-mac-control | No Mail/Notes/Messages/Safari action is marked executable in the Mac Control atlas; future public app automation must be brokered. |
| MNL-006 | retained-installer-only | Privileged local domain install remains installer-specific and outside the Mac Control capability atlas. |
| MNL-007 | retained-process-helper | Terminal PTY helper is not a Mac Control capability and remains separate from agent-visible native UI control. |
| MNL-008 | allowlisted-computer-use | `docs/mac-native-usage-allowlist.json` lists the computer-use bridge paths with expiry and guard tests. |

## Verified Guardrails

- `scripts/verify-host-permission-contract.mjs` blocks unregistered sensitive
  Node-side permission/computer-use patterns.
- `scripts/verify-mac-control-plane-goal.mjs` requires this audit, the native
  usage allowlist, and the Mac Control decision rows.
- Mac Control tests verify that V1 executable actions use `ClawHostKit`
  broker/wire paths rather than the legacy Commander adapters.
