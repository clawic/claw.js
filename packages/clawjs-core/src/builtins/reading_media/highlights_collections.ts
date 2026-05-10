import type { BuiltinCollectionDefinition } from "../_types.ts";

export const HIGHLIGHTS_COLLECTIONS: BuiltinCollectionDefinition = {
  name: "highlights_collections",
  displayName: "Highlights Collections",
  family: "reading_media",
  aliases: ["highlights_collection","highlights_collections"],
  fields: [
    { name: "theme", type: "text", required: true },
    { name: "highlightIds", type: "json" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "highlights_collections_theme_idx", fields: ["theme"] },
  ],
};
