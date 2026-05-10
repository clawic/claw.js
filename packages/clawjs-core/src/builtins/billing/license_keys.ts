import type { BuiltinCollectionDefinition } from "../_types.ts";

export const LICENSE_KEYS: BuiltinCollectionDefinition = {
  name: "license_keys",
  displayName: "License Keys",
  family: "billing",
  aliases: ["license","licenses","license_key","license_keys"],
  fields: [
    { name: "productCatalogId", type: "relation", required: true, relation: { collectionName: "products_catalog" } },
    { name: "key", type: "text", required: true },
    { name: "customerId", type: "relation", relation: { collectionName: "customers" } },
    { name: "billingCustomerId", type: "relation", relation: { collectionName: "billing_customers" } },
    { name: "activationLimit", type: "number" },
    { name: "activationCount", type: "number" },
    { name: "activatedInstances", type: "json" },
    { name: "expiresAt", type: "date" },
    { name: "status", type: "select", options: ["active","expired","revoked","suspended"] },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "license_keys_key_unique", fields: ["key"], unique: true },
    { name: "license_keys_product_idx", fields: ["productCatalogId"] },
  ],
};
