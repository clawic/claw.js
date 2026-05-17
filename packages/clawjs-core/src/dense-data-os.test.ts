import { test } from "vitest";
import assert from "node:assert/strict";

import {
  assertClawDenseDataOsRegistryComplete,
  BUILTIN_COLLECTIONS_BY_NAME,
  clawDenseDataAcceptanceFixture,
  PRODUCTIVITY_COLLECTION_DEFINITIONS,
  clawDenseDataIntentStatuses,
  clawDenseDataOsRegistry,
  findClawDenseDataSystem,
  listClawDenseDataIntentEntries,
  listClawDenseDataSemanticViewEntries,
  listClawDenseDataSystems,
  resolveClawDenseDataIntent,
} from "./index.ts";

test("dense data OS keeps the source conversation and plan as binding metadata", () => {
  assert.equal(clawDenseDataOsRegistry.schemaVersion, 1);
  assert.equal(clawDenseDataOsRegistry.sourceConversationId, "019e35a1-06bb-77f2-a712-92ed2646bd15");
  assert.equal(clawDenseDataOsRegistry.sourcePlanId, "019e3659-0335-7811-9cda-c9d176e91515-plan");
  assert.equal(clawDenseDataOsRegistry.privateGoalReference, "claw-dense-data-os-plan-2026-05-17");
});

