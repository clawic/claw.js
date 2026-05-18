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
| RQ-004 | `topology_priority` | external_pending | Personal mesh, personal host/server topology, headless host, self-hosted Gateway, hosted project manifests, Mac host, Linux host, Windows host, VPS host, mobile client, and browser client are explicit provider/device topology targets under one contract. | Real hosted/self-hosted deployment and physical multi-device validation remain `self_hosted_deployment`, `hosted_deployment`, `physical_iroh_handshake`, and `device_trust_acceptance` `EXTERNAL PENDING`. |
| RQ-005 | `sync_authority_model` | external_pending | `SyncResourceManifest`, `SyncAuthorityHandoffReceipt`, CLI `sync handoff`, and Relay authority handoff route exist. | Physical authority transfer remains `physical_authority_handoff`/provider validation pending. |
| RQ-006 | `remote_secrets_model` | external_pending | Secret references, broker leases, provider receipts, and no-plaintext contracts exist. | Real provider retrieval remains `provider_secret_retrieval` `EXTERNAL PENDING`. |
| RQ-007 | `transport_contract` | external_pending | Iroh is modeled as v1 adapter while conformance remains transport-agnostic. | Real multi-node Iroh handshake remains `physical_iroh_handshake` `EXTERNAL PENDING`. |
| RQ-008 | `remote_api_shape` | implemented | `RemoteRouteContractCatalog`, `claw remote contracts`, and Relay route contracts forbid parallel APIs, bind local refs to remote entrypoints, and Relay HTTP tests compare the exact contract route IDs against the core catalog. | Expand per-domain remote-safe conformance as each domain graduates. |
| RQ-009 | `offline_behavior` | implemented | Sync planner, queue, cursors, reconciliation, and fail-fast remote behavior are implemented and tested. | Physical provider application remains under Sync driver `EXTERNAL PENDING`. |
| RQ-010 | `remote_actor_model` | external_pending | Shared actor/action/resource/policy/audit schemas and Gateway audit receipts exist. | Signed host audit persistence remains `signed_host_audit_persistence` `EXTERNAL PENDING`. |
| RQ-011 | `headless_host_model` | implemented | `claw.headlessHost`, `gateway.headlessAgentHost`, CLI, docs, and route graph treat headless ClawJS as a full host. | None beyond final source-session reread. |
| RQ-012 | `first_vertical_slice` | external_pending | Route contracts cover chat, search, secret broker operation, sync, headless host, and multi-tenant agent service; `RemoteProviderDeviceE2EValidationPlan` requires those domains to validate together before the final provider/device row clears and exposes per-domain `validationSteps` binding routes, external blockers, artifacts, and acceptance criteria. | Real provider/device end-to-end validation remains `provider_device_e2e` `EXTERNAL PENDING`. |
| RQ-013 | `sync_substrate` | external_pending | Sync manifests, drivers, changelog/planner semantics, and driver application receipts cover the agreed substrates. | Physical driver execution remains `physical_sync_driver_application` `EXTERNAL PENDING`. |
| RQ-014 | `conflict_default` | implemented | Sync plans detect conflicts and elevate instead of silently overwriting. | None beyond final source-session reread. |
| RQ-015 | `client_cache_policy` | external_pending | `RemoteClientCacheSnapshot` enforces encrypted TTL cache, no secrets, no authoritative state, and no plaintext payload. | Real client storage validation remains `physical_client_storage` `EXTERNAL PENDING`. |
| RQ-016 | `guardrail_strictness` | implemented | Conformance, external-pending register, external validation evidence template, source Q/A review template, route catalog, classification receipts, and `claw inspect remote` expose fail-closed state; the approval request carries required domains, topology targets, and route IDs while keeping `approved: false`; external validation is artifact-only clearable: raw evidence rows remain report-only, and rows can clear only when submitted inside a source-bound and approval-request-bound `RemoteExternalValidationEvidenceArtifact` with `approvedRunRef`, physical evidence, artifacts, criteria, and no plaintext; `invalidEvidenceRequirementIds` and `duplicateEvidenceRequirementIds` keep unknown or repeated evidence rows from being silently accepted; versioned source Q/A and external evidence artifacts are rejected if their source conversation or plan IDs do not match this goal; source Q/A rows tied to physical/provider blockers must use `external_pending` until those rows clear, duplicate source Q/A rows are exposed as `duplicateSourceQaIds`, and disposition mismatches are exposed as `invalidExternalPendingDispositionQaIds`; the goal verifier fails on missing Relay classifications, missing required routes/nodes, missing validation-template/source-QA-template invariants, missing approval references, unknown/duplicate evidence IDs, duplicate source Q/A rows, invalid external-pending source dispositions, source-bound artifact mismatch, raw-row clearability, and any reintroduced `pending` Relay classification; Relay HTTP tests compare exact pending requirements, source Q/A template rows, and route contracts against core. | Physical/provider blockers remain explicit `EXTERNAL PENDING`, not hidden guardrail gaps. |
| RQ-017 | `compat_policy` | implemented | Compatibility adapter receipts map legacy Relay/mobile surfaces to canonical routes without parallel APIs. | Remove compatibility paths only after client migration. |
| RQ-018 | `hosted_service_position` | external_pending | Gateway deployment manifests and conformance cover hosted and self-hosted modes through one contract. | Real hosted/self-hosted rollout validation remains `EXTERNAL PENDING`. |
| RQ-019 | `layer_names` | implemented | Public canon consistently names Coordinator, Gateway, Connector, and Sync. | None beyond final source-session reread. |
| RQ-020 | `mesh_collaboration_scope` | external_pending | Mesh invitation, acceptance, share, and revocation receipts and routes exist. | Physical peer trust remains `physical_peer_trust` `EXTERNAL PENDING`. |
| RQ-021 | `agent_service_model` | external_pending | Multi-tenant agent service receipts cover assignment, budget, billing account, isolation, audit, and runtime intent. | Real runtime execution and billing meter persistence remain `agent_runtime_execution` and `billing_meter_persistence` `EXTERNAL PENDING`. |
| RQ-022 | `sync_lateral_domains` | implemented | Sync drivers and route contracts cover skills, memory/user model, sessions, drive/files, blobs, search indexes, SQLite, sidecars, agent config, and workspace state; sessions, blobs, sidecars, search indexes, agent config, and workspace state have explicit Sync routes. | Physical driver execution remains tracked by `RQ-013`, not as a lateral taxonomy blocker. |

