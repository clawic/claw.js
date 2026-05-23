# ADR 0004: Stable surface registry and inspection

## Status

Accepted. Extended 2026-05-14 by conversation
`source:persistent-surface-registry`.

## Context

Agents need a complete, navigable view of durable and compatibility-sensitive
Claw data surfaces without relying on a manually maintained diagram. The
inspected surface must cover database names, sidecar stores, workspace paths,
host-owned operational paths, external read-only sources, preference keys, API
routes, webhooks, events, queues, JSON fields, schemas, protocol frames, CLI
commands/flags, package names, package bins, package exports, environment
variables, native identities, file formats, error codes, enum wire values, ID
namespaces, deep links, hostnames, ports, and future table/field metadata.
Generated Markdown and Mermaid views are useful, but they must be renderings
of programmatic definitions rather than a second source of truth.

The user decision log for conversation `source:persistent-surface-registry` requires strict enforcement:

- The original scope is all persistent surfaces, not only database schema.
- The extended scope is all owned and cross-version stable surfaces: any name,
  string, field, route, identifier, event, queue, webhook, schema, CLI command,
  or protocol value that leaves code and whose change can break compatibility.
- The public interface is `claw inspect`.
- The source of truth is code/builders, not hand-written CLI inventories.
- The registry shape is typed builders.
- The CLI reads a static definition that can be traversed recursively.
- Policy is strict: new persistent or stable contract names must be
  registered through the supported builders before they land. The goal is not
  complete while any owned cross-version surface remains outside the registry
  contract.
- ClawJS and all Clawix targets are in scope. V1 has no users or accumulated
  data, so accidental legacy or migration code discovered while implementing
  this registry is removed rather than preserved unless a current non-legacy
  reason exists.
- After V1, breaking changes to registered surfaces require explicit versioning.
- Third-party providers are registered as external dependencies plus
  Claw-owned mappings. The registry does not copy entire provider schemas.

## Decision

ClawJS owns a typed stable surface registry in `@clawjs/core`. Persistent
surfaces remain registered with `clawPersistentSurface` builders, and stable
contract surfaces use the same contract through `clawStableSurface` or the
`contract` builder. `clawPersistentSurfaceRegistry` remains the exported
manifest name for compatibility, but its nodes are now a superset: persistent
surfaces plus API, protocol, schema, event, ID, CLI, config, and external
mapping surfaces. The public `claw inspect` command is a read-only view over
that registry.

The first supported inspection commands are:

- `claw inspect tree`
- `claw inspect list <id-or-path>`
- `claw inspect show <id-or-path>`
- `claw inspect why <command-or-id>`
- `claw inspect aliases`
- `claw inspect database`
- `claw inspect storage`
- `claw inspect prefs`
- `claw inspect contracts`
- `claw inspect apis`
- `claw inspect protocols`
- `claw inspect events`
- `claw inspect schemas`
- `claw inspect ids`
- `claw inspect cli`
- `claw inspect surfaces`
- `claw inspect external`
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

The persistent node kinds are:

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
- `envVar`
- `envOverride`
- `cache`
- `fixture`
- `persistentTemp`
- `retiredPath`
- `externalReadOnlySource`

The stable contract node kinds are:

- `apiRoute`
- `privateApiRoute`
- `apiMethod`
- `apiParameter`
- `webhook`
- `webhookEvent`
- `eventTopic`
- `queueTopic`
- `jsonSchema`
- `jsonField`
- `enumValue`
- `errorCode`
- `packageName`
- `packageExport`
- `packageBin`
- `nativeIdentity`
- `fileFormat`
- `cliCommand`
- `cliFlag`
- `cliOutputField`
- `protocol`
- `protocolFrame`
- `protocolField`
- `idNamespace`
- `idPrefix`
- `deepLink`
- `hostname`
- `port`
- `externalDependency`
- `externalMapping`

Each stable capability node may also declare surface parity metadata:
`humanSurfaces`, `programmaticSurfaces`, and `surfaceGaps`. Human surfaces
identify UI or human review/approval workflows. Programmatic surfaces identify
SDK, CLI, service API, MCP, Relay, or persistence access. Gaps use the
classifications from ADR 0009: `required`, `optional`, `local-only`,
`remote-safe`, `blocked`, and `not applicable`.

Each new stable surface node must also carry `surfaceNarrative` so review can
answer four questions without inferring intent from a technically correct
string: what concept the surface implements, which decision authorizes it,
which human and programmatic surfaces complete it, and what must not be
inferred from its existence. Existing nodes without this field are bounded by
`docs/surface-narrative-baseline.json`; new missing narratives are blocked.

