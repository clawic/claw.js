# ADR 0049: Surface route graph

Status: Accepted

Date: 2026-05-15

## Context

ClawJS and Clawix have many compatibility-sensitive surfaces: CLI, SDK,
service APIs, MCP, Relay, host bridge, storage, sessions, permissions, grants,
approvals, audit, and native UI entrypoints. Agents often need to work from one
surface outward, or across a full route, without loading the whole system into
context. A node-only registry answers what exists, but not what talks to what,
which contract is crossed, or which test proves that route still works.

The binding decisions are:

- Primary outcome: better agents.
- Scope: contracts plus runtime-critical connections.
- Work modes: surface-first and route-first.
- Source of truth: extended registry, not hand-maintained diagrams.
- Edge taxonomy: `consumes`, `owns`, `exposes`, `brokers`.
- Route shape: explicit steps.
- First slice: agent chat.
- Initial routes: local desktop chat, companion bridge chat, and remote Relay
  chat.
- Strictness: fail from day one after a base closure pass; the initial gate
  must cover stable surfaces plus runtime-critical debt.
- Agent packaging: skill, always-on instructions, and CLI inspection.
- Agent output: node fiches plus routes.
- Relay status: critical surface.

## Decision

The stable surface registry is extended with a graph layer:

- `nodes` remain the durable and compatibility-sensitive surfaces.
- `edges` connect two registered nodes with exactly one of `owns`, `consumes`,
  `exposes`, or `brokers`.
- `routes` are named transverse workflows composed of explicit route steps.
Each step records source node, target node, edge type, contract, owner,
visibility, transport, validation, and gaps when applicable.

Each new route also records `surfaceNarrative`: the concept implemented by the
route, the decision that authorizes it, the human and programmatic surfaces
that complete it, and the boundary of what must not be inferred from the
route's existence.

Each new route also records `resourceContract`: what starts, what stays idle,
what memory is retained, how streaming/backpressure/cancellation works, what
storage is written and retained, which hot paths are touched, how the route
scales at 10, 1,000, and 100,000 items where applicable, and which test or
measurement proves the contract.

`claw inspect` is the public read-only view for agents. It must expose:

- `claw inspect show <id>` with the node fiche plus incoming edges, outgoing
  edges, routes that touch the node, and evidence for declaration, docs,
  tests, inspect/search commands, and change policy.
- `claw inspect neighbors <id>` for adjacent nodes.
- `claw inspect routes` and `claw inspect route <id>` for transverse workflow
  planning.
- `claw search query <id-or-topic> --domains surfaces --json` for route and
  registry evidence through `surfaces.routes` and `surfaces.registry`.
- generated Markdown and Mermaid renderings from the registry.

The first required routes are:

- `chat.localDesktop`: Clawix macOS UI -> local bridge -> daemon -> runtime ->
  sessions -> streamed response back to UI.
- `chat.companionBridge`: companion client -> pairing/auth -> bridge WebSocket
  on port `24080` -> daemon -> runtime -> sessions -> companion response.
- `chat.remoteRelay`: remote client -> Relay HTTPS/WebSocket -> workspace
  connector -> materialized workspace -> runtime -> remote-safe session
  response.
- `mac.directCliAction`: an intuitive local root such as `claw wifi connect`
  resolves through the Mac atlas, central permission broker, signed-host action
  broker, and redacted audit receipt.
- `mac.permissionLifecycle`: `claw permissions` centralizes OS permission
  state, framework grants, just-in-time request plans, and lifecycle audit.

Relay is registered as a first-class critical node. It is not promoted to the
canonical local API; it remains the remote-safe control plane described by ADR
0009.

## Performance Impact

The route graph is metadata plus inspect output, so the guard itself should be bounded by manifest size and static validation. Its product performance value is preventing hidden cross-surface routes that accidentally start daemons, bridge loops, or broad storage reads. Runtime route implementations still need their own latency, IPC, network, and background-work budgets.

## Decision Tensions

- **Prioritized axes**: route traceability, ownership, surface parity, validation evidence, and agent navigation across complex systems.
- **Constrained axes**: implicit architecture memory and undocumented bridge or Relay paths are constrained even when a direct patch would be quicker.
- **Tradeoffs accepted**: authors must register nodes, edges, routes, and narratives for durable paths; this added metadata is accepted to make future work reviewable and testable.
- **Debt or pending evidence**: inherited route gaps remain baseline debt until manifest entries and inspect evidence cover the full transverse workflows.

