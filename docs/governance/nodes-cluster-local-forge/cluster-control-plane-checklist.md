# Cluster Control Plane Checklist

Use this checklist for implementation work under ADR 0053.

## Boundary And Vocabulary

- [x] ADR 0053 states `node` as public vocabulary and `cluster` as internal/advanced authority boundary.
- [x] ADR 0053 states the V1 active cluster boundary is the framework root, normally `~/.claw`.
- [x] ADR 0053 blocks broad `clusterId` columns until a later ADR proves they are needed.
- [ ] blocked: User-facing copy hides cluster/control-plane terms for single-computer users. Blocker: Clawix connected-computer UI copy is outside this local ClawJS batch. Reentry: implement the Clawix human flow and run its UI/copy checks. Evidence required: rendered Clawix screenshots or tests showing single-computer copy without cluster/control-plane terms.
- [x] CLI help distinguishes ordinary node/resource views from advanced cluster inspection. Evidence: `claw get`, `claw describe`, `claw where`, and `claw risk` are registered local-read inventory views in `packages/clawjs-core/src/cli-command-registry.ts`; advanced node trust remains under `claw nodes`.

## Node Model

- [x] Define node identity fields: node id, display name, host kind, platform, public key ref, trust mode, and state. Evidence: `nodeIdentitySchema` in `packages/clawjs-core/src/remote-sync-schemas.ts`.
- [x] Define node states: `online`, `offline`, `stale`, `retired`, plus reviewed optional `joining`, `degraded`, and `quarantined`. Evidence: `nodeStateSchema` in `packages/clawjs-core/src/remote-sync-schemas.ts`.
- [x] Expose node capacity and health through bounded system/monitor summaries. Evidence: `claw nodes list`, `claw get nodes`, `claw describe node`, and `claw risk node` include `operationalSummary` with `bounded: true`, `startsPolling: false`, `grantsAuthority: false`, health summary, and capacity summary; focused CLI tests cover the contract.
- [x] Keep native permission and sensitive host execution under signed-host boundaries. Evidence: node trust and heartbeat surfaces remain dry-run or Coordinator/signed-host gated; no private key storage or native permission path was added in Node.
- [x] Add tests for stale/offline node rendering and no implicit authority grant. Evidence: `packages/clawjs/src/cli-remote-sync-command.test.ts` checks offline registry nodes and locator/discovery authority false.

## Durable Identity And Locators

