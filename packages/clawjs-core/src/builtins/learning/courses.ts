import type { BuiltinCollectionDefinition } from "../_types.ts";

export const COURSES: BuiltinCollectionDefinition = {
  name: "courses",
  displayName: "Courses",
  family: "learning",
  aliases: ["course","courses"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "provider", type: "text" },
    { name: "url", type: "url" },
    { name: "status", type: "select", options: ["enrolled","in_progress","completed","paused","abandoned"] },
    { name: "durationHours", type: "number" },
    { name: "startedAt", type: "date" },
    { name: "completedAt", type: "date" },
    { name: "rating", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "courses_status_idx", fields: ["status"] },
  ],
};
