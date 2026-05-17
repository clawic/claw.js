# ADR 0021: Dense data operating system

Status: Accepted

Date: 2026-05-17

## Context

Claw already has notes, pages, knowledge records, graphs, associations,
signals, attachments, custom fields, CRM, billing, ERP, monitor, and database
surfaces. The next data expansion must not create a parallel system on top of
those pieces. It must turn high-density professional domains into a shared
catalog, CLI surface, and orchestration model that can represent the work
people expect from specialized software.

The strongest example is health: a user should be able to run routes such as
`claw patient list`, `claw patient <id> medications list`, or `claw medication
add --patient <id>` without knowing an internal health prefix. The same rule
applies across other dense domains such as research, labs, legal, ERP, CRM,
finance, education, manufacturing, and operations.

## Decision

ClawJS defines a dense data operating system registry in
`packages/clawjs-core/src/dense-data-os.ts`.

The registry is the first executable canon for this model. It defines:

- a universal foundation: minimal identity, domain roles, typed profiles,
  evidence sources, provenance events, quality gaps, canonical operations,
  semantic views, domain systems/packs/intents, vocabularies, mappings, units,
  instruments, responses, and universal relations
- shared engines for identity/profile, evidence/provenance, quality gaps,
  relations, semantic views, intent coverage, vocabulary/units,
  instruments/responses, timeline, document evidence, finance/accounting, and
  workflow state
- a first wave of visible dense systems: Health/EHR, Research/CTMS, Biology,
  Labs/LIMS, Legal, ERP, CRM, Finance/Accounting, Education/LMS, HR/HRIS,
  Manufacturing/MES, Operations/ITSM, Real Estate/PropTech, Insurance, and
  Maintenance/CMMS, Procurement, Warehouse/WMS, Supply Chain/SCM, and
  Compliance/GRC, IoT, and Construction
- a roadmap taxonomy for TMS, government,
  CMS, PIM/PLM, pharma, and ELN
- a non-executing dense intent resolver that can classify direct phrases such
  as `claw patient list`, `claw patients list`, `claw invoice list`, or `claw
  medication add --patient <id>` as covered, partial, blocked, or gaps before
  any runtime action is attempted

Every dense system is a visible pack and an orchestrator over shared
collections. It is not a duplicate database. First-wave systems default to
`core.sqlite`; sidecars are allowed only for technical reasons such as search,
runtime, high-churn logs, or large blobs.

## CLI surface

Human-facing nouns are top-level routes. Domain portals and acronyms are also
routes, but they are not the only route. For example, `health` and `ehr` are
valid pack routes, while `patient` remains a direct noun route.
Direct human nouns and plural aliases are generated from dense centers, so the
same canonical collection backs routes such as `patient list` / `patients
list`, `company list` / `companies list`, `product list` / `products list`,
and `assay list` / `assays list` without introducing a second data model. The
guard rejects malformed aliases and keeps professional plurals explicitly
audited instead of silently accepting bad mechanical forms.

Collections use the standard actions `list`, `get`, `create`, `update`,
`delete`, `query`, and `schema`. `delete` means archive by default; `purge` is
explicit and restricted. Sensitive composed operations use IDs instead of
ambiguous name lookup.

Multiple reasonable CLI routes may map to one canonical operation. A route is
rejected only for a concrete reason such as ambiguity, permission/cost gate,
external dependency, duplicate-data risk, incorrect-data risk, or destructive
action.

## Data semantics

External standards are mapping targets, not schemas to clone. Examples include
FHIR, openEHR, SNOMED CT, LOINC, ICD, RxNorm, CDISC, OMOP, UBL, Peppol, XBRL,
ISO 20022, xAPI, LTI, SCORM, ISA-95, ITIL, OpenTelemetry, and related domain
vocabularies.

Documents, notes, files, forms, imports, and raw provider payloads are evidence
linked to structured records. Partial data is valid when stored with quality
and completeness gaps. Normalization is immediate only when it is safe.

Health, legal, finance, research, labs, and similarly sensitive packs default
to high sensitivity. Local read/write is allowed by the framework boundary;
export, purge, external calls, secrets, native permissions, cost-bearing work,
and destructive actions remain gated and audited.

