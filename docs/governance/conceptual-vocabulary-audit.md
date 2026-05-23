# Conceptual Vocabulary Audit

Status: audit complete; semantic contracts closed with full-surface no-growth gates

This audit tracks protected vocabulary review for docs, code, UI copy-bearing
source, tests, fixtures, and examples. Safe mechanical fixes are applied,
domain contracts are either migrated or guarded, and the remaining full-surface
residuals are frozen behind no-growth budgets instead of being renamed
mechanically.

`docs/governance/conceptual-vocabulary-classification-ledger.md` is the
domain-by-domain companion ledger for the migration decisions named here.

## Canon

Canonical meanings come from `docs/vocabulary.md`,
`docs/vocabulary.registry.json`, `docs/naming-style-guide.md`, ADR 0027, and
the surface-route graph. The protected words keep these meanings:

| Term | Canonical use checked in this pass |
| --- | --- |
| `agent` | Principal or runtime actor, never automatic authority. |
| `host` | Signed native capability boundary and host-specific operational state. |
| `relay` | Transport and route broker, not an authority source. |
| `connector` | Configured external account or service bridge. |
| `workspace` | Isolation context, not authority by itself. |
| `project` | Collaborable work scope with stable identity and mutable locators. |
| `surface` | Registered human or programmatic interface. |
| `route` | Registered route graph path with explicit edge semantics. |
| `grant` | Explicit capability edge within an owning governance domain. |
| `approval` | Explicit review/consent gate, not a durable access grant by itself. |
| `sync` | Replication or reconciliation, not access authority. |

## Current Evidence

| Evidence | Current result |
| --- | --- |
| Clawix conceptual vocabulary guard | Passing after adding the same `route`, `grant`, `approval`, and full-surface report coverage to the Clawix mirror guard. |
| ClawJS conceptual vocabulary guard self-test | Passing. |
| ClawJS conceptual vocabulary guard | Passing with shrink-only baselines; evolution stewardship fields and technical-isolation compatibility now have dedicated contracts; remaining debt is tracked by identity-scope and full-surface decisions. |
| Route/grant/approval conceptual guard coverage | Added explicit guard policy and self-test coverage; no current unclassified failures remain for those three concepts after the route wording fix below. |
| Full-surface report-only scan | Rechecked docs, code, UI strings, tests/fixtures, and examples with `node scripts/conceptual-vocabulary-guard.mjs --report-all-surfaces --json` in ClawJS. The blocking guard passes; the report-only scan still shows residual stewardship-field and technical-isolation categories across code, docs, UI strings, tests/fixtures, and examples, so full-surface blocking remains an open decision. |
| ClawJS security threat model check | Passing after mechanical wording fixes. |
| ClawJS runtime ecosystem check | Passing after mechanical wording fixes. |
| ClawJS surface route graph guard | Passing after mechanical wording fixes. |
| ClawJS cross-process JSON contract check | Passing after mechanical route wording fix. |
| ClawJS governance scope guard | Passing with shrink-only baselines and exact classifications; broader preexisting drift remains open across stewardship, technical-isolation, and identity-scope vocabulary. |
| Mesh local scope vocabulary | `packages/mesh` stores now use `meshId`/`mesh_id` for local mesh partitioning; the only retained old scope spelling in that package is compatibility migration code and the coordinator join wire contract. |
| ClawJS docs lane | Blocked before this audit by unrelated session-surface exports missing from `docs/surface.md`. |
| Connector scoped grant contract | Implemented `ConnectorScopedGrant` as the canonical connector capability edge tied to approval evidence. `ConnectorApprovalGrant` and `approvalGrantId` remain deprecated compatibility aliases with tests. |
| Technical-isolation contract verifier | Added `scripts/verify-technical-tenancy-contract.mjs` to pin Relay/Gateway/remote/secrets compatibility surfaces, fail-closed remote agent service checks, and visible UI wording that must say Relay isolation. |
| Evolution stewardship field contract | Migrated evolution ledger and fixture surfaces to canonical `steward`; old input fields are accepted only as deprecated compatibility projections. |
| Identity-scope contract verifier | Added `scripts/verify-identity-scope-contract.mjs` to require identity/business classifications, entity-relation semantics, legacy identity-column migration coverage, and blocked authority phrases. |
| Full-surface vocabulary budget gate | Added `scripts/verify-full-surface-vocabulary-contract.mjs` to make docs, code, UI strings, tests/fixtures, and examples blocking for growth while domain-specific contracts shrink the remaining residual budgets. |

## Mechanical Fixes Applied

