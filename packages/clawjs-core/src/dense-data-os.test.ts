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
  assert.ok(intents.some((entry) => entry.phrase === "claw encounter list" && entry.status === "workflow_gap"));
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
    "study",
    "sample",
    "legal_case",
    "invoice",
    "invoice_company",
    "incident",
    "service",
    "course",
    "work_order",
    "evidence",
    "provenance",
    "partial_data_gap",
  ]) {
    assert.ok(covered.has(requiredCoverage), `fixture missing coverage ${requiredCoverage}`);
  }
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
    "manufacturing",
    "ops",
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
  assert.equal(findClawDenseDataSystem("mes")?.id, "manufacturing");
  assert.equal(findClawDenseDataSystem("itsm")?.id, "ops");
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
  assert.ok(health?.commandPatterns.includes("claw patient list|get|create|update|delete|query|schema"));

  const erp = findClawDenseDataSystem("erp");
  assert.ok(erp?.centers.some((center) => center.commandNoun === "invoice" && center.commandAliases.includes("invoices") && center.collectionName === "invoices"));
  assert.ok(erp?.commandPatterns.includes("claw invoice list|get|create|update|delete|query|schema"));
});

test("dense data OS models patient medication routes without forcing a health prefix", () => {
  const health = findClawDenseDataSystem("health");
  assert.ok(health);

  const medication = health.operations.find((operation) => operation.id === "patient.medication.add");
  assert.ok(medication);
  assert.deepEqual(medication.routes, ["claw patient <id> medication add", "claw medication add --patient <id>"]);
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

  const invoiceList = resolveClawDenseDataIntent("claw invoice list");
  assert.equal(invoiceList.status, "covered");
  assert.equal(invoiceList.system?.id, "erp");
  assert.equal(invoiceList.operation?.id, "invoice.list");

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
    "health.medication": "medications",
    "health.symptom": "symptom_logs",
    "research.study": "studies",
    "research.participant": "participants",
    "biology.organism": "organisms",
    "biology.experiment": "biology_experiments",
    "labs.sample": "samples",
    "labs.assay": "assays",
    "legal.case": "legal_cases",
    "erp.company": "companies",
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

test("dense data OS roadmap keeps the wider catalog visible before pack graduation", () => {
  const roadmapIds = new Set(listClawDenseDataSystems({ wave: "roadmap" }).map((system) => system.id));
  for (const id of [
    "hr",
    "supply_chain",
    "warehouse",
    "transport",
    "procurement",
    "compliance",
    "real_estate",
    "insurance",
    "government",
    "construction",
    "iot",
    "content",
    "product",
    "pharma",
    "maintenance",
    "eln",
  ]) {
    assert.equal(roadmapIds.has(id), true, `${id} must stay visible in the roadmap taxonomy`);
  }
});

test("dense data OS registry completeness guard catches missing centers, routes, operations, and views", () => {
  assert.doesNotThrow(() => assertClawDenseDataOsRegistryComplete());
});
