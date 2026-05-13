---
"@clawjs/audio": patch
"@clawjs/channel-base": patch
"@clawjs/cli": patch
"@clawjs/index": patch
"@clawjs/mcp": patch
"@clawjs/node": patch
"@clawjs/runtime": patch
"@clawjs/sandbox": patch
"@clawjs/sessions": patch
"@clawjs/tracking-runtime": patch
"@clawjs/user-model": patch
"@clawjs/voice": patch
"@clawjs/workspace": patch
---

Route V2 data defaults through the canonical Clawix/ClawJS data root: user model, tracking, workspace productivity, channel metadata, MCP metadata, and embedded productivity now default to the main `clawjs.sqlite`, while sessions, audio/voice, drive blobs, runtime/sandbox, and search use documented sidecars under the same root. Existing explicit `*_DB_PATH` and `*_DATA_DIR` overrides continue to win.
