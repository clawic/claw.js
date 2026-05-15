# ADR 0012: Domain surface registry from database to CLI

Status: Accepted

Date: 2026-05-15

## Context

ClawJS has two relatively stable public edges: canonical database collections
and the public `claw` CLI. The middle layer had drifted across packages,
services, module folders, aliases, docs, and runtime implementations. Some
folders were real systems, some were conceptual groupings for agents, and some
looked like packages without owning a runtime boundary.

The durable decision from conversation `019e2b29-7765-78d0-aa05-636f7038f812`
is that the route from stored data to CLI must be explicit. Agents should be
able to answer, for every stored thing, which collection or table owns it,
which aggregate or system may orchestrate it, whether there is a package/API
boundary, whether `modules/` is only a manifest, which CLI route exposes it,
and which host boundary applies.

## Decision

`packages/clawjs-core/src/domain-surface-registry.ts` is the executable
registry for the database-to-CLI route. It classifies every durable domain
surface as one of these layers:

- `collection`: canonical or registered-hidden record collections.
- `signal_vertical`: stable signal vertical ids backed by the core
  `signals_*` tables.
- `conceptual_family`: agent-facing grouping for discovery, not a package or
  service boundary by default.
- `aggregate`: cross-collection capability with workflows over nearby data.
- `system`: strong invariant boundary that commonly coordinates multiple
  related collections.
- `service_runtime`: host/framework runtime domain from the ownership matrix.
- `package_api`: npm/API package surface.
- `module_manifest`: visible `modules/` ficha for agents.
- `portal_alias`: CLI portal or alias surface.
- `storage`: database, sidecar, table, or index ownership.
- `host_boundary`: signed-host responsibility boundary.

Collections remain storage-owned by Claw and are registered even when hidden
from top-level help. Public CLI spelling uses kebab-case, while collection and
SQL identifiers keep their canonical database names. Top-level aliases and
portals may be broad for agent ergonomics, but they do not create service or
package ownership. When a name collision exists, CRUD over the collection wins;
workflows must use an explicit route or verb.

Custom collections are created only by explicit schema/database action. Unknown
record writes must not silently create a new canonical collection.

`productivity` is not allowed to remain a competing schema source. Typed
productivity APIs can exist, but collection ownership must resolve through the
same domain surface registry and built-in catalog path.

`signals` is a transversal primitive, not legacy and not flattened into
personal-domain packages. Signal vertical ids stay stable v1 ids. Human labels,
aliases, categories, and agent discovery live in `tracking-registry.json`,
`@clawjs/signals`, and conceptual module manifests. Signal observations,
variables, sessions, and vertical registry state are owned by the core
`signals_*` tables.

`modules/` remains visible as agent-facing manifest/ficha metadata. A folder in
`modules/` is not a package, server, CLI, or service unless the registry marks
it as a real runtime module. ERP is such a system: it may coordinate invoices,
payments, credit notes, catalog records, and ledger entries, but it does not
absorb unrelated external catalogs.

Sensitive domains remain gated by metadata and signed-host ownership. Node must
not become the owner of native permissions, grants, approvals, secrets, or host
audit.

## Surface Parity

- **Human surface**: docs, ADRs, module manifests, and host-facing discovery
  explain which domains are collections, families, systems, or signed-host
  boundaries.
- **Programmatic surface**: `clawDomainSurfaceRegistry`, `claw inspect`,
  `claw search`, `claw collections`, `claw db`, `claw signals`, and the CLI
  command registry expose the same ownership map to agents and scripts.
- **Persistence**: built-in collections use `core.sqlite` workspace records;
  signals use core `signals_*` tables; high-churn sidecars stay registered in
  the persistent surface registry.
- **Gaps**: physical connector or native permission checks are `EXTERNAL
  PENDING` until validated through a signed host. Existing conceptual module
  package wrappers are cleanup debt until replaced by pure manifests.
- **Validation**: core tests cover collection, signal, module, service,
  storage, CLI, and ERP registry coverage. `scripts/domain-surface-registry-guard.mjs`
  fails missing ownership, missing conceptual `module.json` manifests, and
  conceptual module package wrappers.

## Consequences

Adding a collection, signal vertical, aggregate, system, package API, module
manifest, portal, alias, storage object, or host boundary without ownership in
the domain surface registry is incomplete work.

Docs may describe conceptual families for humans and agents, but implementation
must not infer package or runtime boundaries from conceptual grouping alone.

Final acceptance for the database-to-CLI plan requires a decision matrix that
maps every user decision in conversation
`019e2b29-7765-78d0-aa05-636f7038f812` to implementation and test evidence.
