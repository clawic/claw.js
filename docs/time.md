---
title: Time Service
description: Standalone temporal control plane for calendar events, routines, reminders, deadlines, and watches.
---

# Time Service

`time/` is the standalone temporal control plane for ClawJS. It is the
source of truth for time-aware work:

- calendar events
- routines and cron-style automations
- reminders and deadlines
- conditional watches such as "24h if no reply"

The service exposes:

- a Fastify HTTP API backed by SQLite
- an internal scheduler with execution history
- compatibility projections for workspace events and relay routines
- a bundled UI with Calendar, Timeline, Automations, and Runs views

## CLI

Use the standalone service through the main CLI:

```bash
claw calendar at "monday 9am" "review PRs" --time-url http://127.0.0.1:4730
claw calendar list --time-url http://127.0.0.1:4730
claw routines every "3h" "check deployment health" --time-url http://127.0.0.1:4730
claw routines run item_123 --time-url http://127.0.0.1:4730
claw routines history item_123 --time-url http://127.0.0.1:4730
claw reminders after "30m" "check build" --time-url http://127.0.0.1:4730
claw watch thread:thread-42 --if-no reply --after 24h --then remind "ping owner" --time-url http://127.0.0.1:4730
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

await claw.calendar.at({
  title: "Review PRs",
  expression: "monday 9am",
});

await claw.routines.every({
  title: "Check deployment health",
  expression: "3h",
});

await claw.watch.create({
  target: "thread:thread-42",
  ifNo: "reply",
  after: "24h",
  then: { kind: "remind", title: "Ping owner" },
});

await claw.routines.disable("item_123");
await claw.routines.enable("item_123");
const run = await claw.routines.run("item_123");
const executions = await claw.routines.history("item_123");
const calendar = await claw.calendar.view();
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

## Execution Views

- `disable` and `enable` change whether the scheduler should evaluate the
  item.
- `run` executes an item immediately and records a
  `TemporalExecution`.
- `history` lists historical runs, optionally scoped to one item.
- `calendar` returns date-bounded entries suitable for calendar UIs.
- `timeline` returns chronological temporal items for activity and
  planning views.
