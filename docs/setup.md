---
title: Setup and First Workspace
description: Manual integration checklist for existing repositories and advanced workspace setup.
---

# Setup and First Workspace

This page is the manual integration checklist for existing repositories
and advanced setup flows. The canonical first-run walkthrough lives in
[Getting Started](/getting-started).

## Minimal Flow

1. Install the CLI: `npm install -g @clawjs/cli`
2. Scaffold a project: `claw new app my-app`
3. Initialize the workspace: `cd my-app && npm run claw:init`
4. Extend the project with `claw generate`, `claw add`, or `claw add workspace`
5. Inspect the result with `claw info --json` and `claw workspace inspect`

## First Manual Workspace Init

Use this when you are wiring ClawJS into an existing repo instead of a
generated starter:

```bash
claw \
  --runtime openclaw \
  workspace init \
  --workspace /path/to/workspace \
  --app-id demo \
  --workspace-id demo-main \
  --agent-id demo-main
```

Run `runtime setup-workspace` afterwards for adapters that require a
registration step:

```bash
claw \
  --runtime openclaw \
  runtime setup-workspace \
  --workspace /path/to/workspace \
  --app-id demo \
  --workspace-id demo-main \
  --agent-id demo-main
```

## What Gets Created

The stable SDK-owned layer lives under `.claw/`:

- `.claw/manifest.json`
- `.claw/state/desired/`
- `.claw/state/observed/`
- `.claw/projections/`
- `.claw/sessions/`
- `.claw/audit/`
- `.claw/locks/`
- `.claw/backups/`
- `.claw/browser/`

The selected adapter also seeds its own runtime-facing files such as
`SOUL.md`, `AGENTS.md`, `IDENTITY.md`, or `MEMORY.md`.

## Ownership Rules

- `.claw/state/desired/` stores desired SDK-owned state
- `.claw/state/observed/` stores rebuildable runtime snapshots
- `.claw/projections/` stores settings-to-file bindings
- runtime-facing files stay outside `.claw/`

## Follow-On References

- [Getting Started](/getting-started) for the full scaffold walkthrough
- [Workspace](/workspace) for the stable layout and productivity layer
- [Runtime](/runtime) for adapter setup and support semantics
- [CLI](/cli) for the current command surface
