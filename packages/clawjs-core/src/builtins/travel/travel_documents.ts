import type { BuiltinCollectionDefinition } from "../_types.ts";

export const TRAVEL_DOCUMENTS: BuiltinCollectionDefinition = {
  name: "travel_documents",
  displayName: "Travel Documents",
  family: "travel",
  aliases: ["travel_document","travel_documents"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "kind", type: "select", options: ["passport","visa","boarding_pass","reservation","insurance","vaccination","other"] },
    { name: "documentDate", type: "date" },
    { name: "expiresAt", type: "date" },
    { name: "file", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "travel_documents_expires_idx", fields: ["expiresAt"] },
  ],
};
