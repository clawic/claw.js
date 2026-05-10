import type { BuiltinCollectionDefinition } from "../_types.ts";

export const MEDICAL_PROCEDURES: BuiltinCollectionDefinition = {
  name: "medical_procedures",
  displayName: "Medical Procedures",
  family: "health",
  aliases: ["medical_procedure","medical_procedures"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "performedAt", type: "date" },
    { name: "doctorId", type: "relation", relation: { collectionName: "doctors" } },
    { name: "clinicId", type: "relation", relation: { collectionName: "clinics" } },
    { name: "outcome", type: "text" },
    { name: "notes", type: "text" },
    { name: "document", type: "file" },
  ],
  indexes: [
    { name: "medical_procedures_performed_idx", fields: ["performedAt"] },
  ],
};
