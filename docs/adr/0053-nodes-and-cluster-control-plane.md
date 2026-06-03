# ADR 0053: Nodes And Cluster Control Plane

Status: Accepted

Date: 2026-06-02

Reservation: `docs/adr/reservations/0053.json`

## Context

Claw already has node identity, remote Gateway, Sync manifests, resources,
host telemetry, grants, approvals, database, search, diagnostics, and
governance surfaces. The missing decision is how those pieces compose when a
user has more than one trusted computer, when framework state needs resilience,
and when agents need to know where resources live without exposing users to
distributed-systems vocabulary.

The design must preserve the existing local-first product stance. A
single-computer user should not have to understand clusters, placement,
control planes, quorum, or sync drivers. At the same time, the framework needs
real internal contracts for authority, node identity, resource location,
replication policy, failover, and recovery.

## Decision

Public machine vocabulary uses `node`. `cluster` is a real internal authority
and sync boundary, but ordinary CLI and UI workflows do not require users to
choose a cluster. For V1, the active framework root is the active cluster
boundary; the normal root is `~/.claw`. Do not add broad `clusterId` columns to
existing stores now. If the same hardware must participate in separate
clusters, it uses a separate framework root, host config, VM, container, or a
later explicit multi-cluster design.

### Durable Node Identity And Locators

The root of cluster membership is a durable cryptographic node identity, not
an IP address, hostname, VPN address, relay endpoint, or human display name.
When the framework is initialized on a device, Claw generates or imports a
local node keypair. The public `nodeId` is derived from the public key
fingerprint, or is bound to that fingerprint by a verifiable record. The
private key is device-local protected material and must never be replicated or
stored in public docs, logs, fixtures, or the main database in plaintext.

`displayName`, hostname, LAN address, public IP, Tailscale address, public
Relay endpoint, Iroh route, and other network observations are mutable
locators attached to that identity. Trust is granted to the `nodeId` and
public key fingerprint, never to a locator. If a node moves to a different IP
or VPN address, it remains the same node after a signed heartbeat or
handshake proves possession of the expected private key. If the key changes
without signed rotation from the old key or explicit human re-pairing, the
responding machine is a different or suspicious node and remote operations
fail closed.

`nodeIdentitySchema` should be extended conceptually with
`nodeFingerprint`, `publicKeyRef`, `keyAlgorithm`, `createdAt`,
`rotatedFrom`, and `observedLocators`. `NodeTrustDecision` remains a signed
trust decision over identity and fingerprint, not over address.
`RemoteTransportHandshakeReceipt` remains transport evidence, but the
handshake must also prove possession of the node private key and report
identity verification separately from transport reachability. Iroh,
rendezvous, Relay, Tailscale, LAN discovery, and any future discovery
mechanism are discovery or transport layers only; none is cluster authority.

The control plane composes existing surfaces instead of creating a parallel
system. `nodes` owns node identity and trust operations; `remote`, `gateway`,
and `sync` own remote classification, Gateway projection, resource manifests,
reconciliation, and physical driver evidence; `resources` owns stable
resource identity; `system`, `host`, `agents`, `sessions`, `skills`,
`connectors`, `database`, `search`, `approvals`, `grants`, `monitor`,
`diagnostics`, and `governance` keep their existing domain authority.

Framework stores such as `core.sqlite` and approved sidecars are logical
framework services. Callers use the framework contract through CLI, SDK, API,
MCP, Gateway, or domain commands; they do not read another node's database
file directly. Replication is policy-driven and class-specific. Durable
structured state may have backups, encrypted replicas, or standby service
records when multiple trusted nodes exist, but databases, sessions, sidecars,
secrets, blobs, logs, indexes, and editable worktrees must not be blindly
copied across nodes by default.

Control-plane failover starts conservatively: a primary coordinator, eligible
standby candidates, last-known-good local policy snapshots, export/restore
recovery, epoch-like audit metadata, and fail-closed behavior for new
cluster-authority decisions when the coordinator is unavailable. Later quorum
or election behavior can build on the same contracts only after physical
multi-node validation.

`claw get`, `claw describe`, `claw where`, and `claw risk` are the
transversal inventory and location concepts for agents and operators. They are
views over registered domain surfaces, not duplicate implementations. Initial
implementation should prioritize inventory, observability, resource location,
risk reporting, and validation before broad physical scheduling or sync driver
execution.

## Threat Model Impact

This decision touches remote access, storage, resources, agents, secrets,
sync, and host trust. The protected assets are framework state, node trust,
resource authority, sync manifests, secret references, grants, approvals,
audit receipts, workspaces, projects, and user data. The main adversaries are
hostile local processes, confused or over-permissioned agents, stale nodes,
untrusted peers, compromised remote routes, stale or spoofed locators,
key-substitution attempts, and accidental cross-boundary data mixing.

Controls are fail-closed node trust, explicit cluster boundary, no plaintext
secret replication, no blind cross-node database reads, policy-driven
replication, trust-by-fingerprint, private-key possession checks during
remote handshakes, signed key rotation or human re-pairing for identity
changes, signed or auditable coordinator receipts where authority changes,
and existing Gateway/Sync/Connector guardrails from ADR 0022. The global
threat model coverage remains routed through `docs/security-threat-model.md`
and `docs/security-threat-model.coverage.json`; any new executable route must
add or reuse a concrete coverage row before it can be treated as complete.

