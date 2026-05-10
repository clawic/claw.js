import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SNIPPETS: BuiltinCollectionDefinition = {
  name: "snippets",
  displayName: "Snippets",
  family: "bookmarks_misc",
  aliases: ["snippet","snippets"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "language", type: "text" },
    { name: "body", type: "text", required: true },
    { name: "tags", type: "json" },
    { name: "favorited", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "snippets_language_idx", fields: ["language"] },
  ],
};
