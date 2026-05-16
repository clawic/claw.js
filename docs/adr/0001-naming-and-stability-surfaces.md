# ADR 0001: Naming and stability surfaces

Status: accepted
Date: 2026-05-13
Source conversation: internal 2026-05-13 surface audit

## Context

ClawJS and Clawix are still before broad public adoption, so incompatible
renames are allowed when they remove accidental public surface. Once users,
scripts, local data, apps, and integrations depend on names, those names become
migration contracts. This ADR freezes the naming decisions made during the
2026-05-13 surface audit.

This ADR is binding for framework public APIs, CLI, package names, local paths,
ports, protocol fields, database names, event names, docs, examples, templates,
and agent instructions. Do not add a new public name in these areas without
updating this ADR or adding a successor ADR.

## Frozen values summary

- Framework/product name: `ClawJS`.
- CLI/workspace brand: `claw`.
- Global ClawJS home: `~/.claw`.
- Clawix host/bridge home: `~/.clawix`.
- SQL tables and columns: `snake_case`.
- JSON/API/YAML/framework fields: `camelCase`.
- CLI commands and flags: `kebab-case`.
- Events use `domain.action`.
- Error codes use `snake_case`.
- `schemaVersion` versions persisted data.
- `protocolVersion` versions wire protocols.

## Product, roots, and workspace layout

- The framework/product name is `ClawJS`.
- The public framework CLI is `claw`.
- The canonical workspace directory is `<workspace>/.claw/`.
- The ClawJS global home is `~/.claw/` on every platform, overridable with
  `CLAW_HOME`.
- Human-authored global config lives at `~/.claw/config.yaml`.
- Generated persistent JSON state lives under `~/.claw/state/`.
- Persistent framework data lives under `~/.claw/data/`.
- Rebuildable framework cache lives under `~/.claw/cache/`.
- Framework operational logs live under `~/.claw/logs/`.
- Runtime sockets, PID files, and ephemeral locks live under `~/.claw/run/`.
- Temporary files live under `~/.claw/tmp/`.
- Framework skills live under `~/.claw/skills/`.
- Clawix host/bridge operational home is `~/.clawix/`, with the same
  `data/`, `state/`, `cache/`, `logs/`, `run/`, and `tmp/` semantics where
  applicable. Clawix app/native UI data may still use platform-native app data
  such as Application Support for GUI-only state.
- New workspace writes use this `.claw/` structure:
  - `.claw/manifest.json`
  - `.claw/state/desired/`
  - `.claw/state/observed/`
  - `.claw/projections/`
  - `.claw/sessions/`
  - `.claw/audit/`
  - `.claw/locks/`
  - `.claw/backups/`
  - `.claw/browser/`
- `.clawjs/` is not a new-write location. Because there are no public users to
  preserve, legacy `.clawjs/` compatibility is not a public requirement unless
  a later task explicitly asks for a migration path.
- The browser profile path is `.claw/browser/`, not `.claw-browser/profile`.
- The project manifest is `claw.project.json`.
- Root `SOUL.md` and `soul` terminology are intentionally preserved.

## Ports, hostnames, sockets, and routes

- Avoid `7777`, `7778`, and `7779` as permanent ports.
- Clawix host/dev/bridge owns `24080-24099`.
- ClawJS framework services own `24100-24199`.
- `24080` is the stable Clawix host/bridge entrypoint.
- Services bind to `127.0.0.1` by default. LAN binding is explicit and
  authorized only for bridge/mesh use cases.
- ClawJS core ports are fixed as:
  - `runtime`: `24100`
  - `sessions`: `24101`
  - `database`: `24102`
  - `secrets`: `24103`
  - `drive`: `24104`
  - `memory`: `24105`
  - `search`: `24106`
  - `mcp`: `24107`
  - `mesh`: `24108`
  - `notify`: `24109`
  - `signals`: `24110`
  - `publishing`: `24111`
  - `remote`: `24112`
  - `remoteStatus`: `24113`
  - `monitor`: `24114`
  - `24115-24119`: reserved for future core services
- ClawJS app/demo ports are fixed as:
  - `showcase`: `24120`
  - `agenda`: `24121`
  - `board`: `24122`
  - `channels`: `24123`
  - `notify`: `24124`
- `24150-24179` is reserved for integrations/channels.
- `24180-24199` is reserved for labs/dev-only surfaces.
- App hostnames use `<app>.claw.localhost`, for example
  `board.claw.localhost`.
- Technical services may use `<service>.claw.localhost` only when exposing UI.
- Clawix host sockets use `~/.clawix/run/clawix-bridge.sock`.
- ClawJS service sockets use `~/.claw/run/claw-<service>.sock`.
- Windows named pipes follow the same identity:
  `\\.\pipe\clawix-bridge` and `\\.\pipe\claw-<service>`.
