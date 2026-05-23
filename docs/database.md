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
- schema-first custom collections with field validation and index metadata, created explicitly through the low-level database admin surface
- scoped API tokens at `namespace + collection + operation` granularity
- realtime record events over WebSocket
- local file storage backed by SQLite metadata; uploads stream multipart bodies
  to managed temp files before an atomic move into the file store
- a built-in admin console served from the same process

Built-in collection growth follows the [Canonical Data Catalog](./canonical-data-catalog.md)
standard and [ADR 0005](./adr/0005-canonical-data-catalog.md). ClawJS owns the
canonical catalog; hosts and apps consume it instead of defining competing
schema sources.

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
```

Use `--namespace main`, `--url`, and `--token` when the same CRUD facade
should target a running database service.

`claw db <collection> create|update` never creates an unknown collection as a
side effect. Custom collections are explicit administrative objects: create
them first with `claw database collection create`, then use `claw db ...` for
records.

For custom collections against a running service:

```bash
claw database collection create --url http://127.0.0.1:24102 --token <token> --namespace main --name leads --fields '[{"name":"title","type":"text"},{"name":"metadata","type":"json"}]'
claw db leads create --url http://127.0.0.1:24102 --token <token> --set name=Ada --set website=https://ada.dev
claw db leads schema --url http://127.0.0.1:24102 --token <token>
```

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
- `AsyncDatabaseServiceStore` for the Fastify service worker boundary; HTTP
  record listing is paginated in SQL and rejects unsupported full-scan
  filters/sorts
- `DatabaseApiClient` for remote admin and scoped-token calls
- `DatabaseAuthService`, `hashSecret()`, and `generateOpaqueToken()` for
  admin/scoped-token auth
- `RealtimeHub` and `RecordChangeEvent` for WebSocket record events

`GET /v1/storage/metrics` is an authenticated diagnostic route for the
database and sessions services. It reports worker queue depth and per-operation
count/error/p50/p95/p99/max timings without record payloads or secrets.

## Record Query Contracts

Record listing is a hot path for dense custom collections. `listRecords()` and
`GET /v1/namespaces/:namespaceId/collections/:collectionName/records` must stay
SQL-paged and index-backed:

- default newest-first reads use `records_collection_created_idx`;
- updated-first reads use `records_collection_updated_idx`;
- filtered custom reads must use an explicit collection index declared in the
  collection schema;
- unsupported filters and sorts fail instead of falling back to full scans;
- the HTTP API clamps oversized page requests to its service limit.

`packages/clawjs-database/src/database-query-plan.test.ts` guards those
contracts with `EXPLAIN QUERY PLAN` checks and a 650-row API clamp fixture.

File uploads default to a 100 MiB per-file limit. Override it with
`CLAW_DATABASE_MAX_UPLOAD_BYTES` or `DatabaseServiceConfig.maxUploadFileBytes`
when embedding `buildDatabaseApp()`.

## Migration Note

The local-first CLI now stores user-facing records in the canonical
Claw main database:
`~/.claw/data/core.sqlite` on macOS.
Existing development workspaces that still have older local productivity
or generic database files are recognized and migrated forward by the
local database layer. Treat that migration as one-way for normal usage:
once the main database is active, new writes should go through `claw db
...` or the workspace productivity facades.
