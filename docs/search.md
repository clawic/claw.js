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
| `documents.blocks` | `documents` | `core.sqlite` documents and document blocks projected into `search.sqlite` | implemented initial adapter |
| `images.derived` | `images` | image library and image media metadata projected into `search.sqlite` | implemented initial adapter |
| `media.assets` | `media` | workspace media records projected into `search.sqlite` | implemented initial adapter |
| `generations.artifacts` | `generations` | generated artifact records projected into `search.sqlite` | implemented initial adapter |
| `code.symbols` | `code` | bounded project file/symbol/docs projection into `search.sqlite` | implemented initial adapter |
| native or external sources | `external` or source-specific domains | host/provider adapters | EXTERNAL PENDING |

## CLI

The public CLI surface is:

```bash
claw search query "text" --json
claw search query "text" --domains sessions --json
claw search query "text" --domains database --filters '{"metadata.collection":"contacts","type":"record"}' --json
claw search query "text" --domains documents --filters '{"metadata.scopeKind":"project"}' --json
claw search query "product mark" --domains images --filters metadata.imageType=logo --json
claw search query "requirements" --domains media --filters metadata.kind=document --json
claw search query "analytics cards" --domains generations --filters metadata.status=succeeded --json
claw search query "symbolName" --domains code --code-root /path/to/project --json
claw search sources --json
claw search sources pause commands --json
claw search sources exclude code.symbols --json
claw search sources resume commands --json
claw search status --json
claw search rebuild --json
claw search rebuild --source generations.artifacts --json
claw search rebuild --code-root /path/to/project --code-limit 500 --json
claw search saved create recent --query "text" --json
claw search monitors create monitor-recent --saved-search recent --json
claw search actions <result-id> --json
claw search actions execute <result-id> <action-id> --dry-run --json
claw search actions execute <result-id> <action-id> --host-approval-id <id> --json
claw search audit --json
claw search audit --type action --limit 20 --json
claw search profiles --json
claw search explain "text" --json
```

`search rebuild` may reset `search.sqlite`. It must not mutate canonical
records, raw session artifacts, or external sources. `--source <id>` or
`--sources <id,id>` performs a scoped rebuild: only the selected source
documents, cursor, tombstones, and derived full-text rows are cleared before
that source is refreshed, so unrelated section fast paths remain available.

Source controls are persisted in `search.sqlite`. Disabled, paused, and excluded
sources are skipped by `search query` lazy indexing and by `search rebuild`, and
Root Search reports omitted sources as partial metadata instead of blocking fast
paths.

Queries support structured filters through `SearchQueryInput.filters` and the
CLI `--filters` flag. Filters may target built-in fields such as `domain`,
`source`, `type`, `resourceId`, `path`, `canPreview`, and `redacted`, or source
metadata via `metadata.<field>`. Query responses include the selected sources'
declared facets so UI sections can build scoped filter controls from manifests.

Ranking is centralized in `@clawjs/search`. The store reranks a bounded
candidate batch with lexical score, source ranking hints, local frecency,
`actor`, `surface`, and scope-like metadata filters before returning the final
limit. `--explain` includes a compact score breakdown for debugging.

`code.symbols` is intentionally bounded. It indexes supported project files,
Markdown docs, and lightweight symbol fragments under `--code-root` or the
current workspace root. It skips dependency/build/cache/private control
directories and respects `--code-limit`, `--code-max-depth`, and
`--code-max-bytes`. Code indexing is refreshed lazily only for code-scoped
queries or explicitly during `search rebuild`.

`documents.blocks` projects framework document records from `core.sqlite`.
Documents are returned as scoped section results, while document blocks are
attached as fragments so a documents UI can search within block content without
asking Root Search to scan unrelated domains.

`images.derived` projects local image-library records and image media metadata.
The initial adapter indexes prompts, revised prompts, tags, collections, type,
provider/model, provenance, and output metadata. OCR and vision labels remain a
derived-text layer for later extractors; this adapter provides the fast metadata
path for image-section search first.

`media.assets` projects workspace media records for documents, images, audio,
video, animations, and other persisted assets. It indexes names, source text,
origin/direction, workspace/project/session linkage, channel metadata, and MIME
metadata so generic media views can search without invoking image-specific
extractors.

`generations.artifacts` projects generated artifact records. It indexes prompts,
titles, kind, status, backend/model metadata, command provenance, output
references, and generation metadata so generated outputs remain searchable even
when they are not also registered as media.

Search result actions are brokered. `search actions execute` produces a
host-grants execution plan in `--dry-run` mode, fails closed when an approval is
required but no `--host-approval-id` is provided, and returns a brokered receipt
when the signed host supplies an approval id. The CLI does not perform native UI
or provider side effects directly.

Search writes audit events into `search.sqlite` for action execution attempts
and sensitive queries. A query is audited when it asks for sensitive material
or returns redacted results. Action audit entries include source, domain, result
id, action id, risk, grant, approval status, and compact metadata. `claw search
audit` lists those derived records for admin/debug surfaces.

`@clawjs/search-mcp` exposes the same Search sidecar directly through
`@clawjs/search`; it does not depend on the legacy Index package. Its historical
`clawjs-index-mcp` binary name is retained only as technical compatibility.

## Implementation Plan

### Phase 1: Core and chats fast path

- Ship `@clawjs/search`.
- Expose `claw search`.
- Build `SearchStore` over `search.sqlite`.
- Index `commands`, `sessions.chats`, `database.records`, `documents.blocks`,
  `images.derived`, `media.assets`, `generations.artifacts`, and the first
  bounded `code.symbols` adapter.
- Keep Clawix Mac Search and `Command-G` conversations-only.

### Phase 2: framework domains

- Continue source adapters for richer image derived text, richer code symbols,
  notes, tasks, people, inbox, events, and other framework sections that need
  UI-level search.
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
  `monitors`, `actions`, `audit`, `profiles`, and `explain`;
- Clawix Search/`Command-G` conversations-only regression tests;
- performance tests for 50 ms hot path and 200 ms Root Search first batch;
- `npm run search:scale-lab -- --items 1000000 --json` and
  `npm run search:scale-lab -- --items 10000000 --json` before claiming scale
  completion. The default lab run is intentionally smaller so normal validation
  does not index millions of synthetic rows.
