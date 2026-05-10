import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PRODUCT_OFFERS: BuiltinCollectionDefinition = {
  name: "product_offers",
  displayName: "Product Offers",
  family: "marketplace_products",
  aliases: ["product_offer","product_offers"],
  fields: [
    { name: "productListingId", type: "relation", required: true, relation: { collectionName: "product_listings" } },
    { name: "offeredAt", type: "date", required: true },
    { name: "amountCents", type: "number" },
    { name: "buyerName", type: "text" },
    { name: "status", type: "select", options: ["pending","accepted","rejected","withdrawn","countered"] },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "product_offers_status_idx", fields: ["status"] },
  ],
};
