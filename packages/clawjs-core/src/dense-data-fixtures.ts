import {
  clawDenseDataOsRegistry,
  listClawDenseDataIntentEntries,
  listClawDenseDataSemanticViewEntries,
} from "./dense-data-os.ts";

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
      covers: ["company", "erp", "crm", "invoice_company", "company_timeline"],
      data: { name: "Acme Research Manufacturing", domain: "example.test", evidence: ["fixture_evidence_intake_note"] },
    },
    {
      id: "fixture_employee_ada",
      collectionName: "employees",
      label: "Ada Employee",
      covers: ["employee", "hr", "hris", "employee_timeline", "identity_profile", "company_timeline"],
      data: { displayName: "Ada Employee", companyId: "fixture_company_acme", email: "ada.employee@example.test", jobTitle: "Operations Lead", status: "active", hireDate: "2026-05-17T00:00:00.000Z" },
    },
    {
      id: "fixture_time_off_ada",
      collectionName: "time_off_requests",
      label: "Ada PTO",
      covers: ["time_off", "hr", "hris", "employee_timeline"],
      data: { employeeId: "fixture_employee_ada", kind: "vacation", startDate: "2026-06-01T00:00:00.000Z", endDate: "2026-06-03T00:00:00.000Z", status: "pending" },
    },
    {
      id: "fixture_performance_review_ada",
      collectionName: "performance_reviews",
      label: "Ada Q2 Review",
      covers: ["performance_review", "hr", "hris", "employee_timeline"],
      data: { employeeId: "fixture_employee_ada", cycleName: "2026 Q2", rating: "strong", status: "draft" },
    },
    {
      id: "fixture_property_listing_main",
      collectionName: "property_listings",
      label: "Main Street Loft",
      covers: ["property", "real_estate", "proptech", "property_timeline", "document_evidence"],
      data: { title: "Main Street Loft", kind: "apartment", transaction: "rent", city: "Madrid", address: "Main Street 1", status: "published" },
    },
    {
      id: "fixture_property_visit_main",
      collectionName: "property_visits",
      label: "Main Street visit",
      covers: ["property_visit", "real_estate", "proptech", "property_timeline"],
      data: { propertyListingId: "fixture_property_listing_main", visitedAt: "2026-05-17T00:00:00.000Z", visitorName: "Ada Visitor", rating: 4 },
    },
    {
      id: "fixture_property_offer_main",
      collectionName: "property_offers",
      label: "Main Street offer",
      covers: ["property_offer", "real_estate", "proptech", "property_timeline"],
      data: { propertyListingId: "fixture_property_listing_main", offeredAt: "2026-05-18T00:00:00.000Z", buyerName: "Ada Buyer", amountCents: 250000, currency: "EUR", status: "pending" },
    },
    {
      id: "fixture_property_inspection_main",
      collectionName: "property_inspections",
      label: "Main Street inspection",
      covers: ["property_inspection", "real_estate", "proptech", "property_timeline"],
      data: { propertyListingId: "fixture_property_listing_main", inspectedAt: "2026-05-19T00:00:00.000Z", inspectorName: "Inspector One", findings: { moisture: "none" } },
    },
    {
      id: "fixture_construction_project_lab",
      collectionName: "construction_projects",
      label: "Lab buildout",
      covers: ["construction_project", "construction", "construction_project_timeline", "company_timeline"],
      data: { title: "Lab buildout", companyId: "fixture_company_acme", customerCompanyId: "fixture_company_acme", status: "active", contractNumber: "BUILD-001", startAt: "2026-05-17T00:00:00.000Z", budgetCents: 25000000, currency: "USD" },
    },
    {
      id: "fixture_construction_site_lab",
      collectionName: "construction_sites",
      label: "Lab site",
      covers: ["construction_site", "construction", "construction_project_timeline", "location"],
      data: { name: "Lab site", projectId: "fixture_construction_project_lab", propertyListingId: "fixture_property_listing_main", superintendentEmployeeId: "fixture_employee_ada", status: "active", address: { line1: "Main Street 1", city: "Madrid" } },
    },
    {
      id: "fixture_construction_rfi_lab",
      collectionName: "construction_rfis",
      label: "RFI-001 ventilation",
      covers: ["construction_rfi", "construction", "construction_project_timeline", "document_evidence"],
      data: { title: "Ventilation clarification", projectId: "fixture_construction_project_lab", siteId: "fixture_construction_site_lab", number: "RFI-001", status: "open", requestedAt: "2026-05-18T00:00:00.000Z" },
    },
    {
      id: "fixture_construction_change_order_lab",
      collectionName: "construction_change_orders",
      label: "CO-001 ventilation",
      covers: ["construction_change_order", "construction", "construction_project_timeline", "partial_data"],
      data: { title: "Ventilation upgrade", projectId: "fixture_construction_project_lab", siteId: "fixture_construction_site_lab", relatedRfiId: "fixture_construction_rfi_lab", number: "CO-001", status: "submitted", submittedAt: "2026-05-20T00:00:00.000Z", amountCents: 1200000, currency: "USD", scheduleImpactDays: 5 },
    },
    {
      id: "fixture_insurance_policy_home",
      collectionName: "insurance_policies",
      label: "Home policy",
      covers: ["insurance_policy", "insurance", "policy_timeline", "document_evidence", "partial_data"],
      data: { title: "Home policy", kind: "home", policyNumber: "HOME-001", provider: "Example Mutual", startedAt: "2026-05-17T00:00:00.000Z", premiumCents: 120000, coverage: "Home coverage summary" },
    },
    {
      id: "fixture_vehicle_ev",
      collectionName: "vehicles",
      label: "EV",
      covers: ["vehicle", "insurance", "vehicle_insurance_policy"],
      data: { name: "EV", make: "Example", model: "EV", year: 2026, active: true },
    },
    {
      id: "fixture_vehicle_insurance_policy_ev",
      collectionName: "vehicle_insurance_policies",
      label: "EV policy",
      covers: ["vehicle_insurance_policy", "insurance", "document_evidence"],
      data: { vehicleId: "fixture_vehicle_ev", policyNumber: "AUTO-001", provider: "Example Mutual", startedAt: "2026-05-17T00:00:00.000Z", premiumCents: 60000, coverage: "Vehicle liability" },
    },
    {
      id: "fixture_vehicle_maintenance_ev",
      collectionName: "vehicle_maintenance",
      label: "EV annual service",
      covers: ["vehicle_maintenance", "maintenance", "cmms", "vehicle_timeline", "document_evidence"],
      data: { vehicleId: "fixture_vehicle_ev", title: "EV annual service", performedAt: "2026-05-20T00:00:00.000Z", performedBy: "Example Garage", costCents: 15000 },
    },
    {
      id: "fixture_appliance_washer",
      collectionName: "appliances",
      label: "Washer",
      covers: ["appliance", "maintenance", "cmms"],
      data: { name: "Washer", brand: "Example", model: "W1", room: "Laundry" },
    },
    {
      id: "fixture_appliance_maintenance_washer",
      collectionName: "appliance_maintenance",
      label: "Washer service",
      covers: ["appliance_maintenance", "maintenance", "cmms", "document_evidence"],
      data: { applianceId: "fixture_appliance_washer", title: "Washer service", performedAt: "2026-05-21T00:00:00.000Z", performedBy: "Example Repair", costCents: 9000 },
    },
    {
      id: "fixture_patient_ada",
      collectionName: "patients",
      label: "Ada Patient",
      covers: ["patient", "health", "identity_profile", "partial_data"],
      data: { displayName: "Ada Patient", status: "active", qualityGaps: ["fixture_gap_missing_dob"], evidence: ["fixture_evidence_intake_note"] },
    },
    {
      id: "fixture_lab_result_cbc",
      collectionName: "lab_results",
      label: "CBC panel",
      covers: ["lab_result", "health", "patient_timeline", "evidence"],
      data: { title: "CBC panel", patientId: "fixture_patient_ada", lab: "Central Lab", reportedAt: "2026-05-17T00:00:00.000Z", values: { hemoglobin: "13.7 g/dL" } },
    },
    {
      id: "fixture_encounter_intake",
      collectionName: "encounters",
      label: "Intake visit",
      covers: ["encounter", "health", "ehr", "patient_timeline", "document_evidence"],
      data: { title: "Intake visit", patientId: "fixture_patient_ada", encounterType: "visit", status: "completed", startedAt: "2026-05-17T00:00:00.000Z", evidenceSourceIds: ["fixture_evidence_intake_note"] },
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
      id: "fixture_legal_client_smith",
      collectionName: "legal_clients",
      label: "Smith Client",
      covers: ["legal_client", "legal", "legal_profile", "case_timeline", "identity_profile"],
      data: { displayName: "Smith Client", caseId: "fixture_legal_case_smith", role: "client", status: "active", conflictStatus: "unknown", evidenceSourceIds: ["fixture_evidence_contract"] },
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
      covers: ["billing_customer", "invoice_company", "company_timeline"],
      data: { name: "Acme Billing", companyId: "fixture_company_acme" },
    },
    {
      id: "fixture_account_acme",
      collectionName: "accounts",
      label: "Acme Account",
      covers: ["account", "crm", "erp_company_overview", "asset_timeline", "company_timeline"],
      data: { name: "Acme Account", companyId: "fixture_company_acme", industry: "research_manufacturing" },
    },
    {
      id: "fixture_product_press_model",
      collectionName: "products_catalog",
      label: "Press Model",
      covers: ["product_catalog", "erp", "crm", "asset_timeline", "company_timeline"],
      data: { name: "Press Model", companyId: "fixture_company_acme", type: "physical", active: true },
    },
    {
      id: "fixture_supplier_parts_co",
      collectionName: "suppliers",
      label: "Parts Co",
      covers: ["supplier", "procurement", "purchasing", "purchase_order_timeline", "company_timeline"],
      data: { name: "Parts Co", companyId: "fixture_company_acme", status: "active", category: "parts" },
    },
    {
      id: "fixture_purchase_order_001",
      collectionName: "purchase_orders",
      label: "PO-001",
      covers: ["purchase_order", "procurement", "purchasing", "purchase_order_timeline", "document_evidence", "company_timeline"],
      data: { number: "PO-001", supplierId: "fixture_supplier_parts_co", companyId: "fixture_company_acme", status: "issued", orderedAt: "2026-05-17T00:00:00.000Z", currency: "USD", totalCents: 50000 },
    },
    {
      id: "fixture_purchase_order_line_press",
      collectionName: "purchase_order_line_items",
      label: "Press frame",
      covers: ["purchase_order_line_item", "procurement", "purchasing", "purchase_order_timeline", "erp"],
      data: { description: "Press frame", purchaseOrderId: "fixture_purchase_order_001", productCatalogId: "fixture_product_press_model", quantity: 2, unitCostCents: 25000, totalCents: 50000, status: "ordered" },
    },
    {
      id: "fixture_warehouse_main",
      collectionName: "warehouses",
      label: "Main Warehouse",
      covers: ["warehouse", "wms", "warehouse_timeline", "company_timeline"],
      data: { name: "Main Warehouse", companyId: "fixture_company_acme", code: "WH-1", status: "active" },
    },
    {
      id: "fixture_inventory_item_press",
      collectionName: "inventory_items",
      label: "Press inventory",
      covers: ["inventory_item", "warehouse", "wms", "warehouse_timeline", "product_catalog"],
      data: { name: "Press inventory", warehouseId: "fixture_warehouse_main", productCatalogId: "fixture_product_press_model", sku: "PRESS-001", quantityOnHand: 3, status: "in_stock" },
    },
    {
      id: "fixture_stock_movement_press_receipt",
      collectionName: "stock_movements",
      label: "Press receipt",
      covers: ["stock_movement", "warehouse", "wms", "warehouse_timeline", "document_evidence"],
      data: { title: "Press receipt", inventoryItemId: "fixture_inventory_item_press", warehouseId: "fixture_warehouse_main", movementType: "received", quantity: 3, occurredAt: "2026-05-17T00:00:00.000Z" },
    },
    {
      id: "fixture_supply_plan_q2",
      collectionName: "supply_plans",
      label: "Q2 supply plan",
      covers: ["supply_plan", "supply_chain", "scm", "supply_plan_timeline", "company_timeline"],
      data: { title: "Q2 supply plan", companyId: "fixture_company_acme", status: "active", horizonStartAt: "2026-05-17T00:00:00.000Z", horizonEndAt: "2026-06-30T00:00:00.000Z" },
    },
    {
      id: "fixture_supply_plan_item_press",
      collectionName: "supply_plan_items",
      label: "Press demand",
      covers: ["supply_plan_item", "supply_chain", "scm", "supply_plan_timeline", "procurement", "warehouse"],
      data: { title: "Press demand", supplyPlanId: "fixture_supply_plan_q2", productCatalogId: "fixture_product_press_model", supplierId: "fixture_supplier_parts_co", purchaseOrderId: "fixture_purchase_order_001", warehouseId: "fixture_warehouse_main", inventoryItemId: "fixture_inventory_item_press", quantityRequired: 5, quantityAvailable: 3, quantityGap: 2, neededBy: "2026-06-01T00:00:00.000Z", status: "short", priority: "high" },
    },
    {
      id: "fixture_supply_risk_lead_time",
      collectionName: "supply_risks",
      label: "Supplier lead-time risk",
      covers: ["supply_risk", "supply_chain", "scm", "supply_plan_timeline", "partial_data"],
      data: { title: "Supplier lead-time risk", supplyPlanId: "fixture_supply_plan_q2", supplierId: "fixture_supplier_parts_co", purchaseOrderId: "fixture_purchase_order_001", warehouseId: "fixture_warehouse_main", inventoryItemId: "fixture_inventory_item_press", riskType: "lead_time", severity: "high", status: "monitoring", identifiedAt: "2026-05-18T00:00:00.000Z", mitigation: "Confirm expedited receiving path." },
    },
    {
      id: "fixture_compliance_obligation_soc2",
      collectionName: "compliance_obligations",
      label: "SOC 2 access review obligation",
      covers: ["compliance_obligation", "compliance", "grc", "control_timeline", "document_evidence"],
      data: { title: "SOC 2 access review obligation", authority: "SOC 2", reference: "CC6.2", companyId: "fixture_company_acme", status: "applicable", effectiveAt: "2026-05-17T00:00:00.000Z" },
    },
    {
      id: "fixture_compliance_control_access_review",
      collectionName: "compliance_controls",
      label: "Quarterly access review",
      covers: ["control", "compliance_control", "compliance", "grc", "control_timeline", "company_timeline"],
      data: { title: "Quarterly access review", controlKey: "AC-REV-001", framework: "SOC 2", companyId: "fixture_company_acme", obligationId: "fixture_compliance_obligation_soc2", ownerEmployeeId: "fixture_employee_ada", status: "implemented", controlType: "governance" },
    },
    {
      id: "fixture_control_assessment_access_review",
      collectionName: "control_assessments",
      label: "Q2 access review assessment",
      covers: ["control_assessment", "compliance", "grc", "control_timeline", "evidence"],
      data: { title: "Q2 access review assessment", controlId: "fixture_compliance_control_access_review", obligationId: "fixture_compliance_obligation_soc2", assessorEmployeeId: "fixture_employee_ada", result: "partial", status: "completed", assessedAt: "2026-05-19T00:00:00.000Z" },
    },
    {
      id: "fixture_compliance_finding_access_gap",
      collectionName: "compliance_findings",
      label: "Access review evidence gap",
      covers: ["compliance_finding", "compliance", "grc", "control_timeline", "partial_data"],
      data: { title: "Access review evidence gap", controlId: "fixture_compliance_control_access_review", assessmentId: "fixture_control_assessment_access_review", obligationId: "fixture_compliance_obligation_soc2", ownerEmployeeId: "fixture_employee_ada", severity: "medium", status: "open", identifiedAt: "2026-05-20T00:00:00.000Z", remediation: "Attach reviewer sign-off evidence." },
    },
    {
      id: "fixture_asset_press_001",
      collectionName: "assets",
      label: "Press 001",
      covers: ["asset", "manufacturing", "mes", "crm", "asset_timeline", "company_timeline", "partial_data"],
      data: { companyId: "fixture_company_acme", accountId: "fixture_account_acme", productCatalogId: "fixture_product_press_model", serialNumber: "PRESS-001", status: "active" },
    },
    {
      id: "fixture_iot_thing_press",
      collectionName: "iot_things",
      label: "Press IoT thing",
      covers: ["thing", "iot_thing", "iot", "thing_timeline", "asset_timeline", "physical_device"],
      data: { name: "Press IoT thing", companyId: "fixture_company_acme", assetId: "fixture_asset_press_001", kind: "controller", status: "active", externalId: "thing-press-001" },
    },
    {
      id: "fixture_iot_device_press_sensor",
      collectionName: "iot_devices",
      label: "Press vibration sensor",
      covers: ["iot_device", "device", "iot", "thing_timeline", "physical_device"],
      data: { name: "Press vibration sensor", thingId: "fixture_iot_thing_press", protocol: "mqtt", deviceType: "sensor", status: "online", lastSeenAt: "2026-05-17T00:00:00.000Z" },
    },
    {
      id: "fixture_sensor_reading_press_vibration",
      collectionName: "sensor_readings",
      label: "Press vibration",
      covers: ["sensor_reading", "iot", "thing_timeline", "partial_data"],
      data: { metric: "vibration", thingId: "fixture_iot_thing_press", deviceId: "fixture_iot_device_press_sensor", value: 0.42, quality: "good", observedAt: "2026-05-17T00:05:00.000Z" },
    },
    {
      id: "fixture_device_command_press_restart",
      collectionName: "device_commands",
      label: "Restart press gateway",
      covers: ["device_command", "iot", "thing_timeline", "approval", "physical_device"],
      data: { title: "Restart press gateway", thingId: "fixture_iot_thing_press", deviceId: "fixture_iot_device_press_sensor", commandType: "restart", status: "pending_approval", requestedAt: "2026-05-17T00:10:00.000Z", payload: { reason: "fixture" } },
    },
    {
      id: "fixture_deal_acme_pilot",
      collectionName: "deals",
      label: "Pilot",
      covers: ["deal", "crm", "erp_company_overview", "crm_account_overview", "company_timeline"],
      data: { title: "Pilot", companyId: "fixture_company_acme", accountId: "fixture_account_acme", valueCents: 2500, currency: "USD", status: "open" },
    },
    {
      id: "fixture_contact_acme_ada",
      collectionName: "contacts",
      label: "Ada Buyer",
      covers: ["contact", "crm", "crm_account_overview", "company_timeline"],
      data: { firstName: "Ada", lastName: "Buyer", email: "ada@example.test", companyId: "fixture_company_acme", accountId: "fixture_account_acme", lifecycleStage: "customer" },
    },
    {
      id: "fixture_activity_acme_demo",
      collectionName: "activities",
      label: "Demo call",
      covers: ["activity", "crm", "crm_account_overview", "company_timeline"],
      data: { kind: "demo", subject: "Demo call", companyId: "fixture_company_acme", accountId: "fixture_account_acme", dealId: "fixture_deal_acme_pilot" },
    },
    {
      id: "fixture_invoice_001",
      collectionName: "invoices",
      label: "INV-001",
      covers: ["invoice", "erp", "finance", "company_timeline"],
      data: { number: "INV-001", billingCustomerId: "fixture_billing_customer_acme", totalCents: 9900, currency: "USD", status: "draft" },
    },
    {
      id: "fixture_payment_intent_001",
      collectionName: "payment_intents",
      label: "INV-001 payment intent",
      covers: ["payment", "erp", "finance", "erp_company_overview", "company_timeline"],
      data: { billingCustomerId: "fixture_billing_customer_acme", invoiceId: "fixture_invoice_001", amountCents: 9900, currency: "USD", status: "requires_payment_method" },
    },
    {
      id: "fixture_financial_account_ops",
      collectionName: "financial_accounts",
      label: "Operating Account",
      covers: ["financial_account", "finance", "accounting", "finance_entity_overview"],
      data: { name: "Operating Account", kind: "checking", currency: "USD", active: true },
    },
    {
      id: "fixture_transaction_lunch",
      collectionName: "transactions",
      label: "Lunch",
      covers: ["transaction", "finance", "accounting", "finance_entity_overview"],
      data: { description: "Lunch", accountId: "fixture_financial_account_ops", amountCents: 1200, currency: "USD", kind: "debit", postedAt: "2026-05-17T00:00:00.000Z" },
    },
    {
      id: "fixture_service_api",
      collectionName: "services",
      label: "API",
      covers: ["service", "ops", "itsm", "company_timeline"],
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
      id: "fixture_learner_ada",
      collectionName: "learners",
      label: "Ada Learner",
      covers: ["learner", "education", "lms", "learner_timeline", "partial_data"],
      data: { displayName: "Ada Learner", status: "active", program: "Biology", startedAt: "2026-05-17T00:00:00.000Z", evidence: ["fixture_evidence_learner_record"], qualityGaps: ["fixture_gap_learner_credential"] },
    },
    {
      id: "fixture_course_intro_biology",
      collectionName: "courses",
      label: "Intro Biology",
      covers: ["course", "education", "lms", "learner_timeline", "course_timeline"],
      data: { title: "Intro Biology", status: "enrolled" },
    },
    {
      id: "fixture_lesson_cell_basics",
      collectionName: "lessons",
      label: "Cell basics",
      covers: ["lesson", "education", "lms", "course_timeline"],
      data: { title: "Cell basics", courseId: "fixture_course_intro_biology", position: 1, status: "completed" },
    },
    {
      id: "fixture_study_session_biology",
      collectionName: "study_sessions",
      label: "Biology review",
      covers: ["study_session", "education", "lms", "course_timeline"],
      data: { topic: "Biology review", courseId: "fixture_course_intro_biology", startedAt: "2026-05-17T00:00:00.000Z", durationMinutes: 45 },
    },
    {
      id: "fixture_relation_learner_course",
      collectionName: "entity_relations",
      label: "Ada enrolled in Intro Biology",
      covers: ["entity_relation", "education", "lms", "learner_timeline", "course_timeline"],
      data: { fromEntityKind: "learners", fromEntityId: "fixture_learner_ada", toEntityKind: "courses", toEntityId: "fixture_course_intro_biology", type: "member_of" },
    },
    {
      id: "fixture_work_order_batch_42",
      collectionName: "work_orders",
      label: "Batch 42",
      covers: ["work_order", "manufacturing", "mes", "asset_timeline", "company_timeline"],
      data: { title: "Batch 42", companyId: "fixture_company_acme", assetId: "fixture_asset_press_001", status: "planned" },
    },
    {
      id: "fixture_relation_asset_service",
      collectionName: "entity_relations",
      label: "Press supports API",
      covers: ["entity_relation", "asset_timeline", "ops", "manufacturing"],
      data: { fromEntityKind: "assets", fromEntityId: "fixture_asset_press_001", toEntityKind: "services", toEntityId: "fixture_service_api", type: "references" },
    },
    {
      id: "fixture_evidence_asset_install",
      collectionName: "evidence_sources",
      label: "Asset install record",
      covers: ["evidence", "asset_timeline", "document_evidence"],
      data: { label: "Asset install record", kind: "document", collectionName: "assets", recordId: "fixture_asset_press_001", capturedAt: "2026-05-17T00:00:00.000Z" },
    },
    {
      id: "fixture_evidence_course_syllabus",
      collectionName: "evidence_sources",
      label: "Course syllabus",
      covers: ["evidence", "course_timeline", "document_evidence"],
      data: { label: "Course syllabus", kind: "document", collectionName: "courses", recordId: "fixture_course_intro_biology", capturedAt: "2026-05-17T00:00:00.000Z" },
    },
    {
      id: "fixture_evidence_learner_record",
      collectionName: "evidence_sources",
      label: "Learner import record",
      covers: ["evidence", "learner_timeline", "document_evidence"],
      data: { label: "Learner import record", kind: "document", collectionName: "learners", recordId: "fixture_learner_ada", capturedAt: "2026-05-17T00:00:00.000Z" },
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
      covers: ["evidence", "erp_company_overview", "company_timeline", "document_evidence"],
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
      id: "fixture_evidence_finance_statement",
      collectionName: "evidence_sources",
      label: "Bank statement",
      covers: ["evidence", "finance_entity_overview", "document_evidence"],
      data: { label: "Bank statement", kind: "document", collectionName: "financial_accounts", recordId: "fixture_financial_account_ops", capturedAt: "2026-05-17T00:00:00.000Z" },
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
      id: "fixture_provenance_asset_import",
      collectionName: "provenance_events",
      label: "Asset imported from install record",
      covers: ["provenance", "asset_timeline", "auditability"],
      data: { eventType: "imported", targetCollection: "assets", targetId: "fixture_asset_press_001", evidenceSourceId: "fixture_evidence_asset_install", occurredAt: "2026-05-17T00:00:00.000Z" },
    },
    {
      id: "fixture_provenance_course_import",
      collectionName: "provenance_events",
      label: "Course imported from LMS",
      covers: ["provenance", "course_timeline", "auditability"],
      data: { eventType: "imported", targetCollection: "courses", targetId: "fixture_course_intro_biology", evidenceSourceId: "fixture_evidence_course_syllabus", occurredAt: "2026-05-17T00:00:00.000Z" },
    },
    {
      id: "fixture_provenance_learner_import",
      collectionName: "provenance_events",
      label: "Learner imported from LMS record",
      covers: ["provenance", "learner_timeline", "auditability"],
      data: { eventType: "imported", targetCollection: "learners", targetId: "fixture_learner_ada", evidenceSourceId: "fixture_evidence_learner_record", occurredAt: "2026-05-17T00:00:00.000Z" },
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
      covers: ["provenance", "erp_company_overview", "company_timeline", "auditability"],
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
      id: "fixture_provenance_finance_statement",
      collectionName: "provenance_events",
      label: "Finance account imported from statement",
      covers: ["provenance", "finance_entity_overview", "auditability"],
      data: { eventType: "imported", targetCollection: "financial_accounts", targetId: "fixture_financial_account_ops", evidenceSourceId: "fixture_evidence_finance_statement", occurredAt: "2026-05-17T00:00:00.000Z" },
    },
    {
      id: "fixture_gap_asset_maintenance_plan",
      collectionName: "quality_gaps",
      label: "Missing maintenance plan",
      covers: ["partial_data_gap", "quality_gap", "asset_timeline"],
      data: { label: "Missing maintenance plan", targetCollection: "assets", targetId: "fixture_asset_press_001", gapKind: "missing", status: "open", severity: "medium", evidenceSourceId: "fixture_evidence_asset_install" },
    },
    {
      id: "fixture_gap_course_assessment",
      collectionName: "quality_gaps",
      label: "Missing assessment rubric",
      covers: ["partial_data_gap", "quality_gap", "course_timeline"],
      data: { label: "Missing assessment rubric", targetCollection: "courses", targetId: "fixture_course_intro_biology", gapKind: "missing", status: "open", severity: "medium", evidenceSourceId: "fixture_evidence_course_syllabus" },
    },
    {
      id: "fixture_gap_learner_credential",
      collectionName: "quality_gaps",
      label: "Missing credential evidence",
      covers: ["partial_data_gap", "quality_gap", "learner_timeline"],
      data: { label: "Missing credential evidence", targetCollection: "learners", targetId: "fixture_learner_ada", gapKind: "missing", status: "open", severity: "medium", evidenceSourceId: "fixture_evidence_learner_record" },
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
      covers: ["partial_data_gap", "quality_gap", "erp_company_overview", "company_timeline"],
      data: { label: "Missing tax ID", targetCollection: "companies", targetId: "fixture_company_acme", gapKind: "missing", status: "open", severity: "medium", evidenceSourceId: "fixture_evidence_company_import" },
    },
    {
      id: "fixture_gap_account_owner",
      collectionName: "quality_gaps",
      label: "Missing account owner",
      covers: ["partial_data_gap", "quality_gap", "crm_account_overview"],
      data: { label: "Missing account owner", targetCollection: "accounts", targetId: "fixture_account_acme", gapKind: "missing", status: "open", severity: "medium", evidenceSourceId: "fixture_evidence_account_discovery" },
    },
    {
      id: "fixture_gap_finance_reconciliation",
      collectionName: "quality_gaps",
      label: "Missing reconciliation status",
      covers: ["partial_data_gap", "quality_gap", "finance_entity_overview"],
      data: { label: "Missing reconciliation status", targetCollection: "financial_accounts", targetId: "fixture_financial_account_ops", gapKind: "missing", status: "open", severity: "medium", evidenceSourceId: "fixture_evidence_finance_statement" },
    },
    ...listClawDenseDataRegistryFixtureRecords(),
  ],
};

