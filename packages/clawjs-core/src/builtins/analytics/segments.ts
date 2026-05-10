import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SEGMENTS: BuiltinCollectionDefinition = {
  name: "segments",
  displayName: "Segments",
  family: "analytics",
  aliases: ["segment","segments"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "name", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "rules", type: "json" },
    { name: "usersCount", type: "number" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "segments_company_idx", fields: ["companyId"] },
  ],
};
