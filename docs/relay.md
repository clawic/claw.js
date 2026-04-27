---
title: Relay
description: Public HTTPS relay and reverse connector for remote ClawJS runtime agents.
---

# Relay

`relay/` is a standalone Node.js service that gives remote clients a public HTTPS `/v1` API while the real ClawJS runtime stays behind a reverse WebSocket connector.

For the side-by-side SDK, CLI, and Relay comparison, use
[Interface Matrix](/interface-matrix).

Use it when you need:

- browser or mobile clients that cannot talk to a local runtime directly
- agents running behind NAT or inside a private network
- a narrow public API in front of remote workspaces
- centralized auth, tenant routing, and connector lifecycle control

The current v1 design is intentionally small:

- JWT access tokens plus revocable refresh tokens for API clients
- device-code pairing for remote connectors plus legacy enrollment tokens as fallback
- one active reverse connector session per `tenantId + connectorId`
- explicit routing by `tenantId`, `connectorId`, `agentId`, and `workspaceId`
- shared browser sessions per workspace backed by a persisted Chromium profile on the connector host
- human takeover with one controller at a time plus read-only viewers over the same live browser stream
- first-class `project + agent + assignment` routing on top of materialized workspaces
- fail-fast `503` responses when a connector is offline
- admin-only runtime, config, workspace-file, and enrollment APIs
- a small connector protocol with `hello`, `heartbeat`, `invoke`, `stream`, `result`, `error`, `event`, and `ack`

## Architecture

The relay separates public control-plane concerns from remote workspace execution:

1. A client authenticates against the relay over HTTPS.
2. A remote connector starts a device-code pairing session or uses a legacy enrollment token.
3. An authenticated relay user approves or denies that pairing.
4. The connector exchanges the approved device code for a connector credential.
5. The connector opens `/v1/connector/connect` over WebSocket and sends `hello`.
6. The relay records the connector, logical agent, advertised workspaces, and connection state.
7. Client API requests are routed to that active connector and answered synchronously.

The relay does not queue work for offline agents. If no active connector exists for the requested `tenantId + agentId`, the request fails immediately.

## Data Ownership

The relay persists control-plane metadata only:

- tenants
- users and memberships
- refresh tokens
- devices, workspace grants, connector pairings, connector enrollments, and connector credentials
- logical agents, projects, and project-agent assignments
- registered workspaces discovered from connector `hello` or created as assignments
- connector connection state
- relay-side activity and usage telemetry

The relay does not persist workspace source-of-truth data such as:

- session transcripts
- tasks, notes, people, inbox, or events
- runtime settings files
- remote agent workspace files

That state remains on the connector side under the selected workspace root.

## Product Model

The relay now distinguishes three layers:

- `project`: shared product or business context
- `agent`: reusable role definition and connector identity
- `assignment`: the concrete `projectId + agentId` runtime instance

Relay v2 also distinguishes:

- `device`: one authenticated mobile, web, or desktop client session
- `connector`: one reverse WebSocket runtime process behind NAT

The public product routes are project-scoped. The low-level workspace routes remain available for compatibility.

- `agent` in product terms is not the same thing as the runtime id used on disk or on the CLI
- each assignment derives its own `workspaceId` and `runtimeAgentId`
- the connector materializes that assignment into an isolated workspace under the connector workspace root

Current materialized layout:

```text
projects/<projectId>/base/
agents/<agentId>/template/
materialized/<projectId>/<agentId>/
```

The materialized workspace remains the execution target. A project is not a workspace alias.

## Identity and Routing Map

| Identifier | Owned by | Meaning |
| --- | --- | --- |
| `tenantId` | Relay control plane | Tenant boundary for users, connectors, projects, agents, and workspace grants. |
| `projectId` | Relay product model | Shared product or business context exposed through project-scoped routes. |
| `agentId` | Relay product model | Reusable logical agent role and connector identity. |
| `assignment` | Relay product model | Concrete `projectId + agentId` pairing that materializes into one runtime workspace. |
| `workspaceId` | ClawJS workspace model | Isolated workspace context used by SDK, CLI, and Relay workspace routes. |
| `runtimeAgentId` | Runtime adapter | Adapter-facing agent id written into the materialized workspace for runtime setup and sessions. |
| `connectorId` | Relay connector lifecycle | One reverse WebSocket process connected behind NAT for a tenant and logical agent. |

