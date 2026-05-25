import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { requireMacCareRoutePathPattern, resolveClawPersistentSurfacePath } from "@clawjs/core";
import { clawProfessionalRecordsOsRegistry } from "@clawjs/core/catalogs";

import { CLI_EXIT_DEGRADED, CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, runCli } from "./index.ts";
import { runCliCapture, useIsolatedClawDataRoot } from "./index-test-utils.ts";
import { createDenseDataScenarioContext } from "./cli-discovery-dense-data-primary.test-support.ts";
import { completeDenseDataScenarioContext } from "./cli-discovery-dense-data-secondary.test-support.ts";

async function enableDenseDomainModules(workspaceRoot: string): Promise<void> {
  for (const moduleId of ["health", "legal", "labs-pharma", "construction", "iot", "erp"]) {
    const result = await runCliCapture(["modules", "enable", moduleId, "--workspace", workspaceRoot, "--json"], process.cwd());
    assert.equal(result.code, CLI_EXIT_OK, `module ${moduleId} should enable for dense-data test workspace: ${result.stderr || result.stdout}`);
  }
}

function writeFixtureFile(root: string, relativePath: string, content: string): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

test("runCli returns structured related matches for unknown JSON commands", async () => {
  const result = await runCliCapture(["peopel", "list", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_USAGE);
  const payload = JSON.parse(result.stdout) as { ok: boolean; error: { code: string }; meta: { related: Array<{ canonicalCommand?: string }>; commandIntent: { status: string; execute: boolean; intent: { mappedCommand?: string } } } };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "unknown_command");
  assert.equal(payload.meta.related[0]?.canonicalCommand, "people");
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

test("runCli rejects invalid discovery search limits", async () => {
  const textLimit = await runCliCapture(["search", "routing", "--limit", "nope", "--json"], process.cwd());
  assert.equal(textLimit.code, CLI_EXIT_USAGE);
  const textPayload = JSON.parse(textLimit.stdout) as { ok: boolean; error: { code: string; message: string }; meta: { canonicalCommand: string } };
  assert.equal(textPayload.ok, false);
  assert.equal(textPayload.error.code, "invalid_search_limit");
  assert.match(textPayload.error.message, /positive number/);
  assert.equal(textPayload.meta.canonicalCommand, "search");

  const negativeLimit = await runCliCapture(["search", "routing", "--limit", "-1", "--json"], process.cwd());
  assert.equal(negativeLimit.code, CLI_EXIT_USAGE);
  const negativePayload = JSON.parse(negativeLimit.stdout) as { ok: boolean; error: { code: string } };
  assert.equal(negativePayload.ok, false);
  assert.equal(negativePayload.error.code, "invalid_search_limit");
});

test("dense data commands use persistent workspace data routes", () => {
  const commonSource = fs.readFileSync(new URL("./cli-dense-data-semantic-common.ts", import.meta.url), "utf8");
  const commandSource = fs.readFileSync(new URL("./cli-dense-data-command.ts", import.meta.url), "utf8");
  assert.equal(resolveClawPersistentSurfacePath("claw.workspace.data", "/Users/demo/project"), "/Users/demo/project/.claw/data");
  assert.match(commonSource, /resolveClawPersistentSurfacePath\("claw\.workspace\.data", root\)/);
  assert.match(commandSource, /resolveClawPersistentSurfacePath\("claw\.workspace\.data", input\.workspaceRoot, "core\.sqlite"\)/);
  assert.match(commandSource, /resolveClawPersistentSurfacePath\("claw\.workspace\.data", input\.workspaceRoot\)/);
  assert.equal(commonSource.includes('path.join(root, ".claw", "data")'), false);
  assert.equal(commandSource.includes('path.join(input.workspaceRoot, ".claw", "data"'), false);
});

test("provider secrets app hint uses the Mac Care user applications route", () => {
  const chatSource = fs.readFileSync(new URL("./chat.ts", import.meta.url), "utf8");
  assert.equal(requireMacCareRoutePathPattern("mac_care.route.user_applications", { homeDir: "/Users/demo" }), "/Users/demo/Applications");
  assert.match(chatSource, /requireMacCareRoutePathPattern\("mac_care\.route\.user_applications", \{ homeDir: os\.homedir\(\) \}\)/);
  assert.equal(chatSource.includes('path.join(os.homedir(), "Applications", "ClawJS Secrets.app")'), false);
});

test("runCli routes graduated dense-data direct nouns through the shared database", async () => {
  const ctx = await createDenseDataScenarioContext();
  await completeDenseDataScenarioContext(ctx);
}, 180_000);
test("runCli exposes every graduated dense-data noun and alias as a top-level shared-data route", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-dense-top-level-"));
  await enableDenseDomainModules(workspaceRoot);
  const checkedRoutes = new Set<string>();

  for (const system of clawProfessionalRecordsOsRegistry.systems) {
    for (const center of system.centers) {
      if (!center.collectionName) continue;

      for (const command of [center.commandNoun, ...center.commandAliases]) {
        if (command === "accounts") continue;
        const routeKey = `${command}:${center.collectionName}`;
        if (checkedRoutes.has(routeKey)) continue;
        checkedRoutes.add(routeKey);

        const result = await runCliCapture([command, "list", "--workspace", workspaceRoot, "--json"], process.cwd());
        assert.equal(result.code, CLI_EXIT_OK, `${command} list should execute against ${center.collectionName}: ${result.stderr || result.stdout}`);
        const payload = JSON.parse(result.stdout) as {
          ok: boolean;
          data: unknown[] | { coverage?: { executable?: boolean; implementationStatus?: string }; semanticView?: { id: string } };
          meta: { canonicalCommand: string; collection?: string; action?: string; professionalRecords?: boolean; semanticView?: boolean };
        };
        assert.equal(payload.ok, true, `${command} list must return ok`);
        if (payload.meta.canonicalCommand === "database") {
          assert.equal(payload.meta.canonicalCommand, "database", `${command} list must route through the shared database`);
          assert.equal(payload.meta.collection, center.collectionName, `${command} list must use ${center.collectionName}`);
          assert.equal(payload.meta.action, "list", `${command} list must execute list`);
          assert.ok(Array.isArray(payload.data), `${command} list must return a record array`);
        } else {
          const professionalRecords = payload.data as { coverage?: { executable?: boolean; implementationStatus?: string }; semanticView?: { id: string } };
          assert.equal(payload.meta.professionalRecords, true, `${command} list without direct DB meta must be a dense-data semantic route`);
          assert.equal(payload.meta.semanticView, true, `${command} list without direct DB meta must expose a semantic view`);
          assert.equal(professionalRecords.coverage?.executable, true, `${command} list semantic route must be executable`);
          assert.match(professionalRecords.coverage?.implementationStatus ?? "", /^(materialized_semantic_view|semantic_view_contract)$/);
          assert.ok(professionalRecords.semanticView?.id, `${command} list semantic route must identify the view`);
        }
      }
    }
  }

  assert.ok(checkedRoutes.size >= 100, "dense-data top-level route coverage must include every graduated noun and alias");
});

test("runCli executes high-value dense-data alternate routes against one canonical operation shape", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-dense-alt-routes-"));
  await enableDenseDomainModules(workspaceRoot);
  const seedResult = await runCliCapture(["dense-fixtures", "seed", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(seedResult.code, CLI_EXIT_OK, seedResult.stderr || seedResult.stdout);

  const alternateRoutes = [
    { operationId: "patient.encounter.add", args: ["patient", "fixture_patient_ada", "encounter", "add", "Alternate encounter"], collection: "encounters", field: "patientId", value: "fixture_patient_ada" },
    { operationId: "patient.encounter.add", args: ["encounter", "add", "--patient", "fixture_patient_ada", "--title", "Direct encounter"], collection: "encounters", field: "patientId", value: "fixture_patient_ada" },
    { operationId: "patient.medication.add", args: ["patient", "fixture_patient_ada", "medication", "add", "Nested medication"], collection: "medications", field: "patientId", value: "fixture_patient_ada" },
    { operationId: "patient.medication.add", args: ["medication", "add", "--patient", "fixture_patient_ada", "--name", "Direct medication"], collection: "medications", field: "patientId", value: "fixture_patient_ada" },
    { operationId: "patient.lab.add", args: ["patient", "fixture_patient_ada", "lab", "add", "Nested lab"], collection: "lab_results", field: "patientId", value: "fixture_patient_ada" },
    { operationId: "patient.lab.add", args: ["lab", "add", "--patient", "fixture_patient_ada", "--title", "Direct lab"], collection: "lab_results", field: "patientId", value: "fixture_patient_ada" },
    { operationId: "case.client.add", args: ["case", "fixture_legal_case_smith", "client", "add", "Nested client"], collection: "legal_clients", field: "caseId", value: "fixture_legal_case_smith" },
    { operationId: "case.client.add", args: ["legal-client", "add", "--case", "fixture_legal_case_smith", "--display-name", "Direct client"], collection: "legal_clients", field: "caseId", value: "fixture_legal_case_smith" },
    { operationId: "employee.time_off.add", args: ["employee", "fixture_employee_ada", "time-off", "add", "--kind", "vacation"], collection: "time_off_requests", field: "employeeId", value: "fixture_employee_ada" },
    { operationId: "employee.time_off.add", args: ["time-off", "add", "--employee", "fixture_employee_ada", "--kind", "sick"], collection: "time_off_requests", field: "employeeId", value: "fixture_employee_ada" },
    { operationId: "property.visit.add", args: ["property", "fixture_property_listing_main", "visit", "add", "--visitor-name", "Nested visitor"], collection: "property_visits", field: "propertyListingId", value: "fixture_property_listing_main" },
    { operationId: "property.visit.add", args: ["property-visit", "add", "--property", "fixture_property_listing_main", "--visitor-name", "Direct visitor"], collection: "property_visits", field: "propertyListingId", value: "fixture_property_listing_main" },
    { operationId: "property.offer.add", args: ["property", "fixture_property_listing_main", "offer", "add", "--buyer-name", "Nested buyer"], collection: "property_offers", field: "propertyListingId", value: "fixture_property_listing_main" },
    { operationId: "property.offer.add", args: ["property-offer", "add", "--property", "fixture_property_listing_main", "--buyer-name", "Direct buyer"], collection: "property_offers", field: "propertyListingId", value: "fixture_property_listing_main" },
    { operationId: "vehicle.maintenance.add", args: ["vehicle", "fixture_vehicle_ev", "maintenance", "add", "Nested vehicle service"], collection: "vehicle_maintenance", field: "vehicleId", value: "fixture_vehicle_ev" },
    { operationId: "vehicle.maintenance.add", args: ["vehicle-maintenance", "add", "--vehicle", "fixture_vehicle_ev", "Direct vehicle service"], collection: "vehicle_maintenance", field: "vehicleId", value: "fixture_vehicle_ev" },
    { operationId: "appliance.maintenance.add", args: ["appliance", "fixture_appliance_washer", "maintenance", "add", "Nested appliance service"], collection: "appliance_maintenance", field: "applianceId", value: "fixture_appliance_washer" },
    { operationId: "appliance.maintenance.add", args: ["appliance-maintenance", "add", "--appliance", "fixture_appliance_washer", "Direct appliance service"], collection: "appliance_maintenance", field: "applianceId", value: "fixture_appliance_washer" },
    { operationId: "supplier.purchase_order.add", args: ["supplier", "fixture_supplier_parts_co", "purchase-orders", "add", "Nested PO"], collection: "purchase_orders", field: "supplierId", value: "fixture_supplier_parts_co" },
    { operationId: "supplier.purchase_order.add", args: ["purchase-order", "add", "--supplier", "fixture_supplier_parts_co", "Direct PO"], collection: "purchase_orders", field: "supplierId", value: "fixture_supplier_parts_co" },
    { operationId: "purchase_order.line_item.add", args: ["purchase-order", "fixture_purchase_order_001", "line-items", "add", "Nested line"], collection: "purchase_order_line_items", field: "purchaseOrderId", value: "fixture_purchase_order_001" },
    { operationId: "purchase_order.line_item.add", args: ["purchase-order-line-item", "add", "--purchase-order", "fixture_purchase_order_001", "Direct line"], collection: "purchase_order_line_items", field: "purchaseOrderId", value: "fixture_purchase_order_001" },
    { operationId: "warehouse.inventory_item.add", args: ["warehouse", "fixture_warehouse_main", "inventory-items", "add", "Nested stock"], collection: "inventory_items", field: "warehouseId", value: "fixture_warehouse_main" },
    { operationId: "warehouse.inventory_item.add", args: ["inventory-item", "add", "--warehouse", "fixture_warehouse_main", "Direct stock"], collection: "inventory_items", field: "warehouseId", value: "fixture_warehouse_main" },
    { operationId: "inventory_item.stock_movement.add", args: ["inventory-item", "fixture_inventory_item_press", "stock-movements", "add", "Nested movement"], collection: "stock_movements", field: "inventoryItemId", value: "fixture_inventory_item_press" },
    { operationId: "inventory_item.stock_movement.add", args: ["stock-movement", "add", "--inventory-item", "fixture_inventory_item_press", "Direct movement"], collection: "stock_movements", field: "inventoryItemId", value: "fixture_inventory_item_press" },
    { operationId: "supply_plan.item.add", args: ["supply-plan", "fixture_supply_plan_q2", "items", "add", "Nested plan item"], collection: "supply_plan_items", field: "supplyPlanId", value: "fixture_supply_plan_q2" },
    { operationId: "supply_plan.item.add", args: ["supply-plan-item", "add", "--supply-plan", "fixture_supply_plan_q2", "Direct plan item"], collection: "supply_plan_items", field: "supplyPlanId", value: "fixture_supply_plan_q2" },
    { operationId: "supply_plan.risk.add", args: ["supply-plan", "fixture_supply_plan_q2", "risks", "add", "Nested plan risk"], collection: "supply_risks", field: "supplyPlanId", value: "fixture_supply_plan_q2" },
    { operationId: "supply_plan.risk.add", args: ["supply-risk", "add", "--supply-plan", "fixture_supply_plan_q2", "Direct plan risk"], collection: "supply_risks", field: "supplyPlanId", value: "fixture_supply_plan_q2" },
    { operationId: "supply_plan.risk.add", args: ["supplier", "fixture_supplier_parts_co", "supply-risks", "add", "Supplier risk"], collection: "supply_risks", field: "supplierId", value: "fixture_supplier_parts_co" },
    { operationId: "shipment.leg.add", args: ["shipment", "fixture_shipment_po_001", "legs", "add", "Nested leg"], collection: "shipment_legs", field: "shipmentId", value: "fixture_shipment_po_001" },
    { operationId: "shipment.leg.add", args: ["shipment-leg", "add", "--shipment", "fixture_shipment_po_001", "Direct leg"], collection: "shipment_legs", field: "shipmentId", value: "fixture_shipment_po_001" },
    { operationId: "carrier.shipment.add", args: ["carrier", "fixture_carrier_fast_freight", "shipments", "add", "Nested shipment"], collection: "shipments", field: "carrierId", value: "fixture_carrier_fast_freight" },
    { operationId: "carrier.shipment.add", args: ["shipment", "add", "--carrier", "fixture_carrier_fast_freight", "Direct shipment"], collection: "shipments", field: "carrierId", value: "fixture_carrier_fast_freight" },
    { operationId: "carrier.freight_rate.add", args: ["carrier", "fixture_carrier_fast_freight", "freight-rates", "add", "Nested freight rate"], collection: "freight_rates", field: "carrierId", value: "fixture_carrier_fast_freight" },
    { operationId: "carrier.freight_rate.add", args: ["freight-rate", "add", "--carrier", "fixture_carrier_fast_freight", "Direct freight rate"], collection: "freight_rates", field: "carrierId", value: "fixture_carrier_fast_freight" },
    { operationId: "control.assessment.add", args: ["control", "fixture_compliance_control_access_review", "assessments", "add", "Nested assessment"], collection: "control_assessments", field: "controlId", value: "fixture_compliance_control_access_review" },
    { operationId: "control.assessment.add", args: ["control-assessment", "add", "--control", "fixture_compliance_control_access_review", "Direct assessment"], collection: "control_assessments", field: "controlId", value: "fixture_compliance_control_access_review" },
    { operationId: "control.finding.add", args: ["control", "fixture_compliance_control_access_review", "findings", "add", "Nested finding"], collection: "compliance_findings", field: "controlId", value: "fixture_compliance_control_access_review" },
    { operationId: "control.finding.add", args: ["compliance-finding", "add", "--control", "fixture_compliance_control_access_review", "Direct finding"], collection: "compliance_findings", field: "controlId", value: "fixture_compliance_control_access_review" },
    { operationId: "agency.public_case.add", args: ["agency", "fixture_agency_city", "public-cases", "add", "Nested public case"], collection: "public_cases", field: "agencyId", value: "fixture_agency_city" },
    { operationId: "agency.public_case.add", args: ["public-case", "add", "--agency", "fixture_agency_city", "Direct public case"], collection: "public_cases", field: "agencyId", value: "fixture_agency_city" },
    { operationId: "public_case.filing.add", args: ["public-case", "fixture_public_case_lab_permit", "filings", "add", "Nested filing"], collection: "public_filings", field: "publicCaseId", value: "fixture_public_case_lab_permit" },
    { operationId: "public_case.filing.add", args: ["public-filing", "add", "--public-case", "fixture_public_case_lab_permit", "Direct filing"], collection: "public_filings", field: "publicCaseId", value: "fixture_public_case_lab_permit" },
    { operationId: "public_case.filing.add", args: ["agency", "fixture_agency_city", "public-filings", "add", "Agency filing"], collection: "public_filings", field: "agencyId", value: "fixture_agency_city" },
    { operationId: "public_case.permit.add", args: ["public-case", "fixture_public_case_lab_permit", "permits", "add", "Nested permit"], collection: "permits", field: "publicCaseId", value: "fixture_public_case_lab_permit" },
    { operationId: "public_case.permit.add", args: ["permit", "add", "--public-case", "fixture_public_case_lab_permit", "Direct permit"], collection: "permits", field: "publicCaseId", value: "fixture_public_case_lab_permit" },
    { operationId: "public_case.permit.add", args: ["agency", "fixture_agency_city", "permits", "add", "Agency permit"], collection: "permits", field: "agencyId", value: "fixture_agency_city" },
    { operationId: "construction_project.site.add", args: ["construction-project", "fixture_construction_project_lab", "sites", "add", "Nested site"], collection: "construction_sites", field: "projectId", value: "fixture_construction_project_lab" },
    { operationId: "construction_project.site.add", args: ["construction-site", "add", "--construction-project", "fixture_construction_project_lab", "Direct site"], collection: "construction_sites", field: "projectId", value: "fixture_construction_project_lab" },
    { operationId: "construction_project.rfi.add", args: ["construction-project", "fixture_construction_project_lab", "rfis", "add", "Nested RFI"], collection: "construction_rfis", field: "projectId", value: "fixture_construction_project_lab" },
    { operationId: "construction_project.rfi.add", args: ["construction-rfi", "add", "--construction-project", "fixture_construction_project_lab", "Direct RFI"], collection: "construction_rfis", field: "projectId", value: "fixture_construction_project_lab" },
    { operationId: "construction_project.change_order.add", args: ["construction-project", "fixture_construction_project_lab", "change-orders", "add", "Nested change order"], collection: "construction_change_orders", field: "projectId", value: "fixture_construction_project_lab" },
    { operationId: "construction_project.change_order.add", args: ["construction-change-order", "add", "--construction-project", "fixture_construction_project_lab", "Direct change order"], collection: "construction_change_orders", field: "projectId", value: "fixture_construction_project_lab" },
    { operationId: "thing.device.add", args: ["thing", "fixture_iot_thing_press", "devices", "add", "Nested device"], collection: "iot_devices", field: "thingId", value: "fixture_iot_thing_press" },
    { operationId: "thing.device.add", args: ["iot-device", "add", "--thing", "fixture_iot_thing_press", "Direct device"], collection: "iot_devices", field: "thingId", value: "fixture_iot_thing_press" },
    { operationId: "device.reading.add", args: ["iot-device", "fixture_iot_device_press_sensor", "readings", "add", "Nested reading"], collection: "sensor_readings", field: "deviceId", value: "fixture_iot_device_press_sensor" },
    { operationId: "device.reading.add", args: ["sensor-reading", "add", "--device", "fixture_iot_device_press_sensor", "Direct reading"], collection: "sensor_readings", field: "deviceId", value: "fixture_iot_device_press_sensor" },
    { operationId: "device.command.add", args: ["iot-device", "fixture_iot_device_press_sensor", "commands", "add", "Nested command"], collection: "device_commands", field: "deviceId", value: "fixture_iot_device_press_sensor" },
    { operationId: "device.command.add", args: ["device-command", "add", "--device", "fixture_iot_device_press_sensor", "Direct command"], collection: "device_commands", field: "deviceId", value: "fixture_iot_device_press_sensor" },
    { operationId: "lab_notebook.entry.add", args: ["lab-notebook", "fixture_lab_notebook_trial_a", "entries", "add", "Nested entry"], collection: "notebook_entries", field: "notebookId", value: "fixture_lab_notebook_trial_a" },
    { operationId: "lab_notebook.entry.add", args: ["notebook-entry", "add", "--lab-notebook", "fixture_lab_notebook_trial_a", "Direct entry"], collection: "notebook_entries", field: "notebookId", value: "fixture_lab_notebook_trial_a" },
    { operationId: "lab_notebook.protocol_run.add", args: ["lab-notebook", "fixture_lab_notebook_trial_a", "protocol-runs", "add", "Nested protocol run"], collection: "protocol_runs", field: "notebookId", value: "fixture_lab_notebook_trial_a" },
    { operationId: "lab_notebook.protocol_run.add", args: ["protocol-run", "add", "--lab-notebook", "fixture_lab_notebook_trial_a", "Direct protocol run"], collection: "protocol_runs", field: "notebookId", value: "fixture_lab_notebook_trial_a" },
    { operationId: "protocol_run.observation.add", args: ["protocol-run", "fixture_protocol_run_trial_a", "observations", "add", "Nested observation"], collection: "experiment_observations", field: "protocolRunId", value: "fixture_protocol_run_trial_a" },
    { operationId: "protocol_run.observation.add", args: ["experiment-observation", "add", "--protocol-run", "fixture_protocol_run_trial_a", "Direct observation"], collection: "experiment_observations", field: "protocolRunId", value: "fixture_protocol_run_trial_a" },
    { operationId: "content_entry.revision.add", args: ["content-entry", "fixture_content_entry_launch_note", "revisions", "add", "Nested revision", "--revision-number", "2"], collection: "content_revisions", field: "contentEntryId", value: "fixture_content_entry_launch_note" },
    { operationId: "content_entry.revision.add", args: ["content-revision", "add", "--content-entry", "fixture_content_entry_launch_note", "Direct revision", "--revision-number", "3"], collection: "content_revisions", field: "contentEntryId", value: "fixture_content_entry_launch_note" },
    { operationId: "content_entry.variant.add", args: ["content-entry", "fixture_content_entry_launch_note", "variants", "add", "Nested variant", "--destination", "fixture_content_destination_blog"], collection: "content_variants", field: "contentEntryId", value: "fixture_content_entry_launch_note" },
    { operationId: "content_entry.variant.add", args: ["content-variant", "add", "--content-entry", "fixture_content_entry_launch_note", "--destination", "fixture_content_destination_blog", "Direct variant"], collection: "content_variants", field: "contentEntryId", value: "fixture_content_entry_launch_note" },
    { operationId: "content_entry.approval.add", args: ["content-entry", "fixture_content_entry_launch_note", "approvals", "add", "--variant", "fixture_content_variant_blog", "--destination", "fixture_content_destination_blog"], collection: "content_approvals", field: "contentEntryId", value: "fixture_content_entry_launch_note" },
    { operationId: "content_entry.approval.add", args: ["content-approval", "add", "--content-entry", "fixture_content_entry_launch_note", "--variant", "fixture_content_variant_blog", "--destination", "fixture_content_destination_blog"], collection: "content_approvals", field: "contentEntryId", value: "fixture_content_entry_launch_note" },
    { operationId: "content_entry.publication.add", args: ["content-entry", "fixture_content_entry_launch_note", "publications", "add", "--variant", "fixture_content_variant_blog", "--destination", "fixture_content_destination_blog"], collection: "content_publications", field: "contentEntryId", value: "fixture_content_entry_launch_note" },
    { operationId: "content_entry.publication.add", args: ["content-publication", "add", "--content-entry", "fixture_content_entry_launch_note", "--variant", "fixture_content_variant_blog", "--destination", "fixture_content_destination_blog"], collection: "content_publications", field: "contentEntryId", value: "fixture_content_entry_launch_note" },
    { operationId: "product_spec.revision.add", args: ["product-spec", "fixture_product_spec_press", "revisions", "add", "Nested product revision"], collection: "product_revisions", field: "productSpecId", value: "fixture_product_spec_press" },
    { operationId: "product_spec.revision.add", args: ["product-revision", "add", "--product-spec", "fixture_product_spec_press", "Direct product revision"], collection: "product_revisions", field: "productSpecId", value: "fixture_product_spec_press" },
    { operationId: "product_spec.requirement.add", args: ["product-spec", "fixture_product_spec_press", "requirements", "add", "Nested requirement"], collection: "product_requirements", field: "productSpecId", value: "fixture_product_spec_press" },
    { operationId: "product_spec.requirement.add", args: ["product-requirement", "add", "--product-spec", "fixture_product_spec_press", "Direct requirement"], collection: "product_requirements", field: "productSpecId", value: "fixture_product_spec_press" },
    { operationId: "product_spec.bom.add", args: ["product-spec", "fixture_product_spec_press", "boms", "add", "Nested BOM", "--component", "fixture_product_press_model"], collection: "product_boms", field: "productSpecId", value: "fixture_product_spec_press" },
    { operationId: "product_spec.bom.add", args: ["product-bom", "add", "--product-spec", "fixture_product_spec_press", "--component", "fixture_product_press_model", "Direct BOM"], collection: "product_boms", field: "productSpecId", value: "fixture_product_spec_press" },
    { operationId: "drug_product.batch.add", args: ["drug-product", "fixture_drug_product_trial_a", "batches", "add", "Nested batch"], collection: "batch_records", field: "drugProductId", value: "fixture_drug_product_trial_a" },
    { operationId: "drug_product.batch.add", args: ["batch-record", "add", "--drug-product", "fixture_drug_product_trial_a", "Direct batch"], collection: "batch_records", field: "drugProductId", value: "fixture_drug_product_trial_a" },
    { operationId: "drug_product.lot_release.add", args: ["drug-product", "fixture_drug_product_trial_a", "lot-releases", "add", "Nested lot release", "--batch", "fixture_batch_record_trial_a"], collection: "lot_releases", field: "drugProductId", value: "fixture_drug_product_trial_a" },
    { operationId: "drug_product.lot_release.add", args: ["lot-release", "add", "--drug-product", "fixture_drug_product_trial_a", "--batch", "fixture_batch_record_trial_a", "Direct lot release"], collection: "lot_releases", field: "drugProductId", value: "fixture_drug_product_trial_a" },
    { operationId: "drug_product.adverse_event.add", args: ["drug-product", "fixture_drug_product_trial_a", "adverse-events", "add", "Nested adverse event", "--patient", "fixture_patient_ada", "--study", "fixture_study_trial_a"], collection: "adverse_events", field: "drugProductId", value: "fixture_drug_product_trial_a" },
    { operationId: "drug_product.adverse_event.add", args: ["adverse-event", "add", "--drug-product", "fixture_drug_product_trial_a", "--patient", "fixture_patient_ada", "--study", "fixture_study_trial_a", "Direct adverse event"], collection: "adverse_events", field: "drugProductId", value: "fixture_drug_product_trial_a" },
  ] as const;

  const coveredOperationIds = new Set<string>();
  for (const route of alternateRoutes) {
    coveredOperationIds.add(route.operationId);
    const result = await runCliCapture([...route.args, "--workspace", workspaceRoot, "--json"], process.cwd());
    assert.equal(result.code, CLI_EXIT_OK, `${route.operationId} route ${route.args.join(" ")} failed: ${result.stderr || result.stdout}`);
    const payload = JSON.parse(result.stdout) as { data: Record<string, unknown>; meta: { collection: string; action: string } };
    assert.equal(payload.meta.collection, route.collection, `${route.operationId} must use canonical collection ${route.collection}`);
    assert.equal(payload.meta.action, "create", `${route.operationId} must create through the shared DB adapter`);
    assert.equal(payload.data[route.field], route.value, `${route.operationId} must preserve relation ${route.field}`);
  }

  for (const operation of ["finance.entity.overview", "patient.encounter.add", "patient.medication.add", "patient.lab.add", "case.client.add", "employee.time_off.add", "property.visit.add", "property.offer.add", "supplier.purchase_order.add", "purchase_order.line_item.add", "warehouse.inventory_item.add", "inventory_item.stock_movement.add", "supply_plan.item.add", "supply_plan.risk.add", "shipment.leg.add", "carrier.shipment.add", "carrier.freight_rate.add", "control.assessment.add", "control.finding.add", "agency.public_case.add", "public_case.filing.add", "public_case.permit.add", "construction_project.site.add", "construction_project.rfi.add", "construction_project.change_order.add", "thing.device.add", "device.reading.add", "device.command.add", "lab_notebook.entry.add", "lab_notebook.protocol_run.add", "protocol_run.observation.add", "content_entry.revision.add", "content_entry.variant.add", "content_entry.approval.add", "content_entry.publication.add", "product_spec.revision.add", "product_spec.requirement.add", "product_spec.bom.add", "drug_product.batch.add", "drug_product.lot_release.add", "drug_product.adverse_event.add"]) {
    if (operation === "finance.entity.overview") continue;
    assert.equal(coveredOperationIds.has(operation), true, `alternate route smoke must cover ${operation}`);
  }

  for (const route of [["finance", "entity", "fixture_financial_account_ops", "overview"], ["accounting", "entity", "fixture_financial_account_ops", "overview"]] as const) {
    const result = await runCliCapture([...route, "--workspace", workspaceRoot, "--json"], process.cwd());
    assert.equal(result.code, CLI_EXIT_OK, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout) as { data: { coverage: { implementationStatus: string }; semanticView: { id: string }; materializedView: { subject: { id: string } } }; meta: { semanticView: boolean } };
    assert.equal(payload.meta.semanticView, true);
    assert.equal(payload.data.coverage.implementationStatus, "materialized_semantic_view");
    assert.equal(payload.data.semanticView.id, "finance.entity.overview");
    assert.equal(payload.data.materializedView.subject.id, "fixture_financial_account_ops");
  }
}, 180_000);

test("runCli seeds the dense-data acceptance fixture into the shared database", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-dense-fixture-"));
  await enableDenseDomainModules(workspaceRoot);

  const seedResult = await runCliCapture(["dense-fixtures", "seed", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(seedResult.code, CLI_EXIT_OK, seedResult.stderr || seedResult.stdout);
  const seedPayload = JSON.parse(seedResult.stdout) as {
    ok: boolean;
    data: { fixtureSetId: string; store: string; seeded: Array<{ id: string; collectionName: string; covers: string[] }> };
    meta: { canonicalCommand: string; invokedCommand: string; subcommand: string; professionalRecords: boolean };
  };
  assert.equal(seedPayload.ok, true);
  assert.equal(seedPayload.meta.canonicalCommand, "dense-fixtures");
  assert.equal(seedPayload.meta.invokedCommand, "dense-fixtures");
  assert.equal(seedPayload.meta.subcommand, "seed");
  assert.equal(seedPayload.meta.professionalRecords, true);
  assert.equal(seedPayload.data.fixtureSetId, "dense-data-acceptance-v1");
  assert.equal(seedPayload.data.store, "core.sqlite");
  assert.equal(seedPayload.data.seeded.some((record) => record.id === "fixture_patient_ada" && record.collectionName === "patients" && record.covers.includes("patient")), true);
  assert.equal(seedPayload.data.seeded.some((record) => record.id === "fixture_person_ada" && record.collectionName === "people" && record.covers.includes("shared_identity")), true);
  assert.equal(seedPayload.data.seeded.some((record) => record.id === "fixture_relation_person_patient" && record.collectionName === "entity_relations" && record.covers.includes("no_duplicate_identity")), true);
  assert.equal(seedPayload.data.seeded.some((record) => record.id === "fixture_relation_person_employee" && record.collectionName === "entity_relations" && record.covers.includes("employee_person_link")), true);
  assert.equal(seedPayload.data.seeded.some((record) => record.id === "fixture_encounter_intake" && record.collectionName === "encounters" && record.covers.includes("encounter")), true);
  assert.equal(seedPayload.data.seeded.some((record) => record.id === "fixture_gap_missing_dob" && record.collectionName === "quality_gaps" && record.covers.includes("partial_data_gap")), true);
  assert.equal(seedPayload.data.seeded.some((record) => record.id === "fixture_domain_system_health" && record.collectionName === "domain_systems" && record.covers.includes("domain_system")), true);
  assert.equal(seedPayload.data.seeded.some((record) => record.id === "fixture_domain_profile_health_patient" && record.collectionName === "domain_profiles" && record.covers.includes("domain_profile")), true);
  assert.equal(seedPayload.data.seeded.some((record) => record.collectionName === "domain_intents" && record.covers.includes("intent_coverage")), true);
  assert.equal(seedPayload.data.seeded.some((record) => record.collectionName === "quality_gaps" && record.covers.includes("external_pending")), true);

  const patientGet = await runCliCapture(["patient", "get", "fixture_patient_ada", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(patientGet.code, CLI_EXIT_OK);
  const patientPayload = JSON.parse(patientGet.stdout) as { data: { id: string; personId: string; displayName: string; qualityGaps: string[] }; meta: { collection: string; action: string } };
  assert.equal(patientPayload.meta.collection, "patients");
  assert.equal(patientPayload.meta.action, "get");
  assert.equal(patientPayload.data.id, "fixture_patient_ada");
  assert.equal(patientPayload.data.personId, "fixture_person_ada");
  assert.equal(patientPayload.data.displayName, "Ada Patient");
  assert.deepEqual(patientPayload.data.qualityGaps, ["fixture_gap_missing_dob"]);

  for (const [relationId, fromEntityId, toEntityKind, toEntityId] of [
    ["fixture_relation_person_patient", "fixture_person_ada", "patients", "fixture_patient_ada"],
    ["fixture_relation_person_participant", "fixture_person_ada", "participants", "fixture_participant_subject_001"],
    ["fixture_relation_person_learner", "fixture_person_ada", "learners", "fixture_learner_ada"],
    ["fixture_relation_person_employee", "fixture_person_ada", "employees", "fixture_employee_ada"],
    ["fixture_relation_person_legal_client", "fixture_person_smith", "legal_clients", "fixture_legal_client_smith"],
  ] as const) {
    const relationGet = await runCliCapture(["relation", "get", relationId, "--workspace", workspaceRoot, "--json"], process.cwd());
    assert.equal(relationGet.code, CLI_EXIT_OK, relationGet.stderr || relationGet.stdout);
    const relationPayload = JSON.parse(relationGet.stdout) as { data: { fromEntityKind: string; fromEntityId: string; toEntityKind: string; toEntityId: string; type: string }; meta: { collection: string } };
    assert.equal(relationPayload.meta.collection, "entity_relations");
    assert.equal(relationPayload.data.fromEntityKind, "people");
    assert.equal(relationPayload.data.fromEntityId, fromEntityId);
    assert.equal(relationPayload.data.toEntityKind, toEntityKind);
    assert.equal(relationPayload.data.toEntityId, toEntityId);
    assert.equal(relationPayload.data.type, "same_as");
  }

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

  const legalProfileGet = await runCliCapture(["domain-profile", "get", "fixture_domain_profile_legal_legal_client", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(legalProfileGet.code, CLI_EXIT_OK);
  const legalProfilePayload = JSON.parse(legalProfileGet.stdout) as { data: { entityKind: string; entityId: string; profileKind: string; fields: { personId: string } } };
  assert.equal(legalProfilePayload.data.entityKind, "legal_clients");
  assert.equal(legalProfilePayload.data.entityId, "fixture_legal_client_smith");
  assert.equal(legalProfilePayload.data.profileKind, "legal_client_profile");
  assert.equal(legalProfilePayload.data.fields.personId, "fixture_person_smith");

  const employeeProfileGet = await runCliCapture(["domain-profile", "get", "fixture_domain_profile_hr_employee", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(employeeProfileGet.code, CLI_EXIT_OK);
  const employeeProfilePayload = JSON.parse(employeeProfileGet.stdout) as { data: { entityKind: string; entityId: string; profileKind: string; fields: { sharedPersonId: string } } };
  assert.equal(employeeProfilePayload.data.entityKind, "employees");
  assert.equal(employeeProfilePayload.data.entityId, "fixture_employee_ada");
  assert.equal(employeeProfilePayload.data.profileKind, "employee_profile");
  assert.equal(employeeProfilePayload.data.fields.sharedPersonId, "fixture_person_ada");

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

  const patientMedication = await runCliCapture(["medication", "add", "--patient", "fixture_patient_ada", "--name", "Fixture medication", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(patientMedication.code, CLI_EXIT_OK, patientMedication.stderr || patientMedication.stdout);

  const patientMedications = await runCliCapture(["patient", "fixture_patient_ada", "medications", "list", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(patientMedications.code, CLI_EXIT_OK, patientMedications.stderr || patientMedications.stdout);
  const patientMedicationsPayload = JSON.parse(patientMedications.stdout) as { data: { coverage: { implementationStatus: string; recordsMaterialized: boolean }; semanticView: { id: string }; materializedView: { summary: { medications: number; activeMedications: number }; records: { medications: Array<{ name: string; patientId: string }> } } } };
  assert.equal(patientMedicationsPayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(patientMedicationsPayload.data.coverage.recordsMaterialized, true);
  assert.equal(patientMedicationsPayload.data.semanticView.id, "patient.medications");
  assert.equal(patientMedicationsPayload.data.materializedView.summary.medications >= 1, true);
  assert.equal(patientMedicationsPayload.data.materializedView.summary.activeMedications >= 1, true);
  assert.equal(patientMedicationsPayload.data.materializedView.records.medications.some((record) => record.name === "Fixture medication" && record.patientId === "fixture_patient_ada"), true);

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

  const caseEvidence = await runCliCapture(["case", "fixture_legal_case_smith", "evidence", "list", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(caseEvidence.code, CLI_EXIT_OK, caseEvidence.stderr || caseEvidence.stdout);
  const caseEvidencePayload = JSON.parse(caseEvidence.stdout) as { data: { coverage: { implementationStatus: string; recordsMaterialized: boolean }; semanticView: { id: string }; materializedView: { summary: { evidenceItems: number; evidenceSources: number }; items: Array<{ kind: string; recordId: string }> } } };
  assert.equal(caseEvidencePayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(caseEvidencePayload.data.coverage.recordsMaterialized, true);
  assert.equal(caseEvidencePayload.data.semanticView.id, "case.evidence");
  assert.equal(caseEvidencePayload.data.materializedView.summary.evidenceItems >= 1, true);
  assert.equal(caseEvidencePayload.data.materializedView.summary.evidenceSources >= 1, true);
  assert.equal(caseEvidencePayload.data.materializedView.items.some((item) => item.kind === "case_evidence" && item.recordId === "fixture_case_evidence_contract"), true);

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

  const studyCohort = await runCliCapture(["study", "fixture_study_trial_a", "cohort", "list", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(studyCohort.code, CLI_EXIT_OK, studyCohort.stderr || studyCohort.stdout);
  const studyCohortPayload = JSON.parse(studyCohort.stdout) as { data: { coverage: { implementationStatus: string; recordsMaterialized: boolean }; semanticView: { id: string }; materializedView: { summary: { participants: number; identityRelations: number }; items: Array<{ kind: string; recordId: string }> } } };
  assert.equal(studyCohortPayload.data.coverage.implementationStatus, "materialized_semantic_view");
  assert.equal(studyCohortPayload.data.coverage.recordsMaterialized, true);
  assert.equal(studyCohortPayload.data.semanticView.id, "study.cohort");
  assert.equal(studyCohortPayload.data.materializedView.summary.participants >= 1, true);
  assert.equal(studyCohortPayload.data.materializedView.summary.identityRelations >= 1, true);
  assert.equal(studyCohortPayload.data.materializedView.items.some((item) => item.kind === "participant" && item.recordId === "fixture_participant_subject_001"), true);

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
  assert.equal(learnerTimelinePayload.data.materializedView.summary.relations, 2);
  assert.equal(learnerTimelinePayload.data.materializedView.summary.evidenceSources, 1);
  assert.equal(learnerTimelinePayload.data.materializedView.summary.qualityGaps, 1);
  assert.equal(learnerTimelinePayload.data.materializedView.partial, true);
  assert.equal(learnerTimelinePayload.data.materializedView.itemCount >= 5, true);
  assert.equal(learnerTimelinePayload.data.materializedView.items.some((item) => item.kind === "learner" && item.recordId === "fixture_learner_ada"), true);
  assert.equal(learnerTimelinePayload.data.materializedView.items.some((item) => item.kind === "course" && item.recordId === "fixture_course_intro_biology"), true);
  assert.equal(learnerTimelinePayload.data.materializedView.items.some((item) => item.kind === "relation" && item.recordId === "fixture_relation_learner_course"), true);
  assert.equal(learnerTimelinePayload.data.materializedView.items.some((item) => item.kind === "relation" && item.recordId === "fixture_relation_person_learner"), true);
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
}, 180_000);

test("runCli searches the registered CLI discovery surface", async () => {
  const result = await runCliCapture(["search", "system capabilities", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as { ok: boolean; data: { results: Array<{ canonicalName?: string }> }; meta: { canonicalCommand: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "search");
  assert.equal(payload.data.results.some((entry) => entry.canonicalName === "host"), true);

  const telemetry = await runCliCapture(["search", "system telemetry metrics", "--json"], process.cwd());
  assert.equal(telemetry.code, CLI_EXIT_OK);
  const telemetryPayload = JSON.parse(telemetry.stdout) as { ok: boolean; data: { results: Array<{ canonicalName?: string; type?: string; name?: string }> }; meta: { canonicalCommand: string } };
  assert.equal(telemetryPayload.ok, true);
  assert.equal(telemetryPayload.meta.canonicalCommand, "search");
  assert.equal(telemetryPayload.data.results.some((entry) => entry.canonicalName === "system" && entry.type === "alias" && entry.name === "system telemetry metrics"), true);

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

test("runCli routes help topics to command help", async () => {
  const jsonHelp = await runCliCapture(["help", "search", "--json"], process.cwd());
  assert.equal(jsonHelp.code, CLI_EXIT_OK);
  const jsonPayload = JSON.parse(jsonHelp.stdout) as { ok: boolean; data: { command: string; help: string }; meta: { canonicalCommand: string; invokedCommand: string; subcommand: string } };
  assert.equal(jsonPayload.ok, true);
  assert.equal(jsonPayload.data.command, "search");
  assert.match(jsonPayload.data.help, /Usage: claw search /);
  assert.equal(jsonPayload.meta.canonicalCommand, "search");
  assert.equal(jsonPayload.meta.invokedCommand, "help");
  assert.equal(jsonPayload.meta.subcommand, "search");

  const textHelp = await runCliCapture(["help", "search"], process.cwd());
  assert.equal(textHelp.code, CLI_EXIT_OK);
  assert.match(textHelp.stdout, /Usage: claw search /);
  assert.doesNotMatch(textHelp.stdout, /Usage: claw <command> \[options\]/);
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

test("runCli keeps inspect schemas JSON inspectable for agents", async () => {
  const result = await runCliCapture(["inspect", "schemas", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as { ok: boolean; data: Array<{ id: string; surfaceClass?: string }>; meta: { canonicalCommand: string; subcommand: string; schemaVersion: number } };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.schemaVersion, 1);
  assert.equal(payload.meta.canonicalCommand, "inspect");
  assert.equal(payload.meta.subcommand, "schemas");
  assert.equal(payload.data.some((entry) => entry.id === "claw.contracts.schemas"), true);
  assert.equal(payload.data.some((entry) => entry.id === "claw.schema.common.field.schemaVersion" && entry.surfaceClass === "schema"), true);
});

test("runCli keeps built-in collection schemas inspectable from a clean workspace", { concurrency: false }, async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-patients-schema-"));
  useIsolatedClawDataRoot(t, workspaceRoot);
  const result = await runCliCapture(["collections", "patients", "schema", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as { ok: boolean; data: { exists: boolean; collection: { name: string; fields: Array<{ name: string; required?: boolean }> } }; meta: { schemaVersion: number; collection: string; action: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.schemaVersion, 1);
  assert.equal(payload.meta.collection, "patients");
  assert.equal(payload.meta.action, "schema");
  assert.equal(payload.data.exists, true);
  assert.equal(payload.data.collection.name, "patients");
  assert.equal(payload.data.collection.fields.some((field) => field.name === "displayName" && field.required === true), true);
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

  const unsupportedAction = await runCliCapture(["lead", "merge", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(unsupportedAction.code, CLI_EXIT_USAGE);
  const unsupportedPayload = JSON.parse(unsupportedAction.stdout) as { ok: boolean; error: { code: string; message: string }; meta: { canonicalCommand: string; invokedCommand: string; collection: string; action: string } };
  assert.equal(unsupportedPayload.ok, false);
  assert.equal(unsupportedPayload.error.code, "unsupported_database_action");
  assert.match(unsupportedPayload.error.message, /Supported actions/);
  assert.equal(unsupportedPayload.meta.canonicalCommand, "database");
  assert.equal(unsupportedPayload.meta.invokedCommand, "lead");
  assert.equal(unsupportedPayload.meta.collection, "leads");
  assert.equal(unsupportedPayload.meta.action, "merge");
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
    ["surface route graph", "docs/adr/0049-surface-route-graph.md"],
    ["adr:surface-route-graph", "docs/adr/0049-surface-route-graph.md"],
    ["adr:naming-stability", "docs/adr/0048-naming-and-stability-surfaces.md"],
    ["docs alignment", "skills/docs-alignment-update/SKILL.md"],
    ["discoverability", "docs/adr/0017-discoverability-and-meta-code-routing.md"],
    ["meta-code routing", "docs/adr/0017-discoverability-and-meta-code-routing.md"],
  ]) {
    const result = await runCliCapture(["search", query, "--json"], process.cwd());
    assert.equal(result.code, CLI_EXIT_OK, query);
    const payload = JSON.parse(result.stdout) as { data: { results: Array<{ path?: string; canonicalName?: string }> } };
    assert.equal(payload.data.results.some((entry) => entry.path === expectedPath), true, query);
    if (query.startsWith("adr:")) {
      assert.equal(payload.data.results.some((entry) => entry.path === expectedPath && entry.canonicalName === query), true, query);
    }
  }
});

test("runCli federates public Clawix and ClawJS discoverability from an overlay cwd", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-overlay-search-"));
  const overlayRoot = path.join(tempRoot, "Clawix");
  const clawixRoot = path.join(overlayRoot, "clawix");
  const clawjsRoot = path.join(tempRoot, "clawjs");

  writeFixtureFile(overlayRoot, "AGENTS.md", "Private overlay; public canon lives in clawix/ and sibling clawjs.\n");
  writeFixtureFile(clawixRoot, "AGENTS.md", "Clawix public entrypoint.\n");
  writeFixtureFile(clawixRoot, "docs/decision-map.md", "Clawix public decision map.\n");
  writeFixtureFile(clawixRoot, "docs/shared.md", "clawix-overlay-only-sentinel shared path.\n");
  writeFixtureFile(clawixRoot, "docs/discoverability.registry.json", JSON.stringify({
    version: 1,
    artifacts: [{
      id: "clawix-overlay-sentinel",
      kind: "docs-page",
      canonicalName: "clawix:overlay-sentinel",
      canonicalSource: "docs/shared.md",
      searchQueries: [{ query: "clawix-overlay-only-sentinel", expectPath: "docs/shared.md" }],
    }],
  }));

  writeFixtureFile(clawjsRoot, "package.json", JSON.stringify({ name: "@clawjs/overlay-fixture", type: "module" }));
  fs.mkdirSync(path.join(clawjsRoot, "packages", "clawjs-core"), { recursive: true });
  writeFixtureFile(clawjsRoot, "docs/decision-map.md", "ClawJS public decision map.\n");
  writeFixtureFile(clawjsRoot, "docs/shared.md", "clawjs-overlay-only-sentinel shared path.\n");
  writeFixtureFile(clawjsRoot, "docs/discoverability.registry.json", JSON.stringify({
    version: 1,
    artifacts: [{
      id: "clawjs-overlay-sentinel",
      kind: "docs-page",
      canonicalName: "clawjs:overlay-sentinel",
      canonicalSource: "docs/shared.md",
      searchQueries: [{ query: "clawjs-overlay-only-sentinel", expectPath: "docs/shared.md" }],
    }],
  }));

  const clawixSearch = await runCliCapture(["search", "clawix-overlay-only-sentinel", "--json"], overlayRoot);
  assert.equal(clawixSearch.code, CLI_EXIT_OK);
  const clawixPayload = JSON.parse(clawixSearch.stdout) as { data: { scope: { repositories: Array<{ repo: string; detectedBy: string }> }; results: Array<{ repo?: string; path?: string }> } };
  assert.deepEqual(clawixPayload.data.scope.repositories.map((repo) => repo.repo), ["clawjs", "clawix"]);
  assert.equal(clawixPayload.data.scope.repositories.some((repo) => repo.repo === "clawix" && repo.detectedBy === "nested"), true);
  assert.equal(clawixPayload.data.results.some((entry) => entry.repo === "clawix" && entry.path === "docs/shared.md"), true);

  const clawjsSearch = await runCliCapture(["search", "clawjs-overlay-only-sentinel", "--json"], overlayRoot);
  assert.equal(clawjsSearch.code, CLI_EXIT_OK);
  const clawjsPayload = JSON.parse(clawjsSearch.stdout) as { data: { results: Array<{ repo?: string; path?: string }> } };
  assert.equal(clawjsPayload.data.results.some((entry) => entry.repo === "clawjs" && entry.path === "docs/shared.md"), true);

  const sharedPathSearch = await runCliCapture(["search", "shared path", "--json", "--limit", "20"], overlayRoot);
  assert.equal(sharedPathSearch.code, CLI_EXIT_OK);
  const sharedPathPayload = JSON.parse(sharedPathSearch.stdout) as { data: { results: Array<{ repo?: string; path?: string }> } };
  assert.equal(sharedPathPayload.data.results.some((entry) => entry.repo === "clawjs" && entry.path === "docs/shared.md"), true);
  assert.equal(sharedPathPayload.data.results.some((entry) => entry.repo === "clawix" && entry.path === "docs/shared.md"), true);

  const clawixInspect = await runCliCapture(["inspect", "why", "clawix:overlay-sentinel", "--json"], overlayRoot);
  assert.equal(clawixInspect.code, CLI_EXIT_OK, clawixInspect.stderr || clawixInspect.stdout);
  const inspectPayload = JSON.parse(clawixInspect.stdout) as { data: { type: string; repo: { repo: string; detectedBy: string }; id: string; canonicalSource: string } };
  assert.equal(inspectPayload.data.type, "discoverabilityArtifact");
  assert.equal(inspectPayload.data.repo.repo, "clawix");
  assert.equal(inspectPayload.data.repo.detectedBy, "nested");
  assert.equal(inspectPayload.data.id, "clawix-overlay-sentinel");
  assert.equal(inspectPayload.data.canonicalSource, "docs/shared.md");
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