## Enforcement

`surface-route-graph-guard` fails when required runtime-critical nodes,
required chat routes, route steps, edge references, contract references, or
validation fields are missing. `surface-evidence-guard` fails when critical
registered surfaces lack declaration evidence, routes lack docs/tests/ADRs, or
missing contract nodes are not captured in `docs/surface-evidence-baseline.json`
with owner, reason, risk, expiry, next phase, and reentry condition. The gate is
part of docs validation after the base map closes. Once active, stable surface
and runtime-critical debt is not accepted as implicit.
`surface-narrative-guard` additionally fails new routes whose conceptual relato
is absent, while existing missing route narratives are bounded by
`docs/surface-narrative-baseline.json`.
`surface-resource-contract-guard` fails new nodes or routes whose operational
resource contract is absent, while existing missing contracts are bounded by
`docs/surface-resource-contract-baseline.json`.

Language-specific manifests may continue to be node-only while Clawix closes
its base map. When a manifest does include `edges` or `routes`, `claw inspect`
must fuse them with the same contract.

## Closure Matrix

The 2026-05-23 route-graph audit uses this matrix as the closure ledger for
chat, Relay, CLI, MCP, bridge, daemon, sessions, runtime, and host surfaces.
The registry remains the source of truth; this table is an auditable view over
`claw inspect show|neighbors|routes|route`.

The machine-readable closure ledger lives at
`docs/governance/surface-route-graph/closure-matrix.json` and is verified by
`node --import tsx scripts/verify-surface-route-graph-goal.mjs`. That guard
checks the required central routes, critical surfaces, owners, contracts,
edge-type buckets, fixtures, hermetic validation text, and every blocked gap's
file plus pending decision and evidence. The one-by-one source Q/A review for
the source conversation lives at
`docs/governance/surface-route-graph/source-review.json` and is checked by the
same verifier.

### Critical Routes