## External-Pending Closure Lists

The closure gate must expose this exact source Q/A list as requiring
`external_pending` until physical/provider evidence clears:

`QA-002`, `QA-004`, `QA-005`, `QA-006`, `QA-007`, `QA-010`, `QA-012`,
`QA-013`, `QA-015`, `QA-018`, `QA-020`, and `QA-021`.

The external-pending register and default closure gate must expose this exact
external requirement list as blocked until approved evidence clears:

`physical_iroh_handshake`, `device_trust_acceptance`, `physical_peer_trust`,
`physical_sync_driver_application`, `physical_authority_handoff`,
`signed_host_audit_persistence`, `physical_client_storage`,
`provider_secret_retrieval`, `self_hosted_deployment`, `hosted_deployment`,
`agent_runtime_execution`, `billing_meter_persistence`, and
`provider_device_e2e`.

## Hard Blockers

| ID | Status | Evidence | Required next action |
| --- | --- | --- | --- |
| SOURCE-REREAD-001 | reviewed_current | Source decisions are enumerated as `RQ-001` through `RQ-022`, the source Q/A review map records `QA-001` through `QA-023`, `docs/remote-gateway-sync-source-qa-review.json` records the current one-by-one dispositions/evidence refs, and all are guarded by `scripts/verify-remote-sync-goal.mjs`. | Before final close, repeat the source-session review against current implementation state and keep any physical/provider rows explicitly `EXTERNAL PENDING`. |
| PHYSICAL-001 | external_pending | `RemoteExternalPendingRegister` separates transport, device trust, peer trust, sync driver, authority handoff, client storage, provider, deployment, runtime, billing, and provider/device E2E blockers from bugs; `docs/remote-gateway-sync-external-validation-evidence.json` records the current no-write unapproved evidence rows for all 13 blockers and binds the source-bound artifact to the matching `RemoteExternalValidationApprovalRequest` via `approvalRequestId`. | Run approved physical/provider validations, replace each placeholder row with approved evidence including `approvedRunRef` and physical evidence inside the same source-bound and approval-request-bound artifact, or keep each row explicitly marked `EXTERNAL PENDING`. |
| DOMAIN-PARITY-001 | implemented | Registry-wide Relay classification exists for every surfaced node and the goal verifier rejects any reintroduced `pending` Relay classification. | Keep broad `local-only` classifications explicit until a policy, route, and test-backed `remote-safe` receipt exists. |

