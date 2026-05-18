# Remote Gateway And Sync Source Decision Audit

Source conversation: `019e36a3-c2e6-73b3-a3fe-f3e7340e42c8`

Reference plan item: `019e3732-c90e-7491-9217-37020c43217e-plan`

This audit is the privacy-safe public enumeration of the source decisions for
ADR 0022. It intentionally records conversation and plan identifiers, not local
session paths or maintainer-private goal files.
`docs/remote-gateway-sync-source-qa-review.json` records the current
one-by-one review dispositions and evidence references for these rows. Goal
completion still requires a fresh review of this map against the private source
session before the maintainer-local goal can be closed.

## Source Q/A Review Map

Reviewed from the source conversation on 2026-05-18. Source anchors below are
conversation event line numbers only; this public audit intentionally avoids
local session paths.

| QA ID | Source anchor | Decision key | User decision captured | Requirement row |
| --- | --- | --- | --- | --- |
| QA-001 | lines 124/126 | `relay_boundary` | Selected `Separar capas (Recommended)`: Relay must split into separate Coordinator/Gateway/Connector/Sync-style layers instead of staying one ambiguous bucket. | RQ-001 |
| QA-002 | lines 124/126 | `server_trust_model` | Selected `Doble modo (Recommended)`: support sovereign E2E/tunnel-only servers and governed Gateway servers. | RQ-002 |
| QA-003 | lines 124/126 | `remote_surface_parity` | Selected `Todo clasificable (Recommended)`: every stable local capability is classified as `remote-safe`, `local-only`, `blocked`, or `pending`. | RQ-003 |
| QA-004 | lines 6/147 | `topology_priority` | Free-form requirement plus confirmation: topology is a heterogeneous network of personal devices, clients, servers, headless installs, VPS/self-hosted, and hosted service shapes, not only one Mac plus mobile. | RQ-004 |
| QA-005 | lines 6/147 | `sync_authority_model` | Free-form requirement plus confirmation: data cannot assume one central store; authority and residency must be assigned per resource/node. | RQ-005 |
| QA-006 | lines 6/147 | `remote_secrets_model` | Free-form requirement plus confirmation: nodes may need access to another node's capabilities, but secrets must not replicate as plaintext; access uses references, capabilities, and audited leases. | RQ-006 |
| QA-007 | lines 160/162 | `transport_contract` | Selected `Adaptador principal (Recommended)`: Iroh is the v1 recommended adapter while the stable contract remains transport-agnostic. | RQ-007 |
| QA-008 | lines 160/162 | `remote_api_shape` | Selected `Misma API proyectada (Recommended)`: the Gateway projects registered local SDK/service/CLI contracts instead of inventing a parallel mobile/Relay API. | RQ-008 |
| QA-009 | lines 160/162 | `offline_behavior` | Selected `Separar comando/sync (Recommended)`: interactive commands fail clearly while declared Sync uses queues, cursors, and reconciliation. | RQ-009 |
| QA-010 | lines 178/180 | `remote_actor_model` | Selected `Autoridad unificada (Recommended)`: human, device, agent, service, and organization share actor/action/resource/policy/audit semantics; agents also require assignments. | RQ-010 |
| QA-011 | lines 178/180 | `headless_host_model` | Selected `Host completo (Recommended)`: a VPS/headless install is a full ClawJS host, not only a connector worker. | RQ-011 |
| QA-012 | lines 178/180 | `first_vertical_slice` | Free-form answer rejected a narrow slice: chat, sync, search, secret references, server, and agents must all be covered and executable at 100%. | RQ-012 |
| QA-013 | lines 196/198 | `sync_substrate` | Free-form answer accepted manifest + changelog as the strategic governance plane, but explicitly forbade limiting what can be synchronized physically. | RQ-013 |
| QA-014 | lines 196/198 | `conflict_default` | Selected `Detectar y elevar (Recommended)`: no silent overwrite by default. | RQ-014 |
| QA-015 | lines 196/198 | `client_cache_policy` | Selected `Cache cifrada mínima (Recommended)`: clients may keep minimal encrypted TTL cache, not secrets or authoritative state. | RQ-015 |
| QA-016 | lines 202/204 | `guardrail_strictness` | Selected `Fail cerrado (Recommended)`: checks must fail closed after baseline, not remain a documentation-only inventory. | RQ-016 |
| QA-017 | lines 202/204 | `compat_policy` | Selected `Compat con adaptadores (Recommended)`: preserve existing Relay/mobile routes as compatibility adapters during migration. | RQ-017 |
| QA-018 | lines 202/204 | `hosted_service_position` | Selected `Paridad total`: hosted and self-hosted share the same contract and conformance suite. | RQ-018 |
| QA-019 | lines 208/210 | `layer_names` | Selected `Coordinator/Gateway/Connector/Sync (Recommended)`: this is the canonical layer taxonomy. | RQ-019 |
| QA-020 | lines 208/210 | `mesh_collaboration_scope` | Selected `Primitivas si (Recommended)`: include invitation, scoped resource sharing, and revocation primitives for inter-mesh collaboration. | RQ-020 |
| QA-021 | lines 208/210 | `agent_service_model` | Selected `Multi-tenant gobernado (Recommended)`: server-side agent service must support assignments, budgets/billing, isolation, and audit. | RQ-021 |
| QA-022 | line 211 | `sync_lateral_domains` | Free-form addition: Sync must cover lateral domains such as skills, shared/global memory, drive/files, databases, partial databases, and file sync according to configuration. | RQ-022 |
| QA-023 | line 232 | `goal_closure_gate` | The maintainer-local goal must not close until this plan is 100% complete and every decision Q/A is reviewed one by one against implementation, docs, validation, or explicit `EXTERNAL PENDING`. | Completion audit |

