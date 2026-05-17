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
  Labs/LIMS, Legal, ERP, CRM, Finance/Accounting, Education/LMS,
  Manufacturing/MES, and Operations/ITSM
- a roadmap taxonomy for HR/HRIS, SCM, WMS, TMS, procurement, GRC, real
  estate, insurance, government, construction, IoT, CMS, PIM/PLM, pharma,
  CMMS, and ELN
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
`patient create`, `medication add --patient <id>`, `patient <id> medications
list`, `patient <id> symptoms add`, `patient <id> symptoms list`, and
ERP/CRM routes such as `company create`, `account create --company <id>`,
`deal create --company <id>`, `invoice list`, and
`invoice create --billing-customer <id>` all resolve to canonical core.sqlite
collections. Legal and ops centers also graduate through shared collections:
`case create`, `case <id> evidence add/list`, `service create`,
`incident create --service <id>`, and `service <id> incidents list`. Research,
labs, education, and manufacturing now follow the same rule: `study create`,
`study <id> participants add/list`, `sample create`,
`sample <id> assays add`, `learner create`, `course create`, and
`work-order create` execute against canonical collections. Finance/accounting
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
case, invoice/company, incident/service, course, manufacturing work order,
evidence, provenance, and partial-data quality gaps.
`claw dense-fixtures seed` writes that fixture into local `core.sqlite` with
stable fixture IDs, so the acceptance set is executable through normal DB and
human noun commands rather than remaining an inspect-only artifact.

Semantic-view routes start as stable view contracts tied to the registry and
graduate to materialized views when local data is available. `claw patient <id>
timeline` now reads `patients`, `medications`, `symptom_logs`,
`evidence_sources`, `quality_gaps`, and `provenance_events` from local
`core.sqlite`, returns `implementationStatus: "materialized_semantic_view"`,
and marks the view partial when quality gaps remain. This keeps the view useful
without pretending that external clinical/provider validation has happened.

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
