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

The `full` profile registers optional source manifests for local files, native
system data, explicit web ingestion, and external provider caches. These sources
are disabled by default and have no built-in extractor in the framework slice;
enabling them requires a host/provider adapter, permissions, and source-specific
backfill jobs.

## Current Sources

| Source | Domain | Storage | Status |
| --- | --- | --- | --- |
| `commands` | `commands` | command registry projected into `search.sqlite` | implemented |
| `sessions.chats` | `sessions` | `sessions.sqlite` projected into `search.sqlite` | implemented |
| `database.records` | `database` | `core.sqlite` records projected into `search.sqlite` | implemented |
| `documents.blocks` | `documents` | `core.sqlite` documents and document blocks projected into `search.sqlite` | implemented initial adapter |
| `images.derived` | `images` | image library, image media metadata, and stored OCR/vision-derived text projected into `search.sqlite` | implemented initial adapter |
| `media.assets` | `media` | workspace media records projected into `search.sqlite` | implemented initial adapter |
| `generations.artifacts` | `generations` | generated artifact records projected into `search.sqlite` | implemented initial adapter |
| `code.symbols` | `code` | bounded project file/symbol/docs projection into `search.sqlite` | implemented initial adapter |
| `local.files` | `files` | bounded local file metadata and text-content projection | implemented opt-in adapter, `full`, off by default |
| `native.system` | `native` | native app/system/contact adapters | EXTERNAL PENDING, `full`, off by default |
| `web.ingested` | `web` | bounded explicit web cache ingestion | implemented opt-in adapter, `full`, off by default |
| `external.cache` | `external` | bounded local provider cache ingestion | implemented opt-in adapter, `full`, off by default |

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
claw search sources enable local.files --profile full --json
claw search rebuild --source local.files --profile full --file-root /path/to/folder --json
claw search query "invoice" --domains files --profile full --file-root /path/to/folder --json
claw search sources enable web.ingested --profile full --json
claw search rebuild --source web.ingested --profile full --web-root /path/to/web-cache --json
claw search query "release notes" --domains web --profile full --web-root /path/to/web-cache --json
claw search sources enable external.cache --profile full --json
claw search rebuild --source external.cache --profile full --external-root /path/to/provider-cache --json
claw search query "provider thread" --domains external --profile full --external-root /path/to/provider-cache --json
claw search query "diagram" --domains images --shards hot --json
claw search query "related concept" --domains documents --strategy hybrid --embedding-model local --embedding '[0.1,0.2,0.3]' --json
claw search sources --json
claw search sources pause commands --json
claw search sources exclude code.symbols --json
claw search sources resume commands --json
claw search status --json
claw search service status --json
claw search service start --json
claw search service run-once --json
claw search service stop --json
claw search rebuild --json
claw search rebuild --source generations.artifacts --json
claw search rebuild --code-root /path/to/project --code-limit 500 --json
claw search jobs list --status queued --json
claw search jobs enqueue backfill --source documents.blocks --shard cold --priority 5 --json
claw search jobs claim --sources documents.blocks --shards cold --limit 10 --json
claw search jobs complete <job-id> --json
claw search jobs fail <job-id> --error "temporary extractor throttle" --retry --json
claw search jobs schedule upsert --source documents.blocks --resource-id doc_123 --json
claw search saved create recent --query "text" --json
claw search monitors create monitor-recent --saved-search recent --json
claw search monitors run monitor-recent --limit 10 --json
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

Search documents and sync cursors are tracked per source and shard. The default
shard preserves the simple source contract; hot/cold or extractor-specific
shards can be indexed and queried independently during backfill and event-driven
indexing. This is a logical shard boundary inside `search.sqlite`, not a claim
that Search has separate physical shard tables yet.

`search.sqlite` also owns a local indexing job queue. Sources can enqueue
upsert, delete, backfill, or rebuild work with source, shard, priority,
schedule, payload, and retry metadata. Workers claim bounded leases so heavy
backfill can run progressively without blocking a UI section that is only
searching its own already-hot data.

