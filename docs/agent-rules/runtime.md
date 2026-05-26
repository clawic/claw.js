---
title: Runtime
description: Compact runtime and auth reference for ClawJS agents.
---

# Runtime
<!-- migrated-to: catalog:agent-rules.runtime.state-inspection.read -->

Inspect before changing runtime state.

```bash
claw runtime status --json
claw auth status --json
claw models list --json
claw providers auth-state --json
```

<!-- migrated-to: catalog:agent-rules.runtime.state-repair.write -->
Use `runtime repair` and `runtime setup-workspace` before manual file edits. Use dry-run for install, uninstall, repair, and setup plans when available.

For host-dependent issues, validate in the same execution mode the user uses. Hermetic tests prove UI/control flow, not real host behavior.
