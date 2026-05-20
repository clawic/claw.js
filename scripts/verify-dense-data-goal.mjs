import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertClawProfessionalRecordsOsRegistryComplete,
  BUILTIN_COLLECTIONS,
  BUILTIN_COLLECTIONS_BY_NAME,
  clawProfessionalRecordsAcceptanceFixture,
  clawProfessionalRecordsOsRegistry,
  listClawProfessionalRecordsGapRegistryEntries,
  listClawProfessionalRecordsIntentEntries,
  listClawProfessionalRecordsSemanticViewEntries,
  resolveClawProfessionalRecordsIntent,
  resolveClawCliCommandIntent,
  resolveBuiltinCollectionName,
  PRODUCTIVITY_COLLECTION_DEFINITIONS,
  resolveClawCliCommand,
} from "../packages/clawjs-core/src/index.ts";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const sourceConversationId = "019e35a1-06bb-77f2-a712-92ed2646bd15";
const sourcePlanId = "019e3659-0335-7811-9cda-c9d176e91515-plan";

const requiredDocs = [
  "docs/governance/dense-data/completion.md",
  "docs/governance/dense-data/decision-matrix.md",
  "docs/governance/dense-data/source-audit.md",
  "docs/governance/dense-data/existing-catalog-audit.md",
  "docs/adr/0021-dense-data-operating-system.md",
  "docs/cli.md",
  "docs/decision-map.md",
];

const requiredFirstWaveSystems = [
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
  "supply_chain",
  "transport",
  "compliance",
  "government",
  "iot",
  "construction",
  "eln",
  "content",
  "product",
  "pharma",
];

const requiredRoadmapSystems = [
  "energy_utilities",
  "telecom",
  "hospitality",
  "agriculture",
  "nonprofit",
  "media_production",
  "aerospace",
  "banking",
  "public_safety",
];

const requiredFoundationMappings = {
  identity_base: "people",
  domain_roles: "domain_roles",
  typed_profiles: "domain_profiles",
  evidence_sources: "evidence_sources",
  provenance_events: "provenance_events",
  quality_gaps: "quality_gaps",
  canonical_operations: "canonical_operations",
  semantic_views: "semantic_views",
  domain_systems: "domain_systems",
  domain_packs: "domain_packs",
  domain_intents: "domain_intents",
  vocabularies: "vocabularies",
  concepts: "concepts",
  concept_mappings: "concept_mappings",
  units: "units",
  instruments: "instruments",
  instrument_items: "instrument_items",
  instrument_responses: "instrument_responses",
  universal_relations: "entity_relations",
};

const requiredFixtureCoverage = [
  "person",
  "shared_identity",
  "identity_base",
  "no_duplicate_identity",
  "patient_person_link",
  "participant_person_link",
  "legal_client_person_link",
  "learner_person_link",
  "employee_person_link",
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
  "supply_plan",
  "supply_plan_item",
  "supply_risk",
  "carrier",
  "shipment",
  "shipment_leg",
  "freight_rate",
  "compliance_obligation",
  "control",
  "control_assessment",
  "compliance_finding",
  "agency",
  "public_case",
  "permit",
  "public_filing",
  "product_spec",
  "product_revision",
  "product_requirement",
  "product_bom",
  "drug_product",
  "batch_record",
  "lot_release",
  "adverse_event",
  "content_brand",
  "content_destination",
  "content_campaign",
  "content_entry",
  "content_revision",
  "content_variant",
  "content_approval",
  "content_publication",
  "thing",
  "iot_device",
  "sensor_reading",
  "device_command",
  "construction_project",
  "construction_site",
  "construction_rfi",
  "construction_change_order",
  "lab_notebook",
  "notebook_entry",
  "protocol_run",
  "experiment_observation",
  "invoice",
  "invoice_company",
  "incident",
  "service",
  "learner",
  "course",
  "lesson",
  "study_session",
  "entity_relation",
  "company_timeline",
  "asset",
  "product_catalog",
  "asset_timeline",
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
];

const requiredExternalPending = [
  ["health", "regulated_export"],
  ["labs", "physical_device"],
  ["research", "provider"],
  ["legal", "regulated_export"],
  ["finance", "regulated_export"],
  ["education", "regulated_export"],
  ["hr", "regulated_export"],
  ["real_estate", "regulated_export"],
  ["insurance", "regulated_export"],
  ["compliance", "regulated_export"],
  ["government", "regulated_export"],
  ["banking", "cost_bearing"],
  ["public_safety", "provider"],
  ["erp", "cost_bearing"],
  ["ops", "provider"],
  ["iot", "physical_device"],
  ["eln", "regulated_export"],
  ["pharma", "regulated_export"],
  ["content", "provider"],
];

