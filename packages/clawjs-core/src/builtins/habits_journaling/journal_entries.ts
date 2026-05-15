import type { BuiltinCollectionDefinition } from "../_types.ts";

export const JOURNAL_ENTRIES: BuiltinCollectionDefinition = {
  name: "journal_entries",
  displayName: "Journal Entries",
  family: "habits_journaling",
  aliases: ["journal_entry","journal_entries","journal"],
  fields: [
    { name: "title", type: "text", required: true, aliases: ["journalTitle"] },
    { name: "entryDate", type: "date", required: true },
    { name: "body", type: "text" },
    { name: "mood", type: "select", options: ["terrible","bad","neutral","good","great"] },
    { name: "tags", type: "json" },
    { name: "images", type: "json" },
    { name: "favorited", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "journal_entries_date_idx", fields: ["entryDate"] },
  ],
};
