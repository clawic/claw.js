import type { BuiltinCollectionDefinition } from "../_types.ts";

export const HOME_INVENTORY_ITEMS: BuiltinCollectionDefinition = {
  name: "home_inventory_items",
  displayName: "Home Inventory Items",
  family: "possessions",
  aliases: ["home_inventory_item","home_inventory_items","inventory"],
  fields: [
    { name: "name", type: "text", required: true, aliases: ["itemName"] },
    { name: "room", type: "text" },
    { name: "category", type: "text" },
    { name: "quantity", type: "number" },
    { name: "purchasePriceCents", type: "number", aliases: ["itemPurchasePriceCents"] },
    { name: "purchasedAt", type: "date" },
    { name: "serialNumber", type: "text" },
    { name: "image", type: "file" },
    { name: "favorited", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "home_inventory_items_room_idx", fields: ["room"] },
    { name: "home_inventory_items_category_idx", fields: ["category"] },
  ],
};
