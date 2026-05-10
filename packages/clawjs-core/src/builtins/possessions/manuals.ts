import type { BuiltinCollectionDefinition } from "../_types.ts";

export const MANUALS: BuiltinCollectionDefinition = {
  name: "manuals",
  displayName: "Manuals & Guides",
  family: "possessions",
  aliases: ["manual","manuals"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "itemName", type: "text" },
    { name: "applianceId", type: "relation", relation: { collectionName: "appliances" } },
    { name: "sourceUrl", type: "url" },
    { name: "file", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "manuals_title_idx", fields: ["title"] },
  ],
};
