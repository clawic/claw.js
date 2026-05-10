import type { BuiltinCollectionDefinition } from "../_types.ts";

export const TASTING_NOTES: BuiltinCollectionDefinition = {
  name: "tasting_notes",
  displayName: "Tasting Notes",
  family: "cooking",
  aliases: ["tasting_note","tasting_notes"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "subject", type: "text" },
    { name: "aroma", type: "json" },
    { name: "palate", type: "json" },
    { name: "finish", type: "json" },
    { name: "rating", type: "rating", enumScale: 5 },
    { name: "tastedAt", type: "date" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "tasting_notes_tasted_idx", fields: ["tastedAt"] },
  ],
};
