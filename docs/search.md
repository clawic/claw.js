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
   selected enabled sources, applies strict per-source timeouts and agent result
   budgets, caps the first batch by the global latency budget, merges/ranks
   results, and reports partial results when slow or disabled sources are
   omitted.
4. **Search store**: `search.sqlite` is rebuildable and stores FTS documents,
   fragments, actions, cursors, tombstones, saved searches, monitors, ranking
   cache, and optional vectors. Canonical records stay in `core.sqlite`; source
   control configuration is mirrored there in `search_source_config`.

The physical engine boundary is explicit. `@clawjs/search` exports a
`SearchEngineDescriptor` contract plus `SEARCH_SQLITE_ENGINE` as the default
engine. SQLite is currently the only implemented engine: it is a rebuildable
sidecar, owns no canonical data, provides physical shard FTS partitions inside
`search.sqlite`, and declares its supported FTS, vector, cursor, tombstone, job
queue, audit, saved-search, monitor, and ranking-cache capabilities. Future
engines must enter through the same descriptor contract instead of changing
source manifests or UI section fast paths.

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
| `sessions.chats` | `sessions` | `sessions.sqlite` projected into `search.sqlite` with per-session refresh jobs | implemented |
| `database.records` | `database` | `core.sqlite` records projected into `search.sqlite` | implemented |
| `work.items` | `work` | tasks, projects, goals, people, inbox, events, decisions, assignments, handoffs, approvals, and related work records from `core.sqlite` | implemented initial adapter |
| `documents.blocks` | `documents` | `core.sqlite` documents and document blocks projected into `search.sqlite` | implemented initial adapter |
| `notes.pages` | `notes` | `core.sqlite` pages and page blocks projected into `search.sqlite` | implemented initial adapter |
| `knowledge.graph` | `knowledge` | `core.sqlite` knowledge entities and facts projected into `search.sqlite` | implemented initial adapter |
| `signals.observations` | `signals` | `core.sqlite` signal verticals, variables, and observations projected into `search.sqlite` | implemented initial adapter |
| `calendar.events` | `calendar` | `core.sqlite` calendar events projected into `search.sqlite` | implemented initial adapter |
| `finance.records` | `finance` | `core.sqlite` dense-data finance collections and local `finance_records` projected into `search.sqlite` with redacted previews | implemented initial adapter |
| `eln.records` | `eln` | `core.sqlite` ELN notebooks, entries, protocol runs, and observations projected into `search.sqlite` | implemented initial adapter |
| `images.derived` | `images` | image library, image media metadata, and stored OCR/vision-derived text projected into `search.sqlite` | implemented initial adapter |
| `media.assets` | `media` | workspace media records projected into `search.sqlite` | implemented initial adapter |
| `slides.decks` | `slides` | workspace slide deck manifests and per-slide text projected into `search.sqlite` | implemented initial adapter |
| `sheets.workbooks` | `sheets` | local workbook manifests and per-sheet table/cell text projected into `search.sqlite` | implemented initial adapter |
| `generations.artifacts` | `generations` | generated artifact records projected into `search.sqlite` | implemented initial adapter |
| `code.symbols` | `code` | bounded project file/symbol/docs projection into `search.sqlite` | implemented initial adapter |
| `docs.pages` | `docs` | root public Markdown docs plus `docs/` and ADR sections projected into `search.sqlite`, including frontmatter title/description extraction | implemented initial adapter |
| `skills.registry` | `skills` | framework skill records projected from `core.sqlite` without secret refs | implemented initial adapter |
| `providers.routing` | `providers` | provider routing rules and provider settings projected from `core.sqlite` without account refs | implemented initial adapter |
| `snippets.library` | `snippets` | prompt/template/slash snippets projected from `core.sqlite` | implemented initial adapter |
| `agents.catalog` | `agents` | agents, personalities, skill collections, and connections projected from `core.sqlite` without secret refs | implemented initial adapter |
| `marketplace.choices` | `marketplace` | marketplace/provider choices projected from `core.sqlite` | implemented initial adapter |
| `content.items` | `content` | content items and linked page text projected from `core.sqlite` | implemented initial adapter |
| `business.records` | `business` | business records and linked page text projected from `core.sqlite` | implemented initial adapter |
| `social.posts` | `social` | social posts, channel metadata, scheduling state, and linked page text projected from `core.sqlite` | implemented initial adapter |
| `iot.config` | `iot` | IoT device/config records projected from `core.sqlite` without secret refs | implemented initial adapter |
| `connectors.catalog` | `connectors` | connector control-plane operations projected from `core.sqlite` without credential bindings, secret refs, or raw traces | implemented initial adapter |
| `mcp.servers` | `mcp` | MCP server configuration projected from local config with env/header values redacted | implemented initial adapter |
| `apps.catalog` | `apps` | framework app records projected from `core.sqlite` | implemented initial adapter |
| `design.resources` | `design` | design resources from `core.sqlite` plus workspace style, template, and reference manifests projected into `search.sqlite` | implemented initial adapter |
| `runtime.events` | `runtime` | runtime jobs/events and monitor/infra/ops operational sidecars projected into `search.sqlite` | implemented initial adapter |
| `surfaces.routes` | `surfaces` | surface route graph contracts, steps, tests, docs, and ADR links projected from the framework registry | implemented initial adapter |
| `local.files` | `files` | bounded local file metadata, text-content, and Markdown/MDX section projection with per-file refresh jobs | implemented opt-in adapter, `full`, off by default |
| `native.system` | `native` | native app/system/contact adapters | EXTERNAL PENDING, `full`, off by default |
| `web.ingested` | `web` | bounded explicit web cache ingestion with per-cache-file refresh jobs and text section fragments | implemented opt-in adapter, `full`, off by default |
| `external.cache` | `external` | bounded local provider cache ingestion with per-cache-file refresh jobs and text section fragments | implemented opt-in adapter, `full`, off by default |

