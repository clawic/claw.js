import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ENCOUNTERS: BuiltinCollectionDefinition = {
  name: "encounters",
  displayName: "Encounters",
  family: "health",
  aliases: ["encounter", "encounters", "clinical_encounter", "clinical_encounters", "visit", "visits"],
  catalog: {
    purpose: "Clinical encounter/visit center for patient contacts, care context, participants, documents, observations, follow-up, provenance, and quality gaps.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Use patientId for the clinical subject; link clinicians, organizations, evidence, procedures, symptoms, labs, and follow-up through stable fields or entity_relations as the workflow matures.",
    notes: "An encounter is a clinical workflow event, not a diagnosis or final medical decision.",
  },
  fields: [
    { name: "patientId", type: "relation", required: true, requiredReason: "relation_integrity", relation: { collectionName: "patients" }, aliases: ["patient", "patientRef"] },
    { name: "title", type: "text", required: true, requiredReason: "identity", aliases: ["reason", "visitReason"] },
    { name: "encounterType", type: "select", options: ["visit", "telehealth", "admission", "procedure", "consult", "follow_up", "other"] },
    { name: "status", type: "select", options: ["planned", "arrived", "in_progress", "completed", "cancelled", "unknown"] },
    { name: "startedAt", type: "date", aliases: ["startAt"] },
    { name: "endedAt", type: "date", aliases: ["endAt"] },
    { name: "clinicianId", type: "relation", relation: { collectionName: "doctors" } },
    { name: "clinicId", type: "relation", relation: { collectionName: "clinics" } },
    { name: "evidenceSourceIds", type: "json" },
    { name: "qualityGapIds", type: "json" },
    { name: "followUp", type: "json" },
    { name: "notes", type: "text" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "encounters_patient_idx", fields: ["patientId"] },
    { name: "encounters_status_idx", fields: ["status"] },
    { name: "encounters_started_idx", fields: ["startedAt"] },
    { name: "encounters_type_idx", fields: ["encounterType"] },
  ],
};
