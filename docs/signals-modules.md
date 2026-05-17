# ClawJS signals modules

This document is the canonical guide to the `signals` catalog: how
verticals are laid out, how to add a new vertical, what the HTTP/CLI surface
looks like, and how clients (Clawix Mac/iOS) talk to it.

## What is a "signals module"?

A signals module is an agent-facing manifest for one stable signal vertical.
It stores **observations** about a single domain of user data (sleep, mood,
workouts, finance, etc.) through the shared signals primitive. A vertical does
not create an independent npm package, server, CLI, or service boundary by
default. Each vertical is discovered through the registry and uses the same
shared HTTP/JSON and CLI surface so clients do not learn a new API per domain.

The canonical list of verticals lives at the repo root in
[`tracking-registry.json`](../tracking-registry.json). It currently
declares 80 verticals across 10 categories (Body & Health, Mind &
Emotions, Time & Productivity, Creative output, Consumption & Leisure,
Relations & Social, World & Places, Possessions & Identity, Career &
Money, Meta / Reflection).

## Repository layout

The 80 personal domains are not public npm packages. Each vertical with id
`signal-id` has a conceptual manifest at `modules/signal-id/module.json` for
agents and a catalog JSON exported by `@clawjs/signals`:

```text
packages/signals/
└── src/
    └── catalogs/
        └── signal-id.json  # curated system variables

modules/
└── signal-id/
    └── module.json         # agent-facing manifest, not a package
```

Two shared packages do the heavy lifting so the verticals stay inside
one approved public surface:

- `packages/signals-core/`: shared types
  (`Observation`, `CatalogEntry`, `Session`, `Source`, `Unit`,
  `RegistryEntry`, `StatsResult`, …). No runtime dependencies.
- `packages/signals/`: reusable SQLite store,
  Fastify route builder, typed HTTP client, catalog JSON loader,
  HealthKit anchor handlers.

## Adding a new vertical

1. Declare it in `tracking-registry.json` with a unique `id`, the
   category it belongs to, `catalogPackage: "@clawjs/signals"`,
   `catalogPath: "catalogs/signal-id.json"`, and an explicit `status` of
   `dev_only`, `stable`, or `removed`.

2. Run the catalog scaffolder:

   ```bash
   node scripts/scaffold-signals-verticals.mjs
   ```

   It generates a catalog JSON for every registry entry that does not
   already have one. Pass `--force` to overwrite scaffolded defaults
   (it never overwrites a hand-curated catalog that already exists).

3. Curate `packages/signals/src/catalogs/signal-id.json`. The default catalog
   ships a single free-form text variable so the UI has something to
   render; replace it with the real variables for the domain (with
   HealthKit type identifiers when available).

4. Add or update shared `@clawjs/signals` tests when a catalog needs
   behavior beyond static catalog loading.

5. Update Clawix Mac/iOS UI only when a vertical needs a custom experience.
   Generic verticals should remain registry-driven.

## HTTP surface

Every vertical exposes the same routes under `/v1/signal-id/...`:

```text
GET    /v1/signal-id/catalog
GET    /v1/signal-id/variables/variable-id
POST   /v1/signal-id/variables                 # create user variable
DELETE /v1/signal-id/variables/variable-id     # hide if system, delete if user
POST   /v1/signal-id/variables/variable-id/unhide

GET    /v1/signal-id/observations              # ?variableId&from&to&source&limit
POST   /v1/signal-id/observations
POST   /v1/signal-id/observations/bulk
GET    /v1/signal-id/observations/observation-id
PATCH  /v1/signal-id/observations/observation-id
DELETE /v1/signal-id/observations/observation-id

GET    /v1/signal-id/stats/variable-id         # ?from&to&period=day|week|month
```

Verticals with `hasSessions: true` in the registry also expose:

```text
GET    /v1/signal-id/sessions
POST   /v1/signal-id/sessions
GET    /v1/signal-id/sessions/session-id
PATCH  /v1/signal-id/sessions/session-id
DELETE /v1/signal-id/sessions/session-id
POST   /v1/signal-id/sessions/session-id/observations
```

HealthKit anchor handlers (used by the Clawix iOS bridge to remember
where each variable left off in the last incremental sync):

```text
GET    /v1/signal-id/healthkit/anchor/variable-id
PUT    /v1/signal-id/healthkit/anchor/variable-id   # body: { anchorBlob, lastSyncedAt }
```

All routes (except `/v1/health`) require an `Authorization: Bearer
shared-secret` header. The shared secret is sourced from the host-owned
signals service configuration; individual verticals do not define their
own public env prefixes.

## Authentication and discovery

Signals is a single approved public domain. Hosts may expose selected
catalogs through one signals service; vertical ids are path components,
not independent npm packages or public service identities.

`modules/signal-id/` must not contain `package.json`, `src/bin`,
service tests, or vertical-specific CLI wrappers. Runtime behavior belongs to
`@clawjs/signals`, `@clawjs/signals-core`, and the core `signals_*` tables.

The public CLI surface is `claw signals catalog|seed-catalog|observe|list|delete`.
Per-vertical CLI commands are not added unless a later ADR promotes an
aggregate or system with strong invariants.

## Catalog: system vs user variables

A `CatalogEntry` has an `origin` field that is either `system` (curated
by ClawJS, ships with each release) or `user` (created by the user at
runtime). Deleting a system variable hides it (`hidden_system_variables`
table); deleting a user variable removes it from the SQLite. System
variables are seeded into the store every time the service boots, so
the curated catalog stays in sync with the package version.

## Observation values

Observations carry a heterogeneous `value` field. The store records the
JSON-encoded value plus a `value_numeric` shadow column for fast
aggregation. Supported value shapes:

- `numeric` → `42`, `36.6`, …
- `boolean` → `true`, `false`
- `enum` → string from the variable's `enumValues`
- `duration` → `numeric` in the unit the variable declares (typically
  `min`)
- `text` → string
- `geo` → `{ lat, lng }`
- `photo` → `{ photoRef }`

The Clawix Swift clients mirror these shapes in
`LifeObservationValue`.

## Release flow

Per the existing RELEASING.md rules:

1. Curate the catalog for the verticals being promoted from `dev_only` to
   `stable`.
2. Run the shared `@clawjs/signals` tests for catalog and store behavior.
3. `npm run publish:dry-run` from the repo root.
4. Real publish requires explicit user authorization (see the
   workspace-private `CLAUDE.md` for the approval gate). The user
   then bumps `clawix/macos/CLAW_VERSION` to the new tag.

## See also

- `packages/signals-core/src/types.ts` for the canonical
  TypeScript types.
- `packages/signals/src/store.ts` for the SQLite
  schema and CRUD helpers.
- `packages/signals/src/routes.ts` for the Fastify
  route builder shared by every vertical.
- `packages/clawjs-user-model/` for the pattern this family follows.
