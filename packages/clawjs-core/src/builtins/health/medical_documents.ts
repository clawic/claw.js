import type { BuiltinCollectionDefinition } from "../_types.ts";

export const MEDICAL_DOCUMENTS: BuiltinCollectionDefinition = {
  name: "medical_documents",
  displayName: "Medical Documents",
  family: "health",
  aliases: ["medical_document","medical_documents"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "kind", type: "select", options: ["report","image","prescription","consent","insurance_claim","other"] },
    { name: "documentDate", type: "date" },
    { name: "doctorId", type: "relation", relation: { collectionName: "doctors" } },
    { name: "file", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "medical_documents_kind_idx", fields: ["kind"] },
  ],
};
