import type { BuiltinCollectionDefinition } from "../_types.ts";

export const GRATITUDE_ENTRIES: BuiltinCollectionDefinition = {
  name: "gratitude_entries",
  displayName: "Gratitude Entries",
  family: "habits_journaling",
  aliases: ["gratitude_entry","gratitude_entries","gratitude"],
  fields: [
    { name: "entryDate", type: "date", required: true },
    { name: "item1", type: "text" },
    { name: "item2", type: "text" },
    { name: "item3", type: "text" },
    { name: "body", type: "text" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "gratitude_entries_date_idx", fields: ["entryDate"] },
  ],
};
