import type { BuiltinCollectionDefinition } from "../_types.ts";

export const FUNNELS: BuiltinCollectionDefinition = {
  name: "funnels",
  displayName: "Funnels",
  family: "analytics",
  aliases: ["funnel","funnels"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "name", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "steps", type: "json" },
    { name: "conversionWindowSeconds", type: "number" },
    { name: "lastComputedAt", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "funnels_company_idx", fields: ["companyId"] },
  ],
};
