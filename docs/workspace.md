---
title: Workspace
description: Learn the stable .clawjs layout, adapter file contracts, and the main workspace operations.
---

# Workspace

A workspace is an isolated directory that combines one stable ClawJS
layer with one adapter-defined runtime file contract.

A workspace is not the same thing as an agent. The workspace is the
container; the agent is the identity and behavior operating inside that
container.

## Stable internal layout

- `.clawjs/manifest.json`
- `.clawjs/compat/`
- `.clawjs/intents/`
- `.clawjs/observed/`
- `.clawjs/projections/`
- `.clawjs/sessions/`

`intents` store what the user wants, `observed` stores rebuildable
runtime snapshots, and `projections` stores the binding/schema layer
used to project settings into visible workspace files.

## Runtime-facing layout

Each adapter declares its own runtime file contract. Examples:

- **OpenClaw:** \`SOUL.md\`, \`USER.md\`, \`AGENTS.md\`, \`TOOLS.md\`,
  \`IDENTITY.md\`, \`HEARTBEAT.md\`
- **ZeroClaw:** \`SOUL.md\`, \`USER.md\`, \`AGENTS.md\`,
  \`IDENTITY.md\`, \`MEMORY.md\`
- **PicoClaw:** \`SOUL.md\`, \`USER.md\`, \`AGENTS.md\`,
  \`IDENTITY.md\`, \`memory/MEMORY.md\`

## Main operations

- `claw.workspace.init()`
- `claw.workspace.attach()`
- `claw.workspace.validate()`
- `claw.workspace.inspect()`
- `claw.workspace.repair()`
- `claw.workspace.reset()`
- `claw.workspace.canonicalPaths()`

<!-- -->

```ts
await claw.workspace.init();

const snapshot = await claw.workspace.inspect();
console.log(snapshot.manifest);
console.log(snapshot.intents);
console.log(snapshot.observed);
console.log(snapshot.workspaceState);
console.log(snapshot.skillsState);
```
## Workspace and agent IDs

Some examples set `workspaceId` and `agentId` to the same value for
convenience. That is a scaffold default, not a product rule.

The intended model is:

- `workspaceId` identifies the isolated workspace context
- `agentId` identifies the agent identity used in that context

## Productivity Layer With `@clawjs/workspace`

`@clawjs/workspace` extends the base SDK when you want a local-first
productivity layer instead of only runtime primitives.

```bash
npm install @clawjs/workspace
```

```ts
import { createWorkspaceClaw } from "@clawjs/workspace";

const claw = await createWorkspaceClaw({
  runtime: { adapter: "openclaw" },
  workspace: {
    appId: "demo",
    workspaceId: "ops-main",
    agentId: "ops-main",
    rootDir: "./workspace",
  },
});

await claw.tasks.create({ title: "Triage docs drift" });
await claw.notes.create({ title: "Release notes", content: "Draft summary" });
const results = await claw.search.query({ query: "docs", domains: ["tasks", "notes"] });
```

The productivity instance adds:

- `areas` for long-lived responsibility areas
- `lists` and `sections` for inbox, today, upcoming, someday, backlog, and ordered project breakdowns
- `tasks` for task CRUD, completion, archive, and search
- `goals` for goal CRUD, archive, and search
- `projects` for project CRUD, archive, and search
- `comments` and `attachments` for discussion and evidence linked to work records
- `savedViews` for reusable filters, grouping, sorting, and favorite views
- `recurrences` for recurring work rules and next-run state
- `cycles` for sprint-style planning windows and capacity
- `epics` for epic or initiative grouping above tasks
- `customFields` and `fieldValues` for typed team-specific metadata
- `templates` for reusable task, project, goal, epic, cycle, or note bodies
- `milestones` for milestone CRUD, archive, and search
- `activity` for activity/history reads and search
- `blockers` for explicit blockers, dependency state, and blocker search
- `artifacts` for captured evidence such as screenshots, tests, links, and notes
- `decisions` for structured operational decisions and rationale
- `workSessions` for focused work blocks with outcomes and timeboxes
- `agents` for roster, autonomy, permissions, and current focus
- `releases` for release state, risk, linked work, incidents, and approvals
- `incidents` for operational risk, severity, blockers, and customer impact
- `feedback` for external signal linked back to work, incidents, and follow-up
- `checks` for operational checks, cadence, and readiness or compliance state
- `reminders` for reminder CRUD, pause/resume, and search
- `deadlines` for deadline CRUD, pause/resume, and search
- `notes` for note CRUD, archive, and search
- `people` for person upserts, identity matching, and search
- `inbox` for draft creation, routing replies, ingesting incoming messages, and thread reads
- `events` for calendar-style records and search
- `agenda`, `review`, and `productivity` helpers for higher-level daily workflows, day/week timelines, my-work views, team coordination, operations cockpit summaries, export/import, backup, inspect, and repair
- `search`, `context`, and `ui` helpers for cross-domain workflows
- `workspace.tools.describe()` so UIs can render tool metadata from the same runtime-aware source

## Productivity Storage

The productivity layer stores user-facing records in the canonical
Claw main database while the base workspace metadata stays under the
stable `.claw/manifest`, `compat`, `intents`, `observed`, and
`projections` folders. `.clawjs/` is legacy compatibility only.

The current local-first database path on macOS is
`~/Library/Application Support/Claw/claw.sqlite`. Older
workspaces that still contain the legacy productivity database are
detected and migrated by the local data layer. After migration, new
writes should use `claw db ...`, `@clawjs/workspace`, or the database
service APIs instead of writing the old file directly.

That split matters:

- `.claw/manifest`, `intents`, `observed`, and `projections` are SDK-owned control planes
- the canonical main DB stores user-facing productivity records
- runtime-facing files such as `SOUL.md` or `IDENTITY.md` stay outside `.claw/`

## Productivity CLI Commands

The CLI defaults to the current directory as the workspace root. Outside
an existing Claw project, the local-first database is still the
canonical Clawix/ClawJS main database. The primary zero-config workflow
is `claw db ...`, with the productivity nouns available as convenience
aliases for overlapping CRUD verbs:

```bash
claw db task "Ship workspace productivity"
claw db tasks list
claw db leads create --set name=Ada --set website=https://ada.dev

