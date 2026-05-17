export type ClawDenseDataWave = "foundation" | "first_wave" | "roadmap";

export type ClawDenseDataSensitivityDefault = "normal" | "high";

export type ClawDenseDataStoragePolicy = "core_sqlite" | "sidecar_exception_only";

export type ClawDenseDataIntentStatus =
  | "covered"
  | "partial"
  | "alias_candidate"
  | "data_gap"
  | "workflow_gap"
  | "external_pending"
  | "blocked"
  | "custom_pack";

export interface ClawDenseDataCenter {
  id: string;
  label: string;
  commandNoun: string;
  commandAliases: string[];
  collectionName?: string;
  profileKind?: string;
  notes: string;
}

export interface ClawDenseDataOperation {
  id: string;
  label: string;
  routes: string[];
  createsOrReads: string[];
}

export interface ClawDenseDataSemanticView {
  id: string;
  label: string;
  commandPattern: string;
  operationId: string;
  requiredInputs: string[];
  outputShape: string;
}

export interface ClawDenseDataIntentResolution {
  schemaVersion: 1;
  phrase: string;
  normalizedPhrase: string;
  status: ClawDenseDataIntentStatus;
  system?: ClawDenseDataSystem;
  center?: ClawDenseDataCenter;
  operation?: ClawDenseDataOperation;
  matchedRoute?: string;
  reasons: string[];
  nextSteps: string[];
  execute: false;
}

export interface ClawDenseDataSystem {
  id: string;
  label: string;
  wave: ClawDenseDataWave;
  canonicalCommand: string;
  aliases: string[];
  visiblePack: boolean;
  orchestrator: boolean;
  storagePolicy: ClawDenseDataStoragePolicy;
  sensitivityDefault: ClawDenseDataSensitivityDefault;
  sharedEngines: string[];
  centers: ClawDenseDataCenter[];
  commandPatterns: string[];
  operations: ClawDenseDataOperation[];
  semanticViews: ClawDenseDataSemanticView[];
  standards: string[];
  notes: string;
}

export interface ClawDenseDataOsRegistry {
  schemaVersion: 1;
  sourceConversationId: string;
  sourcePlanId: string;
  privateGoalReference: string;
  foundationPrimitives: string[];
  foundationCollections: Record<string, string>;
  sharedEngines: string[];
  intentStatuses: ClawDenseDataIntentStatus[];
  routeRejectionReasons: string[];
  externalPendingRequirements: ClawDenseDataExternalPendingRequirement[];
  standardCollectionActions: string[];
  systems: ClawDenseDataSystem[];
}

export interface ClawDenseDataExternalPendingRequirement {
  id: string;
  systemId: string;
  label: string;
  requirementType: "provider" | "physical_device" | "native_permission" | "cost_bearing" | "regulated_export";
  status: "external_pending";
  reason: string;
  validationNeeded: string;
}

export interface ClawDenseDataIntentEntry {
  id: string;
  systemId: string;
  command: string;
  phrase: string;
  status: ClawDenseDataIntentStatus;
  mappedCommand?: string;
  collectionName?: string;
  operationId?: string;
  reasons: string[];
  nextSteps: string[];
}

export interface ClawDenseDataSemanticViewEntry extends ClawDenseDataSemanticView {
  systemId: string;
}

export const clawDenseDataIntentStatuses: ClawDenseDataIntentStatus[] = [
  "covered",
  "partial",
  "alias_candidate",
  "data_gap",
  "workflow_gap",
  "external_pending",
  "blocked",
  "custom_pack",
];

