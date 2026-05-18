---
title: Interface Matrix
description: Compare ClawJS human, SDK, CLI, service API, MCP, Relay, and persistence surfaces side by side.
---

# Interface Matrix

This page is the canonical comparison between the main ways to use ClawJS:

- human UI surfaces such as Clawix
- the SDK in application code
- the `claw` CLI in a local shell
- service APIs for cross-process and cross-language clients
- MCP for model-native tools, resources, and prompts
- the Relay HTTP API for remote clients
- filesystem and SQLite persistence for durable portability

Use this page when you need to answer questions like:

- "Does this exist for humans and for programs?"
- "Does this exist in the UI, SDK, CLI, service API, MCP, Relay, or persistence?"
- "Do these surfaces use the same names?"
- "What is only available locally today?"
- "What does the Relay expose remotely, and what stays local-only?"
- "Is a missing surface required, optional, blocked, or not applicable?"

## Surfaces

| Surface | Primary entrypoint | Notes |
| --- | --- | --- |
| SDK | `@clawjs/claw` | Base runtime-facing surface. |
| Database package | `@clawjs/database` | Shared database service app, store, API client, auth, and realtime hub. |
| Audio package | `@clawjs/audio` | Shared audio asset store, transcript catalog, API client, and service app. |
| Agents package | `@clawjs/agents` + `@clawjs/core` Agents V1 | Filesystem-first identity plus canonical agent, assignment, grant, memory, budget, run, evaluation, incident, and blueprint contracts. |
| Integrations package | `@clawjs/integrations` | Connection watchers and routing for inbound channel messages. |
| Sessions package | `@clawjs/sessions` | Shared session mirror store, FTS search, and native runtime import adapters. |
| User model package | `@clawjs/user-model` | Shared user profile store, snapshots, and service app. |
| Runtime package | `@clawjs/runtime` | Shared runtime loops for distillation, nudges, and user-model refresh. |
| SDK workspace extension | `@clawjs/workspace` | Adds tasks, notes, people, inbox, events, search, and workspace index. |
| CLI | `claw ...` | Local shell surface shipped by `@clawjs/cli`. |
| Service API | HTTP/event/process routes | Cross-process, cross-language, native, web, and device contract. |
| MCP | MCP tools, resources, prompts | Model-native surface for LLM hosts. |
| Relay API | `relay/` HTTP `/v1` routes | Remote access and control plane that carries selected remote-safe APIs through the relay connector. |
| Persistence | Filesystem and SQLite | Durable portability contract, not the preferred action API. |

## Surface Contract

ClawJS now treats surface classification as a product contract, not as
an after-the-fact documentation exercise.

### Tiers

| Tier | Meaning |
| --- | --- |
| `SDK core` | Primary application-facing SDK surface. |
| `SDK advanced public` | Public but more specialized or infrastructure-oriented SDK surface. |
| `workspace extension public` | Namespaces added by `@clawjs/workspace`. |
| `CLI project/scaffolding` | Project creation and resource generation flows. |
| `CLI local/runtime ops` | Local operator workflows over the same SDK primitives. |
| `Service API contract` | HTTP, event, or process contract for local clients. |
| `MCP model surface` | Tools, resources, and prompts exposed to LLM hosts. |
| `Relay control plane` | Tenant, connector, pairing, auth, and admin routes. |
| `Relay data plane` | Remote workspace and project resource routes. |
| `adapter-specific` | Runtime-specific surfaces such as `claw.runtime.openclaw.*`. |

### Visibility Markers

| Marker | Meaning |
| --- | --- |
| `stable` | Normal public product surface. |
| `advanced` | Public but intentionally lower-level or more specialized. |
| `local-only` | Public in SDK or CLI, but not mirrored to Relay. |
| `remote-only` | Public only through Relay. |
| `internal` | Not part of the public contract. |

### Surface Parity Status

| Status | Meaning |
| --- | --- |
| `required` | Missing surface must be added before the capability is complete. |
| `optional` | Useful but not required for v1 completeness. |
| `local-only` | Valid locally and intentionally not exposed through Relay. |
| `remote-safe` | Valid to expose through Relay or another remote service API. |
| `blocked` | Blocked by security, physical dependency, provider limits, cost, or missing host support. |
| `pending` | Required closure work that has not yet reached route, policy, and test parity. |
| `not applicable` | The surface does not make sense for this capability. |

