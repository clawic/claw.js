import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CLOTHES: BuiltinCollectionDefinition = {
  name: "clothes",
  displayName: "Clothes",
  family: "wardrobe",
  aliases: ["clothing","clothes"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "category", type: "select", options: ["top","bottom","dress","outerwear","shoes","accessory","underwear","other"] },
    { name: "color", type: "text" },
    { name: "brand", type: "text" },
    { name: "size", type: "text" },
    { name: "purchasePriceCents", type: "number" },
    { name: "purchasedAt", type: "date" },
    { name: "image", type: "file" },
    { name: "active", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "clothes_category_idx", fields: ["category"] },
  ],
};
