import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PRODUCT_LISTINGS: BuiltinCollectionDefinition = {
  name: "product_listings",
  displayName: "Product Listings",
  family: "marketplace_products",
  aliases: ["product_listing","product_listings"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "priceCents", type: "number" },
    { name: "currency", type: "text" },
    { name: "category", type: "text" },
    { name: "condition", type: "select", options: ["new","like_new","good","fair","for_parts"] },
    { name: "city", type: "text" },
    { name: "images", type: "json" },
    { name: "status", type: "select", options: ["draft","published","reserved","sold","withdrawn"] },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "product_listings_status_idx", fields: ["status"] },
    { name: "product_listings_category_idx", fields: ["category"] },
  ],
};
