import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ASSETS: BuiltinCollectionDefinition = {
  name: "assets",
  displayName: "Customer Assets",
  family: "crm",
  aliases: ["asset","assets"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "accountId", type: "relation", relation: { collectionName: "accounts" } },
    { name: "contactId", type: "relation", relation: { collectionName: "contacts" } },
    { name: "productCatalogId", type: "relation", required: true, relation: { collectionName: "products_catalog" } },
    { name: "serialNumber", type: "text" },
    { name: "purchaseDate", type: "date" },
    { name: "expiryDate", type: "date" },
    { name: "status", type: "select", options: ["active","expired","returned","lost"] },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "assets_account_idx", fields: ["accountId"] },
    { name: "assets_serial_idx", fields: ["serialNumber"] },
  ],
};
