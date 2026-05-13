# Cutover from `clawix-bridged` (Swift) to `clawjs-bridged` (Node)

End-to-end migration recipe for the Clawix Mac app. The Node daemon
(`clawjs-bridged`) replaces the Swift helper without changing the wire
protocol seen by the GUI (`/mesh/*` on loopback port 7779,
`/bridge` WebSocket on 7778, Bonjour `_clawix-bridge._tcp`). The Mac
app, the iOS client, the menu bar and the npm CLI keep talking to
exactly the same surfaces.

What changes is *what process owns the port*. Apple's TCC ledger is
keyed on the codesign identity of that process, so the cutover is the
one moment in the migration where the user has to re-grant
Accessibility / Screen Recording / Automation permissions.

The Mac UI plumbing is already done in F8: `MeshStore` exposes
`upsertSshHost`, `revokePeer`, `unrevokePeer`, `removeHost`. The
`Hosts` settings page calls them from the SSH form and the host
detail sheet. They hit `POST /mesh/hosts`, `POST /mesh/hosts/:id/revoke`,
etc. — endpoints that **only the Node daemon exposes**. Until the
process is switched, those calls return 404 and the banner reports
"HTTP 404". That is the signal to run this migration.

## 1. Build the Node daemon tarball for the host arch

From the ClawJS workspace (`/Users/trabajo/Desktop/clawjs/`):

```sh
cd bridge
bash scripts/build-tarball.sh                   # host target
# or
bash scripts/build-tarball.sh --target darwin-x64
```

This produces `bridge/out/clawjs-bridged-darwin-<arch>-<version>.tar.gz`
with bundled JS, the right `better_sqlite3.node` prebuilt and the
launcher script under `bin/clawjs-bridged`.

Smoke-test it standalone first:

```sh
tar -xzf bridge/out/clawjs-bridged-darwin-arm64-0.1.0.tar.gz -C /tmp
CLAWJS_BRIDGE_BIND=127.0.0.1 CLAWJS_BRIDGE_DB=/tmp/test.sqlite \
  CLAWJS_BRIDGE_STATUS=/tmp/test-status.json \
  CLAWJS_BRIDGED_DISABLE_BONJOUR=1 \
  /tmp/clawjs-bridged-0.1.0/bin/clawjs-bridged
# Expect: "clawjs-bridge ready on http://127.0.0.1:7779 ..."
```

Send `Ctrl-C` to stop.

## 2. Drop the tarball into the Mac bundle

From the Clawix workspace (`/Users/trabajo/Desktop/Clawix/`):

```sh
# Build a debug app to land the daemon in (or skip if you have one).
bash dev.sh   # produces /Applications/Clawix.app or build/Clawix.app

# Embed the daemon.
bash clawix/macos/scripts/bundle_clawjs_bridged.sh \
  --app /Applications/Clawix.app \
  --tarball /Users/trabajo/Desktop/clawjs/bridge/out/clawjs-bridged-darwin-arm64-0.1.0.tar.gz
```

Resulting layout:

```
Clawix.app/Contents/Helpers/clawix-bridged                # legacy Swift, untouched
Clawix.app/Contents/Helpers/clawjs-bridged/               # new Node daemon
  bin/clawjs-bridged
  lib/start.cjs
  node_modules/...
  package.json
```

## 3. Re-sign the bundle deep

Required so the embedded daemon and its `.node` addons inherit the
stable codesign identity from `.signing.env`. Without this, macOS will
prompt for permissions on every relaunch.

```sh
codesign --force --deep --options runtime \
  --sign "$SIGN_IDENTITY" /Applications/Clawix.app
codesign --verify --strict --deep /Applications/Clawix.app
```

The Helpers tree contains a `.node` native addon and a wrapper sh
script — both end up in the deep-signed graph. If a future
`build_app.sh` revision adopts hardened-runtime entitlements for
`clawjs-bridged`, this is where they'd go.

## 4. Flip BackgroundBridgeService

The reversible toggle lives in `macos/Sources/Clawix/Background/BackgroundBridgeService.swift`.
Today the Swift `start()` method resolves the helper as:

