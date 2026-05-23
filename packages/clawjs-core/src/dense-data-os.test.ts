import { test } from "vitest";
import assert from "node:assert/strict";

import {
  assertClawProfessionalRecordsOsRegistryComplete,
  BUILTIN_COLLECTIONS_BY_NAME,
  clawProfessionalRecordsAcceptanceFixture,
  PRODUCTIVITY_COLLECTION_DEFINITIONS,
  clawProfessionalRecordsIntentStatuses,
  clawProfessionalRecordsOsRegistry,
  findClawProfessionalRecordsSystem,
  listClawProfessionalRecordsGapRegistryEntries,
  listClawProfessionalRecordsIntentEntries,
  listClawProfessionalRecordsSemanticViewEntries,
  listClawProfessionalRecordsSystems,
  resolveClawProfessionalRecordsIntent,
} from "./catalogs.ts";
import { evaluateRegulatedAction } from "./regulated-domain-safety.ts";

test("dense data OS keeps the source conversation and plan as binding metadata", () => {
  assert.equal(clawProfessionalRecordsOsRegistry.schemaVersion, 1);
  assert.equal(clawProfessionalRecordsOsRegistry.sourceConversationId, "source:dense-data");
  assert.equal(clawProfessionalRecordsOsRegistry.sourcePlanId, "plan:dense-data");
  assert.equal(clawProfessionalRecordsOsRegistry.privateGoalReference, "claw-dense-data-os-plan-2026-05-17");
});

test("dense data OS exposes the agreed intent status model", () => {
  assert.deepEqual(clawProfessionalRecordsIntentStatuses, [
    "covered",
    "partial",
    "alias_candidate",
    "data_gap",
    "workflow_gap",
    "external_pending",
    "blocked",
    "custom_pack",
  ]);
});

test("dense data OS records external pending requirements separately from bugs", () => {
  const requirements = clawProfessionalRecordsOsRegistry.externalPendingRequirements;
  assert.ok(requirements.length >= 5);
  for (const [systemId, requirementType] of [
    ["health", "regulated_export"],
    ["labs", "physical_device"],
    ["legal", "regulated_export"],
    ["finance", "regulated_export"],
    ["education", "regulated_export"],
    ["hr", "regulated_export"],
    ["real_estate", "regulated_export"],
    ["insurance", "regulated_export"],
    ["compliance", "regulated_export"],
    ["government", "regulated_export"],
    ["banking", "cost_bearing"],
    ["public_safety", "provider"],
    ["erp", "cost_bearing"],
    ["iot", "physical_device"],
    ["pharma", "regulated_export"],
    ["content", "provider"],
  ]) {
    assert.ok(
      requirements.some((entry) => entry.systemId === systemId && entry.requirementType === requirementType),
      `${systemId}/${requirementType} must stay external_pending`,
    );
  }
  for (const requirement of requirements) {
    assert.equal(requirement.status, "external_pending");
    assert.ok(requirement.reason.length > 0);
    assert.ok(requirement.validationNeeded.length > 0);
  }
});

test("dense data OS keeps legally sensitive domains visible with external gates", () => {
  for (const systemId of ["health", "legal", "finance", "education", "hr", "real_estate", "insurance", "compliance", "government"]) {
    const system = findClawProfessionalRecordsSystem(systemId);
    assert.equal(system?.visiblePack, true, `${systemId} must stay visible`);
    assert.equal(system?.sensitivityDefault, "high", `${systemId} must default to high sensitivity`);
    assert.ok(
      clawProfessionalRecordsOsRegistry.externalPendingRequirements.some(
        (entry) => entry.systemId === systemId && entry.requirementType === "regulated_export" && entry.status === "external_pending",
      ),
      `${systemId} must gate regulated execution/export separately from local data organization`,
    );
  }
});

test("dense data regulated systems are classified through the legal safety policy", () => {
  const expected = new Map([
    ["health", ["health"]],
    ["research", ["labs_research"]],
    ["biology", ["labs_research"]],
    ["labs", ["labs_research"]],
    ["legal", ["legal"]],
    ["erp", ["finance", "billing_payments"]],
    ["finance", ["finance"]],
    ["education", ["education", "minors"]],
    ["hr", ["hr_employment"]],
    ["real_estate", ["housing_real_estate"]],
    ["insurance", ["insurance"]],
    ["maintenance", ["vehicles_transport"]],
    ["compliance", ["compliance_grc"]],
    ["government", ["government_public_services"]],
    ["iot", ["iot_physical_actions"]],
    ["pharma", ["pharma"]],
    ["banking", ["banking", "finance"]],
    ["public_safety", ["government_public_services"]],
  ]);

  for (const [systemId, domains] of expected) {
    const system = findClawProfessionalRecordsSystem(systemId);
    assert.ok(system, `${systemId} must exist`);
    assert.deepEqual(system.regulatedDomains, domains, `${systemId} must expose regulated domains`);
    for (const regulatedDomain of system.regulatedDomains) {
      const decision = evaluateRegulatedAction({
        regulatedDomain,
        decisionEffect: "final_decision",
      });
      assert.equal(decision.allowed, false, `${systemId}/${regulatedDomain} final decisions must be blocked`);
      assert.ok(decision.denialCodes.includes("final_decision_blocked"));
      assert.ok(decision.outputLabels.includes(`regulated_domain:${regulatedDomain}`));
    }
  }
});

test("dense data OS foundation primitives are backed by canonical collections", () => {
  const canonicalCollectionNames = new Set([
    ...BUILTIN_COLLECTIONS_BY_NAME.keys(),
    ...PRODUCTIVITY_COLLECTION_DEFINITIONS.map((collection) => collection.name),
  ]);

  for (const primitive of clawProfessionalRecordsOsRegistry.foundationPrimitives) {
    const collectionName = clawProfessionalRecordsOsRegistry.foundationCollections[primitive];
    assert.ok(collectionName, `${primitive} must map to a canonical foundation collection`);
    assert.ok(canonicalCollectionNames.has(collectionName), `${primitive} maps to missing collection ${collectionName}`);
  }

  assert.equal(clawProfessionalRecordsOsRegistry.foundationCollections.universal_relations, "entity_relations");
  assert.equal(BUILTIN_COLLECTIONS_BY_NAME.get("entity_relations")?.aliases.includes("universal_relations"), true);
});

