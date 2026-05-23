# Mac Control Plane Verb Audit

Source conversation: `source:mac-control-plane`

This audit closes the V1 verb-review requirement for `MCQ-011`. The user
explicitly rejected treating example verbs as fixed. Each atlas capability must
therefore have a chosen model-facing action, stable capability id, direct CLI
shape, and rationale. Planned entries are reviewed here even when they remain
non-executable.

## Review Rules

- Stable ids use `mac.<family>.<action>` unless the domain needs one extra
  noun segment, such as `mac.wifi.power.on`.
- Everyday CLI roots stay direct: `wifi`, `window`, `shortcut`, `permissions`,
  `app`, `process`, `vpn`, `bluetooth`, `audio`, `display`, `screen`, `focus`,
  `notification`, `power`, and `clipboard`.
- Read-like operations use `status`, `list`, `show`, `read`, or `capture` based
  on the object being handled.
- Mutations use short verbs that match user intent: `connect`, `disconnect`,
  `on`, `off`, `focus`, `move`, `resize`, `close`, `minimize`, `run`, `open`,
  `quit`, `terminate`, `set`, and `sleep`.
- Property-style planned actions keep the property in the stable id when that
  makes model routing clearer, and put the mutating verb in CLI shape, such as
  `mac.audio.volume` with `claw audio volume set <value>`.

## Capability Verb Table

