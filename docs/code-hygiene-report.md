# Code Hygiene Audit

Mode: report-only.

JSON pair: `docs/code-hygiene-report.json`.

- Scanned files: 7200
- TODO/FIXME/HACK/XXX findings: 0
- Duplicate asset groups: 24
- Duplicate asset files: 65
- Unreferenced asset candidates: 0

This audit is advisory until the cleanup campaign classifies or removes findings.
The unreferenced asset candidates category remains tracked explicitly.

## Duplicate Asset Groups

- 3 files, 1235074 bytes: apps/chat/ios/ClawJS/Assets.xcassets/AppIcon.appiconset/AppIcon.png, apps/chat/macos/ClawJSMac/Assets.xcassets/AppIcon.appiconset/AppIcon.png, docs/assets/clawjs-logo.png
- 2 files, 498 bytes: apps/chat/ios/ClawJS/Assets.xcassets/EditIcon.imageset/edit.svg, apps/chat/macos/ClawJSMac/Assets.xcassets/EditIcon.imageset/edit.svg
- 2 files, 284 bytes: apps/chat/ios/ClawJS/Assets.xcassets/MenuIcon.imageset/menu.svg, apps/chat/macos/ClawJSMac/Assets.xcassets/MenuIcon.imageset/menu.svg
- 2 files, 24911 bytes: apps/host/assets/AppIcon.iconset/icon_128x128@2x.png, apps/host/assets/AppIcon.iconset/icon_256x256.png
- 2 files, 1219 bytes: apps/host/assets/AppIcon.iconset/icon_16x16@2x.png, apps/host/assets/AppIcon.iconset/icon_32x32.png
- 2 files, 82238 bytes: apps/host/assets/AppIcon.iconset/icon_256x256@2x.png, apps/host/assets/AppIcon.iconset/icon_512x512.png
- 2 files, 1009163 bytes: apps/host/assets/AppIcon.iconset/icon_512x512@2x.png, apps/host/assets/AppIcon.png
- 3 files, 20064 bytes: assets/apple-touch-icon.png, examples/showcase/public/apple-touch-icon.png, packages/clawjs-database/public/brand/apple-touch-icon.png
- 3 files, 5430 bytes: assets/favicon.ico, examples/showcase/src/app/favicon.ico, packages/clawjs-database/public/brand/favicon.ico
- 2 files, 22082 bytes: assets/icon-192.png, packages/clawjs-database/public/brand/icon-192.png
- 6 files, 124237 bytes: assets/icon-512.png, assets/logo.png, examples/showcase/public/logo-512.png, monitor/ui/public/logo.png, packages/clawjs-database/public/brand/icon-512.png, packages/clawjs-database/public/brand/logo.png
- 3 files, 414174 bytes: assets/og-image.png, examples/showcase/public/og-image.png, packages/clawjs-database/public/brand/og-image.png
- 3 files, 12201 bytes: assets/runtimes/hermes.png, examples/showcase/public/runtimes/hermes.png, packages/clawjs-database/public/brand/runtimes/hermes.png
- 3 files, 3040 bytes: assets/runtimes/ironclaw.png, examples/showcase/public/runtimes/ironclaw.png, packages/clawjs-database/public/brand/runtimes/ironclaw.png
- 3 files, 5233 bytes: assets/runtimes/nanobot.png, examples/showcase/public/runtimes/nanobot.png, packages/clawjs-database/public/brand/runtimes/nanobot.png
- 3 files, 4557 bytes: assets/runtimes/nanoclaw.png, examples/showcase/public/runtimes/nanoclaw.png, packages/clawjs-database/public/brand/runtimes/nanoclaw.png
- 3 files, 5288 bytes: assets/runtimes/nemoclaw.png, examples/showcase/public/runtimes/nemoclaw.png, packages/clawjs-database/public/brand/runtimes/nemoclaw.png
- 3 files, 1493 bytes: assets/runtimes/nullclaw.png, examples/showcase/public/runtimes/nullclaw.png, packages/clawjs-database/public/brand/runtimes/nullclaw.png
- 3 files, 4526 bytes: assets/runtimes/openclaw.png, examples/showcase/public/runtimes/openclaw.png, packages/clawjs-database/public/brand/runtimes/openclaw.png
- 3 files, 2555 bytes: assets/runtimes/picoclaw.png, examples/showcase/public/runtimes/picoclaw.png, packages/clawjs-database/public/brand/runtimes/picoclaw.png
- 3 files, 5478 bytes: assets/runtimes/zeroclaw.png, examples/showcase/public/runtimes/zeroclaw.png, packages/clawjs-database/public/brand/runtimes/zeroclaw.png
- 2 files, 819829 bytes: assets/sponsors/landscape-ai.png, packages/clawjs-database/public/brand/sponsors/landscape-ai.png
- 2 files, 5685 bytes: examples/showcase/public/chat-icon.png, examples/showcase/public/header-chat-icon.png
- 2 files, 411 bytes: packages/clawjs/templates/app/src/app/icon.svg, packages/create-claw-app/template/src/app/icon.svg