claw areas create "Personal Ops"
claw lists create "Today" --kind today
claw sections create "Deep Work" --list-id list-123
claw tasks list
claw tasks create --title "Triage docs drift" --list-id list-123 --section-id section-123 --start-at 2026-04-21T09:00:00Z --deadline-at 2026-04-24T17:00:00Z
claw goals create "Ship workspace productivity"
claw projects create "Workspace Core"
claw cycles create "Sprint 14"
claw epics create "Productivity core" --kind initiative
claw timeline week --start 2026-04-21T00:00:00Z --project-id project-123 --json
claw comments create "Needs design review" --entity-type task --entity-id task-123
claw attachments create "Spec" --entity-type task --entity-id task-123 --uri file:///tmp/spec.md
claw saved-views create "Upcoming" --domain tasks
claw custom-fields create "Story points" --entity-type task --field-type number
claw field-values create field-123 --entity-type task --entity-id task-123 --value 3
claw milestones create "CLI beta" --project-id project-123
claw activity list --task-id task-123
claw blockers create "Waiting on approval" --kind policy_block --task-id task-123
claw artifacts create "Staging screenshot" --kind screenshot --task-id task-123
claw decisions create "Keep the loop on /tasks" --status accepted --task-id task-123
claw work-sessions create "Focus shipping" --task-ids task-123
claw assignments create "Reviewer owns release gate" --task-id task-123 --assigned-to-agent-id reviewer
claw handoffs create "Pass release validation" --task-id task-123 --from-agent-id planner --to-agent-id reviewer
claw approvals create "Approve publish" --kind publish --task-id task-123 --policy-reason "Publishing requires sign-off"
claw capacity create "Reviewer capacity" --agent-id reviewer --max-wip 2 --current-wip 1
claw reminders create "Follow up" --trigger-at 2026-03-27T09:00:00Z
claw deadlines create "Launch date" --due-at 2026-03-30T18:00:00Z
claw notes create --title "Release notes" --content "Draft"
claw people upsert --name "Iván"
claw inbox list
claw events list
claw my-work
claw team-work
claw agenda
claw review daily
claw export snapshot.json
claw backup backups/
claw workspace-search query "release"
claw workspace-index rebuild
```

Use `workspace-search query` for keyword, semantic, or hybrid search
over areas, lists, sections, tasks, goals, projects, comments,
attachments, saved views, recurrences, cycles, epics, custom fields,
field values, templates, milestones, blockers, artifacts, decisions, work sessions,
assignments, handoffs, approvals, capacity, reminders, deadlines,
notes, people, inbox, events, activity, agents, releases, incidents,
feedback, and checks. Use `my-work` for the single-agent loop summary,
`team-work` for the coordination view, `productivity.operationsCockpit()`
for the organizational risk and operations summary, and
`workspace-index rebuild` after large imports or when you change the
embedding strategy.