Worked request flow:

1. A client authenticates and calls a project-scoped route with
   `tenantId`, `projectId`, and `agentId`.
2. Relay resolves the project-agent assignment and its materialized
   `workspaceId` and `runtimeAgentId`.
3. Relay finds the active `connectorId` for the tenant and logical
   agent.
4. Relay forwards an `invoke` frame over `/v1/connector/connect`.
5. The connector executes the request against the materialized workspace
   on disk.
6. The runtime adapter uses `runtimeAgentId` for native runtime setup,
   status, and session behavior.
7. Relay returns the connector result to the original HTTPS client.

If no active connector matches the request, Relay fails fast with `503`.

## Quick Start

The relay is a separate app under `relay/`. It is not part of the root npm workspace bootstrap.

Install and build it:

```bash
npm --prefix relay ci
npm run build:relay
```

Start the server:

```bash
RELAY_JWT_SECRET=replace-me \
npm --prefix relay run start
```

Default server settings:

- host: `127.0.0.1`
- port: `4410`
- database: `relay/relay.sqlite`

For local development, the SQLite seed includes two demo accounts:

- admin: `admin@relay.local` / `relay-admin`
- user: `user@relay.local` / `relay-user`

Those seeded credentials are only for local development. The default JWT secret and seeded users are not production-safe.

## Connector Lifecycle

### 1. Login as admin

```bash
curl -s http://127.0.0.1:4410/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{
    "email": "admin@relay.local",
    "password": "relay-admin",
    "tenantId": "demo-tenant"
  }'
```

The response includes:

- `accessToken`
- `refreshToken`
- `expiresInSec`
- `tenantId`
- `role`
- `scopes`

### 2. Preferred connector pairing

The preferred bootstrap is device-code pairing:

1. The connector calls `POST /v1/connectors/device/start`
2. The relay returns `deviceCode`, `userCode`, `verificationUri`, and `verificationUriComplete`
3. A signed-in relay user opens the verification URI and approves the pairing
4. The connector polls `POST /v1/connectors/device/poll`
5. On approval the relay returns a connector credential scoped to one `tenantId + connectorId`

Legacy enrollment tokens still exist as an admin fallback.

### 3. Legacy connector enrollment

```bash
curl -s http://127.0.0.1:4410/v1/admin/connectors/enrollments \
  -H "authorization: Bearer <admin-access-token>" \
  -H 'content-type: application/json' \
  -d '{
    "tenantId": "demo-tenant",
    "agentId": "demo-agent",
    "description": "first relay connector"
  }'
```

This returns a one-time `enrollmentToken`.

### 4. Start the remote connector

```bash
RELAY_ENROLLMENT_TOKEN=<enrollment-token> \
npm --prefix relay run connector -- \
  --relay-url http://127.0.0.1:4410 \
  --agent-id demo-agent \
  --workspace-root ./relay-workspaces \
  --runtime-adapter codex \
  --runtime-binary-path /opt/homebrew/bin/codex
```

On startup the connector either:

1. completes the device-code pairing flow, or
2. POSTs `/v1/connector/enroll` in legacy mode

Then it:

1. receives a connector credential
2. opens `/v1/connector/connect`
3. sends a `hello` frame with `connectorId`, `agentId`, capabilities, and workspaces
4. keeps the socket alive with heartbeats every 10 seconds
5. reconnects in a loop after disconnection

### 5. Call a workspace route

```bash
curl -s http://127.0.0.1:4410/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/status \
  -H "authorization: Bearer <user-access-token>"
```

If the connector is online, the relay forwards `workspace.status` to it and returns the connector result. If it is offline, the relay returns `503`.

## Auth Model

Client auth is relay-local and independent from the remote runtime.

### Access tokens

- signed JWTs using `HS256`
- default TTL: `900` seconds
- include `tenantId`, `role`, `scopes`, and optional `agentId` and `workspaceId`

### Refresh tokens

- opaque relay-issued tokens stored hashed in SQLite
- revocable
- one-time on refresh: consuming a refresh token revokes it and returns a new pair
- default TTL: `30` days

### Connector credentials

- created only by consuming an enrollment token
- or by consuming an approved device-code pairing
- stored hashed in SQLite
- used only for `/v1/connector/connect`
- revocable
- scoped to a single `tenantId + connectorId`

