# ClawJS naming style guide

This guide turns the naming ADR into day-to-day rules for contributors and
agents. Use it when adding or renaming code, docs, CLI commands, APIs, schemas,
database objects, files, directories, environment variables, package names,
services, logs, audit events, tests, examples, or fixtures.

If a public or persistent name is not covered here, stop and update
`docs/adr/0001-naming-and-stability-surfaces.md` before inventing it.
For files, Markdown, JSON/YAML role suffixes, internal classes/functions, source
shape, and agent-oriented rename workflow, also read
`docs/agentic-naming-guide.md`, `docs/vocabulary.md`, and
`docs/adr/0013-agentic-naming-and-code-structure.md`.

## General rules

- Prefer explicit, boring names over abbreviations.
- Do not introduce a second synonym for an existing stable concept.
- Name the product/framework `ClawJS`; name the public CLI `claw`.
- Do not expose public `clawjs`, `clawix`, `commander`, `mp`, or `badger`
  surfaces. `signals` is the approved public domain for signal data and
  catalog-backed personal, workspace, and device observations. `life` is only
  the approved CLI alias to the signals catalog.
- Treat package names, database names, table names, collection names, CLI
  commands, flags, routes, JSON fields, enum values, event names, env vars,
  sockets, service names, app IDs, hostnames, and deep links as stable
  interfaces.
- Protected conceptual boundary words are checked separately by
  `scripts/conceptual-vocabulary-guard.mjs`; do not use `owner`, `tenant`,
  `workspace`, `project`, `agent`, `surface`, `host`, `relay`, `connector`, or
  `sync` in docs, UI copy, or public interfaces outside their canonical
  meanings.
- Because this is still pre-public, remove accidental legacy names cleanly
  unless a task explicitly requires migration.

## Case and separator matrix

| Surface | Style | Examples |
| --- | --- | --- |
| TypeScript/JavaScript identifiers | `camelCase` for values/functions, `PascalCase` for types/classes | `defaultModelId`, `createClaw`, `BridgeClient` |
| Swift/Kotlin/C# contract fields | `camelCase` | `sessionId`, `createdAt` |
| JSON/API/YAML framework fields | `camelCase` | `defaultProviderId`, `schemaVersion` |
| CLI commands and flags | `kebab-case` | `claw set-default`, `--runtime-id` |
| Package names | `@clawjs/kebab-case` | `@clawjs/marketplace-real-estate` |
| Unscoped generators/configs | `kebab-case` | `create-claw-app`, `eslint-config-claw` |
| Directory names for packages/apps | `kebab-case`, semantic, no repeated `clawjs-` | `packages/cli`, `apps/board` |
| SQL tables/columns/indexes | `snake_case` | `board_issues`, `created_at` |
| Collections | `snake_case` | `channels_messages`, `signal_observations` |
| JSON enum values | `snake_case` | `in_progress`, `time_sensitive` |
| Error codes | `snake_case` | `inspect_not_found`, `usage_error` |
| Public human-editable IDs | lowercase ASCII `kebab-case` | `google-gemini`, `my-agent` |
| Event names | `domain.action`, kebab segments | `models.default-set`, `auth.login-started` |
| Env vars | uppercase snake with prefix | `CLAW_HOME`, `CLAW_RUNTIME_PORT` |
| Hostnames | `<name>.claw.localhost` | `board.claw.localhost` |
| HTTP paths | plural resources, `kebab-case` | `/v1/signal-observations` |
| File extensions | lowercase, semantic | `.sqlite`, `.clawbackup` |

JSON, API, YAML, and TypeScript framework fields use `camelCase`.
CLI commands and flags use `kebab-case`.
SQL tables, SQL columns, and collection names use `snake_case`.
Events use `domain.action`.

## Prefixes and namespaces

- Public framework env vars use `CLAW_*`.
- Clawix host/app env vars use `CLAWIX_*`.
- Clawix bridge env vars use `CLAWIX_BRIDGE_*`.
- Service framework env vars use `CLAW_<SERVICE>_*`.
- Do not introduce hybrid env vars such as `CLAWIX_CLAW_*`.
- `CLAWJS_*` is internal build/package metadata only.
- App/module-owned database objects carry a domain prefix:
  `board_*`, `channels_*`, `signal_*`, `publishing_*`.
- Core objects may be unprefixed only when they are truly global:
  `projects`, `sessions`, `audit_events`.
- Do not use namespaced IDs like `agent.default.codex`; use separate fields
  such as `agentId`, `runtimeId`, and `providerId`.

## Required stable words

Use these exact words:

- `sessionId` for framework conversation identity.
- `threadId` only for external runtime identity.
- `clientKind` for client role (`companion` or `desktop`) and `platform` for
  OS/platform.
- `hostId`, `deviceId`, `installationId`, and `clientId` as separate IDs.
- `runtimeId`, `agentId`, `providerId`, `modelId`, and `account`.
- `tasks`, `jobs`, `issues`, `routines`, and `automations` with the meanings
  defined in the ADR.
- `permissions`, `policies`, `approvals`, `grants`, `leases`, and
  `capabilities`.
- `file`, `attachment`, `artifact`, `document`, and `asset`.
- `message`, `turn`, `event`, `frame`, `chunk`, and `delta`.
- `workspace`, `project`, `app`, `host`, and `runtime`.
- `module`, `integration`, `plugin`, `skill`, and `connector`.
- `drive`, `storage`, `secrets`, and `vault` only with their ADR meanings.

