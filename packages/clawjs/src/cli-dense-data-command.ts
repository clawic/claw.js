import { clawProfessionalRecordsAcceptanceFixture, clawProfessionalRecordsOsRegistry, findClawProfessionalRecordsSystem, listClawProfessionalRecordsSemanticViewEntries, resolveBuiltinCollectionName, resolveClawProfessionalRecordsIntent } from "@clawjs/core/catalogs";
import { resolveClawPersistentSurfacePath } from "@clawjs/core";
import fs from "fs";
import path from "path";

import { CLI_EXIT_DEGRADED, CLI_EXIT_OK } from "./cli-errors.ts";
import { formatCliTable } from "./cli-flag-parsers.ts";
import { writeJsonOk } from "./cli-json.ts";
import type { ProfessionalRecordsCliInput } from "./cli-dense-data-semantic-common.ts";

type MagicDbCliInput = Parameters<(typeof import("./database-magic.ts"))["runMagicDbCli"]>[0];

const INSPECTION_ACTIONS = new Set(["overview", "gaps", "intents", "schema"]);
const CRUD_ACTIONS = new Set(["list", "get", "create", "update", "delete", "query", "schema", "add"]);
const DENSE_FIXTURE_COMMANDS = new Set(["dense-fixture", "dense-fixtures"]);
const FOUNDATION_COLLECTION_COMMANDS: Record<string, string> = {
  "domain-system": "domain_systems",
  "domain-systems": "domain_systems",
  "domain-pack": "domain_packs",
  "domain-packs": "domain_packs",
  "domain-role": "domain_roles",
  "domain-roles": "domain_roles",
  "domain-profile": "domain_profiles",
  "domain-profiles": "domain_profiles",
  "typed-profile": "domain_profiles",
  "typed-profiles": "domain_profiles",
  "evidence-source": "evidence_sources",
  "evidence-sources": "evidence_sources",
  "provenance-event": "provenance_events",
  "provenance-events": "provenance_events",
  "quality-gap": "quality_gaps",
  "quality-gaps": "quality_gaps",
  "data-gap": "quality_gaps",
  "data-gaps": "quality_gaps",
  "canonical-operation": "canonical_operations",
  "canonical-operations": "canonical_operations",
  "semantic-view": "semantic_views",
  "semantic-views": "semantic_views",
  "domain-intent": "domain_intents",
  "domain-intents": "domain_intents",
  vocabulary: "vocabularies",
  vocabularies: "vocabularies",
  concept: "concepts",
  concepts: "concepts",
  "concept-mapping": "concept_mappings",
  "concept-mappings": "concept_mappings",
  unit: "units",
  units: "units",
  instrument: "instruments",
  instruments: "instruments",
  "instrument-item": "instrument_items",
  "instrument-items": "instrument_items",
  "instrument-response": "instrument_responses",
  "instrument-responses": "instrument_responses",
  relation: "entity_relations",
  relations: "entity_relations",
  "universal-relation": "entity_relations",
  "universal-relations": "entity_relations",
};
const PROFESSIONAL_RECORDS_COLLECTION_BY_COMMAND = new Map(
  clawProfessionalRecordsOsRegistry.systems.flatMap((system) =>
    system.centers.flatMap((center) =>
      center.collectionName
        ? [center.commandNoun, ...center.commandAliases].map((command) => [command, center.collectionName] as const)
        : [],
    ),
  ),
);

async function runDenseMagicDbCli(input: MagicDbCliInput): Promise<number> {
  const command = await import("./database-magic.ts");
  return command.runMagicDbCli(input);
}

