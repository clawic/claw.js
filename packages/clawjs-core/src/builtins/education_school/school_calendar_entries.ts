import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SCHOOL_CALENDAR_ENTRIES: BuiltinCollectionDefinition = {
  name: "school_calendar_entries",
  displayName: "School Calendar Entries",
  family: "education_school",
  aliases: ["school_calendar_entry","school_calendar_entries"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "dateStart", type: "date", required: true },
    { name: "dateEnd", type: "date" },
    { name: "kind", type: "select", options: ["term_start","term_end","holiday","exam_week","event","other"] },
    { name: "description", type: "text" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "school_calendar_date_idx", fields: ["dateStart"] },
  ],
};