## Surface Parity Matrix

New stable capabilities must be classified in this expanded shape. Older
domain tables below remain the detailed inventory while they are migrated into
the full parity format.

| Capability family | Human UI | SDK | CLI | Service API | MCP | Relay | Persistence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Runtime and workspace setup | Clawix setup/status surfaces | `claw.runtime.*`, `claw.workspace.*` | `claw runtime ...`, `claw workspace ...` | local host/daemon APIs when a client cannot link the SDK | `required` for model-host setup and inspection tools | `remote-safe` subset for status/install/setup | `.claw/manifest.json`, desired/observed state |
| Sessions and chat | Clawix chat, history, composer, activity views | `claw.sessions.*` | `claw sessions ...` | sessions service routes | `required` for session resources and reply tools | `remote-safe` subset under `WS/sessions` | session store and transcript records |
| Documents and media | Clawix attachment, preview, drive, and generated asset views | `claw.documents.*`, `claw.image.*`, `claw.audio.*`, `claw.video.*` | `claw documents ...`, `claw image ...`, media commands | document/media service routes | `required` for resource reads and safe creation tools | `remote-safe` subset for uploads, downloads, and reads | blob store, metadata tables, share records |
| Apps and openable surfaces | Clawix Apps catalog and app surface | app/resource registry APIs | `claw apps list|upsert|delete` | `optional` local service contract | MCP resources for app/surface discovery | `local-only` until remote launch semantics are approved | framework workspace app records |
| Design resources | Clawix Design styles, templates, references, and editor | design/resource registry APIs | `claw design list|upsert` | `optional` local service contract | MCP resources for design assets | `local-only` unless explicitly synced | framework workspace design records |
| Skills and local library | Clawix skill/library selection and assignment UI | `claw.skills.*`, `claw.library.*` | `claw skills ...`, `claw library ...` | `optional` local service contract | MCP prompts/resources for model-host discovery | `local-only` unless explicitly synced | skill files, library records, assignments |
| Integrations and channels | Clawix connection status, approval, and QA state | `claw.channels.*`, provider namespaces | provider CLI groups where implemented | integration service APIs | MCP tools/resources for provider actions and state | `blocked` until provider action is remote-safe | connection records, fixtures, audit, QA matrices |
| Approvals, grants, and secrets | Host-owned approval and reveal UI | `claw.secrets.*`, policy/grant APIs | approval/grant/secret commands where safe | signed-host service contracts | `blocked` unless tool consent and secret leasing are explicit | `blocked` for sensitive material by default | encrypted vault sidecar, host audit, opaque references |
| Inspection, diagnostics, validation | Clawix diagnostics and QA result views | `claw.doctor.*`, registry APIs | `claw inspect`, `claw doctor`, `claw diagnostics` | health and diagnostics routes | MCP resources/tools for model-readable diagnostics | `remote-safe` health/status subset | registry manifests, logs, QA reports |
| Remote access, Gateway, and Sync | Clawix pairing, node, share, and sync status views | remote/sync contracts and manifests | `claw remote ...`, `claw sync ...`, `claw nodes ...`, `claw gateway ...` | Coordinator, Gateway, Connector, and Sync service contracts from [ADR 0022](./adr/0022-remote-gateway-sync-redesign.md) | MCP resources for route/conformance inspection | `remote-safe` when classified with route, policy, owner, and tests | sync manifests, changelogs, cursors, encrypted client cache |

MCP uses the Model Context Protocol roles defined by the upstream
specification: tools are model-invoked actions, resources expose context/data,
and prompts are user-invoked workflow templates. ClawJS MCP surfaces should be
adapters over SDK and service contracts, not parallel business logic.

## Naming Differences

The same product concept does not always use the same name across surfaces.

| Product concept | SDK name | CLI name | Relay API name |
| --- | --- | --- | --- |
| chat / session | `sessions` | `sessions` | `sessions` |
| message send / reply stream | `sessions.appendMessage()` and `streamAssistantReply*()` | `sessions stream` | `/sessions/:sessionId/messages`, `/reply`, `/stream` |
| file attachment | `documents` | `-` | `documents` |
| generated image asset | `image` | `image` | `images` |

