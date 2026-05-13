---
title: Claw Day
description: Private visual planning app for ClawJS projects, goals, tasks, timelines, and progress logs.
---

# Claw Day

`apps/agenda/` is the private visual planning app for ClawJS.

It uses the workspace productivity layer directly, so the browser UI renders
the same local project, goal, task, milestone, cycle, and note records exposed
by `@clawjs/workspace` and the main `claw` CLI.

## Current Scope

- active projects and goals for the day
- today focus tasks, queued tasks, and completed-today tasks
- a day/week timeline with task bars, milestones, deadlines, cycles, project filters, dependency readiness, and a Now recommendation
- quick progress logs stored as tagged notes
- official `claw` productivity commands for project, goal, task, milestone, timeline, and log data
- hermetic browser E2E coverage against a disposable local workspace

## Local Run

```bash
npm --prefix apps/agenda run dashboard
```

Default local URL:

```text
http://127.0.0.1:3737
```

Use `--root` to point the app at a different ClawJS workspace:

```bash
npm --prefix apps/agenda run dashboard -- --root /tmp/claw-day --port 3737
```

## CLI

Use the main ClawJS CLI against the same workspace data:

```bash
npm --prefix apps/agenda run claw -- tasks list --json
npm --prefix apps/agenda run claw -- timeline week --start 2026-04-21T00:00:00Z --json
```
