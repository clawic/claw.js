import type { BuiltinCollectionDefinition } from "../_types.ts";

export const HOLDOUTS: BuiltinCollectionDefinition = {
  name: "holdouts",
  displayName: "Holdouts",
  family: "analytics",
  aliases: ["holdout","holdouts"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "name", type: "text", required: true },
    { name: "flagIds", type: "json" },
    { name: "percentage", type: "number" },
    { name: "startedAt", type: "date" },
    { name: "endedAt", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "holdouts_company_idx", fields: ["companyId"] },
  ],
};