## Required Validation Map

| Area | Command or check |
| --- | --- |
| Goal verifier | `npm run test:remote-sync-goal` |
| Source-session reread verifier | `REMOTE_SYNC_SOURCE_SESSION=<local-source-session-jsonl> node scripts/verify-remote-sync-source-session.mjs`; this is opt-in because the session path is maintainer-local and must not be committed. |
| Focused core/CLI tests | `npx vitest run --config vitest.config.ts packages/clawjs-core/src/index.test.ts packages/clawjs/src/inspect-cli.test.ts` |
| Relay HTTP routes | `npx vitest run --config vitest.config.ts relay/src/server/remote-sync-routes.test.ts`; this must compare `/v1/remote/external-pending`, `/v1/remote/external-validation-checklist`, `/v1/remote/external-validation-template`, `/v1/remote/external-validation-artifact`, `/v1/remote/external-validation-runbook`, `/v1/remote/external-validation-readiness`, `/v1/remote/external-validation-approval-request`, `/v1/remote/external-validation-report`, `/v1/remote/source-qa-template`, `/v1/remote/closure-gate`, `/v1/remote/route-contracts`, `/v1/remote/provider-device-e2e-plan`, and `/v1/remote/conformance` against the same core contracts used by CLI inspection. |
| CLI/router parity | `node --import tsx ./scripts/verify-cli-registry-router-parity.mjs` |
| Public executable inspection | `node packages/clawjs/bin/claw.mjs inspect remote --json` after building the CLI package |
| Clawix remote mirror | In the public Clawix repo, `bash scripts/test.sh fast`; this runs `scripts/remote_canon_alignment_check.mjs` and verifies the Clawix interface matrix/ADR mirror stays a consumer of ClawJS Coordinator/Gateway/Connector/Sync route anchors, not a second source of truth. |
| Public docs hygiene | `npm run code-hygiene:check` and `git diff --check` |

## Current Validation Evidence

As of 2026-05-18, the public Clawix mirror validation has been rerun after the
artifact-only external validation mirror update. `bash scripts/test.sh fast`
completed successfully in the public Clawix repo, including
`scripts/remote_canon_alignment_check.mjs`, `scripts/code-hygiene-check.mjs`,
public hygiene, interface surface guard, doc alignment, source size, Swift
package tests, and web Vitest tests. This proves the Clawix route/interface
mirror is current with ClawJS Coordinator/Gateway/Connector/Sync canon while
remaining a consumer of the framework graph, not a second remote API source of
truth.