test("dense data OS generates auditable intent and semantic view entries", () => {
  const intents = listClawProfessionalRecordsIntentEntries();
  const semanticViews = listClawProfessionalRecordsSemanticViewEntries();
  const intentIds = new Set(intents.map((entry) => entry.id));

  assert.equal(intentIds.size, intents.length, "generated dense intent ids must be unique");
  assert.ok(intents.some((entry) => entry.phrase === "claw patient list" && entry.status === "covered" && entry.collectionName === "patients"));
  assert.ok(intents.some((entry) => entry.phrase === "claw encounter list" && entry.status === "covered" && entry.collectionName === "encounters"));
  assert.ok(intents.some((entry) => entry.phrase === "claw health gaps" && entry.status === "covered"));
  assert.ok(intents.some((entry) => entry.phrase === "claw lab-notebook list" && entry.status === "covered" && entry.collectionName === "lab_notebooks"));
  assert.ok(intents.some((entry) => entry.phrase === "claw public-case list" && entry.status === "covered" && entry.collectionName === "public_cases"));
  assert.ok(intents.some((entry) => entry.phrase === "claw product-spec list" && entry.status === "covered" && entry.collectionName === "product_specs"));
  assert.ok(intents.some((entry) => entry.phrase === "claw drug-product list" && entry.status === "covered" && entry.collectionName === "drug_products"));
  assert.ok(intents.some((entry) => entry.phrase === "claw content-entry list" && entry.status === "covered" && entry.collectionName === "content_entries"));
  assert.ok(semanticViews.some((entry) => entry.id === "patient.timeline" && entry.systemId === "health"));
  assert.ok(semanticViews.some((entry) => entry.id === "invoice.list" && entry.systemId === "erp"));
  assert.ok(semanticViews.some((entry) => entry.id === "lab_notebook.timeline" && entry.systemId === "eln"));
  assert.ok(semanticViews.some((entry) => entry.id === "public_case.timeline" && entry.systemId === "government"));
  assert.ok(semanticViews.some((entry) => entry.id === "product_spec.timeline" && entry.systemId === "product"));
  assert.ok(semanticViews.some((entry) => entry.id === "drug_product.timeline" && entry.systemId === "pharma"));
  assert.ok(semanticViews.some((entry) => entry.id === "content_entry.timeline" && entry.systemId === "content"));
});

test("dense data OS derives a gap registry from intents, policies, and external pending rows", () => {
  const gaps = listClawProfessionalRecordsGapRegistryEntries();
  const statuses = new Set(gaps.map((entry) => entry.status));
  const ids = new Set(gaps.map((entry) => entry.id));

  assert.equal(ids.size, gaps.length, "dense gap ids must be unique");
  for (const status of ["partial", "workflow_gap", "data_gap", "external_pending", "blocked"]) {
    assert.ok(statuses.has(status), `gap registry missing ${status}`);
  }

  assert.ok(gaps.some((entry) => entry.source === "intent" && entry.status === "workflow_gap" && entry.phrase === "claw utility-account list"));
  assert.ok(gaps.some((entry) => entry.source === "external_pending" && entry.status === "external_pending" && entry.requirementId === "external_pending_health_ehr_export"));
  assert.ok(gaps.some((entry) => entry.source === "policy" && entry.status === "data_gap" && entry.id === "dense_gap_unknown_intent"));
  assert.ok(gaps.some((entry) => entry.source === "policy" && entry.status === "blocked" && entry.command === "purge"));
  for (const gap of gaps) {
    assert.ok(gap.reason.length > 0, `${gap.id} must include a reason`);
    assert.ok(gap.nextStep.length > 0, `${gap.id} must include a next step`);
  }
});

test("dense data OS acceptance fixture covers required first-wave records and gaps", () => {
  const canonicalCollectionNames = new Set([
    ...BUILTIN_COLLECTIONS_BY_NAME.keys(),
    ...PRODUCTIVITY_COLLECTION_DEFINITIONS.map((collection) => collection.name),
  ]);
  const records = clawProfessionalRecordsAcceptanceFixture.records;
  const ids = new Set(records.map((record) => record.id));
  const covered = new Set(records.flatMap((record) => record.covers));

  assert.equal(clawProfessionalRecordsAcceptanceFixture.sourceConversationId, "source:dense-data");
  assert.equal(ids.size, records.length, "fixture ids must be unique");
  for (const record of records) {
    assert.ok(canonicalCollectionNames.has(record.collectionName), `${record.collectionName} must be canonical`);
  }
  for (const requiredCoverage of [
    "person",
    "shared_identity",
    "identity_base",
    "no_duplicate_identity",
    "patient_person_link",
    "participant_person_link",
    "legal_client_person_link",
    "learner_person_link",
    "employee_person_link",
    "patient",
    "encounter",
    "lab_result",
    "study",
    "sample",
    "legal_case",
    "legal_client",
    "employee",
    "time_off",
    "performance_review",
    "property",
    "property_visit",
    "property_offer",
    "property_inspection",
    "insurance_policy",
    "vehicle",
    "vehicle_insurance_policy",
    "vehicle_maintenance",
    "appliance",
    "appliance_maintenance",
    "supplier",
    "purchase_order",
    "purchase_order_line_item",
    "warehouse",
    "inventory_item",
    "stock_movement",
    "supply_plan",
    "supply_plan_item",
    "supply_risk",
    "carrier",
    "shipment",
    "shipment_leg",
    "freight_rate",
    "compliance_obligation",
    "control",
    "control_assessment",
    "compliance_finding",
    "agency",
    "public_case",
    "permit",
    "public_filing",
    "product_spec",
    "product_revision",
    "product_requirement",
    "product_bom",
    "drug_product",
    "batch_record",
    "lot_release",
    "adverse_event",
    "content_brand",
    "content_destination",
    "content_campaign",
    "content_entry",
    "content_revision",
    "content_variant",
    "content_approval",
    "content_publication",
    "thing",
    "iot_device",
    "sensor_reading",
    "device_command",
    "construction_project",
    "construction_site",
    "construction_rfi",
    "construction_change_order",
    "lab_notebook",
    "notebook_entry",
    "protocol_run",
    "experiment_observation",
    "invoice",
    "invoice_company",
    "incident",
    "service",
    "course",
    "work_order",
    "evidence",
    "provenance",
    "partial_data_gap",
    "domain_system",
    "domain_pack",
    "domain_role",
    "domain_profile",
    "canonical_operation",
    "semantic_view",
    "domain_intent",
    "intent_coverage",
    "external_pending",
  ]) {
    assert.ok(covered.has(requiredCoverage), `fixture missing coverage ${requiredCoverage}`);
  }

  assert.ok(records.some((record) => record.id === "fixture_domain_system_health" && record.collectionName === "domain_systems"));
  assert.ok(records.some((record) => record.id === "fixture_domain_role_health_patient" && record.collectionName === "domain_roles"));
  assert.ok(records.some((record) => record.id === "fixture_domain_profile_health_patient" && record.collectionName === "domain_profiles"));
  assert.ok(records.some((record) => record.id === "fixture_domain_profile_legal_legal_client" && record.collectionName === "domain_profiles"));
  assert.ok(records.some((record) => record.id === "fixture_domain_profile_hr_employee" && record.collectionName === "domain_profiles"));
  assert.ok(records.some((record) => record.id === "fixture_relation_person_patient" && record.collectionName === "entity_relations"));
  assert.ok(records.some((record) => record.id === "fixture_relation_person_learner" && record.collectionName === "entity_relations"));
  assert.ok(records.some((record) => record.id === "fixture_relation_person_employee" && record.collectionName === "entity_relations"));
  assert.ok(records.some((record) => record.id === "fixture_semantic_view_health_patient_timeline" && record.collectionName === "semantic_views"));
  assert.ok(records.some((record) => record.collectionName === "domain_intents" && record.covers.includes("intent_coverage")));
  assert.ok(records.some((record) => record.collectionName === "quality_gaps" && record.covers.includes("external_pending")));
});

