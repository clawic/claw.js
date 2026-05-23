# Pre-V1 Version Governance Completion Audit

Source conversation: `source:pre-v1-version-governance`.

Private maintainer provenance is tracked outside this public repository and
must be verified before maintainer closure.

## Decision Review

The source session was reviewed for `request_user_input` decision prompts before
closing the implementation goal. It contains 3 `request_user_input` prompts, 8 binding answers, and 0 excluded prompts for this version-governance plan.

| Decision id | User answer | Verification |
| --- | --- | --- |
| `v1_meaning` | `Pre-V1 mutable` | `clawPreV1VersionGovernancePolicy.phase` is `pre_v1_mutable`; ADR 0025 states current `v1` and `schemaVersion: 1` labels are provisional pre-release labels; Clawix mirrors the same policy in its local version-governance doc. |
| `approval_gate` | `Todo contrato publico` | `approvalGate.requiredForOwnedPublicContracts` is true, the blocked list covers package/schema/protocol/API/file-format/surface bumps, and release/version/publish scripts run the version-governance release gate. |
| `changesets_policy` | `Congelar bumps` | `.changeset/README.md` blocks ordinary new changesets during `pre_v1_mutable`; `docs/pre-v1-release-ledger.json` freezes the existing changeset baseline; release scripts require explicit approval. |
| `source_of_truth` | `ClawJS primero` | ADR 0025 names ClawJS as the canonical policy owner; `claw inspect version-governance --json` exposes the machine-readable policy; Clawix keeps only a mirror that points back to ClawJS. |
| `existing_versions` | `Renombrar agresivo` | The policy sets `ownedVersionPolicy.normalizeAggressively` to true; the guard blocks owned schema, protocol, route-prefix, and surface-id bumps above the current pre-release label. |
| `existing_changesets` | `Consolidar en ledger` | Existing changesets are represented by count, filename hash, and content hash in `docs/pre-v1-release-ledger.json`; those hashes are checked by `scripts/version-governance-check.mjs`. |
| `branch_policy` | `Main mutable` | `clawPreV1VersionGovernancePolicy.branchPolicy` is `main_mutable`; `docs/git-workflow.md` documents `main` as the mutable pre-release integration branch until V1 freeze. |
| `freeze_trigger` | `Frase explicita` | `freezeTrigger.kind` is `explicit_user_instruction`; ADR 0025 and release docs require explicit user approval before V1 freeze, release tags, package bumps, or publish flows. |

## Closure Gate

This audit is part of the normal version-governance check. Do not mark the
implementation goal complete unless this file, ADR 0025, the ledger, the
machine-readable policy, ClawJS inspect output, release gates, and the Clawix
mirror checks all pass.
