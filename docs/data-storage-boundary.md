# Claw data storage boundary

This document records the canonical data-placement decisions for ClawJS/Claw,
Claw.app, and Clawix. It complements `docs/host-ownership.md`: ownership says
who is responsible; this page says where data lives.

## Canonical roots

- Framework global root: `~/.claw`
- Framework main database: `~/.claw/data/core.sqlite`
- Framework files/blob root: `~/.claw/data/files`
- Workspace root: `.claw/`
- Clawix host-operational root: `~/.clawix`
- Host GUI-only app state: platform-native app data when it is not framework
  state

Older `.clawjs/` workspace paths and older Clawix-named framework data roots are
retired pre-public locations. New canonical writes must not create
`.clawjs/data/database.sqlite`, `.clawjs/data/productivity.sqlite`,
`.clawjs/data/storage.sqlite`, or `.clawjs/code/code.sqlite`.

## Main database

`core.sqlite` is the main framework database. It stores user-facing structured
records and framework metadata that benefit from one queryable relational graph.
The point of this decision is to avoid many small per-domain SQLite files such
as `productivity.sqlite` for records that naturally join, search, export, and
backup together.

The main database owns:

- Database namespaces, collections, records, schemas, record notes, scoped API
  tokens, and realtime record metadata.
- Productivity records: tasks, notes, people, goals, projects, reminders,
  deadlines, inbox threads/messages, events, saved views, comments,
  attachments metadata, custom fields, and field values.
- Workspace collections and metadata that are framework data, not source files.
- Memory and knowledge records: entities, facts, pages, page blocks, links,
  mentions, revisions, comments, and profile projections.
- User model, signals observations, time projections, MCP metadata, channel
  metadata, apps/resources/design metadata, publishing/social, marketplace,
  home, technical IoT adapters, and other structured domain tables when the data
  is not a native secret and not a high-churn runtime log.
- Connector control-plane catalog and policy state: providers, external
  principals/accounts, credential bindings by `secret_ref`, capabilities,
  operations, policies, budgets, network/VPN/proxy declarations, and redacted
  audit events.
- Governance bindings: principals, entities, scopes, stewards, authority edges,
  grants, restrictions, data-class declarations, resource bindings, workspace
  bindings, project bindings, and projection metadata. Ordinary domain
  collections do not add mandatory `ownerId` or `tenantId` fields only to be
  future-proof.
- Dense-data foundation records: domain systems/packs, domain roles/profiles,
  evidence sources, provenance events, quality gaps, canonical operations,
  semantic views, domain intents, vocabularies, concepts, concept mappings,
  units, instruments, instrument items/responses, and universal entity
  relations.

Framework-visible app projections may be stored in the main database when they
are part of the reusable framework contract. Host-only UI preferences still live
under the host root.

## Sidecar databases

Sidecars are allowed when isolation has a concrete reason: high churn, service
lifecycle isolation, large indexes, binary/object stores, or operational logs.
They live under the same framework global root, not under retired pre-public
workspace paths.

Canonical sidecars:

- `runtime.sqlite`: runtime, sandbox, code index, bridge/daemon operational
  state, and delegation execution state.
- `sessions.sqlite`: session service data and long-running session event state
  when it is not just a searchable main-db projection.
- `audio.sqlite` plus `audio/`: audio and voice catalog/output metadata and
  generated audio assets.
- `drive.sqlite` plus `files/` or `blobs/`: object storage metadata, workspace
  blobs, and drive-like artifacts.
- `search.sqlite`: search/index data that can be rebuilt from canonical sources.
- `notify.sqlite`, `monitor.sqlite`, `feed.sqlite`, `infra.sqlite`, and
  `ops.sqlite`: service-specific operational state where a separate lifecycle is
  valuable. `ops` and `infra` are not public top-level product surfaces unless a
  later ADR promotes them.
- `vault.sqlite`: encrypted secret vault state only. Main database records may
  keep `secret_ref` references, never plaintext secrets. Connector raw trace
  opt-in stores encrypted payload references here, not plaintext request or
  response bodies.

Sidecars are not a place to re-create canonical product data just because a
service has its own package. If a service stores durable user-facing structured
records, prefer `core.sqlite` with namespaced/prefixed tables.

## Secrets

Secrets are separate from the main database. Plaintext secrets never live in
`core.sqlite`: tokens, API keys, private keys, recovery material, and secret
field values stay in the secrets/vault sidecar or host-owned secret storage.
Other records refer to secrets by opaque ids such as `secret_ref`.

The full security contract for vault storage, human reveal, brokered execution,
connectors, plugins, CLI, audit, backups, rotation, and fail-closed policy lives
in [Secrets Security Model](./secrets-security.md).

Approvals, grants, and audit records that are specific to a signed host live in
the active host root. Framework policy records may reference them, but the host
owns the native permission identity and approval UI.

## Workspace data

