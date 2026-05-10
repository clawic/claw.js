import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PANTRY_ITEMS: BuiltinCollectionDefinition = {
  name: "pantry_items",
  displayName: "Pantry Items",
  family: "cooking",
  aliases: ["pantry_item","pantry_items"],
  fields: [
    { name: "itemName", type: "text", required: true },
    { name: "quantity", type: "number" },
    { name: "unit", type: "text" },
    { name: "expiresAt", type: "date" },
    { name: "location", type: "text" },
    { name: "opened", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "pantry_items_expires_idx", fields: ["expiresAt"] },
  ],
};