Claw structures, queries, relates, and explains data. It does not make final
clinical, legal, financial, or regulated decisions.

## Enforcement

The first guardrails are `packages/clawjs-core/src/dense-data-os.test.ts` and
`scripts/verify-dense-data-goal.mjs`. They require source metadata, the compact
intent status vocabulary, first-wave coverage, acronym aliases, direct center
command nouns, patient medication routes without a health prefix, ERP as an
orchestrator rather than a supercollection, roadmap visibility, registry
completeness, privacy-safe public docs, one-by-one source decision rows, the
existing-surface anti-duplication audit, and the acceptance
fixture/external-pending ledger.

The dense systems are also projected into
`packages/clawjs-core/src/domain-surface-registry.ts` as `dense-system:*`
surface entries. First-wave systems are canonical; roadmap systems are
conceptual manifests until their packs graduate. These entries expose the
domain portals, acronym aliases, and center command nouns to inspection while
keeping the actual storage under shared core database ownership.

`packages/clawjs/src/cli-dense-data-command.ts` handles known dense-data
phrases before the unknown-command path. Inspection actions such as `health
gaps` return structured registry coverage. Graduated centers execute through
the shared database instead of a parallel domain store: `patient list`,
`patient create`, `encounter add --patient <id>`,
`patient <id> encounter add`, `patient <id> encounters list`,
`medication add --patient <id>`, `patient <id> medications list`,
`patient <id> symptoms add`, `patient <id> symptoms list`, and
ERP/CRM routes such as `company create`, `company <id> timeline`,
`account create --company <id>`,
`deal create --company <id>`, `product list`, `product create --company <id>`,
`invoice list`, and
`invoice create --billing-customer <id>` all resolve to canonical core.sqlite
collections. Legal and ops centers also graduate through shared collections:
`case create`, `case <id> evidence add/list`, `service create`,
`incident create --service <id>`, and `service <id> incidents list`. Research,
labs, education, and manufacturing now follow the same rule: `study create`,
`study <id> participants add/list`, `sample create`,
`sample <id> assays add`, `learner create`, `course create`,
`relation create --from-entity-kind learners --to-entity-kind courses`,
`course <id> lessons add/list`, `asset create`, `asset <id> work-orders
add/list`, and `work-order create` execute against
canonical collections. Finance/accounting
also has executable centers for `financial-account create` and
`transaction create --account <id>`. Biology is backed by distinct biological
collections rather than analytics A/B-test experiments: `organism create`,
`experiment create --organism <id>`, and
`experiment <id> samples add --organism <id>` route to canonical records. Dense routes
that are known but not graduated still return a degraded response with an
explicit `workflow_gap` until their canonical collections, schemas, relations,
quality gaps, and DB smoke tests are connected.

The universal foundation is now a real built-in family, not only registry
language. It includes canonical collections for `domain_systems`,
`domain_packs`, `domain_roles`, `domain_profiles`, `evidence_sources`,
`provenance_events`, `quality_gaps`, `canonical_operations`,
`semantic_views`, `domain_intents`, `vocabularies`, `concepts`,
`concept_mappings`, `units`, `instruments`, `instrument_items`, and
`instrument_responses`. Foundation routes such as `evidence-source create`,
`quality-gap create`, `semantic-view list`, and `domain-intent list` execute
through the shared database. The existing `entity_relations` collection has
been generalized into the universal relation graph so work/task relations and
dense-domain cross-links do not split into competing relation systems.

The companion [Dense Data Existing Catalog Audit](../dense-data-existing-catalog-audit.md)
records how notes/pages, knowledge entities/facts, knowledge graph relations,
custom fields, signals, attachments, CRM, billing, ERP, infra/ops, and identity
fit into this model. Future dense packs must update that audit when they reuse,
extend, retire, or replace an existing surface.
The [Dense Data Source Decision Audit](../dense-data-source-decision-audit.md)
enumerates the unique decision-bearing user turns that must be satisfied before
the private goal can close.

