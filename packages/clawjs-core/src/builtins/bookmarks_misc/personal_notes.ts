import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PERSONAL_NOTES: BuiltinCollectionDefinition = {
  name: "personal_notes",
  displayName: "Personal Notes",
  family: "bookmarks_misc",
  aliases: ["personal_note","personal_notes"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "body", type: "text" },
    { name: "tags", type: "json" },
    { name: "favorited", type: "boolean" },
    { name: "archived", type: "boolean" },
    { name: "color", type: "text" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "personal_notes_title_idx", fields: ["title"] },
  ],
};