- Public APIs live under `/v1/...`.
- Private app UI backends live under `/api/<app>/...`.
- The public WebSocket/SSE/event endpoint is `/v1/events`; `/ws` is not a
  public contract.
- Public HTTP paths use plural resources and `kebab-case`.
- Do not expose public abbreviations such as `/mp` or `/ws`.

## Domains, apps, packages, and CLIs

- The public ClawJS package scope is `@clawjs/*`.
- Every real monorepo package uses `@clawjs/<name>`, even when private.
- Unscoped package names are allowed only for scaffolding and idiomatic config:
  `create-claw-app`, `create-claw-agent`, `create-claw-server`,
  `create-claw-plugin`, and `eslint-config-claw`.
- Clawix-owned packages use `@clawix/*`, except the product/host CLI package
  and binary named `clawix`.
- Package names, package exports, and package bins are stable surfaces and must
  be registered before V1.
- Package directories under `packages/` use semantic names without a repeated
  `clawjs-` prefix, for example `packages/claw`, `packages/cli`,
  `packages/workspace`, `packages/core`, and `packages/marketplace`.
- `@clawjs/claw` is the main SDK package and exposes `createClaw()`.
- `@clawjs/cli` exposes the `claw` binary. Do not expose a public `clawjs`
  binary.
- `clawix` is the host/bridge CLI only. Its public scope is start/stop/restart,
  status, pair/unpair, doctor, logs, install app, and uninstall app.
- Domain/product/framework commands such as devices, automations, approvals,
  homes, areas, scenes, marketplace, and mesh belong in `claw`, not `clawix`.
- CLI commands and flags use `kebab-case`.
- JSON and API output uses `camelCase`.
- CLI aliases are minimal. Use only standard aliases such as `-h`, `-v`, and
  `--json`, plus explicitly approved public aliases.
- CLI exit codes use one shared table for `claw` and `clawix`: `0` success,
  `1` general error, `2` invalid use/flags, `64` command usage, `69` service
  unavailable, `70` internal failure, `75` temporary/retryable failure, and
  `77` permission/auth failure.
- The app/demo names are:
  - `company` becomes `board`.
  - `hub` becomes `channels`.
  - `day` becomes `agenda`.
  - `examples/showcase` becomes `showcase`.
  - `notify` remains `notify`.
- `signals` replaces `life` as the technical and public domain.
- Personal signal domains such as health, sleep, finance, journal, workouts,
  emotions, and similar categories are versioned catalog data under
  `@clawjs/signals`, not individual public packages in v1.
- `signals` is absorbed into `@clawjs/signals`.
- `badger` and the old public `content` surface become `publishing`.
- `content` is not a top-level public module name.
- `feed` is inbound/external source ingestion and timeline reading.
- `wiki` is internal knowledge base/documentation.
- `index` becomes `search`.
- `execution` becomes `jobs`.
- `bridge` in ClawJS becomes `remote`.
- `clawix-bridge` is reserved for the Clawix host bridge.
- `relay` is infrastructure for transport/fanout only, not the human app.
- The marketplace domain is `marketplace`, never public `mp`.
- Marketplace extensions use `@clawjs/marketplace-<domain>`.
- `home` is the public automation/home domain; `iot` is technical adapters and
  protocol implementation.
- `commander` is a retired legacy public name.
- Dev-only runtime codenames such as `zeroclaw`, `picoclaw`, `nanoclaw`,
  `ironclaw`, `nemoclaw`, and `nullclaw` are not public v1 surface.

## Data, databases, and identifiers

- SQL identifiers, table names, collection names, and exported SQL-like
  persistent names use `snake_case`.
- JSON, API, TypeScript, Swift, Kotlin, and C# contract fields use `camelCase`.
- Public human-editable IDs use lowercase ASCII `kebab-case`.
- JSON enum values use `snake_case`.
- Collection names stay `snake_case` because they are close to SQL tables.
- Do not use namespaced public IDs such as `agent.default.codex`; keep type,
  runtime, provider, and account in separate fields.
- ClawJS data root is `~/.claw/data/`.
- The main ClawJS database file is `core.sqlite`.
- Sidecar database names are service names, for example `sessions.sqlite`,
  `drive.sqlite`, `secrets.sqlite`, and `search.sqlite`.
- SQLite files use the `.sqlite` extension.
- Tables/collections owned by an app or module are prefixed by the public
  domain, for example `board_companies`, `board_agents`, `board_issues`,
  `channels_spaces`, `channels_messages`, and `signal_observations`.
