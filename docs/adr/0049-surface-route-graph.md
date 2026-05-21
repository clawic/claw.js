# ADR 0049: Surface route graph

Status: Accepted

Date: 2026-05-15

Source conversation: `019e2b9c-bfc0-7ed2-ad43-a81cf8904302`

## Context

ClawJS and Clawix have many compatibility-sensitive surfaces: CLI, SDK,
service APIs, MCP, Relay, host bridge, storage, sessions, permissions, grants,
approvals, audit, and native UI entrypoints. Agents often need to work from one
surface outward, or across a full route, without loading the whole system into
context. A node-only registry answers what exists, but not what talks to what,
which contract is crossed, or which test proves that route still works.

The binding decisions from the source conversation are:

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

## Consequences

Agents can start from a surface such as `claw.relay`, `clawix.bridge.local`, or
`clawix.ui.chat` and see neighbors, routes, contracts, tests, and gaps before
editing. Route work becomes testable and reviewable instead of relying on
unwritten architectural memory. Generated diagrams remain views; the registry
is the source of truth.
