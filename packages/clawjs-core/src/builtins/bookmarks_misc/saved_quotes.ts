import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SAVED_QUOTES: BuiltinCollectionDefinition = {
  name: "saved_quotes",
  displayName: "Saved Quotes",
  family: "bookmarks_misc",
  aliases: ["saved_quote","saved_quotes"],
  fields: [
    { name: "body", type: "text", required: true },
    { name: "author", type: "text" },
    { name: "source", type: "text" },
    { name: "tags", type: "json" },
    { name: "favorited", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "saved_quotes_author_idx", fields: ["author"] },
  ],
};
