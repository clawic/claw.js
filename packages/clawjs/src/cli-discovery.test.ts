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
  const qualityGapPayload = JSON.parse(qualityGapCreate.stdout) as { data: { label: string; targetCollection: string; targetId: string; gapKind: string; status: string; evidenceSourceId: string }; meta: { collection: string; action: string; invokedCommand: string } };
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

  const healthGaps = await runCliCapture(["health", "gaps", "--json"], process.cwd());
  assert.equal(healthGaps.code, CLI_EXIT_OK);
  const gapsPayload = JSON.parse(healthGaps.stdout) as { data: { coverage: { executable: boolean }; registry: { systems: Array<{ id: string }> } }; meta: { denseData: boolean } };
  assert.equal(gapsPayload.meta.denseData, true);
  assert.equal(gapsPayload.data.coverage.executable, true);
  assert.equal(gapsPayload.data.registry.systems.some((system) => system.id === "health"), true);

  const patientTimeline = await runCliCapture(["patient", createdPatient.data.id, "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(patientTimeline.code, CLI_EXIT_OK);
  const patientTimelinePayload = JSON.parse(patientTimeline.stdout) as {
    data: {
      coverage: { executable: boolean; implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string; commandPattern: string };
      view: { operationId: string; requiredInputs: string[]; createsOrReads: string[] };
    };
    meta: { denseData: boolean; semanticView: boolean };
  };
  assert.equal(patientTimelinePayload.meta.denseData, true);
  assert.equal(patientTimelinePayload.meta.semanticView, true);
  assert.equal(patientTimelinePayload.data.coverage.executable, true);
  assert.equal(patientTimelinePayload.data.coverage.implementationStatus, "semantic_view_contract");
  assert.equal(patientTimelinePayload.data.coverage.recordsMaterialized, false);
  assert.equal(patientTimelinePayload.data.semanticView.id, "patient.timeline");
  assert.equal(patientTimelinePayload.data.semanticView.systemId, "health");
  assert.equal(patientTimelinePayload.data.semanticView.commandPattern, "claw patient <id> timeline");
  assert.equal(patientTimelinePayload.data.view.operationId, "patient.timeline");
  assert.deepEqual(patientTimelinePayload.data.view.requiredInputs, ["patient_id"]);
  assert.equal(patientTimelinePayload.data.view.createsOrReads.includes("timeline_view"), true);

  const companyCreate = await runCliCapture(["company", "create", "Acme Corp", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(companyCreate.code, CLI_EXIT_OK);
  const companyPayload = JSON.parse(companyCreate.stdout) as { data: { id: string; name: string }; meta: { collection: string; action: string } };
  assert.equal(companyPayload.meta.collection, "companies");
  assert.equal(companyPayload.meta.action, "create");
  assert.equal(companyPayload.data.name, "Acme Corp");

  const accountCreate = await runCliCapture(["account", "create", "Acme Account", "--company", companyPayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(accountCreate.code, CLI_EXIT_OK);
  const accountPayload = JSON.parse(accountCreate.stdout) as { data: { id: string; name: string; companyId: string }; meta: { collection: string; action: string } };
  assert.equal(accountPayload.meta.collection, "accounts");
  assert.equal(accountPayload.data.name, "Acme Account");
  assert.equal(accountPayload.data.companyId, companyPayload.data.id);

  const dealCreate = await runCliCapture(["deal", "create", "Pilot", "--company", companyPayload.data.id, "--account-id", accountPayload.data.id, "--value-cents", "2500", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(dealCreate.code, CLI_EXIT_OK);
  const dealPayload = JSON.parse(dealCreate.stdout) as { data: { title: string; companyId: string; accountId: string; valueCents: number; status: string }; meta: { collection: string; action: string } };
  assert.equal(dealPayload.meta.collection, "deals");
  assert.equal(dealPayload.data.title, "Pilot");
  assert.equal(dealPayload.data.companyId, companyPayload.data.id);
  assert.equal(dealPayload.data.accountId, accountPayload.data.id);
  assert.equal(dealPayload.data.valueCents, 2500);
  assert.equal(dealPayload.data.status, "open");

  const billingCustomer = await runCliCapture(["db", "billing_customer", "create", "Acme Billing", "--company-id", companyPayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(billingCustomer.code, CLI_EXIT_OK);
  const billingCustomerPayload = JSON.parse(billingCustomer.stdout) as { data: { id: string } };
  const invoiceCreate = await runCliCapture(["invoice", "create", "INV-001", "--billing-customer", billingCustomerPayload.data.id, "--total-cents", "9900", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(invoiceCreate.code, CLI_EXIT_OK);
  const invoicePayload = JSON.parse(invoiceCreate.stdout) as { data: { number: string; billingCustomerId: string; totalCents: number; status: string }; meta: { collection: string; action: string } };
  assert.equal(invoicePayload.meta.collection, "invoices");
  assert.equal(invoicePayload.data.number, "INV-001");
  assert.equal(invoicePayload.data.billingCustomerId, billingCustomerPayload.data.id);
  assert.equal(invoicePayload.data.totalCents, 9900);
  assert.equal(invoicePayload.data.status, "draft");

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

  const learnerCreate = await runCliCapture(["learner", "create", "Ada Learner", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(learnerCreate.code, CLI_EXIT_OK);
  const learnerPayload = JSON.parse(learnerCreate.stdout) as { data: { displayName: string; status: string }; meta: { collection: string; action: string } };
  assert.equal(learnerPayload.meta.collection, "learners");
  assert.equal(learnerPayload.data.displayName, "Ada Learner");
  assert.equal(learnerPayload.data.status, "active");

  const courseCreate = await runCliCapture(["course", "create", "Intro Biology", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(courseCreate.code, CLI_EXIT_OK);
  const coursePayload = JSON.parse(courseCreate.stdout) as { data: { title: string; status: string }; meta: { collection: string; action: string } };
  assert.equal(coursePayload.meta.collection, "courses");
  assert.equal(coursePayload.data.title, "Intro Biology");
  assert.equal(coursePayload.data.status, "enrolled");

  const workOrderCreate = await runCliCapture(["work-order", "create", "Batch 42", "--company", companyPayload.data.id, "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(workOrderCreate.code, CLI_EXIT_OK);
  const workOrderPayload = JSON.parse(workOrderCreate.stdout) as { data: { title: string; companyId: string; status: string }; meta: { collection: string; action: string } };
  assert.equal(workOrderPayload.meta.collection, "work_orders");
  assert.equal(workOrderPayload.data.title, "Batch 42");
  assert.equal(workOrderPayload.data.companyId, companyPayload.data.id);
  assert.equal(workOrderPayload.data.status, "planned");

  const financialAccountCreate = await runCliCapture(["financial-account", "create", "Operating Account", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(financialAccountCreate.code, CLI_EXIT_OK);
  const financialAccountPayload = JSON.parse(financialAccountCreate.stdout) as { data: { id: string; name: string }; meta: { collection: string; action: string } };
  assert.equal(financialAccountPayload.meta.collection, "financial_accounts");
  assert.equal(financialAccountPayload.data.name, "Operating Account");

  const transactionCreate = await runCliCapture(["transaction", "create", "Lunch", "--account", financialAccountPayload.data.id, "--amount-cents", "1200", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(transactionCreate.code, CLI_EXIT_OK);
  const transactionPayload = JSON.parse(transactionCreate.stdout) as { data: { description: string; accountId: string; amountCents: number; currency: string; postedAt: string }; meta: { collection: string; action: string } };
  assert.equal(transactionPayload.meta.collection, "transactions");
  assert.equal(transactionPayload.data.description, "Lunch");
  assert.equal(transactionPayload.data.accountId, financialAccountPayload.data.id);
  assert.equal(transactionPayload.data.amountCents, 1200);
  assert.equal(transactionPayload.data.currency, "USD");
  assert.equal(typeof transactionPayload.data.postedAt, "string");

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
  const experimentSamplePayload = JSON.parse(experimentSample.stdout) as { data: { label: string; biologyExperimentId: string; organismId: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(experimentSamplePayload.meta.invokedCommand, "experiment");
  assert.equal(experimentSamplePayload.meta.collection, "samples");
  assert.equal(experimentSamplePayload.data.label, "Exp sample 1");
  assert.equal(experimentSamplePayload.data.biologyExperimentId, experimentPayload.data.id);
  assert.equal(experimentSamplePayload.data.organismId, organismPayload.data.id);

});

test("runCli seeds the dense-data acceptance fixture into the shared database", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-dense-fixture-"));

  const seedResult = await runCliCapture(["dense-fixtures", "seed", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(seedResult.code, CLI_EXIT_OK);
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
  assert.equal(seedPayload.data.seeded.some((record) => record.id === "fixture_gap_missing_dob" && record.collectionName === "quality_gaps" && record.covers.includes("partial_data_gap")), true);

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

test("runCli returns agents codex JSON in the common envelope", async () => {
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

test("runCli returns temporal JSON in the common envelope", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-temporal-json-"));
  const result = await runCliCapture(["calendar", "list", "--workspace", workspaceRoot, "--runtime", "demo", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as { ok: boolean; data: { items: unknown[] }; meta: { canonicalCommand: string; invokedCommand: string; subcommand: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "calendar");
  assert.equal(payload.meta.invokedCommand, "calendar");
  assert.equal(payload.meta.subcommand, "list");
  assert.deepEqual(payload.data.items, []);
});

test("runCli returns rules JSON in the common envelope", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-rules-json-"));
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

test("runCli returns root router JSON in the common envelope", async () => {
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
