# Remote Gateway And Sync Completion Audit

Source conversation: `019e36a3-c2e6-73b3-a3fe-f3e7340e42c8`

Reference plan item: `019e3732-c90e-7491-9217-37020c43217e-plan`

Closure state: `active_goal_not_complete`

This audit is the public final-close gate for the Remote Gateway and Sync
redesign. It is stricter than the decision matrix: the goal cannot be marked
complete while final source-session reread, provider/device validation, or any
required row below remains unresolved. Public files intentionally omit private
local session paths and maintainer-local goal paths.

Final close requires re-reading the source session one decision at a time and
confirming every row from
[Remote Gateway And Sync Source Decision Audit](./remote-gateway-sync-source-decision-audit.md)
is implemented, validated, or explicitly blocked as `EXTERNAL PENDING`.

## Requirement Status

| ID | Decision key | Closure status | Evidence | Remaining blocker before final close |
| --- | --- | --- | --- | --- |
| RQ-001 | `relay_boundary` | implemented | ADR 0022, Relay docs, route graph nodes, CLI roots, and conformance require Coordinator, Gateway, Connector, and Sync. | None beyond final source-session reread. |
| RQ-002 | `server_trust_model` | external_pending | Trust modes are modeled in conformance and node trust receipts. | Physical device acceptance remains `device_trust_acceptance` `EXTERNAL PENDING`. |
| RQ-003 | `remote_surface_parity` | implemented | Registry-wide Relay classification guard, `RemoteSurfaceClassificationReceipt`, `claw remote classify`, Relay classification routes, and executable `claw inspect remote` classify every surfaced node as `remote-safe` or explicit `local-only`, with no `pending` Relay classifications. | None beyond final source-session reread. |
| RQ-004 | `topology_priority` | external_pending | Personal mesh, headless host, self-hosted Gateway, and hosted project manifests share one contract. | Real hosted/self-hosted deployment validation remains `self_hosted_deployment` and `hosted_deployment` `EXTERNAL PENDING`. |
| RQ-005 | `sync_authority_model` | external_pending | `SyncResourceManifest`, `SyncAuthorityHandoffReceipt`, CLI `sync handoff`, and Relay authority handoff route exist. | Physical authority transfer remains `physical_authority_handoff`/provider validation pending. |
| RQ-006 | `remote_secrets_model` | external_pending | Secret references, broker leases, provider receipts, and no-plaintext contracts exist. | Real provider retrieval remains `provider_secret_retrieval` `EXTERNAL PENDING`. |
| RQ-007 | `transport_contract` | external_pending | Iroh is modeled as v1 adapter while conformance remains transport-agnostic. | Real multi-node Iroh handshake remains `physical_iroh_handshake` `EXTERNAL PENDING`. |
| RQ-008 | `remote_api_shape` | implemented | `RemoteRouteContractCatalog`, `claw remote contracts`, and Relay route contracts forbid parallel APIs, bind local refs to remote entrypoints, and Relay HTTP tests compare the exact contract route IDs against the core catalog. | Expand per-domain remote-safe conformance as each domain graduates. |
| RQ-009 | `offline_behavior` | implemented | Sync planner, queue, cursors, reconciliation, and fail-fast remote behavior are implemented and tested. | Physical provider application remains under Sync driver `EXTERNAL PENDING`. |
| RQ-010 | `remote_actor_model` | external_pending | Shared actor/action/resource/policy/audit schemas and Gateway audit receipts exist. | Signed host audit persistence remains `signed_host_audit_persistence` `EXTERNAL PENDING`. |
| RQ-011 | `headless_host_model` | implemented | `claw.headlessHost`, `gateway.headlessAgentHost`, CLI, docs, and route graph treat headless ClawJS as a full host. | None beyond final source-session reread. |
| RQ-012 | `first_vertical_slice` | external_pending | Route contracts cover chat, search, secret broker operation, sync, headless host, and multi-tenant agent service; `RemoteProviderDeviceE2EValidationPlan` requires those domains to validate together before the final provider/device row clears. | Real provider/device end-to-end validation remains `provider_device_e2e` `EXTERNAL PENDING`. |
| RQ-013 | `sync_substrate` | external_pending | Sync manifests, drivers, changelog/planner semantics, and driver application receipts cover the agreed substrates. | Physical driver execution remains `physical_sync_driver_application` `EXTERNAL PENDING`. |
| RQ-014 | `conflict_default` | implemented | Sync plans detect conflicts and elevate instead of silently overwriting. | None beyond final source-session reread. |
| RQ-015 | `client_cache_policy` | external_pending | `RemoteClientCacheSnapshot` enforces encrypted TTL cache, no secrets, no authoritative state, and no plaintext payload. | Real client storage validation remains `physical_client_storage` `EXTERNAL PENDING`. |
| RQ-016 | `guardrail_strictness` | implemented | Conformance, external-pending register, route catalog, classification receipts, and `claw inspect remote` expose fail-closed state; the goal verifier fails on missing Relay classifications, missing required routes/nodes, and any reintroduced `pending` Relay classification; Relay HTTP tests compare exact pending requirements and route contracts against core. | Physical/provider blockers remain explicit `EXTERNAL PENDING`, not hidden guardrail gaps. |
| RQ-017 | `compat_policy` | implemented | Compatibility adapter receipts map legacy Relay/mobile surfaces to canonical routes without parallel APIs. | Remove compatibility paths only after client migration. |
| RQ-018 | `hosted_service_position` | external_pending | Gateway deployment manifests and conformance cover hosted and self-hosted modes through one contract. | Real hosted/self-hosted rollout validation remains `EXTERNAL PENDING`. |
| RQ-019 | `layer_names` | implemented | Public canon consistently names Coordinator, Gateway, Connector, and Sync. | None beyond final source-session reread. |
| RQ-020 | `mesh_collaboration_scope` | external_pending | Mesh invitation, acceptance, share, and revocation receipts and routes exist. | Physical peer trust remains `physical_peer_trust` `EXTERNAL PENDING`. |
| RQ-021 | `agent_service_model` | external_pending | Multi-tenant agent service receipts cover assignment, budget, billing account, isolation, audit, and runtime intent. | Real runtime execution and billing meter persistence remain `agent_runtime_execution` and `billing_meter_persistence` `EXTERNAL PENDING`. |
| RQ-022 | `sync_lateral_domains` | implemented | Sync drivers and route contracts cover skills, memory/user model, sessions, drive/files, blobs, search indexes, SQLite, sidecars, agent config, and workspace state; sessions, blobs, sidecars, search indexes, agent config, and workspace state have explicit Sync routes. | Physical driver execution remains tracked by `RQ-013`, not as a lateral taxonomy blocker. |

