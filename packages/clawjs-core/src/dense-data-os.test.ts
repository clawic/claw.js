import { test } from "vitest";
import assert from "node:assert/strict";

import {
  assertClawDenseDataOsRegistryComplete,
  clawDenseDataIntentStatuses,
  clawDenseDataOsRegistry,
  findClawDenseDataSystem,
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
  assert.ok(health?.centers.some((center) => center.commandNoun === "patient" && center.commandAliases.includes("patients")));
  assert.ok(health?.commandPatterns.includes("claw patient list|get|create|update|delete|query|schema"));

  const erp = findClawDenseDataSystem("erp");
  assert.ok(erp?.centers.some((center) => center.commandNoun === "invoice" && center.commandAliases.includes("invoices")));
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
