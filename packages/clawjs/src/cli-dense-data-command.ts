import {
  clawDenseDataAcceptanceFixture,
  clawDenseDataOsRegistry,
  findClawDenseDataSystem,
  listClawDenseDataSemanticViewEntries,
  resolveBuiltinCollectionName,
  resolveClawDenseDataIntent,
} from "@clawjs/core";
import fs from "fs";
import path from "path";

import { CLI_EXIT_DEGRADED, CLI_EXIT_OK } from "./cli-errors.ts";
import { formatCliTable } from "./cli-flag-parsers.ts";
import { writeJsonOk } from "./cli-json.ts";
import { runMagicDbCli } from "./database-magic.ts";
import { openMainDataStore } from "./v1-data.ts";

interface DenseDataCliInput {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: {
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
  };
  wantsJson: boolean;
  binName: string;
  workspaceRoot: string;
}

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

export async function runDenseDataCli(input: DenseDataCliInput): Promise<number | null> {
  const phrase = input.positionals.join(" ");
  const group = input.positionals[0];
  const action = input.positionals[1];
  if (!group || !action) return null;
  if (DENSE_FIXTURE_COMMANDS.has(group)) return runDenseFixtureCli(input, action);
  const directSemanticView = semanticTimelineViewForRoute(input);
  if (directSemanticView) return writeDenseSemanticView(input, resolveClawDenseDataIntent(phrase), directSemanticView, group, action);
  if (!isDenseDataCommandGroup(group)) return null;

  const intent = resolveClawDenseDataIntent(phrase);
  const semanticView = intent.status === "data_gap" ? undefined : (semanticViewForIntent(intent) ?? semanticTimelineViewForRoute(input));
  if (semanticView) return writeDenseSemanticView(input, intent, semanticView, group, action);

  const foundationCollectionName = collectionForFoundationRoute(group);
  const foundationDbAction = action === "add" ? "create" : action;
  if (foundationCollectionName && CRUD_ACTIONS.has(action) && foundationDbAction !== "purge") {
    return await runMagicDbCli({
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
    return await runMagicDbCli(nestedRoute);
  }
  const collectionName = collectionForDenseRoute(input.positionals[0], intent.center?.collectionName);
  const dbAction = action === "add" ? "create" : action;
  if (collectionName && CRUD_ACTIONS.has(action) && dbAction !== "purge") {
    return await runMagicDbCli({
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
      denseData: true,
    });
  } else if (inspectionAction) {
    input.context.stdout.write(renderDenseInspection(payload.registry));
  } else {
    input.context.stderr.write(`Dense-data route known but not executable yet: ${input.binName} ${phrase}\n`);
    input.context.stderr.write(`${payload.gap?.nextStep}\n`);
  }

  return inspectionAction ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

function runDenseFixtureCli(input: DenseDataCliInput, action: string): number | null {
  if (action !== "seed") return null;
  const namespaceId = input.flags.namespace ?? "main";
  const dataDir = path.join(input.workspaceRoot, ".claw", "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const store = openMainDataStore({
    ...process.env,
    CLAW_DATA_DIR: dataDir,
  });
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });

  const seeded = clawDenseDataAcceptanceFixture.records.map((fixtureRecord) => {
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
    fixtureSetId: clawDenseDataAcceptanceFixture.fixtureSetId,
    sourceConversationId: clawDenseDataAcceptanceFixture.sourceConversationId,
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
      denseData: true,
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

function semanticViewForIntent(intent: ReturnType<typeof resolveClawDenseDataIntent>) {
  if (!intent.system || !intent.operation) return undefined;
  return listClawDenseDataSemanticViewEntries().find((entry) => entry.systemId === intent.system?.id && entry.operationId === intent.operation?.id);
}

function semanticTimelineViewForRoute(input: DenseDataCliInput) {
  if (input.positionals[2] !== "timeline") return undefined;
  const group = input.positionals[0];
  if (!group) return undefined;
  return listClawDenseDataSemanticViewEntries().find((entry) => entry.commandPattern === `claw ${group} <id> timeline`);
}

function writeDenseSemanticView(
  input: DenseDataCliInput,
  intent: ReturnType<typeof resolveClawDenseDataIntent>,
  semanticView: NonNullable<ReturnType<typeof semanticTimelineViewForRoute>>,
  group: string,
  action: string,
): number {
  const materializedView = materializedSemanticViewForIntent(input, intent, semanticView);
  const recordsMaterialized = Boolean(materializedView);
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
      createsOrReads: intent.operation?.createsOrReads ?? [],
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
      denseData: true,
      semanticView: true,
    });
  } else {
    input.context.stdout.write(renderDenseSemanticView(payload.view));
  }
  return CLI_EXIT_OK;
}

function materializedSemanticViewForIntent(
  input: DenseDataCliInput,
  intent: ReturnType<typeof resolveClawDenseDataIntent>,
  semanticView: NonNullable<ReturnType<typeof semanticViewForIntent>>,
) {
  if (semanticView.id === "patient.timeline") return materializedPatientTimeline(input, intent, semanticView);
  if (semanticView.id === "case.timeline") return materializedCaseTimeline(input, intent, semanticView);
  if (semanticView.id === "service.timeline") return materializedServiceTimeline(input, intent, semanticView);
  if (semanticView.id === "study.timeline") return materializedStudyTimeline(input, intent, semanticView);
  if (semanticView.id === "sample.timeline") return materializedSampleTimeline(input, intent, semanticView);
  if (semanticView.id === "experiment.timeline") return materializedExperimentTimeline(input, intent, semanticView);
  if (semanticView.id === "work_order.timeline") return materializedWorkOrderTimeline(input, intent, semanticView);
  if (semanticView.id === "company.timeline") return materializedCompanyTimeline(input, intent, semanticView);
  if (semanticView.id === "erp.company.overview") return materializedErpCompanyOverview(input, intent, semanticView);
  if (semanticView.id === "crm.account.overview") return materializedCrmAccountOverview(input, intent, semanticView);
  if (semanticView.id === "finance.entity.overview") return materializedFinanceEntityOverview(input, intent, semanticView);
  if (semanticView.id === "learner.timeline") return materializedLearnerTimeline(input, intent, semanticView);
  if (semanticView.id === "course.timeline") return materializedCourseTimeline(input, intent, semanticView);
  if (semanticView.id === "employee.timeline") return materializedEmployeeTimeline(input, intent, semanticView);
  if (semanticView.id === "asset.timeline") return materializedAssetTimeline(input, intent, semanticView);
  if (semanticView.id === "property.timeline") return materializedPropertyTimeline(input, intent, semanticView);
  if (semanticView.id === "insurance_policy.timeline") return materializedInsurancePolicyTimeline(input, intent, semanticView);
  if (semanticView.id === "vehicle.timeline") return materializedVehicleTimeline(input, intent, semanticView);
  if (semanticView.id === "purchase_order.timeline") return materializedPurchaseOrderTimeline(input, intent, semanticView);
  if (semanticView.id === "warehouse.timeline") return materializedWarehouseTimeline(input, intent, semanticView);
  if (semanticView.id === "supply_plan.timeline") return materializedSupplyPlanTimeline(input, intent, semanticView);
  if (semanticView.id === "control.timeline") return materializedControlTimeline(input, intent, semanticView);
  if (semanticView.id === "thing.timeline") return materializedThingTimeline(input, intent, semanticView);
  if (semanticView.id === "construction_project.timeline") return materializedConstructionProjectTimeline(input, intent, semanticView);
  return undefined;
}