Use `sessionId`, not stable `chatId`, in protocol contracts.
Pairing QR codes use a JSON payload with `v`, `host`, `port`, `token`, and
related metadata; pair-token deep links are not stable v1 routes.

## Governance words

Use the Principal + Entity model from
`docs/adr/0027-governance-identity-scope-model.md` for authority-sensitive
work.

- Use `principal` for actors that can receive authority.
- Use `entity` for real-world/domain objects such as companies, brands,
  families, departments, customers, assets, or provider objects.
- Use `scope`, `steward`, `grant`, `authorityEdge`, and `restriction` for
  governance.
- Do not add generic `ownerId`, `ownerKind`, or `tenantId` authority fields.
- Use `tenant` only for technical hosted/provider isolation, never as the public
  word for a person, company, workspace, project, or customer.
- Treat `companyId` as business data. It does not grant access without an
  explicit authority edge.
- Avoid bare `profile` for identity or authority. Prefer precise names such as
  `userProfile`, `domainProfile`, `providerProfile`, or `profileProjection`.

## Statuses, timestamps, and deletion

- Persist `completed`, not `done`.
- Use `in_progress`, `blocked`, `cancelled`, `archived`, `planned`, `active`,
  and `draft` where applicable.
- Use `*At` for instants: `createdAt`, `updatedAt`, `deletedAt`, `archivedAt`,
  `startedAt`, `endedAt`, `expiresAt`.
- Use `*Date` for calendar dates: `dueDate`, `startDate`.
- `archive` means hide while preserving history.
- `trash` means restorable deletion before purge.
- `delete` means irreversible deletion and must be explicit, usually
  `delete --force` in CLI.
- `restore` reverses trash/archive when applicable.

## Versions and files

- Persisted/exported data uses `schemaVersion`.
- Wire protocols use `protocolVersion`.
- Product metadata may use `appVersion` or `clawVersion`, but not for
  migration selection.
- The main database is `core.sqlite`.
- Sidecar databases are service names: `sessions.sqlite`, `drive.sqlite`,
  `secrets.sqlite`, `search.sqlite`.
- General exports use `.clawexport`.
- Full backups use `.clawbackup`.
- Encrypted secrets backups use `.clawsecrets`.
- Import/export/backup/snapshot files that can be saved or imported must have a
  registered file format, versioned schema, and fixtures.
- Restart-surviving caches are registered as `cache` surfaces with rebuildable
  lifecycle.

## Routes and protocols

- Public APIs live under `/v1/...`.
- Private UI APIs live under `/api/<app>/...`.
- Private `/api/<app>/...` routes are stable owned surfaces and must be
  registered like public `/v1/...` routes.
- Public event streaming lives at `/v1/events`.
- Do not introduce public `/ws`.
- Webhooks use `/v1/webhooks/<provider>/<event>`.
- OAuth callbacks use `/v1/integrations/<provider>/callback`.
- Bridge/protocol frames use `session` language, not `chat` language.
- Frame/event `type` strings use `lowerCamelCase`.

## Packages, apps, and domains

- Real packages use `@clawjs/<name>`.
- Private monorepo packages also use `@clawjs/<name>`.
- Clawix-owned packages use `@clawix/<name>`, except the product/host CLI
  package and binary `clawix`.
- Package directories under `packages/` are semantic and do not repeat
  `clawjs-`.
- Public app names are `showcase`, `agenda`, `board`, `channels`, and
  `notify`.
- Public domain names are `signals`, `search`, `jobs`, `remote`,
  `marketplace`, `home`, `publishing`, `feed`, `wiki`, `monitor`, and `notify`.
- The only public `life` name is the `claw life` alias to `signals`.
- `relay` is infrastructure only.
- `iot` is adapter/protocol implementation only.
- Personal signal categories are catalog data, not public packages.

## Native Identity And Providers

- Register bundle IDs, Team IDs, signing identities, SKUs, entitlements, Mach
  services, LaunchAgent labels, Bonjour services, sockets, and pipe names with
  public placeholders or public service names only.
- Real signing identities, Team IDs, release credentials, SKUs, and private
  bundle identifiers never enter public repositories.
- Provider integrations register Claw-owned provider IDs, action IDs, callback
  paths, webhook mappings, and account keys. Do not copy full third-party
  provider schemas into the registry.

## Logging and audit

- Persistent logs are JSONL.
- Log levels are `trace`, `debug`, `info`, `warn`, `error`, and `fatal`.
- Use log fields `timestamp`, `level`, `service`, `event`, `message`,
  `requestId`, `sessionId`, and `runtimeId`.
- Audit records are append-only JSONL.
- Audit fields are `timestamp`, `event`, `actorId`, `actorKind`,
  `targetType`, `targetId`, `requestId`, `sessionId`, `outcome`, and
  `metadata`, with optional `hash` and `previousHash`.

## Review checklist

Before submitting a change that adds or renames a stable surface:

- Check this guide and the naming ADR.
- Check that the same concept is not already named elsewhere.
- Add or update tests for public CLI help, package/bin surface, paths, ports,
  schemas, routes, or guardrails when applicable.
- Search for retired names and remove them from docs, examples, tests, and
  fixtures unless they are explicitly testing blocked legacy names.
- Keep ClawJS and Clawix docs aligned when the boundary crosses repositories.
