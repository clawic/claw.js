# AGENTS.md

Compact operating entrypoint for humans and coding agents in this repository.
Use this file as a router. Do not turn it into a long procedure manual.

## Canon

- Highest authority: `CONSTITUTION.md`. Read it fully for major architecture,
  product, data, agent, UX, security, or integration decisions. For smaller
  changes, use the routed docs below and read only the relevant Constitution
  sections when a tradeoff touches a principle.
- Main router: `docs/decision-map.md`. It maps decision -> document ->
  validation, and should be the first public document agents use to choose the
  right source of truth.
- Discovery contract: `docs/adr/0017-discoverability-and-meta-code-routing.md`,
  `docs/discoverability.md`, and `docs/discoverability.registry.json`. New durable ADRs, skills,
  guardrails, harnesses, docs routers, and route work must be reachable from
  `AGENTS.md`/`CLAUDE.md`, the relevant skill, and `claw search`/`claw inspect`
  within two hops, or be recorded as expiring baseline debt.
- Claude Code shim: `CLAUDE.md` must point back here and to the same canonical
  docs. If `CLAUDE.md` and this file diverge, this file wins.
- Public docs are product surface. Update docs, examples, generated manifests,
  and tests with behavior changes.

Read the relevant canonical docs before changing their surfaces:

- Framework and host ownership: `docs/host-ownership.md`,
  `docs/adr/0001-claw-framework-host-boundary.md`
- Storage and data placement: `docs/data-storage-boundary.md`
- Governance identity, scopes, workspaces, projects, and project folder
  manifests: `docs/adr/0027-governance-identity-scope-model.md`,
  `docs/adr/0028-workspace-project-folder-manifest.md`,
  `docs/workspace.md`
- Naming and stable surfaces: `docs/naming-style-guide.md`,
  `docs/agentic-naming-guide.md`, `docs/vocabulary.md`,
  `docs/adr/0001-naming-and-stability-surfaces.md`,
  `docs/adr/0013-agentic-naming-and-code-structure.md`
- Source file boundaries: `docs/adr/0003-source-file-boundaries.md`
- Code hygiene and dead-code cleanup: `docs/adr/0016-code-hygiene-program.md`,
  `docs/code-hygiene-decisions.json`
- Built-in collections and schemas: `docs/canonical-data-catalog.md`,
  `docs/adr/0005-canonical-data-catalog.md`
- Testing and validation: `docs/adr/0002-testing-architecture.md`,
  `docs/adr/0006-integration-qa-lab.md`, `tests/e2e/README.md`
- Stable surfaces and inspection: `docs/adr/0004-persistent-surface-registry-and-inspection.md`,
  `docs/adr/0009-dual-human-programmatic-surfaces.md`,
  `docs/adr/0012-surface-route-graph.md`
- Remote access, Gateway, Connector, Sync, Iroh, and node trust:
  `docs/relay.md`, `docs/interface-matrix.md`,
  `docs/adr/0022-remote-gateway-sync-redesign.md`
- CLI and agent discovery: `docs/adr/0007-cli-agent-interface.md`,
  `docs/adr/0010-cli-jit-guidance-actor-assertions-resource-registry.md`,
  `docs/adr/0017-discoverability-and-meta-code-routing.md`
- Progressive modularity and zero-surprise install:
  `docs/adr/0031-progressive-modularity-and-zero-surprise-install.md`
- Open standard, official trust, forks, and compatibility:
  `docs/adr/0033-open-standard-official-trust.md`,
  `docs/official-trust-and-compatibility.md`, `FORKS.md`,
  `TRADEMARKS.md`, `NOTICE`
- Security and releases: `SECURITY.md`, `RELEASING.md`, `docs/git-workflow.md`
- OpenClaw host-dependent debugging: `agents/wiki/openclaw.md`

## Repository Shape

ClawJS is the framework and public agent surface: contracts, schemas,
fixtures, canonical storage, domain APIs, the public `claw` CLI, SDK, services,
MCP, Relay, skills, and reusable agent assets. Clawix is the sister native
human interface and embedded signed host.

Important areas:

- `packages/`: published packages and scaffolding tools.
- `runtime/`, `relay/`, `database/`, `sessions/`, `memory/`, `secrets/`,
  `audio/`, `time/`, `notify/`, `drive/`, `content/`, `iot/`, `wiki/`,
  `execution/`, `delegation/`, `publishing/`, `mcp/`, `monitor/`: horizontal
  Agent OS systems.
- `modules/`: optional domain capability packs.
- `integrations/`: provider and channel integrations.
- `examples/`, `website/`, `docs/`, `tests/e2e/`, `scripts/`: examples,
  documentation, E2E coverage, and repository automation.
- `skills/`: just-in-time agent workflows. Keep procedures here rather than in
  always-on instructions when a task has clear triggers and steps.

## Agent Discovery

For non-trivial questions or plans about framework behavior, contracts,
storage, CLI, schemas, permissions, grants, approvals, audit, data placement,
naming, package surfaces, routes, ports, protocols, or Clawix integration,
start with a `claw` discovery pass when the CLI is available:

```bash
claw search <topic> --json
claw inspect commands|why|database|schemas|storage|codebase --json
claw collections list --json
claw collections <collection> schema --json
claw db <collection> list|query --json
```

Treat source files as evidence after the CLI/registry map. If `claw` is not
available in the environment, say so and use direct docs/source reads.