test("dense data OS first wave covers the agreed high-density systems", () => {
  assert.deepEqual(listClawProfessionalRecordsSystems({ wave: "first_wave" }).map((system) => system.id), [
    "health",
    "research",
    "biology",
    "labs",
    "legal",
    "erp",
    "crm",
    "finance",
    "education",
    "hr",
    "manufacturing",
    "ops",
    "real_estate",
    "insurance",
    "maintenance",
    "procurement",
    "warehouse",
    "supply_chain",
    "transport",
    "compliance",
    "government",
    "construction",
    "iot",
    "eln",
    "content",
    "product",
    "pharma",
  ]);

  for (const system of listClawProfessionalRecordsSystems({ wave: "first_wave" })) {
    assert.equal(system.visiblePack, true);
    assert.equal(system.orchestrator, true);
    assert.equal(system.storagePolicy, "core_sqlite");
    assert.ok(system.centers.length >= 2);
    assert.ok(system.operations.length > 0);
    assert.ok(system.semanticViews.length > 0);
  }
});

test("dense data OS keeps common names and professional acronyms as first-class routes", () => {
  assert.equal(findClawProfessionalRecordsSystem("ehr")?.id, "health");
  assert.equal(findClawProfessionalRecordsSystem("ctms")?.id, "research");
  assert.equal(findClawProfessionalRecordsSystem("lims")?.id, "labs");
  assert.equal(findClawProfessionalRecordsSystem("accounting")?.id, "finance");
  assert.equal(findClawProfessionalRecordsSystem("lms")?.id, "education");
  assert.equal(findClawProfessionalRecordsSystem("hris")?.id, "hr");
  assert.equal(findClawProfessionalRecordsSystem("mes")?.id, "manufacturing");
  assert.equal(findClawProfessionalRecordsSystem("itsm")?.id, "ops");
  assert.equal(findClawProfessionalRecordsSystem("proptech")?.id, "real_estate");
  assert.equal(findClawProfessionalRecordsSystem("gov")?.id, "government");
  assert.equal(findClawProfessionalRecordsSystem("purchasing")?.id, "procurement");
  assert.equal(findClawProfessionalRecordsSystem("wms")?.id, "warehouse");
  assert.equal(findClawProfessionalRecordsSystem("tms")?.id, "transport");
  assert.equal(findClawProfessionalRecordsSystem("freight")?.id, "transport");
  assert.equal(findClawProfessionalRecordsSystem("scm")?.id, "supply_chain");
  assert.equal(findClawProfessionalRecordsSystem("grc")?.id, "compliance");
  assert.equal(findClawProfessionalRecordsSystem("gov")?.id, "government");
  assert.equal(findClawProfessionalRecordsSystem("eln")?.id, "eln");
  assert.equal(findClawProfessionalRecordsSystem("pim")?.id, "product");
  assert.equal(findClawProfessionalRecordsSystem("plm")?.id, "product");
  assert.equal(findClawProfessionalRecordsSystem("gxp")?.id, "pharma");
});

