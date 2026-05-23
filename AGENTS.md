# AGENTS.md

Compact operating entrypoint for humans and coding agents in this repository.
Use this file as a router. Detailed operating rules live in
`docs/agent-rules/index.md`; durable decisions live in `docs/decision-map.md`.

## Authority

- Highest authority: `CONSTITUTION.md`. Read it fully for major architecture,
  product, data, agent, UX, security, or integration decisions.
- Constitution router: `docs/constitution-map.md` maps constitutional
  principles to operational canon, guardrails, and affected surfaces; it is not
  a second source of truth.
- Main router: `docs/decision-map.md`. It maps decision -> document ->
  validation and should be the first public document agents use to choose the
  right source of truth.
- Operating rules: `docs/agent-rules/index.md`. Keep always-loaded
  instructions short; move procedures and catalogs there or into skills.
- Discovery contract: `docs/adr/0017-discoverability-and-meta-code-routing.md`,
  `docs/discoverability.md`, and `docs/discoverability.registry.json`.
- `CLAUDE.md` is a shim. If it diverges from this file, this file wins.
- Public docs are product surface. Update docs, examples, generated manifests,
  and tests with behavior changes.

## Repository Shape

ClawJS is the framework and public agent surface: contracts, schemas, fixtures,
canonical storage, domain APIs, the public `claw` CLI, SDK, services, MCP,
Relay, skills, and reusable agent assets. Clawix is the sister native human
interface and embedded signed host.

Use the decision map for routing before changing ownership, storage, naming,
source boundaries, testing, catalog schemas, stable surfaces, remote access,
security, releases, open-standard trust, or OpenClaw debugging.

## Agent Discovery

For non-trivial framework, contract, storage, CLI, schema, permission, grant,
approval, audit, naming, package, route, port, protocol, or Clawix work, start
with a `claw` discovery pass when available:

```bash
claw search <topic> --json
claw inspect commands|why|database|schemas|storage|codebase --json
claw collections list --json
claw collections <collection> schema --json
claw db <collection> list|query --json
```

Treat source files as evidence after the CLI/registry map. If `claw` is not
available, say so and use direct docs/source reads.

Schema inspection is a blocking agent contract: keep
`npm run test:inspectability` green before adding routes, domains, or surfaces.

## Critical Routes

Read the relevant canon before changing its surface:

- Framework/host boundary: `docs/host-ownership.md`,
  `docs/adr/0001-claw-framework-host-boundary.md`
- Storage/data placement: `docs/data-storage-boundary.md`
- Naming/stability/source shape: `docs/naming-style-guide.md`,
  `docs/agentic-naming-guide.md`, `docs/vocabulary.md`,
  `docs/adr/0048-naming-and-stability-surfaces.md`,
  `docs/adr/0013-agentic-naming-and-code-structure.md`,
  `docs/adr/0003-source-file-boundaries.md`
- Built-in collections and schemas: `docs/canonical-data-catalog.md`,
  `docs/adr/0005-canonical-data-catalog.md`
- Stable surfaces and route graph: `docs/adr/0004-persistent-surface-registry-and-inspection.md`,
  `docs/adr/0009-dual-human-programmatic-surfaces.md`, `docs/adr/0049-surface-route-graph.md`
- Open standard and official trust:
  `docs/adr/0033-open-standard-official-trust.md`,
  `docs/official-trust-and-compatibility.md`, `FORKS.md`, `TRADEMARKS.md`

## Red Lines

- `claw` is the single public CLI. Do not introduce new public `clawjs`,
  `clawix`, or `commander` command surfaces.
- MIT-licensed forks, commercial use, source builds, and compatible
  implementations are legitimate; `official` is reserved for upstream
  artifacts and channels.
- Plaintext secrets never live in the main database, logs, fixtures, public
  docs, screenshots, or generated artifacts.
- Sensitive native permissions, approvals, grants, audit, LaunchAgents, Mach
  services, and native execution belong to the active signed host, not Node.
- Do not send real prompts, touch production data, call paid APIs, mutate real
  services, reveal secrets, push, publish, upload, or tag without explicit
  approval in the current thread.
- `~/.codex` is an external read-only source by default. Mirror or index it
  only; do not delete, move, overwrite, chmod broadly, or write into it without
  explicit reversible opt-in.
- Stable capabilities are complete only when their human and programmatic
  surfaces are registered or their gaps are explicitly classified.
- Runtime-critical work starts from `claw inspect show|neighbors|routes`.

## Skills And Validation

Use `skills/<id>/SKILL.md` for task procedures instead of expanding this file.
Required skill categories and detailed validation policy live in
`docs/agent-rules/index.md`.

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

## Public Hygiene And Commits

Public repositories must not contain maintainer-private paths, source session or
goal references, signing identities, bundle IDs, Team IDs, SKUs, release
credentials, release artifact directories, local launchers, private automation,
private Q&A indexes, personal references, logs, caches, or screenshots. Run `npm run privacy:check`
and `npm run test:docs` before publication or broad review.

Use Conventional Commits in English only, keep commits scoped by intention, and
include a body for every non-trivial commit explaining why the change exists,
what changed, and what validation was run or remains pending. Do not sweep
unrelated edits, commit changesets with the behavior they document, and never
push, publish, upload, or tag without explicit approval.
