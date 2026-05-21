import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { CLI_EXIT_OK } from "./index.ts";
import { runCliCapture } from "./index-test-utils.ts";

export interface DenseDataScenarioContext {
  [key: string]: any;
}

async function enableDenseDomainModules(workspaceRoot: string): Promise<void> {
  for (const moduleId of ["health", "legal", "labs-pharma", "construction", "iot", "erp"]) {
    const result = await runCliCapture(["modules", "enable", moduleId, "--workspace", workspaceRoot, "--json"], process.cwd());
    assert.equal(result.code, CLI_EXIT_OK, `module ${moduleId} should enable for dense-data test workspace: ${result.stderr || result.stdout}`);
  }
}
export async function createDenseDataScenarioContext(): Promise<DenseDataScenarioContext> {
  const ctx: DenseDataScenarioContext = {};
  ctx.workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-dense-db-"));
  await enableDenseDomainModules(ctx.workspaceRoot);

  ctx.patientCreate = await runCliCapture(["patient", "create", "Ada Patient", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.patientCreate.code, CLI_EXIT_OK);
  ctx.createdPatient = JSON.parse(ctx.patientCreate.stdout) as {
    ok: boolean;
    data: { id: string; displayName: string };
    meta: { canonicalCommand: string; invokedCommand: string; collection: string; action: string };
  };
  assert.equal(ctx.createdPatient.ok, true);
  assert.equal(ctx.createdPatient.data.displayName, "Ada Patient");
  assert.equal(ctx.createdPatient.meta.canonicalCommand, "database");
  assert.equal(ctx.createdPatient.meta.invokedCommand, "patient");
  assert.equal(ctx.createdPatient.meta.collection, "patients");
  assert.equal(ctx.createdPatient.meta.action, "create");

  ctx.patientList = await runCliCapture(["patient", "list", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.patientList.code, CLI_EXIT_OK);
  ctx.patientPayload = JSON.parse(ctx.patientList.stdout) as {
    ok: boolean;
    data: Array<{ id: string; displayName: string }>;
    meta: { canonicalCommand: string; invokedCommand: string; collection: string; action: string };
  };
  assert.equal(ctx.patientPayload.ok, true);
  assert.equal(ctx.patientPayload.meta.canonicalCommand, "database");
  assert.equal(ctx.patientPayload.meta.invokedCommand, "patient");
  assert.equal(ctx.patientPayload.meta.collection, "patients");
  assert.equal(ctx.patientPayload.data.some((record) => record.displayName === "Ada Patient"), true);

  ctx.patientsAliasList = await runCliCapture(["patients", "list", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.patientsAliasList.code, CLI_EXIT_OK);
  ctx.patientsAliasPayload = JSON.parse(ctx.patientsAliasList.stdout) as { ok: boolean; data: Array<{ id: string; displayName: string }>; meta: { canonicalCommand: string; invokedCommand: string; collection: string; action: string } };
  assert.equal(ctx.patientsAliasPayload.ok, true);
  assert.equal(ctx.patientsAliasPayload.meta.canonicalCommand, "database");
  assert.equal(ctx.patientsAliasPayload.meta.invokedCommand, "patients");
  assert.equal(ctx.patientsAliasPayload.meta.collection, "patients");
  assert.equal(ctx.patientsAliasPayload.meta.action, "list");
  assert.equal(ctx.patientsAliasPayload.data.some((record) => record.id === ctx.createdPatient.data.id), true);

  ctx.evidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Clinic note", "--kind", "document", "--collection-name", "patients", "--record-id", ctx.createdPatient.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.evidenceSourceCreate.code, CLI_EXIT_OK);
  ctx.evidenceSourcePayload = JSON.parse(ctx.evidenceSourceCreate.stdout) as { data: { id: string; label: string; kind: string; collectionName: string; recordId: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.evidenceSourcePayload.meta.invokedCommand, "evidence-source");
  assert.equal(ctx.evidenceSourcePayload.meta.collection, "evidence_sources");
  assert.equal(ctx.evidenceSourcePayload.data.label, "Clinic note");
  assert.equal(ctx.evidenceSourcePayload.data.collectionName, "patients");
  assert.equal(ctx.evidenceSourcePayload.data.recordId, ctx.createdPatient.data.id);

  ctx.qualityGapCreate = await runCliCapture(["quality-gap", "create", "Missing date of birth", "--target-collection", "patients", "--target-id", ctx.createdPatient.data.id, "--gap-kind", "missing", "--evidence-source-id", ctx.evidenceSourcePayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.qualityGapCreate.code, CLI_EXIT_OK);
  ctx.qualityGapPayload = JSON.parse(ctx.qualityGapCreate.stdout) as { data: { id: string; label: string; targetCollection: string; targetId: string; gapKind: string; status: string; evidenceSourceId: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.qualityGapPayload.meta.invokedCommand, "quality-gap");
  assert.equal(ctx.qualityGapPayload.meta.collection, "quality_gaps");
  assert.equal(ctx.qualityGapPayload.data.label, "Missing date of birth");
  assert.equal(ctx.qualityGapPayload.data.targetCollection, "patients");
  assert.equal(ctx.qualityGapPayload.data.targetId, ctx.createdPatient.data.id);
  assert.equal(ctx.qualityGapPayload.data.gapKind, "missing");
  assert.equal(ctx.qualityGapPayload.data.status, "open");
  assert.equal(ctx.qualityGapPayload.data.evidenceSourceId, ctx.evidenceSourcePayload.data.id);

  ctx.medicationCreate = await runCliCapture(["medication", "add", "--patient", ctx.createdPatient.data.id, "--name", "Atorvastatin", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.medicationCreate.code, CLI_EXIT_OK);
  ctx.medicationPayload = JSON.parse(ctx.medicationCreate.stdout) as { data: { name: string; patientId: string }; meta: { collection: string; action: string } };
  assert.equal(ctx.medicationPayload.meta.collection, "medications");
  assert.equal(ctx.medicationPayload.meta.action, "create");
  assert.equal(ctx.medicationPayload.data.name, "Atorvastatin");
  assert.equal(ctx.medicationPayload.data.patientId, ctx.createdPatient.data.id);

  ctx.patientMedications = await runCliCapture(["patient", ctx.createdPatient.data.id, "medications", "list", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.patientMedications.code, CLI_EXIT_OK);
  ctx.patientMedicationsPayload = JSON.parse(ctx.patientMedications.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: {
        subject: { id: string; label: string };
        summary: { medications: number; activeMedications: number };
        records: { medications: Array<{ name: string; patientId: string }> };
        items: Array<{ kind: string; label: string }>;
      };
    };
    meta: { professionalRecords: boolean; semanticView: boolean };
  };
  assert.equal(ctx.patientMedicationsPayload.meta.professionalRecords, true);
  assert.equal(ctx.patientMedicationsPayload.meta.semanticView, true);
  assert.equal(ctx.patientMedicationsPayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.patientMedicationsPayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.patientMedicationsPayload.data.semanticView.id, "patient.medications");
  assert.equal(ctx.patientMedicationsPayload.data.semanticView.systemId, "health");
  assert.equal(ctx.patientMedicationsPayload.data.materializedView.subject.id, ctx.createdPatient.data.id);
  assert.equal(ctx.patientMedicationsPayload.data.materializedView.summary.medications, 1);
  assert.equal(ctx.patientMedicationsPayload.data.materializedView.summary.activeMedications, 1);
  assert.equal(ctx.patientMedicationsPayload.data.materializedView.records.medications[0]?.name, "Atorvastatin");
  assert.equal(ctx.patientMedicationsPayload.data.materializedView.records.medications[0]?.patientId, ctx.createdPatient.data.id);
  assert.equal(ctx.patientMedicationsPayload.data.materializedView.items.some((item) => item.kind === "medication" && item.label === "Atorvastatin"), true);

  ctx.symptomCreate = await runCliCapture(["patient", ctx.createdPatient.data.id, "symptoms", "add", "Headache", "--severity", "4", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.symptomCreate.code, CLI_EXIT_OK);
  ctx.symptomPayload = JSON.parse(ctx.symptomCreate.stdout) as { data: { symptom: string; patientId: string; severity: number; loggedAt: string }; meta: { collection: string; action: string } };
  assert.equal(ctx.symptomPayload.meta.collection, "symptom_logs");
  assert.equal(ctx.symptomPayload.meta.action, "create");
  assert.equal(ctx.symptomPayload.data.symptom, "Headache");
  assert.equal(ctx.symptomPayload.data.patientId, ctx.createdPatient.data.id);
  assert.equal(ctx.symptomPayload.data.severity, 4);
  assert.equal(typeof ctx.symptomPayload.data.loggedAt, "string");

  ctx.patientSymptoms = await runCliCapture(["patient", ctx.createdPatient.data.id, "symptoms", "list", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.patientSymptoms.code, CLI_EXIT_OK);
  ctx.patientSymptomsPayload = JSON.parse(ctx.patientSymptoms.stdout) as { data: Array<{ symptom: string; patientId: string }>; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.patientSymptomsPayload.meta.invokedCommand, "patient");
  assert.equal(ctx.patientSymptomsPayload.meta.collection, "symptom_logs");
  assert.equal(ctx.patientSymptomsPayload.meta.action, "list");
  assert.equal(ctx.patientSymptomsPayload.data.length, 1);
  assert.equal(ctx.patientSymptomsPayload.data[0]?.symptom, "Headache");
  assert.equal(ctx.patientSymptomsPayload.data[0]?.patientId, ctx.createdPatient.data.id);

  ctx.patientLabCreate = await runCliCapture(["patient", ctx.createdPatient.data.id, "lab", "add", "CBC panel", "--lab", "Central Lab", "--reported-at", "2026-05-17T00:00:00.000Z", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.patientLabCreate.code, CLI_EXIT_OK, ctx.patientLabCreate.stderr || ctx.patientLabCreate.stdout);
  ctx.patientLabPayload = JSON.parse(ctx.patientLabCreate.stdout) as { data: { id: string; title: string; patientId: string; lab: string; reportedAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.patientLabPayload.meta.invokedCommand, "patient");
  assert.equal(ctx.patientLabPayload.meta.collection, "lab_results");
  assert.equal(ctx.patientLabPayload.meta.action, "create");
  assert.equal(ctx.patientLabPayload.data.title, "CBC panel");
  assert.equal(ctx.patientLabPayload.data.patientId, ctx.createdPatient.data.id);
  assert.equal(ctx.patientLabPayload.data.lab, "Central Lab");

  ctx.patientLabs = await runCliCapture(["patient", ctx.createdPatient.data.id, "labs", "list", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.patientLabs.code, CLI_EXIT_OK);
  ctx.patientLabsPayload = JSON.parse(ctx.patientLabs.stdout) as { data: Array<{ id: string; title: string; patientId: string }>; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.patientLabsPayload.meta.invokedCommand, "patient");
  assert.equal(ctx.patientLabsPayload.meta.collection, "lab_results");
  assert.equal(ctx.patientLabsPayload.meta.action, "list");
  assert.equal(ctx.patientLabsPayload.data.some((record) => record.id === ctx.patientLabPayload.data.id && record.patientId === ctx.createdPatient.data.id), true);

  ctx.patientEncounterCreate = await runCliCapture(["patient", ctx.createdPatient.data.id, "encounter", "add", "Intake visit", "--encounter-type", "visit", "--started-at", "2026-05-17T00:00:00.000Z", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.patientEncounterCreate.code, CLI_EXIT_OK, ctx.patientEncounterCreate.stderr || ctx.patientEncounterCreate.stdout);
  ctx.patientEncounterPayload = JSON.parse(ctx.patientEncounterCreate.stdout) as { data: { id: string; title: string; patientId: string; encounterType: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.patientEncounterPayload.meta.invokedCommand, "patient");
  assert.equal(ctx.patientEncounterPayload.meta.collection, "encounters");
  assert.equal(ctx.patientEncounterPayload.meta.action, "create");
  assert.equal(ctx.patientEncounterPayload.data.title, "Intake visit");
  assert.equal(ctx.patientEncounterPayload.data.patientId, ctx.createdPatient.data.id);
  assert.equal(ctx.patientEncounterPayload.data.encounterType, "visit");
  assert.equal(ctx.patientEncounterPayload.data.status, "planned");

  ctx.patientEncounters = await runCliCapture(["patient", ctx.createdPatient.data.id, "encounters", "list", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.patientEncounters.code, CLI_EXIT_OK);
  ctx.patientEncountersPayload = JSON.parse(ctx.patientEncounters.stdout) as { data: Array<{ id: string; title: string; patientId: string }>; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.patientEncountersPayload.meta.invokedCommand, "patient");
  assert.equal(ctx.patientEncountersPayload.meta.collection, "encounters");
  assert.equal(ctx.patientEncountersPayload.meta.action, "list");
  assert.equal(ctx.patientEncountersPayload.data.some((record) => record.id === ctx.patientEncounterPayload.data.id && record.patientId === ctx.createdPatient.data.id), true);

  ctx.directEncounterCreate = await runCliCapture(["encounter", "add", "--patient", ctx.createdPatient.data.id, "--title", "Follow-up visit", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.directEncounterCreate.code, CLI_EXIT_OK, ctx.directEncounterCreate.stderr || ctx.directEncounterCreate.stdout);
  ctx.directEncounterPayload = JSON.parse(ctx.directEncounterCreate.stdout) as { data: { title: string; patientId: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.directEncounterPayload.meta.invokedCommand, "encounter");
  assert.equal(ctx.directEncounterPayload.meta.collection, "encounters");
  assert.equal(ctx.directEncounterPayload.data.patientId, ctx.createdPatient.data.id);

  ctx.directLabCreate = await runCliCapture(["lab", "add", "--patient", ctx.createdPatient.data.id, "--title", "Metabolic panel", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.directLabCreate.code, CLI_EXIT_OK, ctx.directLabCreate.stderr || ctx.directLabCreate.stdout);
  ctx.directLabPayload = JSON.parse(ctx.directLabCreate.stdout) as { data: { title: string; patientId: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.directLabPayload.meta.invokedCommand, "lab");
  assert.equal(ctx.directLabPayload.meta.collection, "lab_results");
  assert.equal(ctx.directLabPayload.data.patientId, ctx.createdPatient.data.id);

  ctx.healthGaps = await runCliCapture(["health", "gaps", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.healthGaps.code, CLI_EXIT_OK);
  ctx.gapsPayload = JSON.parse(ctx.healthGaps.stdout) as { data: { coverage: { executable: boolean }; registry: { systems: Array<{ id: string }> } }; meta: { professionalRecords: boolean } };
  assert.equal(ctx.gapsPayload.meta.professionalRecords, true);
  assert.equal(ctx.gapsPayload.data.coverage.executable, true);
  assert.equal(ctx.gapsPayload.data.registry.systems.some((system) => system.id === "health"), true);

  ctx.patientTimeline = await runCliCapture(["patient", ctx.createdPatient.data.id, "timeline", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.patientTimeline.code, CLI_EXIT_OK, ctx.patientTimeline.stderr || ctx.patientTimeline.stdout);
  ctx.patientTimelinePayload = JSON.parse(ctx.patientTimeline.stdout) as {
    data: {
      coverage: { executable: boolean; implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string; commandPattern: string };
      view: { operationId: string; requiredInputs: string[]; createsOrReads: string[] };
      materializedView: { subject: { id: string; label: string }; itemCount: number; partial: boolean; items: Array<{ kind: string; recordId: string; label: string }>; gaps: Array<{ id: string; gapKind: string }> };
    };
    meta: { professionalRecords: boolean; semanticView: boolean };
  };
  assert.equal(ctx.patientTimelinePayload.meta.professionalRecords, true);
  assert.equal(ctx.patientTimelinePayload.meta.semanticView, true);
  assert.equal(ctx.patientTimelinePayload.data.coverage.executable, true);
  assert.equal(ctx.patientTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.patientTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.patientTimelinePayload.data.semanticView.id, "patient.timeline");
  assert.equal(ctx.patientTimelinePayload.data.semanticView.systemId, "health");
  assert.equal(ctx.patientTimelinePayload.data.semanticView.commandPattern, "claw patient <id> timeline");
  assert.equal(ctx.patientTimelinePayload.data.view.operationId, "patient.timeline");
  assert.deepEqual(ctx.patientTimelinePayload.data.view.requiredInputs, ["patient_id"]);
  assert.equal(ctx.patientTimelinePayload.data.view.createsOrReads.includes("timeline_view"), true);
  assert.equal(ctx.patientTimelinePayload.data.materializedView.subject.id, ctx.createdPatient.data.id);
  assert.equal(ctx.patientTimelinePayload.data.materializedView.subject.label, "Ada Patient");
  assert.equal(ctx.patientTimelinePayload.data.materializedView.itemCount >= 9, true);
  assert.equal(ctx.patientTimelinePayload.data.materializedView.partial, true);
  assert.equal(ctx.patientTimelinePayload.data.materializedView.items.some((item) => item.kind === "encounter" && item.label === "Intake visit"), true);
  assert.equal(ctx.patientTimelinePayload.data.materializedView.items.some((item) => item.kind === "medication" && item.label === "Atorvastatin"), true);
  assert.equal(ctx.patientTimelinePayload.data.materializedView.items.some((item) => item.kind === "symptom" && item.label === "Headache"), true);
  assert.equal(ctx.patientTimelinePayload.data.materializedView.items.some((item) => item.kind === "lab_result" && item.label === "CBC panel"), true);
  assert.equal(ctx.patientTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === ctx.qualityGapPayload.data.id && gap.gapKind === "missing"), true);

  ctx.companyCreate = await runCliCapture(["company", "create", "Acme Corp", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.companyCreate.code, CLI_EXIT_OK);
  ctx.companyPayload = JSON.parse(ctx.companyCreate.stdout) as { data: { id: string; name: string }; meta: { collection: string; action: string } };
  assert.equal(ctx.companyPayload.meta.collection, "companies");
  assert.equal(ctx.companyPayload.meta.action, "create");
  assert.equal(ctx.companyPayload.data.name, "Acme Corp");

  ctx.employeeCreate = await runCliCapture(["employee", "create", "Ada Employee", "--company", ctx.companyPayload.data.id, "--job-title", "Operations Lead", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.employeeCreate.code, CLI_EXIT_OK, ctx.employeeCreate.stderr || ctx.employeeCreate.stdout);
  ctx.employeePayload = JSON.parse(ctx.employeeCreate.stdout) as { data: { id: string; displayName: string; companyId: string; jobTitle: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.employeePayload.meta.invokedCommand, "employee");
  assert.equal(ctx.employeePayload.meta.collection, "employees");
  assert.equal(ctx.employeePayload.meta.action, "create");
  assert.equal(ctx.employeePayload.data.displayName, "Ada Employee");
  assert.equal(ctx.employeePayload.data.companyId, ctx.companyPayload.data.id);
  assert.equal(ctx.employeePayload.data.status, "active");

  ctx.employeeTimeOffCreate = await runCliCapture(["employee", ctx.employeePayload.data.id, "time-off", "add", "--kind", "vacation", "--start-date", "2026-06-01T00:00:00.000Z", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.employeeTimeOffCreate.code, CLI_EXIT_OK, ctx.employeeTimeOffCreate.stderr || ctx.employeeTimeOffCreate.stdout);
  ctx.employeeTimeOffPayload = JSON.parse(ctx.employeeTimeOffCreate.stdout) as { data: { employeeId: string; kind: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.employeeTimeOffPayload.meta.invokedCommand, "employee");
  assert.equal(ctx.employeeTimeOffPayload.meta.collection, "time_off_requests");
  assert.equal(ctx.employeeTimeOffPayload.meta.action, "create");
  assert.equal(ctx.employeeTimeOffPayload.data.employeeId, ctx.employeePayload.data.id);
  assert.equal(ctx.employeeTimeOffPayload.data.kind, "vacation");
  assert.equal(ctx.employeeTimeOffPayload.data.status, "pending");

  ctx.employeeReviewCreate = await runCliCapture(["employee", ctx.employeePayload.data.id, "reviews", "add", "--cycle-name", "2026 Q2", "--rating", "strong", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.employeeReviewCreate.code, CLI_EXIT_OK, ctx.employeeReviewCreate.stderr || ctx.employeeReviewCreate.stdout);
  ctx.employeeReviewPayload = JSON.parse(ctx.employeeReviewCreate.stdout) as { data: { employeeId: string; cycleName: string; rating: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.employeeReviewPayload.meta.invokedCommand, "employee");
  assert.equal(ctx.employeeReviewPayload.meta.collection, "performance_reviews");
  assert.equal(ctx.employeeReviewPayload.data.employeeId, ctx.employeePayload.data.id);
  assert.equal(ctx.employeeReviewPayload.data.cycleName, "2026 Q2");
  assert.equal(ctx.employeeReviewPayload.data.status, "draft");

  ctx.directTimeOffCreate = await runCliCapture(["time-off", "add", "--employee", ctx.employeePayload.data.id, "--kind", "sick", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.directTimeOffCreate.code, CLI_EXIT_OK, ctx.directTimeOffCreate.stderr || ctx.directTimeOffCreate.stdout);
  ctx.directTimeOffPayload = JSON.parse(ctx.directTimeOffCreate.stdout) as { data: { employeeId: string; kind: string }; meta: { collection: string; invokedCommand: string } };
  assert.equal(ctx.directTimeOffPayload.meta.invokedCommand, "time-off");
  assert.equal(ctx.directTimeOffPayload.meta.collection, "time_off_requests");
  assert.equal(ctx.directTimeOffPayload.data.employeeId, ctx.employeePayload.data.id);
  assert.equal(ctx.directTimeOffPayload.data.kind, "sick");

  ctx.employeeTimeline = await runCliCapture(["employee", ctx.employeePayload.data.id, "timeline", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.employeeTimeline.code, CLI_EXIT_OK, ctx.employeeTimeline.stderr || ctx.employeeTimeline.stdout);
  ctx.employeeTimelinePayload = JSON.parse(ctx.employeeTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: {
        subject: { id: string; label: string };
        summary: { timeOffRequests: number; performanceReviews: number };
        itemCount: number;
        items: Array<{ kind: string; label: string }>;
      };
    };
  };
  assert.equal(ctx.employeeTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.employeeTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.employeeTimelinePayload.data.semanticView.id, "employee.timeline");
  assert.equal(ctx.employeeTimelinePayload.data.semanticView.systemId, "hr");
  assert.equal(ctx.employeeTimelinePayload.data.materializedView.subject.id, ctx.employeePayload.data.id);
  assert.equal(ctx.employeeTimelinePayload.data.materializedView.subject.label, "Ada Employee");
  assert.equal(ctx.employeeTimelinePayload.data.materializedView.summary.timeOffRequests, 2);
  assert.equal(ctx.employeeTimelinePayload.data.materializedView.summary.performanceReviews, 1);
  assert.equal(ctx.employeeTimelinePayload.data.materializedView.itemCount >= 4, true);
  assert.equal(ctx.employeeTimelinePayload.data.materializedView.items.some((item) => item.kind === "time_off_request" && item.label === "vacation"), true);
  assert.equal(ctx.employeeTimelinePayload.data.materializedView.items.some((item) => item.kind === "performance_review" && item.label === "2026 Q2"), true);

  ctx.propertyCreate = await runCliCapture(["property", "create", "Main Street Loft", "--city", "Madrid", "--transaction", "rent", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.propertyCreate.code, CLI_EXIT_OK, ctx.propertyCreate.stderr || ctx.propertyCreate.stdout);
  ctx.propertyPayload = JSON.parse(ctx.propertyCreate.stdout) as { data: { id: string; title: string; city: string; transaction: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.propertyPayload.meta.invokedCommand, "property");
  assert.equal(ctx.propertyPayload.meta.collection, "property_listings");
  assert.equal(ctx.propertyPayload.meta.action, "create");
  assert.equal(ctx.propertyPayload.data.title, "Main Street Loft");
  assert.equal(ctx.propertyPayload.data.city, "Madrid");
  assert.equal(ctx.propertyPayload.data.status, "draft");

  ctx.propertyVisitCreate = await runCliCapture(["property", ctx.propertyPayload.data.id, "visits", "add", "--visitor-name", "Ada Visitor", "--rating", "4", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.propertyVisitCreate.code, CLI_EXIT_OK, ctx.propertyVisitCreate.stderr || ctx.propertyVisitCreate.stdout);
  ctx.propertyVisitPayload = JSON.parse(ctx.propertyVisitCreate.stdout) as { data: { propertyListingId: string; visitorName: string; rating: number; visitedAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.propertyVisitPayload.meta.invokedCommand, "property");
  assert.equal(ctx.propertyVisitPayload.meta.collection, "property_visits");
  assert.equal(ctx.propertyVisitPayload.data.propertyListingId, ctx.propertyPayload.data.id);
  assert.equal(ctx.propertyVisitPayload.data.visitorName, "Ada Visitor");
  assert.equal(ctx.propertyVisitPayload.data.rating, 4);
  assert.equal(typeof ctx.propertyVisitPayload.data.visitedAt, "string");

  ctx.propertyOfferCreate = await runCliCapture(["property", ctx.propertyPayload.data.id, "offer", "add", "--buyer-name", "Ada Buyer", "--amount-cents", "250000", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.propertyOfferCreate.code, CLI_EXIT_OK, ctx.propertyOfferCreate.stderr || ctx.propertyOfferCreate.stdout);
  ctx.propertyOfferPayload = JSON.parse(ctx.propertyOfferCreate.stdout) as { data: { propertyListingId: string; buyerName: string; amountCents: number; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.propertyOfferPayload.meta.invokedCommand, "property");
  assert.equal(ctx.propertyOfferPayload.meta.collection, "property_offers");
  assert.equal(ctx.propertyOfferPayload.data.propertyListingId, ctx.propertyPayload.data.id);
  assert.equal(ctx.propertyOfferPayload.data.buyerName, "Ada Buyer");
  assert.equal(ctx.propertyOfferPayload.data.amountCents, 250000);
  assert.equal(ctx.propertyOfferPayload.data.status, "pending");

  ctx.directPropertyOffer = await runCliCapture(["property-offer", "add", "--property", ctx.propertyPayload.data.id, "--buyer-name", "Direct Buyer", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.directPropertyOffer.code, CLI_EXIT_OK, ctx.directPropertyOffer.stderr || ctx.directPropertyOffer.stdout);
  ctx.directPropertyOfferPayload = JSON.parse(ctx.directPropertyOffer.stdout) as { data: { propertyListingId: string; buyerName: string }; meta: { collection: string; invokedCommand: string } };
  assert.equal(ctx.directPropertyOfferPayload.meta.invokedCommand, "property-offer");
  assert.equal(ctx.directPropertyOfferPayload.meta.collection, "property_offers");
  assert.equal(ctx.directPropertyOfferPayload.data.propertyListingId, ctx.propertyPayload.data.id);
  assert.equal(ctx.directPropertyOfferPayload.data.buyerName, "Direct Buyer");

  ctx.propertyTimeline = await runCliCapture(["property", ctx.propertyPayload.data.id, "timeline", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.propertyTimeline.code, CLI_EXIT_OK, ctx.propertyTimeline.stderr || ctx.propertyTimeline.stdout);
  ctx.propertyTimelinePayload = JSON.parse(ctx.propertyTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: {
        subject: { id: string; label: string };
        summary: { visits: number; offers: number };
        itemCount: number;
        items: Array<{ kind: string; label: string | number }>;
      };
    };
  };
  assert.equal(ctx.propertyTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.propertyTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.propertyTimelinePayload.data.semanticView.id, "property.timeline");
  assert.equal(ctx.propertyTimelinePayload.data.semanticView.systemId, "real_estate");
  assert.equal(ctx.propertyTimelinePayload.data.materializedView.subject.id, ctx.propertyPayload.data.id);
  assert.equal(ctx.propertyTimelinePayload.data.materializedView.subject.label, "Main Street Loft");
  assert.equal(ctx.propertyTimelinePayload.data.materializedView.summary.visits, 1);
  assert.equal(ctx.propertyTimelinePayload.data.materializedView.summary.offers, 2);
  assert.equal(ctx.propertyTimelinePayload.data.materializedView.itemCount >= 4, true);
  assert.equal(ctx.propertyTimelinePayload.data.materializedView.items.some((item) => item.kind === "property_visit" && item.label === "Ada Visitor"), true);
  assert.equal(ctx.propertyTimelinePayload.data.materializedView.items.some((item) => item.kind === "property_offer" && item.label === "Ada Buyer"), true);

  ctx.insurancePolicyCreate = await runCliCapture(["insurance-policy", "create", "Home policy", "--provider", "Example Mutual", "--policy-number", "HOME-001", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.insurancePolicyCreate.code, CLI_EXIT_OK, ctx.insurancePolicyCreate.stderr || ctx.insurancePolicyCreate.stdout);
  ctx.insurancePolicyPayload = JSON.parse(ctx.insurancePolicyCreate.stdout) as { data: { id: string; title: string; provider: string; policyNumber: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.insurancePolicyPayload.meta.invokedCommand, "insurance-policy");
  assert.equal(ctx.insurancePolicyPayload.meta.collection, "insurance_policies");
  assert.equal(ctx.insurancePolicyPayload.meta.action, "create");
  assert.equal(ctx.insurancePolicyPayload.data.title, "Home policy");
  assert.equal(ctx.insurancePolicyPayload.data.provider, "Example Mutual");
  assert.equal(ctx.insurancePolicyPayload.data.policyNumber, "HOME-001");

  ctx.insuranceEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Policy PDF", "--kind", "document", "--collection-name", "insurance_policies", "--record-id", ctx.insurancePolicyPayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.insuranceEvidenceSourceCreate.code, CLI_EXIT_OK);
  ctx.insuranceEvidenceSourcePayload = JSON.parse(ctx.insuranceEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(ctx.insuranceEvidenceSourcePayload.data.collectionName, "insurance_policies");
  assert.equal(ctx.insuranceEvidenceSourcePayload.data.recordId, ctx.insurancePolicyPayload.data.id);

  ctx.insurancePolicyTimeline = await runCliCapture(["insurance-policy", ctx.insurancePolicyPayload.data.id, "timeline", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.insurancePolicyTimeline.code, CLI_EXIT_OK, ctx.insurancePolicyTimeline.stderr || ctx.insurancePolicyTimeline.stdout);
  ctx.insurancePolicyTimelinePayload = JSON.parse(ctx.insurancePolicyTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: {
        subject: { id: string; label: string };
        summary: { evidenceSources: number };
        itemCount: number;
        items: Array<{ kind: string; label: string }>;
      };
    };
  };
  assert.equal(ctx.insurancePolicyTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.insurancePolicyTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.insurancePolicyTimelinePayload.data.semanticView.id, "insurance_policy.timeline");
  assert.equal(ctx.insurancePolicyTimelinePayload.data.semanticView.systemId, "insurance");
  assert.equal(ctx.insurancePolicyTimelinePayload.data.materializedView.subject.id, ctx.insurancePolicyPayload.data.id);
  assert.equal(ctx.insurancePolicyTimelinePayload.data.materializedView.subject.label, "Home policy");
  assert.equal(ctx.insurancePolicyTimelinePayload.data.materializedView.summary.evidenceSources, 1);
  assert.equal(ctx.insurancePolicyTimelinePayload.data.materializedView.itemCount >= 2, true);
  assert.equal(ctx.insurancePolicyTimelinePayload.data.materializedView.items.some((item) => item.kind === "evidence" && item.label === "Policy PDF"), true);

  ctx.vehicleCreate = await runCliCapture(["db", "vehicle", "create", "EV", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.vehicleCreate.code, CLI_EXIT_OK, ctx.vehicleCreate.stderr || ctx.vehicleCreate.stdout);
  ctx.vehiclePayload = JSON.parse(ctx.vehicleCreate.stdout) as { data: { id: string; name: string }; meta: { collection: string; action: string } };
  assert.equal(ctx.vehiclePayload.meta.collection, "vehicles");
  assert.equal(ctx.vehiclePayload.data.name, "EV");

  ctx.vehicleInsurancePolicyCreate = await runCliCapture(["vehicle-insurance-policy", "add", "--vehicle", ctx.vehiclePayload.data.id, "--provider", "Example Mutual", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.vehicleInsurancePolicyCreate.code, CLI_EXIT_OK, ctx.vehicleInsurancePolicyCreate.stderr || ctx.vehicleInsurancePolicyCreate.stdout);
  ctx.vehicleInsurancePolicyPayload = JSON.parse(ctx.vehicleInsurancePolicyCreate.stdout) as { data: { vehicleId: string; provider: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.vehicleInsurancePolicyPayload.meta.invokedCommand, "vehicle-insurance-policy");
  assert.equal(ctx.vehicleInsurancePolicyPayload.meta.collection, "vehicle_insurance_policies");
  assert.equal(ctx.vehicleInsurancePolicyPayload.meta.action, "create");
  assert.equal(ctx.vehicleInsurancePolicyPayload.data.vehicleId, ctx.vehiclePayload.data.id);
  assert.equal(ctx.vehicleInsurancePolicyPayload.data.provider, "Example Mutual");

  ctx.vehicleMaintenanceCreate = await runCliCapture(["vehicle", ctx.vehiclePayload.data.id, "maintenance", "add", "Annual service", "--performed-by", "Example Garage", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.vehicleMaintenanceCreate.code, CLI_EXIT_OK, ctx.vehicleMaintenanceCreate.stderr || ctx.vehicleMaintenanceCreate.stdout);
  ctx.vehicleMaintenancePayload = JSON.parse(ctx.vehicleMaintenanceCreate.stdout) as { data: { vehicleId: string; title: string; performedBy: string; performedAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.vehicleMaintenancePayload.meta.invokedCommand, "vehicle");
  assert.equal(ctx.vehicleMaintenancePayload.meta.collection, "vehicle_maintenance");
  assert.equal(ctx.vehicleMaintenancePayload.meta.action, "create");
  assert.equal(ctx.vehicleMaintenancePayload.data.vehicleId, ctx.vehiclePayload.data.id);
  assert.equal(ctx.vehicleMaintenancePayload.data.title, "Annual service");
  assert.equal(ctx.vehicleMaintenancePayload.data.performedBy, "Example Garage");
  assert.equal(typeof ctx.vehicleMaintenancePayload.data.performedAt, "string");

  ctx.directVehicleMaintenanceCreate = await runCliCapture(["vehicle-maintenance", "add", "--vehicle", ctx.vehiclePayload.data.id, "Direct service", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.directVehicleMaintenanceCreate.code, CLI_EXIT_OK, ctx.directVehicleMaintenanceCreate.stderr || ctx.directVehicleMaintenanceCreate.stdout);
  ctx.directVehicleMaintenancePayload = JSON.parse(ctx.directVehicleMaintenanceCreate.stdout) as { data: { vehicleId: string; title: string }; meta: { collection: string; invokedCommand: string } };
  assert.equal(ctx.directVehicleMaintenancePayload.meta.invokedCommand, "vehicle-maintenance");
  assert.equal(ctx.directVehicleMaintenancePayload.meta.collection, "vehicle_maintenance");
  assert.equal(ctx.directVehicleMaintenancePayload.data.vehicleId, ctx.vehiclePayload.data.id);
  assert.equal(ctx.directVehicleMaintenancePayload.data.title, "Direct service");

  ctx.vehicleTimeline = await runCliCapture(["vehicle", ctx.vehiclePayload.data.id, "timeline", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.vehicleTimeline.code, CLI_EXIT_OK, ctx.vehicleTimeline.stderr || ctx.vehicleTimeline.stdout);
  ctx.vehicleTimelinePayload = JSON.parse(ctx.vehicleTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: {
        subject: { id: string; label: string };
        summary: { maintenanceRecords: number; insurancePolicies: number };
        itemCount: number;
        items: Array<{ kind: string; label: string }>;
      };
    };
  };
  assert.equal(ctx.vehicleTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.vehicleTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.vehicleTimelinePayload.data.semanticView.id, "vehicle.timeline");
  assert.equal(ctx.vehicleTimelinePayload.data.semanticView.systemId, "maintenance");
  assert.equal(ctx.vehicleTimelinePayload.data.materializedView.subject.id, ctx.vehiclePayload.data.id);
  assert.equal(ctx.vehicleTimelinePayload.data.materializedView.subject.label, "EV");
  assert.equal(ctx.vehicleTimelinePayload.data.materializedView.summary.maintenanceRecords, 2);
  assert.equal(ctx.vehicleTimelinePayload.data.materializedView.summary.insurancePolicies, 1);
  assert.equal(ctx.vehicleTimelinePayload.data.materializedView.itemCount >= 4, true);
  assert.equal(ctx.vehicleTimelinePayload.data.materializedView.items.some((item) => item.kind === "vehicle_maintenance" && item.label === "Annual service"), true);
  assert.equal(ctx.vehicleTimelinePayload.data.materializedView.items.some((item) => item.kind === "vehicle_insurance_policy" && item.label === "Example Mutual"), true);

  ctx.applianceCreate = await runCliCapture(["appliance", "create", "Washer", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.applianceCreate.code, CLI_EXIT_OK, ctx.applianceCreate.stderr || ctx.applianceCreate.stdout);
  ctx.appliancePayload = JSON.parse(ctx.applianceCreate.stdout) as { data: { id: string; name: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.appliancePayload.meta.invokedCommand, "appliance");
  assert.equal(ctx.appliancePayload.meta.collection, "appliances");
  assert.equal(ctx.appliancePayload.data.name, "Washer");

  ctx.applianceMaintenanceCreate = await runCliCapture(["appliance", ctx.appliancePayload.data.id, "maintenance", "add", "Washer service", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.applianceMaintenanceCreate.code, CLI_EXIT_OK, ctx.applianceMaintenanceCreate.stderr || ctx.applianceMaintenanceCreate.stdout);
  ctx.applianceMaintenancePayload = JSON.parse(ctx.applianceMaintenanceCreate.stdout) as { data: { applianceId: string; title: string; performedAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.applianceMaintenancePayload.meta.invokedCommand, "appliance");
  assert.equal(ctx.applianceMaintenancePayload.meta.collection, "appliance_maintenance");
  assert.equal(ctx.applianceMaintenancePayload.data.applianceId, ctx.appliancePayload.data.id);
  assert.equal(ctx.applianceMaintenancePayload.data.title, "Washer service");
  assert.equal(typeof ctx.applianceMaintenancePayload.data.performedAt, "string");

  ctx.directApplianceMaintenanceCreate = await runCliCapture(["appliance-maintenance", "add", "--appliance", ctx.appliancePayload.data.id, "Direct washer service", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.directApplianceMaintenanceCreate.code, CLI_EXIT_OK, ctx.directApplianceMaintenanceCreate.stderr || ctx.directApplianceMaintenanceCreate.stdout);
  ctx.directApplianceMaintenancePayload = JSON.parse(ctx.directApplianceMaintenanceCreate.stdout) as { data: { applianceId: string; title: string }; meta: { collection: string; invokedCommand: string } };
  assert.equal(ctx.directApplianceMaintenancePayload.meta.invokedCommand, "appliance-maintenance");
  assert.equal(ctx.directApplianceMaintenancePayload.meta.collection, "appliance_maintenance");
  assert.equal(ctx.directApplianceMaintenancePayload.data.applianceId, ctx.appliancePayload.data.id);
  assert.equal(ctx.directApplianceMaintenancePayload.data.title, "Direct washer service");

  ctx.accountCreate = await runCliCapture(["account", "create", "Acme Account", "--company", ctx.companyPayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.accountCreate.code, CLI_EXIT_OK);
  ctx.accountPayload = JSON.parse(ctx.accountCreate.stdout) as { data: { id: string; name: string; companyId: string }; meta: { collection: string; action: string } };
  assert.equal(ctx.accountPayload.meta.collection, "accounts");
  assert.equal(ctx.accountPayload.data.name, "Acme Account");
  assert.equal(ctx.accountPayload.data.companyId, ctx.companyPayload.data.id);

  ctx.dealCreate = await runCliCapture(["deal", "create", "Pilot", "--company", ctx.companyPayload.data.id, "--account-id", ctx.accountPayload.data.id, "--value-cents", "2500", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.dealCreate.code, CLI_EXIT_OK);
  ctx.dealPayload = JSON.parse(ctx.dealCreate.stdout) as { data: { id: string; title: string; companyId: string; accountId: string; valueCents: number; status: string }; meta: { collection: string; action: string } };
  assert.equal(ctx.dealPayload.meta.collection, "deals");
  assert.equal(ctx.dealPayload.data.title, "Pilot");
  assert.equal(ctx.dealPayload.data.companyId, ctx.companyPayload.data.id);
  assert.equal(ctx.dealPayload.data.accountId, ctx.accountPayload.data.id);
  assert.equal(ctx.dealPayload.data.valueCents, 2500);
  assert.equal(ctx.dealPayload.data.status, "open");

  ctx.erpProductCreate = await runCliCapture(["product", "create", "Hydraulic Press", "--company", ctx.companyPayload.data.id, "--type", "physical", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.erpProductCreate.code, CLI_EXIT_OK, ctx.erpProductCreate.stderr || ctx.erpProductCreate.stdout);
  ctx.erpProductPayload = JSON.parse(ctx.erpProductCreate.stdout) as { data: { id: string; name: string; companyId: string; type: string; active: boolean }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.erpProductPayload.meta.invokedCommand, "product");
  assert.equal(ctx.erpProductPayload.meta.collection, "products_catalog");
  assert.equal(ctx.erpProductPayload.meta.action, "create");
  assert.equal(ctx.erpProductPayload.data.name, "Hydraulic Press");
  assert.equal(ctx.erpProductPayload.data.companyId, ctx.companyPayload.data.id);
  assert.equal(ctx.erpProductPayload.data.type, "physical");

  ctx.productsAliasList = await runCliCapture(["products", "list", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.productsAliasList.code, CLI_EXIT_OK);
  ctx.productsAliasPayload = JSON.parse(ctx.productsAliasList.stdout) as { ok: boolean; data: Array<{ id: string; name: string }>; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.productsAliasPayload.ok, true);
  assert.equal(ctx.productsAliasPayload.meta.invokedCommand, "products");
  assert.equal(ctx.productsAliasPayload.meta.collection, "products_catalog");
  assert.equal(ctx.productsAliasPayload.meta.action, "list");
  assert.equal(ctx.productsAliasPayload.data.some((record) => record.id === ctx.erpProductPayload.data.id && record.name === "Hydraulic Press"), true);

  ctx.productSpecCreate = await runCliCapture(["product-spec", "create", "Hydraulic Press Spec", "--product", ctx.erpProductPayload.data.id, "--company", ctx.companyPayload.data.id, "--owner", ctx.employeePayload.data.id, "--sku", "PRESS-MODEL", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.productSpecCreate.code, CLI_EXIT_OK, ctx.productSpecCreate.stderr || ctx.productSpecCreate.stdout);
  ctx.productSpecPayload = JSON.parse(ctx.productSpecCreate.stdout) as { data: { id: string; title: string; productCatalogId: string; companyId: string; ownerEmployeeId: string; sku: string; status: string; lifecycleStage: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.productSpecPayload.meta.invokedCommand, "product-spec");
  assert.equal(ctx.productSpecPayload.meta.collection, "product_specs");
  assert.equal(ctx.productSpecPayload.meta.action, "create");
  assert.equal(ctx.productSpecPayload.data.title, "Hydraulic Press Spec");
  assert.equal(ctx.productSpecPayload.data.productCatalogId, ctx.erpProductPayload.data.id);
  assert.equal(ctx.productSpecPayload.data.companyId, ctx.companyPayload.data.id);
  assert.equal(ctx.productSpecPayload.data.ownerEmployeeId, ctx.employeePayload.data.id);
  assert.equal(ctx.productSpecPayload.data.status, "draft");
  assert.equal(ctx.productSpecPayload.data.lifecycleStage, "unknown");

  ctx.productRevisionCreate = await runCliCapture(["product-spec", ctx.productSpecPayload.data.id, "revisions", "add", "Revision A", "--product", ctx.erpProductPayload.data.id, "--revision", "A", "--status", "released", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.productRevisionCreate.code, CLI_EXIT_OK, ctx.productRevisionCreate.stderr || ctx.productRevisionCreate.stdout);
  ctx.productRevisionPayload = JSON.parse(ctx.productRevisionCreate.stdout) as { data: { id: string; title: string; productSpecId: string; productCatalogId: string; revision: string; status: string; changeType: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.productRevisionPayload.meta.invokedCommand, "product-spec");
  assert.equal(ctx.productRevisionPayload.meta.collection, "product_revisions");
  assert.equal(ctx.productRevisionPayload.meta.action, "create");
  assert.equal(ctx.productRevisionPayload.data.title, "Revision A");
  assert.equal(ctx.productRevisionPayload.data.productSpecId, ctx.productSpecPayload.data.id);
  assert.equal(ctx.productRevisionPayload.data.productCatalogId, ctx.erpProductPayload.data.id);
  assert.equal(ctx.productRevisionPayload.data.revision, "A");
  assert.equal(ctx.productRevisionPayload.data.status, "released");
  assert.equal(ctx.productRevisionPayload.data.changeType, "unknown");

  ctx.productRequirementCreate = await runCliCapture(["product-spec", ctx.productSpecPayload.data.id, "requirements", "add", "Emergency stop response", "--product", ctx.erpProductPayload.data.id, "--requirement-type", "quality", "--priority", "high", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.productRequirementCreate.code, CLI_EXIT_OK, ctx.productRequirementCreate.stderr || ctx.productRequirementCreate.stdout);
  ctx.productRequirementPayload = JSON.parse(ctx.productRequirementCreate.stdout) as { data: { id: string; title: string; productSpecId: string; productCatalogId: string; requirementType: string; priority: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.productRequirementPayload.meta.invokedCommand, "product-spec");
  assert.equal(ctx.productRequirementPayload.meta.collection, "product_requirements");
  assert.equal(ctx.productRequirementPayload.meta.action, "create");
  assert.equal(ctx.productRequirementPayload.data.title, "Emergency stop response");
  assert.equal(ctx.productRequirementPayload.data.productSpecId, ctx.productSpecPayload.data.id);
  assert.equal(ctx.productRequirementPayload.data.productCatalogId, ctx.erpProductPayload.data.id);
  assert.equal(ctx.productRequirementPayload.data.requirementType, "quality");
  assert.equal(ctx.productRequirementPayload.data.priority, "high");
  assert.equal(ctx.productRequirementPayload.data.status, "proposed");

  ctx.productBomCreate = await runCliCapture(["product-spec", ctx.productSpecPayload.data.id, "boms", "add", "Press frame BOM", "--product", ctx.erpProductPayload.data.id, "--component", ctx.erpProductPayload.data.id, "--quantity", "1", "--unit", "each", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.productBomCreate.code, CLI_EXIT_OK, ctx.productBomCreate.stderr || ctx.productBomCreate.stdout);
  ctx.productBomPayload = JSON.parse(ctx.productBomCreate.stdout) as { data: { id: string; title: string; productSpecId: string; productCatalogId: string; componentProductCatalogId: string; quantity: number; unit: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.productBomPayload.meta.invokedCommand, "product-spec");
  assert.equal(ctx.productBomPayload.meta.collection, "product_boms");
  assert.equal(ctx.productBomPayload.meta.action, "create");
  assert.equal(ctx.productBomPayload.data.title, "Press frame BOM");
  assert.equal(ctx.productBomPayload.data.productSpecId, ctx.productSpecPayload.data.id);
  assert.equal(ctx.productBomPayload.data.productCatalogId, ctx.erpProductPayload.data.id);
  assert.equal(ctx.productBomPayload.data.componentProductCatalogId, ctx.erpProductPayload.data.id);
  assert.equal(ctx.productBomPayload.data.quantity, 1);
  assert.equal(ctx.productBomPayload.data.unit, "each");
  assert.equal(ctx.productBomPayload.data.status, "draft");

  ctx.productSpecEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Spec approval note", "--kind", "document", "--collection-name", "product_specs", "--record-id", ctx.productSpecPayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.productSpecEvidenceSourceCreate.code, CLI_EXIT_OK);
  ctx.productSpecEvidenceSourcePayload = JSON.parse(ctx.productSpecEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(ctx.productSpecEvidenceSourcePayload.data.collectionName, "product_specs");
  assert.equal(ctx.productSpecEvidenceSourcePayload.data.recordId, ctx.productSpecPayload.data.id);

  ctx.productSpecGapCreate = await runCliCapture(["quality-gap", "create", "Missing validation report", "--target-collection", "product_specs", "--target-id", ctx.productSpecPayload.data.id, "--gap-kind", "missing", "--evidence-source-id", ctx.productSpecEvidenceSourcePayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.productSpecGapCreate.code, CLI_EXIT_OK);
  ctx.productSpecGapPayload = JSON.parse(ctx.productSpecGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(ctx.productSpecGapPayload.data.targetCollection, "product_specs");
  assert.equal(ctx.productSpecGapPayload.data.targetId, ctx.productSpecPayload.data.id);
  assert.equal(ctx.productSpecGapPayload.data.gapKind, "missing");

  ctx.productSpecTimeline = await runCliCapture(["product-spec", ctx.productSpecPayload.data.id, "timeline", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.productSpecTimeline.code, CLI_EXIT_OK, ctx.productSpecTimeline.stderr || ctx.productSpecTimeline.stdout);
  ctx.productSpecTimelinePayload = JSON.parse(ctx.productSpecTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: {
        subject: { id: string; label: string };
        product: { id: string; label: string } | null;
        company: { id: string; label: string } | null;
        owner: { id: string; label: string } | null;
        summary: { revisions: number; releasedRevisions: number; requirements: number; openRequirements: number; boms: number; releasedBoms: number; evidenceSources: number; qualityGaps: number; hasCatalogProduct: boolean; hasCompany: boolean };
        itemCount: number;
        items: Array<{ kind: string; label: string }>;
        gaps: Array<{ id: string; gapKind: string }>;
        partial: boolean;
      };
    };
  };
  assert.equal(ctx.productSpecTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.productSpecTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.productSpecTimelinePayload.data.semanticView.id, "product_spec.timeline");
  assert.equal(ctx.productSpecTimelinePayload.data.semanticView.systemId, "product");
  assert.equal(ctx.productSpecTimelinePayload.data.materializedView.subject.id, ctx.productSpecPayload.data.id);
  assert.equal(ctx.productSpecTimelinePayload.data.materializedView.subject.label, "Hydraulic Press Spec");
  assert.equal(ctx.productSpecTimelinePayload.data.materializedView.product?.id, ctx.erpProductPayload.data.id);
  assert.equal(ctx.productSpecTimelinePayload.data.materializedView.company?.id, ctx.companyPayload.data.id);
  assert.equal(ctx.productSpecTimelinePayload.data.materializedView.owner?.id, ctx.employeePayload.data.id);
  assert.equal(ctx.productSpecTimelinePayload.data.materializedView.summary.revisions, 1);
  assert.equal(ctx.productSpecTimelinePayload.data.materializedView.summary.releasedRevisions, 1);
  assert.equal(ctx.productSpecTimelinePayload.data.materializedView.summary.requirements, 1);
  assert.equal(ctx.productSpecTimelinePayload.data.materializedView.summary.openRequirements, 1);
  assert.equal(ctx.productSpecTimelinePayload.data.materializedView.summary.boms, 1);
  assert.equal(ctx.productSpecTimelinePayload.data.materializedView.summary.releasedBoms, 0);
  assert.equal(ctx.productSpecTimelinePayload.data.materializedView.summary.evidenceSources, 1);
  assert.equal(ctx.productSpecTimelinePayload.data.materializedView.summary.qualityGaps, 1);
  assert.equal(ctx.productSpecTimelinePayload.data.materializedView.summary.hasCatalogProduct, true);
  assert.equal(ctx.productSpecTimelinePayload.data.materializedView.summary.hasCompany, true);
  assert.equal(ctx.productSpecTimelinePayload.data.materializedView.partial, true);
  assert.equal(ctx.productSpecTimelinePayload.data.materializedView.itemCount >= 8, true);
  assert.equal(ctx.productSpecTimelinePayload.data.materializedView.items.some((item) => item.kind === "product_revision" && item.label === "Revision A"), true);
  assert.equal(ctx.productSpecTimelinePayload.data.materializedView.items.some((item) => item.kind === "product_requirement" && item.label === "Emergency stop response"), true);
  assert.equal(ctx.productSpecTimelinePayload.data.materializedView.items.some((item) => item.kind === "product_bom" && item.label === "Press frame BOM"), true);
  assert.equal(ctx.productSpecTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === ctx.productSpecGapPayload.data.id && gap.gapKind === "missing"), true);

  ctx.drugProductCreate = await runCliCapture(["drug-product", "create", "Example Therapy", "--product", ctx.erpProductPayload.data.id, "--product-spec", ctx.productSpecPayload.data.id, "--company", ctx.companyPayload.data.id, "--active-ingredient", "Examplemab", "--dosage-form", "tablet", "--strength", "10 mg", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.drugProductCreate.code, CLI_EXIT_OK, ctx.drugProductCreate.stderr || ctx.drugProductCreate.stdout);
  ctx.drugProductPayload = JSON.parse(ctx.drugProductCreate.stdout) as { data: { id: string; title: string; productCatalogId: string; productSpecId: string; companyId: string; activeIngredient: string; dosageForm: string; strength: string; status: string; regulatoryStatus: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.drugProductPayload.meta.invokedCommand, "drug-product");
  assert.equal(ctx.drugProductPayload.meta.collection, "drug_products");
  assert.equal(ctx.drugProductPayload.meta.action, "create");
  assert.equal(ctx.drugProductPayload.data.title, "Example Therapy");
  assert.equal(ctx.drugProductPayload.data.productCatalogId, ctx.erpProductPayload.data.id);
  assert.equal(ctx.drugProductPayload.data.productSpecId, ctx.productSpecPayload.data.id);
  assert.equal(ctx.drugProductPayload.data.companyId, ctx.companyPayload.data.id);
  assert.equal(ctx.drugProductPayload.data.activeIngredient, "Examplemab");
  assert.equal(ctx.drugProductPayload.data.dosageForm, "tablet");
  assert.equal(ctx.drugProductPayload.data.strength, "10 mg");
  assert.equal(ctx.drugProductPayload.data.status, "draft");
  assert.equal(ctx.drugProductPayload.data.regulatoryStatus, "unknown");

  ctx.batchRecordCreate = await runCliCapture(["drug-product", ctx.drugProductPayload.data.id, "batches", "add", "Batch B-001", "--company", ctx.companyPayload.data.id, "--batch-number", "B-001", "--status", "completed", "--quantity-produced", "1000", "--unit", "tablets", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.batchRecordCreate.code, CLI_EXIT_OK, ctx.batchRecordCreate.stderr || ctx.batchRecordCreate.stdout);
  ctx.batchRecordPayload = JSON.parse(ctx.batchRecordCreate.stdout) as { data: { id: string; title: string; drugProductId: string; companyId: string; batchNumber: string; status: string; quantityProduced: number; unit: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.batchRecordPayload.meta.invokedCommand, "drug-product");
  assert.equal(ctx.batchRecordPayload.meta.collection, "batch_records");
  assert.equal(ctx.batchRecordPayload.meta.action, "create");
  assert.equal(ctx.batchRecordPayload.data.title, "Batch B-001");
  assert.equal(ctx.batchRecordPayload.data.drugProductId, ctx.drugProductPayload.data.id);
  assert.equal(ctx.batchRecordPayload.data.companyId, ctx.companyPayload.data.id);
  assert.equal(ctx.batchRecordPayload.data.batchNumber, "B-001");
  assert.equal(ctx.batchRecordPayload.data.status, "completed");
  assert.equal(ctx.batchRecordPayload.data.quantityProduced, 1000);
  assert.equal(ctx.batchRecordPayload.data.unit, "tablets");

  ctx.lotReleaseCreate = await runCliCapture(["drug-product", ctx.drugProductPayload.data.id, "lot-releases", "add", "Lot release B-001", "--batch", ctx.batchRecordPayload.data.id, "--releaser", ctx.employeePayload.data.id, "--disposition", "release", "--status", "released", "--certificate-number", "COA-001", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.lotReleaseCreate.code, CLI_EXIT_OK, ctx.lotReleaseCreate.stderr || ctx.lotReleaseCreate.stdout);
  ctx.lotReleasePayload = JSON.parse(ctx.lotReleaseCreate.stdout) as { data: { id: string; title: string; drugProductId: string; batchRecordId: string; releasedByEmployeeId: string; disposition: string; status: string; certificateNumber: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.lotReleasePayload.meta.invokedCommand, "drug-product");
  assert.equal(ctx.lotReleasePayload.meta.collection, "lot_releases");
  assert.equal(ctx.lotReleasePayload.meta.action, "create");
  assert.equal(ctx.lotReleasePayload.data.title, "Lot release B-001");
  assert.equal(ctx.lotReleasePayload.data.drugProductId, ctx.drugProductPayload.data.id);
  assert.equal(ctx.lotReleasePayload.data.batchRecordId, ctx.batchRecordPayload.data.id);
  assert.equal(ctx.lotReleasePayload.data.releasedByEmployeeId, ctx.employeePayload.data.id);
  assert.equal(ctx.lotReleasePayload.data.disposition, "release");
  assert.equal(ctx.lotReleasePayload.data.status, "released");
  assert.equal(ctx.lotReleasePayload.data.certificateNumber, "COA-001");

  ctx.adverseEventCreate = await runCliCapture(["drug-product", ctx.drugProductPayload.data.id, "adverse-events", "add", "Headache safety event", "--patient", ctx.createdPatient.data.id, "--event-term", "Headache", "--seriousness", "non_serious", "--severity", "mild", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.adverseEventCreate.code, CLI_EXIT_OK, ctx.adverseEventCreate.stderr || ctx.adverseEventCreate.stdout);
  ctx.adverseEventPayload = JSON.parse(ctx.adverseEventCreate.stdout) as { data: { id: string; title: string; drugProductId: string; patientId: string; eventTerm: string; seriousness: string; severity: string; status: string; reportedAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.adverseEventPayload.meta.invokedCommand, "drug-product");
  assert.equal(ctx.adverseEventPayload.meta.collection, "adverse_events");
  assert.equal(ctx.adverseEventPayload.meta.action, "create");
  assert.equal(ctx.adverseEventPayload.data.title, "Headache safety event");
  assert.equal(ctx.adverseEventPayload.data.drugProductId, ctx.drugProductPayload.data.id);
  assert.equal(ctx.adverseEventPayload.data.patientId, ctx.createdPatient.data.id);
  assert.equal(ctx.adverseEventPayload.data.eventTerm, "Headache");
  assert.equal(ctx.adverseEventPayload.data.seriousness, "non_serious");
  assert.equal(ctx.adverseEventPayload.data.severity, "mild");
  assert.equal(ctx.adverseEventPayload.data.status, "draft");
  assert.equal(typeof ctx.adverseEventPayload.data.reportedAt, "string");

  ctx.drugProductEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Drug product dossier", "--kind", "document", "--collection-name", "drug_products", "--record-id", ctx.drugProductPayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.drugProductEvidenceSourceCreate.code, CLI_EXIT_OK);
  ctx.drugProductEvidenceSourcePayload = JSON.parse(ctx.drugProductEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(ctx.drugProductEvidenceSourcePayload.data.collectionName, "drug_products");
  assert.equal(ctx.drugProductEvidenceSourcePayload.data.recordId, ctx.drugProductPayload.data.id);

  ctx.drugProductGapCreate = await runCliCapture(["quality-gap", "create", "Missing validated submission", "--target-collection", "drug_products", "--target-id", ctx.drugProductPayload.data.id, "--gap-kind", "external_pending", "--evidence-source-id", ctx.drugProductEvidenceSourcePayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.drugProductGapCreate.code, CLI_EXIT_OK);
  ctx.drugProductGapPayload = JSON.parse(ctx.drugProductGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(ctx.drugProductGapPayload.data.targetCollection, "drug_products");
  assert.equal(ctx.drugProductGapPayload.data.targetId, ctx.drugProductPayload.data.id);
  assert.equal(ctx.drugProductGapPayload.data.gapKind, "external_pending");

  ctx.drugProductTimeline = await runCliCapture(["drug-product", ctx.drugProductPayload.data.id, "timeline", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.drugProductTimeline.code, CLI_EXIT_OK, ctx.drugProductTimeline.stderr || ctx.drugProductTimeline.stdout);
  ctx.drugProductTimelinePayload = JSON.parse(ctx.drugProductTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: {
        subject: { id: string; label: string };
        product: { id: string; label: string } | null;
        productSpec: { id: string; label: string } | null;
        company: { id: string; label: string } | null;
        summary: { batches: number; completedBatches: number; lotReleases: number; releasedLots: number; adverseEvents: number; seriousAdverseEvents: number; patients: number; evidenceSources: number; qualityGaps: number; hasCatalogProduct: boolean; hasProductSpec: boolean };
        itemCount: number;
        items: Array<{ kind: string; label: string }>;
        gaps: Array<{ id: string; gapKind: string }>;
        partial: boolean;
      };
    };
  };
  assert.equal(ctx.drugProductTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.drugProductTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.drugProductTimelinePayload.data.semanticView.id, "drug_product.timeline");
  assert.equal(ctx.drugProductTimelinePayload.data.semanticView.systemId, "pharma");
  assert.equal(ctx.drugProductTimelinePayload.data.materializedView.subject.id, ctx.drugProductPayload.data.id);
  assert.equal(ctx.drugProductTimelinePayload.data.materializedView.subject.label, "Example Therapy");
  assert.equal(ctx.drugProductTimelinePayload.data.materializedView.product?.id, ctx.erpProductPayload.data.id);
  assert.equal(ctx.drugProductTimelinePayload.data.materializedView.productSpec?.id, ctx.productSpecPayload.data.id);
  assert.equal(ctx.drugProductTimelinePayload.data.materializedView.company?.id, ctx.companyPayload.data.id);
  assert.equal(ctx.drugProductTimelinePayload.data.materializedView.summary.batches, 1);
  assert.equal(ctx.drugProductTimelinePayload.data.materializedView.summary.completedBatches, 1);
  assert.equal(ctx.drugProductTimelinePayload.data.materializedView.summary.lotReleases, 1);
  assert.equal(ctx.drugProductTimelinePayload.data.materializedView.summary.releasedLots, 1);
  assert.equal(ctx.drugProductTimelinePayload.data.materializedView.summary.adverseEvents, 1);
  assert.equal(ctx.drugProductTimelinePayload.data.materializedView.summary.seriousAdverseEvents, 0);
  assert.equal(ctx.drugProductTimelinePayload.data.materializedView.summary.patients, 1);
  assert.equal(ctx.drugProductTimelinePayload.data.materializedView.summary.evidenceSources, 1);
  assert.equal(ctx.drugProductTimelinePayload.data.materializedView.summary.qualityGaps, 1);
  assert.equal(ctx.drugProductTimelinePayload.data.materializedView.summary.hasCatalogProduct, true);
  assert.equal(ctx.drugProductTimelinePayload.data.materializedView.summary.hasProductSpec, true);
  assert.equal(ctx.drugProductTimelinePayload.data.materializedView.partial, true);
  assert.equal(ctx.drugProductTimelinePayload.data.materializedView.itemCount >= 9, true);
  assert.equal(ctx.drugProductTimelinePayload.data.materializedView.items.some((item) => item.kind === "batch_record" && item.label === "Batch B-001"), true);
  assert.equal(ctx.drugProductTimelinePayload.data.materializedView.items.some((item) => item.kind === "lot_release" && item.label === "Lot release B-001"), true);
  assert.equal(ctx.drugProductTimelinePayload.data.materializedView.items.some((item) => item.kind === "adverse_event" && item.label === "Headache safety event"), true);
  assert.equal(ctx.drugProductTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === ctx.drugProductGapPayload.data.id && gap.gapKind === "external_pending"), true);

  ctx.contentBrandCreate = await runCliCapture(["content-brand", "create", "Acme Editorial", "--company", ctx.companyPayload.data.id, "--slug", "acme-editorial", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.contentBrandCreate.code, CLI_EXIT_OK, ctx.contentBrandCreate.stderr || ctx.contentBrandCreate.stdout);
  ctx.contentBrandPayload = JSON.parse(ctx.contentBrandCreate.stdout) as { data: { id: string; name: string; companyId: string; status: string; defaultLocale: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.contentBrandPayload.meta.invokedCommand, "content-brand");
  assert.equal(ctx.contentBrandPayload.meta.collection, "content_brands");
  assert.equal(ctx.contentBrandPayload.meta.action, "create");
  assert.equal(ctx.contentBrandPayload.data.name, "Acme Editorial");
  assert.equal(ctx.contentBrandPayload.data.companyId, ctx.companyPayload.data.id);
  assert.equal(ctx.contentBrandPayload.data.status, "draft");
  assert.equal(ctx.contentBrandPayload.data.defaultLocale, "en-US");

  ctx.contentDestinationCreate = await runCliCapture(["content-destination", "create", "Acme Blog", "--brand", ctx.contentBrandPayload.data.id, "--kind", "blog", "--publish-policy", "approval_required", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.contentDestinationCreate.code, CLI_EXIT_OK, ctx.contentDestinationCreate.stderr || ctx.contentDestinationCreate.stdout);
  ctx.contentDestinationPayload = JSON.parse(ctx.contentDestinationCreate.stdout) as { data: { id: string; name: string; contentBrandId: string; kind: string; publishPolicy: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.contentDestinationPayload.meta.collection, "content_destinations");
  assert.equal(ctx.contentDestinationPayload.data.name, "Acme Blog");
  assert.equal(ctx.contentDestinationPayload.data.contentBrandId, ctx.contentBrandPayload.data.id);
  assert.equal(ctx.contentDestinationPayload.data.kind, "blog");
  assert.equal(ctx.contentDestinationPayload.data.publishPolicy, "approval_required");
  assert.equal(ctx.contentDestinationPayload.data.status, "draft");

  ctx.contentCampaignCreate = await runCliCapture(["content-campaign", "create", "Launch Campaign", "--brand", ctx.contentBrandPayload.data.id, "--slug", "launch-campaign", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.contentCampaignCreate.code, CLI_EXIT_OK, ctx.contentCampaignCreate.stderr || ctx.contentCampaignCreate.stdout);
  ctx.contentCampaignPayload = JSON.parse(ctx.contentCampaignCreate.stdout) as { data: { id: string; name: string; contentBrandId: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.contentCampaignPayload.meta.collection, "content_campaigns");
  assert.equal(ctx.contentCampaignPayload.data.name, "Launch Campaign");
  assert.equal(ctx.contentCampaignPayload.data.contentBrandId, ctx.contentBrandPayload.data.id);
  assert.equal(ctx.contentCampaignPayload.data.status, "planning");

  ctx.contentEntryCreate = await runCliCapture(["content-entry", "create", "Launch note", "--brand", ctx.contentBrandPayload.data.id, "--campaign", ctx.contentCampaignPayload.data.id, "--content-type", "article", "--canonical-format", "markdown", "--summary", "Launch announcement draft.", "--canonical-body", "Structured launch note.", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.contentEntryCreate.code, CLI_EXIT_OK, ctx.contentEntryCreate.stderr || ctx.contentEntryCreate.stdout);
  ctx.contentEntryPayload = JSON.parse(ctx.contentEntryCreate.stdout) as { data: { id: string; title: string; contentBrandId: string; contentCampaignId: string; contentType: string; canonicalFormat: string; status: string; currentRevisionNumber: number }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.contentEntryPayload.meta.collection, "content_entries");
  assert.equal(ctx.contentEntryPayload.data.title, "Launch note");
  assert.equal(ctx.contentEntryPayload.data.contentBrandId, ctx.contentBrandPayload.data.id);
  assert.equal(ctx.contentEntryPayload.data.contentCampaignId, ctx.contentCampaignPayload.data.id);
  assert.equal(ctx.contentEntryPayload.data.contentType, "article");
  assert.equal(ctx.contentEntryPayload.data.canonicalFormat, "markdown");
  assert.equal(ctx.contentEntryPayload.data.status, "draft");
  assert.equal(ctx.contentEntryPayload.data.currentRevisionNumber, 1);

  ctx.contentRevisionCreate = await runCliCapture(["content-entry", ctx.contentEntryPayload.data.id, "revisions", "add", "Launch note revision 1", "--revision-number", "1", "--body", "Structured launch note.", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.contentRevisionCreate.code, CLI_EXIT_OK, ctx.contentRevisionCreate.stderr || ctx.contentRevisionCreate.stdout);
  ctx.contentRevisionPayload = JSON.parse(ctx.contentRevisionCreate.stdout) as { data: { id: string; title: string; contentEntryId: string; revisionNumber: number; authoredAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.contentRevisionPayload.meta.collection, "content_revisions");
  assert.equal(ctx.contentRevisionPayload.data.title, "Launch note revision 1");
  assert.equal(ctx.contentRevisionPayload.data.contentEntryId, ctx.contentEntryPayload.data.id);
  assert.equal(ctx.contentRevisionPayload.data.revisionNumber, 1);
  assert.equal(typeof ctx.contentRevisionPayload.data.authoredAt, "string");

  ctx.contentVariantCreate = await runCliCapture(["content-entry", ctx.contentEntryPayload.data.id, "variants", "add", "Blog variant", "--destination", ctx.contentDestinationPayload.data.id, "--format", "markdown", "--body", "Blog-ready launch note.", "--status", "approved", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.contentVariantCreate.code, CLI_EXIT_OK, ctx.contentVariantCreate.stderr || ctx.contentVariantCreate.stdout);
  ctx.contentVariantPayload = JSON.parse(ctx.contentVariantCreate.stdout) as { data: { id: string; title: string; contentEntryId: string; contentDestinationId: string; format: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.contentVariantPayload.meta.collection, "content_variants");
  assert.equal(ctx.contentVariantPayload.data.title, "Blog variant");
  assert.equal(ctx.contentVariantPayload.data.contentEntryId, ctx.contentEntryPayload.data.id);
  assert.equal(ctx.contentVariantPayload.data.contentDestinationId, ctx.contentDestinationPayload.data.id);
  assert.equal(ctx.contentVariantPayload.data.status, "approved");

  ctx.contentApprovalCreate = await runCliCapture(["content-entry", ctx.contentEntryPayload.data.id, "approvals", "add", "--title", "Blog approval", "--variant", ctx.contentVariantPayload.data.id, "--destination", ctx.contentDestinationPayload.data.id, "--status", "approved", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.contentApprovalCreate.code, CLI_EXIT_OK, ctx.contentApprovalCreate.stderr || ctx.contentApprovalCreate.stdout);
  ctx.contentApprovalPayload = JSON.parse(ctx.contentApprovalCreate.stdout) as { data: { id: string; title: string; contentEntryId: string; contentVariantId: string; contentDestinationId: string; status: string; requestedAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.contentApprovalPayload.meta.collection, "content_approvals");
  assert.equal(ctx.contentApprovalPayload.data.title, "Blog approval");
  assert.equal(ctx.contentApprovalPayload.data.contentEntryId, ctx.contentEntryPayload.data.id);
  assert.equal(ctx.contentApprovalPayload.data.contentVariantId, ctx.contentVariantPayload.data.id);
  assert.equal(ctx.contentApprovalPayload.data.contentDestinationId, ctx.contentDestinationPayload.data.id);
  assert.equal(ctx.contentApprovalPayload.data.status, "approved");
  assert.equal(typeof ctx.contentApprovalPayload.data.requestedAt, "string");

  ctx.contentPublicationCreate = await runCliCapture(["content-entry", ctx.contentEntryPayload.data.id, "publications", "add", "--title", "Blog publication", "--variant", ctx.contentVariantPayload.data.id, "--destination", ctx.contentDestinationPayload.data.id, "--status", "published", "--external-url", "https://example.test/launch-note", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.contentPublicationCreate.code, CLI_EXIT_OK, ctx.contentPublicationCreate.stderr || ctx.contentPublicationCreate.stdout);
  ctx.contentPublicationPayload = JSON.parse(ctx.contentPublicationCreate.stdout) as { data: { id: string; title: string; contentEntryId: string; contentVariantId: string; contentDestinationId: string; status: string; externalUrl: string; attemptNumber: number }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.contentPublicationPayload.meta.collection, "content_publications");
  assert.equal(ctx.contentPublicationPayload.data.title, "Blog publication");
  assert.equal(ctx.contentPublicationPayload.data.contentEntryId, ctx.contentEntryPayload.data.id);
  assert.equal(ctx.contentPublicationPayload.data.contentVariantId, ctx.contentVariantPayload.data.id);
  assert.equal(ctx.contentPublicationPayload.data.contentDestinationId, ctx.contentDestinationPayload.data.id);
  assert.equal(ctx.contentPublicationPayload.data.status, "published");
  assert.equal(ctx.contentPublicationPayload.data.externalUrl, "https://example.test/launch-note");
  assert.equal(ctx.contentPublicationPayload.data.attemptNumber, 0);

  ctx.contentEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Content brief", "--kind", "document", "--collection-name", "content_entries", "--record-id", ctx.contentEntryPayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.contentEvidenceSourceCreate.code, CLI_EXIT_OK);
  ctx.contentEvidenceSourcePayload = JSON.parse(ctx.contentEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(ctx.contentEvidenceSourcePayload.data.collectionName, "content_entries");
  assert.equal(ctx.contentEvidenceSourcePayload.data.recordId, ctx.contentEntryPayload.data.id);

  ctx.contentGapCreate = await runCliCapture(["quality-gap", "create", "Provider receipt pending", "--target-collection", "content_entries", "--target-id", ctx.contentEntryPayload.data.id, "--gap-kind", "external_pending", "--evidence-source-id", ctx.contentEvidenceSourcePayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.contentGapCreate.code, CLI_EXIT_OK);
  ctx.contentGapPayload = JSON.parse(ctx.contentGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(ctx.contentGapPayload.data.targetCollection, "content_entries");
  assert.equal(ctx.contentGapPayload.data.targetId, ctx.contentEntryPayload.data.id);
  assert.equal(ctx.contentGapPayload.data.gapKind, "external_pending");

  ctx.contentEntryTimeline = await runCliCapture(["content-entry", ctx.contentEntryPayload.data.id, "timeline", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.contentEntryTimeline.code, CLI_EXIT_OK, ctx.contentEntryTimeline.stderr || ctx.contentEntryTimeline.stdout);
  ctx.contentEntryTimelinePayload = JSON.parse(ctx.contentEntryTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: {
        subject: { id: string; label: string };
        brand: { id: string; label: string } | null;
        campaign: { id: string; label: string } | null;
        summary: { revisions: number; variants: number; approvals: number; approvedApprovals: number; publications: number; publishedPublications: number; destinations: number; evidenceSources: number; qualityGaps: number; hasBrand: boolean; hasCampaign: boolean };
        itemCount: number;
        items: Array<{ kind: string; label: string }>;
        gaps: Array<{ id: string; gapKind: string }>;
        partial: boolean;
      };
    };
  };
  assert.equal(ctx.contentEntryTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.contentEntryTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.contentEntryTimelinePayload.data.semanticView.id, "content_entry.timeline");
  assert.equal(ctx.contentEntryTimelinePayload.data.semanticView.systemId, "content");
  assert.equal(ctx.contentEntryTimelinePayload.data.materializedView.subject.id, ctx.contentEntryPayload.data.id);
  assert.equal(ctx.contentEntryTimelinePayload.data.materializedView.subject.label, "Launch note");
  assert.equal(ctx.contentEntryTimelinePayload.data.materializedView.brand?.id, ctx.contentBrandPayload.data.id);
  assert.equal(ctx.contentEntryTimelinePayload.data.materializedView.campaign?.id, ctx.contentCampaignPayload.data.id);
  assert.equal(ctx.contentEntryTimelinePayload.data.materializedView.summary.revisions, 1);
  assert.equal(ctx.contentEntryTimelinePayload.data.materializedView.summary.variants, 1);
  assert.equal(ctx.contentEntryTimelinePayload.data.materializedView.summary.approvals, 1);
  assert.equal(ctx.contentEntryTimelinePayload.data.materializedView.summary.approvedApprovals, 1);
  assert.equal(ctx.contentEntryTimelinePayload.data.materializedView.summary.publications, 1);
  assert.equal(ctx.contentEntryTimelinePayload.data.materializedView.summary.publishedPublications, 1);
  assert.equal(ctx.contentEntryTimelinePayload.data.materializedView.summary.destinations, 1);
  assert.equal(ctx.contentEntryTimelinePayload.data.materializedView.summary.evidenceSources, 1);
  assert.equal(ctx.contentEntryTimelinePayload.data.materializedView.summary.qualityGaps, 1);
  assert.equal(ctx.contentEntryTimelinePayload.data.materializedView.summary.hasBrand, true);
  assert.equal(ctx.contentEntryTimelinePayload.data.materializedView.summary.hasCampaign, true);
  assert.equal(ctx.contentEntryTimelinePayload.data.materializedView.partial, true);
  assert.equal(ctx.contentEntryTimelinePayload.data.materializedView.itemCount >= 9, true);
  assert.equal(ctx.contentEntryTimelinePayload.data.materializedView.items.some((item) => item.kind === "content_revision" && item.label === "Launch note revision 1"), true);
  assert.equal(ctx.contentEntryTimelinePayload.data.materializedView.items.some((item) => item.kind === "content_variant" && item.label === "Blog variant"), true);
  assert.equal(ctx.contentEntryTimelinePayload.data.materializedView.items.some((item) => item.kind === "content_approval" && item.label === "Blog approval"), true);
  assert.equal(ctx.contentEntryTimelinePayload.data.materializedView.items.some((item) => item.kind === "content_publication" && item.label === "Blog publication"), true);
  assert.equal(ctx.contentEntryTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === ctx.contentGapPayload.data.id && gap.gapKind === "external_pending"), true);

  ctx.supplierCreate = await runCliCapture(["supplier", "create", "Parts Co", "--company", ctx.companyPayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.supplierCreate.code, CLI_EXIT_OK, ctx.supplierCreate.stderr || ctx.supplierCreate.stdout);
  ctx.supplierPayload = JSON.parse(ctx.supplierCreate.stdout) as { data: { id: string; name: string; companyId: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.supplierPayload.meta.invokedCommand, "supplier");
  assert.equal(ctx.supplierPayload.meta.collection, "suppliers");
  assert.equal(ctx.supplierPayload.meta.action, "create");
  assert.equal(ctx.supplierPayload.data.name, "Parts Co");
  assert.equal(ctx.supplierPayload.data.companyId, ctx.companyPayload.data.id);
  assert.equal(ctx.supplierPayload.data.status, "active");

  ctx.purchaseOrderCreate = await runCliCapture(["supplier", ctx.supplierPayload.data.id, "purchase-orders", "add", "PO-001", "--company", ctx.companyPayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.purchaseOrderCreate.code, CLI_EXIT_OK, ctx.purchaseOrderCreate.stderr || ctx.purchaseOrderCreate.stdout);
  ctx.purchaseOrderPayload = JSON.parse(ctx.purchaseOrderCreate.stdout) as { data: { id: string; number: string; supplierId: string; companyId: string; status: string; orderedAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.purchaseOrderPayload.meta.invokedCommand, "supplier");
  assert.equal(ctx.purchaseOrderPayload.meta.collection, "purchase_orders");
  assert.equal(ctx.purchaseOrderPayload.meta.action, "create");
  assert.equal(ctx.purchaseOrderPayload.data.number, "PO-001");
  assert.equal(ctx.purchaseOrderPayload.data.supplierId, ctx.supplierPayload.data.id);
  assert.equal(ctx.purchaseOrderPayload.data.companyId, ctx.companyPayload.data.id);
  assert.equal(ctx.purchaseOrderPayload.data.status, "draft");
  assert.equal(typeof ctx.purchaseOrderPayload.data.orderedAt, "string");

  ctx.purchaseOrderLineCreate = await runCliCapture(["purchase-order", ctx.purchaseOrderPayload.data.id, "line-items", "add", "Press frame", "--product", ctx.erpProductPayload.data.id, "--quantity", "2", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.purchaseOrderLineCreate.code, CLI_EXIT_OK, ctx.purchaseOrderLineCreate.stderr || ctx.purchaseOrderLineCreate.stdout);
  ctx.purchaseOrderLinePayload = JSON.parse(ctx.purchaseOrderLineCreate.stdout) as { data: { description: string; purchaseOrderId: string; productCatalogId: string; quantity: number; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.purchaseOrderLinePayload.meta.invokedCommand, "purchase-order");
  assert.equal(ctx.purchaseOrderLinePayload.meta.collection, "purchase_order_line_items");
  assert.equal(ctx.purchaseOrderLinePayload.meta.action, "create");
  assert.equal(ctx.purchaseOrderLinePayload.data.description, "Press frame");
  assert.equal(ctx.purchaseOrderLinePayload.data.purchaseOrderId, ctx.purchaseOrderPayload.data.id);
  assert.equal(ctx.purchaseOrderLinePayload.data.productCatalogId, ctx.erpProductPayload.data.id);
  assert.equal(ctx.purchaseOrderLinePayload.data.quantity, 2);
  assert.equal(ctx.purchaseOrderLinePayload.data.status, "ordered");

  ctx.directPurchaseOrderLineCreate = await runCliCapture(["purchase-order-line-item", "add", "--purchase-order", ctx.purchaseOrderPayload.data.id, "Direct line", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.directPurchaseOrderLineCreate.code, CLI_EXIT_OK, ctx.directPurchaseOrderLineCreate.stderr || ctx.directPurchaseOrderLineCreate.stdout);
  ctx.directPurchaseOrderLinePayload = JSON.parse(ctx.directPurchaseOrderLineCreate.stdout) as { data: { description: string; purchaseOrderId: string }; meta: { collection: string; invokedCommand: string } };
  assert.equal(ctx.directPurchaseOrderLinePayload.meta.invokedCommand, "purchase-order-line-item");
  assert.equal(ctx.directPurchaseOrderLinePayload.meta.collection, "purchase_order_line_items");
  assert.equal(ctx.directPurchaseOrderLinePayload.data.description, "Direct line");
  assert.equal(ctx.directPurchaseOrderLinePayload.data.purchaseOrderId, ctx.purchaseOrderPayload.data.id);

  ctx.purchaseOrderTimeline = await runCliCapture(["purchase-order", ctx.purchaseOrderPayload.data.id, "timeline", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.purchaseOrderTimeline.code, CLI_EXIT_OK, ctx.purchaseOrderTimeline.stderr || ctx.purchaseOrderTimeline.stdout);
  ctx.purchaseOrderTimelinePayload = JSON.parse(ctx.purchaseOrderTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: {
        subject: { id: string; label: string };
        supplier: { id: string; label: string } | null;
        company: { id: string; label: string } | null;
        summary: { lineItems: number; receivedLineItems: number };
        itemCount: number;
        items: Array<{ kind: string; label: string }>;
      };
    };
  };
  assert.equal(ctx.purchaseOrderTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.purchaseOrderTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.purchaseOrderTimelinePayload.data.semanticView.id, "purchase_order.timeline");
  assert.equal(ctx.purchaseOrderTimelinePayload.data.semanticView.systemId, "procurement");
  assert.equal(ctx.purchaseOrderTimelinePayload.data.materializedView.subject.id, ctx.purchaseOrderPayload.data.id);
  assert.equal(ctx.purchaseOrderTimelinePayload.data.materializedView.subject.label, "PO-001");
  assert.equal(ctx.purchaseOrderTimelinePayload.data.materializedView.supplier?.id, ctx.supplierPayload.data.id);
  assert.equal(ctx.purchaseOrderTimelinePayload.data.materializedView.company?.id, ctx.companyPayload.data.id);
  assert.equal(ctx.purchaseOrderTimelinePayload.data.materializedView.summary.lineItems, 2);
  assert.equal(ctx.purchaseOrderTimelinePayload.data.materializedView.summary.receivedLineItems, 0);
  assert.equal(ctx.purchaseOrderTimelinePayload.data.materializedView.itemCount >= 5, true);
  assert.equal(ctx.purchaseOrderTimelinePayload.data.materializedView.items.some((item) => item.kind === "purchase_order_line_item" && item.label === "Press frame"), true);

  ctx.warehouseCreate = await runCliCapture(["warehouse", "create", "Main Warehouse", "--company", ctx.companyPayload.data.id, "--code", "WH-1", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.warehouseCreate.code, CLI_EXIT_OK, ctx.warehouseCreate.stderr || ctx.warehouseCreate.stdout);
  ctx.warehousePayload = JSON.parse(ctx.warehouseCreate.stdout) as { data: { id: string; name: string; companyId: string; code: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.warehousePayload.meta.invokedCommand, "warehouse");
  assert.equal(ctx.warehousePayload.meta.collection, "warehouses");
  assert.equal(ctx.warehousePayload.meta.action, "create");
  assert.equal(ctx.warehousePayload.data.name, "Main Warehouse");
  assert.equal(ctx.warehousePayload.data.companyId, ctx.companyPayload.data.id);
  assert.equal(ctx.warehousePayload.data.status, "active");

  ctx.inventoryItemCreate = await runCliCapture(["warehouse", ctx.warehousePayload.data.id, "inventory-items", "add", "Press stock", "--product", ctx.erpProductPayload.data.id, "--quantity-on-hand", "3", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.inventoryItemCreate.code, CLI_EXIT_OK, ctx.inventoryItemCreate.stderr || ctx.inventoryItemCreate.stdout);
  ctx.inventoryItemPayload = JSON.parse(ctx.inventoryItemCreate.stdout) as { data: { id: string; name: string; warehouseId: string; productCatalogId: string; quantityOnHand: number; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.inventoryItemPayload.meta.invokedCommand, "warehouse");
  assert.equal(ctx.inventoryItemPayload.meta.collection, "inventory_items");
  assert.equal(ctx.inventoryItemPayload.meta.action, "create");
  assert.equal(ctx.inventoryItemPayload.data.name, "Press stock");
  assert.equal(ctx.inventoryItemPayload.data.warehouseId, ctx.warehousePayload.data.id);
  assert.equal(ctx.inventoryItemPayload.data.productCatalogId, ctx.erpProductPayload.data.id);
  assert.equal(ctx.inventoryItemPayload.data.quantityOnHand, 3);
  assert.equal(ctx.inventoryItemPayload.data.status, "in_stock");

  ctx.stockMovementCreate = await runCliCapture(["inventory-item", ctx.inventoryItemPayload.data.id, "stock-movements", "add", "Receipt", "--warehouse", ctx.warehousePayload.data.id, "--movement-type", "received", "--quantity", "3", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.stockMovementCreate.code, CLI_EXIT_OK, ctx.stockMovementCreate.stderr || ctx.stockMovementCreate.stdout);
  ctx.stockMovementPayload = JSON.parse(ctx.stockMovementCreate.stdout) as { data: { title: string; inventoryItemId: string; warehouseId: string; movementType: string; quantity: number; occurredAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.stockMovementPayload.meta.invokedCommand, "inventory-item");
  assert.equal(ctx.stockMovementPayload.meta.collection, "stock_movements");
  assert.equal(ctx.stockMovementPayload.meta.action, "create");
  assert.equal(ctx.stockMovementPayload.data.title, "Receipt");
  assert.equal(ctx.stockMovementPayload.data.inventoryItemId, ctx.inventoryItemPayload.data.id);
  assert.equal(ctx.stockMovementPayload.data.warehouseId, ctx.warehousePayload.data.id);
  assert.equal(ctx.stockMovementPayload.data.movementType, "received");
  assert.equal(ctx.stockMovementPayload.data.quantity, 3);
  assert.equal(typeof ctx.stockMovementPayload.data.occurredAt, "string");

  ctx.directStockMovementCreate = await runCliCapture(["stock-movement", "add", "--inventory-item", ctx.inventoryItemPayload.data.id, "--warehouse", ctx.warehousePayload.data.id, "Direct adjustment", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.directStockMovementCreate.code, CLI_EXIT_OK, ctx.directStockMovementCreate.stderr || ctx.directStockMovementCreate.stdout);
  ctx.directStockMovementPayload = JSON.parse(ctx.directStockMovementCreate.stdout) as { data: { title: string; inventoryItemId: string; warehouseId: string }; meta: { collection: string; invokedCommand: string } };
  assert.equal(ctx.directStockMovementPayload.meta.invokedCommand, "stock-movement");
  assert.equal(ctx.directStockMovementPayload.meta.collection, "stock_movements");
  assert.equal(ctx.directStockMovementPayload.data.title, "Direct adjustment");
  assert.equal(ctx.directStockMovementPayload.data.inventoryItemId, ctx.inventoryItemPayload.data.id);
  assert.equal(ctx.directStockMovementPayload.data.warehouseId, ctx.warehousePayload.data.id);

  ctx.warehouseTimeline = await runCliCapture(["warehouse", ctx.warehousePayload.data.id, "timeline", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.warehouseTimeline.code, CLI_EXIT_OK, ctx.warehouseTimeline.stderr || ctx.warehouseTimeline.stdout);
  ctx.warehouseTimelinePayload = JSON.parse(ctx.warehouseTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: {
        subject: { id: string; label: string };
        company: { id: string; label: string } | null;
        summary: { inventoryItems: number; stockMovements: number; products: number; quantityOnHand: number };
        itemCount: number;
        items: Array<{ kind: string; label: string }>;
      };
    };
  };
  assert.equal(ctx.warehouseTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.warehouseTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.warehouseTimelinePayload.data.semanticView.id, "warehouse.timeline");
  assert.equal(ctx.warehouseTimelinePayload.data.semanticView.systemId, "warehouse");
  assert.equal(ctx.warehouseTimelinePayload.data.materializedView.subject.id, ctx.warehousePayload.data.id);
  assert.equal(ctx.warehouseTimelinePayload.data.materializedView.subject.label, "Main Warehouse");
  assert.equal(ctx.warehouseTimelinePayload.data.materializedView.company?.id, ctx.companyPayload.data.id);
  assert.equal(ctx.warehouseTimelinePayload.data.materializedView.summary.inventoryItems, 1);
  assert.equal(ctx.warehouseTimelinePayload.data.materializedView.summary.stockMovements, 2);
  assert.equal(ctx.warehouseTimelinePayload.data.materializedView.summary.products, 1);
  assert.equal(ctx.warehouseTimelinePayload.data.materializedView.summary.quantityOnHand, 3);
  assert.equal(ctx.warehouseTimelinePayload.data.materializedView.itemCount >= 6, true);
  assert.equal(ctx.warehouseTimelinePayload.data.materializedView.items.some((item) => item.kind === "inventory_item" && item.label === "Press stock"), true);

  ctx.supplyPlanCreate = await runCliCapture(["supply-plan", "create", "Q2 supply plan", "--company", ctx.companyPayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.supplyPlanCreate.code, CLI_EXIT_OK, ctx.supplyPlanCreate.stderr || ctx.supplyPlanCreate.stdout);
  ctx.supplyPlanPayload = JSON.parse(ctx.supplyPlanCreate.stdout) as { data: { id: string; title: string; companyId: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.supplyPlanPayload.meta.invokedCommand, "supply-plan");
  assert.equal(ctx.supplyPlanPayload.meta.collection, "supply_plans");
  assert.equal(ctx.supplyPlanPayload.meta.action, "create");
  assert.equal(ctx.supplyPlanPayload.data.title, "Q2 supply plan");
  assert.equal(ctx.supplyPlanPayload.data.companyId, ctx.companyPayload.data.id);
  assert.equal(ctx.supplyPlanPayload.data.status, "draft");

  ctx.supplyPlanItemCreate = await runCliCapture(["supply-plan", ctx.supplyPlanPayload.data.id, "items", "add", "Press shortage", "--product", ctx.erpProductPayload.data.id, "--supplier", ctx.supplierPayload.data.id, "--purchase-order", ctx.purchaseOrderPayload.data.id, "--warehouse", ctx.warehousePayload.data.id, "--inventory-item", ctx.inventoryItemPayload.data.id, "--quantity-required", "5", "--quantity-available", "3", "--quantity-gap", "2", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.supplyPlanItemCreate.code, CLI_EXIT_OK, ctx.supplyPlanItemCreate.stderr || ctx.supplyPlanItemCreate.stdout);
  ctx.supplyPlanItemPayload = JSON.parse(ctx.supplyPlanItemCreate.stdout) as { data: { id: string; title: string; supplyPlanId: string; productCatalogId: string; supplierId: string; purchaseOrderId: string; warehouseId: string; inventoryItemId: string; quantityRequired: number; quantityAvailable: number; quantityGap: number; status: string; priority: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.supplyPlanItemPayload.meta.invokedCommand, "supply-plan");
  assert.equal(ctx.supplyPlanItemPayload.meta.collection, "supply_plan_items");
  assert.equal(ctx.supplyPlanItemPayload.meta.action, "create");
  assert.equal(ctx.supplyPlanItemPayload.data.title, "Press shortage");
  assert.equal(ctx.supplyPlanItemPayload.data.supplyPlanId, ctx.supplyPlanPayload.data.id);
  assert.equal(ctx.supplyPlanItemPayload.data.productCatalogId, ctx.erpProductPayload.data.id);
  assert.equal(ctx.supplyPlanItemPayload.data.supplierId, ctx.supplierPayload.data.id);
  assert.equal(ctx.supplyPlanItemPayload.data.purchaseOrderId, ctx.purchaseOrderPayload.data.id);
  assert.equal(ctx.supplyPlanItemPayload.data.warehouseId, ctx.warehousePayload.data.id);
  assert.equal(ctx.supplyPlanItemPayload.data.inventoryItemId, ctx.inventoryItemPayload.data.id);
  assert.equal(ctx.supplyPlanItemPayload.data.quantityRequired, 5);
  assert.equal(ctx.supplyPlanItemPayload.data.quantityAvailable, 3);
  assert.equal(ctx.supplyPlanItemPayload.data.quantityGap, 2);
  assert.equal(ctx.supplyPlanItemPayload.data.status, "planned");
  assert.equal(ctx.supplyPlanItemPayload.data.priority, "normal");

  ctx.supplyRiskCreate = await runCliCapture(["supply-plan", ctx.supplyPlanPayload.data.id, "risks", "add", "Supplier lead-time risk", "--supplier", ctx.supplierPayload.data.id, "--purchase-order", ctx.purchaseOrderPayload.data.id, "--warehouse", ctx.warehousePayload.data.id, "--inventory-item", ctx.inventoryItemPayload.data.id, "--risk-type", "lead_time", "--severity", "high", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.supplyRiskCreate.code, CLI_EXIT_OK, ctx.supplyRiskCreate.stderr || ctx.supplyRiskCreate.stdout);
  ctx.supplyRiskPayload = JSON.parse(ctx.supplyRiskCreate.stdout) as { data: { id: string; title: string; supplyPlanId: string; supplierId: string; purchaseOrderId: string; warehouseId: string; inventoryItemId: string; riskType: string; severity: string; status: string; identifiedAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.supplyRiskPayload.meta.invokedCommand, "supply-plan");
  assert.equal(ctx.supplyRiskPayload.meta.collection, "supply_risks");
  assert.equal(ctx.supplyRiskPayload.meta.action, "create");
  assert.equal(ctx.supplyRiskPayload.data.title, "Supplier lead-time risk");
  assert.equal(ctx.supplyRiskPayload.data.supplyPlanId, ctx.supplyPlanPayload.data.id);
  assert.equal(ctx.supplyRiskPayload.data.supplierId, ctx.supplierPayload.data.id);
  assert.equal(ctx.supplyRiskPayload.data.purchaseOrderId, ctx.purchaseOrderPayload.data.id);
  assert.equal(ctx.supplyRiskPayload.data.warehouseId, ctx.warehousePayload.data.id);
  assert.equal(ctx.supplyRiskPayload.data.inventoryItemId, ctx.inventoryItemPayload.data.id);
  assert.equal(ctx.supplyRiskPayload.data.riskType, "lead_time");
  assert.equal(ctx.supplyRiskPayload.data.severity, "high");
  assert.equal(ctx.supplyRiskPayload.data.status, "open");
  assert.equal(typeof ctx.supplyRiskPayload.data.identifiedAt, "string");

  ctx.directSupplyRiskCreate = await runCliCapture(["supply-risk", "add", "--supply-plan", ctx.supplyPlanPayload.data.id, "--supplier", ctx.supplierPayload.data.id, "Direct supplier risk", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.directSupplyRiskCreate.code, CLI_EXIT_OK, ctx.directSupplyRiskCreate.stderr || ctx.directSupplyRiskCreate.stdout);
  ctx.directSupplyRiskPayload = JSON.parse(ctx.directSupplyRiskCreate.stdout) as { data: { title: string; supplyPlanId: string; supplierId: string }; meta: { collection: string; invokedCommand: string } };
  assert.equal(ctx.directSupplyRiskPayload.meta.invokedCommand, "supply-risk");
  assert.equal(ctx.directSupplyRiskPayload.meta.collection, "supply_risks");
  assert.equal(ctx.directSupplyRiskPayload.data.title, "Direct supplier risk");
  assert.equal(ctx.directSupplyRiskPayload.data.supplyPlanId, ctx.supplyPlanPayload.data.id);
  assert.equal(ctx.directSupplyRiskPayload.data.supplierId, ctx.supplierPayload.data.id);

  ctx.supplyPlanTimeline = await runCliCapture(["supply-plan", ctx.supplyPlanPayload.data.id, "timeline", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.supplyPlanTimeline.code, CLI_EXIT_OK, ctx.supplyPlanTimeline.stderr || ctx.supplyPlanTimeline.stdout);
  ctx.supplyPlanTimelinePayload = JSON.parse(ctx.supplyPlanTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: {
        subject: { id: string; label: string };
        company: { id: string; label: string } | null;
        summary: { items: number; risks: number; suppliers: number; purchaseOrders: number; warehouses: number; inventoryItems: number; products: number; quantityRequired: number; quantityAvailable: number; quantityGap: number };
        itemCount: number;
        items: Array<{ kind: string; label: string }>;
      };
    };
  };
  assert.equal(ctx.supplyPlanTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.supplyPlanTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.supplyPlanTimelinePayload.data.semanticView.id, "supply_plan.timeline");
  assert.equal(ctx.supplyPlanTimelinePayload.data.semanticView.systemId, "supply_chain");
  assert.equal(ctx.supplyPlanTimelinePayload.data.materializedView.subject.id, ctx.supplyPlanPayload.data.id);
  assert.equal(ctx.supplyPlanTimelinePayload.data.materializedView.subject.label, "Q2 supply plan");
  assert.equal(ctx.supplyPlanTimelinePayload.data.materializedView.company?.id, ctx.companyPayload.data.id);
  assert.equal(ctx.supplyPlanTimelinePayload.data.materializedView.summary.items, 1);
  assert.equal(ctx.supplyPlanTimelinePayload.data.materializedView.summary.risks, 2);
  assert.equal(ctx.supplyPlanTimelinePayload.data.materializedView.summary.suppliers, 1);
  assert.equal(ctx.supplyPlanTimelinePayload.data.materializedView.summary.purchaseOrders, 1);
  assert.equal(ctx.supplyPlanTimelinePayload.data.materializedView.summary.warehouses, 1);
  assert.equal(ctx.supplyPlanTimelinePayload.data.materializedView.summary.inventoryItems, 1);
  assert.equal(ctx.supplyPlanTimelinePayload.data.materializedView.summary.products, 1);
  assert.equal(ctx.supplyPlanTimelinePayload.data.materializedView.summary.quantityRequired, 5);
  assert.equal(ctx.supplyPlanTimelinePayload.data.materializedView.summary.quantityAvailable, 3);
  assert.equal(ctx.supplyPlanTimelinePayload.data.materializedView.summary.quantityGap, 2);
  assert.equal(ctx.supplyPlanTimelinePayload.data.materializedView.itemCount >= 9, true);
  assert.equal(ctx.supplyPlanTimelinePayload.data.materializedView.items.some((item) => item.kind === "supply_plan_item" && item.label === "Press shortage"), true);

  ctx.carrierCreate = await runCliCapture(["carrier", "create", "Fast Freight", "--company", ctx.companyPayload.data.id, "--mode", "ltl", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.carrierCreate.code, CLI_EXIT_OK, ctx.carrierCreate.stderr || ctx.carrierCreate.stdout);
  ctx.carrierPayload = JSON.parse(ctx.carrierCreate.stdout) as { data: { id: string; name: string; companyId: string; mode: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.carrierPayload.meta.invokedCommand, "carrier");
  assert.equal(ctx.carrierPayload.meta.collection, "carriers");
  assert.equal(ctx.carrierPayload.data.name, "Fast Freight");
  assert.equal(ctx.carrierPayload.data.companyId, ctx.companyPayload.data.id);
  assert.equal(ctx.carrierPayload.data.mode, "ltl");
  assert.equal(ctx.carrierPayload.data.status, "active");

  ctx.shipmentCreate = await runCliCapture(["carrier", ctx.carrierPayload.data.id, "shipments", "add", "PO-001 inbound shipment", "--company", ctx.companyPayload.data.id, "--purchase-order", ctx.purchaseOrderPayload.data.id, "--warehouse", ctx.warehousePayload.data.id, "--tracking-number", "TRACK-001", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.shipmentCreate.code, CLI_EXIT_OK, ctx.shipmentCreate.stderr || ctx.shipmentCreate.stdout);
  ctx.shipmentPayload = JSON.parse(ctx.shipmentCreate.stdout) as { data: { id: string; title: string; carrierId: string; companyId: string; purchaseOrderId: string; warehouseId: string; trackingNumber: string; status: string; mode: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.shipmentPayload.meta.invokedCommand, "carrier");
  assert.equal(ctx.shipmentPayload.meta.collection, "shipments");
  assert.equal(ctx.shipmentPayload.data.title, "PO-001 inbound shipment");
  assert.equal(ctx.shipmentPayload.data.carrierId, ctx.carrierPayload.data.id);
  assert.equal(ctx.shipmentPayload.data.companyId, ctx.companyPayload.data.id);
  assert.equal(ctx.shipmentPayload.data.purchaseOrderId, ctx.purchaseOrderPayload.data.id);
  assert.equal(ctx.shipmentPayload.data.warehouseId, ctx.warehousePayload.data.id);
  assert.equal(ctx.shipmentPayload.data.trackingNumber, "TRACK-001");
  assert.equal(ctx.shipmentPayload.data.status, "planned");

  ctx.shipmentLegCreate = await runCliCapture(["shipment", ctx.shipmentPayload.data.id, "legs", "add", "Origin to warehouse", "--carrier", ctx.carrierPayload.data.id, "--sequence", "1", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.shipmentLegCreate.code, CLI_EXIT_OK, ctx.shipmentLegCreate.stderr || ctx.shipmentLegCreate.stdout);
  ctx.shipmentLegPayload = JSON.parse(ctx.shipmentLegCreate.stdout) as { data: { id: string; title: string; shipmentId: string; carrierId: string; sequence: number; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.shipmentLegPayload.meta.invokedCommand, "shipment");
  assert.equal(ctx.shipmentLegPayload.meta.collection, "shipment_legs");
  assert.equal(ctx.shipmentLegPayload.data.title, "Origin to warehouse");
  assert.equal(ctx.shipmentLegPayload.data.shipmentId, ctx.shipmentPayload.data.id);
  assert.equal(ctx.shipmentLegPayload.data.carrierId, ctx.carrierPayload.data.id);
  assert.equal(ctx.shipmentLegPayload.data.sequence, 1);
  assert.equal(ctx.shipmentLegPayload.data.status, "planned");

  ctx.freightRateCreate = await runCliCapture(["carrier", ctx.carrierPayload.data.id, "freight-rates", "add", "Fast Freight LTL", "--company", ctx.companyPayload.data.id, "--amount-cents", "15000", "--currency", "USD", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.freightRateCreate.code, CLI_EXIT_OK, ctx.freightRateCreate.stderr || ctx.freightRateCreate.stdout);
  ctx.freightRatePayload = JSON.parse(ctx.freightRateCreate.stdout) as { data: { id: string; title: string; carrierId: string; companyId: string; amountCents: number; currency: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.freightRatePayload.meta.invokedCommand, "carrier");
  assert.equal(ctx.freightRatePayload.meta.collection, "freight_rates");
  assert.equal(ctx.freightRatePayload.data.title, "Fast Freight LTL");
  assert.equal(ctx.freightRatePayload.data.carrierId, ctx.carrierPayload.data.id);
  assert.equal(ctx.freightRatePayload.data.companyId, ctx.companyPayload.data.id);
  assert.equal(ctx.freightRatePayload.data.amountCents, 15000);
  assert.equal(ctx.freightRatePayload.data.currency, "USD");
  assert.equal(ctx.freightRatePayload.data.status, "draft");

  ctx.shipmentEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Carrier tracking event", "--kind", "document", "--collection-name", "shipments", "--record-id", ctx.shipmentPayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.shipmentEvidenceSourceCreate.code, CLI_EXIT_OK);
  ctx.shipmentEvidenceSourcePayload = JSON.parse(ctx.shipmentEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(ctx.shipmentEvidenceSourcePayload.data.collectionName, "shipments");
  assert.equal(ctx.shipmentEvidenceSourcePayload.data.recordId, ctx.shipmentPayload.data.id);

  ctx.shipmentGapCreate = await runCliCapture(["quality-gap", "create", "Missing bill of lading", "--target-collection", "shipments", "--target-id", ctx.shipmentPayload.data.id, "--gap-kind", "missing", "--evidence-source-id", ctx.shipmentEvidenceSourcePayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.shipmentGapCreate.code, CLI_EXIT_OK);
  ctx.shipmentGapPayload = JSON.parse(ctx.shipmentGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(ctx.shipmentGapPayload.data.targetCollection, "shipments");
  assert.equal(ctx.shipmentGapPayload.data.targetId, ctx.shipmentPayload.data.id);
  assert.equal(ctx.shipmentGapPayload.data.gapKind, "missing");

  ctx.shipmentTimeline = await runCliCapture(["shipment", ctx.shipmentPayload.data.id, "timeline", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.shipmentTimeline.code, CLI_EXIT_OK, ctx.shipmentTimeline.stderr || ctx.shipmentTimeline.stdout);
  ctx.shipmentTimelinePayload = JSON.parse(ctx.shipmentTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: {
        subject: { id: string; label: string };
        summary: { legs: number; evidenceSources: number; qualityGaps: number; hasCarrier: boolean; hasPurchaseOrder: boolean; hasWarehouse: boolean };
        itemCount: number;
        partial: boolean;
        items: Array<{ kind: string; label: string; recordId: string }>;
        gaps: Array<{ id: string; gapKind: string }>;
      };
    };
  };
  assert.equal(ctx.shipmentTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.shipmentTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.shipmentTimelinePayload.data.semanticView.id, "shipment.timeline");
  assert.equal(ctx.shipmentTimelinePayload.data.semanticView.systemId, "transport");
  assert.equal(ctx.shipmentTimelinePayload.data.materializedView.subject.id, ctx.shipmentPayload.data.id);
  assert.equal(ctx.shipmentTimelinePayload.data.materializedView.subject.label, "PO-001 inbound shipment");
  assert.equal(ctx.shipmentTimelinePayload.data.materializedView.summary.legs, 1);
  assert.equal(ctx.shipmentTimelinePayload.data.materializedView.summary.evidenceSources, 1);
  assert.equal(ctx.shipmentTimelinePayload.data.materializedView.summary.qualityGaps, 1);
  assert.equal(ctx.shipmentTimelinePayload.data.materializedView.summary.hasCarrier, true);
  assert.equal(ctx.shipmentTimelinePayload.data.materializedView.summary.hasPurchaseOrder, true);
  assert.equal(ctx.shipmentTimelinePayload.data.materializedView.summary.hasWarehouse, true);
  assert.equal(ctx.shipmentTimelinePayload.data.materializedView.partial, true);
  assert.equal(ctx.shipmentTimelinePayload.data.materializedView.itemCount >= 6, true);
  assert.equal(ctx.shipmentTimelinePayload.data.materializedView.items.some((item) => item.kind === "shipment_leg" && item.label === "Origin to warehouse"), true);
  assert.equal(ctx.shipmentTimelinePayload.data.materializedView.items.some((item) => item.kind === "carrier" && item.label === "Fast Freight"), true);
  assert.equal(ctx.shipmentTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === ctx.shipmentGapPayload.data.id && gap.gapKind === "missing"), true);

  ctx.obligationCreate = await runCliCapture(["obligation", "create", "SOC 2 access review", "--company", ctx.companyPayload.data.id, "--authority", "SOC 2", "--reference", "CC6.2", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.obligationCreate.code, CLI_EXIT_OK, ctx.obligationCreate.stderr || ctx.obligationCreate.stdout);
  ctx.obligationPayload = JSON.parse(ctx.obligationCreate.stdout) as { data: { id: string; title: string; companyId: string; authority: string; reference: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.obligationPayload.meta.invokedCommand, "obligation");
  assert.equal(ctx.obligationPayload.meta.collection, "compliance_obligations");
  assert.equal(ctx.obligationPayload.meta.action, "create");
  assert.equal(ctx.obligationPayload.data.title, "SOC 2 access review");
  assert.equal(ctx.obligationPayload.data.companyId, ctx.companyPayload.data.id);
  assert.equal(ctx.obligationPayload.data.status, "under_review");

  ctx.controlCreate = await runCliCapture(["control", "create", "Quarterly access review", "--company", ctx.companyPayload.data.id, "--obligation", ctx.obligationPayload.data.id, "--owner", ctx.employeePayload.data.id, "--control-key", "AC-REV-001", "--framework", "SOC 2", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.controlCreate.code, CLI_EXIT_OK, ctx.controlCreate.stderr || ctx.controlCreate.stdout);
  ctx.controlPayload = JSON.parse(ctx.controlCreate.stdout) as { data: { id: string; title: string; companyId: string; obligationId: string; ownerEmployeeId: string; controlKey: string; framework: string; status: string; controlType: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.controlPayload.meta.invokedCommand, "control");
  assert.equal(ctx.controlPayload.meta.collection, "compliance_controls");
  assert.equal(ctx.controlPayload.meta.action, "create");
  assert.equal(ctx.controlPayload.data.title, "Quarterly access review");
  assert.equal(ctx.controlPayload.data.companyId, ctx.companyPayload.data.id);
  assert.equal(ctx.controlPayload.data.obligationId, ctx.obligationPayload.data.id);
  assert.equal(ctx.controlPayload.data.ownerEmployeeId, ctx.employeePayload.data.id);
  assert.equal(ctx.controlPayload.data.status, "draft");
  assert.equal(ctx.controlPayload.data.controlType, "governance");

  ctx.assessmentCreate = await runCliCapture(["control", ctx.controlPayload.data.id, "assessments", "add", "Q2 test", "--obligation", ctx.obligationPayload.data.id, "--result", "partial", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.assessmentCreate.code, CLI_EXIT_OK, ctx.assessmentCreate.stderr || ctx.assessmentCreate.stdout);
  ctx.assessmentPayload = JSON.parse(ctx.assessmentCreate.stdout) as { data: { id: string; title: string; controlId: string; obligationId: string; result: string; status: string; assessedAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.assessmentPayload.meta.invokedCommand, "control");
  assert.equal(ctx.assessmentPayload.meta.collection, "control_assessments");
  assert.equal(ctx.assessmentPayload.meta.action, "create");
  assert.equal(ctx.assessmentPayload.data.title, "Q2 test");
  assert.equal(ctx.assessmentPayload.data.controlId, ctx.controlPayload.data.id);
  assert.equal(ctx.assessmentPayload.data.obligationId, ctx.obligationPayload.data.id);
  assert.equal(ctx.assessmentPayload.data.result, "partial");
  assert.equal(ctx.assessmentPayload.data.status, "planned");
  assert.equal(typeof ctx.assessmentPayload.data.assessedAt, "string");

  ctx.findingCreate = await runCliCapture(["control", ctx.controlPayload.data.id, "findings", "add", "Missing reviewer sign-off", "--assessment", ctx.assessmentPayload.data.id, "--obligation", ctx.obligationPayload.data.id, "--severity", "high", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.findingCreate.code, CLI_EXIT_OK, ctx.findingCreate.stderr || ctx.findingCreate.stdout);
  ctx.findingPayload = JSON.parse(ctx.findingCreate.stdout) as { data: { id: string; title: string; controlId: string; assessmentId: string; obligationId: string; severity: string; status: string; identifiedAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.findingPayload.meta.invokedCommand, "control");
  assert.equal(ctx.findingPayload.meta.collection, "compliance_findings");
  assert.equal(ctx.findingPayload.meta.action, "create");
  assert.equal(ctx.findingPayload.data.title, "Missing reviewer sign-off");
  assert.equal(ctx.findingPayload.data.controlId, ctx.controlPayload.data.id);
  assert.equal(ctx.findingPayload.data.assessmentId, ctx.assessmentPayload.data.id);
  assert.equal(ctx.findingPayload.data.obligationId, ctx.obligationPayload.data.id);
  assert.equal(ctx.findingPayload.data.severity, "high");
  assert.equal(ctx.findingPayload.data.status, "open");
  assert.equal(typeof ctx.findingPayload.data.identifiedAt, "string");

  ctx.controlTimeline = await runCliCapture(["control", ctx.controlPayload.data.id, "timeline", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.controlTimeline.code, CLI_EXIT_OK, ctx.controlTimeline.stderr || ctx.controlTimeline.stdout);
  ctx.controlTimelinePayload = JSON.parse(ctx.controlTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: {
        subject: { id: string; label: string };
        company: { id: string; label: string } | null;
        obligation: { id: string; label: string } | null;
        summary: { assessments: number; findings: number; openFindings: number; passedAssessments: number; failedAssessments: number };
        itemCount: number;
        items: Array<{ kind: string; label: string }>;
      };
    };
  };
  assert.equal(ctx.controlTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.controlTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.controlTimelinePayload.data.semanticView.id, "control.timeline");
  assert.equal(ctx.controlTimelinePayload.data.semanticView.systemId, "compliance");
  assert.equal(ctx.controlTimelinePayload.data.materializedView.subject.id, ctx.controlPayload.data.id);
  assert.equal(ctx.controlTimelinePayload.data.materializedView.subject.label, "Quarterly access review");
  assert.equal(ctx.controlTimelinePayload.data.materializedView.company?.id, ctx.companyPayload.data.id);
  assert.equal(ctx.controlTimelinePayload.data.materializedView.obligation?.id, ctx.obligationPayload.data.id);
  assert.equal(ctx.controlTimelinePayload.data.materializedView.summary.assessments, 1);
  assert.equal(ctx.controlTimelinePayload.data.materializedView.summary.findings, 1);
  assert.equal(ctx.controlTimelinePayload.data.materializedView.summary.openFindings, 1);
  assert.equal(ctx.controlTimelinePayload.data.materializedView.summary.passedAssessments, 0);
  assert.equal(ctx.controlTimelinePayload.data.materializedView.summary.failedAssessments, 0);
  assert.equal(ctx.controlTimelinePayload.data.materializedView.itemCount >= 5, true);
  assert.equal(ctx.controlTimelinePayload.data.materializedView.items.some((item) => item.kind === "compliance_finding" && item.label === "Missing reviewer sign-off"), true);
  return ctx;
}
