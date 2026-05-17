import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertClawDenseDataOsRegistryComplete,
  BUILTIN_COLLECTIONS_BY_NAME,
  clawDenseDataAcceptanceFixture,
  clawDenseDataOsRegistry,
  listClawDenseDataIntentEntries,
  listClawDenseDataSemanticViewEntries,
  PRODUCTIVITY_COLLECTION_DEFINITIONS,
  resolveClawCliCommand,
} from "../packages/clawjs-core/src/index.ts";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const sourceConversationId = "019e35a1-06bb-77f2-a712-92ed2646bd15";
const sourcePlanId = "019e3659-0335-7811-9cda-c9d176e91515-plan";

const requiredDocs = [
  "docs/dense-data-decision-matrix.md",
  "docs/dense-data-source-decision-audit.md",
  "docs/dense-data-existing-catalog-audit.md",
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
  "manufacturing",
  "ops",
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
  "patient",
  "study",
  "sample",
  "legal_case",
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
];

const requiredExternalPending = [
  ["health", "regulated_export"],
  ["labs", "physical_device"],
  ["research", "provider"],
  ["erp", "cost_bearing"],
  ["ops", "provider"],
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

const requiredPluralIntentPhrases = [
  ["claw patients list", "patients"],
  ["claw companies list", "companies"],
  ["claw assays list", "assays"],
  ["claw assets list", "assets"],
  ["claw courses list", "courses"],
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

const sourceAudit = docTexts.get("docs/dense-data-source-decision-audit.md") ?? "";
const decisionMatrix = docTexts.get("docs/dense-data-decision-matrix.md") ?? "";
const existingCatalogAudit = docTexts.get("docs/dense-data-existing-catalog-audit.md") ?? "";

requireText("source audit", sourceAudit, sourceConversationId);
requireText("source audit", sourceAudit, sourcePlanId);
requireText("decision matrix", decisionMatrix, sourceConversationId);
requireText("decision matrix", decisionMatrix, sourcePlanId);
requireText("decision matrix", decisionMatrix, "Dense Data Source Decision Audit");

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
  "dense-intents",
  "dense-views",
  "dense-fixtures",
  "claw dense-fixtures seed",
  "claw patient patient_123 timeline",
  "claw patients list",
  "claw companies list",
  "claw assays list",
  "claw study study_123 timeline",
  "claw case case_123 timeline",
  "claw service service_123 timeline",
  "claw sample sample_123 timeline",
  "claw experiment experiment_123 timeline",
  "claw learner learner_123 timeline",
  "claw course course_123 timeline",
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
]) {
  requireText("existing catalog audit", existingCatalogAudit, requiredPhrase);
}

try {
  assertClawDenseDataOsRegistryComplete();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

if (clawDenseDataOsRegistry.sourceConversationId !== sourceConversationId) {
  fail("dense registry sourceConversationId drifted");
}
if (clawDenseDataOsRegistry.sourcePlanId !== sourcePlanId) {
  fail("dense registry sourcePlanId drifted");
}

const canonicalCollections = new Set([
  ...BUILTIN_COLLECTIONS_BY_NAME.keys(),
  ...PRODUCTIVITY_COLLECTION_DEFINITIONS.map((collection) => collection.name),
]);

for (const [primitive, collectionName] of Object.entries(requiredFoundationMappings)) {
  if (clawDenseDataOsRegistry.foundationCollections[primitive] !== collectionName) {
    fail(`foundation primitive ${primitive} must map to ${collectionName}`);
  }
  if (!canonicalCollections.has(collectionName)) {
    fail(`foundation primitive ${primitive} maps to non-canonical collection ${collectionName}`);
  }
}

for (const systemId of requiredFirstWaveSystems) {
  const system = clawDenseDataOsRegistry.systems.find((entry) => entry.id === systemId);
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

const intents = listClawDenseDataIntentEntries();
const semanticViews = listClawDenseDataSemanticViewEntries();

if (!intents.some((entry) => entry.phrase === "claw patient list" && entry.status === "covered" && entry.collectionName === "patients")) {
  fail("generated intents must cover claw patient list against patients");
}
if (!intents.some((entry) => entry.phrase === "claw encounter list" && entry.status === "workflow_gap")) {
  fail("generated intents must keep claw encounter list as an explicit workflow_gap");
}
if (!intents.some((entry) => entry.phrase === "claw health gaps" && entry.status === "covered")) {
  fail("generated intents must cover claw health gaps");
}
for (const [phrase, collectionName] of requiredPluralIntentPhrases) {
  if (!intents.some((entry) => entry.phrase === phrase && entry.status === "covered" && entry.collectionName === collectionName)) {
    fail(`generated intents must cover plural alias ${phrase} against ${collectionName}`);
  }
}
if (!semanticViews.some((entry) => entry.id === "patient.timeline" && entry.systemId === "health")) {
  fail("semantic views must include patient.timeline");
}
if (!semanticViews.some((entry) => entry.id === "study.timeline" && entry.systemId === "research")) {
  fail("semantic views must include study.timeline");
}
if (!semanticViews.some((entry) => entry.id === "case.timeline" && entry.systemId === "legal")) {
  fail("semantic views must include case.timeline");
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

const fixtureCoverage = new Set(clawDenseDataAcceptanceFixture.records.flatMap((record) => record.covers));
for (const coverage of requiredFixtureCoverage) {
  if (!fixtureCoverage.has(coverage)) fail(`acceptance fixture missing ${coverage}`);
}

for (const record of clawDenseDataAcceptanceFixture.records) {
  if (!canonicalCollections.has(record.collectionName)) {
    fail(`acceptance fixture record ${record.id} uses non-canonical collection ${record.collectionName}`);
  }
}

for (const [systemId, requirementType] of requiredExternalPending) {
  if (!clawDenseDataOsRegistry.externalPendingRequirements.some((entry) => entry.systemId === systemId && entry.requirementType === requirementType && entry.status === "external_pending")) {
    fail(`missing external_pending requirement for ${systemId}/${requirementType}`);
  }
}

if (failures.length > 0) {
  console.error("Dense data goal verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`dense data goal verification passed (${sourceDecisionIds.size} source decisions, ${matrixDecisionIds.size} matrix rows, ${requiredFirstWaveSystems.length} first-wave systems)`);