test("dense data OS centers have direct human CLI nouns and plural aliases", () => {
  for (const system of clawProfessionalRecordsOsRegistry.systems) {
    for (const center of system.centers) {
      assert.match(center.commandNoun, /^[a-z][a-z0-9-]*$/);
      assert.ok(center.commandAliases.length > 0, `${system.id}.${center.id} must expose a plural/top-level alias`);
      assert.ok(!center.commandAliases.includes(center.commandNoun), `${system.id}.${center.id} aliases must not duplicate the canonical noun`);
    }
  }

  const health = findClawProfessionalRecordsSystem("health");
  assert.ok(health?.centers.some((center) => center.commandNoun === "patient" && center.commandAliases.includes("patients") && center.collectionName === "patients"));
  assert.ok(health?.centers.some((center) => center.commandNoun === "encounter" && center.commandAliases.includes("encounters") && center.collectionName === "encounters"));
  assert.ok(health?.commandPatterns.includes("claw patient list|get|create|update|delete|query|schema"));

  const labs = findClawProfessionalRecordsSystem("labs");
  assert.ok(labs?.centers.some((center) => center.commandNoun === "assay" && center.commandAliases.includes("assays") && !center.commandAliases.includes("assaies") && center.collectionName === "assays"));

  const eln = findClawProfessionalRecordsSystem("eln");
  assert.ok(eln?.centers.some((center) => center.commandNoun === "lab-notebook" && center.commandAliases.includes("lab-notebooks") && center.collectionName === "lab_notebooks"));
  assert.ok(eln?.centers.some((center) => center.commandNoun === "notebook-entry" && center.commandAliases.includes("notebook-entries") && center.collectionName === "notebook_entries"));
  assert.ok(eln?.centers.some((center) => center.commandNoun === "protocol-run" && center.commandAliases.includes("protocol-runs") && center.collectionName === "protocol_runs"));
  assert.ok(eln?.centers.some((center) => center.commandNoun === "experiment-observation" && center.commandAliases.includes("experiment-observations") && center.collectionName === "experiment_observations"));
  assert.ok(eln?.commandPatterns.includes("claw lab-notebook <id> timeline"));

  const erp = findClawProfessionalRecordsSystem("erp");
  assert.ok(erp?.centers.some((center) => center.commandNoun === "invoice" && center.commandAliases.includes("invoices") && center.collectionName === "invoices"));
  assert.ok(erp?.commandPatterns.includes("claw invoice list|get|create|update|delete|query|schema"));

  const legal = findClawProfessionalRecordsSystem("legal");
  assert.ok(legal?.centers.some((center) => center.commandNoun === "legal-client" && center.commandAliases.includes("legal-clients") && center.collectionName === "legal_clients"));
  assert.ok(legal?.commandPatterns.includes("claw legal-client list|get|create|update|delete|query|schema"));

  const hr = findClawProfessionalRecordsSystem("hr");
  assert.ok(hr?.centers.some((center) => center.commandNoun === "employee" && center.collectionName === "employees"));
  assert.ok(hr?.centers.some((center) => center.commandNoun === "time-off" && center.commandAliases.includes("pto") && center.collectionName === "time_off_requests"));
  assert.ok(hr?.commandPatterns.includes("claw employee <id> timeline"));

  const realEstate = findClawProfessionalRecordsSystem("real-estate");
  assert.ok(realEstate?.centers.some((center) => center.commandNoun === "property" && center.commandAliases.includes("properties") && center.collectionName === "property_listings"));
  assert.ok(realEstate?.centers.some((center) => center.commandNoun === "property-offer" && center.collectionName === "property_offers"));
  assert.ok(realEstate?.commandPatterns.includes("claw property <id> timeline"));

  const insurance = findClawProfessionalRecordsSystem("insurance");
  assert.ok(insurance?.centers.some((center) => center.commandNoun === "insurance-policy" && center.commandAliases.includes("insurance-policies") && center.collectionName === "insurance_policies"));
  assert.ok(insurance?.centers.some((center) => center.commandNoun === "vehicle-insurance-policy" && center.collectionName === "vehicle_insurance_policies"));
  assert.ok(insurance?.commandPatterns.includes("claw insurance-policy <id> timeline"));

  const maintenance = findClawProfessionalRecordsSystem("maintenance");
  assert.ok(maintenance?.centers.some((center) => center.commandNoun === "vehicle" && center.commandAliases.includes("vehicles") && center.collectionName === "vehicles"));
  assert.ok(maintenance?.centers.some((center) => center.commandNoun === "vehicle-maintenance" && center.collectionName === "vehicle_maintenance"));
  assert.ok(maintenance?.commandPatterns.includes("claw vehicle <id> timeline"));

  const procurement = findClawProfessionalRecordsSystem("procurement");
  assert.ok(procurement?.centers.some((center) => center.commandNoun === "supplier" && center.commandAliases.includes("suppliers") && center.collectionName === "suppliers"));
  assert.ok(procurement?.centers.some((center) => center.commandNoun === "purchase-order" && center.commandAliases.includes("po") && center.collectionName === "purchase_orders"));
  assert.ok(procurement?.centers.some((center) => center.commandNoun === "purchase-order-line-item" && center.collectionName === "purchase_order_line_items"));
  assert.ok(procurement?.commandPatterns.includes("claw purchase-order <id> timeline"));

  const warehouse = findClawProfessionalRecordsSystem("warehouse");
  assert.ok(warehouse?.centers.some((center) => center.commandNoun === "warehouse" && center.commandAliases.includes("warehouses") && center.collectionName === "warehouses"));
  assert.ok(warehouse?.centers.some((center) => center.commandNoun === "inventory-item" && center.commandAliases.includes("stock-items") && center.collectionName === "inventory_items"));
  assert.ok(warehouse?.centers.some((center) => center.commandNoun === "stock-movement" && center.collectionName === "stock_movements"));
  assert.ok(warehouse?.commandPatterns.includes("claw warehouse <id> timeline"));

  const supplyChain = findClawProfessionalRecordsSystem("supply-chain");
  assert.ok(supplyChain?.centers.some((center) => center.commandNoun === "supply-plan" && center.commandAliases.includes("supply-plans") && center.collectionName === "supply_plans"));
  assert.ok(supplyChain?.centers.some((center) => center.commandNoun === "supply-plan-item" && center.collectionName === "supply_plan_items"));
  assert.ok(supplyChain?.centers.some((center) => center.commandNoun === "supply-risk" && center.commandAliases.includes("supplier-risks") && center.collectionName === "supply_risks"));
  assert.ok(supplyChain?.commandPatterns.includes("claw supply-plan <id> timeline"));

  const transport = findClawProfessionalRecordsSystem("transport");
  assert.equal(transport?.canonicalCommand, "tms");
  assert.ok(transport?.centers.some((center) => center.commandNoun === "carrier" && center.commandAliases.includes("carriers") && center.collectionName === "carriers"));
  assert.ok(transport?.centers.some((center) => center.commandNoun === "shipment" && center.commandAliases.includes("shipments") && center.collectionName === "shipments"));
  assert.ok(transport?.centers.some((center) => center.commandNoun === "shipment-leg" && center.collectionName === "shipment_legs"));
  assert.ok(transport?.centers.some((center) => center.commandNoun === "freight-rate" && center.commandAliases.includes("freight-rates") && center.collectionName === "freight_rates"));
  assert.ok(transport?.commandPatterns.includes("claw shipment <id> timeline"));

  const compliance = findClawProfessionalRecordsSystem("compliance");
  assert.ok(compliance?.centers.some((center) => center.commandNoun === "control" && center.commandAliases.includes("controls") && center.collectionName === "compliance_controls"));
  assert.ok(compliance?.centers.some((center) => center.commandNoun === "obligation" && center.commandAliases.includes("requirements") && center.collectionName === "compliance_obligations"));
  assert.ok(compliance?.centers.some((center) => center.commandNoun === "control-assessment" && center.collectionName === "control_assessments"));
  assert.ok(compliance?.centers.some((center) => center.commandNoun === "compliance-finding" && center.commandAliases.includes("findings") && center.collectionName === "compliance_findings"));
  assert.ok(compliance?.commandPatterns.includes("claw control <id> timeline"));

  const government = findClawProfessionalRecordsSystem("government");
  assert.ok(government?.centers.some((center) => center.commandNoun === "agency" && center.commandAliases.includes("agencies") && center.collectionName === "agencies"));
  assert.ok(government?.centers.some((center) => center.commandNoun === "public-case" && center.commandAliases.includes("public-cases") && center.collectionName === "public_cases"));
  assert.ok(government?.centers.some((center) => center.commandNoun === "permit" && center.commandAliases.includes("permits") && center.collectionName === "permits"));
  assert.ok(government?.centers.some((center) => center.commandNoun === "public-filing" && center.commandAliases.includes("public-filings") && center.collectionName === "public_filings"));
  assert.ok(government?.commandPatterns.includes("claw public-case <id> timeline"));
  assert.equal(government?.centers.some((center) => center.commandNoun === "case"), false);

  const product = findClawProfessionalRecordsSystem("product");
  assert.equal(product?.canonicalCommand, "pim");
  assert.ok(product?.centers.some((center) => center.commandNoun === "product-spec" && center.commandAliases.includes("product-specs") && center.collectionName === "product_specs"));
  assert.ok(product?.centers.some((center) => center.commandNoun === "product-revision" && center.commandAliases.includes("product-revisions") && center.collectionName === "product_revisions"));
  assert.ok(product?.centers.some((center) => center.commandNoun === "product-requirement" && center.commandAliases.includes("product-requirements") && center.collectionName === "product_requirements"));
  assert.ok(product?.centers.some((center) => center.commandNoun === "product-bom" && center.commandAliases.includes("product-boms") && center.collectionName === "product_boms"));
  assert.ok(product?.commandPatterns.includes("claw product-spec <id> timeline"));
  assert.equal(product?.centers.some((center) => center.commandNoun === "product"), false);

  const pharma = findClawProfessionalRecordsSystem("pharma");
  assert.ok(pharma?.centers.some((center) => center.commandNoun === "drug-product" && center.commandAliases.includes("drug-products") && center.collectionName === "drug_products"));
  assert.ok(pharma?.centers.some((center) => center.commandNoun === "batch-record" && center.commandAliases.includes("batch-records") && center.collectionName === "batch_records"));
  assert.ok(pharma?.centers.some((center) => center.commandNoun === "lot-release" && center.commandAliases.includes("lot-releases") && center.collectionName === "lot_releases"));
  assert.ok(pharma?.centers.some((center) => center.commandNoun === "adverse-event" && center.commandAliases.includes("adverse-events") && center.collectionName === "adverse_events"));
  assert.ok(pharma?.commandPatterns.includes("claw drug-product <id> timeline"));
  assert.equal(pharma?.centers.some((center) => center.commandNoun === "product"), false);

  const content = findClawProfessionalRecordsSystem("content");
  assert.equal(content?.canonicalCommand, "content");
  assert.ok(content?.centers.some((center) => center.commandNoun === "content-entry" && center.commandAliases.includes("content-entries") && center.collectionName === "content_entries"));
  assert.ok(content?.centers.some((center) => center.commandNoun === "content-campaign" && center.commandAliases.includes("content-campaigns") && center.collectionName === "content_campaigns"));
  assert.ok(content?.centers.some((center) => center.commandNoun === "content-publication" && center.commandAliases.includes("content-publications") && center.collectionName === "content_publications"));
  assert.ok(content?.commandPatterns.includes("claw content-entry <id> timeline"));
  assert.equal(content?.centers.some((center) => center.commandNoun === "campaign"), false);

  const iot = findClawProfessionalRecordsSystem("iot");
  assert.ok(iot?.centers.some((center) => center.commandNoun === "thing" && center.commandAliases.includes("things") && center.collectionName === "iot_things"));
  assert.ok(iot?.centers.some((center) => center.commandNoun === "iot-device" && center.commandAliases.includes("devices") && center.collectionName === "iot_devices"));
  assert.ok(iot?.centers.some((center) => center.commandNoun === "sensor-reading" && center.commandAliases.includes("readings") && center.collectionName === "sensor_readings"));
  assert.ok(iot?.centers.some((center) => center.commandNoun === "device-command" && center.commandAliases.includes("iot-commands") && center.collectionName === "device_commands"));
  assert.ok(iot?.commandPatterns.includes("claw thing <id> timeline"));

  const construction = findClawProfessionalRecordsSystem("construction");
  assert.ok(construction?.centers.some((center) => center.commandNoun === "construction-project" && center.commandAliases.includes("construction-projects") && center.collectionName === "construction_projects"));
  assert.ok(construction?.centers.some((center) => center.commandNoun === "construction-site" && center.commandAliases.includes("job-sites") && center.collectionName === "construction_sites"));
  assert.ok(construction?.centers.some((center) => center.commandNoun === "construction-rfi" && center.commandAliases.includes("rfis") && center.collectionName === "construction_rfis"));
  assert.ok(construction?.centers.some((center) => center.commandNoun === "construction-change-order" && center.commandAliases.includes("change-orders") && center.collectionName === "construction_change_orders"));
  assert.ok(construction?.commandPatterns.includes("claw construction-project <id> timeline"));
});

