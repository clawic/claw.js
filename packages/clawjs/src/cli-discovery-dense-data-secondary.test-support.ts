import assert from "node:assert/strict";

import { CLI_EXIT_OK } from "./index.ts";
import { runCliCapture } from "./index-test-utils.ts";
import type { DenseDataScenarioContext } from "./cli-discovery-dense-data-primary.test-support.ts";

export async function completeDenseDataScenarioContext(ctx: DenseDataScenarioContext): Promise<void> {

  ctx.agencyCreate = await runCliCapture(["agency", "create", "City Permitting Office", "--jurisdiction", "Madrid", "--level", "municipal", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.agencyCreate.code, CLI_EXIT_OK, ctx.agencyCreate.stderr || ctx.agencyCreate.stdout);
  ctx.agencyPayload = JSON.parse(ctx.agencyCreate.stdout) as { data: { id: string; name: string; jurisdiction: string; level: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.agencyPayload.meta.invokedCommand, "agency");
  assert.equal(ctx.agencyPayload.meta.collection, "agencies");
  assert.equal(ctx.agencyPayload.meta.action, "create");
  assert.equal(ctx.agencyPayload.data.name, "City Permitting Office");
  assert.equal(ctx.agencyPayload.data.jurisdiction, "Madrid");
  assert.equal(ctx.agencyPayload.data.level, "municipal");
  assert.equal(ctx.agencyPayload.data.status, "active");

  ctx.publicCaseCreate = await runCliCapture(["agency", ctx.agencyPayload.data.id, "public-cases", "add", "Lab buildout permit case", "--company", ctx.companyPayload.data.id, "--case-number", "GOV-001", "--case-type", "permit", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.publicCaseCreate.code, CLI_EXIT_OK, ctx.publicCaseCreate.stderr || ctx.publicCaseCreate.stdout);
  ctx.publicCasePayload = JSON.parse(ctx.publicCaseCreate.stdout) as { data: { id: string; title: string; agencyId: string; companyId: string; caseNumber: string; caseType: string; status: string; openedAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.publicCasePayload.meta.invokedCommand, "agency");
  assert.equal(ctx.publicCasePayload.meta.collection, "public_cases");
  assert.equal(ctx.publicCasePayload.meta.action, "create");
  assert.equal(ctx.publicCasePayload.data.title, "Lab buildout permit case");
  assert.equal(ctx.publicCasePayload.data.agencyId, ctx.agencyPayload.data.id);
  assert.equal(ctx.publicCasePayload.data.companyId, ctx.companyPayload.data.id);
  assert.equal(ctx.publicCasePayload.data.caseNumber, "GOV-001");
  assert.equal(ctx.publicCasePayload.data.caseType, "permit");
  assert.equal(ctx.publicCasePayload.data.status, "draft");
  assert.equal(typeof ctx.publicCasePayload.data.openedAt, "string");

  ctx.permitCreate = await runCliCapture(["public-case", ctx.publicCasePayload.data.id, "permits", "add", "Lab buildout permit", "--agency", ctx.agencyPayload.data.id, "--company", ctx.companyPayload.data.id, "--permit-number", "PERMIT-001", "--permit-type", "building", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.permitCreate.code, CLI_EXIT_OK, ctx.permitCreate.stderr || ctx.permitCreate.stdout);
  ctx.permitPayload = JSON.parse(ctx.permitCreate.stdout) as { data: { id: string; title: string; publicCaseId: string; agencyId: string; companyId: string; permitNumber: string; permitType: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.permitPayload.meta.invokedCommand, "public-case");
  assert.equal(ctx.permitPayload.meta.collection, "permits");
  assert.equal(ctx.permitPayload.meta.action, "create");
  assert.equal(ctx.permitPayload.data.title, "Lab buildout permit");
  assert.equal(ctx.permitPayload.data.publicCaseId, ctx.publicCasePayload.data.id);
  assert.equal(ctx.permitPayload.data.agencyId, ctx.agencyPayload.data.id);
  assert.equal(ctx.permitPayload.data.companyId, ctx.companyPayload.data.id);
  assert.equal(ctx.permitPayload.data.permitNumber, "PERMIT-001");
  assert.equal(ctx.permitPayload.data.permitType, "building");
  assert.equal(ctx.permitPayload.data.status, "draft");

  ctx.filingCreate = await runCliCapture(["public-case", ctx.publicCasePayload.data.id, "filings", "add", "Permit application", "--agency", ctx.agencyPayload.data.id, "--filing-number", "FILING-001", "--filing-type", "application", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.filingCreate.code, CLI_EXIT_OK, ctx.filingCreate.stderr || ctx.filingCreate.stdout);
  ctx.filingPayload = JSON.parse(ctx.filingCreate.stdout) as { data: { id: string; title: string; publicCaseId: string; agencyId: string; filingNumber: string; filingType: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.filingPayload.meta.invokedCommand, "public-case");
  assert.equal(ctx.filingPayload.meta.collection, "public_filings");
  assert.equal(ctx.filingPayload.meta.action, "create");
  assert.equal(ctx.filingPayload.data.title, "Permit application");
  assert.equal(ctx.filingPayload.data.publicCaseId, ctx.publicCasePayload.data.id);
  assert.equal(ctx.filingPayload.data.agencyId, ctx.agencyPayload.data.id);
  assert.equal(ctx.filingPayload.data.filingNumber, "FILING-001");
  assert.equal(ctx.filingPayload.data.filingType, "application");
  assert.equal(ctx.filingPayload.data.status, "draft");

  ctx.publicCaseEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Permit receipt", "--kind", "document", "--collection-name", "public_cases", "--record-id", ctx.publicCasePayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.publicCaseEvidenceSourceCreate.code, CLI_EXIT_OK);
  ctx.publicCaseEvidenceSourcePayload = JSON.parse(ctx.publicCaseEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(ctx.publicCaseEvidenceSourcePayload.data.collectionName, "public_cases");
  assert.equal(ctx.publicCaseEvidenceSourcePayload.data.recordId, ctx.publicCasePayload.data.id);

  ctx.publicCaseGapCreate = await runCliCapture(["quality-gap", "create", "Missing public response", "--target-collection", "public_cases", "--target-id", ctx.publicCasePayload.data.id, "--gap-kind", "missing", "--evidence-source-id", ctx.publicCaseEvidenceSourcePayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.publicCaseGapCreate.code, CLI_EXIT_OK);
  ctx.publicCaseGapPayload = JSON.parse(ctx.publicCaseGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(ctx.publicCaseGapPayload.data.targetCollection, "public_cases");
  assert.equal(ctx.publicCaseGapPayload.data.targetId, ctx.publicCasePayload.data.id);
  assert.equal(ctx.publicCaseGapPayload.data.gapKind, "missing");

  ctx.publicCaseTimeline = await runCliCapture(["public-case", ctx.publicCasePayload.data.id, "timeline", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.publicCaseTimeline.code, CLI_EXIT_OK, ctx.publicCaseTimeline.stderr || ctx.publicCaseTimeline.stdout);
  ctx.publicCaseTimelinePayload = JSON.parse(ctx.publicCaseTimeline.stdout) as {
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
  assert.equal(ctx.publicCaseTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.publicCaseTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.publicCaseTimelinePayload.data.semanticView.id, "public_case.timeline");
  assert.equal(ctx.publicCaseTimelinePayload.data.semanticView.systemId, "government");
  assert.equal(ctx.publicCaseTimelinePayload.data.materializedView.subject.id, ctx.publicCasePayload.data.id);
  assert.equal(ctx.publicCaseTimelinePayload.data.materializedView.subject.label, "Lab buildout permit case");
  assert.equal(ctx.publicCaseTimelinePayload.data.materializedView.agency?.id, ctx.agencyPayload.data.id);
  assert.equal(ctx.publicCaseTimelinePayload.data.materializedView.company?.id, ctx.companyPayload.data.id);
  assert.equal(ctx.publicCaseTimelinePayload.data.materializedView.summary.permits, 1);
  assert.equal(ctx.publicCaseTimelinePayload.data.materializedView.summary.filings, 1);
  assert.equal(ctx.publicCaseTimelinePayload.data.materializedView.summary.evidenceSources, 1);
  assert.equal(ctx.publicCaseTimelinePayload.data.materializedView.summary.qualityGaps, 1);
  assert.equal(ctx.publicCaseTimelinePayload.data.materializedView.summary.hasAgency, true);
  assert.equal(ctx.publicCaseTimelinePayload.data.materializedView.summary.hasCompany, true);
  assert.equal(ctx.publicCaseTimelinePayload.data.materializedView.partial, true);
  assert.equal(ctx.publicCaseTimelinePayload.data.materializedView.itemCount >= 6, true);
  assert.equal(ctx.publicCaseTimelinePayload.data.materializedView.items.some((item) => item.kind === "permit" && item.label === "Lab buildout permit"), true);
  assert.equal(ctx.publicCaseTimelinePayload.data.materializedView.items.some((item) => item.kind === "public_filing" && item.label === "Permit application"), true);
  assert.equal(ctx.publicCaseTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === ctx.publicCaseGapPayload.data.id && gap.gapKind === "missing"), true);

  ctx.thingCreate = await runCliCapture(["thing", "create", "Press IoT thing", "--company", ctx.companyPayload.data.id, "--kind", "controller", "--external-id", "thing-001", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.thingCreate.code, CLI_EXIT_OK, ctx.thingCreate.stderr || ctx.thingCreate.stdout);
  ctx.thingPayload = JSON.parse(ctx.thingCreate.stdout) as { data: { id: string; name: string; companyId: string; kind: string; status: string; externalId: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.thingPayload.meta.invokedCommand, "thing");
  assert.equal(ctx.thingPayload.meta.collection, "iot_things");
  assert.equal(ctx.thingPayload.meta.action, "create");
  assert.equal(ctx.thingPayload.data.name, "Press IoT thing");
  assert.equal(ctx.thingPayload.data.companyId, ctx.companyPayload.data.id);
  assert.equal(ctx.thingPayload.data.kind, "controller");
  assert.equal(ctx.thingPayload.data.status, "active");

  ctx.iotDeviceCreate = await runCliCapture(["thing", ctx.thingPayload.data.id, "devices", "add", "Press vibration sensor", "--protocol", "mqtt", "--device-type", "sensor", "--status", "online", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.iotDeviceCreate.code, CLI_EXIT_OK, ctx.iotDeviceCreate.stderr || ctx.iotDeviceCreate.stdout);
  ctx.iotDevicePayload = JSON.parse(ctx.iotDeviceCreate.stdout) as { data: { id: string; name: string; thingId: string; protocol: string; deviceType: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.iotDevicePayload.meta.invokedCommand, "thing");
  assert.equal(ctx.iotDevicePayload.meta.collection, "iot_devices");
  assert.equal(ctx.iotDevicePayload.meta.action, "create");
  assert.equal(ctx.iotDevicePayload.data.name, "Press vibration sensor");
  assert.equal(ctx.iotDevicePayload.data.thingId, ctx.thingPayload.data.id);
  assert.equal(ctx.iotDevicePayload.data.protocol, "mqtt");
  assert.equal(ctx.iotDevicePayload.data.deviceType, "sensor");
  assert.equal(ctx.iotDevicePayload.data.status, "online");

  ctx.sensorReadingCreate = await runCliCapture(["iot-device", ctx.iotDevicePayload.data.id, "readings", "add", "vibration", "--thing", ctx.thingPayload.data.id, "--value", "0.42", "--quality", "good", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.sensorReadingCreate.code, CLI_EXIT_OK, ctx.sensorReadingCreate.stderr || ctx.sensorReadingCreate.stdout);
  ctx.sensorReadingPayload = JSON.parse(ctx.sensorReadingCreate.stdout) as { data: { id: string; metric: string; deviceId: string; thingId: string; value: number; quality: string; observedAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.sensorReadingPayload.meta.invokedCommand, "iot-device");
  assert.equal(ctx.sensorReadingPayload.meta.collection, "sensor_readings");
  assert.equal(ctx.sensorReadingPayload.meta.action, "create");
  assert.equal(ctx.sensorReadingPayload.data.metric, "vibration");
  assert.equal(ctx.sensorReadingPayload.data.deviceId, ctx.iotDevicePayload.data.id);
  assert.equal(ctx.sensorReadingPayload.data.thingId, ctx.thingPayload.data.id);
  assert.equal(ctx.sensorReadingPayload.data.value, 0.42);
  assert.equal(ctx.sensorReadingPayload.data.quality, "good");
  assert.equal(typeof ctx.sensorReadingPayload.data.observedAt, "string");

  ctx.deviceCommandCreate = await runCliCapture(["iot-device", ctx.iotDevicePayload.data.id, "commands", "add", "Restart gateway", "--thing", ctx.thingPayload.data.id, "--command-type", "restart", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.deviceCommandCreate.code, CLI_EXIT_OK, ctx.deviceCommandCreate.stderr || ctx.deviceCommandCreate.stdout);
  ctx.deviceCommandPayload = JSON.parse(ctx.deviceCommandCreate.stdout) as { data: { id: string; title: string; deviceId: string; thingId: string; commandType: string; status: string; requestedAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.deviceCommandPayload.meta.invokedCommand, "iot-device");
  assert.equal(ctx.deviceCommandPayload.meta.collection, "device_commands");
  assert.equal(ctx.deviceCommandPayload.meta.action, "create");
  assert.equal(ctx.deviceCommandPayload.data.title, "Restart gateway");
  assert.equal(ctx.deviceCommandPayload.data.deviceId, ctx.iotDevicePayload.data.id);
  assert.equal(ctx.deviceCommandPayload.data.thingId, ctx.thingPayload.data.id);
  assert.equal(ctx.deviceCommandPayload.data.commandType, "restart");
  assert.equal(ctx.deviceCommandPayload.data.status, "draft");
  assert.equal(typeof ctx.deviceCommandPayload.data.requestedAt, "string");

  ctx.thingTimeline = await runCliCapture(["thing", ctx.thingPayload.data.id, "timeline", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.thingTimeline.code, CLI_EXIT_OK, ctx.thingTimeline.stderr || ctx.thingTimeline.stdout);
  ctx.thingTimelinePayload = JSON.parse(ctx.thingTimeline.stdout) as {
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
  assert.equal(ctx.thingTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.thingTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.thingTimelinePayload.data.semanticView.id, "thing.timeline");
  assert.equal(ctx.thingTimelinePayload.data.semanticView.systemId, "iot");
  assert.equal(ctx.thingTimelinePayload.data.materializedView.subject.id, ctx.thingPayload.data.id);
  assert.equal(ctx.thingTimelinePayload.data.materializedView.subject.label, "Press IoT thing");
  assert.equal(ctx.thingTimelinePayload.data.materializedView.company?.id, ctx.companyPayload.data.id);
  assert.equal(ctx.thingTimelinePayload.data.materializedView.summary.devices, 1);
  assert.equal(ctx.thingTimelinePayload.data.materializedView.summary.onlineDevices, 1);
  assert.equal(ctx.thingTimelinePayload.data.materializedView.summary.readings, 1);
  assert.equal(ctx.thingTimelinePayload.data.materializedView.summary.commands, 1);
  assert.equal(ctx.thingTimelinePayload.data.materializedView.summary.pendingCommands, 1);
  assert.equal(ctx.thingTimelinePayload.data.materializedView.itemCount >= 5, true);
  assert.equal(ctx.thingTimelinePayload.data.materializedView.items.some((item) => item.kind === "sensor_reading" && item.label === "vibration"), true);

  ctx.constructionProjectCreate = await runCliCapture(["construction-project", "create", "Lab buildout", "--company", ctx.companyPayload.data.id, "--customer", ctx.companyPayload.data.id, "--budget-cents", "25000000", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.constructionProjectCreate.code, CLI_EXIT_OK, ctx.constructionProjectCreate.stderr || ctx.constructionProjectCreate.stdout);
  ctx.constructionProjectPayload = JSON.parse(ctx.constructionProjectCreate.stdout) as { data: { id: string; title: string; companyId: string; customerCompanyId: string; budgetCents: number; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.constructionProjectPayload.meta.invokedCommand, "construction-project");
  assert.equal(ctx.constructionProjectPayload.meta.collection, "construction_projects");
  assert.equal(ctx.constructionProjectPayload.meta.action, "create");
  assert.equal(ctx.constructionProjectPayload.data.title, "Lab buildout");
  assert.equal(ctx.constructionProjectPayload.data.companyId, ctx.companyPayload.data.id);
  assert.equal(ctx.constructionProjectPayload.data.customerCompanyId, ctx.companyPayload.data.id);
  assert.equal(ctx.constructionProjectPayload.data.budgetCents, 25000000);
  assert.equal(ctx.constructionProjectPayload.data.status, "planning");

  ctx.constructionSiteCreate = await runCliCapture(["construction-project", ctx.constructionProjectPayload.data.id, "sites", "add", "Lab site", "--property-listing-id", ctx.propertyPayload.data.id, "--superintendent-employee-id", ctx.employeePayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.constructionSiteCreate.code, CLI_EXIT_OK, ctx.constructionSiteCreate.stderr || ctx.constructionSiteCreate.stdout);
  ctx.constructionSitePayload = JSON.parse(ctx.constructionSiteCreate.stdout) as { data: { id: string; name: string; projectId: string; propertyListingId: string; superintendentEmployeeId: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.constructionSitePayload.meta.invokedCommand, "construction-project");
  assert.equal(ctx.constructionSitePayload.meta.collection, "construction_sites");
  assert.equal(ctx.constructionSitePayload.meta.action, "create");
  assert.equal(ctx.constructionSitePayload.data.name, "Lab site");
  assert.equal(ctx.constructionSitePayload.data.projectId, ctx.constructionProjectPayload.data.id);
  assert.equal(ctx.constructionSitePayload.data.propertyListingId, ctx.propertyPayload.data.id);
  assert.equal(ctx.constructionSitePayload.data.superintendentEmployeeId, ctx.employeePayload.data.id);
  assert.equal(ctx.constructionSitePayload.data.status, "planned");

  ctx.constructionRfiCreate = await runCliCapture(["construction-project", ctx.constructionProjectPayload.data.id, "rfis", "add", "Ventilation clarification", "--site", ctx.constructionSitePayload.data.id, "--number", "RFI-001", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.constructionRfiCreate.code, CLI_EXIT_OK, ctx.constructionRfiCreate.stderr || ctx.constructionRfiCreate.stdout);
  ctx.constructionRfiPayload = JSON.parse(ctx.constructionRfiCreate.stdout) as { data: { id: string; title: string; projectId: string; siteId: string; number: string; status: string; requestedAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.constructionRfiPayload.meta.invokedCommand, "construction-project");
  assert.equal(ctx.constructionRfiPayload.meta.collection, "construction_rfis");
  assert.equal(ctx.constructionRfiPayload.meta.action, "create");
  assert.equal(ctx.constructionRfiPayload.data.title, "Ventilation clarification");
  assert.equal(ctx.constructionRfiPayload.data.projectId, ctx.constructionProjectPayload.data.id);
  assert.equal(ctx.constructionRfiPayload.data.siteId, ctx.constructionSitePayload.data.id);
  assert.equal(ctx.constructionRfiPayload.data.number, "RFI-001");
  assert.equal(ctx.constructionRfiPayload.data.status, "open");
  assert.equal(typeof ctx.constructionRfiPayload.data.requestedAt, "string");

  ctx.changeOrderCreate = await runCliCapture(["construction-project", ctx.constructionProjectPayload.data.id, "change-orders", "add", "Ventilation upgrade", "--site", ctx.constructionSitePayload.data.id, "--rfi", ctx.constructionRfiPayload.data.id, "--amount-cents", "1200000", "--schedule-impact-days", "5", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.changeOrderCreate.code, CLI_EXIT_OK, ctx.changeOrderCreate.stderr || ctx.changeOrderCreate.stdout);
  ctx.changeOrderPayload = JSON.parse(ctx.changeOrderCreate.stdout) as { data: { id: string; title: string; projectId: string; siteId: string; relatedRfiId: string; amountCents: number; scheduleImpactDays: number; status: string; submittedAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.changeOrderPayload.meta.invokedCommand, "construction-project");
  assert.equal(ctx.changeOrderPayload.meta.collection, "construction_change_orders");
  assert.equal(ctx.changeOrderPayload.meta.action, "create");
  assert.equal(ctx.changeOrderPayload.data.title, "Ventilation upgrade");
  assert.equal(ctx.changeOrderPayload.data.projectId, ctx.constructionProjectPayload.data.id);
  assert.equal(ctx.changeOrderPayload.data.siteId, ctx.constructionSitePayload.data.id);
  assert.equal(ctx.changeOrderPayload.data.relatedRfiId, ctx.constructionRfiPayload.data.id);
  assert.equal(ctx.changeOrderPayload.data.amountCents, 1200000);
  assert.equal(ctx.changeOrderPayload.data.scheduleImpactDays, 5);
  assert.equal(ctx.changeOrderPayload.data.status, "draft");
  assert.equal(typeof ctx.changeOrderPayload.data.submittedAt, "string");

  ctx.constructionTimeline = await runCliCapture(["construction-project", ctx.constructionProjectPayload.data.id, "timeline", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.constructionTimeline.code, CLI_EXIT_OK, ctx.constructionTimeline.stderr || ctx.constructionTimeline.stdout);
  ctx.constructionTimelinePayload = JSON.parse(ctx.constructionTimeline.stdout) as {
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
  assert.equal(ctx.constructionTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.constructionTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.constructionTimelinePayload.data.semanticView.id, "construction_project.timeline");
  assert.equal(ctx.constructionTimelinePayload.data.semanticView.systemId, "construction");
  assert.equal(ctx.constructionTimelinePayload.data.materializedView.subject.id, ctx.constructionProjectPayload.data.id);
  assert.equal(ctx.constructionTimelinePayload.data.materializedView.subject.label, "Lab buildout");
  assert.equal(ctx.constructionTimelinePayload.data.materializedView.company?.id, ctx.companyPayload.data.id);
  assert.equal(ctx.constructionTimelinePayload.data.materializedView.customerCompany?.id, ctx.companyPayload.data.id);
  assert.equal(ctx.constructionTimelinePayload.data.materializedView.summary.sites, 1);
  assert.equal(ctx.constructionTimelinePayload.data.materializedView.summary.rfis, 1);
  assert.equal(ctx.constructionTimelinePayload.data.materializedView.summary.openRfis, 1);
  assert.equal(ctx.constructionTimelinePayload.data.materializedView.summary.changeOrders, 1);
  assert.equal(ctx.constructionTimelinePayload.data.materializedView.summary.approvedChangeOrders, 0);
  assert.equal(ctx.constructionTimelinePayload.data.materializedView.summary.changeOrderAmountCents, 1200000);
  assert.equal(ctx.constructionTimelinePayload.data.materializedView.itemCount >= 6, true);
  assert.equal(ctx.constructionTimelinePayload.data.materializedView.items.some((item) => item.kind === "construction_change_order" && item.label === "Ventilation upgrade"), true);

  ctx.contactCreate = await runCliCapture(["db", "contact", "create", "--set", `companyId=${ctx.companyPayload.data.id}`, "--set", `accountId=${ctx.accountPayload.data.id}`, "--set", "firstName=Ada", "--set", "lastName=Buyer", "--set", "email=ada@example.test", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.contactCreate.code, CLI_EXIT_OK, ctx.contactCreate.stderr || ctx.contactCreate.stdout);
  ctx.contactPayload = JSON.parse(ctx.contactCreate.stdout) as { data: { id: string; companyId: string; accountId: string; firstName: string; lastName: string; email: string }; meta: { collection: string; action: string } };
  assert.equal(ctx.contactPayload.meta.collection, "contacts");
  assert.equal(ctx.contactPayload.data.companyId, ctx.companyPayload.data.id);
  assert.equal(ctx.contactPayload.data.accountId, ctx.accountPayload.data.id);
  assert.equal(ctx.contactPayload.data.firstName, "Ada");

  ctx.activityCreate = await runCliCapture(["db", "activity", "create", "--set", `companyId=${ctx.companyPayload.data.id}`, "--set", `accountId=${ctx.accountPayload.data.id}`, "--set", `dealId=${ctx.dealPayload.data.id}`, "--set", "kind=demo", "--set", "subject=Demo call", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.activityCreate.code, CLI_EXIT_OK);
  ctx.activityPayload = JSON.parse(ctx.activityCreate.stdout) as { data: { id: string; companyId: string; accountId: string; dealId: string; kind: string; subject: string }; meta: { collection: string; action: string } };
  assert.equal(ctx.activityPayload.meta.collection, "activities");
  assert.equal(ctx.activityPayload.data.accountId, ctx.accountPayload.data.id);
  assert.equal(ctx.activityPayload.data.dealId, ctx.dealPayload.data.id);
  assert.equal(ctx.activityPayload.data.kind, "demo");

  ctx.accountEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Account discovery note", "--kind", "document", "--collection-name", "accounts", "--record-id", ctx.accountPayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.accountEvidenceSourceCreate.code, CLI_EXIT_OK);
  ctx.accountEvidenceSourcePayload = JSON.parse(ctx.accountEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(ctx.accountEvidenceSourcePayload.data.collectionName, "accounts");
  assert.equal(ctx.accountEvidenceSourcePayload.data.recordId, ctx.accountPayload.data.id);

  ctx.accountGapCreate = await runCliCapture(["quality-gap", "create", "Missing account owner", "--target-collection", "accounts", "--target-id", ctx.accountPayload.data.id, "--gap-kind", "missing", "--evidence-source-id", ctx.accountEvidenceSourcePayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.accountGapCreate.code, CLI_EXIT_OK);
  ctx.accountGapPayload = JSON.parse(ctx.accountGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(ctx.accountGapPayload.data.targetCollection, "accounts");
  assert.equal(ctx.accountGapPayload.data.targetId, ctx.accountPayload.data.id);
  assert.equal(ctx.accountGapPayload.data.gapKind, "missing");

  ctx.crmAccountOverview = await runCliCapture(["crm", "account", ctx.accountPayload.data.id, "overview", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.crmAccountOverview.code, CLI_EXIT_OK);
  ctx.crmAccountOverviewPayload = JSON.parse(ctx.crmAccountOverview.stdout) as {
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
  assert.equal(ctx.crmAccountOverviewPayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.crmAccountOverviewPayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.crmAccountOverviewPayload.data.semanticView.id, "crm.account.overview");
  assert.equal(ctx.crmAccountOverviewPayload.data.semanticView.systemId, "crm");
  assert.equal(ctx.crmAccountOverviewPayload.data.materializedView.subject.id, ctx.accountPayload.data.id);
  assert.equal(ctx.crmAccountOverviewPayload.data.materializedView.subject.label, "Acme Account");
  assert.equal(ctx.crmAccountOverviewPayload.data.materializedView.company?.id, ctx.companyPayload.data.id);
  assert.equal(ctx.crmAccountOverviewPayload.data.materializedView.summary.deals, 1);
  assert.equal(ctx.crmAccountOverviewPayload.data.materializedView.summary.openDealValueCents, 2500);
  assert.equal(ctx.crmAccountOverviewPayload.data.materializedView.summary.contacts, 1);
  assert.equal(ctx.crmAccountOverviewPayload.data.materializedView.summary.activities, 1);
  assert.equal(ctx.crmAccountOverviewPayload.data.materializedView.partial, true);
  assert.equal(ctx.crmAccountOverviewPayload.data.materializedView.records.deals.some((record) => record.id === ctx.dealPayload.data.id), true);
  assert.equal(ctx.crmAccountOverviewPayload.data.materializedView.records.contacts.some((record) => record.id === ctx.contactPayload.data.id), true);
  assert.equal(ctx.crmAccountOverviewPayload.data.materializedView.records.activities.some((record) => record.id === ctx.activityPayload.data.id), true);
  assert.equal(ctx.crmAccountOverviewPayload.data.materializedView.records.evidence.some((record) => record.id === ctx.accountEvidenceSourcePayload.data.id), true);
  assert.equal(ctx.crmAccountOverviewPayload.data.materializedView.gaps.some((gap) => gap.id === ctx.accountGapPayload.data.id && gap.gapKind === "missing"), true);

  ctx.billingCustomer = await runCliCapture(["db", "billing_customer", "create", "Acme Billing", "--company-id", ctx.companyPayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.billingCustomer.code, CLI_EXIT_OK);
  ctx.billingCustomerPayload = JSON.parse(ctx.billingCustomer.stdout) as { data: { id: string } };
  ctx.invoiceCreate = await runCliCapture(["invoice", "create", "INV-001", "--billing-customer", ctx.billingCustomerPayload.data.id, "--total-cents", "9900", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.invoiceCreate.code, CLI_EXIT_OK);
  ctx.invoicePayload = JSON.parse(ctx.invoiceCreate.stdout) as { data: { id: string; number: string; billingCustomerId: string; totalCents: number; status: string }; meta: { collection: string; action: string } };
  assert.equal(ctx.invoicePayload.meta.collection, "invoices");
  assert.equal(ctx.invoicePayload.data.number, "INV-001");
  assert.equal(ctx.invoicePayload.data.billingCustomerId, ctx.billingCustomerPayload.data.id);
  assert.equal(ctx.invoicePayload.data.totalCents, 9900);
  assert.equal(ctx.invoicePayload.data.status, "draft");

  ctx.paymentCreate = await runCliCapture(["payment", "create", "--billing-customer", ctx.billingCustomerPayload.data.id, "--invoice-id", ctx.invoicePayload.data.id, "--amount-cents", "9900", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.paymentCreate.code, CLI_EXIT_OK);
  ctx.paymentPayload = JSON.parse(ctx.paymentCreate.stdout) as { data: { id: string; billingCustomerId: string; invoiceId: string; amountCents: number; status: string }; meta: { collection: string; action: string } };
  assert.equal(ctx.paymentPayload.meta.collection, "payment_intents");
  assert.equal(ctx.paymentPayload.data.billingCustomerId, ctx.billingCustomerPayload.data.id);
  assert.equal(ctx.paymentPayload.data.invoiceId, ctx.invoicePayload.data.id);
  assert.equal(ctx.paymentPayload.data.amountCents, 9900);
  assert.equal(ctx.paymentPayload.data.status, "requires_payment_method");

  ctx.invoiceEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Invoice import note", "--kind", "document", "--collection-name", "invoices", "--record-id", ctx.invoicePayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.invoiceEvidenceSourceCreate.code, CLI_EXIT_OK);
  ctx.invoiceEvidenceSourcePayload = JSON.parse(ctx.invoiceEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(ctx.invoiceEvidenceSourcePayload.data.collectionName, "invoices");
  assert.equal(ctx.invoiceEvidenceSourcePayload.data.recordId, ctx.invoicePayload.data.id);

  ctx.invoiceGapCreate = await runCliCapture(["quality-gap", "create", "Missing remittance advice", "--target-collection", "invoices", "--target-id", ctx.invoicePayload.data.id, "--gap-kind", "missing", "--evidence-source-id", ctx.invoiceEvidenceSourcePayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.invoiceGapCreate.code, CLI_EXIT_OK);
  ctx.invoiceGapPayload = JSON.parse(ctx.invoiceGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(ctx.invoiceGapPayload.data.targetCollection, "invoices");
  assert.equal(ctx.invoiceGapPayload.data.targetId, ctx.invoicePayload.data.id);

  ctx.invoiceList = await runCliCapture(["invoice", "list", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.invoiceList.code, CLI_EXIT_OK);
  ctx.invoiceListPayload = JSON.parse(ctx.invoiceList.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: {
        summary: { invoices: number; billingCustomers: number; invoiceTotalCents: number; payments: number; paymentTotalCents: number; evidenceSources: number; qualityGaps: number };
        records: { invoices: Array<{ id: string }>; billingCustomers: Array<{ id: string }>; payments: Array<{ id: string }>; evidence: Array<{ id: string }> };
        gaps: Array<{ id: string; gapKind: string }>;
        partial: boolean;
      };
    };
  };
  assert.equal(ctx.invoiceListPayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.invoiceListPayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.invoiceListPayload.data.semanticView.id, "invoice.list");
  assert.equal(ctx.invoiceListPayload.data.semanticView.systemId, "erp");
  assert.equal(ctx.invoiceListPayload.data.materializedView.summary.invoices, 1);
  assert.equal(ctx.invoiceListPayload.data.materializedView.summary.billingCustomers, 1);
  assert.equal(ctx.invoiceListPayload.data.materializedView.summary.invoiceTotalCents, 9900);
  assert.equal(ctx.invoiceListPayload.data.materializedView.summary.payments, 1);
  assert.equal(ctx.invoiceListPayload.data.materializedView.summary.paymentTotalCents, 9900);
  assert.equal(ctx.invoiceListPayload.data.materializedView.summary.evidenceSources, 1);
  assert.equal(ctx.invoiceListPayload.data.materializedView.summary.qualityGaps, 1);
  assert.equal(ctx.invoiceListPayload.data.materializedView.partial, true);
  assert.equal(ctx.invoiceListPayload.data.materializedView.records.invoices.some((record) => record.id === ctx.invoicePayload.data.id), true);
  assert.equal(ctx.invoiceListPayload.data.materializedView.records.billingCustomers.some((record) => record.id === ctx.billingCustomerPayload.data.id), true);
  assert.equal(ctx.invoiceListPayload.data.materializedView.records.payments.some((record) => record.id === ctx.paymentPayload.data.id), true);
  assert.equal(ctx.invoiceListPayload.data.materializedView.records.evidence.some((record) => record.id === ctx.invoiceEvidenceSourcePayload.data.id), true);
  assert.equal(ctx.invoiceListPayload.data.materializedView.gaps.some((gap) => gap.id === ctx.invoiceGapPayload.data.id && gap.gapKind === "missing"), true);

  ctx.companyEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Company import note", "--kind", "document", "--collection-name", "companies", "--record-id", ctx.companyPayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.companyEvidenceSourceCreate.code, CLI_EXIT_OK);
  ctx.companyEvidenceSourcePayload = JSON.parse(ctx.companyEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(ctx.companyEvidenceSourcePayload.data.collectionName, "companies");
  assert.equal(ctx.companyEvidenceSourcePayload.data.recordId, ctx.companyPayload.data.id);

  ctx.companyGapCreate = await runCliCapture(["quality-gap", "create", "Missing tax ID", "--target-collection", "companies", "--target-id", ctx.companyPayload.data.id, "--gap-kind", "missing", "--evidence-source-id", ctx.companyEvidenceSourcePayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.companyGapCreate.code, CLI_EXIT_OK);
  ctx.companyGapPayload = JSON.parse(ctx.companyGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(ctx.companyGapPayload.data.targetCollection, "companies");
  assert.equal(ctx.companyGapPayload.data.targetId, ctx.companyPayload.data.id);
  assert.equal(ctx.companyGapPayload.data.gapKind, "missing");

  ctx.erpCompanyOverview = await runCliCapture(["erp", "company", ctx.companyPayload.data.id, "overview", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.erpCompanyOverview.code, CLI_EXIT_OK);
  ctx.erpCompanyOverviewPayload = JSON.parse(ctx.erpCompanyOverview.stdout) as {
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
  assert.equal(ctx.erpCompanyOverviewPayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.erpCompanyOverviewPayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.erpCompanyOverviewPayload.data.semanticView.id, "erp.company.overview");
  assert.equal(ctx.erpCompanyOverviewPayload.data.semanticView.systemId, "erp");
  assert.equal(ctx.erpCompanyOverviewPayload.data.materializedView.subject.id, ctx.companyPayload.data.id);
  assert.equal(ctx.erpCompanyOverviewPayload.data.materializedView.subject.label, "Acme Corp");
  assert.equal(ctx.erpCompanyOverviewPayload.data.materializedView.summary.accounts, 1);
  assert.equal(ctx.erpCompanyOverviewPayload.data.materializedView.summary.deals, 1);
  assert.equal(ctx.erpCompanyOverviewPayload.data.materializedView.summary.openDealValueCents, 2500);
  assert.equal(ctx.erpCompanyOverviewPayload.data.materializedView.summary.billingCustomers, 1);
  assert.equal(ctx.erpCompanyOverviewPayload.data.materializedView.summary.invoices, 1);
  assert.equal(ctx.erpCompanyOverviewPayload.data.materializedView.summary.invoiceTotalCents, 9900);
  assert.equal(ctx.erpCompanyOverviewPayload.data.materializedView.summary.payments, 1);
  assert.equal(ctx.erpCompanyOverviewPayload.data.materializedView.summary.paymentTotalCents, 9900);
  assert.equal(ctx.erpCompanyOverviewPayload.data.materializedView.partial, true);
  assert.equal(ctx.erpCompanyOverviewPayload.data.materializedView.records.accounts.some((record) => record.id === ctx.accountPayload.data.id), true);
  assert.equal(ctx.erpCompanyOverviewPayload.data.materializedView.records.deals.some((record) => record.id === ctx.dealPayload.data.id), true);
  assert.equal(ctx.erpCompanyOverviewPayload.data.materializedView.records.invoices.some((record) => record.id === ctx.invoicePayload.data.id), true);
  assert.equal(ctx.erpCompanyOverviewPayload.data.materializedView.records.payments.some((record) => record.id === ctx.paymentPayload.data.id), true);
  assert.equal(ctx.erpCompanyOverviewPayload.data.materializedView.records.evidence.some((record) => record.id === ctx.companyEvidenceSourcePayload.data.id), true);
  assert.equal(ctx.erpCompanyOverviewPayload.data.materializedView.gaps.some((gap) => gap.id === ctx.companyGapPayload.data.id && gap.gapKind === "missing"), true);

  ctx.legalCaseCreate = await runCliCapture(["case", "create", "Smith v Jones", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.legalCaseCreate.code, CLI_EXIT_OK);
  ctx.legalCasePayload = JSON.parse(ctx.legalCaseCreate.stdout) as { data: { id: string; title: string; status: string }; meta: { collection: string; action: string } };
  assert.equal(ctx.legalCasePayload.meta.collection, "legal_cases");
  assert.equal(ctx.legalCasePayload.data.title, "Smith v Jones");
  assert.equal(ctx.legalCasePayload.data.status, "open");

  ctx.caseEvidenceCreate = await runCliCapture(["case", ctx.legalCasePayload.data.id, "evidence", "add", "Signed contract", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.caseEvidenceCreate.code, CLI_EXIT_OK);
  ctx.caseEvidencePayload = JSON.parse(ctx.caseEvidenceCreate.stdout) as { data: { title: string; caseId: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.caseEvidencePayload.meta.invokedCommand, "case");
  assert.equal(ctx.caseEvidencePayload.meta.collection, "case_evidence");
  assert.equal(ctx.caseEvidencePayload.data.title, "Signed contract");
  assert.equal(ctx.caseEvidencePayload.data.caseId, ctx.legalCasePayload.data.id);

  ctx.caseEvidenceList = await runCliCapture(["case", ctx.legalCasePayload.data.id, "evidence", "list", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.caseEvidenceList.code, CLI_EXIT_OK);
  ctx.caseEvidenceListPayload = JSON.parse(ctx.caseEvidenceList.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: {
        subject: { id: string; label: string };
        summary: { evidenceItems: number };
        records: { evidenceItems: Array<{ title: string; caseId: string }> };
        items: Array<{ kind: string; label: string }>;
      };
    };
    meta: { professionalRecords: boolean; semanticView: boolean };
  };
  assert.equal(ctx.caseEvidenceListPayload.meta.professionalRecords, true);
  assert.equal(ctx.caseEvidenceListPayload.meta.semanticView, true);
  assert.equal(ctx.caseEvidenceListPayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.caseEvidenceListPayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.caseEvidenceListPayload.data.semanticView.id, "case.evidence");
  assert.equal(ctx.caseEvidenceListPayload.data.semanticView.systemId, "legal");
  assert.equal(ctx.caseEvidenceListPayload.data.materializedView.subject.id, ctx.legalCasePayload.data.id);
  assert.equal(ctx.caseEvidenceListPayload.data.materializedView.summary.evidenceItems, 1);
  assert.equal(ctx.caseEvidenceListPayload.data.materializedView.records.evidenceItems[0]?.caseId, ctx.legalCasePayload.data.id);
  assert.equal(ctx.caseEvidenceListPayload.data.materializedView.items.some((item) => item.kind === "case_evidence" && item.label === "Signed contract"), true);

  ctx.caseClientCreate = await runCliCapture(["case", ctx.legalCasePayload.data.id, "client", "add", "Smith Client", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.caseClientCreate.code, CLI_EXIT_OK, ctx.caseClientCreate.stderr || ctx.caseClientCreate.stdout);
  ctx.caseClientPayload = JSON.parse(ctx.caseClientCreate.stdout) as { data: { id: string; displayName: string; caseId: string; role: string; status: string; conflictStatus: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.caseClientPayload.meta.invokedCommand, "case");
  assert.equal(ctx.caseClientPayload.meta.collection, "legal_clients");
  assert.equal(ctx.caseClientPayload.meta.action, "create");
  assert.equal(ctx.caseClientPayload.data.displayName, "Smith Client");
  assert.equal(ctx.caseClientPayload.data.caseId, ctx.legalCasePayload.data.id);
  assert.equal(ctx.caseClientPayload.data.role, "client");
  assert.equal(ctx.caseClientPayload.data.status, "active");
  assert.equal(ctx.caseClientPayload.data.conflictStatus, "unknown");

  ctx.caseClientsList = await runCliCapture(["case", ctx.legalCasePayload.data.id, "clients", "list", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.caseClientsList.code, CLI_EXIT_OK);
  ctx.caseClientsPayload = JSON.parse(ctx.caseClientsList.stdout) as { data: Array<{ id: string; displayName: string; caseId: string }>; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.caseClientsPayload.meta.invokedCommand, "case");
  assert.equal(ctx.caseClientsPayload.meta.collection, "legal_clients");
  assert.equal(ctx.caseClientsPayload.meta.action, "list");
  assert.equal(ctx.caseClientsPayload.data.some((record) => record.id === ctx.caseClientPayload.data.id && record.caseId === ctx.legalCasePayload.data.id), true);

  ctx.directLegalClientCreate = await runCliCapture(["legal-client", "add", "--case", ctx.legalCasePayload.data.id, "--display-name", "Direct Legal Client", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.directLegalClientCreate.code, CLI_EXIT_OK, ctx.directLegalClientCreate.stderr || ctx.directLegalClientCreate.stdout);
  ctx.directLegalClientPayload = JSON.parse(ctx.directLegalClientCreate.stdout) as { data: { displayName: string; caseId: string }; meta: { collection: string; invokedCommand: string } };
  assert.equal(ctx.directLegalClientPayload.meta.invokedCommand, "legal-client");
  assert.equal(ctx.directLegalClientPayload.meta.collection, "legal_clients");
  assert.equal(ctx.directLegalClientPayload.data.caseId, ctx.legalCasePayload.data.id);

  ctx.legalEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Contract file", "--kind", "file", "--collection-name", "legal_cases", "--record-id", ctx.legalCasePayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.legalEvidenceSourceCreate.code, CLI_EXIT_OK);
  ctx.legalEvidenceSourcePayload = JSON.parse(ctx.legalEvidenceSourceCreate.stdout) as { data: { id: string; label: string; collectionName: string; recordId: string } };
  assert.equal(ctx.legalEvidenceSourcePayload.data.collectionName, "legal_cases");
  assert.equal(ctx.legalEvidenceSourcePayload.data.recordId, ctx.legalCasePayload.data.id);

  ctx.legalGapCreate = await runCliCapture(["quality-gap", "create", "Missing filing deadline", "--target-collection", "legal_cases", "--target-id", ctx.legalCasePayload.data.id, "--gap-kind", "unverified", "--evidence-source-id", ctx.legalEvidenceSourcePayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.legalGapCreate.code, CLI_EXIT_OK);
  ctx.legalGapPayload = JSON.parse(ctx.legalGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(ctx.legalGapPayload.data.targetCollection, "legal_cases");
  assert.equal(ctx.legalGapPayload.data.targetId, ctx.legalCasePayload.data.id);
  assert.equal(ctx.legalGapPayload.data.gapKind, "unverified");

  ctx.caseTimeline = await runCliCapture(["case", ctx.legalCasePayload.data.id, "timeline", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.caseTimeline.code, CLI_EXIT_OK);
  ctx.caseTimelinePayload = JSON.parse(ctx.caseTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: { subject: { id: string; label: string }; itemCount: number; partial: boolean; items: Array<{ kind: string; recordId: string; label: string }>; gaps: Array<{ id: string; gapKind: string }> };
    };
  };
  assert.equal(ctx.caseTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.caseTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.caseTimelinePayload.data.semanticView.id, "case.timeline");
  assert.equal(ctx.caseTimelinePayload.data.semanticView.systemId, "legal");
  assert.equal(ctx.caseTimelinePayload.data.materializedView.subject.id, ctx.legalCasePayload.data.id);
  assert.equal(ctx.caseTimelinePayload.data.materializedView.subject.label, "Smith v Jones");
  assert.equal(ctx.caseTimelinePayload.data.materializedView.itemCount >= 6, true);
  assert.equal(ctx.caseTimelinePayload.data.materializedView.partial, true);
  assert.equal(ctx.caseTimelinePayload.data.materializedView.items.some((item) => item.kind === "legal_client" && item.label === "Smith Client"), true);
  assert.equal(ctx.caseTimelinePayload.data.materializedView.items.some((item) => item.kind === "case_evidence" && item.label === "Signed contract"), true);
  assert.equal(ctx.caseTimelinePayload.data.materializedView.items.some((item) => item.kind === "evidence" && item.recordId === ctx.legalEvidenceSourcePayload.data.id), true);
  assert.equal(ctx.caseTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === ctx.legalGapPayload.data.id && gap.gapKind === "unverified"), true);

  ctx.serviceCreate = await runCliCapture(["service", "create", "API", "--company", ctx.companyPayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.serviceCreate.code, CLI_EXIT_OK);
  ctx.servicePayload = JSON.parse(ctx.serviceCreate.stdout) as { data: { id: string; name: string; companyId: string; status: string }; meta: { collection: string; action: string } };
  assert.equal(ctx.servicePayload.meta.collection, "services");
  assert.equal(ctx.servicePayload.data.name, "API");
  assert.equal(ctx.servicePayload.data.companyId, ctx.companyPayload.data.id);
  assert.equal(ctx.servicePayload.data.status, "active");

  ctx.incidentCreate = await runCliCapture(["incident", "create", "Outage", "--service", ctx.servicePayload.data.id, "--company-id", ctx.companyPayload.data.id, "--severity", "sev2", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.incidentCreate.code, CLI_EXIT_OK);
  ctx.incidentPayload = JSON.parse(ctx.incidentCreate.stdout) as { data: { title: string; serviceId: string; severity: string; status: string }; meta: { collection: string; action: string } };
  assert.equal(ctx.incidentPayload.meta.collection, "incidents");
  assert.equal(ctx.incidentPayload.data.title, "Outage");
  assert.equal(ctx.incidentPayload.data.serviceId, ctx.servicePayload.data.id);
  assert.equal(ctx.incidentPayload.data.severity, "sev2");
  assert.equal(ctx.incidentPayload.data.status, "open");

  ctx.serviceIncidents = await runCliCapture(["service", ctx.servicePayload.data.id, "incidents", "list", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.serviceIncidents.code, CLI_EXIT_OK);
  ctx.serviceIncidentsPayload = JSON.parse(ctx.serviceIncidents.stdout) as { data: Array<{ title: string; serviceId: string }>; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.serviceIncidentsPayload.meta.invokedCommand, "service");
  assert.equal(ctx.serviceIncidentsPayload.meta.collection, "incidents");
  assert.equal(ctx.serviceIncidentsPayload.data.length, 1);
  assert.equal(ctx.serviceIncidentsPayload.data[0]?.serviceId, ctx.servicePayload.data.id);

  ctx.serviceEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Runbook", "--kind", "document", "--collection-name", "services", "--record-id", ctx.servicePayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.serviceEvidenceSourceCreate.code, CLI_EXIT_OK);
  ctx.serviceEvidenceSourcePayload = JSON.parse(ctx.serviceEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(ctx.serviceEvidenceSourcePayload.data.collectionName, "services");
  assert.equal(ctx.serviceEvidenceSourcePayload.data.recordId, ctx.servicePayload.data.id);

  ctx.serviceGapCreate = await runCliCapture(["quality-gap", "create", "Missing SLO", "--target-collection", "services", "--target-id", ctx.servicePayload.data.id, "--gap-kind", "missing", "--evidence-source-id", ctx.serviceEvidenceSourcePayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.serviceGapCreate.code, CLI_EXIT_OK);
  ctx.serviceGapPayload = JSON.parse(ctx.serviceGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(ctx.serviceGapPayload.data.targetCollection, "services");
  assert.equal(ctx.serviceGapPayload.data.targetId, ctx.servicePayload.data.id);
  assert.equal(ctx.serviceGapPayload.data.gapKind, "missing");

  ctx.serviceTimeline = await runCliCapture(["service", ctx.servicePayload.data.id, "timeline", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.serviceTimeline.code, CLI_EXIT_OK);
  ctx.serviceTimelinePayload = JSON.parse(ctx.serviceTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: { subject: { id: string; label: string }; itemCount: number; partial: boolean; items: Array<{ kind: string; recordId: string; label: string }>; gaps: Array<{ id: string; gapKind: string }> };
    };
  };
  assert.equal(ctx.serviceTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.serviceTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.serviceTimelinePayload.data.semanticView.id, "service.timeline");
  assert.equal(ctx.serviceTimelinePayload.data.semanticView.systemId, "ops");
  assert.equal(ctx.serviceTimelinePayload.data.materializedView.subject.id, ctx.servicePayload.data.id);
  assert.equal(ctx.serviceTimelinePayload.data.materializedView.subject.label, "API");
  assert.equal(ctx.serviceTimelinePayload.data.materializedView.itemCount >= 4, true);
  assert.equal(ctx.serviceTimelinePayload.data.materializedView.partial, true);
  assert.equal(ctx.serviceTimelinePayload.data.materializedView.items.some((item) => item.kind === "incident" && item.label === "Outage"), true);
  assert.equal(ctx.serviceTimelinePayload.data.materializedView.items.some((item) => item.kind === "evidence" && item.recordId === ctx.serviceEvidenceSourcePayload.data.id), true);
  assert.equal(ctx.serviceTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === ctx.serviceGapPayload.data.id && gap.gapKind === "missing"), true);

  ctx.studyCreate = await runCliCapture(["study", "create", "Trial A", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.studyCreate.code, CLI_EXIT_OK);
  ctx.studyPayload = JSON.parse(ctx.studyCreate.stdout) as { data: { id: string; title: string; status: string }; meta: { collection: string; action: string } };
  assert.equal(ctx.studyPayload.meta.collection, "studies");
  assert.equal(ctx.studyPayload.data.title, "Trial A");
  assert.equal(ctx.studyPayload.data.status, "planned");

  ctx.participantCreate = await runCliCapture(["study", ctx.studyPayload.data.id, "participants", "add", "Subject 001", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.participantCreate.code, CLI_EXIT_OK);
  ctx.participantPayload = JSON.parse(ctx.participantCreate.stdout) as { data: { displayName: string; studyId: string; status: string; consentStatus: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.participantPayload.meta.invokedCommand, "study");
  assert.equal(ctx.participantPayload.meta.collection, "participants");
  assert.equal(ctx.participantPayload.data.displayName, "Subject 001");
  assert.equal(ctx.participantPayload.data.studyId, ctx.studyPayload.data.id);
  assert.equal(ctx.participantPayload.data.status, "screening");

  ctx.studyParticipants = await runCliCapture(["study", ctx.studyPayload.data.id, "participants", "list", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.studyParticipants.code, CLI_EXIT_OK);
  ctx.studyParticipantsPayload = JSON.parse(ctx.studyParticipants.stdout) as { data: Array<{ displayName: string; studyId: string }>; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.studyParticipantsPayload.meta.invokedCommand, "study");
  assert.equal(ctx.studyParticipantsPayload.meta.collection, "participants");
  assert.equal(ctx.studyParticipantsPayload.data.length, 1);
  assert.equal(ctx.studyParticipantsPayload.data[0]?.studyId, ctx.studyPayload.data.id);

  ctx.studyCohort = await runCliCapture(["study", ctx.studyPayload.data.id, "cohort", "list", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.studyCohort.code, CLI_EXIT_OK);
  ctx.studyCohortPayload = JSON.parse(ctx.studyCohort.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: {
        subject: { id: string; label: string };
        summary: { participants: number; screening: number; consentUnknown: number };
        records: { participants: Array<{ displayName: string; studyId: string }> };
        items: Array<{ kind: string; label: string }>;
      };
    };
    meta: { professionalRecords: boolean; semanticView: boolean };
  };
  assert.equal(ctx.studyCohortPayload.meta.professionalRecords, true);
  assert.equal(ctx.studyCohortPayload.meta.semanticView, true);
  assert.equal(ctx.studyCohortPayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.studyCohortPayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.studyCohortPayload.data.semanticView.id, "study.cohort");
  assert.equal(ctx.studyCohortPayload.data.semanticView.systemId, "research");
  assert.equal(ctx.studyCohortPayload.data.materializedView.subject.id, ctx.studyPayload.data.id);
  assert.equal(ctx.studyCohortPayload.data.materializedView.summary.participants, 1);
  assert.equal(ctx.studyCohortPayload.data.materializedView.summary.screening, 1);
  assert.equal(ctx.studyCohortPayload.data.materializedView.summary.consentUnknown, 1);
  assert.equal(ctx.studyCohortPayload.data.materializedView.records.participants[0]?.studyId, ctx.studyPayload.data.id);
  assert.equal(ctx.studyCohortPayload.data.materializedView.items.some((item) => item.kind === "participant" && item.label === "Subject 001"), true);

  ctx.sampleCreate = await runCliCapture(["sample", "create", "Tube A", "--study-id", ctx.studyPayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.sampleCreate.code, CLI_EXIT_OK);
  ctx.samplePayload = JSON.parse(ctx.sampleCreate.stdout) as { data: { id: string; label: string; studyId: string; status: string }; meta: { collection: string; action: string } };
  assert.equal(ctx.samplePayload.meta.collection, "samples");
  assert.equal(ctx.samplePayload.data.label, "Tube A");
  assert.equal(ctx.samplePayload.data.studyId, ctx.studyPayload.data.id);
  assert.equal(ctx.samplePayload.data.status, "collected");

  ctx.assayCreate = await runCliCapture(["sample", ctx.samplePayload.data.id, "assays", "add", "CBC", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.assayCreate.code, CLI_EXIT_OK);
  ctx.assayPayload = JSON.parse(ctx.assayCreate.stdout) as { data: { name: string; sampleId: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.assayPayload.meta.invokedCommand, "sample");
  assert.equal(ctx.assayPayload.meta.collection, "assays");
  assert.equal(ctx.assayPayload.data.name, "CBC");
  assert.equal(ctx.assayPayload.data.sampleId, ctx.samplePayload.data.id);
  assert.equal(ctx.assayPayload.data.status, "ordered");

  ctx.assaysAliasList = await runCliCapture(["assays", "list", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.assaysAliasList.code, CLI_EXIT_OK);
  ctx.assaysAliasPayload = JSON.parse(ctx.assaysAliasList.stdout) as { ok: boolean; data: Array<{ id: string; name: string }>; meta: { canonicalCommand: string; invokedCommand: string; collection: string; action: string } };
  assert.equal(ctx.assaysAliasPayload.ok, true);
  assert.equal(ctx.assaysAliasPayload.meta.canonicalCommand, "database");
  assert.equal(ctx.assaysAliasPayload.meta.invokedCommand, "assays");
  assert.equal(ctx.assaysAliasPayload.meta.collection, "assays");
  assert.equal(ctx.assaysAliasPayload.meta.action, "list");
  assert.equal(ctx.assaysAliasPayload.data.some((record) => record.id === ctx.assayPayload.data.id), true);

  ctx.sampleEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Sample accession", "--kind", "document", "--collection-name", "samples", "--record-id", ctx.samplePayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.sampleEvidenceSourceCreate.code, CLI_EXIT_OK);
  ctx.sampleEvidenceSourcePayload = JSON.parse(ctx.sampleEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(ctx.sampleEvidenceSourcePayload.data.collectionName, "samples");
  assert.equal(ctx.sampleEvidenceSourcePayload.data.recordId, ctx.samplePayload.data.id);

  ctx.sampleGapCreate = await runCliCapture(["quality-gap", "create", "Missing storage location", "--target-collection", "samples", "--target-id", ctx.samplePayload.data.id, "--gap-kind", "missing", "--evidence-source-id", ctx.sampleEvidenceSourcePayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.sampleGapCreate.code, CLI_EXIT_OK);
  ctx.sampleGapPayload = JSON.parse(ctx.sampleGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(ctx.sampleGapPayload.data.targetCollection, "samples");
  assert.equal(ctx.sampleGapPayload.data.targetId, ctx.samplePayload.data.id);
  assert.equal(ctx.sampleGapPayload.data.gapKind, "missing");

  ctx.sampleTimeline = await runCliCapture(["sample", ctx.samplePayload.data.id, "timeline", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.sampleTimeline.code, CLI_EXIT_OK);
  ctx.sampleTimelinePayload = JSON.parse(ctx.sampleTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: { subject: { id: string; label: string }; itemCount: number; partial: boolean; items: Array<{ kind: string; recordId: string; label: string }>; gaps: Array<{ id: string; gapKind: string }> };
    };
  };
  assert.equal(ctx.sampleTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.sampleTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.sampleTimelinePayload.data.semanticView.id, "sample.timeline");
  assert.equal(ctx.sampleTimelinePayload.data.semanticView.systemId, "labs");
  assert.equal(ctx.sampleTimelinePayload.data.materializedView.subject.id, ctx.samplePayload.data.id);
  assert.equal(ctx.sampleTimelinePayload.data.materializedView.subject.label, "Tube A");
  assert.equal(ctx.sampleTimelinePayload.data.materializedView.itemCount >= 4, true);
  assert.equal(ctx.sampleTimelinePayload.data.materializedView.partial, true);
  assert.equal(ctx.sampleTimelinePayload.data.materializedView.items.some((item) => item.kind === "assay" && item.label === "CBC"), true);
  assert.equal(ctx.sampleTimelinePayload.data.materializedView.items.some((item) => item.kind === "evidence" && item.recordId === ctx.sampleEvidenceSourcePayload.data.id), true);
  assert.equal(ctx.sampleTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === ctx.sampleGapPayload.data.id && gap.gapKind === "missing"), true);

  ctx.studyEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Protocol synopsis", "--kind", "document", "--collection-name", "studies", "--record-id", ctx.studyPayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.studyEvidenceSourceCreate.code, CLI_EXIT_OK);
  ctx.studyEvidenceSourcePayload = JSON.parse(ctx.studyEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(ctx.studyEvidenceSourcePayload.data.collectionName, "studies");
  assert.equal(ctx.studyEvidenceSourcePayload.data.recordId, ctx.studyPayload.data.id);

  ctx.studyGapCreate = await runCliCapture(["quality-gap", "create", "Missing consent audit", "--target-collection", "studies", "--target-id", ctx.studyPayload.data.id, "--gap-kind", "unverified", "--evidence-source-id", ctx.studyEvidenceSourcePayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.studyGapCreate.code, CLI_EXIT_OK);
  ctx.studyGapPayload = JSON.parse(ctx.studyGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(ctx.studyGapPayload.data.targetCollection, "studies");
  assert.equal(ctx.studyGapPayload.data.targetId, ctx.studyPayload.data.id);
  assert.equal(ctx.studyGapPayload.data.gapKind, "unverified");

  ctx.studyTimeline = await runCliCapture(["study", ctx.studyPayload.data.id, "timeline", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.studyTimeline.code, CLI_EXIT_OK);
  ctx.studyTimelinePayload = JSON.parse(ctx.studyTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: { subject: { id: string; label: string }; itemCount: number; partial: boolean; items: Array<{ kind: string; recordId: string; label: string }>; gaps: Array<{ id: string; gapKind: string }> };
    };
  };
  assert.equal(ctx.studyTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.studyTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.studyTimelinePayload.data.semanticView.id, "study.timeline");
  assert.equal(ctx.studyTimelinePayload.data.semanticView.systemId, "research");
  assert.equal(ctx.studyTimelinePayload.data.materializedView.subject.id, ctx.studyPayload.data.id);
  assert.equal(ctx.studyTimelinePayload.data.materializedView.subject.label, "Trial A");
  assert.equal(ctx.studyTimelinePayload.data.materializedView.itemCount >= 5, true);
  assert.equal(ctx.studyTimelinePayload.data.materializedView.partial, true);
  assert.equal(ctx.studyTimelinePayload.data.materializedView.items.some((item) => item.kind === "participant" && item.label === "Subject 001"), true);
  assert.equal(ctx.studyTimelinePayload.data.materializedView.items.some((item) => item.kind === "sample" && item.label === "Tube A"), true);
  assert.equal(ctx.studyTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === ctx.studyGapPayload.data.id && gap.gapKind === "unverified"), true);

  ctx.learnerCreate = await runCliCapture(["learner", "create", "Ada Learner", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.learnerCreate.code, CLI_EXIT_OK);
  ctx.learnerPayload = JSON.parse(ctx.learnerCreate.stdout) as { data: { id: string; displayName: string; status: string }; meta: { collection: string; action: string } };
  assert.equal(ctx.learnerPayload.meta.collection, "learners");
  assert.equal(ctx.learnerPayload.data.displayName, "Ada Learner");
  assert.equal(ctx.learnerPayload.data.status, "active");

  ctx.courseCreate = await runCliCapture(["course", "create", "Intro Biology", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.courseCreate.code, CLI_EXIT_OK);
  ctx.coursePayload = JSON.parse(ctx.courseCreate.stdout) as { data: { id: string; title: string; status: string }; meta: { collection: string; action: string } };
  assert.equal(ctx.coursePayload.meta.collection, "courses");
  assert.equal(ctx.coursePayload.data.title, "Intro Biology");
  assert.equal(ctx.coursePayload.data.status, "enrolled");

  ctx.lessonCreate = await runCliCapture(["course", ctx.coursePayload.data.id, "lessons", "add", "Cell basics", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.lessonCreate.code, CLI_EXIT_OK);
  ctx.lessonPayload = JSON.parse(ctx.lessonCreate.stdout) as { data: { id: string; title: string; courseId: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.lessonPayload.meta.invokedCommand, "course");
  assert.equal(ctx.lessonPayload.meta.collection, "lessons");
  assert.equal(ctx.lessonPayload.meta.action, "create");
  assert.equal(ctx.lessonPayload.data.title, "Cell basics");
  assert.equal(ctx.lessonPayload.data.courseId, ctx.coursePayload.data.id);

  ctx.courseLessons = await runCliCapture(["course", ctx.coursePayload.data.id, "lessons", "list", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.courseLessons.code, CLI_EXIT_OK);
  ctx.courseLessonsPayload = JSON.parse(ctx.courseLessons.stdout) as { data: Array<{ id: string; courseId: string; title: string }>; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.courseLessonsPayload.meta.invokedCommand, "course");
  assert.equal(ctx.courseLessonsPayload.meta.collection, "lessons");
  assert.equal(ctx.courseLessonsPayload.meta.action, "list");
  assert.equal(ctx.courseLessonsPayload.data.some((record) => record.id === ctx.lessonPayload.data.id && record.courseId === ctx.coursePayload.data.id), true);

  ctx.studySessionCreate = await runCliCapture(["course", ctx.coursePayload.data.id, "sessions", "add", "--set", "topic=Biology review", "--set", "startedAt=2026-05-17T00:00:00.000Z", "--set", "durationMinutes=45", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.studySessionCreate.code, CLI_EXIT_OK);
  ctx.studySessionPayload = JSON.parse(ctx.studySessionCreate.stdout) as { data: { id: string; topic: string; courseId: string; startedAt: string; durationMinutes: number }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.studySessionPayload.meta.invokedCommand, "course");
  assert.equal(ctx.studySessionPayload.meta.collection, "study_sessions");
  assert.equal(ctx.studySessionPayload.data.topic, "Biology review");
  assert.equal(ctx.studySessionPayload.data.courseId, ctx.coursePayload.data.id);

  ctx.learnerCourseRelationCreate = await runCliCapture(["relation", "create", "--from-entity-kind", "learners", "--from-entity-id", ctx.learnerPayload.data.id, "--to-entity-kind", "courses", "--to-entity-id", ctx.coursePayload.data.id, "--type", "member_of", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.learnerCourseRelationCreate.code, CLI_EXIT_OK, ctx.learnerCourseRelationCreate.stderr || ctx.learnerCourseRelationCreate.stdout);
  ctx.learnerCourseRelationPayload = JSON.parse(ctx.learnerCourseRelationCreate.stdout) as { data: { id: string; fromEntityKind: string; fromEntityId: string; toEntityKind: string; toEntityId: string; type: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.learnerCourseRelationPayload.meta.invokedCommand, "relation");
  assert.equal(ctx.learnerCourseRelationPayload.meta.collection, "entity_relations");
  assert.equal(ctx.learnerCourseRelationPayload.data.fromEntityKind, "learners");
  assert.equal(ctx.learnerCourseRelationPayload.data.fromEntityId, ctx.learnerPayload.data.id);
  assert.equal(ctx.learnerCourseRelationPayload.data.toEntityKind, "courses");
  assert.equal(ctx.learnerCourseRelationPayload.data.toEntityId, ctx.coursePayload.data.id);
  assert.equal(ctx.learnerCourseRelationPayload.data.type, "member_of");

  ctx.learnerEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Learner record", "--kind", "document", "--collection-name", "learners", "--record-id", ctx.learnerPayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.learnerEvidenceSourceCreate.code, CLI_EXIT_OK);
  ctx.learnerEvidenceSourcePayload = JSON.parse(ctx.learnerEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(ctx.learnerEvidenceSourcePayload.data.collectionName, "learners");
  assert.equal(ctx.learnerEvidenceSourcePayload.data.recordId, ctx.learnerPayload.data.id);

  ctx.courseEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Course syllabus", "--kind", "document", "--collection-name", "courses", "--record-id", ctx.coursePayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.courseEvidenceSourceCreate.code, CLI_EXIT_OK);
  ctx.courseEvidenceSourcePayload = JSON.parse(ctx.courseEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(ctx.courseEvidenceSourcePayload.data.collectionName, "courses");
  assert.equal(ctx.courseEvidenceSourcePayload.data.recordId, ctx.coursePayload.data.id);

  ctx.learnerGapCreate = await runCliCapture(["quality-gap", "create", "Missing credential evidence", "--target-collection", "learners", "--target-id", ctx.learnerPayload.data.id, "--gap-kind", "missing", "--evidence-source-id", ctx.learnerEvidenceSourcePayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.learnerGapCreate.code, CLI_EXIT_OK);
  ctx.learnerGapPayload = JSON.parse(ctx.learnerGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(ctx.learnerGapPayload.data.targetCollection, "learners");
  assert.equal(ctx.learnerGapPayload.data.targetId, ctx.learnerPayload.data.id);
  assert.equal(ctx.learnerGapPayload.data.gapKind, "missing");

  ctx.courseGapCreate = await runCliCapture(["quality-gap", "create", "Missing assessment rubric", "--target-collection", "courses", "--target-id", ctx.coursePayload.data.id, "--gap-kind", "missing", "--evidence-source-id", ctx.courseEvidenceSourcePayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.courseGapCreate.code, CLI_EXIT_OK);
  ctx.courseGapPayload = JSON.parse(ctx.courseGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(ctx.courseGapPayload.data.targetCollection, "courses");
  assert.equal(ctx.courseGapPayload.data.targetId, ctx.coursePayload.data.id);
  assert.equal(ctx.courseGapPayload.data.gapKind, "missing");

  ctx.learnerTimeline = await runCliCapture(["learner", ctx.learnerPayload.data.id, "timeline", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.learnerTimeline.code, CLI_EXIT_OK);
  ctx.learnerTimelinePayload = JSON.parse(ctx.learnerTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: { subject: { id: string; label: string }; summary: { courses: number; relations: number; evidenceSources: number; qualityGaps: number }; itemCount: number; partial: boolean; items: Array<{ kind: string; recordId: string; label: string }>; records: { courses: Array<{ id: string }>; relations: Array<{ id: string }> }; gaps: Array<{ id: string; gapKind: string }> };
    };
  };
  assert.equal(ctx.learnerTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.learnerTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.learnerTimelinePayload.data.semanticView.id, "learner.timeline");
  assert.equal(ctx.learnerTimelinePayload.data.semanticView.systemId, "education");
  assert.equal(ctx.learnerTimelinePayload.data.materializedView.subject.id, ctx.learnerPayload.data.id);
  assert.equal(ctx.learnerTimelinePayload.data.materializedView.subject.label, "Ada Learner");
  assert.equal(ctx.learnerTimelinePayload.data.materializedView.summary.courses, 1);
  assert.equal(ctx.learnerTimelinePayload.data.materializedView.summary.relations, 1);
  assert.equal(ctx.learnerTimelinePayload.data.materializedView.summary.evidenceSources, 1);
  assert.equal(ctx.learnerTimelinePayload.data.materializedView.summary.qualityGaps, 1);
  assert.equal(ctx.learnerTimelinePayload.data.materializedView.itemCount >= 5, true);
  assert.equal(ctx.learnerTimelinePayload.data.materializedView.partial, true);
  assert.equal(ctx.learnerTimelinePayload.data.materializedView.items.some((item) => item.kind === "course" && item.label === "Intro Biology"), true);
  assert.equal(ctx.learnerTimelinePayload.data.materializedView.items.some((item) => item.kind === "relation" && item.recordId === ctx.learnerCourseRelationPayload.data.id), true);
  assert.equal(ctx.learnerTimelinePayload.data.materializedView.records.courses.some((record) => record.id === ctx.coursePayload.data.id), true);
  assert.equal(ctx.learnerTimelinePayload.data.materializedView.records.relations.some((record) => record.id === ctx.learnerCourseRelationPayload.data.id), true);
  assert.equal(ctx.learnerTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === ctx.learnerGapPayload.data.id && gap.gapKind === "missing"), true);

  ctx.courseTimeline = await runCliCapture(["course", ctx.coursePayload.data.id, "timeline", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.courseTimeline.code, CLI_EXIT_OK);
  ctx.courseTimelinePayload = JSON.parse(ctx.courseTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: { subject: { id: string; label: string }; summary: { lessons: number; studySessions: number; learners: number; relations: number; evidenceSources: number; qualityGaps: number }; itemCount: number; partial: boolean; items: Array<{ kind: string; recordId: string; label: string }>; records: { lessons: Array<{ id: string }>; studySessions: Array<{ id: string }>; learners: Array<{ id: string }>; relations: Array<{ id: string }>; evidence: Array<{ id: string }> }; gaps: Array<{ id: string; gapKind: string }> };
    };
  };
  assert.equal(ctx.courseTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.courseTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.courseTimelinePayload.data.semanticView.id, "course.timeline");
  assert.equal(ctx.courseTimelinePayload.data.semanticView.systemId, "education");
  assert.equal(ctx.courseTimelinePayload.data.materializedView.subject.id, ctx.coursePayload.data.id);
  assert.equal(ctx.courseTimelinePayload.data.materializedView.subject.label, "Intro Biology");
  assert.equal(ctx.courseTimelinePayload.data.materializedView.summary.lessons, 1);
  assert.equal(ctx.courseTimelinePayload.data.materializedView.summary.studySessions, 1);
  assert.equal(ctx.courseTimelinePayload.data.materializedView.summary.learners, 1);
  assert.equal(ctx.courseTimelinePayload.data.materializedView.summary.relations, 1);
  assert.equal(ctx.courseTimelinePayload.data.materializedView.summary.evidenceSources, 1);
  assert.equal(ctx.courseTimelinePayload.data.materializedView.summary.qualityGaps, 1);
  assert.equal(ctx.courseTimelinePayload.data.materializedView.itemCount >= 7, true);
  assert.equal(ctx.courseTimelinePayload.data.materializedView.partial, true);
  assert.equal(ctx.courseTimelinePayload.data.materializedView.items.some((item) => item.kind === "lesson" && item.label === "Cell basics"), true);
  assert.equal(ctx.courseTimelinePayload.data.materializedView.items.some((item) => item.kind === "study_session" && item.label === "Biology review"), true);
  assert.equal(ctx.courseTimelinePayload.data.materializedView.items.some((item) => item.kind === "learner" && item.label === "Ada Learner"), true);
  assert.equal(ctx.courseTimelinePayload.data.materializedView.records.lessons.some((record) => record.id === ctx.lessonPayload.data.id), true);
  assert.equal(ctx.courseTimelinePayload.data.materializedView.records.studySessions.some((record) => record.id === ctx.studySessionPayload.data.id), true);
  assert.equal(ctx.courseTimelinePayload.data.materializedView.records.learners.some((record) => record.id === ctx.learnerPayload.data.id), true);
  assert.equal(ctx.courseTimelinePayload.data.materializedView.records.relations.some((record) => record.id === ctx.learnerCourseRelationPayload.data.id), true);
  assert.equal(ctx.courseTimelinePayload.data.materializedView.records.evidence.some((record) => record.id === ctx.courseEvidenceSourcePayload.data.id), true);
  assert.equal(ctx.courseTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === ctx.courseGapPayload.data.id && gap.gapKind === "missing"), true);

  ctx.assetCreate = await runCliCapture(["asset", "create", "--company", ctx.companyPayload.data.id, "--account-id", ctx.accountPayload.data.id, "--product", ctx.erpProductPayload.data.id, "--serial-number", "PRESS-001", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.assetCreate.code, CLI_EXIT_OK);
  ctx.assetPayload = JSON.parse(ctx.assetCreate.stdout) as { data: { id: string; companyId: string; accountId: string; productCatalogId: string; serialNumber: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.assetPayload.meta.invokedCommand, "asset");
  assert.equal(ctx.assetPayload.meta.collection, "assets");
  assert.equal(ctx.assetPayload.data.companyId, ctx.companyPayload.data.id);
  assert.equal(ctx.assetPayload.data.accountId, ctx.accountPayload.data.id);
  assert.equal(ctx.assetPayload.data.productCatalogId, ctx.erpProductPayload.data.id);
  assert.equal(ctx.assetPayload.data.serialNumber, "PRESS-001");
  assert.equal(ctx.assetPayload.data.status, "active");

  ctx.assetEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Asset install record", "--kind", "document", "--collection-name", "assets", "--record-id", ctx.assetPayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.assetEvidenceSourceCreate.code, CLI_EXIT_OK);
  ctx.assetEvidenceSourcePayload = JSON.parse(ctx.assetEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(ctx.assetEvidenceSourcePayload.data.collectionName, "assets");
  assert.equal(ctx.assetEvidenceSourcePayload.data.recordId, ctx.assetPayload.data.id);

  ctx.assetGapCreate = await runCliCapture(["quality-gap", "create", "Missing maintenance plan", "--target-collection", "assets", "--target-id", ctx.assetPayload.data.id, "--gap-kind", "missing", "--evidence-source-id", ctx.assetEvidenceSourcePayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.assetGapCreate.code, CLI_EXIT_OK);
  ctx.assetGapPayload = JSON.parse(ctx.assetGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(ctx.assetGapPayload.data.targetCollection, "assets");
  assert.equal(ctx.assetGapPayload.data.targetId, ctx.assetPayload.data.id);

  ctx.workOrderCreate = await runCliCapture(["asset", ctx.assetPayload.data.id, "work-orders", "add", "Batch 42", "--company", ctx.companyPayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.workOrderCreate.code, CLI_EXIT_OK);
  ctx.workOrderPayload = JSON.parse(ctx.workOrderCreate.stdout) as { data: { id: string; title: string; companyId: string; assetId: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.workOrderPayload.meta.invokedCommand, "asset");
  assert.equal(ctx.workOrderPayload.meta.collection, "work_orders");
  assert.equal(ctx.workOrderPayload.data.title, "Batch 42");
  assert.equal(ctx.workOrderPayload.data.companyId, ctx.companyPayload.data.id);
  assert.equal(ctx.workOrderPayload.data.assetId, ctx.assetPayload.data.id);
  assert.equal(ctx.workOrderPayload.data.status, "planned");

  ctx.assetWorkOrders = await runCliCapture(["asset", ctx.assetPayload.data.id, "work-orders", "list", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.assetWorkOrders.code, CLI_EXIT_OK);
  ctx.assetWorkOrdersPayload = JSON.parse(ctx.assetWorkOrders.stdout) as { data: Array<{ id: string; assetId: string; title: string }>; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.assetWorkOrdersPayload.meta.invokedCommand, "asset");
  assert.equal(ctx.assetWorkOrdersPayload.meta.collection, "work_orders");
  assert.equal(ctx.assetWorkOrdersPayload.meta.action, "list");
  assert.equal(ctx.assetWorkOrdersPayload.data.some((record) => record.id === ctx.workOrderPayload.data.id && record.assetId === ctx.assetPayload.data.id), true);

  ctx.workOrderEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Batch traveler", "--kind", "document", "--collection-name", "work_orders", "--record-id", ctx.workOrderPayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.workOrderEvidenceSourceCreate.code, CLI_EXIT_OK);
  ctx.workOrderEvidenceSourcePayload = JSON.parse(ctx.workOrderEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(ctx.workOrderEvidenceSourcePayload.data.collectionName, "work_orders");
  assert.equal(ctx.workOrderEvidenceSourcePayload.data.recordId, ctx.workOrderPayload.data.id);

  ctx.workOrderGapCreate = await runCliCapture(["quality-gap", "create", "Missing quality check", "--target-collection", "work_orders", "--target-id", ctx.workOrderPayload.data.id, "--gap-kind", "missing", "--evidence-source-id", ctx.workOrderEvidenceSourcePayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.workOrderGapCreate.code, CLI_EXIT_OK);
  ctx.workOrderGapPayload = JSON.parse(ctx.workOrderGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(ctx.workOrderGapPayload.data.targetCollection, "work_orders");
  assert.equal(ctx.workOrderGapPayload.data.targetId, ctx.workOrderPayload.data.id);
  assert.equal(ctx.workOrderGapPayload.data.gapKind, "missing");

  ctx.workOrderTimeline = await runCliCapture(["work-order", ctx.workOrderPayload.data.id, "timeline", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.workOrderTimeline.code, CLI_EXIT_OK);
  ctx.workOrderTimelinePayload = JSON.parse(ctx.workOrderTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: { subject: { id: string; label: string }; itemCount: number; partial: boolean; items: Array<{ kind: string; recordId: string; label: string }>; gaps: Array<{ id: string; gapKind: string }> };
    };
  };
  assert.equal(ctx.workOrderTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.workOrderTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.workOrderTimelinePayload.data.semanticView.id, "work_order.timeline");
  assert.equal(ctx.workOrderTimelinePayload.data.semanticView.systemId, "manufacturing");
  assert.equal(ctx.workOrderTimelinePayload.data.materializedView.subject.id, ctx.workOrderPayload.data.id);
  assert.equal(ctx.workOrderTimelinePayload.data.materializedView.subject.label, "Batch 42");
  assert.equal(ctx.workOrderTimelinePayload.data.materializedView.itemCount >= 3, true);
  assert.equal(ctx.workOrderTimelinePayload.data.materializedView.partial, true);
  assert.equal(ctx.workOrderTimelinePayload.data.materializedView.items.some((item) => item.kind === "work_order" && item.label === "Batch 42"), true);
  assert.equal(ctx.workOrderTimelinePayload.data.materializedView.items.some((item) => item.kind === "evidence" && item.recordId === ctx.workOrderEvidenceSourcePayload.data.id), true);
  assert.equal(ctx.workOrderTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === ctx.workOrderGapPayload.data.id && gap.gapKind === "missing"), true);

  ctx.assetTimeline = await runCliCapture(["asset", ctx.assetPayload.data.id, "timeline", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.assetTimeline.code, CLI_EXIT_OK);
  ctx.assetTimelinePayload = JSON.parse(ctx.assetTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: { subject: { id: string; label: string }; summary: { workOrders: number; evidenceSources: number; qualityGaps: number }; itemCount: number; partial: boolean; company: { id: string } | null; account: { id: string } | null; product: { id: string } | null; items: Array<{ kind: string; recordId: string; label: string }>; records: { workOrders: Array<{ id: string }>; evidence: Array<{ id: string }> }; gaps: Array<{ id: string; gapKind: string }> };
    };
  };
  assert.equal(ctx.assetTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.assetTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.assetTimelinePayload.data.semanticView.id, "asset.timeline");
  assert.equal(ctx.assetTimelinePayload.data.semanticView.systemId, "manufacturing");
  assert.equal(ctx.assetTimelinePayload.data.materializedView.subject.id, ctx.assetPayload.data.id);
  assert.equal(ctx.assetTimelinePayload.data.materializedView.subject.label, "PRESS-001");
  assert.equal(ctx.assetTimelinePayload.data.materializedView.company?.id, ctx.companyPayload.data.id);
  assert.equal(ctx.assetTimelinePayload.data.materializedView.account?.id, ctx.accountPayload.data.id);
  assert.equal(ctx.assetTimelinePayload.data.materializedView.product?.id, ctx.erpProductPayload.data.id);
  assert.equal(ctx.assetTimelinePayload.data.materializedView.summary.workOrders, 1);
  assert.equal(ctx.assetTimelinePayload.data.materializedView.summary.evidenceSources, 1);
  assert.equal(ctx.assetTimelinePayload.data.materializedView.summary.qualityGaps, 1);
  assert.equal(ctx.assetTimelinePayload.data.materializedView.itemCount >= 6, true);
  assert.equal(ctx.assetTimelinePayload.data.materializedView.partial, true);
  assert.equal(ctx.assetTimelinePayload.data.materializedView.items.some((item) => item.kind === "work_order" && item.recordId === ctx.workOrderPayload.data.id), true);
  assert.equal(ctx.assetTimelinePayload.data.materializedView.records.workOrders.some((record) => record.id === ctx.workOrderPayload.data.id), true);
  assert.equal(ctx.assetTimelinePayload.data.materializedView.records.evidence.some((record) => record.id === ctx.assetEvidenceSourcePayload.data.id), true);
  assert.equal(ctx.assetTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === ctx.assetGapPayload.data.id && gap.gapKind === "missing"), true);

  ctx.companyTimeline = await runCliCapture(["company", ctx.companyPayload.data.id, "timeline", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.companyTimeline.code, CLI_EXIT_OK);
  ctx.companyTimelinePayload = JSON.parse(ctx.companyTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: { subject: { id: string; label: string }; summary: { accounts: number; deals: number; contacts: number; activities: number; billingCustomers: number; invoices: number; payments: number; services: number; workOrders: number; assets: number; products: number; evidenceSources: number; qualityGaps: number }; itemCount: number; partial: boolean; items: Array<{ kind: string; recordId: string; label: string }>; records: { accounts: Array<{ id: string }>; deals: Array<{ id: string }>; contacts: Array<{ id: string }>; activities: Array<{ id: string }>; billingCustomers: Array<{ id: string }>; invoices: Array<{ id: string }>; payments: Array<{ id: string }>; services: Array<{ id: string }>; workOrders: Array<{ id: string }>; assets: Array<{ id: string }>; products: Array<{ id: string }>; evidence: Array<{ id: string }> }; gaps: Array<{ id: string; gapKind: string }> };
    };
  };
  assert.equal(ctx.companyTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.companyTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.companyTimelinePayload.data.semanticView.id, "company.timeline");
  assert.equal(ctx.companyTimelinePayload.data.semanticView.systemId, "erp");
  assert.equal(ctx.companyTimelinePayload.data.materializedView.subject.id, ctx.companyPayload.data.id);
  assert.equal(ctx.companyTimelinePayload.data.materializedView.subject.label, "Acme Corp");
  assert.equal(ctx.companyTimelinePayload.data.materializedView.summary.accounts, 1);
  assert.equal(ctx.companyTimelinePayload.data.materializedView.summary.deals, 1);
  assert.equal(ctx.companyTimelinePayload.data.materializedView.summary.contacts, 1);
  assert.equal(ctx.companyTimelinePayload.data.materializedView.summary.activities, 1);
  assert.equal(ctx.companyTimelinePayload.data.materializedView.summary.billingCustomers, 1);
  assert.equal(ctx.companyTimelinePayload.data.materializedView.summary.invoices, 1);
  assert.equal(ctx.companyTimelinePayload.data.materializedView.summary.payments, 1);
  assert.equal(ctx.companyTimelinePayload.data.materializedView.summary.services, 1);
  assert.equal(ctx.companyTimelinePayload.data.materializedView.summary.workOrders, 1);
  assert.equal(ctx.companyTimelinePayload.data.materializedView.summary.assets, 1);
  assert.equal(ctx.companyTimelinePayload.data.materializedView.summary.products, 1);
  assert.equal(ctx.companyTimelinePayload.data.materializedView.summary.evidenceSources, 1);
  assert.equal(ctx.companyTimelinePayload.data.materializedView.summary.qualityGaps, 1);
  assert.equal(ctx.companyTimelinePayload.data.materializedView.itemCount >= 14, true);
  assert.equal(ctx.companyTimelinePayload.data.materializedView.partial, true);
  assert.equal(ctx.companyTimelinePayload.data.materializedView.records.accounts.some((record) => record.id === ctx.accountPayload.data.id), true);
  assert.equal(ctx.companyTimelinePayload.data.materializedView.records.deals.some((record) => record.id === ctx.dealPayload.data.id), true);
  assert.equal(ctx.companyTimelinePayload.data.materializedView.records.contacts.some((record) => record.id === ctx.contactPayload.data.id), true);
  assert.equal(ctx.companyTimelinePayload.data.materializedView.records.activities.some((record) => record.id === ctx.activityPayload.data.id), true);
  assert.equal(ctx.companyTimelinePayload.data.materializedView.records.billingCustomers.some((record) => record.id === ctx.billingCustomerPayload.data.id), true);
  assert.equal(ctx.companyTimelinePayload.data.materializedView.records.invoices.some((record) => record.id === ctx.invoicePayload.data.id), true);
  assert.equal(ctx.companyTimelinePayload.data.materializedView.records.payments.some((record) => record.id === ctx.paymentPayload.data.id), true);
  assert.equal(ctx.companyTimelinePayload.data.materializedView.records.services.some((record) => record.id === ctx.servicePayload.data.id), true);
  assert.equal(ctx.companyTimelinePayload.data.materializedView.records.workOrders.some((record) => record.id === ctx.workOrderPayload.data.id), true);
  assert.equal(ctx.companyTimelinePayload.data.materializedView.records.assets.some((record) => record.id === ctx.assetPayload.data.id), true);
  assert.equal(ctx.companyTimelinePayload.data.materializedView.records.products.some((record) => record.id === ctx.erpProductPayload.data.id), true);
  assert.equal(ctx.companyTimelinePayload.data.materializedView.records.evidence.some((record) => record.id === ctx.companyEvidenceSourcePayload.data.id), true);
  assert.equal(ctx.companyTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === ctx.companyGapPayload.data.id && gap.gapKind === "missing"), true);

  ctx.companiesAliasList = await runCliCapture(["companies", "list", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.companiesAliasList.code, CLI_EXIT_OK);
  ctx.companiesAliasPayload = JSON.parse(ctx.companiesAliasList.stdout) as { ok: boolean; data: Array<{ id: string; name: string }>; meta: { canonicalCommand: string; invokedCommand: string; collection: string; action: string } };
  assert.equal(ctx.companiesAliasPayload.ok, true);
  assert.equal(ctx.companiesAliasPayload.meta.canonicalCommand, "database");
  assert.equal(ctx.companiesAliasPayload.meta.invokedCommand, "companies");
  assert.equal(ctx.companiesAliasPayload.meta.collection, "companies");
  assert.equal(ctx.companiesAliasPayload.meta.action, "list");
  assert.equal(ctx.companiesAliasPayload.data.some((record) => record.id === ctx.companyPayload.data.id), true);

  ctx.financialAccountCreate = await runCliCapture(["financial-account", "create", "Operating Account", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.financialAccountCreate.code, CLI_EXIT_OK);
  ctx.financialAccountPayload = JSON.parse(ctx.financialAccountCreate.stdout) as { data: { id: string; name: string }; meta: { collection: string; action: string } };
  assert.equal(ctx.financialAccountPayload.meta.collection, "financial_accounts");
  assert.equal(ctx.financialAccountPayload.data.name, "Operating Account");

  ctx.transactionCreate = await runCliCapture(["transaction", "create", "Lunch", "--account", ctx.financialAccountPayload.data.id, "--amount-cents", "1200", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.transactionCreate.code, CLI_EXIT_OK);
  ctx.transactionPayload = JSON.parse(ctx.transactionCreate.stdout) as { data: { id: string; description: string; accountId: string; amountCents: number; currency: string; postedAt: string }; meta: { collection: string; action: string } };
  assert.equal(ctx.transactionPayload.meta.collection, "transactions");
  assert.equal(ctx.transactionPayload.data.description, "Lunch");
  assert.equal(ctx.transactionPayload.data.accountId, ctx.financialAccountPayload.data.id);
  assert.equal(ctx.transactionPayload.data.amountCents, 1200);
  assert.equal(ctx.transactionPayload.data.currency, "USD");
  assert.equal(typeof ctx.transactionPayload.data.postedAt, "string");

  ctx.financeEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Bank statement", "--kind", "document", "--collection-name", "financial_accounts", "--record-id", ctx.financialAccountPayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.financeEvidenceSourceCreate.code, CLI_EXIT_OK);
  ctx.financeEvidenceSourcePayload = JSON.parse(ctx.financeEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(ctx.financeEvidenceSourcePayload.data.collectionName, "financial_accounts");
  assert.equal(ctx.financeEvidenceSourcePayload.data.recordId, ctx.financialAccountPayload.data.id);

  ctx.financeGapCreate = await runCliCapture(["quality-gap", "create", "Missing reconciliation status", "--target-collection", "financial_accounts", "--target-id", ctx.financialAccountPayload.data.id, "--gap-kind", "missing", "--evidence-source-id", ctx.financeEvidenceSourcePayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.financeGapCreate.code, CLI_EXIT_OK);
  ctx.financeGapPayload = JSON.parse(ctx.financeGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(ctx.financeGapPayload.data.targetCollection, "financial_accounts");
  assert.equal(ctx.financeGapPayload.data.targetId, ctx.financialAccountPayload.data.id);
  assert.equal(ctx.financeGapPayload.data.gapKind, "missing");

  ctx.financeEntityOverview = await runCliCapture(["finance", "entity", ctx.financialAccountPayload.data.id, "overview", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.financeEntityOverview.code, CLI_EXIT_OK);
  ctx.financeEntityOverviewPayload = JSON.parse(ctx.financeEntityOverview.stdout) as {
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
  assert.equal(ctx.financeEntityOverviewPayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.financeEntityOverviewPayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.financeEntityOverviewPayload.data.semanticView.id, "finance.entity.overview");
  assert.equal(ctx.financeEntityOverviewPayload.data.semanticView.systemId, "finance");
  assert.equal(ctx.financeEntityOverviewPayload.data.materializedView.subject.id, ctx.financialAccountPayload.data.id);
  assert.equal(ctx.financeEntityOverviewPayload.data.materializedView.subject.label, "Operating Account");
  assert.equal(ctx.financeEntityOverviewPayload.data.materializedView.summary.transactions, 1);
  assert.equal(ctx.financeEntityOverviewPayload.data.materializedView.summary.debitCents, 1200);
  assert.equal(ctx.financeEntityOverviewPayload.data.materializedView.summary.netAmountCents, 1200);
  assert.equal(ctx.financeEntityOverviewPayload.data.materializedView.summary.currency, "USD");
  assert.equal(ctx.financeEntityOverviewPayload.data.materializedView.partial, true);
  assert.equal(ctx.financeEntityOverviewPayload.data.materializedView.records.transactions.some((record) => record.id === ctx.transactionPayload.data.id), true);
  assert.equal(ctx.financeEntityOverviewPayload.data.materializedView.records.evidence.some((record) => record.id === ctx.financeEvidenceSourcePayload.data.id), true);
  assert.equal(ctx.financeEntityOverviewPayload.data.materializedView.gaps.some((gap) => gap.id === ctx.financeGapPayload.data.id && gap.gapKind === "missing"), true);

  ctx.accountingEntityOverview = await runCliCapture(["accounting", "entity", ctx.financialAccountPayload.data.id, "overview", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.accountingEntityOverview.code, CLI_EXIT_OK);
  ctx.accountingEntityOverviewPayload = JSON.parse(ctx.accountingEntityOverview.stdout) as { data: { coverage: { implementationStatus: string }; semanticView: { id: string }; materializedView: { subject: { id: string } } } };
  assert.equal(ctx.accountingEntityOverviewPayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.accountingEntityOverviewPayload.data.semanticView.id, "finance.entity.overview");
  assert.equal(ctx.accountingEntityOverviewPayload.data.materializedView.subject.id, ctx.financialAccountPayload.data.id);

  ctx.organismCreate = await runCliCapture(["organism", "create", "Mouse A", "--species", "Mus musculus", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.organismCreate.code, CLI_EXIT_OK);
  ctx.organismPayload = JSON.parse(ctx.organismCreate.stdout) as { data: { id: string; label: string; species: string; status: string }; meta: { collection: string; action: string } };
  assert.equal(ctx.organismPayload.meta.collection, "organisms");
  assert.equal(ctx.organismPayload.data.label, "Mouse A");
  assert.equal(ctx.organismPayload.data.species, "Mus musculus");
  assert.equal(ctx.organismPayload.data.status, "active");

  ctx.experimentCreate = await runCliCapture(["experiment", "create", "Dose response", "--organism", ctx.organismPayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.experimentCreate.code, CLI_EXIT_OK);
  ctx.experimentPayload = JSON.parse(ctx.experimentCreate.stdout) as { data: { id: string; title: string; organismId: string; status: string }; meta: { collection: string; action: string } };
  assert.equal(ctx.experimentPayload.meta.collection, "biology_experiments");
  assert.equal(ctx.experimentPayload.data.title, "Dose response");
  assert.equal(ctx.experimentPayload.data.organismId, ctx.organismPayload.data.id);
  assert.equal(ctx.experimentPayload.data.status, "planned");

  ctx.experimentSample = await runCliCapture(["experiment", ctx.experimentPayload.data.id, "samples", "add", "Exp sample 1", "--organism", ctx.organismPayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.experimentSample.code, CLI_EXIT_OK);
  ctx.experimentSamplePayload = JSON.parse(ctx.experimentSample.stdout) as { data: { id: string; label: string; biologyExperimentId: string; organismId: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.experimentSamplePayload.meta.invokedCommand, "experiment");
  assert.equal(ctx.experimentSamplePayload.meta.collection, "samples");
  assert.equal(ctx.experimentSamplePayload.data.label, "Exp sample 1");
  assert.equal(ctx.experimentSamplePayload.data.biologyExperimentId, ctx.experimentPayload.data.id);
  assert.equal(ctx.experimentSamplePayload.data.organismId, ctx.organismPayload.data.id);

  ctx.experimentSampleAssay = await runCliCapture(["sample", ctx.experimentSamplePayload.data.id, "assays", "add", "Marker assay", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.experimentSampleAssay.code, CLI_EXIT_OK);
  ctx.experimentSampleAssayPayload = JSON.parse(ctx.experimentSampleAssay.stdout) as { data: { id: string; name: string; sampleId: string }; meta: { collection: string } };
  assert.equal(ctx.experimentSampleAssayPayload.meta.collection, "assays");
  assert.equal(ctx.experimentSampleAssayPayload.data.name, "Marker assay");
  assert.equal(ctx.experimentSampleAssayPayload.data.sampleId, ctx.experimentSamplePayload.data.id);

  ctx.experimentEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Protocol", "--kind", "document", "--collection-name", "biology_experiments", "--record-id", ctx.experimentPayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.experimentEvidenceSourceCreate.code, CLI_EXIT_OK);
  ctx.experimentEvidenceSourcePayload = JSON.parse(ctx.experimentEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(ctx.experimentEvidenceSourcePayload.data.collectionName, "biology_experiments");
  assert.equal(ctx.experimentEvidenceSourcePayload.data.recordId, ctx.experimentPayload.data.id);

  ctx.experimentGapCreate = await runCliCapture(["quality-gap", "create", "Missing protocol version", "--target-collection", "biology_experiments", "--target-id", ctx.experimentPayload.data.id, "--gap-kind", "unverified", "--evidence-source-id", ctx.experimentEvidenceSourcePayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.experimentGapCreate.code, CLI_EXIT_OK);
  ctx.experimentGapPayload = JSON.parse(ctx.experimentGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(ctx.experimentGapPayload.data.targetCollection, "biology_experiments");
  assert.equal(ctx.experimentGapPayload.data.targetId, ctx.experimentPayload.data.id);
  assert.equal(ctx.experimentGapPayload.data.gapKind, "unverified");

  ctx.experimentTimeline = await runCliCapture(["experiment", ctx.experimentPayload.data.id, "timeline", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.experimentTimeline.code, CLI_EXIT_OK);
  ctx.experimentTimelinePayload = JSON.parse(ctx.experimentTimeline.stdout) as {
    data: {
      coverage: { implementationStatus: string; recordsMaterialized: boolean };
      semanticView: { id: string; systemId: string };
      materializedView: { subject: { id: string; label: string }; itemCount: number; partial: boolean; items: Array<{ kind: string; recordId: string; label: string }>; gaps: Array<{ id: string; gapKind: string }> };
    };
  };
  assert.equal(ctx.experimentTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.experimentTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.experimentTimelinePayload.data.semanticView.id, "experiment.timeline");
  assert.equal(ctx.experimentTimelinePayload.data.semanticView.systemId, "biology");
  assert.equal(ctx.experimentTimelinePayload.data.materializedView.subject.id, ctx.experimentPayload.data.id);
  assert.equal(ctx.experimentTimelinePayload.data.materializedView.subject.label, "Dose response");
  assert.equal(ctx.experimentTimelinePayload.data.materializedView.itemCount >= 5, true);
  assert.equal(ctx.experimentTimelinePayload.data.materializedView.partial, true);
  assert.equal(ctx.experimentTimelinePayload.data.materializedView.items.some((item) => item.kind === "sample" && item.label === "Exp sample 1"), true);
  assert.equal(ctx.experimentTimelinePayload.data.materializedView.items.some((item) => item.kind === "assay" && item.label === "Marker assay"), true);
  assert.equal(ctx.experimentTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === ctx.experimentGapPayload.data.id && gap.gapKind === "unverified"), true);

  ctx.labNotebookCreate = await runCliCapture(["lab-notebook", "create", "Trial A notebook", "--study", ctx.studyPayload.data.id, "--experiment", ctx.experimentPayload.data.id, "--company", ctx.companyPayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.labNotebookCreate.code, CLI_EXIT_OK, ctx.labNotebookCreate.stderr || ctx.labNotebookCreate.stdout);
  ctx.labNotebookPayload = JSON.parse(ctx.labNotebookCreate.stdout) as { data: { id: string; title: string; studyId: string; biologyExperimentId: string; companyId: string; status: string; openedAt: string }; meta: { collection: string; action: string } };
  assert.equal(ctx.labNotebookPayload.meta.collection, "lab_notebooks");
  assert.equal(ctx.labNotebookPayload.data.title, "Trial A notebook");
  assert.equal(ctx.labNotebookPayload.data.studyId, ctx.studyPayload.data.id);
  assert.equal(ctx.labNotebookPayload.data.biologyExperimentId, ctx.experimentPayload.data.id);
  assert.equal(ctx.labNotebookPayload.data.companyId, ctx.companyPayload.data.id);
  assert.equal(ctx.labNotebookPayload.data.status, "active");
  assert.equal(typeof ctx.labNotebookPayload.data.openedAt, "string");

  ctx.notebookEntryCreate = await runCliCapture(["lab-notebook", ctx.labNotebookPayload.data.id, "entries", "add", "Day 1 setup", "--sample", ctx.experimentSamplePayload.data.id, "--assay", ctx.experimentSampleAssayPayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.notebookEntryCreate.code, CLI_EXIT_OK, ctx.notebookEntryCreate.stderr || ctx.notebookEntryCreate.stdout);
  ctx.notebookEntryPayload = JSON.parse(ctx.notebookEntryCreate.stdout) as { data: { id: string; title: string; notebookId: string; sampleId: string; assayId: string; status: string; entryType: string; authoredAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.notebookEntryPayload.meta.invokedCommand, "lab-notebook");
  assert.equal(ctx.notebookEntryPayload.meta.collection, "notebook_entries");
  assert.equal(ctx.notebookEntryPayload.meta.action, "create");
  assert.equal(ctx.notebookEntryPayload.data.title, "Day 1 setup");
  assert.equal(ctx.notebookEntryPayload.data.notebookId, ctx.labNotebookPayload.data.id);
  assert.equal(ctx.notebookEntryPayload.data.sampleId, ctx.experimentSamplePayload.data.id);
  assert.equal(ctx.notebookEntryPayload.data.assayId, ctx.experimentSampleAssayPayload.data.id);
  assert.equal(ctx.notebookEntryPayload.data.status, "draft");
  assert.equal(ctx.notebookEntryPayload.data.entryType, "note");

  ctx.protocolRunCreate = await runCliCapture(["lab-notebook", ctx.labNotebookPayload.data.id, "protocol-runs", "add", "Dose response run", "--experiment", ctx.experimentPayload.data.id, "--sample", ctx.experimentSamplePayload.data.id, "--assay", ctx.experimentSampleAssayPayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.protocolRunCreate.code, CLI_EXIT_OK, ctx.protocolRunCreate.stderr || ctx.protocolRunCreate.stdout);
  ctx.protocolRunPayload = JSON.parse(ctx.protocolRunCreate.stdout) as { data: { id: string; title: string; notebookId: string; biologyExperimentId: string; sampleId: string; assayId: string; status: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.protocolRunPayload.meta.invokedCommand, "lab-notebook");
  assert.equal(ctx.protocolRunPayload.meta.collection, "protocol_runs");
  assert.equal(ctx.protocolRunPayload.data.title, "Dose response run");
  assert.equal(ctx.protocolRunPayload.data.notebookId, ctx.labNotebookPayload.data.id);
  assert.equal(ctx.protocolRunPayload.data.biologyExperimentId, ctx.experimentPayload.data.id);
  assert.equal(ctx.protocolRunPayload.data.sampleId, ctx.experimentSamplePayload.data.id);
  assert.equal(ctx.protocolRunPayload.data.assayId, ctx.experimentSampleAssayPayload.data.id);
  assert.equal(ctx.protocolRunPayload.data.status, "planned");

  ctx.experimentObservationCreate = await runCliCapture(["protocol-run", ctx.protocolRunPayload.data.id, "observations", "add", "Marker intensity", "--lab-notebook", ctx.labNotebookPayload.data.id, "--sample", ctx.experimentSamplePayload.data.id, "--assay", ctx.experimentSampleAssayPayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.experimentObservationCreate.code, CLI_EXIT_OK, ctx.experimentObservationCreate.stderr || ctx.experimentObservationCreate.stdout);
  ctx.experimentObservationPayload = JSON.parse(ctx.experimentObservationCreate.stdout) as { data: { id: string; title: string; notebookId: string; protocolRunId: string; sampleId: string; assayId: string; status: string; quality: string; observedAt: string }; meta: { collection: string; action: string; invokedCommand: string } };
  assert.equal(ctx.experimentObservationPayload.meta.invokedCommand, "protocol-run");
  assert.equal(ctx.experimentObservationPayload.meta.collection, "experiment_observations");
  assert.equal(ctx.experimentObservationPayload.data.title, "Marker intensity");
  assert.equal(ctx.experimentObservationPayload.data.notebookId, ctx.labNotebookPayload.data.id);
  assert.equal(ctx.experimentObservationPayload.data.protocolRunId, ctx.protocolRunPayload.data.id);
  assert.equal(ctx.experimentObservationPayload.data.sampleId, ctx.experimentSamplePayload.data.id);
  assert.equal(ctx.experimentObservationPayload.data.assayId, ctx.experimentSampleAssayPayload.data.id);
  assert.equal(ctx.experimentObservationPayload.data.status, "recorded");
  assert.equal(ctx.experimentObservationPayload.data.quality, "unknown");

  ctx.labNotebookEvidenceSourceCreate = await runCliCapture(["evidence-source", "create", "Notebook export", "--kind", "document", "--collection-name", "lab_notebooks", "--record-id", ctx.labNotebookPayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.labNotebookEvidenceSourceCreate.code, CLI_EXIT_OK);
  ctx.labNotebookEvidenceSourcePayload = JSON.parse(ctx.labNotebookEvidenceSourceCreate.stdout) as { data: { id: string; collectionName: string; recordId: string } };
  assert.equal(ctx.labNotebookEvidenceSourcePayload.data.collectionName, "lab_notebooks");
  assert.equal(ctx.labNotebookEvidenceSourcePayload.data.recordId, ctx.labNotebookPayload.data.id);

  ctx.labNotebookGapCreate = await runCliCapture(["quality-gap", "create", "Missing e-signature validation", "--target-collection", "lab_notebooks", "--target-id", ctx.labNotebookPayload.data.id, "--gap-kind", "external_pending", "--evidence-source-id", ctx.labNotebookEvidenceSourcePayload.data.id, "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.labNotebookGapCreate.code, CLI_EXIT_OK);
  ctx.labNotebookGapPayload = JSON.parse(ctx.labNotebookGapCreate.stdout) as { data: { id: string; gapKind: string; targetCollection: string; targetId: string } };
  assert.equal(ctx.labNotebookGapPayload.data.targetCollection, "lab_notebooks");
  assert.equal(ctx.labNotebookGapPayload.data.targetId, ctx.labNotebookPayload.data.id);
  assert.equal(ctx.labNotebookGapPayload.data.gapKind, "external_pending");

  ctx.labNotebookTimeline = await runCliCapture(["lab-notebook", ctx.labNotebookPayload.data.id, "timeline", "--workspace", ctx.workspaceRoot, "--json"], process.cwd());
  assert.equal(ctx.labNotebookTimeline.code, CLI_EXIT_OK, ctx.labNotebookTimeline.stderr || ctx.labNotebookTimeline.stdout);
  ctx.labNotebookTimelinePayload = JSON.parse(ctx.labNotebookTimeline.stdout) as {
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
  assert.equal(ctx.labNotebookTimelinePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(ctx.labNotebookTimelinePayload.data.coverage.recordsMaterialized, true);
  assert.equal(ctx.labNotebookTimelinePayload.data.semanticView.id, "lab_notebook.timeline");
  assert.equal(ctx.labNotebookTimelinePayload.data.semanticView.systemId, "eln");
  assert.equal(ctx.labNotebookTimelinePayload.data.materializedView.subject.id, ctx.labNotebookPayload.data.id);
  assert.equal(ctx.labNotebookTimelinePayload.data.materializedView.subject.label, "Trial A notebook");
  assert.equal(ctx.labNotebookTimelinePayload.data.materializedView.summary.entries, 1);
  assert.equal(ctx.labNotebookTimelinePayload.data.materializedView.summary.protocolRuns, 1);
  assert.equal(ctx.labNotebookTimelinePayload.data.materializedView.summary.observations, 1);
  assert.equal(ctx.labNotebookTimelinePayload.data.materializedView.summary.samples, 1);
  assert.equal(ctx.labNotebookTimelinePayload.data.materializedView.summary.assays, 1);
  assert.equal(ctx.labNotebookTimelinePayload.data.materializedView.summary.evidenceSources, 1);
  assert.equal(ctx.labNotebookTimelinePayload.data.materializedView.summary.qualityGaps, 1);
  assert.equal(ctx.labNotebookTimelinePayload.data.materializedView.itemCount >= 9, true);
  assert.equal(ctx.labNotebookTimelinePayload.data.materializedView.partial, true);
  assert.equal(ctx.labNotebookTimelinePayload.data.materializedView.items.some((item) => item.kind === "notebook_entry" && item.label === "Day 1 setup"), true);
  assert.equal(ctx.labNotebookTimelinePayload.data.materializedView.items.some((item) => item.kind === "protocol_run" && item.label === "Dose response run"), true);
  assert.equal(ctx.labNotebookTimelinePayload.data.materializedView.items.some((item) => item.kind === "experiment_observation" && item.label === "Marker intensity"), true);
  assert.equal(ctx.labNotebookTimelinePayload.data.materializedView.records.entries.some((record) => record.id === ctx.notebookEntryPayload.data.id), true);
  assert.equal(ctx.labNotebookTimelinePayload.data.materializedView.records.protocolRuns.some((record) => record.id === ctx.protocolRunPayload.data.id), true);
  assert.equal(ctx.labNotebookTimelinePayload.data.materializedView.records.observations.some((record) => record.id === ctx.experimentObservationPayload.data.id), true);
  assert.equal(ctx.labNotebookTimelinePayload.data.materializedView.records.evidence.some((record) => record.id === ctx.labNotebookEvidenceSourcePayload.data.id), true);
  assert.equal(ctx.labNotebookTimelinePayload.data.materializedView.gaps.some((gap) => gap.id === ctx.labNotebookGapPayload.data.id && gap.gapKind === "external_pending"), true);
}
