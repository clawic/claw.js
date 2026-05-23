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

Sidebar, quick switch, project-scoped session lists, transcript hydration, and
turn-event expansion are guarded as hot-path query contracts. Keep those reads
index-backed and bounded; `src/session-query-contract.test.ts` and
`src/quick-switcher.test.ts` verify the expected SQLite plans and fail on
temporary b-tree sorts in those paths.

`quickSwitchSessions()` and `/v1/sidebar/quick-switch` are intentionally
header-only. They search active visible session titles, cwd, branch,
project path, and runtime session ids, and return pinned/recent ordering without
touching message or event FTS tables. Deep transcript and structured-event
search must use `/v1/sessions/search` or `/v1/sessions/events/search`; those
FTS routes accept `limit` and `offset` so callers page through result sets
instead of treating search as an unbounded in-memory filter.

`sessionRenderMatrix` is the public render contract for structured session
events. It maps every event kind to collapsed, active, expanded, everyday, and
coding disclosure states, with localization keys, payload caps, expansion
routes, outcomes, and fixtures. `src/render-matrix.test.ts` keeps the matrix
exhaustive and ensures unknown events render through a visible capped fallback.
Use `capSessionRenderPreview()` and `capSessionRenderDetailPayload()` to apply
those caps consistently without mutating the canonical stored payload.

Session SSE publishes `SESSION_EVENTS_STREAMING_POLICY_ID` and includes the
effective policy id plus queue/frame limits in its metrics and overflow
diagnostics.

Assistant stream traces keep the final answer in message `contentText` and use
a capped timeline preview with truncation metadata, avoiding a second full
copy of large streamed text in event payloads.

Session dynamic tools are persisted with namespace, source, deferred schema
flag, and a SHA-256 hash of the canonical schema JSON. The store rejects an
explicit schema hash that does not match the schema payload, so reopened
sessions can reconstruct tool context without trusting stale capability
metadata.

`SessionsRuntimeJobStore.listBackgroundWork()` exposes a bounded sidebar/side
panel projection of queued, leased, and failed work, with an opt-in for resolved
jobs. It maps durable runtime jobs to active/awaiting/failed/done/cancelled UI
states without scanning runtime event or log tables.

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
