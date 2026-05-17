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
  if (semanticView.id === "erp.company.overview") return materializedErpCompanyOverview(input, intent, semanticView);
  if (semanticView.id === "crm.account.overview") return materializedCrmAccountOverview(input, intent, semanticView);
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

  const medications = store.listRecords(namespaceId, "medications", { filter: { patientId } }).items;
  const symptoms = store.listRecords(namespaceId, "symptom_logs", { filter: { patientId } }).items;
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "patients", recordId: patientId } }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "patients", targetId: patientId } }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "patients", targetId: patientId } }).items;
  const items = [
    timelineItem(patient, "patient", patient.id, patient.displayName ?? patient.id, patient.createdAt, patient),
    ...medications.map((record) => timelineItem(record, "medication", record.id, record.name ?? record.id, record.startedAt ?? record.createdAt, record)),
    ...symptoms.map((record) => timelineItem(record, "symptom", record.id, record.symptom ?? record.id, record.loggedAt ?? record.createdAt, record)),
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
    sourceCollections: ["patients", "medications", "symptom_logs", "evidence_sources", "quality_gaps", "provenance_events"],
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

  const evidenceItems = store.listRecords(namespaceId, "case_evidence", { filter: { caseId } }).items;
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "legal_cases", recordId: caseId } }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "legal_cases", targetId: caseId } }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "legal_cases", targetId: caseId } }).items;
  const items = [
    timelineItem(legalCase, "case", legalCase.id, legalCase.title ?? legalCase.id, legalCase.openedAt ?? legalCase.createdAt, legalCase),
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
    sourceCollections: ["legal_cases", "case_evidence", "evidence_sources", "quality_gaps", "provenance_events"],
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
  if (["medications", "symptom_logs"].includes(collectionName) && flags.patient && !flags["patient-id"]) {
    nextFlags = { ...nextFlags, "patient-id": flags.patient };
  }
  if (["accounts", "deals", "billing_customers", "legal_cases", "services", "work_orders"].includes(collectionName) && flags.company && !flags["company-id"]) {
    nextFlags = { ...nextFlags, "company-id": flags.company };
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
      symptom: "symptom_logs",
      symptoms: "symptom_logs",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "case",
    relationFlag: "case-id",
    relationField: "caseId",
    collections: {
      evidence: "case_evidence",
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
