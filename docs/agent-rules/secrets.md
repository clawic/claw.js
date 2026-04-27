---
title: Secrets
description: Compact secret handling rules for ClawJS agents.
---

# Secrets

Never handle literal secret values.

- Discover metadata with `claw secrets list`, `describe`, `types`, and `capabilities`.
- Use `secretName` references in configs and library requirements.
- Use brokered HTTP or typed actions for real calls.
- Prefer Vault when configured; use sidecar compatibility only for `{{secretName}}` injection flows.
- Stop and ask for setup only when no suitable secret reference exists.
