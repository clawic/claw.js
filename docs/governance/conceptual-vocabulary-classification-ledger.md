# Conceptual Vocabulary Classification Ledger

Status: active

This ledger is the domain-by-domain classifier for the conceptual vocabulary
refactor. It complements `docs/governance/conceptual-vocabulary-audit.md` by
turning residual vocabulary debt into explicit migration decisions. It is not a
completion claim.

The refactor must not proceed as a mechanical rename. Each row below names the
semantic domain, allowed meaning, migration target, guard expectation, and
validation needed before the row can close. The exact legacy spellings remain
tracked in the guard baselines; this document names field families instead of
adding fresh blocked spellings.

## Canonical Axes

Classify every protected or adjacent vocabulary occurrence on these axes:

| Axis | Meaning |
| --- | --- |
| Authority | Read, write, delegate, approve, reveal, mutate, or execute capability. Must be modeled through principals, scopes, grants, authority edges, restrictions, approvals, leases, and signed-host brokers. |
| Stewardship | Lifecycle responsibility, maintenance responsibility, or source-of-truth responsibility. Does not grant access. Preferred public word: `steward`. |
| Technical isolation | Hosted/provider/Relay/Gateway/compatibility isolation boundary. Allowed only where a remote service or hosted control plane genuinely uses isolation semantics. |
| Business relationship | Domain relation such as company, customer, account, supplier, asset, project, or provider object. Does not grant authority without an explicit authority edge. |
| Locator | Folder path, file path, host path, route path, URL, or display grouping. Never identity or authority by itself. |
| Provider vocabulary | Exact external-provider schema/action/fixture wording. Must be contained at provider adapters, fixtures, or redacted governed context. |
| Compatibility alias | Old public or wire name accepted only through a documented reader, migration path, and guard that blocks new ambiguous producers. |
| Negative fixture | Deliberately bad wording used to prove a guard blocks it. Must be local to tests/fixtures and clearly marked. |

## Classification Summary

| Family | Current semantic risk | Canonical disposition | Required action | Closure evidence |
| --- | --- | --- | --- | --- |
| Legacy stewardship words in docs and generated registries | Often mixes stewardship, source-of-truth, authority, and route graph responsibility. | Use `steward` for lifecycle responsibility; keep `owns` only as a route edge type with graph/source-of-truth semantics; use domain-specific responsibility words only for real external/domain concepts. | Split into stewardship metadata, graph edge semantics, domain fields, or negative fixtures. Do not broaden allowed phrases. | Conceptual guard passes without unclassified generic responsibility-as-authority findings; generated docs do not recreate generic debt; route docs explain `owns` is not access authority. |
| Legacy flat actor identifier fields | Looks like flat access control and conflicts with ADR 0027. | Authority uses `principal`, `scope`, `grant`, `authorityEdge`, and `restriction`; stewardship uses `steward`. | Classify each as authority migration target, compatibility alias, provider field, or domain field. Add schema checks blocking new generic flat authority fields. | Governance guard has no unclassified growth; tests prove access is not derived from flat actor fields alone. |
| Legacy generated field-name metadata | Often appears in dense data, generated catalogs, and semantic product tooling where it may mean relationship, accountability, or provider schema. | Replace internal generic metadata with `stewardField`, `accountableEntityField`, `responsiblePrincipalField`, or provider-specific field names. | Audit generated catalog source before editing generated artifacts. Add generator-level classification so regenerated baselines do not recreate ambiguity. | Generator tests and catalog tests pass; remaining entries are provider/domain compatibility with explicit rationale. |
| Legacy responsibility-relation keys | Usually records dependency/source responsibility, not authority, but the wording still implies access control. | Use `stewardshipRelation`, `sourceRelation`, `responsibilityRelation`, or domain-specific relation. | Migrate docs/metadata first; schema migration is required if exported JSON uses the key. | Stable JSON compatibility fixtures prove old/new readers if key changes; guard blocks new unclassified responsibility-relation keys. |
| Technical-isolation field family | Largest ambiguity: sometimes technical isolation, sometimes product/customer/workspace/project scope. | Keep only for technical hosted/provider isolation. Product scope uses `workspaceId`, `projectId`, `entityId`, governed context ids, or provider-specific ids. | Decide exact allowed Relay/Gateway/remote-sync/provider paths. Migrate product-facing or workspace/project meaning away from technical-isolation terms. Align conceptual and governance guards. | Technical-isolation contract row in the audit is resolved; wrong isolation tests fail closed; UI docs do not expose isolation vocabulary as product scope. |
| Bare identity-view field family | Bare identity/configuration/projection/performance vocabulary is ambiguous and can imply authority or identity. | Use precise terms such as `userProfile`, `providerProfile`, `domainProfile`, `behaviorProfile`, `profileProjection`, or non-governance performance settings. | Classify every bare identity-view occurrence by domain. Provider schema vocabulary stays behind adapters/fixtures. | Governance guard has no unclassified bare identity-view findings; tests confirm those values do not grant authority. |
| Company relation identifier family | Business relation is sometimes treated like scope or access control. | Company is an entity/business relationship only. Authority requires explicit grant or authority edge. | Update dense-data relation guidance and access checks. Where the object is not truly company-specific, migrate to `entityId`, `customerId`, or domain-specific relation. | Tests prove company-linked records are unreadable without explicit grants; catalog guidance says business relation, not authority. |
| Workspace wording with authority language | Workspace is an isolated context but may be phrased as granting authority. | Workspace is scope/context; grants are explicit. | Reword workspace authority, grant, and path-derived authority phrasing. Verify code does not infer access from workspace membership alone. | Effective-access tests cover workspace scope with and without grants; vocabulary guard blocks workspace-implies-authority patterns. |
| Project wording with authority language | Project is a collaborable work scope, but folder/project wording may imply authority. | Project identity is stable `projectId`; folder path/name is locator only; direct project grants are explicit. | Reword project authority language; audit path-keyed project/sidebar/session behavior separately. | Tests cover project rename, folder move/copy, duplicate id, direct project grant, and no authority from folder path. |
| Agent wording with authority language | Agent can be a principal but does not automatically have authority. | Agent authority is effective authority from grants, assignments, leases, restrictions, and actor delegation. | Reword agent authority phrases where they mean grants for an agent or effective authority. | Tests cover agent acting on behalf of a principal and delegation intersection. |
| Relay wording with authority language | Relay may broker remote flows but cannot own native, secret, grant, or approval authority. | Relay is transport/control-plane brokering; local API and authority remain framework/host governed. | Reword relay authority phrases; keep technical isolation only where documented. | `claw inspect show claw.relay --json` and route tests show Relay brokers/exposes/consumes but does not grant access. |
| Sync wording with authority language | Sync can look like access transfer. | Sync reconciles under explicit manifest, conflict, cache, and authority-handoff contracts; it does not grant access. | Reword sync authority/access language; audit sync routes for explicit handoff receipts and conflict policy. | Sync route tests prove authorization is consumed from explicit contracts; guard blocks sync-as-authority patterns. |
| Route wording with authority language | Route graph paths may be mistaken for permission paths. | Route is graph traversal with explicit edge semantics; it does not grant access. | Reword route permission/access language. Keep `route` only as graph/transport concept. | Surface-route guard and conceptual guard both pass route-as-authority negative fixtures. |
| Surface metadata with responsibility language | Surface metadata can mix lifecycle responsibility with authority. | Surface has registered steward, stability, visibility, and evidence. Authority is modeled separately. | Prefer `steward` in surface metadata. If stable compatibility keys remain, document compatibility and migration criteria. | Inspect output and registry contracts expose `steward`; remaining compatibility fields are tested aliases. |
| UI-local conversation identity family | Chat is UI vocabulary; stable protocol identity must be `sessionId`. | UI-local conversation ids remain local. Bridge/framework protocol uses `sessionId`; external runtime uses `threadId`. | Audit bridge/helper code before renaming; migrate protocol/public/stable fields first. | Protocol fixtures reject new stable chat-language fields; UI-local use remains documented. |

