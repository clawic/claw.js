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
- Policy is strict: new persistent names must be registered through the supported builders before they land. The goal is not complete while any durable surface remains outside the registry contract.

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

The CLI reads the framework registry by default and can fuse additional static
language manifests with `--manifest <path>` or `CLAW_INSPECT_MANIFEST`. External
manifests must use the same node contract and are read-only inputs; the CLI does
not inspect live user data or require services.

Generated documentation, including `docs/persistent-surface.md`, must be regenerated from `claw inspect render --format markdown`; it is not an independent registry.

Every node uses the shared registry contract: stable `id`, `kind`, owner,
repo/project, language/provider, path or key, display name, storage class,
canonicality, privacy, lifecycle, parent/children relationship, source
location when available, environment overrides when applicable, warnings, and
database/table/column/type metadata for schema surfaces.

The supported node kinds are:

- `root`
- `database`
- `sidecar`
- `table`
- `column`
- `index`
- `folder`
- `file`
- `socket`
- `statusFile`
- `preferenceKey`
- `appStorageKey`
- `browserStorageKey`
- `envOverride`
- `cache`
- `fixture`
- `persistentTemp`
- `legacyPath`
- `externalReadOnlySource`

## Rules

Any code that introduces a new durable path, database, collection/table,
durable field, preference key, app storage key, browser storage key,
environment override, persistent temp location, cache intended to survive app
restarts, host operational state, fixture with stable naming, legacy path, or
external read-only source must register it through a typed builder in the
persistent surface registry or a language-specific builder that feeds the same
registry contract.

Manual lists are allowed only as generated output or as tests that assert registry coverage. They are not source of truth.

Direct durable literals are forbidden in implementation code. In TypeScript and
JavaScript this includes direct `path.join`/`join` construction of Claw homes,
direct `new Database(...)` path creation, localStorage literals, DDL outside
surface builders, and unregistered persistent file/status/cache names. In
Swift this includes direct `DatabaseQueue(path:)`, direct
`appendingPathComponent(...)` of durable Claw/Clawix/SQLite/status components,
direct `@AppStorage` keys, direct `UserDefaults` keys or suite names, and
project-specific preference wrappers with literal keys. Guards must fail on
these patterns unless the code is the registry/builder itself.

Temporary OS scratch paths are allowed only when they are clearly
nonpersistent. Named fixtures, caches that survive restarts, and persistent
temporary directories must be registered.

Clawix may expose host-owned operational surfaces, but ClawJS/Claw remains the framework owner for contracts, canonical storage naming, database layouts, and the public CLI.

`~/.codex` remains external read-only by default. The registry may expose it for inspection and indexing, but ordinary framework code must not write, move, delete, or chmod that source.

## Consequences

Agents can recursively inspect persistent framework and host surfaces using a single stable CLI.

Enforcement blocks unregistered durable surfaces by scanning implementation
code and requiring builder-backed declarations. Tests must prove that public
inspection works, generated docs are current, external language manifests can
be fused, and the registry includes the known canonical roots, databases,
workspace paths, host paths, preference keys, legacy path, and Codex external
source.

This ADR intentionally makes the generated diagram a view. If generated docs drift from `claw inspect`, the generated docs are wrong.
