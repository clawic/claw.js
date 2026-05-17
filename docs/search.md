---
title: Search
description: Search V1.1 architecture, source registry, Root Search federation, and indexing plan.
---

# Search

Search is the public framework capability for querying ClawJS entities,
conversations, commands, documents, media, saved searches, monitors, and
optional external sources. The implementation uses technical indexes, but the
public product and CLI surface is Search.

The durable architecture decision is [ADR 0019: Search V1.1 architecture](./adr/0019-search-v1-1-architecture.md).

## Architecture

Search V1.1 has four layers:

1. **Search Source Registry**: each source declares a `SearchSourceManifest`
   with domain, result types, capabilities, indexing policy, permissions, facets,
   and profile.
2. **Source fast path**: each domain or UI section owns a fast query route. A
   source can use its own store, `search.sqlite`, or both.
3. **Root Search federator**: `createRootSearchFederator()` fans out across
   selected sources, applies strict per-source timeouts, merges/ranks results,
   and reports partial results when slow sources are omitted.
4. **Search store**: `search.sqlite` is rebuildable and stores FTS documents,
   fragments, actions, cursors, tombstones, saved searches, monitors, ranking
   cache, and optional vectors. Canonical records and configuration stay in
   `core.sqlite`.

## Profiles

`framework` is the default profile. It includes framework-owned sources and must
stay fast enough for UI sections and CLI use.

`full` is opt-in. Native, local-file, external-provider, web, and broad
Spotlight-style sources belong here unless a specific source is promoted into a
framework section with its own fast path.

## Current Sources

| Source | Domain | Storage | Status |
| --- | --- | --- | --- |
| `commands` | `commands` | command registry projected into `search.sqlite` | implemented |
| `sessions.chats` | `sessions` | `sessions.sqlite` projected into `search.sqlite` | implemented |
| `database.records` | `database` | `core.sqlite` records projected into `search.sqlite` | implemented |
| `documents.blocks` | `documents` | framework document stores | planned |
| `images.derived` | `images` | OCR/labels/metadata stores | planned |
| `code.symbols` | `code` | project/code symbol stores | planned |
| native or external sources | `external` or source-specific domains | host/provider adapters | EXTERNAL PENDING |

## CLI

The public CLI surface is:

```bash
claw search query "text" --json
claw search query "text" --domains sessions --json
claw search sources --json
claw search sources pause commands --json
claw search sources exclude code.symbols --json
claw search sources resume commands --json
claw search status --json
claw search rebuild --json
claw search saved create recent --query "text" --json
claw search monitors create monitor-recent --saved-search recent --json
claw search actions <result-id> --json
claw search profiles --json
claw search explain "text" --json
```

`search rebuild` may reset `search.sqlite`. It must not mutate canonical
records, raw session artifacts, or external sources.

Source controls are persisted in `search.sqlite`. Disabled, paused, and excluded
sources are skipped by `search query` lazy indexing and by `search rebuild`, and
Root Search reports omitted sources as partial metadata instead of blocking fast
paths.

## Implementation Plan

### Phase 1: Core and chats fast path

- Ship `@clawjs/search`.
- Expose `claw search`.
- Build `SearchStore` over `search.sqlite`.
- Index `commands`, `sessions.chats`, and `database.records`.
- Keep Clawix Mac Search and `Command-G` conversations-only.

### Phase 2: framework domains

- Add source adapters for documents, images, code symbols, media, notes, tasks,
  people, inbox, events, and other framework sections that need UI-level search.
- Require each domain to have a source manifest, fast path, permissions, actions,
  and focused tests.
- Add event-driven updates and backfill cursors so rebuild is not the only
  freshness path.

### Phase 3: Root Search and optional external sources

- Expand Root Search to saved searches, monitors, aliases/hotkeys, explain, and
  source onboarding controls.
- Keep `framework` as default and use `full` for optional native, web, provider,
  and local-file sources.
- Mark physical/native validation as `EXTERNAL PENDING` until a signed host and
  explicit user opt-in are available.

### Phase 4: scale hardening

- Add hot/cold shards, ranking cache, source throttling, batch ingestion, and
  large-scale labs for 1M and 10M items.
- Enforce performance gates: hot searches target 50 ms; Root Search first batch
  targets 200 ms; slow sources time out instead of blocking.
- Keep sensitive previews redacted and action execution brokered by grants and
  approvals.

## Validation

Required validation for Search work:

- unit tests for manifests, result normalization, source filtering, facets,
  redaction, actions, permissions, tombstones, cursors, rebuild, and timeout
  behavior;
- CLI integration tests for `query`, `sources`, `status`, `rebuild`, `saved`,
  `monitors`, `actions`, `profiles`, and `explain`;
- Clawix Search/`Command-G` conversations-only regression tests;
- performance tests for 50 ms hot path and 200 ms Root Search first batch;
- 1M and 10M item labs before claiming scale completion.