export async function runProfessionalRecordsCli(input: ProfessionalRecordsCliInput): Promise<number | null> {
  const phrase = input.positionals.join(" ");
  const group = input.positionals[0];
  const action = input.positionals[1];
  if (!group || !action) return null;
  if (DENSE_FIXTURE_COMMANDS.has(group)) return await runDenseFixtureCli(input, action);
  const directSemanticView = semanticComposedViewForRoute(input) ?? semanticTimelineViewForRoute(input);
  if (directSemanticView) return await writeDenseSemanticView(input, resolveClawProfessionalRecordsIntent(phrase), directSemanticView, group, action);
  if (!isProfessionalRecordsCommandGroup(group)) return null;
  if (group === "finance" && ["upsert", "list", "get", "delete"].includes(action)) return null;

  if (action === "list") {
    const emptyCollectionName = collectionForProfessionalRecordsCommandGroup(group);
    if (emptyCollectionName) {
      const fastEmptyListExit = writeEmptyDenseListIfStoreMissing(input, emptyCollectionName, action, group);
      if (fastEmptyListExit !== null) return fastEmptyListExit;
    }
  }

  const intent = resolveClawProfessionalRecordsIntent(phrase);
  const semanticView = intent.status === "data_gap" ? undefined : (semanticViewForIntent(intent) ?? semanticComposedViewForRoute(input) ?? semanticTimelineViewForRoute(input));
  if (semanticView) return await writeDenseSemanticView(input, intent, semanticView, group, action);

  const foundationCollectionName = collectionForFoundationRoute(group);
  const foundationDbAction = action === "add" ? "create" : action;
  if (foundationCollectionName && CRUD_ACTIONS.has(action) && foundationDbAction !== "purge") {
    const fastEmptyListExit = writeEmptyDenseListIfStoreMissing(input, foundationCollectionName, foundationDbAction, group);
    if (fastEmptyListExit !== null) return fastEmptyListExit;
    return await runDenseMagicDbCli({
      argv: denseDbArgv(input.argv, foundationCollectionName, foundationDbAction),
      positionals: [group, foundationCollectionName, foundationDbAction, ...input.positionals.slice(2)],
      flags: input.flags,
      workspaceRoot: input.workspaceRoot,
      stdout: input.context.stdout,
      stderr: input.context.stderr,
      wantsJson: input.wantsJson,
      binName: input.binName,
    });
  }

  if (intent.status === "data_gap") return null;
  const nestedRoute = nestedDenseDbRoute(input);
  if (nestedRoute) {
    return await runDenseMagicDbCli(nestedRoute);
  }
  const collectionName = collectionForDenseRoute(input.positionals[0], intent.center?.collectionName);
  const dbAction = action === "add" ? "create" : action;
  if (collectionName && CRUD_ACTIONS.has(action) && dbAction !== "purge") {
    const fastEmptyListExit = writeEmptyDenseListIfStoreMissing(input, collectionName, dbAction, input.positionals[0] ?? "dense");
    if (fastEmptyListExit !== null) return fastEmptyListExit;
    return await runDenseMagicDbCli({
      argv: denseDbArgv(input.argv, collectionName, dbAction),
      positionals: [input.positionals[0] ?? "dense", collectionName, dbAction, ...input.positionals.slice(2)],
      flags: denseDbFlags(input.flags, collectionName),
      workspaceRoot: input.workspaceRoot,
      stdout: input.context.stdout,
      stderr: input.context.stderr,
      wantsJson: input.wantsJson,
      binName: input.binName,
    });
  }

  const inspectionAction = INSPECTION_ACTIONS.has(action);
  if (!inspectionAction && !CRUD_ACTIONS.has(action) && !intent.operation) return null;
  const payload = {
    intent,
    coverage: {
      routeKnown: true,
      executable: inspectionAction,
      databaseConnected: false,
      store: "core.sqlite",
      implementationStatus: inspectionAction ? "inspection_only" : "db_adapter_pending",
    },
    gap: inspectionAction
      ? null
      : {
        status: "workflow_gap",
        reason: "Dense-data route is known, but CRUD execution is not connected to canonical core.sqlite collections yet.",
        nextStep: "Graduate this center into canonical collections, schemas, relations, quality gaps, and DB smoke tests before treating this as executable.",
      },
    registry: denseRegistryPayload(intent.system?.id, group, action),
  };

  if (input.wantsJson) {
    writeJsonOk(input.context.stdout, payload, {
      schemaVersion: 1,
      canonicalCommand: intent.center?.commandNoun ?? intent.system?.canonicalCommand ?? group,
      invokedCommand: group,
      subcommand: action,
      professionalRecords: true,
    });
  } else if (inspectionAction) {
    input.context.stdout.write(renderDenseInspection(payload.registry));
  } else {
    input.context.stderr.write(`Dense-data route known but not executable yet: ${input.binName} ${phrase}\n`);
    input.context.stderr.write(`${payload.gap?.nextStep}\n`);
  }

  return inspectionAction ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

function writeEmptyDenseListIfStoreMissing(input: ProfessionalRecordsCliInput, collectionName: string, action: string, invokedCommand: string): number | null {
  if (action !== "list") return null;
  const dbPath = resolveClawPersistentSurfacePath("claw.workspace.data", input.workspaceRoot, "core.sqlite");
  if (fs.existsSync(dbPath)) return null;
  if (input.wantsJson) {
    writeJsonOk(input.context.stdout, [], {
      schemaVersion: 1,
      canonicalCommand: "database",
      invokedCommand,
      subcommand: `${collectionName} list`,
      collection: collectionName,
      action: "list",
    });
  } else {
    input.context.stdout.write(`No ${collectionName} yet\n`);
  }
  return CLI_EXIT_OK;
}

async function runDenseFixtureCli(input: ProfessionalRecordsCliInput, action: string): Promise<number | null> {
  if (action !== "seed") return null;
  const { openMainDataStore } = await import("./v1-data.ts");
  const namespaceId = input.flags.namespace ?? "main";
  const dataDir = resolveClawPersistentSurfacePath("claw.workspace.data", input.workspaceRoot);
  fs.mkdirSync(dataDir, { recursive: true });
  const store = openMainDataStore({
    ...process.env,
    CLAW_DATA_DIR: dataDir,
  });
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });

  const seeded = clawProfessionalRecordsAcceptanceFixture.records.map((fixtureRecord) => {
    const record = store.putRecord({
      namespaceId,
      collectionName: fixtureRecord.collectionName,
      recordId: fixtureRecord.id,
      payload: fixtureRecord.data,
      createdAt: "2026-05-17T00:00:00.000Z",
      updatedAt: "2026-05-17T00:00:00.000Z",
    });
    return {
      id: record.id,
      collectionName: fixtureRecord.collectionName,
      label: fixtureRecord.label,
      covers: fixtureRecord.covers,
    };
  });
  const payload = {
    fixtureSetId: clawProfessionalRecordsAcceptanceFixture.fixtureSetId,
    sourceConversationId: clawProfessionalRecordsAcceptanceFixture.sourceConversationId,
    namespaceId,
    store: "core.sqlite",
    seeded,
  };
  if (input.wantsJson) {
    writeJsonOk(input.context.stdout, payload, {
      schemaVersion: 1,
      canonicalCommand: "dense-fixtures",
      invokedCommand: input.positionals[0] ?? "dense-fixtures",
      subcommand: action,
      professionalRecords: true,
    });
  } else {
    input.context.stdout.write(`${formatCliTable(seeded.map((record) => ({
      id: record.id,
      collection: record.collectionName,
      covers: record.covers.join(", "),
    })))}\n`);
  }
  return CLI_EXIT_OK;
}

function semanticViewForIntent(intent: ReturnType<typeof resolveClawProfessionalRecordsIntent>) {
  if (!intent.system || !intent.operation) return undefined;
  return listClawProfessionalRecordsSemanticViewEntries().find((entry) => entry.systemId === intent.system?.id && entry.operationId === intent.operation?.id);
}

function semanticTimelineViewForRoute(input: ProfessionalRecordsCliInput) {
  if (input.positionals[2] !== "timeline") return undefined;
  const group = input.positionals[0];
  if (!group) return undefined;
  return listClawProfessionalRecordsSemanticViewEntries().find((entry) => entry.commandPattern === `claw ${group} <id> timeline`);
}

function semanticComposedViewForRoute(input: ProfessionalRecordsCliInput) {
  const [group, id, noun, action] = input.positionals;
  if (!group || !id || action !== "list") return undefined;
  const viewId =
    group === "patient" && noun === "medications" ? "patient.medications"
      : group === "study" && (noun === "cohort" || noun === "cohorts") ? "study.cohort"
        : group === "case" && noun === "evidence" ? "case.evidence"
          : undefined;
  if (!viewId) return undefined;
  return listClawProfessionalRecordsSemanticViewEntries().find((entry) => entry.id === viewId);
}

