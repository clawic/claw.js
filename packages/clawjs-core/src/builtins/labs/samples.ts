import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SAMPLES: BuiltinCollectionDefinition = {
  name: "samples",
  displayName: "Samples",
  family: "labs",
  aliases: ["sample", "samples", "specimen", "specimens"],
  catalog: {
    purpose: "Specimen/material center for collection, custody, storage, assay, result, evidence, and provenance.",
    evidence: ["human_recognizable", "market_validated", "agent_useful"],
    relationGuidance: "Use studyId, patientId, participantId, or organismId when known; preserve partial source data and gaps otherwise.",
    notes: "Samples support clinical and research lab workflows without forcing a single vocabulary.",
  },
  fields: [
    { name: "label", type: "text", required: true, requiredReason: "identity", aliases: ["name", "sampleLabel"] },
    { name: "studyId", type: "relation", relation: { collectionName: "studies" } },
    { name: "patientId", type: "relation", relation: { collectionName: "patients" } },
    { name: "participantId", type: "relation", relation: { collectionName: "participants" } },
    { name: "sampleType", type: "text" },
    { name: "status", type: "select", options: ["collected", "received", "processing", "stored", "consumed", "discarded", "unknown"] },
    { name: "collectedAt", type: "date" },
    { name: "receivedAt", type: "date" },
    { name: "storageLocation", type: "text" },
    { name: "chainOfCustody", type: "json" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "samples_label_idx", fields: ["label"] },
    { name: "samples_study_idx", fields: ["studyId"] },
    { name: "samples_patient_idx", fields: ["patientId"] },
    { name: "samples_participant_idx", fields: ["participantId"] },
    { name: "samples_status_idx", fields: ["status"] },
  ],
};
