---
title: Rules, Skills, Library
description: Compact instructions for choosing ClawJS rules, skills, and library assets.
---

# Rules, Skills, Library
<!-- migrated-to: catalog:agent-rules.rules-skills-library.rules.read -->

Use the smallest durable mechanism:

- Rules: always-on behavior, safety policies, style, domain defaults.
- Skills: detailed task procedures that the agent reads when needed.
- Library: local reusable assets, bundles, projections, prompt capsules, and secret requirements.
- Soul: agent identity and operating personality.

Useful commands:

```bash
claw rules list --json
claw rules compile "request" --json
claw skills search --query "..." --json
claw library resolve --agent AGENT --json
claw library sync --agent AGENT --json
```