Each new stable surface node must also carry `resourceContract` as the
operational counterpart to `surfaceNarrative`. Runtime, UI, storage, stream,
cache, queue, IPC, daemon, worker, and long-running-agent surfaces require this
metadata before implementation closure. The contract records startup, idle,
memory, streaming, storage, hot-path, scale, and validation behavior so a
surface is not registered only nominally. Existing nodes without this field are
bounded by `docs/surface-resource-contract-baseline.json`; new missing resource
contracts are blocked.

## Rules

Any code that introduces a new durable path, database, collection/table,
durable field, preference key, app storage key, browser storage key,
environment variable or override, persistent temp location, cache intended to survive app
restarts, host operational state, fixture with stable naming, retired path, or
external read-only source must register it through a typed builder in the
persistent surface registry or a language-specific builder that feeds the same
registry contract.

Any code that introduces a new public API route, private `/api/<app>/...`
route, webhook path or event, event topic, queue topic, JSON/schema field,
schema id, enum wire value, error code, protocol frame/type/field, CLI
command, CLI flag, CLI JSON output field, package name, package bin, package
export, native bundle/service/signing identity placeholder, file format,
persistent ID namespace or prefix, deep link, local hostname, port, or
Claw-owned external provider mapping must register it through the same stable
surface contract before it lands.

Any code that introduces or promotes an important capability must register
enough surface parity metadata for `claw inspect` to answer which human and
programmatic surfaces expose it, and which missing surfaces are required,
blocked, or not applicable.

Any code that introduces a new API, UI, CLI, schema, storage key, route,
permission, or feature flag surface must register `surfaceNarrative` before it
lands. The narrative is not a second source of truth; it points to the
authorizing ADR, decision-map row, or governance decision and states the
non-inference boundary for reviewers and agents.

Any code that introduces a new API, UI, CLI, schema, storage key, route,
permission, stream, cache, or feature flag surface must also register
`resourceContract` before it lands. The resource contract is not a performance
test by itself; it records the expected startup, idle, memory, streaming,
storage, hot-path, scale, and validation obligations that tests or measurements
must prove.

Manual lists are allowed only as generated output or as tests that assert registry coverage. They are not source of truth.

Direct durable and stable literals are forbidden in implementation code. In TypeScript and
JavaScript this includes direct `path.join`/`join` construction of Claw homes,
direct `new Database(...)` path creation, localStorage literals, DDL outside
surface builders, direct `/v1/...` and `/api/...` route literals, owned env var
literals, unregistered event/queue topic literals, and unregistered persistent
file/status/cache names. In Swift this includes direct `DatabaseQueue(path:)`, direct
`appendingPathComponent(...)` of durable Claw/Clawix/SQLite/status components,
direct `@AppStorage` keys, direct `UserDefaults` keys or suite names, and
project-specific preference wrappers with literal keys, direct `/v1/...` route
literals, direct `/api/...` route literals, owned env var literals, and
unregistered `CodingKeys`/wire field strings. Guards must fail on these
patterns unless the code is the registry/builder itself.

Temporary OS scratch paths are allowed only when they are clearly
nonpersistent. Named fixtures, caches that survive restarts, and persistent
temporary directories must be registered.

Clawix may expose host-owned operational surfaces, but ClawJS/Claw remains the framework owner for contracts, canonical storage naming, database layouts, and the public CLI.

`~/.codex` remains external read-only by default. The registry may expose it for inspection and indexing, but ordinary framework code must not write, move, delete, or chmod that source.

## Consequences

Agents can recursively inspect persistent and contract-sensitive framework
and host surfaces using a single stable CLI.

Enforcement blocks unregistered durable and stable contract surfaces by
scanning implementation code and requiring builder-backed declarations. Tests
must prove that public inspection works, generated docs are current, external
language manifests can be fused, and the registry includes the known canonical
roots, databases, workspace paths, host paths, preference keys, API routes,
protocols, events, schemas, CLI commands, IDs, external dependencies, and Codex
external source. Surface parity checks also make UI-only and
programmatic-only capabilities visible during review instead of leaving them as
implicit product debt.
`scripts/surface-narrative-guard.mjs` makes the conceptual relato blocking for
new surfaces while the baseline tracks older surfaces that still need backfill.

This ADR intentionally makes the generated diagram a view. If generated docs drift from `claw inspect`, the generated docs are wrong.
