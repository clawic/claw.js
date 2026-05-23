# Performance Governance

Performance in ClawJS means whole-computer resource behavior, not only speed.
The user's CPU, RAM, GPU or Neural Engine, disk, network, battery, thermals,
timers, logs, indexes, caches, processes, and background work are product
budgets. A feature is not complete if it works only by making the user's
computer feel heavy, hot, noisy, full, or blocked.

This policy is design governance. `PERF.md`, platform performance playbooks,
and performance skills are the measurement layer; this page is the decision
pressure that makes new work choose lighter designs by default.

## Required Impact Classification

Durable work must classify performance impact when it adds or changes any of:

- UI rendering, visible lists, streaming, animations, canvas, web views, or
  host surfaces.
- Daemons, bridge routes, IPC frames, local servers, workers, background loops,
  polling, timers, or long-running agents.
- Storage, sidecars, logs, audit streams, snapshots, attachments, local models,
  caches, indexes, mirrors, search, sync, or retry queues.
- Model inference, embedding, decoding, media processing, GPU or Neural Engine
  use, or other compute-heavy paths.

Classification names the affected resources, the expected steady-state and
peak behavior, the boundedness rule, and the evidence needed before claiming a
performance fix.

## Required Report States

Performance investigations and fixes must report these states separately:
hypotheses, static guard, compile/build, measurement taken, confirmed cause,
probable cause, and discarded causes.

Static reading and static guard results can identify risk, but they do not
prove runtime performance behavior. Compile/build results prove code health,
not performance validation. A confirmed cause requires cited measurement
evidence from a trace, profile, runtime log, approved baseline, or equivalent
capture. A probable cause is allowed when evidence points to a likely source
but the measurement is incomplete. Discarded causes name the suspects checked
and the evidence or reasoning that ruled them out.

No measurement, no performance validated: without a real measurement taken and
cited, the work closes only as partial validation, blocked, or
`EXTERNAL PENDING`, never as performance validated.

## Default Design Rules

- Start lazily. Do not launch processes, initialize modules, open databases,
  build indexes, warm models, or start polling until a user, agent, route, or
  explicit module requires it.
- Stay bounded. Caches, logs, queues, snapshots, indexes, attachments, and
  model artifacts need bytes, count, age, or active-window limits plus cleanup
  ownership.
- Sleep at idle. Idle CPU, GPU, timers, workers, WebViews, streams, and
  watchers must quiesce when no useful work remains.
- Apply backpressure. Streams, bridge frames, sync, indexing, search,
  ingestion, and model output must be cancellable, batchable, and able to slow
  producers before they overwhelm UI, memory, disk, or IPC.
- Window large work. Prefer pagination, incremental hydration, virtualization,
  shard-local indexes, partial sync, and resumable jobs over whole-world reads.
- Keep hot paths explicit. Main-thread UI work, synchronous disk IO, large JSON
  decode, image/media decode, markdown parsing, and model inference require
  explicit isolation or evidence that they are harmless.
- Prefer equivalent cheaper behavior. When tests and measurements prove the
  same user-visible and programmatic behavior, the lower-resource
  implementation is the preferred refactor.

## Windowing/Pagination by Default

The default rule is: do not load all -> filter/sort/render. Lists,
transcripts, timelines, sidebars, database administration, search indexing,
rollout JSONL readers, embeddings, tables, and imports must use a
cursor/window/batch/limit contract before they touch large data.

List-like public and internal APIs should return a bounded item slice plus
`hasMore`, `nextCursor`, or explicit `offset` metadata. Database and dense-data
callers must pass a deliberate `limit` for high-volume records even when the
store has a defensive default. Rollout and transcript readers should prefer
tail windows and `readWindowBefore`-style older-page fetches over whole-file
hydration. Imports must stream or batch, or prove a maximum file size and row
count before using whole-file parsing.

Exceptions are allowed only for datasets with a documented maximum count or
byte size. Existing historical exceptions live in
`docs/boundedness-baseline.json`; new or touched exceptions need the affected
surface, risk kind, bound, cleanup policy, review reference, and expiry.

## Hot Path Guard P1

UI, realtime, server route, websocket, render, and event-loop hot paths must
not add synchronous heavy work without bounded-size proof. The static guard
blocks synchronous SQLite in request/realtime handlers, `Buffer.concat`,
whole-file read-and-split parsing, and JSON decode in hot paths unless the call
has a nearby `hot-path-ok` marker with `maxBytes`, `maxItems`, or `maxPixels`
and a reason.

Existing reviewed hot-path debt lives in `docs/hot-path-baseline.json` with an
expiry and replacement plan. New code should prefer streaming, pagination,
async store boundaries, cached snapshots, or worker isolation instead of adding
exceptions.

## Boundedness Guard P0

Any cache, queue, log, snapshot, checkpoint, timeline, upload buffer,
transcript, session state, EventBus, WebSocket or SSE fanout, markdown cache,
ranking cache, or similar retained collection must declare a bytes, count, age,
or active-window limit plus cleanup ownership. The cleanup policy names how the
state is trimmed, expired, compacted, evicted, backpressured, paginated,
leased, or otherwise released.

Unbounded growth is a P0 closure blocker. New work fails validation when a
risk surface has no nearby boundedness declaration. Historical debt is allowed
only through `docs/boundedness-baseline.json`, with owner area, reason, limit
kind, current limit value, cleanup policy, reference, expiration date, and
release-blocking classification.