const requiredRegulatedDenseSystems = [
  ["health", ["health"]],
  ["research", ["labs_research"]],
  ["biology", ["labs_research"]],
  ["labs", ["labs_research"]],
  ["legal", ["legal"]],
  ["erp", ["finance", "billing_payments"]],
  ["finance", ["finance"]],
  ["education", ["education", "minors"]],
  ["hr", ["hr_employment"]],
  ["real_estate", ["housing_real_estate"]],
  ["insurance", ["insurance"]],
  ["maintenance", ["vehicles_transport"]],
  ["compliance", ["compliance_grc"]],
  ["government", ["government_public_services"]],
  ["iot", ["iot_physical_actions"]],
  ["pharma", ["pharma"]],
  ["banking", ["banking", "finance"]],
  ["public_safety", ["government_public_services"]],
];

const requiredCompletionAuditRows = [
  "GA-001",
  "GA-002",
  "GA-003",
  "GA-004",
  "GA-005",
  "GA-006",
  "GA-007",
  "GA-008",
  "GA-009",
  "GA-010",
  "GA-011",
  "GA-012",
  "GA-013",
  "GA-014",
  "GA-015",
  "GA-016",
  "GA-017",
  "GA-018",
];

const requiredExistingAuditSurfaces = [
  "Notes, pages, page blocks, comments, mentions, and record notes",
  "Knowledge entities and facts",
  "Knowledge graph relations",
  "Associations and custom fields",
  "Signals and observations",
  "Attachments, files, documents, and raw imports",
  "CRM companies, accounts, contacts, leads, deals, activities, and assets",
  "Billing customers, invoices, payments, subscriptions, prices, and ledger-like records",
  "ERP",
  "Infra, observability, monitor, and ops",
  "Identity, actors, roles, and teams",
];

const requiredExistingIntegrationIds = [
  "notes_pages_record_notes",
  "knowledge_entities_facts",
  "knowledge_graph_relations",
  "associations_custom_fields",
  "signals_observations",
  "attachments_files_documents_imports",
  "crm_collections",
  "billing_finance_collections",
  "erp_orchestrator",
  "infra_observability_monitor_ops",
  "identity_actors_roles_teams",
];

const requiredPluralIntentPhrases = [
  ["claw patients list", "patients"],
  ["claw encounters list", "encounters"],
  ["claw companies list", "companies"],
  ["claw products list", "products_catalog"],
  ["claw assays list", "assays"],
  ["claw assets list", "assets"],
  ["claw courses list", "courses"],
  ["claw legal-clients list", "legal_clients"],
  ["claw employees list", "employees"],
  ["claw properties list", "property_listings"],
  ["claw insurance-policies list", "insurance_policies"],
  ["claw vehicles list", "vehicles"],
  ["claw suppliers list", "suppliers"],
  ["claw purchase-orders list", "purchase_orders"],
  ["claw warehouses list", "warehouses"],
  ["claw inventory-items list", "inventory_items"],
  ["claw supply-plans list", "supply_plans"],
  ["claw supply-plan-items list", "supply_plan_items"],
  ["claw supply-risks list", "supply_risks"],
  ["claw carriers list", "carriers"],
  ["claw shipments list", "shipments"],
  ["claw shipment-legs list", "shipment_legs"],
  ["claw freight-rates list", "freight_rates"],
  ["claw controls list", "compliance_controls"],
  ["claw obligations list", "compliance_obligations"],
  ["claw control-assessments list", "control_assessments"],
  ["claw compliance-findings list", "compliance_findings"],
  ["claw agencies list", "agencies"],
  ["claw public-cases list", "public_cases"],
  ["claw permits list", "permits"],
  ["claw public-filings list", "public_filings"],
  ["claw product-specs list", "product_specs"],
  ["claw product-revisions list", "product_revisions"],
  ["claw product-requirements list", "product_requirements"],
  ["claw product-boms list", "product_boms"],
  ["claw drug-products list", "drug_products"],
  ["claw batch-records list", "batch_records"],
  ["claw lot-releases list", "lot_releases"],
  ["claw adverse-events list", "adverse_events"],
  ["claw content-brands list", "content_brands"],
  ["claw content-destinations list", "content_destinations"],
  ["claw content-campaigns list", "content_campaigns"],
  ["claw content-entries list", "content_entries"],
  ["claw content-revisions list", "content_revisions"],
  ["claw content-variants list", "content_variants"],
  ["claw content-approvals list", "content_approvals"],
  ["claw content-publications list", "content_publications"],
  ["claw things list", "iot_things"],
  ["claw iot-devices list", "iot_devices"],
  ["claw sensor-readings list", "sensor_readings"],
  ["claw device-commands list", "device_commands"],
  ["claw construction-projects list", "construction_projects"],
  ["claw construction-sites list", "construction_sites"],
  ["claw construction-rfis list", "construction_rfis"],
  ["claw construction-change-orders list", "construction_change_orders"],
  ["claw lab-notebooks list", "lab_notebooks"],
  ["claw notebook-entries list", "notebook_entries"],
  ["claw protocol-runs list", "protocol_runs"],
  ["claw experiment-observations list", "experiment_observations"],
];

