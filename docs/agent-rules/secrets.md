---
title: Secrets
description: Compact secret handling rules for ClawJS agents.
---

# Secrets
<!-- migrated-to: catalog:agent-rules.secrets.secret-values.write -->

Never handle literal secret values.

- Treat [Secrets Security Model](../secrets-security.md) as the canonical
  policy for vaults, brokered use, connectors, plugins, CLI, audit, and
  backups.
<!-- migrated-to: catalog:agent-rules.secrets.secret-metadata.read -->
- Discover metadata with `claw secrets list`, `describe`, `types`, and `capabilities`.
- Use `secretName` references in configs and library requirements.
- Use brokered HTTP or typed actions for real calls; do not resolve
  `secretRefs` into plaintext for connector, plugin, CLI, or model code.
- Do not ask for, print, store, or log master passwords, Secret Keys, recovery
  phrases, Emergency Kits, backup passphrases, signed-host tokens, or host
  assertion keys.
- Prefer Secrets when configured; use bounded sidecar injection only for
  `{{secretName}}` flows that still pass broker policy, signed-host approval,
  host allowlists, and risk checks.
- Missing principal, host, placement, risk, capability, approval, or policy
  context means stop and fail closed.
- Stop and ask for setup only when no suitable secret reference exists.
