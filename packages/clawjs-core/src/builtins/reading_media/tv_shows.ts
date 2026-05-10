import type { BuiltinCollectionDefinition } from "../_types.ts";

export const TV_SHOWS: BuiltinCollectionDefinition = {
  name: "tv_shows",
  displayName: "TV Shows (catalog)",
  family: "reading_media",
  aliases: ["tv_show","tv_shows"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "yearStart", type: "number" },
    { name: "yearEnd", type: "number" },
    { name: "creator", type: "text" },
    { name: "tags", type: "json" },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "tv_shows_title_idx", fields: ["title"] },
  ],
};
