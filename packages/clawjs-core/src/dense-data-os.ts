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
  sharedEngines: string[];
  intentStatuses: ClawDenseDataIntentStatus[];
  routeRejectionReasons: string[];
  standardCollectionActions: string[];
  systems: ClawDenseDataSystem[];
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
        center("encounter", "Encounter", "encounter", undefined, "Clinical visit/contact center for appointments, procedures, documents, observations, and follow-up."),
        center("medication", "Medication", "medication", undefined, "Medication center for active/historical drug exposure, orders, doses, and evidence links.", undefined, "medications"),
        center("symptom", "Symptom", "symptom", undefined, "Symptom center for reported problems, observations, severity, timing, provenance, and quality gaps.", ["symptoms"], "symptom_logs"),
      ],
      commandPatterns: [
        "claw patient list|get|create|update|delete|query|schema",
        "claw patient <id> timeline",
        "claw patient <id> medications list|add",
        "claw symptom list|get|create|update|delete|query|schema",
        "claw patient <id> labs list|add",
        "claw medication list|get|create|update|delete|query|schema",
        "claw medication add --patient <id>",
        "claw health overview|gaps|intents",
        "claw ehr overview|gaps|intents",
      ],
      operations: [
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
        "claw participant list|get|create|update|query",
        "claw research overview|gaps|intents",
        "claw ctms overview|gaps|intents",
      ],
      operations: [
        operation("study.cohort.list", "List study cohort", ["claw study <id> cohort list"], ["study", "cohort", "participant_profile"]),
        operation("study.evidence.link", "Link research evidence", ["claw study <id> evidence add"], ["study", "evidence_source", "provenance_event"]),
      ],
      semanticViews: [
        view("study.cohort", "Study cohort", "claw study <id> cohort list", "study.cohort.list", ["study_id"], "participants/cohorts with eligibility, consent, and quality gaps"),
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
        center("organism", "Organism", "organism", undefined, "Biological entity center for samples, assays, observations, and datasets."),
        center("experiment", "Experiment", "experiment", undefined, "Experimental workflow center shared with ELN/LIMS style data."),
      ],
      commandPatterns: ["claw biology overview|gaps|intents", "claw experiment list|get|create|update|query", "claw organism list|get|create|query"],
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
        center("legal_client", "Legal Client", "legal-client", "legal_client_profile", "Domain role over shared identity or organization."),
      ],
      commandPatterns: ["claw case list|get|create|update|delete|query|schema", "claw case <id> evidence list|add", "claw case <id> timeline", "claw legal overview|gaps|intents"],
      operations: [
        operation("case.evidence.add", "Add case evidence", ["claw case <id> evidence add"], ["case", "evidence_source", "provenance_event"]),
        operation("case.timeline", "Read case timeline", ["claw case <id> timeline"], ["case", "deadline", "document", "evidence_source"]),
      ],
      semanticViews: [view("case.evidence", "Case evidence", "claw case <id> evidence list", "case.evidence.add", ["case_id"], "case evidence with source, custody, confidence, and gaps")],
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
        center("product", "Product", "product", undefined, "Catalog/product center shared across commerce, inventory, procurement, PIM, and billing."),
        center("invoice", "Invoice", "invoice", undefined, "Invoice center shared across ERP, accounting, billing, payments, documents, and reconciliation.", undefined, "invoices"),
        center("payment", "Payment", "payment", undefined, "Payment center for money movement, reconciliation, evidence, and accounting links.", undefined, "payment_intents"),
      ],
      commandPatterns: [
        "claw erp overview|gaps|intents",
        "claw erp company <id> overview",
        "claw invoice list|get|create|update|delete|query|schema",
        "claw payment list|get|create|update|delete|query|schema",
      ],
      operations: [
        operation("erp.company.overview", "Read ERP company overview", ["claw erp company <id> overview"], ["company", "invoice", "payment", "product", "accounting_entry"]),
        operation("invoice.list", "List invoices", ["claw invoice list"], ["invoice", "company", "payment", "document_evidence"]),
      ],
      semanticViews: [
        view("erp.company.overview", "ERP company overview", "claw erp company <id> overview", "erp.company.overview", ["company_id"], "company/accounting/CRM/procurement/billing summary"),
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
        center("accounting_entity", "Accounting Entity", "accounting-entity", undefined, "Ledger/reporting entity center for finance and ERP."),
        center("transaction", "Transaction", "transaction", undefined, "Financial event center for payments, invoices, balances, and reconciliation."),
      ],
      commandPatterns: ["claw finance overview|gaps|intents", "claw accounting overview|gaps|intents", "claw transaction list|get|create|update|query|schema"],
      operations: [operation("finance.entity.overview", "Read finance entity overview", ["claw finance entity <id> overview"], ["accounting_entity", "transaction", "invoice", "accounting_entry"])],
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
      commandPatterns: ["claw education overview|gaps|intents", "claw lms overview|gaps|intents", "claw course list|get|create|update|query|schema", "claw learner <id> timeline"],
      operations: [operation("learner.timeline", "Read learner timeline", ["claw learner <id> timeline"], ["learner_profile", "course", "assessment", "credential"])],
      semanticViews: [view("learner.timeline", "Learner timeline", "claw learner <id> timeline", "learner.timeline", ["learner_id"], "course, assessment, study, credential, and progress events")],
      standards: ["xAPI", "LTI", "SCORM"],
      notes: "Learning and education builtins must converge under this system model.",
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
        center("asset", "Asset", "asset", undefined, "Equipment/production asset center shared with maintenance and ops."),
      ],
      commandPatterns: ["claw manufacturing overview|gaps|intents", "claw mes overview|gaps|intents", "claw work-order list|get|create|update|query|schema", "claw work-order <id> timeline"],
      operations: [operation("work_order.timeline", "Read work order timeline", ["claw work-order <id> timeline"], ["work_order", "asset", "material", "quality_event"])],
      semanticViews: [view("work_order.timeline", "Work order timeline", "claw work-order <id> timeline", "work_order.timeline", ["work_order_id"], "materials, operations, quality, labor, evidence, and gaps")],
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
    roadmapSystem("hr", "HR / HRIS", "hr", ["hris"], "employee"),
    roadmapSystem("supply_chain", "Supply Chain / SCM", "supply-chain", ["scm"], "supplier"),
    roadmapSystem("warehouse", "Warehouse / WMS", "warehouse", ["wms"], "warehouse"),
    roadmapSystem("transport", "Transport / TMS", "transport", ["tms"], "shipment"),
    roadmapSystem("procurement", "Procurement", "procurement", [], "purchase-order"),
    roadmapSystem("compliance", "Compliance / GRC", "compliance", ["grc"], "control"),
    roadmapSystem("real_estate", "Real Estate", "real-estate", [], "property"),
    roadmapSystem("insurance", "Insurance", "insurance", [], "policy"),
    roadmapSystem("government", "Government", "government", [], "case"),
    roadmapSystem("construction", "Construction", "construction", [], "project"),
    roadmapSystem("iot", "IoT", "iot", [], "thing"),
    roadmapSystem("content", "Content / CMS", "content", ["cms"], "content-item"),
    roadmapSystem("product", "Product / PIM / PLM", "product", ["pim", "plm"], "product"),
    roadmapSystem("pharma", "Pharma", "pharma", [], "product"),
    roadmapSystem("maintenance", "Maintenance / CMMS", "maintenance", ["cmms"], "asset"),
    roadmapSystem("eln", "Electronic Lab Notebook / ELN", "eln", [], "experiment"),
  ],
};

