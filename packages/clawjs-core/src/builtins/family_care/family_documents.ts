import type { BuiltinCollectionDefinition } from "../_types.ts";

export const FAMILY_DOCUMENTS: BuiltinCollectionDefinition = {
  name: "family_documents",
  displayName: "Family Documents",
  family: "family_care",
  aliases: ["family_document","family_documents"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "kind", type: "select", options: ["birth_certificate","passport","school_record","medical","id_card","other"] },
    { name: "memberId", type: "relation", relation: { collectionName: "family_members" } },
    { name: "childId", type: "relation", relation: { collectionName: "children_profiles" } },
    { name: "file", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "family_documents_kind_idx", fields: ["kind"] },
  ],
};
