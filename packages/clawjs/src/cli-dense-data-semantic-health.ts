import {
  type DenseSemanticViewEntry,
  type ProfessionalRecordsCliInput,
  type ProfessionalRecordsIntent,
  firstStringField,
  openProfessionalRecordsStore,
  personLabel,
  relationLabel,
  sumNumericField,
  timelineItem,
  uniqueRecordsById,
} from "./cli-dense-data-semantic-common.ts";

const DENSE_SEMANTIC_VIEW_LIMIT = 250;

export function materializedPatientTimeline(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  const patientId = input.positionals[1];
  if (!patientId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const patient = store.getRecord(namespaceId, "patients", patientId);
  if (!patient) return undefined;

  const encounters = store.listRecords(namespaceId, "encounters", { filter: { patientId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const medications = store.listRecords(namespaceId, "medications", { filter: { patientId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const symptoms = store.listRecords(namespaceId, "symptom_logs", { filter: { patientId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const labResults = store.listRecords(namespaceId, "lab_results", { filter: { patientId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "patients", recordId: patientId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "patients", targetId: patientId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "patients", targetId: patientId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
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

export function materializedPatientMedications(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  const patientId = input.positionals[1];
  if (input.positionals[0] !== "patient" || input.positionals[2] !== "medications" || input.positionals[3] !== "list" || !patientId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const patient = store.getRecord(namespaceId, "patients", patientId);
  if (!patient) return undefined;

  const medications = store.listRecords(namespaceId, "medications", { filter: { patientId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const medicationEvidence = medications.flatMap((record) => store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "medications", recordId: record.id }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items);
  const patientEvidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "patients", recordId: patientId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const evidence = uniqueRecordsById([...patientEvidence, ...medicationEvidence]);
  const medicationGaps = medications.flatMap((record) => store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "medications", targetId: record.id }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items);
  const patientGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "patients", targetId: patientId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const qualityGaps = uniqueRecordsById([...patientGaps, ...medicationGaps]);
  const provenance = uniqueRecordsById([
    ...store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "patients", targetId: patientId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items,
    ...medications.flatMap((record) => store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "medications", targetId: record.id }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items),
  ]);
  const activeMedications = medications.filter((record) => !["stopped", "inactive", "completed"].includes(String(record.status ?? "").toLowerCase())).length;
  const historicalMedications = medications.length - activeMedications;
  const items = [
    ...medications.map((record) => timelineItem(record, "medication", record.id, record.name ?? record.id, record.startedAt ?? record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "patients", id: patient.id, label: patient.displayName ?? patient.id },
    summary: {
      medications: medications.length,
      activeMedications,
      historicalMedications,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    itemCount: items.length,
    items,
    records: {
      patient,
      medications,
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
    sourceCollections: ["patients", "medications", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

export function materializedCaseTimeline(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  const caseId = input.positionals[1];
  if (!caseId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const legalCase = store.getRecord(namespaceId, "legal_cases", caseId);
  if (!legalCase) return undefined;

  const clients = store.listRecords(namespaceId, "legal_clients", { filter: { caseId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const evidenceItems = store.listRecords(namespaceId, "case_evidence", { filter: { caseId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "legal_cases", recordId: caseId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "legal_cases", targetId: caseId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "legal_cases", targetId: caseId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
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

export function materializedCaseEvidence(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  const caseId = input.positionals[1];
  if (input.positionals[0] !== "case" || input.positionals[2] !== "evidence" || input.positionals[3] !== "list" || !caseId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const legalCase = store.getRecord(namespaceId, "legal_cases", caseId);
  if (!legalCase) return undefined;

  const evidenceItems = store.listRecords(namespaceId, "case_evidence", { filter: { caseId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const evidenceSources = uniqueRecordsById([
    ...store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "legal_cases", recordId: caseId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items,
    ...evidenceItems.flatMap((record) => store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "case_evidence", recordId: record.id }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items),
  ]);
  const qualityGaps = uniqueRecordsById([
    ...store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "legal_cases", targetId: caseId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items,
    ...evidenceItems.flatMap((record) => store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "case_evidence", targetId: record.id }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items),
  ]);
  const provenance = uniqueRecordsById([
    ...store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "legal_cases", targetId: caseId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items,
    ...evidenceItems.flatMap((record) => store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "case_evidence", targetId: record.id }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items),
  ]);
  const items = [
    ...evidenceItems.map((record) => timelineItem(record, "case_evidence", record.id, record.title ?? record.id, record.observedAt ?? record.createdAt, record)),
    ...evidenceSources.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "legal_cases", id: legalCase.id, label: legalCase.title ?? legalCase.id },
    summary: {
      evidenceItems: evidenceItems.length,
      evidenceSources: evidenceSources.length,
      qualityGaps: qualityGaps.length,
      provenanceEvents: provenance.length,
    },
    itemCount: items.length,
    items,
    records: {
      legalCase,
      evidenceItems,
      evidenceSources,
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
    sourceCollections: ["legal_cases", "case_evidence", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

export function materializedServiceTimeline(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  const serviceId = input.positionals[1];
  if (!serviceId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const service = store.getRecord(namespaceId, "services", serviceId);
  if (!service) return undefined;

  const incidents = store.listRecords(namespaceId, "incidents", { filter: { serviceId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "services", recordId: serviceId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "services", targetId: serviceId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "services", targetId: serviceId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
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

export function materializedSampleTimeline(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  const sampleId = input.positionals[1];
  if (!sampleId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const sample = store.getRecord(namespaceId, "samples", sampleId);
  if (!sample) return undefined;

  const assays = store.listRecords(namespaceId, "assays", { filter: { sampleId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "samples", recordId: sampleId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "samples", targetId: sampleId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "samples", targetId: sampleId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
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

export function materializedStudyTimeline(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  const studyId = input.positionals[1];
  if (!studyId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const study = store.getRecord(namespaceId, "studies", studyId);
  if (!study) return undefined;

  const participants = store.listRecords(namespaceId, "participants", { filter: { studyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const samples = store.listRecords(namespaceId, "samples", { filter: { studyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "studies", recordId: studyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "studies", targetId: studyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "studies", targetId: studyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
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

export function materializedStudyCohort(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  const studyId = input.positionals[1];
  const noun = input.positionals[2];
  if (input.positionals[0] !== "study" || (noun !== "cohort" && noun !== "cohorts") || input.positionals[3] !== "list" || !studyId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const study = store.getRecord(namespaceId, "studies", studyId);
  if (!study) return undefined;

  const participants = store.listRecords(namespaceId, "participants", { filter: { studyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const participantProfiles = participants.flatMap((record): Array<Record<string, unknown>> => {
    const profile = store.getRecord(namespaceId, "domain_profiles", `profile_participants_${record.id}`);
    return profile ? [profile as Record<string, unknown>] : [];
  });
  const relations = participants.flatMap((record) => store.listRecords(namespaceId, "entity_relations", { filter: { toEntityKind: "participants", toEntityId: record.id }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items);
  const evidence = uniqueRecordsById([
    ...store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "studies", recordId: studyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items,
    ...participants.flatMap((record) => store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "participants", recordId: record.id }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items),
  ]);
  const qualityGaps = uniqueRecordsById([
    ...store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "studies", targetId: studyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items,
    ...participants.flatMap((record) => store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "participants", targetId: record.id }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items),
  ]);
  const provenance = uniqueRecordsById([
    ...store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "studies", targetId: studyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items,
    ...participants.flatMap((record) => store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "participants", targetId: record.id }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items),
  ]);
  const consentUnknown = participants.filter((record) => String(record.consentStatus ?? "").toLowerCase() === "unknown").length;
  const enrolled = participants.filter((record) => String(record.status ?? "").toLowerCase() === "enrolled").length;
  const screening = participants.filter((record) => String(record.status ?? "").toLowerCase() === "screening").length;
  const items = [
    ...participants.map((record) => timelineItem(record, "participant", record.id, record.displayName ?? record.subjectCode ?? record.id, record.enrolledAt ?? record.createdAt, record)),
    ...participantProfiles.map((record) => timelineItem(record, "domain_profile", record.id, record.roleId ?? record.entityKind ?? record.id, record.createdAt, record)),
    ...relations.map((record) => timelineItem(record, "relation", record.id, relationLabel(record), record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "studies", id: study.id, label: study.title ?? study.id },
    summary: {
      participants: participants.length,
      enrolled,
      screening,
      consentUnknown,
      identityRelations: relations.length,
      participantProfiles: participantProfiles.length,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    itemCount: items.length,
    items,
    records: {
      study,
      participants,
      participantProfiles,
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
    sourceCollections: ["studies", "participants", "domain_profiles", "entity_relations", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

export function materializedExperimentTimeline(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  const experimentId = input.positionals[1];
  if (!experimentId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const experiment = store.getRecord(namespaceId, "biology_experiments", experimentId);
  if (!experiment) return undefined;

  const samples = store.listRecords(namespaceId, "samples", { filter: { biologyExperimentId: experimentId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const sampleIds = new Set(samples.map((record) => record.id));
  const assays = samples.flatMap((sample) => store.listRecords(namespaceId, "assays", { filter: { sampleId: sample.id }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items);
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "biology_experiments", recordId: experimentId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "biology_experiments", targetId: experimentId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "biology_experiments", targetId: experimentId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
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

export function materializedLabNotebookTimeline(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  const notebookId = input.positionals[1];
  if (!notebookId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const notebook = store.getRecord(namespaceId, "lab_notebooks", notebookId);
  if (!notebook) return undefined;

  const entries = store.listRecords(namespaceId, "notebook_entries", { filter: { notebookId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const protocolRuns = store.listRecords(namespaceId, "protocol_runs", { filter: { notebookId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const observations = store.listRecords(namespaceId, "experiment_observations", { filter: { notebookId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const study = typeof notebook.studyId === "string" ? store.getRecord(namespaceId, "studies", notebook.studyId) : undefined;
  const experiment = typeof notebook.biologyExperimentId === "string" ? store.getRecord(namespaceId, "biology_experiments", notebook.biologyExperimentId) : undefined;
  const samples = uniqueRecordsById([
    ...entries.flatMap((record) => typeof record.sampleId === "string" ? [store.getRecord(namespaceId, "samples", record.sampleId) as Record<string, unknown> | null] : []),
    ...protocolRuns.flatMap((record) => typeof record.sampleId === "string" ? [store.getRecord(namespaceId, "samples", record.sampleId) as Record<string, unknown> | null] : []),
    ...observations.flatMap((record) => typeof record.sampleId === "string" ? [store.getRecord(namespaceId, "samples", record.sampleId) as Record<string, unknown> | null] : []),
  ].filter((record): record is Record<string, unknown> => record !== null));
  const assays = uniqueRecordsById([
    ...entries.flatMap((record) => typeof record.assayId === "string" ? [store.getRecord(namespaceId, "assays", record.assayId) as Record<string, unknown> | null] : []),
    ...protocolRuns.flatMap((record) => typeof record.assayId === "string" ? [store.getRecord(namespaceId, "assays", record.assayId) as Record<string, unknown> | null] : []),
    ...observations.flatMap((record) => typeof record.assayId === "string" ? [store.getRecord(namespaceId, "assays", record.assayId) as Record<string, unknown> | null] : []),
  ].filter((record): record is Record<string, unknown> => record !== null));
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "lab_notebooks", recordId: notebookId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "lab_notebooks", targetId: notebookId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "lab_notebooks", targetId: notebookId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const items = [
    timelineItem(notebook, "lab_notebook", notebook.id, notebook.title ?? notebook.id, notebook.openedAt ?? notebook.createdAt, notebook),
    ...(study ? [timelineItem(study, "study", study.id, study.title ?? study.id, study.startedAt ?? study.createdAt, study)] : []),
    ...(experiment ? [timelineItem(experiment, "experiment", experiment.id, experiment.title ?? experiment.id, experiment.startedAt ?? experiment.createdAt, experiment)] : []),
    ...entries.map((record) => timelineItem(record, "notebook_entry", record.id, record.title ?? record.entryType ?? record.id, record.authoredAt ?? record.createdAt, record)),
    ...protocolRuns.map((record) => timelineItem(record, "protocol_run", record.id, record.title ?? record.protocolName ?? record.id, record.startedAt ?? record.createdAt, record)),
    ...observations.map((record) => timelineItem(record, "experiment_observation", record.id, record.title ?? record.observationType ?? record.id, record.observedAt ?? record.createdAt, record)),
    ...samples.map((record) => timelineItem(record, "sample", record.id, record.label ?? record.id, record.collectedAt ?? record.createdAt, record)),
    ...assays.map((record) => timelineItem(record, "assay", record.id, record.name ?? record.id, record.performedAt ?? record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "lab_notebooks", id: notebook.id, label: notebook.title ?? notebook.id },
    summary: {
      entries: entries.length,
      protocolRuns: protocolRuns.length,
      observations: observations.length,
      samples: samples.length,
      assays: assays.length,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    itemCount: items.length,
    items,
    records: {
      notebook,
      study,
      experiment,
      entries,
      protocolRuns,
      observations,
      samples,
      assays,
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
    sourceCollections: ["lab_notebooks", "notebook_entries", "protocol_runs", "experiment_observations", "studies", "biology_experiments", "samples", "assays", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}
