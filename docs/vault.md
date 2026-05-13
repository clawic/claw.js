---
title: Vault
description: Secret reference and vault boundary for Claw.
---

# Vault

Claw public APIs use secret references such as `vault://agents/default`.
Secret material is owned by the active host or secrets service, not by the
public CLI.

Use the host and secrets surfaces for operational access:

```bash
claw host permissions list
claw host capabilities list
claw open secrets
```
