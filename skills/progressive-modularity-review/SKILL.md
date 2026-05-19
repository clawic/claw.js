---
name: progressive-modularity-review
description: Review Claw/ClawJS changes for zero-surprise install, progressive activation, module modes, optional dependencies, and capability/area visibility.
keywords: [modularity, setup, modules, opt-in, install, dependencies, host, permissions, models, audio, catalog]
---

# progressive-modularity-review

Use this skill when a change touches CLI startup, package dependencies,
published package surfaces, setup/configuration, module state, storage
initialization, built-in catalog visibility, host, native permissions, processes,
daemons, launchers, models, browsers, audio, integrations, sync/remote, network,
or sidecars.

## Procedure

1. Read `CONSTITUTION.md`, ADR 0031, `docs/decision-map.md`, the host
   boundary docs, and `docs/data-storage-boundary.md`.
2. Classify the change as a cheap definition, cheap local state, optional
   capability, domain area, heavy dependency, process, permission, network
   action, or external/provider action.
3. Ensure safe CLI paths stay quiet: help, inspect, setup preview, modules
   status/list, command discovery, and basic task CRUD must not open apps, start
   persistent processes, request native permissions, download assets/models, or
   call external services.
4. Keep technical capabilities separate from human areas. Do not activate niche
   domains through `advanced`.
5. Use `enable` for visibility/configuration and `install` for optional
   packages, assets, models, browsers, or other heavy materials.
6. Update docs, discovery, guardrails, tests, and package metadata with behavior
   changes.

## Constraints

- Do not add `preinstall`, `install`, `postinstall`, or `prepare` hooks to the
  base CLI package.
- Do not add direct heavy dependencies to `@clawjs/cli` for optional
  capabilities.
- Do not present all built-in domains as active by default.
- Do not make host, OS permissions, network, downloads, models, audio, or
  background services implicit side effects of installation or safe commands.
