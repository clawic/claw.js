---
title: Interface Matrix
description: Compare the ClawJS SDK, CLI, and Relay API surfaces side by side.
---

# Interface Matrix

This page is the canonical comparison between the three main ways to use ClawJS:

- the SDK in application code
- the `claw` CLI in a local shell
- the Relay HTTP API for remote clients

Use this page when you need to answer questions like:

- "Does this exist in the SDK, the CLI, the Relay API, or all three?"
- "Do these surfaces use the same names?"
- "What is only available locally today?"
- "What does the Relay expose publicly, and what stays SDK-only?"

## Surfaces

| Surface | Primary entrypoint | Notes |
| --- | --- | --- |
| SDK | `@clawjs/claw` | Base runtime-facing surface. |
| Database package | `@clawjs/database` | Shared database service app, store, API client, auth, and realtime hub. |
| SDK workspace extension | `@clawjs/workspace` | Adds tasks, notes, people, inbox, events, search, and workspace index. |
| CLI | `claw ...` | Local shell surface shipped by `@clawjs/cli`. |
| Relay API | `relay/` HTTP `/v1` routes | Public remote API routed through the relay connector. |

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
| Shared browser live stream | `-` | `-` | `GET WS/browser/ws` |
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
| Learning capture / list / promote | `claw.learning.*` | `claw learning capture|add|list|show|evidence add|promote|archive` | `-` |
| Judgment prepare / record / link | `claw.judgment.*` | `claw judgment prepare|record|list|show|link|archive` | `-` |
| Skills list | `claw.skills.list()` | `claw skills list` | `GET WS/skills/list` |
| Skills sync | `claw.skills.sync()` | `claw skills sync` | `-` |
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
| Workspace search | `workspace.search.query()` | `claw workspace-search query` | `-` |
| Workspace index rebuild | `workspace.workspaceIndex.rebuild()` | `claw workspace-index rebuild` | `-` |

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
| Audio generate / list / read / delete | `claw.audio.*` | `claw audio ...` | `-` |
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