The CLI exposes that local queue through `claw search jobs`. Use `enqueue` to
schedule explicit upsert, delete, backfill, or rebuild work; `schedule` for
event-driven upsert/delete notifications keyed by source, shard, operation, and
resource id; `claim` to lease available jobs for a worker; `complete` and
`fail --retry` to settle attempts; and the default list view to inspect queued,
leased, done, or failed jobs. Repeated `schedule` calls for the same changed
resource compact into one queued job so noisy local events do not create
unbounded duplicate backfill work.

The local framework database write path now emits those compacted events for
`database.records`: successful `db <collection> create|update` schedules a hot
upsert event, and successful `db <collection> delete` schedules a hot delete
event. The event write is best effort because `search.sqlite` is a rebuildable
sidecar; a temporary Search sidecar failure must not fail the canonical record
write.

`claw search service` is the local lifecycle surface for Search. Embedded mode
is available from the CLI and records `search-service.json` beside
`search.sqlite`; `start`, `stop`, `restart`, and `status` manage that local
state. `run-once` claims queued index jobs and processes bounded source rebuild
or backfill work, then records a heartbeat and worker summary. Long-running
daemon mode is intentionally reported as `EXTERNAL PENDING` until a signed host
supervisor owns the persistent process.

Adapters can also attach local embedding vectors to Search documents.
`SearchQueryInput.strategy` supports lexical, semantic, and hybrid scoring when
the caller provides an embedding model and vector. Embedding generation remains
adapter-owned; Root Search stores vectors and applies deterministic cosine
similarity scoring alongside the existing ranking hints and context boosts.

Queries support structured filters through `SearchQueryInput.filters` and the
CLI `--filters` flag. Filters may target built-in fields such as `domain`,
`source`, `shard`, `type`, `resourceId`, `path`, `canPreview`, and `redacted`,
or source metadata via `metadata.<field>`. `SearchQueryInput.shards` and CLI
`--shards` provide the same shard narrowing without mixing it into metadata
filters. Query responses include the selected sources' declared facets so UI
sections can build scoped filter controls from manifests.

The store also normalizes basic inline query filters before FTS runs:
`domain:`, `source:`, `shard:`, `type:`, and `scope:` tokens are stripped from
the lexical query and merged into the structured query input. This keeps Root
Search usable from a single text box while preserving the same fast-path
constraints as explicit filters.

Result ACL is enforced before ranking output is returned. Indexed documents can
declare `permissions.allowedActors`, `permissions.allowedAgents`, and
`permissions.requiredScopes`; Search hides those results unless the query actor
and scope filters satisfy the document policy. This keeps agent-specific or
scope-specific records out of broad Root Search while preserving public results.
Preview redaction is enforced in the store as well. If a result declares
`permissions.redacted` or disables `permissions.canPreview`, Search can still
match the indexed text for authorized discovery, but returned snippets are
`[redacted]` and fragments are omitted.

Ranking is centralized in `@clawjs/search`. The store reranks a bounded
candidate batch with lexical score, source ranking hints, local frecency,
`actor`, `surface`, and scope-like metadata filters before returning the final
limit. `--explain` includes a compact score breakdown for debugging.

Ranked query output is cached in `search_ranking_cache` by normalized query,
profile, domain/source/shard filters, actor, surface, explain mode, strategy,
filters, and embedding hash. The cache is rebuildable and is invalidated when
sources, documents, vectors, tombstones, or source state change, so repeated
Root Search queries get a fast path without moving ranking into source adapters.

Semantic retrieval is opt-in per query and per source capability. Search stores
local vectors in `search.sqlite` and can run `semantic` or `hybrid` ranking when
the caller supplies a local embedding vector and model. Search does not call
external embedding providers from the sidecar; embedding generation remains a
source/extractor responsibility and can be throttled as background work.

Each source manifest declares indexing limits. `SearchStore` enforces body,
fragment-count, and per-fragment byte budgets before writing to FTS, so a large
document or extractor output cannot silently expand every section search path.

`code.symbols` is intentionally bounded. It indexes supported project files,
Markdown docs, and lightweight symbol fragments under `--code-root` or the
current workspace root. It skips dependency/build/cache/private control
directories and respects `--code-limit`, `--code-max-depth`, and
`--code-max-bytes`. Code indexing is refreshed lazily only for code-scoped
queries or explicitly during `search rebuild`.

