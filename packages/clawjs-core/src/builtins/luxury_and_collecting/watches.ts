import type { BuiltinCollectionDefinition } from "../_types.ts";

export const WATCHES: BuiltinCollectionDefinition = {
  name: "watches",
  displayName: "Watches",
  family: "luxury_and_collecting",
  aliases: ["watch","watches"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "brand", type: "text" },
    { name: "model", type: "text" },
    { name: "caliber", type: "text" },
    { name: "serialNumber", type: "text" },
    { name: "year", type: "number" },
    { name: "estimatedValue", type: "money" },
    { name: "complications", type: "text" },
    { name: "condition", type: "select", options: ["new","mint","excellent","good","fair","poor"] },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "watches_brand_idx", fields: ["brand"] },
  ],
};
