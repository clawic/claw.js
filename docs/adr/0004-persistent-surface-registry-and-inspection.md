# ADR 0004: Persistent surface registry and inspection

## Status

Accepted.

## Context

Agents need a complete, navigable view of durable Claw data surfaces without relying on a manually maintained diagram. The inspected surface must cover database names, sidecar stores, workspace paths, host-owned operational paths, legacy read-only compatibility paths, external read-only sources, preference keys, and future table/field metadata. Generated Markdown and Mermaid views are useful, but they must be renderings of programmatic definitions rather than a second source of truth.

The user decision log for conversation `019e25c1-b831-73f2-a717-5690b171d0d4` requires strict enforcement:

- The scope is all persistent surfaces, not only database schema.
- The public interface is `claw inspect`.
- The source of truth is code/builders, not hand-written CLI inventories.
- The registry shape is typed builders.
- The CLI reads a static definition that can be traversed recursively.
- Long-term policy is strict: new persistent names must be registered through the supported builders before the goal can be considered complete.

## Decision

ClawJS owns a typed persistent surface registry in `@clawjs/core`. Persistent surfaces are registered with `clawPersistentSurface` builders and exported through `clawPersistentSurfaceRegistry`. The public `claw inspect` command is a read-only view over that registry.

The first supported inspection commands are:

- `claw inspect tree`
- `claw inspect list <id-or-path>`
- `claw inspect show <id-or-path>`
- `claw inspect database`
- `claw inspect storage`
- `claw inspect prefs`
- `claw inspect render --format markdown|mermaid`

Generated documentation, including `docs/persistent-surface.md`, must be regenerated from `claw inspect render --format markdown`; it is not an independent registry.

The CLI may fuse additional static manifest files from other language builders
with `--manifest <path>` or `CLAW_INSPECT_MANIFEST=path[,path...]`. Those
manifests must use the same `ClawPersistentSurfaceRegistry` shape and remain
read-only inputs to inspection.

## Rules

Any code that introduces a new durable path, database, collection/table, durable field, preference key, app storage key, browser storage key, persistent temp location, cache intended to survive app restarts, host operational state, or external read-only source must register it through a typed builder in the persistent surface registry or a future language-specific builder that feeds the same registry contract.

Manual lists are allowed only as generated output or as tests that assert registry coverage. They are not source of truth.

Clawix may expose host-owned operational surfaces, but ClawJS/Claw remains the framework owner for contracts, canonical storage naming, database layouts, and the public CLI.

`~/.codex` remains external read-only by default. The registry may expose it for inspection and indexing, but ordinary framework code must not write, move, delete, or chmod that source.

## Consequences

Agents can recursively inspect persistent framework and host surfaces using a single stable CLI.

Future enforcement can block unregistered durable surfaces by scanning implementation code and requiring builder-backed declarations. Until that full scanner exists, tests must at least prove that public inspection works and that the core registry includes the known canonical roots, databases, workspace paths, host paths, legacy path, and Codex external source.

This ADR intentionally makes the generated diagram a view. If generated docs drift from `claw inspect`, the generated docs are wrong.
