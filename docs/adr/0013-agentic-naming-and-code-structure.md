# ADR 0013: Agentic naming and code structure

Status: accepted

Date: 2026-05-15

## Context

ClawJS and Clawix already standardize stable public names such as database
fields, CLI commands, storage paths, and protocol fields. General source names
had looser rules: files, Markdown, JSON, classes, functions, helper types, and
module boundaries used mixed idioms. That raises the cost for coding agents:
they spend more context finding concepts, distinguishing synonyms, and
deciding whether an old word is legacy, UI copy, provider vocabulary, or a
canonical contract.

Agentic coding guidance from Codex and Claude Code points in the same
direction: keep always-on instructions short, route agents to specific docs,
make verification commands explicit, and use codebase maps or symbol-aware
navigation for large repositories. The AGENTS.md evaluation research also
warns that unnecessary always-loaded context can reduce task success and raise
inference cost. Therefore this ADR does not import broad human Clean Code
rules. It defines a narrower standard optimized for agent navigation,
predictable semantic renames, low context cost, and checks that do not
incentivize artificial line-count compression.

## Decision

ClawJS is the canonical source for shared vocabulary, naming rules, and
agentic source-structure policy. Clawix mirrors that policy and adds host/UI
exceptions.

The durable source set is:

- `docs/adr/0013-agentic-naming-and-code-structure.md`
- `docs/agentic-naming-guide.md`
- `docs/vocabulary.registry.json`
- `docs/vocabulary.md`
- `docs/naming-style-guide.md`
- `docs/adr/0003-source-file-boundaries.md`
- `scripts/naming-shape-check.mjs`
- `scripts/source-size-check.mjs`

`AGENTS.md` and `CLAUDE.md` remain routers. They may contain critical
guardrails and links, but not the full naming manual.

### Vocabulary

Shared terms live in `docs/vocabulary.registry.json` and render to
`docs/vocabulary.md`. Each record defines a preferred term, scope, definition,
allowed surfaces, forbidden or context-only synonyms, external exceptions, and
examples.

`session` / `sessionId` is the canonical framework conversation identity.
`threadId` is an external runtime identifier. `chat` is allowed for UI copy,
UI-local naming, and external provider APIs such as Telegram, Slack, Ollama, or
OpenAI-compatible chat routes. It is not a new stable product/protocol contract
unless a vocabulary exception records the context.

### Names

Use ecosystem idioms:

- TypeScript and JavaScript source files use `kebab-case`, with conventional
  config, declaration, test, and externally mandated exceptions.
- Swift, Kotlin, and C# source files use the language idiom, normally
  `PascalCase` for files containing primary types.
- Markdown docs and playbooks use `kebab-case`; root docs such as
  `README.md`, `AGENTS.md`, `CHANGELOG.md`, `SECURITY.md`, and
  `CONTRIBUTING.md` keep conventional names.
- JSON and YAML owned by this repo use role suffixes such as
  `.registry.json`, `.manifest.json`, `.fixture.json`, `.schema.json`, or
  `.baseline.json`; external conventions such as `package.json`,
  `tsconfig.json`, `claw.project.json`, and `openclaw.plugin.json` remain
  valid.
- Contract fields keep the existing matrix: `camelCase` for JSON/API/framework
  fields, `snake_case` for SQL and collections, `kebab-case` for CLI
  commands/flags, and `domain.action` for events.

Internal symbols are in scope. Types use domain + role, such as
`BridgeSessionStore` or `SecretsAuditWriter`. Functions use verb + object, such
as `loadSessions`, `renderMessageRow`, or `resolveBridgeStatus`. Booleans use
`is`, `has`, `can`, or `should`. Generic suffixes such as `Store`, `Service`,
`Controller`, `Renderer`, `Writer`, `Reader`, `Adapter`, and `Resolver` are
valid only when they describe a real role.

### Structure

Source files are responsibility-scoped. The objective is not a line-count game.
Large files are a signal because they often mix routing, state, protocol,
storage, UI, runtime effects, fixtures, and product behavior. Splits should
follow responsibility boundaries, not arbitrary line chunks.

Short comments are encouraged when they explain why, invariants, hidden
constraints, workarounds, or a brief module map. Comments that narrate the
current task or duplicate obvious code are not useful.

Barrel/index files are allowed for public surfaces and domain aggregators when
they expose a clear map. They must not hide behavior.

## Performance Impact

The naming and structure guards are static checks and documentation routes, not runtime work. They improve performance investigations indirectly by making hot paths, storage surfaces, and protocol names easier for agents to find without loading unrelated code. Any new module, watcher, service, or cache introduced while following these rules still needs its own impact classification.

## Decision Tensions

- **Prioritized axes**: agent usefulness, semantic coherence, source discoverability, vocabulary stability, and maintainability.
- **Constrained axes**: local stylistic freedom is constrained where it creates synonyms, hidden concepts, or misleading module boundaries.
- **Tradeoffs accepted**: contributors must use canonical names even when local provider or UI vocabulary differs; this is accepted to reduce context cost and future migration ambiguity.
- **Debt or pending evidence**: existing mixed vocabulary and source-shape debt remains tracked by guards and baselines until reclassified or removed.

## Guardrails

`scripts/naming-shape-check.mjs` audits vocabulary drift, file naming, JSON/YAML
role suffixes, Markdown names, and suspicious broad naming shapes. It produces
human-readable output by default and JSON with `--json`.

The check hard-blocks only critical drift: public or persistent contract naming
violations, forbidden vocabulary in critical surfaces, broken matrix names in
stable package/API/schema/route/env/db/CLI surfaces, and security/privacy name
drift. Export and internal-symbol issues are audited first and become blocking
only after a focused cleanup or ADR update makes them critical.

`scripts/source-size-check.mjs` reports responsibility and compression signals:
oversized files, pathological long lines, compressed enum/union/list patterns,
large export surfaces, baseline drift, and emergency-debt growth. It no longer
exists to force agents to squeeze code onto fewer lines.

## Consequences

Renames are expected. The project is pre-public, so accidental legacy names
should be corrected rather than preserved for compatibility unless a specific
task introduces a migration requirement.

Renames should proceed by compilable family. Prefer semantic or broad tooling,
codebase manifests, TypeScript compiler APIs, Swift tooling, and scoped scripts
over manual file-by-file edits. Rename symbols before filenames or routes when
possible. False positives stay with an explicit reason when the replacement is
not clearly better.

This ADR is mirrored in Clawix with host-specific consequences.
