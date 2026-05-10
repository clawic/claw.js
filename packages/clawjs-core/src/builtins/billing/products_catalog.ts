import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PRODUCTS_CATALOG: BuiltinCollectionDefinition = {
  name: "products_catalog",
  displayName: "Products Catalog",
  family: "billing",
  aliases: ["product","products","products_catalog","catalog_product"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "name", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "type", type: "select", options: ["service","good","digital","license","physical","subscription"] },
    { name: "active", type: "boolean" },
    { name: "images", type: "json" },
    { name: "statementDescriptor", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "products_company_idx", fields: ["companyId"] },
    { name: "products_active_idx", fields: ["active"] },
  ],
};
