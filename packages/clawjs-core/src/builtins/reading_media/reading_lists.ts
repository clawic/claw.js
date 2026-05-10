import type { BuiltinCollectionDefinition } from "../_types.ts";

export const READING_LISTS: BuiltinCollectionDefinition = {
  name: "reading_lists",
  displayName: "Reading Lists",
  family: "reading_media",
  aliases: ["reading_list","reading_lists"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "bookIds", type: "json" },
    { name: "favorited", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "reading_lists_name_idx", fields: ["name"] },
  ],
};