`claw inspect dense-data`, `claw inspect dense-intents`,
`claw inspect dense-views`, and `claw inspect dense-fixtures` expose the dense
registry, generated intent coverage, semantic-view catalog, and synthetic
acceptance fixture without executing unknown behavior. These commands are the
scale gate for "CLI intention completeness": every generated entry must resolve
to a covered command, explicit workflow/data gap, blocked state, external
pending state, or custom pack. The fixture covers patient, study, sample, legal
case, legal client, invoice/company, incident/service, learner/course relations and lessons,
company and manufacturing asset/work-order relations, clinical encounters,
evidence, provenance, and partial-data quality gaps. It also materializes the
registry layer itself:
`domain_systems`, `domain_packs`, `domain_roles`, `domain_profiles`,
`canonical_operations`, `semantic_views`, generated `domain_intents`, and
`external_pending` quality-gap records.
`claw dense-fixtures seed` writes that fixture into local `core.sqlite` with
stable fixture IDs, so the acceptance set is executable through normal DB and
human noun commands rather than remaining an inspect-only artifact.

Semantic-view routes start as stable view contracts tied to the registry and
graduate to materialized views when local data is available. `claw patient <id>
timeline` now reads `patients`, `encounters`, `medications`, `symptom_logs`,
`lab_results`, `evidence_sources`, `quality_gaps`, and `provenance_events` from local
`core.sqlite`, returns `implementationStatus: "materialized_semantic_view"`,
and marks the view partial when quality gaps remain. This keeps the view useful
without pretending that external clinical/provider validation has happened.
The same pattern now applies to `claw case <id> timeline`, which materializes
`legal_cases`, `legal_clients`, `case_evidence`, `evidence_sources`,
`quality_gaps`, and `provenance_events` into a legal case timeline while keeping legal
decisioning/advice outside the local acceptance claim.
`claw service <id> timeline` also materializes `services`, `incidents`,
`evidence_sources`, `quality_gaps`, and `provenance_events` so ops/ITSM can
show service history and explicit missing SLO/check data without pretending to
be the live monitor/APM integration.
Lab and biology timeline routes follow the same local-first pattern:
`claw sample <id> timeline` materializes `samples`, `assays`, evidence, gaps,
and provenance, while `claw experiment <id> timeline` materializes
`biology_experiments`, child samples, assays, evidence, gaps, and provenance.
Research uses `claw study <id> timeline` to materialize `studies`,
`participants`, linked samples, evidence, gaps, and provenance, keeping CTMS
sync as `external_pending` unless a real provider connector is validated.
Education/LMS uses `claw learner <id> timeline` to materialize `learners`,
related `courses` through the shared `entity_relations` graph, evidence, gaps,
and provenance. This keeps enrollment/progress-style links inside the universal
relation model instead of creating a parallel LMS graph.
It also materializes `claw course <id> timeline` from `courses`, `lessons`,
`study_sessions`, related learners via `entity_relations`, evidence, provenance,
and quality gaps so course-centric LMS workflows are not forced through the
learner view.
HR/HRIS uses `claw employee <id> timeline` to materialize `employees`,
`time_off_requests`, `performance_reviews`, `pay_stubs`,
`benefits_enrollments`, `one_on_ones`, evidence, provenance, and quality gaps
without creating a second people graph.
Real Estate/PropTech uses `claw property <id> timeline` to materialize existing
`property_listings`, `property_visits`, `property_offers`,
`property_inspections`, evidence, provenance, and quality gaps without adding a
second property model.
Insurance uses `claw insurance-policy <id> timeline` to materialize
`insurance_policies`, related receipts/evidence, provenance, and quality gaps,
with vehicle-specific policies kept in `vehicle_insurance_policies` instead of
overloading generic policy-gate records.
Manufacturing uses `claw work-order <id> timeline` to materialize
`work_orders`, evidence, quality gaps, and provenance as the MES slice grows
toward material, operation, labor, equipment, and quality event records.
It also uses `claw asset <id> timeline` to materialize `assets`, company/account
anchors, product catalog references, related work orders, cross-domain
`entity_relations`, evidence, quality gaps, and provenance so CMMS/MES-style
asset history is not forced into a parallel maintenance database.
Maintenance/CMMS uses `claw vehicle <id> timeline` to materialize `vehicles`,
`vehicle_maintenance`, `vehicle_insurance_policies`, evidence, provenance, and
quality gaps, while appliance service records stay in `appliance_maintenance`
linked to `appliances`.
Procurement uses `claw purchase-order <id> timeline` to materialize
`purchase_orders`, suppliers, company anchors, `purchase_order_line_items`,
evidence, provenance, and quality gaps without folding supplier identity,
inventory receipt, accounting, or payment execution into one supercollection.
Warehouse/WMS uses `claw warehouse <id> timeline` to materialize `warehouses`,
`inventory_items`, `stock_movements`, product catalog references, evidence,
provenance, and quality gaps without conflating WMS inventory, procurement
commitments, transport shipments, household inventory, or accounting entries.
Supply Chain/SCM uses `claw supply-plan <id> timeline` to materialize
`supply_plans`, `supply_plan_items`, `supply_risks`, suppliers,
`purchase_orders`, warehouses, `inventory_items`, product catalog references,
evidence, provenance, and quality gaps. SCM remains an orchestration pack over
procurement and warehouse data rather than a duplicated supplier, stock, or
accounting database.
Compliance/GRC uses `claw control <id> timeline` to materialize
`compliance_controls`, `compliance_obligations`, `control_assessments`,
`compliance_findings`, company anchors, evidence, provenance, and quality gaps.
It deliberately stays separate from runtime agents `policy_gates`, generic
project health audit records, and the universal `quality_gaps` primitive.
IoT uses `claw thing <id> timeline` to materialize `iot_things`,
`iot_devices`, `sensor_readings`, `device_commands`, company/asset anchors,
evidence, provenance, and quality gaps. It extends the existing `iot config`
and `iot serve` portal without replacing connector setup; real device control
and physical telemetry are tracked as EXTERNAL PENDING unless validated against
actual hardware or a certified simulator.
Construction uses `claw construction-project <id> timeline` to materialize
`construction_projects`, `construction_sites`, `construction_rfis`,
`construction_change_orders`, company anchors, evidence, provenance, and quality
gaps. It deliberately avoids the generic `project` and HR `contractor`
collections while reusing companies, employees, real-estate locations, invoices,
evidence, and quality gaps.
ERP now has a materialized company overview through `claw erp company <id>
overview`: it reads the shared company anchor plus CRM accounts/deals, billing
customers, invoices, payment intents, services, work orders, evidence,
provenance, and quality gaps from `core.sqlite`. This keeps ERP as an
orchestrator over existing canonical owners rather than creating a parallel
ERP supercollection.
The direct shared-company route `claw company <id> timeline` materializes the
same company anchor as a chronological view across CRM accounts/deals,
contacts/activities, billing customers, invoices, payments, services, assets,
work orders, product catalog records, relations, evidence, provenance, and
quality gaps. This gives the universal company entity a timeline without making
users go through the ERP portal for ordinary company history.
CRM account overview is also materialized: `claw crm account <id> overview`
reads the shared `accounts` record, company anchor, `deals`, `contacts`,
`activities`, evidence, provenance, and quality gaps. This keeps CRM inside the
same dense-data operating system rather than maintaining a separate CRM graph
or second account model.
Finance/accounting now materializes `claw finance entity <id> overview` and
the alias `claw accounting entity <id> overview` from `financial_accounts`,
`transactions`, evidence, provenance, and quality gaps. The view keeps
financial accounts as the accounting-entity center while leaving payment and
invoice records under their existing billing/ERP owners.

The registry also carries explicit `external_pending` requirements for real
EHR/FHIR exchange, lab instrument ingestion, CTMS synchronization, payment
processor settlement/refund mutation, and live monitor/APM ingestion. These
rows are not bugs and are not considered validated by local tests; they require
provider, physical-device, regulated-export, cost-bearing, or live-runtime
evidence through the relevant approval and connector path.

Future implementation slices must connect this registry into CLI command
coverage, command-intent resolution, database schema inspection, docs, and
negative tests that block duplicated parallel systems.

## Consequences

Dense data expansion happens by graduating systems and centers under this
registry, not by adding isolated CLI commands or provider-shaped tables. The
model favors broad recognizable coverage with sparse structured records,
typed relations, evidence, provenance, and quality gaps over a large number of
duplicated fields.

Before the private goal can close, the source conversation decisions must be
reviewed one by one against implementation, docs, CLI help, registry coverage,
tests, and explicit `EXTERNAL PENDING` markers where real provider or physical
validation is unavailable.
