# Agentic naming guide

This guide is the working version of ADR 0013. Use it when adding or renaming
files, docs, JSON/YAML, classes, functions, types, exported contracts, or
module boundaries.

## Operating model

- Start with `docs/vocabulary.md` before choosing a domain word.
- Start with `docs/naming-style-guide.md` before changing a stable surface.
- Use `scripts/naming-shape-check.mjs` for naming reports.
- Use `scripts/source-size-check.mjs` for responsibility and compression
  signals.
- Keep `AGENTS.md` and `CLAUDE.md` short. Add durable policy here or in ADRs.

## Vocabulary

Do not invent a second word for an existing concept. Add the term to
`docs/vocabulary.registry.json` first when a new framework concept is stable
enough to appear in contracts, docs, CLI, storage, protocol, APIs, or package
exports.

Use:

- `session` / `sessionId` for framework conversation identity.
- `threadId` only for external runtime identity.
- `message`, `turn`, `event`, `frame`, `chunk`, and `delta` with the meanings
  in the naming guide.
- `host`, `runtime`, `workspace`, `project`, `app`, `module`, `integration`,
  `plugin`, `skill`, and `connector` consistently.

`chat` is context-only. It is valid in UI copy, UI-local code, external
provider APIs, and provider fixtures. It is not valid as a new stable framework
conversation contract without a vocabulary exception.

## Files

| Surface | Rule | Examples |
| --- | --- | --- |
| TS/JS source | `kebab-case`, except conventional configs/tests/declarations | `session-store.ts`, `vite.config.ts`, `index.test.ts` |
| Swift/Kotlin/C# source | Language idiom, normally `PascalCase` | `BridgeSessionStore.swift` |
| Markdown docs/playbooks | `kebab-case` except conventional root docs | `agentic-naming-guide.md`, `README.md` |
| JSON/YAML owned by ClawJS | Role suffix | `vocabulary.registry.json`, `source-size-baseline.json` |
| External config | External convention | `package.json`, `tsconfig.json` |

Use source-adjacent Markdown names that match a public type only when that is
the clearest anchor for readers and agents.

## Symbols

Types use domain + role:

- `BridgeSessionStore`
- `SessionSnapshotReader`
- `SecretsAuditWriter`
- `TelegramTargetAdapter`

Functions use verb + object:

- `loadSessions`
- `renderMessageRow`
- `resolveBridgeStatus`
- `writeAuditEvent`

Booleans start with `is`, `has`, `can`, or `should`.

Names that deserve review:

- `Manager`, `Helper`, `Utils`, `Common`, `Data`, `Thing`, `Item`, `Info`
- opaque abbreviations outside a very local scope
- acronym drift such as `APIUrl` in TS/JS instead of `apiUrl`
- `chat`, `session`, and `thread` used outside their vocabulary scope
- files that mix routing, persistence, UI, fixtures, and runtime effects

Generic suffixes are allowed when the role is real. Do not rename a clear
`Store` or `Adapter` only to satisfy a style preference.

## Source shape

Split by responsibility. Prefer extracting a parser, registry, adapter, view
section, reducer, fixture factory, or command handler over moving arbitrary
line ranges.

Useful comments explain:

- why the code exists,
- invariants another agent must not break,
- external provider quirks,
- security/privacy constraints,
- brief module maps for aggregators.

Avoid comments that describe the current task, PR, or obvious assignments.

## Rename workflow

1. Identify the vocabulary/symbol family.
2. Rename symbols first with semantic tooling where available.
3. Rename filenames, routes, docs, and fixtures after imports still resolve.
4. Run the focused package or app validation for that family.
5. Search for the old term and record justified exceptions.

Do not use blind global replacement for `chat`, `thread`, `session`, `id`,
`manager`, or other broad words.
