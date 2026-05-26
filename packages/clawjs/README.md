# @clawjs/cli

**Claw is the operational memory CLI for AI agents.** It owns the storage, search and tools that agents use to capture, recall, plan and reason about their work. Most agent activity flows through dedicated commands (`claw tasks`, `claw notes`, `claw decisions`, ...), not a generic database.

Install the CLI globally:

```bash
npm install -g @clawjs/cli
claw about
```

The package exposes `claw` as the public command. It does not expose a public `clawjs` binary.

## First two commands an agent should run

```bash
claw about                       # 30-second explanation of what Claw is for
claw router <terms>              # find the right dedicated command from your intent
```

`claw router` accepts one or more terms in any language. It returns the dedicated command, when to use it, an example invocation, related commands and the anti-pattern to avoid. Use it whenever you do not know which command to type.

```bash
claw router task
claw router task deadline blocker --json
claw router memoria decisión
```

## Capability map

| Group | Commands | Purpose |
|---|---|---|
| Capture | `claw inbox`, `claw notes`, `claw decisions` | Quick capture and triage of incoming items, notes and decisions. |
| Manage work | `claw tasks`, `claw projects`, `claw goals`, `claw blockers`, `claw assignments`, `claw handoffs`, `claw approvals` | Tasks, projects, goals, blockers and ownership. |
| Plan time | `claw agenda`, `claw calendar`, `claw reminders`, `claw deadlines`, `claw routines`, `claw schedule` | Calendar, reminders, deadlines, routines and agenda. |
| Remember | `claw knowledge`, `claw learning`, `claw outcomes`, `claw context`, `claw library` | Durable knowledge, learnings, outcomes and reusable context for agents. |
| Find your way | `claw router`, `claw about`, `claw search`, `claw inspect` | When you do not know what to type. |
| Database (fallback) | `claw db <collection>`, `claw collections` | Generic CRUD for collections without a dedicated command, or schema/migration work. |
| Mac and host control | `claw mac`, `claw permissions`, `claw window`, `claw system`, `claw host` | Permissions, app and window control, system telemetry. |
| Starting a project | `claw new`, `claw generate`, `claw add`, `claw setup`, `claw modules` | Bootstrap a new Claw app, agent, server or workspace. |

## Example agent flow

A typical agent task that captures, decides, plans and ships looks like:

```bash
claw router decision deadline                                  # find the right surfaces
claw notes create --title "Investigation notes for X"          # capture
claw decisions create --title "Switch from A to B" --status proposed
claw tasks create --title "Migrate config to B" --priority high --deadline 2026-06-01
claw agenda --json                                              # confirm placement in time
claw inspect schemas --json                                     # look up exact field shapes
```

Pass `--json` to any command for a parseable envelope. The envelope is the stable agent-facing contract.

## Prefer the dedicated command over the database

Dedicated commands apply the right schema, indexing and broker behavior. Use them by default; reserve `claw db` for collections without a dedicated command or for schema/migration work.

```bash
claw tasks ...                  # not  claw db tasks ...
claw notes ...                  # not  claw db pages ...
claw decisions ...              # not  claw db decisions ...
claw calendar ...               # not  claw db calendar_events ...
```

When in doubt, run `claw router <topic>` to see which command is preferred and why.

## Starting a new project

If you are bootstrapping a new Claw-powered app, agent, server or workspace rather than driving the operational memory, scaffolding lives under `claw new`:

```bash
claw new app my-app
cd my-app
npm run claw:init
claw generate skill support-triage
claw add telegram
```

The `create-claw-app`, `create-claw-agent`, `create-claw-server`, and `create-claw-plugin` bins remain available for package-manager create flows, but `claw new` is the primary documented entrypoint.

## Safety and legal

ClawJS is an assistive local-first framework. It may help with sensitive records, summaries, searches, and non-final drafts, but it does not replace regulated professionals, is not professional advice, and must not make final medical, mental health, legal, financial, insurance, employment, education, government, emergency, or physical-safety decisions. See [SAFETY.md](https://github.com/clawic/clawjs/blob/main/SAFETY.md) and [REGULATED_DOMAINS.md](https://github.com/clawic/clawjs/blob/main/REGULATED_DOMAINS.md).