async function writeDenseSemanticView(
  input: ProfessionalRecordsCliInput,
  intent: ReturnType<typeof resolveClawProfessionalRecordsIntent>,
  semanticView: NonNullable<ReturnType<typeof semanticTimelineViewForRoute>>,
  group: string,
  action: string,
): Promise<number> {
  const { materializedSemanticViewForIntent } = await import("./cli-dense-data-semantic-views.ts");
  const materializedView = materializedSemanticViewForIntent(input, intent, semanticView);
  const recordsMaterialized = Boolean(materializedView);
  const operation = intent.operation ?? intent.system?.operations.find((entry) => entry.id === semanticView.operationId);
  const payload = {
    intent,
    semanticView,
    coverage: {
      routeKnown: true,
      executable: true,
      databaseConnected: recordsMaterialized,
      recordsMaterialized,
      store: "core.sqlite",
      implementationStatus: recordsMaterialized ? "materialized_semantic_view" : "semantic_view_contract",
    },
    view: {
      id: semanticView.id,
      label: semanticView.label,
      operationId: semanticView.operationId,
      requiredInputs: semanticView.requiredInputs,
      outputShape: semanticView.outputShape,
      createsOrReads: operation?.createsOrReads ?? [],
    },
    materializedView,
    gap: recordsMaterialized ? null : {
      status: "data_gap",
      reason: "Semantic view contract is known, but no materialized records were available for this route.",
      nextStep: "Seed or create the subject record and related evidence/gap records before treating this semantic view as complete.",
    },
    registry: denseRegistryPayload(intent.system?.id, group, action),
  };
  if (input.wantsJson) {
    writeJsonOk(input.context.stdout, payload, {
      schemaVersion: 1,
      canonicalCommand: intent.center?.commandNoun ?? intent.system?.canonicalCommand ?? group,
      invokedCommand: group,
      subcommand: action,
      professionalRecords: true,
      semanticView: true,
    });
  } else {
    input.context.stdout.write(renderDenseSemanticView(payload.view));
  }
  return CLI_EXIT_OK;
}


function collectionForDenseRoute(command: string | undefined, centerCollectionName: string | undefined): string | undefined {
  if (centerCollectionName) return centerCollectionName;
  if (!command) return undefined;
  return resolveBuiltinCollectionName(command);
}

function collectionForFoundationRoute(command: string | undefined): string | undefined {
  if (!command) return undefined;
  const explicit = FOUNDATION_COLLECTION_COMMANDS[command];
  if (explicit) return explicit;
  const resolved = resolveBuiltinCollectionName(command);
  if (!resolved) return undefined;
  return Object.values(clawProfessionalRecordsOsRegistry.foundationCollections).includes(resolved) ? resolved : undefined;
}

function collectionForProfessionalRecordsCommandGroup(command: string | undefined): string | undefined {
  if (!command) return undefined;
  return collectionForFoundationRoute(command) ?? PROFESSIONAL_RECORDS_COLLECTION_BY_COMMAND.get(command) ?? resolveBuiltinCollectionName(command);
}

function denseDbArgv(argv: string[], collectionName: string, dbAction: string): string[] {
  const firstFlagIndex = argv.findIndex((token) => token.startsWith("--"));
  const tailFlags = firstFlagIndex >= 0 ? argv.slice(firstFlagIndex) : [];
  return ["db", collectionName, dbAction, ...tailFlags];
}