Before asking a technical question, check the relevant canon. If asking is
still needed, explain the meaning, consequences, tradeoffs, and recommended
default.

## Skills

Use the smallest durable mechanism:

- `AGENTS.md`: always-on routing, safety rules, and red lines.
- Docs/playbooks: durable reference and workflows that humans also read.
- `skills/<id>/SKILL.md`: task procedures loaded just in time.
- Local/private overlays: maintainer-specific paths, launchers, signing, and
  personal automation. Do not publish those details here.

Shared ClawJS/Clawix architecture skills live in `skills/` and are projected
into Clawix for agents that only open that repository. Required workflow skills
include:

- Constitution and ADR alignment: `constitution-drift-audit`,
  `architecture-drift-repair`, `adr-to-guardrail`,
  `decision-map-maintenance`
- Stable surfaces: `naming-surface-audit`, `surface-registry-alignment`,
  `surface-route-work`, `cli-agent-surface-work`,
  `source-file-boundary-refactor`, `progressive-modularity-review`
- Data and storage: `canonical-catalog-expansion`,
  `data-storage-boundary-review`
- Host, security, and validation: `host-boundary-review`,
  `mac-control-plane-work`, `secrets-boundary-review`, `integration-qa-lab`,
  `host-dependent-validation`, `performance-investigation`
- Collaboration hygiene: `public-hygiene-review`, `docs-alignment-update`,
  `code-review-risk`, `commit-hygiene-public`, `code-hygiene-audit`,
  `code-hygiene-cleanup`

Design artifact skills also live under `skills/`: `style-extract`,
`style-apply`, `template-render`, `brand-guidelines`, `theme-factory`,
`canvas-design`.

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
  `tenantId` authority fields; `tenant` is technical isolation only and
  `companyId` is business data only.
- Workspaces are isolated contexts. Projects are collaborable scopes with
  stable ids and mutable folder locators. Full `.claw/` directories belong to
  workspace roots; project primary folders carry `claw.project.json`, managed
  `AGENTS.md`, and `CLAUDE.md` shims.
- User-facing structured framework records belong in `core.sqlite`; sidecars
  require explicit technical reasons such as churn, blobs, search indexes,
  sessions, logs, caches, or encrypted vault state.
- Plaintext secrets never live in the main database, logs, fixtures, public
  docs, screenshots, or generated artifacts.
- Sensitive native permissions, approvals, grants, audit, LaunchAgents, Mach
  services, and native execution belong to the active signed host, not Node.
- `~/.codex` is an external read-only source by default. Mirror or index it
  only; do not delete, move, overwrite, chmod broadly, or write into it without
  explicit reversible opt-in.
- Stable capabilities are complete only when their human and programmatic
  surfaces are registered or their gaps are explicitly classified.
- Runtime-critical work should start from `claw inspect show|neighbors|routes`
  and treat the registry edge/route graph as the source for connected surfaces.
- New hand-authored files at 1200+ lines need a split plan or baseline
  rationale; new 2000+ line files are blocked unless explicitly exempted.
  Emergency-debt files above 5000 lines must not grow except for extraction,
  deletion, or compatibility-preserving split work.
- Code hygiene is a recurring ClawJS + Clawix program. Clear mechanical dead
  code is removed after calibrated checks; public/canonical surfaces, enum
  states, Swift dynamic-use candidates, and duplicates are classified through
  the code hygiene baseline and report workflow.
- Installing the base `claw` CLI must be zero-surprise: no implicit host
  startup, OS permission prompt, app launch, model/browser download, provider
  network call, or niche domain activation. New capability and area work must
  route through progressive setup/modules state and ADR 0031.

## Validation

Use focused checks during iteration and broader lanes for closure:

```bash
npm test
npm run test:types
npm run test:ts
npm run build
npm run test:docs
npm run test:pack
npm run test:e2e
npm run ci
```

Validation safety:

- Hermetic tests are required but not sufficient for host-dependent bugs.
- Host-dependent paths include installation, OAuth/login, PATH/binary
  resolution, local home filesystem state, runtime polling, localhost behavior,
  and UI state driven by the local runtime.
- Do not send real prompts, touch production data, call paid APIs, mutate real
  services, or reveal secrets without explicit approval in the current thread.
- Prefer fixtures, dry-run paths, interceptors, local backends, and mocks.
- Mark missing physical/provider prerequisites as `EXTERNAL PENDING` and keep
  them separate from defects.
- Performance work starts with reproduction and instrumentation before
  optimization.

## Public Hygiene

Public repositories must not contain maintainer-private paths, signing
identities, bundle IDs, Team IDs, SKUs, release credentials, local launchers,
private automation, private Q&A indexes, logs, caches, or screenshots.

Run:

```bash
npm run privacy:check
npm run test:docs
```

Classify hygiene findings as `safe_public`, `false_positive`,
`needs_user_decision`, or `must_remove_before_publish`. Do not resolve
uncertainty by publishing the private value.

## Commits

Public commit hygiene only:

- Use Conventional Commits: `type(scope): description`.
- Keep commits scoped by intention.
- Do not sweep unrelated edits from a dirty tree.
- Commit `.changeset/*.md` with the behavior it documents when published
  package surface changes.
- Push, publish, upload, tagging, and release actions require explicit
  approval.

Maintainer-private commit automation, local history rewriting procedures,
ledger workflows, and personal push policy do not belong in this public repo.
