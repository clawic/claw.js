export interface ClawDenseDataFixtureRecord {
  id: string;
  collectionName: string;
  label: string;
  covers: string[];
  data: Record<string, unknown>;
}

export interface ClawDenseDataAcceptanceFixture {
  schemaVersion: 1;
  sourceConversationId: string;
  fixtureSetId: string;
  records: ClawDenseDataFixtureRecord[];
}

export const clawDenseDataAcceptanceFixture: ClawDenseDataAcceptanceFixture = {
  schemaVersion: 1,
  sourceConversationId: "019e35a1-06bb-77f2-a712-92ed2646bd15",
  fixtureSetId: "dense-data-acceptance-v1",
  records: [
    {
      id: "fixture_company_acme",
      collectionName: "companies",
      label: "Acme Research Manufacturing",
      covers: ["company", "erp", "crm", "invoice_company"],
      data: { name: "Acme Research Manufacturing", domain: "example.test", evidence: ["fixture_evidence_intake_note"] },
    },
    {
      id: "fixture_patient_ada",
      collectionName: "patients",
      label: "Ada Patient",
      covers: ["patient", "health", "identity_profile", "partial_data"],
      data: { displayName: "Ada Patient", status: "active", qualityGaps: ["fixture_gap_missing_dob"], evidence: ["fixture_evidence_intake_note"] },
    },
    {
      id: "fixture_study_trial_a",
      collectionName: "studies",
      label: "Trial A",
      covers: ["study", "research", "ctms"],
      data: { title: "Trial A", status: "planned", evidence: ["fixture_evidence_intake_note"] },
    },
    {
      id: "fixture_participant_subject_001",
      collectionName: "participants",
      label: "Subject 001",
      covers: ["participant", "research", "ctms"],
      data: { displayName: "Subject 001", studyId: "fixture_study_trial_a", status: "screening", consentStatus: "unknown" },
    },
    {
      id: "fixture_sample_tube_a",
      collectionName: "samples",
      label: "Tube A",
      covers: ["sample", "labs", "lims", "research_sample"],
      data: { label: "Tube A", studyId: "fixture_study_trial_a", status: "collected", evidence: ["fixture_evidence_intake_note"] },
    },
    {
      id: "fixture_assay_cbc",
      collectionName: "assays",
      label: "CBC",
      covers: ["assay", "labs", "lims"],
      data: { name: "CBC", sampleId: "fixture_sample_tube_a", status: "ordered" },
    },
    {
      id: "fixture_organism_mouse_a",
      collectionName: "organisms",
      label: "Mouse A",
      covers: ["organism", "biology"],
      data: { label: "Mouse A", species: "Mus musculus", status: "active" },
    },
    {
      id: "fixture_biology_experiment_dose_response",
      collectionName: "biology_experiments",
      label: "Dose response",
      covers: ["experiment", "biology", "eln"],
      data: { title: "Dose response", organismId: "fixture_organism_mouse_a", status: "planned" },
    },
    {
      id: "fixture_sample_exp_1",
      collectionName: "samples",
      label: "Exp sample 1",
      covers: ["sample", "biology", "experiment_sample"],
      data: { label: "Exp sample 1", biologyExperimentId: "fixture_biology_experiment_dose_response", organismId: "fixture_organism_mouse_a", status: "collected" },
    },
    {
      id: "fixture_assay_marker",
      collectionName: "assays",
      label: "Marker assay",
      covers: ["assay", "biology", "experiment_assay"],
      data: { name: "Marker assay", sampleId: "fixture_sample_exp_1", status: "ordered" },
    },
    {
      id: "fixture_legal_case_smith",
      collectionName: "legal_cases",
      label: "Smith v Jones",
      covers: ["legal_case", "legal"],
      data: { title: "Smith v Jones", status: "open", evidence: ["fixture_evidence_contract"] },
    },
    {
      id: "fixture_case_evidence_contract",
      collectionName: "case_evidence",
      label: "Signed contract",
      covers: ["case_evidence", "evidence"],
      data: { title: "Signed contract", caseId: "fixture_legal_case_smith", source: { fixtureId: "fixture_evidence_contract" } },
    },
    {
      id: "fixture_billing_customer_acme",
      collectionName: "billing_customers",
      label: "Acme Billing",
      covers: ["billing_customer", "invoice_company"],
      data: { name: "Acme Billing", companyId: "fixture_company_acme" },
    },
    {
      id: "fixture_account_acme",
      collectionName: "accounts",
      label: "Acme Account",
      covers: ["account", "crm", "erp_company_overview"],
      data: { name: "Acme Account", companyId: "fixture_company_acme", industry: "research_manufacturing" },
    },
    {
      id: "fixture_deal_acme_pilot",
      collectionName: "deals",
      label: "Pilot",
      covers: ["deal", "crm", "erp_company_overview", "crm_account_overview"],
      data: { title: "Pilot", companyId: "fixture_company_acme", accountId: "fixture_account_acme", valueCents: 2500, currency: "USD", status: "open" },
    },
    {
      id: "fixture_contact_acme_ada",
      collectionName: "contacts",
      label: "Ada Buyer",
      covers: ["contact", "crm", "crm_account_overview"],
      data: { firstName: "Ada", lastName: "Buyer", email: "ada@example.test", companyId: "fixture_company_acme", accountId: "fixture_account_acme", lifecycleStage: "customer" },
    },
    {
      id: "fixture_activity_acme_demo",
      collectionName: "activities",
      label: "Demo call",
      covers: ["activity", "crm", "crm_account_overview"],
      data: { kind: "demo", subject: "Demo call", companyId: "fixture_company_acme", accountId: "fixture_account_acme", dealId: "fixture_deal_acme_pilot" },
    },
    {
      id: "fixture_invoice_001",
      collectionName: "invoices",
      label: "INV-001",
      covers: ["invoice", "erp", "finance"],
      data: { number: "INV-001", billingCustomerId: "fixture_billing_customer_acme", totalCents: 9900, currency: "USD", status: "draft" },
    },
    {
      id: "fixture_payment_intent_001",
      collectionName: "payment_intents",
      label: "INV-001 payment intent",
      covers: ["payment", "erp", "finance", "erp_company_overview"],
      data: { billingCustomerId: "fixture_billing_customer_acme", invoiceId: "fixture_invoice_001", amountCents: 9900, currency: "USD", status: "requires_payment_method" },
    },
    {
      id: "fixture_service_api",
      collectionName: "services",
      label: "API",
      covers: ["service", "ops", "itsm"],
      data: { name: "API", companyId: "fixture_company_acme", status: "active" },
    },
    {
      id: "fixture_incident_outage",
      collectionName: "incidents",
      label: "Outage",
      covers: ["incident", "ops", "itsm"],
      data: { title: "Outage", serviceId: "fixture_service_api", severity: "sev2", status: "open" },
    },
    {
      id: "fixture_course_intro_biology",
      collectionName: "courses",
      label: "Intro Biology",
      covers: ["course", "education", "lms"],
      data: { title: "Intro Biology", status: "enrolled" },
    },
    {
      id: "fixture_work_order_batch_42",
      collectionName: "work_orders",
      label: "Batch 42",
      covers: ["work_order", "manufacturing", "mes"],
      data: { title: "Batch 42", companyId: "fixture_company_acme", status: "planned" },
    },
    {
      id: "fixture_evidence_work_order_batch_42",
      collectionName: "evidence_sources",
      label: "Batch 42 traveler",
      covers: ["evidence", "manufacturing_evidence", "document_evidence"],
      data: { label: "Batch 42 traveler", kind: "document", collectionName: "work_orders", recordId: "fixture_work_order_batch_42", capturedAt: "2026-05-17T00:00:00.000Z" },
    },
    {
      id: "fixture_evidence_company_import",
      collectionName: "evidence_sources",
      label: "Company import note",
      covers: ["evidence", "erp_company_overview", "document_evidence"],
      data: { label: "Company import note", kind: "document", collectionName: "companies", recordId: "fixture_company_acme", capturedAt: "2026-05-17T00:00:00.000Z" },
    },
    {
      id: "fixture_evidence_account_discovery",
      collectionName: "evidence_sources",
      label: "Account discovery note",
      covers: ["evidence", "crm_account_overview", "document_evidence"],
      data: { label: "Account discovery note", kind: "document", collectionName: "accounts", recordId: "fixture_account_acme", capturedAt: "2026-05-17T00:00:00.000Z" },
    },
    {
      id: "fixture_evidence_intake_note",
      collectionName: "evidence_sources",
      label: "Clinic intake note",
      covers: ["evidence", "document_evidence", "raw_import"],
      data: { label: "Clinic intake note", kind: "document", collectionName: "patients", recordId: "fixture_patient_ada", capturedAt: "2026-05-17T00:00:00.000Z" },
    },
    {
      id: "fixture_evidence_contract",
      collectionName: "evidence_sources",
      label: "Signed contract file",
      covers: ["evidence", "legal_evidence", "document_evidence"],
      data: { label: "Signed contract file", kind: "file", collectionName: "legal_cases", recordId: "fixture_legal_case_smith", capturedAt: "2026-05-17T00:00:00.000Z" },
    },
    {
      id: "fixture_provenance_patient_import",
      collectionName: "provenance_events",
      label: "Patient imported from intake note",
      covers: ["provenance", "auditability"],
      data: { eventType: "imported", targetCollection: "patients", targetId: "fixture_patient_ada", evidenceSourceId: "fixture_evidence_intake_note", occurredAt: "2026-05-17T00:00:00.000Z" },
    },
    {
      id: "fixture_provenance_company_import",
      collectionName: "provenance_events",
      label: "Company imported from ERP note",
      covers: ["provenance", "erp_company_overview", "auditability"],
      data: { eventType: "imported", targetCollection: "companies", targetId: "fixture_company_acme", evidenceSourceId: "fixture_evidence_company_import", occurredAt: "2026-05-17T00:00:00.000Z" },
    },
    {
      id: "fixture_provenance_account_discovery",
      collectionName: "provenance_events",
      label: "Account imported from discovery note",
      covers: ["provenance", "crm_account_overview", "auditability"],
      data: { eventType: "imported", targetCollection: "accounts", targetId: "fixture_account_acme", evidenceSourceId: "fixture_evidence_account_discovery", occurredAt: "2026-05-17T00:00:00.000Z" },
    },
    {
      id: "fixture_gap_missing_dob",
      collectionName: "quality_gaps",
      label: "Missing date of birth",
      covers: ["partial_data_gap", "quality_gap"],
      data: { label: "Missing date of birth", targetCollection: "patients", targetId: "fixture_patient_ada", gapKind: "missing", status: "open", severity: "medium", evidenceSourceId: "fixture_evidence_intake_note" },
    },
    {
      id: "fixture_gap_company_tax_id",
      collectionName: "quality_gaps",
      label: "Missing tax ID",
      covers: ["partial_data_gap", "quality_gap", "erp_company_overview"],
      data: { label: "Missing tax ID", targetCollection: "companies", targetId: "fixture_company_acme", gapKind: "missing", status: "open", severity: "medium", evidenceSourceId: "fixture_evidence_company_import" },
    },
    {
      id: "fixture_gap_account_owner",
      collectionName: "quality_gaps",
      label: "Missing account owner",
      covers: ["partial_data_gap", "quality_gap", "crm_account_overview"],
      data: { label: "Missing account owner", targetCollection: "accounts", targetId: "fixture_account_acme", gapKind: "missing", status: "open", severity: "medium", evidenceSourceId: "fixture_evidence_account_discovery" },
    },
  ],
};

export function listClawDenseDataAcceptanceFixtureRecords(): ClawDenseDataFixtureRecord[] {
  return [...clawDenseDataAcceptanceFixture.records];
}