## Comparison Matrix

`WS` below means:

```text
/v1/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId
```

The Relay also exposes equivalent project-scoped routes under:

```text
/v1/tenants/:tenantId/projects/:projectId/agents/:agentId
```

### Database

| Capability | Human UI | SDK | CLI | Service API | MCP | Relay | Persistence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Database service lifecycle | Clawix database/workbench status | `DatabaseApiClient` | `claw database serve|login` | database service app and auth routes | diagnostics resources only | `local-only` | host-local service paths and audit |
| Namespace and collection admin | Clawix database browser | `DatabaseApiClient` schema APIs | `claw database namespace|collection` | database schema routes | schema resources | `local-only` | framework schema registry |
| Record CRUD and query | Clawix database browser and workbench | `DatabaseApiClient` record APIs | `claw database record`, `claw db {collection} list|get|create|update|delete|schema|query` | database record/query routes | collection resources and safe query tools | `local-only` until remote data policy is approved | `core.sqlite` collection records |
| File, token, and backup policy | Clawix approval/status views | `DatabaseApiClient` scoped token/file APIs | `claw database token|file` | database token/file routes | diagnostics resources only | `blocked` for remote mutation without host policy | scoped token refs, backup/import/export metadata |

### Index Search

`index` is not a top-level CLI command in v1. The public contract is exposed
through `search`, `sessions index`, workspace index APIs, and inspection
surfaces.

| Capability | Human UI | SDK | CLI | Service API | MCP | Relay | Persistence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Workspace search | Clawix search UI | `workspace.search.query()` | `claw search query` | search/index service routes when hosted | search resources | `local-only` by default | workspace index records |
| Workspace index rebuild | Clawix index health and stale-state views | `workspace.workspaceIndex.rebuild()` | `claw search rebuild` | search update route when hosted | diagnostics resources | `blocked` until remote rebuild policy is approved | workspace index and embedding records |
| Session mirror indexing | Clawix session search and import status | `claw.sessions.*` plus sessions mirror APIs | `claw sessions index` | sessions import/index adapters | session resources | `remote-safe` for read-only session search subsets | sessions store and Codex read-only mirror metadata |
| External source mirror policy | Clawix external source status | registry and inspection APIs | `claw inspect storage|events|apis` | host-brokered watcher/index adapters | diagnostics resources | `blocked` for native watcher validation without signed host broker | read-only mirror/index policy records |

### Runtime, Workspace, and Config

