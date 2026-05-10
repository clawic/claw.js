import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ANTIQUES_INVENTORY: BuiltinCollectionDefinition = {
  name: "antiques_inventory",
  displayName: "Antiques Inventory",
  family: "luxury_and_collecting",
  aliases: ["antique","antiques_inventory"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "period", type: "text" },
    { name: "provenance", type: "text" },
    { name: "acquiredAt", type: "date" },
    { name: "acquiredPrice", type: "money" },
    { name: "appraisedValue", type: "money" },
    { name: "condition", type: "select", options: ["excellent","good","fair","poor","needs_restoration"] },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "antiques_inventory_period_idx", fields: ["period"] },
  ],
};