- [ ] blocked: Generate or import a device-local node keypair when a framework root is initialized. Blocker: protected device-local private-key storage belongs to signed host or OS secure storage, not plaintext Node fixtures. Reentry: add a signed-host/secure-storage key lifecycle contract and isolated tests. Evidence required: key generation/import receipt with no plaintext key in main DB, docs, logs, or fixtures.
- [x] Derive `nodeId` from the public key fingerprint or bind it to that fingerprint with a verifiable record. Evidence: `createNodeIdentity` derives a deterministic fingerprint and default node id from public key material; explicit `nodeId` remains bound to `nodeFingerprint`.
- [x] Extend the node identity model with `nodeFingerprint`, `publicKeyRef`, `keyAlgorithm`, `createdAt`, `rotatedFrom`, and `observedLocators`. Evidence: `nodeIdentitySchema` in `packages/clawjs-core/src/remote-sync-schemas.ts`.
- [ ] blocked: Store private node key material only in protected local storage; never in plaintext docs, logs, fixtures, or the main database. Blocker: no protected private-key storage implementation exists in this repo batch. Reentry: implement signed-host/OS storage integration. Evidence required: storage-boundary and privacy tests proving plaintext private keys cannot enter public artifacts or `core.sqlite`.
- [x] Treat display name, hostname, LAN IP, public IP, Tailscale address, Relay endpoint, Iroh route, and similar values as mutable locators. Evidence: `observedNodeLocatorSchema` marks locator `authority: false`.
- [x] Refresh observed locators through bounded heartbeat/discovery records without changing node identity. Evidence: `RemoteTransportHandshakeReceipt` includes identity fields separately from `transportReachable`; CLI heartbeat accepts expected/responder fingerprints.
- [x] Keep stale locators as historical observations until expiry or replacement; do not delete or distrust the node only because a locator is stale. Evidence: remote contract test keeps multiple observed locators on one `nodeId`.
- [x] Make `NodeTrustDecision` trust the `nodeId` and public key fingerprint, not a network address. Evidence: `nodeTrustDecisionSchema` uses `subjectNodeFingerprint`, `trustSubject: node_identity_fingerprint`, and `locatorAuthority: false`.
- [x] Make `RemoteTransportHandshakeReceipt` prove possession of the expected private key and separate `identityVerified` from `transportReachable`. Evidence: `proofOfPossession`, `identityVerified`, `transportReachable`, and `keyMismatch` fields in `remoteTransportHandshakeReceiptSchema`; focused tests cover verified and mismatched cases.
- [x] Require signed old-key rotation or explicit human re-pairing before accepting a changed key for an existing node. Evidence: `nodeKeyRotationReceiptSchema`, `createNodeKeyRotationReceipt`, and focused remote contract tests reject unsigned key changes fail-closed and accept only signed old-key rotation or explicit human re-pairing refs.
- [x] Fail closed when a known locator responds with an unknown or mismatched key. Evidence: `evaluateRemoteTransportIdentity` returns `failClosed: true` for fingerprint mismatch.
- [x] Treat Iroh, rendezvous, Relay, Tailscale, and LAN discovery as transport/discovery only, never as authority. Evidence: handshake and locator schemas expose `discoveryAuthority: false` and locator `authority: false`.
- [x] Expose `claw nodes list --json`, `claw nodes pair/trust/heartbeat --json`, `claw describe node <node-id>`, and `claw where node <node-id>` with stable identity and observed locator fields. Evidence: `packages/clawjs/src/cli-remote-sync-command.ts`, CLI registry entries, and focused CLI tests.
- [x] Add tests for signed key rotation. Evidence: focused remote contract tests cover unsigned rotation fail-closed, signed old-key rotation, and human re-pairing acceptance.
- [x] Add reconnect after locator refresh tests. Evidence: `nodeReconnectReceiptSchema`, `createNodeReconnectReceipt`, and focused remote contract tests keep remote work unavailable on fingerprint mismatch and make it available only after verified proof-of-possession handshake.

## Resource Location

- [x] Treat workspaces, projects, worktrees, files, database records, sessions, skills, secrets refs, connectors, jobs, indexes, grants, and incidents as inventory resources. Evidence: `claw get resources --json` returns the registered inventory resource classes.
- [x] Implement `claw get <resource>` as an index/view layer over existing domain commands. Evidence: `claw get nodes|resources|worktrees --json`; worktrees read local forge records when present and otherwise return an explicit `blocked` state with reentry.
- [x] Implement `claw describe node <node-id>` and `claw describe resource <res-id>` without duplicating domain logic. Evidence: node description reads registry-backed node contracts; generic resource description is blocked with reentry until the transversal resource store exists.
- [x] Implement `claw where <resource-or-project-or-agent>` for resource location and authority. Evidence: `claw where node <node-id> --json` reports fingerprint authority and locators; `claw where project <id> --json` reports local forge checkout locators and authority service when a worktree record exists.
- [x] Implement `claw risk node <node-id>` to report what becomes unavailable or at risk if a node disappears. Evidence: `claw risk node <node-id> --json` returns `partial_local` risk and failover blocker/reentry.

## Logical Services And Replication