test("dense data OS models patient medication routes without forcing a health prefix", () => {
  const health = findClawProfessionalRecordsSystem("health");
  assert.ok(health);

  const medication = health.operations.find((operation) => operation.id === "patient.medication.add");
  assert.ok(medication);
  assert.deepEqual(medication.routes, ["claw patient <id> medication add", "claw medication add --patient <id>"]);
  const encounter = health.operations.find((operation) => operation.id === "patient.encounter.add");
  assert.ok(encounter);
  assert.deepEqual(encounter.routes, ["claw patient <id> encounter add", "claw encounter add --patient <id>"]);
  assert.ok(health.commandPatterns.includes("claw patient <id> encounters list|add"));
  assert.ok(health.commandPatterns.includes("claw patient <id> medications list|add"));
  assert.ok(health.commandPatterns.includes("claw medication add --patient <id>"));
});

test("dense data OS resolves alternate operation routes to the same canonical operation", () => {
  let multiRouteOperations = 0;
  for (const system of clawProfessionalRecordsOsRegistry.systems) {
    for (const operation of system.operations) {
      if (operation.routes.length < 2) continue;
      multiRouteOperations += 1;
      for (const route of operation.routes) {
        const phrase = route.replace(/<[^>]+>/g, "fixture_id");
        const resolution = resolveClawProfessionalRecordsIntent(phrase);
        assert.equal(resolution.system?.id, system.id, `${phrase} must resolve to ${system.id}`);
        assert.equal(resolution.operation?.id, operation.id, `${phrase} must resolve to ${operation.id}`);
      }
    }
  }
  assert.ok(multiRouteOperations >= 20, "dense registry must prove alternate-route convergence across many operations");
});