export const clawDenseDataOsRegistry: ClawDenseDataOsRegistry = {
  schemaVersion: 1,
  sourceConversationId: "019e35a1-06bb-77f2-a712-92ed2646bd15",
  sourcePlanId: "019e3659-0335-7811-9cda-c9d176e91515-plan",
  privateGoalReference: "claw-dense-data-os-plan-2026-05-17",
  foundationPrimitives: [
    "identity_base",
    "domain_roles",
    "typed_profiles",
    "evidence_sources",
    "provenance_events",
    "quality_gaps",
    "canonical_operations",
    "semantic_views",
    "domain_systems",
    "domain_packs",
    "domain_intents",
    "vocabularies",
    "concepts",
    "concept_mappings",
    "units",
    "instruments",
    "instrument_items",
    "instrument_responses",
    "universal_relations",
  ],
  foundationCollections: {
    identity_base: "people",
    domain_roles: "domain_roles",
    typed_profiles: "domain_profiles",
    evidence_sources: "evidence_sources",
    provenance_events: "provenance_events",
    quality_gaps: "quality_gaps",
    canonical_operations: "canonical_operations",
    semantic_views: "semantic_views",
    domain_systems: "domain_systems",
    domain_packs: "domain_packs",
    domain_intents: "domain_intents",
    vocabularies: "vocabularies",
    concepts: "concepts",
    concept_mappings: "concept_mappings",
    units: "units",
    instruments: "instruments",
    instrument_items: "instrument_items",
    instrument_responses: "instrument_responses",
    universal_relations: "entity_relations",
  },
  sharedEngines: [
    "identity_role_profile",
    "evidence_provenance",
    "quality_gap",
    "relation_graph",
    "semantic_view",
    "intent_coverage",
    "vocabulary_unit",
    "instrument_response",
    "timeline",
    "document_evidence",
    "finance_accounting",
    "workflow_state",
    "location",
  ],
  intentStatuses: clawDenseDataIntentStatuses,
  routeRejectionReasons: [
    "ambiguous_route",
    "permission_gate",
    "cost_gate",
    "external_dependency",
    "duplicate_data_risk",
    "incorrect_data_risk",
    "destructive_action",
  ],
  externalPendingRequirements: [
    {
      id: "external_pending_health_ehr_export",
      systemId: "health",
      label: "Real EHR/FHIR export or import",
      requirementType: "regulated_export",
      status: "external_pending",
      reason: "Requires an approved provider, patient-data authorization, and export/send gate; hermetic fixtures only prove local structure.",
      validationNeeded: "Brokered provider fixture plus explicit live/manual approval for the target EHR environment.",
    },
    {
      id: "external_pending_labs_instrument_ingest",
      systemId: "labs",
      label: "Physical lab instrument ingestion",
      requirementType: "physical_device",
      status: "external_pending",
      reason: "Requires actual instrument output or a vendor-certified simulator; local DB tests cannot prove physical device behavior.",
      validationNeeded: "Instrument-specific connector fixture and a real or certified simulated run marked separately from local tests.",
    },
    {
      id: "external_pending_research_ctms_sync",
      systemId: "research",
      label: "External CTMS or registry synchronization",
      requirementType: "provider",
      status: "external_pending",
      reason: "Requires provider credentials, consent/workspace boundaries, and schema mapping for the specific CTMS or registry.",
      validationNeeded: "Connector-control-plane provider mapping, fixture replay, and approved live/manual sync.",
    },
    {
      id: "external_pending_erp_payment_settlement",
      systemId: "erp",
      label: "Payment processor settlement or refund mutation",
      requirementType: "cost_bearing",
      status: "external_pending",
      reason: "Can move money or mutate an external ledger; dense ERP fixtures only validate local representation.",
      validationNeeded: "Dry-run fixture first, then explicit cost-bearing approval through the connector control plane.",
    },
    {
      id: "external_pending_ops_monitor_runtime",
      systemId: "ops",
      label: "Live monitor/APM incident ingestion",
      requirementType: "provider",
      status: "external_pending",
      reason: "Requires a real monitoring provider or live runtime signal and should not be treated as a local ITSM record bug.",
      validationNeeded: "Provider catalog mapping, fixture event replay, and live provider validation when explicitly enabled.",
    },
    {
      id: "external_pending_iot_physical_dispatch",
      systemId: "iot",
      label: "Physical IoT telemetry or command dispatch",
      requirementType: "physical_device",
      status: "external_pending",
      reason: "Requires actual device hardware, a trusted gateway, or a certified simulator; local DB tests only prove representation and command audit state.",
      validationNeeded: "Fixture replay first, then explicit physical-device validation with brokered permissions and recorded approval.",
    },
    {
      id: "external_pending_eln_signature_integrity",
      systemId: "eln",
      label: "Validated ELN signatures and instrument capture",
      requirementType: "regulated_export",
      status: "external_pending",
      reason: "Requires a validated e-signature or instrument capture environment; local DB tests prove notebook structure, lineage, and gaps but not regulatory execution.",
      validationNeeded: "Fixture replay first, then approved provider or certified-simulator validation for signatures, immutable audit trails, and instrument files.",
    },
  ],
  standardCollectionActions: ["list", "get", "create", "update", "delete", "query", "schema", "purge"],
  systems: [
    denseSystem({
      id: "health",
      label: "Health / EHR",
      command: "health",
      aliases: ["ehr"],
      sensitivityDefault: "high",
      sharedEngines: ["identity_role_profile", "evidence_provenance", "quality_gap", "relation_graph", "semantic_view", "intent_coverage", "vocabulary_unit", "instrument_response", "timeline", "document_evidence"],
      centers: [
        center("patient", "Patient", "patient", "patient_profile", "Human-facing clinical center; backed by minimal shared identity plus patient role/profile.", undefined, "patients"),
        center("encounter", "Encounter", "encounter", undefined, "Clinical visit/contact center for appointments, procedures, documents, observations, and follow-up.", undefined, "encounters"),
        center("medication", "Medication", "medication", undefined, "Medication center for active/historical drug exposure, orders, doses, and evidence links.", undefined, "medications"),
        center("symptom", "Symptom", "symptom", undefined, "Symptom center for reported problems, observations, severity, timing, provenance, and quality gaps.", ["symptoms"], "symptom_logs"),
        center("lab_result", "Lab Result", "lab", undefined, "Lab result center for ordered, collected, reported, document-backed, and partial lab values.", ["labs", "lab-result", "lab-results"], "lab_results"),
      ],
      commandPatterns: [
        "claw patient list|get|create|update|delete|query|schema",
        "claw patient <id> timeline",
        "claw patient <id> encounters list|add",
        "claw encounter list|get|create|update|delete|query|schema",
        "claw encounter add --patient <id>",
        "claw patient <id> medications list|add",
        "claw symptom list|get|create|update|delete|query|schema",
        "claw patient <id> labs list|add",
        "claw lab list|get|create|update|delete|query|schema",
        "claw lab add --patient <id>",
        "claw medication list|get|create|update|delete|query|schema",
        "claw medication add --patient <id>",
        "claw health overview|gaps|intents",
        "claw ehr overview|gaps|intents",
      ],
      operations: [
        operation("patient.encounter.add", "Add or link patient clinical encounter", ["claw patient <id> encounter add", "claw encounter add --patient <id>"], ["patient_profile", "encounter", "evidence_source", "quality_gap"]),
        operation("patient.medication.add", "Add or link patient medication", ["claw patient <id> medication add", "claw medication add --patient <id>"], ["patient_profile", "medication", "medication_order_or_dose"]),
        operation("patient.lab.add", "Add patient lab evidence or value", ["claw patient <id> lab add", "claw lab add --patient <id>"], ["lab_result", "lab_value", "evidence_source", "quality_gap"]),
        operation("patient.timeline", "Read patient timeline", ["claw patient <id> timeline"], ["timeline_view"]),
      ],
      semanticViews: [
        view("patient.timeline", "Patient timeline", "claw patient <id> timeline", "patient.timeline", ["patient_id"], "ordered clinical/research/evidence events with provenance and gaps"),
        view("patient.medications", "Patient medications", "claw patient <id> medications list", "patient.medication.add", ["patient_id"], "active and historical medication relations"),
      ],
      standards: ["FHIR", "openEHR", "SNOMED CT", "LOINC", "ICD", "RxNorm"],
      notes: "Clinical decisions are out of scope; Claw structures, queries, links, and surfaces gaps.",
    }),
    denseSystem({
      id: "research",
      label: "Research / CTMS",
      command: "research",
      aliases: ["ctms"],
      sensitivityDefault: "high",
      sharedEngines: ["identity_role_profile", "evidence_provenance", "quality_gap", "relation_graph", "semantic_view", "intent_coverage", "vocabulary_unit", "instrument_response", "timeline", "document_evidence"],
      centers: [
        center("study", "Study", "study", undefined, "Research protocol/study center for participants, cohorts, events, documents, and analysis readiness.", undefined, "studies"),
        center("participant", "Participant", "participant", "participant_profile", "Research role/profile over shared identity.", undefined, "participants"),
      ],
      commandPatterns: [
        "claw study list|get|create|update|delete|query|schema",
        "claw study <id> cohort list",
        "claw study <id> timeline",
        "claw participant list|get|create|update|query",
        "claw research overview|gaps|intents",
        "claw ctms overview|gaps|intents",
      ],
      operations: [
        operation("study.cohort.list", "List study cohort", ["claw study <id> cohort list"], ["study", "cohort", "participant_profile"]),
        operation("study.evidence.link", "Link research evidence", ["claw study <id> evidence add"], ["study", "evidence_source", "provenance_event"]),
        operation("study.timeline", "Read study timeline", ["claw study <id> timeline"], ["study", "participant_profile", "sample", "evidence_source", "provenance_event"]),
      ],
      semanticViews: [
        view("study.cohort", "Study cohort", "claw study <id> cohort list", "study.cohort.list", ["study_id"], "participants/cohorts with eligibility, consent, and quality gaps"),
        view("study.timeline", "Study timeline", "claw study <id> timeline", "study.timeline", ["study_id"], "study events, participants, samples, evidence, provenance, and gaps"),
      ],
      standards: ["CDISC", "OMOP", "FHIR ResearchStudy", "FHIR ResearchSubject"],
      notes: "Research is transversal and shares engines with health, labs, biology, and analytics.",
    }),
    denseSystem({
      id: "biology",
      label: "Biology",
      command: "biology",
      aliases: [],
      sensitivityDefault: "high",
      sharedEngines: ["evidence_provenance", "quality_gap", "relation_graph", "semantic_view", "intent_coverage", "vocabulary_unit", "instrument_response", "timeline"],
      centers: [
        center("organism", "Organism", "organism", undefined, "Biological entity center for samples, assays, observations, and datasets.", undefined, "organisms"),
        center("experiment", "Experiment", "experiment", undefined, "Experimental workflow center shared with ELN/LIMS style data.", ["experiments", "biology-experiment", "biology-experiments"], "biology_experiments"),
      ],
      commandPatterns: ["claw biology overview|gaps|intents", "claw experiment list|get|create|update|query", "claw experiment <id> timeline", "claw organism list|get|create|query"],
      operations: [operation("experiment.timeline", "Read experiment timeline", ["claw experiment <id> timeline"], ["experiment", "sample", "assay", "evidence_source"])],
      semanticViews: [view("experiment.timeline", "Experiment timeline", "claw experiment <id> timeline", "experiment.timeline", ["experiment_id"], "ordered experiment events, samples, assays, and evidence")],
      standards: ["ISA-Tab", "BioSample"],
      notes: "Visible as its own area while sharing research/lab engines.",
    }),
    denseSystem({
      id: "labs",
      label: "Labs / LIMS",
      command: "labs",
      aliases: ["lims"],
      sensitivityDefault: "high",
      sharedEngines: ["evidence_provenance", "quality_gap", "relation_graph", "semantic_view", "intent_coverage", "vocabulary_unit", "instrument_response", "timeline", "document_evidence"],
      centers: [
        center("sample", "Sample", "sample", undefined, "Specimen/material center for collection, chain, assay, storage, result, and provenance.", ["samples", "specimen", "specimens"], "samples"),
        center("assay", "Assay", "assay", undefined, "Test/protocol center for measured values and quality criteria.", undefined, "assays"),
      ],
      commandPatterns: ["claw sample list|get|create|update|query|schema", "claw sample <id> timeline", "claw labs overview|gaps|intents", "claw lims overview|gaps|intents"],
      operations: [operation("sample.timeline", "Read sample timeline", ["claw sample <id> timeline"], ["sample", "assay", "lab_result", "provenance_event"])],
      semanticViews: [view("sample.timeline", "Sample timeline", "claw sample <id> timeline", "sample.timeline", ["sample_id"], "collection, custody, processing, assay, and result events")],
      standards: ["LOINC", "HL7", "ISA-Tab"],
      notes: "Supports both clinical labs and research labs without forcing one schema vocabulary.",
    }),
    denseSystem({
      id: "legal",
      label: "Legal Case Management",
      command: "legal",
      aliases: ["case-management"],
      sensitivityDefault: "high",
      sharedEngines: ["identity_role_profile", "evidence_provenance", "quality_gap", "relation_graph", "semantic_view", "intent_coverage", "timeline", "document_evidence", "workflow_state"],
      centers: [
        center("case", "Case", "case", undefined, "Legal matter/case center for parties, evidence, deadlines, filings, facts, and documents.", ["cases", "matter", "matters"], "legal_cases"),
        center("legal_client", "Legal Client", "legal-client", "legal_client_profile", "Domain role over shared identity or organization.", ["legal-clients"], "legal_clients"),
      ],
      commandPatterns: ["claw case list|get|create|update|delete|query|schema", "claw case <id> evidence list|add", "claw case <id> clients list|add", "claw legal-client list|get|create|update|delete|query|schema", "claw legal-client add --case <id>", "claw case <id> timeline", "claw legal overview|gaps|intents"],
      operations: [
        operation("case.evidence.add", "Add case evidence", ["claw case <id> evidence add"], ["case", "evidence_source", "provenance_event"]),
        operation("case.client.add", "Add or link case legal client", ["claw case <id> client add", "claw legal-client add --case <id>"], ["case", "legal_client_profile", "domain_profile", "quality_gap"]),
        operation("case.timeline", "Read case timeline", ["claw case <id> timeline"], ["case", "deadline", "document", "evidence_source"]),
      ],
      semanticViews: [
        view("case.evidence", "Case evidence", "claw case <id> evidence list", "case.evidence.add", ["case_id"], "case evidence with source, custody, confidence, and gaps"),
        view("case.timeline", "Case timeline", "claw case <id> timeline", "case.timeline", ["case_id"], "case events, evidence, documents, provenance, deadlines, and gaps"),
      ],
      standards: ["Akoma Ntoso", "LegalRuleML"],
      notes: "Legal advice/decisioning remains out of scope; data organization and evidence reasoning are in scope.",
    }),
    denseSystem({
      id: "erp",
      label: "ERP",
      command: "erp",
      aliases: [],
      sensitivityDefault: "normal",
      sharedEngines: ["identity_role_profile", "evidence_provenance", "quality_gap", "relation_graph", "semantic_view", "intent_coverage", "finance_accounting", "workflow_state", "document_evidence"],
      centers: [
        center("company", "Company", "company", "organization_profile", "Business organization center shared with CRM, billing, finance, procurement, and legal.", undefined, "companies"),
        center("product", "Product", "product", undefined, "Catalog/product center shared across commerce, inventory, procurement, PIM, and billing.", undefined, "products_catalog"),
        center("invoice", "Invoice", "invoice", undefined, "Invoice center shared across ERP, accounting, billing, payments, documents, and reconciliation.", undefined, "invoices"),
        center("payment", "Payment", "payment", undefined, "Payment center for money movement, reconciliation, evidence, and accounting links.", undefined, "payment_intents"),
      ],
      commandPatterns: [
        "claw erp overview|gaps|intents",
        "claw erp company <id> overview",
        "claw company <id> timeline",
        "claw invoice list|get|create|update|delete|query|schema",
        "claw payment list|get|create|update|delete|query|schema",
      ],
      operations: [
        operation("erp.company.overview", "Read ERP company overview", ["claw erp company <id> overview"], ["company", "invoice", "payment", "product", "accounting_entry"]),
        operation("company.timeline", "Read company timeline", ["claw company <id> timeline"], ["company", "account", "deal", "invoice", "payment", "service", "asset", "work_order", "evidence_source", "quality_gap", "provenance_event"]),
        operation("invoice.list", "List invoices", ["claw invoice list"], ["invoice", "company", "payment", "document_evidence"]),
      ],
      semanticViews: [
        view("erp.company.overview", "ERP company overview", "claw erp company <id> overview", "erp.company.overview", ["company_id"], "company/accounting/CRM/procurement/billing summary"),
        view("company.timeline", "Company timeline", "claw company <id> timeline", "company.timeline", ["company_id"], "company accounts, deals, billing, ops, manufacturing, evidence, provenance, and gaps"),
        view("invoice.list", "Invoice list", "claw invoice list", "invoice.list", ["workspace_id"], "invoices with company, payment, evidence, and reconciliation gaps"),
      ],
      standards: ["UBL", "Peppol", "XBRL"],
      notes: "ERP is an orchestrator over shared collections, not a supercollection.",
    }),
    denseSystem({
      id: "crm",
      label: "CRM",
      command: "crm",
      aliases: [],
      sensitivityDefault: "normal",
      sharedEngines: ["identity_role_profile", "evidence_provenance", "quality_gap", "relation_graph", "semantic_view", "intent_coverage", "workflow_state", "document_evidence"],
      centers: [
        center("account", "Account", "account", "account_profile", "Customer/account organization role shared with company identity.", undefined, "accounts"),
        center("deal", "Deal", "deal", undefined, "Sales opportunity center for pipeline, contacts, activities, quotes, and contracts.", undefined, "deals"),
      ],
      commandPatterns: ["claw crm overview|gaps|intents", "claw account list|get|create|update|query|schema", "claw deal list|get|create|update|query|schema"],
      operations: [operation("crm.account.overview", "Read CRM account overview", ["claw crm account <id> overview"], ["account", "contact", "deal", "activity"])],
      semanticViews: [view("crm.account.overview", "CRM account overview", "claw crm account <id> overview", "crm.account.overview", ["account_id"], "account contacts, deals, activities, support, and gaps")],
      standards: [],
      notes: "Existing CRM collections must be reaudited under the dense-data rules.",
    }),
    denseSystem({
      id: "finance",
      label: "Finance / Accounting",
      command: "finance",
      aliases: ["accounting"],
      sensitivityDefault: "high",
      sharedEngines: ["evidence_provenance", "quality_gap", "relation_graph", "semantic_view", "intent_coverage", "finance_accounting", "document_evidence"],
      centers: [
        center("accounting_entity", "Accounting Entity", "accounting-entity", undefined, "Ledger/reporting entity center for finance and ERP.", ["accounting-entities", "financial-account", "financial-accounts"], "financial_accounts"),
        center("transaction", "Transaction", "transaction", undefined, "Financial event center for payments, invoices, balances, and reconciliation.", undefined, "transactions"),
      ],
      commandPatterns: ["claw finance overview|gaps|intents", "claw accounting overview|gaps|intents", "claw transaction list|get|create|update|query|schema", "claw finance entity <id> overview", "claw accounting entity <id> overview"],
      operations: [operation("finance.entity.overview", "Read finance entity overview", ["claw finance entity <id> overview", "claw accounting entity <id> overview"], ["accounting_entity", "transaction", "invoice", "accounting_entry"])],
      semanticViews: [view("finance.entity.overview", "Finance entity overview", "claw finance entity <id> overview", "finance.entity.overview", ["entity_id"], "ledger, transaction, invoice, and reconciliation state")],
      standards: ["XBRL", "ISO 20022"],
      notes: "Finance is connected to ERP/billing but remains a visible system.",
    }),
    denseSystem({
      id: "education",
      label: "Education / LMS",
      command: "education",
      aliases: ["lms"],
      sensitivityDefault: "normal",
      sharedEngines: ["identity_role_profile", "evidence_provenance", "quality_gap", "relation_graph", "semantic_view", "intent_coverage", "instrument_response", "timeline"],
      centers: [
        center("learner", "Learner", "learner", "learner_profile", "Learning role over shared identity.", undefined, "learners"),
        center("course", "Course", "course", undefined, "Course/program center for lessons, assignments, exams, credentials, and progress.", undefined, "courses"),
      ],
      commandPatterns: ["claw education overview|gaps|intents", "claw lms overview|gaps|intents", "claw course list|get|create|update|query|schema", "claw course <id> lessons list|add", "claw course <id> timeline", "claw learner <id> timeline"],
      operations: [
        operation("learner.timeline", "Read learner timeline", ["claw learner <id> timeline"], ["learner_profile", "course", "assessment", "credential"]),
        operation("course.timeline", "Read course timeline", ["claw course <id> timeline"], ["course", "lesson", "study_session", "learner_profile", "evidence_source"]),
      ],
      semanticViews: [
        view("learner.timeline", "Learner timeline", "claw learner <id> timeline", "learner.timeline", ["learner_id"], "course, assessment, study, credential, and progress events"),
        view("course.timeline", "Course timeline", "claw course <id> timeline", "course.timeline", ["course_id"], "course lessons, sessions, learners, evidence, provenance, and gaps"),
      ],
      standards: ["xAPI", "LTI", "SCORM"],
      notes: "Learning and education builtins must converge under this system model.",
    }),
    denseSystem({
      id: "hr",
      label: "HR / HRIS",
      command: "hr",
      aliases: ["hris"],
      sensitivityDefault: "high",
      sharedEngines: ["identity_role_profile", "evidence_provenance", "quality_gap", "relation_graph", "semantic_view", "intent_coverage", "workflow_state", "timeline", "document_evidence"],
      centers: [
        center("employee", "Employee", "employee", "employee_profile", "Employee role/profile over shared identity and company anchors.", undefined, "employees"),
        center("time_off", "Time Off Request", "time-off", undefined, "Leave request center for balances, approvals, evidence, and gaps.", ["pto", "time-off-requests"], "time_off_requests"),
        center("performance_review", "Performance Review", "performance-review", undefined, "Review center for cycles, feedback, ratings, goals, and provenance.", ["performance-reviews", "review", "reviews"], "performance_reviews"),
        center("payroll", "Payroll Run", "payroll", undefined, "Payroll run center for pay periods, pay stubs, approvals, and reconciliation evidence.", ["payrolls", "payroll-run", "payroll-runs"], "payroll_runs"),
      ],
      commandPatterns: [
        "claw hr overview|gaps|intents",
        "claw hris overview|gaps|intents",
        "claw employee list|get|create|update|delete|query|schema",
        "claw employee <id> timeline",
        "claw employee <id> time-off list|add",
        "claw time-off list|get|create|update|delete|query|schema",
        "claw time-off add --employee <id>",
        "claw employee <id> reviews list|add",
        "claw performance-review list|get|create|update|delete|query|schema",
        "claw payroll list|get|create|update|delete|query|schema",
      ],
      operations: [
        operation("employee.time_off.add", "Add or link employee time off", ["claw employee <id> time-off add", "claw time-off add --employee <id>"], ["employee_profile", "time_off_request", "approval_state", "quality_gap"]),
        operation("employee.review.add", "Add or link employee performance review", ["claw employee <id> review add"], ["employee_profile", "performance_review", "goal", "evidence_source"]),
        operation("employee.timeline", "Read employee timeline", ["claw employee <id> timeline"], ["employee_profile", "time_off_request", "performance_review", "benefit", "pay_stub", "evidence_source"]),
      ],
      semanticViews: [
        view("employee.timeline", "Employee timeline", "claw employee <id> timeline", "employee.timeline", ["employee_id"], "employee lifecycle, leave, performance, payroll, benefits, evidence, provenance, and gaps"),
      ],
      standards: ["HR-XML", "SCIM"],
      notes: "HRIS is sensitive structured people data; Claw stores and relates records, but payroll/provider execution remains gated.",
    }),
    denseSystem({
      id: "manufacturing",
      label: "Manufacturing / MES",
      command: "manufacturing",
      aliases: ["mes"],
      sensitivityDefault: "normal",
      sharedEngines: ["evidence_provenance", "quality_gap", "relation_graph", "semantic_view", "intent_coverage", "workflow_state", "document_evidence", "timeline"],
      centers: [
        center("work_order", "Work Order", "work-order", undefined, "Manufacturing execution center for materials, operations, quality, labor, and equipment.", ["work-orders"], "work_orders"),
        center("asset", "Asset", "asset", undefined, "Equipment/production asset center shared with maintenance and ops.", undefined, "assets"),
      ],
      commandPatterns: ["claw manufacturing overview|gaps|intents", "claw mes overview|gaps|intents", "claw work-order list|get|create|update|query|schema", "claw work-order <id> timeline", "claw asset list|get|create|update|query|schema", "claw asset <id> work-orders list|add", "claw asset <id> timeline"],
      operations: [
        operation("work_order.timeline", "Read work order timeline", ["claw work-order <id> timeline"], ["work_order", "asset", "material", "quality_event"]),
        operation("asset.timeline", "Read asset timeline", ["claw asset <id> timeline"], ["asset", "work_order", "evidence_source", "quality_gap", "provenance_event"]),
      ],
      semanticViews: [
        view("work_order.timeline", "Work order timeline", "claw work-order <id> timeline", "work_order.timeline", ["work_order_id"], "materials, operations, quality, labor, evidence, and gaps"),
        view("asset.timeline", "Asset timeline", "claw asset <id> timeline", "asset.timeline", ["asset_id"], "asset ownership, work orders, evidence, provenance, and quality gaps"),
      ],
      standards: ["ISA-95"],
      notes: "MES is visible while sharing workflow, evidence, relation, and inventory engines.",
    }),
    denseSystem({
      id: "ops",
      label: "Operations / ITSM",
      command: "ops",
      aliases: ["itsm"],
      sensitivityDefault: "normal",
      sharedEngines: ["evidence_provenance", "quality_gap", "relation_graph", "semantic_view", "intent_coverage", "workflow_state", "timeline", "document_evidence"],
      centers: [
        center("service", "Service", "service", undefined, "Operational service center for incidents, changes, checks, dependencies, and SLOs.", undefined, "services"),
        center("incident", "Incident", "incident", undefined, "Operational incident center for events, evidence, actions, status, and postmortems.", undefined, "incidents"),
      ],
      commandPatterns: ["claw ops overview|gaps|intents", "claw itsm overview|gaps|intents", "claw incident list|get|create|update|query|schema", "claw service <id> timeline"],
      operations: [operation("service.timeline", "Read service timeline", ["claw service <id> timeline"], ["service", "incident", "deployment", "slo", "check"])],
      semanticViews: [view("service.timeline", "Service timeline", "claw service <id> timeline", "service.timeline", ["service_id"], "incidents, changes, deployments, SLOs, checks, and gaps")],
      standards: ["ITIL", "OpenTelemetry"],
      notes: "Ops/ITSM is distinct from monitor; monitor can be a source feeding ops records.",
    }),
    denseSystem({
      id: "real_estate",
      label: "Real Estate / PropTech",
      command: "real-estate",
      aliases: ["proptech"],
      sensitivityDefault: "normal",
      sharedEngines: ["identity_role_profile", "evidence_provenance", "quality_gap", "relation_graph", "semantic_view", "intent_coverage", "workflow_state", "timeline", "document_evidence", "location"],
      centers: [
        center("property", "Property", "property", undefined, "Property/listing center for sale, rent, visits, offers, inspections, documents, and gaps.", ["properties", "property-listing", "property-listings"], "property_listings"),
        center("property_visit", "Property Visit", "property-visit", undefined, "Visit/showing center linked to a property.", ["property-visits", "viewing", "viewings"], "property_visits"),
        center("property_offer", "Property Offer", "property-offer", undefined, "Offer/negotiation center linked to a property.", ["property-offers"], "property_offers"),
        center("property_inspection", "Property Inspection", "property-inspection", undefined, "Inspection/report center linked to a property.", ["property-inspections"], "property_inspections"),
      ],
      commandPatterns: [
        "claw real-estate overview|gaps|intents",
        "claw proptech overview|gaps|intents",
        "claw property list|get|create|update|delete|query|schema",
        "claw property <id> timeline",
        "claw property <id> visits list|add",
        "claw property-visit list|get|create|update|delete|query|schema",
        "claw property-visit add --property <id>",
        "claw property <id> offers list|add",
        "claw property-offer list|get|create|update|delete|query|schema",
        "claw property-offer add --property <id>",
        "claw property <id> inspections list|add",
        "claw property-inspection list|get|create|update|delete|query|schema",
      ],
      operations: [
        operation("property.visit.add", "Add or link property visit", ["claw property <id> visit add", "claw property-visit add --property <id>"], ["property", "property_visit", "evidence_source"]),
        operation("property.offer.add", "Add or link property offer", ["claw property <id> offer add", "claw property-offer add --property <id>"], ["property", "property_offer", "workflow_state", "quality_gap"]),
        operation("property.timeline", "Read property timeline", ["claw property <id> timeline"], ["property", "visit", "offer", "inspection", "evidence_source", "quality_gap"]),
      ],
      semanticViews: [
        view("property.timeline", "Property timeline", "claw property <id> timeline", "property.timeline", ["property_id"], "property visits, offers, inspections, documents, provenance, and gaps"),
      ],
      standards: ["RESO Web API"],
      notes: "Real estate is a visible professional pack over existing property marketplace collections, not a second property model.",
    }),
    denseSystem({
      id: "insurance",
      label: "Insurance",
      command: "insurance",
      aliases: [],
      sensitivityDefault: "high",
      sharedEngines: ["identity_role_profile", "evidence_provenance", "quality_gap", "relation_graph", "semantic_view", "intent_coverage", "workflow_state", "timeline", "document_evidence"],
      centers: [
        center("insurance_policy", "Insurance Policy", "insurance-policy", undefined, "Policy center for coverage, providers, premiums, documents, renewal dates, and gaps.", ["insurance-policies"], "insurance_policies"),
        center("vehicle_insurance_policy", "Vehicle Insurance Policy", "vehicle-insurance-policy", undefined, "Vehicle-specific policy center linked to vehicles without duplicating vehicle identity.", ["vehicle-insurance-policies"], "vehicle_insurance_policies"),
      ],
      commandPatterns: [
        "claw insurance overview|gaps|intents",
        "claw insurance-policy list|get|create|update|delete|query|schema",
        "claw insurance-policy <id> timeline",
        "claw vehicle-insurance-policy list|get|create|update|delete|query|schema",
        "claw vehicle-insurance-policy add --vehicle <id>",
      ],
      operations: [
        operation("insurance_policy.timeline", "Read insurance policy timeline", ["claw insurance-policy <id> timeline"], ["insurance_policy", "document", "receipt", "evidence_source", "quality_gap"]),
        operation("vehicle.insurance_policy.add", "Add or link vehicle insurance policy", ["claw vehicle-insurance-policy add --vehicle <id>"], ["vehicle", "vehicle_insurance_policy", "document_evidence"]),
      ],
      semanticViews: [
        view("insurance_policy.timeline", "Insurance policy timeline", "claw insurance-policy <id> timeline", "insurance_policy.timeline", ["insurance_policy_id"], "policy coverage, documents, receipts, provenance, and gaps"),
      ],
      standards: ["ACORD"],
      notes: "Insurance is high-sensitivity structured document and policy data; provider claims/external submissions remain gated.",
    }),
    denseSystem({
      id: "maintenance",
      label: "Maintenance / CMMS",
      command: "maintenance",
      aliases: ["cmms"],
      sensitivityDefault: "normal",
      sharedEngines: ["evidence_provenance", "quality_gap", "relation_graph", "semantic_view", "intent_coverage", "workflow_state", "timeline", "document_evidence"],
      centers: [
        center("vehicle", "Vehicle", "vehicle", undefined, "Maintainable vehicle/equipment center for service history, documents, insurance, and gaps.", undefined, "vehicles"),
        center("vehicle_maintenance", "Vehicle Maintenance", "vehicle-maintenance", undefined, "Vehicle service event center linked to vehicles.", ["vehicle-maintenance-records"], "vehicle_maintenance"),
        center("appliance", "Appliance", "appliance", undefined, "Maintainable appliance center for service history, warranties, manuals, and gaps.", undefined, "appliances"),
        center("appliance_maintenance", "Appliance Maintenance", "appliance-maintenance", undefined, "Appliance service event center linked to appliances.", ["appliance-maintenance-records"], "appliance_maintenance"),
      ],
      commandPatterns: [
        "claw maintenance overview|gaps|intents",
        "claw cmms overview|gaps|intents",
        "claw vehicle list|get|create|update|delete|query|schema",
        "claw vehicle <id> timeline",
        "claw vehicle <id> maintenance list|add",
        "claw vehicle-maintenance list|get|create|update|delete|query|schema",
        "claw vehicle-maintenance add --vehicle <id>",
        "claw appliance list|get|create|update|delete|query|schema",
        "claw appliance <id> maintenance list|add",
        "claw appliance-maintenance list|get|create|update|delete|query|schema",
        "claw appliance-maintenance add --appliance <id>",
      ],
      operations: [
        operation("vehicle.maintenance.add", "Add or link vehicle maintenance", ["claw vehicle <id> maintenance add", "claw vehicle-maintenance add --vehicle <id>"], ["vehicle", "vehicle_maintenance", "receipt", "evidence_source"]),
        operation("appliance.maintenance.add", "Add or link appliance maintenance", ["claw appliance <id> maintenance add", "claw appliance-maintenance add --appliance <id>"], ["appliance", "appliance_maintenance", "manual", "evidence_source"]),
        operation("vehicle.timeline", "Read vehicle maintenance timeline", ["claw vehicle <id> timeline"], ["vehicle", "vehicle_maintenance", "vehicle_insurance_policy", "evidence_source", "quality_gap"]),
      ],
      semanticViews: [
        view("vehicle.timeline", "Vehicle timeline", "claw vehicle <id> timeline", "vehicle.timeline", ["vehicle_id"], "vehicle maintenance, insurance, documents, provenance, and gaps"),
      ],
      standards: ["ISO 55000"],
      notes: "CMMS uses existing vehicle/appliance and asset-adjacent records instead of creating a parallel maintenance database.",
    }),
    denseSystem({
      id: "procurement",
      label: "Procurement",
      command: "procurement",
      aliases: ["purchasing"],
      sensitivityDefault: "normal",
      sharedEngines: ["evidence_provenance", "quality_gap", "relation_graph", "semantic_view", "intent_coverage", "workflow_state", "timeline", "document_evidence"],
      centers: [
        center("supplier", "Supplier", "supplier", undefined, "Supplier/vendor center linked to companies without duplicating organization identity.", ["suppliers", "vendor", "vendors"], "suppliers"),
        center("purchase_order", "Purchase Order", "purchase-order", undefined, "Purchase commitment center for supplier, buyer, lines, receipt state, evidence, and gaps.", ["purchase-orders", "po", "pos"], "purchase_orders"),
        center("purchase_order_line_item", "Purchase Order Line Item", "purchase-order-line-item", undefined, "Line-item center for ordered products/services, quantities, costs, and receiving status.", ["purchase-order-line-items", "po-line", "po-lines"], "purchase_order_line_items"),
      ],
      commandPatterns: [
        "claw procurement overview|gaps|intents",
        "claw purchasing overview|gaps|intents",
        "claw supplier list|get|create|update|delete|query|schema",
        "claw supplier <id> purchase-orders list|add",
        "claw purchase-order list|get|create|update|delete|query|schema",
        "claw purchase-order <id> timeline",
        "claw purchase-order <id> line-items list|add",
        "claw purchase-order-line-item list|get|create|update|delete|query|schema",
        "claw purchase-order-line-item add --purchase-order <id>",
      ],
      operations: [
        operation("supplier.purchase_order.add", "Add or link supplier purchase order", ["claw supplier <id> purchase-orders add", "claw purchase-order add --supplier <id>"], ["supplier", "purchase_order", "company", "evidence_source"]),
        operation("purchase_order.line_item.add", "Add or link purchase order line item", ["claw purchase-order <id> line-items add", "claw purchase-order-line-item add --purchase-order <id>"], ["purchase_order", "purchase_order_line_item", "product", "quality_gap"]),
        operation("purchase_order.timeline", "Read purchase order timeline", ["claw purchase-order <id> timeline"], ["purchase_order", "supplier", "purchase_order_line_item", "receipt", "evidence_source", "quality_gap"]),
      ],
      semanticViews: [
        view("purchase_order.timeline", "Purchase order timeline", "claw purchase-order <id> timeline", "purchase_order.timeline", ["purchase_order_id"], "purchase order supplier, line items, receiving state, documents, provenance, and gaps"),
      ],
      standards: ["UBL", "cXML"],
      notes: "Procurement is a visible pack over suppliers and purchase commitments while accounting, inventory, and payment execution remain separate systems.",
    }),
    denseSystem({
      id: "warehouse",
      label: "Warehouse / WMS",
      command: "warehouse",
      aliases: ["wms"],
      sensitivityDefault: "normal",
      sharedEngines: ["evidence_provenance", "quality_gap", "relation_graph", "semantic_view", "intent_coverage", "workflow_state", "timeline", "document_evidence", "location"],
      centers: [
        center("warehouse", "Warehouse", "warehouse", undefined, "Warehouse/location center for inventory, stock movement, documents, and gaps.", ["warehouses", "fulfillment-center", "fulfillment-centers"], "warehouses"),
        center("inventory_item", "Inventory Item", "inventory-item", undefined, "Warehouse stock position center linked to products and locations.", ["inventory-items", "stock-item", "stock-items", "warehouse-inventory", "warehouse-stock"], "inventory_items"),
        center("stock_movement", "Stock Movement", "stock-movement", undefined, "Inventory movement center for receipts, issues, adjustments, transfers, and counts.", ["stock-movements", "inventory-movement", "inventory-movements"], "stock_movements"),
      ],
      commandPatterns: [
        "claw warehouse overview|gaps|intents",
        "claw wms overview|gaps|intents",
        "claw warehouse list|get|create|update|delete|query|schema",
        "claw warehouse <id> timeline",
        "claw warehouse <id> inventory-items list|add",
        "claw inventory-item list|get|create|update|delete|query|schema",
        "claw inventory-item add --warehouse <id>",
        "claw inventory-item <id> stock-movements list|add",
        "claw stock-movement list|get|create|update|delete|query|schema",
        "claw stock-movement add --inventory-item <id>",
      ],
      operations: [
        operation("warehouse.inventory_item.add", "Add or link warehouse inventory item", ["claw warehouse <id> inventory-items add", "claw inventory-item add --warehouse <id>"], ["warehouse", "inventory_item", "product", "quality_gap"]),
        operation("inventory_item.stock_movement.add", "Add or link inventory stock movement", ["claw inventory-item <id> stock-movements add", "claw stock-movement add --inventory-item <id>"], ["inventory_item", "stock_movement", "receipt", "evidence_source"]),
        operation("warehouse.timeline", "Read warehouse inventory timeline", ["claw warehouse <id> timeline"], ["warehouse", "inventory_item", "stock_movement", "product", "evidence_source", "quality_gap"]),
      ],
      semanticViews: [
        view("warehouse.timeline", "Warehouse timeline", "claw warehouse <id> timeline", "warehouse.timeline", ["warehouse_id"], "warehouse inventory, stock movements, products, evidence, provenance, and gaps"),
      ],
      standards: ["GS1", "EDI 940/945"],
      notes: "WMS keeps inventory/location state separate from procurement commitments, transport shipments, household inventory, and accounting entries.",
    }),
    denseSystem({
      id: "supply_chain",
      label: "Supply Chain / SCM",
      command: "supply-chain",
      aliases: ["scm"],
      sensitivityDefault: "normal",
      sharedEngines: ["evidence_provenance", "quality_gap", "relation_graph", "semantic_view", "intent_coverage", "workflow_state", "timeline", "document_evidence", "location", "finance_accounting"],
      centers: [
        center("supply_plan", "Supply Plan", "supply-plan", undefined, "Supply-chain planning center for demand/supply balancing, planning horizon, evidence, and gaps.", ["supply-plans", "replenishment-plan", "replenishment-plans"], "supply_plans"),
        center("supply_plan_item", "Supply Plan Item", "supply-plan-item", undefined, "Supply-plan line center linked to products, suppliers, purchase orders, warehouses, and inventory.", ["supply-plan-items", "replenishment-item", "replenishment-items"], "supply_plan_items"),
        center("supply_risk", "Supply Risk", "supply-risk", undefined, "Supply-chain risk center for supplier, procurement, stock, quality, timing, and mitigation state.", ["supply-risks", "supplier-risk", "supplier-risks"], "supply_risks"),
      ],
      commandPatterns: [
        "claw supply-chain overview|gaps|intents",
        "claw scm overview|gaps|intents",
        "claw supply-plan list|get|create|update|delete|query|schema",
        "claw supply-plan <id> timeline",
        "claw supply-plan <id> items list|add",
        "claw supply-plan <id> risks list|add",
        "claw supply-plan-item list|get|create|update|delete|query|schema",
        "claw supply-plan-item add --supply-plan <id>",
        "claw supply-risk list|get|create|update|delete|query|schema",
        "claw supply-risk add --supply-plan <id>",
        "claw supplier <id> supply-risks list|add",
      ],
      operations: [
        operation("supply_plan.item.add", "Add or link supply plan item", ["claw supply-plan <id> items add", "claw supply-plan-item add --supply-plan <id>"], ["supply_plan", "supply_plan_item", "product", "supplier", "purchase_order", "warehouse", "inventory_item"]),
        operation("supply_plan.risk.add", "Add or link supply risk", ["claw supply-plan <id> risks add", "claw supply-risk add --supply-plan <id>", "claw supplier <id> supply-risks add"], ["supply_plan", "supply_risk", "supplier", "purchase_order", "warehouse", "inventory_item", "quality_gap"]),
        operation("supply_plan.timeline", "Read supply plan timeline", ["claw supply-plan <id> timeline"], ["supply_plan", "supply_plan_item", "supply_risk", "supplier", "purchase_order", "warehouse", "inventory_item", "evidence_source", "quality_gap"]),
      ],
      semanticViews: [
        view("supply_plan.timeline", "Supply plan timeline", "claw supply-plan <id> timeline", "supply_plan.timeline", ["supply_plan_id"], "supply plan items, risks, suppliers, purchase orders, inventory, warehouses, evidence, provenance, and gaps"),
      ],
      standards: ["SCOR", "GS1", "EDI 850/940/945"],
      notes: "SCM is an orchestration pack over procurement and warehouse data; it coordinates planning and risk without duplicating supplier, purchase order, stock, product, or accounting records.",
    }),
    denseSystem({
      id: "transport",
      label: "Transport / TMS",
      command: "tms",
      aliases: ["freight"],
      sensitivityDefault: "normal",
      sharedEngines: ["evidence_provenance", "quality_gap", "relation_graph", "semantic_view", "intent_coverage", "workflow_state", "timeline", "document_evidence", "location", "finance_accounting"],
      centers: [
        center("carrier", "Carrier", "carrier", undefined, "Transport carrier center for shipment execution, modes, identifiers, contacts, evidence, and gaps.", ["carriers", "freight-carrier", "freight-carriers"], "carriers"),
        center("shipment", "Shipment", "shipment", undefined, "Shipment execution center for order movement, carrier, origin/destination, tracking, cost, evidence, and gaps.", ["shipments", "freight-shipment", "freight-shipments"], "shipments"),
        center("shipment_leg", "Shipment Leg", "shipment-leg", undefined, "Shipment leg center for multi-stop or multi-carrier execution, timing, location, tracking, evidence, and gaps.", ["shipment-legs", "freight-leg", "freight-legs"], "shipment_legs"),
        center("freight_rate", "Freight Rate", "freight-rate", undefined, "Carrier pricing center for lanes, service levels, effective windows, evidence, and gaps.", ["freight-rates", "transport-rate", "transport-rates"], "freight_rates"),
      ],
      commandPatterns: [
        "claw tms overview|gaps|intents",
        "claw freight overview|gaps|intents",
        "claw carrier list|get|create|update|delete|query|schema",
        "claw carrier <id> shipments list|add",
        "claw carrier <id> freight-rates list|add",
        "claw shipment list|get|create|update|delete|query|schema",
        "claw shipment <id> timeline",
        "claw shipment <id> legs list|add",
        "claw shipment-leg list|get|create|update|delete|query|schema",
        "claw shipment-leg add --shipment <id>",
        "claw freight-rate list|get|create|update|delete|query|schema",
        "claw freight-rate add --carrier <id>",
      ],
      operations: [
        operation("shipment.leg.add", "Add or link shipment leg", ["claw shipment <id> legs add", "claw shipment-leg add --shipment <id>"], ["shipment", "shipment_leg", "carrier", "warehouse", "purchase_order", "evidence_source", "quality_gap"]),
        operation("carrier.shipment.add", "Add or link carrier shipment", ["claw carrier <id> shipments add", "claw shipment add --carrier <id>"], ["carrier", "shipment", "purchase_order", "warehouse", "evidence_source"]),
        operation("carrier.freight_rate.add", "Add or link freight rate", ["claw carrier <id> freight-rates add", "claw freight-rate add --carrier <id>"], ["carrier", "freight_rate", "company", "evidence_source", "quality_gap"]),
        operation("shipment.timeline", "Read shipment timeline", ["claw shipment <id> timeline"], ["shipment", "shipment_leg", "carrier", "purchase_order", "warehouse", "evidence_source", "quality_gap"]),
      ],
      semanticViews: [
        view("shipment.timeline", "Shipment timeline", "claw shipment <id> timeline", "shipment.timeline", ["shipment_id"], "shipment legs, carrier, purchase order, warehouse, evidence, provenance, and gaps"),
      ],
      standards: ["EDI 204/214/210", "GS1", "TMS", "Bill of Lading"],
      notes: "Transport/TMS is graduated under the `tms` portal because `transport` remains an audited travel collection alias for personal travel bookings. TMS owns shipments, legs, carriers, and freight rates while reusing procurement, warehouse, company, evidence, and quality-gap records.",
    }),
    denseSystem({
      id: "compliance",
      label: "Compliance / GRC",
      command: "compliance",
      aliases: ["grc"],
      sensitivityDefault: "high",
      sharedEngines: ["evidence_provenance", "quality_gap", "relation_graph", "semantic_view", "intent_coverage", "workflow_state", "timeline", "document_evidence"],
      centers: [
        center("control", "Compliance Control", "control", undefined, "Control center for GRC frameworks, owners, obligation mapping, implementation status, evidence, and gaps.", ["controls", "compliance-control", "compliance-controls"], "compliance_controls"),
        center("obligation", "Compliance Obligation", "obligation", undefined, "Regulatory, contractual, policy, or standards obligation center for authority, applicability, and source text.", ["obligations", "compliance-obligation", "compliance-obligations", "requirement", "requirements"], "compliance_obligations"),
        center("control_assessment", "Control Assessment", "control-assessment", undefined, "Point-in-time control assessment center for test result, assessor, evidence, and exceptions.", ["control-assessments", "assessment", "assessments"], "control_assessments"),
        center("compliance_finding", "Compliance Finding", "compliance-finding", undefined, "Finding center for control failures, audit issues, severity, ownership, remediation, and evidence.", ["compliance-findings", "finding", "findings", "grc-finding", "grc-findings"], "compliance_findings"),
      ],
      commandPatterns: [
        "claw compliance overview|gaps|intents",
        "claw grc overview|gaps|intents",
        "claw control list|get|create|update|delete|query|schema",
        "claw control <id> timeline",
        "claw control <id> assessments list|add",
        "claw control <id> findings list|add",
        "claw obligation list|get|create|update|delete|query|schema",
        "claw obligation <id> controls list|add",
        "claw control-assessment list|get|create|update|delete|query|schema",
        "claw control-assessment add --control <id>",
        "claw compliance-finding list|get|create|update|delete|query|schema",
        "claw compliance-finding add --control <id>",
      ],
      operations: [
        operation("control.assessment.add", "Add or link control assessment", ["claw control <id> assessments add", "claw control-assessment add --control <id>"], ["control", "control_assessment", "obligation", "evidence_source", "quality_gap"]),
        operation("control.finding.add", "Add or link compliance finding", ["claw control <id> findings add", "claw compliance-finding add --control <id>"], ["control", "compliance_finding", "control_assessment", "obligation", "evidence_source", "quality_gap"]),
        operation("control.timeline", "Read compliance control timeline", ["claw control <id> timeline"], ["control", "obligation", "control_assessment", "compliance_finding", "evidence_source", "quality_gap"]),
      ],
      semanticViews: [
        view("control.timeline", "Compliance control timeline", "claw control <id> timeline", "control.timeline", ["control_id"], "control obligation, assessments, findings, evidence, provenance, and gaps"),
      ],
      standards: ["ISO 27001", "SOC 2", "NIST CSF", "COSO"],
      notes: "GRC owns compliance controls and obligations while runtime policy gates, generic project audit records, and quality gaps remain separate canonical systems.",
    }),
    roadmapSystem("government", "Government", "government", [], "case"),
    denseSystem({
      id: "construction",
      label: "Construction",
      command: "construction",
      aliases: [],
      sensitivityDefault: "normal",
      sharedEngines: ["evidence_provenance", "quality_gap", "relation_graph", "semantic_view", "intent_coverage", "workflow_state", "timeline", "document_evidence", "location", "finance_accounting"],
      centers: [
        center("construction_project", "Construction Project", "construction-project", undefined, "Construction-specific project control center for scope, schedule, budget, sites, RFIs, changes, evidence, and gaps.", ["construction-projects", "build-project", "build-projects"], "construction_projects"),
        center("construction_site", "Construction Site", "construction-site", undefined, "Job-site center linked to a construction project, location, superintendent, evidence, and gaps.", ["construction-sites", "job-site", "job-sites"], "construction_sites"),
        center("construction_rfi", "Construction RFI", "construction-rfi", undefined, "Request-for-information center for questions, responsible parties, answers, evidence, and due dates.", ["construction-rfis", "rfi", "rfis"], "construction_rfis"),
        center("construction_change_order", "Construction Change Order", "construction-change-order", undefined, "Change-order center for cost/schedule impact, approval status, related RFIs, evidence, and gaps.", ["construction-change-orders", "change-order", "change-orders"], "construction_change_orders"),
      ],
      commandPatterns: [
        "claw construction overview|gaps|intents",
        "claw construction-project list|get|create|update|delete|query|schema",
        "claw construction-project <id> timeline",
        "claw construction-project <id> sites list|add",
        "claw construction-project <id> rfis list|add",
        "claw construction-project <id> change-orders list|add",
        "claw construction-site list|get|create|update|delete|query|schema",
        "claw construction-site add --construction-project <id>",
        "claw construction-rfi list|get|create|update|delete|query|schema",
        "claw construction-rfi add --construction-project <id>",
        "claw construction-change-order list|get|create|update|delete|query|schema",
        "claw construction-change-order add --construction-project <id>",
      ],
      operations: [
        operation("construction_project.site.add", "Add or link construction site", ["claw construction-project <id> sites add", "claw construction-site add --construction-project <id>"], ["construction_project", "construction_site", "property", "employee", "evidence_source"]),
        operation("construction_project.rfi.add", "Add or link construction RFI", ["claw construction-project <id> rfis add", "claw construction-rfi add --construction-project <id>"], ["construction_project", "construction_site", "construction_rfi", "employee", "evidence_source", "quality_gap"]),
        operation("construction_project.change_order.add", "Add or link construction change order", ["claw construction-project <id> change-orders add", "claw construction-change-order add --construction-project <id>"], ["construction_project", "construction_change_order", "construction_rfi", "invoice", "quality_gap"]),
        operation("construction_project.timeline", "Read construction project timeline", ["claw construction-project <id> timeline"], ["construction_project", "construction_site", "construction_rfi", "construction_change_order", "company", "evidence_source", "quality_gap"]),
      ],
      semanticViews: [
        view("construction_project.timeline", "Construction project timeline", "claw construction-project <id> timeline", "construction_project.timeline", ["construction_project_id"], "construction project sites, RFIs, change orders, company anchors, evidence, provenance, and gaps"),
      ],
      standards: ["ISO 19650", "CSI MasterFormat"],
      notes: "Construction avoids the generic project and contractor collections by using explicit construction project/site/RFI/change-order centers while reusing companies, employees, invoices, evidence, and quality gaps.",
    }),
    denseSystem({
      id: "iot",
      label: "IoT",
      command: "iot",
      aliases: [],
      sensitivityDefault: "normal",
      sharedEngines: ["evidence_provenance", "quality_gap", "relation_graph", "semantic_view", "intent_coverage", "workflow_state", "timeline", "document_evidence", "location"],
      centers: [
        center("thing", "IoT Thing", "thing", undefined, "Real-world IoT thing center for devices, location, ownership, evidence, and gaps.", ["things", "iot-thing", "iot-things"], "iot_things"),
        center("iot_device", "IoT Device", "iot-device", undefined, "Device endpoint center for protocol identity, connector mapping, firmware, and capabilities.", ["iot-devices", "device", "devices"], "iot_devices"),
        center("sensor_reading", "Sensor Reading", "sensor-reading", undefined, "Observed sensor value center linked to thing/device, units, timestamp, evidence, and quality.", ["sensor-readings", "reading", "readings"], "sensor_readings"),
        center("device_command", "Device Command", "device-command", undefined, "Requested IoT action center with approval, execution state, payload, result, evidence, and gaps.", ["device-commands", "iot-command", "iot-commands"], "device_commands"),
      ],
      commandPatterns: [
        "claw iot overview|gaps|intents",
        "claw thing list|get|create|update|delete|query|schema",
        "claw thing <id> timeline",
        "claw thing <id> devices list|add",
        "claw thing <id> readings list|add",
        "claw thing <id> commands list|add",
        "claw iot-device list|get|create|update|delete|query|schema",
        "claw iot-device add --thing <id>",
        "claw iot-device <id> readings list|add",
        "claw iot-device <id> commands list|add",
        "claw sensor-reading list|get|create|update|delete|query|schema",
        "claw sensor-reading add --device <id>",
        "claw device-command list|get|create|update|delete|query|schema",
        "claw device-command add --device <id>",
      ],
      operations: [
        operation("thing.device.add", "Add or link IoT device", ["claw thing <id> devices add", "claw iot-device add --thing <id>"], ["thing", "iot_device", "evidence_source", "quality_gap"]),
        operation("device.reading.add", "Add or link sensor reading", ["claw iot-device <id> readings add", "claw sensor-reading add --device <id>"], ["iot_device", "sensor_reading", "thing", "unit", "evidence_source"]),
        operation("device.command.add", "Add or link device command", ["claw iot-device <id> commands add", "claw device-command add --device <id>"], ["iot_device", "device_command", "thing", "approval", "evidence_source", "quality_gap"]),
        operation("thing.timeline", "Read IoT thing timeline", ["claw thing <id> timeline"], ["thing", "iot_device", "sensor_reading", "device_command", "evidence_source", "quality_gap"]),
      ],
      semanticViews: [
        view("thing.timeline", "IoT thing timeline", "claw thing <id> timeline", "thing.timeline", ["thing_id"], "IoT thing devices, readings, commands, approvals, evidence, provenance, and physical-device gaps"),
      ],
      standards: ["Matter", "MQTT", "Zigbee", "Z-Wave"],
      notes: "IoT dense data extends the existing iot config/serve portal without replacing it: iot_config remains connector setup, while things/devices/readings/commands are canonical records in core.sqlite; live physical dispatch stays EXTERNAL PENDING.",
    }),
    denseSystem({
      id: "eln",
      label: "Electronic Lab Notebook / ELN",
      command: "eln",
      aliases: [],
      sensitivityDefault: "high",
      sharedEngines: ["evidence_provenance", "quality_gap", "relation_graph", "semantic_view", "intent_coverage", "workflow_state", "timeline", "document_evidence", "instrument_response"],
      centers: [
        center("lab_notebook", "Lab Notebook", "lab-notebook", undefined, "ELN notebook center for research study, biology experiment, ownership, entries, protocol runs, observations, evidence, and gaps.", ["lab-notebooks", "eln-notebook", "eln-notebooks"], "lab_notebooks"),
        center("notebook_entry", "Notebook Entry", "notebook-entry", undefined, "Authored ELN entry center for notes, observations, protocol steps, deviations, decisions, structured data, and evidence.", ["notebook-entries", "eln-entry", "eln-entries"], "notebook_entries"),
        center("protocol_run", "Protocol Run", "protocol-run", undefined, "Protocol execution center for parameters, timing, deviations, linked samples/assays, instrument evidence, and gaps.", ["protocol-runs", "eln-protocol-run", "eln-protocol-runs"], "protocol_runs"),
        center("experiment_observation", "Experiment Observation", "experiment-observation", undefined, "Typed observation center for measurements, images, notes, deviations, results, units, evidence, and quality.", ["experiment-observations", "eln-observation", "eln-observations"], "experiment_observations"),
      ],
      commandPatterns: [
        "claw eln overview|gaps|intents",
        "claw lab-notebook list|get|create|update|delete|query|schema",
        "claw lab-notebook <id> timeline",
        "claw lab-notebook <id> entries list|add",
        "claw lab-notebook <id> protocol-runs list|add",
        "claw lab-notebook <id> observations list|add",
        "claw notebook-entry list|get|create|update|delete|query|schema",
        "claw notebook-entry add --lab-notebook <id>",
        "claw protocol-run list|get|create|update|delete|query|schema",
        "claw protocol-run add --lab-notebook <id>",
        "claw protocol-run <id> observations list|add",
        "claw experiment-observation list|get|create|update|delete|query|schema",
        "claw experiment-observation add --protocol-run <id>",
      ],
      operations: [
        operation("lab_notebook.entry.add", "Add or link notebook entry", ["claw lab-notebook <id> entries add", "claw notebook-entry add --lab-notebook <id>"], ["lab_notebook", "notebook_entry", "biology_experiment", "sample", "assay", "evidence_source", "quality_gap"]),
        operation("lab_notebook.protocol_run.add", "Add or link protocol run", ["claw lab-notebook <id> protocol-runs add", "claw protocol-run add --lab-notebook <id>"], ["lab_notebook", "protocol_run", "biology_experiment", "sample", "assay", "instrument_response"]),
        operation("protocol_run.observation.add", "Add or link experiment observation", ["claw protocol-run <id> observations add", "claw experiment-observation add --protocol-run <id>"], ["protocol_run", "experiment_observation", "lab_notebook", "biology_experiment", "sample", "assay", "unit", "evidence_source"]),
        operation("lab_notebook.timeline", "Read lab notebook timeline", ["claw lab-notebook <id> timeline"], ["lab_notebook", "notebook_entry", "protocol_run", "experiment_observation", "study", "biology_experiment", "sample", "assay", "evidence_source", "quality_gap"]),
      ],
      semanticViews: [
        view("lab_notebook.timeline", "Lab notebook timeline", "claw lab-notebook <id> timeline", "lab_notebook.timeline", ["lab_notebook_id"], "notebook entries, protocol runs, observations, linked studies/experiments/samples/assays, evidence, provenance, and gaps"),
      ],
      standards: ["21 CFR Part 11", "ALCOA+", "GxP", "FAIR"],
      notes: "ELN is a notebook/protocol/observation layer over research, biology, and labs. It intentionally reuses studies, biology_experiments, samples, assays, instruments, evidence, and quality gaps instead of creating a second experiment system.",
    }),
    roadmapSystem("content", "Content / CMS", "content", ["cms"], "content-item"),
    roadmapSystem("product", "Product / PIM / PLM", "product", ["pim", "plm"], "product"),
    roadmapSystem("pharma", "Pharma", "pharma", [], "product"),
  ],
};