| Capability | SDK | CLI | Relay API |
| --- | --- | --- | --- |
| Runtime status | `claw.runtime.status()` | `claw runtime status` | `POST /v1/admin/tenants/:tenantId/agents/:agentId/runtime/status` |
| Runtime install | `claw.runtime.install()` | `claw runtime install` | `POST /v1/admin/tenants/:tenantId/agents/:agentId/runtime/install` |
| Runtime uninstall | `claw.runtime.uninstall()` | `claw runtime uninstall` | `POST /v1/admin/tenants/:tenantId/agents/:agentId/runtime/uninstall` |
| Runtime repair | `claw.runtime.repair()` | `claw runtime repair` | `-` |
| Runtime setup workspace | `claw.runtime.setupWorkspace()` | `claw runtime setup-workspace` | `POST /v1/admin/tenants/:tenantId/agents/:agentId/runtime/setup` |
| Gateway status | `claw.runtime.gateway.status()` | `-` | `-` |
| Gateway start / stop / restart | `claw.runtime.gateway.start()`, `stop()`, `restart()` | `-` | `-` |
| Gateway raw call | `claw.runtime.gateway.call()` | `-` | `-` |
| Native OpenClaw sessions | `claw.runtime.openclaw.sessions.list()`, `preview()`, `resolve()` | `-` | `-` |
| Native OpenClaw chat | `claw.runtime.openclaw.chat.history()`, `send()`, `inject()`, `abort()` | `-` | `-` |
| Workspace init | `claw.workspace.init()` | `claw workspace init` | `-` |
| Workspace attach | `claw.workspace.attach()` | `claw workspace attach` | `-` |
| Workspace validate | `claw.workspace.validate()` | `claw workspace validate` | `-` |
| Workspace inspect | `claw.workspace.inspect()` | `claw workspace inspect` | `-` |
| Workspace discover | `-` | `claw workspace discover` | `-` |
| Workspace reset | `claw.workspace.previewReset()`, `reset()` | `claw workspace reset` | `-` |
| Workspace repair | `claw.workspace.repair()` | `claw workspace repair` | `-` |
| Workspace list | `-` | `-` | `GET /v1/tenants/:tenantId/agents/:agentId/workspaces` |
| Workspace status | `-` | `-` | `GET WS/status` |
| Shared browser status | `-` | `claw browser status --relay-url ...` | `GET WS/browser/session` |
| Shared browser ensure/share | `-` | `claw browser ensure`, `claw browser share` | `POST WS/browser/session` |
| Shared browser takeover | `-` | `-` | `POST WS/browser/control/acquire`, `POST WS/browser/control/release` |
| Shared browser navigate | `-` | `-` | `POST WS/browser/navigate` |
| Shared browser live stream | `-` | `-` | `GET /browser/events` |
| Admin create workspace | `-` | `-` | `POST /v1/admin/tenants/:tenantId/agents/:agentId/workspaces` |
| Admin delete workspace | `-` | `-` | `DELETE /v1/admin/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId` |
| Settings read | `claw.files.readSettingsValues()` | `-` | `GET /v1/admin/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/config` |
| Settings write | `claw.files.writeSettingsValues()` | `-` | `PUT /v1/admin/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/config` |
| Workspace file read | `claw.files.readWorkspaceFile()` | `claw files read` | `GET /v1/admin/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/workspace-files/:fileName` |
| Workspace file write | `claw.files.writeWorkspaceFile()` | `claw files write` | `PUT /v1/admin/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/workspace-files/:fileName` |
| File inspect / diff / sync | `claw.files.inspectWorkspaceFile()`, `diffBinding()`, `syncBinding()` | `claw files inspect`, `diff`, `sync` | `-` |

### Models, Providers, Auth, Scheduler, Memory, Skills, Channels