## Hard Blockers

| ID | Status | Evidence | Required next action |
| --- | --- | --- | --- |
| SOURCE-REREAD-001 | reviewed_current | Source decisions are enumerated as `RQ-001` through `RQ-022`, the source Q/A review map records `QA-001` through `QA-023`, and both are guarded by `scripts/verify-remote-sync-goal.mjs`. | Before final close, repeat the source-session review against current implementation state and keep any physical/provider rows explicitly `EXTERNAL PENDING`. |
| PHYSICAL-001 | external_pending | `RemoteExternalPendingRegister` separates transport, device trust, peer trust, sync driver, authority handoff, client storage, provider, deployment, runtime, billing, and provider/device E2E blockers from bugs. | Run approved physical/provider validations or keep each row explicitly marked `EXTERNAL PENDING` with evidence. |
| DOMAIN-PARITY-001 | implemented | Registry-wide Relay classification exists for every surfaced node and the goal verifier rejects any reintroduced `pending` Relay classification. | Keep broad `local-only` classifications explicit until a policy, route, and test-backed `remote-safe` receipt exists. |

## Required Validation Map

| Area | Command or check |
| --- | --- |
| Goal verifier | `npm run test:remote-sync-goal` |
| Focused core/CLI tests | `npx vitest run --config vitest.config.ts packages/clawjs-core/src/index.test.ts packages/clawjs/src/inspect-cli.test.ts` |
| Relay HTTP routes | `npx vitest run --config vitest.config.ts relay/src/server/remote-sync-routes.test.ts`; this must compare `/v1/remote/external-pending`, `/v1/remote/route-contracts`, `/v1/remote/provider-device-e2e-plan`, and `/v1/remote/conformance` against the same core contracts used by CLI inspection. |
| CLI/router parity | `node --import tsx ./scripts/verify-cli-registry-router-parity.mjs` |
| Public executable inspection | `node packages/clawjs/bin/claw.mjs inspect remote --json` after building the CLI package |
| Public docs hygiene | `npm run code-hygiene:check` and `git diff --check` |

## Closure Rule

The goal may be closed only after a final pass confirms:

1. Every `RQ-001` through `RQ-022` row is implemented, validated, or explicitly
   accepted as `EXTERNAL PENDING`.
2. The source session for conversation
   `019e36a3-c2e6-73b3-a3fe-f3e7340e42c8` is re-read one decision-bearing
   answer at a time.
3. `RemoteExternalPendingRegister` contains every remaining physical/provider
   blocker and none of those rows is reported as a software bug.
4. `claw inspect remote`, `claw remote pending`, `claw remote contracts`,
   `claw remote e2e-plan`, Relay `/v1/remote/external-pending`, Relay
   `/v1/remote/route-contracts`, and Relay
   `/v1/remote/provider-device-e2e-plan` are verified against the same
   contracts.
5. The registry contains no `pending` Relay classification for a stable surfaced
   node; each such node is directly `remote-safe` or explicitly `local-only` or
   `blocked`.
6. The final answer to the user states that the goal is complete only if all
   rows above are closed; otherwise the goal remains active.
