import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BOOK_NOTES: BuiltinCollectionDefinition = {
  name: "book_notes",
  displayName: "Book Notes",
  family: "reading_media",
  aliases: ["book_note","book_notes"],
  fields: [
    { name: "bookId", type: "relation", required: true, relation: { collectionName: "books" } },
    { name: "title", type: "text", required: true },
    { name: "body", type: "text" },
    { name: "page", type: "number" },
    { name: "tags", type: "json" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "book_notes_book_idx", fields: ["bookId"] },
  ],
};