| Capability | SDK | CLI | Relay API |
| --- | --- | --- | --- |
| Auth status | `claw.auth.status()` | `claw auth status` | `GET WS/integrations/status` |
| Auth login | `claw.auth.login()` | `claw auth login` | `-` |
| Auth remove provider | `claw.auth.removeProvider()` | `claw auth remove` | `-` |
| Models list | `claw.models.list()` | `claw models list` | `-` |
| Default model get | `claw.models.getDefault()` | `claw models default` | `-` |
| Default model set | `claw.models.setDefault()` | `claw models set-default` | `-` |
| Providers list | `claw.providers.list()` | `claw providers list` | `-` |
| Providers catalog | `claw.providers.catalog()` | `claw providers catalog` | `-` |
| Providers auth state | `claw.providers.authState()` | `claw providers auth-state` | `-` |
| Provider routing set / list / delete | framework provider routing config | `claw providers routing list|set|delete` | `-` |
| Provider enabled settings | framework provider settings config | `claw providers settings list|set` | `-` |
| IoT homes / things / state | `claw.iot.inventory.*`, `claw.iot.state.get()` | `claw iot homes|things|state ...` | `GET /v1/tenants/:tenantId/homes...` |
| IoT semantic actions | `claw.iot.actions.run()`, `lights.off()`, `climate.set()` | `claw iot lights ...`, `claw iot climate ...` | `POST /v1/tenants/:tenantId/homes/:homeId/actions` |
| IoT scenes / automations / approvals | `claw.iot.scenes.*`, `claw.iot.automations.*`, `claw.iot.policies.*` | `claw iot scenes ...`, `automations ...`, `approvals ...` | `GET/POST /v1/tenants/:tenantId/homes/:homeId/...` |
| Content brands / destinations / campaigns | `claw.content.brands.*`, `claw.content.destinations.*`, `claw.content.campaigns.*` | `claw content brand ...`, `destination ...`, `campaign ...` | `GET/POST WS/content/brands`, `GET/POST WS/content/destinations`, `GET/POST WS/content/campaigns` |
| Content entries / variants / assets | `claw.content.entries.*`, `claw.content.variants.*` | `claw content entry ...`, `variant ...` | `GET/POST WS/content/entries`, `PUT WS/content/entries/:entryId`, `POST WS/content/entries/:entryId/assets`, `POST WS/content/entries/:entryId/variants:generate`, `GET/POST WS/content/variants` |
| Content approvals / plans / publications | `claw.content.approvals.*`, `claw.content.publish.*` | `claw content approval ...`, `publish ...` | `GET/POST WS/content/approvals`, `POST WS/content/approvals/:approvalId/approve|reject|cancel`, `GET/POST WS/content/plans`, `POST WS/content/plans/:planId/run`, `GET WS/content/publications` |
| Content frontend contracts and read models | `claw.content.app.*`, `claw.content.calendar.view()` | `-` | `GET WS/content/app/*`, `GET WS/content/calendar` |
| Notify send / cancel | `claw.notify.send()`, `cancel()` | `claw notify send`, `cancel` | standalone Notify service routes |
| Notify feed / subscriptions | `claw.notify.feed()`, `subscriptions.*` | `claw notify subscriptions ...` | standalone Notify service routes |
| Time items list / get | `claw.time.list()`, `get()` | `claw time list`, `get` | `GET WS/time`, `GET WS/time/:id` |
| Time item create / update / delete | `claw.time.create()`, `update()`, `delete()` | `claw time create`, `update`, `delete` | `POST WS/time`, `PUT WS/time`, `DELETE WS/time` |
| Time item pause / resume / run | `claw.time.pause()`, `resume()`, `runNow()` | `claw time pause`, `resume`, `run` | `PUT WS/time` |
| Time executions / calendar / timeline | `claw.time.listExecutions()`, `calendarView()`, `timelineView()` | `claw time executions`, `calendar`, `timeline` | `GET WS/time/executions`, `GET WS/time/calendar`, `GET WS/time/timeline` |
| Natural scheduling sugar | `claw.time.create({ natural })` | `claw schedule at|every|after ...` | `POST WS/time` |
| Scheduler list | `claw.scheduler.list()` | `claw scheduler list` | `-` |
| Scheduler run / enable / disable | `claw.scheduler.run()`, `enable()`, `disable()` | `claw scheduler run`, `enable`, `disable` | `-` |
| Memory list | `claw.memory.list()` | `claw memory list` | `-` |
| Memory search | `claw.memory.search()` | `claw memory search` | `-` |
| Context prepare / inspect | `claw.context.*` | `claw context prepare|list|show|archive` | `-` |
| Commitments capture / track | `claw.commitments.*` | `claw commitments capture|add|list|show|fulfill|miss|cancel|link` | `-` |
| Learning capture / list / promote | `claw.learning.*` | `claw learning capture|add|list|show|evidence add|promote|archive` | `-` |
| Context prepare / inspect | `claw.context.*` | `claw context prepare|list|show|archive` | `-` |
| Commitments capture / outcome / link | `claw.commitments.*` | `claw commitments capture|add|list|show|fulfill|miss|cancel|link` | `-` |
| Judgment prepare / record / link | `claw.judgment.*` | `claw judgment prepare|record|list|show|link|archive` | `-` |
| Outcomes add / capture / link | `claw.outcomes.*` | `claw outcomes add|capture|list|show|link|archive` | `-` |
| Skills list | `claw.skills.listV2()` | `claw skills list` | `GET WS/skills/list` |
| Skills sync | `claw.skills.syncV2()` | `claw skills sync` | `-` |
| Skills sources | `claw.skills.sources()` | `claw skills sources` | `GET WS/skills/sources` |
| Skills search | `claw.skills.search()` | `claw skills search` | `GET WS/skills/search` |
| Skills install | `claw.skills.install()` | `claw skills install` | `-` |
| Local library list / inspect | `claw.library.list()`, `get()` | `claw library list`, `inspect` | `-` |
| Local library create / update / remove | `claw.library.create()`, `update()`, `remove()` | `claw library create`, `update`, `remove` | `-` |
| Local library import skill / bundle | `claw.library.importSkill()`, `createBundle()` | `claw library import-skill`, `create --kind bundle` | `-` |
| Local library assign / resolve / sync | `claw.library.assign()`, `resolve()`, `sync()` | `claw library assign`, `resolve`, `sync` | `-` |
| Channels list | `claw.channels.list()` | `claw channels list`, `claw channels status` | `GET WS/integrations/status` |