`.claw/` stores workspace-local framework files: `manifest.json`,
`state/desired/`, `state/observed/`, `projections/`, `sessions/`, `audit/`,
`locks/`, `backups/`, `browser/`, design/style/template/reference assets, and
other source-like files that should travel with a workspace.

Workspace roots own the full `.claw/` directory. Project folders carry
`claw.project.json`, managed `AGENTS.md`, and `CLAUDE.md` shims instead of a
full `.claw/` copy. The project manifest is a portable identity and handoff
anchor; canonical grants, secrets, sensitive memory, sessions, pins, archives,
and resource bindings remain in the framework database or approved sidecars.

Do not add new workspace-local SQLite databases for canonical framework data.
Do not add `.clawjs/` readers or migrations for pre-public workspace databases
unless a later ADR records a bounded removal exception. New writes go to
`.claw/`, `core.sqlite`, or a canonical sidecar under the framework global
root.

## Migration rule

The v1/refactor direction is reset-controlled for duplicated Claw/Clawix
development data, but non-destructive for valuable external sources. Codex data
under `~/.codex` is never migrated destructively; it is read, mirrored, or
indexed only.

Every future domain migration must state which of these buckets it uses:
main database, sidecar database, workspace files, host state, external
read-only source, or encrypted secret reference.

## Reviewed store bucket map

This map records the current storage ambiguity review baseline. New stores must
extend this table or a more specific ADR before they add durable reads, writes,
migrations, fixtures, or tests.

| Store or surface | Canonical bucket | Notes |
| --- | --- | --- |
| `@clawjs/database`, `@clawjs/workspace`, productivity, app state, agents, connector context, knowledge, signals, time, content, ERP, publishing, IoT, MCP, channel metadata, resources, skills, and snippets | Main database: `~/.claw/data/core.sqlite` | These are user-facing structured records or framework metadata that benefit from the shared relational graph. |
| Sessions service and long-running session events | Sidecar: `~/.claw/data/sessions.sqlite` | Searchable projections may still be mirrored into `core.sqlite`; event-heavy session state stays in the sessions sidecar. |
| Runtime, sandbox, code index, bridge/daemon operational state, delegation/jobs state, and code work queues | Sidecar: `~/.claw/data/runtime.sqlite` | Code ledger tables in `packages/clawjs-node/src/code/surface.ts` are classified as runtime operational state until an ADR promotes any user-facing subset to `core.sqlite`. |
| Audio and voice catalog/output metadata | Sidecar plus files: `~/.claw/data/audio.sqlite` and `~/.claw/data/audio/` or `~/.claw/data/blobs/` | Regular audio blobs do not belong in host app support. |
| Drive/object storage metadata and blobs | Sidecar plus files: `~/.claw/data/drive.sqlite` and `~/.claw/data/files/` or `~/.claw/data/blobs/` | `storage_objects`, `storage_tokens`, and `storage_shares` are drive-sidecar tables, not `core.sqlite` tables. |
| Search indexes and search FTS | Sidecar: `~/.claw/data/search.sqlite` | Rebuildable from canonical sources. |
| Notify, monitor, feed, infra, and ops services | Sidecars: `notify.sqlite`, `monitor.sqlite`, `feed.sqlite`, `infra.sqlite`, and `ops.sqlite` under `~/.claw/data/` | These are service-specific operational stores. Durable product records should not move here only because a service package exists. |
| Vault and secret material | Encrypted sidecar or host secret storage: `vault.sqlite` or signed-host secret storage | `core.sqlite` may store only opaque `secret_ref` references. |
| Workspace manifests, desired/observed state, projections, sessions files, audit, locks, backups, browser state, reports, and source-like generated assets | Workspace files under `.claw/` | Do not add workspace-local SQLite databases for canonical framework records. |
| Clawix bridge status, helper install metadata, native approvals, host audit, UI-only caches, and signed-host operational state | Host state under `~/.clawix` or platform-native app data | Host state may reference framework ids but must not become the canonical framework store. |
| Codex data | External read-only source: `~/.codex` | Read, mirror, or index only. Writes require an explicit reversible opt-in. |

## Retired and blocked locations

The following paths are retired pre-public locations, not compatibility
contracts: `.clawjs/data/database.sqlite`,
`.clawjs/data/productivity.sqlite`, `.clawjs/data/storage.sqlite`,
and `.clawjs/code/code.sqlite`.

There are no approved new readers, writers, or migrations for those locations.
If a future user-data rescue discovers a valuable external copy there, it must
be handled as a blocked migration proposal with:

- affected source path and detected schema,
- data-loss risk,
- dry-run inventory command,
- non-destructive copy/import plan,
- canonical target bucket from the table above,
- rollback or quarantine plan,
- owner and next validation step.

`scripts/storage-boundary-guard.mjs` protects this contract by scanning code,
tests, fixtures, docs routing, and reviewed store declarations for retired paths
and bucket drift.
