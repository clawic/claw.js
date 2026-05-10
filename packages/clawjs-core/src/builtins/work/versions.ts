import type { BuiltinCollectionDefinition } from "../_types.ts";

export const VERSIONS: BuiltinCollectionDefinition = {
  name: "versions",
  displayName: "Versions",
  family: "work",
  aliases: ["version","versions"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "portfolioItemId", type: "relation", relation: { collectionName: "portfolio_items" } },
    { name: "name", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "released", type: "boolean" },
    { name: "releaseDate", type: "date" },
    { name: "archived", type: "boolean" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "versions_company_idx", fields: ["companyId"] },
    { name: "versions_item_idx", fields: ["portfolioItemId"] },
  ],
};