- Unprefixed tables/collections are reserved for true core resources such as
  `projects`, `sessions`, and `audit_events`.
- `schemaVersion` is the canonical version field for persisted/exported data.
- `protocolVersion` is the version field for wire protocols.
- `appVersion` and `clawVersion` are metadata only, not migration selectors.
- General exports use `.clawexport`.
- Full restorable backups use `.clawbackup`.
- Encrypted secrets backups use `.clawsecrets`.
- Archive formats contain an internal `manifest.json`.
- Import/export/backup/snapshot formats that can be saved or imported must
  declare a versioned schema, registered extension/MIME when applicable, and
  fixtures.
- Caches that survive app restart are registered as rebuildable cache
  surfaces; scratch directories that are strictly process-temporary are not
  stable surfaces.

## Protocol, sessions, clients, and identity

- `sessionId` is the canonical framework/protocol name for agent
  conversations.
- `chat` is allowed only as visual/UI vocabulary in Clawix.
- `threadId` is reserved for external runtime IDs from systems such as Codex,
  OpenAI, Hermes, or OpenClaw.
- Bridge frame types use `session` language, not `chat` language, for example
  `openSession` and `sessionsSnapshot`.
- Frame and event JSON `type` values use `lowerCamelCase`.
- Stable error code values in CLI, APIs, and protocols use `snake_case`.
- Deep links use:
  - `clawix://auth/callback/<provider>`
  - `clawix://session/<sessionId>`
  - `clawix://settings/<section>`
- Pairing QR codes use a JSON payload with `v`, `host`, `port`, `token`,
  and related metadata; pair-token deep links are not stable v1 routes.
- `claw://` is reserved for future framework-level links.
- Client role is `clientKind`: `companion` or `desktop`.
- Diagnostic platform is a separate field: `ios`, `android`, `macos`, `linux`,
  `windows`, or `web`.
- Runtime and agent fields are `runtimeId` and `agentId`.
- Runtime IDs include `codex`, `openclaw`, `hermes`, and `opencode`; OpenCode
  and OpenClaw are distinct runtimes.
- `hostId` identifies the product host, for example `clawix`.
- `platform` identifies the host platform.
- `deviceId` identifies a physical or logical device.
- `installationId` identifies an app installation on a device.
- `clientId` identifies a registered/revocable client or connection.

## Environment, native identity, and provider mappings

- Framework env vars use `CLAW_*`.
- Clawix host/app env vars use `CLAWIX_*`.
- Clawix bridge env vars use `CLAWIX_BRIDGE_*`.
- Hybrid names such as `CLAWIX_CLAW_*` are not V1 surfaces.
- Bundle IDs, Team IDs, signing identities, SKUs, entitlements, Mach services,
  LaunchAgent labels, Bonjour services, socket names, and pipe names are stable
  native identity surfaces. Public repositories register placeholders or public
  service names only; real private values stay outside public repos.
- Third-party integrations register Claw-owned provider IDs, action IDs,
  callback paths, webhook mappings, and account keys. The registry does not
  copy full third-party schemas.

## Stable vocabulary

- `tasks` are human/productivity work.
- `jobs` are executable queued/runtime work units.
- `issues` are tickets inside `board`.
- `routines` are recurring personal/agent runs.
- `automations` are rules/events that trigger actions.
- `permissions` are static allowed capabilities.
- `policies` are evaluable rules.
- `approvals` are punctual human decisions.
- `grants` are issued permissions for an actor.
- `leases` are grants with expiration.
- `capabilities` are what a tool/runtime can technically do.
- `account` is account/auth identity.
- `user` is a human actor in product APIs.
- `profile` is editable user preference/data.
- `userModel` is inferred/generated personalization.
- `identity` is personal identity/values, not auth.
- `workspace` is the local/user data root.
- `project` is a work unit inside a workspace.
- `app` is an installable interface or experience.
- `host` is the native app that hosts/exposes Claw.
- `runtime` is the engine that runs agents.
- `app` means interface/experience.
- `module` means functional ClawJS domain.
- `integration` means external service connection.
- `plugin` means package extension.
- `skill` means agent-consumed instructions/capability.
- `connector` means provider adapter or credential link.
- `drive` is the public human surface for files and sharing.
- `storage` is technical blob/adapters only.
- `secrets` is the credential API.
- `vault` is encrypted secret UI/product surface only when needed.
- `monitor` observes health, uptime, and metrics.
- `notify` delivers notifications.
- `audit` records immutable actions.
- `alerts` is a resource, not a top-level module.
- `file` is a stored file object.
- `attachment` is a file attached to a message/session/task.
- `artifact` is an agent-generated output with its own lifecycle.
- `document` is an editable/renderable file type.
- `asset` is static app/branding material.
- `message` is a visible conversation unit.
- `turn` is a logical user/agent exchange.
- `event` is an auditable fact.
- `frame` is a WebSocket wire packet.
- `chunk` and `delta` are incremental content fragments.
- Persisted status values prefer `completed` over `done`.
- Timestamp fields use `createdAt`, `updatedAt`, `deletedAt`, `archivedAt`,
  `startedAt`, `endedAt`, and `expiresAt`.