| Route | Owner | Input -> output contracts | consumes / owns / exposes / brokers | Fixtures and hermetic validation | Debt state |
| --- | --- | --- | --- | --- | --- |
| `chat.localDesktop` | `claw` with Clawix host legs | `clawix.protocol.bridge.v1`, `claw.protocol.hostCommand.v1`, `claw.database.sessions`, `claw.event.sessions.message.appended` | consumes UI -> bridge; brokers bridge -> daemon -> runtime; owns runtime -> sessions; exposes sessions -> bridge -> UI | `packages/clawjs/src/inspect-cli.test.ts`; `clawix:macos/Helpers/Bridged/Tests/e2e_bridge_daemon.py` | Complete route narrative and resource contract. |
| `chat.companionBridge` | `claw` with Clawix host legs | `clawix.protocol.bridge.v1`, `claw.protocol.hostCommand.v1`, `claw.database.sessions`, `claw.event.sessions.message.appended` | consumes companion -> bridge; brokers bridge -> daemon -> runtime; owns runtime -> sessions; exposes sessions -> bridge -> companion | `packages/clawjs/src/inspect-cli.test.ts`; `clawix:packages/ClawixCore/Tests/ClawixCoreTests/BridgeFrameRoundTripTests.swift` | Complete route narrative and resource contract. |
| `chat.remoteRelay` | `claw` | `claw.api.relay.remote`, `claw.api.relay.connector`, `claw.workspace.manifest`, `claw.protocol.hostCommand.v1`, `claw.database.sessions`, `claw.event.sessions.message.appended` | consumes remote -> Relay; brokers Relay -> connector -> workspace/runtime; owns runtime -> sessions; exposes sessions -> Relay -> remote | `packages/clawjs/src/inspect-cli.test.ts`; `relay/tests/e2e/relay.e2e.test.ts`; `relay/tests/e2e/codex-connector.e2e.test.ts` | Complete route narrative and resource contract. Physical/provider validation remains governed by ADR 0022 external-pending artifacts, not this hermetic route. |
| `remote.chatGateway` | `claw` | `claw.api.nodes`, `claw.api.remote.conformance`, `claw.api.remote.classifications`, `claw.protocol.hostCommand.v1`, `claw.database.sessions` | consumes remote -> Coordinator; brokers Coordinator -> Gateway -> Connector -> runtime; owns runtime -> sessions | `packages/clawjs-core/src/index.test.ts`; `packages/clawjs/src/inspect-cli.test.ts` | Route exists and is fixture-backed. Route narrative/resource contract are still in `docs/surface-narrative-baseline.json` and `docs/surface-resource-contract-baseline.json`; close by backfilling or by explicit scope revision. |
| `agents.mcpApiAssignment` | `claw` | `claw.mcp.agents.v1`, `claw.database.core.table.agent_resource_grants`, `claw.agent_assignment.runtime.v1` | consumes MCP -> assignments; owns grants; brokers assignments -> runtime | `packages/clawjs-core/src/agents-v1.test.ts`; `packages/clawjs/src/inspect-cli.test.ts` | Route exists and is fixture-backed. Route narrative/resource contract are still in the surface baseline files. |
| `cli.commandIntentResolution` | `claw` | `claw.schema.commandIntents.v1`, `claw.workspace.command_intents.ledger`, `claw.cli.command.needs`, `claw.cli.command.report` | consumes intent schema; owns workspace intent ledger; brokers Need/report projections | `packages/clawjs-core/src/cli-command-intents.test.ts`; `packages/clawjs/src/cli-commands.test.ts`; `packages/clawjs/src/cli-discovery.test.ts`; `packages/clawjs/src/inspect-cli.test.ts` | Route exists and is fixture-backed. Route narrative/resource contract are still in the surface baseline files. |
| `mac.directCliAction` | `claw` and active signed host | `claw.mac.actionRequest.v1`, `claw.mac.permissionState.v1`, `claw.mac.actionPlan.v1`, `claw.mac.actionReceipt.v1` | exposes CLI -> Mac control plane; consumes capability atlas; brokers permission/action/signed host; owns audit receipt | `packages/clawjs-core/src/mac-control-plane.test.ts`; `packages/clawjs/src/cli-mac-control-command.test.ts`; `packages/clawjs/src/inspect-cli.test.ts`; `scripts/verify-host-permission-contract.mjs` | Route exists and is fixture-backed. Signed-host physical validation is outside hermetic proof and remains host-validation gated. |
| `mac.permissionLifecycle` | `claw` and active signed host | `claw.mac.permissionState.v1` | exposes CLI -> permission broker; brokers host permissions; owns audit | `packages/clawjs-core/src/mac-control-plane.test.ts`; `packages/clawjs/src/cli-mac-control-command.test.ts`; `packages/clawjs/src/inspect-cli.test.ts`; `scripts/verify-host-permission-contract.mjs` | Route exists and is fixture-backed. Signed-host physical validation is outside hermetic proof and remains host-validation gated. |
| `gateway.headlessAgentHost` | `claw` | `claw.api.gateway.conformance`, `claw.protocol.hostCommand.v1` | exposes Gateway -> headless host; brokers connector -> runtime host adapter | `packages/clawjs-core/src/index.test.ts`; `packages/clawjs/src/inspect-cli.test.ts` | Route exists and is fixture-backed. Physical deployment validation remains ADR 0022 external pending. |
| `sync.sessions` | `claw` | `claw.api.sync.manifests` | brokers connector -> Sync; owns Sync -> sessions | `packages/clawjs-core/src/index.test.ts`; `packages/clawjs/src/inspect-cli.test.ts` | Route exists and is fixture-backed. Physical sync-driver application remains ADR 0022 external pending. |

### Critical Surfaces

