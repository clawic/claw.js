import type { BuiltinCollectionDefinition } from "../_types.ts";

export const WISHLIST_ITEMS: BuiltinCollectionDefinition = {
  name: "wishlist_items",
  displayName: "Wishlist Items",
  family: "hobbies",
  aliases: ["wishlist_item","wishlist_items"],
  fields: [
    { name: "wishlistId", type: "relation", required: true, relation: { collectionName: "wishlists" } },
    { name: "title", type: "text", required: true },
    { name: "link", type: "url" },
    { name: "priceCents", type: "number" },
    { name: "priority", type: "select", options: ["low","medium","high"] },
    { name: "acquired", type: "boolean" },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "wishlist_items_wishlist_idx", fields: ["wishlistId"] },
  ],
};