Examples that block closure include async queues without a maximum, caches
limited only by entry count when entry byte cost is unbounded, whole-payload
`Buffer.concat` or `Data` retention for large uploads, full transcripts kept in
UI state, and checkpoints that survive their active window without compaction.

## Resource Contract Closure

Registered runtime, UI, storage, stream, cache, queue, IPC, daemon, worker, and
long-running-agent surfaces are not complete until `resourceContract` records
startup, idle, memory, streaming, storage, hot-path, scale, and validation
behavior. Existing missing contracts are allowed only through
`docs/surface-resource-contract-baseline.json` with owner, reason, expiry, and
reentry condition.

## Idle Quiescence Contract P1

Every timer, poller, scheduler, watcher, health loop, reconnect loop, refresh
loop, telemetry loop, and diagnostic probe must declare why it exists and when
it sleeps in `docs/idle-quiescence.manifest.json`.

UI periodic work is visible-only: it starts when the surface is mounted or
visible, checks visibility when needed, and clears on unmount, close, or route
change. Diagnostics are explicit opt-in and must keep release behavior separate
from debug behavior. Reconnects, pollers, health checks, and refresh loops use
adaptive backoff, server-directed intervals, visibility gating, or bounded
request leases instead of fixed forever loops. Periodic work uses a shared or
aggregated scheduler where practical; dedicated timers need a protocol,
request, service-supervision, or UI-lifecycle rationale. Idle shutdown is the
default unless the loop is an active protocol heartbeat with a declared lease.

New unregistered periodic work is a P1 release-check failure. Existing
non-adaptive or dedicated loops may be carried only as expiring manifest debt
with owner area, evidence, target sleep behavior, and release-blocking status.

## Resource Dimensions

- **Speed**: startup, time to first interaction, latency, throughput, hitches,
  frame time, and user-visible responsiveness.
- **CPU**: sustained use, peaks, wakeups, polling loops, decode, indexing,
  compression, retry storms, and background work.
- **RAM**: RSS, footprint, leaks, retained histories, copies of large payloads,
  cache growth, and long-session memory slope.
- **GPU / Neural Engine**: render cost, animations, effects, canvas/WebView
  work, image/video processing, embeddings, and local inference.
- **Disk**: database growth, sidecars, logs, audit, indexes, snapshots, caches,
  local models, attachments, retention, cleanup, and export/migration space.
- **Network**: sync, mirrors, fetches, retries, payload size, fan-out, backoff,
  and provider or remote mesh traffic.
- **Battery and thermals**: sustained compute, wakeups, background inference,
  sensors, fans, and work that prevents the computer from resting.
- **Perceived lightness**: the shell, CLI, and agent surfaces should feel
  simple and responsive even when optional capabilities are powerful.

## Performance Debt

Performance debt is tracked when a surface knowingly ships with unbounded,
unmeasured, or heavy behavior. Each debt record needs the affected surface, the
resource dimension, current evidence, target behavior, owner, review date, and
whether it blocks release.

Debt is not permission to let the system drift heavier. Repeated regressions,
expired debt, or missing cleanup for critical surfaces should become release
blockers after the progressive enforcement phase.

## Enforcement Model

1. **Routing and classification**: accepted durable ADRs and governance changes
   that affect resource-sensitive surfaces include `Performance Impact`, or
   state why it is not applicable.
2. **Boundedness guard**: `scripts/boundedness-guard.mjs` blocks new obvious
   broad reads and requires cursor/window/batch/limit evidence or an expiring
   baseline entry.
3. **Approved budgets**: critical paths gain measured baselines and budgets
   only after evidence exists and the user approves the baseline where private
   machine evidence is required.
4. **Release pressure**: repeated regressions, expired debt, missing cleanup,
   or approved-budget violations become blocking checks for the affected lane.

Performance work still starts with reproduction and instrumentation before
optimization. Static reading can identify risk, but it does not prove a fix.

## Scale Lab Harness

`scripts/scale-lab.ts` is the governed synthetic scale harness for framework
growth risks. It runs against temporary `CLAW_HOME`, `CLAW_DATA_DIR`, database,
session, skill, attachment, runtime, search, and dense-data roots. It must not
read user data, send prompts, contact providers, use paid APIs, reveal secrets,
or mutate real services.

The sessions workload consumes the reusable `realistic-sessions-v1` generator
from `@clawjs/sessions`. That generator is deterministic and covers thousands
of conversations in its `large` profile, long chats, heavy Markdown, attachment
metadata, tool events, provider errors, recoverable corruption markers, dense
project distribution, and search-visible transcript/event text. The same corpus
is available through the sessions package API and `sessions seed-realistic` CLI
so tests, performance runs, and E2E setup use one hermetic source instead of
private transcripts.

The harness has three profiles:

- `smoke`: safe for fast and changed lanes.
- `medium`: safe for integration and release lanes after conservative disk
  preflight.
- `heavy`: blocked unless `CLAW_SCALE_LAB_HEAVY=1` is explicitly set.

Each run emits a JSON-compatible report with workload status, counts,
estimated and actual disk use, p95 or bounded-operation metrics, skipped or
external-pending lanes, lock state, and cleanup status. Temporary artifacts are
removed by default; `--keep` is the only supported way to preserve them for
debugging.

Scale Lab reports are measurement evidence for synthetic scale behavior. They
do not replace signed-host, physical-device, provider, or approved private UI
baseline evidence when those real boundaries are required.
