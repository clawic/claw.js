import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BOOKS: BuiltinCollectionDefinition = {
  name: "books",
  displayName: "Books",
  family: "reading_media",
  aliases: ["book","books"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "author", type: "text" },
    { name: "isbn", type: "text" },
    { name: "year", type: "number" },
    { name: "pageCount", type: "number" },
    { name: "status", type: "select", options: ["want_to_read","reading","read","abandoned","reference"] },
    { name: "rating", type: "number" },
    { name: "tags", type: "json" },
    { name: "image", type: "file" },
    { name: "favorited", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "books_status_idx", fields: ["status"] },
    { name: "books_title_idx", fields: ["title"] },
  ],
};
