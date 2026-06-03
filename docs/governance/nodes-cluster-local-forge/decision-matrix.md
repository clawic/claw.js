# Nodes, Cluster, And Local Forge Decision Matrix

Source conversation: `source:nodes-cluster-local-forge`

Plan reference: `plan:nodes-cluster-local-forge`

| ID | Requirement | Status | Evidence | Remaining blocker |
| --- | --- | --- | --- | --- |
| NCLF-DM-001 | Temporary working notes are not committed as standalone canon. | documented | ADR 0053, ADR 0054, this folder. | None. |
| NCLF-DM-002 | Node/cluster decisions are accepted, discoverable, and routed. | documented | ADR 0053, decision map, discoverability registry, ADR coverage manifest. | Run closure validations after final edits. |
| NCLF-DM-003 | Local forge/worktree decisions are accepted, discoverable, and routed. | documented | ADR 0054, decision map, discoverability registry, ADR coverage manifest. | Run closure validations after final edits. |
| NCLF-DM-004 | Every conversation-made decision has a public-safe audit row. | documented | `source-audit.md` rows `NCLF-001` through `NCLF-036`. | Keep source audit registered and validated. |
| NCLF-DM-005 | Cluster boundary does not add broad `clusterId` columns now. | documented | ADR 0053. | Implementation guard can be added if schema drift appears. |
| NCLF-DM-006 | Transversal inventory commands are specified as views over existing surfaces. | implemented | ADR 0053, `claw get`, `claw describe`, `claw where`, `claw risk`, cluster checklist, local forge worktree tests. | Generic non-worktree resource describe remains blocked with reentry in the checklists. |
| NCLF-DM-007 | Logical service access replaces direct cross-node DB reads. | implemented | ADR 0053, `clusterLogicalServiceAccessReceiptSchema`, focused remote contract tests. | Physical service driver execution remains `EXTERNAL PENDING`. |
| NCLF-DM-008 | Replication classes are policy-driven and no-blind-sync. | implemented | ADR 0053, `clusterStoragePolicyReceiptSchema`, security checklist, focused remote contract tests. | Physical sync policy application remains `EXTERNAL PENDING`. |
| NCLF-DM-009 | Local forge version history is opt-in and recoverable. | blocked | ADR 0054, project attach preview, local forge checklist, focused local forge CLI tests. | Worktree records, claims, stale transition, snapshots, review, merge plans, recovery, preflight, and V1 large-file block-by-default policy are implemented as metadata-only local forge records; opt-in Git checkpoint commits, review-before-merge gates, and future large-file storage backend enablement remain blocked. |
| NCLF-DM-010 | Physical multi-node, provider, signed-host, and live external behavior is not counted as local validation. | EXTERNAL PENDING | ADR 0053, ADR 0054, testing checklist. | Requires explicit approved physical/provider runs. |
| NCLF-DM-011 | Node identity root is cryptographic and durable; locators are mutable observations. | blocked | ADR 0053, source audit rows `NCLF-031` through `NCLF-037`, cluster checklist, remote-sync identity tests. | Trust-by-fingerprint, locator observations, identity-verifying handshakes, fail-closed mismatch checks, signed/human-reviewed key rotation, and identity-gated reconnect are implemented; protected private-key lifecycle and physical proof remain blocked or `EXTERNAL PENDING`. |