test("dense data OS resolves direct CLI intent phrases without executing them", () => {
  const patientList = resolveClawProfessionalRecordsIntent("claw patient list");
  assert.equal(patientList.execute, false);
  assert.equal(patientList.status, "covered");
  assert.equal(patientList.system?.id, "health");
  assert.equal(patientList.center?.commandNoun, "patient");

  const patientsList = resolveClawProfessionalRecordsIntent("patients list");
  assert.equal(patientsList.status, "covered");
  assert.equal(patientsList.center?.commandNoun, "patient");

  const assaysList = resolveClawProfessionalRecordsIntent("assays list");
  assert.equal(assaysList.status, "covered");
  assert.equal(assaysList.center?.commandNoun, "assay");

  const productList = resolveClawProfessionalRecordsIntent("claw product list");
  assert.equal(productList.status, "covered");
  assert.equal(productList.system?.id, "erp");
  assert.equal(productList.center?.commandNoun, "product");
  assert.equal(productList.center?.collectionName, "products_catalog");

  const pimOverview = resolveClawProfessionalRecordsIntent("claw pim overview");
  assert.equal(pimOverview.status, "covered");
  assert.equal(pimOverview.system?.id, "product");
  assert.equal(pimOverview.center, undefined);

  const productOverview = resolveClawProfessionalRecordsIntent("claw product overview");
  assert.equal(productOverview.status, "workflow_gap");
  assert.equal(productOverview.system?.id, "erp");
  assert.equal(productOverview.center?.collectionName, "products_catalog");

  const encounterList = resolveClawProfessionalRecordsIntent("claw encounter list");
  assert.equal(encounterList.status, "covered");
  assert.equal(encounterList.system?.id, "health");
  assert.equal(encounterList.center?.collectionName, "encounters");

  const invoiceList = resolveClawProfessionalRecordsIntent("claw invoice list");
  assert.equal(invoiceList.status, "covered");
  assert.equal(invoiceList.system?.id, "erp");
  assert.equal(invoiceList.operation?.id, "invoice.list");

  const legalClientList = resolveClawProfessionalRecordsIntent("claw legal-client list");
  assert.equal(legalClientList.status, "covered");
  assert.equal(legalClientList.system?.id, "legal");
  assert.equal(legalClientList.center?.collectionName, "legal_clients");

  const employeeList = resolveClawProfessionalRecordsIntent("claw employee list");
  assert.equal(employeeList.status, "covered");
  assert.equal(employeeList.system?.id, "hr");
  assert.equal(employeeList.center?.collectionName, "employees");

  const propertyList = resolveClawProfessionalRecordsIntent("claw property list");
  assert.equal(propertyList.status, "covered");
  assert.equal(propertyList.system?.id, "real_estate");
  assert.equal(propertyList.center?.collectionName, "property_listings");

  const insurancePolicyList = resolveClawProfessionalRecordsIntent("claw insurance-policy list");
  assert.equal(insurancePolicyList.status, "covered");
  assert.equal(insurancePolicyList.system?.id, "insurance");
  assert.equal(insurancePolicyList.center?.collectionName, "insurance_policies");

  const vehicleList = resolveClawProfessionalRecordsIntent("claw vehicle list");
  assert.equal(vehicleList.status, "covered");
  assert.equal(vehicleList.system?.id, "maintenance");
  assert.equal(vehicleList.center?.collectionName, "vehicles");

  const purchaseOrderList = resolveClawProfessionalRecordsIntent("claw purchase-order list");
  assert.equal(purchaseOrderList.status, "covered");
  assert.equal(purchaseOrderList.system?.id, "procurement");
  assert.equal(purchaseOrderList.center?.collectionName, "purchase_orders");

  const warehouseList = resolveClawProfessionalRecordsIntent("claw warehouse list");
  assert.equal(warehouseList.status, "covered");
  assert.equal(warehouseList.system?.id, "warehouse");
  assert.equal(warehouseList.center?.collectionName, "warehouses");

  const supplyPlanList = resolveClawProfessionalRecordsIntent("claw supply-plan list");
  assert.equal(supplyPlanList.status, "covered");
  assert.equal(supplyPlanList.system?.id, "supply_chain");
  assert.equal(supplyPlanList.center?.collectionName, "supply_plans");

  const controlList = resolveClawProfessionalRecordsIntent("claw control list");
  assert.equal(controlList.status, "covered");
  assert.equal(controlList.system?.id, "compliance");
  assert.equal(controlList.center?.collectionName, "compliance_controls");

  const thingList = resolveClawProfessionalRecordsIntent("claw thing list");
  assert.equal(thingList.status, "covered");
  assert.equal(thingList.system?.id, "iot");
  assert.equal(thingList.center?.collectionName, "iot_things");

  const constructionProjectList = resolveClawProfessionalRecordsIntent("claw construction-project list");
  assert.equal(constructionProjectList.status, "covered");
  assert.equal(constructionProjectList.system?.id, "construction");
  assert.equal(constructionProjectList.center?.collectionName, "construction_projects");

  const publicCaseList = resolveClawProfessionalRecordsIntent("claw public-case list");
  assert.equal(publicCaseList.status, "covered");
  assert.equal(publicCaseList.system?.id, "government");
  assert.equal(publicCaseList.center?.collectionName, "public_cases");

  const govOverview = resolveClawProfessionalRecordsIntent("claw gov overview");
  assert.equal(govOverview.status, "covered");
  assert.equal(govOverview.system?.id, "government");

  const productSpecList = resolveClawProfessionalRecordsIntent("claw product-spec list");
  assert.equal(productSpecList.status, "covered");
  assert.equal(productSpecList.system?.id, "product");
  assert.equal(productSpecList.center?.collectionName, "product_specs");

  const drugProductList = resolveClawProfessionalRecordsIntent("claw drug-product list");
  assert.equal(drugProductList.status, "covered");
  assert.equal(drugProductList.system?.id, "pharma");
  assert.equal(drugProductList.center?.collectionName, "drug_products");

  const pharmaOverview = resolveClawProfessionalRecordsIntent("claw pharma overview");
  assert.equal(pharmaOverview.status, "covered");
  assert.equal(pharmaOverview.system?.id, "pharma");

  const contentEntryList = resolveClawProfessionalRecordsIntent("claw content-entry list");
  assert.equal(contentEntryList.status, "covered");
  assert.equal(contentEntryList.system?.id, "content");
  assert.equal(contentEntryList.center?.collectionName, "content_entries");

  const contentOverview = resolveClawProfessionalRecordsIntent("claw cms overview");
  assert.equal(contentOverview.status, "covered");
  assert.equal(contentOverview.system?.id, "content");

  const shipmentList = resolveClawProfessionalRecordsIntent("claw shipment list");
  assert.equal(shipmentList.status, "covered");
  assert.equal(shipmentList.system?.id, "transport");
  assert.equal(shipmentList.center?.collectionName, "shipments");

  const tmsOverview = resolveClawProfessionalRecordsIntent("claw tms overview");
  assert.equal(tmsOverview.status, "covered");
  assert.equal(tmsOverview.system?.id, "transport");

  const travelTransportList = resolveClawProfessionalRecordsIntent("claw transport list");
  assert.notEqual(travelTransportList.system?.id, "transport");

  const labNotebookList = resolveClawProfessionalRecordsIntent("claw lab-notebook list");
  assert.equal(labNotebookList.status, "covered");
  assert.equal(labNotebookList.system?.id, "eln");
  assert.equal(labNotebookList.center?.collectionName, "lab_notebooks");

  const medicationAdd = resolveClawProfessionalRecordsIntent("claw medication add --patient p_123");
  assert.equal(medicationAdd.status, "partial");
  assert.equal(medicationAdd.system?.id, "health");
  assert.equal(medicationAdd.operation?.id, "patient.medication.add");

  const unsupported = resolveClawProfessionalRecordsIntent("claw unknown-specialist-thing list");
  assert.equal(unsupported.status, "data_gap");
});

