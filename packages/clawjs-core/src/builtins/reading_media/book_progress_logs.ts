import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BOOK_PROGRESS_LOGS: BuiltinCollectionDefinition = {
  name: "book_progress_logs",
  displayName: "Book Progress Logs",
  family: "reading_media",
  aliases: ["book_progress_log","book_progress_logs"],
  fields: [
    { name: "bookId", type: "relation", required: true, relation: { collectionName: "books" } },
    { name: "loggedAt", type: "date", required: true },
    { name: "page", type: "number" },
    { name: "percent", type: "number" },
    { name: "durationMinutes", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "book_progress_logs_book_idx", fields: ["bookId"] },
  ],
};
