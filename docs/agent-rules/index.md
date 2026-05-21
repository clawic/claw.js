---
title: Agent Rules
description: Compact ClawJS operating references for agents.
---

# Agent Rules

These pages keep always-loaded instructions short. `AGENTS.md` and `CLAUDE.md`
route here; this page routes to the durable canon, skills, and validation
lanes. Do not duplicate long ADR rationale here.

## Canonical Routes

- Constitution routing: [Constitution Operational Map](../constitution-map.md).
- Decision routing: [Decision Map](../decision-map.md).
- Decision tension rubric:
  [Decision Tension Rubric](../governance/decision-tension-rubric.md) for
  accepted durable ADRs and governance changes.
- Performance governance:
  [Performance Governance](../governance/performance-governance.md) and
  [ADR 0036](../adr/0036-performance-governance.md) for whole-computer
  resource impact across CPU, RAM, GPU/Neural Engine, disk, network, battery,
  thermals, idle behavior, growth, resource contracts, streaming/backpressure,
  launch/idle, high-churn UI boundaries, P1 event-loop hot-path checks through
  `scripts/hot-path-guard.mjs`, and Idle Quiescence Contract P1 through
  `scripts/idle-quiescence-check.mjs`. Performance reports separate
  hypotheses, static guard, compile/build, measurement taken, confirmed cause,
  probable cause, and discarded causes; no measurement means no performance
  validated closure.
- Problem-to-Guardrail loop:
  [ADR 0046](../adr/0046-problem-to-guardrail-loop.md) requires detected
  problems to close as `guard/test añadido`, `ADR/regla añadida`, or
  `deuda explícita con expiry`. Anti-loop rule: after `2 ciclos seguidos` of
  ADRs, ledgers, manifests, guards, or baselines `sin reducir blockers reales`,
  stop and classify the closure as `blocker directo`, `deuda lateral`, or
  `pendiente externo`; no más gobernanza para arreglar exceso de gobernanza.
- Adoption/canonicity governance:
  [Adoption And Canonicity Governance](../governance/adoption-canonicity.md)
  and [ADR 0041](../adr/0041-adoption-and-canonicity-governance.md) for
  `stable`, `canonical`, any-human, PMF, and adoption claims.
- Framework/host boundary: [Host Ownership](../host-ownership.md) and
  [ADR 0001](../adr/0001-claw-framework-host-boundary.md).
- Storage and data placement: [Data Storage Boundary](../data-storage-boundary.md).
- Naming and source shape: [Naming Style Guide](../naming-style-guide.md),
  [Agentic Naming Guide](../agentic-naming-guide.md),
  [Vocabulary](../vocabulary.md), [ADR 0001](../adr/0048-naming-and-stability-surfaces.md),
  and [ADR 0013](../adr/0013-agentic-naming-and-code-structure.md).
- Source file boundaries: [ADR 0003](../adr/0003-source-file-boundaries.md).
- Built-in collections: [Canonical Data Catalog](../canonical-data-catalog.md)
  and [ADR 0005](../adr/0005-canonical-data-catalog.md).
- Testing and integration QA: [ADR 0002](../adr/0002-testing-architecture.md),
  [ADR 0006](../adr/0006-integration-qa-lab.md), and `tests/e2e/README.md`.
- Stable surfaces: [ADR 0004](../adr/0004-persistent-surface-registry-and-inspection.md),
  [ADR 0009](../adr/0009-dual-human-programmatic-surfaces.md), and
  [ADR 0012](../adr/0049-surface-route-graph.md).
- Remote access: [Relay](../relay.md), [Interface Matrix](../interface-matrix.md),
  and [ADR 0022](../adr/0022-remote-gateway-sync-redesign.md).
- CLI and agent discovery: [ADR 0007](../adr/0007-cli-agent-interface.md),
  [ADR 0010](../adr/0010-cli-jit-guidance-actor-assertions-resource-registry.md),
  and [ADR 0017](../adr/0017-discoverability-and-meta-code-routing.md).
- Progressive install: [ADR 0031](../adr/0031-progressive-modularity-and-zero-surprise-install.md).
- Open trust: [ADR 0033](../adr/0033-open-standard-official-trust.md),
  [Official Trust And Compatibility](../official-trust-and-compatibility.md),
  `FORKS.md`, `TRADEMARKS.md`, and `NOTICE`.
- Security and release: `SECURITY.md`, `RELEASING.md`, and
  [Git Workflow](../git-workflow.md).
- Durable ADR/governance decisions:
  [ADR Template](../adr/TEMPLATE.md) and
  [Decision Tension Rubric](../governance/decision-tension-rubric.md).
- OpenClaw host-dependent debugging: `agents/wiki/openclaw.md`.

## Skill Routes

Use `skills/<id>/SKILL.md` instead of loading long procedures into prompts.

- Constitution and ADR alignment: `constitution-drift-audit`,
  `architecture-drift-repair`, `adr-to-guardrail`, `decision-map-maintenance`,
  `adoption-canonicity-review`.
- Stable surfaces: `naming-surface-audit`, `surface-registry-alignment`,
  `surface-route-work`, `cli-agent-surface-work`,
  `source-file-boundary-refactor`, `progressive-modularity-review`.
- Data and storage: `canonical-catalog-expansion`,
  `data-storage-boundary-review`.