`local.files` follows the same explicit-source rule. It stays in the `full`
profile and is disabled until explicitly enabled with `claw search sources
enable local.files --profile full`. Once enabled, `--file-root` selects the
local tree; `--file-limit`, `--file-max-depth`, and `--file-max-bytes` cap
traversal and content reads. Text-like files are indexed with content; binary
office/media files are indexed by metadata and path only. Dependency/build/
cache/private control directories are skipped, and the source participates in
scoped query refresh, rebuild accounting, and Search service `run-once` jobs
only when selected.

`web.ingested` is the first explicit web cache adapter. It does not crawl the
network itself; it indexes bounded local exports under `--web-root` after the
full-profile source is explicitly enabled. Supported cache files are HTML, text,
Markdown, and JSON records with fields such as `url`, `title`, `description`,
`text`, `html`, `crawlScope`, and `updatedAt`. `--web-limit`,
`--web-max-depth`, and `--web-max-bytes` cap ingestion, and the adapter also
participates in Search service `run-once` jobs.

`external.cache` follows the same local-only rule for provider exports. It
indexes JSON, JSONL, Markdown, and text files under `--external-root` only after
the full-profile source is explicitly enabled. JSON records can declare
`provider`, `app`, `externalId`, `type`, `title`, `summary`, `text`, `syncMode`,
and `updatedAt`; fallback JSON text is redacted for secret-like keys before it
is indexed. Search never calls provider APIs from this adapter.

`documents.blocks` projects framework document records from `core.sqlite`.
Documents are returned as scoped section results, while document blocks are
attached as fragments so a documents UI can search within block content without
asking Root Search to scan unrelated domains.

`images.derived` projects local image-library records and image media metadata.
The initial adapter indexes prompts, revised prompts, tags, collections, type,
provider/model, provenance, output metadata, and any stored OCR text, captions,
alt text, vision labels, or detected object labels already present on the
framework record. It does not call vision/OCR providers; extractor scheduling
remains source-owned.

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

The showcase app exposes `/search-index` as the Search Index admin surface. It
shows framework and full-profile sources separately, keeps optional native/web/
provider/file sources off by default, and can pause, exclude, resume, or enqueue
source rebuild jobs without changing the normal chat search scope. Its source
onboarding control requires explicit source selection before enabling optional
or paused sources, with rebuild queueing as a separate checkbox.

The showcase app also exposes `/search` as the first Root Search entrypoint.
It is separate from chat search, uses the `framework` profile by default, and
seeds only the commands hot path on demand so the launcher remains immediately
usable without waiting for universal backfill.

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
- Extend event-driven updates beyond `database.records` and keep advancing
  backfill cursors so rebuild is not the only freshness path.

### Phase 3: Root Search and optional external sources

- Expand Root Search to saved searches, monitor evaluation, aliases/hotkeys, explain, and
  source onboarding controls.
- Keep `/search` as the initial Root Search UI: small fast-source set, framework
  profile by default, domain filters, partial-source metadata, and a link to
  Search Index controls.
- Keep `/search-index` as the technical/admin Search Index surface for source
  state, opt-in profile checks, source onboarding, and rebuild queue control.
- Keep `framework` as default and use `full` for optional native, web, provider,
  and local-file sources.
- Mark physical/native validation as `EXTERNAL PENDING` until a signed host and
  explicit user opt-in are available.

### Phase 4: scale hardening

- Add hot/cold shards, ranking cache, source throttling, batch ingestion, and
  large-scale labs for 1M and 10M items.
- Preserve scoped hot-shard ranking cache while unrelated cold backfill runs,
  so section-specific searches do not wait for universal indexing.
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
  `monitors` create/run, `actions`, `audit`, `profiles`, and `explain`;
- Clawix Search/`Command-G` conversations-only regression tests;
- performance tests for 50 ms hot path and 200 ms Root Search first batch;
- `npm run search:scale-lab -- --items 1000000 --json` and
  `npm run search:scale-lab -- --items 10000000 --json` before claiming scale
  completion. The default lab run is intentionally smaller so normal validation
  does not index millions of synthetic rows. The lab performs a disk preflight
  before large runs and can archive JSON evidence with `--report <path>`.