## Performance Impact

The control plane can affect CPU, RAM, disk, network, battery, thermals, idle
behavior, database growth, search/index growth, background loops, sync queues,
and long-running agents. The accepted resource rule is conservative: inventory
and inspect views are bounded local reads; replication, reconciliation,
watchers, drivers, and risk scans must be explicit, policy-driven, cancellable,
and measured before production claims.

No new always-on daemon, broad poller, unbounded cluster index, full session
replica, raw log replica, or worktree mirror is authorized by this ADR.
Locator refresh, heartbeat, and discovery loops must be bounded, cancellable,
backoff-aware, and safe when nodes are disconnected or on changing networks.
Resource-contract coverage is required when implementation adds startup, idle,
memory, streaming, storage, hot-path, or scale behavior. Until physical
multi-node runs exist, reliability and performance of failover, live transport,
live locator refresh, and driver execution remain `EXTERNAL PENDING`; the
local reconnect contract still fails closed until a verified identity handshake
makes remote work available.

## Decision Tensions

- **Prioritized axes**: local-first sovereignty, authority clarity,
  recoverability, agent discoverability, resource location, and reuse of
  existing framework surfaces.
- **Constrained axes**: Kubernetes-like user vocabulary, broad multi-cluster
  schemas, automatic replication, and eager physical scheduling are constrained
  for V1.
- **Tradeoffs accepted**: cluster behavior starts with conservative
  coordinator/standby contracts and inventory views rather than full
  distributed scheduling; this avoids cross-boundary leakage and hidden
  resource cost.
- **Debt or pending evidence**: physical failover, multi-node handoff,
  live transport behavior, and physical sync driver execution are external
  pending until approved device evidence exists.

## Adoption And Canonicity

This ADR makes no broad adoption, PMF, "any human", or stable product
promotion claim. It is a framework architecture decision for internal node and
cluster control-plane contracts.

## Source Decision Audit

This ADR records conversation-derived architecture decisions from
`source:nodes-cluster-local-forge`. Public-safe rows live in
`docs/governance/nodes-cluster-local-forge/source-audit.md`, especially
`NCLF-001` through `NCLF-015` and durable identity rows `NCLF-031` through
`NCLF-036`.

## Surface Parity

- **Human surface**: Clawix and docs should describe connected computers,
  availability, sync status, and concrete impact such as where a project or
  resource is available, without exposing ordinary users to cluster
  terminology. Human pairing may show a short code or fingerprint, but normal
  labels such as "this computer" and editable device names are not authority.
- **Programmatic surface**: `claw nodes`, `claw remote`, `claw sync`,
  `claw gateway`, `claw inspect`, and future `claw get`, `claw describe`,
  `claw where`, and `claw risk` expose inventory, authority, location, and
  risk contracts. `claw nodes list --json` exposes stable identity and
  observed locators; `claw nodes pair/trust/heartbeat --json` separates
  `identityVerified` from `transportReachable`; `claw where node <node-id>`
  and `claw describe node <node-id>` explain current and last-seen locators.
- **Persistence**: node records, Sync manifests, resource bindings,
  coordinator receipts, audit records, workspace/project records, and
  sidecar-specific policies persist in existing framework stores and governed
  ledgers. Private node keys stay in protected local material, preferably
  signed-host or OS secure storage where available, not plaintext main DB
  rows.
- **Gaps**: physical failover, broad scheduling, sidecar-by-sidecar
  replication policy, and final session indexing rules are `blocked` or
  `EXTERNAL PENDING` until their checklist rows close.
- **Validation**: human-path validation is through governance docs and future
  Clawix connected-computer flows. Programmatic validation is through
  `npm run test:docs`, ADR/discoverability checks, remote/sync/governance
  focused tests, and physical evidence rows when available.

## Discovery Route

- **Canonical name**: `adr:nodes-cluster-control-plane`.
- **AGENTS/CLAUDE**: root `AGENTS.md` routes major architecture, storage,
  remote, sync, and governance work to `docs/decision-map.md`.
- **Skill**: use `decision-map-maintenance`, `docs-alignment-update`,
  `surface-route-work`, `cli-agent-surface-work`, and
  `adoption-canonicity-review` when promoting related capabilities.
- **Docs router**: `docs/decision-map.md` and
  `docs/governance/nodes-cluster-local-forge/index.md`.
- **CLI**: `claw search "node cluster control plane" --json` and
  `claw inspect why adr:nodes-cluster-control-plane --json`.
- **Registry**: `docs/discoverability.registry.json`.
- **Operational coverage**: `docs/adr-operational-coverage.manifest.json`.

## Consequences

Node and cluster work now has a public governance anchor. Future code must not
add blind database replication, broad `clusterId` columns, user-facing cluster
setup, raw session/log replication, secret plaintext replication, or parallel
control-plane surfaces without a superseding ADR and guardrail. Future remote
operations must not treat IPs, VPN addresses, hostnames, Relay endpoints, or
Iroh routes as node authority; they must verify the expected identity and fail
closed on key mismatch.

Closure for the current architecture program is tracked in
`docs/governance/nodes-cluster-local-forge/`. Remaining physical/provider work
must be explicit `EXTERNAL PENDING`, not counted as local validation.
