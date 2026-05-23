# Mac Control Plane Version Drift Audit

Source conversation: `source:mac-control-plane`

This audit closes the macOS 14+ source and drift requirement for `MCQ-002` and
`MCQ-004`. It records the current major-version review for every Mac Control
Plane atlas capability and backend strategy. The audit was refreshed on
2026-05-18 against the local validation host (`macOS 26.3`, SDK `26.5`) and
public Apple documentation.

## Source Baseline

| Source | URL or path | Used for |
| --- | --- | --- |
| macOS Sonoma 14 Release Notes | `https://developer.apple.com/documentation/macos-release-notes/macos-14-release-notes` | Baseline major supported by the V1 atlas. |
| macOS Sequoia 15 Release Notes | `https://developer.apple.com/documentation/macos-release-notes/macos-15-release-notes` | First post-baseline major drift check. |
| macOS Tahoe 26 Release Notes | `https://developer.apple.com/go/?id=macos-26-rn` | Current major drift check and SDK compatibility horizon. |
| Protected Resources | `https://developer.apple.com/documentation/bundleresources/protected-resources` | TCC/privacy permission catalog and usage-description review. |
| CoreWLAN `CWInterface` | `https://developer.apple.com/documentation/corewlan/cwinterface` | Wi-Fi status/list and CoreWLAN-backed disconnect review. |
| AXUIElement.h | `https://developer.apple.com/documentation/applicationservices/axuielement_h` | Accessibility-backed window control review. |
| Shortcuts command line guide | `https://support.apple.com/guide/shortcuts-mac/apd455c82f02/mac` | `/usr/bin/shortcuts` list/show/run review. |
| Local host check | `sw_vers` => `26.3`, `xcrun --sdk macosx --show-sdk-version` => `26.5` | Current local macOS/SDK validation context. |

## Major-Version Matrix

| macOS major | Marketing name | Drift disposition | Required action before changing executable status |
| --- | --- | --- | --- |
| macOS 14 | Sonoma | Baseline for V1. Atlas entries must cite official source, protected-resource requirement, backend strategy, and coverage state. | Run core/CLI/host/Clawix tests and signed-host validation for executable rows. |
| macOS 15 | Sequoia | No V1 backend replacement is recorded. App container and privacy behavior remains guarded by signed-host permission and action brokers. | Re-run this audit when a capability moves from planned to executable or when Apple release notes mention a used backend. |
| macOS 26 | Tahoe | Current major reviewed. SDK 26 is the current local SDK; AGL removal and unrelated release-note changes do not affect V1 Wi-Fi, AX, Shortcuts, TCC, or planned manual rows. | Re-run this audit for every macOS 26.x SDK/action behavior change and before final signed `Claw.app` closure. |

## Backend Strategy Drift

| Backend strategy | Capability count | macOS 14 | macOS 15 | macOS 26 | Disposition |
| --- | ---: | --- | --- | --- | --- |
| `mixed` | 5 | Supported for Wi-Fi read/list, central permission planning, output volume, and display brightness. | No V1 drift recorded. | No V1 drift recorded. | Keep broker-owned composition; do not expose native calls outside signed host. |
| `networksetup` | 3 | Stable wrapper for Wi-Fi join and power state. | No V1 drift recorded. | No V1 drift recorded. | Continue using wrapper only through Mac Action Broker. |
| `corewlan` | 1 | Official CoreWLAN surface for Wi-Fi interface control. | No V1 drift recorded. | No V1 drift recorded. | Keep signed-host native action and continuity breaker. |
| `cgwindow_observation` | 1 | Observation-only screen/window inventory; Screen Recording permission applies. | No V1 drift recorded. | No V1 drift recorded. | Read-only observation; no control mutation. |
| `accessibility_ax` | 11 | AX-backed control requires Accessibility trust. | No V1 drift recorded. | No V1 drift recorded. | Keep selector validation, permission broker check, and signed-host execution. |
| `appkit` | 1 | AppKit `NSWorkspace` running-app inventory for Computer Use targeting. | No V1 drift recorded. | No V1 drift recorded. | Read-only inventory; no native mutation. |
| `shortcuts_cli` | 3 | `/usr/bin/shortcuts` list/view/run is documented. | No V1 drift recorded. | No V1 drift recorded. | Keep typed input/output plan and broker risk profile. |
| `coreaudio` | 2 | Default output mute properties are broker-owned through the signed host. | No V1 drift recorded. | No V1 drift recorded. | Keep bounded boolean arguments and isolated host tests before real-device closure. |
| `apple_events` | 3 | Apple Events automation requires explicit target validation and TCC ownership. | No V1 drift recorded. | No V1 drift recorded. | Keep approved media-app allowlist and Automation permission routing in the broker. |
| `manual` | 10 | Atlas-only planned entries; not executable. | No executable claim. | No executable claim. | Re-audit official backend before changing coverage state. |

## Capability Drift Table