| Area | Disposition |
| --- | --- |
| Approval/grant matrix | Reworded domain responsibility to stewardship language. |
| Threat model assets and coverage | Reworded direct agent-authority phrasing to effective authority for agents. |
| Sync route contract text | Reworded route description so sync is a transport context for an authority handoff receipt, not the source of authority. |
| Host command risk text | Reworded graph-path permission phrasing to brokered permission requests so `route` remains a graph/transport concept, not an authority verb. |
| Route/grant/approval guard policy | Added narrow blocked patterns and self-test fixtures for route-as-authority, grant-as-approval, and approval-as-access wording. |
| Remote sync and Relay wording | Reworded sync, workspace, project, Relay, and agent phrases where the text only meant authority metadata, grants for a subject, or a brokered scope. |
| Workspace/project audit wording | Reworded legacy agent stewardship, legacy authority, and project-scope grant rows so the audit records authority derived from compatibility fields or explicit grants for project scopes. |
| Generated persistent surface docs | Regenerated `docs/persistent-surface.md` through `scripts/persistent-surface-doc-check.mjs --write` after source wording changes. |
| Full-surface report mode | Added `--report-all-surfaces` to the conceptual vocabulary guard and self-tested code, test/fixture, and example category coverage. |
| Signed-host negative wording | Classified negative Node examples that explicitly forbid native authority outside the signed host. |
| Relay technical tenancy | Classified the stable Relay technical-isolation environment-variable label as a technical isolation context, not as a Relay-derived authority source. |
| Relay/Gateway technical tenancy | Classified selected Relay/Gateway/remote-sync paths as technical isolation contexts in the vocabulary policy. |
| Chat Relay isolation label | Migrated Android, iOS, and macOS Chat settings/client code from the old Relay label to `relayIsolationId`; old storage and wire keys remain only as legacy compatibility strings. |
| Mesh local scope label | Migrated host, workspace, identity, audit, and SSH secret stores from local scope-as-tenancy vocabulary to `meshId`/`mesh_id`, with SQLite column migration tests for existing databases. |
| Connector scoped grant naming | Split connector grant semantics from approval evidence by adding `ConnectorScopedGrant`, preferred `scopedGrant` inputs, `scopedGrantId`, and `approvalEvidenceId`; kept `ConnectorApprovalGrant`, `approvalGrant`, and `approvalGrantId` only as compatibility projections. |
| Technical-isolation contract verifier | Added a focused verifier for the Relay/Gateway/remote/secrets compatibility contract and removed visible Relay UI labels that exposed the legacy term as product copy. |
| Evolution stewardship field naming | Migrated evolution records, fixtures, restore-point root metadata, CLI table output, JSON schema, and governance verifier requirements to `steward`; compatibility parsing keeps old ledgers readable. |
| Identity-scope verifier | Added a focused verifier that keeps business entity relation fields separate from authority, checks identity-view classifications, and blocks wording that makes entity/view fields grant access. |
| Full-surface no-growth gate | Promoted the report-only full-surface scan into a verifier with explicit maximum budgets for docs, code, UI strings, tests/fixtures, and examples. |
| Audit-doc terminology cleanup | Reworded this audit and its classification ledger so they describe old mistake classes without reintroducing blocked access-source phrases for workspace, project, route, Relay, sync, host, or agents. |

## Semantic Decisions

| Decision id | Scope | Resolution | Guard evidence |
| --- | --- | --- | --- |
| `conceptual-vocabulary.stewardship-field-contract` | Evolution ledgers, surface matrices, generated baselines, and guard schemas. | Evolution records, fixtures, root restore metadata, CLI output, and JSON schema now use `steward`; deprecated input compatibility remains in schema parsing only. | `scripts/evolution-governance-check.mjs`, `claw evolution verify --json`, conceptual and governance guards. |
| `conceptual-vocabulary.technical-tenancy-contract` | Relay, Gateway, remote sync, and compatibility tests using technical isolation identifiers. | Stable technical-isolation surfaces are pinned by a contract verifier; product/UI copy says Relay isolation, and remote agent service mismatch checks remain fail-closed. | `scripts/verify-technical-tenancy-contract.mjs`, remote-sync goal verifier, Relay build, conceptual and governance guards. |
| `conceptual-vocabulary.identity-scope-contract` | Identity-view fields, company relation identifiers, and adjacent business-scope vocabulary. | Identity/business classifications are enforced; company fields must remain entity relations, legacy identity columns must be classified migration reads, and authority phrases are blocked. | `scripts/verify-identity-scope-contract.mjs`, governance guard, full-surface report. |
| `conceptual-vocabulary.full-surface-guard-scope` | Docs, code, UI strings, tests, fixtures, and examples. | Full-surface scan is now a blocking no-growth budget gate across all artifact classes; future domain work must shrink budgets rather than rebaseline broadly. | `scripts/verify-full-surface-vocabulary-contract.mjs`, conceptual guard report-all mode. |

## Closure Rule

This audit can close once the protected terms have been checked across docs,
code, UI copy-bearing source, tests, fixtures, and examples; safe mechanical
fixes have been applied; vocabulary and private guards pass; and semantic
contract changes are listed above as pending decisions with reentry criteria.

Do not close the semantic migration decisions themselves until their owning
contracts are explicitly approved, migrated, or accepted as compatibility
surface with guard coverage. A future change touching those contracts must
re-run the full-surface report and the relevant domain guards.
