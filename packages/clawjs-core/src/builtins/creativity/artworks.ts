import type { BuiltinCollectionDefinition } from "../_types.ts";

export const ARTWORKS: BuiltinCollectionDefinition = {
  name: "artworks",
  displayName: "Artworks",
  family: "creativity",
  aliases: ["artwork","artworks"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "medium", type: "select", options: ["drawing","painting","sculpture","digital","mixed","other"] },
    { name: "createdAt", type: "date" },
    { name: "dimensions", type: "text" },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "artworks_medium_idx", fields: ["medium"] },
  ],
};
