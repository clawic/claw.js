# ADR 0005: Canonical data catalog

Status: Accepted

Date: 2026-05-14

## Context

ClawJS already contains hundreds of built-in collections across work, identity,
collaboration, health, finance, home, travel, learning, media, relationships,
commerce, support, observability, agents, and other domains. The catalog is
valuable only if it grows with both breadth and discipline: the framework must
cover structured entities that humans and digital workflows recognize, while
avoiding duplicate provider-shaped names and vague catch-all fields.

The Constitution defines broad canonical data intent. The day-to-day catalog
rules need a stable standard and tests so future work does not degrade naming,
field optionality, relationship meaning, or migration safety.

## Decision

- `docs/canonical-data-catalog.md` is the working standard for built-in
  collections, fields, aliases, relation semantics, evidence, and evolution.
- ClawJS owns canonical catalog definitions in `@clawjs/core`.
- Clawix and other hosts consume the catalog. They may render or cache
  projections, but they must not define a competing canonical schema source.
- Canonical coverage is broad by default: human-recognizable entities and
  digitally validated workflows are candidates for built-in collections.
- Canonical status requires a purpose plus evidence such as
  `human_recognizable`, `market_validated`, `multi_domain_reuse`, or
  `agent_useful`.
- Fields are optional by default. Required fields need a reason tied to
  identity, integrity, lifecycle, or relation integrity.
- Relations are semantic. New relation fields must identify whether they model
  ownership, membership, participation, line items, source/import,
  attachments, location, temporal events, financial transactions,
  observation/samples, dependencies, or a temporary generic relation.
- Existing built-ins without catalog metadata are tracked as active debt, not
  grandfathered as final-compliant. The accepted end state is zero undocumented built-ins.
- The 1000+ coverage ledger in `@clawjs/core` is the discovery surface for
  broad catalog expansion. `candidate_mapping` entries are not final coverage;
  each wave must prove field and relationship support or record a canonical gap
  or custom-database boundary.
- Custom databases stay first-class for niche, private, experimental, or
  unapproved entities.

## Consequences

Catalog expansion happens in coherent batches that preserve naming and
relationship quality. Adding a collection is not just adding a file: it must
include aliases, purpose, evidence, field optionality decisions, relation
semantics, docs when public behavior changes, and tests that keep CRUD working.

Schema evolution remains conservative. Additive optional fields are preferred;
renames, splits, merges, and other structural changes require migration support
and a pre-migration snapshot.