test("dense data OS keeps ERP as an orchestrator over shared collections, not a supercollection", () => {
  const erp = findClawProfessionalRecordsSystem("erp");
  assert.ok(erp);
  assert.equal(erp.orchestrator, true);
  assert.ok(erp.notes.includes("not a supercollection"));
  assert.ok(erp.sharedEngines.includes("finance_accounting"));
});

test("dense data OS records existing catalog integration choices as registry data", () => {
  const integrations = clawProfessionalRecordsOsRegistry.existingSurfaceIntegrations;
  const ids = new Set(integrations.map((entry) => entry.id));
  const requiredIds = [
    "notes_pages_record_notes",
    "knowledge_entities_facts",
    "knowledge_graph_relations",
    "associations_custom_fields",
    "signals_observations",
    "attachments_files_documents_imports",
    "crm_collections",
    "billing_finance_collections",
    "erp_orchestrator",
    "infra_observability_monitor_ops",
    "identity_actors_roles_teams",
  ];

  assert.equal(ids.size, integrations.length, "existing surface integration ids must be unique");
  for (const id of requiredIds) assert.ok(ids.has(id), `missing existing surface integration ${id}`);

  for (const entry of integrations) {
    assert.ok(entry.canonicalOwner.length > 0, `${entry.id} must declare a canonical owner`);
    assert.ok(entry.followUpGate.length > 0, `${entry.id} must declare a follow-up gate`);
    assert.ok(entry.sharedPrimitives.length > 0, `${entry.id} must declare shared primitives`);
    for (const primitive of entry.sharedPrimitives) {
      assert.ok(clawProfessionalRecordsOsRegistry.foundationPrimitives.includes(primitive), `${entry.id} references unknown primitive ${primitive}`);
    }
    for (const systemId of entry.denseSystems) assert.ok(findClawProfessionalRecordsSystem(systemId), `${entry.id} references missing system ${systemId}`);
  }

  assert.equal(integrations.find((entry) => entry.id === "knowledge_graph_relations")?.canonicalOwner.includes("entity_relations"), true);
  assert.equal(integrations.find((entry) => entry.id === "erp_orchestrator")?.disposition, "extend");
  assert.equal(integrations.find((entry) => entry.id === "infra_observability_monitor_ops")?.disposition, "split");
});

