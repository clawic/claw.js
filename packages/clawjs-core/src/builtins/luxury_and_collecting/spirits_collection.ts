import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SPIRITS_COLLECTION: BuiltinCollectionDefinition = {
  name: "spirits_collection",
  displayName: "Spirits Collection",
  family: "luxury_and_collecting",
  aliases: ["spirit","spirits_collection"],
  fields: [
    { name: "kind", type: "select", options: ["whisky","gin","rum","tequila","vodka","brandy","liqueur","other"] },
    { name: "brand", type: "text", required: true },
    { name: "name", type: "text", required: true },
    { name: "ageYears", type: "number" },
    { name: "abv", type: "percent" },
    { name: "openedAt", type: "date" },
    { name: "finishedAt", type: "date" },
    { name: "cost", type: "money" },
    { name: "rating", type: "rating", enumScale: 5 },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "spirits_collection_kind_idx", fields: ["kind"] },
  ],
};