### Scopes

The seeded non-admin user currently gets:

- `tenant:read`
- `agent:read`
- `workspace:read`
- `chat:read`
- `chat:write`
- `chat:stream`
- `workspace:data`

Admin-only routes require `admin:*`.

## API Surface

The public surface is grouped by concern.

### Health and auth

- `GET /v1/health`
- `POST /v1/auth/login`
- `POST /v1/auth/refresh`

### IoT home routes

When `RELAY_IOT_BASE_URL` is configured, Relay also exposes home-scoped IoT routes for remote operators:

- `GET /v1/tenants/:tenantId/homes`
- `GET /v1/tenants/:tenantId/homes/:homeId/areas`
- `GET /v1/tenants/:tenantId/homes/:homeId/things`
- `GET /v1/tenants/:tenantId/homes/:homeId/state`
- `POST /v1/tenants/:tenantId/homes/:homeId/actions`
- `GET /v1/tenants/:tenantId/homes/:homeId/scenes`
- `POST /v1/tenants/:tenantId/homes/:homeId/scenes/:sceneId/activate`
- `GET /v1/tenants/:tenantId/homes/:homeId/automations`
- `POST /v1/tenants/:tenantId/homes/:homeId/automations/:automationId/run`
- `GET /v1/tenants/:tenantId/homes/:homeId/approvals`
- `POST /v1/tenants/:tenantId/homes/:homeId/approvals/:approvalId/approve`
- `GET /v1/tenants/:tenantId/homes/:homeId/events/stream`

Workspace-scoped convenience routes also exist under `WS/iot/*` for agents that want the default home without switching surface.
- `POST /v1/auth/logout`

### Shared browser

Workspace-scoped browser routes now expose the connector-hosted shared Chromium session:

- `GET /v1/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/browser/session`
- `POST /v1/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/browser/session`
- `POST /v1/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/browser/control/acquire`
- `POST /v1/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/browser/control/release`
- `POST /v1/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/browser/navigate`
- `GET /v1/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/browser/ws`

The browser route family is Relay-first:

- the browser process lives on the connector host
- the relay streams frames and session state over the existing reverse-connector channel
- humans authenticate through Relay before they can join the shared session
- localhost previews stay inside the shared browser instead of exposing raw remote ports
- shared links should open the immersive browser route `/browser/:tenantId/:agentId/:workspaceId`, while the workspace browser tab remains the operator view inside Relay

### Connector setup

- `POST /v1/connectors/device/start`
- `POST /v1/connectors/device/poll`
- `POST /v1/pairings/:pairingId/approve`
- `POST /v1/pairings/:pairingId/deny`
- `POST /v1/connector/enroll`
- `GET /v1/connector/connect` as WebSocket
- `POST /v1/admin/connectors/enrollments`
- `POST /v1/admin/connectors/:connectorId/revoke`

### Current user

- `GET /v1/me/devices`
- `GET /v1/me/workspaces`

### Tenant and workspace discovery

- `GET /v1/tenants/:tenantId/agents`
- `GET /v1/tenants/:tenantId/projects`
- `POST /v1/tenants/:tenantId/projects`
- `GET /v1/tenants/:tenantId/projects/:projectId`
- `PATCH /v1/tenants/:tenantId/projects/:projectId`
- `GET /v1/tenants/:tenantId/projects/:projectId/agents`
- `GET /v1/tenants/:tenantId/agents/:agentId/projects`
- `POST /v1/tenants/:tenantId/projects/:projectId/agents/:agentId`
- `DELETE /v1/tenants/:tenantId/projects/:projectId/agents/:agentId`
- `GET /v1/tenants/:tenantId/agents/:agentId/workspaces`
- `GET /v1/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/status`

Project-scoped runtime routes mirror the workspace routes under:

```text
/v1/tenants/:tenantId/projects/:projectId/agents/:agentId/...
```

That includes:

- `GET /status`
- sessions and streaming routes under `/sessions`
- resource CRUD for `tasks`, `notes`, `memory`, `inbox`, `people`, `events`, `personas`, `plugins`, `routines`, and `images`
- `GET /integrations/status`
- `GET /skills/list`
- `GET /skills/search`
- `GET /skills/sources`
- `GET /activity`
- `GET /usage`

