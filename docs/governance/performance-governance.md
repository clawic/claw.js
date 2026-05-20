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

## Default Design Rules

- Start lazily. Do not launch processes, initialize modules, open databases,
  build indexes, warm models, or start polling until a user, agent, route, or
  explicit module requires it.
- Stay bounded. Caches, logs, queues, snapshots, indexes, attachments, and
  model artifacts need size, age, or count limits plus cleanup ownership.
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
2. **Approved budgets**: critical paths gain measured baselines and budgets
   only after evidence exists and the user approves the baseline where private
   machine evidence is required.
3. **Release pressure**: repeated regressions, expired debt, missing cleanup,
   or approved-budget violations become blocking checks for the affected lane.

Performance work still starts with reproduction and instrumentation before
optimization. Static reading can identify risk, but it does not prove a fix.
