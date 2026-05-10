import type { BuiltinCollectionDefinition } from "../_types.ts";

export const LEGAL_DOCUMENTS: BuiltinCollectionDefinition = {
  name: "legal_documents",
  displayName: "Legal Documents",
  family: "personal_documents",
  aliases: ["legal_document","legal_documents"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "kind", type: "select", options: ["will","power_of_attorney","trust","agreement","ruling","other"] },
    { name: "documentDate", type: "date" },
    { name: "counterparty", type: "text" },
    { name: "file", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "legal_documents_kind_idx", fields: ["kind"] },
  ],
};
