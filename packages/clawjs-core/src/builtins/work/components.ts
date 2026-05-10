import type { BuiltinCollectionDefinition } from "../_types.ts";

export const COMPONENTS: BuiltinCollectionDefinition = {
  name: "components",
  displayName: "Components",
  family: "work",
  aliases: ["component","components"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "portfolioItemId", type: "relation", relation: { collectionName: "portfolio_items" } },
    { name: "key", type: "text", required: true },
    { name: "name", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "leadActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "components_company_idx", fields: ["companyId"] },
    { name: "components_company_key_unique", fields: ["companyId","key"], unique: true },
  ],
};
