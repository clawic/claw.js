---
title: Workspace Loop
description: Compact workspace operating loop for ClawJS agents.
---

# Workspace Loop

Use ClawJS workspace state before unmanaged files:

- Search first: `claw workspace-search query "..." --json`.
- Plan work with `claw tasks`, `claw projects`, `claw goals`, `claw blockers`, and `claw decisions`.
- Save durable findings with `claw notes create` or task-linked comments/artifacts.
- Use `claw my-work --json` for a single-agent loop and `claw team-work --json` for coordination.
- Use reminders, deadlines, and events for time-bound commitments.
- Prefer `claw db ...` for quick local-first records outside a full app setup.
