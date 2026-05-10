import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PRODUCT_LISTING_MESSAGES: BuiltinCollectionDefinition = {
  name: "product_listing_messages",
  displayName: "Product Listing Messages",
  family: "marketplace_products",
  aliases: ["product_listing_message","product_listing_messages"],
  fields: [
    { name: "productListingId", type: "relation", required: true, relation: { collectionName: "product_listings" } },
    { name: "sentAt", type: "date", required: true },
    { name: "direction", type: "select", options: ["incoming","outgoing"] },
    { name: "counterpartyName", type: "text" },
    { name: "body", type: "text" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "product_listing_messages_listing_idx", fields: ["productListingId"] },
  ],
};
