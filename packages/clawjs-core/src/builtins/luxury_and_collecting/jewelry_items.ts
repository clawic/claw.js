import type { BuiltinCollectionDefinition } from "../_types.ts";

export const JEWELRY_ITEMS: BuiltinCollectionDefinition = {
  name: "jewelry_items",
  displayName: "Jewelry Items",
  family: "luxury_and_collecting",
  aliases: ["jewelry_item","jewelry_items","jewelry"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "kind", type: "select", options: ["ring","necklace","bracelet","earring","brooch","pendant","other"] },
    { name: "materials", type: "json" },
    { name: "gemstones", type: "json" },
    { name: "weightGrams", type: "number" },
    { name: "hallmarks", type: "text" },
    { name: "appraisedValue", type: "money" },
    { name: "acquiredAt", type: "date" },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "jewelry_items_kind_idx", fields: ["kind"] },
  ],
};