const failures = [];

function fail(message) {
  failures.push(message);
}

function absolutePath(relativePath) {
  return path.join(rootDir, relativePath);
}

function readRequired(relativePath) {
  const fullPath = absolutePath(relativePath);
  if (!fs.existsSync(fullPath)) {
    fail(`missing required file ${relativePath}`);
    return "";
  }
  return fs.readFileSync(fullPath, "utf8");
}

function extractTableIds(text, prefix) {
  return new Set([...text.matchAll(new RegExp(`\\|\\s*(${prefix}-\\d{3})\\s*\\|`, "g"))].map((match) => match[1]));
}

function requireText(label, text, needle) {
  if (!text.includes(needle)) fail(`${label} must include ${needle}`);
}

const docTexts = new Map(requiredDocs.map((relativePath) => [relativePath, readRequired(relativePath)]));
const docCorpus = [...docTexts.values()].join("\n\n");

for (const [relativePath, text] of docTexts) {
  if (/\/Users\/|rollout-\d{4}-\d{2}-\d{2}T/.test(text)) {
    fail(`${relativePath} must not include private local session paths`);
  }
}

const sourceAudit = docTexts.get("docs/governance/dense-data/source-audit.md") ?? "";
const decisionMatrix = docTexts.get("docs/governance/dense-data/decision-matrix.md") ?? "";
const completionAudit = docTexts.get("docs/governance/dense-data/completion.md") ?? "";
const existingCatalogAudit = docTexts.get("docs/governance/dense-data/existing-catalog-audit.md") ?? "";
const cliDiscoveryTest = readRequired("packages/clawjs/src/cli-discovery.test.ts");

requireText("completion audit", completionAudit, sourceConversationId);
requireText("completion audit", completionAudit, sourcePlanId);
requireText("source audit", sourceAudit, sourceConversationId);
requireText("source audit", sourceAudit, sourcePlanId);
requireText("decision matrix", decisionMatrix, sourceConversationId);
requireText("decision matrix", decisionMatrix, sourcePlanId);
requireText("decision matrix", decisionMatrix, "Dense Data Source Decision Audit");

const completionAuditIds = extractTableIds(completionAudit, "GA");
for (const id of requiredCompletionAuditRows) {
  if (!completionAuditIds.has(id)) fail(`dense completion audit missing ${id}`);
}
for (const requiredPhrase of [
  "goal remains active",
  "in_progress",
  "implemented",
  "external_pending",
  "source session",
  "core.sqlite",
  "top-level human CLI nouns",
  "EXTERNAL PENDING",
  "materialized timelines/overviews",
  "no-parallel-system",
  "every graduated center noun and alias",
]) {
  requireText("completion audit", completionAudit, requiredPhrase);
}
requireText("CLI discovery test", cliDiscoveryTest, "every graduated dense-data noun and alias");
requireText("CLI discovery test", cliDiscoveryTest, "must route through the shared database");
requireText("CLI discovery test", cliDiscoveryTest, "must be a dense-data semantic route");
requireText("CLI discovery test", cliDiscoveryTest, "high-value dense-data alternate routes");
requireText("CLI discovery test", cliDiscoveryTest, "patient.medications");
requireText("CLI discovery test", cliDiscoveryTest, "study.cohort");
requireText("CLI discovery test", cliDiscoveryTest, "case.evidence");

const sourceDecisionIds = extractTableIds(sourceAudit, "DQ");
for (let index = 1; index <= 18; index += 1) {
  const id = `DQ-${String(index).padStart(3, "0")}`;
  if (!sourceDecisionIds.has(id)) fail(`source decision audit missing ${id}`);
}

const matrixDecisionIds = extractTableIds(decisionMatrix, "DD");
for (let index = 1; index <= 11; index += 1) {
  const id = `DD-${String(index).padStart(3, "0")}`;
  if (!matrixDecisionIds.has(id)) fail(`dense decision matrix missing ${id}`);
}