The public ClawJS executable inspection was also rerun after
`npm run build:packages`: `node packages/clawjs/bin/claw.mjs inspect remote
--json` returned `baseline_registered` conformance, 16 remote route contracts,
13 external-pending requirements, 57 Relay-classified surfaces, zero Relay
`pending` classifications, zero Relay `blocked` classifications, an
`external_pending` external validation report with 13 blocked requirements, and
a `blocked` closure gate with `source_qa_review` and `external_validation`
blockers. This keeps executable inspection aligned with the completion audit:
software/source review can be checked locally, while physical/provider evidence
still requires approved external validation.

The focused core/CLI and Relay HTTP route tests were rerun as listed above.
`npx vitest run --config vitest.config.ts packages/clawjs-core/src/index.test.ts
packages/clawjs/src/inspect-cli.test.ts` passed with 2 files and 42 tests.
`npx vitest run --config vitest.config.ts
relay/src/server/remote-sync-routes.test.ts` passed with 1 file and 1 test.
Together they cover the core remote contracts, inspect CLI payload, and Relay
HTTP route parity for external-pending, validation checklist/template/artifact,
runbook, readiness, approval request, report, source Q/A template, closure
gate, route contracts, provider/device E2E plan, and conformance.

## Closure Rule

The goal may be closed only after a final pass confirms:

1. Every `RQ-001` through `RQ-022` row is implemented, validated, or explicitly
   accepted as `EXTERNAL PENDING`.
2. The source session for conversation
   `019e36a3-c2e6-73b3-a3fe-f3e7340e42c8` is re-read one decision-bearing
   answer at a time, and
   `docs/remote-gateway-sync-source-qa-review.json` records disposition and
   evidence refs for `QA-001` through `QA-023`; duplicate Q/A rows are rejected
   and rows tied to physical/provider blockers must remain `external_pending`
   until those blockers clear. The verifier must prove this artifact clears the
   `source_qa_review` blocker while leaving physical/provider validation
   blocked. The opt-in source-session verifier must also pass locally when run
   with `REMOTE_SYNC_SOURCE_SESSION=<local-source-session-jsonl>`.
3. `RemoteExternalPendingRegister` contains every remaining physical/provider
   blocker and none of those rows is reported as a software bug. The current
   `docs/remote-gateway-sync-external-validation-evidence.json` artifact must
   remain non-clearable until real approved evidence is present. External
   validation is artifact-only clearable: raw evidence rows may be counted for
   reporting, but they must remain `external_pending` unless submitted through a
   source-bound and approval-request-bound
   `RemoteExternalValidationEvidenceArtifact`.
4. `claw inspect remote`, `claw remote pending`,
   `claw remote validation-checklist`, `claw remote validation-template`,
   `claw remote validation-artifact`, `claw remote validation-runbook`,
   `claw remote validation-readiness`,
   `claw remote validation-approval-request`,
   `claw remote validation-report`, `claw remote source-qa-template`,
   `claw remote closure-gate`, `claw remote contracts`,
   `claw remote e2e-plan`, Relay
   `/v1/remote/external-pending`, Relay
   `/v1/remote/external-validation-checklist`, Relay
   `/v1/remote/external-validation-template`, Relay
   `/v1/remote/external-validation-artifact`, Relay
   `/v1/remote/external-validation-runbook`, Relay
   `/v1/remote/external-validation-readiness`, Relay
   `/v1/remote/external-validation-approval-request`, Relay
   `/v1/remote/external-validation-report`, Relay
   `/v1/remote/source-qa-template`, Relay `/v1/remote/closure-gate`,
   Relay `/v1/remote/route-contracts`, and Relay
   `/v1/remote/provider-device-e2e-plan` are verified against the same
   contracts. Relay external validation report POST must accept the versioned
   evidence artifact shape, and Relay closure-gate POST must accept the source
   review artifact-native `items` array plus the source-bound and
   approval-request-bound external evidence artifact.
5. The registry contains no `pending` Relay classification for a stable surfaced
   node; each such node is directly `remote-safe` or explicitly `local-only` or
   `blocked`.
6. The final answer to the user states that the goal is complete only if all
   rows above are closed; otherwise the goal remains active.
