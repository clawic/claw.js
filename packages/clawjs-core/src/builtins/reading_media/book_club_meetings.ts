import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BOOK_CLUB_MEETINGS: BuiltinCollectionDefinition = {
  name: "book_club_meetings",
  displayName: "Book Club Meetings",
  family: "reading_media",
  aliases: ["book_club_meeting","book_club_meetings"],
  fields: [
    { name: "clubId", type: "relation", required: true, relation: { collectionName: "book_clubs" } },
    { name: "scheduledAt", type: "date", required: true },
    { name: "bookId", type: "relation", relation: { collectionName: "books" } },
    { name: "attended", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "book_club_meetings_club_idx", fields: ["clubId"] },
  ],
};
