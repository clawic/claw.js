# ADR 0019: Search V1.1 architecture

Status: Accepted

Date: 2026-05-17

## Context

ClawJS needs one public Search capability for framework entities, conversations,
documents, files, media, commands, saved searches, monitors, and optional
external sources. Earlier search paths were split between workspace search,
session search, deterministic CLI surface lookup, and rebuildable sidecars.
That fragmentation made it easy to add a new searchable thing, but hard to
guarantee that adding more sources would not slow down a narrow UI or CLI
search.

The primary requirement is framework search. Native computer or OS-style source
indexing is optional, off by default, profile-scoped, and must not make domain
search slower or noisier.

## Decision

The public product and CLI name is **Search**. `Discovery` is not a public
capability name. `Index` remains an internal implementation term and may appear
only in technical/admin surfaces such as Search Index.

Search V1.1 is built from these layers:

- **Search Source Registry**: every source declares a `SearchSourceManifest`
  with domain, result types, capabilities, indexing policy, permissions, facets,
  and profile.
- **Source adapter**: each source owns a fast path for its domain or UI section.
  A source may index into `search.sqlite`, query its own store, or both, but it
  must not force unrelated sources into the critical path.
- **Root Search federator**: `createRootSearchFederator()` is the lightweight
  query fan-out layer. It applies profile/source/domain selection, strict source
  timeouts, result normalization, central ranking, and partial-result reporting.
  `createSearchRegistry()` remains a compatible alias for existing code.
- **Filters and facets**: sources declare facets in their manifests. Query input
  carries structured filters for built-in result fields, permissions, and source
  metadata so section-level search can stay narrow without invoking a broad
  global scan. Root Search also accepts simple inline filter tokens such as
  `domain:`, `source:`, `shard:`, `type:`, and `scope:` and normalizes them
  before FTS.
- **Result ACL**: indexed documents can declare allowed actors, allowed agents,
  and required scopes. The store filters those rows before returning results, so
  agent-scoped records do not leak into Root Search while public records remain
  searchable without extra context.
- **SQLite-first store**: `core.sqlite` remains canonical configuration and
  structured data storage. `search.sqlite` is rebuildable and owns FTS,
  fragments, cursors, tombstones, saved searches, monitors, ranking cache, and
  optional vector data.
- **Domain fast paths**: `sessions.chats`, `database.records`,
  `documents.blocks`, `images.derived`, `media.assets`,
  `generations.artifacts`, `code.symbols`, and `commands` are initial framework
  sources. More framework domains are added source by source; global Search must
  never replace a section-specific fast path.
- **Profiles**: `framework` is default. `full` is opt-in and is where native,
  external, web, or broad local sources can be enabled later. `local.files`,
  `native.system`, `web.ingested`, and `external.cache` are registered as
  disabled `full` manifests until host/provider adapters provide real ingestion.
- **Ranking**: SearchStore owns final ranking for indexed results. It reranks a
  bounded candidate batch with lexical score, source hints, frecency,
  actor/surface context, and scope-like metadata matches, and exposes compact
  score breakdowns when explain mode is enabled. Ranked query output is cached
  in rebuildable `search_ranking_cache` and invalidated on source, document,
  vector, tombstone, or source-state changes.
- **Semantic retrieval**: vectors live in `search.sqlite` and are queried only
  when a caller provides a local embedding. `semantic` and `hybrid` modes are
  available without provider calls; embedding generation stays with throttled
  source/extractor work.
- **Per-source limits**: source manifests declare body, fragment-count, and
  per-fragment byte limits. The store applies those limits before FTS writes so
  heavy extractors cannot broaden unrelated fast paths.
- **Logical shards**: indexed documents and source cursors are keyed by source
  and shard. The default shard preserves simple adapters; hot/cold and
  extractor-specific shards can be queried or advanced independently as backfill
  matures. Physical shard tables remain a later scale-engine boundary.
