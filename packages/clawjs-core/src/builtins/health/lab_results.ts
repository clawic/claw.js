import type { BuiltinCollectionDefinition } from "../_types.ts";

export const LAB_RESULTS: BuiltinCollectionDefinition = {
  name: "lab_results",
  displayName: "Lab Results",
  family: "health",
  aliases: ["lab_result","lab_results"],
  fields: [
    { name: "patientId", type: "relation", relation: { collectionName: "patients" } },
    { name: "title", type: "text", required: true },
    { name: "collectedAt", type: "date" },
    { name: "reportedAt", type: "date" },
    { name: "lab", type: "text" },
    { name: "doctorId", type: "relation", relation: { collectionName: "doctors" } },
    { name: "values", type: "json" },
    { name: "document", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "lab_results_patient_idx", fields: ["patientId"] },
    { name: "lab_results_collected_idx", fields: ["collectedAt"] },
  ],
};