export function listClawDenseDataSystems(options: { wave?: ClawDenseDataWave } = {}): ClawDenseDataSystem[] {
  return clawDenseDataOsRegistry.systems.filter((system) => !options.wave || system.wave === options.wave);
}

export function listClawDenseDataSemanticViewEntries(): ClawDenseDataSemanticViewEntry[] {
  return clawDenseDataOsRegistry.systems.flatMap((system) => system.semanticViews.map((semanticView) => ({
    ...semanticView,
    systemId: system.id,
  })));
}

export function listClawDenseDataIntentEntries(): ClawDenseDataIntentEntry[] {
  const entries: ClawDenseDataIntentEntry[] = [];
  for (const system of clawDenseDataOsRegistry.systems) {
    for (const command of [system.canonicalCommand, ...system.aliases]) {
      for (const action of ["overview", "gaps", "intents"] as const) {
        entries.push({
          id: denseIntentId(system.id, command, action),
          systemId: system.id,
          command,
          phrase: `claw ${command} ${action}`,
          status: "covered",
          reasons: ["System inspection route is generated from the dense-data system registry."],
          nextSteps: [],
        });
      }
    }

    for (const centerEntry of system.centers) {
      const commands = [centerEntry.commandNoun, ...centerEntry.commandAliases];
      for (const command of commands) {
        for (const action of clawDenseDataOsRegistry.standardCollectionActions.filter((entry) => entry !== "purge")) {
          const mappedCommand = centerEntry.collectionName ? `claw db ${centerEntry.collectionName} ${action}` : undefined;
          entries.push({
            id: denseIntentId(system.id, command, action),
            systemId: system.id,
            command,
            phrase: `claw ${command} ${action}`,
            status: centerEntry.collectionName ? "covered" : "workflow_gap",
            mappedCommand,
            collectionName: centerEntry.collectionName,
            reasons: centerEntry.collectionName
              ? ["Direct human noun is backed by a canonical collection and shared database operation."]
              : ["Direct human noun is known, but the center is not yet graduated to a canonical collection."],
            nextSteps: centerEntry.collectionName
              ? []
              : ["Graduate this center to a collection, relation model, fixtures, and CLI smoke tests before treating it as executable."],
          });
        }
      }
    }

    for (const operationEntry of system.operations) {
      for (const route of operationEntry.routes) {
        entries.push({
          id: denseIntentId(system.id, operationEntry.id, route),
          systemId: system.id,
          command: system.canonicalCommand,
          phrase: route,
          status: "partial",
          operationId: operationEntry.id,
          reasons: ["Canonical operation is declared by the dense-data registry; executable coverage is proven by route-specific tests when available."],
          nextSteps: ["Keep operation-specific CLI tests and semantic view evidence in sync with pack graduation."],
        });
      }
    }
  }

  return entries;
}