| Surface | Owner | Input contracts | Output contracts | consumes / owns / exposes / brokers | Fixtures and validation | Debt state |
| --- | --- | --- | --- | --- | --- | --- |
| `clawix.ui.chat` | `clawix` | `clawix.protocol.bridge.v1` | `clawix.protocol.bridge.v1` | consumes `clawix.bridge.local`; receives bridge exposes | `chat.localDesktop`; `agents.internalMacAssignment`; Clawix bridge E2E | Node-level narrative/resource contract may remain in the baseline files; route legs are explicit. |
| `clawix.companion.client` | `clawix` | `clawix.protocol.bridge.v1` | `clawix.protocol.bridge.v1` | consumes bridge; receives bridge exposes | `chat.companionBridge`; bridge frame round-trip tests | Node-level narrative/resource contract may remain in the baseline files; route leg is explicit. |
| `clawix.bridge.local` | `clawix` | `clawix.protocol.bridge.v1`, `claw.event.sessions.message.appended` | `claw.protocol.hostCommand.v1`, `clawix.protocol.bridge.v1` | brokers daemon; exposes UI/companion; consumes UI/companion/session frames | `clawix:macos/Helpers/Bridged/Tests/e2e_bridge_daemon.py`; `clawix:packages/ClawixCore/Tests/ClawixCoreTests/BridgeFrameRoundTripTests.swift`; inspect tests | Host-local only; no direct Relay exposure. Any native/signed-host claim still needs Clawix host validation. |
| `claw.daemon.local` | `claw` | `claw.protocol.hostCommand.v1` | `claw.protocol.hostCommand.v1` | brokers runtime | runtime fixture; inspect tests | Local-only surface. Node-level narrative/resource contract may remain in the baseline files. |
| `claw.runtime.agent` | `claw` | `claw.protocol.hostCommand.v1`, `claw.agent_assignment.runtime.v1` | `claw.database.sessions`, `claw.database.core.table.agent_runs` | brokers from daemon/connector/assignments; owns sessions and runs | runtime/session fixtures; Agents V1 tests; inspect tests | Local runtime is not directly Relay-exposed; remote entry is through registered Gateway/Connector routes. |
| `claw.sessions` | `claw` | `claw.database.sessions`, `claw.api.sync.manifests` | `claw.event.sessions.message.appended` | owned by runtime; exposes bridge/Relay events; owned by Sync for sync route | session fixtures; relay E2E; bridge round-trip tests | Canonical persistence is framework-owned. Physical sync remains ADR 0022 external pending. |
| `claw.remote.client` | `claw` | `claw.api.relay.remote`, `claw.api.nodes` | remote request/event envelopes | consumes Relay or Coordinator; receives Relay exposes | relay E2E; remote conformance inspect tests | Physical/provider/device validation remains ADR 0022 external pending. |
| `claw.relay` | `claw` | `claw.api.relay.remote`, `claw.event.sessions.message.appended` | `claw.api.relay.connector`, `claw.agent_assignment.external.v1`, `claw.api.relay.remote` | consumes remote; brokers connector and assignments; exposes remote | `relay/tests/e2e/relay.e2e.test.ts`; inspect tests | Critical surface, not canonical local API. Live external validation remains blocked by ADR 0022 artifacts. |
| `claw.relay.connector` | `claw` | `claw.api.relay.connector` | `claw.workspace.manifest`, `claw.protocol.hostCommand.v1` | brokers workspace and runtime | relay connector E2E; inspect tests | Compatibility adapter for the broader Connector layer. Physical connector deployment remains ADR 0022 external pending. |
| `claw.mcp.surface` | `claw` | `claw.mcp.agents.v1` | MCP tool/resource responses | consumes assignments; exposes telemetry where registered | Agents V1 and MCP route tests; inspect tests | Registered programmatic surface; route contract debt tracked in baseline until backfilled. |
| `claw.cli.command.commands` | `claw` | `claw.schema.commandIntents.v1` | command intent ledger, Need/report projections | consumes schema; owns ledger; brokers Need/report | CLI command-intent tests; inspect tests | Registered CLI route; route contract debt tracked in baseline until backfilled. |
| `claw.host.signed` | active signed host | `claw.mac.actionReceipt.v1`, host command envelopes | native execution receipts | brokered by Mac action broker | host permission contract guard; Mac control tests | Hermetic checks prove contract shape only; native execution validation is signed-host gated. |
| `claw.host.permissions` | active signed host | `claw.mac.permissionState.v1` | OS permission state/request guidance | brokered by Mac permission broker | host permission contract guard; Mac permission tests | Physical permission prompts cannot be cleared without signed-host evidence. |
| `claw.host.audit` | active signed host | action, permission, and telemetry receipt contracts | redacted audit records | owned by Mac action/permission/system telemetry routes | host audit contract tests; Mac receipt tests | Signed-host audit persistence needs host validation where physical storage is claimed. |

Remaining gaps are not silent: route and node narrative/resource gaps are
guarded by `docs/surface-narrative-baseline.json` and
`docs/surface-resource-contract-baseline.json`; remote and physical/provider
gaps are governed by ADR 0022 external-pending artifacts; signed-host gaps are
governed by the host permission and Mac control guards. Goal closure may only
claim the hermetic layer until those files are reduced or their blockers are
cleared with approved evidence.

## Consequences

Agents can start from a surface such as `claw.relay`, `clawix.bridge.local`, or
`clawix.ui.chat` and see neighbors, routes, contracts, tests, and gaps before
editing. Route work becomes testable and reviewable instead of relying on
unwritten architectural memory. Generated diagrams remain views; the registry
is the source of truth.
