import type { BuiltinCollectionDefinition } from "../_types.ts";

export const DIAGNOSES: BuiltinCollectionDefinition = {
  name: "diagnoses",
  displayName: "Diagnoses",
  family: "health",
  aliases: ["diagnosis","diagnoses"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "diagnosedAt", type: "date" },
    { name: "doctorId", type: "relation", relation: { collectionName: "doctors" } },
    { name: "status", type: "select", options: ["active","resolved","chronic","monitoring"] },
    { name: "description", type: "text" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "diagnoses_status_idx", fields: ["status"] },
  ],
};
