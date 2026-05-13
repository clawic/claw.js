---
title: Database
description: Standalone namespace-based data service for remote agents, apps, and admin operators.
---

# Database

`database/` is a standalone Fastify service in this repository. It is
designed for a compact self-hosted deployment shape: one HTTPS-facing
service, one SQLite database, one admin console, and scoped API access
for agents or apps.

ClawJS now exposes database behavior through three related surfaces:

- `claw db ...` for the normal local-first CRUD workflow backed by
  the canonical main database at `~/.claw/data/core.sqlite`
- `claw database ...` for low-level service administration and remote
  namespace operations
- `@clawjs/database` for the shared service app, store, API client,
  auth helpers, and realtime hub used by the standalone service and CLI

## What v1 includes

- namespaces that behave like separate logical databases
- built-in protected productivity collections for `people`, `tasks`, `goals`, `projects`, `events`, `reminders`, `deadlines`, `notes`, `inbox_threads`, and `inbox_messages`
- additional protected product-domain collections used by the company cockpit, including `companies`, `portfolios`, `portfolio_items`, `goals`, `projects`, `issues`, `releases`, `operational_checks`, `operational_incidents`, `feedback_items`, `metric_snapshots`, and `import_batches`
- schema-first custom collections with field validation and index metadata
- scoped API tokens at `namespace + collection + operation` granularity
- realtime record events over WebSocket
- local file storage backed by SQLite metadata
- a built-in admin console served from the same process

## Local workflow

```bash
npm --prefix database ci
npm --prefix database run build
npm --prefix database run start
```

Default local credentials:

- email: `admin@database.local`
- password: `database-admin`

Default local URL:

- [http://127.0.0.1:24102](http://127.0.0.1:24102)

These credentials and the default URL are disposable local-development
defaults. Do not reuse them for shared, staging, or production services.

## CLI

For local-first data and productivity records, use `claw db ...`:

```bash
claw db task "Ship database docs"
claw db tasks list
claw db leads create --set name=Ada --set website=https://ada.dev
claw db leads schema
```

Use `--namespace main`, `--url`, and `--token` when the same CRUD facade
should target a running database service.

The app ships its own CLI:

```bash
npm --prefix database run cli -- login --url http://127.0.0.1:24102 --email admin@database.local --password database-admin
```

The main `claw` CLI also exposes the same surface through a thin bridge:

```bash
claw database namespace list --url http://127.0.0.1:24102 --token <admin-token>
```

Use the bridge for admin/operator operations: serving the database app,
logging in, managing namespaces, collections, records, scoped tokens, and
files.

## Shared Package Surface

`@clawjs/database` publishes the reusable implementation pieces:

- `buildDatabaseApp()` for embedding the Fastify service
- `loadDatabaseConfig()` and `DatabaseServiceConfig` for runtime config
- `DatabaseServiceStore` for the SQLite-backed namespace, schema,
  record, token, and file store
- `DatabaseApiClient` for remote admin and scoped-token calls
- `DatabaseAuthService`, `hashSecret()`, and `generateOpaqueToken()` for
  admin/scoped-token auth
- `RealtimeHub` and `RecordChangeEvent` for WebSocket record events

## Migration Note

The local-first CLI now stores user-facing records in the canonical
Claw main database:
`~/.claw/data/core.sqlite` on macOS.
Existing development workspaces that still have older local productivity
or generic database files are recognized and migrated forward by the
local database layer. Treat that migration as one-way for normal usage:
once the main database is active, new writes should go through `claw db
...` or the workspace productivity facades.
