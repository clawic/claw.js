---
title: Support Matrix
description: Runtime adapter stability, support level, and recommended production defaults.
---

# Support Matrix

ClawJS uses explicit support tiers.

| Adapter | Stability | Support level | Recommended |
| --- | --- | --- | --- |
| `openclaw` | stable | production | yes |
| `codex` | experimental | experimental | no |
| `zeroclaw` | experimental | experimental | no |
| `picoclaw` | experimental | experimental | no |
| `nanobot` | experimental | experimental | no |
| `nanoclaw` | experimental | experimental | no |
| `nullclaw` | experimental | experimental | no |
| `ironclaw` | experimental | experimental | no |
| `nemoclaw` | experimental | experimental | no |
| `hermes` | experimental | experimental | no |
| `demo` | demo | demo | no |

## Policy

- The support tier is part of the public product story, not decoration.
- Only production adapters should be presented as the default path in onboarding material.
- Experimental adapters may be used for exploration and adapter development, but their behavior may drift faster.
- The `codex` adapter uses the Codex CLI's own authentication store. ClawJS checks `codex login status` and launches `codex login`, but does not read or persist Codex tokens.
