# Claw Day

`apps/agenda/` is a private visual planning app for ClawJS.

It uses the workspace productivity layer as its store, so projects, goals,
tasks, lists, sections, cycles, epics, milestones, comments, attachments,
saved views, recurrences, custom fields, templates, and progress logs are regular ClawJS
workspace records. WorkOS logic and CLI workflows stay in the shared ClawJS
workspace layer and the main `claw` CLI; this app is the browser UI.

## Local Workflow

```bash
npm --prefix apps/agenda run dashboard
```

Default local URL:

```text
http://127.0.0.1:3737
```

Use a separate workspace root when you want isolated data:

```bash
npm --prefix apps/agenda run dashboard -- --root /tmp/claw-day --port 3737
```

## CLI

The app exposes the official ClawJS CLI against the same workspace:

```bash
npm --prefix apps/agenda run claw -- tasks list --json
npm --prefix apps/agenda run claw -- projects list --json
npm --prefix apps/agenda run claw -- timeline week --start 2026-04-21T00:00:00Z --json
npm --prefix apps/agenda run claw -- goals list --json
```

## Testing

```bash
npm --prefix apps/agenda run test
npm --prefix apps/agenda run test:e2e
```

The browser E2E suite runs against a disposable workspace under `.tmp/` and
captures the final dashboard state under `artifacts/`.