for (const phrase of [
  "claw inspect dense-data",
  "dense-gaps",
  "dense-intents",
  "dense-views",
  "dense-fixtures",
  "claw dense-fixtures seed",
  "claw patient patient_123 timeline",
  "claw patient patient_123 encounter add",
  "claw patient patient_123 encounters list",
  "claw encounter add --patient patient_123",
  "claw patient patient_123 lab add",
  "claw patient patient_123 labs list",
  "claw lab add --patient patient_123",
  "claw patients list",
  "claw companies list",
  "claw assays list",
  "claw product list",
  "claw study study_123 timeline",
  "claw case case_123 client add",
  "claw case case_123 clients list",
  "claw legal-client add --case case_123",
  "claw case case_123 timeline",
  "claw service service_123 timeline",
  "claw sample sample_123 timeline",
  "claw experiment experiment_123 timeline",
  "claw learner learner_123 timeline",
  "claw course course_123 timeline",
  "claw employee create",
  "claw employee employee_123 time-off add",
  "claw employee employee_123 reviews list",
  "claw time-off add --employee employee_123",
  "claw employee employee_123 timeline",
  "claw property create",
  "claw property property_123 visits list",
  "claw property property_123 offer add",
  "claw property-offer add --property property_123",
  "claw property property_123 timeline",
  "claw insurance-policy create",
  "claw insurance-policy insurance_policy_123 timeline",
  "claw vehicle-insurance-policy add --vehicle vehicle_123",
  "claw vehicle vehicle_123 maintenance add",
  "claw vehicle-maintenance add --vehicle vehicle_123",
  "claw appliance appliance_123 maintenance add",
  "claw appliance-maintenance add --appliance appliance_123",
  "claw vehicle vehicle_123 timeline",
  "claw supplier supplier_123 purchase-orders add",
  "claw purchase-order purchase_order_123 line-items add",
  "claw purchase-order purchase_order_123 timeline",
  "claw warehouse warehouse_123 inventory-items add",
  "claw inventory-item inventory_item_123 stock-movements add",
  "claw warehouse warehouse_123 timeline",
  "claw supply-plan supply_plan_123 items add",
  "claw supply-plan supply_plan_123 risks add",
  "claw supply-plan supply_plan_123 timeline",
  "claw carrier carrier_123 shipments add",
  "claw carrier carrier_123 freight-rates add",
  "claw shipment shipment_123 legs add",
  "claw shipment shipment_123 timeline",
  "claw control control_123 assessments add",
  "claw control control_123 findings add",
  "claw control control_123 timeline",
  "claw agency agency_123 public-cases add",
  "claw public-case public_case_123 filings add",
  "claw public-case public_case_123 permits add",
  "claw public-case public_case_123 timeline",
  "claw product-spec product_spec_123 revisions add",
  "claw product-spec product_spec_123 requirements add",
  "claw product-spec product_spec_123 boms add",
  "claw product-spec product_spec_123 timeline",
  "claw drug-product drug_product_123 batches add",
  "claw drug-product drug_product_123 lot-releases add",
  "claw drug-product drug_product_123 adverse-events add",
  "claw drug-product drug_product_123 timeline",
  "claw content-entry content_entry_123 revisions add",
  "claw content-entry content_entry_123 variants add",
  "claw content-entry content_entry_123 approvals add",
  "claw content-entry content_entry_123 publications add",
  "claw content-entry content_entry_123 timeline",
  "claw thing thing_123 devices add",
  "claw iot-device device_123 readings add",
  "claw iot-device device_123 commands add",
  "claw thing thing_123 timeline",
  "claw construction-project construction_project_123 sites add",
  "claw construction-project construction_project_123 rfis add",
  "claw construction-project construction_project_123 change-orders add",
  "claw construction-project construction_project_123 timeline",
  "claw lab-notebook lab_notebook_123 entries add",
  "claw lab-notebook lab_notebook_123 protocol-runs add",
  "claw protocol-run protocol_run_123 observations add",
  "claw lab-notebook lab_notebook_123 timeline",
  "claw patient <id> medications list",
  "claw study <id> cohort list",
  "claw case <id> evidence list",
  "claw company company_123 timeline",
  "claw asset asset_123 timeline",
  "claw work-order work_order_123 timeline",
  "claw erp company company_123 overview",
  "claw crm account account_123 overview",
  "claw finance entity financial_account_123 overview",
  "materialized_semantic_view",
  "core.sqlite",
  "entity_relations",
  "quality_gaps",
  "evidence_sources",
  "provenance_events",
]) {
  requireText("dense public docs", docCorpus, phrase);
}
if (!docCorpus.includes("EXTERNAL PENDING") && !docCorpus.includes("external_pending")) {
  fail("dense public docs must document EXTERNAL PENDING or external_pending");
}

for (const surface of requiredExistingAuditSurfaces) {
  const row = existingCatalogAudit.split("\n").find((line) => line.startsWith(`| ${surface} |`));
  if (!row) {
    fail(`existing catalog audit missing surface row: ${surface}`);
    continue;
  }
  const cells = row.split("|").map((cell) => cell.trim());
  if (cells.length < 6 || !cells[2] || !cells[3] || !cells[4]) {
    fail(`existing catalog audit row must include decision, owner, and follow-up gate: ${surface}`);
  }
}
for (const requiredPhrase of [
  "entity_relations",
  "evidence_sources",
  "provenance_events",
  "quality_gaps",
  "core",
  "sidecars",
  "clawProfessionalRecordsOsRegistry.existingSurfaceIntegrations",
]) {
  requireText("existing catalog audit", existingCatalogAudit, requiredPhrase);
}