```swift
let helper = Bundle.main.bundleURL
    .appendingPathComponent("Contents/Helpers/clawix-bridged")
```

For F8 cutover, change the resolver to prefer the Node daemon when
present and fall back to the Swift helper:

```swift
let nodeHelper = Bundle.main.bundleURL
    .appendingPathComponent("Contents/Helpers/clawjs-bridged/bin/clawjs-bridged")
let legacyHelper = Bundle.main.bundleURL
    .appendingPathComponent("Contents/Helpers/clawix-bridged")
let helper = FileManager.default.fileExists(atPath: nodeHelper.path)
    ? nodeHelper
    : legacyHelper
```

That is the **only** Swift change required. Everything else
(`MeshStore`, `MeshClient`, `HostsPage`, `HostEditorSheet`,
`HostDetailView`) already targets the wire surface both daemons
expose.

Rebuild + relaunch:

```sh
bash dev.sh
```

## 5. Re-grant TCC permissions

The first launch after the flip pops the standard Apple prompts:

- **Accessibility** — for Computer Use clicks/keystrokes.
- **Screen Recording** — for `screencapture` in `tcc.computer.screenshot`.
- **Automation** — for `osascript`-driven keystrokes.

Grant each one. Because the new daemon is signed with the same
identity as the .app, the grants persist across relaunches. Old
grants for `clawix-bridged` stay in the database; macOS treats them
as orphaned and surfaces the new prompt for `clawjs-bridged`.

If the prompt does not appear:

- Verify the helper path: `ps -ef | grep clawjs-bridged` should show
  `Clawix.app/Contents/Helpers/clawjs-bridged/bin/clawjs-bridged`.
- Verify the signature: `codesign -dvv Clawix.app/Contents/Helpers/clawjs-bridged/bin/clawjs-bridged`
  prints the same identity as the .app's `Contents/MacOS/Clawix`.
- Use the workspace preflight: `bash scripts-dev/clawix-launcher.sh preflight-computer-use`.

## 6. Verify everything end-to-end

| Feature | How to verify |
|---|---|
| Identity | Settings → Hosts → "This Mac" shows the same node id as before. |
| Pairing (legacy) | `Add host` → Pair a Mac with another box — round-trip succeeds. |
| Pairing (iOS) | Existing iPhone reconnects without re-pairing (same bearer in UserDefaults). |
| `POST /mesh/hosts` | `Add host` → Add SSH server form completes and the new row shows in `Hosts`. |
| Revoke | Open a host's detail sheet → Revoke → the row gets the `Revoked` pill and `Unrevoke` becomes available. |
| Remote jobs | Composer → run a prompt against a paired peer; status card cycles `queued → running → completed`. |
| Codex | Send a chat — it goes through the embedded daemon, which now spawns Codex as a runtime adapter. |
| Audit | Daemon's SQLite audit log fills with `meshLink` / `meshPair` / `meshJob` / `proxySsh` rows. |

## 7. Rollback

Risk-free: remove the Node bundle and the resolver fallback picks the
Swift helper:

```sh
rm -rf /Applications/Clawix.app/Contents/Helpers/clawjs-bridged
bash dev.sh
```

If the `BackgroundBridgeService.swift` resolver edit already shipped,
revert that file too.

The on-disk state of the Node daemon now lives with the Clawix/ClawJS
data root (`~/Library/Application Support/Clawix/clawjs/runtime.sqlite`)
while bridge status remains at `~/.clawix/state/bridge-status.json`.
Removing the bundle does not delete it; that lets a second pass restore
the daemon without losing host records or audit logs.

## 8. After the cutover is durable

Once one or two release cycles pass with no rollbacks, the Swift
helper can be retired:

- Delete `macos/Helpers/Bridged/Sources/clawix-bridged/`.
- Remove the target from `macos/Package.swift`.
- Drop the fallback branch in `BackgroundBridgeService.swift`.
- Adjust `dev.sh` / `build_app.sh` to stop building / signing the
  Swift helper.

Those are individual PRs, not part of this migration document.
