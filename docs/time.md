---
title: Time Service
description: Standalone calendar and scheduler control plane for events, routines, reminders, deadlines, and follow-ups.
---

# Time Service

`time/` is the standalone temporal control plane for ClawJS. It is the
source of truth for time-aware work:

- calendar events
- routines and cron-style automations
- reminders and deadlines
- conditional follow-ups such as "24h if no reply"

The service exposes:

- a Fastify HTTP API backed by SQLite
- an internal scheduler with execution history
- compatibility projections for workspace events and relay routines
- a bundled UI with Calendar, Timeline, Automations, and Runs views

## CLI

Use the standalone service through the main CLI:

```bash
claw time list --time-url http://127.0.0.1:4730
claw schedule every "3h" "check deployment health" --time-url http://127.0.0.1:4730
```

## SDK

Use the service through `CreateClawOptions.time`:

```ts
const claw = await createClaw({
  runtime: { adapter: "openclaw" },
  workspace: {
    appId: "demo",
    workspaceId: "demo-main",
    agentId: "demo-main",
    rootDir: "./workspace",
  },
  time: {
    baseUrl: "http://127.0.0.1:4730",
  },
});

await claw.time.create({
  kind: "follow_up",
  title: "Follow up on thread",
  natural: {
    command: "after",
    expression: "24h if no reply",
    anchorType: "thread",
    anchorId: "thread-42",
  },
});
```

## Data Model

The canonical record is `TemporalItem` with:

- `kind`: `event`, `routine`, `reminder`, `deadline`, `follow_up`
- `schedule.mode`: `one_off`, `cron`, `rrule`, `relative`
- `participants`
- `actions`
- `projections`
- `executions`

Store timestamps in UTC and keep an IANA timezone on the item so the
service can normalize natural input and recurring schedules correctly.