### Sessions

- `GET /sessions`
- `POST /sessions`
- `GET /sessions:search`
- `GET /sessions/:sessionId`
- `PATCH /sessions/:sessionId`
- `POST /sessions/:sessionId/messages`
- `POST /sessions/:sessionId/reply`
- `GET /sessions/:sessionId/stream`
- `POST /sessions/:sessionId/stream`
- `POST /sessions/:sessionId/generate-title`
- `POST /chat/feedback`

Note the exact search route: `sessions:search`. The current server does not expose `/sessions/search`.

`POST /sessions/:sessionId/messages`, `POST /sessions/:sessionId/reply`, and
`POST /sessions/:sessionId/stream` accept `documentIds` in the JSON payload. The
legacy `GET /sessions/:sessionId/stream` route remains text-only for compatibility.

### Documents

- `GET /documents`
- `GET /documents:search`
- `GET /documents/:documentId`
- `GET /documents/:documentId/download`
- `POST /documents/register`
- `POST /documents/upload`

Document routes exist under both workspace-scoped and project-scoped prefixes. The
relay streams upload bytes through the connector and does not persist document blobs
in its own SQLite database.

### Workspace data resources

For each of these resources, the relay exposes list/create/update/delete over the workspace prefix:

- `tasks`
- `notes`
- `memory`
- `inbox`
- `people`
- `events`
- `time`
- `personas`
- `plugins`
- `routines`
- `images`

There are also specialized routes for:

- `GET /images/:imageId`
- `DELETE /images/:imageId`
- `GET /skills/list`
- `GET /skills/search`
- `GET /skills/sources`
- `GET /integrations/status`
- `GET /time/executions`
- `GET /time/calendar`
- `GET /time/timeline`
- `GET /activity`
- `GET /usage`

### Admin-only workspace and runtime routes

- `POST /v1/admin/tenants/:tenantId/workspace-grants`
- `POST /v1/admin/tenants/:tenantId/agents/:agentId/workspaces`
- `DELETE /v1/admin/tenants/:tenantId/agents/:agentId`
- `DELETE /v1/admin/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId`
- `POST /v1/admin/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/sessions/clear`
- `GET|PUT /v1/admin/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/config`
- `GET|PUT /v1/admin/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/workspace-files/:fileName`
- `POST /v1/admin/tenants/:tenantId/agents/:agentId/runtime/:action`

Supported runtime actions today:

- `setup`
- `install`
- `uninstall`
- `status`

The relay also exposes admin cleanup for relay-side telemetry:

- `DELETE /v1/admin/tenants/:tenantId/activity`
- `DELETE /v1/admin/tenants/:tenantId/usage`

## Streaming Semantics

`GET /sessions/:sessionId/stream` and `POST /sessions/:sessionId/stream` are SSE endpoints.

The relay forwards stream frames emitted by the connector and writes them as SSE events:

- `transport`
- `retry`
- `chunk`
- `done`
- `title`
- `error`

After the connector call completes, the relay emits one final `complete` event with `{ ok: true }`.

The legacy `GET` route accepts these query parameters:

- `message`
- `systemPrompt`
- `transport`

The `POST` route accepts the same fields in JSON plus:

- `documentIds`

Relay-side usage telemetry for replies and streams is estimated from text length with a simple `ceil(chars / 4)` heuristic. It is operational telemetry, not billing-grade accounting.

## Connector Protocol

The relay connector protocol is JSON over WebSocket.

### Connector to relay frames

- `hello`: identifies `tenantId`, `agentId`, version, capabilities, and workspaces
- `hello`: identifies `tenantId`, `connectorId`, `agentId`, version, capabilities, and workspaces
- `heartbeat`: updates connector liveness
- `stream`: pushes streamed events for an in-flight invocation
- `result`: completes a request successfully
- `error`: completes a request with a connector-side failure
- `event`: emits informational activity entries into relay telemetry
- `ack`: acknowledges control-plane frames

### Relay to connector frames

- `invoke`: asks the connector to execute one operation
- `ack`: acknowledges connector `hello`

Each `invoke` carries:

- `requestId`
- `tenantId`
- `agentId`
- optional `workspaceId`
- `operation`
- optional `payload`

The relay keeps only one active connection entry per `tenantId + agentId`. New successful `hello` frames replace the previous active route.

