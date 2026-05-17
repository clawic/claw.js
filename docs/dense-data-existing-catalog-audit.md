# Dense Data Existing Catalog Audit

This audit records how existing ClawJS data surfaces are integrated into the
dense data operating system. It is an acceptance artifact for the source
conversation `019e35a1-06bb-77f2-a712-92ed2646bd15`: no dense-data pack may
close by creating a second catalog, graph, evidence model, CRM, billing, ERP,
or ops model that ignores the current framework surface.

The same decisions are mirrored as structured registry data in
`clawDenseDataOsRegistry.existingSurfaceIntegrations`. The public table below is
the human-readable canon; the registry entry is the executable guard that
requires every audited surface to declare a disposition, canonical owner,
shared primitive set, dense-system references, and follow-up gate.

## Current Decisions

| Existing surface | Dense-data decision | Canonical owner now | Follow-up gate |
| --- | --- | --- | --- |
| Notes, pages, page blocks, comments, mentions, and record notes | Evidence and narrative context. They may support structured records, but they do not replace canonical collections. | Main database pages/notes plus `evidence_sources` handles. | Dense import flows must create or link `evidence_sources` and preserve raw notes when normalization is unsafe. |
| Knowledge entities and facts | Reusable knowledge layer. Dense records can reference or generate facts, but professional centers stay in typed collections. | Knowledge collections plus dense centers such as `patients`, `studies`, `legal_cases`, and `companies`. | Avoid adding generic `subject` or `fact` tables for domain records. |
| Knowledge graph relations | Agent/knowledge graph context. Universal operational/domain links use the generalized `entity_relations` table. | `knowledge_graph_relations` for knowledge graphs; `entity_relations` for universal record relations. | New dense routes must choose one graph owner explicitly. |
| Associations and custom fields | Extensibility layer for still-evolving fields. Stable dense relationships become typed relation fields or `entity_relations`. | Existing custom-field and association surfaces plus built-in schema fields. | Graduation from custom field to schema field must include docs and smoke coverage. |
| Signals and observations | Time-series or measurement substrate. Dense lab, health, learning, and ops records can link to signals where repeated observations matter. | Signals tables plus dense collections such as `assays`, `symptom_logs`, and `instrument_responses`. | Do not duplicate high-churn time-series data into one-off records without a concrete view reason. |
| Attachments, files, documents, and raw imports | Evidence/blob substrate. Binary and raw content remain in file/document storage; dense records store handles, summaries, provenance, and gaps. | File/document stores plus `evidence_sources` and `provenance_events`. | Export, external send, purge, and native access remain gated. |
| CRM companies, accounts, contacts, leads, deals, activities, and assets | CRM is a first-wave dense system and ERP dependency, not a new parallel CRM. | Existing `crm` built-ins, especially `companies`, `accounts`, and `deals`. | CRM pack graduation must reuse current built-ins or explicitly reset/rename them. |
| Billing customers, invoices, payments, subscriptions, prices, and ledger-like records | Billing is part of ERP/finance orchestration. Dense ERP routes reuse billing collections where appropriate. | Existing billing and finance built-ins, including `invoices`, `payment_intents`, and `transactions`. | Accounting views must map to these collections before adding new finance tables. |
| ERP | Orchestrator across companies, accounts, invoices, payments, inventory/procurement, CRM, and finance. It is not a supercollection. | `erp` dense system over shared CRM, billing, finance, commerce, and future procurement/inventory collections. | New ERP commands must route to a canonical owner collection. |
| Infra, observability, monitor, and ops | Operational state is split by purpose: user-facing ITSM records in core, high-churn telemetry or runtime state in sidecars. | `ops` dense system for `services` and `incidents`; observability/monitor sidecars for operational telemetry. | Do not expose infra/ops sidecars as public dense records unless an ADR promotes them. |
| Identity, actors, roles, and teams | Minimal shared identity and access primitives. Domain roles/profiles attach professional meaning without copying people or actors. | `people`, `actors`, identity roles, `domain_roles`, and `domain_profiles`. | Sensitive role/profile writes need provenance and quality-gap support. |

## Guardrails

- New dense collection proposals must state whether they reuse an existing
  collection, extend one, split ownership by purpose, replace one during the
  pre-v1 reset, retire it, or are a new canonical owner.
- Direct stable links use schema relation fields. Secondary, cross-pack, or
  evolving links use `entity_relations`.
- Documents, notes, files, and imports are evidence. They create or support
  records through `evidence_sources`, `provenance_events`, and `quality_gaps`.
- Partial data is valid only when the missing or uncertain parts are queryable
  as `quality_gaps` or intent/workflow gaps.
- Provider, physical, external-service, export, purge, secret, native
  permission, and cost-bearing requirements stay separate as
  `EXTERNAL PENDING` rather than bugs.