- Calendar-day values use `date` or `<thing>Date`, for example `dueDate`.
- `archive` means hide while preserving history.
- `trash` means restorable deletion before purge.
- `delete` means irreversible deletion and must be explicit.
- `restore` reverses trash/archive when applicable.
- `priority` is attention order: `low`, `medium`, `high`, `urgent`.
- `severity` is objective impact: `info`, `warning`, `error`, `critical`.
- Runtime/test modes are:
  - `real`: authorized real services.
  - `dummy`: fake host/app mode for local development.
  - `mock`: programmatic test substitute.
  - `fixture`: static data.
  - `hermetic`: isolated test without network/external services.
  - `demo`: sample-data experience.
- Avoid public `fake` mode naming.

## Config and defaults

- Config precedence is: CLI flags > environment variables > workspace
  `.claw/config.yaml` > global `~/.claw/config.yaml` > defaults.
- Clawix uses the equivalent order with `CLAWIX_*` and host-private config.
- `claw.project.json` is the portable, versionable project identity manifest.
- `.claw/config.yaml` is local workspace preference/config and may be
  machine-specific.
- Model defaults use `defaultProviderId`, `defaultModelId`, and
  `defaultRuntimeId`.
- Agent overrides live under the agent identity with `providerId`, `modelId`,
  and `runtimeId`.
- Public framework environment variables use `CLAW_*`.
- Clawix host/app environment variables use `CLAWIX_*`.
- Service-specific framework variables use `CLAW_<SERVICE>_*`.
- `CLAWJS_*` is reserved for internal build/package details only.

## Domains and external names

- Public ClawJS domains are `clawjs.ai`, `docs.clawjs.ai`, and related
  `*.clawjs.ai` properties.
- `claw.dev` is not owned and must not be introduced as public surface.
- JSON Schema IDs use `https://schemas.clawjs.ai/v1/...`.
- Clawix public domains use `clawix.com`, `www.clawix.com`, and
  `pkg.clawix.com`.
- GitHub organization/repository references use `github.com/clawic/clawjs` and
  `github.com/clawic/clawix`.
- Public reverse-DNS examples derive from owned domains:
  - ClawJS: `ai.clawjs...`
  - Clawix: `com.clawix...`
- Public repos use `com.example...` only for fixtures/placeholders.
- Release builds must fail if real IDs are missing or still `com.example...`.
- The embedded JS global for framework WebViews is `window.claw`.

## Logs and audit

- Persistent operational logs use JSON Lines (`.jsonl`).
- Standard log fields are `timestamp`, `level`, `service`, `event`, `message`,
  `requestId`, `sessionId`, and `runtimeId`.
- Log levels are `trace`, `debug`, `info`, `warn`, `error`, and `fatal`.
- Console output may be human text.
- Audit records are append-only JSONL under `.claw/audit/` for workspace audit
  or `~/.claw/logs/audit/` for global operational audit.
- Minimal audit fields are `timestamp`, `event`, `actorId`, `actorKind`,
  `targetType`, `targetId`, `requestId`, `sessionId`, `outcome`, and
  `metadata`.
- Audit records may include `hash` and `previousHash` for integrity.
- Audit and telemetry event names use `domain.action` with `kebab-case`
  segments, for example `models.default-set`, `auth.login-started`, and
  `sessions.created`.

## Guardrails

Repository checks must block new public or stable uses of:

- `.clawjs` as a new-write path
- `claw.dev`
- public `CLAWJS_*`
- `CLAWIX_BRIDGED`
- `clawix-bridged`
- `badger`
- public `life`
- public personal-domain packages outside the `signals` catalog
- public `mp`
- public `/mesh` without `/v1`
- public `/ws`
- protocol-stable `chatId` and `openChat`

Tests must cover the registry of ports, sockets, hostnames, API route prefixes,
config precedence, schema IDs, package/bin surface, CLI help snapshots, and
negative cases for retired legacy names.

## Explicit non-goals

- Do not rename or remove `SOUL.md`.
- Do not redesign `knowledge`/`memory` naming in this ADR.
- Do not rename externally-owned skill sources such as `clawhub` or
  `skills.sh`.
- Do not add compatibility migrations solely for pre-public accidental names
  unless a later task explicitly asks for them.