### Sessions, Inference, TTS, and Documents

| Capability | SDK | CLI | Relay API |
| --- | --- | --- | --- |
| Create session / session | `claw.sessions.createSession()` | `claw sessions create` | `POST WS/sessions` |
| List sessions / sessions | `claw.sessions.listSessions()` | `claw sessions list` | `GET WS/sessions` |
| Read session / session | `claw.sessions.getSession()` | `claw sessions read` | `GET WS/sessions/:sessionId` |
| Search sessions / sessions | `claw.sessions.searchSessions()` | `claw sessions search` | `GET WS/sessions:search` |
| Rename session | `claw.sessions.updateSessionTitle()` | `-` | `PATCH WS/sessions/:sessionId` |
| Append a message | `claw.sessions.appendMessage()` | `-` | `POST WS/sessions/:sessionId/messages` |
| Generate title | `claw.sessions.generateTitle()` | `claw sessions generate-title` | `POST WS/sessions/:sessionId/generate-title` |
| Stream assistant text | `claw.sessions.streamAssistantReply()` | `claw sessions stream` | `GET WS/sessions/:sessionId/stream`, `POST WS/sessions/:sessionId/stream` |
| Stream structured assistant events | `claw.sessions.streamAssistantReplyEvents()` | `claw sessions stream --events` | `GET WS/sessions/:sessionId/stream`, `POST WS/sessions/:sessionId/stream` |
| Direct text inference | `claw.inference.generateText()` | `claw inference generate-text` | `-` |
| TTS synthesize | `claw.tts.synthesize()` | `claw tts synthesize` | `-` |
| TTS config / providers / catalog | `claw.tts.config()`, `setConfig()`, `providers()`, `catalog()` | `claw tts config`, `set-config`, `providers`, `catalog` | `-` |
| Audio asset service | `@clawjs/audio` API client | `claw audio index|transcript|artifact list|get|delete`; `audio serve` | standalone Audio service routes |
| Apps catalog | app/resource registry APIs | `claw apps list|upsert|delete` | `-` |
| Design resource registry | design/resource registry APIs | `claw design list|upsert` | `-` |
| Non-stream reply helper | `-` | `-` | `POST WS/sessions/:sessionId/reply` |
| Clear all sessions | `-` | `-` | `POST /v1/admin/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/sessions/clear` |
| Delete one session | `-` | `-` | `-` |
| Update one message | `-` | `-` | `-` |
| Delete one message | `-` | `-` | `-` |
| List documents | `claw.documents.list()` | `claw documents list` | `GET WS/documents` |
| Get document metadata | `claw.documents.get()` | `claw documents read` | `GET WS/documents/:documentId` |
| Search documents | `claw.documents.search()` | `claw documents search` | `GET WS/documents:search` |
| Upload document | `claw.documents.upload()` | `claw documents upload` | `POST WS/documents/upload` |
| Register existing file path | `claw.documents.register()` | `claw documents register` | `POST WS/documents/register` |
| Chunked upload primitives | `claw.documents.beginUpload()`, `appendUploadChunk()`, `commitUpload()` | `-` | used internally by `POST WS/documents/upload` |
| Download document | `claw.documents.download()` | `claw documents download` | `GET WS/documents/:documentId/download` |
| Resolve document refs | `claw.documents.resolveRefs()` | `-` | indirect via session routes |
| Delete one document | `-` | `-` | `-` |

### Workspace Productivity

These methods come from the `@clawjs/workspace` extension, not from the base
`@clawjs/claw` instance.