function denseDbFlags(flags: Record<string, string>, collectionName: string): Record<string, string> {
  let nextFlags = flags;
  if (["encounters", "medications", "symptom_logs", "lab_results"].includes(collectionName) && flags.patient && !flags["patient-id"]) {
    nextFlags = { ...nextFlags, "patient-id": flags.patient };
  }
  if (["accounts", "deals", "billing_customers", "legal_cases", "legal_clients", "services", "work_orders", "assets", "products_catalog", "employees", "payroll_runs", "praise", "okrs", "suppliers", "warehouses"].includes(collectionName) && flags.company && !flags["company-id"]) {
    nextFlags = { ...nextFlags, "company-id": flags.company };
  }
  if (collectionName === "assets" && flags.product && !flags["product-catalog-id"]) {
    nextFlags = { ...nextFlags, "product-catalog-id": flags.product };
  }
  if (["invoices", "payment_intents"].includes(collectionName) && flags["billing-customer"] && !flags["billing-customer-id"]) {
    nextFlags = { ...nextFlags, "billing-customer-id": flags["billing-customer"] };
  }
  if (collectionName === "incidents" && flags.service && !flags["service-id"]) {
    nextFlags = { ...nextFlags, "service-id": flags.service };
  }
  if (collectionName === "case_evidence" && flags.case && !flags["case-id"]) {
    nextFlags = { ...nextFlags, "case-id": flags.case };
  }
  if (collectionName === "legal_clients" && flags.case && !flags["case-id"]) {
    nextFlags = { ...nextFlags, "case-id": flags.case };
  }
  if (collectionName === "legal_clients" && flags.person && !flags["person-id"]) {
    nextFlags = { ...nextFlags, "person-id": flags.person };
  }
  if (["time_off_requests", "performance_reviews", "pay_stubs", "benefits_enrollments"].includes(collectionName) && flags.employee && !flags["employee-id"]) {
    nextFlags = { ...nextFlags, "employee-id": flags.employee };
  }
  if (["property_visits", "property_offers", "property_inspections"].includes(collectionName) && flags.property && !flags["property-listing-id"]) {
    nextFlags = { ...nextFlags, "property-listing-id": flags.property };
  }
  if (collectionName === "vehicle_insurance_policies" && flags.vehicle && !flags["vehicle-id"]) {
    nextFlags = { ...nextFlags, "vehicle-id": flags.vehicle };
  }
  if (collectionName === "vehicle_maintenance" && flags.vehicle && !flags["vehicle-id"]) {
    nextFlags = { ...nextFlags, "vehicle-id": flags.vehicle };
  }
  if (collectionName === "appliance_maintenance" && flags.appliance && !flags["appliance-id"]) {
    nextFlags = { ...nextFlags, "appliance-id": flags.appliance };
  }
  if (collectionName === "purchase_orders" && flags.supplier && !flags["supplier-id"]) {
    nextFlags = { ...nextFlags, "supplier-id": flags.supplier };
  }
  if (collectionName === "purchase_orders" && flags.company && !flags["company-id"]) {
    nextFlags = { ...nextFlags, "company-id": flags.company };
  }
  if (collectionName === "purchase_order_line_items" && flags["purchase-order"] && !flags["purchase-order-id"]) {
    nextFlags = { ...nextFlags, "purchase-order-id": flags["purchase-order"] };
  }
  if (collectionName === "purchase_order_line_items" && flags.product && !flags["product-catalog-id"]) {
    nextFlags = { ...nextFlags, "product-catalog-id": flags.product };
  }
  if (collectionName === "inventory_items" && flags.warehouse && !flags["warehouse-id"]) {
    nextFlags = { ...nextFlags, "warehouse-id": flags.warehouse };
  }
  if (collectionName === "inventory_items" && flags.product && !flags["product-catalog-id"]) {
    nextFlags = { ...nextFlags, "product-catalog-id": flags.product };
  }
  if (collectionName === "stock_movements" && flags["inventory-item"] && !flags["inventory-item-id"]) {
    nextFlags = { ...nextFlags, "inventory-item-id": flags["inventory-item"] };
  }
  if (collectionName === "stock_movements" && flags.warehouse && !flags["warehouse-id"]) {
    nextFlags = { ...nextFlags, "warehouse-id": flags.warehouse };
  }
  if (collectionName === "supply_plans" && flags.company && !flags["company-id"]) {
    nextFlags = { ...nextFlags, "company-id": flags.company };
  }
  if (collectionName === "supply_plan_items" && flags["supply-plan"] && !flags["supply-plan-id"]) {
    nextFlags = { ...nextFlags, "supply-plan-id": flags["supply-plan"] };
  }
  if (collectionName === "supply_plan_items" && flags.product && !flags["product-catalog-id"]) {
    nextFlags = { ...nextFlags, "product-catalog-id": flags.product };
  }
  if (collectionName === "supply_plan_items" && flags.supplier && !flags["supplier-id"]) {
    nextFlags = { ...nextFlags, "supplier-id": flags.supplier };
  }
  if (collectionName === "supply_plan_items" && flags["purchase-order"] && !flags["purchase-order-id"]) {
    nextFlags = { ...nextFlags, "purchase-order-id": flags["purchase-order"] };
  }
  if (collectionName === "supply_plan_items" && flags.warehouse && !flags["warehouse-id"]) {
    nextFlags = { ...nextFlags, "warehouse-id": flags.warehouse };
  }
  if (collectionName === "supply_plan_items" && flags["inventory-item"] && !flags["inventory-item-id"]) {
    nextFlags = { ...nextFlags, "inventory-item-id": flags["inventory-item"] };
  }
  if (collectionName === "supply_risks" && flags["supply-plan"] && !flags["supply-plan-id"]) {
    nextFlags = { ...nextFlags, "supply-plan-id": flags["supply-plan"] };
  }
  if (collectionName === "supply_risks" && flags.supplier && !flags["supplier-id"]) {
    nextFlags = { ...nextFlags, "supplier-id": flags.supplier };
  }
  if (collectionName === "supply_risks" && flags["purchase-order"] && !flags["purchase-order-id"]) {
    nextFlags = { ...nextFlags, "purchase-order-id": flags["purchase-order"] };
  }
  if (collectionName === "supply_risks" && flags.warehouse && !flags["warehouse-id"]) {
    nextFlags = { ...nextFlags, "warehouse-id": flags.warehouse };
  }
  if (collectionName === "supply_risks" && flags["inventory-item"] && !flags["inventory-item-id"]) {
    nextFlags = { ...nextFlags, "inventory-item-id": flags["inventory-item"] };
  }
  if (["carriers", "freight_rates"].includes(collectionName) && flags.company && !flags["company-id"]) {
    nextFlags = { ...nextFlags, "company-id": flags.company };
  }
  if (collectionName === "shipments" && flags.company && !flags["company-id"]) {
    nextFlags = { ...nextFlags, "company-id": flags.company };
  }
  if (collectionName === "shipments" && flags.customer && !flags["customer-company-id"]) {
    nextFlags = { ...nextFlags, "customer-company-id": flags.customer };
  }
  if (["shipments", "shipment_legs", "freight_rates"].includes(collectionName) && flags.carrier && !flags["carrier-id"]) {
    nextFlags = { ...nextFlags, "carrier-id": flags.carrier };
  }
  if (collectionName === "shipments" && flags["purchase-order"] && !flags["purchase-order-id"]) {
    nextFlags = { ...nextFlags, "purchase-order-id": flags["purchase-order"] };
  }
  if (collectionName === "shipments" && flags.warehouse && !flags["warehouse-id"]) {
    nextFlags = { ...nextFlags, "warehouse-id": flags.warehouse };
  }
  if (collectionName === "shipment_legs" && flags.shipment && !flags["shipment-id"]) {
    nextFlags = { ...nextFlags, "shipment-id": flags.shipment };
  }
  if (["compliance_controls", "compliance_obligations"].includes(collectionName) && flags.company && !flags["company-id"]) {
    nextFlags = { ...nextFlags, "company-id": flags.company };
  }
  if (collectionName === "compliance_controls" && flags.obligation && !flags["obligation-id"]) {
    nextFlags = { ...nextFlags, "obligation-id": flags.obligation };
  }
  if (collectionName === "compliance_controls" && flags.owner && !flags["owner-employee-id"]) {
    nextFlags = { ...nextFlags, "owner-employee-id": flags.owner };
  }
  if (collectionName === "control_assessments" && flags.control && !flags["control-id"]) {
    nextFlags = { ...nextFlags, "control-id": flags.control };
  }
  if (collectionName === "control_assessments" && flags.obligation && !flags["obligation-id"]) {
    nextFlags = { ...nextFlags, "obligation-id": flags.obligation };
  }
  if (collectionName === "compliance_findings" && flags.control && !flags["control-id"]) {
    nextFlags = { ...nextFlags, "control-id": flags.control };
  }
  if (collectionName === "compliance_findings" && flags.assessment && !flags["assessment-id"]) {
    nextFlags = { ...nextFlags, "assessment-id": flags.assessment };
  }
  if (collectionName === "compliance_findings" && flags.obligation && !flags["obligation-id"]) {
    nextFlags = { ...nextFlags, "obligation-id": flags.obligation };
  }
  if (["public_cases", "permits", "public_filings"].includes(collectionName) && flags.agency && !flags["agency-id"]) {
    nextFlags = { ...nextFlags, "agency-id": flags.agency };
  }
  if (["public_cases", "permits"].includes(collectionName) && flags.company && !flags["company-id"]) {
    nextFlags = { ...nextFlags, "company-id": flags.company };
  }
  if (collectionName === "public_cases" && flags.person && !flags["person-id"]) {
    nextFlags = { ...nextFlags, "person-id": flags.person };
  }
  if (["permits", "public_filings"].includes(collectionName) && flags["public-case"] && !flags["public-case-id"]) {
    nextFlags = { ...nextFlags, "public-case-id": flags["public-case"] };
  }
  if (collectionName === "public_filings" && flags.document && !flags["document-id"]) {
    nextFlags = { ...nextFlags, "document-id": flags.document };
  }
  if (["product_specs", "product_revisions", "product_requirements", "product_boms"].includes(collectionName) && flags.product && !flags["product-catalog-id"]) {
    nextFlags = { ...nextFlags, "product-catalog-id": flags.product };
  }
  if (collectionName === "product_specs" && flags.company && !flags["company-id"]) {
    nextFlags = { ...nextFlags, "company-id": flags.company };
  }
  if (collectionName === "product_specs" && flags.owner && !flags["owner-employee-id"]) {
    nextFlags = { ...nextFlags, "owner-employee-id": flags.owner };
  }
  if (["product_revisions", "product_requirements", "product_boms"].includes(collectionName) && flags["product-spec"] && !flags["product-spec-id"]) {
    nextFlags = { ...nextFlags, "product-spec-id": flags["product-spec"] };
  }
  if (collectionName === "product_boms" && flags.component && !flags["component-product-catalog-id"]) {
    nextFlags = { ...nextFlags, "component-product-catalog-id": flags.component };
  }
  if (["drug_products", "batch_records"].includes(collectionName) && flags.company && !flags["company-id"]) {
    nextFlags = { ...nextFlags, "company-id": flags.company };
  }
  if (collectionName === "drug_products" && flags.product && !flags["product-catalog-id"]) {
    nextFlags = { ...nextFlags, "product-catalog-id": flags.product };
  }
  if (collectionName === "drug_products" && flags["product-spec"] && !flags["product-spec-id"]) {
    nextFlags = { ...nextFlags, "product-spec-id": flags["product-spec"] };
  }
  if (["batch_records", "lot_releases", "adverse_events"].includes(collectionName) && flags["drug-product"] && !flags["drug-product-id"]) {
    nextFlags = { ...nextFlags, "drug-product-id": flags["drug-product"] };
  }
  if (collectionName === "batch_records" && flags["work-order"] && !flags["work-order-id"]) {
    nextFlags = { ...nextFlags, "work-order-id": flags["work-order"] };
  }
  if (collectionName === "lot_releases" && flags.batch && !flags["batch-record-id"]) {
    nextFlags = { ...nextFlags, "batch-record-id": flags.batch };
  }
  if (collectionName === "lot_releases" && flags.releaser && !flags["released-by-employee-id"]) {
    nextFlags = { ...nextFlags, "released-by-employee-id": flags.releaser };
  }
  if (collectionName === "adverse_events" && flags.patient && !flags["patient-id"]) {
    nextFlags = { ...nextFlags, "patient-id": flags.patient };
  }
  if (collectionName === "adverse_events" && flags.study && !flags["study-id"]) {
    nextFlags = { ...nextFlags, "study-id": flags.study };
  }
  if (collectionName === "content_brands" && flags.company && !flags["company-id"]) {
    nextFlags = { ...nextFlags, "company-id": flags.company };
  }
  if (["content_destinations", "content_campaigns", "content_entries"].includes(collectionName) && flags.brand && !flags["content-brand-id"]) {
    nextFlags = { ...nextFlags, "content-brand-id": flags.brand };
  }
  if (collectionName === "content_entries" && flags.campaign && !flags["content-campaign-id"]) {
    nextFlags = { ...nextFlags, "content-campaign-id": flags.campaign };
  }
  if (collectionName === "content_entries" && flags.document && !flags["document-id"]) {
    nextFlags = { ...nextFlags, "document-id": flags.document };
  }
  if (collectionName === "content_entries" && flags.owner && !flags["owner-actor-id"]) {
    nextFlags = { ...nextFlags, "owner-actor-id": flags.owner };
  }
  if (collectionName === "content_entries" && flags.author && !flags["author-actor-id"]) {
    nextFlags = { ...nextFlags, "author-actor-id": flags.author };
  }
  if (["content_revisions", "content_variants", "content_approvals", "content_publications"].includes(collectionName) && flags["content-entry"] && !flags["content-entry-id"]) {
    nextFlags = { ...nextFlags, "content-entry-id": flags["content-entry"] };
  }
  if (["content_variants", "content_approvals", "content_publications"].includes(collectionName) && flags.destination && !flags["content-destination-id"]) {
    nextFlags = { ...nextFlags, "content-destination-id": flags.destination };
  }
  if (["content_approvals", "content_publications"].includes(collectionName) && flags.variant && !flags["content-variant-id"]) {
    nextFlags = { ...nextFlags, "content-variant-id": flags.variant };
  }
  if (collectionName === "content_approvals" && flags.requester && !flags["requested-by-actor-id"]) {
    nextFlags = { ...nextFlags, "requested-by-actor-id": flags.requester };
  }
  if (collectionName === "content_approvals" && flags.reviewer && !flags["reviewed-by-actor-id"]) {
    nextFlags = { ...nextFlags, "reviewed-by-actor-id": flags.reviewer };
  }
  if (collectionName === "iot_things" && flags.company && !flags["company-id"]) {
    nextFlags = { ...nextFlags, "company-id": flags.company };
  }
  if (collectionName === "iot_things" && flags.asset && !flags["asset-id"]) {
    nextFlags = { ...nextFlags, "asset-id": flags.asset };
  }
  if (collectionName === "iot_devices" && flags.thing && !flags["thing-id"]) {
    nextFlags = { ...nextFlags, "thing-id": flags.thing };
  }
  if (["sensor_readings", "device_commands"].includes(collectionName) && flags.thing && !flags["thing-id"]) {
    nextFlags = { ...nextFlags, "thing-id": flags.thing };
  }
  if (["sensor_readings", "device_commands"].includes(collectionName) && flags.device && !flags["device-id"]) {
    nextFlags = { ...nextFlags, "device-id": flags.device };
  }
  if (collectionName === "construction_projects" && flags.company && !flags["company-id"]) {
    nextFlags = { ...nextFlags, "company-id": flags.company };
  }
  if (collectionName === "construction_projects" && flags.customer && !flags["customer-company-id"]) {
    nextFlags = { ...nextFlags, "customer-company-id": flags.customer };
  }
  if (["construction_sites", "construction_rfis", "construction_change_orders"].includes(collectionName) && flags["construction-project"] && !flags["project-id"]) {
    nextFlags = { ...nextFlags, "project-id": flags["construction-project"] };
  }
  if (["construction_rfis", "construction_change_orders"].includes(collectionName) && flags.site && !flags["site-id"]) {
    nextFlags = { ...nextFlags, "site-id": flags.site };
  }
  if (collectionName === "construction_change_orders" && flags.rfi && !flags["related-rfi-id"]) {
    nextFlags = { ...nextFlags, "related-rfi-id": flags.rfi };
  }
  if (collectionName === "transactions" && flags.account && !flags["account-id"]) {
    nextFlags = { ...nextFlags, "account-id": flags.account };
  }
  if (collectionName === "participants" && flags.study && !flags["study-id"]) {
    nextFlags = { ...nextFlags, "study-id": flags.study };
  }
  if (collectionName === "assays" && flags.sample && !flags["sample-id"]) {
    nextFlags = { ...nextFlags, "sample-id": flags.sample };
  }
  if (collectionName === "biology_experiments" && flags.organism && !flags["organism-id"]) {
    nextFlags = { ...nextFlags, "organism-id": flags.organism };
  }
  if (collectionName === "lab_notebooks" && flags.study && !flags["study-id"]) {
    nextFlags = { ...nextFlags, "study-id": flags.study };
  }
  if (collectionName === "lab_notebooks" && flags.experiment && !flags["biology-experiment-id"]) {
    nextFlags = { ...nextFlags, "biology-experiment-id": flags.experiment };
  }
  if (collectionName === "lab_notebooks" && flags.company && !flags["company-id"]) {
    nextFlags = { ...nextFlags, "company-id": flags.company };
  }
  if (collectionName === "lab_notebooks" && flags.owner && !flags["owner-employee-id"]) {
    nextFlags = { ...nextFlags, "owner-employee-id": flags.owner };
  }
  if (["notebook_entries", "protocol_runs", "experiment_observations"].includes(collectionName) && flags["lab-notebook"] && !flags["notebook-id"]) {
    nextFlags = { ...nextFlags, "notebook-id": flags["lab-notebook"] };
  }
  if (["notebook_entries", "protocol_runs"].includes(collectionName) && flags.study && !flags["study-id"]) {
    nextFlags = { ...nextFlags, "study-id": flags.study };
  }
  if (["notebook_entries", "protocol_runs", "experiment_observations"].includes(collectionName) && flags.experiment && !flags["biology-experiment-id"]) {
    nextFlags = { ...nextFlags, "biology-experiment-id": flags.experiment };
  }
  if (["notebook_entries", "protocol_runs", "experiment_observations"].includes(collectionName) && flags.sample && !flags["sample-id"]) {
    nextFlags = { ...nextFlags, "sample-id": flags.sample };
  }
  if (["notebook_entries", "protocol_runs", "experiment_observations"].includes(collectionName) && flags.assay && !flags["assay-id"]) {
    nextFlags = { ...nextFlags, "assay-id": flags.assay };
  }
  if (collectionName === "experiment_observations" && flags.entry && !flags["entry-id"]) {
    nextFlags = { ...nextFlags, "entry-id": flags.entry };
  }
  if (collectionName === "experiment_observations" && flags["protocol-run"] && !flags["protocol-run-id"]) {
    nextFlags = { ...nextFlags, "protocol-run-id": flags["protocol-run"] };
  }
  if (collectionName === "samples" && flags.experiment && !flags["biology-experiment-id"]) {
    nextFlags = { ...nextFlags, "biology-experiment-id": flags.experiment };
  }
  if (collectionName === "samples" && flags.organism && !flags["organism-id"]) {
    nextFlags = { ...nextFlags, "organism-id": flags.organism };
  }
  if (["lessons", "study_sessions"].includes(collectionName) && flags.course && !flags["course-id"]) {
    nextFlags = { ...nextFlags, "course-id": flags.course };
  }
  return nextFlags;
}