| Capability id | Backend | Coverage | macOS 14+ drift disposition |
| --- | --- | --- | --- |
| `mac.wifi.status` | `mixed` | executable | Stable wrapper/CoreWLAN read path; no 15/26 drift recorded. |
| `mac.wifi.list` | `mixed` | executable | Stable wrapper/CoreWLAN read path; no 15/26 drift recorded. |
| `mac.wifi.connect` | `networksetup` | executable | Stable `networksetup` wrapper; credentials remain prompt/secret-ref owned. |
| `mac.wifi.disconnect` | `corewlan` | executable | Signed-host CoreWLAN action; continuity/revert validation remains separate. |
| `mac.wifi.power.on` | `networksetup` | executable | Stable `networksetup` wrapper; no 15/26 drift recorded. |
| `mac.wifi.power.off` | `networksetup` | executable | Stable `networksetup` wrapper; critical continuity validation remains separate. |
| `mac.window.list` | `cgwindow_observation` | executable | Observation-only path; Screen Recording permission remains broker-owned. |
| `mac.window.focus` | `accessibility_ax` | executable | AX-backed control; Accessibility permission remains broker-owned. |
| `mac.window.move` | `accessibility_ax` | executable | AX-backed control; selectors and coordinates remain broker-validated. |
| `mac.window.resize` | `accessibility_ax` | executable | AX-backed control; selectors and dimensions remain broker-validated. |
| `mac.window.close` | `accessibility_ax` | executable | AX-backed control; app-level `quit` remains separate. |
| `mac.window.minimize` | `accessibility_ax` | executable | AX-backed control; best-effort revert remains declared. |
| `mac.app.list` | `appkit` | executable | AppKit running-app inventory; read-only Computer Use targeting. |
| `mac.app.state` | `accessibility_ax` | executable | AX tree read (`get_app_state`); Accessibility permission remains broker-owned. |
| `mac.app.click` | `accessibility_ax` | executable | AX press by element index; per-app approval remains host-owned. |
| `mac.app.type` | `accessibility_ax` | executable | Per-process CGEvent text posting; text stays redacted in audit. |
| `mac.app.key` | `accessibility_ax` | executable | Per-process CGEvent key chord posting; chord parsing stays broker-validated. |
| `mac.app.scroll` | `accessibility_ax` | executable | Per-process CGEvent scroll posting; delta stays broker-validated. |
| `mac.app.set_value` | `accessibility_ax` | executable | AX value attribute write; element index stays broker-validated. |
| `mac.app.action` | `accessibility_ax` | executable | Named AX action by element index; action name stays broker-validated. |
| `mac.shortcut.list` | `shortcuts_cli` | executable | `/usr/bin/shortcuts list` remains the documented wrapper path. |
| `mac.shortcut.show` | `shortcuts_cli` | executable | `/usr/bin/shortcuts view` remains the documented inspection path. |
| `mac.shortcut.run` | `shortcuts_cli` | executable | `/usr/bin/shortcuts run` remains documented; input/output typing stays broker-planned. |
| `mac.privacy.permission.request` | `mixed` | dry_run | Protected-resource planning remains broker-owned; real prompt timing requires signed-host validation. |
| `mac.app.open` | `manual` | planned | Atlas-only; no executable claim until AppKit/Launch Services strategy is audited. |
| `mac.app.quit` | `manual` | planned | Atlas-only; no executable claim until app lifecycle strategy is audited. |
| `mac.process.terminate` | `manual` | planned | Atlas-only; no executable claim until process/signal policy is audited. |
| `mac.vpn.connect` | `manual` | planned | Atlas-only; no executable claim until NetworkExtension/system strategy is audited. |
| `mac.bluetooth.connect` | `manual` | planned | Atlas-only; no executable claim until CoreBluetooth strategy is audited. |
| `mac.audio.volume` | `mixed` | executable | Signed-host CoreAudio scalar volume remains bounded to 0-100 and receipt/audit owned. |
| `mac.audio.mute.status` | `coreaudio` | executable | Signed-host CoreAudio mute read is bounded to the default output device and has no mutation. |
| `mac.audio.mute.set` | `coreaudio` | executable | Signed-host CoreAudio mute write remains approval-gated with a boolean argument. |
| `mac.media.playback.status` | `apple_events` | executable | Signed-host Apple Events read remains scoped to an approved media app and Automation permission. |
| `mac.media.playback.pause` | `apple_events` | executable | Signed-host Apple Events pause remains approval-gated and scoped to an approved media app. |
| `mac.media.playback.resume` | `apple_events` | executable | Signed-host Apple Events resume remains approval-gated and scoped to an approved media app. |
| `mac.display.brightness` | `mixed` | executable | Signed-host IOKit brightness remains bounded to 0-100 and writable local displays. |
| `mac.screen.capture` | `manual` | planned | Atlas-only; Screen Recording permission is known but capture backend is not executable. |
| `mac.focus.set` | `manual` | planned | Atlas-only; no executable claim until Focus strategy is audited. |
| `mac.notification.status` | `manual` | planned | Atlas-only; notification status is separate from `notify` sending. |
| `mac.power.sleep` | `manual` | planned | Atlas-only and critical; no executable claim until continuity/revert strategy is audited. |
| `mac.clipboard.read` | `manual` | planned | Atlas-only; Accessibility/data-boundary implications remain guarded before execution. |

## Closure Rule

This audit must be updated when:

1. A new `MAC_CAPABILITY_ATLAS` row is added.
2. A capability changes backend strategy, risk, permission, or coverage state.
3. A new macOS major is in scope after 26.
4. Apple release notes or documentation change a backend used by an executable
   V1 row.