- **Indexing jobs**: the sidecar owns a source/shard-aware job queue for
  upsert, delete, backfill, and rebuild work. Jobs use bounded leases,
  priorities, schedules, and retries so background indexing can progress
  without blocking section fast paths.
- **Semantic candidates**: local embedding vectors can be stored beside Search
  documents and combined with lexical matches through semantic or hybrid query
  strategies. Model choice and embedding generation remain adapter-owned; the
  sidecar only stores vectors and applies deterministic similarity scoring.
- **Actions and permissions**: results can expose actions, but execution remains
  brokered by grants/approvals. Sensitive previews are redacted before they
  reach generic Search output.

`claw search` is the CLI surface for Root Search and Search admin:

- `claw search query`
- `claw search sources`
- `claw search sources pause|exclude|resume <source-id>`
- `claw search status`
- `claw search rebuild`
- `claw search rebuild --source <source-id>`
- `claw search jobs`
- `claw search jobs enqueue|claim|complete|fail`
- `claw search saved`
- `claw search monitors`
- `claw search actions`
- `claw search actions execute <result-id> <action-id>`
- `claw search audit`
- `claw search profiles`
- `claw search explain`

Clawix Mac Search and `Command-G` keep their current conversations-only UX.
They must not display Root Search results by default, wait for universal
indexing, or include random framework/native sources unless a future UI explicitly
switches scope.

Scoped rebuilds clear only the selected source's derived rows before refreshing
it. A generation, media, code, or document backfill must not wipe conversations,
commands, or any other section-specific fast path.

Search audit events are derived index metadata stored in `search.sqlite`.
Sensitive queries and action execution attempts are recorded with compact
context so admin/debug surfaces can inspect risky search usage without mutating
canonical application records.

## Consequences

Search can grow to many sources without one global query becoming the only
execution path. Narrow views can query their source directly or pass domain/source
filters. Slow sources are omitted with partial metadata instead of blocking fast
sources. Disabled, paused, and excluded sources are persisted as source state and
are skipped by query-time lazy indexing and rebuilds. Rebuilds can reset
`search.sqlite` because it is not canonical storage.

The first complete acceptance slice is not "all possible sources"; it is a
usable framework Root Search with multiple fast sources, CLI/admin controls,
strict timeout behavior, saved searches, monitors, actions, and no regression to
conversation-only Clawix search.

The showcase Search Index page is the first admin UI for source state and
rebuild queue control. It includes explicit source onboarding: sources are
selected before being enabled, and rebuild queueing is a separate choice. It is
deliberately separate from Root Search and the current Clawix Mac chat search,
so enabling wider indexing does not broaden or slow section-specific search
surfaces by default.

The showcase `/search` page is the first Root Search UI. It queries Search
through `/api/search/query`, defaults to the framework profile, exposes simple
domain filters, and primes only the commands hot path so the entrypoint is
usable before broader source backfills complete.

The initial code source is bounded to an explicit project root, dependency/build
directories are skipped, and query-time refresh happens only for code-scoped
queries. This keeps project/code search available without putting file scanning
on the hot path for chats, database records, commands, or other sections.
The initial document source projects `documents` and `document_blocks` records
from `core.sqlite`, returning documents as section results and blocks as
fragments.
The initial image source projects local image-library records and image media
metadata. OCR and vision labels are explicit future derived-text extractors; the
first fast path covers prompts, tags, provenance, type, provider/model, and
output metadata.
The initial media source projects workspace media records for generic
document/image/audio/video asset search, leaving heavyweight content extraction
to later per-kind adapters.
The initial generations source projects generated artifact records and indexes
prompts, kind/status, backend/model metadata, command provenance, and output
references.

Search action execution is represented as a brokered host-grants plan. CLI
dry-runs are safe previews; non-dry-run execution fails closed unless a signed
host approval id is supplied. Native UI, provider, or system side effects remain
host-owned.

External/native source indexing, OS-like file search, provider-backed semantic
embeddings, and physical host validation remain `EXTERNAL PENDING` until the
signed host and user opt-in flows are implemented and validated.
