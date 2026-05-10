import type { BuiltinCollectionDefinition } from "../_types.ts";

export const GENERAL_PERSONAL_DOCUMENTS: BuiltinCollectionDefinition = {
  name: "general_personal_documents",
  displayName: "General Personal Documents",
  family: "personal_documents",
  aliases: ["general_personal_document","general_personal_documents"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "file", type: "file" },
    { name: "tags", type: "json" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "general_personal_documents_title_idx", fields: ["title"] },
  ],
};
