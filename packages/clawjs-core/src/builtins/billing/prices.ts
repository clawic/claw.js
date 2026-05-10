import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PRICES: BuiltinCollectionDefinition = {
  name: "prices",
  displayName: "Prices",
  family: "billing",
  aliases: ["price","prices"],
  fields: [
    { name: "productCatalogId", type: "relation", required: true, relation: { collectionName: "products_catalog" } },
    { name: "unitAmountCents", type: "number" },
    { name: "currency", type: "text", required: true },
    { name: "billingScheme", type: "select", options: ["per_unit","tiered"] },
    { name: "recurringInterval", type: "select", options: ["day","week","month","year"] },
    { name: "recurringIntervalCount", type: "number" },
    { name: "usageType", type: "select", options: ["licensed","metered"] },
    { name: "tiers", type: "json" },
    { name: "taxBehavior", type: "select", options: ["inclusive","exclusive","unspecified"] },
    { name: "active", type: "boolean" },
    { name: "nickname", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "prices_product_idx", fields: ["productCatalogId"] },
    { name: "prices_active_idx", fields: ["active"] },
  ],
};
