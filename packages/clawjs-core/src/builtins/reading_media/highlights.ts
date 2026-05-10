import type { BuiltinCollectionDefinition } from "../_types.ts";

export const HIGHLIGHTS: BuiltinCollectionDefinition = {
  name: "highlights",
  displayName: "Highlights",
  family: "reading_media",
  aliases: ["highlight","highlights"],
  fields: [
    { name: "bookId", type: "relation", relation: { collectionName: "books" } },
    { name: "articleId", type: "relation", relation: { collectionName: "articles" } },
    { name: "body", type: "text", required: true },
    { name: "locationStart", type: "number" },
    { name: "locationEnd", type: "number" },
    { name: "tags", type: "json" },
    { name: "favorited", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "highlights_book_idx", fields: ["bookId"] },
  ],
};
