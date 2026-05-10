import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CIGARS: BuiltinCollectionDefinition = {
  name: "cigars",
  displayName: "Cigars",
  family: "luxury_and_collecting",
  aliases: ["cigar","cigars"],
  fields: [
    { name: "brand", type: "text", required: true },
    { name: "vitola", type: "text" },
    { name: "country", type: "text" },
    { name: "smokedAt", type: "date" },
    { name: "rating", type: "rating", enumScale: 5 },
    { name: "drawQuality", type: "rating", enumScale: 5 },
    { name: "burnQuality", type: "rating", enumScale: 5 },
    { name: "cost", type: "money" },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "cigars_smoked_idx", fields: ["smokedAt"] },
  ],
};