test("dense data OS exposes the agreed intent status model", () => {
  assert.deepEqual(clawDenseDataIntentStatuses, [
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
  const requirements = clawDenseDataOsRegistry.externalPendingRequirements;
  assert.ok(requirements.length >= 5);
  assert.ok(requirements.some((entry) => entry.systemId === "health" && entry.requirementType === "regulated_export"));
  assert.ok(requirements.some((entry) => entry.systemId === "labs" && entry.requirementType === "physical_device"));
  assert.ok(requirements.some((entry) => entry.systemId === "erp" && entry.requirementType === "cost_bearing"));
  for (const requirement of requirements) {
    assert.equal(requirement.status, "external_pending");
    assert.ok(requirement.reason.length > 0);
    assert.ok(requirement.validationNeeded.length > 0);
  }
});

test("dense data OS foundation primitives are backed by canonical collections", () => {
  const canonicalCollectionNames = new Set([
    ...BUILTIN_COLLECTIONS_BY_NAME.keys(),
    ...PRODUCTIVITY_COLLECTION_DEFINITIONS.map((collection) => collection.name),
  ]);

  for (const primitive of clawDenseDataOsRegistry.foundationPrimitives) {
    const collectionName = clawDenseDataOsRegistry.foundationCollections[primitive];
    assert.ok(collectionName, `${primitive} must map to a canonical foundation collection`);
    assert.ok(canonicalCollectionNames.has(collectionName), `${primitive} maps to missing collection ${collectionName}`);
  }

  assert.equal(clawDenseDataOsRegistry.foundationCollections.universal_relations, "entity_relations");
  assert.equal(BUILTIN_COLLECTIONS_BY_NAME.get("entity_relations")?.aliases.includes("universal_relations"), true);
});

test("dense data OS generates auditable intent and semantic view entries", () => {
  const intents = listClawDenseDataIntentEntries();
  const semanticViews = listClawDenseDataSemanticViewEntries();
  const intentIds = new Set(intents.map((entry) => entry.id));

  assert.equal(intentIds.size, intents.length, "generated dense intent ids must be unique");
  assert.ok(intents.some((entry) => entry.phrase === "claw patient list" && entry.status === "covered" && entry.collectionName === "patients"));
  assert.ok(intents.some((entry) => entry.phrase === "claw encounter list" && entry.status === "covered" && entry.collectionName === "encounters"));
  assert.ok(intents.some((entry) => entry.phrase === "claw health gaps" && entry.status === "covered"));
  assert.ok(semanticViews.some((entry) => entry.id === "patient.timeline" && entry.systemId === "health"));
  assert.ok(semanticViews.some((entry) => entry.id === "invoice.list" && entry.systemId === "erp"));
});

test("dense data OS acceptance fixture covers required first-wave records and gaps", () => {
  const canonicalCollectionNames = new Set([
    ...BUILTIN_COLLECTIONS_BY_NAME.keys(),
    ...PRODUCTIVITY_COLLECTION_DEFINITIONS.map((collection) => collection.name),
  ]);
  const records = clawDenseDataAcceptanceFixture.records;
  const ids = new Set(records.map((record) => record.id));
  const covered = new Set(records.flatMap((record) => record.covers));

  assert.equal(clawDenseDataAcceptanceFixture.sourceConversationId, "019e35a1-06bb-77f2-a712-92ed2646bd15");
  assert.equal(ids.size, records.length, "fixture ids must be unique");
  for (const record of records) {
    assert.ok(canonicalCollectionNames.has(record.collectionName), `${record.collectionName} must be canonical`);
  }
  for (const requiredCoverage of [
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
  assert.ok(records.some((record) => record.id === "fixture_semantic_view_health_patient_timeline" && record.collectionName === "semantic_views"));
  assert.ok(records.some((record) => record.collectionName === "domain_intents" && record.covers.includes("intent_coverage")));
  assert.ok(records.some((record) => record.collectionName === "quality_gaps" && record.covers.includes("external_pending")));
});

test("dense data OS first wave covers the agreed high-density systems", () => {
  assert.deepEqual(listClawDenseDataSystems({ wave: "first_wave" }).map((system) => system.id), [
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
  ]);

  for (const system of listClawDenseDataSystems({ wave: "first_wave" })) {
    assert.equal(system.visiblePack, true);
    assert.equal(system.orchestrator, true);
    assert.equal(system.storagePolicy, "core_sqlite");
    assert.ok(system.centers.length >= 2);
    assert.ok(system.operations.length > 0);
    assert.ok(system.semanticViews.length > 0);
  }
});

test("dense data OS keeps common names and professional acronyms as first-class routes", () => {
  assert.equal(findClawDenseDataSystem("ehr")?.id, "health");
  assert.equal(findClawDenseDataSystem("ctms")?.id, "research");
  assert.equal(findClawDenseDataSystem("lims")?.id, "labs");
  assert.equal(findClawDenseDataSystem("accounting")?.id, "finance");
  assert.equal(findClawDenseDataSystem("lms")?.id, "education");
  assert.equal(findClawDenseDataSystem("hris")?.id, "hr");
  assert.equal(findClawDenseDataSystem("mes")?.id, "manufacturing");
  assert.equal(findClawDenseDataSystem("itsm")?.id, "ops");
  assert.equal(findClawDenseDataSystem("proptech")?.id, "real_estate");
  assert.equal(findClawDenseDataSystem("purchasing")?.id, "procurement");
  assert.equal(findClawDenseDataSystem("wms")?.id, "warehouse");
});

test("dense data OS centers have direct human CLI nouns and plural aliases", () => {
  for (const system of clawDenseDataOsRegistry.systems) {
    for (const center of system.centers) {
      assert.match(center.commandNoun, /^[a-z][a-z0-9-]*$/);
      assert.ok(center.commandAliases.length > 0, `${system.id}.${center.id} must expose a plural/top-level alias`);
      assert.ok(!center.commandAliases.includes(center.commandNoun), `${system.id}.${center.id} aliases must not duplicate the canonical noun`);
    }
  }

  const health = findClawDenseDataSystem("health");
  assert.ok(health?.centers.some((center) => center.commandNoun === "patient" && center.commandAliases.includes("patients") && center.collectionName === "patients"));
  assert.ok(health?.centers.some((center) => center.commandNoun === "encounter" && center.commandAliases.includes("encounters") && center.collectionName === "encounters"));
  assert.ok(health?.commandPatterns.includes("claw patient list|get|create|update|delete|query|schema"));

  const labs = findClawDenseDataSystem("labs");
  assert.ok(labs?.centers.some((center) => center.commandNoun === "assay" && center.commandAliases.includes("assays") && !center.commandAliases.includes("assaies") && center.collectionName === "assays"));

  const erp = findClawDenseDataSystem("erp");
  assert.ok(erp?.centers.some((center) => center.commandNoun === "invoice" && center.commandAliases.includes("invoices") && center.collectionName === "invoices"));
  assert.ok(erp?.commandPatterns.includes("claw invoice list|get|create|update|delete|query|schema"));

  const legal = findClawDenseDataSystem("legal");
  assert.ok(legal?.centers.some((center) => center.commandNoun === "legal-client" && center.commandAliases.includes("legal-clients") && center.collectionName === "legal_clients"));
  assert.ok(legal?.commandPatterns.includes("claw legal-client list|get|create|update|delete|query|schema"));

  const hr = findClawDenseDataSystem("hr");
  assert.ok(hr?.centers.some((center) => center.commandNoun === "employee" && center.collectionName === "employees"));
  assert.ok(hr?.centers.some((center) => center.commandNoun === "time-off" && center.commandAliases.includes("pto") && center.collectionName === "time_off_requests"));
  assert.ok(hr?.commandPatterns.includes("claw employee <id> timeline"));

  const realEstate = findClawDenseDataSystem("real-estate");
  assert.ok(realEstate?.centers.some((center) => center.commandNoun === "property" && center.commandAliases.includes("properties") && center.collectionName === "property_listings"));
  assert.ok(realEstate?.centers.some((center) => center.commandNoun === "property-offer" && center.collectionName === "property_offers"));
  assert.ok(realEstate?.commandPatterns.includes("claw property <id> timeline"));

  const insurance = findClawDenseDataSystem("insurance");
  assert.ok(insurance?.centers.some((center) => center.commandNoun === "insurance-policy" && center.commandAliases.includes("insurance-policies") && center.collectionName === "insurance_policies"));
  assert.ok(insurance?.centers.some((center) => center.commandNoun === "vehicle-insurance-policy" && center.collectionName === "vehicle_insurance_policies"));
  assert.ok(insurance?.commandPatterns.includes("claw insurance-policy <id> timeline"));

  const maintenance = findClawDenseDataSystem("maintenance");
  assert.ok(maintenance?.centers.some((center) => center.commandNoun === "vehicle" && center.commandAliases.includes("vehicles") && center.collectionName === "vehicles"));
  assert.ok(maintenance?.centers.some((center) => center.commandNoun === "vehicle-maintenance" && center.collectionName === "vehicle_maintenance"));
  assert.ok(maintenance?.commandPatterns.includes("claw vehicle <id> timeline"));

  const procurement = findClawDenseDataSystem("procurement");
  assert.ok(procurement?.centers.some((center) => center.commandNoun === "supplier" && center.commandAliases.includes("suppliers") && center.collectionName === "suppliers"));
  assert.ok(procurement?.centers.some((center) => center.commandNoun === "purchase-order" && center.commandAliases.includes("po") && center.collectionName === "purchase_orders"));
  assert.ok(procurement?.centers.some((center) => center.commandNoun === "purchase-order-line-item" && center.collectionName === "purchase_order_line_items"));
  assert.ok(procurement?.commandPatterns.includes("claw purchase-order <id> timeline"));

  const warehouse = findClawDenseDataSystem("warehouse");
  assert.ok(warehouse?.centers.some((center) => center.commandNoun === "warehouse" && center.commandAliases.includes("warehouses") && center.collectionName === "warehouses"));
  assert.ok(warehouse?.centers.some((center) => center.commandNoun === "inventory-item" && center.commandAliases.includes("stock-items") && center.collectionName === "inventory_items"));
  assert.ok(warehouse?.centers.some((center) => center.commandNoun === "stock-movement" && center.collectionName === "stock_movements"));
  assert.ok(warehouse?.commandPatterns.includes("claw warehouse <id> timeline"));
});

test("dense data OS models patient medication routes without forcing a health prefix", () => {
  const health = findClawDenseDataSystem("health");
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

test("dense data OS resolves direct CLI intent phrases without executing them", () => {
  const patientList = resolveClawDenseDataIntent("claw patient list");
  assert.equal(patientList.execute, false);
  assert.equal(patientList.status, "covered");
  assert.equal(patientList.system?.id, "health");
  assert.equal(patientList.center?.commandNoun, "patient");

  const patientsList = resolveClawDenseDataIntent("patients list");
  assert.equal(patientsList.status, "covered");
  assert.equal(patientsList.center?.commandNoun, "patient");

  const assaysList = resolveClawDenseDataIntent("assays list");
  assert.equal(assaysList.status, "covered");
  assert.equal(assaysList.center?.commandNoun, "assay");

  const productList = resolveClawDenseDataIntent("claw product list");
  assert.equal(productList.status, "covered");
  assert.equal(productList.system?.id, "erp");
  assert.equal(productList.center?.commandNoun, "product");
  assert.equal(productList.center?.collectionName, "products_catalog");

  const productOverview = resolveClawDenseDataIntent("claw product overview");
  assert.equal(productOverview.status, "covered");
  assert.equal(productOverview.system?.id, "product");
  assert.equal(productOverview.center, undefined);

  const encounterList = resolveClawDenseDataIntent("claw encounter list");
  assert.equal(encounterList.status, "covered");
  assert.equal(encounterList.system?.id, "health");
  assert.equal(encounterList.center?.collectionName, "encounters");

  const invoiceList = resolveClawDenseDataIntent("claw invoice list");
  assert.equal(invoiceList.status, "covered");
  assert.equal(invoiceList.system?.id, "erp");
  assert.equal(invoiceList.operation?.id, "invoice.list");

  const legalClientList = resolveClawDenseDataIntent("claw legal-client list");
  assert.equal(legalClientList.status, "covered");
  assert.equal(legalClientList.system?.id, "legal");
  assert.equal(legalClientList.center?.collectionName, "legal_clients");

  const employeeList = resolveClawDenseDataIntent("claw employee list");
  assert.equal(employeeList.status, "covered");
  assert.equal(employeeList.system?.id, "hr");
  assert.equal(employeeList.center?.collectionName, "employees");

  const propertyList = resolveClawDenseDataIntent("claw property list");
  assert.equal(propertyList.status, "covered");
  assert.equal(propertyList.system?.id, "real_estate");
  assert.equal(propertyList.center?.collectionName, "property_listings");

  const insurancePolicyList = resolveClawDenseDataIntent("claw insurance-policy list");
  assert.equal(insurancePolicyList.status, "covered");
  assert.equal(insurancePolicyList.system?.id, "insurance");
  assert.equal(insurancePolicyList.center?.collectionName, "insurance_policies");

  const vehicleList = resolveClawDenseDataIntent("claw vehicle list");
  assert.equal(vehicleList.status, "covered");
  assert.equal(vehicleList.system?.id, "maintenance");
  assert.equal(vehicleList.center?.collectionName, "vehicles");

  const purchaseOrderList = resolveClawDenseDataIntent("claw purchase-order list");
  assert.equal(purchaseOrderList.status, "covered");
  assert.equal(purchaseOrderList.system?.id, "procurement");
  assert.equal(purchaseOrderList.center?.collectionName, "purchase_orders");

  const warehouseList = resolveClawDenseDataIntent("claw warehouse list");
  assert.equal(warehouseList.status, "covered");
  assert.equal(warehouseList.system?.id, "warehouse");
  assert.equal(warehouseList.center?.collectionName, "warehouses");

  const medicationAdd = resolveClawDenseDataIntent("claw medication add --patient p_123");
  assert.equal(medicationAdd.status, "partial");
  assert.equal(medicationAdd.system?.id, "health");
  assert.equal(medicationAdd.operation?.id, "patient.medication.add");

  const unsupported = resolveClawDenseDataIntent("claw unknown-specialist-thing list");
  assert.equal(unsupported.status, "data_gap");
});

test("dense data OS keeps ERP as an orchestrator over shared collections, not a supercollection", () => {
  const erp = findClawDenseDataSystem("erp");
  assert.ok(erp);
  assert.equal(erp.orchestrator, true);
  assert.ok(erp.notes.includes("not a supercollection"));
  assert.ok(erp.sharedEngines.includes("finance_accounting"));
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
    const center = findClawDenseDataSystem(systemId)?.centers.find((entry) => entry.id === centerId);
    assert.equal(center?.collectionName, collectionName, `${key} must point at ${collectionName}`);
    assert.ok(canonicalCollectionNames.has(collectionName), `${collectionName} must be a canonical collection`);
  }

  const analyticsExperiment = BUILTIN_COLLECTIONS_BY_NAME.get("experiments");
  assert.equal(analyticsExperiment?.family, "analytics");
  assert.equal(findClawDenseDataSystem("biology")?.centers.find((entry) => entry.id === "experiment")?.collectionName, "biology_experiments");
});

test("dense data OS generates covered singular and plural intents for every graduated center", () => {
  const canonicalCollectionNames = new Set([
    ...BUILTIN_COLLECTIONS_BY_NAME.keys(),
    ...PRODUCTIVITY_COLLECTION_DEFINITIONS.map((collection) => collection.name),
  ]);
  const intents = listClawDenseDataIntentEntries();
  const coveredIntentKeys = new Set(intents
    .filter((entry) => entry.status === "covered" && entry.collectionName)
    .map((entry) => `${entry.phrase}:${entry.collectionName}`));

  for (const system of clawDenseDataOsRegistry.systems) {
    for (const center of system.centers) {
      if (!center.collectionName) continue;
      assert.ok(canonicalCollectionNames.has(center.collectionName), `${system.id}.${center.id} must use a canonical collection`);
      for (const command of [center.commandNoun, ...center.commandAliases]) {
        for (const action of clawDenseDataOsRegistry.standardCollectionActions.filter((entry) => entry !== "purge")) {
          const phrase = `claw ${command} ${action}`;
          assert.ok(coveredIntentKeys.has(`${phrase}:${center.collectionName}`), `${system.id}.${center.id} missing covered intent ${phrase}`);
        }
      }
    }
  }
});

test("dense data OS roadmap keeps the wider catalog visible before pack graduation", () => {
  const roadmapIds = new Set(listClawDenseDataSystems({ wave: "roadmap" }).map((system) => system.id));
  for (const id of [
    "supply_chain",
    "transport",
    "compliance",
    "government",
    "construction",
    "iot",
    "content",
    "product",
    "pharma",
    "eln",
  ]) {
    assert.equal(roadmapIds.has(id), true, `${id} must stay visible in the roadmap taxonomy`);
  }
});

test("dense data OS registry completeness guard catches missing centers, routes, operations, and views", () => {
  assert.doesNotThrow(() => assertClawDenseDataOsRegistryComplete());
});
