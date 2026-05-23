# ClawJS vocabulary

This document is the human-readable companion to
`docs/vocabulary.registry.json`. The JSON registry is the machine-readable
source for checks; this Markdown file explains the terms agents should use.

`scripts/conceptual-vocabulary-guard.mjs` enforces protected boundary words in
docs, UI copy, and public/stable surfaces. Existing ambiguous usage is frozen
in `docs/conceptual-vocabulary-baseline.json`; new or increased ambiguity must
be removed or deliberately rebaselined with rationale.

## Conceptual Boundary Words

The protected words are `owner`, `authority`, `tenant`, `workspace`, `project`,
`agent`, `surface`, `host`, `relay`, `connector`, and `sync`.

Use them only with their canonical meanings:

- `owner` is domain-specific lifecycle or legal vocabulary, not framework
  authority.
- `authority` comes from explicit grants, restrictions, scopes, and authority
  edges.
- `tenant` is technical provider/hosting isolation only.
- `workspace` is isolation; `project` is collaborable work scope.
- `agent` is an actor/principal or runtime role, not automatic authority.
- `surface` is a registered human or programmatic interface.
- `host` owns sensitive native capabilities; Relay and Node do not.
- `relay` brokers transport/routes, not authority.
- `connector` is the configured external account/service bridge.
- `sync` is replication or reconciliation, never an access grant.

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
grants, secrets, and destructive actions are host-owned, not owned by Node.

## Connector

Use `connector` for a user-configured bridge to an external account or service.
`integration` is the broader domain/package category.

## Capability

Use `capability` for a stable ability exposed through human and programmatic
surfaces. A stable capability needs registered surface evidence, not only a
feature name in UI or docs.
