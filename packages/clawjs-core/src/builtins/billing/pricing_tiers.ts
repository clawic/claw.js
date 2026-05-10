import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PRICING_TIERS: BuiltinCollectionDefinition = {
  name: "pricing_tiers",
  displayName: "Pricing Tiers",
  family: "billing",
  aliases: ["pricing_tier","pricing_tiers","plan","plans"],
  fields: [
    { name: "productCatalogId", type: "relation", required: true, relation: { collectionName: "products_catalog" } },
    { name: "name", type: "text", required: true },
    { name: "priceId", type: "relation", relation: { collectionName: "prices" } },
    { name: "features", type: "json" },
    { name: "seatLimit", type: "number" },
    { name: "sortOrder", type: "number" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "tiers_product_idx", fields: ["productCatalogId"] },
  ],
};
