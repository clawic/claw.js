---
title: Support Matrix
description: Runtime adapter stability, support level, and recommended production defaults.
---

# Support Matrix

ClawJS uses explicit v1 support classifications.

Runtime ecosystem claims are stricter than adapter stability. A runtime can
have an adapter and still be dev-only for sessions, skills, memory, channels,
providers, plugins, or write-back. See
[Runtime Ecosystem Integration Standard](/runtime-ecosystem-integration-standard)
and the machine-readable
[`runtime-ecosystem-integration.manifest.json`](runtime-ecosystem-integration.manifest.json)
before promoting a runtime lens, `recommended`, `production`, or native parity
claim.

| Adapter | Stability | Adapter support level | Adapter recommended | Runtime ecosystem claim |
| --- | --- | --- | --- | --- |
| `openclaw` | stable | production | yes | operable partial; current Clawix runtime-lens evidence exists, absent native create/write-back contracts are product-blocked local-overlay/read-only behavior, and ecosystem-production remains blocked until live evidence and final promotion close |
| `claw` | stable | dev-only | no | baseline only |
| `codex` | dev-only | dev-only | no | dev-only partial projection |
| `zeroclaw` | dev-only | dev-only | no | baseline only |
| `picoclaw` | dev-only | dev-only | no | baseline only |
| `nanobot` | dev-only | dev-only | no | baseline only |
| `nanoclaw` | dev-only | dev-only | no | baseline only |
| `nullclaw` | dev-only | dev-only | no | baseline only |
| `ironclaw` | dev-only | dev-only | no | baseline only |
| `nemoclaw` | dev-only | dev-only | no | baseline only |
| `hermes` | dev-only | dev-only | no | dev-only partial projection |
| `demo` | dev-only | dev-only | no | baseline only |

## Policy

- The support tier is part of the public product story, not decoration.
- Only production adapters should be presented as the default path in onboarding material.
- Dev-only adapters may be used for local runtime work, fixture coverage, and explicit adapter development. They must not be presented as production defaults.
- The `codex` adapter uses the Codex CLI's own authentication store. ClawJS checks `codex login status` and launches `codex login`, but does not read or persist Codex tokens.
- `recommended`, `production`, native-parity, and UI parity claims require a
  current official runtime ecosystem snapshot, complete triple matrix,
  field/action authority policy, user-visible lens evidence where claimed, and
  passing `npm run test:runtime-ecosystem`.
- When a runtime has no official native create/write-back command or API,
  ClawJS may classify that action as product-blocked with a user-visible
  read-only or local-overlay contract. This is not native parity and must not
  be promoted as write-back support.
