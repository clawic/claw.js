# Conceptual Vocabulary Audit

Status: active

This audit tracks protected vocabulary review for docs, code, UI copy-bearing
source, tests, fixtures, and examples. It is not a completion claim. The goal
can close only after the remaining semantic decisions below are resolved or
explicitly accepted as blocked with a reentry condition.

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
| ClawJS conceptual vocabulary guard | Failing by design while pending decisions remain; current failures are concentrated in legacy stewardship-field surfaces and technical-isolation compatibility. |
| Route/grant/approval conceptual guard coverage | Added explicit guard policy and self-test coverage; no current unclassified failures remain for those three concepts after the route wording fix below. |
| Full-surface report-only scan | Rechecked docs, code, UI strings, tests/fixtures, and examples with `node scripts/conceptual-vocabulary-guard.mjs --report-all-surfaces --json` in ClawJS and Clawix. Both reports now show residual hits only for legacy stewardship fields and technical-isolation identifiers; mechanical hits for the requested protected terms have been removed or classified. |
| ClawJS security threat model check | Passing after mechanical wording fixes. |
| ClawJS runtime ecosystem check | Passing after mechanical wording fixes. |
| ClawJS surface route graph guard | Passing after mechanical wording fixes. |
| ClawJS cross-process JSON contract check | Passing after mechanical route wording fix. |
| ClawJS governance scope guard | Failing with broader preexisting drift across stewardship, technical tenancy, and identity-scope vocabulary. |
| ClawJS docs lane | Blocked before this audit by unrelated session-surface exports missing from `docs/surface.md`. |

## Mechanical Fixes Applied

| Area | Disposition |
| --- | --- |
| Approval/grant matrix | Reworded domain responsibility to stewardship language. |
| Threat model assets and coverage | Reworded direct agent-authority phrasing to effective authority for agents. |
| Sync route contract text | Reworded route description so sync is a transport context for an authority handoff receipt, not the source of authority. |
| Host command risk text | Reworded `route permissions` to brokered permission requests so `route` remains a graph/transport concept, not an authority verb. |
| Route/grant/approval guard policy | Added narrow blocked patterns and self-test fixtures for route-as-authority, grant-as-approval, and approval-as-access wording. |
| Remote sync and Relay wording | Reworded `sync authority`, `workspace grant`, `workspace authority`, `project authority`, and `agent grants/permissions` where the phrase only meant authority metadata, grants for a subject, or a brokered scope. |
| Workspace/project audit wording | Reworded legacy agent stewardship, legacy authority, and `Project grants` rows so the audit records authority derived from compatibility fields or explicit grants for project scopes. |
| Generated persistent surface docs | Regenerated `docs/persistent-surface.md` through `scripts/persistent-surface-doc-check.mjs --write` after source wording changes. |
| Full-surface report mode | Added `--report-all-surfaces` to the conceptual vocabulary guard and self-tested code, test/fixture, and example category coverage. |
| Signed-host negative wording | Classified negative `Node-owned` examples that explicitly forbid native authority outside the signed host. |
| Relay technical tenancy | Classified the stable Relay technical-isolation environment-variable label as a technical isolation context, not Relay authority. |
| Relay/Gateway technical tenancy | Classified selected Relay/Gateway/remote-sync paths as technical isolation contexts in the vocabulary policy. |

## Pending Semantic Decisions

| Decision id | Scope | Why it is pending | Required resolution |
| --- | --- | --- | --- |
| `conceptual-vocabulary.stewardship-field-contract` | Evolution ledgers, surface matrices, generated baselines, and guard schemas that still use the legacy stewardship key. | The key appears in stable JSON contracts, generated fixtures, checks, and docs. Renaming it mechanically would be a schema migration, not a local wording fix. | Decide whether to migrate the stable key to stewardship terminology, keep it as a documented compatibility field, or add a narrow guard exception with migration criteria. |
| `conceptual-vocabulary.technical-tenancy-contract` | Relay, Gateway, remote sync, and compatibility tests using technical tenancy identifiers. | Canon permits technical isolation vocabulary, but current governance guards and conceptual guard baselines disagree on several paths. | Decide the exact allowed technical-tenancy surfaces and align `conceptual-vocabulary-guard`, `governance-scope-guard`, and baselines without broad rebaselining. |
| `conceptual-vocabulary.identity-scope-contract` | Governance scope guard findings outside the requested protected-word list but adjacent to the same authority model. | The guard reports widespread identity-scope vocabulary drift; changing it would affect dense data, agents, sessions, and scale fixtures. | Classify each use as provider-domain identity context, user identity context, business entity data, or migration target before changing contracts. |
| `conceptual-vocabulary.full-surface-guard-scope` | Blocking coverage for docs, code, UI strings, tests, fixtures, and examples. | The current blocking guard covers docs, UI copy, and public/stable surfaces; a full-surface report-only scan finds existing hits in tests, fixtures, and examples too, including compatibility and intentionally negative cases. | Decide which artifact classes become blocking, which fixtures/examples may carry intentional negative vocabulary, and how those exceptions are classified. |

## Closure Rule

Do not mark the vocabulary goal complete while any row in Pending Semantic
Decisions remains unresolved, while ClawJS guards still fail for unclassified
growth, or while docs, code, UI copy-bearing source, tests, fixtures, and
examples have not been re-audited against the final decision set.
