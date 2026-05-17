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
  assert.equal(patientTimelinePayload.data.materializedView.itemCount >= 5, true);
  assert.equal(patientTimelinePayload.data.materializedView.partial, true);
  assert.equal(patientTimelinePayload.data.materializedView.items.some((item) => item.kind === "medication" && item.label === "Atorvastatin"), true);
  assert.equal(patientTimelinePayload.data.materializedView.items.some((item) => item.kind === "symptom" && item.label === "Headache"), true);
  assert.equal(patientTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === qualityGapPayload.data.id && gap.gapKind === "missing"), true);

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
  const dealPayload = JSON.parse(dealCreate.stdout) as { data: { id: string; title: string; companyId: string; accountId: string; valueCents: number; status: string }; meta: { collection: string; action: string } };
  assert.equal(dealPayload.meta.collection, "deals");
  assert.equal(dealPayload.data.title, "Pilot");
  assert.equal(dealPayload.data.companyId, companyPayload.data.id);
  assert.equal(dealPayload.data.accountId, accountPayload.data.id);
  assert.equal(dealPayload.data.valueCents, 2500);
  assert.equal(dealPayload.data.status, "open");

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
  assert.equal(caseTimelinePayload.data.materializedView.itemCount >= 4, true);
  assert.equal(caseTimelinePayload.data.materializedView.partial, true);
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

  const productCreate = await runCliCapture(["db", "product", "create", "Press Model", "--company-id", companyPayload.data.id, "--type", "physical", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(productCreate.code, CLI_EXIT_OK);
  const productPayload = JSON.parse(productCreate.stdout) as { data: { id: string; name: string; companyId: string; type: string }; meta: { collection: string; action: string } };
  assert.equal(productPayload.meta.collection, "products_catalog");
  assert.equal(productPayload.data.name, "Press Model");
  assert.equal(productPayload.data.companyId, companyPayload.data.id);

  const assetCreate = await runCliCapture(["asset", "create", "--company", companyPayload.data.id, "--account-id", accountPayload.data.id, "--product", productPayload.data.id, "--serial-number", "PRESS-001", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(assetCreate.code, CLI_EXIT_OK);
  const assetPayload = JSON.parse(assetCreate.stdout) as { data: { id: string; companyId: string; accountId: string; productCatalogId: string; serialNumber: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(assetPayload.meta.invokedCommand, "asset");
  assert.equal(assetPayload.meta.collection, "assets");
  assert.equal(assetPayload.data.companyId, companyPayload.data.id);
  assert.equal(assetPayload.data.accountId, accountPayload.data.id);
  assert.equal(assetPayload.data.productCatalogId, productPayload.data.id);
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
  assert.equal(assetTimelinePayload.data.materializedView.product?.id, productPayload.data.id);
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
  assert.equal(companyTimelinePayload.data.materializedView.records.products.some((record) => record.id === productPayload.data.id), true);
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
  const experimentSampleAssayPayload = JSON.parse(experimentSampleAssay.stdout) as { data: { name: string; sampleId: string }; meta: { collection: string } };
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

  const timeline = await runCliCapture(["patient", "fixture_patient_ada", "timeline", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(timeline.code, CLI_EXIT_OK);
  const timelinePayload = JSON.parse(timeline.stdout) as { data: { coverage: { implementationStatus: string; recordsMaterialized: boolean }; materializedView: { itemCount: number; partial: boolean; items: Array<{ kind: string; recordId: string }>; gaps: Array<{ id: string }> } } };
  assert.equal(timelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(timelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(timelinePayload.data.materializedView.partial, true);
  assert.equal(timelinePayload.data.materializedView.itemCount >= 4, true);
  assert.equal(timelinePayload.data.materializedView.items.some((item) => item.kind === "patient" && item.recordId === "fixture_patient_ada"), true);
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