| Capability id | Coverage | Canonical CLI | Verb decision |
| --- | --- | --- | --- |
| `mac.wifi.status` | executable | `claw wifi status` | `status` is read-only state inspection for power/interface/current network. |
| `mac.wifi.list` | executable | `claw wifi list` | `list` covers known or available networks; `scan` remains an alias. |
| `mac.wifi.connect` | executable | `claw wifi connect --ssid <ssid>` | `connect` is the direct network join verb; credentials stay secret-ref/prompt owned. |
| `mac.wifi.disconnect` | executable | `claw wifi disconnect` | `disconnect` is explicit because it can break continuity and trigger rollback planning. |
| `mac.wifi.power.on` | executable | `claw wifi on` | `on` is the shortest natural toggle verb; id keeps `power` for stable model routing. |
| `mac.wifi.power.off` | executable | `claw wifi off` | `off` is the direct toggle verb and is critical because it can sever the session. |
| `mac.window.list` | executable | `claw window list` | `list` is observation only and maps to window inventory. |
| `mac.window.focus` | executable | `claw window focus --focused|--id &lt;id&gt;|--app &lt;app&gt;|--title &lt;title&gt;` | `focus` names the foregrounding intent, not the AX mechanism. |
| `mac.window.move` | executable | `claw window move --focused|--id &lt;id&gt;|--app &lt;app&gt;|--title &lt;title&gt;` | `move` maps to position changes and keeps selectors explicit. |
| `mac.window.resize` | executable | `claw window resize --focused|--id &lt;id&gt;|--app &lt;app&gt;|--title &lt;title&gt;` | `resize` maps to size changes and keeps selectors explicit. |
| `mac.window.close` | executable | `claw window close --focused|--id &lt;id&gt;|--app &lt;app&gt;|--title &lt;title&gt;` | `close` targets the selected window, not the whole app; `quit` stays an alias only. |
| `mac.window.minimize` | executable | `claw window minimize --focused|--id &lt;id&gt;|--app &lt;app&gt;|--title &lt;title&gt;` | `minimize` is the user-visible window state change. |
| `mac.app.list` | executable | `claw app list` | `list` enumerates running apps so Computer Use can target one by name. |
| `mac.app.state` | executable | `claw app state --app &lt;app&gt;` | `state` reads the indexed Accessibility element tree (`get_app_state`); read-only. |
| `mac.app.click` | executable | `claw app click --app &lt;app&gt; --element-index &lt;n&gt;` | `click` presses an element by Computer Use index through the Accessibility press action. |
| `mac.app.type` | executable | `claw app type --app &lt;app&gt; --text &lt;text&gt;` | `type` posts text to the target process focus; text is redacted in previews and audit. |
| `mac.app.key` | executable | `claw app key --app &lt;app&gt; --key &lt;chord&gt;` | `key` sends a key chord (e.g. `cmd+n`) to the target process. |
| `mac.app.scroll` | executable | `claw app scroll --app &lt;app&gt; --delta-y &lt;n&gt;` | `scroll` posts a pixel scroll delta to the target process. |
| `mac.app.set_value` | executable | `claw app set-value --app &lt;app&gt; --element-index &lt;n&gt; --value &lt;value&gt;` | `set_value` writes a value to an element via the Accessibility value attribute. |
| `mac.app.action` | executable | `claw app action --app &lt;app&gt; --element-index &lt;n&gt; --ax-action &lt;AXAction&gt;` | `action` performs a named Accessibility action (e.g. `AXShowMenu`) on an element. |
| `mac.shortcut.list` | executable | `claw shortcut list` | `list` mirrors `/usr/bin/shortcuts list`. |
| `mac.shortcut.show` | executable | `claw shortcut show` | `show` is inspect/read semantics for one shortcut definition. |
| `mac.shortcut.run` | executable | `claw shortcut run &lt;name-or-id&gt; --input text|json|file --output text|json` | `run` mirrors Shortcuts terminology and carries higher risk. |
| `mac.privacy.permission.request` | dry_run | `claw permissions request &lt;permission&gt;` | `request` creates or routes a just-in-time permission request plan. |
| `mac.app.open` | planned | `claw app open &lt;app&gt;` | `open` starts or activates an app without borrowing catalog semantics from `apps`. |
| `mac.app.quit` | planned | `claw app quit &lt;app&gt;` | `quit` exits an app; window-level `close` remains separate. |
| `mac.process.terminate` | planned | `claw process terminate --pid &lt;pid&gt;` | `terminate` is explicit process control and avoids overloading app quit. |
| `mac.vpn.connect` | planned | `claw vpn connect &lt;name&gt;` | `connect` mirrors network session establishment and is continuity-sensitive. |
| `mac.bluetooth.connect` | planned | `claw bluetooth connect &lt;device&gt;` | `connect` describes pairing/session attachment without implying discovery. |
| `mac.audio.volume` | executable | `claw audio volume set &lt;value&gt;` | Stable id keeps the governed property; CLI uses `set` for mutation. |
| `mac.audio.mute.status` | executable | `claw audio mute status` | `status` is read-only output mute inspection through the broker. |
| `mac.audio.mute.set` | executable | `claw audio mute set &lt;on\|off&gt;` | `set` changes the output mute property; the argument is a bounded boolean. |
| `mac.media.playback.status` | executable | `claw media playback status --app &lt;app&gt;` | `status` reads playback state for an approved local media app target. |
| `mac.media.playback.pause` | executable | `claw media playback pause --app &lt;app&gt;` | `pause` is a transport action scoped to an approved media app target. |
| `mac.media.playback.resume` | executable | `claw media playback resume --app &lt;app&gt;` | `resume` maps to the app playback `play` transport action while keeping the user-facing verb natural. |
| `mac.display.brightness` | executable | `claw display brightness set &lt;value&gt;` | Stable id keeps the governed property; CLI uses `set` for mutation. |
| `mac.screen.capture` | planned | `claw screen capture` | `capture` is a read/observation action gated by Screen Recording. |
| `mac.focus.set` | planned | `claw focus set &lt;mode&gt;` | `set` is the natural mode-changing verb for Focus state. |
| `mac.notification.status` | planned | `claw notification status` | `status` reads notification permission/delivery state, distinct from `notify`. |
| `mac.power.sleep` | planned | `claw power sleep` | `sleep` is the user-facing power action and remains critical. |
| `mac.clipboard.read` | planned | `claw clipboard read` | `read` is explicit data access and keeps writes out of V1. |

## Canonical CLI Raw Index

The table escapes placeholders and separator pipes for Markdown rendering. This
raw index must match `MAC_CAPABILITY_ATLAS[*].cli.canonicalUsage` exactly.

```text
claw window focus --focused|--id <id>|--app <app>|--title <title>
claw window move --focused|--id <id>|--app <app>|--title <title>
claw window resize --focused|--id <id>|--app <app>|--title <title>
claw window close --focused|--id <id>|--app <app>|--title <title>
claw window minimize --focused|--id <id>|--app <app>|--title <title>
claw shortcut run <name-or-id> --input text|json|file --output text|json
claw permissions request <permission>
claw app open <app>
claw app quit <app>
claw process terminate --pid <pid>
claw vpn connect <name>
claw bluetooth connect <device>
claw audio mute set <on|off>
claw media playback status --app <app>
claw media playback pause --app <app>
claw media playback resume --app <app>
claw display brightness set <value>
claw focus set <mode>
```