function materializedPatientTimeline(
  input: DenseDataCliInput,
  intent: ReturnType<typeof resolveClawDenseDataIntent>,
  semanticView: NonNullable<ReturnType<typeof semanticViewForIntent>>,
) {
  const patientId = input.positionals[1];
  if (!patientId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openDenseDataStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const patient = store.getRecord(namespaceId, "patients", patientId);
  if (!patient) return undefined;

  const encounters = store.listRecords(namespaceId, "encounters", { filter: { patientId } }).items;
  const medications = store.listRecords(namespaceId, "medications", { filter: { patientId } }).items;
  const symptoms = store.listRecords(namespaceId, "symptom_logs", { filter: { patientId } }).items;
  const labResults = store.listRecords(namespaceId, "lab_results", { filter: { patientId } }).items;
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "patients", recordId: patientId } }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "patients", targetId: patientId } }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "patients", targetId: patientId } }).items;
  const items = [
    timelineItem(patient, "patient", patient.id, patient.displayName ?? patient.id, patient.createdAt, patient),
    ...encounters.map((record) => timelineItem(record, "encounter", record.id, record.title ?? record.encounterType ?? record.id, record.startedAt ?? record.createdAt, record)),
    ...medications.map((record) => timelineItem(record, "medication", record.id, record.name ?? record.id, record.startedAt ?? record.createdAt, record)),
    ...symptoms.map((record) => timelineItem(record, "symptom", record.id, record.symptom ?? record.id, record.loggedAt ?? record.createdAt, record)),
    ...labResults.map((record) => timelineItem(record, "lab_result", record.id, record.title ?? record.lab ?? record.id, record.reportedAt ?? record.collectedAt ?? record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "patients", id: patient.id, label: patient.displayName ?? patient.id },
    itemCount: items.length,
    items,
    gaps: qualityGaps.map((record) => ({
      id: record.id,
      label: record.label,
      status: record.status,
      gapKind: record.gapKind,
      severity: record.severity,
      evidenceSourceId: record.evidenceSourceId,
    })),
    sourceCollections: ["patients", "encounters", "medications", "symptom_logs", "lab_results", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

function materializedCaseTimeline(
  input: DenseDataCliInput,
  intent: ReturnType<typeof resolveClawDenseDataIntent>,
  semanticView: NonNullable<ReturnType<typeof semanticViewForIntent>>,
) {
  const caseId = input.positionals[1];
  if (!caseId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openDenseDataStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const legalCase = store.getRecord(namespaceId, "legal_cases", caseId);
  if (!legalCase) return undefined;

  const clients = store.listRecords(namespaceId, "legal_clients", { filter: { caseId } }).items;
  const evidenceItems = store.listRecords(namespaceId, "case_evidence", { filter: { caseId } }).items;
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "legal_cases", recordId: caseId } }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "legal_cases", targetId: caseId } }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "legal_cases", targetId: caseId } }).items;
  const items = [
    timelineItem(legalCase, "case", legalCase.id, legalCase.title ?? legalCase.id, legalCase.openedAt ?? legalCase.createdAt, legalCase),
    ...clients.map((record) => timelineItem(record, "legal_client", record.id, record.displayName ?? record.id, record.openedAt ?? record.createdAt, record)),
    ...evidenceItems.map((record) => timelineItem(record, "case_evidence", record.id, record.title ?? record.id, record.observedAt ?? record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "legal_cases", id: legalCase.id, label: legalCase.title ?? legalCase.id },
    itemCount: items.length,
    items,
    gaps: qualityGaps.map((record) => ({
      id: record.id,
      label: record.label,
      status: record.status,
      gapKind: record.gapKind,
      severity: record.severity,
      evidenceSourceId: record.evidenceSourceId,
    })),
    sourceCollections: ["legal_cases", "legal_clients", "case_evidence", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

function materializedServiceTimeline(
  input: DenseDataCliInput,
  intent: ReturnType<typeof resolveClawDenseDataIntent>,
  semanticView: NonNullable<ReturnType<typeof semanticViewForIntent>>,
) {
  const serviceId = input.positionals[1];
  if (!serviceId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openDenseDataStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const service = store.getRecord(namespaceId, "services", serviceId);
  if (!service) return undefined;

  const incidents = store.listRecords(namespaceId, "incidents", { filter: { serviceId } }).items;
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "services", recordId: serviceId } }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "services", targetId: serviceId } }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "services", targetId: serviceId } }).items;
  const items = [
    timelineItem(service, "service", service.id, service.name ?? service.id, service.createdAt, service),
    ...incidents.map((record) => timelineItem(record, "incident", record.id, record.title ?? record.id, record.detectedAt ?? record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "services", id: service.id, label: service.name ?? service.id },
    itemCount: items.length,
    items,
    gaps: qualityGaps.map((record) => ({
      id: record.id,
      label: record.label,
      status: record.status,
      gapKind: record.gapKind,
      severity: record.severity,
      evidenceSourceId: record.evidenceSourceId,
    })),
    sourceCollections: ["services", "incidents", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

function materializedSampleTimeline(
  input: DenseDataCliInput,
  intent: ReturnType<typeof resolveClawDenseDataIntent>,
  semanticView: NonNullable<ReturnType<typeof semanticViewForIntent>>,
) {
  const sampleId = input.positionals[1];
  if (!sampleId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openDenseDataStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const sample = store.getRecord(namespaceId, "samples", sampleId);
  if (!sample) return undefined;

  const assays = store.listRecords(namespaceId, "assays", { filter: { sampleId } }).items;
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "samples", recordId: sampleId } }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "samples", targetId: sampleId } }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "samples", targetId: sampleId } }).items;
  const items = [
    timelineItem(sample, "sample", sample.id, sample.label ?? sample.id, sample.collectedAt ?? sample.createdAt, sample),
    ...assays.map((record) => timelineItem(record, "assay", record.id, record.name ?? record.id, record.performedAt ?? record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "samples", id: sample.id, label: sample.label ?? sample.id },
    itemCount: items.length,
    items,
    gaps: qualityGaps.map((record) => ({
      id: record.id,
      label: record.label,
      status: record.status,
      gapKind: record.gapKind,
      severity: record.severity,
      evidenceSourceId: record.evidenceSourceId,
    })),
    sourceCollections: ["samples", "assays", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

function materializedStudyTimeline(
  input: DenseDataCliInput,
  intent: ReturnType<typeof resolveClawDenseDataIntent>,
  semanticView: NonNullable<ReturnType<typeof semanticViewForIntent>>,
) {
  const studyId = input.positionals[1];
  if (!studyId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openDenseDataStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const study = store.getRecord(namespaceId, "studies", studyId);
  if (!study) return undefined;

  const participants = store.listRecords(namespaceId, "participants", { filter: { studyId } }).items;
  const samples = store.listRecords(namespaceId, "samples", { filter: { studyId } }).items;
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "studies", recordId: studyId } }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "studies", targetId: studyId } }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "studies", targetId: studyId } }).items;
  const items = [
    timelineItem(study, "study", study.id, study.title ?? study.id, study.startedAt ?? study.createdAt, study),
    ...participants.map((record) => timelineItem(record, "participant", record.id, record.displayName ?? record.subjectCode ?? record.id, record.enrolledAt ?? record.createdAt, record)),
    ...samples.map((record) => timelineItem(record, "sample", record.id, record.label ?? record.id, record.collectedAt ?? record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "studies", id: study.id, label: study.title ?? study.id },
    itemCount: items.length,
    items,
    gaps: qualityGaps.map((record) => ({
      id: record.id,
      label: record.label,
      status: record.status,
      gapKind: record.gapKind,
      severity: record.severity,
      evidenceSourceId: record.evidenceSourceId,
    })),
    sourceCollections: ["studies", "participants", "samples", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

function materializedExperimentTimeline(
  input: DenseDataCliInput,
  intent: ReturnType<typeof resolveClawDenseDataIntent>,
  semanticView: NonNullable<ReturnType<typeof semanticViewForIntent>>,
) {
  const experimentId = input.positionals[1];
  if (!experimentId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openDenseDataStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const experiment = store.getRecord(namespaceId, "biology_experiments", experimentId);
  if (!experiment) return undefined;

  const samples = store.listRecords(namespaceId, "samples", { filter: { biologyExperimentId: experimentId } }).items;
  const sampleIds = new Set(samples.map((record) => record.id));
  const assays = samples.flatMap((sample) => store.listRecords(namespaceId, "assays", { filter: { sampleId: sample.id } }).items);
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "biology_experiments", recordId: experimentId } }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "biology_experiments", targetId: experimentId } }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "biology_experiments", targetId: experimentId } }).items;
  const items = [
    timelineItem(experiment, "experiment", experiment.id, experiment.title ?? experiment.id, experiment.startedAt ?? experiment.createdAt, experiment),
    ...samples.map((record) => timelineItem(record, "sample", record.id, record.label ?? record.id, record.collectedAt ?? record.createdAt, record)),
    ...assays.map((record) => timelineItem(record, "assay", record.id, record.name ?? record.id, record.performedAt ?? record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "biology_experiments", id: experiment.id, label: experiment.title ?? experiment.id },
    itemCount: items.length,
    items,
    gaps: qualityGaps.map((record) => ({
      id: record.id,
      label: record.label,
      status: record.status,
      gapKind: record.gapKind,
      severity: record.severity,
      evidenceSourceId: record.evidenceSourceId,
    })),
    sourceCollections: ["biology_experiments", "samples", "assays", "evidence_sources", "quality_gaps", "provenance_events"],
    sampleIds: [...sampleIds],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

function materializedWorkOrderTimeline(
  input: DenseDataCliInput,
  intent: ReturnType<typeof resolveClawDenseDataIntent>,
  semanticView: NonNullable<ReturnType<typeof semanticViewForIntent>>,
) {
  const workOrderId = input.positionals[1];
  if (!workOrderId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openDenseDataStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const workOrder = store.getRecord(namespaceId, "work_orders", workOrderId);
  if (!workOrder) return undefined;

  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "work_orders", recordId: workOrderId } }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "work_orders", targetId: workOrderId } }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "work_orders", targetId: workOrderId } }).items;
  const items = [
    timelineItem(workOrder, "work_order", workOrder.id, workOrder.title ?? workOrder.id, workOrder.startedAt ?? workOrder.plannedStartAt ?? workOrder.createdAt, workOrder),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "work_orders", id: workOrder.id, label: workOrder.title ?? workOrder.id },
    itemCount: items.length,
    items,
    gaps: qualityGaps.map((record) => ({
      id: record.id,
      label: record.label,
      status: record.status,
      gapKind: record.gapKind,
      severity: record.severity,
      evidenceSourceId: record.evidenceSourceId,
    })),
    sourceCollections: ["work_orders", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

function materializedAssetTimeline(
  input: DenseDataCliInput,
  intent: ReturnType<typeof resolveClawDenseDataIntent>,
  semanticView: NonNullable<ReturnType<typeof semanticViewForIntent>>,
) {
  const assetId = input.positionals[1];
  if (!assetId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openDenseDataStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const asset = store.getRecord(namespaceId, "assets", assetId);
  if (!asset) return undefined;

  const company = typeof asset.companyId === "string" ? store.getRecord(namespaceId, "companies", asset.companyId) : undefined;
  const account = typeof asset.accountId === "string" ? store.getRecord(namespaceId, "accounts", asset.accountId) : undefined;
  const product = typeof asset.productCatalogId === "string" ? store.getRecord(namespaceId, "products_catalog", asset.productCatalogId) : undefined;
  const workOrders = store.listRecords(namespaceId, "work_orders", { filter: { assetId } }).items;
  const outgoingRelations = store.listRecords(namespaceId, "entity_relations", { filter: { fromEntityKind: "assets", fromEntityId: assetId } }).items;
  const incomingRelations = store.listRecords(namespaceId, "entity_relations", { filter: { toEntityKind: "assets", toEntityId: assetId } }).items;
  const relations = uniqueRecordsById([...outgoingRelations, ...incomingRelations]);
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "assets", recordId: assetId } }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "assets", targetId: assetId } }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "assets", targetId: assetId } }).items;
  const items = [
    timelineItem(asset, "asset", asset.id, asset.serialNumber ?? asset.id, asset.purchaseDate ?? asset.createdAt, asset),
    ...(company ? [timelineItem(company, "company", company.id, company.name ?? company.legalName ?? company.id, company.createdAt, company)] : []),
    ...(account ? [timelineItem(account, "account", account.id, account.name ?? account.id, account.createdAt, account)] : []),
    ...(product ? [timelineItem(product, "product", product.id, product.name ?? product.id, product.createdAt, product)] : []),
    ...workOrders.map((record) => timelineItem(record, "work_order", record.id, record.title ?? record.id, record.startedAt ?? record.plannedStartAt ?? record.createdAt, record)),
    ...relations.map((record) => timelineItem(record, "relation", record.id, relationLabel(record), record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "assets", id: asset.id, label: asset.serialNumber ?? asset.id },
    company: company ? { id: company.id, label: company.name ?? company.legalName ?? company.id } : null,
    account: account ? { id: account.id, label: account.name ?? account.id } : null,
    product: product ? { id: product.id, label: product.name ?? product.id } : null,
    summary: {
      workOrders: workOrders.length,
      relations: relations.length,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    itemCount: items.length,
    items,
    records: {
      asset,
      company,
      account,
      product,
      workOrders,
      relations,
      evidence,
      provenance,
    },
    gaps: qualityGaps.map((record) => ({
      id: record.id,
      label: record.label,
      status: record.status,
      gapKind: record.gapKind,
      severity: record.severity,
      evidenceSourceId: record.evidenceSourceId,
    })),
    sourceCollections: ["assets", "companies", "accounts", "products_catalog", "work_orders", "entity_relations", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

function materializedPropertyTimeline(
  input: DenseDataCliInput,
  intent: ReturnType<typeof resolveClawDenseDataIntent>,
  semanticView: NonNullable<ReturnType<typeof semanticViewForIntent>>,
) {
  const propertyId = input.positionals[1];
  if (!propertyId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openDenseDataStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const property = store.getRecord(namespaceId, "property_listings", propertyId);
  if (!property) return undefined;

  const visits = store.listRecords(namespaceId, "property_visits", { filter: { propertyListingId: propertyId } }).items;
  const offers = store.listRecords(namespaceId, "property_offers", { filter: { propertyListingId: propertyId } }).items;
  const inspections = store.listRecords(namespaceId, "property_inspections", { filter: { propertyListingId: propertyId } }).items;
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "property_listings", recordId: propertyId } }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "property_listings", targetId: propertyId } }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "property_listings", targetId: propertyId } }).items;
  const items = [
    timelineItem(property, "property", property.id, property.title ?? property.address ?? property.id, property.createdAt, property),
    ...visits.map((record) => timelineItem(record, "property_visit", record.id, record.visitorName ?? record.id, record.visitedAt ?? record.createdAt, record)),
    ...offers.map((record) => timelineItem(record, "property_offer", record.id, record.buyerName ?? record.amountCents ?? record.id, record.offeredAt ?? record.createdAt, record)),
    ...inspections.map((record) => timelineItem(record, "property_inspection", record.id, record.inspectorName ?? record.id, record.inspectedAt ?? record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "property_listings", id: property.id, label: property.title ?? property.address ?? property.id },
    summary: {
      visits: visits.length,
      offers: offers.length,
      inspections: inspections.length,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    itemCount: items.length,
    items,
    records: {
      property,
      visits,
      offers,
      inspections,
      evidence,
      provenance,
    },
    gaps: qualityGaps.map((record) => ({
      id: record.id,
      label: record.label,
      status: record.status,
      gapKind: record.gapKind,
      severity: record.severity,
      evidenceSourceId: record.evidenceSourceId,
    })),
    sourceCollections: ["property_listings", "property_visits", "property_offers", "property_inspections", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

function materializedInsurancePolicyTimeline(
  input: DenseDataCliInput,
  intent: ReturnType<typeof resolveClawDenseDataIntent>,
  semanticView: NonNullable<ReturnType<typeof semanticViewForIntent>>,
) {
  const policyId = input.positionals[1];
  if (!policyId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openDenseDataStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const policy = store.getRecord(namespaceId, "insurance_policies", policyId);
  if (!policy) return undefined;

  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "insurance_policies", recordId: policyId } }).items;
  const receipts = store.listRecords(namespaceId, "important_receipts", { filter: { tags: ["insurance", policyId] } }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "insurance_policies", targetId: policyId } }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "insurance_policies", targetId: policyId } }).items;
  const items = [
    timelineItem(policy, "insurance_policy", policy.id, policy.title ?? policy.policyNumber ?? policy.id, policy.startedAt ?? policy.createdAt, policy),
    ...receipts.map((record) => timelineItem(record, "receipt", record.id, record.title ?? record.vendor ?? record.id, record.issuedAt ?? record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "insurance_policies", id: policy.id, label: policy.title ?? policy.policyNumber ?? policy.id },
    summary: {
      receipts: receipts.length,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    itemCount: items.length,
    items,
    records: {
      policy,
      receipts,
      evidence,
      provenance,
    },
    gaps: qualityGaps.map((record) => ({
      id: record.id,
      label: record.label,
      status: record.status,
      gapKind: record.gapKind,
      severity: record.severity,
      evidenceSourceId: record.evidenceSourceId,
    })),
    sourceCollections: ["insurance_policies", "important_receipts", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

function materializedVehicleTimeline(
  input: DenseDataCliInput,
  intent: ReturnType<typeof resolveClawDenseDataIntent>,
  semanticView: NonNullable<ReturnType<typeof semanticViewForIntent>>,
) {
  const vehicleId = input.positionals[1];
  if (!vehicleId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openDenseDataStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const vehicle = store.getRecord(namespaceId, "vehicles", vehicleId);
  if (!vehicle) return undefined;

  const maintenanceRecords = store.listRecords(namespaceId, "vehicle_maintenance", { filter: { vehicleId } }).items;
  const insurancePolicies = store.listRecords(namespaceId, "vehicle_insurance_policies", { filter: { vehicleId } }).items;
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "vehicles", recordId: vehicleId } }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "vehicles", targetId: vehicleId } }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "vehicles", targetId: vehicleId } }).items;
  const items = [
    timelineItem(vehicle, "vehicle", vehicle.id, vehicle.name ?? vehicle.plate ?? vehicle.id, vehicle.createdAt, vehicle),
    ...maintenanceRecords.map((record) => timelineItem(record, "vehicle_maintenance", record.id, record.title ?? record.id, record.performedAt ?? record.createdAt, record)),
    ...insurancePolicies.map((record) => timelineItem(record, "vehicle_insurance_policy", record.id, record.policyNumber ?? record.provider ?? record.id, record.startedAt ?? record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "vehicles", id: vehicle.id, label: vehicle.name ?? vehicle.plate ?? vehicle.id },
    summary: {
      maintenanceRecords: maintenanceRecords.length,
      insurancePolicies: insurancePolicies.length,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    itemCount: items.length,
    items,
    records: {
      vehicle,
      maintenanceRecords,
      insurancePolicies,
      evidence,
      provenance,
    },
    gaps: qualityGaps.map((record) => ({
      id: record.id,
      label: record.label,
      status: record.status,
      gapKind: record.gapKind,
      severity: record.severity,
      evidenceSourceId: record.evidenceSourceId,
    })),
    sourceCollections: ["vehicles", "vehicle_maintenance", "vehicle_insurance_policies", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

function materializedPurchaseOrderTimeline(
  input: DenseDataCliInput,
  intent: ReturnType<typeof resolveClawDenseDataIntent>,
  semanticView: NonNullable<ReturnType<typeof semanticViewForIntent>>,
) {
  const purchaseOrderId = input.positionals[1];
  if (!purchaseOrderId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openDenseDataStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const purchaseOrder = store.getRecord(namespaceId, "purchase_orders", purchaseOrderId);
  if (!purchaseOrder) return undefined;

  const supplier = typeof purchaseOrder.supplierId === "string" ? store.getRecord(namespaceId, "suppliers", purchaseOrder.supplierId) : undefined;
  const company = typeof purchaseOrder.companyId === "string" ? store.getRecord(namespaceId, "companies", purchaseOrder.companyId) : undefined;
  const lineItems = store.listRecords(namespaceId, "purchase_order_line_items", { filter: { purchaseOrderId } }).items;
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "purchase_orders", recordId: purchaseOrderId } }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "purchase_orders", targetId: purchaseOrderId } }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "purchase_orders", targetId: purchaseOrderId } }).items;
  const items = [
    timelineItem(purchaseOrder, "purchase_order", purchaseOrder.id, purchaseOrder.number ?? purchaseOrder.id, purchaseOrder.orderedAt ?? purchaseOrder.createdAt, purchaseOrder),
    ...(supplier ? [timelineItem(supplier, "supplier", supplier.id, supplier.name ?? supplier.id, supplier.createdAt, supplier)] : []),
    ...(company ? [timelineItem(company, "company", company.id, company.name ?? company.legalName ?? company.id, company.createdAt, company)] : []),
    ...lineItems.map((record) => timelineItem(record, "purchase_order_line_item", record.id, record.description ?? record.id, record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "purchase_orders", id: purchaseOrder.id, label: purchaseOrder.number ?? purchaseOrder.id },
    supplier: supplier ? { id: supplier.id, label: supplier.name ?? supplier.id } : null,
    company: company ? { id: company.id, label: company.name ?? company.legalName ?? company.id } : null,
    summary: {
      lineItems: lineItems.length,
      receivedLineItems: lineItems.filter((record) => record.status === "received").length,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    itemCount: items.length,
    items,
    records: {
      purchaseOrder,
      supplier,
      company,
      lineItems,
      evidence,
      provenance,
    },
    gaps: qualityGaps.map((record) => ({
      id: record.id,
      label: record.label,
      status: record.status,
      gapKind: record.gapKind,
      severity: record.severity,
      evidenceSourceId: record.evidenceSourceId,
    })),
    sourceCollections: ["purchase_orders", "suppliers", "companies", "purchase_order_line_items", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

function materializedWarehouseTimeline(
  input: DenseDataCliInput,
  intent: ReturnType<typeof resolveClawDenseDataIntent>,
  semanticView: NonNullable<ReturnType<typeof semanticViewForIntent>>,
) {
  const warehouseId = input.positionals[1];
  if (!warehouseId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openDenseDataStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const warehouse = store.getRecord(namespaceId, "warehouses", warehouseId);
  if (!warehouse) return undefined;

  const company = typeof warehouse.companyId === "string" ? store.getRecord(namespaceId, "companies", warehouse.companyId) : undefined;
  const inventoryItems = store.listRecords(namespaceId, "inventory_items", { filter: { warehouseId } }).items;
  const stockMovements = store.listRecords(namespaceId, "stock_movements", { filter: { warehouseId } }).items;
  const productIds = new Set(inventoryItems.map((record) => record.productCatalogId).filter((value): value is string => typeof value === "string"));
  const products = [...productIds].flatMap((productId) => {
    const product = store.getRecord(namespaceId, "products_catalog", productId);
    return product ? [product] : [];
  });
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "warehouses", recordId: warehouseId } }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "warehouses", targetId: warehouseId } }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "warehouses", targetId: warehouseId } }).items;
  const items = [
    timelineItem(warehouse, "warehouse", warehouse.id, warehouse.name ?? warehouse.code ?? warehouse.id, warehouse.createdAt, warehouse),
    ...(company ? [timelineItem(company, "company", company.id, company.name ?? company.legalName ?? company.id, company.createdAt, company)] : []),
    ...inventoryItems.map((record) => timelineItem(record, "inventory_item", record.id, record.name ?? record.sku ?? record.id, record.createdAt, record)),
    ...stockMovements.map((record) => timelineItem(record, "stock_movement", record.id, record.title ?? record.movementType ?? record.id, record.occurredAt ?? record.createdAt, record)),
    ...products.map((record) => timelineItem(record, "product", record.id, record.name ?? record.id, record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "warehouses", id: warehouse.id, label: warehouse.name ?? warehouse.code ?? warehouse.id },
    company: company ? { id: company.id, label: company.name ?? company.legalName ?? company.id } : null,
    summary: {
      inventoryItems: inventoryItems.length,
      stockMovements: stockMovements.length,
      products: products.length,
      quantityOnHand: sumNumericField(inventoryItems, "quantityOnHand"),
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    itemCount: items.length,
    items,
    records: {
      warehouse,
      company,
      inventoryItems,
      stockMovements,
      products,
      evidence,
      provenance,
    },
    gaps: qualityGaps.map((record) => ({
      id: record.id,
      label: record.label,
      status: record.status,
      gapKind: record.gapKind,
      severity: record.severity,
      evidenceSourceId: record.evidenceSourceId,
    })),
    sourceCollections: ["warehouses", "companies", "inventory_items", "stock_movements", "products_catalog", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

function materializedSupplyPlanTimeline(
  input: DenseDataCliInput,
  intent: ReturnType<typeof resolveClawDenseDataIntent>,
  semanticView: NonNullable<ReturnType<typeof semanticViewForIntent>>,
) {
  const supplyPlanId = input.positionals[1];
  if (!supplyPlanId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openDenseDataStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const supplyPlan = store.getRecord(namespaceId, "supply_plans", supplyPlanId);
  if (!supplyPlan) return undefined;

  const company = typeof supplyPlan.companyId === "string" ? store.getRecord(namespaceId, "companies", supplyPlan.companyId) : undefined;
  const items = store.listRecords(namespaceId, "supply_plan_items", { filter: { supplyPlanId } }).items;
  const risks = store.listRecords(namespaceId, "supply_risks", { filter: { supplyPlanId } }).items;
  const supplierIds = new Set<string>([
    ...items.map((record) => record.supplierId),
    ...risks.map((record) => record.supplierId),
  ].filter((value): value is string => typeof value === "string"));
  const purchaseOrderIds = new Set<string>([
    ...items.map((record) => record.purchaseOrderId),
    ...risks.map((record) => record.purchaseOrderId),
  ].filter((value): value is string => typeof value === "string"));
  const warehouseIds = new Set<string>([
    ...items.map((record) => record.warehouseId),
    ...risks.map((record) => record.warehouseId),
  ].filter((value): value is string => typeof value === "string"));
  const inventoryItemIds = new Set<string>([
    ...items.map((record) => record.inventoryItemId),
    ...risks.map((record) => record.inventoryItemId),
  ].filter((value): value is string => typeof value === "string"));
  const productIds = new Set<string>(items.map((record) => record.productCatalogId).filter((value): value is string => typeof value === "string"));
  const suppliers = [...supplierIds].flatMap((supplierId) => {
    const record = store.getRecord(namespaceId, "suppliers", supplierId);
    return record ? [record] : [];
  });
  const purchaseOrders = [...purchaseOrderIds].flatMap((purchaseOrderId) => {
    const record = store.getRecord(namespaceId, "purchase_orders", purchaseOrderId);
    return record ? [record] : [];
  });
  const warehouses = [...warehouseIds].flatMap((warehouseId) => {
    const record = store.getRecord(namespaceId, "warehouses", warehouseId);
    return record ? [record] : [];
  });
  const inventoryItems = [...inventoryItemIds].flatMap((inventoryItemId) => {
    const record = store.getRecord(namespaceId, "inventory_items", inventoryItemId);
    return record ? [record] : [];
  });
  const products = [...productIds].flatMap((productId) => {
    const record = store.getRecord(namespaceId, "products_catalog", productId);
    return record ? [record] : [];
  });
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "supply_plans", recordId: supplyPlanId } }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "supply_plans", targetId: supplyPlanId } }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "supply_plans", targetId: supplyPlanId } }).items;
  const timelineItems = [
    timelineItem(supplyPlan, "supply_plan", supplyPlan.id, supplyPlan.title ?? supplyPlan.id, supplyPlan.horizonStartAt ?? supplyPlan.createdAt, supplyPlan),
    ...(company ? [timelineItem(company, "company", company.id, company.name ?? company.legalName ?? company.id, company.createdAt, company)] : []),
    ...items.map((record) => timelineItem(record, "supply_plan_item", record.id, record.title ?? record.id, record.neededBy ?? record.createdAt, record)),
    ...risks.map((record) => timelineItem(record, "supply_risk", record.id, record.title ?? record.riskType ?? record.id, record.identifiedAt ?? record.createdAt, record)),
    ...suppliers.map((record) => timelineItem(record, "supplier", record.id, record.name ?? record.id, record.createdAt, record)),
    ...purchaseOrders.map((record) => timelineItem(record, "purchase_order", record.id, record.number ?? record.id, record.orderedAt ?? record.createdAt, record)),
    ...warehouses.map((record) => timelineItem(record, "warehouse", record.id, record.name ?? record.code ?? record.id, record.createdAt, record)),
    ...inventoryItems.map((record) => timelineItem(record, "inventory_item", record.id, record.name ?? record.sku ?? record.id, record.createdAt, record)),
    ...products.map((record) => timelineItem(record, "product", record.id, record.name ?? record.id, record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "supply_plans", id: supplyPlan.id, label: supplyPlan.title ?? supplyPlan.id },
    company: company ? { id: company.id, label: company.name ?? company.legalName ?? company.id } : null,
    summary: {
      items: items.length,
      risks: risks.length,
      openRisks: risks.filter((record) => record.status !== "resolved" && record.status !== "accepted").length,
      suppliers: suppliers.length,
      purchaseOrders: purchaseOrders.length,
      warehouses: warehouses.length,
      inventoryItems: inventoryItems.length,
      products: products.length,
      quantityRequired: sumNumericField(items, "quantityRequired"),
      quantityAvailable: sumNumericField(items, "quantityAvailable"),
      quantityGap: sumNumericField(items, "quantityGap"),
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    itemCount: timelineItems.length,
    items: timelineItems,
    records: {
      supplyPlan,
      company,
      items,
      risks,
      suppliers,
      purchaseOrders,
      warehouses,
      inventoryItems,
      products,
      evidence,
      provenance,
    },
    gaps: qualityGaps.map((record) => ({
      id: record.id,
      label: record.label,
      status: record.status,
      gapKind: record.gapKind,
      severity: record.severity,
      evidenceSourceId: record.evidenceSourceId,
    })),
    sourceCollections: ["supply_plans", "supply_plan_items", "supply_risks", "companies", "suppliers", "purchase_orders", "warehouses", "inventory_items", "products_catalog", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

function materializedControlTimeline(
  input: DenseDataCliInput,
  intent: ReturnType<typeof resolveClawDenseDataIntent>,
  semanticView: NonNullable<ReturnType<typeof semanticViewForIntent>>,
) {
  const controlId = input.positionals[1];
  if (!controlId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openDenseDataStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const control = store.getRecord(namespaceId, "compliance_controls", controlId);
  if (!control) return undefined;

  const company = typeof control.companyId === "string" ? store.getRecord(namespaceId, "companies", control.companyId) : undefined;
  const obligation = typeof control.obligationId === "string" ? store.getRecord(namespaceId, "compliance_obligations", control.obligationId) : undefined;
  const assessments = store.listRecords(namespaceId, "control_assessments", { filter: { controlId } }).items;
  const findings = store.listRecords(namespaceId, "compliance_findings", { filter: { controlId } }).items;
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "compliance_controls", recordId: controlId } }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "compliance_controls", targetId: controlId } }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "compliance_controls", targetId: controlId } }).items;
  const items = [
    timelineItem(control, "control", control.id, control.title ?? control.controlKey ?? control.id, control.createdAt, control),
    ...(company ? [timelineItem(company, "company", company.id, company.name ?? company.legalName ?? company.id, company.createdAt, company)] : []),
    ...(obligation ? [timelineItem(obligation, "obligation", obligation.id, obligation.title ?? obligation.reference ?? obligation.id, obligation.effectiveAt ?? obligation.createdAt, obligation)] : []),
    ...assessments.map((record) => timelineItem(record, "control_assessment", record.id, record.title ?? record.result ?? record.id, record.assessedAt ?? record.createdAt, record)),
    ...findings.map((record) => timelineItem(record, "compliance_finding", record.id, record.title ?? record.severity ?? record.id, record.identifiedAt ?? record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "compliance_controls", id: control.id, label: control.title ?? control.controlKey ?? control.id },
    company: company ? { id: company.id, label: company.name ?? company.legalName ?? company.id } : null,
    obligation: obligation ? { id: obligation.id, label: obligation.title ?? obligation.reference ?? obligation.id } : null,
    summary: {
      assessments: assessments.length,
      passedAssessments: assessments.filter((record) => record.result === "pass").length,
      failedAssessments: assessments.filter((record) => record.result === "fail").length,
      findings: findings.length,
      openFindings: findings.filter((record) => record.status !== "closed" && record.status !== "accepted").length,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    itemCount: items.length,
    items,
    records: {
      control,
      company,
      obligation,
      assessments,
      findings,
      evidence,
      provenance,
    },
    gaps: qualityGaps.map((record) => ({
      id: record.id,
      label: record.label,
      status: record.status,
      gapKind: record.gapKind,
      severity: record.severity,
      evidenceSourceId: record.evidenceSourceId,
    })),
    sourceCollections: ["compliance_controls", "compliance_obligations", "control_assessments", "compliance_findings", "companies", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

function materializedThingTimeline(
  input: DenseDataCliInput,
  intent: ReturnType<typeof resolveClawDenseDataIntent>,
  semanticView: NonNullable<ReturnType<typeof semanticViewForIntent>>,
) {
  const thingId = input.positionals[1];
  if (!thingId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openDenseDataStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const thing = store.getRecord(namespaceId, "iot_things", thingId);
  if (!thing) return undefined;

  const company = typeof thing.companyId === "string" ? store.getRecord(namespaceId, "companies", thing.companyId) : undefined;
  const asset = typeof thing.assetId === "string" ? store.getRecord(namespaceId, "assets", thing.assetId) : undefined;
  const devices = store.listRecords(namespaceId, "iot_devices", { filter: { thingId } }).items;
  const deviceIds = new Set(devices.map((record) => record.id));
  const readingsByThing = store.listRecords(namespaceId, "sensor_readings", { filter: { thingId } }).items;
  const readingsByDevice = devices.flatMap((record) => store.listRecords(namespaceId, "sensor_readings", { filter: { deviceId: record.id } }).items);
  const readings = uniqueRecordsById([...readingsByThing, ...readingsByDevice]);
  const commandsByThing = store.listRecords(namespaceId, "device_commands", { filter: { thingId } }).items;
  const commandsByDevice = devices.flatMap((record) => store.listRecords(namespaceId, "device_commands", { filter: { deviceId: record.id } }).items);
  const commands = uniqueRecordsById([...commandsByThing, ...commandsByDevice]);
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "iot_things", recordId: thingId } }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "iot_things", targetId: thingId } }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "iot_things", targetId: thingId } }).items;
  const items = [
    timelineItem(thing, "thing", thing.id, thing.name ?? thing.id, thing.createdAt, thing),
    ...(company ? [timelineItem(company, "company", company.id, company.name ?? company.legalName ?? company.id, company.createdAt, company)] : []),
    ...(asset ? [timelineItem(asset, "asset", asset.id, asset.serialNumber ?? asset.name ?? asset.id, asset.createdAt, asset)] : []),
    ...devices.map((record) => timelineItem(record, "iot_device", record.id, record.name ?? record.id, record.lastSeenAt ?? record.createdAt, record)),
    ...readings.map((record) => timelineItem(record, "sensor_reading", record.id, record.metric ?? record.id, record.observedAt ?? record.createdAt, record)),
    ...commands.map((record) => timelineItem(record, "device_command", record.id, record.title ?? record.commandType ?? record.id, record.executedAt ?? record.requestedAt ?? record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "iot_things", id: thing.id, label: thing.name ?? thing.id },
    company: company ? { id: company.id, label: company.name ?? company.legalName ?? company.id } : null,
    asset: asset ? { id: asset.id, label: asset.serialNumber ?? asset.name ?? asset.id } : null,
    summary: {
      devices: devices.length,
      onlineDevices: devices.filter((record) => record.status === "online").length,
      readings: readings.length,
      commands: commands.length,
      pendingCommands: commands.filter((record) => record.status === "pending_approval" || record.status === "draft").length,
      deviceIds: [...deviceIds],
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    itemCount: items.length,
    items,
    records: {
      thing,
      company,
      asset,
      devices,
      readings,
      commands,
      evidence,
      provenance,
    },
    gaps: qualityGaps.map((record) => ({
      id: record.id,
      label: record.label,
      status: record.status,
      gapKind: record.gapKind,
      severity: record.severity,
      evidenceSourceId: record.evidenceSourceId,
    })),
    sourceCollections: ["iot_things", "iot_devices", "sensor_readings", "device_commands", "companies", "assets", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

function materializedConstructionProjectTimeline(
  input: DenseDataCliInput,
  intent: ReturnType<typeof resolveClawDenseDataIntent>,
  semanticView: NonNullable<ReturnType<typeof semanticViewForIntent>>,
) {
  const projectId = input.positionals[1];
  if (!projectId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openDenseDataStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const project = store.getRecord(namespaceId, "construction_projects", projectId);
  if (!project) return undefined;

  const company = typeof project.companyId === "string" ? store.getRecord(namespaceId, "companies", project.companyId) : undefined;
  const customerCompany = typeof project.customerCompanyId === "string" ? store.getRecord(namespaceId, "companies", project.customerCompanyId) : undefined;
  const sites = store.listRecords(namespaceId, "construction_sites", { filter: { projectId } }).items;
  const rfis = store.listRecords(namespaceId, "construction_rfis", { filter: { projectId } }).items;
  const changeOrders = store.listRecords(namespaceId, "construction_change_orders", { filter: { projectId } }).items;
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "construction_projects", recordId: projectId } }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "construction_projects", targetId: projectId } }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "construction_projects", targetId: projectId } }).items;
  const items = [
    timelineItem(project, "construction_project", project.id, project.title ?? project.id, project.startAt ?? project.createdAt, project),
    ...(company ? [timelineItem(company, "company", company.id, company.name ?? company.legalName ?? company.id, company.createdAt, company)] : []),
    ...(customerCompany ? [timelineItem(customerCompany, "customer_company", customerCompany.id, customerCompany.name ?? customerCompany.legalName ?? customerCompany.id, customerCompany.createdAt, customerCompany)] : []),
    ...sites.map((record) => timelineItem(record, "construction_site", record.id, record.name ?? record.id, record.createdAt, record)),
    ...rfis.map((record) => timelineItem(record, "construction_rfi", record.id, record.title ?? record.number ?? record.id, record.answeredAt ?? record.requestedAt ?? record.createdAt, record)),
    ...changeOrders.map((record) => timelineItem(record, "construction_change_order", record.id, record.title ?? record.number ?? record.id, record.approvedAt ?? record.submittedAt ?? record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "construction_projects", id: project.id, label: project.title ?? project.id },
    company: company ? { id: company.id, label: company.name ?? company.legalName ?? company.id } : null,
    customerCompany: customerCompany ? { id: customerCompany.id, label: customerCompany.name ?? customerCompany.legalName ?? customerCompany.id } : null,
    summary: {
      sites: sites.length,
      rfis: rfis.length,
      openRfis: rfis.filter((record) => record.status !== "answered" && record.status !== "closed").length,
      changeOrders: changeOrders.length,
      approvedChangeOrders: changeOrders.filter((record) => record.status === "approved").length,
      changeOrderAmountCents: sumNumericField(changeOrders, "amountCents"),
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    itemCount: items.length,
    items,
    records: {
      project,
      company,
      customerCompany,
      sites,
      rfis,
      changeOrders,
      evidence,
      provenance,
    },
    gaps: qualityGaps.map((record) => ({
      id: record.id,
      label: record.label,
      status: record.status,
      gapKind: record.gapKind,
      severity: record.severity,
      evidenceSourceId: record.evidenceSourceId,
    })),
    sourceCollections: ["construction_projects", "construction_sites", "construction_rfis", "construction_change_orders", "companies", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

function materializedLearnerTimeline(
  input: DenseDataCliInput,
  intent: ReturnType<typeof resolveClawDenseDataIntent>,
  semanticView: NonNullable<ReturnType<typeof semanticViewForIntent>>,
) {
  const learnerId = input.positionals[1];
  if (!learnerId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openDenseDataStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const learner = store.getRecord(namespaceId, "learners", learnerId);
  if (!learner) return undefined;

  const outgoingRelations = store.listRecords(namespaceId, "entity_relations", { filter: { fromEntityKind: "learners", fromEntityId: learnerId } }).items;
  const incomingRelations = store.listRecords(namespaceId, "entity_relations", { filter: { toEntityKind: "learners", toEntityId: learnerId } }).items;
  const relations = uniqueRecordsById([...outgoingRelations, ...incomingRelations]);
  const relatedCourseIds = new Set<string>();
  for (const relation of relations) {
    if (relation.fromEntityKind === "learners" && relation.fromEntityId === learnerId && relation.toEntityKind === "courses" && typeof relation.toEntityId === "string") relatedCourseIds.add(relation.toEntityId);
    if (relation.toEntityKind === "learners" && relation.toEntityId === learnerId && relation.fromEntityKind === "courses" && typeof relation.fromEntityId === "string") relatedCourseIds.add(relation.fromEntityId);
  }
  const courses = [...relatedCourseIds].flatMap((courseId) => {
    const record = store.getRecord(namespaceId, "courses", courseId);
    return record ? [record] : [];
  });
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "learners", recordId: learnerId } }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "learners", targetId: learnerId } }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "learners", targetId: learnerId } }).items;
  const items = [
    timelineItem(learner, "learner", learner.id, learner.displayName ?? learner.id, learner.startedAt ?? learner.createdAt, learner),
    ...courses.map((record) => timelineItem(record, "course", record.id, record.title ?? record.id, record.startedAt ?? record.completedAt ?? record.createdAt, record)),
    ...relations.map((record) => timelineItem(record, "relation", record.id, relationLabel(record), record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "learners", id: learner.id, label: learner.displayName ?? learner.id },
    summary: {
      courses: courses.length,
      relations: relations.length,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    itemCount: items.length,
    items,
    records: {
      learner,
      courses,
      relations,
      evidence,
      provenance,
    },
    gaps: qualityGaps.map((record) => ({
      id: record.id,
      label: record.label,
      status: record.status,
      gapKind: record.gapKind,
      severity: record.severity,
      evidenceSourceId: record.evidenceSourceId,
    })),
    sourceCollections: ["learners", "courses", "entity_relations", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

function materializedCourseTimeline(
  input: DenseDataCliInput,
  intent: ReturnType<typeof resolveClawDenseDataIntent>,
  semanticView: NonNullable<ReturnType<typeof semanticViewForIntent>>,
) {
  const courseId = input.positionals[1];
  if (!courseId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openDenseDataStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const course = store.getRecord(namespaceId, "courses", courseId);
  if (!course) return undefined;

  const lessons = store.listRecords(namespaceId, "lessons", { filter: { courseId } }).items;
  const studySessions = store.listRecords(namespaceId, "study_sessions", { filter: { courseId } }).items;
  const outgoingRelations = store.listRecords(namespaceId, "entity_relations", { filter: { fromEntityKind: "courses", fromEntityId: courseId } }).items;
  const incomingRelations = store.listRecords(namespaceId, "entity_relations", { filter: { toEntityKind: "courses", toEntityId: courseId } }).items;
  const relations = uniqueRecordsById([...outgoingRelations, ...incomingRelations]);
  const relatedLearnerIds = new Set<string>();
  for (const relation of relations) {
    if (relation.fromEntityKind === "courses" && relation.fromEntityId === courseId && relation.toEntityKind === "learners" && typeof relation.toEntityId === "string") relatedLearnerIds.add(relation.toEntityId);
    if (relation.toEntityKind === "courses" && relation.toEntityId === courseId && relation.fromEntityKind === "learners" && typeof relation.fromEntityId === "string") relatedLearnerIds.add(relation.fromEntityId);
  }
  const learners = [...relatedLearnerIds].flatMap((learnerId) => {
    const record = store.getRecord(namespaceId, "learners", learnerId);
    return record ? [record] : [];
  });
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "courses", recordId: courseId } }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "courses", targetId: courseId } }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "courses", targetId: courseId } }).items;
  const items = [
    timelineItem(course, "course", course.id, course.title ?? course.id, course.startedAt ?? course.createdAt, course),
    ...lessons.map((record) => timelineItem(record, "lesson", record.id, record.title ?? record.id, record.createdAt, record)),
    ...studySessions.map((record) => timelineItem(record, "study_session", record.id, record.topic ?? record.id, record.startedAt ?? record.createdAt, record)),
    ...learners.map((record) => timelineItem(record, "learner", record.id, record.displayName ?? record.id, record.startedAt ?? record.createdAt, record)),
    ...relations.map((record) => timelineItem(record, "relation", record.id, relationLabel(record), record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "courses", id: course.id, label: course.title ?? course.id },
    summary: {
      lessons: lessons.length,
      studySessions: studySessions.length,
      learners: learners.length,
      relations: relations.length,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    itemCount: items.length,
    items,
    records: {
      course,
      lessons,
      studySessions,
      learners,
      relations,
      evidence,
      provenance,
    },
    gaps: qualityGaps.map((record) => ({
      id: record.id,
      label: record.label,
      status: record.status,
      gapKind: record.gapKind,
      severity: record.severity,
      evidenceSourceId: record.evidenceSourceId,
    })),
    sourceCollections: ["courses", "lessons", "study_sessions", "learners", "entity_relations", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

function materializedEmployeeTimeline(
  input: DenseDataCliInput,
  intent: ReturnType<typeof resolveClawDenseDataIntent>,
  semanticView: NonNullable<ReturnType<typeof semanticViewForIntent>>,
) {
  const employeeId = input.positionals[1];
  if (!employeeId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openDenseDataStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const employee = store.getRecord(namespaceId, "employees", employeeId);
  if (!employee) return undefined;

  const timeOffRequests = store.listRecords(namespaceId, "time_off_requests", { filter: { employeeId } }).items;
  const performanceReviews = store.listRecords(namespaceId, "performance_reviews", { filter: { employeeId } }).items;
  const payStubs = store.listRecords(namespaceId, "pay_stubs", { filter: { employeeId } }).items;
  const benefits = store.listRecords(namespaceId, "benefits_enrollments", { filter: { employeeId } }).items;
  const managedOneOnOnes = store.listRecords(namespaceId, "one_on_ones", { filter: { managerEmployeeId: employeeId } }).items;
  const reportOneOnOnes = store.listRecords(namespaceId, "one_on_ones", { filter: { reportEmployeeId: employeeId } }).items;
  const oneOnOnes = uniqueRecordsById([...managedOneOnOnes, ...reportOneOnOnes]);
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "employees", recordId: employeeId } }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "employees", targetId: employeeId } }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "employees", targetId: employeeId } }).items;
  const items = [
    timelineItem(employee, "employee", employee.id, employee.displayName ?? employee.email ?? employee.id, employee.hireDate ?? employee.createdAt, employee),
    ...timeOffRequests.map((record) => timelineItem(record, "time_off_request", record.id, record.kind ?? record.id, record.startDate ?? record.createdAt, record)),
    ...performanceReviews.map((record) => timelineItem(record, "performance_review", record.id, record.cycleName ?? record.rating ?? record.id, record.completedAt ?? record.createdAt, record)),
    ...payStubs.map((record) => timelineItem(record, "pay_stub", record.id, record.period ?? record.payrollRunId ?? record.id, record.createdAt, record)),
    ...benefits.map((record) => timelineItem(record, "benefits_enrollment", record.id, record.planId ?? record.id, record.enrolledAt ?? record.effectiveAt ?? record.createdAt, record)),
    ...oneOnOnes.map((record) => timelineItem(record, "one_on_one", record.id, record.notes ?? record.id, record.completedAt ?? record.scheduledAt ?? record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "employees", id: employee.id, label: employee.displayName ?? employee.email ?? employee.id },
    summary: {
      timeOffRequests: timeOffRequests.length,
      performanceReviews: performanceReviews.length,
      payStubs: payStubs.length,
      benefits: benefits.length,
      oneOnOnes: oneOnOnes.length,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    itemCount: items.length,
    items,
    records: {
      employee,
      timeOffRequests,
      performanceReviews,
      payStubs,
      benefits,
      oneOnOnes,
      evidence,
      provenance,
    },
    gaps: qualityGaps.map((record) => ({
      id: record.id,
      label: record.label,
      status: record.status,
      gapKind: record.gapKind,
      severity: record.severity,
      evidenceSourceId: record.evidenceSourceId,
    })),
    sourceCollections: ["employees", "time_off_requests", "performance_reviews", "pay_stubs", "benefits_enrollments", "one_on_ones", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

function materializedErpCompanyOverview(
  input: DenseDataCliInput,
  intent: ReturnType<typeof resolveClawDenseDataIntent>,
  semanticView: NonNullable<ReturnType<typeof semanticViewForIntent>>,
) {
  const companyId = input.positionals[2];
  if (input.positionals[0] !== "erp" || input.positionals[1] !== "company" || input.positionals[3] !== "overview" || !companyId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openDenseDataStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const company = store.getRecord(namespaceId, "companies", companyId);
  if (!company) return undefined;

  const accounts = store.listRecords(namespaceId, "accounts", { filter: { companyId } }).items;
  const deals = store.listRecords(namespaceId, "deals", { filter: { companyId } }).items;
  const billingCustomers = store.listRecords(namespaceId, "billing_customers", { filter: { companyId } }).items;
  const billingCustomerIds = new Set(billingCustomers.map((record) => record.id));
  const invoices = billingCustomers.flatMap((record) => store.listRecords(namespaceId, "invoices", { filter: { billingCustomerId: record.id } }).items);
  const invoiceIds = new Set(invoices.map((record) => record.id));
  const paymentsByCustomer = billingCustomers.flatMap((record) => store.listRecords(namespaceId, "payment_intents", { filter: { billingCustomerId: record.id } }).items);
  const paymentsByInvoice = invoices.flatMap((record) => store.listRecords(namespaceId, "payment_intents", { filter: { invoiceId: record.id } }).items);
  const payments = uniqueRecordsById([...paymentsByCustomer, ...paymentsByInvoice]);
  const services = store.listRecords(namespaceId, "services", { filter: { companyId } }).items;
  const workOrders = store.listRecords(namespaceId, "work_orders", { filter: { companyId } }).items;
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "companies", recordId: companyId } }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "companies", targetId: companyId } }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "companies", targetId: companyId } }).items;
  const invoiceTotalCents = sumNumericField(invoices, "totalCents");
  const paymentTotalCents = sumNumericField(payments, "amountCents");
  const openDealValueCents = sumNumericField(deals.filter((record) => record.status !== "lost"), "valueCents");

  return {
    id: semanticView.id,
    subject: { collectionName: "companies", id: company.id, label: company.name ?? company.legalName ?? company.id },
    summary: {
      accounts: accounts.length,
      deals: deals.length,
      openDealValueCents,
      billingCustomers: billingCustomers.length,
      invoices: invoices.length,
      invoiceTotalCents,
      payments: payments.length,
      paymentTotalCents,
      services: services.length,
      workOrders: workOrders.length,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    records: {
      company,
      accounts,
      deals,
      billingCustomers,
      invoices,
      payments,
      services,
      workOrders,
      evidence,
      provenance,
    },
    linkedIds: {
      billingCustomerIds: [...billingCustomerIds],
      invoiceIds: [...invoiceIds],
    },
    gaps: qualityGaps.map((record) => ({
      id: record.id,
      label: record.label,
      status: record.status,
      gapKind: record.gapKind,
      severity: record.severity,
      evidenceSourceId: record.evidenceSourceId,
    })),
    sourceCollections: ["companies", "accounts", "deals", "billing_customers", "invoices", "payment_intents", "services", "work_orders", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

function materializedCompanyTimeline(
  input: DenseDataCliInput,
  intent: ReturnType<typeof resolveClawDenseDataIntent>,
  semanticView: NonNullable<ReturnType<typeof semanticViewForIntent>>,
) {
  const companyId = input.positionals[1];
  if (input.positionals[0] !== "company" || input.positionals[2] !== "timeline" || !companyId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openDenseDataStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const company = store.getRecord(namespaceId, "companies", companyId);
  if (!company) return undefined;

  const accounts = store.listRecords(namespaceId, "accounts", { filter: { companyId } }).items;
  const deals = store.listRecords(namespaceId, "deals", { filter: { companyId } }).items;
  const contacts = store.listRecords(namespaceId, "contacts", { filter: { companyId } }).items;
  const activities = store.listRecords(namespaceId, "activities", { filter: { companyId } }).items;
  const billingCustomers = store.listRecords(namespaceId, "billing_customers", { filter: { companyId } }).items;
  const invoices = billingCustomers.flatMap((record) => store.listRecords(namespaceId, "invoices", { filter: { billingCustomerId: record.id } }).items);
  const paymentsByCustomer = billingCustomers.flatMap((record) => store.listRecords(namespaceId, "payment_intents", { filter: { billingCustomerId: record.id } }).items);
  const paymentsByInvoice = invoices.flatMap((record) => store.listRecords(namespaceId, "payment_intents", { filter: { invoiceId: record.id } }).items);
  const payments = uniqueRecordsById([...paymentsByCustomer, ...paymentsByInvoice]);
  const services = store.listRecords(namespaceId, "services", { filter: { companyId } }).items;
  const workOrders = store.listRecords(namespaceId, "work_orders", { filter: { companyId } }).items;
  const assets = store.listRecords(namespaceId, "assets", { filter: { companyId } }).items;
  const products = store.listRecords(namespaceId, "products_catalog", { filter: { companyId } }).items;
  const outgoingRelations = store.listRecords(namespaceId, "entity_relations", { filter: { fromEntityKind: "companies", fromEntityId: companyId } }).items;
  const incomingRelations = store.listRecords(namespaceId, "entity_relations", { filter: { toEntityKind: "companies", toEntityId: companyId } }).items;
  const relations = uniqueRecordsById([...outgoingRelations, ...incomingRelations]);
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "companies", recordId: companyId } }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "companies", targetId: companyId } }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "companies", targetId: companyId } }).items;
  const items = [
    timelineItem(company, "company", company.id, company.name ?? company.legalName ?? company.id, company.createdAt, company),
    ...accounts.map((record) => timelineItem(record, "account", record.id, record.name ?? record.id, record.createdAt, record)),
    ...deals.map((record) => timelineItem(record, "deal", record.id, record.title ?? record.name ?? record.id, record.createdAt, record)),
    ...contacts.map((record) => timelineItem(record, "contact", record.id, personLabel(record), record.createdAt, record)),
    ...activities.map((record) => timelineItem(record, "activity", record.id, record.subject ?? record.kind ?? record.id, record.createdAt, record)),
    ...billingCustomers.map((record) => timelineItem(record, "billing_customer", record.id, record.name ?? record.id, record.createdAt, record)),
    ...invoices.map((record) => timelineItem(record, "invoice", record.id, record.number ?? record.id, record.issuedAt ?? record.createdAt, record)),
    ...payments.map((record) => timelineItem(record, "payment", record.id, record.status ?? record.id, record.createdAt, record)),
    ...services.map((record) => timelineItem(record, "service", record.id, record.name ?? record.id, record.createdAt, record)),
    ...workOrders.map((record) => timelineItem(record, "work_order", record.id, record.title ?? record.id, record.startedAt ?? record.plannedStartAt ?? record.createdAt, record)),
    ...assets.map((record) => timelineItem(record, "asset", record.id, record.serialNumber ?? record.id, record.purchaseDate ?? record.createdAt, record)),
    ...products.map((record) => timelineItem(record, "product", record.id, record.name ?? record.id, record.createdAt, record)),
    ...relations.map((record) => timelineItem(record, "relation", record.id, relationLabel(record), record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "companies", id: company.id, label: company.name ?? company.legalName ?? company.id },
    summary: {
      accounts: accounts.length,
      deals: deals.length,
      contacts: contacts.length,
      activities: activities.length,
      billingCustomers: billingCustomers.length,
      invoices: invoices.length,
      payments: payments.length,
      services: services.length,
      workOrders: workOrders.length,
      assets: assets.length,
      products: products.length,
      relations: relations.length,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    itemCount: items.length,
    items,
    records: {
      company,
      accounts,
      deals,
      contacts,
      activities,
      billingCustomers,
      invoices,
      payments,
      services,
      workOrders,
      assets,
      products,
      relations,
      evidence,
      provenance,
    },
    gaps: qualityGaps.map((record) => ({
      id: record.id,
      label: record.label,
      status: record.status,
      gapKind: record.gapKind,
      severity: record.severity,
      evidenceSourceId: record.evidenceSourceId,
    })),
    sourceCollections: ["companies", "accounts", "deals", "contacts", "activities", "billing_customers", "invoices", "payment_intents", "services", "work_orders", "assets", "products_catalog", "entity_relations", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

function materializedCrmAccountOverview(
  input: DenseDataCliInput,
  intent: ReturnType<typeof resolveClawDenseDataIntent>,
  semanticView: NonNullable<ReturnType<typeof semanticViewForIntent>>,
) {
  const accountId = input.positionals[2];
  if (input.positionals[0] !== "crm" || input.positionals[1] !== "account" || input.positionals[3] !== "overview" || !accountId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openDenseDataStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const account = store.getRecord(namespaceId, "accounts", accountId);
  if (!account) return undefined;

  const companyId = typeof account.companyId === "string" ? account.companyId : undefined;
  const company = companyId ? store.getRecord(namespaceId, "companies", companyId) : undefined;
  const deals = store.listRecords(namespaceId, "deals", { filter: { accountId } }).items;
  const contacts = store.listRecords(namespaceId, "contacts", { filter: { accountId } }).items;
  const activities = store.listRecords(namespaceId, "activities", { filter: { accountId } }).items;
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "accounts", recordId: accountId } }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "accounts", targetId: accountId } }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "accounts", targetId: accountId } }).items;
  const openDealValueCents = sumNumericField(deals.filter((record) => record.status !== "lost"), "valueCents");

  return {
    id: semanticView.id,
    subject: { collectionName: "accounts", id: account.id, label: account.name ?? account.id },
    company: company ? { id: company.id, label: company.name ?? company.legalName ?? company.id } : null,
    summary: {
      deals: deals.length,
      openDealValueCents,
      contacts: contacts.length,
      activities: activities.length,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    records: {
      account,
      company,
      deals,
      contacts,
      activities,
      evidence,
      provenance,
    },
    gaps: qualityGaps.map((record) => ({
      id: record.id,
      label: record.label,
      status: record.status,
      gapKind: record.gapKind,
      severity: record.severity,
      evidenceSourceId: record.evidenceSourceId,
    })),
    sourceCollections: ["accounts", "companies", "deals", "contacts", "activities", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

function materializedFinanceEntityOverview(
  input: DenseDataCliInput,
  intent: ReturnType<typeof resolveClawDenseDataIntent>,
  semanticView: NonNullable<ReturnType<typeof semanticViewForIntent>>,
) {
  const entityId = input.positionals[2];
  const command = input.positionals[0];
  if ((command !== "finance" && command !== "accounting") || input.positionals[1] !== "entity" || input.positionals[3] !== "overview" || !entityId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openDenseDataStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const financialAccount = store.getRecord(namespaceId, "financial_accounts", entityId);
  if (!financialAccount) return undefined;

  const transactions = store.listRecords(namespaceId, "transactions", { filter: { accountId: entityId } }).items;
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "financial_accounts", recordId: entityId } }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "financial_accounts", targetId: entityId } }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "financial_accounts", targetId: entityId } }).items;
  const debitCents = sumNumericField(transactions.filter((record) => record.kind !== "credit" && typeof record.amountCents === "number" && record.amountCents > 0), "amountCents");
  const creditCents = sumNumericField(transactions.filter((record) => record.kind === "credit" || (typeof record.amountCents === "number" && record.amountCents < 0)), "amountCents");
  const netAmountCents = sumNumericField(transactions, "amountCents");

  return {
    id: semanticView.id,
    subject: { collectionName: "financial_accounts", id: financialAccount.id, label: financialAccount.name ?? financialAccount.id },
    summary: {
      transactions: transactions.length,
      debitCents,
      creditCents,
      netAmountCents,
      currency: financialAccount.currency ?? firstStringField(transactions, "currency") ?? null,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    records: {
      financialAccount,
      transactions,
      evidence,
      provenance,
    },
    gaps: qualityGaps.map((record) => ({
      id: record.id,
      label: record.label,
      status: record.status,
      gapKind: record.gapKind,
      severity: record.severity,
      evidenceSourceId: record.evidenceSourceId,
    })),
    sourceCollections: ["financial_accounts", "transactions", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

function uniqueRecordsById(records: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const seen = new Set<unknown>();
  const out: Array<Record<string, unknown>> = [];
  for (const record of records) {
    if (!record.id || seen.has(record.id)) continue;
    seen.add(record.id);
    out.push(record);
  }
  return out;
}

function sumNumericField(records: Array<Record<string, unknown>>, fieldName: string): number {
  return records.reduce((total, record) => total + (typeof record[fieldName] === "number" ? record[fieldName] : 0), 0);
}

function firstStringField(records: Array<Record<string, unknown>>, fieldName: string): string | undefined {
  for (const record of records) {
    if (typeof record[fieldName] === "string") return record[fieldName];
  }
  return undefined;
}

function relationLabel(record: Record<string, unknown>): string {
  return `${String(record.type ?? "relates")} ${String(record.fromEntityKind ?? "entity")}/${String(record.fromEntityId ?? "?")} -> ${String(record.toEntityKind ?? "entity")}/${String(record.toEntityId ?? "?")}`;
}

function personLabel(record: Record<string, unknown>): string {
  return [record.firstName, record.lastName].filter((value): value is string => typeof value === "string" && value.length > 0).join(" ") || String(record.email ?? record.id);
}

function openDenseDataStore(workspaceRoot: string) {
  const root = fs.realpathSync.native(workspaceRoot);
  const dataDir = path.join(root, ".claw", "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const previousDataDir = process.env.CLAW_DATA_DIR;
  process.env.CLAW_DATA_DIR = dataDir;
  try {
    return openMainDataStore({ CLAW_DATA_DIR: dataDir } as NodeJS.ProcessEnv);
  } finally {
    if (previousDataDir === undefined) delete process.env.CLAW_DATA_DIR;
    else process.env.CLAW_DATA_DIR = previousDataDir;
  }
}

function timelineItem(
  record: Record<string, unknown>,
  kind: string,
  recordId: unknown,
  label: unknown,
  occurredAt: unknown,
  data: Record<string, unknown>,
) {
  return {
    kind,
    recordId,
    label,
    occurredAt: typeof occurredAt === "string" ? occurredAt : null,
    data,
  };
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
  return Object.values(clawDenseDataOsRegistry.foundationCollections).includes(resolved) ? resolved : undefined;
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

function nestedDenseDbRoute(input: DenseDataCliInput): Parameters<typeof runMagicDbCli>[0] | null {
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

function nestedParentDbRoute(input: DenseDataCliInput, config: {
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

function isDenseDataCommandGroup(group: string): boolean {
  if (collectionForFoundationRoute(group)) return true;
  return clawDenseDataOsRegistry.systems.some((system) =>
    system.canonicalCommand === group
    || system.aliases.includes(group)
    || system.centers.some((center) => center.commandNoun === group || center.commandAliases.includes(group))
  );
}

function denseRegistryPayload(systemId: string | undefined, group: string, action: string) {
  const system = systemId ? findClawDenseDataSystem(systemId) : undefined;
  const systems = system ? [system] : clawDenseDataOsRegistry.systems.filter((entry) => entry.canonicalCommand === group || entry.aliases.includes(group));
  return {
    action,
    systems,
    statuses: clawDenseDataOsRegistry.intentStatuses,
    standardCollectionActions: clawDenseDataOsRegistry.standardCollectionActions,
    routeRejectionReasons: clawDenseDataOsRegistry.routeRejectionReasons,
    foundationPrimitives: clawDenseDataOsRegistry.foundationPrimitives,
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
