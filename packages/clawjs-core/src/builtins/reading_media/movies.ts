import type { BuiltinCollectionDefinition } from "../_types.ts";

export const MOVIES: BuiltinCollectionDefinition = {
  name: "movies",
  displayName: "Movies (catalog)",
  family: "reading_media",
  aliases: ["movie","movies"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "year", type: "number" },
    { name: "director", type: "text" },
    { name: "tags", type: "json" },
    { name: "runtimeMinutes", type: "number" },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "movies_title_idx", fields: ["title"] },
  ],
};
