---
title: Agent Commands
description: Compact command reference for ClawJS-aware agents.
---

# Agent Commands

Prefer `--json` for agent-readable output.

Core:

```bash
claw info --json
claw doctor --json
claw workspace inspect --json
claw features describe --json
```

Work:

```bash
claw tasks create --title "..."
claw tasks list --json
claw notes create --title "..." --content "..."
claw search query "..." --json
```

Prompt context:

```bash
claw rules compile "request" --domain workspace --json
claw sessions list --json
claw inference generate-text --prompt "..." --domain workspace --json
```

Do not run commands against real services, paid APIs, production data, installs, auth, or destructive flows unless isolated or explicitly approved.