function nestedDenseDbRoute(input: ProfessionalRecordsCliInput): Parameters<typeof runMagicDbCli>[0] | null {
  return nestedParentDbRoute(input, {
    parentCommand: "patient",
    relationFlag: "patient-id",
    relationField: "patientId",
    collections: {
      medication: "medications",
      medications: "medications",
      encounter: "encounters",
      encounters: "encounters",
      visit: "encounters",
      visits: "encounters",
      symptom: "symptom_logs",
      symptoms: "symptom_logs",
      lab: "lab_results",
      labs: "lab_results",
      "lab-result": "lab_results",
      "lab-results": "lab_results",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "case",
    relationFlag: "case-id",
    relationField: "caseId",
    collections: {
      evidence: "case_evidence",
      client: "legal_clients",
      clients: "legal_clients",
      "legal-client": "legal_clients",
      "legal-clients": "legal_clients",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "service",
    relationFlag: "service-id",
    relationField: "serviceId",
    collections: {
      incident: "incidents",
      incidents: "incidents",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "study",
    relationFlag: "study-id",
    relationField: "studyId",
    collections: {
      participant: "participants",
      participants: "participants",
      cohort: "participants",
      cohorts: "participants",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "experiment",
    relationFlag: "biology-experiment-id",
    relationField: "biologyExperimentId",
    collections: {
      sample: "samples",
      samples: "samples",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "asset",
    relationFlag: "asset-id",
    relationField: "assetId",
    collections: {
      "work-order": "work_orders",
      "work-orders": "work_orders",
      work_order: "work_orders",
      work_orders: "work_orders",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "course",
    relationFlag: "course-id",
    relationField: "courseId",
    collections: {
      lesson: "lessons",
      lessons: "lessons",
      "study-session": "study_sessions",
      "study-sessions": "study_sessions",
      session: "study_sessions",
      sessions: "study_sessions",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "employee",
    relationFlag: "employee-id",
    relationField: "employeeId",
    collections: {
      "time-off": "time_off_requests",
      "time-offs": "time_off_requests",
      pto: "time_off_requests",
      review: "performance_reviews",
      reviews: "performance_reviews",
      "performance-review": "performance_reviews",
      "performance-reviews": "performance_reviews",
      benefit: "benefits_enrollments",
      benefits: "benefits_enrollments",
      "pay-stub": "pay_stubs",
      "pay-stubs": "pay_stubs",
      paystub: "pay_stubs",
      paystubs: "pay_stubs",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "property",
    relationFlag: "property-listing-id",
    relationField: "propertyListingId",
    collections: {
      visit: "property_visits",
      visits: "property_visits",
      viewing: "property_visits",
      viewings: "property_visits",
      offer: "property_offers",
      offers: "property_offers",
      inspection: "property_inspections",
      inspections: "property_inspections",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "vehicle",
    relationFlag: "vehicle-id",
    relationField: "vehicleId",
    collections: {
      maintenance: "vehicle_maintenance",
      "maintenance-record": "vehicle_maintenance",
      "maintenance-records": "vehicle_maintenance",
      "insurance-policy": "vehicle_insurance_policies",
      "insurance-policies": "vehicle_insurance_policies",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "appliance",
    relationFlag: "appliance-id",
    relationField: "applianceId",
    collections: {
      maintenance: "appliance_maintenance",
      "maintenance-record": "appliance_maintenance",
      "maintenance-records": "appliance_maintenance",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "supplier",
    relationFlag: "supplier-id",
    relationField: "supplierId",
    collections: {
      "purchase-order": "purchase_orders",
      "purchase-orders": "purchase_orders",
      po: "purchase_orders",
      pos: "purchase_orders",
      "supply-risk": "supply_risks",
      "supply-risks": "supply_risks",
      risk: "supply_risks",
      risks: "supply_risks",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "purchase-order",
    relationFlag: "purchase-order-id",
    relationField: "purchaseOrderId",
    collections: {
      "line-item": "purchase_order_line_items",
      "line-items": "purchase_order_line_items",
      "purchase-order-line-item": "purchase_order_line_items",
      "purchase-order-line-items": "purchase_order_line_items",
      "po-line": "purchase_order_line_items",
      "po-lines": "purchase_order_line_items",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "warehouse",
    relationFlag: "warehouse-id",
    relationField: "warehouseId",
    collections: {
      "inventory-item": "inventory_items",
      "inventory-items": "inventory_items",
      "stock-item": "inventory_items",
      "stock-items": "inventory_items",
      inventory: "inventory_items",
      stock: "inventory_items",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "inventory-item",
    relationFlag: "inventory-item-id",
    relationField: "inventoryItemId",
    collections: {
      "stock-movement": "stock_movements",
      "stock-movements": "stock_movements",
      movement: "stock_movements",
      movements: "stock_movements",
      "inventory-movement": "stock_movements",
      "inventory-movements": "stock_movements",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "supply-plan",
    relationFlag: "supply-plan-id",
    relationField: "supplyPlanId",
    collections: {
      item: "supply_plan_items",
      items: "supply_plan_items",
      "supply-plan-item": "supply_plan_items",
      "supply-plan-items": "supply_plan_items",
      risk: "supply_risks",
      risks: "supply_risks",
      "supply-risk": "supply_risks",
      "supply-risks": "supply_risks",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "carrier",
    relationFlag: "carrier-id",
    relationField: "carrierId",
    collections: {
      shipment: "shipments",
      shipments: "shipments",
      "freight-shipment": "shipments",
      "freight-shipments": "shipments",
      "freight-rate": "freight_rates",
      "freight-rates": "freight_rates",
      rate: "freight_rates",
      rates: "freight_rates",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "shipment",
    relationFlag: "shipment-id",
    relationField: "shipmentId",
    collections: {
      leg: "shipment_legs",
      legs: "shipment_legs",
      "shipment-leg": "shipment_legs",
      "shipment-legs": "shipment_legs",
      "freight-leg": "shipment_legs",
      "freight-legs": "shipment_legs",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "control",
    relationFlag: "control-id",
    relationField: "controlId",
    collections: {
      assessment: "control_assessments",
      assessments: "control_assessments",
      "control-assessment": "control_assessments",
      "control-assessments": "control_assessments",
      finding: "compliance_findings",
      findings: "compliance_findings",
      "compliance-finding": "compliance_findings",
      "compliance-findings": "compliance_findings",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "obligation",
    relationFlag: "obligation-id",
    relationField: "obligationId",
    collections: {
      control: "compliance_controls",
      controls: "compliance_controls",
      "compliance-control": "compliance_controls",
      "compliance-controls": "compliance_controls",
      finding: "compliance_findings",
      findings: "compliance_findings",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "agency",
    relationFlag: "agency-id",
    relationField: "agencyId",
    collections: {
      "public-case": "public_cases",
      "public-cases": "public_cases",
      "government-case": "public_cases",
      "government-cases": "public_cases",
      permit: "permits",
      permits: "permits",
      "public-filing": "public_filings",
      "public-filings": "public_filings",
      filing: "public_filings",
      filings: "public_filings",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "public-case",
    relationFlag: "public-case-id",
    relationField: "publicCaseId",
    collections: {
      permit: "permits",
      permits: "permits",
      "public-filing": "public_filings",
      "public-filings": "public_filings",
      filing: "public_filings",
      filings: "public_filings",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "product-spec",
    relationFlag: "product-spec-id",
    relationField: "productSpecId",
    collections: {
      revision: "product_revisions",
      revisions: "product_revisions",
      "product-revision": "product_revisions",
      "product-revisions": "product_revisions",
      requirement: "product_requirements",
      requirements: "product_requirements",
      "product-requirement": "product_requirements",
      "product-requirements": "product_requirements",
      bom: "product_boms",
      boms: "product_boms",
      "product-bom": "product_boms",
      "product-boms": "product_boms",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "drug-product",
    relationFlag: "drug-product-id",
    relationField: "drugProductId",
    collections: {
      batch: "batch_records",
      batches: "batch_records",
      "batch-record": "batch_records",
      "batch-records": "batch_records",
      "lot-release": "lot_releases",
      "lot-releases": "lot_releases",
      release: "lot_releases",
      releases: "lot_releases",
      "adverse-event": "adverse_events",
      "adverse-events": "adverse_events",
      "safety-event": "adverse_events",
      "safety-events": "adverse_events",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "content-entry",
    relationFlag: "content-entry-id",
    relationField: "contentEntryId",
    collections: {
      revision: "content_revisions",
      revisions: "content_revisions",
      variant: "content_variants",
      variants: "content_variants",
      approval: "content_approvals",
      approvals: "content_approvals",
      publication: "content_publications",
      publications: "content_publications",
      publish: "content_publications",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "thing",
    relationFlag: "thing-id",
    relationField: "thingId",
    collections: {
      device: "iot_devices",
      devices: "iot_devices",
      "iot-device": "iot_devices",
      "iot-devices": "iot_devices",
      reading: "sensor_readings",
      readings: "sensor_readings",
      "sensor-reading": "sensor_readings",
      "sensor-readings": "sensor_readings",
      command: "device_commands",
      commands: "device_commands",
      "device-command": "device_commands",
      "device-commands": "device_commands",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "construction-project",
    relationFlag: "project-id",
    relationField: "projectId",
    collections: {
      site: "construction_sites",
      sites: "construction_sites",
      "construction-site": "construction_sites",
      "construction-sites": "construction_sites",
      rfi: "construction_rfis",
      rfis: "construction_rfis",
      "construction-rfi": "construction_rfis",
      "construction-rfis": "construction_rfis",
      "change-order": "construction_change_orders",
      "change-orders": "construction_change_orders",
      "construction-change-order": "construction_change_orders",
      "construction-change-orders": "construction_change_orders",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "lab-notebook",
    relationFlag: "notebook-id",
    relationField: "notebookId",
    collections: {
      entry: "notebook_entries",
      entries: "notebook_entries",
      "notebook-entry": "notebook_entries",
      "notebook-entries": "notebook_entries",
      "eln-entry": "notebook_entries",
      "eln-entries": "notebook_entries",
      "protocol-run": "protocol_runs",
      "protocol-runs": "protocol_runs",
      run: "protocol_runs",
      runs: "protocol_runs",
      observation: "experiment_observations",
      observations: "experiment_observations",
      "experiment-observation": "experiment_observations",
      "experiment-observations": "experiment_observations",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "protocol-run",
    relationFlag: "protocol-run-id",
    relationField: "protocolRunId",
    collections: {
      observation: "experiment_observations",
      observations: "experiment_observations",
      "experiment-observation": "experiment_observations",
      "experiment-observations": "experiment_observations",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "iot-device",
    relationFlag: "device-id",
    relationField: "deviceId",
    collections: {
      reading: "sensor_readings",
      readings: "sensor_readings",
      "sensor-reading": "sensor_readings",
      "sensor-readings": "sensor_readings",
      command: "device_commands",
      commands: "device_commands",
      "device-command": "device_commands",
      "device-commands": "device_commands",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "sample",
    relationFlag: "sample-id",
    relationField: "sampleId",
    collections: {
      assay: "assays",
      assays: "assays",
      test: "assays",
      tests: "assays",
    },
  });
}

function nestedParentDbRoute(input: ProfessionalRecordsCliInput, config: {
  parentCommand: string;
  relationFlag: string;
  relationField: string;
  collections: Record<string, string>;
}): Parameters<typeof runMagicDbCli>[0] | null {
  if (input.positionals[0] !== config.parentCommand) return null;
  const patientId = input.positionals[1];
  const noun = input.positionals[2];
  const action = input.positionals[3];
  if (!patientId || !noun || !action) return null;

  const collectionName = config.collections[noun];
  if (!collectionName) return null;
  const dbAction = action === "add" ? "create" : action;
  if (!CRUD_ACTIONS.has(action) || dbAction === "purge") return null;

  const routeFlags = dbAction === "create"
    ? { ...input.flags, [config.relationFlag]: input.flags[config.relationFlag] ?? patientId }
    : { ...input.flags, filter: input.flags.filter ?? JSON.stringify({ [config.relationField]: patientId }) };
  const flags = denseDbFlags(routeFlags, collectionName);

  return {
    argv: input.argv,
    positionals: [config.parentCommand, collectionName, dbAction, ...input.positionals.slice(4)],
    flags,
    workspaceRoot: input.workspaceRoot,
    stdout: input.context.stdout,
    stderr: input.context.stderr,
    wantsJson: input.wantsJson,
    binName: input.binName,
  };
}

function isProfessionalRecordsCommandGroup(group: string): boolean {
  if (collectionForFoundationRoute(group)) return true;
  return clawProfessionalRecordsOsRegistry.systems.some((system) =>
    system.canonicalCommand === group
    || system.aliases.includes(group)
    || system.centers.some((center) => center.commandNoun === group || center.commandAliases.includes(group))
  );
}

function denseRegistryPayload(systemId: string | undefined, group: string, action: string) {
  const system = systemId ? findClawProfessionalRecordsSystem(systemId) : undefined;
  const systems = system ? [system] : clawProfessionalRecordsOsRegistry.systems.filter((entry) => entry.canonicalCommand === group || entry.aliases.includes(group));
  return {
    action,
    systems,
    statuses: clawProfessionalRecordsOsRegistry.intentStatuses,
    standardCollectionActions: clawProfessionalRecordsOsRegistry.standardCollectionActions,
    routeRejectionReasons: clawProfessionalRecordsOsRegistry.routeRejectionReasons,
    foundationPrimitives: clawProfessionalRecordsOsRegistry.foundationPrimitives,
  };
}

function renderDenseInspection(registry: ReturnType<typeof denseRegistryPayload>): string {
  const rows = registry.systems.map((system) => ({
    id: system.id,
    command: system.canonicalCommand,
    wave: system.wave,
    centers: system.centers.map((center) => center.commandNoun).join(", "),
  }));
  return `${formatCliTable(rows)}\n`;
}

function renderDenseSemanticView(view: { id: string; label: string; operationId: string; requiredInputs: string[]; outputShape: string; createsOrReads: string[] }): string {
  return `${formatCliTable([{
    id: view.id,
    operation: view.operationId,
    inputs: view.requiredInputs.join(", "),
    data: view.createsOrReads.join(", "),
  }])}\n`;
}
