import type { BuiltinCollectionDefinition } from "../_types.ts";

export const WINE_PAIRINGS: BuiltinCollectionDefinition = {
  name: "wine_pairings",
  displayName: "Wine Pairings",
  family: "cooking",
  aliases: ["wine_pairing","wine_pairings"],
  fields: [
    { name: "recipeId", type: "relation", relation: { collectionName: "recipes" } },
    { name: "wine", type: "text", required: true },
    { name: "varietal", type: "text" },
    { name: "region", type: "text" },
    { name: "vintage", type: "number" },
    { name: "pairingNotes", type: "markdown" },
    { name: "rating", type: "rating", enumScale: 5 },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "wine_pairings_recipe_idx", fields: ["recipeId"] },
  ],
};
