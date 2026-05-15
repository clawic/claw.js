---
title: Canonical Data Catalog
description: Standard for built-in collections, fields, relationships, evidence, and evolution.
---

# Canonical Data Catalog

The ClawJS data catalog is the canonical set of built-in collections that
agents, hosts, apps, custom databases, imports, exports, and APIs can share.
Its goal is broad coverage of human-recognizable structured entities and
digitally validated workflows, without binding the framework to any one
provider's vocabulary.

This standard applies to built-in collection definitions in
`packages/clawjs-core/src/builtins/`, public database docs, schema fixtures,
and any framework feature that promotes a custom collection into a reusable
canonical type.

## Catalog Goals

- Cover structured entities that are recognizable to humans or durable enough
  in digital workflows to deserve a portable shape.
- Standardize names and relationships as carefully as fields. Coverage that
  keeps duplicate words for the same concept is not complete.
- Keep records simple to create: Fields are optional by default unless they are
  needed for identity, integrity, lifecycle, or relation integrity.
- Prefer typed fields and typed relationships over raw JSON, tags, notes, or
  provider-shaped blobs.
- Custom databases remain first-class storage for niche, private, or
  unapproved entities.

## Canonical Status

A collection may be canonical when it satisfies at least one evidence tag:

| Evidence tag | Meaning |
| --- | --- |
| `human_recognizable` | A non-technical person can recognize the entity without framework context. |
| `market_validated` | Durable digital workflows already treat the concept as structured data. |
| `multi_domain_reuse` | Three or more skills, apps, integrations, or domains would reuse it. |
| `agent_useful` | Agents become materially more capable when the concept is portable and queryable. |

Canonical collections must declare a short purpose and at least one evidence
tag. Existing built-ins without that metadata are active catalog debt, not
accepted exceptions. They remain usable while the catalog is upgraded, but the
final acceptance state is zero undocumented built-ins.

## Naming Rules

- Collection names use `snake_case`, plural when they store many records:
  `transactions`, `medical_documents`, `trip_itinerary_items`.
- Field names use `camelCase` because record payloads are JSON/API-shaped:
  `startedAt`, `currentValue`, `relationKind`.
- Enum values use `snake_case`.
- Aliases record import/search vocabulary. They must not become duplicate
  canonical fields or public provider claims.
- If multiple domains use different names for the same concept, choose the
  clearest durable name and store the other names as aliases.
- Do not introduce vendor-specific names unless the collection is explicitly
  about an external provider mapping.

## Field Design

- Required fields need an explicit reason: `identity`, `integrity`,
  `lifecycle`, or `relation_integrity`.
- Use the richest available field type before falling back to `text` or `json`:
  `money`, `address`, `geo_point`, `phone`, `email`, `url`, `duration`,
  `percent`, `rating`, `barcode`, `file`, and `markdown`.
- A field that carries long-form prose should use record notes/pages or
  `markdown` according to the database store behavior, not an arbitrary text
  blob.
- A field that points at another record should be a `relation`, not a text id.
- Field aliases may describe known vocabulary variants, but aliases do not
  relax the canonical field name.

## Relationship Semantics

Every new relation field must declare what the relation means. Use the most
specific semantic kind available:

| Relation kind | Use for |
| --- | --- |
| `ownership` | A record owns or contains the target as part of its durable identity. |
| `membership` | A person, account, item, or entity participates in a group. |
| `participant` | An actor is involved in an event, session, conversation, or activity. |
| `line_item` | A child row belongs to an order, invoice, quote, cart, recipe, or similar aggregate. |
| `source_import` | A record came from an import, sync, provider object, or external source. |
| `attachment` | A file, asset, document, or media item is attached to the record. |
| `location` | A record refers to a place, address, property, room, route, or geo object. |
| `temporal_event` | A record represents or links to a dated occurrence, schedule, visit, or appointment. |
| `financial_transaction` | A record links to payment, invoice, balance, account, or transaction flow. |
| `observation_sample` | A measurement, log, sample, symptom, mood, sensor value, or health reading observes another entity. |
| `dependency` | A record depends on, blocks, references, or derives from another record. |
| `generic` | A real relationship exists but no narrower semantic kind is stable yet. |

Generic relations are allowed, but they should be rare and revisited when the
same pattern appears in more than one family.

## Evolution Rules

- Expansion should happen in reviewable batches by domain or capability, not
  by dumping unrelated entities into the registry.
- Broad coverage is validated through the coverage ledger in
  `CATALOG_COVERAGE_NEEDS`. Candidate mappings are discovery evidence only;
  they are not final proof that the canonical fields and relations are
  complete.
- Deep coverage is validated through the audited expansion ledger in
  `CATALOG_AUDITED_ARCHETYPES` and `CATALOG_AUDITED_NEEDS`. The accepted target
  is 120 generic product/workflow archetypes across commerce, learning,
  sports/booking, health, home/property, work/legal/ops, CRM/support/growth,
  and personal memory/documents.
- Each audited archetype must declare its value proposition, workflow, evidence
  tags, mapped collections, and exact structural needs. Each audited need must
  map to real canonical fields and real relation fields with compatible
  relation semantics, or explicitly close as `custom_database`.
- Batch closure must report archetypes, needs, gaps, custom database
  boundaries, additive changes, and JSON audit debt. A batch is not closed by
  generic candidate mappings.
- Field aliases are allowed only as scoped vocabulary variants for imports and
  search. They must not collide with canonical fields in the same collection.
- JSON fields remain acceptable for payloads whose schema is deliberately
  governed elsewhere, such as external payload evidence or custom field values,
  but common workflow dimensions should be promoted to typed optional fields.
- Additive optional fields are preferred. Renames, splits, merges, and
  structural changes require migration support and a pre-migration snapshot.
- A new collection must be able to CRUD through the shared database smoke test.
- A batch that adds collections must update docs, aliases, tests, and relation
  semantics together.
- Clawix and other hosts consume the catalog. They may render, filter, cache, or
  project it, but they do not define a competing canonical schema source.