export function findClawDenseDataSystem(idOrCommand: string): ClawDenseDataSystem | undefined {
  return clawDenseDataOsRegistry.systems.find(
    (system) => system.id === idOrCommand || system.canonicalCommand === idOrCommand || system.aliases.includes(idOrCommand),
  );
}

function findClawDenseDataSystemCommand(command: string): ClawDenseDataSystem | undefined {
  return clawDenseDataOsRegistry.systems.find(
    (system) => system.canonicalCommand === command || system.aliases.includes(command),
  );
}

function denseIntentId(systemId: string, command: string, action: string): string {
  return `dense_intent_${systemId}_${slugForDenseIntent(command)}_${slugForDenseIntent(action)}`;
}

function slugForDenseIntent(value: string): string {
  return value
    .toLowerCase()
    .replace(/^claw\s+/, "")
    .replace(/<[^>]+>/g, "id")
    .replace(/--[a-z0-9-]+/g, "flag")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96);
}

export function resolveClawDenseDataIntent(phrase: string): ClawDenseDataIntentResolution {
  const normalizedPhrase = normalizeDenseDataPhrase(phrase);
  const tokens = normalizedPhrase.split(" ").filter(Boolean);
  if (tokens.length === 0) {
    return denseDataIntentResolution(phrase, normalizedPhrase, "data_gap", ["No dense-data command phrase was provided."], ["Provide a domain, acronym, or direct human noun such as `patient`, `invoice`, or `case`."]);
  }

  const operationMatch = findOperationRouteMatch(normalizedPhrase);
  if (operationMatch) {
    return denseDataIntentResolution(phrase, normalizedPhrase, sensitivityStatusFor(operationMatch.system, tokens), [`Matched canonical operation ${operationMatch.operation.id}.`], nextStepsFor(operationMatch.system, tokens), {
      system: operationMatch.system,
      operation: operationMatch.operation,
      matchedRoute: operationMatch.matchedRoute,
    });
  }

  const patternMatch = findCommandPatternMatch(normalizedPhrase);
  if (patternMatch) {
    return denseDataIntentResolution(phrase, normalizedPhrase, sensitivityStatusFor(patternMatch.system, tokens), [`Matched dense-data route pattern ${patternMatch.matchedRoute}.`], nextStepsFor(patternMatch.system, tokens), {
      system: patternMatch.system,
      center: patternMatch.center,
      matchedRoute: patternMatch.matchedRoute,
    });
  }

  const centerMatch = findCenterByCommand(tokens[0] ?? "");
  if (centerMatch) {
    const action = tokens[1];
    if (action && clawDenseDataOsRegistry.standardCollectionActions.includes(action)) {
      return denseDataIntentResolution(phrase, normalizedPhrase, sensitivityStatusFor(centerMatch.system, tokens), [`Matched direct dense-data noun ${centerMatch.center.commandNoun}.`], nextStepsFor(centerMatch.system, tokens), {
        system: centerMatch.system,
        center: centerMatch.center,
        matchedRoute: `claw ${centerMatch.center.commandNoun} ${action}`,
      });
    }
  }

  const system = findClawDenseDataSystemCommand(tokens[0] ?? "");
  if (system) {
    return denseDataIntentResolution(phrase, normalizedPhrase, system.wave === "first_wave" ? "partial" : "external_pending", [`Matched dense-data system ${system.id}, but no specific route pattern matched.`], nextStepsFor(system, tokens), { system });
  }

  if (centerMatch) {
    return denseDataIntentResolution(phrase, normalizedPhrase, "workflow_gap", [`Matched direct dense-data noun ${centerMatch.center.commandNoun}, but no standard action was present.`], [`Use one of ${clawDenseDataOsRegistry.standardCollectionActions.join(", ")} or add a canonical operation to the dense-data registry.`], {
      system: centerMatch.system,
      center: centerMatch.center,
    });
  }

  return denseDataIntentResolution(phrase, normalizedPhrase, "data_gap", ["No dense-data system, acronym, center noun, alias, route pattern, or operation matched."], ["Record the phrase as a dense-data gap before adding new schema or CLI surface."]);
}

