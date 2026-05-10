import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PACKING_ITEMS: BuiltinCollectionDefinition = {
  name: "packing_items",
  displayName: "Packing Items",
  family: "travel",
  aliases: ["packing_item","packing_items"],
  fields: [
    { name: "packingListId", type: "relation", required: true, relation: { collectionName: "trip_packing_lists" } },
    { name: "name", type: "text", required: true },
    { name: "quantity", type: "number" },
    { name: "category", type: "text" },
    { name: "packed", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "packing_items_list_idx", fields: ["packingListId"] },
  ],
};