| ID | Decision key | Source decision | Acceptance gate |
| --- | --- | --- | --- |
| RQ-001 | `relay_boundary` | The old Relay bucket must split into Coordinator, Gateway, Connector, and Sync. | ADR 0022, route graph nodes, CLI commands, and docs name the four layers explicitly. |
| RQ-002 | `server_trust_model` | Remote operation must support sovereign E2E/tunnel-only and governed Gateway trust modes. | Remote actor, node identity, and conformance contracts expose both trust modes; `claw nodes trust --record true` stores signed trust intent while physical acceptance remains explicit. |
| RQ-003 | `remote_surface_parity` | Stable local capabilities must be classified as `remote-safe`, `local-only`, `blocked`, or `pending`. | Surface contract and interface matrix include the four states; `RemoteSurfaceClassificationReceipt`, `claw remote classify --record true`, and Relay `/v1/remote/classifications/receipts` require route, policy, and test evidence before a capability can be accepted as `remote-safe`. |
| RQ-004 | `topology_priority` | Personal devices and headless/server deployments use the same architecture. | Headless host, multi-tenant Gateway, and personal mesh routes share the same conformance contract. |
| RQ-005 | `sync_authority_model` | Synchronization authority is assigned per resource. | `SyncResourceManifest` records authority, owner node, residency, route IDs, and allowed peers; `SyncAuthorityHandoffReceipt`, `claw sync handoff --record true`, and Relay `/v1/sync/authority-handoffs` record signed authority/residency handoff intent while physical authority transfer remains explicit `EXTERNAL PENDING`. |
| RQ-006 | `remote_secrets_model` | Secrets sync as references only; operations require brokered leases and audit. | Secret policy forbids plaintext replication; remote secret lease and provider receipt contracts return no plaintext; `claw gateway secret-lease` records signed expiring lease metadata and `claw gateway secret-provider` records signed provider receipts for secret refs only. |
| RQ-007 | `transport_contract` | Iroh is the v1 adapter, but the stable contract remains transport-agnostic. | Route graph includes `claw.transport.iroh`; conformance reports `transport_agnostic_iroh_v1_adapter`; `claw nodes heartbeat --record true` stores a signed transport-handshake receipt while real multi-device Iroh remains explicitly pending. |
| RQ-008 | `remote_api_shape` | Remote APIs project the same registered local contracts, not a separate mobile/Relay API. | Gateway routes broker SDK/service/CLI contracts through registered surface nodes; `RemoteRouteContractCatalog`, `claw remote contracts`, and Relay `/v1/remote/route-contracts` bind each required route to local contract refs and forbid parallel APIs. |
| RQ-009 | `offline_behavior` | Interactive commands fail fast; sync uses queued planning, cursors, changelogs, and reconciliation. | `buildSyncPlan` returns dry-run actions, changes, conflicts, and next cursors with `writes: false`; `RemoteSyncStateStore` persists opt-in local queue/reconciliation state through `claw sync run --state-dir &lt;dir&gt; --queue true` and `claw sync reconcile`, with optional Ed25519 Coordinator signatures. |
| RQ-010 | `remote_actor_model` | Humans, devices, agents, services, and organizations share actor/action/resource/policy/audit semantics. | Remote actor context schema includes those actor kinds and route-level audit requirements; `RemoteGatewayAuditReceipt`, `claw gateway audit`, and Relay `/v1/gateway/audit/receipts` bind Gateway decisions to `hostAuditStore: signed_host_audit` while real host persistence remains explicit. |
| RQ-011 | `headless_host_model` | A terminal/headless install is a complete host, not a reduced Relay sidecar. | `gateway.headlessAgentHost` and `claw.headlessHost` are required surfaces. |
| RQ-012 | `first_vertical_slice` | Closure must cover chat, sync, search, secret references, and server-hosted agents; no narrow one-route slice. | Required route contracts include chat, search, secret broker operation, sync resources, headless host, and multi-tenant agent service with local refs and remote entrypoints; `RemoteProviderDeviceE2EValidationPlan` binds those domains into one final provider/device validation gate. |
| RQ-013 | `sync_substrate` | Manifests and changelogs govern sync without constraining the physical driver. | Supported sync drivers include skills, memory/user-model, sessions, drive/files, blobs, SQLite, partial SQLite, sidecars, search indexes, agent config, and workspace state; `SyncDriverApplicationReceipt`, `claw sync apply`, and Relay `/v1/sync/applications` bind reconciled changes to one driver while physical driver execution remains explicit. |
| RQ-014 | `conflict_default` | Conflicts detect and elevate by default; silent overwrite is forbidden. | Sync plans emit `conflict` actions and open conflicts for diverged snapshots. |
| RQ-015 | `client_cache_policy` | Client cache is minimal, encrypted, TTL-bound, and cannot store secrets or authoritative state. | Sync cache policy and `RemoteClientCacheSnapshot` require encryption, TTL, `storesSecrets: false`, `storesAuthoritativeState: false`, and no plaintext payload; `claw sync cache --record true` stores signed cache metadata only. |
| RQ-016 | `guardrail_strictness` | After baseline closure, gaps fail closed instead of staying implicit. | Conformance reports missing routes/nodes and marks each decision `must_verify_before_goal_completion`; `RemoteExternalPendingRegister`, `claw remote pending`, and Relay `/v1/remote/external-pending` enumerate physical/provider/deployment blockers separately from bugs. |
| RQ-017 | `compat_policy` | Existing Relay/mobile routes stay as compatibility adapters while clients migrate. | `RemoteCompatibilityAdapterReceipt`, `claw remote compat`, and Relay `/v1/remote/compatibility/adapters` preserve compatibility by mapping each legacy surface to one canonical route with no parallel API. |
| RQ-018 | `hosted_service_position` | Hosted and self-hosted deployments must share one contract and conformance suite. | Gateway conformance reports hosted/self-hosted parity as required; `claw gateway serve|project --record true` stores signed `GatewayDeploymentManifest` projections for both deployment kinds with one route contract. |
| RQ-019 | `layer_names` | Canonical public names are Coordinator, Gateway, Connector, and Sync. | Docs, registry nodes, and CLI use these names. |
| RQ-020 | `mesh_collaboration_scope` | Mesh collaboration needs invitation, scoped acceptance, scoped share, and revocation primitives. | `MeshInvitationAcceptance`, `mesh.resourceShare`, and `nodes pair|trust|revoke` are required dry-run/signed-host surfaces; `claw nodes invite|accept|share|revoke --state-dir &lt;dir&gt; --record true` records durable local proposals/acceptances/revocations without granting physical peer trust. |
| RQ-021 | `agent_service_model` | Governed multi-tenant agent service must support assignments, budgets, isolation, and audit. | `gateway.multiTenantAgentService`, `RemoteAgentServiceExecutionReceipt`, and `claw gateway agent-service --record true` record signed assignment/budget/isolation/audit receipts while real runtime and billing meter persistence remain explicit `EXTERNAL PENDING`. |
| RQ-022 | `sync_lateral_domains` | Sync must cover lateral domains: skills, memory, drive/files, sessions, agent config, workspace state, databases, sidecars, blobs, and indexes. | Sync drivers and required routes cover lateral domains with manifest-based governance, including explicit `sync.sessions`, `sync.blobs`, `sync.sidecars`, `sync.searchIndex`, `sync.agentConfig`, and `sync.workspaceState` route contracts. |