| Capability | SDK | CLI | Relay API |
| --- | --- | --- | --- |
| Tasks list | `workspace.tasks.list()` | `claw tasks list` | `GET WS/tasks` |
| Tasks get | `workspace.tasks.get()` | `claw tasks get` | `-` |
| Tasks create | `workspace.tasks.create()` | `claw tasks create` | `POST WS/tasks` |
| Tasks update | `workspace.tasks.update()` | `claw tasks update` | `PUT WS/tasks` |
| Tasks complete | `workspace.tasks.complete()` | `claw tasks complete` | `-` |
| Tasks remove | `workspace.tasks.remove()` | `-` | `DELETE WS/tasks` |
| Tasks search | `workspace.tasks.search()` | `claw tasks search` | `-` |
| Notes list | `workspace.notes.list()` | `claw notes list` | `GET WS/notes` |
| Notes get | `workspace.notes.get()` | `claw notes get` | `-` |
| Notes create | `workspace.notes.create()` | `claw notes create` | `POST WS/notes` |
| Notes update | `workspace.notes.update()` | `claw notes update` | `PUT WS/notes` |
| Notes remove | `workspace.notes.remove()` | `-` | `DELETE WS/notes` |
| Notes search | `workspace.notes.search()` | `claw notes search` | `-` |
| People list | `workspace.people.list()` | `claw people list` | `GET WS/people` |
| People get | `workspace.people.get()` | `claw people get` | `-` |
| People upsert | `workspace.people.upsert()` | `claw people upsert` | `POST WS/people`, `PUT WS/people` |
| People search | `workspace.people.search()` | `claw people search` | `-` |
| Inbox list | `workspace.inbox.list()` | `claw inbox list` | `GET WS/inbox` |
| Inbox read thread | `workspace.inbox.readThread()` | `claw inbox read` | `PUT WS/inbox` when `read=true` |
| Inbox search | `workspace.inbox.search()` | `claw inbox search` | `-` |
| Inbox create draft | `workspace.inbox.createDraft()` | `claw inbox draft` | `POST WS/inbox` |
| Inbox archive | `workspace.inbox.archive()` | `claw inbox archive` | `DELETE WS/inbox` |
| Events list | `workspace.events.list()` | `claw events list` | `GET WS/events` |
| Events get | `workspace.events.get()` | `claw events get` | `-` |
| Events create | `workspace.events.create()` | `claw events create` | `POST WS/events` |
| Events update | `workspace.events.update()` | `claw events update` | `PUT WS/events` |
| Events remove | `workspace.events.remove()` | `-` | `DELETE WS/events` |
| Events search | `workspace.events.search()` | `claw events search` | `-` |
| Events temporal projection | `workspace.events.*` via configured `claw.time` | same commands | same routes, backed by `TemporalItem(kind=event)` when available |
| Workspace search | `workspace.search.query()` | `claw search query` | `-` |
| Workspace index rebuild | `workspace.workspaceIndex.rebuild()` | `claw search rebuild` | `-` |

### Media and Generations

| Capability | SDK | CLI | Relay API |
| --- | --- | --- | --- |
| Generic generations backends | `claw.generations.backends()` | `claw generations backends` | `-` |
| Generic generation create | `claw.generations.create()` | `claw generations create` | `-` |
| Generic generation list | `claw.generations.list()` | `claw generations list` | `-` |
| Generic generation read | `claw.generations.get()` | `claw generations read` | `-` |
| Generic generation delete | `claw.generations.remove()` | `claw generations delete` | `-` |
| Register command backend | `claw.generations.registerCommandBackend()` | `claw generations register-command` | `-` |
| Remove generation backend | `claw.generations.removeBackend()` | `claw generations remove-backend` | `-` |
| Persistent media list/search | `claw.media.list()` / `claw.media.search()` | `claw media list` / `claw media search` | `-` |
| Persistent media read/download | `claw.media.get()` / `claw.media.download()` | `claw media read` / `claw media download` | `-` |
| Persistent media shares | `claw.media.share.*` | `claw media share ...` | `-` |
| Image create | `claw.image.create()` / `claw.image.generate()` | `claw image create` / `claw image generate` | `POST WS/images` |
| Image edit | `claw.image.edit()` | `claw image edit` | `-` |
| Image import | `claw.image.import()` | `claw image import` | `-` |
| Image list | `claw.image.list()` | `claw image list` | `GET WS/images` |
| Image read | `claw.image.get()` | `claw image show` / `claw image read` | `GET WS/images/:imageId` |
| Image delete | `claw.image.remove()` | `claw image delete` | `DELETE WS/images/:imageId` |
| Audio catalog / transcript / generated records | `claw.audio.*` | `claw audio index|transcript|artifact list|get|delete` | `-` |
| Video generate / list / read / delete | `claw.video.*` | `claw video ...` | `-` |

