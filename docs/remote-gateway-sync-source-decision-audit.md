# Remote Gateway And Sync Source Decision Audit

Source conversation: `019e36a3-c2e6-73b3-a3fe-f3e7340e42c8`

Reference plan item: `019e3732-c90e-7491-9217-37020c43217e-plan`

This audit is the privacy-safe public enumeration of the source decisions for
ADR 0022. It intentionally records conversation and plan identifiers, not local
session paths or maintainer-private goal files. Goal completion requires a
fresh one-by-one review of these rows against the private source session before
the maintainer-local goal can be closed.

| ID | Decision key | Source decision | Acceptance gate |
| --- | --- | --- | --- |
| RQ-001 | `relay_boundary` | The old Relay bucket must split into Coordinator, Gateway, Connector, and Sync. | ADR 0022, route graph nodes, CLI commands, and docs name the four layers explicitly. |
| RQ-002 | `server_trust_model` | Remote operation must support sovereign E2E/tunnel-only and governed Gateway trust modes. | Remote actor, node identity, and conformance contracts expose both trust modes. |
| RQ-003 | `remote_surface_parity` | Stable local capabilities must be classified as `remote-safe`, `local-only`, `blocked`, or `pending`. | Surface contract and interface matrix include the four states; `claw remote classify` exposes them. |
| RQ-004 | `topology_priority` | Personal devices and headless/server deployments use the same architecture. | Headless host, multi-tenant Gateway, and personal mesh routes share the same conformance contract. |
| RQ-005 | `sync_authority_model` | Synchronization authority is assigned per resource. | `SyncResourceManifest` records authority, owner node, residency, route IDs, and allowed peers. |
| RQ-006 | `remote_secrets_model` | Secrets sync as references only; operations require brokered leases and audit. | Secret policy forbids plaintext replication and remote secret lease contracts return no plaintext. |
| RQ-007 | `transport_contract` | Iroh is the v1 adapter, but the stable contract remains transport-agnostic. | Route graph includes `claw.transport.iroh`; conformance reports `transport_agnostic_iroh_v1_adapter`. |
| RQ-008 | `remote_api_shape` | Remote APIs project the same registered local contracts, not a separate mobile/Relay API. | Gateway routes broker SDK/service/CLI contracts through registered surface nodes. |
| RQ-009 | `offline_behavior` | Interactive commands fail fast; sync uses queued planning, cursors, changelogs, and reconciliation. | `buildSyncPlan` returns dry-run actions, changes, conflicts, and next cursors with `writes: false`. |
| RQ-010 | `remote_actor_model` | Humans, devices, agents, services, and organizations share actor/action/resource/policy/audit semantics. | Remote actor context schema includes those actor kinds and route-level audit requirements. |
| RQ-011 | `headless_host_model` | A terminal/headless install is a complete host, not a reduced Relay sidecar. | `gateway.headlessAgentHost` and `claw.headlessHost` are required surfaces. |
| RQ-012 | `first_vertical_slice` | Closure must cover chat, sync, search, secret references, and server-hosted agents; no narrow one-route slice. | Required routes include chat, search, secret broker operation, sync resources, headless host, and multi-tenant agent service. |
| RQ-013 | `sync_substrate` | Manifests and changelogs govern sync without constraining the physical driver. | Supported sync drivers include skills, memory/user-model, sessions, drive/files, blobs, SQLite, partial SQLite, sidecars, search indexes, agent config, and workspace state. |
| RQ-014 | `conflict_default` | Conflicts detect and elevate by default; silent overwrite is forbidden. | Sync plans emit `conflict` actions and open conflicts for diverged snapshots. |
| RQ-015 | `client_cache_policy` | Client cache is minimal, encrypted, TTL-bound, and cannot store secrets or authoritative state. | Sync cache policy requires encryption, TTL, `storesSecrets: false`, and `storesAuthoritativeState: false`. |
| RQ-016 | `guardrail_strictness` | After baseline closure, gaps fail closed instead of staying implicit. | Conformance reports missing routes/nodes and marks each decision `must_verify_before_goal_completion`. |
| RQ-017 | `compat_policy` | Existing Relay/mobile routes stay as compatibility adapters while clients migrate. | ADR 0022 and Relay docs preserve compatibility while naming Gateway/Connector as canonical. |
| RQ-018 | `hosted_service_position` | Hosted and self-hosted deployments must share one contract and conformance suite. | Gateway conformance reports hosted/self-hosted parity as required. |
| RQ-019 | `layer_names` | Canonical public names are Coordinator, Gateway, Connector, and Sync. | Docs, registry nodes, and CLI use these names. |
| RQ-020 | `mesh_collaboration_scope` | Mesh collaboration needs invitation, scoped share, and revocation primitives. | `mesh.resourceShare` and `nodes pair|trust|revoke` are required dry-run/signed-host surfaces. |
| RQ-021 | `agent_service_model` | Governed multi-tenant agent service must support assignments, budgets, isolation, and audit. | `gateway.multiTenantAgentService` is a required route and ADR 0022 records the governed service model. |
| RQ-022 | `sync_lateral_domains` | Sync must cover lateral domains: skills, memory, drive/files, sessions, agent config, workspace state, databases, sidecars, blobs, and indexes. | Sync drivers and required routes cover lateral domains with manifest-based governance. |
