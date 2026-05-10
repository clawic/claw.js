import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CUSTOMER_TIERS: BuiltinCollectionDefinition = {
  name: "customer_tiers",
  displayName: "Customer Tiers",
  family: "customer_intake",
  aliases: ["tier","tiers","customer_tier","customer_tiers"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "name", type: "text", required: true },
    { name: "color", type: "text" },
    { name: "level", type: "number", required: true },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "customer_tiers_company_idx", fields: ["companyId"] },
  ],
};