- [x] Route database-like access through logical framework services, not direct reads of another node database file. Evidence: `clusterLogicalServiceAccessReceiptSchema`, `createClusterLogicalServiceAccessReceipt`, and focused remote contract tests require `accessPath: logical_framework_service`, `directDatabaseFileRead: false`, and bounded access.
- [x] Classify `core.sqlite` as high-value structured state with snapshot/backup/standby policy. Evidence: `clusterStoragePolicyReceiptSchema` gives `core_sqlite` the `snapshot_backup_standby` replication class, disables direct cross-node file reads and blind replication, and focused remote contract tests cover the policy.
- [x] Keep secrets as refs/envelopes/brokered operations only; plaintext never replicates. Evidence: ADR 0053, existing remote secret lease/provider schemas, and no plaintext secret route added by this batch.
- [x] Keep full session/event stores node-local by default. Evidence: ADR 0053 remains the authority; no session replica/index implementation was added.
- [x] Keep runtime/job operational state node-local unless durable user-facing results are promoted. Evidence: no runtime/job replication route was added.
- [x] Replicate blobs/files only by manifest, demand, backup, or explicit residency policy. Evidence: `clusterStoragePolicyReceiptSchema` classifies `blob_file` as `manifest_demand_residency`; focused remote contract tests prove no blind replication or direct file read.
- [x] Treat search indexes and embeddings as rebuildable unless explicit shard policy says otherwise. Evidence: `clusterStoragePolicyReceiptSchema` classifies `search_index` as `rebuildable_or_explicit_shard`; focused remote contract tests cover the policy.
- [x] Keep raw metrics/logs node-local; expose current status, rollups, alerts, and incidents centrally. Evidence: `operationalSummary` remains bounded on node inventory views and `clusterStoragePolicyReceiptSchema` classifies `metrics_logs` as `node_local_bounded_rollup` with no physical driver required for raw log replication.

## Failover And Reconciliation

- [x] Define coordinator record, standby candidate record, epoch/term metadata, and audit receipt shape. Evidence: `clusterCoordinatorRecordSchema`, `createClusterCoordinatorRecord`, and focused remote contract tests cover coordinator id, standby nodes, epoch, term, status, and audit id.
- [x] Define last-known-good local policy snapshot behavior. Evidence: `clusterPolicySnapshotSchema`, `createClusterPolicySnapshot`, and focused remote contract tests cover last-known-good snapshots, expiry, authorized local work, and fail-closed flags.
- [x] Fail closed for new cluster-authority decisions when the coordinator is unavailable. Evidence: `evaluateClusterAuthority` denies `new_authority_decision` with `failClosed: true` and reason `coordinator_unavailable_new_authority_denied` when the policy snapshot says the coordinator is unavailable.
- [x] Permit already authorized local work to continue when policy allows. Evidence: `evaluateClusterAuthority` allows `authorized_local_work` for nodes in the last-known-good authorized set while still denying new authority decisions.
- [x] Define export/restore recovery before stronger election/quorum behavior. Evidence: `clusterExportRestoreReceiptSchema`, `createClusterExportRestoreReceipt`, and focused remote contract tests create non-destructive export/restore previews that include `core.sqlite` and policy snapshots while physical restore remains externally pending.
- [ ] EXTERNAL PENDING: Mark physical multi-node promotion proof as `EXTERNAL PENDING` until approved evidence exists. Blocker: requires approved isolated physical multi-node run. Reentry: run approved device evidence with temporary roots only. Evidence required: redacted coordinator/standby promotion receipts and logs.

## Closure Evidence

- [x] Add focused CLI/core tests for each implemented view. Evidence: `packages/clawjs-core/src/index-remote-contracts.test.ts`, `packages/clawjs/src/cli-remote-sync-command.test.ts`.
- [x] Add storage-boundary tests for logical service access. Evidence: focused remote contract tests assert `directDatabaseFileRead: false`, `directCrossNodeFileRead: false`, and `blindReplication: false` for logical service and storage policy receipts.
- [x] Add route/inspect/discoverability coverage for every new stable surface. Evidence: CLI registry entries, generated router, `surface-registry-contracts.ts` narratives/resource contracts, and `node --import tsx scripts/verify-cli-registry-router-parity.mjs`.
- [x] Run `npm run test:docs`, route checks, and affected remote/sync/governance tests after implementation. Evidence: final `npm run test:docs` passed; affected remote/sync/governance tests, route checks, docs build, storage-boundary, source-audit, discoverability, ADR coverage, surface checks, persistent-surface, evolution, source-size, codebase manifest, and code-hygiene checks passed.
