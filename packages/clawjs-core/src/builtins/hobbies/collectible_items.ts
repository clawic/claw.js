import type { BuiltinCollectionDefinition } from "../_types.ts";

export const COLLECTIBLE_ITEMS: BuiltinCollectionDefinition = {
  name: "collectible_items",
  displayName: "Collectible Items",
  family: "hobbies",
  aliases: ["collectible_item","collectible_items","collectible"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "category", type: "text" },
    { name: "collectionGroupId", type: "relation", relation: { collectionName: "collection_groups" } },
    { name: "acquiredAt", type: "date" },
    { name: "acquiredPriceCents", type: "number" },
    { name: "estimatedValueCents", type: "number" },
    { name: "condition", type: "text" },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "collectible_items_category_idx", fields: ["category"] },
  ],
};