## Decision Rows

| Decision id | Ledger rows covered | Required decision |
| --- | --- | --- |
| `conceptual-vocabulary.stewardship-field-contract` | Legacy stewardship words, flat actor identifiers, generated field-name metadata, responsibility-relation keys, and surface metadata. | Decide which stable schema keys migrate to `steward*`, which stay as compatibility aliases, and which are provider/domain fields. |
| `conceptual-vocabulary.technical-tenancy-contract` | Technical-isolation fields and Relay/Gateway/remote-sync isolation vocabulary. | Decide exact allowed technical-isolation surfaces and align conceptual/governance guards without broad rebaseline. |
| `conceptual-vocabulary.identity-scope-contract` | Bare identity-view fields, company relation identifiers, workspace/project/entity relation terms. | Classify identity and business-scope vocabulary as provider context, user context, business entity data, or migration target. |
| `conceptual-vocabulary.full-surface-guard-scope` | All rows across docs, code, UI copy-bearing source, tests, fixtures, examples, generated docs, and provider fixtures. | Decide which artifact classes become blocking and how intentional negative/provider fixtures are marked. |

## Implementation Order

1. Freeze growth with the existing conceptual and governance guards.
2. Resolve stewardship metadata before changing route/surface registries.
3. Resolve technical isolation before touching Relay/Gateway public paths.
4. Resolve identity-view and company/entity relations before changing dense
   data catalogs.
5. Resolve workspace/project id-vs-path semantics before Clawix consumes UI
   projections.
6. Resolve connector/account governed context before any live provider import
   or provider mutation work.
7. Reduce baselines only after each row has a documented classification and a
   lower next budget.

## Guard Expectations

Every row must eventually be protected by at least one of:

- `scripts/conceptual-vocabulary-guard.mjs`
- `scripts/governance-scope-guard.mjs`
- `scripts/naming-surface-guard.mjs`
- `scripts/surface-route-graph-guard.mjs`
- `scripts/surface-evidence-guard.mjs`
- `scripts/surface-narrative-guard.mjs`
- `scripts/surface-resource-contract-guard.mjs`
- domain-specific schema, fixture, or CLI tests

Allowed exceptions must be path-scoped and phrase-scoped. A row is not closed by
adding a broad allowlist or by increasing a baseline without a decreasing next
budget.

## Validation Required For Closure

The vocabulary goal cannot close until the implementation report includes:

- Current conceptual and governance baseline counts.
- The final classification state for every row in this ledger.
- Guard output showing no unclassified growth.
- Tests proving authority does not derive from technical-isolation fields,
  flat responsibility fields, company relation fields, identity-view fields,
  workspace, project, route, relay, sync, folder path, or agent vocabulary.
- Route inspection output proving route/surface metadata uses steward semantics
  and keeps `owns` as graph source-of-truth semantics only.
- Connector/account doctor and explain checks proving governed context is
  resolved before provider mutation.
- Clawix mirror checks proving host/UI projection does not contradict ClawJS
  canon.

## Current Closure State

Open. This ledger establishes the classification framework required by the
vocabulary-domain refactor plan. It does not implement the migrations, reduce
the baselines, or prove completion of the goal.
