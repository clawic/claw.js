import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BOOK_CLUBS: BuiltinCollectionDefinition = {
  name: "book_clubs",
  displayName: "Book Clubs",
  family: "reading_media",
  aliases: ["book_club","book_clubs"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "kind", type: "select", options: ["in_person","online","hybrid"] },
    { name: "joinedAt", type: "date" },
    { name: "active", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "book_clubs_active_idx", fields: ["active"] },
  ],
};
