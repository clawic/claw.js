---
title: Support Matrix
description: Runtime adapter stability, support level, and recommended production defaults.
---

# Support Matrix

ClawJS uses explicit v1 support classifications.

| Adapter | Stability | Support level | Recommended |
| --- | --- | --- | --- |
| `openclaw` | stable | production | yes |
| `claw` | stable | dev-only | no |
| `codex` | dev-only | dev-only | no |
| `zeroclaw` | dev-only | dev-only | no |
| `picoclaw` | dev-only | dev-only | no |
| `nanobot` | dev-only | dev-only | no |
| `nanoclaw` | dev-only | dev-only | no |
| `nullclaw` | dev-only | dev-only | no |
| `ironclaw` | dev-only | dev-only | no |
| `nemoclaw` | dev-only | dev-only | no |
| `hermes` | dev-only | dev-only | no |
| `demo` | dev-only | dev-only | no |

## Policy

- The support tier is part of the public product story, not decoration.
- Only production adapters should be presented as the default path in onboarding material.
- Dev-only adapters may be used for local runtime work, fixture coverage, and explicit adapter development. They must not be presented as production defaults.
- The `codex` adapter uses the Codex CLI's own authentication store. ClawJS checks `codex login status` and launches `codex login`, but does not read or persist Codex tokens.
