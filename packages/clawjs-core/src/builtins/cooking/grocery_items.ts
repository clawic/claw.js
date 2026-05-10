import type { BuiltinCollectionDefinition } from "../_types.ts";

export const GROCERY_ITEMS: BuiltinCollectionDefinition = {
  name: "grocery_items",
  displayName: "Grocery Items",
  family: "cooking",
  aliases: ["grocery_item","grocery_items"],
  fields: [
    { name: "groceryListId", type: "relation", required: true, relation: { collectionName: "grocery_lists" } },
    { name: "name", type: "text", required: true },
    { name: "quantity", type: "number" },
    { name: "unit", type: "text" },
    { name: "category", type: "text" },
    { name: "purchased", type: "boolean" },
    { name: "estimatedPriceCents", type: "number" },
    { name: "notes", type: "text" },
    { name: "recipeId", type: "relation", relation: { collectionName: "recipes" } },
  ],
  indexes: [
    { name: "grocery_items_list_idx", fields: ["groceryListId"] },
    { name: "grocery_items_purchased_idx", fields: ["purchased"] },
  ],
};
