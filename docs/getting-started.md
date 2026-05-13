---
title: Getting Started
description: Scaffold a ClawJS project, initialize a workspace, and extend it with the CLI.
---

# Getting Started

This guide is the main public entrypoint for bootstrapping a ClawJS project.
Start with the zero-config path when you want the fastest local success,
then switch to the production runtime path when you are ready to target a
real installed runtime.

## Prerequisites

| Requirement | Notes |
| --- | --- |
| Node.js | Version `20` or newer. |
| Package manager | `npm`, `pnpm`, or `yarn`. |
| Runtime adapter | Use `demo` for a zero-config starter. Use `openclaw` for the production-supported real runtime path. |

## Choose the Path

| If you are... | Use this path | Why |
| --- | --- | --- |
| Creating a new app or agent | `claw new ...` with the generated `demo` scripts | Fastest first success; no external runtime install required. |
| Wiring ClawJS into an existing repo | Manual workspace init | Keeps your existing project shape and adds `.claw/` explicitly. |
| Targeting a real runtime | `openclaw` setup | `openclaw` is the production-supported adapter. |
| Exposing a remote client | Relay after local setup | Relay routes requests to a connected workspace; it is not the first local bootstrap step. |

Supported adapters are `demo`, `openclaw`, `codex`, `zeroclaw`, `picoclaw`,
`nanobot`, `nanoclaw`, `nullclaw`, `ironclaw`, `nemoclaw`, and
`hermes`. Every CLI command that depends on runtime behavior accepts
`--runtime`.

## Install and Verify

```bash
npm install -g @clawjs/cli

claw --help
```

For application code inside a project, the generated starters already include `@clawjs/claw`. If you are wiring Claw into an existing codebase manually:

```bash
npm install @clawjs/claw
```

`claw info --json` gives you a quick summary of the current project, the detected workspace state, and the installed CLI version.

## Zero-Config First Success

The generated app uses the `demo` adapter by default so it can initialize
and report runtime status without installing a host runtime first.

```bash
claw new app my-app
cd my-app
npm run claw:init
npm run claw:status
npm run dev
```

Success means:

- the project exists
- `.claw/manifest.json` exists
- `npm run claw:status` prints JSON for the `demo` adapter
- the app starts locally with the generated scripts

Other v1 project types:

- `claw new agent my-agent`
- `claw new server my-server`
- `claw new workspace my-workspace`
- `claw new skill summarize-ticket`
- `claw new plugin jira-integration`

Generated skills are registered in the local personal library by default so
they can be assigned to other agents later. Use `--no-library` when you want a
one-off scaffold only.

Compatibility note:

- `create-claw-app`
- `create-claw-agent`
- `create-claw-server`
- `create-claw-plugin`

still work, but they are compatibility wrappers around the same scaffolding engine.

## Production Runtime Path

Use the production path after the generated app works locally and you
want to target a real runtime:

```bash
claw --runtime openclaw runtime status --workspace .
claw --runtime openclaw runtime setup-workspace --workspace .
claw --runtime openclaw doctor --workspace . --json
```

Use [Support Matrix](/support-matrix) before selecting any adapter for
production. Experimental adapters are useful for adapter development and
exploration, but should not be presented as the default production path.

## Manual Workspace Creation

Use this only when you are wiring ClawJS into an existing repository
instead of starting from a generated project.

The workspace root is whichever path you pass as `--workspace`, or the current working directory if you omit it.

Terminology note:

- `runtime adapter` selects runtime behavior and workspace contract
- `workspace` is the isolated operational context
- `agent` is the identity that runs inside that workspace
- examples below use the same value for `workspaceId` and `agentId` only as a convenience default

```bash
claw \
  --runtime openclaw \
  workspace init \
  --workspace /path/to/workspace \
  --app-id demo \
  --workspace-id demo-main \
  --agent-id demo-main
```

Add `--template-pack /path/to/template-pack.json` if you want template mutations applied during initialization.

This command creates the stable ClawJS layer:

- `.claw/manifest.json`
- `.claw/audit/`
- `.claw/state/desired/`
- `.claw/state/observed/`
- `.claw/projections/`
- `.claw/backups/`
- `.claw/locks/`
- `.claw/browser/`
- `.claw/sessions/`