## Connector Runtime Behavior

The bundled connector uses `@clawjs/claw` plus `@clawjs/workspace` under the requested workspace root.

Current connector defaults:

- relay URL: `http://127.0.0.1:4410`
- agent id: `demo-agent`
- workspace root: `./relay-workspaces`
- runtime adapter: `openclaw` by default, or `codex` for a direct Codex connector

For legacy routes, the connector still supports simple lazy workspace creation under the workspace root. For project assignments, it materializes:

- project base files
- agent template files
- one isolated runtime workspace per assignment

The materialized workspace writes `projectId`, `logicalAgentId`, `runtimeAgentId`, and `materializationVersion` into the ClawJS manifest and workspace state snapshots so runtime setup and CLI sessions target the derived runtime agent id instead of the reusable logical agent id.

For some resources it also keeps compatibility data under:

```text
.clawjs/relay-compat/
```

That compatibility layer is currently used for relay-managed collections such as personas, plugins, routines, and hidden people state when the underlying runtime does not provide a native equivalent.

## Configuration

Server environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `RELAY_HOST` | `127.0.0.1` | bind host |
| `PORT` | `4410` | HTTP port |
| `RELAY_DB_PATH` | `relay.sqlite` in `relay/` | SQLite file |
| `RELAY_JWT_SECRET` | `relay-dev-secret-change-me` | JWT signing key |
| `RELAY_ACCESS_TTL_SEC` | `900` | access-token TTL |
| `RELAY_REFRESH_TTL_SEC` | `2592000` | refresh-token TTL |
| `RELAY_CORS_ORIGINS` | empty | comma-separated allowed origins |
| `RELAY_REQUEST_TIMEOUT_MS` | `30000` | connector invoke timeout |
| `RELAY_HEARTBEAT_INTERVAL_MS` | `10000` | reserved config value for heartbeat cadence |

Connector flags or env vars:

| Flag | Env var | Default |
| --- | --- | --- |
| `--relay-url` | `RELAY_URL` | `http://127.0.0.1:4410` |
| `--enrollment-token` | `RELAY_ENROLLMENT_TOKEN` | required |
| `--agent-id` | `RELAY_AGENT_ID` | `demo-agent` |
| `--workspace-root` | `RELAY_WORKSPACE_ROOT` | `./relay-workspaces` |
| `--runtime-adapter` | `RELAY_RUNTIME_ADAPTER` | `openclaw` |
| `--runtime-binary-path` | `RELAY_RUNTIME_BINARY_PATH` | auto-detected |
| `--codex-path` | `CLAWJS_CODEX_PATH` | auto-detected |
| `--credential-path` | `RELAY_CONNECTOR_CREDENTIAL_PATH` | `<workspace-root>/.relay/connector-credential.json` |

The connector stores the approved connector credential at `--credential-path` with file mode `0600`, so a launchd/system service can reconnect after restart without reusing one-time enrollment tokens or repeating device pairing.

When the runtime adapter is `openclaw`, the connector also passes through these optional host-local paths:

- `OPENCLAW_STATE_DIR`
- `OPENCLAW_CONFIG_PATH`
- `OPENCLAW_AGENT_DIR`

When the runtime adapter is `codex`, the connector passes a stable service-safe `PATH`, auto-detects Homebrew Codex binaries when possible, and honors:

- `CLAWJS_CODEX_PATH`
- `CODEX_HOME`
- `CODEX_CONFIG_PATH`
- `CODEX_AUTH_STORE_PATH`

The connector includes runtime health in its `hello` frame and exposes `runtime:codex` plus either `runtime:ready` or `runtime:degraded` in its capabilities. Workspace status still returns the full adapter probe, including CLI, auth, app-server, and streaming transport state.

## Operational Limits

The current relay implementation is useful, but deliberately narrow:

- no queued execution while a connector is offline
- no horizontal connector fan-out for the same agent
- no per-request load balancing
- no production-ready user management beyond the local seeded demo accounts
- no production-safe secret bootstrap beyond the device-code and admin enrollment flows
- no persisted copy of remote workspace data inside the relay database
- no formal billing or metering model beyond estimated usage telemetry

Treat the current relay as a thin remote access layer for ClawJS runtime adapters, not as a full multi-region runtime platform.