- Host, security, and validation: `host-boundary-review`,
  `mac-control-plane-work`, `secrets-boundary-review`, `integration-qa-lab`,
  `host-dependent-validation`, `performance-investigation`.
- Collaboration hygiene: `public-hygiene-review`, `docs-alignment-update`,
  `code-review-risk`, `commit-hygiene-public`, `code-hygiene-audit`,
  `code-hygiene-cleanup`.
- Design artifacts: `style-extract`, `style-apply`, `template-render`,
  `brand-guidelines`, `theme-factory`, `canvas-design`.

Run `node ./scripts/skills-check.mjs` after adding or changing skills.

## Invariants

- `claw` is the single public CLI. Do not introduce new public `clawjs`,
  `clawix`, or `commander` command surfaces.
- `@clawjs/claw` is the official SDK; `@clawjs/node` is compatibility.
- MIT-licensed forks, commercial use, source builds, and compatible
  implementations are legitimate; `official` is reserved for upstream
  artifacts and channels, while truthful `compatible` claims must not imply
  endorsement.
- Framework global data belongs under `~/.claw/`; workspace framework data
  belongs under `.claw/`; `.clawjs/` is a retired pre-public path.
- Governance uses principals, entities, scopes, stewards, grants, authority
  edges, and restrictions. Do not add generic `ownerId`, `ownerKind`, or
  `tenantId` authority fields.
- Workspaces are isolated contexts. Projects are collaborable scopes with
  stable ids and mutable folder locators. Full `.claw/` directories belong to
  workspace roots; project primary folders carry `claw.project.json`, managed
  `AGENTS.md`, and `CLAUDE.md` shims.
- User-facing structured framework records belong in `core.sqlite`; sidecars
  require explicit technical reasons.
- Plaintext secrets never live in the main database, logs, fixtures, public
  docs, screenshots, or generated artifacts.
- Sensitive native permissions, approvals, grants, audit, LaunchAgents, Mach
  services, and native execution belong to the active signed host, not Node.
- Stable capabilities are complete only when their human and programmatic
  surfaces are registered or their gaps are explicitly classified; promotion to
  `stable` or `canonical` also requires an adoption/canonicity packet.
- New API, UI, CLI, schema, storage key, route, permission, and feature flag
  surfaces are incomplete without `surfaceNarrative` tying them to concept,
  authorizing decision, completing surface, and non-inference boundary.
- New runtime, UI, storage, stream, cache, queue, IPC, daemon, worker, and
  long-running-agent surfaces are incomplete without `resourceContract` for
  startup, idle, memory, streaming, storage, hot-path, scale, and validation
  behavior, unless they are pre-existing expiring baseline debt.
- Every problem detected by an agent or review closes with one durable output:
  `guard/test añadido`, `ADR/regla añadida`, or `deuda explícita con expiry`.
- If an agent adds `2 ciclos seguidos` of ADRs, ledgers, manifests, guards, or
  baselines `sin reducir blockers reales`, it must stop and close as
  `blocker directo`, `deuda lateral`, or `pendiente externo`.
- Runtime-critical work starts from `claw inspect show|neighbors|routes`.
- Performance-sensitive work classifies whole-computer resource impact before
  durable acceptance: speed, CPU, RAM, GPU/Neural Engine, disk, network,
  battery, thermals, idle behavior, growth, bounded retained state, hot-path
  cost, and sleep behavior for timers, pollers, schedulers, watchers,
  reconnects, refreshes, telemetry loops, and diagnostic probes.
- Installing the base `claw` CLI must be zero-surprise: no implicit host
  startup, OS permission prompt, app launch, model/browser download, provider
  network call, or niche domain activation.

## Validation Safety

- Hermetic tests are required but not sufficient for host-dependent bugs.
- Do not send real prompts, touch production data, call paid APIs, mutate real
  services, or reveal secrets without explicit approval in the current thread.
- Existing app conversations are read-only unless an approved validation
  session created them for that exact run.
- Prefer fixtures, dry-run paths, interceptors, local backends, and mocks.
- Mark missing physical/provider prerequisites as `EXTERNAL PENDING` and keep
  them separate from defects.
- Performance work starts with reproduction and instrumentation before
  optimization, and validated fixes compare resource behavior before and after.

## Public Hygiene And Commits

- Public repositories must not contain maintainer-private paths, signing
  identities, bundle IDs, Team IDs, SKUs, release credentials, local launchers,
  private automation, private Q&A indexes, logs, caches, or screenshots.
- Run `npm run privacy:check` and `npm run test:docs` before publication or
  broad review.
- Use Conventional Commits and keep commits scoped by intention.
- Commit `.changeset/*.md` with the behavior it documents when published
  package surface changes.
- Push, publish, upload, tagging, and release actions require explicit
  approval.

## More Specific Rule Pages

- [Workspace loop](./workspace-loop.md): tasks, notes, search, planning records.
- [Commands](./commands.md): CLI and SDK operating shortcuts.
- [Channels](./channels.md): Telegram/Codex and channel processors.
- [Secrets](./secrets.md): Secrets, secret references, brokered requests.
- [Runtime](./runtime.md): runtime status, auth, models, validation.
- [Rules, skills, library](./rules-skills-library.md): always-on rules vs reusable procedures.
- [Service surfaces](./service-surfaces.md): Relay, media, time, notify, content, IoT, database, ERP, drive, execution, delegation.