It also seeds the runtime-facing files defined by the selected adapter.

Generated repositories also include a root `claw.project.json`. That file is what lets `claw generate` and `claw add` extend the repo in a stable way later.

## Extend the Project

Once the starter exists, add capabilities from the main CLI rather than dropping back to `npx`.

```bash
claw generate skill support-triage
claw generate provider openai
claw add telegram
claw add scheduler nightly-sync
claw info --json
```

Examples:

- `openclaw` seeds `SOUL.md`, `USER.md`, `AGENTS.md`, `TOOLS.md`, `IDENTITY.md`, `HEARTBEAT.md`
- `codex` seeds `AGENTS.md` and uses Codex CLI auth via `codex login`
- `zeroclaw` seeds `SOUL.md`, `USER.md`, `AGENTS.md`, `IDENTITY.md`, `MEMORY.md`
- `picoclaw` seeds `SOUL.md`, `USER.md`, `AGENTS.md`, `IDENTITY.md`, `memory/MEMORY.md`

## Manual Runtime Workspace Setup

Some adapters need an explicit setup step after the filesystem layout exists.

```bash
claw \
  --runtime openclaw \
  runtime setup-workspace \
  --workspace /path/to/workspace \
  --app-id demo \
  --workspace-id demo-main \
  --agent-id demo-main
```

The Node API uses the same shape:

```ts
import { Claw } from "@clawjs/claw";

const claw = await Claw({
  runtime: {
    adapter: "openclaw",
  },
  workspace: {
    appId: "demo",
    workspaceId: "demo-main",
    agentId: "demo-main",
    rootDir: "/path/to/workspace",
  },
});

await claw.workspace.init();
await claw.runtime.setupWorkspace();
```

If an adapter exposes only one agent, ClawJS still uses the `agent` term. If an adapter exposes many agents, the model stays the same.

Use adapter-specific location overrides when you need them:

- `binaryPath` for runtimes like `openclaw` when the binary is installed outside the current `PATH`
- `homeDir`
- `configPath`
- `workspacePath`
- `authStorePath`
- `gateway.configPath`

For OpenClaw specifically, you can also set `CLAWJS_OPENCLAW_PATH` if you prefer an environment variable over `runtime.binaryPath`.

## Probe the Runtime

Before assuming optional subsystems exist, inspect the runtime status:

```ts
const status = await claw.runtime.status();

console.log(status.adapter);
console.log(status.version);
console.log(status.capabilityMap);
```

<div class="callout">
  <p><strong>Important:</strong> <code>capabilityMap</code> is the source of truth for optional features. Use it before assuming scheduler, memory, skills, channels, sandbox, or plugins exist.</p>
</div>

## Inspect and Validate

Use `workspace inspect` to read file locations and persisted state, and `workspace validate` to confirm the manifest, directories, and runtime contract are present.

The important ownership rule is:

- `.claw/state/desired/` stores what the user wants
- `.claw/state/observed/` stores rebuildable snapshots of what the runtime currently reports
- `.claw/projections/` stores how ClawJS projects settings into visible files

```bash
claw \
  --runtime openclaw \
  workspace inspect \
  --workspace /path/to/workspace

claw \
  --runtime openclaw \
  workspace validate \
  --workspace /path/to/workspace
```

`workspace inspect` now includes the persisted state snapshots for:

- compat
- providers
- scheduler
- memory
- skills
- channels

## Work With Providers and Models

```ts
const providerCatalog = await claw.providers.catalog();
const modelCatalog = await claw.models.catalog();

console.log(providerCatalog.providers);
console.log(modelCatalog.defaultModel);
```

## Start a Session

```ts
const session = await claw.sessions.createSession("Hello");

for await (const event of claw.sessions.streamAssistantReplyEvents({
  sessionId: session.sessionId,
  transport: "auto",
})) {
  if (event.type === "chunk") {
    process.stdout.write(event.chunk.delta);
  }
}
```

## Optional Adapter-Specific Subsystems

```ts
const schedulers = await claw.scheduler.list();
const memory = await claw.memory.list();
const skills = await claw.skills.list();
const channels = await claw.channels.list();
```

If the adapter does not support one of these subsystems, the runtime capability map and doctor or compat reports will show that explicitly.