## CLI

The public CLI surface is:

```bash
claw search query "text" --json
claw search query "text" --domains sessions --json
claw search query "text" --domains database --filters '{"metadata.collection":"contacts","type":"record"}' --json
claw search query "text" --domains documents --filters '{"metadata.scopeKind":"project"}' --json
claw search query "product mark" --domains images --filters metadata.imageType=logo --json
claw search query "meeting notes" --domains notes --filters metadata.space=notes --json
claw search query "user preference" --domains knowledge --filters metadata.kind=fact --json
claw search query "activation" --domains signals --filters metadata.kind=observation --json
claw search query "architecture review" --domains calendar --filters metadata.calendarId=framework --json
claw search query "travel invoice" --domains finance --filters metadata.currency=USD --json
claw search query "requirements" --domains media --filters metadata.kind=document --json
claw search query "analytics cards" --domains generations --filters metadata.status=succeeded --json
claw search query "symbolName" --domains code --code-root /path/to/project --json
claw search query "deployment APIs" --domains skills --filters metadata.requiresProtectedRefs=true --json
claw search query "quickask chat" --domains providers --filters metadata.hasAccountRef=true --json
claw search query "review selection" --domains snippets --filters metadata.kind=prompt --json
claw search query "local docs server" --domains mcp --mcp-config /path/to/config.toml --json
claw search query "canvas prototype" --domains apps --json
claw search query "launch deck template" --domains design --json
claw search query "worker failed" --domains runtime --filters metadata.level=error --json
claw search query "system capabilities" --domains database --command-fallback empty --json
claw search query "launch checklist" --actor agent:codex --agent-result-limit 5 --agent-source-limit 2 --json
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
claw search query "Search V1.1 architecture" --domains docs --json
claw search query "related concept" --domains documents --strategy hybrid --embedding-model local --embedding '[0.1,0.2,0.3]' --json
claw search sources --json
claw search sources pause commands --json
claw search sources exclude code.symbols --json
claw search sources resume commands --json
claw search status --json
claw search service status --json
claw search aliases --json
claw search service start --json
claw search service run-once --max-jobs 10 --max-runtime-ms 30000 --max-failures 3 --json
claw search service stop --json
claw search shards --source images.derived --json
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
`--shard <id>` or `--shards <id,id>` can further scope a rebuild when paired
with `--source`/`--sources`: only the selected source/shard documents, cursor,
and full-text rows are cleared, the shard catalog is marked empty until fresh
documents arrive, and sibling hot shards remain queryable.
Add `--enqueue` to queue the same rebuild scope in `search.sqlite` instead of
running it inline; `search service run-once` or the signed host worker claims
those jobs and applies the source or source/shard reset under worker budgets.

Source controls are applied to `search.sqlite` and mirrored to canonical
`core.sqlite` configuration in `search_source_config`. Disabled, paused, and
excluded sources are skipped by `search query` lazy indexing and by
`search rebuild`, survive a rebuildable `search.sqlite` reset, and Root Search
reports omitted sources as partial metadata instead of blocking fast paths.

Search documents and sync checkpoints are tracked per source and shard. Each
checkpoint stores the adapter cursor, a separate high-watermark value, a
deterministic checksum, update time, and adapter metadata; `claw search status`
exposes those checkpoints for admin/debug flows. The default shard preserves the
simple source contract; hot/cold or extractor-specific shards can be indexed and
queried independently during backfill and event-driven indexing. `search.sqlite`
maintains a physical `search_shards` catalog table with per-source/per-shard
document and fragment counts, plus source/shard FTS partition tables for
shard-scoped lexical queries, so hosts can inspect shard health without scanning
every document and hot shard queries do not need to scan the global FTS table.
Shard-scoped queries use that catalog to skip empty requested shards before
touching FTS when the catalog has coverage for the requested scope.
Source/shard rebuilds clear only the selected cursor, document rows, global FTS
rows, and FTS partitions for that shard.

`search.sqlite` also owns a local indexing job queue. Sources can enqueue
upsert, delete, backfill, or rebuild work with source, shard, priority,
schedule, payload, and retry metadata. Event-driven upsert/delete jobs for
framework records and artifacts are processed by resource id when the source
adapter supports it; full-source refresh remains for explicit rebuild/backfill
jobs. Workers claim bounded leases so heavy backfill can run progressively
without blocking a UI section that is only searching its own already-hot data.

The CLI exposes that local queue through `claw search jobs`. Use `enqueue` to
schedule explicit upsert, delete, backfill, or rebuild work; `schedule` for
event-driven upsert/delete notifications keyed by source, shard, operation, and
resource id; `claim` to lease available jobs for a worker; `complete` and
`fail --retry` to settle attempts; and the default list view to inspect queued,
leased, done, or failed jobs. Repeated `schedule` calls for the same changed
resource compact into one queued job so noisy local events do not create
unbounded duplicate backfill work.

The local framework database and artifact write paths now emit those compacted
events for `database.records`, `documents.blocks`, `notes.pages`,
`knowledge.graph`, `signals.observations`, `calendar.events`,
`finance.records`, `eln.records`, `work.items`, `providers.routing`, `snippets.library`,
`agents.catalog`, `mcp.servers`, `apps.catalog`, `design.resources`, `runtime.events`,
`marketplace.choices`, `content.items`, `social.posts`, `iot.config`,
`business.records`, `generations.artifacts`, `images.derived`, `media.assets`, and
`skills.registry`: successful `db
collection create|update`, `documents create|update`, `notes create|update`,
`knowledge entity|fact`, `signals seed-catalog|observe`, `calendar
create|update`, canonical finance collection writes such as `transaction create|update`, `image
create|edit|import`, provider routing/settings upserts, snippet upserts,
MCP server upserts, app/design resource upserts,
monitor/infra/ops event writes, typed-media generation,
`generations create`, and `skills
upsert` calls schedule hot upsert events; successful record, document, note,
signal observation, calendar event, finance collection record, work item,
ELN record,
provider route, snippet, MCP server, app/design resource, runtime/operational event, image, media, generation, or skill deletes
schedule delete events where the source item is removed; and `document_blocks`
changes schedule a hot upsert for the parent document so fragments refresh together. The event write is best effort because
`search.sqlite` is a rebuildable sidecar; a temporary Search sidecar failure
must not fail the canonical record or artifact write.

`claw search service` is the local lifecycle surface for Search. Embedded mode
is available from the CLI and records `search-service.json` beside
`search.sqlite`; `start`, `stop`, `restart`, and `status` manage that local
state. `run-once` claims queued index jobs and processes bounded source rebuild
or backfill work, then records a heartbeat and worker summary. `--max-jobs`,
`--max-runtime-ms`, and `--max-failures` let hosts throttle each tick by work
count, wall-clock budget, and failure budget; the worker claims one job at a
time so it does not lease more work than it can process before stopping.
Long-running daemon mode is intentionally reported as `EXTERNAL PENDING` until a
signed host supervisor owns the persistent process.

Adapters can also attach local embedding vectors to Search documents.
`SearchQueryInput.strategy` supports lexical, semantic, and hybrid scoring when
the caller provides an embedding model and vector. `@clawjs/search` includes a
deterministic local text embedding helper (`local-text-v1`) so adapters can
generate reproducible vectors without calling providers; Root Search stores
vectors and applies deterministic cosine similarity scoring alongside the
existing ranking hints and context boosts. Admin callers can also run
`claw search embeddings index --source <source-id>` or MCP
`search.embeddings.index` to backfill local vectors for already indexed
documents on semantic-capable sources, or enqueue
`claw search jobs enqueue embed --source <source-id>`/MCP `search.jobs.enqueue`
with operation `embed` so bounded workers perform the same local-only embedding
pass.

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

Lexical matching reports exact, prefix, FTS, fuzzy, and semantic match reasons.
The primary path remains SQLite FTS; when FTS cannot produce enough candidates,
the store runs a bounded fuzzy fallback over the already-scoped candidate set so
small typos can still return section-safe results without broadening source,
domain, shard, profile, ACL, or metadata filters.

Command fallback is explicit. Scoped section searches do not broaden into
commands by default, preserving section-only result contracts. CLI callers can
opt in with `--command-fallback empty` to fill an empty scoped query from the
commands source, or `--command-fallback always` to use commands for any
remaining result budget. `--command-fallback-limit` caps how many command
results may be added.

`claw search aliases` exposes launcher aliases from the canonical command
registry as Search-visible contracts. Each row records the alias, canonical
command or collection, `commands` search domain, optional Search result id, and
the same Root Search shortcut state used by `claw search entrypoints`. Native
global shortcut binding stays outside this command until the signed host owns
the physical binding.

Result ACL is enforced before ranking output is returned. Indexed documents can
declare `permissions.allowedActors`, `permissions.allowedAgents`, and
`permissions.requiredScopes`; Search hides those results unless the query actor
and scope filters satisfy the document policy. This keeps agent-specific or
scope-specific records out of broad Root Search while preserving public results.
Agent callers can also attach `SearchQueryInput.agentBudget` or use
`--agent-result-limit`, `--agent-source-limit`, and `--agent-domain-limit` to cap
their returned result budget after ACL and ranking, including per-source and
per-domain caps for broad searches.
Preview redaction is enforced in the store as well. If a result declares
`permissions.redacted` or disables `permissions.canPreview`, Search can still
match the indexed text for authorized lookup, but returned snippets are
`[redacted]` and fragments are omitted.

Saved searches preserve structured query controls. `claw search saved create`
accepts the same domain/source/shard filters, strategy, local embedding,
structured filters, limit, explain mode, actor/surface context, and agent budget
flags as `claw search query`; `claw search saved delete` removes a saved search
and its attached monitors. Monitor evaluation runs that stored query and can
override the result limit for a single run, and `claw search monitors delete`
removes an individual monitor.

Ranking is centralized in `@clawjs/search`. The store reranks a bounded
candidate batch with lexical score, source ranking hints, local frecency,
`actor`, `surface`, and scope-like metadata filters before returning the final
limit. Local frecency is learned from Search interactions such as brokered
action execution and stays in rebuildable `search.sqlite`, separate from
canonical source records. `--explain` includes a compact score breakdown for
debugging.

Ranked query output is cached in `search_ranking_cache` by normalized query,
profile, domain/source/shard filters, actor, surface, explain mode, strategy,
filters, agent budget, and embedding hash. The cache is rebuildable and is
invalidated when sources, documents, vectors, tombstones, or source state change,
so repeated Root Search queries get a fast path without moving ranking into
source adapters.

Semantic retrieval is opt-in per query and per source capability. Search stores
local vectors in `search.sqlite` and can run `semantic` or `hybrid` ranking when
the caller supplies a local embedding vector and model. The CLI can derive a
query vector with `--embedding-model local-text-v1` or `--local-embedding true`
for sources that have local vectors. Source adapters may write those vectors
directly, and Search Index admins can backfill deterministic local vectors with
`claw search embeddings index --source <source-id>`, MCP
`search.embeddings.index`, or throttled `embed` jobs. The Search MCP surface
mirrors this local-only path: `search.query` accepts
`embeddingModel: local-text-v1` or `localEmbedding: true`,
`search.embeddings.create` returns the deterministic local vector for callers
that need to inspect or cache it, and `search.embeddings.status` reports vector
coverage.
Search does not call external embedding providers from the sidecar;
provider-backed generation remains `EXTERNAL PENDING` until an explicit
provider worker owns credentials, billing, and throttling.

Each source manifest declares indexing limits. `SearchStore` enforces body,
fragment-count, and per-fragment byte budgets before writing to FTS, so a large
document or extractor output cannot silently expand every section search path.

`code.symbols` is intentionally bounded. It indexes supported project files,
Markdown docs, and lightweight symbol fragments under `--code-root` or the
current workspace root. It skips dependency/build/cache/private control
directories and respects `--code-limit`, `--code-max-depth`, and
`--code-max-bytes`. Code indexing is refreshed lazily for code-scoped queries,
explicitly during `search rebuild`, or incrementally through event-driven
file upsert/delete jobs keyed by the project root and relative file path.

`local.files` follows the same explicit-source rule. It stays in the `full`
profile and is disabled until explicitly enabled with `claw search sources
enable local.files --profile full`. Once enabled, `--file-root` selects the
local tree; `--file-limit`, `--file-max-depth`, and `--file-max-bytes` cap
traversal and content reads. Text-like files are indexed with content; binary
office/media files are indexed by metadata and path only. Markdown and MDX files
also expose bounded heading section fragments. Dependency/build/cache/private
control directories are skipped, and the source participates in scoped query
refresh, rebuild accounting, and Search service `run-once` jobs only when
selected. Changed-file producers can schedule resource-scoped refresh jobs keyed
by the path under `--file-root`; paths outside that root are rejected before a
job is written.

`web.ingested` is the first explicit web cache adapter. It does not crawl the
network itself; it indexes bounded local exports under `--web-root` after the
full-profile source is explicitly enabled. Supported cache files are HTML, text,
Markdown, and JSON records with fields such as `url`, `title`, `description`,
`text`, `html`, `crawlScope`, and `updatedAt`. `--web-limit`,
`--web-max-depth`, and `--web-max-bytes` cap ingestion, and the adapter also
participates in Search service `run-once` jobs. Markdown-shaped `text` payloads
are split into bounded section fragments; this still never crawls the network.
Changed-cache producers can schedule resource-scoped refresh jobs keyed by the
path under `--web-root`; paths outside that root are rejected before a job is
written.

`external.cache` follows the same local-only rule for provider exports. It
indexes JSON, JSONL, Markdown, and text files under `--external-root` only after
the full-profile source is explicitly enabled. JSON records can declare
`provider`, `app`, `externalId`, `type`, `title`, `summary`, `text`, `syncMode`,
and `updatedAt`; fallback JSON text is redacted for secret-like keys before it
is indexed. Markdown-shaped exported text is split into bounded section
fragments. Search never calls provider APIs from this adapter. Changed-cache
producers can schedule resource-scoped refresh jobs keyed by the path under
`--external-root`; paths outside that root are rejected before a job is written.

`documents.blocks` projects framework document records from `core.sqlite`.
Documents are returned as scoped section results, while document blocks are
attached as fragments so a documents UI can search within block content without
asking Root Search to scan unrelated domains.

`notes.pages` projects framework page records and page blocks from `core.sqlite`.
Notes are returned as scoped section results with block fragments, space/surface
facets, tags, visibility, sensitivity, and source-record metadata. Sensitive
notes can still match indexed text, but returned previews are redacted and block
fragments are omitted.

`knowledge.graph` projects framework knowledge entities and facts from
`core.sqlite`. Entities index labels, descriptions, properties, provenance, type,
source, and sensitivity. Facts index subject, predicate, object value, scope,
confidence, validity window, source, and provenance. Sensitive knowledge can
still match indexed text, but returned previews are redacted and fragments are
omitted. `claw knowledge delete ID --kind fact|entity` schedules the matching
hot `knowledge.graph` delete job so Search tombstones facts and entities without
waiting for a full rebuild.

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
extractors. Stored transcript, caption, or segment text is indexed as a
transcription fragment when already present on the media record; Search does not
run speech-to-text providers from this adapter.

`slides.decks` projects workspace slide deck manifests from the local slides
surface. It indexes the deck title, theme, author metadata, output formats, and
each slide as a Search fragment using headings, subtitles, body text, bullets,
steps, metrics, tables, image captions, and notes already stored in the
manifest. It does not parse rendered PPTX/PDF output; generated files remain
media or generated-artifact records when those surfaces register them. Local
`slides create`, `slides add`, `slides render`, and `slides share` writes
schedule best-effort hot upsert jobs for changed deck manifests.

`sheets.workbooks` projects local workbook manifests from
`.claw/sheets/workbooks` or an explicit sheets root. It indexes workbook title,
author/output metadata, sheet names, columns, rows, cells, tables, charts, and
notes as workbook items with per-sheet fragments. It does not parse binary XLSX
files directly; imported or generated files remain media/file records until a
workbook manifest or extractor-owned projection exists. Producers that write
workbook manifests can schedule best-effort hot upsert jobs for changed
workbooks through the Search event scheduler.

`generations.artifacts` projects generated artifact records. It indexes prompts,
titles, kind, status, backend/model metadata, command provenance, output
references, and generation metadata so generated outputs remain searchable even
when they are not also registered as media.

`signals.observations` projects signal verticals, variables, and observations
from `core.sqlite`. It indexes vertical descriptions, variable definitions,
observed values, observation notes, and redacted source metadata. Signal vertical metadata, variable definitions,
and observation source metadata are
exposed as separate redacted fragments, with secret-like nested keys redacted
before fallback JSON text is indexed.

`calendar.events` projects local calendar events from `core.sqlite`. It indexes
event titles, times, calendar/source identifiers, and redacted metadata.
Calendar event metadata is exposed as a separate redacted fragment, with
secret-like nested metadata keys redacted before fallback JSON text is indexed.

`skills.registry` projects framework skill records from `core.sqlite`. It
indexes the skill slug, name, kind, body, scope metadata, and export path, but
does not index `secret_refs_json`; Search only exposes a
`requiresProtectedRefs` facet so skill search stays useful without leaking local
secret references.

`providers.routing` projects provider routing rules and provider settings from
`core.sqlite`. It indexes feature, capability, provider, model, enabled state,
and redacted policy/metadata fragments, including simple JSON policy fields that
do not have prose keys. Secret-like nested keys are redacted before fallback JSON
text is indexed. It deliberately does not index `account_ref` values; Search
only exposes whether an account reference exists.

`snippets.library` projects framework snippets from `core.sqlite`. It indexes
slug, title, kind, shortcut, body, scope metadata, and skill references so
prompt/template/slash-command sections can keep their own fast path. Snippet body, scope, and metadata are exposed as separate redacted fragments so scoped
snippet searches can match surface/audience hints without exposing secret-like
metadata values.

`agents.catalog` projects agent-facing framework entities from `core.sqlite`.
It indexes agents, personalities, skill collections, and connections by their
public labels, roles, runtimes, models, prompts, descriptions, tags, providers,
and scopes. Agent configuration and connection scopes are exposed as redacted
fragments so agent instructions and connection capabilities can match scoped
queries. It deliberately excludes `secret_ref` values and raw connection config
secrets; Search only exposes a `hasProtectedRef` facet for agents and
connections.

`marketplace.choices` projects local framework marketplace decisions from
`core.sqlite`. It indexes target, choice, kind, status, rationale, and redacted
metadata so provider/default selection views can search current choices without
calling external marketplaces. Marketplace rationale and metadata are exposed as
separate redacted fragments, and secret-like nested metadata keys are redacted
before fallback JSON text is indexed.

`content.items` projects framework content records from `core.sqlite`. It
indexes title, kind, status, brand/campaign ids, redacted metadata, and linked
page block text when a content item owns an editable page. Content page text and
metadata are exposed as separate redacted fragments, with secret-like nested
metadata keys redacted before fallback JSON text is indexed.

`business.records` projects local business records from `core.sqlite`. It
indexes name, kind, status, redacted metadata, and linked page block text when
the business record owns an editable note page. Business page text and metadata
are exposed as separate redacted fragments, with secret-like nested metadata keys
redacted before fallback JSON text is indexed.

`social.posts` projects social publishing records from `core.sqlite`. It
indexes title, status, redacted channel metadata, scheduling/publishing state,
redacted metadata, and linked page block text without calling social providers.
Social page text, channel data, and metadata are exposed as separate redacted
fragments, with secret-like nested channel/metadata keys redacted before
fallback JSON text is indexed.

`iot.config` projects local IoT configuration records from `core.sqlite`. It
indexes device/config names, kind, enabled/status state, parent id, and redacted
config/metadata text. It deliberately does not index `secret_ref` values;
Search only exposes a `hasProtectedRef` facet. IoT config and metadata are
exposed as separate redacted fragments, with simple JSON config fields indexed
through fallback JSON text after secret-like keys are redacted.

`apps.catalog` projects framework app records from `core.sqlite`. It indexes
app names, slugs, descriptions, root path basenames, and pinned/opened state.
App manifests and permission metadata are exposed as separate redacted fragments,
with secret-like nested keys redacted before fallback JSON text is indexed.

`design.resources` projects local design resources from `core.sqlite` plus
workspace style, template, and reference manifests. Design resource manifests
are exposed as redacted fragments, with secret-like nested manifest keys redacted
before fallback JSON text is indexed.

`connectors.catalog` projects connector control-plane operations from
`core.sqlite`. It indexes provider names, runtime/support state, operation ids,
native operation names, cost/approval metadata, network policy references, and
declared capability summaries. It does not index credential bindings, secret
references, or raw traces; connector execution remains host-brokered and
approval-gated. A resource-scoped scheduling helper exists for connector
operation changes; automatic control-plane write emitters remain source-owned.

`runtime.events` projects technical runtime jobs, runtime events, and
monitor/infra/ops operational events from local sidecars. It indexes job status,
run timing, payload summaries, event kind/level/message, sidecar origin, and
operational metadata so technical artifacts can be searched without mixing them
into user-facing domain sections. Runtime job payloads and runtime/operational event metadata
are exposed as separate redacted fragments, with secret-like nested keys
redacted before fallback JSON text is indexed.

`docs.pages` projects root public Markdown docs plus Markdown files under
`docs/`, including ADRs under `docs/adr/`, into source-scoped docs results. It
indexes document titles, simple frontmatter `title`/`description`, section
headings, section snippets, kind/category/path metadata, and supports
resource-scoped refresh jobs keyed by repository-relative docs paths. It also
writes deterministic local `local-text-v1` vectors for provider-free semantic
and hybrid docs queries.

`surfaces.routes` projects the framework surface route graph from
`packages/clawjs-core/src/surface-registry.ts`. It indexes each route's source
and destination nodes, owner, visibility, transport, validation text, route
steps, tests, docs, ADRs, and explicit gaps as technical Search documents. It
supports resource-scoped refresh jobs keyed by route id, so route graph producers
can refresh `surfaces.routes` without rebuilding the full source. This keeps
route/debug queries source-scoped while giving Search and Search Index a fast
path over the same registry used by `claw inspect routes`.

Search result actions are brokered. `search actions execute` produces a
host-grants execution plan in `--dry-run` mode, fails closed when an approval is
required but no `--host-approval-id` is provided, and returns a brokered receipt
when the signed host supplies an approval id. The CLI does not perform native UI
or provider side effects directly.

Search writes audit events into `search.sqlite` for action execution attempts
and sensitive queries. A query is audited when it asks for sensitive material
or returns redacted results. Action audit entries include source, domain, result
id, action id, risk, grant, approval status, and compact metadata. `claw search
audit` and Search MCP `search.audit.list` list those derived records for
admin/debug surfaces. MCP `search.query` applies the same local sensitive-query
audit rule as the CLI.

`@clawjs/search-mcp` exposes the same Search sidecar directly through
`@clawjs/search`; it does not depend on the legacy Index package and publishes
the `claw-search-mcp` binary. Its tool surface includes query, source/status,
source-state control, source/shard checkpoint cursors, profiles, entrypoints,
aliases, explain, action listing/execution with brokered host-approval plans,
saved searches, monitor evaluation, monitor management, shard catalog
inspection, audit, and indexing-job tools, including compacted event scheduling
through `search.jobs.schedule`. `search.cursors.list` exposes the same
cursor/watermark/checksum checkpoint rows as `claw search status` for agents and
host admin flows. MCP `search.saved.create` accepts the same structured query
controls as `search.query`, so saved searches and monitors can preserve
domain/source/shard filters, strategy, limits, actor/surface context, and local
embedding settings. MCP callers can pass `agentBudget.maxResults`,
`agentBudget.maxResultsPerSource`, and `agentBudget.maxResultsPerDomain` on both
direct queries and saved searches, matching the local Search result-budget
contract used by agent callers. `search.saved.delete` and
`search.monitors.delete` expose the same lifecycle controls for MCP clients.

The showcase app exposes `/search-index` as the Search Index admin surface. It
shows framework and full-profile sources separately, keeps optional native/web/
provider/file sources off by default, and can pause, exclude, resume, or enqueue
source rebuild jobs without changing the normal chat search scope. Its source
onboarding control requires explicit source selection before enabling optional
or paused sources, with rebuild queueing as a separate checkbox. The Search
Index snapshot also exposes first-run onboarding guidance: sources are grouped
as ready, local setup required, or signed-host pending, and the UI does not
preselect sources that need a local root, cache, provider export, or signed host
before they can produce useful index rows.

The showcase app also exposes `/search` as the first Root Search entrypoint.
It is separate from chat search, uses the `framework` profile by default, and
seeds only the commands hot path on demand so the launcher remains immediately
usable without waiting for universal backfill.
`claw search entrypoints` exposes the same contract for automation: Root Search
uses `/search` and `claw search query`, Search Index uses `/search-index`, and
the existing chat search remains conversations-only with `Command-G`. The Root
Search native/global hotkey binding is explicit but `EXTERNAL PENDING` until a
signed host shortcut broker validates it.

## Implementation Plan

### Phase 1: Core and chats fast path

- Ship `@clawjs/search`.
- Expose `claw search`.
- Build `SearchStore` over `search.sqlite`.
- Index `commands`, `sessions.chats`, `database.records`, `documents.blocks`,
  `notes.pages`, `knowledge.graph`, `images.derived`, `media.assets`,
  `slides.decks`, `sheets.workbooks`, `generations.artifacts`, `skills.registry`, `providers.routing`,
  `snippets.library`, `agents.catalog`, `marketplace.choices`, `content.items`,
  `business.records`, `social.posts`, `iot.config`, and the first bounded
  `code.symbols` adapter with per-file event refresh. `sessions.chats` supports
  resource-scoped refresh jobs keyed by session id. `docs.pages` indexes
  public root docs, docs, and ADR sections with resource-scoped refresh jobs and
  best-effort event scheduling for changed docs files. `surfaces.routes` indexes
  route graph contracts with resource-scoped refresh jobs keyed by route id.
  `slides.decks` also
  supports changed-deck event refresh from local slide writes,
  `sheets.workbooks` supports changed-workbook event refresh for manifest
  producers, and `design.resources` refreshes workspace style, template, and
  reference manifests from local design commands.
- Keep Clawix Mac Search and `Command-G` conversations-only.

### Phase 2: framework domains

- Continue source adapters for richer image derived text, richer code symbols,
  and remaining framework sections that need UI-level search. `work.items`
  covers the initial tasks, people, inbox, events, decisions, assignments,
  handoffs, approvals, projects, and goals fast path.
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
- Expose `claw search entrypoints` so agents and hosts can inspect Root Search,
  Search Index, and chat-search shortcut contracts before binding native
  shortcuts.
- Keep `/search-index` as the technical/admin Search Index surface for source
  state, opt-in profile checks, first-run source onboarding, setup readiness,
  and rebuild queue control.
- Keep `framework` as default and use `full` for optional native, web, provider,
  and local-file sources.
- Mark physical/native validation as `EXTERNAL PENDING` until a signed host and
  explicit user opt-in are available.

### Phase 4: scale hardening

- Add hot/cold shards, source/shard FTS partitions, ranking cache, source
  throttling, batch ingestion, and large-scale labs for 1M and 10M items.
- Preserve scoped hot-shard ranking cache while unrelated cold backfill runs,
  use partitioned FTS for shard-scoped lexical queries, and keep
  section-specific searches independent from universal indexing.
- Enforce performance gates: hot searches target 50 ms; Root Search first batch
  targets 200 ms; slow sources time out instead of blocking. Root Search
  enforces both per-source timeout and global first-batch budgets, so a source
  cannot consume a larger first-batch window just because its individual timeout
  is higher. The Search package includes a synthetic latency regression gate for
  those hot/root budgets, while million-row scale evidence remains in the scale
  lab.
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
- performance tests for 50 ms hot path and 200 ms Root Search first batch
  (`packages/clawjs-search/src/index.test.ts`) plus the larger scale lab;
- `npm run search:scale-lab -- --items 1000000 --json` and
  `npm run search:scale-lab -- --items 10000000 --json` before claiming scale
  completion. The default lab run is intentionally smaller so normal validation
  does not index millions of synthetic rows. The lab performs a disk preflight
  before large runs and can archive JSON evidence with `--report <path>`.
- `npm run test:search-goal` for the public Search v1.1 goal guard: source
  registry coverage, CLI/MCP/admin surface hooks, Search naming, storage
  invariants, scale-lab presence, and forbidden public external-product
  references.