### Channels and Local Integration Helpers

| Capability | SDK | CLI | Relay API |
| --- | --- | --- | --- |
| Telegram connect / status | `claw.telegram.connectBot()`, `status()` | `claw telegram connect`, `status` | `-` |
| Telegram webhook / polling / commands | `claw.telegram.configureWebhook()`, `disableWebhook()`, `startPolling()`, `stopPolling()`, `setCommands()`, `getCommands()` | `claw telegram webhook ...`, `polling ...`, `commands ...` | `-` |
| Telegram chats / inspect / send | `claw.telegram.listChats()`, `getChat()`, `sendMessage()`, `sendMedia()` | `claw telegram chats list`, `inspect`, `send` | `-` |
| Slack connect / status / send / list | `claw.slack.connectBot()`, `status()`, `sendMessage()`, `listChannels()`, `getChannel()` | `-` | `-` |
| WhatsApp connect / status / send / disconnect | `claw.whatsapp.connect()`, `status()`, `sendMessage()`, `disconnect()` | `-` | `-` |

### Relay Control Plane Only

These routes exist only on the Relay side. They are not mirrored into the
local CLI or the SDK instance surface.

| Capability | SDK | CLI | Relay API |
| --- | --- | --- | --- |
| Health | `-` | `-` | `GET /v1/health` |
| Relay auth login / refresh / logout | `-` | `-` | `POST /v1/auth/login`, `/refresh`, `/logout` |
| Current user devices | `-` | `-` | `GET /v1/me/devices` |
| Current user workspaces | `-` | `-` | `GET /v1/me/workspaces` |
| Device start / poll | `-` | `-` | `POST /v1/connectors/device/start`, `POST /v1/connectors/device/poll` |
| Pairing approve / deny | `-` | `-` | `POST /v1/pairings/:pairingId/approve`, `POST /v1/pairings/:pairingId/deny` |
| Connector enrollment exchange | `-` | `-` | `POST /v1/connector/enroll` |
| Connector websocket connect | `-` | `-` | `GET /v1/connector/connect` |
| Create connector enrollment | `-` | `-` | `POST /v1/admin/connectors/enrollments` |
| Revoke connector enrollment | `-` | `-` | `POST /v1/admin/connectors/:connectorId/revoke` |
| Tenant agents list | `-` | `-` | `GET /v1/tenants/:tenantId/agents` |
| Project list / create / get / update | `-` | `-` | `GET`, `POST`, `GET by id`, `PATCH` under `/v1/tenants/:tenantId/projects...` |
| Project-agent assignments | `-` | `-` | `POST`, `GET`, `DELETE` under `/v1/tenants/:tenantId/projects/:projectId/agents/:agentId...` |
| Reverse agent-project lookup | `-` | `-` | `GET /v1/tenants/:tenantId/agents/:agentId/projects` |
| IoT homes / state / actions | `-` | `-` | `GET /v1/tenants/:tenantId/homes`, `GET /v1/tenants/:tenantId/homes/:homeId/state`, `POST /v1/tenants/:tenantId/homes/:homeId/actions` |
| Workspace grants | `-` | `-` | `POST /v1/admin/tenants/:tenantId/workspace-grants` |
| Activity / usage telemetry | `-` | `-` | `GET WS/activity`, `GET WS/usage`, admin delete routes |

### Relay Resource Routes

The generic resource loop currently publishes:

- `tasks`, `notes`, `memory`, `inbox`, `people`, `events`
- `personas`, `plugins`, `routines`
- `images`

Each resource exists on both workspace-scoped `WS/...` routes and
project-scoped routes under `/v1/tenants/:tenantId/projects/:projectId/agents/:agentId/...`.
`WS/chat/feedback` is also a first-class public remote route.

## Practical Rule Of Thumb

Use:

- the SDK when you are writing application code inside Node.js
- the CLI when you are driving the same workspace locally from a terminal
- the Relay API when you need remote browser, mobile, or server clients to call a public HTTPS surface

The SDK is currently the broadest surface. The CLI mirrors a large subset
of it. The Relay API mirrors a narrower remote-safe subset focused on
sessions, documents, productivity entities, workspace status, and relay
control-plane concerns.
