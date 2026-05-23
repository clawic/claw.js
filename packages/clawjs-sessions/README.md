# @clawjs/sessions

Multi-agent session mirror with FTS5 search, native-storage adapters, and HTTP service for ClawJS.

## Sidecar model

`sessions.sqlite` is the fast local mirror for session headers, visible
messages, structured events, turn summaries, sidebar bootstrap, Search
projection, and deterministic memory-base extracts. External runtime transcript
files are read-only import sources; rebuilds mirror or reproject data into the
sidecar and must not write back to the external source tree.

Visible message text is preserved in `session_messages.content_text`.
Search uses separate redacted text (`session_messages.searchable_text`,
`fts_session_messages`, and redacted event summaries) so previews and FTS do
not need to index common credential patterns.

Sidebar, project-scoped session lists, transcript hydration, and turn-event
expansion are guarded as hot-path query contracts. Keep those reads
index-backed and bounded; `src/session-query-contract.test.ts` verifies the
expected SQLite plans and fails on temporary b-tree sorts in those paths.

`sessionRenderMatrix` is the public render contract for structured session
events. It maps every event kind to collapsed, active, expanded, everyday, and
coding disclosure states, with localization keys, payload caps, expansion
routes, outcomes, and fixtures. `src/render-matrix.test.ts` keeps the matrix
exhaustive and ensures unknown events render through a visible capped fallback.
Use `capSessionRenderPreview()` and `capSessionRenderDetailPayload()` to apply
those caps consistently without mutating the canonical stored payload.

## Realistic fixtures

`seedRealisticSessionsFixture(store, { profile: "large" })` in
`packages/clawjs-sessions/src/realistic-fixtures.ts` seeds synthetic
sessions into `sessions.sqlite` for performance, E2E, screenshots, and
regression work. The corpus includes long chats, attachment metadata, heavy
Markdown messages, tool events, provider-error turns, dense project lists, and
recoverable corruption markers. It contains fake data only and does not call
providers or require local attachment files.

Profiles are deterministic and reproducible:

| Profile | Default size | Intended lane |
| --- | ---: | --- |
| `smoke` | 12 sessions | unit, CLI, and E2E smoke tests |
| `large` | 2,000 sessions | regular performance and regression runs |
| `heavy` | 5,000 sessions | explicit opt-in stress runs |

The service CLI can materialize the same corpus:

```bash
sessions seed-realistic --db-path /tmp/sessions.sqlite --profile smoke
```

## Safety and legal

ClawJS is an assistive local-first framework. It may help with sensitive records, summaries, searches, and non-final drafts, but it does not replace regulated professionals, is not professional advice, and must not make final medical, mental health, legal, financial, insurance, employment, education, government, emergency, or physical-safety decisions. See [SAFETY.md](https://github.com/clawic/clawjs/blob/main/SAFETY.md) and [REGULATED_DOMAINS.md](https://github.com/clawic/clawjs/blob/main/REGULATED_DOMAINS.md).
