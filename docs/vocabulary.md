# ClawJS vocabulary

This document is the human-readable companion to
`docs/vocabulary.registry.json`. The JSON registry is the machine-readable
source for checks; this Markdown file explains the terms agents should use.

## Session

Use `session` and `sessionId` for the canonical framework conversation identity
and lifecycle.

Allowed surfaces include sessions APIs, bridge protocol, CLI output, database
records, logs, and audit events.

Context-only word: `chat`. It is allowed in UI copy, UI-local code, external
provider APIs, and provider fixtures. It is not valid as a new stable framework
protocol or storage identity.

Examples:

- Correct: `sessionId`, `openSession`, `loadSessions`
- Incorrect: `chatId` as a framework session id, `openChat` as a protocol
  command

## Thread ID

Use `threadId` only for external runtime identifiers, provider metadata, or
reconciliation maps. Do not use it as the primary ClawJS session key.

## Host

Use `host` for the signed native owner of sensitive capabilities and
host-specific operational state. Sensitive native permissions, approvals,
grants, secrets, and destructive actions are host-owned, not Node-owned.

## Connector

Use `connector` for a user-configured bridge to an external account or service.
`integration` is the broader domain/package category.

## Capability

Use `capability` for a stable ability exposed through human and programmatic
surfaces. A stable capability needs registered surface evidence, not only a
feature name in UI or docs.
