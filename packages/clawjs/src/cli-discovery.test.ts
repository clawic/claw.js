import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { CLI_EXIT_DEGRADED, CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, runCli } from "./index.ts";
import { runCliCapture, useIsolatedClawDataRoot } from "./index-test-utils.ts";

test("runCli returns structured related matches for unknown JSON commands", async () => {
  const result = await runCliCapture(["peopel", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_USAGE);
  const payload = JSON.parse(result.stdout) as { ok: boolean; error: { code: string }; meta: { related: Array<{ canonicalCommand?: string }>; commandIntent: { status: string; execute: boolean; intent: { mappedCommand?: string } } } };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "unknown_command");
  assert.equal(payload.meta.related.some((entry) => entry.canonicalCommand === "people"), true);
  assert.equal(payload.meta.commandIntent.status, "candidate_alias");
  assert.equal(payload.meta.commandIntent.execute, false);
  assert.equal(payload.meta.commandIntent.intent.mappedCommand, "people");
});

test("runCli returns command-intent metadata for future unknown JSON phrases", async () => {
  const result = await runCliCapture(["house", "buy", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_USAGE);
  const payload = JSON.parse(result.stdout) as { ok: boolean; error: { code: string }; meta: { commandIntent: { status: string; execute: boolean; intent: { id: string; reportTarget: string } } } };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "unknown_command");
  assert.equal(payload.meta.commandIntent.status, "future");
  assert.equal(payload.meta.commandIntent.execute, false);
  assert.equal(payload.meta.commandIntent.intent.id, "cmd_intent_house_buy");
  assert.equal(payload.meta.commandIntent.intent.reportTarget, "github_discussions_ideas");
});

