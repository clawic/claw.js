# ADR 0027: Governance Identity And Scope Model

Status: Accepted

Date: 2026-05-18

## Context

Claw has accumulated overlapping words for authority and containment:
`tenant`, `owner`, `profile`, `companyId`, `workspaceId`, `projectId`, and
domain-specific owner-like fields. Some of those words describe business data,
some describe runtime isolation, and some imply permission authority. Mixing
them makes migrations expensive because a stored record can look "owned" by a
company, agent, profile, folder, or project without saying whether that value is
a business relationship, a query scope, an authority edge, or only UI grouping.

The framework must support a single person, a family, a small team, a company,
parent-child control, executive-to-team delegation, agents acting on behalf of
people, and direct project sharing without forcing every user into an
organization tree. Most users still run alone, so the default must stay cheap:
individual/local data should not require a full authority graph on every read.

## Decision

Claw uses these durable concepts:

- `principal`: an actor that can receive authority. Human users, agents,
  service accounts, devices, and external accounts are principals.
- `entity`: a real-world or domain object such as a person, family, company,
  brand, department, legal entity, customer, project, account, asset, or
  provider object. Entities are not authority by themselves.
- `scope`: the bounded context in which a resource is interpreted. Canonical
  scope levels are `global`, `workspace`, `project`, `entity`, `folder`, and
  `resource`.
- `steward`: the principal or entity responsible for lifecycle stewardship of a
  resource. Stewardship is not permission authority by itself.
- `grant`: an explicit capability edge from a granting authority to a principal
  over a scope or resource.
- `authorityEdge`: an explicit graph edge that can grant, restrict, delegate,
  broker, or audit authority.
- `restriction`: a deny or limit that inherits down scope and hierarchy unless
  explicitly narrowed by a stricter child rule.

`tenant` is a technical isolation word only. It may appear in provider,
hosting, relay, gateway, or compatibility code where a remote service really
uses tenant semantics. It must not be the public framework word for a person,
company, workspace, project, customer, or owner.

`namespace` is a technical grouping word only. It may group schemas, storage,
provider names, or package internals. It must not imply authority.

Generic `owner`, `ownerId`, and `ownerKind` are prohibited as new authority
fields. New authority code uses `steward`, `scope`, `grant`, `principal`,
`entity`, `authorityEdge`, and `restriction`. Domain-specific owner language is
allowed only when it describes the domain object, for example a legal asset
owner, account owner, pet owner, or provider field. That domain field still
does not grant framework authority unless an explicit grant exists.

Bare `profile` is prohibited for authority and identity. Use precise names such
as `userProfile`, `domainProfile`, `providerProfile`, `behaviorProfile`, or
`profileProjection`, and document whether the profile is configuration, a
projection, a provider object, or a human-facing view.

`companyId` is a business relationship, not authority. It may relate a record to
a company entity in CRM/ERP/dense-data domains, but it cannot be used to decide
read, write, delegate, memory, secret, project, or workspace access without an
explicit authority edge.

Membership and hierarchy do not imply read access. A CEO, parent, team lead, or
organization admin may have control capabilities without memory or content read
capabilities. Delegation is a strict intersection: a principal or agent cannot
delegate more than the effective authority it has, and cannot launder access
through a broader scope.

Governance fields are centralized through bindings and projections. Ordinary
collections do not repeat mandatory `ownerId`, `tenantId`, or organization
fields just to be future-proof. Collections declare their default data class and
scope behavior. Per-record overrides are used only when a record genuinely
crosses scope boundaries or needs exceptional policy.

The individual/local case is implicit and lightweight. If no workspace,
project, entity, organization, grant, or restriction is attached, the effective
scope is the local principal's default workspace and the local host. This keeps
zero-config performance and storage simple while preserving a migration path to
shared use.

## Performance Impact

The governance graph adds more concepts than a flat owner field, but the default individual/local case stays implicit and cheap. Performance depends on indexed grants, restrictions, bindings, and projections so reads do not walk a full authority graph unnecessarily. Future implementation must measure effective permission checks, project/workspace switching, and audit growth for shared scopes.

## Decision Tensions

- **Prioritized axes**: authority correctness, least privilege, semantic clarity, delegation safety, and solo-user simplicity.
- **Constrained axes**: generic owner, tenant, and organization-shortcut models are constrained because they hide the difference between grouping, stewardship, and permission authority.
- **Tradeoffs accepted**: the model is more verbose than flat ownership fields; that cost is accepted to avoid irreversible access and migration mistakes.
- **Debt or pending evidence**: existing vocabulary debt and authority checks must be classified, guarded, and eventually migrated to explicit governance concepts.

## Surface Parity

- **Human surface**: Clawix shows workspace/project/entity context, sharing,
  missing/detached/duplicate project states, and approval/control UI. It must
  not expose raw tenant or owner vocabulary for governance.
- **Programmatic surface**: Claw exposes governance through registry-backed
  schemas, `claw inspect governance`, `claw project inspect`, grants,
  approvals, audit, and export/import/handoff commands.
- **Persistence**: `core.sqlite` stores principals, entities, scopes, grants,
  restrictions, bindings, and projections. Sidecars may store high-churn audit
  or runtime state, but canonical authority stays queryable through the
  framework graph.
- **Gaps**: Current source contains pre-decision vocabulary debt. It is tracked
  by `docs/governance-vocabulary-baseline.json` and must shrink or be
  explicitly reclassified, not silently grow.
- **Validation**: `scripts/governance-scope-guard.mjs` fails missing canonical
  snippets and any unbaselined increase in prohibited governance vocabulary.
  Future implementation checks must cover effective grants, restriction
  inheritance, delegation intersection, control-without-read, and direct project
  grants without an organization.

## Discovery Route

- **AGENTS/CLAUDE**: `AGENTS.md` routes governance work through this ADR,
  `docs/decision-map.md`, `docs/naming-style-guide.md`, and
  `docs/data-storage-boundary.md`.
- **Skill**: use `data-storage-boundary-review`, `host-boundary-review`,
  `surface-route-work`, or a future governance-specific skill before changing
  authority, grants, scopes, or project/workspace data placement.
- **Docs router**: `docs/decision-map.md` has a governance row pointing here.
- **CLI**: `claw search governance --json`, `claw inspect schemas --json`, and
  future `claw inspect governance --json` expose the decision.
- **Registry**: current durable routing is protected by the decision map and
  `scripts/governance-scope-guard.mjs`; a discoverability registry entry must
  be added when `claw inspect governance` lands.

## Consequences

This ADR deliberately separates identity, grouping, stewardship, and authority.
That makes the model more verbose than a simple `ownerId`, but it avoids
irreversible permission mistakes and supports personal, family, company,
agentic, and project-only collaboration without changing vocabulary later.

Existing `owner*`, `tenant*`, `profile*`, and `companyId` usages are not
automatically invalid. They are debt until each occurrence is classified as a
domain field, provider compatibility term, technical isolation term, projection,
or migration target. New governance work must not add to that debt.
