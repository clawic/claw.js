import type { BuiltinCollectionDefinition } from "../_types.ts";

export const REFLECTIONS: BuiltinCollectionDefinition = {
  name: "reflections",
  displayName: "Reflections",
  family: "habits_journaling",
  aliases: ["reflection","reflections"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "reflectionDate", type: "date" },
    { name: "kind", type: "select", options: ["weekly_review","monthly_review","quarterly","yearly","ad_hoc"] },
    { name: "body", type: "text" },
    { name: "tags", type: "json" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "reflections_date_idx", fields: ["reflectionDate"] },
    { name: "reflections_kind_idx", fields: ["kind"] },
  ],
};