test("runCli routes graduated dense-data direct nouns through the shared database", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-dense-db-"));

  const patientCreate = await runCliCapture(["patient", "create", "Ada Patient", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(patientCreate.code, CLI_EXIT_OK);
  const createdPatient = JSON.parse(patientCreate.stdout) as {
    ok: boolean;
    data: { id: string; displayName: string };
    meta: { canonicalCommand: string; invokedCommand: string; collection: string; action: string };
  };
  assert.equal(createdPatient.ok, true);
  assert.equal(createdPatient.data.displayName, "Ada Patient");
  assert.equal(createdPatient.meta.canonicalCommand, "database");
  assert.equal(createdPatient.meta.invokedCommand, "patient");
  assert.equal(createdPatient.meta.collection, "patients");
  assert.equal(createdPatient.meta.action, "create");

  const patientList = await runCliCapture(["patient", "list", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(patientList.code, CLI_EXIT_OK);
  const patientPayload = JSON.parse(patientList.stdout) as {
    ok: boolean;
    data: Array<{ id: string; displayName: string }>;
    meta: { canonicalCommand: string; invokedCommand: string; collection: string; action: string };
  };
  assert.equal(patientPayload.ok, true);
  assert.equal(patientPayload.meta.canonicalCommand, "database");
  assert.equal(patientPayload.meta.invokedCommand, "patient");
  assert.equal(patientPayload.meta.collection, "patients");
  assert.equal(patientPayload.data.some((record) => record.displayName === "Ada Patient"), true);

  const patientsAliasList = await runCliCapture(["patients", "list", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(patientsAliasList.code, CLI_EXIT_OK);
  const patientsAliasPayload = JSON.parse(patientsAliasList.stdout) as { ok: boolean; data: Array<{ id: string; displayName: string }>; meta: { canonicalCommand: string; invokedCommand: string; collection: string; action: string } };
  assert.equal(patientsAliasPayload.ok, true);
  assert.equal(patientsAliasPayload.meta.canonicalCommand, "database");
  assert.equal(patientsAliasPayload.meta.invokedCommand, "patients");
  assert.equal(patientsAliasPayload.meta.collection, "patients");
  assert.equal(patientsAliasPayload.meta.action, "list");
  assert.equal(patientsAliasPayload.data.some((record) => record.id === createdPatient.data.id), true);

  const evidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Clinic note", "--kind", "document", "--collection-name", "patients", "--record-id", createdPatient.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(evidenceSourceCreate.code, CLI_EXIT_OK);
  const evidenceSourcePayload = JSON.parse(evidenceSourceCreate.stdout) as { data: { id: string; label: string; kind: string; collectionName: string; recordId: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(evidenceSourcePayload.meta.invokedCommand, "evidence-source");
  assert.equal(evidenceSourcePayload.meta.collection, "evidence_sources");
  assert.equal(evidenceSourcePayload.data.label, "Clinic note");
  assert.equal(evidenceSourcePayload.data.collectionName, "patients");
  assert.equal(evidenceSourcePayload.data.recordId, createdPatient.data.id);

  const qualityGapCreate = await runCliCapture(["quality-gap", "create", "Missing date of birth", "--target-collection", "patients", "--target-id", createdPatient.data.id, "--gap-kind", "missing", "--evidence-source-id", evidenceSourcePayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(qualityGapCreate.code, CLI_EXIT_OK);
  const qualityGapPayload = JSON.parse(qualityGapCreate.stdout) as { data: { id: string; label: string; targetCollection: string; targetId: string; gapKind: string; status: string; evidenceSourceId: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(qualityGapPayload.meta.invokedCommand, "quality-gap");
  assert.equal(qualityGapPayload.meta.collection, "quality_gaps");
  assert.equal(qualityGapPayload.data.label, "Missing date of birth");
  assert.equal(qualityGapPayload.data.targetCollection, "patients");
  assert.equal(qualityGapPayload.data.targetId, createdPatient.data.id);
  assert.equal(qualityGapPayload.data.gapKind, "missing");
  assert.equal(qualityGapPayload.data.status, "open");
  assert.equal(qualityGapPayload.data.evidenceSourceId, evidenceSourcePayload.data.id);

  const medicationCreate = await runCliCapture(["medication", "add", "--patient", createdPatient.data.id, "--name", "Atorvastatin", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(medicationCreate.code, CLI_EXIT_OK);
  const medicationPayload = JSON.parse(medicationCreate.stdout) as { data: { name: string; patientId: string }; meta: { collection: string; action: string } };
  assert.equal(medicationPayload.meta.collection, "medications");
  assert.equal(medicationPayload.meta.action, "create");
  assert.equal(medicationPayload.data.name, "Atorvastatin");
  assert.equal(medicationPayload.data.patientId, createdPatient.data.id);

  const patientMedications = await runCliCapture(["patient", createdPatient.data.id, "medications", "list", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(patientMedications.code, CLI_EXIT_OK);
  const patientMedicationsPayload = JSON.parse(patientMedications.stdout) as { data: Array<{ name: string; patientId: string }>; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(patientMedicationsPayload.meta.invokedCommand, "patient");
  assert.equal(patientMedicationsPayload.meta.collection, "medications");
  assert.equal(patientMedicationsPayload.meta.action, "list");
  assert.equal(patientMedicationsPayload.data.length, 1);
  assert.equal(patientMedicationsPayload.data[0]?.name, "Atorvastatin");
  assert.equal(patientMedicationsPayload.data[0]?.patientId, createdPatient.data.id);

  const symptomCreate = await runCliCapture(["patient", createdPatient.data.id, "symptoms", "add", "Headache", "--severity", "4", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(symptomCreate.code, CLI_EXIT_OK);
  const symptomPayload = JSON.parse(symptomCreate.stdout) as { data: { symptom: string; patientId: string; severity: number; loggedAt: string }; meta: { collection: string; action: string } };
  assert.equal(symptomPayload.meta.collection, "symptom_logs");
  assert.equal(symptomPayload.meta.action, "create");
  assert.equal(symptomPayload.data.symptom, "Headache");
  assert.equal(symptomPayload.data.patientId, createdPatient.data.id);
  assert.equal(symptomPayload.data.severity, 4);
  assert.equal(typeof symptomPayload.data.loggedAt, "string");

  const patientSymptoms = await runCliCapture(["patient", createdPatient.data.id, "symptoms", "list", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(patientSymptoms.code, CLI_EXIT_OK);
  const patientSymptomsPayload = JSON.parse(patientSymptoms.stdout) as { data: Array<{ symptom: string; patientId: string }>; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(patientSymptomsPayload.meta.invokedCommand, "patient");
  assert.equal(patientSymptomsPayload.meta.collection, "symptom_logs");
  assert.equal(patientSymptomsPayload.meta.action, "list");
  assert.equal(patientSymptomsPayload.data.length, 1);
  assert.equal(patientSymptomsPayload.data[0]?.symptom, "Headache");
  assert.equal(patientSymptomsPayload.data[0]?.patientId, createdPatient.data.id);

  const patientLabCreate = await runCliCapture(["patient", createdPatient.data.id, "lab", "add", "CBC panel", "--lab", "Central Lab", "--reported-at", "2026-05-17T00:00:00.000Z", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(patientLabCreate.code, CLI_EXIT_OK, patientLabCreate.stderr || patientLabCreate.stdout);
  const patientLabPayload = JSON.parse(patientLabCreate.stdout) as { data: { id: string; title: string; patientId: string; lab: string; reportedAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(patientLabPayload.meta.invokedCommand, "patient");
  assert.equal(patientLabPayload.meta.collection, "lab_results");
  assert.equal(patientLabPayload.meta.action, "create");
  assert.equal(patientLabPayload.data.title, "CBC panel");
  assert.equal(patientLabPayload.data.patientId, createdPatient.data.id);
  assert.equal(patientLabPayload.data.lab, "Central Lab");

  const patientLabs = await runCliCapture(["patient", createdPatient.data.id, "labs", "list", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(patientLabs.code, CLI_EXIT_OK);
  const patientLabsPayload = JSON.parse(patientLabs.stdout) as { data: Array<{ id: string; title: string; patientId: string }>; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(patientLabsPayload.meta.invokedCommand, "patient");
  assert.equal(patientLabsPayload.meta.collection, "lab_results");
  assert.equal(patientLabsPayload.meta.action, "list");
  assert.equal(patientLabsPayload.data.some((record) => record.id === patientLabPayload.data.id && record.patientId === createdPatient.data.id), true);

  const patientEncounterCreate = await runCliCapture(["patient", createdPatient.data.id, "encounter", "add", "Intake visit", "--encounter-type", "visit", "--started-at", "2026-05-17T00:00:00.000Z", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(patientEncounterCreate.code, CLI_EXIT_OK, patientEncounterCreate.stderr || patientEncounterCreate.stdout);
  const patientEncounterPayload = JSON.parse(patientEncounterCreate.stdout) as { data: { id: string; title: string; patientId: string; encounterType: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(patientEncounterPayload.meta.invokedCommand, "patient");
  assert.equal(patientEncounterPayload.meta.collection, "encounters");
  assert.equal(patientEncounterPayload.meta.action, "create");
  assert.equal(patientEncounterPayload.data.title, "Intake visit");
  assert.equal(patientEncounterPayload.data.patientId, createdPatient.data.id);
  assert.equal(patientEncounterPayload.data.encounterType, "visit");
  assert.equal(patientEncounterPayload.data.status, "planned");

  const patientEncounters = await runCliCapture(["patient", createdPatient.data.id, "encounters", "list", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(patientEncounters.code, CLI_EXIT_OK);
  const patientEncountersPayload = JSON.parse(patientEncounters.stdout) as { data: Array<{ id: string; title: string; patientId: string }>; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(patientEncountersPayload.meta.invokedCommand, "patient");
  assert.equal(patientEncountersPayload.meta.collection, "encounters");
  assert.equal(patientEncountersPayload.meta.action, "list");
  assert.equal(patientEncountersPayload.data.some((record) => record.id === patientEncounterPayload.data.id && record.patientId === createdPatient.data.id), true);

  const directEncounterCreate = await runCliCapture(["encounter", "add", "--patient", createdPatient.data.id, "--title", "Follow-up visit", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(directEncounterCreate.code, CLI_EXIT_OK, directEncounterCreate.stderr || directEncounterCreate.stdout);
  const directEncounterPayload = JSON.parse(directEncounterCreate.stdout) as { data: { title: string; patientId: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(directEncounterPayload.meta.invokedCommand, "encounter");
  assert.equal(directEncounterPayload.meta.collection, "encounters");
  assert.equal(directEncounterPayload.data.patientId, createdPatient.data.id);

  const directLabCreate = await runCliCapture(["lab", "add", "--patient", createdPatient.data.id, "--title", "Metabolic panel", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(directLabCreate.code, CLI_EXIT_OK, directLabCreate.stderr || directLabCreate.stdout);
  const directLabPayload = JSON.parse(directLabCreate.stdout) as { data: { title: string; patientId: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(directLabPayload.meta.invokedCommand, "lab");
  assert.equal(directLabPayload.meta.collection, "lab_results");
  assert.equal(directLabPayload.data.patientId, createdPatient.data.id);

  const healthGaps = await runCliCapture(["health", "gaps", "--json"], process.cwd());
  assert.equal(healthGaps.code, CLI_EXIT_OK);
  const gapsPayload = JSON.parse(healthGaps.stdout) as { data: { coverage: { executable: boolean }; registry: { systems: Array<{ id: string }> } }; meta: { denseData: boolean } };
  assert.equal(gapsPayload.meta.denseData, true);
  assert.equal(gapsPayload.data.coverage.executable, true);
  assert.equal(gapsPayload.data.registry.systems.some((system) => system.id === "health"), true);

  const patientTimeline = await runCliCapture(["patient", createdPatient.data.id, "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(patientTimeline.code, CLI_EXIT_OK, patientTimeline.stderr || patientTimeline.stdout);
  const patientTimelinePayload = JSON.parse(patientTimeline.stdout) as {
    data: {
      coverage: { executable: boolean; implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string; commandPattern: string };
      view: { operationId: string; requiredInputs: string[]; createsOrReads: string[] };
      materializedView: { subject: { id: string; label: string }; itemCount: number; partial: boolean; items: Array<{ kind: string; recordId: string; label: string }>; gaps: Array<{ id: string; gapKind: string }> };
    };
    meta: { denseData: boolean; semanticView: boolean };
  };
  assert.equal(patientTimelinePayload.meta.denseData, true);
  assert.equal(patientTimelinePayload.meta.semanticView, true);
  assert.equal(patientTimelinePayload.data.coverage.executable, true);
  assert.equal(patientTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(patientTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(patientTimelinePayload.data.semanticView.id, "patient.timeline");
  assert.equal(patientTimelinePayload.data.semanticView.systemId, "health");
  assert.equal(patientTimelinePayload.data.semanticView.commandPattern, "claw patient <id> timeline");
  assert.equal(patientTimelinePayload.data.view.operationId, "patient.timeline");
  assert.deepEqual(patientTimelinePayload.data.view.requiredInputs, ["patient_id"]);
  assert.equal(patientTimelinePayload.data.view.createsOrReads.includes("timeline_view"), true);
  assert.equal(patientTimelinePayload.data.materializedView.subject.id, createdPatient.data.id);
  assert.equal(patientTimelinePayload.data.materializedView.subject.label, "Ada Patient");
  assert.equal(patientTimelinePayload.data.materializedView.itemCount >= 9, true);
  assert.equal(patientTimelinePayload.data.materializedView.partial, true);
  assert.equal(patientTimelinePayload.data.materializedView.items.some((item) => item.kind === "encounter" && item.label === "Intake visit"), true);
  assert.equal(patientTimelinePayload.data.materializedView.items.some((item) => item.kind === "medication" && item.label === "Atorvastatin"), true);
  assert.equal(patientTimelinePayload.data.materializedView.items.some((item) => item.kind === "symptom" && item.label === "Headache"), true);
  assert.equal(patientTimelinePayload.data.materializedView.items.some((item) => item.kind === "lab_result" && item.label === "CBC panel"), true);
  assert.equal(patientTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === qualityGapPayload.data.id && gap.gapKind === "missing"), true);

  const companyCreate = await runCliCapture(["company", "create", "Acme Corp", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(companyCreate.code, CLI_EXIT_OK);
  const companyPayload = JSON.parse(companyCreate.stdout) as { data: { id: string; name: string }; meta: { collection: string; action: string } };
  assert.equal(companyPayload.meta.collection, "companies");
  assert.equal(companyPayload.meta.action, "create");
  assert.equal(companyPayload.data.name, "Acme Corp");

  const employeeCreate = await runCliCapture(["employee", "create", "Ada Employee", "--company", companyPayload.data.id, "--job-title", "Operations Lead", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(employeeCreate.code, CLI_EXIT_OK, employeeCreate.stderr || employeeCreate.stdout);
  const employeePayload = JSON.parse(employeeCreate.stdout) as { data: { id: string; displayName: string; companyId: string; jobTitle: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(employeePayload.meta.invokedCommand, "employee");
  assert.equal(employeePayload.meta.collection, "employees");
  assert.equal(employeePayload.meta.action, "create");
  assert.equal(employeePayload.data.displayName, "Ada Employee");
  assert.equal(employeePayload.data.companyId, companyPayload.data.id);
  assert.equal(employeePayload.data.status, "active");

  const employeeTimeOffCreate = await runCliCapture(["employee", employeePayload.data.id, "time-off", "add", "--kind", "vacation", "--start-date", "2026-06-01T00:00:00.000Z", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(employeeTimeOffCreate.code, CLI_EXIT_OK, employeeTimeOffCreate.stderr || employeeTimeOffCreate.stdout);
  const employeeTimeOffPayload = JSON.parse(employeeTimeOffCreate.stdout) as { data: { employeeId: string; kind: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(employeeTimeOffPayload.meta.invokedCommand, "employee");
  assert.equal(employeeTimeOffPayload.meta.collection, "time_off_requests");
  assert.equal(employeeTimeOffPayload.meta.action, "create");
  assert.equal(employeeTimeOffPayload.data.employeeId, employeePayload.data.id);
  assert.equal(employeeTimeOffPayload.data.kind, "vacation");
  assert.equal(employeeTimeOffPayload.data.status, "pending");

  const employeeReviewCreate = await runCliCapture(["employee", employeePayload.data.id, "reviews", "add", "--cycle-name", "2026 Q2", "--rating", "strong", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(employeeReviewCreate.code, CLI_EXIT_OK, employeeReviewCreate.stderr || employeeReviewCreate.stdout);
  const employeeReviewPayload = JSON.parse(employeeReviewCreate.stdout) as { data: { employeeId: string; cycleName: string; rating: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(employeeReviewPayload.meta.invokedCommand, "employee");
  assert.equal(employeeReviewPayload.meta.collection, "performance_reviews");
  assert.equal(employeeReviewPayload.data.employeeId, employeePayload.data.id);
  assert.equal(employeeReviewPayload.data.cycleName, "2026 Q2");
  assert.equal(employeeReviewPayload.data.status, "draft");

  const directTimeOffCreate = await runCliCapture(["time-off", "add", "--employee", employeePayload.data.id, "--kind", "sick", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(directTimeOffCreate.code, CLI_EXIT_OK, directTimeOffCreate.stderr || directTimeOffCreate.stdout);
  const directTimeOffPayload = JSON.parse(directTimeOffCreate.stdout) as { data: { employeeId: string; kind: string }; meta: { collection: string; invokedCommand: string } };
  assert.equal(directTimeOffPayload.meta.invokedCommand, "time-off");
  assert.equal(directTimeOffPayload.meta.collection, "time_off_requests");
  assert.equal(directTimeOffPayload.data.employeeId, employeePayload.data.id);
  assert.equal(directTimeOffPayload.data.kind, "sick");

  const employeeTimeline = await runCliCapture(["employee", employeePayload.data.id, "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(employeeTimeline.code, CLI_EXIT_OK, employeeTimeline.stderr || employeeTimeline.stdout);
  const employeeTimelinePayload = JSON.parse(employeeTimeline.stdout) as {
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
  assert.equal(employeeTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(employeeTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(employeeTimelinePayload.data.semanticView.id, "employee.timeline");
  assert.equal(employeeTimelinePayload.data.semanticView.systemId, "hr");
  assert.equal(employeeTimelinePayload.data.materializedView.subject.id, employeePayload.data.id);
  assert.equal(employeeTimelinePayload.data.materializedView.subject.label, "Ada Employee");
  assert.equal(employeeTimelinePayload.data.materializedView.summary.timeOffRequests, 2);
  assert.equal(employeeTimelinePayload.data.materializedView.summary.performanceReviews, 1);
  assert.equal(employeeTimelinePayload.data.materializedView.itemCount >= 4, true);
  assert.equal(employeeTimelinePayload.data.materializedView.items.some((item) => item.kind === "time_off_request" && item.label === "vacation"), true);
  assert.equal(employeeTimelinePayload.data.materializedView.items.some((item) => item.kind === "performance_review" && item.label === "2026 Q2"), true);

  const propertyCreate = await runCliCapture(["property", "create", "Main Street Loft", "--city", "Madrid", "--transaction", "rent", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(propertyCreate.code, CLI_EXIT_OK, propertyCreate.stderr || propertyCreate.stdout);
  const propertyPayload = JSON.parse(propertyCreate.stdout) as { data: { id: string; title: string; city: string; transaction: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(propertyPayload.meta.invokedCommand, "property");
  assert.equal(propertyPayload.meta.collection, "property_listings");
  assert.equal(propertyPayload.meta.action, "create");
  assert.equal(propertyPayload.data.title, "Main Street Loft");
  assert.equal(propertyPayload.data.city, "Madrid");
  assert.equal(propertyPayload.data.status, "draft");

  const propertyVisitCreate = await runCliCapture(["property", propertyPayload.data.id, "visits", "add", "--visitor-name", "Ada Visitor", "--rating", "4", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(propertyVisitCreate.code, CLI_EXIT_OK, propertyVisitCreate.stderr || propertyVisitCreate.stdout);
  const propertyVisitPayload = JSON.parse(propertyVisitCreate.stdout) as { data: { propertyListingId: string; visitorName: string; rating: number; visitedAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(propertyVisitPayload.meta.invokedCommand, "property");
  assert.equal(propertyVisitPayload.meta.collection, "property_visits");
  assert.equal(propertyVisitPayload.data.propertyListingId, propertyPayload.data.id);
  assert.equal(propertyVisitPayload.data.visitorName, "Ada Visitor");
  assert.equal(propertyVisitPayload.data.rating, 4);
  assert.equal(typeof propertyVisitPayload.data.visitedAt, "string");

  const propertyOfferCreate = await runCliCapture(["property", propertyPayload.data.id, "offer", "add", "--buyer-name", "Ada Buyer", "--amount-cents", "250000", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(propertyOfferCreate.code, CLI_EXIT_OK, propertyOfferCreate.stderr || propertyOfferCreate.stdout);
  const propertyOfferPayload = JSON.parse(propertyOfferCreate.stdout) as { data: { propertyListingId: string; buyerName: string; amountCents: number; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(propertyOfferPayload.meta.invokedCommand, "property");
  assert.equal(propertyOfferPayload.meta.collection, "property_offers");
  assert.equal(propertyOfferPayload.data.propertyListingId, propertyPayload.data.id);
  assert.equal(propertyOfferPayload.data.buyerName, "Ada Buyer");
  assert.equal(propertyOfferPayload.data.amountCents, 250000);
  assert.equal(propertyOfferPayload.data.status, "pending");

  const directPropertyOffer = await runCliCapture(["property-offer", "add", "--property", propertyPayload.data.id, "--buyer-name", "Direct Buyer", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(directPropertyOffer.code, CLI_EXIT_OK, directPropertyOffer.stderr || directPropertyOffer.stdout);
  const directPropertyOfferPayload = JSON.parse(directPropertyOffer.stdout) as { data: { propertyListingId: string; buyerName: string }; meta: { collection: string; invokedCommand: string } };
  assert.equal(directPropertyOfferPayload.meta.invokedCommand, "property-offer");
  assert.equal(directPropertyOfferPayload.meta.collection, "property_offers");
  assert.equal(directPropertyOfferPayload.data.propertyListingId, propertyPayload.data.id);
  assert.equal(directPropertyOfferPayload.data.buyerName, "Direct Buyer");

  const propertyTimeline = await runCliCapture(["property", propertyPayload.data.id, "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(propertyTimeline.code, CLI_EXIT_OK, propertyTimeline.stderr || propertyTimeline.stdout);
  const propertyTimelinePayload = JSON.parse(propertyTimeline.stdout) as {
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
  assert.equal(propertyTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(propertyTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(propertyTimelinePayload.data.semanticView.id, "property.timeline");
  assert.equal(propertyTimelinePayload.data.semanticView.systemId, "real_estate");
  assert.equal(propertyTimelinePayload.data.materializedView.subject.id, propertyPayload.data.id);
  assert.equal(propertyTimelinePayload.data.materializedView.subject.label, "Main Street Loft");
  assert.equal(propertyTimelinePayload.data.materializedView.summary.visits, 1);
  assert.equal(propertyTimelinePayload.data.materializedView.summary.offers, 2);
  assert.equal(propertyTimelinePayload.data.materializedView.itemCount >= 4, true);
  assert.equal(propertyTimelinePayload.data.materializedView.items.some((item) => item.kind === "property_visit" && item.label === "Ada Visitor"), true);
  assert.equal(propertyTimelinePayload.data.materializedView.items.some((item) => item.kind === "property_offer" && item.label === "Ada Buyer"), true);

  const insurancePolicyCreate = await runCliCapture(["insurance-policy", "create", "Home policy", "--provider", "Example Mutual", "--policy-number", "HOME-001", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(insurancePolicyCreate.code, CLI_EXIT_OK, insurancePolicyCreate.stderr || insurancePolicyCreate.stdout);
  const insurancePolicyPayload = JSON.parse(insurancePolicyCreate.stdout) as { data: { id: string; title: string; provider: string; policyNumber: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(insurancePolicyPayload.meta.invokedCommand, "insurance-policy");
  assert.equal(insurancePolicyPayload.meta.collection, "insurance_policies");
  assert.equal(insurancePolicyPayload.meta.action, "create");
  assert.equal(insurancePolicyPayload.data.title, "Home policy");
  assert.equal(insurancePolicyPayload.data.provider, "Example Mutual");
  assert.equal(insurancePolicyPayload.data.policyNumber, "HOME-001");

  const insuranceEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Policy PDF", "--kind", "document", "--collection-name", "insurance_policies", "--record-id", insurancePolicyPayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(insuranceEvidenceSourceCreate.code, CLI_EXIT_OK);
  const insuranceEvidenceSourcePayload = JSON.parse(insuranceEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(insuranceEvidenceSourcePayload.data.collectionName, "insurance_policies");
  assert.equal(insuranceEvidenceSourcePayload.data.recordId, insurancePolicyPayload.data.id);

  const insurancePolicyTimeline = await runCliCapture(["insurance-policy", insurancePolicyPayload.data.id, "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(insurancePolicyTimeline.code, CLI_EXIT_OK, insurancePolicyTimeline.stderr || insurancePolicyTimeline.stdout);
  const insurancePolicyTimelinePayload = JSON.parse(insurancePolicyTimeline.stdout) as {
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
  assert.equal(insurancePolicyTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(insurancePolicyTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(insurancePolicyTimelinePayload.data.semanticView.id, "insurance_policy.timeline");
  assert.equal(insurancePolicyTimelinePayload.data.semanticView.systemId, "insurance");
  assert.equal(insurancePolicyTimelinePayload.data.materializedView.subject.id, insurancePolicyPayload.data.id);
  assert.equal(insurancePolicyTimelinePayload.data.materializedView.subject.label, "Home policy");
  assert.equal(insurancePolicyTimelinePayload.data.materializedView.summary.evidenceSources, 1);
  assert.equal(insurancePolicyTimelinePayload.data.materializedView.itemCount >= 2, true);
  assert.equal(insurancePolicyTimelinePayload.data.materializedView.items.some((item) => item.kind === "evidence" && item.label === "Policy PDF"), true);

  const vehicleCreate = await runCliCapture(["db", "vehicle", "create", "EV", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(vehicleCreate.code, CLI_EXIT_OK, vehicleCreate.stderr || vehicleCreate.stdout);
  const vehiclePayload = JSON.parse(vehicleCreate.stdout) as { data: { id: string; name: string }; meta: { collection: string; action: string } };
  assert.equal(vehiclePayload.meta.collection, "vehicles");
  assert.equal(vehiclePayload.data.name, "EV");

  const vehicleInsurancePolicyCreate = await runCliCapture(["vehicle-insurance-policy", "add", "--vehicle", vehiclePayload.data.id, "--provider", "Example Mutual", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(vehicleInsurancePolicyCreate.code, CLI_EXIT_OK, vehicleInsurancePolicyCreate.stderr || vehicleInsurancePolicyCreate.stdout);
  const vehicleInsurancePolicyPayload = JSON.parse(vehicleInsurancePolicyCreate.stdout) as { data: { vehicleId: string; provider: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(vehicleInsurancePolicyPayload.meta.invokedCommand, "vehicle-insurance-policy");
  assert.equal(vehicleInsurancePolicyPayload.meta.collection, "vehicle_insurance_policies");
  assert.equal(vehicleInsurancePolicyPayload.meta.action, "create");
  assert.equal(vehicleInsurancePolicyPayload.data.vehicleId, vehiclePayload.data.id);
  assert.equal(vehicleInsurancePolicyPayload.data.provider, "Example Mutual");

  const vehicleMaintenanceCreate = await runCliCapture(["vehicle", vehiclePayload.data.id, "maintenance", "add", "Annual service", "--performed-by", "Example Garage", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(vehicleMaintenanceCreate.code, CLI_EXIT_OK, vehicleMaintenanceCreate.stderr || vehicleMaintenanceCreate.stdout);
  const vehicleMaintenancePayload = JSON.parse(vehicleMaintenanceCreate.stdout) as { data: { vehicleId: string; title: string; performedBy: string; performedAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(vehicleMaintenancePayload.meta.invokedCommand, "vehicle");
  assert.equal(vehicleMaintenancePayload.meta.collection, "vehicle_maintenance");
  assert.equal(vehicleMaintenancePayload.meta.action, "create");
  assert.equal(vehicleMaintenancePayload.data.vehicleId, vehiclePayload.data.id);
  assert.equal(vehicleMaintenancePayload.data.title, "Annual service");
  assert.equal(vehicleMaintenancePayload.data.performedBy, "Example Garage");
  assert.equal(typeof vehicleMaintenancePayload.data.performedAt, "string");

  const directVehicleMaintenanceCreate = await runCliCapture(["vehicle-maintenance", "add", "--vehicle", vehiclePayload.data.id, "Direct service", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(directVehicleMaintenanceCreate.code, CLI_EXIT_OK, directVehicleMaintenanceCreate.stderr || directVehicleMaintenanceCreate.stdout);
  const directVehicleMaintenancePayload = JSON.parse(directVehicleMaintenanceCreate.stdout) as { data: { vehicleId: string; title: string }; meta: { collection: string; invokedCommand: string } };
  assert.equal(directVehicleMaintenancePayload.meta.invokedCommand, "vehicle-maintenance");
  assert.equal(directVehicleMaintenancePayload.meta.collection, "vehicle_maintenance");
  assert.equal(directVehicleMaintenancePayload.data.vehicleId, vehiclePayload.data.id);
  assert.equal(directVehicleMaintenancePayload.data.title, "Direct service");

  const vehicleTimeline = await runCliCapture(["vehicle", vehiclePayload.data.id, "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(vehicleTimeline.code, CLI_EXIT_OK, vehicleTimeline.stderr || vehicleTimeline.stdout);
  const vehicleTimelinePayload = JSON.parse(vehicleTimeline.stdout) as {
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
  assert.equal(vehicleTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(vehicleTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(vehicleTimelinePayload.data.semanticView.id, "vehicle.timeline");
  assert.equal(vehicleTimelinePayload.data.semanticView.systemId, "maintenance");
  assert.equal(vehicleTimelinePayload.data.materializedView.subject.id, vehiclePayload.data.id);
  assert.equal(vehicleTimelinePayload.data.materializedView.subject.label, "EV");
  assert.equal(vehicleTimelinePayload.data.materializedView.summary.maintenanceRecords, 2);
  assert.equal(vehicleTimelinePayload.data.materializedView.summary.insurancePolicies, 1);
  assert.equal(vehicleTimelinePayload.data.materializedView.itemCount >= 4, true);
  assert.equal(vehicleTimelinePayload.data.materializedView.items.some((item) => item.kind === "vehicle_maintenance" && item.label === "Annual service"), true);
  assert.equal(vehicleTimelinePayload.data.materializedView.items.some((item) => item.kind === "vehicle_insurance_policy" && item.label === "Example Mutual"), true);

  const applianceCreate = await runCliCapture(["appliance", "create", "Washer", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(applianceCreate.code, CLI_EXIT_OK, applianceCreate.stderr || applianceCreate.stdout);
  const appliancePayload = JSON.parse(applianceCreate.stdout) as { data: { id: string; name: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(appliancePayload.meta.invokedCommand, "appliance");
  assert.equal(appliancePayload.meta.collection, "appliances");
  assert.equal(appliancePayload.data.name, "Washer");

  const applianceMaintenanceCreate = await runCliCapture(["appliance", appliancePayload.data.id, "maintenance", "add", "Washer service", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(applianceMaintenanceCreate.code, CLI_EXIT_OK, applianceMaintenanceCreate.stderr || applianceMaintenanceCreate.stdout);
  const applianceMaintenancePayload = JSON.parse(applianceMaintenanceCreate.stdout) as { data: { applianceId: string; title: string; performedAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(applianceMaintenancePayload.meta.invokedCommand, "appliance");
  assert.equal(applianceMaintenancePayload.meta.collection, "appliance_maintenance");
  assert.equal(applianceMaintenancePayload.data.applianceId, appliancePayload.data.id);
  assert.equal(applianceMaintenancePayload.data.title, "Washer service");
  assert.equal(typeof applianceMaintenancePayload.data.performedAt, "string");

  const directApplianceMaintenanceCreate = await runCliCapture(["appliance-maintenance", "add", "--appliance", appliancePayload.data.id, "Direct washer service", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(directApplianceMaintenanceCreate.code, CLI_EXIT_OK, directApplianceMaintenanceCreate.stderr || directApplianceMaintenanceCreate.stdout);
  const directApplianceMaintenancePayload = JSON.parse(directApplianceMaintenanceCreate.stdout) as { data: { applianceId: string; title: string }; meta: { collection: string; invokedCommand: string } };
  assert.equal(directApplianceMaintenancePayload.meta.invokedCommand, "appliance-maintenance");
  assert.equal(directApplianceMaintenancePayload.meta.collection, "appliance_maintenance");
  assert.equal(directApplianceMaintenancePayload.data.applianceId, appliancePayload.data.id);
  assert.equal(directApplianceMaintenancePayload.data.title, "Direct washer service");

  const accountCreate = await runCliCapture(["account", "create", "Acme Account", "--company", companyPayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(accountCreate.code, CLI_EXIT_OK);
  const accountPayload = JSON.parse(accountCreate.stdout) as { data: { id: string; name: string; companyId: string }; meta: { collection: string; action: string } };
  assert.equal(accountPayload.meta.collection, "accounts");
  assert.equal(accountPayload.data.name, "Acme Account");
  assert.equal(accountPayload.data.companyId, companyPayload.data.id);

  const dealCreate = await runCliCapture(["deal", "create", "Pilot", "--company", companyPayload.data.id, "--account-id", accountPayload.data.id, "--value-cents", "2500", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(dealCreate.code, CLI_EXIT_OK);
  const dealPayload = JSON.parse(dealCreate.stdout) as { data: { id: string; title: string; companyId: string; accountId: string; valueCents: number; status: string }; meta: { collection: string; action: string } };
  assert.equal(dealPayload.meta.collection, "deals");
  assert.equal(dealPayload.data.title, "Pilot");
  assert.equal(dealPayload.data.companyId, companyPayload.data.id);
  assert.equal(dealPayload.data.accountId, accountPayload.data.id);
  assert.equal(dealPayload.data.valueCents, 2500);
  assert.equal(dealPayload.data.status, "open");

  const erpProductCreate = await runCliCapture(["product", "create", "Hydraulic Press", "--company", companyPayload.data.id, "--type", "physical", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(erpProductCreate.code, CLI_EXIT_OK, erpProductCreate.stderr || erpProductCreate.stdout);
  const erpProductPayload = JSON.parse(erpProductCreate.stdout) as { data: { id: string; name: string; companyId: string; type: string; active: boolean }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(erpProductPayload.meta.invokedCommand, "product");
  assert.equal(erpProductPayload.meta.collection, "products_catalog");
  assert.equal(erpProductPayload.meta.action, "create");
  assert.equal(erpProductPayload.data.name, "Hydraulic Press");
  assert.equal(erpProductPayload.data.companyId, companyPayload.data.id);
  assert.equal(erpProductPayload.data.type, "physical");

  const productsAliasList = await runCliCapture(["products", "list", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(productsAliasList.code, CLI_EXIT_OK);
  const productsAliasPayload = JSON.parse(productsAliasList.stdout) as { ok: boolean; data: Array<{ id: string; name: string }>; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(productsAliasPayload.ok, true);
  assert.equal(productsAliasPayload.meta.invokedCommand, "products");
  assert.equal(productsAliasPayload.meta.collection, "products_catalog");
  assert.equal(productsAliasPayload.meta.action, "list");
  assert.equal(productsAliasPayload.data.some((record) => record.id === erpProductPayload.data.id && record.name === "Hydraulic Press"), true);

  const productSpecCreate = await runCliCapture(["product-spec", "create", "Hydraulic Press Spec", "--product", erpProductPayload.data.id, "--company", companyPayload.data.id, "--owner", employeePayload.data.id, "--sku", "PRESS-MODEL", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(productSpecCreate.code, CLI_EXIT_OK, productSpecCreate.stderr || productSpecCreate.stdout);
  const productSpecPayload = JSON.parse(productSpecCreate.stdout) as { data: { id: string; title: string; productCatalogId: string; companyId: string; ownerEmployeeId: string; sku: string; status: string; lifecycleStage: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(productSpecPayload.meta.invokedCommand, "product-spec");
  assert.equal(productSpecPayload.meta.collection, "product_specs");
  assert.equal(productSpecPayload.meta.action, "create");
  assert.equal(productSpecPayload.data.title, "Hydraulic Press Spec");
  assert.equal(productSpecPayload.data.productCatalogId, erpProductPayload.data.id);
  assert.equal(productSpecPayload.data.companyId, companyPayload.data.id);
  assert.equal(productSpecPayload.data.ownerEmployeeId, employeePayload.data.id);
  assert.equal(productSpecPayload.data.status, "draft");
  assert.equal(productSpecPayload.data.lifecycleStage, "unknown");

  const productRevisionCreate = await runCliCapture(["product-spec", productSpecPayload.data.id, "revisions", "add", "Revision A", "--product", erpProductPayload.data.id, "--revision", "A", "--status", "released", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(productRevisionCreate.code, CLI_EXIT_OK, productRevisionCreate.stderr || productRevisionCreate.stdout);
  const productRevisionPayload = JSON.parse(productRevisionCreate.stdout) as { data: { id: string; title: string; productSpecId: string; productCatalogId: string; revision: string; status: string; changeType: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(productRevisionPayload.meta.invokedCommand, "product-spec");
  assert.equal(productRevisionPayload.meta.collection, "product_revisions");
  assert.equal(productRevisionPayload.meta.action, "create");
  assert.equal(productRevisionPayload.data.title, "Revision A");
  assert.equal(productRevisionPayload.data.productSpecId, productSpecPayload.data.id);
  assert.equal(productRevisionPayload.data.productCatalogId, erpProductPayload.data.id);
  assert.equal(productRevisionPayload.data.revision, "A");
  assert.equal(productRevisionPayload.data.status, "released");
  assert.equal(productRevisionPayload.data.changeType, "unknown");

  const productRequirementCreate = await runCliCapture(["product-spec", productSpecPayload.data.id, "requirements", "add", "Emergency stop response", "--product", erpProductPayload.data.id, "--requirement-type", "quality", "--priority", "high", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(productRequirementCreate.code, CLI_EXIT_OK, productRequirementCreate.stderr || productRequirementCreate.stdout);
  const productRequirementPayload = JSON.parse(productRequirementCreate.stdout) as { data: { id: string; title: string; productSpecId: string; productCatalogId: string; requirementType: string; priority: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(productRequirementPayload.meta.invokedCommand, "product-spec");
  assert.equal(productRequirementPayload.meta.collection, "product_requirements");
  assert.equal(productRequirementPayload.meta.action, "create");
  assert.equal(productRequirementPayload.data.title, "Emergency stop response");
  assert.equal(productRequirementPayload.data.productSpecId, productSpecPayload.data.id);
  assert.equal(productRequirementPayload.data.productCatalogId, erpProductPayload.data.id);
  assert.equal(productRequirementPayload.data.requirementType, "quality");
  assert.equal(productRequirementPayload.data.priority, "high");
  assert.equal(productRequirementPayload.data.status, "proposed");

  const productBomCreate = await runCliCapture(["product-spec", productSpecPayload.data.id, "boms", "add", "Press frame BOM", "--product", erpProductPayload.data.id, "--component", erpProductPayload.data.id, "--quantity", "1", "--unit", "each", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(productBomCreate.code, CLI_EXIT_OK, productBomCreate.stderr || productBomCreate.stdout);
  const productBomPayload = JSON.parse(productBomCreate.stdout) as { data: { id: string; title: string; productSpecId: string; productCatalogId: string; componentProductCatalogId: string; quantity: number; unit: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(productBomPayload.meta.invokedCommand, "product-spec");
  assert.equal(productBomPayload.meta.collection, "product_boms");
  assert.equal(productBomPayload.meta.action, "create");
  assert.equal(productBomPayload.data.title, "Press frame BOM");
  assert.equal(productBomPayload.data.productSpecId, productSpecPayload.data.id);
  assert.equal(productBomPayload.data.productCatalogId, erpProductPayload.data.id);
  assert.equal(productBomPayload.data.componentProductCatalogId, erpProductPayload.data.id);
  assert.equal(productBomPayload.data.quantity, 1);
  assert.equal(productBomPayload.data.unit, "each");
  assert.equal(productBomPayload.data.status, "draft");

  const productSpecEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Spec approval note", "--kind", "document", "--collection-name", "product_specs", "--record-id", productSpecPayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(productSpecEvidenceSourceCreate.code, CLI_EXIT_OK);
  const productSpecEvidenceSourcePayload = JSON.parse(productSpecEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(productSpecEvidenceSourcePayload.data.collectionName, "product_specs");
  assert.equal(productSpecEvidenceSourcePayload.data.recordId, productSpecPayload.data.id);

  const productSpecGapCreate = await runCliCapture(["quality-gap", "create", "Missing validation report", "--target-collection", "product_specs", "--target-id", productSpecPayload.data.id, "--gap-kind", "missing", "--evidence-source-id", productSpecEvidenceSourcePayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(productSpecGapCreate.code, CLI_EXIT_OK);
  const productSpecGapPayload = JSON.parse(productSpecGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(productSpecGapPayload.data.targetCollection, "product_specs");
  assert.equal(productSpecGapPayload.data.targetId, productSpecPayload.data.id);
  assert.equal(productSpecGapPayload.data.gapKind, "missing");

  const productSpecTimeline = await runCliCapture(["product-spec", productSpecPayload.data.id, "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(productSpecTimeline.code, CLI_EXIT_OK, productSpecTimeline.stderr || productSpecTimeline.stdout);
  const productSpecTimelinePayload = JSON.parse(productSpecTimeline.stdout) as {
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
  assert.equal(productSpecTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(productSpecTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(productSpecTimelinePayload.data.semanticView.id, "product_spec.timeline");
  assert.equal(productSpecTimelinePayload.data.semanticView.systemId, "product");
  assert.equal(productSpecTimelinePayload.data.materializedView.subject.id, productSpecPayload.data.id);
  assert.equal(productSpecTimelinePayload.data.materializedView.subject.label, "Hydraulic Press Spec");
  assert.equal(productSpecTimelinePayload.data.materializedView.product?.id, erpProductPayload.data.id);
  assert.equal(productSpecTimelinePayload.data.materializedView.company?.id, companyPayload.data.id);
  assert.equal(productSpecTimelinePayload.data.materializedView.owner?.id, employeePayload.data.id);
  assert.equal(productSpecTimelinePayload.data.materializedView.summary.revisions, 1);
  assert.equal(productSpecTimelinePayload.data.materializedView.summary.releasedRevisions, 1);
  assert.equal(productSpecTimelinePayload.data.materializedView.summary.requirements, 1);
  assert.equal(productSpecTimelinePayload.data.materializedView.summary.openRequirements, 1);
  assert.equal(productSpecTimelinePayload.data.materializedView.summary.boms, 1);
  assert.equal(productSpecTimelinePayload.data.materializedView.summary.releasedBoms, 0);
  assert.equal(productSpecTimelinePayload.data.materializedView.summary.evidenceSources, 1);
  assert.equal(productSpecTimelinePayload.data.materializedView.summary.qualityGaps, 1);
  assert.equal(productSpecTimelinePayload.data.materializedView.summary.hasCatalogProduct, true);
  assert.equal(productSpecTimelinePayload.data.materializedView.summary.hasCompany, true);
  assert.equal(productSpecTimelinePayload.data.materializedView.partial, true);
  assert.equal(productSpecTimelinePayload.data.materializedView.itemCount >= 8, true);
  assert.equal(productSpecTimelinePayload.data.materializedView.items.some((item) => item.kind === "product_revision" && item.label === "Revision A"), true);
  assert.equal(productSpecTimelinePayload.data.materializedView.items.some((item) => item.kind === "product_requirement" && item.label === "Emergency stop response"), true);
  assert.equal(productSpecTimelinePayload.data.materializedView.items.some((item) => item.kind === "product_bom" && item.label === "Press frame BOM"), true);
  assert.equal(productSpecTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === productSpecGapPayload.data.id && gap.gapKind === "missing"), true);

  const drugProductCreate = await runCliCapture(["drug-product", "create", "Example Therapy", "--product", erpProductPayload.data.id, "--product-spec", productSpecPayload.data.id, "--company", companyPayload.data.id, "--active-ingredient", "Examplemab", "--dosage-form", "tablet", "--strength", "10 mg", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(drugProductCreate.code, CLI_EXIT_OK, drugProductCreate.stderr || drugProductCreate.stdout);
  const drugProductPayload = JSON.parse(drugProductCreate.stdout) as { data: { id: string; title: string; productCatalogId: string; productSpecId: string; companyId: string; activeIngredient: string; dosageForm: string; strength: string; status: string; regulatoryStatus: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(drugProductPayload.meta.invokedCommand, "drug-product");
  assert.equal(drugProductPayload.meta.collection, "drug_products");
  assert.equal(drugProductPayload.meta.action, "create");
  assert.equal(drugProductPayload.data.title, "Example Therapy");
  assert.equal(drugProductPayload.data.productCatalogId, erpProductPayload.data.id);
  assert.equal(drugProductPayload.data.productSpecId, productSpecPayload.data.id);
  assert.equal(drugProductPayload.data.companyId, companyPayload.data.id);
  assert.equal(drugProductPayload.data.activeIngredient, "Examplemab");
  assert.equal(drugProductPayload.data.dosageForm, "tablet");
  assert.equal(drugProductPayload.data.strength, "10 mg");
  assert.equal(drugProductPayload.data.status, "draft");
  assert.equal(drugProductPayload.data.regulatoryStatus, "unknown");

  const batchRecordCreate = await runCliCapture(["drug-product", drugProductPayload.data.id, "batches", "add", "Batch B-001", "--company", companyPayload.data.id, "--batch-number", "B-001", "--status", "completed", "--quantity-produced", "1000", "--unit", "tablets", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(batchRecordCreate.code, CLI_EXIT_OK, batchRecordCreate.stderr || batchRecordCreate.stdout);
  const batchRecordPayload = JSON.parse(batchRecordCreate.stdout) as { data: { id: string; title: string; drugProductId: string; companyId: string; batchNumber: string; status: string; quantityProduced: number; unit: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(batchRecordPayload.meta.invokedCommand, "drug-product");
  assert.equal(batchRecordPayload.meta.collection, "batch_records");
  assert.equal(batchRecordPayload.meta.action, "create");
  assert.equal(batchRecordPayload.data.title, "Batch B-001");
  assert.equal(batchRecordPayload.data.drugProductId, drugProductPayload.data.id);
  assert.equal(batchRecordPayload.data.companyId, companyPayload.data.id);
  assert.equal(batchRecordPayload.data.batchNumber, "B-001");
  assert.equal(batchRecordPayload.data.status, "completed");
  assert.equal(batchRecordPayload.data.quantityProduced, 1000);
  assert.equal(batchRecordPayload.data.unit, "tablets");

  const lotReleaseCreate = await runCliCapture(["drug-product", drugProductPayload.data.id, "lot-releases", "add", "Lot release B-001", "--batch", batchRecordPayload.data.id, "--releaser", employeePayload.data.id, "--disposition", "release", "--status", "released", "--certificate-number", "COA-001", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(lotReleaseCreate.code, CLI_EXIT_OK, lotReleaseCreate.stderr || lotReleaseCreate.stdout);
  const lotReleasePayload = JSON.parse(lotReleaseCreate.stdout) as { data: { id: string; title: string; drugProductId: string; batchRecordId: string; releasedByEmployeeId: string; disposition: string; status: string; certificateNumber: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(lotReleasePayload.meta.invokedCommand, "drug-product");
  assert.equal(lotReleasePayload.meta.collection, "lot_releases");
  assert.equal(lotReleasePayload.meta.action, "create");
  assert.equal(lotReleasePayload.data.title, "Lot release B-001");
  assert.equal(lotReleasePayload.data.drugProductId, drugProductPayload.data.id);
  assert.equal(lotReleasePayload.data.batchRecordId, batchRecordPayload.data.id);
  assert.equal(lotReleasePayload.data.releasedByEmployeeId, employeePayload.data.id);
  assert.equal(lotReleasePayload.data.disposition, "release");
  assert.equal(lotReleasePayload.data.status, "released");
  assert.equal(lotReleasePayload.data.certificateNumber, "COA-001");

  const adverseEventCreate = await runCliCapture(["drug-product", drugProductPayload.data.id, "adverse-events", "add", "Headache safety event", "--patient", createdPatient.data.id, "--event-term", "Headache", "--seriousness", "non_serious", "--severity", "mild", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(adverseEventCreate.code, CLI_EXIT_OK, adverseEventCreate.stderr || adverseEventCreate.stdout);
  const adverseEventPayload = JSON.parse(adverseEventCreate.stdout) as { data: { id: string; title: string; drugProductId: string; patientId: string; eventTerm: string; seriousness: string; severity: string; status: string; reportedAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(adverseEventPayload.meta.invokedCommand, "drug-product");
  assert.equal(adverseEventPayload.meta.collection, "adverse_events");
  assert.equal(adverseEventPayload.meta.action, "create");
  assert.equal(adverseEventPayload.data.title, "Headache safety event");
  assert.equal(adverseEventPayload.data.drugProductId, drugProductPayload.data.id);
  assert.equal(adverseEventPayload.data.patientId, createdPatient.data.id);
  assert.equal(adverseEventPayload.data.eventTerm, "Headache");
  assert.equal(adverseEventPayload.data.seriousness, "non_serious");
  assert.equal(adverseEventPayload.data.severity, "mild");
  assert.equal(adverseEventPayload.data.status, "draft");
  assert.equal(typeof adverseEventPayload.data.reportedAt, "string");

  const drugProductEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Drug product dossier", "--kind", "document", "--collection-name", "drug_products", "--record-id", drugProductPayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(drugProductEvidenceSourceCreate.code, CLI_EXIT_OK);
  const drugProductEvidenceSourcePayload = JSON.parse(drugProductEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(drugProductEvidenceSourcePayload.data.collectionName, "drug_products");
  assert.equal(drugProductEvidenceSourcePayload.data.recordId, drugProductPayload.data.id);

  const drugProductGapCreate = await runCliCapture(["quality-gap", "create", "Missing validated submission", "--target-collection", "drug_products", "--target-id", drugProductPayload.data.id, "--gap-kind", "external_pending", "--evidence-source-id", drugProductEvidenceSourcePayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(drugProductGapCreate.code, CLI_EXIT_OK);
  const drugProductGapPayload = JSON.parse(drugProductGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(drugProductGapPayload.data.targetCollection, "drug_products");
  assert.equal(drugProductGapPayload.data.targetId, drugProductPayload.data.id);
  assert.equal(drugProductGapPayload.data.gapKind, "external_pending");

  const drugProductTimeline = await runCliCapture(["drug-product", drugProductPayload.data.id, "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(drugProductTimeline.code, CLI_EXIT_OK, drugProductTimeline.stderr || drugProductTimeline.stdout);
  const drugProductTimelinePayload = JSON.parse(drugProductTimeline.stdout) as {
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
  assert.equal(drugProductTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(drugProductTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(drugProductTimelinePayload.data.semanticView.id, "drug_product.timeline");
  assert.equal(drugProductTimelinePayload.data.semanticView.systemId, "pharma");
  assert.equal(drugProductTimelinePayload.data.materializedView.subject.id, drugProductPayload.data.id);
  assert.equal(drugProductTimelinePayload.data.materializedView.subject.label, "Example Therapy");
  assert.equal(drugProductTimelinePayload.data.materializedView.product?.id, erpProductPayload.data.id);
  assert.equal(drugProductTimelinePayload.data.materializedView.productSpec?.id, productSpecPayload.data.id);
  assert.equal(drugProductTimelinePayload.data.materializedView.company?.id, companyPayload.data.id);
  assert.equal(drugProductTimelinePayload.data.materializedView.summary.batches, 1);
  assert.equal(drugProductTimelinePayload.data.materializedView.summary.completedBatches, 1);
  assert.equal(drugProductTimelinePayload.data.materializedView.summary.lotReleases, 1);
  assert.equal(drugProductTimelinePayload.data.materializedView.summary.releasedLots, 1);
  assert.equal(drugProductTimelinePayload.data.materializedView.summary.adverseEvents, 1);
  assert.equal(drugProductTimelinePayload.data.materializedView.summary.seriousAdverseEvents, 0);
  assert.equal(drugProductTimelinePayload.data.materializedView.summary.patients, 1);
  assert.equal(drugProductTimelinePayload.data.materializedView.summary.evidenceSources, 1);
  assert.equal(drugProductTimelinePayload.data.materializedView.summary.qualityGaps, 1);
  assert.equal(drugProductTimelinePayload.data.materializedView.summary.hasCatalogProduct, true);
  assert.equal(drugProductTimelinePayload.data.materializedView.summary.hasProductSpec, true);
  assert.equal(drugProductTimelinePayload.data.materializedView.partial, true);
  assert.equal(drugProductTimelinePayload.data.materializedView.itemCount >= 9, true);
  assert.equal(drugProductTimelinePayload.data.materializedView.items.some((item) => item.kind === "batch_record" && item.label === "Batch B-001"), true);
  assert.equal(drugProductTimelinePayload.data.materializedView.items.some((item) => item.kind === "lot_release" && item.label === "Lot release B-001"), true);
  assert.equal(drugProductTimelinePayload.data.materializedView.items.some((item) => item.kind === "adverse_event" && item.label === "Headache safety event"), true);
  assert.equal(drugProductTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === drugProductGapPayload.data.id && gap.gapKind === "external_pending"), true);

  const contentBrandCreate = await runCliCapture(["content-brand", "create", "Acme Editorial", "--company", companyPayload.data.id, "--slug", "acme-editorial", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(contentBrandCreate.code, CLI_EXIT_OK, contentBrandCreate.stderr || contentBrandCreate.stdout);
  const contentBrandPayload = JSON.parse(contentBrandCreate.stdout) as { data: { id: string; name: string; companyId: string; status: string; defaultLocale: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(contentBrandPayload.meta.invokedCommand, "content-brand");
  assert.equal(contentBrandPayload.meta.collection, "content_brands");
  assert.equal(contentBrandPayload.meta.action, "create");
  assert.equal(contentBrandPayload.data.name, "Acme Editorial");
  assert.equal(contentBrandPayload.data.companyId, companyPayload.data.id);
  assert.equal(contentBrandPayload.data.status, "draft");
  assert.equal(contentBrandPayload.data.defaultLocale, "en-US");

  const contentDestinationCreate = await runCliCapture(["content-destination", "create", "Acme Blog", "--brand", contentBrandPayload.data.id, "--kind", "blog", "--publish-policy", "approval_required", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(contentDestinationCreate.code, CLI_EXIT_OK, contentDestinationCreate.stderr || contentDestinationCreate.stdout);
  const contentDestinationPayload = JSON.parse(contentDestinationCreate.stdout) as { data: { id: string; name: string; contentBrandId: string; kind: string; publishPolicy: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(contentDestinationPayload.meta.collection, "content_destinations");
  assert.equal(contentDestinationPayload.data.name, "Acme Blog");
  assert.equal(contentDestinationPayload.data.contentBrandId, contentBrandPayload.data.id);
  assert.equal(contentDestinationPayload.data.kind, "blog");
  assert.equal(contentDestinationPayload.data.publishPolicy, "approval_required");
  assert.equal(contentDestinationPayload.data.status, "draft");

  const contentCampaignCreate = await runCliCapture(["content-campaign", "create", "Launch Campaign", "--brand", contentBrandPayload.data.id, "--slug", "launch-campaign", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(contentCampaignCreate.code, CLI_EXIT_OK, contentCampaignCreate.stderr || contentCampaignCreate.stdout);
  const contentCampaignPayload = JSON.parse(contentCampaignCreate.stdout) as { data: { id: string; name: string; contentBrandId: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(contentCampaignPayload.meta.collection, "content_campaigns");
  assert.equal(contentCampaignPayload.data.name, "Launch Campaign");
  assert.equal(contentCampaignPayload.data.contentBrandId, contentBrandPayload.data.id);
  assert.equal(contentCampaignPayload.data.status, "planning");

  const contentEntryCreate = await runCliCapture(["content-entry", "create", "Launch note", "--brand", contentBrandPayload.data.id, "--campaign", contentCampaignPayload.data.id, "--content-type", "article", "--canonical-format", "markdown", "--summary", "Launch announcement draft.", "--canonical-body", "Structured launch note.", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(contentEntryCreate.code, CLI_EXIT_OK, contentEntryCreate.stderr || contentEntryCreate.stdout);
  const contentEntryPayload = JSON.parse(contentEntryCreate.stdout) as { data: { id: string; title: string; contentBrandId: string; contentCampaignId: string; contentType: string; canonicalFormat: string; status: string; currentRevisionNumber: number }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(contentEntryPayload.meta.collection, "content_entries");
  assert.equal(contentEntryPayload.data.title, "Launch note");
  assert.equal(contentEntryPayload.data.contentBrandId, contentBrandPayload.data.id);
  assert.equal(contentEntryPayload.data.contentCampaignId, contentCampaignPayload.data.id);
  assert.equal(contentEntryPayload.data.contentType, "article");
  assert.equal(contentEntryPayload.data.canonicalFormat, "markdown");
  assert.equal(contentEntryPayload.data.status, "draft");
  assert.equal(contentEntryPayload.data.currentRevisionNumber, 1);

  const contentRevisionCreate = await runCliCapture(["content-entry", contentEntryPayload.data.id, "revisions", "add", "Launch note revision 1", "--revision-number", "1", "--body", "Structured launch note.", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(contentRevisionCreate.code, CLI_EXIT_OK, contentRevisionCreate.stderr || contentRevisionCreate.stdout);
  const contentRevisionPayload = JSON.parse(contentRevisionCreate.stdout) as { data: { id: string; title: string; contentEntryId: string; revisionNumber: number; createdAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(contentRevisionPayload.meta.collection, "content_revisions");
  assert.equal(contentRevisionPayload.data.title, "Launch note revision 1");
  assert.equal(contentRevisionPayload.data.contentEntryId, contentEntryPayload.data.id);
  assert.equal(contentRevisionPayload.data.revisionNumber, 1);
  assert.equal(typeof contentRevisionPayload.data.createdAt, "string");

  const contentVariantCreate = await runCliCapture(["content-entry", contentEntryPayload.data.id, "variants", "add", "Blog variant", "--destination", contentDestinationPayload.data.id, "--format", "markdown", "--body", "Blog-ready launch note.", "--status", "approved", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(contentVariantCreate.code, CLI_EXIT_OK, contentVariantCreate.stderr || contentVariantCreate.stdout);
  const contentVariantPayload = JSON.parse(contentVariantCreate.stdout) as { data: { id: string; title: string; contentEntryId: string; contentDestinationId: string; format: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(contentVariantPayload.meta.collection, "content_variants");
  assert.equal(contentVariantPayload.data.title, "Blog variant");
  assert.equal(contentVariantPayload.data.contentEntryId, contentEntryPayload.data.id);
  assert.equal(contentVariantPayload.data.contentDestinationId, contentDestinationPayload.data.id);
  assert.equal(contentVariantPayload.data.status, "approved");

  const contentApprovalCreate = await runCliCapture(["content-entry", contentEntryPayload.data.id, "approvals", "add", "--title", "Blog approval", "--variant", contentVariantPayload.data.id, "--destination", contentDestinationPayload.data.id, "--status", "approved", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(contentApprovalCreate.code, CLI_EXIT_OK, contentApprovalCreate.stderr || contentApprovalCreate.stdout);
  const contentApprovalPayload = JSON.parse(contentApprovalCreate.stdout) as { data: { id: string; title: string; contentEntryId: string; contentVariantId: string; contentDestinationId: string; status: string; requestedAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(contentApprovalPayload.meta.collection, "content_approvals");
  assert.equal(contentApprovalPayload.data.title, "Blog approval");
  assert.equal(contentApprovalPayload.data.contentEntryId, contentEntryPayload.data.id);
  assert.equal(contentApprovalPayload.data.contentVariantId, contentVariantPayload.data.id);
  assert.equal(contentApprovalPayload.data.contentDestinationId, contentDestinationPayload.data.id);
  assert.equal(contentApprovalPayload.data.status, "approved");
  assert.equal(typeof contentApprovalPayload.data.requestedAt, "string");

  const contentPublicationCreate = await runCliCapture(["content-entry", contentEntryPayload.data.id, "publications", "add", "--title", "Blog publication", "--variant", contentVariantPayload.data.id, "--destination", contentDestinationPayload.data.id, "--status", "published", "--external-url", "https://example.test/launch-note", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(contentPublicationCreate.code, CLI_EXIT_OK, contentPublicationCreate.stderr || contentPublicationCreate.stdout);
  const contentPublicationPayload = JSON.parse(contentPublicationCreate.stdout) as { data: { id: string; title: string; contentEntryId: string; contentVariantId: string; contentDestinationId: string; status: string; externalUrl: string; attemptNumber: number }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(contentPublicationPayload.meta.collection, "content_publications");
  assert.equal(contentPublicationPayload.data.title, "Blog publication");
  assert.equal(contentPublicationPayload.data.contentEntryId, contentEntryPayload.data.id);
  assert.equal(contentPublicationPayload.data.contentVariantId, contentVariantPayload.data.id);
  assert.equal(contentPublicationPayload.data.contentDestinationId, contentDestinationPayload.data.id);
  assert.equal(contentPublicationPayload.data.status, "published");
  assert.equal(contentPublicationPayload.data.externalUrl, "https://example.test/launch-note");
  assert.equal(contentPublicationPayload.data.attemptNumber, 0);

  const contentEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Content brief", "--kind", "document", "--collection-name", "content_entries", "--record-id", contentEntryPayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(contentEvidenceSourceCreate.code, CLI_EXIT_OK);
  const contentEvidenceSourcePayload = JSON.parse(contentEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(contentEvidenceSourcePayload.data.collectionName, "content_entries");
  assert.equal(contentEvidenceSourcePayload.data.recordId, contentEntryPayload.data.id);

  const contentGapCreate = await runCliCapture(["quality-gap", "create", "Provider receipt pending", "--target-collection", "content_entries", "--target-id", contentEntryPayload.data.id, "--gap-kind", "external_pending", "--evidence-source-id", contentEvidenceSourcePayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(contentGapCreate.code, CLI_EXIT_OK);
  const contentGapPayload = JSON.parse(contentGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(contentGapPayload.data.targetCollection, "content_entries");
  assert.equal(contentGapPayload.data.targetId, contentEntryPayload.data.id);
  assert.equal(contentGapPayload.data.gapKind, "external_pending");

  const contentEntryTimeline = await runCliCapture(["content-entry", contentEntryPayload.data.id, "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(contentEntryTimeline.code, CLI_EXIT_OK, contentEntryTimeline.stderr || contentEntryTimeline.stdout);
  const contentEntryTimelinePayload = JSON.parse(contentEntryTimeline.stdout) as {
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
  assert.equal(contentEntryTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(contentEntryTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(contentEntryTimelinePayload.data.semanticView.id, "content_entry.timeline");
  assert.equal(contentEntryTimelinePayload.data.semanticView.systemId, "content");
  assert.equal(contentEntryTimelinePayload.data.materializedView.subject.id, contentEntryPayload.data.id);
  assert.equal(contentEntryTimelinePayload.data.materializedView.subject.label, "Launch note");
  assert.equal(contentEntryTimelinePayload.data.materializedView.brand?.id, contentBrandPayload.data.id);
  assert.equal(contentEntryTimelinePayload.data.materializedView.campaign?.id, contentCampaignPayload.data.id);
  assert.equal(contentEntryTimelinePayload.data.materializedView.summary.revisions, 1);
  assert.equal(contentEntryTimelinePayload.data.materializedView.summary.variants, 1);
  assert.equal(contentEntryTimelinePayload.data.materializedView.summary.approvals, 1);
  assert.equal(contentEntryTimelinePayload.data.materializedView.summary.approvedApprovals, 1);
  assert.equal(contentEntryTimelinePayload.data.materializedView.summary.publications, 1);
  assert.equal(contentEntryTimelinePayload.data.materializedView.summary.publishedPublications, 1);
  assert.equal(contentEntryTimelinePayload.data.materializedView.summary.destinations, 1);
  assert.equal(contentEntryTimelinePayload.data.materializedView.summary.evidenceSources, 1);
  assert.equal(contentEntryTimelinePayload.data.materializedView.summary.qualityGaps, 1);
  assert.equal(contentEntryTimelinePayload.data.materializedView.summary.hasBrand, true);
  assert.equal(contentEntryTimelinePayload.data.materializedView.summary.hasCampaign, true);
  assert.equal(contentEntryTimelinePayload.data.materializedView.partial, true);
  assert.equal(contentEntryTimelinePayload.data.materializedView.itemCount >= 9, true);
  assert.equal(contentEntryTimelinePayload.data.materializedView.items.some((item) => item.kind === "content_revision" && item.label === "Launch note revision 1"), true);
  assert.equal(contentEntryTimelinePayload.data.materializedView.items.some((item) => item.kind === "content_variant" && item.label === "Blog variant"), true);
  assert.equal(contentEntryTimelinePayload.data.materializedView.items.some((item) => item.kind === "content_approval" && item.label === "Blog approval"), true);
  assert.equal(contentEntryTimelinePayload.data.materializedView.items.some((item) => item.kind === "content_publication" && item.label === "Blog publication"), true);
  assert.equal(contentEntryTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === contentGapPayload.data.id && gap.gapKind === "external_pending"), true);

  const supplierCreate = await runCliCapture(["supplier", "create", "Parts Co", "--company", companyPayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(supplierCreate.code, CLI_EXIT_OK, supplierCreate.stderr || supplierCreate.stdout);
  const supplierPayload = JSON.parse(supplierCreate.stdout) as { data: { id: string; name: string; companyId: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(supplierPayload.meta.invokedCommand, "supplier");
  assert.equal(supplierPayload.meta.collection, "suppliers");
  assert.equal(supplierPayload.meta.action, "create");
  assert.equal(supplierPayload.data.name, "Parts Co");
  assert.equal(supplierPayload.data.companyId, companyPayload.data.id);
  assert.equal(supplierPayload.data.status, "active");

  const purchaseOrderCreate = await runCliCapture(["supplier", supplierPayload.data.id, "purchase-orders", "add", "PO-001", "--company", companyPayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(purchaseOrderCreate.code, CLI_EXIT_OK, purchaseOrderCreate.stderr || purchaseOrderCreate.stdout);
  const purchaseOrderPayload = JSON.parse(purchaseOrderCreate.stdout) as { data: { id: string; number: string; supplierId: string; companyId: string; status: string; orderedAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(purchaseOrderPayload.meta.invokedCommand, "supplier");
  assert.equal(purchaseOrderPayload.meta.collection, "purchase_orders");
  assert.equal(purchaseOrderPayload.meta.action, "create");
  assert.equal(purchaseOrderPayload.data.number, "PO-001");
  assert.equal(purchaseOrderPayload.data.supplierId, supplierPayload.data.id);
  assert.equal(purchaseOrderPayload.data.companyId, companyPayload.data.id);
  assert.equal(purchaseOrderPayload.data.status, "draft");
  assert.equal(typeof purchaseOrderPayload.data.orderedAt, "string");

  const purchaseOrderLineCreate = await runCliCapture(["purchase-order", purchaseOrderPayload.data.id, "line-items", "add", "Press frame", "--product", erpProductPayload.data.id, "--quantity", "2", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(purchaseOrderLineCreate.code, CLI_EXIT_OK, purchaseOrderLineCreate.stderr || purchaseOrderLineCreate.stdout);
  const purchaseOrderLinePayload = JSON.parse(purchaseOrderLineCreate.stdout) as { data: { description: string; purchaseOrderId: string; productCatalogId: string; quantity: number; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(purchaseOrderLinePayload.meta.invokedCommand, "purchase-order");
  assert.equal(purchaseOrderLinePayload.meta.collection, "purchase_order_line_items");
  assert.equal(purchaseOrderLinePayload.meta.action, "create");
  assert.equal(purchaseOrderLinePayload.data.description, "Press frame");
  assert.equal(purchaseOrderLinePayload.data.purchaseOrderId, purchaseOrderPayload.data.id);
  assert.equal(purchaseOrderLinePayload.data.productCatalogId, erpProductPayload.data.id);
  assert.equal(purchaseOrderLinePayload.data.quantity, 2);
  assert.equal(purchaseOrderLinePayload.data.status, "ordered");

  const directPurchaseOrderLineCreate = await runCliCapture(["purchase-order-line-item", "add", "--purchase-order", purchaseOrderPayload.data.id, "Direct line", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(directPurchaseOrderLineCreate.code, CLI_EXIT_OK, directPurchaseOrderLineCreate.stderr || directPurchaseOrderLineCreate.stdout);
  const directPurchaseOrderLinePayload = JSON.parse(directPurchaseOrderLineCreate.stdout) as { data: { description: string; purchaseOrderId: string }; meta: { collection: string; invokedCommand: string } };
  assert.equal(directPurchaseOrderLinePayload.meta.invokedCommand, "purchase-order-line-item");
  assert.equal(directPurchaseOrderLinePayload.meta.collection, "purchase_order_line_items");
  assert.equal(directPurchaseOrderLinePayload.data.description, "Direct line");
  assert.equal(directPurchaseOrderLinePayload.data.purchaseOrderId, purchaseOrderPayload.data.id);

  const purchaseOrderTimeline = await runCliCapture(["purchase-order", purchaseOrderPayload.data.id, "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(purchaseOrderTimeline.code, CLI_EXIT_OK, purchaseOrderTimeline.stderr || purchaseOrderTimeline.stdout);
  const purchaseOrderTimelinePayload = JSON.parse(purchaseOrderTimeline.stdout) as {
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
  assert.equal(purchaseOrderTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(purchaseOrderTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(purchaseOrderTimelinePayload.data.semanticView.id, "purchase_order.timeline");
  assert.equal(purchaseOrderTimelinePayload.data.semanticView.systemId, "procurement");
  assert.equal(purchaseOrderTimelinePayload.data.materializedView.subject.id, purchaseOrderPayload.data.id);
  assert.equal(purchaseOrderTimelinePayload.data.materializedView.subject.label, "PO-001");
  assert.equal(purchaseOrderTimelinePayload.data.materializedView.supplier?.id, supplierPayload.data.id);
  assert.equal(purchaseOrderTimelinePayload.data.materializedView.company?.id, companyPayload.data.id);
  assert.equal(purchaseOrderTimelinePayload.data.materializedView.summary.lineItems, 2);
  assert.equal(purchaseOrderTimelinePayload.data.materializedView.summary.receivedLineItems, 0);
  assert.equal(purchaseOrderTimelinePayload.data.materializedView.itemCount >= 5, true);
  assert.equal(purchaseOrderTimelinePayload.data.materializedView.items.some((item) => item.kind === "purchase_order_line_item" && item.label === "Press frame"), true);

  const warehouseCreate = await runCliCapture(["warehouse", "create", "Main Warehouse", "--company", companyPayload.data.id, "--code", "WH-1", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(warehouseCreate.code, CLI_EXIT_OK, warehouseCreate.stderr || warehouseCreate.stdout);
  const warehousePayload = JSON.parse(warehouseCreate.stdout) as { data: { id: string; name: string; companyId: string; code: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(warehousePayload.meta.invokedCommand, "warehouse");
  assert.equal(warehousePayload.meta.collection, "warehouses");
  assert.equal(warehousePayload.meta.action, "create");
  assert.equal(warehousePayload.data.name, "Main Warehouse");
  assert.equal(warehousePayload.data.companyId, companyPayload.data.id);
  assert.equal(warehousePayload.data.status, "active");

  const inventoryItemCreate = await runCliCapture(["warehouse", warehousePayload.data.id, "inventory-items", "add", "Press stock", "--product", erpProductPayload.data.id, "--quantity-on-hand", "3", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(inventoryItemCreate.code, CLI_EXIT_OK, inventoryItemCreate.stderr || inventoryItemCreate.stdout);
  const inventoryItemPayload = JSON.parse(inventoryItemCreate.stdout) as { data: { id: string; name: string; warehouseId: string; productCatalogId: string; quantityOnHand: number; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(inventoryItemPayload.meta.invokedCommand, "warehouse");
  assert.equal(inventoryItemPayload.meta.collection, "inventory_items");
  assert.equal(inventoryItemPayload.meta.action, "create");
  assert.equal(inventoryItemPayload.data.name, "Press stock");
  assert.equal(inventoryItemPayload.data.warehouseId, warehousePayload.data.id);
  assert.equal(inventoryItemPayload.data.productCatalogId, erpProductPayload.data.id);
  assert.equal(inventoryItemPayload.data.quantityOnHand, 3);
  assert.equal(inventoryItemPayload.data.status, "in_stock");

  const stockMovementCreate = await runCliCapture(["inventory-item", inventoryItemPayload.data.id, "stock-movements", "add", "Receipt", "--warehouse", warehousePayload.data.id, "--movement-type", "received", "--quantity", "3", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(stockMovementCreate.code, CLI_EXIT_OK, stockMovementCreate.stderr || stockMovementCreate.stdout);
  const stockMovementPayload = JSON.parse(stockMovementCreate.stdout) as { data: { title: string; inventoryItemId: string; warehouseId: string; movementType: string; quantity: number; occurredAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(stockMovementPayload.meta.invokedCommand, "inventory-item");
  assert.equal(stockMovementPayload.meta.collection, "stock_movements");
  assert.equal(stockMovementPayload.meta.action, "create");
  assert.equal(stockMovementPayload.data.title, "Receipt");
  assert.equal(stockMovementPayload.data.inventoryItemId, inventoryItemPayload.data.id);
  assert.equal(stockMovementPayload.data.warehouseId, warehousePayload.data.id);
  assert.equal(stockMovementPayload.data.movementType, "received");
  assert.equal(stockMovementPayload.data.quantity, 3);
  assert.equal(typeof stockMovementPayload.data.occurredAt, "string");

  const directStockMovementCreate = await runCliCapture(["stock-movement", "add", "--inventory-item", inventoryItemPayload.data.id, "--warehouse", warehousePayload.data.id, "Direct adjustment", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(directStockMovementCreate.code, CLI_EXIT_OK, directStockMovementCreate.stderr || directStockMovementCreate.stdout);
  const directStockMovementPayload = JSON.parse(directStockMovementCreate.stdout) as { data: { title: string; inventoryItemId: string; warehouseId: string }; meta: { collection: string; invokedCommand: string } };
  assert.equal(directStockMovementPayload.meta.invokedCommand, "stock-movement");
  assert.equal(directStockMovementPayload.meta.collection, "stock_movements");
  assert.equal(directStockMovementPayload.data.title, "Direct adjustment");
  assert.equal(directStockMovementPayload.data.inventoryItemId, inventoryItemPayload.data.id);
  assert.equal(directStockMovementPayload.data.warehouseId, warehousePayload.data.id);

  const warehouseTimeline = await runCliCapture(["warehouse", warehousePayload.data.id, "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(warehouseTimeline.code, CLI_EXIT_OK, warehouseTimeline.stderr || warehouseTimeline.stdout);
  const warehouseTimelinePayload = JSON.parse(warehouseTimeline.stdout) as {
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
  assert.equal(warehouseTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(warehouseTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(warehouseTimelinePayload.data.semanticView.id, "warehouse.timeline");
  assert.equal(warehouseTimelinePayload.data.semanticView.systemId, "warehouse");
  assert.equal(warehouseTimelinePayload.data.materializedView.subject.id, warehousePayload.data.id);
  assert.equal(warehouseTimelinePayload.data.materializedView.subject.label, "Main Warehouse");
  assert.equal(warehouseTimelinePayload.data.materializedView.company?.id, companyPayload.data.id);
  assert.equal(warehouseTimelinePayload.data.materializedView.summary.inventoryItems, 1);
  assert.equal(warehouseTimelinePayload.data.materializedView.summary.stockMovements, 2);
  assert.equal(warehouseTimelinePayload.data.materializedView.summary.products, 1);
  assert.equal(warehouseTimelinePayload.data.materializedView.summary.quantityOnHand, 3);
  assert.equal(warehouseTimelinePayload.data.materializedView.itemCount >= 6, true);
  assert.equal(warehouseTimelinePayload.data.materializedView.items.some((item) => item.kind === "inventory_item" && item.label === "Press stock"), true);

  const supplyPlanCreate = await runCliCapture(["supply-plan", "create", "Q2 supply plan", "--company", companyPayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(supplyPlanCreate.code, CLI_EXIT_OK, supplyPlanCreate.stderr || supplyPlanCreate.stdout);
  const supplyPlanPayload = JSON.parse(supplyPlanCreate.stdout) as { data: { id: string; title: string; companyId: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(supplyPlanPayload.meta.invokedCommand, "supply-plan");
  assert.equal(supplyPlanPayload.meta.collection, "supply_plans");
  assert.equal(supplyPlanPayload.meta.action, "create");
  assert.equal(supplyPlanPayload.data.title, "Q2 supply plan");
  assert.equal(supplyPlanPayload.data.companyId, companyPayload.data.id);
  assert.equal(supplyPlanPayload.data.status, "draft");

  const supplyPlanItemCreate = await runCliCapture(["supply-plan", supplyPlanPayload.data.id, "items", "add", "Press shortage", "--product", erpProductPayload.data.id, "--supplier", supplierPayload.data.id, "--purchase-order", purchaseOrderPayload.data.id, "--warehouse", warehousePayload.data.id, "--inventory-item", inventoryItemPayload.data.id, "--quantity-required", "5", "--quantity-available", "3", "--quantity-gap", "2", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(supplyPlanItemCreate.code, CLI_EXIT_OK, supplyPlanItemCreate.stderr || supplyPlanItemCreate.stdout);
  const supplyPlanItemPayload = JSON.parse(supplyPlanItemCreate.stdout) as { data: { id: string; title: string; supplyPlanId: string; productCatalogId: string; supplierId: string; purchaseOrderId: string; warehouseId: string; inventoryItemId: string; quantityRequired: number; quantityAvailable: number; quantityGap: number; status: string; priority: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(supplyPlanItemPayload.meta.invokedCommand, "supply-plan");
  assert.equal(supplyPlanItemPayload.meta.collection, "supply_plan_items");
  assert.equal(supplyPlanItemPayload.meta.action, "create");
  assert.equal(supplyPlanItemPayload.data.title, "Press shortage");
  assert.equal(supplyPlanItemPayload.data.supplyPlanId, supplyPlanPayload.data.id);
  assert.equal(supplyPlanItemPayload.data.productCatalogId, erpProductPayload.data.id);
  assert.equal(supplyPlanItemPayload.data.supplierId, supplierPayload.data.id);
  assert.equal(supplyPlanItemPayload.data.purchaseOrderId, purchaseOrderPayload.data.id);
  assert.equal(supplyPlanItemPayload.data.warehouseId, warehousePayload.data.id);
  assert.equal(supplyPlanItemPayload.data.inventoryItemId, inventoryItemPayload.data.id);
  assert.equal(supplyPlanItemPayload.data.quantityRequired, 5);
  assert.equal(supplyPlanItemPayload.data.quantityAvailable, 3);
  assert.equal(supplyPlanItemPayload.data.quantityGap, 2);
  assert.equal(supplyPlanItemPayload.data.status, "planned");
  assert.equal(supplyPlanItemPayload.data.priority, "normal");

  const supplyRiskCreate = await runCliCapture(["supply-plan", supplyPlanPayload.data.id, "risks", "add", "Supplier lead-time risk", "--supplier", supplierPayload.data.id, "--purchase-order", purchaseOrderPayload.data.id, "--warehouse", warehousePayload.data.id, "--inventory-item", inventoryItemPayload.data.id, "--risk-type", "lead_time", "--severity", "high", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(supplyRiskCreate.code, CLI_EXIT_OK, supplyRiskCreate.stderr || supplyRiskCreate.stdout);
  const supplyRiskPayload = JSON.parse(supplyRiskCreate.stdout) as { data: { id: string; title: string; supplyPlanId: string; supplierId: string; purchaseOrderId: string; warehouseId: string; inventoryItemId: string; riskType: string; severity: string; status: string; identifiedAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(supplyRiskPayload.meta.invokedCommand, "supply-plan");
  assert.equal(supplyRiskPayload.meta.collection, "supply_risks");
  assert.equal(supplyRiskPayload.meta.action, "create");
  assert.equal(supplyRiskPayload.data.title, "Supplier lead-time risk");
  assert.equal(supplyRiskPayload.data.supplyPlanId, supplyPlanPayload.data.id);
  assert.equal(supplyRiskPayload.data.supplierId, supplierPayload.data.id);
  assert.equal(supplyRiskPayload.data.purchaseOrderId, purchaseOrderPayload.data.id);
  assert.equal(supplyRiskPayload.data.warehouseId, warehousePayload.data.id);
  assert.equal(supplyRiskPayload.data.inventoryItemId, inventoryItemPayload.data.id);
  assert.equal(supplyRiskPayload.data.riskType, "lead_time");
  assert.equal(supplyRiskPayload.data.severity, "high");
  assert.equal(supplyRiskPayload.data.status, "open");
  assert.equal(typeof supplyRiskPayload.data.identifiedAt, "string");

  const directSupplyRiskCreate = await runCliCapture(["supply-risk", "add", "--supply-plan", supplyPlanPayload.data.id, "--supplier", supplierPayload.data.id, "Direct supplier risk", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(directSupplyRiskCreate.code, CLI_EXIT_OK, directSupplyRiskCreate.stderr || directSupplyRiskCreate.stdout);
  const directSupplyRiskPayload = JSON.parse(directSupplyRiskCreate.stdout) as { data: { title: string; supplyPlanId: string; supplierId: string }; meta: { collection: string; invokedCommand: string } };
  assert.equal(directSupplyRiskPayload.meta.invokedCommand, "supply-risk");
  assert.equal(directSupplyRiskPayload.meta.collection, "supply_risks");
  assert.equal(directSupplyRiskPayload.data.title, "Direct supplier risk");
  assert.equal(directSupplyRiskPayload.data.supplyPlanId, supplyPlanPayload.data.id);
  assert.equal(directSupplyRiskPayload.data.supplierId, supplierPayload.data.id);

  const supplyPlanTimeline = await runCliCapture(["supply-plan", supplyPlanPayload.data.id, "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(supplyPlanTimeline.code, CLI_EXIT_OK, supplyPlanTimeline.stderr || supplyPlanTimeline.stdout);
  const supplyPlanTimelinePayload = JSON.parse(supplyPlanTimeline.stdout) as {
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
  assert.equal(supplyPlanTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(supplyPlanTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(supplyPlanTimelinePayload.data.semanticView.id, "supply_plan.timeline");
  assert.equal(supplyPlanTimelinePayload.data.semanticView.systemId, "supply_chain");
  assert.equal(supplyPlanTimelinePayload.data.materializedView.subject.id, supplyPlanPayload.data.id);
  assert.equal(supplyPlanTimelinePayload.data.materializedView.subject.label, "Q2 supply plan");
  assert.equal(supplyPlanTimelinePayload.data.materializedView.company?.id, companyPayload.data.id);
  assert.equal(supplyPlanTimelinePayload.data.materializedView.summary.items, 1);
  assert.equal(supplyPlanTimelinePayload.data.materializedView.summary.risks, 2);
  assert.equal(supplyPlanTimelinePayload.data.materializedView.summary.suppliers, 1);
  assert.equal(supplyPlanTimelinePayload.data.materializedView.summary.purchaseOrders, 1);
  assert.equal(supplyPlanTimelinePayload.data.materializedView.summary.warehouses, 1);
  assert.equal(supplyPlanTimelinePayload.data.materializedView.summary.inventoryItems, 1);
  assert.equal(supplyPlanTimelinePayload.data.materializedView.summary.products, 1);
  assert.equal(supplyPlanTimelinePayload.data.materializedView.summary.quantityRequired, 5);
  assert.equal(supplyPlanTimelinePayload.data.materializedView.summary.quantityAvailable, 3);
  assert.equal(supplyPlanTimelinePayload.data.materializedView.summary.quantityGap, 2);
  assert.equal(supplyPlanTimelinePayload.data.materializedView.itemCount >= 9, true);
  assert.equal(supplyPlanTimelinePayload.data.materializedView.items.some((item) => item.kind === "supply_plan_item" && item.label === "Press shortage"), true);

  const carrierCreate = await runCliCapture(["carrier", "create", "Fast Freight", "--company", companyPayload.data.id, "--mode", "ltl", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(carrierCreate.code, CLI_EXIT_OK, carrierCreate.stderr || carrierCreate.stdout);
  const carrierPayload = JSON.parse(carrierCreate.stdout) as { data: { id: string; name: string; companyId: string; mode: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(carrierPayload.meta.invokedCommand, "carrier");
  assert.equal(carrierPayload.meta.collection, "carriers");
  assert.equal(carrierPayload.data.name, "Fast Freight");
  assert.equal(carrierPayload.data.companyId, companyPayload.data.id);
  assert.equal(carrierPayload.data.mode, "ltl");
  assert.equal(carrierPayload.data.status, "active");

  const shipmentCreate = await runCliCapture(["carrier", carrierPayload.data.id, "shipments", "add", "PO-001 inbound shipment", "--company", companyPayload.data.id, "--purchase-order", purchaseOrderPayload.data.id, "--warehouse", warehousePayload.data.id, "--tracking-number", "TRACK-001", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(shipmentCreate.code, CLI_EXIT_OK, shipmentCreate.stderr || shipmentCreate.stdout);
  const shipmentPayload = JSON.parse(shipmentCreate.stdout) as { data: { id: string; title: string; carrierId: string; companyId: string; purchaseOrderId: string; warehouseId: string; trackingNumber: string; status: string; mode: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(shipmentPayload.meta.invokedCommand, "carrier");
  assert.equal(shipmentPayload.meta.collection, "shipments");
  assert.equal(shipmentPayload.data.title, "PO-001 inbound shipment");
  assert.equal(shipmentPayload.data.carrierId, carrierPayload.data.id);
  assert.equal(shipmentPayload.data.companyId, companyPayload.data.id);
  assert.equal(shipmentPayload.data.purchaseOrderId, purchaseOrderPayload.data.id);
  assert.equal(shipmentPayload.data.warehouseId, warehousePayload.data.id);
  assert.equal(shipmentPayload.data.trackingNumber, "TRACK-001");
  assert.equal(shipmentPayload.data.status, "planned");

  const shipmentLegCreate = await runCliCapture(["shipment", shipmentPayload.data.id, "legs", "add", "Origin to warehouse", "--carrier", carrierPayload.data.id, "--sequence", "1", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(shipmentLegCreate.code, CLI_EXIT_OK, shipmentLegCreate.stderr || shipmentLegCreate.stdout);
  const shipmentLegPayload = JSON.parse(shipmentLegCreate.stdout) as { data: { id: string; title: string; shipmentId: string; carrierId: string; sequence: number; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(shipmentLegPayload.meta.invokedCommand, "shipment");
  assert.equal(shipmentLegPayload.meta.collection, "shipment_legs");
  assert.equal(shipmentLegPayload.data.title, "Origin to warehouse");
  assert.equal(shipmentLegPayload.data.shipmentId, shipmentPayload.data.id);
  assert.equal(shipmentLegPayload.data.carrierId, carrierPayload.data.id);
  assert.equal(shipmentLegPayload.data.sequence, 1);
  assert.equal(shipmentLegPayload.data.status, "planned");

  const freightRateCreate = await runCliCapture(["carrier", carrierPayload.data.id, "freight-rates", "add", "Fast Freight LTL", "--company", companyPayload.data.id, "--amount-cents", "15000", "--currency", "USD", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(freightRateCreate.code, CLI_EXIT_OK, freightRateCreate.stderr || freightRateCreate.stdout);
  const freightRatePayload = JSON.parse(freightRateCreate.stdout) as { data: { id: string; title: string; carrierId: string; companyId: string; amountCents: number; currency: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(freightRatePayload.meta.invokedCommand, "carrier");
  assert.equal(freightRatePayload.meta.collection, "freight_rates");
  assert.equal(freightRatePayload.data.title, "Fast Freight LTL");
  assert.equal(freightRatePayload.data.carrierId, carrierPayload.data.id);
  assert.equal(freightRatePayload.data.companyId, companyPayload.data.id);
  assert.equal(freightRatePayload.data.amountCents, 15000);
  assert.equal(freightRatePayload.data.currency, "USD");
  assert.equal(freightRatePayload.data.status, "draft");

  const shipmentEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Carrier tracking event", "--kind", "document", "--collection-name", "shipments", "--record-id", shipmentPayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(shipmentEvidenceSourceCreate.code, CLI_EXIT_OK);
  const shipmentEvidenceSourcePayload = JSON.parse(shipmentEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(shipmentEvidenceSourcePayload.data.collectionName, "shipments");
  assert.equal(shipmentEvidenceSourcePayload.data.recordId, shipmentPayload.data.id);

  const shipmentGapCreate = await runCliCapture(["quality-gap", "create", "Missing bill of lading", "--target-collection", "shipments", "--target-id", shipmentPayload.data.id, "--gap-kind", "missing", "--evidence-source-id", shipmentEvidenceSourcePayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(shipmentGapCreate.code, CLI_EXIT_OK);
  const shipmentGapPayload = JSON.parse(shipmentGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(shipmentGapPayload.data.targetCollection, "shipments");
  assert.equal(shipmentGapPayload.data.targetId, shipmentPayload.data.id);
  assert.equal(shipmentGapPayload.data.gapKind, "missing");

  const shipmentTimeline = await runCliCapture(["shipment", shipmentPayload.data.id, "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(shipmentTimeline.code, CLI_EXIT_OK, shipmentTimeline.stderr || shipmentTimeline.stdout);
  const shipmentTimelinePayload = JSON.parse(shipmentTimeline.stdout) as {
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
  assert.equal(shipmentTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(shipmentTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(shipmentTimelinePayload.data.semanticView.id, "shipment.timeline");
  assert.equal(shipmentTimelinePayload.data.semanticView.systemId, "transport");
  assert.equal(shipmentTimelinePayload.data.materializedView.subject.id, shipmentPayload.data.id);
  assert.equal(shipmentTimelinePayload.data.materializedView.subject.label, "PO-001 inbound shipment");
  assert.equal(shipmentTimelinePayload.data.materializedView.summary.legs, 1);
  assert.equal(shipmentTimelinePayload.data.materializedView.summary.evidenceSources, 1);
  assert.equal(shipmentTimelinePayload.data.materializedView.summary.qualityGaps, 1);
  assert.equal(shipmentTimelinePayload.data.materializedView.summary.hasCarrier, true);
  assert.equal(shipmentTimelinePayload.data.materializedView.summary.hasPurchaseOrder, true);
  assert.equal(shipmentTimelinePayload.data.materializedView.summary.hasWarehouse, true);
  assert.equal(shipmentTimelinePayload.data.materializedView.partial, true);
  assert.equal(shipmentTimelinePayload.data.materializedView.itemCount >= 6, true);
  assert.equal(shipmentTimelinePayload.data.materializedView.items.some((item) => item.kind === "shipment_leg" && item.label === "Origin to warehouse"), true);
  assert.equal(shipmentTimelinePayload.data.materializedView.items.some((item) => item.kind === "carrier" && item.label === "Fast Freight"), true);
  assert.equal(shipmentTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === shipmentGapPayload.data.id && gap.gapKind === "missing"), true);

  const obligationCreate = await runCliCapture(["obligation", "create", "SOC 2 access review", "--company", companyPayload.data.id, "--authority", "SOC 2", "--reference", "CC6.2", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(obligationCreate.code, CLI_EXIT_OK, obligationCreate.stderr || obligationCreate.stdout);
  const obligationPayload = JSON.parse(obligationCreate.stdout) as { data: { id: string; title: string; companyId: string; authority: string; reference: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(obligationPayload.meta.invokedCommand, "obligation");
  assert.equal(obligationPayload.meta.collection, "compliance_obligations");
  assert.equal(obligationPayload.meta.action, "create");
  assert.equal(obligationPayload.data.title, "SOC 2 access review");
  assert.equal(obligationPayload.data.companyId, companyPayload.data.id);
  assert.equal(obligationPayload.data.status, "under_review");

  const controlCreate = await runCliCapture(["control", "create", "Quarterly access review", "--company", companyPayload.data.id, "--obligation", obligationPayload.data.id, "--owner", employeePayload.data.id, "--control-key", "AC-REV-001", "--framework", "SOC 2", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(controlCreate.code, CLI_EXIT_OK, controlCreate.stderr || controlCreate.stdout);
  const controlPayload = JSON.parse(controlCreate.stdout) as { data: { id: string; title: string; companyId: string; obligationId: string; ownerEmployeeId: string; controlKey: string; framework: string; status: string; controlType: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(controlPayload.meta.invokedCommand, "control");
  assert.equal(controlPayload.meta.collection, "compliance_controls");
  assert.equal(controlPayload.meta.action, "create");
  assert.equal(controlPayload.data.title, "Quarterly access review");
  assert.equal(controlPayload.data.companyId, companyPayload.data.id);
  assert.equal(controlPayload.data.obligationId, obligationPayload.data.id);
  assert.equal(controlPayload.data.ownerEmployeeId, employeePayload.data.id);
  assert.equal(controlPayload.data.status, "draft");
  assert.equal(controlPayload.data.controlType, "governance");

  const assessmentCreate = await runCliCapture(["control", controlPayload.data.id, "assessments", "add", "Q2 test", "--obligation", obligationPayload.data.id, "--result", "partial", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(assessmentCreate.code, CLI_EXIT_OK, assessmentCreate.stderr || assessmentCreate.stdout);
  const assessmentPayload = JSON.parse(assessmentCreate.stdout) as { data: { id: string; title: string; controlId: string; obligationId: string; result: string; status: string; assessedAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(assessmentPayload.meta.invokedCommand, "control");
  assert.equal(assessmentPayload.meta.collection, "control_assessments");
  assert.equal(assessmentPayload.meta.action, "create");
  assert.equal(assessmentPayload.data.title, "Q2 test");
  assert.equal(assessmentPayload.data.controlId, controlPayload.data.id);
  assert.equal(assessmentPayload.data.obligationId, obligationPayload.data.id);
  assert.equal(assessmentPayload.data.result, "partial");
  assert.equal(assessmentPayload.data.status, "planned");
  assert.equal(typeof assessmentPayload.data.assessedAt, "string");

  const findingCreate = await runCliCapture(["control", controlPayload.data.id, "findings", "add", "Missing reviewer sign-off", "--assessment", assessmentPayload.data.id, "--obligation", obligationPayload.data.id, "--severity", "high", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(findingCreate.code, CLI_EXIT_OK, findingCreate.stderr || findingCreate.stdout);
  const findingPayload = JSON.parse(findingCreate.stdout) as { data: { id: string; title: string; controlId: string; assessmentId: string; obligationId: string; severity: string; status: string; identifiedAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(findingPayload.meta.invokedCommand, "control");
  assert.equal(findingPayload.meta.collection, "compliance_findings");
  assert.equal(findingPayload.meta.action, "create");
  assert.equal(findingPayload.data.title, "Missing reviewer sign-off");
  assert.equal(findingPayload.data.controlId, controlPayload.data.id);
  assert.equal(findingPayload.data.assessmentId, assessmentPayload.data.id);
  assert.equal(findingPayload.data.obligationId, obligationPayload.data.id);
  assert.equal(findingPayload.data.severity, "high");
  assert.equal(findingPayload.data.status, "open");
  assert.equal(typeof findingPayload.data.identifiedAt, "string");

  const controlTimeline = await runCliCapture(["control", controlPayload.data.id, "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(controlTimeline.code, CLI_EXIT_OK, controlTimeline.stderr || controlTimeline.stdout);
  const controlTimelinePayload = JSON.parse(controlTimeline.stdout) as {
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
  assert.equal(controlTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(controlTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(controlTimelinePayload.data.semanticView.id, "control.timeline");
  assert.equal(controlTimelinePayload.data.semanticView.systemId, "compliance");
  assert.equal(controlTimelinePayload.data.materializedView.subject.id, controlPayload.data.id);
  assert.equal(controlTimelinePayload.data.materializedView.subject.label, "Quarterly access review");
  assert.equal(controlTimelinePayload.data.materializedView.company?.id, companyPayload.data.id);
  assert.equal(controlTimelinePayload.data.materializedView.obligation?.id, obligationPayload.data.id);
  assert.equal(controlTimelinePayload.data.materializedView.summary.assessments, 1);
  assert.equal(controlTimelinePayload.data.materializedView.summary.findings, 1);
  assert.equal(controlTimelinePayload.data.materializedView.summary.openFindings, 1);
  assert.equal(controlTimelinePayload.data.materializedView.summary.passedAssessments, 0);
  assert.equal(controlTimelinePayload.data.materializedView.summary.failedAssessments, 0);
  assert.equal(controlTimelinePayload.data.materializedView.itemCount >= 5, true);
  assert.equal(controlTimelinePayload.data.materializedView.items.some((item) => item.kind === "compliance_finding" && item.label === "Missing reviewer sign-off"), true);

  const agencyCreate = await runCliCapture(["agency", "create", "City Permitting Office", "--jurisdiction", "Madrid", "--level", "municipal", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(agencyCreate.code, CLI_EXIT_OK, agencyCreate.stderr || agencyCreate.stdout);
  const agencyPayload = JSON.parse(agencyCreate.stdout) as { data: { id: string; name: string; jurisdiction: string; level: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(agencyPayload.meta.invokedCommand, "agency");
  assert.equal(agencyPayload.meta.collection, "agencies");
  assert.equal(agencyPayload.meta.action, "create");
  assert.equal(agencyPayload.data.name, "City Permitting Office");
  assert.equal(agencyPayload.data.jurisdiction, "Madrid");
  assert.equal(agencyPayload.data.level, "municipal");
  assert.equal(agencyPayload.data.status, "active");

  const publicCaseCreate = await runCliCapture(["agency", agencyPayload.data.id, "public-cases", "add", "Lab buildout permit case", "--company", companyPayload.data.id, "--case-number", "GOV-001", "--case-type", "permit", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(publicCaseCreate.code, CLI_EXIT_OK, publicCaseCreate.stderr || publicCaseCreate.stdout);
  const publicCasePayload = JSON.parse(publicCaseCreate.stdout) as { data: { id: string; title: string; agencyId: string; companyId: string; caseNumber: string; caseType: string; status: string; openedAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(publicCasePayload.meta.invokedCommand, "agency");
  assert.equal(publicCasePayload.meta.collection, "public_cases");
  assert.equal(publicCasePayload.meta.action, "create");
  assert.equal(publicCasePayload.data.title, "Lab buildout permit case");
  assert.equal(publicCasePayload.data.agencyId, agencyPayload.data.id);
  assert.equal(publicCasePayload.data.companyId, companyPayload.data.id);
  assert.equal(publicCasePayload.data.caseNumber, "GOV-001");
  assert.equal(publicCasePayload.data.caseType, "permit");
  assert.equal(publicCasePayload.data.status, "draft");
  assert.equal(typeof publicCasePayload.data.openedAt, "string");

  const permitCreate = await runCliCapture(["public-case", publicCasePayload.data.id, "permits", "add", "Lab buildout permit", "--agency", agencyPayload.data.id, "--company", companyPayload.data.id, "--permit-number", "PERMIT-001", "--permit-type", "building", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(permitCreate.code, CLI_EXIT_OK, permitCreate.stderr || permitCreate.stdout);
  const permitPayload = JSON.parse(permitCreate.stdout) as { data: { id: string; title: string; publicCaseId: string; agencyId: string; companyId: string; permitNumber: string; permitType: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(permitPayload.meta.invokedCommand, "public-case");
  assert.equal(permitPayload.meta.collection, "permits");
  assert.equal(permitPayload.meta.action, "create");
  assert.equal(permitPayload.data.title, "Lab buildout permit");
  assert.equal(permitPayload.data.publicCaseId, publicCasePayload.data.id);
  assert.equal(permitPayload.data.agencyId, agencyPayload.data.id);
  assert.equal(permitPayload.data.companyId, companyPayload.data.id);
  assert.equal(permitPayload.data.permitNumber, "PERMIT-001");
  assert.equal(permitPayload.data.permitType, "building");
  assert.equal(permitPayload.data.status, "draft");

  const filingCreate = await runCliCapture(["public-case", publicCasePayload.data.id, "filings", "add", "Permit application", "--agency", agencyPayload.data.id, "--filing-number", "FILING-001", "--filing-type", "application", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(filingCreate.code, CLI_EXIT_OK, filingCreate.stderr || filingCreate.stdout);
  const filingPayload = JSON.parse(filingCreate.stdout) as { data: { id: string; title: string; publicCaseId: string; agencyId: string; filingNumber: string; filingType: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(filingPayload.meta.invokedCommand, "public-case");
  assert.equal(filingPayload.meta.collection, "public_filings");
  assert.equal(filingPayload.meta.action, "create");
  assert.equal(filingPayload.data.title, "Permit application");
  assert.equal(filingPayload.data.publicCaseId, publicCasePayload.data.id);
  assert.equal(filingPayload.data.agencyId, agencyPayload.data.id);
  assert.equal(filingPayload.data.filingNumber, "FILING-001");
  assert.equal(filingPayload.data.filingType, "application");
  assert.equal(filingPayload.data.status, "draft");

  const publicCaseEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Permit receipt", "--kind", "document", "--collection-name", "public_cases", "--record-id", publicCasePayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(publicCaseEvidenceSourceCreate.code, CLI_EXIT_OK);
  const publicCaseEvidenceSourcePayload = JSON.parse(publicCaseEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(publicCaseEvidenceSourcePayload.data.collectionName, "public_cases");
  assert.equal(publicCaseEvidenceSourcePayload.data.recordId, publicCasePayload.data.id);

  const publicCaseGapCreate = await runCliCapture(["quality-gap", "create", "Missing public response", "--target-collection", "public_cases", "--target-id", publicCasePayload.data.id, "--gap-kind", "missing", "--evidence-source-id", publicCaseEvidenceSourcePayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(publicCaseGapCreate.code, CLI_EXIT_OK);
  const publicCaseGapPayload = JSON.parse(publicCaseGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(publicCaseGapPayload.data.targetCollection, "public_cases");
  assert.equal(publicCaseGapPayload.data.targetId, publicCasePayload.data.id);
  assert.equal(publicCaseGapPayload.data.gapKind, "missing");

  const publicCaseTimeline = await runCliCapture(["public-case", publicCasePayload.data.id, "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(publicCaseTimeline.code, CLI_EXIT_OK, publicCaseTimeline.stderr || publicCaseTimeline.stdout);
  const publicCaseTimelinePayload = JSON.parse(publicCaseTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: {
        subject: { id: string; label: string };
        agency: { id: string; label: string } | null;
        company: { id: string; label: string } | null;
        summary: { permits: number; filings: number; evidenceSources: number; qualityGaps: number; hasAgency: boolean; hasCompany: boolean };
        itemCount: number;
        items: Array<{ kind: string; label: string }>;
        gaps: Array<{ id: string; gapKind: string }>;
        partial: boolean;
      };
    };
  };
  assert.equal(publicCaseTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(publicCaseTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(publicCaseTimelinePayload.data.semanticView.id, "public_case.timeline");
  assert.equal(publicCaseTimelinePayload.data.semanticView.systemId, "government");
  assert.equal(publicCaseTimelinePayload.data.materializedView.subject.id, publicCasePayload.data.id);
  assert.equal(publicCaseTimelinePayload.data.materializedView.subject.label, "Lab buildout permit case");
  assert.equal(publicCaseTimelinePayload.data.materializedView.agency?.id, agencyPayload.data.id);
  assert.equal(publicCaseTimelinePayload.data.materializedView.company?.id, companyPayload.data.id);
  assert.equal(publicCaseTimelinePayload.data.materializedView.summary.permits, 1);
  assert.equal(publicCaseTimelinePayload.data.materializedView.summary.filings, 1);
  assert.equal(publicCaseTimelinePayload.data.materializedView.summary.evidenceSources, 1);
  assert.equal(publicCaseTimelinePayload.data.materializedView.summary.qualityGaps, 1);
  assert.equal(publicCaseTimelinePayload.data.materializedView.summary.hasAgency, true);
  assert.equal(publicCaseTimelinePayload.data.materializedView.summary.hasCompany, true);
  assert.equal(publicCaseTimelinePayload.data.materializedView.partial, true);
  assert.equal(publicCaseTimelinePayload.data.materializedView.itemCount >= 6, true);
  assert.equal(publicCaseTimelinePayload.data.materializedView.items.some((item) => item.kind === "permit" && item.label === "Lab buildout permit"), true);
  assert.equal(publicCaseTimelinePayload.data.materializedView.items.some((item) => item.kind === "public_filing" && item.label === "Permit application"), true);
  assert.equal(publicCaseTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === publicCaseGapPayload.data.id && gap.gapKind === "missing"), true);

  const thingCreate = await runCliCapture(["thing", "create", "Press IoT thing", "--company", companyPayload.data.id, "--kind", "controller", "--external-id", "thing-001", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(thingCreate.code, CLI_EXIT_OK, thingCreate.stderr || thingCreate.stdout);
  const thingPayload = JSON.parse(thingCreate.stdout) as { data: { id: string; name: string; companyId: string; kind: string; status: string; externalId: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(thingPayload.meta.invokedCommand, "thing");
  assert.equal(thingPayload.meta.collection, "iot_things");
  assert.equal(thingPayload.meta.action, "create");
  assert.equal(thingPayload.data.name, "Press IoT thing");
  assert.equal(thingPayload.data.companyId, companyPayload.data.id);
  assert.equal(thingPayload.data.kind, "controller");
  assert.equal(thingPayload.data.status, "active");

  const iotDeviceCreate = await runCliCapture(["thing", thingPayload.data.id, "devices", "add", "Press vibration sensor", "--protocol", "mqtt", "--device-type", "sensor", "--status", "online", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(iotDeviceCreate.code, CLI_EXIT_OK, iotDeviceCreate.stderr || iotDeviceCreate.stdout);
  const iotDevicePayload = JSON.parse(iotDeviceCreate.stdout) as { data: { id: string; name: string; thingId: string; protocol: string; deviceType: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(iotDevicePayload.meta.invokedCommand, "thing");
  assert.equal(iotDevicePayload.meta.collection, "iot_devices");
  assert.equal(iotDevicePayload.meta.action, "create");
  assert.equal(iotDevicePayload.data.name, "Press vibration sensor");
  assert.equal(iotDevicePayload.data.thingId, thingPayload.data.id);
  assert.equal(iotDevicePayload.data.protocol, "mqtt");
  assert.equal(iotDevicePayload.data.deviceType, "sensor");
  assert.equal(iotDevicePayload.data.status, "online");

  const sensorReadingCreate = await runCliCapture(["iot-device", iotDevicePayload.data.id, "readings", "add", "vibration", "--thing", thingPayload.data.id, "--value", "0.42", "--quality", "good", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(sensorReadingCreate.code, CLI_EXIT_OK, sensorReadingCreate.stderr || sensorReadingCreate.stdout);
  const sensorReadingPayload = JSON.parse(sensorReadingCreate.stdout) as { data: { id: string; metric: string; deviceId: string; thingId: string; value: number; quality: string; observedAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(sensorReadingPayload.meta.invokedCommand, "iot-device");
  assert.equal(sensorReadingPayload.meta.collection, "sensor_readings");
  assert.equal(sensorReadingPayload.meta.action, "create");
  assert.equal(sensorReadingPayload.data.metric, "vibration");
  assert.equal(sensorReadingPayload.data.deviceId, iotDevicePayload.data.id);
  assert.equal(sensorReadingPayload.data.thingId, thingPayload.data.id);
  assert.equal(sensorReadingPayload.data.value, 0.42);
  assert.equal(sensorReadingPayload.data.quality, "good");
  assert.equal(typeof sensorReadingPayload.data.observedAt, "string");

  const deviceCommandCreate = await runCliCapture(["iot-device", iotDevicePayload.data.id, "commands", "add", "Restart gateway", "--thing", thingPayload.data.id, "--command-type", "restart", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(deviceCommandCreate.code, CLI_EXIT_OK, deviceCommandCreate.stderr || deviceCommandCreate.stdout);
  const deviceCommandPayload = JSON.parse(deviceCommandCreate.stdout) as { data: { id: string; title: string; deviceId: string; thingId: string; commandType: string; status: string; requestedAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(deviceCommandPayload.meta.invokedCommand, "iot-device");
  assert.equal(deviceCommandPayload.meta.collection, "device_commands");
  assert.equal(deviceCommandPayload.meta.action, "create");
  assert.equal(deviceCommandPayload.data.title, "Restart gateway");
  assert.equal(deviceCommandPayload.data.deviceId, iotDevicePayload.data.id);
  assert.equal(deviceCommandPayload.data.thingId, thingPayload.data.id);
  assert.equal(deviceCommandPayload.data.commandType, "restart");
  assert.equal(deviceCommandPayload.data.status, "draft");
  assert.equal(typeof deviceCommandPayload.data.requestedAt, "string");

  const thingTimeline = await runCliCapture(["thing", thingPayload.data.id, "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(thingTimeline.code, CLI_EXIT_OK, thingTimeline.stderr || thingTimeline.stdout);
  const thingTimelinePayload = JSON.parse(thingTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: {
        subject: { id: string; label: string };
        company: { id: string; label: string } | null;
        summary: { devices: number; onlineDevices: number; readings: number; commands: number; pendingCommands: number };
        itemCount: number;
        items: Array<{ kind: string; label: string }>;
      };
    };
  };
  assert.equal(thingTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(thingTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(thingTimelinePayload.data.semanticView.id, "thing.timeline");
  assert.equal(thingTimelinePayload.data.semanticView.systemId, "iot");
  assert.equal(thingTimelinePayload.data.materializedView.subject.id, thingPayload.data.id);
  assert.equal(thingTimelinePayload.data.materializedView.subject.label, "Press IoT thing");
  assert.equal(thingTimelinePayload.data.materializedView.company?.id, companyPayload.data.id);
  assert.equal(thingTimelinePayload.data.materializedView.summary.devices, 1);
  assert.equal(thingTimelinePayload.data.materializedView.summary.onlineDevices, 1);
  assert.equal(thingTimelinePayload.data.materializedView.summary.readings, 1);
  assert.equal(thingTimelinePayload.data.materializedView.summary.commands, 1);
  assert.equal(thingTimelinePayload.data.materializedView.summary.pendingCommands, 1);
  assert.equal(thingTimelinePayload.data.materializedView.itemCount >= 5, true);
  assert.equal(thingTimelinePayload.data.materializedView.items.some((item) => item.kind === "sensor_reading" && item.label === "vibration"), true);

  const constructionProjectCreate = await runCliCapture(["construction-project", "create", "Lab buildout", "--company", companyPayload.data.id, "--customer", companyPayload.data.id, "--budget-cents", "25000000", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(constructionProjectCreate.code, CLI_EXIT_OK, constructionProjectCreate.stderr || constructionProjectCreate.stdout);
  const constructionProjectPayload = JSON.parse(constructionProjectCreate.stdout) as { data: { id: string; title: string; companyId: string; customerCompanyId: string; budgetCents: number; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(constructionProjectPayload.meta.invokedCommand, "construction-project");
  assert.equal(constructionProjectPayload.meta.collection, "construction_projects");
  assert.equal(constructionProjectPayload.meta.action, "create");
  assert.equal(constructionProjectPayload.data.title, "Lab buildout");
  assert.equal(constructionProjectPayload.data.companyId, companyPayload.data.id);
  assert.equal(constructionProjectPayload.data.customerCompanyId, companyPayload.data.id);
  assert.equal(constructionProjectPayload.data.budgetCents, 25000000);
  assert.equal(constructionProjectPayload.data.status, "planning");

  const constructionSiteCreate = await runCliCapture(["construction-project", constructionProjectPayload.data.id, "sites", "add", "Lab site", "--property-listing-id", propertyPayload.data.id, "--superintendent-employee-id", employeePayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(constructionSiteCreate.code, CLI_EXIT_OK, constructionSiteCreate.stderr || constructionSiteCreate.stdout);
  const constructionSitePayload = JSON.parse(constructionSiteCreate.stdout) as { data: { id: string; name: string; projectId: string; propertyListingId: string; superintendentEmployeeId: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(constructionSitePayload.meta.invokedCommand, "construction-project");
  assert.equal(constructionSitePayload.meta.collection, "construction_sites");
  assert.equal(constructionSitePayload.meta.action, "create");
  assert.equal(constructionSitePayload.data.name, "Lab site");
  assert.equal(constructionSitePayload.data.projectId, constructionProjectPayload.data.id);
  assert.equal(constructionSitePayload.data.propertyListingId, propertyPayload.data.id);
  assert.equal(constructionSitePayload.data.superintendentEmployeeId, employeePayload.data.id);
  assert.equal(constructionSitePayload.data.status, "planned");

  const constructionRfiCreate = await runCliCapture(["construction-project", constructionProjectPayload.data.id, "rfis", "add", "Ventilation clarification", "--site", constructionSitePayload.data.id, "--number", "RFI-001", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(constructionRfiCreate.code, CLI_EXIT_OK, constructionRfiCreate.stderr || constructionRfiCreate.stdout);
  const constructionRfiPayload = JSON.parse(constructionRfiCreate.stdout) as { data: { id: string; title: string; projectId: string; siteId: string; number: string; status: string; requestedAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(constructionRfiPayload.meta.invokedCommand, "construction-project");
  assert.equal(constructionRfiPayload.meta.collection, "construction_rfis");
  assert.equal(constructionRfiPayload.meta.action, "create");
  assert.equal(constructionRfiPayload.data.title, "Ventilation clarification");
  assert.equal(constructionRfiPayload.data.projectId, constructionProjectPayload.data.id);
  assert.equal(constructionRfiPayload.data.siteId, constructionSitePayload.data.id);
  assert.equal(constructionRfiPayload.data.number, "RFI-001");
  assert.equal(constructionRfiPayload.data.status, "open");
  assert.equal(typeof constructionRfiPayload.data.requestedAt, "string");

  const changeOrderCreate = await runCliCapture(["construction-project", constructionProjectPayload.data.id, "change-orders", "add", "Ventilation upgrade", "--site", constructionSitePayload.data.id, "--rfi", constructionRfiPayload.data.id, "--amount-cents", "1200000", "--schedule-impact-days", "5", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(changeOrderCreate.code, CLI_EXIT_OK, changeOrderCreate.stderr || changeOrderCreate.stdout);
  const changeOrderPayload = JSON.parse(changeOrderCreate.stdout) as { data: { id: string; title: string; projectId: string; siteId: string; relatedRfiId: string; amountCents: number; scheduleImpactDays: number; status: string; submittedAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(changeOrderPayload.meta.invokedCommand, "construction-project");
  assert.equal(changeOrderPayload.meta.collection, "construction_change_orders");
  assert.equal(changeOrderPayload.meta.action, "create");
  assert.equal(changeOrderPayload.data.title, "Ventilation upgrade");
  assert.equal(changeOrderPayload.data.projectId, constructionProjectPayload.data.id);
  assert.equal(changeOrderPayload.data.siteId, constructionSitePayload.data.id);
  assert.equal(changeOrderPayload.data.relatedRfiId, constructionRfiPayload.data.id);
  assert.equal(changeOrderPayload.data.amountCents, 1200000);
  assert.equal(changeOrderPayload.data.scheduleImpactDays, 5);
  assert.equal(changeOrderPayload.data.status, "draft");
  assert.equal(typeof changeOrderPayload.data.submittedAt, "string");

  const constructionTimeline = await runCliCapture(["construction-project", constructionProjectPayload.data.id, "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(constructionTimeline.code, CLI_EXIT_OK, constructionTimeline.stderr || constructionTimeline.stdout);
  const constructionTimelinePayload = JSON.parse(constructionTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: {
        subject: { id: string; label: string };
        company: { id: string; label: string } | null;
        customerCompany: { id: string; label: string } | null;
        summary: { sites: number; rfis: number; openRfis: number; changeOrders: number; approvedChangeOrders: number; changeOrderAmountCents: number };
        itemCount: number;
        items: Array<{ kind: string; label: string }>;
      };
    };
  };
  assert.equal(constructionTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(constructionTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(constructionTimelinePayload.data.semanticView.id, "construction_project.timeline");
  assert.equal(constructionTimelinePayload.data.semanticView.systemId, "construction");
  assert.equal(constructionTimelinePayload.data.materializedView.subject.id, constructionProjectPayload.data.id);
  assert.equal(constructionTimelinePayload.data.materializedView.subject.label, "Lab buildout");
  assert.equal(constructionTimelinePayload.data.materializedView.company?.id, companyPayload.data.id);
  assert.equal(constructionTimelinePayload.data.materializedView.customerCompany?.id, companyPayload.data.id);
  assert.equal(constructionTimelinePayload.data.materializedView.summary.sites, 1);
  assert.equal(constructionTimelinePayload.data.materializedView.summary.rfis, 1);
  assert.equal(constructionTimelinePayload.data.materializedView.summary.openRfis, 1);
  assert.equal(constructionTimelinePayload.data.materializedView.summary.changeOrders, 1);
  assert.equal(constructionTimelinePayload.data.materializedView.summary.approvedChangeOrders, 0);
  assert.equal(constructionTimelinePayload.data.materializedView.summary.changeOrderAmountCents, 1200000);
  assert.equal(constructionTimelinePayload.data.materializedView.itemCount >= 6, true);
  assert.equal(constructionTimelinePayload.data.materializedView.items.some((item) => item.kind === "construction_change_order" && item.label === "Ventilation upgrade"), true);

  const contactCreate = await runCliCapture(["db", "contact", "create", "--set", `companyId=${companyPayload.data.id}`, "--set", `accountId=${accountPayload.data.id}`, "--set", "firstName=Ada", "--set", "lastName=Buyer", "--set", "email=ada@example.test", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(contactCreate.code, CLI_EXIT_OK, contactCreate.stderr || contactCreate.stdout);
  const contactPayload = JSON.parse(contactCreate.stdout) as { data: { id: string; companyId: string; accountId: string; firstName: string; lastName: string; email: string }; meta: { collection: string; action: string } };
  assert.equal(contactPayload.meta.collection, "contacts");
  assert.equal(contactPayload.data.companyId, companyPayload.data.id);
  assert.equal(contactPayload.data.accountId, accountPayload.data.id);
  assert.equal(contactPayload.data.firstName, "Ada");

  const activityCreate = await runCliCapture(["db", "activity", "create", "--set", `companyId=${companyPayload.data.id}`, "--set", `accountId=${accountPayload.data.id}`, "--set", `dealId=${dealPayload.data.id}`, "--set", "kind=demo", "--set", "subject=Demo call", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(activityCreate.code, CLI_EXIT_OK);
  const activityPayload = JSON.parse(activityCreate.stdout) as { data: { id: string; companyId: string; accountId: string; dealId: string; kind: string; subject: string }; meta: { collection: string; action: string } };
  assert.equal(activityPayload.meta.collection, "activities");
  assert.equal(activityPayload.data.accountId, accountPayload.data.id);
  assert.equal(activityPayload.data.dealId, dealPayload.data.id);
  assert.equal(activityPayload.data.kind, "demo");

  const accountEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Account discovery note", "--kind", "document", "--collection-name", "accounts", "--record-id", accountPayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(accountEvidenceSourceCreate.code, CLI_EXIT_OK);
  const accountEvidenceSourcePayload = JSON.parse(accountEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(accountEvidenceSourcePayload.data.collectionName, "accounts");
  assert.equal(accountEvidenceSourcePayload.data.recordId, accountPayload.data.id);

  const accountGapCreate = await runCliCapture(["quality-gap", "create", "Missing account owner", "--target-collection", "accounts", "--target-id", accountPayload.data.id, "--gap-kind", "missing", "--evidence-source-id", accountEvidenceSourcePayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(accountGapCreate.code, CLI_EXIT_OK);
  const accountGapPayload = JSON.parse(accountGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(accountGapPayload.data.targetCollection, "accounts");
  assert.equal(accountGapPayload.data.targetId, accountPayload.data.id);
  assert.equal(accountGapPayload.data.gapKind, "missing");

  const crmAccountOverview = await runCliCapture(["crm", "account", accountPayload.data.id, "overview", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(crmAccountOverview.code, CLI_EXIT_OK);
  const crmAccountOverviewPayload = JSON.parse(crmAccountOverview.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: {
        subject: { id: string; label: string };
        company: { id: string; label: string } | null;
        summary: { deals: number; openDealValueCents: number; contacts: number; activities: number; evidenceSources: number; qualityGaps: number };
        records: { deals: Array<{ id: string }>; contacts: Array<{ id: string }>; activities: Array<{ id: string }>; evidence: Array<{ id: string }> };
        gaps: Array<{ id: string; gapKind: string }>;
        partial: boolean;
      };
    };
  };
  assert.equal(crmAccountOverviewPayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(crmAccountOverviewPayload.data.coverage.recordsMaterialized, true);
  assert.equal(crmAccountOverviewPayload.data.semanticView.id, "crm.account.overview");
  assert.equal(crmAccountOverviewPayload.data.semanticView.systemId, "crm");
  assert.equal(crmAccountOverviewPayload.data.materializedView.subject.id, accountPayload.data.id);
  assert.equal(crmAccountOverviewPayload.data.materializedView.subject.label, "Acme Account");
  assert.equal(crmAccountOverviewPayload.data.materializedView.company?.id, companyPayload.data.id);
  assert.equal(crmAccountOverviewPayload.data.materializedView.summary.deals, 1);
  assert.equal(crmAccountOverviewPayload.data.materializedView.summary.openDealValueCents, 2500);
  assert.equal(crmAccountOverviewPayload.data.materializedView.summary.contacts, 1);
  assert.equal(crmAccountOverviewPayload.data.materializedView.summary.activities, 1);
  assert.equal(crmAccountOverviewPayload.data.materializedView.partial, true);
  assert.equal(crmAccountOverviewPayload.data.materializedView.records.deals.some((record) => record.id === dealPayload.data.id), true);
  assert.equal(crmAccountOverviewPayload.data.materializedView.records.contacts.some((record) => record.id === contactPayload.data.id), true);
  assert.equal(crmAccountOverviewPayload.data.materializedView.records.activities.some((record) => record.id === activityPayload.data.id), true);
  assert.equal(crmAccountOverviewPayload.data.materializedView.records.evidence.some((record) => record.id === accountEvidenceSourcePayload.data.id), true);
  assert.equal(crmAccountOverviewPayload.data.materializedView.gaps.some((gap) => gap.id === accountGapPayload.data.id && gap.gapKind === "missing"), true);

  const billingCustomer = await runCliCapture(["db", "billing_customer", "create", "Acme Billing", "--company-id", companyPayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(billingCustomer.code, CLI_EXIT_OK);
  const billingCustomerPayload = JSON.parse(billingCustomer.stdout) as { data: { id: string } };
  const invoiceCreate = await runCliCapture(["invoice", "create", "INV-001", "--billing-customer", billingCustomerPayload.data.id, "--total-cents", "9900", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(invoiceCreate.code, CLI_EXIT_OK);
  const invoicePayload = JSON.parse(invoiceCreate.stdout) as { data: { id: string; number: string; billingCustomerId: string; totalCents: number; status: string }; meta: { collection: string; action: string } };
  assert.equal(invoicePayload.meta.collection, "invoices");
  assert.equal(invoicePayload.data.number, "INV-001");
  assert.equal(invoicePayload.data.billingCustomerId, billingCustomerPayload.data.id);
  assert.equal(invoicePayload.data.totalCents, 9900);
  assert.equal(invoicePayload.data.status, "draft");

  const paymentCreate = await runCliCapture(["payment", "create", "--billing-customer", billingCustomerPayload.data.id, "--invoice-id", invoicePayload.data.id, "--amount-cents", "9900", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(paymentCreate.code, CLI_EXIT_OK);
  const paymentPayload = JSON.parse(paymentCreate.stdout) as { data: { id: string; billingCustomerId: string; invoiceId: string; amountCents: number; status: string }; meta: { collection: string; action: string } };
  assert.equal(paymentPayload.meta.collection, "payment_intents");
  assert.equal(paymentPayload.data.billingCustomerId, billingCustomerPayload.data.id);
  assert.equal(paymentPayload.data.invoiceId, invoicePayload.data.id);
  assert.equal(paymentPayload.data.amountCents, 9900);
  assert.equal(paymentPayload.data.status, "requires_payment_method");

  const companyEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Company import note", "--kind", "document", "--collection-name", "companies", "--record-id", companyPayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(companyEvidenceSourceCreate.code, CLI_EXIT_OK);
  const companyEvidenceSourcePayload = JSON.parse(companyEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(companyEvidenceSourcePayload.data.collectionName, "companies");
  assert.equal(companyEvidenceSourcePayload.data.recordId, companyPayload.data.id);

  const companyGapCreate = await runCliCapture(["quality-gap", "create", "Missing tax ID", "--target-collection", "companies", "--target-id", companyPayload.data.id, "--gap-kind", "missing", "--evidence-source-id", companyEvidenceSourcePayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(companyGapCreate.code, CLI_EXIT_OK);
  const companyGapPayload = JSON.parse(companyGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(companyGapPayload.data.targetCollection, "companies");
  assert.equal(companyGapPayload.data.targetId, companyPayload.data.id);
  assert.equal(companyGapPayload.data.gapKind, "missing");

  const erpCompanyOverview = await runCliCapture(["erp", "company", companyPayload.data.id, "overview", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(erpCompanyOverview.code, CLI_EXIT_OK);
  const erpCompanyOverviewPayload = JSON.parse(erpCompanyOverview.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: {
        subject: { id: string; label: string };
        summary: { accounts: number; deals: number; openDealValueCents: number; billingCustomers: number; invoices: number; invoiceTotalCents: number; payments: number; paymentTotalCents: number; qualityGaps: number };
        records: { accounts: Array<{ id: string }>; deals: Array<{ id: string }>; invoices: Array<{ id: string }>; payments: Array<{ id: string }>; evidence: Array<{ id: string }> };
        gaps: Array<{ id: string; gapKind: string }>;
        partial: boolean;
      };
    };
  };
  assert.equal(erpCompanyOverviewPayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(erpCompanyOverviewPayload.data.coverage.recordsMaterialized, true);
  assert.equal(erpCompanyOverviewPayload.data.semanticView.id, "erp.company.overview");
  assert.equal(erpCompanyOverviewPayload.data.semanticView.systemId, "erp");
  assert.equal(erpCompanyOverviewPayload.data.materializedView.subject.id, companyPayload.data.id);
  assert.equal(erpCompanyOverviewPayload.data.materializedView.subject.label, "Acme Corp");
  assert.equal(erpCompanyOverviewPayload.data.materializedView.summary.accounts, 1);
  assert.equal(erpCompanyOverviewPayload.data.materializedView.summary.deals, 1);
  assert.equal(erpCompanyOverviewPayload.data.materializedView.summary.openDealValueCents, 2500);
  assert.equal(erpCompanyOverviewPayload.data.materializedView.summary.billingCustomers, 1);
  assert.equal(erpCompanyOverviewPayload.data.materializedView.summary.invoices, 1);
  assert.equal(erpCompanyOverviewPayload.data.materializedView.summary.invoiceTotalCents, 9900);
  assert.equal(erpCompanyOverviewPayload.data.materializedView.summary.payments, 1);
  assert.equal(erpCompanyOverviewPayload.data.materializedView.summary.paymentTotalCents, 9900);
  assert.equal(erpCompanyOverviewPayload.data.materializedView.partial, true);
  assert.equal(erpCompanyOverviewPayload.data.materializedView.records.accounts.some((record) => record.id === accountPayload.data.id), true);
  assert.equal(erpCompanyOverviewPayload.data.materializedView.records.deals.some((record) => record.id === dealPayload.data.id), true);
  assert.equal(erpCompanyOverviewPayload.data.materializedView.records.invoices.some((record) => record.id === invoicePayload.data.id), true);
  assert.equal(erpCompanyOverviewPayload.data.materializedView.records.payments.some((record) => record.id === paymentPayload.data.id), true);
  assert.equal(erpCompanyOverviewPayload.data.materializedView.records.evidence.some((record) => record.id === companyEvidenceSourcePayload.data.id), true);
  assert.equal(erpCompanyOverviewPayload.data.materializedView.gaps.some((gap) => gap.id === companyGapPayload.data.id && gap.gapKind === "missing"), true);

  const legalCaseCreate = await runCliCapture(["case", "create", "Smith v Jones", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(legalCaseCreate.code, CLI_EXIT_OK);
  const legalCasePayload = JSON.parse(legalCaseCreate.stdout) as { data: { id: string; title: string; status: string }; meta: { collection: string; action: string } };
  assert.equal(legalCasePayload.meta.collection, "legal_cases");
  assert.equal(legalCasePayload.data.title, "Smith v Jones");
  assert.equal(legalCasePayload.data.status, "open");

  const caseEvidenceCreate = await runCliCapture(["case", legalCasePayload.data.id, "evidence", "add", "Signed contract", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(caseEvidenceCreate.code, CLI_EXIT_OK);
  const caseEvidencePayload = JSON.parse(caseEvidenceCreate.stdout) as { data: { title: string; caseId: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(caseEvidencePayload.meta.invokedCommand, "case");
  assert.equal(caseEvidencePayload.meta.collection, "case_evidence");
  assert.equal(caseEvidencePayload.data.title, "Signed contract");
  assert.equal(caseEvidencePayload.data.caseId, legalCasePayload.data.id);

  const caseEvidenceList = await runCliCapture(["case", legalCasePayload.data.id, "evidence", "list", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(caseEvidenceList.code, CLI_EXIT_OK);
  const caseEvidenceListPayload = JSON.parse(caseEvidenceList.stdout) as { data: Array<{ title: string; caseId: string }>; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(caseEvidenceListPayload.meta.invokedCommand, "case");
  assert.equal(caseEvidenceListPayload.meta.collection, "case_evidence");
  assert.equal(caseEvidenceListPayload.data.length, 1);
  assert.equal(caseEvidenceListPayload.data[0]?.caseId, legalCasePayload.data.id);

  const caseClientCreate = await runCliCapture(["case", legalCasePayload.data.id, "client", "add", "Smith Client", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(caseClientCreate.code, CLI_EXIT_OK, caseClientCreate.stderr || caseClientCreate.stdout);
  const caseClientPayload = JSON.parse(caseClientCreate.stdout) as { data: { id: string; displayName: string; caseId: string; role: string; status: string; conflictStatus: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(caseClientPayload.meta.invokedCommand, "case");
  assert.equal(caseClientPayload.meta.collection, "legal_clients");
  assert.equal(caseClientPayload.meta.action, "create");
  assert.equal(caseClientPayload.data.displayName, "Smith Client");
  assert.equal(caseClientPayload.data.caseId, legalCasePayload.data.id);
  assert.equal(caseClientPayload.data.role, "client");
  assert.equal(caseClientPayload.data.status, "active");
  assert.equal(caseClientPayload.data.conflictStatus, "unknown");

  const caseClientsList = await runCliCapture(["case", legalCasePayload.data.id, "clients", "list", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(caseClientsList.code, CLI_EXIT_OK);
  const caseClientsPayload = JSON.parse(caseClientsList.stdout) as { data: Array<{ id: string; displayName: string; caseId: string }>; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(caseClientsPayload.meta.invokedCommand, "case");
  assert.equal(caseClientsPayload.meta.collection, "legal_clients");
  assert.equal(caseClientsPayload.meta.action, "list");
  assert.equal(caseClientsPayload.data.some((record) => record.id === caseClientPayload.data.id && record.caseId === legalCasePayload.data.id), true);

  const directLegalClientCreate = await runCliCapture(["legal-client", "add", "--case", legalCasePayload.data.id, "--display-name", "Direct Legal Client", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(directLegalClientCreate.code, CLI_EXIT_OK, directLegalClientCreate.stderr || directLegalClientCreate.stdout);
  const directLegalClientPayload = JSON.parse(directLegalClientCreate.stdout) as { data: { displayName: string; caseId: string }; meta: { collection: string; invokedCommand: string } };
  assert.equal(directLegalClientPayload.meta.invokedCommand, "legal-client");
  assert.equal(directLegalClientPayload.meta.collection, "legal_clients");
  assert.equal(directLegalClientPayload.data.caseId, legalCasePayload.data.id);

  const legalEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Contract file", "--kind", "file", "--collection-name", "legal_cases", "--record-id", legalCasePayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(legalEvidenceSourceCreate.code, CLI_EXIT_OK);
  const legalEvidenceSourcePayload = JSON.parse(legalEvidenceSourceCreate.stdout) as { data: { id: string; label: string; collectionName: string; recordId: string } };
  assert.equal(legalEvidenceSourcePayload.data.collectionName, "legal_cases");
  assert.equal(legalEvidenceSourcePayload.data.recordId, legalCasePayload.data.id);

  const legalGapCreate = await runCliCapture(["quality-gap", "create", "Missing filing deadline", "--target-collection", "legal_cases", "--target-id", legalCasePayload.data.id, "--gap-kind", "unverified", "--evidence-source-id", legalEvidenceSourcePayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(legalGapCreate.code, CLI_EXIT_OK);
  const legalGapPayload = JSON.parse(legalGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(legalGapPayload.data.targetCollection, "legal_cases");
  assert.equal(legalGapPayload.data.targetId, legalCasePayload.data.id);
  assert.equal(legalGapPayload.data.gapKind, "unverified");

  const caseTimeline = await runCliCapture(["case", legalCasePayload.data.id, "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(caseTimeline.code, CLI_EXIT_OK);
  const caseTimelinePayload = JSON.parse(caseTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: { subject: { id: string; label: string }; itemCount: number; partial: boolean; items: Array<{ kind: string; recordId: string; label: string }>; gaps: Array<{ id: string; gapKind: string }> };
    };
  };
  assert.equal(caseTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(caseTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(caseTimelinePayload.data.semanticView.id, "case.timeline");
  assert.equal(caseTimelinePayload.data.semanticView.systemId, "legal");
  assert.equal(caseTimelinePayload.data.materializedView.subject.id, legalCasePayload.data.id);
  assert.equal(caseTimelinePayload.data.materializedView.subject.label, "Smith v Jones");
  assert.equal(caseTimelinePayload.data.materializedView.itemCount >= 6, true);
  assert.equal(caseTimelinePayload.data.materializedView.partial, true);
  assert.equal(caseTimelinePayload.data.materializedView.items.some((item) => item.kind === "legal_client" && item.label === "Smith Client"), true);
  assert.equal(caseTimelinePayload.data.materializedView.items.some((item) => item.kind === "case_evidence" && item.label === "Signed contract"), true);
  assert.equal(caseTimelinePayload.data.materializedView.items.some((item) => item.kind === "evidence" && item.recordId === legalEvidenceSourcePayload.data.id), true);
  assert.equal(caseTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === legalGapPayload.data.id && gap.gapKind === "unverified"), true);

  const serviceCreate = await runCliCapture(["service", "create", "API", "--company", companyPayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(serviceCreate.code, CLI_EXIT_OK);
  const servicePayload = JSON.parse(serviceCreate.stdout) as { data: { id: string; name: string; companyId: string; status: string }; meta: { collection: string; action: string } };
  assert.equal(servicePayload.meta.collection, "services");
  assert.equal(servicePayload.data.name, "API");
  assert.equal(servicePayload.data.companyId, companyPayload.data.id);
  assert.equal(servicePayload.data.status, "active");

  const incidentCreate = await runCliCapture(["incident", "create", "Outage", "--service", servicePayload.data.id, "--company-id", companyPayload.data.id, "--severity", "sev2", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(incidentCreate.code, CLI_EXIT_OK);
  const incidentPayload = JSON.parse(incidentCreate.stdout) as { data: { title: string; serviceId: string; severity: string; status: string }; meta: { collection: string; action: string } };
  assert.equal(incidentPayload.meta.collection, "incidents");
  assert.equal(incidentPayload.data.title, "Outage");
  assert.equal(incidentPayload.data.serviceId, servicePayload.data.id);
  assert.equal(incidentPayload.data.severity, "sev2");
  assert.equal(incidentPayload.data.status, "open");

  const serviceIncidents = await runCliCapture(["service", servicePayload.data.id, "incidents", "list", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(serviceIncidents.code, CLI_EXIT_OK);
  const serviceIncidentsPayload = JSON.parse(serviceIncidents.stdout) as { data: Array<{ title: string; serviceId: string }>; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(serviceIncidentsPayload.meta.invokedCommand, "service");
  assert.equal(serviceIncidentsPayload.meta.collection, "incidents");
  assert.equal(serviceIncidentsPayload.data.length, 1);
  assert.equal(serviceIncidentsPayload.data[0]?.serviceId, servicePayload.data.id);

  const serviceEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Runbook", "--kind", "document", "--collection-name", "services", "--record-id", servicePayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(serviceEvidenceSourceCreate.code, CLI_EXIT_OK);
  const serviceEvidenceSourcePayload = JSON.parse(serviceEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(serviceEvidenceSourcePayload.data.collectionName, "services");
  assert.equal(serviceEvidenceSourcePayload.data.recordId, servicePayload.data.id);

  const serviceGapCreate = await runCliCapture(["quality-gap", "create", "Missing SLO", "--target-collection", "services", "--target-id", servicePayload.data.id, "--gap-kind", "missing", "--evidence-source-id", serviceEvidenceSourcePayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(serviceGapCreate.code, CLI_EXIT_OK);
  const serviceGapPayload = JSON.parse(serviceGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(serviceGapPayload.data.targetCollection, "services");
  assert.equal(serviceGapPayload.data.targetId, servicePayload.data.id);
  assert.equal(serviceGapPayload.data.gapKind, "missing");

  const serviceTimeline = await runCliCapture(["service", servicePayload.data.id, "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(serviceTimeline.code, CLI_EXIT_OK);
  const serviceTimelinePayload = JSON.parse(serviceTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: { subject: { id: string; label: string }; itemCount: number; partial: boolean; items: Array<{ kind: string; recordId: string; label: string }>; gaps: Array<{ id: string; gapKind: string }> };
    };
  };
  assert.equal(serviceTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(serviceTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(serviceTimelinePayload.data.semanticView.id, "service.timeline");
  assert.equal(serviceTimelinePayload.data.semanticView.systemId, "ops");
  assert.equal(serviceTimelinePayload.data.materializedView.subject.id, servicePayload.data.id);
  assert.equal(serviceTimelinePayload.data.materializedView.subject.label, "API");
  assert.equal(serviceTimelinePayload.data.materializedView.itemCount >= 4, true);
  assert.equal(serviceTimelinePayload.data.materializedView.partial, true);
  assert.equal(serviceTimelinePayload.data.materializedView.items.some((item) => item.kind === "incident" && item.label === "Outage"), true);
  assert.equal(serviceTimelinePayload.data.materializedView.items.some((item) => item.kind === "evidence" && item.recordId === serviceEvidenceSourcePayload.data.id), true);
  assert.equal(serviceTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === serviceGapPayload.data.id && gap.gapKind === "missing"), true);

  const studyCreate = await runCliCapture(["study", "create", "Trial A", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(studyCreate.code, CLI_EXIT_OK);
  const studyPayload = JSON.parse(studyCreate.stdout) as { data: { id: string; title: string; status: string }; meta: { collection: string; action: string } };
  assert.equal(studyPayload.meta.collection, "studies");
  assert.equal(studyPayload.data.title, "Trial A");
  assert.equal(studyPayload.data.status, "planned");

  const participantCreate = await runCliCapture(["study", studyPayload.data.id, "participants", "add", "Subject 001", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(participantCreate.code, CLI_EXIT_OK);
  const participantPayload = JSON.parse(participantCreate.stdout) as { data: { displayName: string; studyId: string; status: string; consentStatus: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(participantPayload.meta.invokedCommand, "study");
  assert.equal(participantPayload.meta.collection, "participants");
  assert.equal(participantPayload.data.displayName, "Subject 001");
  assert.equal(participantPayload.data.studyId, studyPayload.data.id);
  assert.equal(participantPayload.data.status, "screening");

  const studyParticipants = await runCliCapture(["study", studyPayload.data.id, "participants", "list", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(studyParticipants.code, CLI_EXIT_OK);
  const studyParticipantsPayload = JSON.parse(studyParticipants.stdout) as { data: Array<{ displayName: string; studyId: string }>; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(studyParticipantsPayload.meta.invokedCommand, "study");
  assert.equal(studyParticipantsPayload.meta.collection, "participants");
  assert.equal(studyParticipantsPayload.data.length, 1);
  assert.equal(studyParticipantsPayload.data[0]?.studyId, studyPayload.data.id);

  const sampleCreate = await runCliCapture(["sample", "create", "Tube A", "--study-id", studyPayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(sampleCreate.code, CLI_EXIT_OK);
  const samplePayload = JSON.parse(sampleCreate.stdout) as { data: { id: string; label: string; studyId: string; status: string }; meta: { collection: string; action: string } };
  assert.equal(samplePayload.meta.collection, "samples");
  assert.equal(samplePayload.data.label, "Tube A");
  assert.equal(samplePayload.data.studyId, studyPayload.data.id);
  assert.equal(samplePayload.data.status, "collected");

  const assayCreate = await runCliCapture(["sample", samplePayload.data.id, "assays", "add", "CBC", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(assayCreate.code, CLI_EXIT_OK);
  const assayPayload = JSON.parse(assayCreate.stdout) as { data: { name: string; sampleId: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(assayPayload.meta.invokedCommand, "sample");
  assert.equal(assayPayload.meta.collection, "assays");
  assert.equal(assayPayload.data.name, "CBC");
  assert.equal(assayPayload.data.sampleId, samplePayload.data.id);
  assert.equal(assayPayload.data.status, "ordered");

  const assaysAliasList = await runCliCapture(["assays", "list", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(assaysAliasList.code, CLI_EXIT_OK);
  const assaysAliasPayload = JSON.parse(assaysAliasList.stdout) as { ok: boolean; data: Array<{ id: string; name: string }>; meta: { canonicalCommand: string; invokedCommand: string; collection: string; action: string } };
  assert.equal(assaysAliasPayload.ok, true);
  assert.equal(assaysAliasPayload.meta.canonicalCommand, "database");
  assert.equal(assaysAliasPayload.meta.invokedCommand, "assays");
  assert.equal(assaysAliasPayload.meta.collection, "assays");
  assert.equal(assaysAliasPayload.meta.action, "list");
  assert.equal(assaysAliasPayload.data.some((record) => record.id === assayPayload.data.id), true);

  const sampleEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Sample accession", "--kind", "document", "--collection-name", "samples", "--record-id", samplePayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(sampleEvidenceSourceCreate.code, CLI_EXIT_OK);
  const sampleEvidenceSourcePayload = JSON.parse(sampleEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(sampleEvidenceSourcePayload.data.collectionName, "samples");
  assert.equal(sampleEvidenceSourcePayload.data.recordId, samplePayload.data.id);

  const sampleGapCreate = await runCliCapture(["quality-gap", "create", "Missing storage location", "--target-collection", "samples", "--target-id", samplePayload.data.id, "--gap-kind", "missing", "--evidence-source-id", sampleEvidenceSourcePayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(sampleGapCreate.code, CLI_EXIT_OK);
  const sampleGapPayload = JSON.parse(sampleGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(sampleGapPayload.data.targetCollection, "samples");
  assert.equal(sampleGapPayload.data.targetId, samplePayload.data.id);
  assert.equal(sampleGapPayload.data.gapKind, "missing");

  const sampleTimeline = await runCliCapture(["sample", samplePayload.data.id, "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(sampleTimeline.code, CLI_EXIT_OK);
  const sampleTimelinePayload = JSON.parse(sampleTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: { subject: { id: string; label: string }; itemCount: number; partial: boolean; items: Array<{ kind: string; recordId: string; label: string }>; gaps: Array<{ id: string; gapKind: string }> };
    };
  };
  assert.equal(sampleTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(sampleTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(sampleTimelinePayload.data.semanticView.id, "sample.timeline");
  assert.equal(sampleTimelinePayload.data.semanticView.systemId, "labs");
  assert.equal(sampleTimelinePayload.data.materializedView.subject.id, samplePayload.data.id);
  assert.equal(sampleTimelinePayload.data.materializedView.subject.label, "Tube A");
  assert.equal(sampleTimelinePayload.data.materializedView.itemCount >= 4, true);
  assert.equal(sampleTimelinePayload.data.materializedView.partial, true);
  assert.equal(sampleTimelinePayload.data.materializedView.items.some((item) => item.kind === "assay" && item.label === "CBC"), true);
  assert.equal(sampleTimelinePayload.data.materializedView.items.some((item) => item.kind === "evidence" && item.recordId === sampleEvidenceSourcePayload.data.id), true);
  assert.equal(sampleTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === sampleGapPayload.data.id && gap.gapKind === "missing"), true);

  const studyEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Protocol synopsis", "--kind", "document", "--collection-name", "studies", "--record-id", studyPayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(studyEvidenceSourceCreate.code, CLI_EXIT_OK);
  const studyEvidenceSourcePayload = JSON.parse(studyEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(studyEvidenceSourcePayload.data.collectionName, "studies");
  assert.equal(studyEvidenceSourcePayload.data.recordId, studyPayload.data.id);

  const studyGapCreate = await runCliCapture(["quality-gap", "create", "Missing consent audit", "--target-collection", "studies", "--target-id", studyPayload.data.id, "--gap-kind", "unverified", "--evidence-source-id", studyEvidenceSourcePayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(studyGapCreate.code, CLI_EXIT_OK);
  const studyGapPayload = JSON.parse(studyGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(studyGapPayload.data.targetCollection, "studies");
  assert.equal(studyGapPayload.data.targetId, studyPayload.data.id);
  assert.equal(studyGapPayload.data.gapKind, "unverified");

  const studyTimeline = await runCliCapture(["study", studyPayload.data.id, "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(studyTimeline.code, CLI_EXIT_OK);
  const studyTimelinePayload = JSON.parse(studyTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: { subject: { id: string; label: string }; itemCount: number; partial: boolean; items: Array<{ kind: string; recordId: string; label: string }>; gaps: Array<{ id: string; gapKind: string }> };
    };
  };
  assert.equal(studyTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(studyTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(studyTimelinePayload.data.semanticView.id, "study.timeline");
  assert.equal(studyTimelinePayload.data.semanticView.systemId, "research");
  assert.equal(studyTimelinePayload.data.materializedView.subject.id, studyPayload.data.id);
  assert.equal(studyTimelinePayload.data.materializedView.subject.label, "Trial A");
  assert.equal(studyTimelinePayload.data.materializedView.itemCount >= 5, true);
  assert.equal(studyTimelinePayload.data.materializedView.partial, true);
  assert.equal(studyTimelinePayload.data.materializedView.items.some((item) => item.kind === "participant" && item.label === "Subject 001"), true);
  assert.equal(studyTimelinePayload.data.materializedView.items.some((item) => item.kind === "sample" && item.label === "Tube A"), true);
  assert.equal(studyTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === studyGapPayload.data.id && gap.gapKind === "unverified"), true);

  const learnerCreate = await runCliCapture(["learner", "create", "Ada Learner", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(learnerCreate.code, CLI_EXIT_OK);
  const learnerPayload = JSON.parse(learnerCreate.stdout) as { data: { id: string; displayName: string; status: string }; meta: { collection: string; action: string } };
  assert.equal(learnerPayload.meta.collection, "learners");
  assert.equal(learnerPayload.data.displayName, "Ada Learner");
  assert.equal(learnerPayload.data.status, "active");

  const courseCreate = await runCliCapture(["course", "create", "Intro Biology", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(courseCreate.code, CLI_EXIT_OK);
  const coursePayload = JSON.parse(courseCreate.stdout) as { data: { id: string; title: string; status: string }; meta: { collection: string; action: string } };
  assert.equal(coursePayload.meta.collection, "courses");
  assert.equal(coursePayload.data.title, "Intro Biology");
  assert.equal(coursePayload.data.status, "enrolled");

  const lessonCreate = await runCliCapture(["course", coursePayload.data.id, "lessons", "add", "Cell basics", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(lessonCreate.code, CLI_EXIT_OK);
  const lessonPayload = JSON.parse(lessonCreate.stdout) as { data: { id: string; title: string; courseId: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(lessonPayload.meta.invokedCommand, "course");
  assert.equal(lessonPayload.meta.collection, "lessons");
  assert.equal(lessonPayload.meta.action, "create");
  assert.equal(lessonPayload.data.title, "Cell basics");
  assert.equal(lessonPayload.data.courseId, coursePayload.data.id);

  const courseLessons = await runCliCapture(["course", coursePayload.data.id, "lessons", "list", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(courseLessons.code, CLI_EXIT_OK);
  const courseLessonsPayload = JSON.parse(courseLessons.stdout) as { data: Array<{ id: string; courseId: string; title: string }>; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(courseLessonsPayload.meta.invokedCommand, "course");
  assert.equal(courseLessonsPayload.meta.collection, "lessons");
  assert.equal(courseLessonsPayload.meta.action, "list");
  assert.equal(courseLessonsPayload.data.some((record) => record.id === lessonPayload.data.id && record.courseId === coursePayload.data.id), true);

  const studySessionCreate = await runCliCapture(["course", coursePayload.data.id, "sessions", "add", "--set", "topic=Biology review", "--set", "startedAt=2026-05-17T00:00:00.000Z", "--set", "durationMinutes=45", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(studySessionCreate.code, CLI_EXIT_OK);
  const studySessionPayload = JSON.parse(studySessionCreate.stdout) as { data: { id: string; topic: string; courseId: string; startedAt: string; durationMinutes: number }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(studySessionPayload.meta.invokedCommand, "course");
  assert.equal(studySessionPayload.meta.collection, "study_sessions");
  assert.equal(studySessionPayload.data.topic, "Biology review");
  assert.equal(studySessionPayload.data.courseId, coursePayload.data.id);

  const learnerCourseRelationCreate = await runCliCapture(["relation", "create", "--from-entity-kind", "learners", "--from-entity-id", learnerPayload.data.id, "--to-entity-kind", "courses", "--to-entity-id", coursePayload.data.id, "--type", "member_of", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(learnerCourseRelationCreate.code, CLI_EXIT_OK, learnerCourseRelationCreate.stderr || learnerCourseRelationCreate.stdout);
  const learnerCourseRelationPayload = JSON.parse(learnerCourseRelationCreate.stdout) as { data: { id: string; fromEntityKind: string; fromEntityId: string; toEntityKind: string; toEntityId: string; type: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(learnerCourseRelationPayload.meta.invokedCommand, "relation");
  assert.equal(learnerCourseRelationPayload.meta.collection, "entity_relations");
  assert.equal(learnerCourseRelationPayload.data.fromEntityKind, "learners");
  assert.equal(learnerCourseRelationPayload.data.fromEntityId, learnerPayload.data.id);
  assert.equal(learnerCourseRelationPayload.data.toEntityKind, "courses");
  assert.equal(learnerCourseRelationPayload.data.toEntityId, coursePayload.data.id);
  assert.equal(learnerCourseRelationPayload.data.type, "member_of");

  const learnerEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Learner record", "--kind", "document", "--collection-name", "learners", "--record-id", learnerPayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(learnerEvidenceSourceCreate.code, CLI_EXIT_OK);
  const learnerEvidenceSourcePayload = JSON.parse(learnerEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(learnerEvidenceSourcePayload.data.collectionName, "learners");
  assert.equal(learnerEvidenceSourcePayload.data.recordId, learnerPayload.data.id);

  const courseEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Course syllabus", "--kind", "document", "--collection-name", "courses", "--record-id", coursePayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(courseEvidenceSourceCreate.code, CLI_EXIT_OK);
  const courseEvidenceSourcePayload = JSON.parse(courseEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(courseEvidenceSourcePayload.data.collectionName, "courses");
  assert.equal(courseEvidenceSourcePayload.data.recordId, coursePayload.data.id);

  const learnerGapCreate = await runCliCapture(["quality-gap", "create", "Missing credential evidence", "--target-collection", "learners", "--target-id", learnerPayload.data.id, "--gap-kind", "missing", "--evidence-source-id", learnerEvidenceSourcePayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(learnerGapCreate.code, CLI_EXIT_OK);
  const learnerGapPayload = JSON.parse(learnerGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(learnerGapPayload.data.targetCollection, "learners");
  assert.equal(learnerGapPayload.data.targetId, learnerPayload.data.id);
  assert.equal(learnerGapPayload.data.gapKind, "missing");

  const courseGapCreate = await runCliCapture(["quality-gap", "create", "Missing assessment rubric", "--target-collection", "courses", "--target-id", coursePayload.data.id, "--gap-kind", "missing", "--evidence-source-id", courseEvidenceSourcePayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(courseGapCreate.code, CLI_EXIT_OK);
  const courseGapPayload = JSON.parse(courseGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(courseGapPayload.data.targetCollection, "courses");
  assert.equal(courseGapPayload.data.targetId, coursePayload.data.id);
  assert.equal(courseGapPayload.data.gapKind, "missing");

  const learnerTimeline = await runCliCapture(["learner", learnerPayload.data.id, "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(learnerTimeline.code, CLI_EXIT_OK);
  const learnerTimelinePayload = JSON.parse(learnerTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: { subject: { id: string; label: string }; summary: { courses: number; relations: number; evidenceSources: number; qualityGaps: number }; itemCount: number; partial: boolean; items: Array<{ kind: string; recordId: string; label: string }>; records: { courses: Array<{ id: string }>; relations: Array<{ id: string }> }; gaps: Array<{ id: string; gapKind: string }> };
    };
  };
  assert.equal(learnerTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(learnerTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(learnerTimelinePayload.data.semanticView.id, "learner.timeline");
  assert.equal(learnerTimelinePayload.data.semanticView.systemId, "education");
  assert.equal(learnerTimelinePayload.data.materializedView.subject.id, learnerPayload.data.id);
  assert.equal(learnerTimelinePayload.data.materializedView.subject.label, "Ada Learner");
  assert.equal(learnerTimelinePayload.data.materializedView.summary.courses, 1);
  assert.equal(learnerTimelinePayload.data.materializedView.summary.relations, 1);
  assert.equal(learnerTimelinePayload.data.materializedView.summary.evidenceSources, 1);
  assert.equal(learnerTimelinePayload.data.materializedView.summary.qualityGaps, 1);
  assert.equal(learnerTimelinePayload.data.materializedView.itemCount >= 5, true);
  assert.equal(learnerTimelinePayload.data.materializedView.partial, true);
  assert.equal(learnerTimelinePayload.data.materializedView.items.some((item) => item.kind === "course" && item.label === "Intro Biology"), true);
  assert.equal(learnerTimelinePayload.data.materializedView.items.some((item) => item.kind === "relation" && item.recordId === learnerCourseRelationPayload.data.id), true);
  assert.equal(learnerTimelinePayload.data.materializedView.records.courses.some((record) => record.id === coursePayload.data.id), true);
  assert.equal(learnerTimelinePayload.data.materializedView.records.relations.some((record) => record.id === learnerCourseRelationPayload.data.id), true);
  assert.equal(learnerTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === learnerGapPayload.data.id && gap.gapKind === "missing"), true);

  const courseTimeline = await runCliCapture(["course", coursePayload.data.id, "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(courseTimeline.code, CLI_EXIT_OK);
  const courseTimelinePayload = JSON.parse(courseTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: { subject: { id: string; label: string }; summary: { lessons: number; studySessions: number; learners: number; relations: number; evidenceSources: number; qualityGaps: number }; itemCount: number; partial: boolean; items: Array<{ kind: string; recordId: string; label: string }>; records: { lessons: Array<{ id: string }>; studySessions: Array<{ id: string }>; learners: Array<{ id: string }>; relations: Array<{ id: string }>; evidence: Array<{ id: string }> }; gaps: Array<{ id: string; gapKind: string }> };
    };
  };
  assert.equal(courseTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(courseTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(courseTimelinePayload.data.semanticView.id, "course.timeline");
  assert.equal(courseTimelinePayload.data.semanticView.systemId, "education");
  assert.equal(courseTimelinePayload.data.materializedView.subject.id, coursePayload.data.id);
  assert.equal(courseTimelinePayload.data.materializedView.subject.label, "Intro Biology");
  assert.equal(courseTimelinePayload.data.materializedView.summary.lessons, 1);
  assert.equal(courseTimelinePayload.data.materializedView.summary.studySessions, 1);
  assert.equal(courseTimelinePayload.data.materializedView.summary.learners, 1);
  assert.equal(courseTimelinePayload.data.materializedView.summary.relations, 1);
  assert.equal(courseTimelinePayload.data.materializedView.summary.evidenceSources, 1);
  assert.equal(courseTimelinePayload.data.materializedView.summary.qualityGaps, 1);
  assert.equal(courseTimelinePayload.data.materializedView.itemCount >= 7, true);
  assert.equal(courseTimelinePayload.data.materializedView.partial, true);
  assert.equal(courseTimelinePayload.data.materializedView.items.some((item) => item.kind === "lesson" && item.label === "Cell basics"), true);
  assert.equal(courseTimelinePayload.data.materializedView.items.some((item) => item.kind === "study_session" && item.label === "Biology review"), true);
  assert.equal(courseTimelinePayload.data.materializedView.items.some((item) => item.kind === "learner" && item.label === "Ada Learner"), true);
  assert.equal(courseTimelinePayload.data.materializedView.records.lessons.some((record) => record.id === lessonPayload.data.id), true);
  assert.equal(courseTimelinePayload.data.materializedView.records.studySessions.some((record) => record.id === studySessionPayload.data.id), true);
  assert.equal(courseTimelinePayload.data.materializedView.records.learners.some((record) => record.id === learnerPayload.data.id), true);
  assert.equal(courseTimelinePayload.data.materializedView.records.relations.some((record) => record.id === learnerCourseRelationPayload.data.id), true);
  assert.equal(courseTimelinePayload.data.materializedView.records.evidence.some((record) => record.id === courseEvidenceSourcePayload.data.id), true);
  assert.equal(courseTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === courseGapPayload.data.id && gap.gapKind === "missing"), true);

  const assetCreate = await runCliCapture(["asset", "create", "--company", companyPayload.data.id, "--account-id", accountPayload.data.id, "--product", erpProductPayload.data.id, "--serial-number", "PRESS-001", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(assetCreate.code, CLI_EXIT_OK);
  const assetPayload = JSON.parse(assetCreate.stdout) as { data: { id: string; companyId: string; accountId: string; productCatalogId: string; serialNumber: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(assetPayload.meta.invokedCommand, "asset");
  assert.equal(assetPayload.meta.collection, "assets");
  assert.equal(assetPayload.data.companyId, companyPayload.data.id);
  assert.equal(assetPayload.data.accountId, accountPayload.data.id);
  assert.equal(assetPayload.data.productCatalogId, erpProductPayload.data.id);
  assert.equal(assetPayload.data.serialNumber, "PRESS-001");
  assert.equal(assetPayload.data.status, "active");

  const assetEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Asset install record", "--kind", "document", "--collection-name", "assets", "--record-id", assetPayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(assetEvidenceSourceCreate.code, CLI_EXIT_OK);
  const assetEvidenceSourcePayload = JSON.parse(assetEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(assetEvidenceSourcePayload.data.collectionName, "assets");
  assert.equal(assetEvidenceSourcePayload.data.recordId, assetPayload.data.id);

  const assetGapCreate = await runCliCapture(["quality-gap", "create", "Missing maintenance plan", "--target-collection", "assets", "--target-id", assetPayload.data.id, "--gap-kind", "missing", "--evidence-source-id", assetEvidenceSourcePayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(assetGapCreate.code, CLI_EXIT_OK);
  const assetGapPayload = JSON.parse(assetGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(assetGapPayload.data.targetCollection, "assets");
  assert.equal(assetGapPayload.data.targetId, assetPayload.data.id);

  const workOrderCreate = await runCliCapture(["asset", assetPayload.data.id, "work-orders", "add", "Batch 42", "--company", companyPayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(workOrderCreate.code, CLI_EXIT_OK);
  const workOrderPayload = JSON.parse(workOrderCreate.stdout) as { data: { id: string; title: string; companyId: string; assetId: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(workOrderPayload.meta.invokedCommand, "asset");
  assert.equal(workOrderPayload.meta.collection, "work_orders");
  assert.equal(workOrderPayload.data.title, "Batch 42");
  assert.equal(workOrderPayload.data.companyId, companyPayload.data.id);
  assert.equal(workOrderPayload.data.assetId, assetPayload.data.id);
  assert.equal(workOrderPayload.data.status, "planned");

  const assetWorkOrders = await runCliCapture(["asset", assetPayload.data.id, "work-orders", "list", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(assetWorkOrders.code, CLI_EXIT_OK);
  const assetWorkOrdersPayload = JSON.parse(assetWorkOrders.stdout) as { data: Array<{ id: string; assetId: string; title: string }>; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(assetWorkOrdersPayload.meta.invokedCommand, "asset");
  assert.equal(assetWorkOrdersPayload.meta.collection, "work_orders");
  assert.equal(assetWorkOrdersPayload.meta.action, "list");
  assert.equal(assetWorkOrdersPayload.data.some((record) => record.id === workOrderPayload.data.id && record.assetId === assetPayload.data.id), true);

  const workOrderEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Batch traveler", "--kind", "document", "--collection-name", "work_orders", "--record-id", workOrderPayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(workOrderEvidenceSourceCreate.code, CLI_EXIT_OK);
  const workOrderEvidenceSourcePayload = JSON.parse(workOrderEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(workOrderEvidenceSourcePayload.data.collectionName, "work_orders");
  assert.equal(workOrderEvidenceSourcePayload.data.recordId, workOrderPayload.data.id);

  const workOrderGapCreate = await runCliCapture(["quality-gap", "create", "Missing quality check", "--target-collection", "work_orders", "--target-id", workOrderPayload.data.id, "--gap-kind", "missing", "--evidence-source-id", workOrderEvidenceSourcePayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(workOrderGapCreate.code, CLI_EXIT_OK);
  const workOrderGapPayload = JSON.parse(workOrderGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(workOrderGapPayload.data.targetCollection, "work_orders");
  assert.equal(workOrderGapPayload.data.targetId, workOrderPayload.data.id);
  assert.equal(workOrderGapPayload.data.gapKind, "missing");

  const workOrderTimeline = await runCliCapture(["work-order", workOrderPayload.data.id, "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(workOrderTimeline.code, CLI_EXIT_OK);
  const workOrderTimelinePayload = JSON.parse(workOrderTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: { subject: { id: string; label: string }; itemCount: number; partial: boolean; items: Array<{ kind: string; recordId: string; label: string }>; gaps: Array<{ id: string; gapKind: string }> };
    };
  };
  assert.equal(workOrderTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(workOrderTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(workOrderTimelinePayload.data.semanticView.id, "work_order.timeline");
  assert.equal(workOrderTimelinePayload.data.semanticView.systemId, "manufacturing");
  assert.equal(workOrderTimelinePayload.data.materializedView.subject.id, workOrderPayload.data.id);
  assert.equal(workOrderTimelinePayload.data.materializedView.subject.label, "Batch 42");
  assert.equal(workOrderTimelinePayload.data.materializedView.itemCount >= 3, true);
  assert.equal(workOrderTimelinePayload.data.materializedView.partial, true);
  assert.equal(workOrderTimelinePayload.data.materializedView.items.some((item) => item.kind === "work_order" && item.label === "Batch 42"), true);
  assert.equal(workOrderTimelinePayload.data.materializedView.items.some((item) => item.kind === "evidence" && item.recordId === workOrderEvidenceSourcePayload.data.id), true);
  assert.equal(workOrderTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === workOrderGapPayload.data.id && gap.gapKind === "missing"), true);

  const assetTimeline = await runCliCapture(["asset", assetPayload.data.id, "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(assetTimeline.code, CLI_EXIT_OK);
  const assetTimelinePayload = JSON.parse(assetTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: { subject: { id: string; label: string }; summary: { workOrders: number; evidenceSources: number; qualityGaps: number }; itemCount: number; partial: boolean; company: { id: string } | null; account: { id: string } | null; product: { id: string } | null; items: Array<{ kind: string; recordId: string; label: string }>; records: { workOrders: Array<{ id: string }>; evidence: Array<{ id: string }> }; gaps: Array<{ id: string; gapKind: string }> };
    };
  };
  assert.equal(assetTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(assetTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(assetTimelinePayload.data.semanticView.id, "asset.timeline");
  assert.equal(assetTimelinePayload.data.semanticView.systemId, "manufacturing");
  assert.equal(assetTimelinePayload.data.materializedView.subject.id, assetPayload.data.id);
  assert.equal(assetTimelinePayload.data.materializedView.subject.label, "PRESS-001");
  assert.equal(assetTimelinePayload.data.materializedView.company?.id, companyPayload.data.id);
  assert.equal(assetTimelinePayload.data.materializedView.account?.id, accountPayload.data.id);
  assert.equal(assetTimelinePayload.data.materializedView.product?.id, erpProductPayload.data.id);
  assert.equal(assetTimelinePayload.data.materializedView.summary.workOrders, 1);
  assert.equal(assetTimelinePayload.data.materializedView.summary.evidenceSources, 1);
  assert.equal(assetTimelinePayload.data.materializedView.summary.qualityGaps, 1);
  assert.equal(assetTimelinePayload.data.materializedView.itemCount >= 6, true);
  assert.equal(assetTimelinePayload.data.materializedView.partial, true);
  assert.equal(assetTimelinePayload.data.materializedView.items.some((item) => item.kind === "work_order" && item.recordId === workOrderPayload.data.id), true);
  assert.equal(assetTimelinePayload.data.materializedView.records.workOrders.some((record) => record.id === workOrderPayload.data.id), true);
  assert.equal(assetTimelinePayload.data.materializedView.records.evidence.some((record) => record.id === assetEvidenceSourcePayload.data.id), true);
  assert.equal(assetTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === assetGapPayload.data.id && gap.gapKind === "missing"), true);

  const companyTimeline = await runCliCapture(["company", companyPayload.data.id, "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(companyTimeline.code, CLI_EXIT_OK);
  const companyTimelinePayload = JSON.parse(companyTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: { subject: { id: string; label: string }; summary: { accounts: number; deals: number; contacts: number; activities: number; billingCustomers: number; invoices: number; payments: number; services: number; workOrders: number; assets: number; products: number; evidenceSources: number; qualityGaps: number }; itemCount: number; partial: boolean; items: Array<{ kind: string; recordId: string; label: string }>; records: { accounts: Array<{ id: string }>; deals: Array<{ id: string }>; contacts: Array<{ id: string }>; activities: Array<{ id: string }>; billingCustomers: Array<{ id: string }>; invoices: Array<{ id: string }>; payments: Array<{ id: string }>; services: Array<{ id: string }>; workOrders: Array<{ id: string }>; assets: Array<{ id: string }>; products: Array<{ id: string }>; evidence: Array<{ id: string }> }; gaps: Array<{ id: string; gapKind: string }> };
    };
  };
  assert.equal(companyTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(companyTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(companyTimelinePayload.data.semanticView.id, "company.timeline");
  assert.equal(companyTimelinePayload.data.semanticView.systemId, "erp");
  assert.equal(companyTimelinePayload.data.materializedView.subject.id, companyPayload.data.id);
  assert.equal(companyTimelinePayload.data.materializedView.subject.label, "Acme Corp");
  assert.equal(companyTimelinePayload.data.materializedView.summary.accounts, 1);
  assert.equal(companyTimelinePayload.data.materializedView.summary.deals, 1);
  assert.equal(companyTimelinePayload.data.materializedView.summary.contacts, 1);
  assert.equal(companyTimelinePayload.data.materializedView.summary.activities, 1);
  assert.equal(companyTimelinePayload.data.materializedView.summary.billingCustomers, 1);
  assert.equal(companyTimelinePayload.data.materializedView.summary.invoices, 1);
  assert.equal(companyTimelinePayload.data.materializedView.summary.payments, 1);
  assert.equal(companyTimelinePayload.data.materializedView.summary.services, 1);
  assert.equal(companyTimelinePayload.data.materializedView.summary.workOrders, 1);
  assert.equal(companyTimelinePayload.data.materializedView.summary.assets, 1);
  assert.equal(companyTimelinePayload.data.materializedView.summary.products, 1);
  assert.equal(companyTimelinePayload.data.materializedView.summary.evidenceSources, 1);
  assert.equal(companyTimelinePayload.data.materializedView.summary.qualityGaps, 1);
  assert.equal(companyTimelinePayload.data.materializedView.itemCount >= 14, true);
  assert.equal(companyTimelinePayload.data.materializedView.partial, true);
  assert.equal(companyTimelinePayload.data.materializedView.records.accounts.some((record) => record.id === accountPayload.data.id), true);
  assert.equal(companyTimelinePayload.data.materializedView.records.deals.some((record) => record.id === dealPayload.data.id), true);
  assert.equal(companyTimelinePayload.data.materializedView.records.contacts.some((record) => record.id === contactPayload.data.id), true);
  assert.equal(companyTimelinePayload.data.materializedView.records.activities.some((record) => record.id === activityPayload.data.id), true);
  assert.equal(companyTimelinePayload.data.materializedView.records.billingCustomers.some((record) => record.id === billingCustomerPayload.data.id), true);
  assert.equal(companyTimelinePayload.data.materializedView.records.invoices.some((record) => record.id === invoicePayload.data.id), true);
  assert.equal(companyTimelinePayload.data.materializedView.records.payments.some((record) => record.id === paymentPayload.data.id), true);
  assert.equal(companyTimelinePayload.data.materializedView.records.services.some((record) => record.id === servicePayload.data.id), true);
  assert.equal(companyTimelinePayload.data.materializedView.records.workOrders.some((record) => record.id === workOrderPayload.data.id), true);
  assert.equal(companyTimelinePayload.data.materializedView.records.assets.some((record) => record.id === assetPayload.data.id), true);
  assert.equal(companyTimelinePayload.data.materializedView.records.products.some((record) => record.id === erpProductPayload.data.id), true);
  assert.equal(companyTimelinePayload.data.materializedView.records.evidence.some((record) => record.id === companyEvidenceSourcePayload.data.id), true);
  assert.equal(companyTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === companyGapPayload.data.id && gap.gapKind === "missing"), true);

  const companiesAliasList = await runCliCapture(["companies", "list", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(companiesAliasList.code, CLI_EXIT_OK);
  const companiesAliasPayload = JSON.parse(companiesAliasList.stdout) as { ok: boolean; data: Array<{ id: string; name: string }>; meta: { canonicalCommand: string; invokedCommand: string; collection: string; action: string } };
  assert.equal(companiesAliasPayload.ok, true);
  assert.equal(companiesAliasPayload.meta.canonicalCommand, "database");
  assert.equal(companiesAliasPayload.meta.invokedCommand, "companies");
  assert.equal(companiesAliasPayload.meta.collection, "companies");
  assert.equal(companiesAliasPayload.meta.action, "list");
  assert.equal(companiesAliasPayload.data.some((record) => record.id === companyPayload.data.id), true);

  const financialAccountCreate = await runCliCapture(["financial-account", "create", "Operating Account", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(financialAccountCreate.code, CLI_EXIT_OK);
  const financialAccountPayload = JSON.parse(financialAccountCreate.stdout) as { data: { id: string; name: string }; meta: { collection: string; action: string } };
  assert.equal(financialAccountPayload.meta.collection, "financial_accounts");
  assert.equal(financialAccountPayload.data.name, "Operating Account");

  const transactionCreate = await runCliCapture(["transaction", "create", "Lunch", "--account", financialAccountPayload.data.id, "--amount-cents", "1200", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(transactionCreate.code, CLI_EXIT_OK);
  const transactionPayload = JSON.parse(transactionCreate.stdout) as { data: { id: string; description: string; accountId: string; amountCents: number; currency: string; postedAt: string }; meta: { collection: string; action: string } };
  assert.equal(transactionPayload.meta.collection, "transactions");
  assert.equal(transactionPayload.data.description, "Lunch");
  assert.equal(transactionPayload.data.accountId, financialAccountPayload.data.id);
  assert.equal(transactionPayload.data.amountCents, 1200);
  assert.equal(transactionPayload.data.currency, "USD");
  assert.equal(typeof transactionPayload.data.postedAt, "string");

  const financeEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Bank statement", "--kind", "document", "--collection-name", "financial_accounts", "--record-id", financialAccountPayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(financeEvidenceSourceCreate.code, CLI_EXIT_OK);
  const financeEvidenceSourcePayload = JSON.parse(financeEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(financeEvidenceSourcePayload.data.collectionName, "financial_accounts");
  assert.equal(financeEvidenceSourcePayload.data.recordId, financialAccountPayload.data.id);

  const financeGapCreate = await runCliCapture(["quality-gap", "create", "Missing reconciliation status", "--target-collection", "financial_accounts", "--target-id", financialAccountPayload.data.id, "--gap-kind", "missing", "--evidence-source-id", financeEvidenceSourcePayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(financeGapCreate.code, CLI_EXIT_OK);
  const financeGapPayload = JSON.parse(financeGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(financeGapPayload.data.targetCollection, "financial_accounts");
  assert.equal(financeGapPayload.data.targetId, financialAccountPayload.data.id);
  assert.equal(financeGapPayload.data.gapKind, "missing");

  const financeEntityOverview = await runCliCapture(["finance", "entity", financialAccountPayload.data.id, "overview", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(financeEntityOverview.code, CLI_EXIT_OK);
  const financeEntityOverviewPayload = JSON.parse(financeEntityOverview.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: {
        subject: { id: string; label: string };
        summary: { transactions: number; debitCents: number; netAmountCents: number; currency: string; evidenceSources: number; qualityGaps: number };
        records: { transactions: Array<{ id: string }>; evidence: Array<{ id: string }> };
        gaps: Array<{ id: string; gapKind: string }>;
        partial: boolean;
      };
    };
  };
  assert.equal(financeEntityOverviewPayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(financeEntityOverviewPayload.data.coverage.recordsMaterialized, true);
  assert.equal(financeEntityOverviewPayload.data.semanticView.id, "finance.entity.overview");
  assert.equal(financeEntityOverviewPayload.data.semanticView.systemId, "finance");
  assert.equal(financeEntityOverviewPayload.data.materializedView.subject.id, financialAccountPayload.data.id);
  assert.equal(financeEntityOverviewPayload.data.materializedView.subject.label, "Operating Account");
  assert.equal(financeEntityOverviewPayload.data.materializedView.summary.transactions, 1);
  assert.equal(financeEntityOverviewPayload.data.materializedView.summary.debitCents, 1200);
  assert.equal(financeEntityOverviewPayload.data.materializedView.summary.netAmountCents, 1200);
  assert.equal(financeEntityOverviewPayload.data.materializedView.summary.currency, "USD");
  assert.equal(financeEntityOverviewPayload.data.materializedView.partial, true);
  assert.equal(financeEntityOverviewPayload.data.materializedView.records.transactions.some((record) => record.id === transactionPayload.data.id), true);
  assert.equal(financeEntityOverviewPayload.data.materializedView.records.evidence.some((record) => record.id === financeEvidenceSourcePayload.data.id), true);
  assert.equal(financeEntityOverviewPayload.data.materializedView.gaps.some((gap) => gap.id === financeGapPayload.data.id && gap.gapKind === "missing"), true);

  const accountingEntityOverview = await runCliCapture(["accounting", "entity", financialAccountPayload.data.id, "overview", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(accountingEntityOverview.code, CLI_EXIT_OK);
  const accountingEntityOverviewPayload = JSON.parse(accountingEntityOverview.stdout) as { data: { coverage: { implementationStatus: string }; semanticView: { id: string }; materializedView: { subject: { id: string } } } };
  assert.equal(accountingEntityOverviewPayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(accountingEntityOverviewPayload.data.semanticView.id, "finance.entity.overview");
  assert.equal(accountingEntityOverviewPayload.data.materializedView.subject.id, financialAccountPayload.data.id);

  const organismCreate = await runCliCapture(["organism", "create", "Mouse A", "--species", "Mus musculus", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(organismCreate.code, CLI_EXIT_OK);
  const organismPayload = JSON.parse(organismCreate.stdout) as { data: { id: string; label: string; species: string; status: string }; meta: { collection: string; action: string } };
  assert.equal(organismPayload.meta.collection, "organisms");
  assert.equal(organismPayload.data.label, "Mouse A");
  assert.equal(organismPayload.data.species, "Mus musculus");
  assert.equal(organismPayload.data.status, "active");

  const experimentCreate = await runCliCapture(["experiment", "create", "Dose response", "--organism", organismPayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(experimentCreate.code, CLI_EXIT_OK);
  const experimentPayload = JSON.parse(experimentCreate.stdout) as { data: { id: string; title: string; organismId: string; status: string }; meta: { collection: string; action: string } };
  assert.equal(experimentPayload.meta.collection, "biology_experiments");
  assert.equal(experimentPayload.data.title, "Dose response");
  assert.equal(experimentPayload.data.organismId, organismPayload.data.id);
  assert.equal(experimentPayload.data.status, "planned");

  const experimentSample = await runCliCapture(["experiment", experimentPayload.data.id, "samples", "add", "Exp sample 1", "--organism", organismPayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(experimentSample.code, CLI_EXIT_OK);
  const experimentSamplePayload = JSON.parse(experimentSample.stdout) as { data: { id: string; label: string; biologyExperimentId: string; organismId: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(experimentSamplePayload.meta.invokedCommand, "experiment");
  assert.equal(experimentSamplePayload.meta.collection, "samples");
  assert.equal(experimentSamplePayload.data.label, "Exp sample 1");
  assert.equal(experimentSamplePayload.data.biologyExperimentId, experimentPayload.data.id);
  assert.equal(experimentSamplePayload.data.organismId, organismPayload.data.id);

  const experimentSampleAssay = await runCliCapture(["sample", experimentSamplePayload.data.id, "assays", "add", "Marker assay", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(experimentSampleAssay.code, CLI_EXIT_OK);
  const experimentSampleAssayPayload = JSON.parse(experimentSampleAssay.stdout) as { data: { id: string; name: string; sampleId: string }; meta: { collection: string } };
  assert.equal(experimentSampleAssayPayload.meta.collection, "assays");
  assert.equal(experimentSampleAssayPayload.data.name, "Marker assay");
  assert.equal(experimentSampleAssayPayload.data.sampleId, experimentSamplePayload.data.id);

  const experimentEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Protocol", "--kind", "document", "--collection-name", "biology_experiments", "--record-id", experimentPayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(experimentEvidenceSourceCreate.code, CLI_EXIT_OK);
  const experimentEvidenceSourcePayload = JSON.parse(experimentEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(experimentEvidenceSourcePayload.data.collectionName, "biology_experiments");
  assert.equal(experimentEvidenceSourcePayload.data.recordId, experimentPayload.data.id);

  const experimentGapCreate = await runCliCapture(["quality-gap", "create", "Missing protocol version", "--target-collection", "biology_experiments", "--target-id", experimentPayload.data.id, "--gap-kind", "unverified", "--evidence-source-id", experimentEvidenceSourcePayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(experimentGapCreate.code, CLI_EXIT_OK);
  const experimentGapPayload = JSON.parse(experimentGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(experimentGapPayload.data.targetCollection, "biology_experiments");
  assert.equal(experimentGapPayload.data.targetId, experimentPayload.data.id);
  assert.equal(experimentGapPayload.data.gapKind, "unverified");

  const experimentTimeline = await runCliCapture(["experiment", experimentPayload.data.id, "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(experimentTimeline.code, CLI_EXIT_OK);
  const experimentTimelinePayload = JSON.parse(experimentTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: { subject: { id: string; label: string }; itemCount: number; partial: boolean; items: Array<{ kind: string; recordId: string; label: string }>; gaps: Array<{ id: string; gapKind: string }> };
    };
  };
  assert.equal(experimentTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(experimentTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(experimentTimelinePayload.data.semanticView.id, "experiment.timeline");
  assert.equal(experimentTimelinePayload.data.semanticView.systemId, "biology");
  assert.equal(experimentTimelinePayload.data.materializedView.subject.id, experimentPayload.data.id);
  assert.equal(experimentTimelinePayload.data.materializedView.subject.label, "Dose response");
  assert.equal(experimentTimelinePayload.data.materializedView.itemCount >= 5, true);
  assert.equal(experimentTimelinePayload.data.materializedView.partial, true);
  assert.equal(experimentTimelinePayload.data.materializedView.items.some((item) => item.kind === "sample" && item.label === "Exp sample 1"), true);
  assert.equal(experimentTimelinePayload.data.materializedView.items.some((item) => item.kind === "assay" && item.label === "Marker assay"), true);
  assert.equal(experimentTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === experimentGapPayload.data.id && gap.gapKind === "unverified"), true);

  const labNotebookCreate = await runCliCapture(["lab-notebook", "create", "Trial A notebook", "--study", studyPayload.data.id, "--experiment", experimentPayload.data.id, "--company", companyPayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(labNotebookCreate.code, CLI_EXIT_OK, labNotebookCreate.stderr || labNotebookCreate.stdout);
  const labNotebookPayload = JSON.parse(labNotebookCreate.stdout) as { data: { id: string; title: string; studyId: string; biologyExperimentId: string; companyId: string; status: string; openedAt: string }; meta: { collection: string; action: string } };
  assert.equal(labNotebookPayload.meta.collection, "lab_notebooks");
  assert.equal(labNotebookPayload.data.title, "Trial A notebook");
  assert.equal(labNotebookPayload.data.studyId, studyPayload.data.id);
  assert.equal(labNotebookPayload.data.biologyExperimentId, experimentPayload.data.id);
  assert.equal(labNotebookPayload.data.companyId, companyPayload.data.id);
  assert.equal(labNotebookPayload.data.status, "active");
  assert.equal(typeof labNotebookPayload.data.openedAt, "string");

  const notebookEntryCreate = await runCliCapture(["lab-notebook", labNotebookPayload.data.id, "entries", "add", "Day 1 setup", "--sample", experimentSamplePayload.data.id, "--assay", experimentSampleAssayPayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(notebookEntryCreate.code, CLI_EXIT_OK, notebookEntryCreate.stderr || notebookEntryCreate.stdout);
  const notebookEntryPayload = JSON.parse(notebookEntryCreate.stdout) as { data: { id: string; title: string; notebookId: string; sampleId: string; assayId: string; status: string; entryType: string; authoredAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(notebookEntryPayload.meta.invokedCommand, "lab-notebook");
  assert.equal(notebookEntryPayload.meta.collection, "notebook_entries");
  assert.equal(notebookEntryPayload.meta.action, "create");
  assert.equal(notebookEntryPayload.data.title, "Day 1 setup");
  assert.equal(notebookEntryPayload.data.notebookId, labNotebookPayload.data.id);
  assert.equal(notebookEntryPayload.data.sampleId, experimentSamplePayload.data.id);
  assert.equal(notebookEntryPayload.data.assayId, experimentSampleAssayPayload.data.id);
  assert.equal(notebookEntryPayload.data.status, "draft");
  assert.equal(notebookEntryPayload.data.entryType, "note");

  const protocolRunCreate = await runCliCapture(["lab-notebook", labNotebookPayload.data.id, "protocol-runs", "add", "Dose response run", "--experiment", experimentPayload.data.id, "--sample", experimentSamplePayload.data.id, "--assay", experimentSampleAssayPayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(protocolRunCreate.code, CLI_EXIT_OK, protocolRunCreate.stderr || protocolRunCreate.stdout);
  const protocolRunPayload = JSON.parse(protocolRunCreate.stdout) as { data: { id: string; title: string; notebookId: string; biologyExperimentId: string; sampleId: string; assayId: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(protocolRunPayload.meta.invokedCommand, "lab-notebook");
  assert.equal(protocolRunPayload.meta.collection, "protocol_runs");
  assert.equal(protocolRunPayload.data.title, "Dose response run");
  assert.equal(protocolRunPayload.data.notebookId, labNotebookPayload.data.id);
  assert.equal(protocolRunPayload.data.biologyExperimentId, experimentPayload.data.id);
  assert.equal(protocolRunPayload.data.sampleId, experimentSamplePayload.data.id);
  assert.equal(protocolRunPayload.data.assayId, experimentSampleAssayPayload.data.id);
  assert.equal(protocolRunPayload.data.status, "planned");

  const experimentObservationCreate = await runCliCapture(["protocol-run", protocolRunPayload.data.id, "observations", "add", "Marker intensity", "--lab-notebook", labNotebookPayload.data.id, "--sample", experimentSamplePayload.data.id, "--assay", experimentSampleAssayPayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(experimentObservationCreate.code, CLI_EXIT_OK, experimentObservationCreate.stderr || experimentObservationCreate.stdout);
  const experimentObservationPayload = JSON.parse(experimentObservationCreate.stdout) as { data: { id: string; title: string; notebookId: string; protocolRunId: string; sampleId: string; assayId: string; status: string; quality: string; observedAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(experimentObservationPayload.meta.invokedCommand, "protocol-run");
  assert.equal(experimentObservationPayload.meta.collection, "experiment_observations");
  assert.equal(experimentObservationPayload.data.title, "Marker intensity");
  assert.equal(experimentObservationPayload.data.notebookId, labNotebookPayload.data.id);
  assert.equal(experimentObservationPayload.data.protocolRunId, protocolRunPayload.data.id);
  assert.equal(experimentObservationPayload.data.sampleId, experimentSamplePayload.data.id);
  assert.equal(experimentObservationPayload.data.assayId, experimentSampleAssayPayload.data.id);
  assert.equal(experimentObservationPayload.data.status, "recorded");
  assert.equal(experimentObservationPayload.data.quality, "unknown");

  const labNotebookEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Notebook export", "--kind", "document", "--collection-name", "lab_notebooks", "--record-id", labNotebookPayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(labNotebookEvidenceSourceCreate.code, CLI_EXIT_OK);
  const labNotebookEvidenceSourcePayload = JSON.parse(labNotebookEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(labNotebookEvidenceSourcePayload.data.collectionName, "lab_notebooks");
  assert.equal(labNotebookEvidenceSourcePayload.data.recordId, labNotebookPayload.data.id);

  const labNotebookGapCreate = await runCliCapture(["quality-gap", "create", "Missing e-signature validation", "--target-collection", "lab_notebooks", "--target-id", labNotebookPayload.data.id, "--gap-kind", "external_pending", "--evidence-source-id", labNotebookEvidenceSourcePayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(labNotebookGapCreate.code, CLI_EXIT_OK);
  const labNotebookGapPayload = JSON.parse(labNotebookGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(labNotebookGapPayload.data.targetCollection, "lab_notebooks");
  assert.equal(labNotebookGapPayload.data.targetId, labNotebookPayload.data.id);
  assert.equal(labNotebookGapPayload.data.gapKind, "external_pending");

  const labNotebookTimeline = await runCliCapture(["lab-notebook", labNotebookPayload.data.id, "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(labNotebookTimeline.code, CLI_EXIT_OK, labNotebookTimeline.stderr || labNotebookTimeline.stdout);
  const labNotebookTimelinePayload = JSON.parse(labNotebookTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: {
        subject: { id: string; label: string };
        summary: { entries: number; protocolRuns: number; observations: number; samples: number; assays: number; evidenceSources: number; qualityGaps: number };
        itemCount: number;
        partial: boolean;
        items: Array<{ kind: string; recordId: string; label: string }>;
        records: { entries: Array<{ id: string }>; protocolRuns: Array<{ id: string }>; observations: Array<{ id: string }>; samples: Array<{ id: string }>; assays: Array<{ id: string }>; evidence: Array<{ id: string }> };
        gaps: Array<{ id: string; gapKind: string }>;
      };
    };
  };
  assert.equal(labNotebookTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(labNotebookTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(labNotebookTimelinePayload.data.semanticView.id, "lab_notebook.timeline");
  assert.equal(labNotebookTimelinePayload.data.semanticView.systemId, "eln");
  assert.equal(labNotebookTimelinePayload.data.materializedView.subject.id, labNotebookPayload.data.id);
  assert.equal(labNotebookTimelinePayload.data.materializedView.subject.label, "Trial A notebook");
  assert.equal(labNotebookTimelinePayload.data.materializedView.summary.entries, 1);
  assert.equal(labNotebookTimelinePayload.data.materializedView.summary.protocolRuns, 1);
  assert.equal(labNotebookTimelinePayload.data.materializedView.summary.observations, 1);
  assert.equal(labNotebookTimelinePayload.data.materializedView.summary.samples, 1);
  assert.equal(labNotebookTimelinePayload.data.materializedView.summary.assays, 1);
  assert.equal(labNotebookTimelinePayload.data.materializedView.summary.evidenceSources, 1);
  assert.equal(labNotebookTimelinePayload.data.materializedView.summary.qualityGaps, 1);
  assert.equal(labNotebookTimelinePayload.data.materializedView.itemCount >= 9, true);
  assert.equal(labNotebookTimelinePayload.data.materializedView.partial, true);
  assert.equal(labNotebookTimelinePayload.data.materializedView.items.some((item) => item.kind === "notebook_entry" && item.label === "Day 1 setup"), true);
  assert.equal(labNotebookTimelinePayload.data.materializedView.items.some((item) => item.kind === "protocol_run" && item.label === "Dose response run"), true);
  assert.equal(labNotebookTimelinePayload.data.materializedView.items.some((item) => item.kind === "experiment_observation" && item.label === "Marker intensity"), true);
  assert.equal(labNotebookTimelinePayload.data.materializedView.records.entries.some((record) => record.id === notebookEntryPayload.data.id), true);
  assert.equal(labNotebookTimelinePayload.data.materializedView.records.protocolRuns.some((record) => record.id === protocolRunPayload.data.id), true);
  assert.equal(labNotebookTimelinePayload.data.materializedView.records.observations.some((record) => record.id === experimentObservationPayload.data.id), true);
  assert.equal(labNotebookTimelinePayload.data.materializedView.records.evidence.some((record) => record.id === labNotebookEvidenceSourcePayload.data.id), true);
  assert.equal(labNotebookTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === labNotebookGapPayload.data.id && gap.gapKind === "external_pending"), true);

});

test("runCli seeds the dense-data acceptance fixture into the shared database", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-dense-fixture-"));

  const seedResult = await runCliCapture(["dense-fixtures", "seed", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(seedResult.code, CLI_EXIT_OK, seedResult.stderr || seedResult.stdout);
  const seedPayload = JSON.parse(seedResult.stdout) as {
    ok: boolean;
    data: { fixtureSetId: string; store: string; seeded: Array<{ id: string; collectionName: string; covers: string[] }> };
    meta: { canonicalCommand: string; invokedCommand: string; subcommand: string; denseData: boolean };
  };
  assert.equal(seedPayload.ok, true);
  assert.equal(seedPayload.meta.canonicalCommand, "dense-fixtures");
  assert.equal(seedPayload.meta.invokedCommand, "dense-fixtures");
  assert.equal(seedPayload.meta.subcommand, "seed");
  assert.equal(seedPayload.meta.denseData, true);
  assert.equal(seedPayload.data.fixtureSetId, "dense-data-acceptance-v1");
  assert.equal(seedPayload.data.store, "core.sqlite");
  assert.equal(seedPayload.data.seeded.some((record) => record.id === "fixture_patient_ada" && record.collectionName === "patients" && record.covers.includes("patient")), true);
  assert.equal(seedPayload.data.seeded.some((record) => record.id === "fixture_encounter_intake" && record.collectionName === "encounters" && record.covers.includes("encounter")), true);
  assert.equal(seedPayload.data.seeded.some((record) => record.id === "fixture_gap_missing_dob" && record.collectionName === "quality_gaps" && record.covers.includes("partial_data_gap")), true);
  assert.equal(seedPayload.data.seeded.some((record) => record.id === "fixture_domain_system_health" && record.collectionName === "domain_systems" && record.covers.includes("domain_system")), true);
  assert.equal(seedPayload.data.seeded.some((record) => record.id === "fixture_domain_profile_health_patient" && record.collectionName === "domain_profiles" && record.covers.includes("domain_profile")), true);
  assert.equal(seedPayload.data.seeded.some((record) => record.collectionName === "domain_intents" && record.covers.includes("intent_coverage")), true);
  assert.equal(seedPayload.data.seeded.some((record) => record.collectionName === "quality_gaps" && record.covers.includes("external_pending")), true);

  const patientGet = await runCliCapture(["patient", "get", "fixture_patient_ada", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(patientGet.code, CLI_EXIT_OK);
  const patientPayload = JSON.parse(patientGet.stdout) as { data: { id: string; displayName: string; qualityGaps: string[] }; meta: { collection: string; action: string } };
  assert.equal(patientPayload.meta.collection, "patients");
  assert.equal(patientPayload.meta.action, "get");
  assert.equal(patientPayload.data.id, "fixture_patient_ada");
  assert.equal(patientPayload.data.displayName, "Ada Patient");
  assert.deepEqual(patientPayload.data.qualityGaps, ["fixture_gap_missing_dob"]);

  const qualityGapGet = await runCliCapture(["quality-gap", "get", "fixture_gap_missing_dob", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(qualityGapGet.code, CLI_EXIT_OK);
  const qualityGapPayload = JSON.parse(qualityGapGet.stdout) as { data: { targetCollection: string; targetId: string; evidenceSourceId: string } };
  assert.equal(qualityGapPayload.data.targetCollection, "patients");
  assert.equal(qualityGapPayload.data.targetId, "fixture_patient_ada");
  assert.equal(qualityGapPayload.data.evidenceSourceId, "fixture_evidence_intake_note");

  const domainSystemGet = await runCliCapture(["domain-system", "get", "fixture_domain_system_health", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(domainSystemGet.code, CLI_EXIT_OK);
  const domainSystemPayload = JSON.parse(domainSystemGet.stdout) as { data: { key: string; canonicalCommand: string; metadata: { orchestrator: boolean } }; meta: { collection: string; action: string } };
  assert.equal(domainSystemPayload.meta.collection, "domain_systems");
  assert.equal(domainSystemPayload.data.key, "health");
  assert.equal(domainSystemPayload.data.canonicalCommand, "health");
  assert.equal(domainSystemPayload.data.metadata.orchestrator, true);

  const domainProfileGet = await runCliCapture(["domain-profile", "get", "fixture_domain_profile_health_patient", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(domainProfileGet.code, CLI_EXIT_OK);
  const domainProfilePayload = JSON.parse(domainProfileGet.stdout) as { data: { entityKind: string; entityId: string; domainSystemKey: string; domainRoleKey: string; profileKind: string } };
  assert.equal(domainProfilePayload.data.entityKind, "patients");
  assert.equal(domainProfilePayload.data.entityId, "fixture_patient_ada");
  assert.equal(domainProfilePayload.data.domainSystemKey, "health");
  assert.equal(domainProfilePayload.data.domainRoleKey, "health.patient");
  assert.equal(domainProfilePayload.data.profileKind, "patient_profile");

  const timeline = await runCliCapture(["patient", "fixture_patient_ada", "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(timeline.code, CLI_EXIT_OK);
  const timelinePayload = JSON.parse(timeline.stdout) as { data: { coverage: { implementationStatus: string; recordsMaterialized: boolean }; materializedView: { itemCount: number; partial: boolean; items: Array<{ kind: string; recordId: string }>; gaps: Array<{ id: string }> } } };
  assert.equal(timelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(timelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(timelinePayload.data.materializedView.partial, true);
  assert.equal(timelinePayload.data.materializedView.itemCount >= 4, true);
  assert.equal(timelinePayload.data.materializedView.items.some((item) => item.kind === "patient" && item.recordId === "fixture_patient_ada"), true);
  assert.equal(timelinePayload.data.materializedView.items.some((item) => item.kind === "encounter" && item.recordId === "fixture_encounter_intake"), true);
  assert.equal(timelinePayload.data.materializedView.items.some((item) => item.kind === "quality_gap" && item.recordId === "fixture_gap_missing_dob"), true);
  assert.equal(timelinePayload.data.materializedView.gaps.some((gap) => gap.id === "fixture_gap_missing_dob"), true);

  const caseTimeline = await runCliCapture(["case", "fixture_legal_case_smith", "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(caseTimeline.code, CLI_EXIT_OK);
  const caseTimelinePayload = JSON.parse(caseTimeline.stdout) as { data: { coverage: { implementationStatus: string; recordsMaterialized: boolean }; semanticView: { id: string }; materializedView: { itemCount: number; items: Array<{ kind: string; recordId: string }> } } };
  assert.equal(caseTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(caseTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(caseTimelinePayload.data.semanticView.id, "case.timeline");
  assert.equal(caseTimelinePayload.data.materializedView.itemCount >= 3, true);
  assert.equal(caseTimelinePayload.data.materializedView.items.some((item) => item.kind === "case" && item.recordId === "fixture_legal_case_smith"), true);
  assert.equal(caseTimelinePayload.data.materializedView.items.some((item) => item.kind === "case_evidence" && item.recordId === "fixture_case_evidence_contract"), true);
  assert.equal(caseTimelinePayload.data.materializedView.items.some((item) => item.kind === "evidence" && item.recordId === "fixture_evidence_contract"), true);

  const serviceTimeline = await runCliCapture(["service", "fixture_service_api", "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(serviceTimeline.code, CLI_EXIT_OK);
  const serviceTimelinePayload = JSON.parse(serviceTimeline.stdout) as { data: { coverage: { implementationStatus: string; recordsMaterialized: boolean }; semanticView: { id: string }; materializedView: { itemCount: number; items: Array<{ kind: string; recordId: string }> } } };
  assert.equal(serviceTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(serviceTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(serviceTimelinePayload.data.semanticView.id, "service.timeline");
  assert.equal(serviceTimelinePayload.data.materializedView.itemCount >= 2, true);
  assert.equal(serviceTimelinePayload.data.materializedView.items.some((item) => item.kind === "service" && item.recordId === "fixture_service_api"), true);
  assert.equal(serviceTimelinePayload.data.materializedView.items.some((item) => item.kind === "incident" && item.recordId === "fixture_incident_outage"), true);

  const studyTimeline = await runCliCapture(["study", "fixture_study_trial_a", "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(studyTimeline.code, CLI_EXIT_OK);
  const studyTimelinePayload = JSON.parse(studyTimeline.stdout) as { data: { coverage: { implementationStatus: string; recordsMaterialized: boolean }; semanticView: { id: string }; materializedView: { itemCount: number; items: Array<{ kind: string; recordId: string }> } } };
  assert.equal(studyTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(studyTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(studyTimelinePayload.data.semanticView.id, "study.timeline");
  assert.equal(studyTimelinePayload.data.materializedView.itemCount >= 3, true);
  assert.equal(studyTimelinePayload.data.materializedView.items.some((item) => item.kind === "study" && item.recordId === "fixture_study_trial_a"), true);
  assert.equal(studyTimelinePayload.data.materializedView.items.some((item) => item.kind === "participant" && item.recordId === "fixture_participant_subject_001"), true);
  assert.equal(studyTimelinePayload.data.materializedView.items.some((item) => item.kind === "sample" && item.recordId === "fixture_sample_tube_a"), true);

  const sampleTimeline = await runCliCapture(["sample", "fixture_sample_tube_a", "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(sampleTimeline.code, CLI_EXIT_OK);
  const sampleTimelinePayload = JSON.parse(sampleTimeline.stdout) as { data: { coverage: { implementationStatus: string; recordsMaterialized: boolean }; semanticView: { id: string }; materializedView: { itemCount: number; items: Array<{ kind: string; recordId: string }> } } };
  assert.equal(sampleTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(sampleTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(sampleTimelinePayload.data.semanticView.id, "sample.timeline");
  assert.equal(sampleTimelinePayload.data.materializedView.itemCount >= 2, true);
  assert.equal(sampleTimelinePayload.data.materializedView.items.some((item) => item.kind === "sample" && item.recordId === "fixture_sample_tube_a"), true);
  assert.equal(sampleTimelinePayload.data.materializedView.items.some((item) => item.kind === "assay" && item.recordId === "fixture_assay_cbc"), true);

  const experimentTimeline = await runCliCapture(["experiment", "fixture_biology_experiment_dose_response", "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(experimentTimeline.code, CLI_EXIT_OK);
  const experimentTimelinePayload = JSON.parse(experimentTimeline.stdout) as { data: { coverage: { implementationStatus: string; recordsMaterialized: boolean }; semanticView: { id: string }; materializedView: { itemCount: number; items: Array<{ kind: string; recordId: string }> } } };
  assert.equal(experimentTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(experimentTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(experimentTimelinePayload.data.semanticView.id, "experiment.timeline");
  assert.equal(experimentTimelinePayload.data.materializedView.itemCount >= 3, true);
  assert.equal(experimentTimelinePayload.data.materializedView.items.some((item) => item.kind === "experiment" && item.recordId === "fixture_biology_experiment_dose_response"), true);
  assert.equal(experimentTimelinePayload.data.materializedView.items.some((item) => item.kind === "sample" && item.recordId === "fixture_sample_exp_1"), true);
  assert.equal(experimentTimelinePayload.data.materializedView.items.some((item) => item.kind === "assay" && item.recordId === "fixture_assay_marker"), true);

  const erpCompanyOverview = await runCliCapture(["erp", "company", "fixture_company_acme", "overview", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(erpCompanyOverview.code, CLI_EXIT_OK);
  const erpCompanyOverviewPayload = JSON.parse(erpCompanyOverview.stdout) as { data: { coverage: { implementationStatus: string; recordsMaterialized: boolean }; semanticView: { id: string }; materializedView: { summary: { accounts: number; deals: number; invoices: number; payments: number; invoiceTotalCents: number; paymentTotalCents: number; qualityGaps: number }; records: { evidence: Array<{ id: string }> }; gaps: Array<{ id: string }> } } };
  assert.equal(erpCompanyOverviewPayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(erpCompanyOverviewPayload.data.coverage.recordsMaterialized, true);
  assert.equal(erpCompanyOverviewPayload.data.semanticView.id, "erp.company.overview");
  assert.equal(erpCompanyOverviewPayload.data.materializedView.summary.accounts, 1);
  assert.equal(erpCompanyOverviewPayload.data.materializedView.summary.deals, 1);
  assert.equal(erpCompanyOverviewPayload.data.materializedView.summary.invoices, 1);
  assert.equal(erpCompanyOverviewPayload.data.materializedView.summary.payments, 1);
  assert.equal(erpCompanyOverviewPayload.data.materializedView.summary.invoiceTotalCents, 9900);
  assert.equal(erpCompanyOverviewPayload.data.materializedView.summary.paymentTotalCents, 9900);
  assert.equal(erpCompanyOverviewPayload.data.materializedView.summary.qualityGaps, 1);
  assert.equal(erpCompanyOverviewPayload.data.materializedView.records.evidence.some((record) => record.id === "fixture_evidence_company_import"), true);
  assert.equal(erpCompanyOverviewPayload.data.materializedView.gaps.some((gap) => gap.id === "fixture_gap_company_tax_id"), true);

  const crmAccountOverview = await runCliCapture(["crm", "account", "fixture_account_acme", "overview", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(crmAccountOverview.code, CLI_EXIT_OK);
  const crmAccountOverviewPayload = JSON.parse(crmAccountOverview.stdout) as { data: { coverage: { implementationStatus: string; recordsMaterialized: boolean }; semanticView: { id: string }; materializedView: { summary: { deals: number; contacts: number; activities: number; evidenceSources: number; qualityGaps: number }; records: { contacts: Array<{ id: string }>; activities: Array<{ id: string }>; evidence: Array<{ id: string }> }; gaps: Array<{ id: string }> } } };
  assert.equal(crmAccountOverviewPayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(crmAccountOverviewPayload.data.coverage.recordsMaterialized, true);
  assert.equal(crmAccountOverviewPayload.data.semanticView.id, "crm.account.overview");
  assert.equal(crmAccountOverviewPayload.data.materializedView.summary.deals, 1);
  assert.equal(crmAccountOverviewPayload.data.materializedView.summary.contacts, 1);
  assert.equal(crmAccountOverviewPayload.data.materializedView.summary.activities, 1);
  assert.equal(crmAccountOverviewPayload.data.materializedView.summary.evidenceSources, 1);
  assert.equal(crmAccountOverviewPayload.data.materializedView.summary.qualityGaps, 1);
  assert.equal(crmAccountOverviewPayload.data.materializedView.records.contacts.some((record) => record.id === "fixture_contact_acme_ada"), true);
  assert.equal(crmAccountOverviewPayload.data.materializedView.records.activities.some((record) => record.id === "fixture_activity_acme_demo"), true);
  assert.equal(crmAccountOverviewPayload.data.materializedView.records.evidence.some((record) => record.id === "fixture_evidence_account_discovery"), true);
  assert.equal(crmAccountOverviewPayload.data.materializedView.gaps.some((gap) => gap.id === "fixture_gap_account_owner"), true);

  const financeEntityOverview = await runCliCapture(["finance", "entity", "fixture_financial_account_ops", "overview", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(financeEntityOverview.code, CLI_EXIT_OK);
  const financeEntityOverviewPayload = JSON.parse(financeEntityOverview.stdout) as { data: { coverage: { implementationStatus: string; recordsMaterialized: boolean }; semanticView: { id: string }; materializedView: { summary: { transactions: number; debitCents: number; netAmountCents: number; evidenceSources: number; qualityGaps: number }; records: { transactions: Array<{ id: string }>; evidence: Array<{ id: string }> }; gaps: Array<{ id: string }> } } };
  assert.equal(financeEntityOverviewPayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(financeEntityOverviewPayload.data.coverage.recordsMaterialized, true);
  assert.equal(financeEntityOverviewPayload.data.semanticView.id, "finance.entity.overview");
  assert.equal(financeEntityOverviewPayload.data.materializedView.summary.transactions, 1);
  assert.equal(financeEntityOverviewPayload.data.materializedView.summary.debitCents, 1200);
  assert.equal(financeEntityOverviewPayload.data.materializedView.summary.netAmountCents, 1200);
  assert.equal(financeEntityOverviewPayload.data.materializedView.summary.evidenceSources, 1);
  assert.equal(financeEntityOverviewPayload.data.materializedView.summary.qualityGaps, 1);
  assert.equal(financeEntityOverviewPayload.data.materializedView.records.transactions.some((record) => record.id === "fixture_transaction_lunch"), true);
  assert.equal(financeEntityOverviewPayload.data.materializedView.records.evidence.some((record) => record.id === "fixture_evidence_finance_statement"), true);
  assert.equal(financeEntityOverviewPayload.data.materializedView.gaps.some((gap) => gap.id === "fixture_gap_finance_reconciliation"), true);

  const learnerTimeline = await runCliCapture(["learner", "fixture_learner_ada", "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(learnerTimeline.code, CLI_EXIT_OK);
  const learnerTimelinePayload = JSON.parse(learnerTimeline.stdout) as { data: { coverage: { implementationStatus: string; recordsMaterialized: boolean }; semanticView: { id: string }; materializedView: { summary: { courses: number; relations: number; evidenceSources: number; qualityGaps: number }; itemCount: number; partial: boolean; items: Array<{ kind: string; recordId: string }>; records: { courses: Array<{ id: string }>; relations: Array<{ id: string }>; evidence: Array<{ id: string }> }; gaps: Array<{ id: string }> } } };
  assert.equal(learnerTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(learnerTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(learnerTimelinePayload.data.semanticView.id, "learner.timeline");
  assert.equal(learnerTimelinePayload.data.materializedView.summary.courses, 1);
  assert.equal(learnerTimelinePayload.data.materializedView.summary.relations, 1);
  assert.equal(learnerTimelinePayload.data.materializedView.summary.evidenceSources, 1);
  assert.equal(learnerTimelinePayload.data.materializedView.summary.qualityGaps, 1);
  assert.equal(learnerTimelinePayload.data.materializedView.partial, true);
  assert.equal(learnerTimelinePayload.data.materializedView.itemCount >= 5, true);
  assert.equal(learnerTimelinePayload.data.materializedView.items.some((item) => item.kind === "learner" && item.recordId === "fixture_learner_ada"), true);
  assert.equal(learnerTimelinePayload.data.materializedView.items.some((item) => item.kind === "course" && item.recordId === "fixture_course_intro_biology"), true);
  assert.equal(learnerTimelinePayload.data.materializedView.items.some((item) => item.kind === "relation" && item.recordId === "fixture_relation_learner_course"), true);
  assert.equal(learnerTimelinePayload.data.materializedView.records.courses.some((record) => record.id === "fixture_course_intro_biology"), true);
  assert.equal(learnerTimelinePayload.data.materializedView.records.relations.some((record) => record.id === "fixture_relation_learner_course"), true);
  assert.equal(learnerTimelinePayload.data.materializedView.records.evidence.some((record) => record.id === "fixture_evidence_learner_record"), true);
  assert.equal(learnerTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === "fixture_gap_learner_credential"), true);

  const courseTimeline = await runCliCapture(["course", "fixture_course_intro_biology", "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(courseTimeline.code, CLI_EXIT_OK);
  const courseTimelinePayload = JSON.parse(courseTimeline.stdout) as { data: { coverage: { implementationStatus: string; recordsMaterialized: boolean }; semanticView: { id: string }; materializedView: { summary: { lessons: number; studySessions: number; learners: number; relations: number; evidenceSources: number; qualityGaps: number }; itemCount: number; partial: boolean; items: Array<{ kind: string; recordId: string }>; records: { lessons: Array<{ id: string }>; studySessions: Array<{ id: string }>; learners: Array<{ id: string }>; relations: Array<{ id: string }>; evidence: Array<{ id: string }> }; gaps: Array<{ id: string }> } } };
  assert.equal(courseTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(courseTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(courseTimelinePayload.data.semanticView.id, "course.timeline");
  assert.equal(courseTimelinePayload.data.materializedView.summary.lessons, 1);
  assert.equal(courseTimelinePayload.data.materializedView.summary.studySessions, 1);
  assert.equal(courseTimelinePayload.data.materializedView.summary.learners, 1);
  assert.equal(courseTimelinePayload.data.materializedView.summary.relations, 1);
  assert.equal(courseTimelinePayload.data.materializedView.summary.evidenceSources, 1);
  assert.equal(courseTimelinePayload.data.materializedView.summary.qualityGaps, 1);
  assert.equal(courseTimelinePayload.data.materializedView.partial, true);
  assert.equal(courseTimelinePayload.data.materializedView.itemCount >= 7, true);
  assert.equal(courseTimelinePayload.data.materializedView.items.some((item) => item.kind === "course" && item.recordId === "fixture_course_intro_biology"), true);
  assert.equal(courseTimelinePayload.data.materializedView.items.some((item) => item.kind === "lesson" && item.recordId === "fixture_lesson_cell_basics"), true);
  assert.equal(courseTimelinePayload.data.materializedView.items.some((item) => item.kind === "study_session" && item.recordId === "fixture_study_session_biology"), true);
  assert.equal(courseTimelinePayload.data.materializedView.items.some((item) => item.kind === "learner" && item.recordId === "fixture_learner_ada"), true);
  assert.equal(courseTimelinePayload.data.materializedView.items.some((item) => item.kind === "relation" && item.recordId === "fixture_relation_learner_course"), true);
  assert.equal(courseTimelinePayload.data.materializedView.records.lessons.some((record) => record.id === "fixture_lesson_cell_basics"), true);
  assert.equal(courseTimelinePayload.data.materializedView.records.studySessions.some((record) => record.id === "fixture_study_session_biology"), true);
  assert.equal(courseTimelinePayload.data.materializedView.records.learners.some((record) => record.id === "fixture_learner_ada"), true);
  assert.equal(courseTimelinePayload.data.materializedView.records.relations.some((record) => record.id === "fixture_relation_learner_course"), true);
  assert.equal(courseTimelinePayload.data.materializedView.records.evidence.some((record) => record.id === "fixture_evidence_course_syllabus"), true);
  assert.equal(courseTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === "fixture_gap_course_assessment"), true);

  const assetTimeline = await runCliCapture(["asset", "fixture_asset_press_001", "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(assetTimeline.code, CLI_EXIT_OK);
  const assetTimelinePayload = JSON.parse(assetTimeline.stdout) as { data: { coverage: { implementationStatus: string; recordsMaterialized: boolean }; semanticView: { id: string }; materializedView: { summary: { workOrders: number; relations: number; evidenceSources: number; qualityGaps: number }; itemCount: number; partial: boolean; company: { id: string } | null; account: { id: string } | null; product: { id: string } | null; items: Array<{ kind: string; recordId: string }>; records: { workOrders: Array<{ id: string }>; relations: Array<{ id: string }>; evidence: Array<{ id: string }> }; gaps: Array<{ id: string }> } } };
  assert.equal(assetTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(assetTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(assetTimelinePayload.data.semanticView.id, "asset.timeline");
  assert.equal(assetTimelinePayload.data.materializedView.company?.id, "fixture_company_acme");
  assert.equal(assetTimelinePayload.data.materializedView.account?.id, "fixture_account_acme");
  assert.equal(assetTimelinePayload.data.materializedView.product?.id, "fixture_product_press_model");
  assert.equal(assetTimelinePayload.data.materializedView.summary.workOrders, 1);
  assert.equal(assetTimelinePayload.data.materializedView.summary.relations, 1);
  assert.equal(assetTimelinePayload.data.materializedView.summary.evidenceSources, 1);
  assert.equal(assetTimelinePayload.data.materializedView.summary.qualityGaps, 1);
  assert.equal(assetTimelinePayload.data.materializedView.partial, true);
  assert.equal(assetTimelinePayload.data.materializedView.itemCount >= 8, true);
  assert.equal(assetTimelinePayload.data.materializedView.items.some((item) => item.kind === "asset" && item.recordId === "fixture_asset_press_001"), true);
  assert.equal(assetTimelinePayload.data.materializedView.items.some((item) => item.kind === "work_order" && item.recordId === "fixture_work_order_batch_42"), true);
  assert.equal(assetTimelinePayload.data.materializedView.items.some((item) => item.kind === "relation" && item.recordId === "fixture_relation_asset_service"), true);
  assert.equal(assetTimelinePayload.data.materializedView.items.some((item) => item.kind === "evidence" && item.recordId === "fixture_evidence_asset_install"), true);
  assert.equal(assetTimelinePayload.data.materializedView.records.workOrders.some((record) => record.id === "fixture_work_order_batch_42"), true);
  assert.equal(assetTimelinePayload.data.materializedView.records.relations.some((record) => record.id === "fixture_relation_asset_service"), true);
  assert.equal(assetTimelinePayload.data.materializedView.records.evidence.some((record) => record.id === "fixture_evidence_asset_install"), true);
  assert.equal(assetTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === "fixture_gap_asset_maintenance_plan"), true);

  const companyTimeline = await runCliCapture(["company", "fixture_company_acme", "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(companyTimeline.code, CLI_EXIT_OK);
  const companyTimelinePayload = JSON.parse(companyTimeline.stdout) as { data: { coverage: { implementationStatus: string; recordsMaterialized: boolean }; semanticView: { id: string }; materializedView: { summary: { accounts: number; deals: number; contacts: number; activities: number; billingCustomers: number; invoices: number; payments: number; services: number; workOrders: number; assets: number; products: number; evidenceSources: number; qualityGaps: number }; itemCount: number; partial: boolean; items: Array<{ kind: string; recordId: string }>; records: { accounts: Array<{ id: string }>; deals: Array<{ id: string }>; contacts: Array<{ id: string }>; activities: Array<{ id: string }>; billingCustomers: Array<{ id: string }>; invoices: Array<{ id: string }>; payments: Array<{ id: string }>; services: Array<{ id: string }>; workOrders: Array<{ id: string }>; assets: Array<{ id: string }>; products: Array<{ id: string }>; evidence: Array<{ id: string }> }; gaps: Array<{ id: string }> } } };
  assert.equal(companyTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(companyTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(companyTimelinePayload.data.semanticView.id, "company.timeline");
  assert.equal(companyTimelinePayload.data.materializedView.summary.accounts, 1);
  assert.equal(companyTimelinePayload.data.materializedView.summary.deals, 1);
  assert.equal(companyTimelinePayload.data.materializedView.summary.contacts, 1);
  assert.equal(companyTimelinePayload.data.materializedView.summary.activities, 1);
  assert.equal(companyTimelinePayload.data.materializedView.summary.billingCustomers, 1);
  assert.equal(companyTimelinePayload.data.materializedView.summary.invoices, 1);
  assert.equal(companyTimelinePayload.data.materializedView.summary.payments, 1);
  assert.equal(companyTimelinePayload.data.materializedView.summary.services, 1);
  assert.equal(companyTimelinePayload.data.materializedView.summary.workOrders, 1);
  assert.equal(companyTimelinePayload.data.materializedView.summary.assets, 1);
  assert.equal(companyTimelinePayload.data.materializedView.summary.products, 1);
  assert.equal(companyTimelinePayload.data.materializedView.summary.evidenceSources, 1);
  assert.equal(companyTimelinePayload.data.materializedView.summary.qualityGaps, 1);
  assert.equal(companyTimelinePayload.data.materializedView.partial, true);
  assert.equal(companyTimelinePayload.data.materializedView.itemCount >= 15, true);
  assert.equal(companyTimelinePayload.data.materializedView.records.accounts.some((record) => record.id === "fixture_account_acme"), true);
  assert.equal(companyTimelinePayload.data.materializedView.records.deals.some((record) => record.id === "fixture_deal_acme_pilot"), true);
  assert.equal(companyTimelinePayload.data.materializedView.records.contacts.some((record) => record.id === "fixture_contact_acme_ada"), true);
  assert.equal(companyTimelinePayload.data.materializedView.records.activities.some((record) => record.id === "fixture_activity_acme_demo"), true);
  assert.equal(companyTimelinePayload.data.materializedView.records.billingCustomers.some((record) => record.id === "fixture_billing_customer_acme"), true);
  assert.equal(companyTimelinePayload.data.materializedView.records.invoices.some((record) => record.id === "fixture_invoice_001"), true);
  assert.equal(companyTimelinePayload.data.materializedView.records.payments.some((record) => record.id === "fixture_payment_intent_001"), true);
  assert.equal(companyTimelinePayload.data.materializedView.records.services.some((record) => record.id === "fixture_service_api"), true);
  assert.equal(companyTimelinePayload.data.materializedView.records.workOrders.some((record) => record.id === "fixture_work_order_batch_42"), true);
  assert.equal(companyTimelinePayload.data.materializedView.records.assets.some((record) => record.id === "fixture_asset_press_001"), true);
  assert.equal(companyTimelinePayload.data.materializedView.records.products.some((record) => record.id === "fixture_product_press_model"), true);
  assert.equal(companyTimelinePayload.data.materializedView.records.evidence.some((record) => record.id === "fixture_evidence_company_import"), true);
  assert.equal(companyTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === "fixture_gap_company_tax_id"), true);

  const workOrderTimeline = await runCliCapture(["work-order", "fixture_work_order_batch_42", "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(workOrderTimeline.code, CLI_EXIT_OK);
  const workOrderTimelinePayload = JSON.parse(workOrderTimeline.stdout) as { data: { coverage: { implementationStatus: string; recordsMaterialized: boolean }; semanticView: { id: string }; materializedView: { itemCount: number; items: Array<{ kind: string; recordId: string }> } } };
  assert.equal(workOrderTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(workOrderTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(workOrderTimelinePayload.data.semanticView.id, "work_order.timeline");
  assert.equal(workOrderTimelinePayload.data.materializedView.itemCount >= 2, true);
  assert.equal(workOrderTimelinePayload.data.materializedView.items.some((item) => item.kind === "work_order" && item.recordId === "fixture_work_order_batch_42"), true);
  assert.equal(workOrderTimelinePayload.data.materializedView.items.some((item) => item.kind === "evidence" && item.recordId === "fixture_evidence_work_order_batch_42"), true);
});

test("runCli searches the registered CLI discovery surface", async () => {
  const result = await runCliCapture(["search", "system capabilities", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as { ok: boolean; data: { results: Array<{ canonicalName?: string }> }; meta: { canonicalCommand: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "search");
  assert.equal(payload.data.results.some((entry) => entry.canonicalName === "host"), true);

  const collection = await runCliCapture(["search", "lead", "--json"], process.cwd());
  assert.equal(collection.code, CLI_EXIT_OK);
  const collectionPayload = JSON.parse(collection.stdout) as { data: { results: Array<{ canonicalName?: string; source?: string }> } };
  assert.equal(collectionPayload.data.results.some((entry) => entry.canonicalName === "leads" && entry.source === "collection"), true);
});

test("runCli returns open list JSON in the common envelope", async () => {
  const result = await runCliCapture(["open", "list", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as { ok: boolean; data: { dashboards: Array<{ surface: string }> }; meta: { canonicalCommand: string; jsonSchemaId: string; subcommand: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "open");
  assert.equal(payload.meta.jsonSchemaId, "claw.cli.open.v1");
  assert.equal(payload.meta.subcommand, "list");
  assert.equal(payload.data.dashboards.some((entry) => entry.surface === "database"), true);
});

test("runCli returns registry help JSON when a command needs a subcommand", async () => {
  for (const command of ["database", "sessions", "search", "templates", "mcp", "plan", "erp"]) {
    const result = await runCliCapture([command, "--json"], process.cwd());
    assert.equal(result.code, CLI_EXIT_OK, command);
    const payload = JSON.parse(result.stdout) as { ok: boolean; data: { command: string; help: string }; meta: { canonicalCommand: string; invokedCommand: string } };
    const canonical = command === "templates" ? "templates" : command;
    assert.equal(payload.ok, true);
    assert.equal(payload.data.command, canonical);
    assert.equal(payload.data.help.includes(`claw ${canonical}`), true);
    assert.equal(payload.meta.canonicalCommand, canonical);
    assert.equal(payload.meta.invokedCommand, command === "templates" ? "template" : command);
  }
});

test("runCli returns agents codex JSON in the common envelope", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-agents-json-"));
  useIsolatedClawDataRoot(t, workspaceRoot);
  const result = await runCliCapture(["agents", "codex", "status", "--runtime", "demo", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as { ok: boolean; data: { agentId: string; runtime: string }; meta: { canonicalCommand: string; subcommand: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.data.agentId, "codex");
  assert.equal(payload.data.runtime, "demo");
  assert.equal(payload.meta.canonicalCommand, "agents");
  assert.equal(payload.meta.subcommand, "codex.status");
});

test("runCli returns chat and provider JSON in the common envelope", async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-chat-json-"));
  const chat = await runCliCapture(["chat", "list", "--home-dir", homeDir, "--json"], process.cwd());
  assert.equal(chat.code, CLI_EXIT_OK);
  const chatPayload = JSON.parse(chat.stdout) as { ok: boolean; data: { sessions: unknown[] }; meta: { canonicalCommand: string; invokedCommand: string; subcommand: string } };
  assert.equal(chatPayload.ok, true);
  assert.equal(chatPayload.meta.canonicalCommand, "sessions");
  assert.equal(chatPayload.meta.invokedCommand, "chat");
  assert.equal(chatPayload.meta.subcommand, "list");
  assert.deepEqual(chatPayload.data.sessions, []);

  const provider = await runCliCapture(["provider", "models", "deepseek", "--json"], process.cwd());
  assert.equal(provider.code, CLI_EXIT_OK);
  const providerPayload = JSON.parse(provider.stdout) as { ok: boolean; data: { models: unknown[] }; meta: { canonicalCommand: string; invokedCommand: string; subcommand: string } };
  assert.equal(providerPayload.ok, true);
  assert.equal(providerPayload.meta.canonicalCommand, "providers");
  assert.equal(providerPayload.meta.invokedCommand, "provider");
  assert.equal(providerPayload.meta.subcommand, "models");
  assert.equal(providerPayload.data.models.length > 0, true);
});

test("runCli returns code JSON in the common envelope", async () => {
  const codeHome = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-code-json-"));
  const result = await runCliCapture(["code", "projects", "list", "--code-home", codeHome, "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as { ok: boolean; data: { projects: unknown[] }; meta: { canonicalCommand: string; invokedCommand: string; subcommand: string; operation: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "code");
  assert.equal(payload.meta.invokedCommand, "code");
  assert.equal(payload.meta.subcommand, "projects");
  assert.equal(payload.meta.operation, "list");
  assert.deepEqual(payload.data.projects, []);
});

test("runCli returns temporal JSON in the common envelope", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-temporal-json-"));
  useIsolatedClawDataRoot(t, workspaceRoot);
  const result = await runCliCapture(["calendar", "list", "--workspace", workspaceRoot, "--runtime", "demo", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as { ok: boolean; data: { items: unknown[] }; meta: { canonicalCommand: string; invokedCommand: string; subcommand: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "calendar");
  assert.equal(payload.meta.invokedCommand, "calendar");
  assert.equal(payload.meta.subcommand, "list");
  assert.deepEqual(payload.data.items, []);
});

test("runCli returns rules JSON in the common envelope", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-rules-json-"));
  useIsolatedClawDataRoot(t, workspaceRoot);
  const result = await runCliCapture(["rules", "compile", "test request", "--workspace", workspaceRoot, "--runtime", "demo", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as { ok: boolean; meta: { canonicalCommand: string; invokedCommand: string; subcommand: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "rules");
  assert.equal(payload.meta.invokedCommand, "rules");
  assert.equal(payload.meta.subcommand, "compile");
});

test("runCli hard-blocks standalone user and memory pre-v1 commands", async () => {
  const user = await runCliCapture(["user", "list", "--json"], process.cwd());
  assert.equal(user.code, CLI_EXIT_USAGE);
  const userPayload = JSON.parse(user.stdout) as { ok: boolean; error: { code: string }; meta: { canonicalCommand: string; invokedCommand: string; related: Array<{ canonicalCommand?: string }> } };
  assert.equal(userPayload.ok, false);
  assert.equal(userPayload.error.code, "removed_public_command");
  assert.equal(userPayload.meta.canonicalCommand, "user");
  assert.equal(userPayload.meta.invokedCommand, "user");
  assert.equal(userPayload.meta.related.some((entry) => entry.canonicalCommand === "profile"), true);

  const memory = await runCliCapture(["memory", "search", "x", "--json"], process.cwd());
  assert.equal(memory.code, CLI_EXIT_USAGE);
  const memoryPayload = JSON.parse(memory.stdout) as { ok: boolean; error: { code: string }; meta: { canonicalCommand: string; invokedCommand: string; related: Array<{ canonicalCommand?: string }> } };
  assert.equal(memoryPayload.ok, false);
  assert.equal(memoryPayload.error.code, "removed_public_command");
  assert.equal(memoryPayload.meta.canonicalCommand, "memory");
  assert.equal(memoryPayload.meta.invokedCommand, "memory");
  assert.equal(memoryPayload.meta.related.some((entry) => entry.canonicalCommand === "knowledge"), true);
});

test("runCli returns removed pre-v1 namespace JSON in the common envelope", async () => {
  for (const args of [
    ["data", "doctor", "--json"],
    ["app-state", "snapshot", "--json"],
    ["runtime", "queue", "--json"],
    ["content", "upsert", "--json"],
    ["business", "upsert", "--json"],
    ["social", "list", "--json"],
    ["infra", "event", "--json"],
    ["ops", "list", "--json"],
  ]) {
    const result = await runCliCapture(args, process.cwd());
    assert.equal(result.code, CLI_EXIT_USAGE, args.join(" "));
    const payload = JSON.parse(result.stdout) as { ok: boolean; error: { code: string }; meta: { invokedCommand: string } };
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "removed_public_command");
    assert.equal(payload.meta.invokedCommand, args[0]);
  }
});

test("runCli returns primary productivity JSON in the common envelope", { concurrency: false }, async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-productivity-json-"));
  useIsolatedClawDataRoot(t, workspaceRoot);
  const result = await runCliCapture(["tasks", "list", "--workspace", workspaceRoot, "--runtime", "demo", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as { ok: boolean; data: unknown[]; meta: { canonicalCommand: string; invokedCommand: string; subcommand: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "tasks");
  assert.equal(payload.meta.invokedCommand, "tasks");
  assert.equal(payload.meta.subcommand, "list");
  assert.equal(Array.isArray(payload.data), true);
});

test("runCli returns productivity database JSON in the common envelope", { concurrency: false }, async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-db-json-"));
  useIsolatedClawDataRoot(t, workspaceRoot);
  const result = await runCliCapture(["db", "tasks", "schema", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as { ok: boolean; data: { collection: { name: string } }; meta: { canonicalCommand: string; invokedCommand: string; collection: string; subcommand: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "database");
  assert.equal(payload.meta.invokedCommand, "db");
  assert.equal(payload.meta.collection, "tasks");
  assert.equal(payload.meta.subcommand, "schema");
  assert.equal(payload.data.collection.name, "tasks");

  const canonicalResult = await runCliCapture(["tasks", "schema", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(canonicalResult.code, CLI_EXIT_OK);
  const canonicalPayload = JSON.parse(canonicalResult.stdout) as { ok: boolean; data: { collection: { name: string } }; meta: { canonicalCommand: string; invokedCommand: string; collection: string; subcommand: string } };
  assert.equal(canonicalPayload.ok, true);
  assert.equal(canonicalPayload.meta.canonicalCommand, "tasks");
  assert.equal(canonicalPayload.meta.invokedCommand, "tasks");
  assert.equal(canonicalPayload.meta.collection, "tasks");
  assert.equal(canonicalPayload.meta.subcommand, "schema");
  assert.equal(canonicalPayload.data.collection.name, "tasks");

  assert.equal((await runCliCapture(["tasks", "create", "Canonical query task", "--workspace", workspaceRoot, "--runtime", "demo", "--json"], process.cwd())).code, CLI_EXIT_OK);
  const queryResult = await runCliCapture(["tasks", "query", "Canonical", "--workspace", workspaceRoot, "--runtime", "demo", "--json"], process.cwd());
  assert.equal(queryResult.code, CLI_EXIT_OK);
  const queryPayload = JSON.parse(queryResult.stdout) as { ok: boolean; data: Array<{ title: string }>; meta: { canonicalCommand: string; invokedCommand: string; collection: string; subcommand: string } };
  assert.equal(queryPayload.ok, true);
  assert.equal(queryPayload.meta.canonicalCommand, "tasks");
  assert.equal(queryPayload.meta.invokedCommand, "tasks");
  assert.equal(queryPayload.meta.collection, "tasks");
  assert.equal(queryPayload.meta.subcommand, "query");
  assert.equal(queryPayload.data.some((item) => item.title === "Canonical query task"), true);
});

test("runCli exposes the local collection catalog for agents", async () => {
  const result = await runCliCapture(["collections", "list", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    data: {
      collections: Array<{ name: string; aliases: string[]; family: string; fieldCount: number; commands: { schema: string; list: string; query: string } }>;
      total: number;
      returned: number;
    };
    meta: { canonicalCommand: string; invokedCommand: string; subcommand: string };
  };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "database");
  assert.equal(payload.meta.invokedCommand, "collections");
  assert.equal(payload.meta.subcommand, "list");
  assert.equal(payload.data.total >= payload.data.returned, true);
  const tasks = payload.data.collections.find((collection) => collection.name === "tasks");
  assert.ok(tasks);
  assert.equal(tasks.aliases.includes("task"), true);
  assert.equal(tasks.fieldCount > 0, true);
  assert.equal(tasks.commands.schema, "claw collections tasks schema --json");
  assert.equal(tasks.commands.list, "claw db tasks list --json");
  assert.equal(tasks.commands.query, "claw db tasks query <text> --json");
});

test("runCli returns a useful JSON hint when the database admin service is unavailable", async () => {
  const result = await runCliCapture(["database", "collection", "list", "--json", "--url", "http://127.0.0.1:9"], process.cwd());
  assert.equal(result.code, CLI_EXIT_FAILURE);
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    error: { code: string; message: string };
    meta: { canonicalCommand: string; subcommand: string; hint: string; suggestedCommands: string[] };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "database_service_unavailable");
  assert.equal(payload.meta.canonicalCommand, "database");
  assert.equal(payload.meta.subcommand, "collection.list");
  assert.match(payload.meta.hint, /claw collections list --json/);
  assert.equal(payload.meta.suggestedCommands.includes("claw collections list --json"), true);
});

test("runCli routes unique built-in collection aliases through database CRUD", { concurrency: false }, async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-collection-alias-json-"));
  useIsolatedClawDataRoot(t, workspaceRoot);
  const result = await runCliCapture(["lead", "list", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as { ok: boolean; meta: { canonicalCommand: string; collection: string; subcommand: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "database");
  assert.equal(payload.meta.collection, "leads");
  assert.equal(payload.meta.subcommand, "leads list");
});

test("runCli returns advanced productivity JSON in the common envelope", { concurrency: false }, async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-outcomes-json-"));
  useIsolatedClawDataRoot(t, workspaceRoot);
  const result = await runCliCapture(["outcomes", "list", "--workspace", workspaceRoot, "--runtime", "demo", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as { ok: boolean; data: { outcomes: unknown[] }; meta: { canonicalCommand: string; invokedCommand: string; subcommand: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "outcomes");
  assert.equal(payload.meta.invokedCommand, "outcomes");
  assert.equal(payload.meta.subcommand, "list");
  assert.deepEqual(payload.data.outcomes, []);
});

test("runCli returns media generation JSON in the common envelope", { concurrency: false }, async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-media-json-"));
  useIsolatedClawDataRoot(t, workspaceRoot);
  const result = await runCliCapture(["image", "list", "--workspace", workspaceRoot, "--runtime", "demo", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_DEGRADED);
  const payload = JSON.parse(result.stdout) as { ok: boolean; data: unknown[]; meta: { canonicalCommand: string; invokedCommand: string; subcommand: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "images");
  assert.equal(payload.meta.invokedCommand, "image");
  assert.equal(payload.meta.subcommand, "list");
  assert.deepEqual(payload.data, []);
});

test("runCli routes media portal children to canonical media commands", { concurrency: false }, async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-media-portal-json-"));
  useIsolatedClawDataRoot(t, workspaceRoot);
  const result = await runCliCapture(["media", "images", "list", "--workspace", workspaceRoot, "--runtime", "demo", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_DEGRADED);
  const payload = JSON.parse(result.stdout) as { ok: boolean; data: unknown[]; meta: { canonicalCommand: string; invokedCommand: string; subcommand: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "images");
  assert.equal(payload.meta.invokedCommand, "image");
  assert.equal(payload.meta.subcommand, "list");
  assert.deepEqual(payload.data, []);
});

test("runCli returns channel JSON in the common envelope", { concurrency: false }, async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-channels-json-"));
  useIsolatedClawDataRoot(t, workspaceRoot);
  const result = await runCliCapture(["channels", "list", "--workspace", workspaceRoot, "--runtime", "demo", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as { ok: boolean; data: unknown[]; meta: { canonicalCommand: string; invokedCommand: string; subcommand: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "channels");
  assert.equal(payload.meta.invokedCommand, "channels");
  assert.equal(payload.meta.subcommand, "list");
  assert.equal(Array.isArray(payload.data), true);
});

test("runCli returns extended productivity JSON in the common envelope", { concurrency: false }, async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-extended-productivity-json-"));
  useIsolatedClawDataRoot(t, workspaceRoot);
  const result = await runCliCapture(["blockers", "list", "--workspace", workspaceRoot, "--runtime", "demo", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as { ok: boolean; data: unknown[]; meta: { canonicalCommand: string; invokedCommand: string; subcommand: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "blockers");
  assert.equal(payload.meta.invokedCommand, "blockers");
  assert.equal(payload.meta.subcommand, "list");
  assert.deepEqual(payload.data, []);
});

test("runCli routes audited built-in collection aliases as top-level database commands", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-collection-alias-db-"));
  const companyCreate = await runCliCapture(["company", "create", "Alias Corp", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(companyCreate.code, CLI_EXIT_OK, companyCreate.stderr || companyCreate.stdout);
  const companyPayload = JSON.parse(companyCreate.stdout) as { data: { id: string } };

  const leadCreate = await runCliCapture(["lead", "create", "Ada Lead", "--company-id", companyPayload.data.id, "--email", "ada@example.test", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(leadCreate.code, CLI_EXIT_OK, leadCreate.stderr || leadCreate.stdout);
  const leadPayload = JSON.parse(leadCreate.stdout) as { data: { id: string; title: string; companyId: string; email: string }; meta: { canonicalCommand: string; invokedCommand: string; collection: string; action: string } };
  assert.equal(leadPayload.meta.canonicalCommand, "database");
  assert.equal(leadPayload.meta.invokedCommand, "lead");
  assert.equal(leadPayload.meta.collection, "leads");
  assert.equal(leadPayload.meta.action, "create");
  assert.equal(leadPayload.data.title, "Ada Lead");
  assert.equal(leadPayload.data.companyId, companyPayload.data.id);

  const leadsList = await runCliCapture(["leads", "list", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(leadsList.code, CLI_EXIT_OK);
  const leadsPayload = JSON.parse(leadsList.stdout) as { data: Array<{ id: string; title: string }>; meta: { collection: string; action: string } };
  assert.equal(leadsPayload.meta.collection, "leads");
  assert.equal(leadsPayload.meta.action, "list");
  assert.equal(leadsPayload.data.some((record) => record.id === leadPayload.data.id && record.title === "Ada Lead"), true);

  const transportList = await runCliCapture(["transport", "list", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(transportList.code, CLI_EXIT_OK);
  const transportPayload = JSON.parse(transportList.stdout) as { data: unknown[]; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(transportPayload.meta.invokedCommand, "transport");
  assert.equal(transportPayload.meta.collection, "transports_booked");
  assert.equal(transportPayload.meta.action, "list");
  assert.deepEqual(transportPayload.data, []);
});

test("runCli exposes help-only portals through JSON", async () => {
  for (const command of ["logs", "monitor"]) {
    const result = await runCliCapture([command, "--json"], process.cwd());
    assert.equal(result.code, CLI_EXIT_OK);
    const payload = JSON.parse(result.stdout) as { ok: boolean; data: { command: string; help: string }; meta: { canonicalCommand: string; invokedCommand: string; subcommand: null } };
    assert.equal(payload.ok, true);
    assert.equal(payload.data.command, command);
    assert.match(payload.data.help, new RegExp(`Usage: claw ${command}`));
    assert.equal(payload.meta.canonicalCommand, command);
    assert.equal(payload.meta.invokedCommand, command);
    assert.equal(payload.meta.subcommand, null);
  }
});

test("runCli rejects retired content portal shortcuts", async () => {
  const result = await runCliCapture(["posts", "list", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_USAGE);
  const payload = JSON.parse(result.stdout) as { ok: boolean; error: { code: string; message: string }; meta: { canonicalCommand: string; invokedCommand: string; subcommand: string } };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "removed_public_command");
  assert.match(payload.error.message, /claw content entry/);
  assert.equal(payload.meta.canonicalCommand, "posts");
  assert.equal(payload.meta.invokedCommand, "posts");
  assert.equal(payload.meta.subcommand, "list");

  const contentShortcut = await runCliCapture(["content", "posts", "list", "--json"], process.cwd());
  assert.equal(contentShortcut.code, CLI_EXIT_USAGE);
  const shortcutPayload = JSON.parse(contentShortcut.stdout) as { ok: boolean; error: { code: string; message: string }; meta: { canonicalCommand: string; invokedCommand: string; subcommand: string } };
  assert.equal(shortcutPayload.ok, false);
  assert.equal(shortcutPayload.error.code, "removed_public_command");
  assert.match(shortcutPayload.error.message, /content brand, destination, campaign, entry, approval, or publish/);
  assert.equal(shortcutPayload.meta.canonicalCommand, "content");
  assert.equal(shortcutPayload.meta.invokedCommand, "content");
  assert.equal(shortcutPayload.meta.subcommand, "posts");
});

test("runCli returns root router JSON in the common envelope", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-runtime-json-"));
  useIsolatedClawDataRoot(t, workspaceRoot);
  const result = await runCliCapture(["runtime", "status", "--runtime", "demo", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as { ok: boolean; data: { adapter: string }; meta: { canonicalCommand: string; invokedCommand: string; subcommand: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "runtime");
  assert.equal(payload.meta.invokedCommand, "runtime");
  assert.equal(payload.meta.subcommand, "status");
  assert.equal(payload.data.adapter, "demo");
});

test("runCli searches registered local docs and ADR contents", async () => {
  const result = await runCliCapture(["search", "Stable JSON output uses", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as { data: { results: Array<{ type: string; path?: string; summary: string }> } };
  assert.equal(payload.data.results.some((entry) => entry.type === "adr" && entry.path === "docs/adr/0007-cli-agent-interface.md" && /Stable JSON output uses/.test(entry.summary)), true);
});

test("runCli searches discoverability and route governance artifacts", async () => {
  for (const [query, expectedPath] of [
    ["surface route graph", "docs/adr/0012-surface-route-graph.md"],
    ["docs alignment", "skills/docs-alignment-update/SKILL.md"],
    ["discoverability", "docs/adr/0017-discoverability-and-meta-code-routing.md"],
    ["meta-code routing", "docs/adr/0017-discoverability-and-meta-code-routing.md"],
  ]) {
    const result = await runCliCapture(["search", query, "--json"], process.cwd());
    assert.equal(result.code, CLI_EXIT_OK, query);
    const payload = JSON.parse(result.stdout) as { data: { results: Array<{ path?: string }> } };
    assert.equal(payload.data.results.some((entry) => entry.path === expectedPath), true, query);
  }
});

test("runCli prints related matches for unknown human commands", async () => {
  const result = await runCliCapture(["peopel"], process.cwd());
  assert.equal(result.code, CLI_EXIT_USAGE);
  assert.match(result.stderr, /Related:/);
  assert.match(result.stderr, /people/);
});

test("runCli can show deterministic search help without workspace access", async () => {
  const stdout = { value: "", stream: { write(chunk: string) { stdout.value += chunk; return true; } } as unknown as NodeJS.WritableStream };
  const stderr = { value: "", stream: { write(chunk: string) { stderr.value += chunk; return true; } } as unknown as NodeJS.WritableStream };
  const code = await runCli(["search"], { stdout: stdout.stream, stderr: stderr.stream, cwd: process.cwd() });
  assert.equal(code, CLI_EXIT_OK);
  assert.match(stdout.value, /deterministic local discovery/i);
});
