import type { BuiltinCollectionDefinition } from "../_types.ts";

export const DREAM_JOURNALS: BuiltinCollectionDefinition = {
  name: "dream_journals",
  displayName: "Dream Journals",
  family: "habits_journaling",
  aliases: ["dream_journal","dream_journals","dream"],
  fields: [
    { name: "dreamDate", type: "date", required: true },
    { name: "title", type: "text", required: true },
    { name: "body", type: "text" },
    { name: "tags", type: "json" },
    { name: "lucid", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "dream_journals_date_idx", fields: ["dreamDate"] },
  ],
};
