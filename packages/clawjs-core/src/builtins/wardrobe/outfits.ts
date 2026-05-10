import type { BuiltinCollectionDefinition } from "../_types.ts";

export const OUTFITS: BuiltinCollectionDefinition = {
  name: "outfits",
  displayName: "Outfits",
  family: "wardrobe",
  aliases: ["outfit","outfits"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "clothingIds", type: "json" },
    { name: "season", type: "select", options: ["spring","summer","fall","winter","all"] },
    { name: "occasion", type: "select", options: ["casual","work","formal","sport","party","travel","other"] },
    { name: "image", type: "file" },
    { name: "favorited", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "outfits_season_idx", fields: ["season"] },
  ],
};