export function listClawDenseDataSystems(options: { wave?: ClawDenseDataWave } = {}): ClawDenseDataSystem[] {
  return clawDenseDataOsRegistry.systems.filter((system) => !options.wave || system.wave === options.wave);
}

export function findClawDenseDataSystem(idOrCommand: string): ClawDenseDataSystem | undefined {
  return clawDenseDataOsRegistry.systems.find(
    (system) => system.id === idOrCommand || system.canonicalCommand === idOrCommand || system.aliases.includes(idOrCommand),
  );
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

  const system = findClawDenseDataSystem(tokens[0] ?? "");
  if (system) {
    return denseDataIntentResolution(phrase, normalizedPhrase, system.wave === "first_wave" ? "partial" : "external_pending", [`Matched dense-data system ${system.id}, but no specific route pattern matched.`], nextStepsFor(system, tokens), { system });
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
  }

  const requiredActions = ["list", "get", "create", "update", "delete", "query", "schema", "purge"];
  for (const action of requiredActions) {
    if (!clawDenseDataOsRegistry.standardCollectionActions.includes(action)) failures.push(`missing standard action ${action}`);
  }

  for (const status of ["covered", "partial", "alias_candidate", "data_gap", "workflow_gap", "external_pending", "blocked", "custom_pack"] satisfies ClawDenseDataIntentStatus[]) {
    if (!clawDenseDataOsRegistry.intentStatuses.includes(status)) failures.push(`missing intent status ${status}`);
  }

  const requiredFirstWave = ["health", "research", "biology", "labs", "legal", "erp", "crm", "finance", "education", "manufacturing", "ops"];
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
  if (commandNoun.endsWith("y")) return `${commandNoun.slice(0, -1)}ies`;
  if (commandNoun.endsWith("s")) return `${commandNoun}es`;
  return `${commandNoun}s`;
}
