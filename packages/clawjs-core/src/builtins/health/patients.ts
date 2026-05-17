import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PATIENTS: BuiltinCollectionDefinition = {
  name: "patients",
  displayName: "Patients",
  family: "health",
  aliases: ["patient", "patients"],
  catalog: {
    purpose: "Clinical patient role/profile over shared identity, used as the center for health records, encounters, medications, labs, documents, provenance, and quality gaps.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Use personId when a shared person record exists; otherwise preserve partial identity, external references, evidence, and quality gaps without inventing identity.",
    notes: "This collection is a dense-data center. It is not a separate identity system; it projects a patient role over minimal shared identity.",
  },
  fields: [
    { name: "personId", type: "relation", relation: { collectionName: "people" } },
    { name: "displayName", type: "text", required: true, requiredReason: "identity", aliases: ["name", "patientName"] },
    { name: "dateOfBirth", type: "date", aliases: ["dob", "birthDate"] },
    { name: "sexAtBirth", type: "select", options: ["female", "male", "intersex", "unknown"] },
    { name: "gender", type: "text" },
    { name: "status", type: "select", options: ["active", "inactive", "deceased", "unknown"] },
    { name: "primaryClinicianId", type: "relation", relation: { collectionName: "doctors" } },
    { name: "externalSource", type: "text" },
    { name: "externalId", type: "text" },
    { name: "evidence", type: "json" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "patients_person_idx", fields: ["personId"] },
    { name: "patients_display_name_idx", fields: ["displayName"] },
    { name: "patients_status_idx", fields: ["status"] },
    { name: "patients_external_unique", fields: ["externalSource", "externalId"], unique: true },
  ],
};