try {
  assertClawProfessionalRecordsOsRegistryComplete();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

if (clawProfessionalRecordsOsRegistry.sourceConversationId !== sourceConversationId) {
  fail("dense registry sourceConversationId drifted");
}
if (clawProfessionalRecordsOsRegistry.sourcePlanId !== sourcePlanId) {
  fail("dense registry sourcePlanId drifted");
}

const canonicalCollections = new Set([
  ...BUILTIN_COLLECTIONS_BY_NAME.keys(),
  ...PRODUCTIVITY_COLLECTION_DEFINITIONS.map((collection) => collection.name),
]);

for (const [primitive, collectionName] of Object.entries(requiredFoundationMappings)) {
  if (clawProfessionalRecordsOsRegistry.foundationCollections[primitive] !== collectionName) {
    fail(`foundation primitive ${primitive} must map to ${collectionName}`);
  }
  if (!canonicalCollections.has(collectionName)) {
    fail(`foundation primitive ${primitive} maps to non-canonical collection ${collectionName}`);
  }
}

const existingIntegrationIds = new Set(clawProfessionalRecordsOsRegistry.existingSurfaceIntegrations.map((entry) => entry.id));
for (const integrationId of requiredExistingIntegrationIds) {
  if (!existingIntegrationIds.has(integrationId)) fail(`dense registry missing existing surface integration ${integrationId}`);
}
for (const integration of clawProfessionalRecordsOsRegistry.existingSurfaceIntegrations) {
  if (!requiredExistingAuditSurfaces.includes(integration.surface)) {
    fail(`existing surface integration ${integration.id} is not mirrored in the public audit table`);
  }
  if (!["reuse", "extend", "split", "replace", "retire"].includes(integration.disposition)) {
    fail(`existing surface integration ${integration.id} has invalid disposition ${integration.disposition}`);
  }
  if (!integration.canonicalOwner.trim()) fail(`existing surface integration ${integration.id} must declare a canonical owner`);
  if (!integration.followUpGate.trim()) fail(`existing surface integration ${integration.id} must declare a follow-up gate`);
  if (integration.sharedPrimitives.length === 0) fail(`existing surface integration ${integration.id} must declare shared primitives`);
  for (const primitive of integration.sharedPrimitives) {
    if (!Object.hasOwn(requiredFoundationMappings, primitive)) fail(`existing surface integration ${integration.id} references unknown primitive ${primitive}`);
  }
  for (const systemId of integration.denseSystems) {
    if (!clawProfessionalRecordsOsRegistry.systems.some((entry) => entry.id === systemId)) {
      fail(`existing surface integration ${integration.id} references missing system ${systemId}`);
    }
  }
}

for (const systemId of requiredFirstWaveSystems) {
  const system = clawProfessionalRecordsOsRegistry.systems.find((entry) => entry.id === systemId);
  if (!system) {
    fail(`missing first-wave system ${systemId}`);
    continue;
  }
  if (system.wave !== "first_wave") fail(`${systemId} must be first_wave`);
  if (!system.visiblePack) fail(`${systemId} must be a visible pack`);
  if (!system.orchestrator) fail(`${systemId} must be an orchestrator`);
  if (system.storagePolicy !== "core_sqlite") fail(`${systemId} must use core_sqlite`);
  if (system.centers.length < 2) fail(`${systemId} must define at least two centers`);
  if (system.operations.length === 0) fail(`${systemId} must define operations`);
  if (system.semanticViews.length === 0) fail(`${systemId} must define semantic views`);
}

for (const systemId of requiredRoadmapSystems) {
  const system = clawProfessionalRecordsOsRegistry.systems.find((entry) => entry.id === systemId);
  if (!system) {
    fail(`missing roadmap system ${systemId}`);
    continue;
  }
  if (system.wave !== "roadmap") fail(`${systemId} must be roadmap`);
  if (!system.visiblePack) fail(`${systemId} must be visible in the roadmap taxonomy`);
  if (!system.orchestrator) fail(`${systemId} must be modeled as a future orchestrator`);
  if (system.storagePolicy !== "core_sqlite") fail(`${systemId} must plan for core_sqlite`);
  if (system.centers.length === 0) fail(`${systemId} must define a roadmap center`);
  if (system.commandPatterns.length === 0) fail(`${systemId} must expose roadmap inspection routes`);
  if (system.semanticViews.length === 0) fail(`${systemId} must define a roadmap semantic view contract`);
}

const intents = listClawProfessionalRecordsIntentEntries();
const denseGaps = listClawProfessionalRecordsGapRegistryEntries();
const semanticViews = listClawProfessionalRecordsSemanticViewEntries();

if (!intents.some((entry) => entry.phrase === "claw patient list" && entry.status === "covered" && entry.collectionName === "patients")) {
  fail("generated intents must cover claw patient list against patients");
}
if (!intents.some((entry) => entry.phrase === "claw encounter list" && entry.status === "covered" && entry.collectionName === "encounters")) {
  fail("generated intents must cover claw encounter list against encounters");
}
if (!intents.some((entry) => entry.phrase === "claw health gaps" && entry.status === "covered")) {
  fail("generated intents must cover claw health gaps");
}
for (const status of ["partial", "workflow_gap", "data_gap", "external_pending", "blocked"]) {
  if (!denseGaps.some((entry) => entry.status === status)) fail(`dense gap registry must include ${status}`);
}
if (!denseGaps.some((entry) => entry.source === "intent" && entry.status === "workflow_gap" && entry.phrase === "claw utility-account list")) {
  fail("dense gap registry must expose roadmap workflow gaps");
}
if (!denseGaps.some((entry) => entry.source === "external_pending" && entry.requirementId === "external_pending_health_ehr_export")) {
  fail("dense gap registry must expose external pending requirements");
}
if (!denseGaps.some((entry) => entry.source === "policy" && entry.status === "blocked" && entry.command === "purge")) {
  fail("dense gap registry must expose restricted purge policy");
}
const collectionAliasIntent = resolveClawCliCommandIntent({ phrase: "lead list" });
if (collectionAliasIntent.status !== "covered" || collectionAliasIntent.intent.mappedCommand !== "db leads list") {
  fail("command intents must resolve audited collection alias lead list to db leads list");
}
for (const collection of BUILTIN_COLLECTIONS) {
  const aliases = collection.aliases ?? [];
  const preferredAlias = aliases.find((alias) => resolveBuiltinCollectionName(alias) === collection.name && !resolveClawCliCommand(alias))
    ?? aliases.find((alias) => resolveBuiltinCollectionName(alias) === collection.name)
    ?? collection.name;
  const resolution = resolveClawCliCommandIntent({ phrase: `${preferredAlias} list` });
  if (resolution.status !== "covered") {
    fail(`audited collection ${collection.name} must resolve top-level command ${preferredAlias} list as covered`);
  }
}
for (const [phrase, collectionName] of requiredPluralIntentPhrases) {
  if (!intents.some((entry) => entry.phrase === phrase && entry.status === "covered" && entry.collectionName === collectionName)) {
    fail(`generated intents must cover plural alias ${phrase} against ${collectionName}`);
  }
}
for (const system of clawProfessionalRecordsOsRegistry.systems) {
  for (const center of system.centers) {
    if (!center.collectionName) continue;
    if (!canonicalCollections.has(center.collectionName)) {
      fail(`${system.id}.${center.id} maps to non-canonical collection ${center.collectionName}`);
      continue;
    }
    for (const command of [center.commandNoun, ...center.commandAliases]) {
      for (const action of clawProfessionalRecordsOsRegistry.standardCollectionActions.filter((entry) => entry !== "purge")) {
        const phrase = `claw ${command} ${action}`;
        if (!intents.some((entry) => entry.phrase === phrase && entry.status === "covered" && entry.collectionName === center.collectionName)) {
          fail(`generated intents must cover graduated center route ${phrase} against ${center.collectionName}`);
        }
      }
    }
  }
}
let multiRouteOperationCount = 0;
for (const system of clawProfessionalRecordsOsRegistry.systems) {
  for (const operation of system.operations) {
    if (operation.routes.length < 2) continue;
    multiRouteOperationCount += 1;
    for (const route of operation.routes) {
      const phrase = route.replace(/<[^>]+>/g, "fixture_id");
      const resolution = resolveClawProfessionalRecordsIntent(phrase);
      if (resolution.system?.id !== system.id || resolution.operation?.id !== operation.id) {
        fail(`operation route ${phrase} must resolve to ${system.id}/${operation.id}`);
      }
    }
  }
}
if (multiRouteOperationCount < 20) {
  fail("dense registry must prove at least 20 multi-route canonical operations");
}
if (!semanticViews.some((entry) => entry.id === "patient.timeline" && entry.systemId === "health")) {
  fail("semantic views must include patient.timeline");
}
if (!semanticViews.some((entry) => entry.id === "patient.medications" && entry.systemId === "health")) {
  fail("semantic views must include patient.medications");
}
if (!semanticViews.some((entry) => entry.id === "study.timeline" && entry.systemId === "research")) {
  fail("semantic views must include study.timeline");
}
if (!semanticViews.some((entry) => entry.id === "study.cohort" && entry.systemId === "research")) {
  fail("semantic views must include study.cohort");
}
if (!semanticViews.some((entry) => entry.id === "case.timeline" && entry.systemId === "legal")) {
  fail("semantic views must include case.timeline");
}
if (!semanticViews.some((entry) => entry.id === "case.evidence" && entry.systemId === "legal")) {
  fail("semantic views must include case.evidence");
}
if (!semanticViews.some((entry) => entry.id === "service.timeline" && entry.systemId === "ops")) {
  fail("semantic views must include service.timeline");
}
if (!semanticViews.some((entry) => entry.id === "sample.timeline" && entry.systemId === "labs")) {
  fail("semantic views must include sample.timeline");
}
if (!semanticViews.some((entry) => entry.id === "experiment.timeline" && entry.systemId === "biology")) {
  fail("semantic views must include experiment.timeline");
}
if (!semanticViews.some((entry) => entry.id === "learner.timeline" && entry.systemId === "education")) {
  fail("semantic views must include learner.timeline");
}
if (!semanticViews.some((entry) => entry.id === "course.timeline" && entry.systemId === "education")) {
  fail("semantic views must include course.timeline");
}
if (!semanticViews.some((entry) => entry.id === "employee.timeline" && entry.systemId === "hr")) {
  fail("semantic views must include employee.timeline");
}
if (!semanticViews.some((entry) => entry.id === "property.timeline" && entry.systemId === "real_estate")) {
  fail("semantic views must include property.timeline");
}
if (!semanticViews.some((entry) => entry.id === "insurance_policy.timeline" && entry.systemId === "insurance")) {
  fail("semantic views must include insurance_policy.timeline");
}
if (!semanticViews.some((entry) => entry.id === "vehicle.timeline" && entry.systemId === "maintenance")) {
  fail("semantic views must include vehicle.timeline");
}
if (!semanticViews.some((entry) => entry.id === "purchase_order.timeline" && entry.systemId === "procurement")) {
  fail("semantic views must include purchase_order.timeline");
}
if (!semanticViews.some((entry) => entry.id === "warehouse.timeline" && entry.systemId === "warehouse")) {
  fail("semantic views must include warehouse.timeline");
}
if (!semanticViews.some((entry) => entry.id === "supply_plan.timeline" && entry.systemId === "supply_chain")) {
  fail("semantic views must include supply_plan.timeline");
}
if (!semanticViews.some((entry) => entry.id === "shipment.timeline" && entry.systemId === "transport")) {
  fail("semantic views must include shipment.timeline");
}
if (!semanticViews.some((entry) => entry.id === "control.timeline" && entry.systemId === "compliance")) {
  fail("semantic views must include control.timeline");
}
if (!semanticViews.some((entry) => entry.id === "public_case.timeline" && entry.systemId === "government")) {
  fail("semantic views must include public_case.timeline");
}
if (!semanticViews.some((entry) => entry.id === "product_spec.timeline" && entry.systemId === "product")) {
  fail("semantic views must include product_spec.timeline");
}
if (!semanticViews.some((entry) => entry.id === "drug_product.timeline" && entry.systemId === "pharma")) {
  fail("semantic views must include drug_product.timeline");
}
if (!semanticViews.some((entry) => entry.id === "content_entry.timeline" && entry.systemId === "content")) {
  fail("semantic views must include content_entry.timeline");
}
if (!semanticViews.some((entry) => entry.id === "thing.timeline" && entry.systemId === "iot")) {
  fail("semantic views must include thing.timeline");
}
if (!semanticViews.some((entry) => entry.id === "construction_project.timeline" && entry.systemId === "construction")) {
  fail("semantic views must include construction_project.timeline");
}
if (!semanticViews.some((entry) => entry.id === "lab_notebook.timeline" && entry.systemId === "eln")) {
  fail("semantic views must include lab_notebook.timeline");
}
if (!semanticViews.some((entry) => entry.id === "work_order.timeline" && entry.systemId === "manufacturing")) {
  fail("semantic views must include work_order.timeline");
}
if (!semanticViews.some((entry) => entry.id === "company.timeline" && entry.systemId === "erp")) {
  fail("semantic views must include company.timeline");
}
if (!semanticViews.some((entry) => entry.id === "asset.timeline" && entry.systemId === "manufacturing")) {
  fail("semantic views must include asset.timeline");
}
if (!semanticViews.some((entry) => entry.id === "erp.company.overview" && entry.systemId === "erp")) {
  fail("semantic views must include erp.company.overview");
}
if (!semanticViews.some((entry) => entry.id === "crm.account.overview" && entry.systemId === "crm")) {
  fail("semantic views must include crm.account.overview");
}
if (!semanticViews.some((entry) => entry.id === "finance.entity.overview" && entry.systemId === "finance")) {
  fail("semantic views must include finance.entity.overview");
}
if (!semanticViews.some((entry) => entry.id === "invoice.list" && entry.systemId === "erp")) {
  fail("semantic views must include invoice.list");
}

const denseFixturesCommand = resolveClawCliCommand("dense-fixtures");
if (!denseFixturesCommand || denseFixturesCommand.source.file !== "packages/clawjs/src/cli-dense-data-command.ts") {
  fail("dense-fixtures command must be registered against cli-dense-data-command.ts");
}
if (resolveClawCliCommand("dense-fixture")?.target !== "dense-fixtures") {
  fail("dense-fixture alias must target dense-fixtures");
}

const fixtureCoverage = new Set(clawProfessionalRecordsAcceptanceFixture.records.flatMap((record) => record.covers));
for (const coverage of requiredFixtureCoverage) {
  if (!fixtureCoverage.has(coverage)) fail(`acceptance fixture missing ${coverage}`);
}

for (const [id, collectionName] of [
  ["fixture_person_ada", "people"],
  ["fixture_person_smith", "people"],
  ["fixture_relation_person_patient", "entity_relations"],
  ["fixture_relation_person_participant", "entity_relations"],
  ["fixture_relation_person_learner", "entity_relations"],
  ["fixture_relation_person_employee", "entity_relations"],
  ["fixture_relation_person_legal_client", "entity_relations"],
  ["fixture_domain_system_health", "domain_systems"],
  ["fixture_domain_pack_health_core", "domain_packs"],
  ["fixture_domain_role_health_patient", "domain_roles"],
  ["fixture_domain_profile_health_patient", "domain_profiles"],
  ["fixture_domain_profile_legal_legal_client", "domain_profiles"],
  ["fixture_domain_profile_hr_employee", "domain_profiles"],
  ["fixture_domain_profile_education_learner", "domain_profiles"],
  ["fixture_domain_profile_crm_account", "domain_profiles"],
  ["fixture_canonical_operation_health_patient_timeline", "canonical_operations"],
  ["fixture_semantic_view_health_patient_timeline", "semantic_views"],
]) {
  if (!clawProfessionalRecordsAcceptanceFixture.records.some((record) => record.id === id && record.collectionName === collectionName)) {
    fail(`acceptance fixture missing dense registry record ${id} in ${collectionName}`);
  }
}
const sharedIdentityRelations = clawProfessionalRecordsAcceptanceFixture.records.filter((record) => record.collectionName === "entity_relations" && record.covers.includes("shared_identity"));
for (const [targetKind, targetId] of [
  ["patients", "fixture_patient_ada"],
  ["participants", "fixture_participant_subject_001"],
  ["learners", "fixture_learner_ada"],
  ["employees", "fixture_employee_ada"],
]) {
  if (!sharedIdentityRelations.some((record) => record.data.fromEntityKind === "people" && record.data.fromEntityId === "fixture_person_ada" && record.data.toEntityKind === targetKind && record.data.toEntityId === targetId && record.data.type === "same_as")) {
    fail(`acceptance fixture must link fixture_person_ada to ${targetKind}/${targetId}`);
  }
}
if (!sharedIdentityRelations.some((record) => record.data.fromEntityId === "fixture_person_smith" && record.data.toEntityKind === "legal_clients" && record.data.toEntityId === "fixture_legal_client_smith" && record.data.type === "same_as")) {
  fail("acceptance fixture must link fixture_person_smith to legal client identity");
}
if (!clawProfessionalRecordsAcceptanceFixture.records.some((record) => record.collectionName === "domain_intents" && record.covers.includes("intent_coverage"))) {
  fail("acceptance fixture must materialize generated domain intents");
}

for (const record of clawProfessionalRecordsAcceptanceFixture.records) {
  if (!canonicalCollections.has(record.collectionName)) {
    fail(`acceptance fixture record ${record.id} uses non-canonical collection ${record.collectionName}`);
  }
}

for (const [systemId, requirementType] of requiredExternalPending) {
  if (!clawProfessionalRecordsOsRegistry.externalPendingRequirements.some((entry) => entry.systemId === systemId && entry.requirementType === requirementType && entry.status === "external_pending")) {
    fail(`missing external_pending requirement for ${systemId}/${requirementType}`);
  }
}

for (const [systemId, regulatedDomains] of requiredRegulatedDenseSystems) {
  const system = clawProfessionalRecordsOsRegistry.systems.find((entry) => entry.id === systemId);
  if (!system) {
    fail(`missing regulated dense system ${systemId}`);
    continue;
  }
  if (JSON.stringify(system.regulatedDomains) !== JSON.stringify(regulatedDomains)) {
    fail(`regulated dense system ${systemId} must map to ${regulatedDomains.join(",")}`);
  }
}

if (failures.length > 0) {
  console.error("Dense data goal verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`dense data goal verification passed (${sourceDecisionIds.size} source decisions, ${matrixDecisionIds.size} matrix rows, ${requiredFirstWaveSystems.length} first-wave systems)`);
