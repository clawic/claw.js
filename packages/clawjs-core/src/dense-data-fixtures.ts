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
      id: "fixture_sample_tube_a",
      collectionName: "samples",
      label: "Tube A",
      covers: ["sample", "labs", "lims", "research_sample"],
      data: { label: "Tube A", studyId: "fixture_study_trial_a", status: "collected", evidence: ["fixture_evidence_intake_note"] },
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
      id: "fixture_invoice_001",
      collectionName: "invoices",
      label: "INV-001",
      covers: ["invoice", "erp", "finance"],
      data: { number: "INV-001", billingCustomerId: "fixture_billing_customer_acme", totalCents: 9900, currency: "USD", status: "draft" },
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
      id: "fixture_gap_missing_dob",
      collectionName: "quality_gaps",
      label: "Missing date of birth",
      covers: ["partial_data_gap", "quality_gap"],
      data: { label: "Missing date of birth", targetCollection: "patients", targetId: "fixture_patient_ada", gapKind: "missing", status: "open", severity: "medium", evidenceSourceId: "fixture_evidence_intake_note" },
    },
  ],
};

export function listClawDenseDataAcceptanceFixtureRecords(): ClawDenseDataFixtureRecord[] {
  return [...clawDenseDataAcceptanceFixture.records];
}
