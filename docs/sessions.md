---
title: Sessions
description: Session storage, normalized stream events, and adapter-aware transport behavior.
---

# Sessions

Session data lives in `.claw/sessions/<session-id>.jsonl`. The store keeps session headers and message events in a line-delimited format, independent of the selected runtime adapter.

## Local Session Service Sidecar

The session service also maintains `sessions.sqlite` as the fast local mirror for
conversation history, sidebar bootstrap, structured events, turn summaries,
Search projection, and memory-base extraction. External runtime logs and
rollout/session files are treated as read-only import sources: the service may
mirror, index, and rebuild from them, but rebuilds must not modify the external
source tree.

The hot path is:

- `sessions` for chat headers, sidebar grouping, pinned state, project mapping,
  archive state, and timestamps.
- `session_messages` for visible transcript text.
- `session_messages.searchable_text` plus `fts_session_messages` for redacted
  local message search.
- `session_events` plus `fts_session_events` for structured tool, lifecycle,
  search, goal, compaction, patch, usage, and unknown events.
- `session_turn_summaries` for bounded turn-level UI and memory inputs.
- `session_projection_meta` for import/rebuild freshness and partial/failure
  state.
- `session_memory_extracts` for deterministic local memory-base summaries.
- `session_dynamic_tools` for replay/hydration of historical tool
  capabilities, with deferred schema loading.

Chat opening should use bounded hydration from the service instead of reading a
whole external transcript. A normal initial open requests a recent message
window, visible turn summaries, projection metadata, and no full event timeline
unless the caller explicitly expands events. Older history is loaded with
offset/limit windows.

The sidebar and transcript hot paths are query-plan contracts, not best-effort
optimizations. Initial sidebar reads must stay index-backed for active visible
sessions, project-scoped session lists, and pinned/recent ordering. Transcript
hydration must clamp caller-provided windows to the service maximum and page
through `session_messages` by `(session_id, timestamp)`. Turn expansion must
page through `session_events` by `(session_id, turn_id, timestamp, source_line)`.
`packages/clawjs-sessions/src/session-query-contract.test.ts` guards these
contracts with `EXPLAIN QUERY PLAN` checks and fails if a critical query starts
sorting through a temporary b-tree.

Searchable text is intentionally separate from visible transcript text. The
service preserves transcript `content_text` for display and reconstruction, but
indexes redacted message/event text for FTS and Root Search previews.

## Which Surface To Use

| Need | Use | Why |
| --- | --- | --- |
| Persist a conversation turn without generating a reply | `claw.sessions.appendMessage()` | Writes the normalized message and document refs to the workspace transcript. |
| Stream UI events with transport, retry, title, and error metadata | `claw.sessions.streamAssistantReplyEvents()` or `claw sessions stream --events` | Best for apps, logs, and agents that need deterministic observability. |
| Stream only assistant text chunks | `claw.sessions.streamAssistantReply()` or `claw sessions stream` | Best for simple terminal or text-only UI output. |
| Generate or refresh a title | `claw.sessions.generateTitle()` or `claw sessions generate-title` | Uses the same adapter-aware transport policy without sending a full product reply. |
| Attach files to chat | `claw.documents.upload()` or `register()`, then pass `message.documents` | Keeps blobs in the document store and transcripts lightweight. |
| Use native OpenClaw session keys or native chat history | `claw.runtime.openclaw.sessions.*` and `claw.runtime.openclaw.chat.*` | Keeps adapter-specific gateway semantics out of the generic session store. |

Default to `streamAssistantReplyEvents()` for product apps. It exposes
the same text as the raw stream and also tells you which transport was
used, whether fallback happened, and whether the title changed.

## Listing sessions

The Node API exposes:

- `claw.sessions.createSession(title?)`
- `claw.sessions.appendMessage(sessionId, message)`
- `claw.sessions.listSessions()`
- `claw.sessions.searchSessions({ query, strategy?, ... })`
- `claw.sessions.getSession(sessionId)`
- `claw.sessions.updateSessionTitle(sessionId, title)`
- `claw.sessions.generateTitle({ sessionId, transport? })`

Messages can now include `documents`, which are lightweight refs:

```ts
type DocumentRef = {
  documentId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  sha256?: string;
};
```

Use `claw.documents.upload()` or `claw.documents.register()` first, then attach the
returned refs to the message. ClawJS keeps the canonical blob in the workspace and
persists only document refs in `.claw/sessions/<session-id>.jsonl`.

CLI equivalents:

```bash
claw \
  --runtime hermes \
  sessions list \
  --workspace /path/to/workspace

claw \
  --runtime hermes \
  sessions read \
  --workspace /path/to/workspace \
  --session-id clawjs-123

claw \
  --runtime openclaw \
  sessions search \
  --workspace /path/to/workspace \
  --query "budget review" \
  --strategy auto \
  --json
```

`sessions list` returns summaries sorted by most recently updated session. Each summary includes `sessionId`, `title`, `createdAt`, `updatedAt`, `messageCount`, and `preview`.

`searchSessions()` supports:

- `strategy: "local"` for plain transcript text search over titles, previews, and stored messages
- `strategy: "openclaw-memory"` to delegate to `openclaw memory search --json` and map session hits back to local session summaries
- `strategy: "auto"` to prefer OpenClaw memory search on the `openclaw` adapter and fall back to local transcript search when needed

## Structured streaming

`streamAssistantReplyEvents` yields a structured event stream, and `streamAssistantReply` yields the raw chunks only.

The normalized event union is:

- `transport`
- `retry`
- `chunk`
- `done`
- `title`
- `error`
- `aborted`

Example:

```ts
for await (const event of claw.sessions.streamAssistantReplyEvents({
  sessionId: "clawjs-123",
  transport: "auto",
})) {
  if (event.type === "chunk") {
    process.stdout.write(event.chunk.delta);
  }
}
```

With the CLI, `sessions stream --events` emits newline-delimited JSON events. Without `--events`, the command streams assistant text directly.

```bash
claw \
  --runtime hermes \
  sessions stream \
  --workspace /path/to/workspace \
  --session-id clawjs-123 \
  --events
```

## Transport behavior

The session core is adapter-driven. An adapter can expose:

- CLI prompt transport
- HTTP transport
- SSE
- WebSocket
- hybrid gateway + CLI fallback

For `openclaw`, the default policy is capability-based:

- normal product chat goes through `/v1/responses`
- document refs are materialized into OpenAI-style `input_file` and
  `input_image` parts when the payload supports them
- `chat/completions` stays as a text-only fallback path for simple
  title-style flows
- native OpenClaw session and chat operations are exposed separately
  under `claw.runtime.openclaw`

If the preferred transport fails and the adapter supports fallback, ClawJS falls back automatically and emits a `transport` event.

That matters for consumers that want deterministic logs:

- watch `transport` to see whether gateway, SSE, WS, or CLI was used
- watch `retry` when a gateway/SSE/WS transport is retried
- watch `title` if you want the session title synchronized with the session

The transcript parser remains runtime-agnostic and can derive a title from the first meaningful user or assistant message when no explicit title is present.