export function assertClawDenseDataOsRegistryComplete(): void {
  const failures: string[] = [];
  const requiredFoundation = [
    "identity_base",
    "domain_roles",
    "typed_profiles",
    "evidence_sources",
    "provenance_events",
    "quality_gaps",
    "canonical_operations",
    "semantic_views",
    "domain_systems",
    "domain_packs",
    "domain_intents",
    "vocabularies",
    "concepts",
    "concept_mappings",
    "units",
    "instruments",
    "instrument_items",
    "instrument_responses",
    "universal_relations",
  ];
  for (const primitive of requiredFoundation) {
    if (!clawDenseDataOsRegistry.foundationPrimitives.includes(primitive)) failures.push(`missing foundation primitive ${primitive}`);
    if (!clawDenseDataOsRegistry.foundationCollections[primitive]) failures.push(`missing foundation collection for ${primitive}`);
  }

  const requiredActions = ["list", "get", "create", "update", "delete", "query", "schema", "purge"];
  for (const action of requiredActions) {
    if (!clawDenseDataOsRegistry.standardCollectionActions.includes(action)) failures.push(`missing standard action ${action}`);
  }

  for (const status of ["covered", "partial", "alias_candidate", "data_gap", "workflow_gap", "external_pending", "blocked", "custom_pack"] satisfies ClawDenseDataIntentStatus[]) {
    if (!clawDenseDataOsRegistry.intentStatuses.includes(status)) failures.push(`missing intent status ${status}`);
  }
  if (clawDenseDataOsRegistry.externalPendingRequirements.length === 0) {
    failures.push("missing external pending requirements");
  }
  for (const requirement of clawDenseDataOsRegistry.externalPendingRequirements) {
    if (requirement.status !== "external_pending") failures.push(`${requirement.id}: external pending requirement must use external_pending status`);
    if (!findClawDenseDataSystem(requirement.systemId)) failures.push(`${requirement.id}: references missing system ${requirement.systemId}`);
    if (!requirement.validationNeeded.trim()) failures.push(`${requirement.id}: missing validation needed`);
  }

  const requiredFirstWave = ["health", "research", "biology", "labs", "legal", "erp", "crm", "finance", "education", "manufacturing", "ops", "transport", "eln"];
  for (const id of requiredFirstWave) {
    const system = findClawDenseDataSystem(id);
    if (!system) {
      failures.push(`missing first-wave dense data system ${id}`);
      continue;
    }
    if (system.wave !== "first_wave") failures.push(`${id}: expected first_wave`);
    if (!system.visiblePack) failures.push(`${id}: must be visible pack`);
    if (!system.orchestrator) failures.push(`${id}: must be real orchestrator`);
    if (system.storagePolicy !== "core_sqlite") failures.push(`${id}: first wave must default to core_sqlite`);
    if (system.centers.length === 0) failures.push(`${id}: missing centers of gravity`);
    if (system.commandPatterns.length === 0) failures.push(`${id}: missing command patterns`);
    if (system.operations.length === 0) failures.push(`${id}: missing canonical operations`);
    if (system.semanticViews.length === 0) failures.push(`${id}: missing semantic views`);
  }

  for (const system of clawDenseDataOsRegistry.systems) {
    if (!system.id || !/^[a-z][a-z0-9_]*$/.test(system.id)) failures.push(`${system.id}: invalid id`);
    if (!system.canonicalCommand || !/^[a-z][a-z0-9-]*$/.test(system.canonicalCommand)) failures.push(`${system.id}: invalid canonical command`);
    if (!system.label.trim()) failures.push(`${system.id}: missing label`);
    if (!system.visiblePack) failures.push(`${system.id}: dense systems must be visible`);
    if (system.sharedEngines.length === 0) failures.push(`${system.id}: missing shared engines`);
    if (!system.sharedEngines.every((engine) => clawDenseDataOsRegistry.sharedEngines.includes(engine))) {
      failures.push(`${system.id}: references an unknown shared engine`);
    }
    for (const centerEntry of system.centers) {
      if (!centerEntry.commandNoun || !/^[a-z][a-z0-9-]*$/.test(centerEntry.commandNoun)) failures.push(`${system.id}.${centerEntry.id}: invalid command noun`);
      if (centerEntry.commandAliases.length === 0) failures.push(`${system.id}.${centerEntry.id}: missing command alias`);
      if (!centerEntry.commandAliases.every((alias) => /^[a-z][a-z0-9-]*$/.test(alias))) failures.push(`${system.id}.${centerEntry.id}: invalid command alias`);
      if (centerEntry.commandAliases.includes(centerEntry.commandNoun)) failures.push(`${system.id}.${centerEntry.id}: command aliases must not duplicate noun`);
    }
    const operationIds = new Set(system.operations.map((operation) => operation.id));
    for (const viewEntry of system.semanticViews) {
      if (!operationIds.has(viewEntry.operationId)) failures.push(`${system.id}.${viewEntry.id}: view references missing operation ${viewEntry.operationId}`);
      if (!viewEntry.commandPattern.startsWith("claw ")) failures.push(`${system.id}.${viewEntry.id}: view command must be a claw route`);
      if (viewEntry.requiredInputs.length === 0) failures.push(`${system.id}.${viewEntry.id}: view must declare required inputs`);
    }
    for (const operationEntry of system.operations) {
      if (operationEntry.routes.length === 0) failures.push(`${system.id}.${operationEntry.id}: operation missing routes`);
      if (!operationEntry.routes.every((route) => route.startsWith("claw "))) failures.push(`${system.id}.${operationEntry.id}: operation routes must be claw routes`);
      if (operationEntry.createsOrReads.length === 0) failures.push(`${system.id}.${operationEntry.id}: operation must declare data touched`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Dense data OS registry incomplete:\n- ${failures.join("\n- ")}`);
  }
}

function normalizeDenseDataPhrase(phrase: string): string {
  return phrase.trim().replace(/^claw\s+/i, "").replace(/\s+/g, " ").toLowerCase();
}

function denseDataIntentResolution(
  phrase: string,
  normalizedPhrase: string,
  status: ClawDenseDataIntentStatus,
  reasons: string[],
  nextSteps: string[],
  matches: Partial<Pick<ClawDenseDataIntentResolution, "system" | "center" | "operation" | "matchedRoute">> = {},
): ClawDenseDataIntentResolution {
  return { schemaVersion: 1, phrase, normalizedPhrase, status, reasons, nextSteps, execute: false, ...matches };
}

function findOperationRouteMatch(normalizedPhrase: string): { system: ClawDenseDataSystem; operation: ClawDenseDataOperation; matchedRoute: string } | undefined {
  for (const system of clawDenseDataOsRegistry.systems) {
    for (const operationEntry of system.operations) {
      const matchedRoute = operationEntry.routes.find((route) => denseRoutePatternMatches(route, normalizedPhrase));
      if (matchedRoute) return { system, operation: operationEntry, matchedRoute };
    }
  }
  return undefined;
}

function findCommandPatternMatch(normalizedPhrase: string): { system: ClawDenseDataSystem; center?: ClawDenseDataCenter; matchedRoute: string } | undefined {
  for (const system of clawDenseDataOsRegistry.systems) {
    const matchedRoute = system.commandPatterns.find((pattern) => denseRoutePatternMatches(pattern, normalizedPhrase));
    if (matchedRoute) {
      const firstToken = normalizedPhrase.split(" ")[0] ?? "";
      return { system, center: findCenterInSystem(system, firstToken), matchedRoute };
    }
  }
  return undefined;
}

function findCenterByCommand(command: string): { system: ClawDenseDataSystem; center: ClawDenseDataCenter } | undefined {
  for (const system of clawDenseDataOsRegistry.systems) {
    const centerEntry = findCenterInSystem(system, command);
    if (centerEntry) return { system, center: centerEntry };
  }
  return undefined;
}

function findCenterInSystem(system: ClawDenseDataSystem, command: string): ClawDenseDataCenter | undefined {
  return system.centers.find((centerEntry) => centerEntry.commandNoun === command || centerEntry.commandAliases.includes(command));
}

function denseRoutePatternMatches(pattern: string, normalizedPhrase: string): boolean {
  const patternTokens = normalizeDenseDataPhrase(pattern).split(" ").filter(Boolean);
  const phraseTokens = normalizedPhrase.split(" ").filter(Boolean);
  if (patternTokens.length !== phraseTokens.length) return false;
  return patternTokens.every((patternToken, index) => {
    const phraseToken = phraseTokens[index];
    if (patternToken.startsWith("<") && patternToken.endsWith(">")) return Boolean(phraseToken);
    if (patternToken.includes("|")) return patternToken.split("|").includes(phraseToken ?? "");
    return patternToken === phraseToken;
  });
}

function sensitivityStatusFor(system: ClawDenseDataSystem, tokens: string[]): ClawDenseDataIntentStatus {
  const mutating = tokens.some((token) => ["add", "create", "update", "delete", "purge"].includes(token));
  if (tokens.includes("purge")) return "blocked";
  if (system.sensitivityDefault === "high" && mutating) return "partial";
  return "covered";
}

function nextStepsFor(system: ClawDenseDataSystem, tokens: string[]): string[] {
  if (tokens.includes("purge")) return ["Use an explicit restricted purge flow with approval, audit, and export/snapshot checks."];
  if (system.sensitivityDefault === "high" && tokens.some((token) => ["add", "create", "update", "delete"].includes(token))) {
    return ["Require IDs for composed sensitive operations and record provenance, audit, and quality gaps."];
  }
  return ["Route through the dense-data registry, shared core database, relations, evidence, provenance, and quality-gap engines."];
}

function center(id: string, label: string, commandNoun: string, profileKind: string | undefined, notes: string, commandAliases: string[] = [pluralizeCommandNoun(commandNoun)], collectionName?: string): ClawDenseDataCenter {
  return { id, label, commandNoun, commandAliases, collectionName, profileKind, notes };
}

function operation(id: string, label: string, routes: string[], createsOrReads: string[]): ClawDenseDataOperation {
  return { id, label, routes, createsOrReads };
}

function view(id: string, label: string, commandPattern: string, operationId: string, requiredInputs: string[], outputShape: string): ClawDenseDataSemanticView {
  return { id, label, commandPattern, operationId, requiredInputs, outputShape };
}

function denseSystem(input: {
  id: string;
  label: string;
  command: string;
  aliases: string[];
  sensitivityDefault: ClawDenseDataSensitivityDefault;
  sharedEngines: string[];
  centers: ClawDenseDataCenter[];
  commandPatterns: string[];
  operations: ClawDenseDataOperation[];
  semanticViews: ClawDenseDataSemanticView[];
  standards: string[];
  notes: string;
}): ClawDenseDataSystem {
  return {
    id: input.id,
    label: input.label,
    wave: "first_wave",
    canonicalCommand: input.command,
    aliases: input.aliases,
    visiblePack: true,
    orchestrator: true,
    storagePolicy: "core_sqlite",
    sensitivityDefault: input.sensitivityDefault,
    sharedEngines: input.sharedEngines,
    centers: input.centers,
    commandPatterns: input.commandPatterns,
    operations: input.operations,
    semanticViews: input.semanticViews,
    standards: input.standards,
    notes: input.notes,
  };
}

function roadmapSystem(id: string, label: string, command: string, aliases: string[], centerCommand: string): ClawDenseDataSystem {
  return {
    id,
    label,
    wave: "roadmap",
    canonicalCommand: command,
    aliases,
    visiblePack: true,
    orchestrator: true,
    storagePolicy: "core_sqlite",
    sensitivityDefault: ["insurance", "government", "compliance", "hr"].includes(id) ? "high" : "normal",
    sharedEngines: ["evidence_provenance", "quality_gap", "relation_graph", "semantic_view", "intent_coverage", "workflow_state"],
    centers: [center(centerCommand.replace(/-/g, "_"), centerCommand.replace(/-/g, " "), centerCommand, undefined, "Roadmap center of gravity; must be expanded before this system can graduate from roadmap.")],
    commandPatterns: [`claw ${command} overview|gaps|intents`, ...aliases.map((alias) => `claw ${alias} overview|gaps|intents`)],
    operations: [operation(`${id}.overview`, `${label} overview`, [`claw ${command} overview`], [centerCommand])],
    semanticViews: [view(`${id}.overview`, `${label} overview`, `claw ${command} overview`, `${id}.overview`, [`${centerCommand.replace(/-/g, "_")}_id`], "roadmap overview shape to be detailed during pack graduation")],
    standards: [],
    notes: "Roadmap dense-data system visible for taxonomy and future pack graduation.",
  };
}

function pluralizeCommandNoun(commandNoun: string): string {
  if (/[bcdfghjklmnpqrstvwxyz]y$/.test(commandNoun)) return `${commandNoun.slice(0, -1)}ies`;
  if (commandNoun.endsWith("s")) return `${commandNoun}es`;
  return `${commandNoun}s`;
}