export function listClawDenseDataAcceptanceFixtureRecords(): ClawDenseDataFixtureRecord[] {
  return [...clawDenseDataAcceptanceFixture.records];
}

export function listClawDenseDataRegistryFixtureRecords(): ClawDenseDataFixtureRecord[] {
  const records: ClawDenseDataFixtureRecord[] = [];
  const profileTargets: Record<string, { entityKind: string; entityId: string; fields: Record<string, unknown> }> = {
    patient_profile: { entityKind: "patients", entityId: "fixture_patient_ada", fields: { status: "active" } },
    participant_profile: { entityKind: "participants", entityId: "fixture_participant_subject_001", fields: { status: "screening", consentStatus: "unknown" } },
    learner_profile: { entityKind: "learners", entityId: "fixture_learner_ada", fields: { status: "active", program: "Biology" } },
    organization_profile: { entityKind: "companies", entityId: "fixture_company_acme", fields: { domain: "example.test" } },
    account_profile: { entityKind: "accounts", entityId: "fixture_account_acme", fields: { industry: "research_manufacturing" } },
  };

  for (const system of clawDenseDataOsRegistry.systems) {
    records.push({
      id: `fixture_domain_system_${system.id}`,
      collectionName: "domain_systems",
      label: system.label,
      covers: ["domain_system", "dense_registry", system.id, system.wave],
      data: {
        key: system.id,
        label: system.label,
        wave: system.wave,
        canonicalCommand: system.canonicalCommand,
        aliases: system.aliases,
        sensitivityDefault: system.sensitivityDefault,
        storagePolicy: system.storagePolicy,
        standards: system.standards,
        status: "active",
        source: { sourceConversationId: clawDenseDataOsRegistry.sourceConversationId, sourcePlanId: clawDenseDataOsRegistry.sourcePlanId },
        metadata: { visiblePack: system.visiblePack, orchestrator: system.orchestrator, sharedEngines: system.sharedEngines, notes: system.notes },
      },
    });

    records.push({
      id: `fixture_domain_pack_${system.id}_core`,
      collectionName: "domain_packs",
      label: `${system.label} core pack`,
      covers: ["domain_pack", "dense_registry", system.id, system.wave],
      data: {
        systemKey: system.id,
        key: `${system.id}.core`,
        label: `${system.label} core pack`,
        description: system.notes,
        collectionNames: system.centers.map((center) => center.collectionName).filter(Boolean),
        commandPatterns: system.commandPatterns,
        fixtures: system.centers.map((center) => center.id),
        status: system.wave === "roadmap" ? "roadmap" : "active",
        metadata: { aliases: system.aliases, standards: system.standards },
      },
    });

    for (const center of system.centers) {
      records.push({
        id: `fixture_domain_role_${system.id}_${center.id}`,
        collectionName: "domain_roles",
        label: center.label,
        covers: ["domain_role", "dense_registry", "identity_profile", system.id, center.id],
        data: {
          key: `${system.id}.${center.id}`,
          label: center.label,
          domainSystemKey: system.id,
          description: center.notes,
          permissions: { sensitivityDefault: system.sensitivityDefault },
          metadata: {
            commandNoun: center.commandNoun,
            commandAliases: center.commandAliases,
            collectionName: center.collectionName,
            profileKind: center.profileKind,
          },
        },
      });

      const profileTarget = center.profileKind ? profileTargets[center.profileKind] : undefined;
      if (profileTarget) {
        records.push({
          id: `fixture_domain_profile_${system.id}_${center.id}`,
          collectionName: "domain_profiles",
          label: `${center.label} profile`,
          covers: ["domain_profile", "typed_profile", "identity_profile", system.id, center.id],
          data: {
            entityKind: profileTarget.entityKind,
            entityId: profileTarget.entityId,
            domainSystemKey: system.id,
            domainRoleKey: `${system.id}.${center.id}`,
            profileKind: center.profileKind,
            status: "active",
            fields: profileTarget.fields,
            evidenceSourceIds: ["fixture_evidence_intake_note"],
            qualityGapIds: [],
            metadata: { generatedFromDenseRegistry: true },
          },
        });
      }
    }

    for (const operation of system.operations) {
      records.push({
        id: `fixture_canonical_operation_${slugFixtureId(system.id, operation.id)}`,
        collectionName: "canonical_operations",
        label: operation.label,
        covers: ["canonical_operation", "dense_registry", system.id],
        data: {
          key: operation.id,
          domainSystemKey: system.id,
          label: operation.label,
          routes: operation.routes,
          createsOrReads: operation.createsOrReads,
          sensitivity: system.sensitivityDefault,
          status: system.wave === "roadmap" ? "external_pending" : "partial",
          metadata: { generatedFromDenseRegistry: true },
        },
      });
    }
  }

  for (const view of listClawDenseDataSemanticViewEntries()) {
    records.push({
      id: `fixture_semantic_view_${slugFixtureId(view.systemId, view.id)}`,
      collectionName: "semantic_views",
      label: view.label,
      covers: ["semantic_view", "dense_registry", view.systemId],
      data: {
        key: view.id,
        domainSystemKey: view.systemId,
        label: view.label,
        commandPattern: view.commandPattern,
        operationKey: view.operationId,
        requiredInputs: view.requiredInputs,
        outputShape: view.outputShape,
        collectionNames: view.requiredInputs,
        status: "active",
        metadata: { generatedFromDenseRegistry: true },
      },
    });
  }

  for (const intent of listClawDenseDataIntentEntries()) {
    records.push({
      id: `fixture_domain_intent_${intent.id}`,
      collectionName: "domain_intents",
      label: intent.phrase,
      covers: ["domain_intent", "intent_coverage", "dense_registry", intent.systemId, intent.status],
      data: {
        key: intent.id,
        domainSystemKey: intent.systemId,
        phrase: intent.phrase,
        status: intent.status,
        mappedCommand: intent.mappedCommand,
        operationKey: intent.operationId,
        collectionName: intent.collectionName,
        reasons: intent.reasons,
        nextSteps: intent.nextSteps,
        metadata: { generatedFromDenseRegistry: true, command: intent.command },
      },
    });
  }

  for (const requirement of clawDenseDataOsRegistry.externalPendingRequirements) {
    records.push({
      id: `fixture_external_pending_${requirement.id}`,
      collectionName: "quality_gaps",
      label: requirement.label,
      covers: ["external_pending", "quality_gap", "dense_registry", requirement.systemId],
      data: {
        label: requirement.label,
        targetCollection: "domain_systems",
        targetId: `fixture_domain_system_${requirement.systemId}`,
        gapKind: "external_pending",
        status: "open",
        severity: "high",
        detail: requirement.reason,
        nextStep: requirement.validationNeeded,
        metadata: { requirementType: requirement.requirementType, requirementId: requirement.id },
      },
    });
  }

  return records;
}

function slugFixtureId(...parts: string[]): string {
  return parts
    .join("_")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