test("dense data OS graduated centers point at canonical built-in collections without duplicate systems", () => {
  const canonicalCollectionNames = new Set([
    ...BUILTIN_COLLECTIONS_BY_NAME.keys(),
    ...PRODUCTIVITY_COLLECTION_DEFINITIONS.map((collection) => collection.name),
  ]);
  const expectedCollections: Record<string, string> = {
    "health.patient": "patients",
    "health.encounter": "encounters",
    "health.medication": "medications",
    "health.symptom": "symptom_logs",
    "health.lab_result": "lab_results",
    "research.study": "studies",
    "research.participant": "participants",
    "biology.organism": "organisms",
    "biology.experiment": "biology_experiments",
    "labs.sample": "samples",
    "labs.assay": "assays",
    "legal.case": "legal_cases",
    "legal.legal_client": "legal_clients",
    "hr.employee": "employees",
    "hr.time_off": "time_off_requests",
    "hr.performance_review": "performance_reviews",
    "hr.payroll": "payroll_runs",
    "real_estate.property": "property_listings",
    "real_estate.property_visit": "property_visits",
    "real_estate.property_offer": "property_offers",
    "real_estate.property_inspection": "property_inspections",
    "insurance.insurance_policy": "insurance_policies",
    "insurance.vehicle_insurance_policy": "vehicle_insurance_policies",
    "maintenance.vehicle": "vehicles",
    "maintenance.vehicle_maintenance": "vehicle_maintenance",
    "maintenance.appliance": "appliances",
    "maintenance.appliance_maintenance": "appliance_maintenance",
    "procurement.supplier": "suppliers",
    "procurement.purchase_order": "purchase_orders",
    "procurement.purchase_order_line_item": "purchase_order_line_items",
    "warehouse.warehouse": "warehouses",
    "warehouse.inventory_item": "inventory_items",
    "warehouse.stock_movement": "stock_movements",
    "supply_chain.supply_plan": "supply_plans",
    "supply_chain.supply_plan_item": "supply_plan_items",
    "supply_chain.supply_risk": "supply_risks",
    "transport.carrier": "carriers",
    "transport.shipment": "shipments",
    "transport.shipment_leg": "shipment_legs",
    "transport.freight_rate": "freight_rates",
    "compliance.control": "compliance_controls",
    "compliance.obligation": "compliance_obligations",
    "compliance.control_assessment": "control_assessments",
    "compliance.compliance_finding": "compliance_findings",
    "government.agency": "agencies",
    "government.public_case": "public_cases",
    "government.permit": "permits",
    "government.public_filing": "public_filings",
    "product.product_spec": "product_specs",
    "product.product_revision": "product_revisions",
    "product.product_requirement": "product_requirements",
    "product.product_bom": "product_boms",
    "pharma.drug_product": "drug_products",
    "pharma.batch_record": "batch_records",
    "pharma.lot_release": "lot_releases",
    "pharma.adverse_event": "adverse_events",
    "content.content_brand": "content_brands",
    "content.content_destination": "content_destinations",
    "content.content_campaign": "content_campaigns",
    "content.content_entry": "content_entries",
    "content.content_revision": "content_revisions",
    "content.content_variant": "content_variants",
    "content.content_approval": "content_approvals",
    "content.content_publication": "content_publications",
    "iot.thing": "iot_things",
    "iot.iot_device": "iot_devices",
    "iot.sensor_reading": "sensor_readings",
    "iot.device_command": "device_commands",
    "construction.construction_project": "construction_projects",
    "construction.construction_site": "construction_sites",
    "construction.construction_rfi": "construction_rfis",
    "construction.construction_change_order": "construction_change_orders",
    "eln.lab_notebook": "lab_notebooks",
    "eln.notebook_entry": "notebook_entries",
    "eln.protocol_run": "protocol_runs",
    "eln.experiment_observation": "experiment_observations",
    "erp.company": "companies",
    "erp.product": "products_catalog",
    "erp.invoice": "invoices",
    "erp.payment": "payment_intents",
    "crm.account": "accounts",
    "crm.deal": "deals",
    "finance.accounting_entity": "financial_accounts",
    "finance.transaction": "transactions",
    "education.learner": "learners",
    "education.course": "courses",
    "manufacturing.work_order": "work_orders",
    "ops.service": "services",
    "ops.incident": "incidents",
  };

  for (const [key, collectionName] of Object.entries(expectedCollections)) {
    const [systemId, centerId] = key.split(".");
    const center = findClawProfessionalRecordsSystem(systemId)?.centers.find((entry) => entry.id === centerId);
    assert.equal(center?.collectionName, collectionName, `${key} must point at ${collectionName}`);
    assert.ok(canonicalCollectionNames.has(collectionName), `${collectionName} must be a canonical collection`);
  }

  const analyticsExperiment = BUILTIN_COLLECTIONS_BY_NAME.get("experiments");
  assert.equal(analyticsExperiment?.family, "analytics");
  assert.equal(findClawProfessionalRecordsSystem("biology")?.centers.find((entry) => entry.id === "experiment")?.collectionName, "biology_experiments");
});

test("dense data OS generates covered singular and plural intents for every graduated center", () => {
  const canonicalCollectionNames = new Set([
    ...BUILTIN_COLLECTIONS_BY_NAME.keys(),
    ...PRODUCTIVITY_COLLECTION_DEFINITIONS.map((collection) => collection.name),
  ]);
  const intents = listClawProfessionalRecordsIntentEntries();
  const coveredIntentKeys = new Set(intents
    .filter((entry) => entry.status === "covered" && entry.collectionName)
    .map((entry) => `${entry.phrase}:${entry.collectionName}`));

  for (const system of clawProfessionalRecordsOsRegistry.systems) {
    for (const center of system.centers) {
      if (!center.collectionName) continue;
      assert.ok(canonicalCollectionNames.has(center.collectionName), `${system.id}.${center.id} must use a canonical collection`);
      for (const command of [center.commandNoun, ...center.commandAliases]) {
        for (const action of clawProfessionalRecordsOsRegistry.standardCollectionActions.filter((entry) => entry !== "purge")) {
          const phrase = `claw ${command} ${action}`;
          assert.ok(coveredIntentKeys.has(`${phrase}:${center.collectionName}`), `${system.id}.${center.id} missing covered intent ${phrase}`);
        }
      }
    }
  }
});

test("dense data OS roadmap keeps the wider catalog visible before pack graduation", () => {
  const roadmapIds = new Set(listClawProfessionalRecordsSystems({ wave: "roadmap" }).map((system) => system.id));
  for (const id of [
    "energy_utilities",
    "telecom",
    "hospitality",
    "agriculture",
    "nonprofit",
    "media_production",
    "aerospace",
    "banking",
    "public_safety",
  ]) {
    assert.equal(roadmapIds.has(id), true, `${id} must stay visible in the follow-up roadmap taxonomy`);
  }
  assert.equal(roadmapIds.has("content"), false, "content must be graduated from roadmap to first-wave dense data");
  assert.equal(findClawProfessionalRecordsSystem("content")?.wave, "first_wave", "content must be graduated from roadmap to first-wave dense data");
  assert.equal(findClawProfessionalRecordsSystem("product")?.wave, "first_wave", "product must be graduated from roadmap to first-wave dense data");
  assert.equal(findClawProfessionalRecordsSystem("pharma")?.wave, "first_wave", "pharma must be graduated from roadmap to first-wave dense data");
});

test("dense data OS registry completeness guard catches missing centers, routes, operations, and views", () => {
  assert.doesNotThrow(() => assertClawProfessionalRecordsOsRegistryComplete());
});
